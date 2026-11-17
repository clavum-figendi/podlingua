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
test('MediaRSS and Dublin Core supply safe fallback metadata without overriding canonical fields',()=>{
 const xml=`<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel xml:base="https://example.org/p/"><title>Show</title><dc:creator>Ada</dc:creator><dc:description>About</dc:description><media:thumbnail url="cover.jpg"/><item><guid>fallback</guid><media:group><media:title>Media title</media:title><media:description>&lt;b&gt;Summary&lt;/b&gt;</media:description><media:content url="image.jpg" type="image/jpeg"/><media:content url="audio.mp3" medium="audio" duration="12.5"/></media:group><dc:date>2020-01-02T00:00:00Z</dc:date><dc:creator>Guest</dc:creator></item><item><guid>canonical</guid><title>Canonical</title><description>Original</description><enclosure url="original.mp3" type="audio/mpeg"/><media:content url="other.mp3" type="audio/mpeg"/><media:description>Fallback</media:description><media:thumbnail url="javascript:bad"/></item></channel></rss>`;
 const f=api.parseFeed(xml,'https://example.org/f');assert.equal(f.author,'Ada');assert.equal(f.description,'About');assert.equal(f.image,'https://example.org/p/cover.jpg');
 const e=f.episodes[0];assert.equal(e.title,'Media title');assert.equal(e.description,'Summary');assert.equal(e.audioUrl,'https://example.org/p/audio.mp3');assert.equal(e.image,'https://example.org/p/image.jpg');assert.equal(e.duration,12.5);assert.equal(e.published,Date.parse('2020-01-02'));assert.equal(e.author,'Guest');
 assert.equal(f.episodes[1].title,'Canonical');assert.equal(f.episodes[1].description,'Original');assert.equal(f.episodes[1].audioUrl,'https://example.org/p/original.mp3');
});
test('Podcasting2 links and relocation/pagination are safe metadata only and preserve IDs',()=>{
 const extra=`<podcast:funding url="/support">&lt;b&gt;Donate&lt;/b&gt;</podcast:funding><podcast:funding url="http://unsafe.example/x">Bad</podcast:funding><itunes:new-feed-url>/new-feed</itunes:new-feed-url><atom:link xmlns:atom="http://www.w3.org/2005/Atom" rel="next" href="/page2"/>`;
 const xml=rss.replace('<title>Example</title>','<title>Example</title>'+extra).replace('<guid>one</guid>','<guid>one</guid><podcast:socialInteract uri="https://social.example/post#thread" protocol="activitypub" accountId="@ada" priority="2"/><podcast:socialInteract uri="javascript:bad"/>');
 const f=api.parseFeed(xml,'https://example.org/feed/rss');assert.deepEqual(f.funding,[{url:'https://example.org/support',title:'Donate'}]);assert.equal(f.newFeedUrl,'https://example.org/new-feed');assert.equal(f.nextPageUrl,'https://example.org/page2');assert.equal(f.url,'https://example.org/feed/rss');assert.equal(f.episodes[0].id,api.parseFeed(rss,f.url).episodes[0].id);assert.deepEqual(f.episodes[0].socialLinks,[{url:'https://social.example/post',protocol:'activitypub',accountId:'@ada',priority:2}]);
 const atom=api.parseFeed('<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.org/p/"><link rel="next" href="next"/></feed>',f.url);assert.equal(atom.nextPageUrl,'https://example.org/p/next');
 const bad=api.parseFeed(xml.replace('/new-feed','https://u:p@bad.example/f').replace('/page2','http://unsafe.example/p'),'https://example.org/f');assert.equal(bad.newFeedUrl,'');assert.equal(bad.nextPageUrl,'');
});
test('namespace fallback cannot override canonical metadata or double-resolve relative xml:base',()=>{
 const f=api.parseFeed('<rss xmlns:m="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel xml:base="sub/"><m:title>Fallback</m:title><title>Canonical</title><item><guid>one</guid><m:title>Fallback</m:title><title>Canonical</title><m:description>Fallback</m:description><description>Canonical</description><enclosure url="audio.mp3" type="audio/mpeg"/></item></channel></rss>','https://example.org/feed');
 assert.equal(f.title,'Canonical');assert.equal(f.episodes[0].title,'Canonical');assert.equal(f.episodes[0].description,'Canonical');assert.equal(f.episodes[0].audioUrl,'https://example.org/sub/audio.mp3');
});
test('JSON chapters preserve explicit fractional end times without inferring replacements',()=>{
 assert.deepEqual(api.parseChapters({chapters:[{startTime:1.25,endTime:2.75,title:'One'},{start:8,end:9.5,title:'Two'}]}),[{start:1.25,end:2.75,title:'One'},{start:8,end:9.5,title:'Two'}]);
 for(const end of [NaN,Infinity,-1,0,'3'])assert.throws(()=>api.parseChapters({chapters:[{start:1,end}]}));
});
test('legacy namespace aliases and double encoded descriptions remain plain text',()=>{
 const xml=rss.replaceAll('http://www.itunes.com/dtds/podcast-1.0.dtd','http://www.itunes.com/DTDs/Podcast-1.0.dtd').replaceAll('https://podcastindex.org/namespace/1.0','https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md').replace('Hello','&lt;img src=x onerror=alert(1)&gt;');const f=api.parseFeed(xml,'https://example.org/f');assert.equal(f.author,'Ada');assert.equal(f.episodes[0].transcripts.length,1);assert.ok(!f.episodes[0].description.includes('<'));
});
