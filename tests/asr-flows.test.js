import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engines.js';
const c=provider=>({provider,allowCloud:true,key:'test-secret',source:'en',diarization:true,timeoutSeconds:10});
test('mocked native ASR transports upload original audio, poll same origin and ignore provider result URLs',async()=>{
 const original=fetch;
 try {
  for(const provider of ['deepgram','assemblyai','gladia','speechmatics']) {
   const calls=[];
   globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),init});const path=new URL(url).pathname;
    if(provider==='deepgram')return Response.json({results:{utterances:[{start:0,end:1,transcript:'Hi',speaker:0}]}});
    if(provider==='assemblyai'){
     if(path.endsWith('/upload'))return Response.json({upload_url:'https://cdn.assemblyai.com/audio/test'});
     if(init.method==='POST')return Response.json({id:'safe-id'});
     return Response.json({status:'completed',utterances:[{start:0,end:1000,text:'Hi',speaker:'A'}]});
    }
    if(provider==='gladia'){
     if(path.endsWith('/upload'))return Response.json({audio_url:'https://api.gladia.io/audio/test'});
     if(init.method==='POST')return Response.json({id:'safe-id',result_url:'https://evil.example/steal'});
     return Response.json({status:'done',result:{transcription:{utterances:[{start:0,end:1,text:'Hi',speaker:0}]}}});
    }
    if(init.method==='POST')return Response.json({id:'safe-id'});
    if(path.endsWith('/transcript'))return Response.json({results:[{type:'word',start_time:0,end_time:1,alternatives:[{content:'Hi',speaker:'S1'}]}]});
    return Response.json({job:{status:'done'}});
   };
   const doc=await e.transcribe(new Blob(['original-file'],{type:'audio/mpeg'}),c(provider));
   assert.equal(doc.segments[0].text,'Hi');assert.equal(doc.segments[0].end,1);
   assert.ok(calls.every(r=>!r.url.includes('evil.example')&&r.init.redirect==='error'&&r.init.credentials==='omit'));
   if(provider==='speechmatics'){
    const cfg=JSON.parse(calls[0].init.body.get('config'));assert.equal(cfg.transcription_config.diarization,'speaker');assert.ok(calls[0].init.body.get('data_file'));
   }
  }
 }finally{globalThis.fetch=original;}
});
test('hosted ASR rejects unsafe job identifiers before credentialed poll',async()=>{
 const original=fetch;let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;return Response.json(calls===1?{audio_url:'https://api.gladia.io/audio/test'}:{id:'../steal'});};
 try{await assert.rejects(e.transcribe(new Blob(['audio']),c('gladia')),/job|identifier/i);assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('local engines require download consent before decoding or creating workers',async()=>{
 await assert.rejects(e.transcribe(new Blob(['audio']),{provider:'local'}),/download consent/i);
 await assert.rejects(e.translate({language:'en',segments:[{text:'Hello'}]},{provider:'local',target:'fr'}),/download consent/i);
});
