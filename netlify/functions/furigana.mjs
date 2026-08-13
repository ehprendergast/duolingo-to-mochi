/**
 * Netlify Function: Furigana / Pinyin generator
 * Now supports Anthropic Claude (preferred) + OpenAI fallback
 * 
 * Env vars (set in Netlify UI):
 *   ANTHROPIC_API_KEY (preferred for you) = sk-ant-...
 *   OPENAI_API_KEY (fallback) = sk-...
 *   OPENAI_FURIGANA_MODEL or ANTHROPIC_FURIGANA_MODEL to override models
 * 
 * Request: POST { text: "学生", context: "私は学生です", language: "jpn" }
 * Response: { reading: "がくせい", original: "学生", provider: "anthropic" }
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
    if (!text) return jsonResponse({ error: 'No text provided' }, 400);

    // Prefer Anthropic if you set it, fallback to OpenAI
    if (process.env.ANTHROPIC_API_KEY) {
      return await generateWithAnthropic(text, context, language);
    }
    if (process.env.OPENAI_API_KEY) {
      return await generateWithOpenAI(text, context, language);
    }

    return jsonResponse({
      original: text,
      reading: null,
      note: 'No ANTHROPIC_API_KEY or OPENAI_API_KEY set. Set ANTHROPIC_API_KEY in Netlify env (Functions scope) for auto furigana.',
      fallback: true
    });

  } catch (e) {
    console.error('Furigana error:', e);
    return jsonResponse({ error: e.message, fallback: true }, 500);
  }
};

// Netlify Functions v1 compat
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  try {
    const { text, context = '', language = 'jpn' } = JSON.parse(event.body || '{}');
    if (!text) return jsonResponse({ error: 'No text' }, 400);
    let response;
    if (process.env.ANTHROPIC_API_KEY) {
      response = await generateWithAnthropic(text, context, language);
    } else if (process.env.OPENAI_API_KEY) {
      response = await generateWithOpenAI(text, context, language);
    } else {
      response = jsonResponse({ original: text, reading: null, fallback: true });
    }
    const body = await response.text();
    return { statusCode: response.status, headers: Object.fromEntries(response.headers.entries()), body };
  } catch (e) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: e.message }) };
  }
};

async function generateWithAnthropic(text, context, language) {
  const isChinese = language === 'zho';
  
  let systemPrompt, userPrompt;

  if (language === 'jpn') {
    systemPrompt = `You are a Japanese furigana generator. Given a Japanese word/phrase that may contain kanji, return its hiragana reading.
Rules:
- Return ONLY valid JSON: {"reading": "hiragana"}
- Reading must be hiragana only (not katakana, not romaji)
- Examples: 食べ物 -> {"reading": "たべもの"}, 学生 -> {"reading": "がくせい"}, 美しい -> {"reading": "うつくしい"}, お任せ -> {"reading": "おまかせ"}, 任 -> {"reading": "にん"}, 八番目 -> {"reading": "はちばんめ"}
- If already kana only, return as hiragana
- Use context to disambiguate (e.g., 生 can be せい/しょう/なま)`;

    userPrompt = context 
      ? `Word: "${text}"\nContext: "${context}"\nReading?`
      : `Word: "${text}"\nReading?`;
  } else if (isChinese) {
    systemPrompt = `You are a Chinese pinyin generator. Return pinyin with tone marks. Return ONLY JSON: {"reading": "pinyin"} Example: 你好 -> {"reading": "nǐ hǎo"}`;
    userPrompt = `Word: "${text}"`;
  } else {
    systemPrompt = `Return furigana/pinyin for given text. Return ONLY JSON: {"reading": "value"}`;
    userPrompt = `Word: "${text}" Context: "${context}"`;
  }

  const model = process.env.ANTHROPIC_FURIGANA_MODEL || 'claude-3-haiku-20240307';

  console.log(`Anthropic furigana: model=${model}, text=${text}, hasContext=${!!context}`);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 100,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.1
    })
  });

  const rawText = await res.text();
  console.log(`Anthropic status ${res.status}, body: ${rawText.slice(0,500)}`);

  if (!res.ok) {
    throw new Error(`Anthropic error ${res.status}: ${rawText.slice(0,500)}`);
  }

  const data = JSON.parse(rawText);
  const content = data.content?.[0]?.text || '';

  try {
    // Try to extract JSON from content (Claude sometimes wraps in text)
    const jsonMatch = content.match(/\{[^}]*"reading"[^}]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr);
    const reading = parsed.reading?.trim().replace(/[{}()]/g, '') || '';
    return jsonResponse({ original: text, reading, provider: 'anthropic', model, context });
  } catch {
    // Fallback: use raw text as reading, clean it
    const clean = content.trim().replace(/["{}]/g, '').replace(/^reading:\s*/i, '');
    return jsonResponse({ original: text, reading: clean, provider: 'anthropic', model, raw: content });
  }
}

async function generateWithOpenAI(text, context, language) {
  const isChinese = language === 'zho';
  let systemPrompt, userPrompt;

  if (language === 'jpn') {
    systemPrompt = `You are a Japanese furigana generator. Return ONLY JSON: {"reading": "hiragana"} Examples: 食べ物->たべもの, 学生->がくせい, お任せ->おまかせ`;
    userPrompt = context ? `Word: "${text}" Context: "${context}"` : `Word: "${text}"`;
  } else {
    systemPrompt = `You are a Chinese pinyin generator. Return ONLY JSON: {"reading": "pinyin"}`;
    userPrompt = `Word: "${text}"`;
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
    const reading = (parsed.reading || content).trim().replace(/[{}()]/g, '');
    return jsonResponse({ original: text, reading, provider: 'openai', context });
  } catch {
    return jsonResponse({ original: text, reading: content.trim(), provider: 'openai', raw: content });
  }
}
