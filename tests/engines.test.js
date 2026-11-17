import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engines.js';

test('catalog exposes local multilingual Whisper and MIT multilingual translation', () => {
  assert.equal(e.asrProviders.find(p => p.id === 'local').model, 'Xenova/whisper-tiny');
  assert.match(e.translationProviders.find(p => p.id === 'local').description, /MIT/);
});
test('endpoint policy rejects plaintext hosted, credentials and fragments', () => {
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/#secret', 'ftp://localhost/a']) assert.throws(() => e.safeEndpoint(url));
  assert.equal(e.safeEndpoint('http://localhost:11434/v1').protocol, 'http:');
});
test('all cloud calls require explicit consent before transport', async () => {
  await assert.rejects(e.transcribe(new Blob(['a']), {provider:'openai'}), /consent/i);
  await assert.rejects(e.translate({segments:[{start:0,end:1,text:'a'}]}, {provider:'openai',target:'de'}), /consent/i);
});
test('Whisper parser preserves measured segments, word offsets and unknown speakers', () => {
  const s=e.parseASR('openai',{segments:[{start:1,end:2,text:'Hi'}],words:[{start:1,end:1.5,word:'Hi'}]},30);
  assert.deepEqual(s,[{start:31,end:32,text:'Hi',words:[{start:31,end:31.5,text:'Hi'}]}]);
  assert.throws(()=>e.parseASR('openai',{text:'untimed'}),/timed/i);
});
test('local timestamp parser rejects missing boundaries instead of inventing alignment', () => {
  assert.deepEqual(e.parseLocalChunks({chunks:[{timestamp:[0.2,1.4],text:'Hello'}]},30),[{start:30.2,end:31.4,text:'Hello'}]);
  assert.throws(()=>e.parseLocalChunks({chunks:[{timestamp:[0,null],text:'Hello'}]}), /tim/i);
});
test('local worker contract runs real pipeline interface, restricts model IDs and offsets', async () => {
  const {executeInference}=await import('../src/inference-worker.js');
  const calls=[];
  const factory=async(task,model,options)=>{calls.push({task,model,options});return async(input,options)=>{calls.push({input,options});return task==='translation'?[{translation_text:'Hallo'}]:{chunks:[{timestamp:[0.2,1],text:'Hello'}]};};};
  assert.deepEqual(await executeInference({task:'asr',model:'Xenova/whisper-tiny',pcm:new Float32Array(16000),source:'en'},{pipelineFactory:factory}),{chunks:[{timestamp:[0.2,1],text:'Hello'}]});
  assert.equal(calls[1].options.return_timestamps,true);assert.equal(calls[0].options.device,'wasm');
  assert.deepEqual(await executeInference({task:'translate',model:'Xenova/m2m100_418M',texts:['Hello'],source:'en',target:'de'},{pipelineFactory:factory}),['Hallo']);
  await assert.rejects(executeInference({task:'asr',model:'evil/custom',pcm:new Float32Array(1)},{pipelineFactory:factory}),/model/i);
  await assert.rejects(executeInference({task:'translate',model:'Xenova/m2m100_418M',texts:['Hello'],source:'auto',target:'de'},{pipelineFactory:factory}),/source/i);
});
test('PCM chunk boundaries are sample-accurate and WAV is mono 16kHz', () => {
  const pcm=new Float32Array(16000*31+7); pcm[0]=1;
  const chunks=e.chunkPCM(pcm,30);
  assert.deepEqual(chunks.map(c=>[c.offset,c.pcm.length]),[[0,480000],[30,16007]]);
  const view=new DataView(e.encodeWav(pcm.subarray(0,2)));
  assert.equal(view.getUint32(24,true),16000); assert.equal(view.getInt16(44,true),32767);
});
test('small OPUS local models validate the language pair before any download',async()=>{
 const {executeInference}=await import('../src/inference-worker.js');let downloaded=false;
 const factory=async()=>{downloaded=true;return async()=>[{translation_text:'Bonjour le monde.'}];};
 await assert.rejects(executeInference({task:'translate',model:'Xenova/opus-mt-en-fr',texts:['Hello world.'],source:'de',target:'fr'},{pipelineFactory:factory}),/pair/i);
 assert.equal(downloaded,false);
 assert.deepEqual(await executeInference({task:'translate',model:'Xenova/opus-mt-en-fr',texts:['Hello world.'],source:'en',target:'fr'},{pipelineFactory:factory}),['Bonjour le monde.']);
});
