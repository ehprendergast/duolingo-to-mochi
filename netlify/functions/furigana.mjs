const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:CORS});}
export default async(req)=>{
  if(req.method==='OPTIONS')return new Response('',{status:204,headers:CORS});
  if(req.method!=='POST')return json({error:'Use POST'},405);
  try{
    const {text,context='',language='jpn'}=await req.json();
    if(!text)return json({error:'No text'},400);
    console.log(`Furigana env check anth=${!!process.env.ANTHROPIC_API_KEY} openai=${!!process.env.OPENAI_API_KEY} google=${!!process.env.GOOGLE_VISION_API_KEY}`);
    if(process.env.ANTHROPIC_API_KEY)return await genAnthropic(text,context,language);
    if(process.env.OPENAI_API_KEY)return await genOpenAI(text,context,language);
    return json({original:text,reading:null,note:'Set ANTHROPIC_API_KEY',fallback:true});
  }catch(e){console.error(e);return json({error:e.message,fallback:true},500);}
};
export const handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:CORS,body:''};
  try{
    const {text,context='',language='jpn'}=JSON.parse(event.body||'{}');
    if(!text)return json({error:'No text'},400);
    let r;
    if(process.env.ANTHROPIC_API_KEY)r=await genAnthropic(text,context,language);
    else if(process.env.OPENAI_API_KEY)r=await genOpenAI(text,context,language);
    else r=json({original:text,reading:null,fallback:true});
    const b=await r.text();
    return{statusCode:r.status,headers:Object.fromEntries(r.headers.entries()),body:b};
  }catch(e){return{statusCode:500,headers:CORS,body:JSON.stringify({error:e.message})};}}

async function genAnthropic(text,context,language){
  const isChinese=language==='zho';
  let sysPrompt,userPrompt;
  if(language==='jpn'){
    sysPrompt=`You are a Japanese furigana generator. Return ONLY JSON: {"reading":"hiragana"} Examples: 布->{"reading":"ぬの"}, 寒い->{"reading":"さむい"}, 学生->{"reading":"がくせい"} Use context to disambiguate.`;
    userPrompt=context?`Word: "${text}" Context: "${context}"`:`Word: "${text}"`;
  }else{
    sysPrompt=`Chinese pinyin generator. Return ONLY JSON: {"reading":"pinyin"}`;
    userPrompt=`Word: "${text}"`;
  }
  const modelsToTry=[
    process.env.ANTHROPIC_FURIGANA_MODEL,
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-latest',
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229'
  ].filter(Boolean);

  let lastErr;
  for(const model of modelsToTry){
    try{
      console.log(`Anthropic trying ${model} for ${text}`);
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
          system:sysPrompt,
          messages:[{role:'user',content:userPrompt}],
          temperature:0
        })
      });
      const raw=await res.text();
      console.log(`${model} -> ${res.status} ${raw.slice(0,600)}`);
      if(!res.ok){
        lastErr=`${model} ${res.status}: ${raw.slice(0,400)}`;
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
        if(reading)return json({original:text,reading,provider:'anthropic',model});
      }catch{
        const clean=content.trim().replace(/["{}]/g,'');
        if(clean)return json({original:text,reading:clean,provider:'anthropic',model});
      }
    }catch(e){lastErr=e.message; console.warn(`Fail ${model}: ${e.message}`); if(e.message.includes('404'))continue; throw e;}
  }
  throw new Error(`All Anthropic models failed: ${lastErr}`);
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
    return json({original:text,reading:(p.reading||c).trim(),provider:'openai'});
  }catch{
    return json({original:text,reading:c.trim(),provider:'openai'});
  }
}
