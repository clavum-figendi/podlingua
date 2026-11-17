import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDocument, parseTranscript, exportTranscript, activeSegments, tokenize} from '../src/core.js';
test('imports Android milliseconds without losing overlaps, speakers, or real word timing',()=>{
 const doc=normalizeDocument({language:'de',provider:'vosk',segments:[{startMs:1000,endMs:4000,text:'Guten Tag!',speaker:'S1',words:[{startMs:1000,endMs:1500,text:'Guten'}]},{startMs:2000,endMs:3000,text:'Hallo',translation:'Hello'}]});
 assert.equal(doc.segments[0].start,1); assert.equal(doc.segments[0].end,4); assert.equal(doc.segments[0].words[0].end,1.5);assert.equal(doc.segments[0].speaker,'S1');assert.equal(doc.segments[1].translation,'Hello');assert.equal(doc.segments[1].start,2);
});
test('rejects malformed, nonfinite, negative and out-of-order timestamps',()=>{
 for(const segments of [[{start:-1,end:2}], [{start:0,end:NaN}], [{start:2,end:1}], [{start:2,end:3},{start:1,end:2}]]) assert.throws(()=>normalizeDocument({segments}));
});
test('reads SRT text and VTT voice cues without interpreting HTML',()=>{
 const srt=parseTranscript('1\n00:00:01,250 --> 00:00:03,000\nHello <script>alert(1)</script>\n\n2\n00:00:02,500 --> 00:00:04,000\nSecond','speech.srt');
 assert.equal(srt.segments[0].start,1.25);assert.match(srt.segments[0].text,/<script>/);
 const vtt=parseTranscript('WEBVTT\n\nNOTE attribution\nNot a cue\n\nintro\n00:01.000 --> 00:04.000 align:start\n<v Anna>Hello &amp; welcome</v>','x.vtt');
 assert.equal(vtt.segments[0].speaker,'Anna');assert.equal(vtt.segments[0].text,'Hello & welcome');
});
test('JSON round trips Android documents and preserves translation metadata',()=>{
 const doc=parseTranscript(JSON.stringify({language:'de',targetLanguage:'fr',translationProvider:'local',segments:[{startMs:0,endMs:1250,text:'Hallo',translation:'Bonjour'}]}),'x.json');
 assert.deepEqual(parseTranscript(exportTranscript(doc,'json'),'back.json'),doc);
 assert.match(exportTranscript(doc,'vtt'),/00:00:01.250/); assert.match(exportTranscript(doc,'srt'),/00:00:01,250/); assert.match(exportTranscript(doc,'txt'),/Bonjour/);
});
test('active segments preserve overlapping turns and ignore gaps',()=>{
 const doc=normalizeDocument({segments:[{start:0,end:10,text:'a'},{start:1,end:2,text:'b'},{start:4,end:5,text:'c'}]});
 assert.deepEqual(activeSegments(doc,1.5),[0,1]);assert.deepEqual(activeSegments(doc,3),[0]);assert.deepEqual(activeSegments(doc,10),[]);
});
test('Unicode word tokenization preserves whitespace and punctuation',()=>{
 for(const s of ['Hello, world!','你好，世界！','مرحبا بالعالم','l’été prochain']) {
 const words=tokenize(s,'auto');assert.equal(words.map(w=>w.text).join(''),s);assert.ok(words.some(w=>w.isWord));
 }
});
test('malformed subtitle cues fail explicitly, never receive fake times',()=>{
 assert.throws(()=>parseTranscript('Hello world','x.txt'));
 assert.throws(()=>parseTranscript('1\n00:00:04,000 --> 00:00:01,000\nBad','x.srt'));
 assert.throws(()=>parseTranscript('WEBVTT\n\n00:90.000 --> 00:92.000\nBad','x.vtt'));
});
test('model provenance survives validation and JSON export',()=>{
 const doc=normalizeDocument({model:'Xenova/whisper-tiny',translationModel:'Xenova/opus-mt-en-fr',language:'en',segments:[]});
 assert.equal(doc.model,'Xenova/whisper-tiny');assert.equal(JSON.parse(exportTranscript(doc)).translationModel,'Xenova/opus-mt-en-fr');
});
