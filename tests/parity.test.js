import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as parity from '../src/parity.js';
import * as catalog from '../src/catalog.js';
import * as storage from '../src/storage.js';

test('queue placement dedupes, locks manual changes but permits completion and keeps sorting',async()=>{
 assert.equal(typeof parity.reduceQueue,'function');
 const episodes=[{id:'a',title:'Zulu'},{id:'b',title:'Alpha'},{id:'c',title:'Beta'}];
 const state={queue:['a','b'],settings:{enqueuePosition:'after-current'}};
 assert.deepEqual(parity.reduceQueue(state,{type:'add',ids:['c','c'],currentId:'a'},episodes),['a','c','b']);
 assert.deepEqual(state.queue,['a','b']);
 assert.throws(()=>parity.reduceQueue({...state,settings:{queueLocked:true}},{type:'clear'},episodes),/locked/i);
 assert.deepEqual(parity.reduceQueue({...state,settings:{queueLocked:true}},{type:'complete',id:'a'},episodes),['b']);
 assert.deepEqual(parity.reduceQueue({...state,settings:{queueKeepSorted:true,queueSort:'title'}},{type:'add',ids:['c']},episodes),['b','c','a']);
 await catalog.mutateAppState(s=>{s.queue=[];s.settings={enqueuePosition:'back'};});
 await Promise.all(['a','b','c'].map(id=>parity.mutateQueue({type:'add',ids:[id]},episodes)));
 assert.deepEqual((await catalog.getAppState()).queue,['a','b','c']);
 assert.deepEqual(parity.shuffleQueue(['a','b','c'],()=>0),['b','c','a']);
 assert.deepEqual(parity.reduceQueue(state,{type:'add',ids:['c'],position:'random'},episodes,()=>1),['a','b','c']);
 assert.deepEqual(parity.reduceQueue(state,{type:'add',ids:['c'],position:'front'},episodes),['c','a','b']);
 assert.throws(()=>parity.reduceQueue({...state,settings:{queueKeepSorted:true}},{type:'shuffle'},episodes),/keep-sorted/);
 await parity.saveQueuePreferences({queueKeepSorted:true,queueSort:'title',enqueuePosition:'front'},episodes);
 const saved=await catalog.getAppState();assert.equal(saved.settings.queueKeepSorted,true);assert.equal(saved.settings.queueSort,'title');assert.equal(saved.settings.enqueuePosition,'front');assert.deepEqual(saved.queue,['b','c','a']);
});

test('title filters use OR quoted terms, case-insensitive exclusion wins; only genuinely fresh IDs enqueue',async()=>{
 assert.equal(typeof parity.matchesDownloadFilter,'function');
 assert.equal(parity.matchesDownloadFilter({title:'SCIENCE: deep dive'},{downloadInclude:'science "deep dive"'}),true);
 assert.equal(parity.matchesDownloadFilter({title:'science trailer'},{downloadInclude:'science',downloadExclude:'trailer'}),false);
 assert.equal(parity.matchesDownloadFilter({title:'history'},{downloadInclude:'science'}),false);
 assert.equal(parity.matchesDownloadFilter({title:'history'},{downloadExclude:'trailer'}),true);
 const feed={id:'https://example.org/parity',downloadInclude:'science "deep dive"',downloadExclude:'trailer',newEpisodeAction:'queue',password:'NO'};
 assert.equal((await catalog.saveSubscription(feed)).newEpisodeAction,'queue');
 assert.equal((await catalog.listSubscriptions()).find(f=>f.id===feed.id).downloadInclude,feed.downloadInclude);
 await catalog.mutateAppState(s=>{s.queue=['existing'];s.settings={queueLocked:true,enqueuePosition:'back'};});
 await parity.applyFreshEpisodePolicy(feed,[{id:'existing'},{id:'fresh',played:false},{id:'played',played:true}],['existing']);
 assert.deepEqual((await catalog.getAppState()).queue,['existing','fresh']);
 await parity.applyFreshEpisodePolicy({...feed,newEpisodeAction:'inbox'},[{id:'ignored'}],[]);
 assert.deepEqual((await catalog.getAppState()).queue,['existing','fresh']);
});

test('clear history and reset statistics are distinct CAS operations; reports use real data',async()=>{
 assert.equal(typeof parity.clearHistory,'function');
 const first=await storage.saveEpisode({id:'stat-one',title:'One',feedId:'https://example.org/parity',audio:new Blob(['abc']),duration:100,position:20,playedAt:55,played:true,listenedSeconds:12,bookmarks:[{time:5}]});
 await catalog.mutateAppState(s=>{s.stats={listeningSeconds:12,totalMediaSeconds:20,playedEpisodes:1,daily:[{day:'2026-01-01',seconds:12}]};});
 const report=parity.computeStatistics([first],await catalog.listSubscriptions(),await catalog.getAppState());
 assert.equal(report.savedBytes,3);assert.equal(report.recordedListeningSeconds,12);assert.equal(report.byShow.find(s=>s.id===first.feedId).listeningSeconds,12);
 await parity.clearHistory(storage);
 const cleared=await storage.getEpisode(first.id);assert.equal(cleared.position,0);assert.equal(cleared.playedAt,null);assert.equal(cleared.played,true);assert.equal(cleared.listenedSeconds,12);assert.deepEqual(cleared.bookmarks,[{time:5}]);
 await parity.resetStatistics(storage);
 assert.equal((await storage.getEpisode(first.id)).listenedSeconds,0);assert.equal((await storage.getEpisode(first.id)).played,true);
 assert.equal((await catalog.getAppState()).stats.listeningSeconds,0);
});

test('local multi-file imports validate media and use content IDs without storing folder paths',async()=>{
 assert.equal(typeof parity.importLocalFiles,'function');
 const audio=new File(['real audio bytes'],'episode.mp3',{type:'audio/mpeg'}),same=new File(['real audio bytes'],'renamed.mp3',{type:'audio/mpeg'}),bad=new File(['<script>bad</script>'],'bad.html',{type:'text/html'});
 const result=await parity.importLocalFiles([audio,same,bad],storage);
 assert.equal(result.imported.length,1);assert.equal(result.skipped.length,1);assert.equal(result.errors.length,1);
 const saved=await storage.getEpisode(result.imported[0]);assert.equal(saved.title,'episode');assert.equal(await saved.audio.text(),'real audio bytes');assert.equal(saved.audioUrl,undefined);assert.equal(saved.feedId,undefined);
 await storage.saveEpisode({...saved,favorite:true,position:9});
 const again=await parity.importLocalFiles([same],storage);assert.equal(again.skipped.length,1);assert.equal((await storage.getEpisode(saved.id)).favorite,true);assert.equal((await storage.getEpisode(saved.id)).position,9);
});
