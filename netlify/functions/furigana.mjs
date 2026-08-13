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
      const jishoReading=await genJisho(text);
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
        const r=await genJisho(text);
        if(r)return json({original:text,reading:r,provider:'jisho'});
      }catch{}
      return json({original:text,reading:null,fallback:true});
    })();
    const body=await res.text();
    return{statusCode:res.status,headers:Object.fromEntries(res.headers.entries()),body};
  }catch(e){return{statusCode:500,headers:CORS,body:JSON.stringify({error:e.message})};}}

async function genAnthropic(text,context,language){
  const sysPrompt=`You are Japanese furigana generator. Return ONLY JSON: {"reading":"hiragana"} Examples: 布->ぬの, 寒い->さむい, 学生->がくせい, 美しい->うつくしい, お任せ->おまかせ.`;
  const userPrompt=context?`Word: "${text}" Context: "${context}"`:`Word: "${text}"`;
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
        {role:'system',content:`Return ONLY JSON: {"reading":"hiragana"}`},
        {role:'user',content:`Word:${text} Context:${context}`}
      ],
      max_tokens:100,temperature:0.1,response_format:{type:'json_object'}
    })
  });
  if(!res.ok)throw new Error(`OpenAI ${res.status}`);
  const d=await res.json();
  const c=d.choices?.[0]?.message?.content||'';
  try{const p=JSON.parse(c);return json({original:text,reading:(p.reading||c).trim(),provider:'openai'});}catch{return json({original:text,reading:c.trim(),provider:'openai'});}
}

async function genJisho(text){
  // Jisho.org free API - no key needed, returns reading for common Japanese words
  // Example: https://jisho.org/api/v1/search/words?keyword=布
  try{
    // Clean text: take first word, remove punctuation
    const clean = text.trim().split(/\s+/)[0].replace(/[。、！？「」『』（）・]/g,'');
    if(!clean)return null;
    // Skip if already all hiragana/katakana (no kanji)
    if(!/[\u4e00-\u9fff]/.test(clean))return null;
    
    const res=await fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(clean)}`,{
      headers:{'User-Agent':'duolingo-to-mochi/1.0'}
    });
    if(!res.ok)return null;
    const data=await res.json();
    const first=data.data?.[0];
    if(!first)return null;
    // Try to find reading that matches
    // Jisho returns japanese array with word and reading
    const japanese=first.japanese?.[0];
    if(!japanese)return null;
    let reading=japanese.reading;
    // reading is katakana? Actually Jisho reading is hiragana usually? Check: for 布, reading is ぬの (hiragana)
    // But sometimes it's katakana, convert to hiragana if needed
    if(!reading)return null;
    // Convert katakana to hiragana if needed
    reading=reading.replace(/[\u30a1-\u30f6]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60));
    return reading;
  }catch(e){
    console.warn(`Jisho error for ${text}: ${e.message}`);
    return null;
  }
}
