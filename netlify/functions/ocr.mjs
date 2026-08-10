/**
 * Netlify Function: Cloud OCR Proxy - v2 robust (supports both v1 and v2 runtimes)
 * 
 * Env vars needed in Netlify UI:
 *   GOOGLE_VISION_API_KEY (secret) = AIza...
 *   OCR_PROVIDER = google          (not secret)
 *   VITE_OCR_PROVIDER = cloud      (not secret, must be in Builds scope)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

// v2 handler (export default)
export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed, use POST' }, 405);
  }
  return handleRequest(req);
};

// v1 handler (for backwards compat if site is on old runtime)
export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  // Convert v1 event to v2-like request
  const req = {
    method: event.httpMethod,
    json: async () => JSON.parse(event.body || '{}')
  };
  const res = await handleRequest(req);
  const body = await res.text();
  return {
    statusCode: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body
  };
};

async function handleRequest(req) {
  console.log('OCR function invoked, env check:', {
    hasGoogleKey: !!process.env.GOOGLE_VISION_API_KEY,
    ocrProvider: process.env.OCR_PROVIDER,
    viteProvider: process.env.VITE_OCR_PROVIDER, // will be undefined server-side, that's ok
    nodeVersion: process.version
  });

  try {
    const body = await req.json();
    const { image, language = 'spa', prompt } = body;

    if (!image) {
      return jsonResponse({ error: 'No image provided', fallback: true }, 400);
    }

    const provider = (process.env.OCR_PROVIDER || 'google').toLowerCase();
    console.log(`OCR provider: ${provider}, language: ${language}`);

    if (provider === 'google') {
      if (!process.env.GOOGLE_VISION_API_KEY) {
        console.error('Missing GOOGLE_VISION_API_KEY');
        return jsonResponse({ 
          error: 'Missing GOOGLE_VISION_API_KEY env var',
          hint: 'Set GOOGLE_VISION_API_KEY in Netlify Env vars (Functions scope) and redeploy',
          fallback: true 
        }, 501);
      }
      return await handleGoogleVision(image, language);
    }

    if (provider === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        return jsonResponse({ error: 'Missing OPENAI_API_KEY', fallback: true }, 501);
      }
      return await handleOpenAIVision(image, language, prompt);
    }

    return jsonResponse({ 
      error: `Unknown OCR_PROVIDER: ${provider}`,
      fallback: true 
    }, 501);

  } catch (error) {
    console.error('OCR function error:', error);
    return jsonResponse({ 
      error: 'OCR processing failed',
      details: error.message,
      stack: error.stack?.slice(0,500),
      fallback: true 
    }, 500);
  }
}

async function handleGoogleVision(base64Image, language) {
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

  const languageHints = {
    spa: ['es', 'en'],
    jpn: ['ja', 'en'],
    zho: ['zh', 'en'],
    fra: ['fr', 'en'],
    deu: ['de', 'en'],
  };
  const hints = languageHints[language] || ['en'];

  console.log(`Calling Google Vision, hints: ${hints}, image size: ${base64Data.length}`);

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Data },
          features: [{ type: 'TEXT_DETECTION' }],
          imageContext: { languageHints: hints }
        }]
      })
    }
  );

  const responseText = await response.text();
  console.log(`Google Vision status: ${response.status}, body length: ${responseText.length}`);

  if (!response.ok) {
    console.error('Google Vision error:', responseText.slice(0,1000));
    return jsonResponse({ 
      error: `Google Vision API error: ${response.status}`,
      details: responseText.slice(0,500),
      hint: response.status === 403 ? 'Check billing enabled and Vision API enabled in GCP, and API key restrictions' : undefined,
      fallback: true
    }, 500);
  }

  const data = JSON.parse(responseText);
  const firstResponse = data.responses?.[0];

  if (firstResponse?.error) {
    console.error('Vision API returned error:', firstResponse.error);
    return jsonResponse({
      error: 'Vision API error',
      details: firstResponse.error,
      fallback: true
    }, 500);
  }

  const annotations = firstResponse?.textAnnotations;
  if (!annotations || annotations.length === 0) {
    console.log('No text found by Vision');
    return jsonResponse({ lines: [], provider: 'google-vision', message: 'No text detected' });
  }

  const fullText = annotations[0].description || '';
  const lines = fullText.split('\n').filter(l => l.trim()).map(text => ({
    text,
    confidence: 0.95,
    boundingBox: []
  }));

  console.log(`Vision success: ${lines.length} lines`);
  return jsonResponse({ 
    lines,
    fullText,
    provider: 'google-vision'
  });
}

async function handleOpenAIVision(base64Image, language, customPrompt) {
  const languageNames = { spa: 'Spanish', jpn: 'Japanese', zho: 'Chinese', fra: 'French', deu: 'German' };
  const langName = languageNames[language] || language;

  const systemPrompt = `You are an OCR assistant for Duolingo screenshots. Extract the foreign language sentence (${langName}) and its English translation. Ignore UI like streak, hearts, avatars. Return ONLY JSON: { "sourceText": "...", "translationText": "..." }`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: customPrompt || `Extract ${langName} and English translation` },
            { type: 'image_url', image_url: { url: base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`, detail: 'high' } }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err.slice(0,500)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content from OpenAI');

  try {
    const parsed = JSON.parse(content);
    const combined = `${parsed.sourceText || ''}\n${parsed.translationText || ''}`.trim();
    return jsonResponse({
      lines: combined ? [{ text: combined, confidence: 0.95, boundingBox: [] }] : [],
      sourceText: parsed.sourceText,
      translationText: parsed.translationText,
      provider: 'openai-vision',
      raw: parsed
    });
  } catch {
    return jsonResponse({
      lines: [{ text: content, confidence: 0.9, boundingBox: [] }],
      provider: 'openai-vision',
      rawText: content
    });
  }
}
