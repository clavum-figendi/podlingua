import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engines.js';
const cfg = provider => ({provider,allowCloud:true,key:'test-secret',source:'en',target:'de'});
function fakeAudio() {
  const original=globalThis.AudioContext;
  globalThis.AudioContext=class {async decodeAudioData(){return {sampleRate:16000,numberOfChannels:1,length:16000*31,getChannelData:()=>new Float32Array(16000*31)};} async close(){}};
  return ()=>{globalThis.AudioContext=original;};
}
test('mocked hosted Whisper uploads bounded WAV chunks with exact offsets and security flags',async()=>{
  const restore=fakeAudio(), original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url,init});return Response.json({language:'english',segments:[{start:0,end:1,text:'Hi'}]});};
  try {
    const out=await e.transcribe(new Blob(['audio']),cfg('openai'));
    assert.deepEqual(out.segments.map(s=>s.start),[0,30]);
    assert.equal(out.language,'en');
    for(const {url,init} of calls){assert.match(url,/\/audio\/transcriptions$/);assert.equal(init.body.get('response_format'),'verbose_json');assert.equal(init.body.get('model'),'whisper-1');assert.equal(init.body.get('file').type,'audio/wav');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');}
    assert.equal(calls.length,2);
  } finally {restore();globalThis.fetch=original;}
});
test('translation builders use real native schemas and header authentication',()=>{
  const cases={deepl:['text','translations'],google:['q','data'],microsoft:[null,null],libretranslate:['q',null],gemini:['contents',null],anthropic:['messages',null],openai:['messages',null]};
  for(const [id,[field]] of Object.entries(cases)) {
    const r=e.buildTranslationRequest(cfg(id),['Hello']);
    assert.equal(r.method,'POST');
    if(field) assert.ok(JSON.parse(r.body)[field]);
    assert.ok(!r.url.includes('test-secret'));
  }
  const r=e.buildTranslationRequest({...cfg('microsoft'),region:'westeurope'},['Hello']);
  assert.equal(r.headers['Ocp-Apim-Subscription-Region'],'westeurope');
});
test('translation parsers preserve exact batch cardinality',()=>{
  const responses={deepl:{translations:[{text:'Hallo'}]},google:{data:{translations:[{translatedText:'Hallo'}]}},microsoft:[{translations:[{text:'Hallo'}]}],libretranslate:{translatedText:['Hallo']},mymemory:{responseStatus:200,responseData:{translatedText:'Hallo'}},openai:{choices:[{message:{content:'["Hallo"]'}}]},gemini:{candidates:[{content:{parts:[{text:'["Hallo"]'}]}}]},anthropic:{content:[{type:'text',text:'["Hallo"]'}]}};
  for(const [id,data] of Object.entries(responses)) {
    assert.deepEqual(e.parseTranslation(id,data,1),['Hallo']);
    assert.throws(()=>e.parseTranslation(id,data,2), /translation|count|batch/i);
  }
});
test('diarized parsers preserve service measured timing, units and punctuation',()=>{
  assert.deepEqual(e.parseASR('deepgram',{results:{utterances:[{start:0.1,end:1,transcript:'Hi!',speaker:0,words:[{start:0.1,end:1,punctuated_word:'Hi!',speaker:0}]}]}}),[{start:0.1,end:1,text:'Hi!',speaker:'0',words:[{start:0.1,end:1,text:'Hi!'}]}]);
  assert.deepEqual(e.parseASR('assemblyai',{utterances:[{start:100,end:1000,text:'Hi!',speaker:'A',words:[{start:100,end:1000,text:'Hi!'}]}]})[0].start,0.1);
  assert.equal(e.parseASR('gladia',{result:{transcription:{utterances:[{start:0,end:1,text:'Hi!',speaker:2,words:[{start:0,end:1,word:'Hi!'}]}]}}})[0].speaker,'2');
  assert.deepEqual(e.parseASR('speechmatics',{results:[{type:'word',start_time:0.1,end_time:0.8,alternatives:[{content:'Hello',speaker:'S1'}]},{type:'punctuation',start_time:0.8,end_time:0.8,alternatives:[{content:'.'}]}]})[0],{start:0.1,end:0.8,text:'Hello.',speaker:'S1',words:[{start:0.1,end:0.8,text:'Hello.'}]});
});
test('Deepgram uses punctuated words and Speechmatics unknown speakers stay unknown',()=>{
 const dg=e.parseASR('deepgram',{results:{utterances:[{start:0,end:1,transcript:'Hello!',words:[{start:0,end:1,word:'hello',punctuated_word:'Hello!'}]}]}});
 assert.equal(dg[0].words[0].text,'Hello!');
 const sm=e.parseASR('speechmatics',{results:[{type:'word',start_time:0,end_time:1,alternatives:[{content:'Hello',speaker:'UU'}]}]});assert.equal(sm[0].speaker,undefined);
});
test('Speechmatics groups words into speaker turns for context-preserving translation',()=>{
 const word=(content,start,speaker)=>({type:'word',start_time:start,end_time:start+.4,alternatives:[{content,speaker}]});
 const out=e.parseASR('speechmatics',{results:[word('Hello',0,'S1'),word('world',.5,'S1'),{type:'punctuation',is_eos:true,alternatives:[{content:'.',attaches_to:'previous'}]},word('Welcome',1,'S1'),word('Yes',2,'S2')]});
 assert.deepEqual(out.map(s=>[s.text,s.speaker,s.words.length]),[['Hello world.','S1',2],['Welcome','S1',1],['Yes','S2',1]]);
});
test('mocked transport: translation preserves transcript and never retries or follows redirects',async()=>{
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({choices:[{message:{content:'["Hallo"]'}}]}));};
  try {
    const doc={language:'en',provider:'import',segments:[{start:1,end:2,text:'Hello',speaker:'A',words:[{start:1,end:2,text:'Hello'}]}]};
    const out=await e.translate(doc,cfg('openai'));
    assert.equal(out.segments[0].translation,'Hallo');assert.equal(out.targetLanguage,'de');assert.deepEqual(doc.segments[0].translation,undefined);assert.deepEqual(out.segments[0].words,doc.segments[0].words);
    assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.credentials,'omit');
    globalThis.fetch=async()=>{calls.push({});return new Response('bad',{status:429});};
    await assert.rejects(e.lookup('Hello','en','de',cfg('openai')),/429/);assert.equal(calls.length,2);
  } finally {globalThis.fetch=original;}
});
