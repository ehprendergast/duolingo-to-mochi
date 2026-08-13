/**
 * Furigana - Anthropic with latest aliases, fixes 404 for versioned models
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
function jsonResponse(data, status=200){return new Response(JSON.stringify(data),{status,headers:CORS_HEADERS});}
export default async (req)=>{
  if(req.method==='OPTIONS')return new Response('',{status:204,headers:CORS_HEADERS});
  if(req.method!=='POST')return jsonResponse({error:'Use POST'},405);
  try{
    const {text,context='',language='jpn'}=await req.json();
    if(!text)return jsonResponse({error:'No text'},400);
    if(process.env.ANTHROPIC_API_KEY)return await genAnthropic(text,context,language);
    if(process.env.OPENAI_API_KEY)return await genOpenAI(text,context,language);
    return jsonResponse({original:text,reading:null,note:'Set ANTHROPIC_API_KEY',fallback:true});
  }catch(e){return jsonResponse({error:e.message,fallback:true},500);}
};
export const handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS_HEADERS,body:''};
  try{
    const {text,context='',language='jpn'}=JSON.parse(event.body||'{}');
    if(!text)return jsonResponse({error:'No text'},400);
    let r;
    if(process.env.ANTHROPIC_API_KEY)r=await genAnthropic(text,context,language);
    else if(process.env.OPENAI_API_KEY)r=await genOpenAI(text,context,language);
    else r=jsonResponse({original:text,reading:null,fallback:true});
    const b=await r.text();
    return{statusCode:r.status,headers:Object.fromEntries(r.headers.entries()),body:b};
  }catch(e){return{statusCode:500,headers:CORS_HEADERS,body:JSON.stringify({error:e.message})};}}

async function genAnthropic(text,context,language){
  const isChinese=language==='zho';
  let systemPrompt,userPrompt;
  if(language==='jpn'){
    systemPrompt=`You are a Japanese furigana generator. Return ONLY JSON: {"reading":"hiragana"}. Examples: 学生->がくせい, 美しい->うつくしい, お任せ->おまかせ, 布->ぬの, 冬->ふゆ, 夜->よる, 暗く->くらく, 寒い->さむい, 八番目->はちばんめ, 任->にん. If kana only return as hiragana. Use context.`;
    userPrompt=context?`Word: "${text}" Context: "${context}"`:`Word: "${text}"`;
  }else{
    systemPrompt=`You are Chinese pinyin generator. Return ONLY JSON: {"reading":"pinyin"}`;
    userPrompt=`Word: "${text}"`;
  }
  const modelsToTry=[
    process.env.ANTHROPIC_FURIGANA_MODEL,
    'claude-3-5-haiku-latest',
    'claude-3-5-sonnet-latest',
    'claude-3-haiku-20240307',
    'claude-3-5-haiku-20241022',
    'claude-3-sonnet-20240229',
    'claude-3-opus-20240229'
  ].filter(Boolean);

  let lastErr;
  for(const model of modelsToTry){
    try{
      console.log(`Anthropic try ${model} for ${text}`);
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key':process.env.ANTHROPIC_API_KEY,
          'anthropic-version':'2023-06-01'
        },
        body:JSON.stringify({
          model,
          max_tokens:100,
          system:systemPrompt,
          messages:[{role:'user',content:userPrompt}],
          temperature:0
        })
      });
      const raw=await res.text();
      console.log(`Anthropic ${model} -> ${res.status} ${raw.slice(0,400)}`);
      if(!res.ok){
        lastErr=`${model} ${res.status}: ${raw.slice(0,300)}`;
        if(res.status===404)continue;
        throw new Error(lastErr);
      }
      const data=JSON.parse(raw);
      const content=data.content?.[0]?.text||'';
      const m=content.match(/\{[^}]*"reading"[^}]*\}/);
      const jStr=m?m[0]:content;
      try{
        const p=JSON.parse(jStr);
        const reading=(p.reading||'').trim();
        if(reading)return jsonResponse({original:text,reading,provider:'anthropic',model,context});
      }catch{
        const clean=content.trim().replace(/["{}]/g,'');
        if(clean)return jsonResponse({original:text,reading:clean,provider:'anthropic',model});
      }
    }catch(e){lastErr=e.message; console.warn(`Model ${model} fail ${e.message}`); if(e.message.includes('404'))continue; throw e;}
  }
  throw new Error(`All Anthropic models failed, last: ${lastErr}`);
}

async function genOpenAI(text,context,language){
  const sys=language==='jpn'?`Return ONLY JSON: {"reading":"hiragana"}`:`Return ONLY JSON: {"reading":"pinyin"}`;
  const user=context?`Word:${text} Context:${context}`:`Word:${text}`;
  const res=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
    body:JSON.stringify({
      model:process.env.OPENAI_FURIGANA_MODEL||'gpt-4o-mini',
      messages:[{role:'system',content:sys},{role:'user',content:user}],
      max_tokens:100,temperature:0.1,response_format:{type:'json_object'}
    })
  });
  if(!res.ok)throw new Error(`OpenAI ${res.status} ${(await res.text()).slice(0,300)}`);
  const d=await res.json();
  const c=d.choices?.[0]?.message?.content||'';
  try{
    const p=JSON.parse(c);
    return jsonResponse({original:text,reading:(p.reading||c).trim(),provider:'openai'});
  }catch{
    return jsonResponse({original:text,reading:c.trim(),provider:'openai'});
  }
}
