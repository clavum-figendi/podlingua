import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {DOMParser} from '@xmldom/xmldom';
globalThis.DOMParser=DOMParser;
const catalog=await import('../src/catalog.js');
const storage=await import('../src/storage.js');
test('pending refresh cannot resurrect an unsubscribed feed or removed episodes after resubscription',async()=>{
 const url='https://example.org/pending',xml=title=>`<rss><channel><title>${title}</title><item><guid>one</guid><title>${title}</title><enclosure url="https://example.org/pending.mp3" type="audio/mpeg"/></item></channel></rss>`;
 await catalog.subscribe(url,{fetchFn:async()=>new Response(xml('Initial'))});let release,started;const waiting=new Promise(resolve=>started=resolve),pending=catalog.refreshSubscription(url,{fetchFn:()=>{started();return new Promise(resolve=>release=()=>resolve(new Response(xml('Stale'))));}});await waiting;
 await catalog.unsubscribe(url,{removeEpisodes:true});await catalog.subscribe(url,{fetchFn:async()=>new Response(xml('New subscription'))});release();await assert.rejects(pending,/subscription.*changed|unsubscribed/i);
 assert.equal((await catalog.listSubscriptions()).find(x=>x.id===url).title,'New subscription');assert.deepEqual((await storage.listEpisodes()).filter(x=>x.feedId===url).map(e=>e.title),['New subscription']);await catalog.unsubscribe(url,{removeEpisodes:true});
});
test('subscribe and refresh deduplicate metadata while preserving audio, documents and user state',async()=>{
 const url='https://example.org/merge',xml=title=>`<rss><channel><title>Podcast</title><item><guid>same</guid><title>${title}</title><enclosure type="audio/mpeg" url="https://example.org/one.mp3"/></item></channel></rss>`;
 const feed=await catalog.subscribe(url,{fetchFn:async()=>new Response(xml('Old'))});let e=await storage.getEpisode(feed.episodes[0].id);e=await storage.saveEpisode({...e,audio:new Blob(['audio']),doc:{segments:[]},favorite:true,position:12});
 await catalog.saveSubscription({id:url,titleOverride:'Custom',speed:1.7});await catalog.refreshSubscription(url,{fetchFn:async()=>new Response(xml('New'))});
 const rows=(await storage.listEpisodes()).filter(x=>x.feedId===url);assert.equal(rows.length,1);assert.equal(rows[0].title,'New');assert.equal(await rows[0].audio.text(),'audio');assert.deepEqual(rows[0].doc,{segments:[]});assert.equal(rows[0].favorite,true);assert.equal(rows[0].position,12);assert.equal((await catalog.listSubscriptions()).find(x=>x.id===url).speed,1.7);
 await catalog.unsubscribe(url);assert.ok(await storage.getEpisode(e.id));await catalog.subscribe(url,{fetchFn:async()=>new Response(xml('New').replace('</channel>','<item><guid>new-guid</guid><title>Duplicate enclosure</title><enclosure type="audio/mpeg" url="https://example.org/one.mp3"/></item></channel>'))});assert.equal((await storage.listEpisodes()).filter(x=>x.feedId===url).length,1);await catalog.unsubscribe(url,{removeEpisodes:true});assert.equal(await storage.getEpisode(e.id),undefined);
});
test('new subscriptions deduplicate episodes sharing an enclosure',async()=>{
 const feed=await catalog.subscribe('https://example.org/duplicates',{fetchFn:async()=>new Response('<rss><channel><title>Duplicates</title><item><guid>a</guid><enclosure type="audio/mpeg" url="https://example.org/shared.mp3"/></item><item><guid>b</guid><enclosure type="audio/mpeg" url="https://example.org/shared.mp3"/></item></channel></rss>')});assert.equal((await storage.listEpisodes()).filter(x=>x.feedId===feed.id).length,1);assert.equal(feed.episodes.length,1);await catalog.unsubscribe(feed.id,{removeEpisodes:true});
});
test('state patches merge atomically and never persist nested credentials',async()=>{
 await catalog.setAppState({queue:['one','one','two'],settings:{defaultSpeed:1.25,country:'FR',apiKey:'NO',nested:{password:'NO'},proxy:'https://user:password@example.org/{url}'},token:'NO'});
 await Promise.all([catalog.setAppState({lastEpisodeId:'one'}),catalog.setAppState({downloadLog:[{episodeId:'one',status:'done',password:'NO'}]})]);
 const state=await catalog.getAppState();assert.deepEqual(state.queue,['one','two']);assert.equal(state.lastEpisodeId,'one');assert.equal(state.settings.defaultSpeed,1.25);assert.equal(state.settings.country,'FR');assert.equal(state.settings.apiKey,undefined);assert.equal(state.settings.nested,undefined);assert.equal(state.settings.proxy,undefined);assert.equal(state.downloadLog[0].password,undefined);
 await Promise.all(Array.from({length:10},()=>catalog.mutateAppState(s=>({...s,stats:{...s.stats,listeningSeconds:(s.stats.listeningSeconds||0)+1}}))));assert.equal((await catalog.getAppState()).stats.listeningSeconds,10);
});
test('subscriptions persist safe preferences, merge edits and delete',async()=>{
 const saved=await catalog.saveSubscription({id:'https://example.org/f',url:'https://example.org/f',title:'Show',tags:['science'],speed:1.5,password:'NO',apiKey:'NO'});assert.equal(saved.speed,1.5);assert.equal(saved.password,undefined);
 await catalog.saveSubscription({id:saved.id,titleOverride:'My show'});const list=await catalog.listSubscriptions();assert.equal(list[0].title,'Show');assert.equal(list[0].titleOverride,'My show');await catalog.deleteSubscription(saved.id);assert.equal((await catalog.listSubscriptions()).length,0);
});
