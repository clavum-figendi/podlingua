import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
globalThis.DOMParser=DOMParser;
const api=await import('../src/podcasts.js');
const rss=`<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Example</title><description>&lt;b&gt;News&lt;/b&gt;</description><itunes:author>Ada</itunes:author><itunes:image href="/cover.jpg"/><item><guid>one</guid><title>First</title><description><![CDATA[<p>Hello</p><script>bad()</script>]]></description><enclosure url="/bad" type="image/jpeg"/><enclosure url="audio/one.mp3" type="audio/mpeg"/><pubDate>Tue, 01 Jan 2030 00:00:00 GMT</pubDate><itunes:duration>1:02:03</itunes:duration><podcast:transcript url="/one.vtt" type="text/vtt" language="en"/><podcast:chapters url="/chapters.json" type="application/json+chapters"/><itunes:season>2</itunes:season></item></channel></rss>`;
test('RSS extracts safe metadata, chooses playable enclosure and stable identifiers',()=>{
 const f=api.parseFeed(rss,'https://example.org/feed/rss'); assert.equal(f.title,'Example');assert.equal(f.description,'News');assert.equal(f.author,'Ada');assert.equal(f.image,'https://example.org/cover.jpg');
 const e=f.episodes[0];assert.equal(e.audioUrl,'https://example.org/feed/audio/one.mp3');assert.equal(e.duration,3723);assert.equal(e.description,'Hello');assert.equal(e.transcripts[0].url,'https://example.org/one.vtt');assert.equal(e.season,2);assert.ok(e.id.length<=128);assert.equal(e.id,api.parseFeed(rss,'https://example.org/feed/rss').episodes[0].id);
});
test('Atom resolves xml:base and author',()=>{
 const f=api.parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.org/p/"><title>Atom</title><author><name>Grace</name></author><entry><id>tag:1</id><title>Entry</title><link rel="enclosure" href="one.mp3" type="audio/mpeg"/><link href="page"/></entry></feed>`,'https://example.org/rss');
 assert.equal(f.author,'Grace');assert.equal(f.episodes[0].audioUrl,'https://example.org/p/one.mp3');assert.equal(f.episodes[0].website,'https://example.org/p/page');
});
test('XML rejects declarations, unsafe URLs and excessive size',()=>{
 for(const x of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>','x'.repeat(9*1024*1024),'<broken>'])assert.throws(()=>api.parseFeed(x,'https://example.org/f'));
 for(const u of ['javascript:alert(1)','http://example.org/f','https://user:secret@example.org/f'])assert.throws(()=>api.parseFeed(rss,u));
});
test('larger mainstream feeds fit the bounded 32 MiB parser budget',()=>{
 const xml='<rss><channel><title>Large</title>'+('<!--'+'x'.repeat(1000)+'-->').repeat(10000)+'</channel></rss>';
 assert.equal(api.parseFeed(xml,'https://example.org/large').title,'Large');
 assert.throws(()=>api.parseFeed('x'.repeat(33*1024*1024),'https://example.org/oversize'),/limit/i);
});
test('OPML roundtrips escaped titles, tags and nested groups',()=>{
 const rows=api.parseOPML(`<opml><body><outline text="Science"><outline text="A &amp; B" xmlUrl="https://example.org/rss?a=1&amp;b=2"/></outline></body></opml>`);
 assert.deepEqual(rows,[{url:'https://example.org/rss?a=1&b=2',title:'A & B',tags:['Science']}]);assert.deepEqual(api.parseOPML(api.exportOPML(rows)),rows);
});
test('chapters validate chronology and safe optional URLs',()=>{
 assert.deepEqual(api.parseChapters({chapters:[{startTime:0,title:'Start',url:'javascript:x'},{startTime:3,title:'Next'}]}),[{start:0,title:'Start'},{start:3,title:'Next'}]);
 assert.throws(()=>api.parseChapters({chapters:[{startTime:3},{startTime:1}]}));
});
test('transport omits credentials, bounds responses and hides private URL errors',async()=>{
 let options;const f=await api.fetchFeed('https://example.org/f?token=PRIVATE',{fetchFn:async(u,o)=>{options=o;return new Response(rss);}});assert.equal(f.title,'Example');assert.equal(options.credentials,'omit');
 await assert.rejects(api.fetchFeed('https://example.org/f?token=PRIVATE',{fetchFn:async()=>{throw new Error('PRIVATE');}}),e=>/CORS/.test(e.message)&&!e.message.includes('PRIVATE'));
 await assert.rejects(api.fetchResource('https://example.org/f',{maxBytes:4,fetchFn:async()=>new Response('too long')}),/limit/);
});
test('proxy requires explicit permission and never silently retries',async()=>{
 let called=0;await assert.rejects(api.fetchFeed('https://example.org/f',{proxy:'https://proxy.example/?url={url}',fetchFn:async()=>{called++;return new Response(rss);}}),/permission/i);assert.equal(called,0);
 const f=await api.fetchFeed('https://example.org/f',{proxy:'https://proxy.example/?url={url}',allowProxy:true,fetchFn:async u=>{assert.equal(u,'https://proxy.example/?url=https%3A%2F%2Fexample.org%2Ff');called++;return new Response(rss);}});assert.equal(f.id,'https://example.org/f');assert.equal(called,1);
});
test('iTunes search safely resolves missing feed URLs through lookup',async()=>{
 const seen=[];const results=await api.searchPodcasts('real query',{country:'fr',fetchFn:async u=>{seen.push(u);return Response.json({results:u.includes('/lookup?')?[{collectionName:'Show',artistName:'Ada',feedUrl:'https://example.org/rss'}]:[{collectionId:123}]});}});
 assert.equal(results[0].url,'https://example.org/rss');assert.equal(results[0].title,'Show');assert.equal(seen.length,2);assert.ok(seen[0].includes('country=FR'));
});
test('top list resolves Apple identifiers instead of inventing feed URLs',async()=>{
 const rows=await api.discoverPodcasts('gb',{fetchFn:async u=>u.includes('/lookup?')?Response.json({results:[{feedUrl:'https://example.org/top',collectionName:'Top'}]}):Response.json({feed:{entry:[{id:{attributes:{'im:id':'123'}},'im:name':{label:'Top'}}]}})});assert.equal(rows[0].url,'https://example.org/top');
});
test('legacy namespace aliases and double encoded descriptions remain plain text',()=>{
 const xml=rss.replaceAll('http://www.itunes.com/dtds/podcast-1.0.dtd','http://www.itunes.com/DTDs/Podcast-1.0.dtd').replaceAll('https://podcastindex.org/namespace/1.0','https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md').replace('Hello','&lt;img src=x onerror=alert(1)&gt;');const f=api.parseFeed(xml,'https://example.org/f');assert.equal(f.author,'Ada');assert.equal(f.episodes[0].transcripts.length,1);assert.ok(!f.episodes[0].description.includes('<'));
});
