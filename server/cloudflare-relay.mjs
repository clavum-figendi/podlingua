const ORIGIN='https://clavum-figendi.github.io',MAX=100*1024*1024;
const headers={'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,error)=>new Response(JSON.stringify({error}),{status,headers:{...headers,'Content-Type':'application/json'}});
function media(value){if(typeof value!=='string'||value.length>8000||/[\s\\#]/.test(value))throw Error('url');const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port||!['audio.podigee-cdn.net','adswizz.podigee-cdn.net'].includes(u.hostname)||! /\.(mp3|m4a|ogg|wav|opus|flac)$/i.test(u.pathname))throw Error('url');return u.href;}
async function body(request){const reader=request.body?.getReader();if(!reader)throw Error('body');let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192)throw Error('body');chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
export async function handle(request,env={},fetcher=fetch){
 const path=new URL(request.url).pathname;
 if(path==='/health'&&request.method==='GET')return new Response(JSON.stringify({ok:true,version:'cf-1',maxBytes:MAX}),{headers:{...headers,'Content-Type':'application/json'}});
 if(path!=='/fetch')return reply(404,'not_found');
 if(request.headers.get('Origin')!==ORIGIN)return reply(403,'origin_denied');
 if(request.method==='OPTIONS'){const requested=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);if(request.headers.get('Access-Control-Request-Method')!=='POST'||requested.some(h=>h!=='content-type'))return reply(403,'preflight_denied');return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}});}
 if(request.method!=='POST')return reply(405,'method_denied');
 if(!/^application\/json(?:;.*)?$/i.test(request.headers.get('Content-Type')||''))return reply(415,'content_type');
 if(Number(request.headers.get('Content-Length'))>8192)return reply(413,'body_limit');
 let url;try{const data=await body(request);if(!data||Object.keys(data).length!==1)throw Error('body');url=media(data.url);}catch{return reply(400,'invalid_request');}
 if(env.RATE_LIMITER){const result=await env.RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});if(!result.success)return reply(429,'rate_limit');}
 const control=new AbortController(),abort=()=>control.abort();request.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,240000);const clean=()=>{clearTimeout(timer);request.signal.removeEventListener('abort',abort);};let upstream;
 try{
  for(let hops=0;hops<=5;hops++){upstream=await fetcher(url,{method:'GET',redirect:'manual',headers:{Accept:'audio/*','Accept-Encoding':'identity'},signal:control.signal});if([301,302,303,307,308].includes(upstream.status)){const location=upstream.headers.get('Location');await upstream.body?.cancel();if(hops===5||!location)throw Error('redirect');url=media(new URL(location,url).href);continue;}break;}
  const type=upstream.headers.get('Content-Type')||'',raw=upstream.headers.get('Content-Length'),length=Number(raw);
  if(upstream.status!==200||!/^audio\//i.test(type)||!raw||!/^\d+$/.test(raw)||!Number.isSafeInteger(length)||length<1||length>MAX||!upstream.body)throw Error('media_'+upstream.status+'_'+(raw?'sized':'unsized'));
  const reader=upstream.body.getReader();let total=0;
  const stream=new ReadableStream({async pull(controller){try{const {done,value}=await reader.read();if(done){if(total!==length)throw Error('length');clean();controller.close();return;}total+=value.byteLength;if(total>length)throw Error('size');controller.enqueue(value);}catch{clean();control.abort();await reader.cancel().catch(()=>{});controller.error(Error('Audio transfer interrupted'));}},async cancel(){clean();control.abort();await reader.cancel().catch(()=>{});}});
  return new Response(stream,{headers:{...headers,'Content-Type':type,'Content-Length':String(length)}});
 }catch(error){clean();control.abort();await upstream?.body?.cancel().catch(()=>{});const reason=/^(url|redirect|media_\d{3}_(un)?sized)$/.test(error.message)?error.message:'network';return reply(502,'audio_unavailable_'+reason);}
}
export default {fetch(request,env){return handle(request,env);}};
