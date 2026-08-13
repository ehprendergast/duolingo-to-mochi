/**
 * Netlify Function: Furigana / Pinyin generator
 * Generates hiragana reading for Japanese kanji, or pinyin for Chinese
 * 
 * Uses OpenAI if available (most accurate), falls back to simple heuristic
 * 
 * Env: OPENAI_API_KEY (optional but recommended for best accuracy)
 * 
 * Request: POST { text: "学生", context: "私は学生です", language: "jpn" }
 * Response: { reading: "がくせい", original: "学生" }
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Use POST' }, 405);
  }

  try {
    const { text, context = '', language = 'jpn' } = await req.json();
    
    if (!text) {
      return jsonResponse({ error: 'No text provided' }, 400);
    }

    // If OpenAI available, use it for high accuracy furigana/pinyin
    if (process.env.OPENAI_API_KEY) {
      return await generateWithOpenAI(text, context, language);
    }

    // Fallback - return no reading, client will show without furigana
    // Could add simple dictionary lookup here
    return jsonResponse({
      original: text,
      reading: null,
      note: 'No OPENAI_API_KEY set, cannot generate furigana automatically. Set OPENAI_API_KEY in Netlify env.',
      fallback: true
    });

  } catch (e) {
    console.error('Furigana error:', e);
    return jsonResponse({ error: e.message, fallback: true }, 500);
  }
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  const req = {
    method: event.httpMethod,
    json: async () => JSON.parse(event.body || '{}')
  };
  const res = await (await import('node:fs')).promises;
  // Reuse default handler logic
  const response = await (async () => {
    try {
      const { text, context = '', language = 'jpn' } = JSON.parse(event.body || '{}');
      if (!text) return jsonResponse({ error: 'No text' }, 400);
      if (process.env.OPENAI_API_KEY) {
        return await generateWithOpenAI(text, context, language);
      }
      return jsonResponse({ original: text, reading: null, fallback: true });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  })();
  const body = await response.text();
  return { statusCode: response.status, headers: Object.fromEntries(response.headers.entries()), body };
};

async function generateWithOpenAI(text, context, language) {
  const isChinese = language === 'zho' || /[\u4e00-\u9fff]/.test(text) && language.startsWith('zh');

  let systemPrompt, userPrompt;

  if (language === 'jpn' || !isChinese) {
    systemPrompt = `You are a Japanese furigana generator. Given a Japanese word/phrase (may contain kanji), return its hiragana reading.
Rules:
- Return ONLY JSON: {"reading": "hiragana"}
- Reading must be hiragana only (not katakana, not romaji)
- For example: 食べ物 -> たべもの, 学生 -> がくせい, 美しい -> うつくしい, 任 -> にん
- If word is already kana only, return it as is in hiragana
- Use context sentence if provided to disambiguate reading`;

    userPrompt = context 
      ? `Word: "${text}"\nContext sentence: "${context}"\nReturn hiragana reading:`
      : `Word: "${text}"\nReturn hiragana reading:`;
  } else {
    systemPrompt = `You are a Chinese pinyin generator. Given Chinese text, return pinyin with tone marks.
Return ONLY JSON: {"reading": "pinyin"}
Example: 你好 -> nǐ hǎo, 学生 -> xuéshēng`;
    userPrompt = `Word: "${text}"\nReturn pinyin:`;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_FURIGANA_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0,500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  try {
    const parsed = JSON.parse(content);
    const reading = parsed.reading || parsed.furigana || parsed.pinyin || content;
    // Clean: remove extra spaces, ensure hiragana
    const cleanReading = reading.trim().replace(/[{}()]/g, '');
    return jsonResponse({
      original: text,
      reading: cleanReading,
      provider: 'openai',
      context
    });
  } catch {
    // If not JSON, treat content as reading
    return jsonResponse({
      original: text,
      reading: content.trim(),
      provider: 'openai',
      raw: content
    });
  }
}
