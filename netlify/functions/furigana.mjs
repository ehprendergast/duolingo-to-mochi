/**
 * Netlify Function: Furigana / Pinyin generator
 * Supports Anthropic Claude (preferred) + OpenAI fallback
 * Fixed: model name claude-3-haiku-20240307 was 404, now using claude-3-5-haiku-20241022 with fallbacks
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
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Use POST' }, 405);
  try {
    const { text, context = '', language = 'jpn' } = await req.json();
    if (!text) return jsonResponse({ error: 'No text provided' }, 400);

    if (process.env.ANTHROPIC_API_KEY) {
      return await generateWithAnthropic(text, context, language);
    }
    if (process.env.OPENAI_API_KEY) {
      return await generateWithOpenAI(text, context, language);
    }
    return jsonResponse({
      original: text, reading: null,
      note: 'No ANTHROPIC_API_KEY or OPENAI_API_KEY set. Set ANTHROPIC_API_KEY in Netlify env (Functions scope).',
      fallback: true
    });
  } catch (e) {
    console.error('Furigana error:', e);
    return jsonResponse({ error: e.message, fallback: true }, 500);
  }
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  try {
    const { text, context = '', language = 'jpn' } = JSON.parse(event.body || '{}');
    if (!text) return jsonResponse({ error: 'No text' }, 400);
    let response;
    if (process.env.ANTHROPIC_API_KEY) response = await generateWithAnthropic(text, context, language);
    else if (process.env.OPENAI_API_KEY) response = await generateWithOpenAI(text, context, language);
    else response = jsonResponse({ original: text, reading: null, fallback: true });
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
    systemPrompt = `You are a Japanese furigana generator. Return ONLY valid JSON: {"reading": "hiragana"}. Reading must be hiragana only. Examples: 食べ物->{"reading":"たべもの"}, 学生->{"reading":"がくせい"}, 美しい->{"reading":"うつくしい"}, お任せ->{"reading":"おまかせ"}, 布->{"reading":"ぬの"}, 冬->{"reading":"ふゆ"}, 夜->{"reading":"よる"}, 暗く->{"reading":"くらく"}, 寒い->{"reading":"さむい"}, 八番目->{"reading":"はちばんめ"}. If kana only, return as hiragana. Use context to disambiguate.`;
    userPrompt = context ? `Word: "${text}" Context: "${context}" Reading?` : `Word: "${text}" Reading?`;
  } else if (isChinese) {
    systemPrompt = `You are a Chinese pinyin generator. Return ONLY JSON: {"reading": "pinyin"} Example: 你好->{"reading":"nǐ hǎo"}`;
    userPrompt = `Word: "${text}"`;
  } else {
    systemPrompt = `Return furigana/pinyin. Return ONLY JSON: {"reading":"value"}`;
    userPrompt = `Word: "${text}" Context: "${context}"`;
  }

  const modelsToTry = [
    process.env.ANTHROPIC_FURIGANA_MODEL,
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229'
  ].filter(Boolean);

  let lastError;
  for (const model of modelsToTry) {
    try {
      console.log(`Anthropic try model=${model}, text=${text}`);
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
          temperature: 0
        })
      });

      const rawText = await res.text();
      console.log(`Anthropic ${model} status ${res.status}, body ${rawText.slice(0,500)}`);

      if (!res.ok) {
        lastError = `Anthropic ${model} error ${res.status}: ${rawText.slice(0,500)}`;
        if (res.status === 404 && rawText.includes('not_found_error')) {
          console.warn(`Model ${model} not found, trying next`);
          continue; // try next model
        }
        throw new Error(lastError);
      }

      const data = JSON.parse(rawText);
      const content = data.content?.[0]?.text || '';
      const jsonMatch = content.match(/\{[^}]*"reading"[^}]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      try {
        const parsed = JSON.parse(jsonStr);
        const reading = (parsed.reading || '').trim().replace(/[{}()]/g, '');
        if (reading) return jsonResponse({ original: text, reading, provider: 'anthropic', model, context });
      } catch {
        const clean = content.trim().replace(/["{}]/g, '').replace(/^reading:\s*/i, '');
        if (clean) return jsonResponse({ original: text, reading: clean, provider: 'anthropic', model, raw: content });
      }
    } catch (e) {
      lastError = e.message;
      console.warn(`Anthropic model ${model} failed: ${e.message}, trying next if any`);
      // Continue to next model if 404
      if (e.message.includes('404') || e.message.includes('not_found')) continue;
      throw e;
    }
  }

  throw new Error(`All Anthropic models failed, last: ${lastError}`);
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
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
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
