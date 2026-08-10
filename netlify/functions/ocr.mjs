/**
 * Netlify Function: Cloud OCR Proxy
 * 
 * This function provides optional high-accuracy OCR via:
 *  - Google Cloud Vision API
 *  - OpenAI Vision (gpt-4o-mini)
 * 
 * Keeps API keys secret (server-side only) and allows fallback to Tesseract.
 * 
 * Setup:
 *  1. Set env vars in Netlify dashboard:
 *     - GOOGLE_VISION_API_KEY (optional)
 *     - OPENAI_API_KEY (optional)
 *     - OCR_PROVIDER = "google" | "openai"
 *  2. Set VITE_OCR_PROVIDER=cloud in site env to enable client to use this endpoint
 * 
 * Request body: { image: "data:image/png;base64,...", language: "jpn", prompt: "..." }
 * Response: { lines: [{text, confidence}], sourceText, translationText }
 */

// For local testing without API keys, this will gracefully fail and client falls back to Tesseract

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { image, language = 'spa', prompt } = body;

    if (!image) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const provider = process.env.OCR_PROVIDER || 'openai';
    
    if (provider === 'google' && process.env.GOOGLE_VISION_API_KEY) {
      return await handleGoogleVision(image, language);
    }

    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      return await handleOpenAIVision(image, language, prompt);
    }

    // No API keys configured — return error so client falls back to Tesseract
    return new Response(JSON.stringify({ 
      error: 'No cloud OCR API keys configured',
      fallback: true 
    }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('OCR function error:', error);
    return new Response(JSON.stringify({ 
      error: 'OCR processing failed',
      details: error.message,
      fallback: true 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleGoogleVision(base64Image, language) {
  // Strip data URL prefix if present
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

  // Language hints for Vision API
  const languageHints = {
    spa: ['es', 'en'],
    jpn: ['ja', 'en'],
    zho: ['zh', 'en'],
    fra: ['fr', 'en'],
    deu: ['de', 'en'],
  };

  const hints = languageHints[language] || ['en'];

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Data },
          features: [{ type: 'TEXT_DETECTION' }],
          imageContext: {
            languageHints: hints,
          }
        }]
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google Vision API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const annotations = data.responses?.[0]?.textAnnotations;

  if (!annotations || annotations.length === 0) {
    return new Response(JSON.stringify({ lines: [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Full text is first annotation
  const fullText = annotations[0].description || '';
  const lines = fullText.split('\n').filter(l => l.trim()).map(text => ({
    text,
    confidence: 0.95,
    boundingBox: []
  }));

  return new Response(JSON.stringify({ 
    lines,
    fullText,
    // Also try to parse source/translation using same logic as client
    provider: 'google-vision'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleOpenAIVision(base64Image, language, customPrompt) {
  // OpenAI Vision is excellent at understanding Duolingo UI screenshots
  // It can directly extract source sentence + translation, ignoring UI chrome

  const languageNames = {
    spa: 'Spanish',
    jpn: 'Japanese',
    zho: 'Chinese',
    fra: 'French',
    deu: 'German',
  };

  const langName = languageNames[language] || language;

  const systemPrompt = `You are an OCR assistant for Duolingo screenshots. 
Extract the foreign language sentence (${langName}) and its English translation from the image.
Ignore UI elements like streak count, hearts, profile avatars, buttons, and other chrome.
Return ONLY JSON: { "sourceText": "...", "translationText": "..." }
- sourceText should be the ${langName} sentence exactly as in image
- translationText should be the English sentence exactly as in image
- Remove any Duolingo UI artifacts like 【】 characters
- For Japanese, keep original punctuation 。！？
If you cannot find both sentences, return what you find.
`;

  const userPrompt = customPrompt || `Extract the ${langName} sentence and English translation.`;

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
            { type: 'text', text: userPrompt },
            { 
              type: 'image_url', 
              image_url: { 
                url: base64Image.startsWith('data:') ? base64Image : `data:image/png;base64,${base64Image}`,
                detail: 'high'
              } 
            }
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
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content from OpenAI');
  }

  try {
    const parsed = JSON.parse(content);
    const combined = `${parsed.sourceText || ''}\n${parsed.translationText || ''}`.trim();
    
    return new Response(JSON.stringify({
      lines: combined ? [{ text: combined, confidence: 0.95, boundingBox: [] }] : [],
      sourceText: parsed.sourceText,
      translationText: parsed.translationText,
      provider: 'openai-vision',
      raw: parsed
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    // If JSON parsing fails, return raw text as one line
    return new Response(JSON.stringify({
      lines: [{ text: content, confidence: 0.9, boundingBox: [] }],
      provider: 'openai-vision',
      rawText: content
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
