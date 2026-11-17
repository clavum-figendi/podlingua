import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {listEpisodes,saveEpisode,getEpisode,deleteEpisode,clearEpisodes} from '../src/storage.js';
test('IndexedDB stores audio and transcript atomically and supports library deletion',async()=>{
 const item={id:'test-1',title:'Episode',createdAt:123,audio:new Blob(['audio'],{type:'audio/wav'}),doc:{language:'en',segments:[{start:0,end:1,text:'Hello'}]}};
 await saveEpisode(item); const saved=await getEpisode(item.id);assert.equal(saved.title,item.title);assert.equal(await saved.audio.text(),'audio');assert.deepEqual(saved.doc,item.doc);
 assert.equal((await listEpisodes()).length,1);await deleteEpisode(item.id);assert.equal(await getEpisode(item.id),undefined);await clearEpisodes();
});
test('library schema excludes settings, consent and session keys',async()=>{
 await saveEpisode({id:'secrets-test',title:'Safe',createdAt:1,key:'test-only-not-a-real-key',settings:{key:'hidden'},allowCloud:true});
 const saved=await getEpisode('secrets-test');assert.equal(saved.key,undefined);assert.equal(saved.settings,undefined);assert.equal(saved.allowCloud,undefined);await deleteEpisode('secrets-test');
});
test('podcast metadata and listening state survive a transcript-only update',async()=>{
 const initial=await saveEpisode({id:'podcast-state',title:'Episode',audioUrl:'https://example.org/audio.mp3',feedId:'https://example.org/feed',position:42,favorite:true,played:false,bookmarks:[{id:'one',position:12,label:'Quote'}],transcripts:[{url:'https://example.org/t.vtt',type:'text/vtt'}]});
 await saveEpisode({...initial,doc:{language:'en',segments:[]}});const out=await getEpisode(initial.id);
 assert.equal(out.position,42);assert.equal(out.favorite,true);assert.equal(out.audioUrl,initial.audioUrl);assert.deepEqual(out.bookmarks,initial.bookmarks);await deleteEpisode(initial.id);
});
