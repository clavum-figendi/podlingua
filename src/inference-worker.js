// A dedicated worker keeps inference off the UI thread; terminate it to cancel.
let cached;
const nativeFetch=globalThis.fetch?.bind(globalThis);
const opusPairs={'Xenova/opus-mt-en-fr':['en','fr'],'Xenova/opus-mt-fr-en':['fr','en'],'Xenova/opus-mt-en-de':['en','de'],'Xenova/opus-mt-de-en':['de','en']};
export async function executeInference(job, {pipelineFactory, onProgress = () => {}} = {}) {
  const preparing=job.task==='prepare',asr=job.task==='asr'||(preparing&&job.kind==='asr');
  if (!asr && job.task !== 'translate' && !(preparing&&job.kind==='translation')) throw new Error('Unknown local task');
  if (!(asr ? ['Xenova/whisper-tiny','Xenova/whisper-base'] : ['Xenova/m2m100_418M',...Object.keys(opusPairs)]).includes(job.model)) throw new Error('Unsupported local model');
  if (!preparing && !asr && (!job.source || job.source === 'auto')) throw new Error('Local translation requires an explicit source language.');
  const source=job.source?.toLowerCase().split('-')[0],target=job.target?.toLowerCase().split('-')[0];
  if(!preparing && opusPairs[job.model] && (source!==opusPairs[job.model][0]||target!==opusPairs[job.model][1]))throw new Error('Selected OPUS model does not support this language pair. Choose its matching direction or M2M100.');
  if (!preparing && asr && (!(job.pcm instanceof Float32Array) || !job.pcm.length || job.pcm.length > 30*16000)) throw new Error('Invalid local audio chunk');
  if (!preparing && !asr && (!Array.isArray(job.texts) || job.texts.length > 8 || job.texts.some(t=>typeof t !== 'string' || t.length > 4000))) throw new Error('Invalid translation batch');
  let factory=pipelineFactory;
  if(!factory){
    const transformers=await import('@huggingface/transformers');
    transformers.env.allowLocalModels=job.offlineOnly===true;
    transformers.env.allowRemoteModels=job.offlineOnly!==true;
    globalThis.fetch=job.offlineOnly===true?(input,options)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,globalThis.location.href);if(url.origin!==globalThis.location.origin||url.pathname.startsWith('/models/'))return Promise.resolve(new Response(null,{status:404}));return nativeFetch(input,options);}:nativeFetch;
    transformers.env.cacheKey='podlingua-models-v1';
    transformers.env.backends.onnx.wasm.numThreads=1;
    transformers.env.backends.onnx.wasm.proxy=false;
    factory=transformers.pipeline;
  }
  const task = asr ? 'automatic-speech-recognition' : 'translation';
  if (!cached || cached.model !== job.model || cached.factory !== factory) {
    await cached?.pipe?.dispose?.();
    const pipe = await factory(task, job.model, {device:'wasm',dtype:'q8',local_files_only:job.offlineOnly===true,progress_callback:onProgress});
    cached = {model:job.model,factory,pipe};
  }
  if(preparing)return {ready:true,model:job.model};
  if (asr) return cached.pipe(job.pcm, {return_timestamps:true,task:'transcribe',...(job.source && job.source !== 'auto' ? {language:job.source} : {})});
  const result = [];
  for(const text of job.texts){
    const item=await cached.pipe(text, {...(opusPairs[job.model]?{}:{src_lang:source,tgt_lang:target}),max_new_tokens:512});
    result.push(item[0]);
  }
  const texts = result.map(r=>r.translation_text);
  if (texts.length !== job.texts.length || texts.some(t=>typeof t !== 'string')) throw new Error('Invalid local translation result');
  return texts;
}
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') {
  self.onmessage = async ({data:{id,job}}) => {
    try { const result = await executeInference(job,{onProgress:progress=>self.postMessage({id,progress})}); self.postMessage({id,result}); }
    catch(error) { self.postMessage({id,error: error instanceof Error ? error.message.slice(0,400) : 'Local inference failed. Check model download access, language support and available memory.'}); }
  };
}
