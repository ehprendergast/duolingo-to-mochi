const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:CORS});}
export default async(req)=>{
  if(req.method==='OPTIONS')return new Response('',{status:204,headers:CORS});
  if(req.method!=='POST')return json({error:'Use POST'},405);
  try{
    const {text,context='',language='jpn'}=await req.json();
    if(!text)return json({error:'No text'},400);
    console.log(`Furigana req text=${text} ctx=${context?.slice(0,30)} lang=${language} hasAnth=${!!process.env.ANTHROPIC_API_KEY} hasOpenAI=${!!process.env.OPENAI_API_KEY}`);
    
    // Try Anthropic if key present
    if(process.env.ANTHROPIC_API_KEY){
      try{
        const r=await genAnthropic(text,context,language);
        const body=await r.text(); const j=JSON.parse(body);
        if(j.reading)return r;
        console.warn(`Anthropic returned no reading, trying Jisho fallback`);
      }catch(e){console.warn(`Anthropic failed: ${e.message}, trying Jisho`);}
    }
    if(process.env.OPENAI_API_KEY){
      try{
        const r=await genOpenAI(text,context,language);
        const body=await r.text(); const j=JSON.parse(body);
        if(j.reading)return r;
      }catch(e){console.warn(`OpenAI failed: ${e.message}`);}
    }
    // Jisho.org fallback - free, no API key needed, works for most common words
    try{
      const jishoReading=await genJisho(text,context);
      if(jishoReading){
        console.log(`Jisho success for ${text} -> ${jishoReading}`);
        return json({original:text,reading:jishoReading,provider:'jisho',context});
      }
    }catch(e){console.warn(`Jisho failed for ${text}: ${e.message}`);}
    
    return json({original:text,reading:null,note:'No reading found. Tried Anthropic, OpenAI, Jisho. Set ANTHROPIC_API_KEY for best accuracy.',fallback:true});
  }catch(e){console.error(e);return json({error:e.message,fallback:true},500);}
};
export const handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  try{
    const {text,context='',language='jpn'}=JSON.parse(event.body||'{}');
    if(!text)return json({error:'No text'},400);
    // Simulate request
    const req={method:'POST',json:async()=>({text,context,language})};
    const res=await (async()=>{
      if(process.env.ANTHROPIC_API_KEY){
        try{return await genAnthropic(text,context,language);}catch(e){console.warn(e.message);}
      }
      if(process.env.OPENAI_API_KEY){
        try{return await genOpenAI(text,context,language);}catch(e){console.warn(e.message);}
      }
      try{
        const r=await genJisho(text,context);
        if(r)return json({original:text,reading:r,provider:'jisho'});
      }catch{}
      return json({original:text,reading:null,fallback:true});
    })();
    const body=await res.text();
    return{statusCode:res.status,headers:Object.fromEntries(res.headers.entries()),body};
  }catch(e){return{statusCode:500,headers:CORS,body:JSON.stringify({error:e.message})};}}

async function genAnthropic(text,context,language){
  const sysPrompt=`You are a Japanese furigana generator. You are given a word AS IT APPEARS in a sentence; return its hiragana reading exactly as it is read in that sentence. Use the sentence context to choose the correct reading — kun'yomi for native Japanese words, verbs and adjectives, on'yomi for Sino-Japanese compounds — as the word is actually read in context, never an isolated-character reading. Return ONLY JSON: {"reading":"hiragana"} Examples: word 履きます in "靴を履きます" -> はきます, 布->ぬの, 寒い->さむい, 学生->がくせい, 美しい->うつくしい, お任せ->おまかせ.`;
  const userPrompt=context?`Sentence: "${context}"\nWord as it appears: "${text}"`:`Word: "${text}"`;
  const models=['claude-3-5-haiku-20241022','claude-3-5-sonnet-20241022','claude-3-haiku-20240307'];
  let last;
  for(const model of models){
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model,max_tokens:100,system:sysPrompt,messages:[{role:'user',content:userPrompt}],temperature:0})
      });
      const raw=await res.text();
      console.log(`${model} status ${res.status} ${raw.slice(0,400)}`);
      if(!res.ok){last=raw.slice(0,300); if(res.status===404)continue; throw new Error(last);}
      const data=JSON.parse(raw);
      const content=data.content?.[0]?.text||'';
      const m=content.match(/\{[^}]*"reading"[^}]*\}/);
      const jStr=m?m[0]:content;
      try{
        const p=JSON.parse(jStr);
        const reading=(p.reading||'').trim();
        if(reading)return json({original:text,reading,provider:'anthropic',model});
      }catch{
        const clean=content.trim().replace(/["{}]/g,'');
        if(clean)return json({original:text,reading:clean,provider:'anthropic',model});
      }
    }catch(e){last=e.message; if(e.message.includes('404'))continue; throw e;}
  }
  throw new Error(`Anthropic failed: ${last}`);
}

async function genOpenAI(text,context,language){
  const res=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
    body:JSON.stringify({
      model:process.env.OPENAI_FURIGANA_MODEL||'gpt-4o-mini',
      messages:[
        {role:'system',content:`You are a Japanese furigana generator. Given a word AS IT APPEARS in a sentence, return its hiragana reading exactly as read in that sentence, using the context to choose kun'yomi vs on'yomi as the word is actually read. Return ONLY JSON: {"reading":"hiragana"}`},
        {role:'user',content:context?`Sentence:${context}\nWord as it appears:${text}`:`Word:${text}`}
      ],
      max_tokens:100,temperature:0.1,response_format:{type:'json_object'}
    })
  });
  if(!res.ok)throw new Error(`OpenAI ${res.status}`);
  const d=await res.json();
  const c=d.choices?.[0]?.message?.content||'';
  try{const p=JSON.parse(c);return json({original:text,reading:(p.reading||c).trim(),provider:'openai'});}catch{return json({original:text,reading:c.trim(),provider:'openai'});}
}

const KANA_ONLY = /^[ぁ-ゖァ-ヶー]+$/;
const HAS_KANJI = /[\u4e00-\u9fff]/;

function toHiragana(reading) {
  return reading.replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * Extend a bare-kanji query with the kana that follow it in the
 * context sentence: 履 in "靴を履きます" is the word 履きます.
 */
function extendWithContext(clean, context) {
  if (clean.length !== 1 || !context) return clean;
  const pos = context.indexOf(clean);
  if (pos < 0) return clean;
  let extended = clean;
  for (const ch of context.slice(pos + 1)) {
    if (KANA_ONLY.test(ch)) extended += ch;
    else break;
  }
  return extended.length > 1 ? extended : clean;
}

/**
 * True when query and entry word share the same kanji stem and
 * differ only in their kana tails — i.e. the entry word is the
 * dictionary form of the inflected query (履く for 履きます,
 * 食べる for 食べます). A kanji anywhere in either remainder
 * disqualifies it (履歴 is not a form of 履きます).
 */
function sharesKanjiStem(query, word) {
  let p = 0;
  while (p < query.length && p < word.length && query[p] === word[p]) p++;
  if (p === 0) return false;
  const qRest = query.slice(p);
  const wRest = word.slice(p);
  if (qRest && !KANA_ONLY.test(qRest)) return false;
  if (wRest && !KANA_ONLY.test(wRest)) return false;
  return HAS_KANJI.test(query.slice(0, p));
}

/**
 * Pick the Jisho reading that belongs to the queried word as used in
 * the sentence. The naive approach — first entry, first form — is how
 * a bare kanji query like 履 returned くつ (the top hit is the word
 * 靴 "shoes"): an isolated-character lookup cannot know how the kanji
 * is read in context. Instead, in order:
 *
 * 1. An entry whose word matches the (context-extended) query exactly.
 * 2. The first entry, in Jisho's own ranking for this query, whose
 *    word is the dictionary form of the query (sharesKanjiStem) —
 *    Jisho's search already resolves inflections, so its ranking is
 *    meaningful here.
 * 3. An entry whose word actually appears in the context sentence.
 * 4. An exact match for the raw (unextended) query.
 * If nothing matches, return null: no furigana beats a wrong one.
 */
function pickJishoReading(entries, query, clean, context) {
  const forms = [];
  for (const entry of entries || []) {
    for (const form of entry.japanese || []) {
      if (form.word && form.reading) forms.push(form);
    }
  }
  if (forms.length === 0) return null;

  let hit = forms.find(f => f.word === query);
  if (!hit) hit = forms.find(f => sharesKanjiStem(query, f.word));
  if (!hit && context) {
    hit = forms.find(f => f.word.length >= 2 && f.word.startsWith(clean[0]) && context.includes(f.word));
  }
  if (!hit && query !== clean) {
    hit = forms.find(f => f.word === clean);
  }

  if (!hit) return null;
  // Jisho readings are hiragana already, but convert defensively.
  return toHiragana(hit.reading);
}

async function genJisho(text, context = '') {
  // Jisho.org free API - no key needed, returns reading for common Japanese words
  // Example: https://jisho.org/api/v1/search/words?keyword=布
  try {
    // Clean text: take first word, remove punctuation
    const clean = text.trim().split(/\s+/)[0].replace(/[。、！？「」『』（）・]/g, '');
    if (!clean) return null;
    // Skip if already all hiragana/katakana (no kanji)
    if (!HAS_KANJI.test(clean)) return null;

    // Search with the word as it appears in the sentence, so Jisho's
    // own inflection handling can resolve it (履きます -> 履く).
    const query = extendWithContext(clean, context);
    const res = await fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'duolingo-to-mochi/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return pickJishoReading(data.data, query, clean, context);
  } catch (e) {
    console.warn(`Jisho error for ${text}: ${e.message}`);
    return null;
  }
}
