import test from 'node:test';import assert from 'node:assert/strict';
import {fetchMedia,createBackup,parseBackup,safePodcastURL,MAX_BACKUP_AUDIO_BYTES,backupEntryByteLimit} from '../src/library-services.js';
test('backup export total and import individual audio use the same 512 MiB budget',()=>{
 assert.equal(MAX_BACKUP_AUDIO_BYTES,512*1024*1024);assert.equal(backupEntryByteLimit('audio/0.bin'),MAX_BACKUP_AUDIO_BYTES);assert.ok(257*1024*1024<backupEntryByteLimit('audio/0.bin'));assert.equal(backupEntryByteLimit('../audio/0.bin'),0);assert.equal(backupEntryByteLimit('library.json'),50*1024*1024);
});
test('restoring a crafted backup never grants proxy or automatic network consent',async()=>{
 const file=new Blob([JSON.stringify({format:'podlingua',version:1,episodes:[],subscriptions:[],state:{settings:{proxy:'https://untrusted.example/?url={url}',allowProxy:true,autoDownload:true,refreshMinutes:1,defaultSpeed:1.5}}})]);
 const restored=await parseBackup(file);assert.equal(restored.state.settings.proxy,undefined);assert.equal(restored.state.settings.allowProxy,false);assert.equal(restored.state.settings.autoDownload,false);assert.equal(restored.state.settings.refreshMinutes,0);assert.equal(restored.state.settings.defaultSpeed,1.5);
});
test('media download is bounded, credential-free and never silently retries',async()=>{
 let count=0;const fetchFn=async(url,opts)=>{count++;assert.equal(opts.credentials,'omit');return new Response(new Uint8Array(16),{headers:{'Content-Type':'audio/mpeg'}});};
 const out=await fetchMedia('https://example.org/audio.mp3',{maxMB:1,fetchFn});assert.equal(out.size,16);assert.equal(out.type,'audio/mpeg');assert.equal(count,1);
 await assert.rejects(fetchMedia('https://example.org/audio.mp3',{maxMB:1,fetchFn:async()=>new Response('x',{headers:{'Content-Length':String(2*1024*1024)}})}),/limit|budget/i);
 for(const url of ['javascript:alert(1)','https://user:pass@example.org/a','http://example.org/a'])assert.throws(()=>safePodcastURL(url));
});
test('portable backups retain downloaded audio and transcript metadata without provider secrets',async()=>{
 const data={episodes:[{id:'e1',title:'Audio',revision:'old',audio:new Blob(['real audio'],{type:'audio/wav'}),audioUrl:'https://example.org/a',favorite:true,position:12,doc:{language:'en',segments:[{start:0,end:1,text:'Hello'}]},key:'not-a-real-key'}],subscriptions:[{id:'https://example.org/feed',url:'https://example.org/feed',title:'Show'}],state:{queue:['e1'],settings:{defaultSpeed:1.5,key:'not-a-real-key'},stats:{listeningSeconds:25}}};
 const backup=await createBackup(data,true),out=await parseBackup(backup);
 assert.equal(await out.episodes[0].audio.text(),'real audio');assert.equal(out.episodes[0].position,12);assert.equal(out.episodes[0].revision,undefined);assert.equal(out.episodes[0].key,undefined);assert.equal(out.state.settings.key,undefined);assert.equal(out.state.queue[0],'e1');
 const metadata=await parseBackup(await createBackup(data,false));assert.equal(metadata.episodes[0].audio,undefined);assert.equal(metadata.episodes[0].doc.segments[0].text,'Hello');
});
