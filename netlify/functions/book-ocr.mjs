/**
 * Netlify Function: Book Page Transcription - vision LLM -> Markdown
 *
 * Plain OCR (Tesseract / Google Vision) returns raw text: equations and
 * code come out mangled. This function sends a photographed book page to
 * a vision LLM and asks for a faithful Markdown transcription with
 * LaTeX math ($...$ / $$...$$) and fenced code blocks, which is what
 * Mochi renders (KaTeX + code fences).
 *
 * Provider order:
 *   1. Anthropic, if ANTHROPIC_API_KEY is set (model fallback list,
 *      most capable first; ANTHROPIC_BOOK_OCR_MODEL overrides)
 *   2. OpenAI, if OPENAI_API_KEY is set (OPENAI_VISION_MODEL or gpt-4o)
 *   3. Neither -> { error, fallback: true } with status 501, and the
 *      client falls back to on-device Tesseract OCR.
 *
 * Env vars (Netlify UI, Functions scope):
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY
 *   ANTHROPIC_BOOK_OCR_MODEL (optional), OPENAI_VISION_MODEL (optional)
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
    return new Response(null, { status: 204, headers: CORS_HEADERS });
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

const SYSTEM_PROMPT = `You transcribe photographs of book and e-book pages into Markdown for flashcard study. Your transcription will be rendered with Markdown + KaTeX.

Rules — follow them exactly:
- Transcribe the page FAITHFULLY and COMPLETELY. Never summarize, paraphrase, abridge, or omit anything. Every word on the page must appear.
- Preserve the structure: paragraph breaks as blank lines, section headings as Markdown headings (#, ##), lists as Markdown lists, tables as Markdown tables.
- Mathematical expressions MUST be transcribed as LaTeX: inline math in single dollar signs like $r_{ij}$, and displayed equations in $$...$$ on their own lines. Reconstruct subscripts, superscripts, fractions, sums, Greek letters, and special symbols as proper LaTeX (e.g. \mathbf{q}_i, \frac{1}{2}, \sum_k, \sqrt{d}). Do not leave math as plain Unicode text.
- Code and pseudocode MUST go in fenced code blocks (triple backticks), preserving indentation and exact symbols, keywords, and punctuation.
- Grammar rules, production listings, and similar aligned listings: keep each rule on its own line and preserve the layout as best Markdown allows (a fenced block is acceptable if alignment matters).
- Ignore running page headers, page footers, and page numbers.
- If a word is truly illegible, write your best guess followed by [?].
- Output ONLY the transcription itself: no preamble, no commentary, and do not wrap the whole output in a code fence.`;

const USER_PROMPT = 'Transcribe this book page into Markdown, following your instructions exactly. Output only the transcription.';

async function handleRequest(req) {
  try {
    const body = await req.json();
    const { image } = body;

    if (!image) {
      return jsonResponse({ error: 'No image provided', fallback: true }, 400);
    }

    console.log('Book OCR invoked, env check:', {
      hasAnthropic: !!process.env.ANTHROPIC_API_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      imageSize: image.length
    });

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        return await handleAnthropic(image);
      } catch (e) {
        console.warn(`Anthropic transcription failed: ${e.message}`);
        if (!process.env.OPENAI_API_KEY) {
          return jsonResponse({ error: `Anthropic transcription failed: ${e.message}`, fallback: true }, 500);
        }
        console.warn('Falling through to OpenAI');
      }
    }

    if (process.env.OPENAI_API_KEY) {
      try {
        return await handleOpenAI(image);
      } catch (e) {
        console.error(`OpenAI transcription failed: ${e.message}`);
        return jsonResponse({ error: `OpenAI transcription failed: ${e.message}`, fallback: true }, 500);
      }
    }

    return jsonResponse({
      error: 'No vision provider configured for book transcription',
      hint: 'Set ANTHROPIC_API_KEY (preferred) or OPENAI_API_KEY in Netlify Env vars (Functions scope) and redeploy',
      fallback: true
    }, 501);
  } catch (error) {
    console.error('Book OCR function error:', error);
    return jsonResponse({
      error: 'Book transcription failed',
      details: error.message,
      fallback: true
    }, 500);
  }
}

/** Split a data URL (or bare base64) into media type + raw base64. */
function parseImage(image) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/.exec(image);
  if (match) return { mediaType: match[1], data: match[2] };
  return { mediaType: 'image/jpeg', data: image };
}

/** Models sometimes wrap the whole transcription in a ``` fence; unwrap it. */
function cleanTranscription(text) {
  const trimmed = text.trim();
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

async function handleAnthropic(image) {
  const { mediaType, data } = parseImage(image);
  // Most capable first; a 404 means the model name isn't available on
  // this account, so fall through to the next one (same pattern as
  // furigana.mjs).
  const models = [
    process.env.ANTHROPIC_BOOK_OCR_MODEL,
    'claude-sonnet-4-5-20250929',
    'claude-opus-4-1-20250805',
    'claude-3-7-sonnet-20250224',
    'claude-3-5-sonnet-20241022'
  ].filter(Boolean);

  let lastError = 'no models attempted';
  for (const model of models) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: USER_PROMPT }
            ]
          }]
        })
      });

      const raw = await res.text();
      if (!res.ok) {
        lastError = `Anthropic ${res.status}: ${raw.slice(0, 300)}`;
        console.warn(`${model}: ${lastError}`);
        if (res.status === 404) continue;
        throw new Error(lastError);
      }

      const parsed = JSON.parse(raw);
      const text = (parsed.content || [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      if (text) {
        console.log(`Book OCR success via Anthropic ${model}, ${text.length} chars`);
        return jsonResponse({ markdown: cleanTranscription(text), provider: 'anthropic', model });
      }
      lastError = `${model} returned no text`;
    } catch (e) {
      lastError = e.message;
      if (String(e.message).includes('404')) continue;
      throw e;
    }
  }
  throw new Error(`Anthropic failed: ${lastError}`);
}

async function handleOpenAI(image) {
  const url = image.startsWith('data:') ? image : `data:image/png;base64,${image}`;
  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: USER_PROMPT },
            { type: 'image_url', image_url: { url, detail: 'high' } }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('No content from OpenAI');

  console.log(`Book OCR success via OpenAI ${model}, ${content.length} chars`);
  return jsonResponse({ markdown: cleanTranscription(content), provider: 'openai', model });
}
