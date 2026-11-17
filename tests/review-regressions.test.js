import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engines.js';
import 'fake-indexeddb/auto';
import {saveEpisode,getEpisode,deleteEpisode} from '../src/storage.js';
test('worker payload owns just one chunk and transfer never detaches episode PCM',()=>{
 const episode=new Float32Array(16000*90);const chunk=episode.subarray(0,16000*30);const {job,transfer}=e.workerPayload({task:'asr',pcm:chunk});
 assert.equal(job.pcm.buffer.byteLength,chunk.byteLength);assert.equal(transfer[0],job.pcm.buffer);
 const received=structuredClone(job,{transfer});assert.equal(received.pcm.length,16000*30);assert.equal(episode.length,16000*90);assert.equal(job.pcm.byteLength,0);
});
test('all translation segments and provider byte limits are validated before any request',async()=>{
 const original=fetch;let requests=0;globalThis.fetch=async()=>{requests++;return Response.json({data:{translations:Array(8).fill({translatedText:'test'})}});};
 try{
  for(const [provider,last] of [['google','x'.repeat(4001)],['mymemory','你'.repeat(200)]]){
   await assert.rejects(e.translate({language:'en',segments:[...Array(8).fill({text:'Hello'}),{text:last}]},{provider,allowCloud:true,target:'fr'}),/characters|bytes|segment/i);
   assert.equal(requests,0);
  }
 }finally{globalThis.fetch=original;}
});
test('unknown local source language fails actionably before creating a worker or downloading models',async()=>{
 await assert.rejects(e.translate({language:'unknown',segments:[{text:'Hello'}]},{provider:'local',allowDownload:true,source:'auto',target:'fr'}),/select.*source language/i);
});
test('atomic library revision checks reject concurrent replacement and deletion',async()=>{
 await saveEpisode({id:'revision-test',title:'Initial',doc:{segments:[]}});const old=await getEpisode('revision-test');
 await saveEpisode({...old,title:'Other tab wins'});
 await assert.rejects(saveEpisode({...old,title:'Late job result'}),/changed|deleted/i);
 assert.equal((await getEpisode(old.id)).title,'Other tab wins');
 const beforeDelete=await getEpisode(old.id);await deleteEpisode(old.id);
 await assert.rejects(saveEpisode(beforeDelete),/changed|deleted/i);assert.equal(await getEpisode(old.id),undefined);
});
