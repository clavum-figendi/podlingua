// Browser-only podcast transport and parsers. No remote scripts or shared proxy.
import {authenticatedFetch} from './connections.js';
const MAX_XML=32*1024*1024, MAX_ENTRIES=20000;
export async function fetchResource(url,{signal,proxy='',allowProxy=false,timeoutSeconds=30,fetchFn=authenticatedFetch,maxBytes=MAX_XML}={}) {
 url=requiredUrl(url);let target=url;
 if(proxy){if(!allowProxy)throw new Error('Custom proxy requires explicit permission: it can read your feed URL.');if(!proxy.includes('{url}'))throw new Error('Proxy template must contain {url}.');target=requiredUrl(proxy.replaceAll('{url}',encodeURIComponent(url)));}
 if(!Number.isFinite(maxBytes)||maxBytes<1||maxBytes>512*1024*1024)throw new Error('Invalid response size limit.');
 const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(abort,Math.max(1,Math.min(300,Number(timeoutSeconds)||30))*1000);let reader;
 try {
 const response=await fetchFn(target,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',mode:'cors',redirect:'follow'});
 if(response.url&&!safeUrl(response.url))throw new Error('The server redirected to an unsafe URL.');
 if(!response.ok)throw new Error(`Podcast request failed (HTTP ${Number(response.status)||0}).`);
 if(Number(response.headers?.get('content-length'))>maxBytes)throw new Error('Response exceeds the size limit.');
 const chunks=[];let length=0;
 if(response.body?.getReader){reader=response.body.getReader();for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes)throw new Error('Response exceeds the size limit.');chunks.push(value);}}
 else {const data=new Uint8Array(await response.arrayBuffer());length=data.byteLength;if(length>maxBytes)throw new Error('Response exceeds the size limit.');chunks.push(data);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return new Response(bytes,{status:200,headers:{'content-type':response.headers?.get('content-type')||'application/octet-stream'}});
 }catch(e){if(controller.signal.aborted)throw new Error(signal?.aborted?'Request cancelled.':'Podcast request timed out.');
 if(/^(Response exceeds|Podcast request failed|The server redirected)/.test(e.message))throw e;
 throw new Error('Network or CORS blocked this request. Try a CORS-enabled HTTPS feed, import a local file, or explicitly enable your own trusted proxy.');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{await reader?.cancel();}catch{/* ignored cleanup */}}
}
export async function fetchFeed(url,options={}) {const xml=await (await fetchResource(url,options)).text();return parseFeed(xml,url);}
function countryCode(country='US') {if(!/^[a-z]{2}$/i.test(country))throw new Error('Use a two-letter country code.');return country.toUpperCase();}
async function directoryJSON(url,options) {try{return await (await fetchResource(url,{...options,maxBytes:MAX_XML})).json();}catch(e){if(e instanceof SyntaxError)throw new Error('Invalid podcast directory response.');throw e;}}
async function directoryRows(rows,options) {
 const out=new Map();for(let row of rows.slice(0,100)){if(!safeUrl(row.feedUrl)&&/^\d{1,20}$/.test(String(row.collectionId||row.trackId||''))){const lookup=await directoryJSON('https://itunes.apple.com/lookup?id='+encodeURIComponent(row.collectionId||row.trackId),options);row={...row,...lookup.results?.[0]};}
 const url=safeUrl(row.feedUrl);if(url)out.set(url,{title:plain(row.collectionName||row.trackName),author:plain(row.artistName),image:safeUrl(row.artworkUrl600||row.artworkUrl100),url,id:url});}return [...out.values()];
}
export async function searchPodcasts(query,options={}) {
 if(typeof query!=='string'||!query.trim())return [];if(query.length>500)throw new Error('Search query is too long.');const url=new URL('https://itunes.apple.com/search');url.search=new URLSearchParams({media:'podcast',entity:'podcast',term:query.trim(),country:countryCode(options.country),limit:'50'}).toString();
 const data=await directoryJSON(url.href,options);if(!Array.isArray(data.results))throw new Error('Invalid podcast directory response.');return directoryRows(data.results,options);
}
export async function discoverPodcasts(country='US',options={}) {
 const data=await directoryJSON(`https://itunes.apple.com/${countryCode(country)}/rss/toppodcasts/limit=25/explicit=true/json`,options);
 if(!data.feed)throw new Error('Invalid podcast directory response.');const entries=data.feed.entry||[];
 return directoryRows((Array.isArray(entries)?entries:[entries]).map(e=>({collectionId:e.id?.attributes?.['im:id'],collectionName:e['im:name']?.label,artistName:e['im:artist']?.label,artworkUrl100:e['im:image']?.at(-1)?.label})),options);
}
const ITUNES='http://www.itunes.com/dtds/podcast-1.0.dtd';
const PODCAST='https://podcastindex.org/namespace/1.0';
const MEDIA='http://search.yahoo.com/mrss/', DC='http://purl.org/dc/elements/1.1/';
// Only inspect MediaRSS's defined grouping levels, never arbitrary descendants/items.
const mediaNodes=(n,name)=>[...named(n,name,MEDIA),...named(n,'group',MEDIA).flatMap(g=>named(g,name,MEDIA))];
const mediaValue=(n,name)=>plain(text(mediaNodes(n,name)[0]));
const mediaScore=n=>/^audio\//i.test(n.getAttribute('type')||'')||n.getAttribute('medium')==='audio'?3:/^video\//i.test(n.getAttribute('type')||'')||n.getAttribute('medium')==='video'?2:0;
function mediaImage(n,base){for(const t of [...mediaNodes(n,'thumbnail'),...mediaNodes(n,'content').filter(c=>/^image\//i.test(c.getAttribute('type')||'')||c.getAttribute('medium')==='image')]){const u=attrUrl(t,'url',base);if(u)return u;}return '';}
export function safeUrl(value,base) {
 try { const u=new URL(value,base); if(!value || u.username || u.password || !(u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) return ''; u.hash=''; return u.href; } catch { return ''; }
}
function requiredUrl(value) { const url=safeUrl(value); if(!url) throw new Error('Use a valid HTTPS URL without embedded credentials.'); return url; }
const children=n=>Array.from(n?.childNodes||[]).filter(x=>x.nodeType===1);
const namespace=n=>n==='http://www.itunes.com/DTDs/Podcast-1.0.dtd'?ITUNES:n==='https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md'?PODCAST:n;
const named=(n,name,ns)=>children(n).filter(x=>(x.localName||x.nodeName.split(':').pop())===name && (ns===undefined ? ['', 'http://www.w3.org/2005/Atom', 'http://purl.org/rss/1.0/'].includes(x.namespaceURI||'') : namespace(x.namespaceURI)===ns));
const first=(n,name,ns)=>named(n,name,ns)[0];
const text=n=>n?.textContent?.trim()||'';
function plain(value) { return String(value||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/<[^>]*>/g,' ').replace(/[<>]/g,'').replace(/\s+/g,' ').trim().slice(0,100000); }
const value=(n,name,ns)=>plain(text(first(n,name,ns)));
function xmlDocument(xml) {
 if(typeof xml!=='string'||new TextEncoder().encode(xml).length>MAX_XML) throw new Error('XML exceeds the 32 MiB limit.');
 if(/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DTD and entity declarations are not allowed.');
 if(!globalThis.DOMParser) throw new Error('XML parsing is unavailable in this browser.');
 let doc;try {doc=new DOMParser({onError:()=>{throw new Error('Invalid XML document.');}}).parseFromString(xml,'application/xml');}catch {throw new Error('Invalid XML document.');}
 if(!doc?.documentElement || doc.getElementsByTagName('parsererror').length) throw new Error('Invalid XML document.');
 if(doc.getElementsByTagName('*').length>150000) throw new Error('XML has too many elements.'); return doc;
}
function baseOf(n,fallback) { const lineage=[];for(let p=n;p?.nodeType===1;p=p.parentNode) lineage.unshift(p);let base=fallback;for(const p of lineage) {const b=p.getAttribute('xml:base');if(b) base=safeUrl(b,base)||base;}return base; }
const attrUrl=(n,key,base)=>safeUrl(n?.getAttribute(key),baseOf(n,base));
function image(n,base) { const i=first(n,'image',ITUNES); if(i) return attrUrl(i,'href',base);return safeUrl(text(first(first(n,'image'),'url'))||value(n,'logo')||value(n,'icon'),baseOf(n,base))||mediaImage(n,base); }
function duration(s) {if(!s)return 0;const parts=s.split(':').map(Number);if(parts.length>3||parts.some(x=>!Number.isFinite(x)||x<0))return 0;return parts.reduce((a,x)=>a*60+x,0);}
const explicit=s=>/^(yes|true|explicit|1)$/i.test(s);
function stableId(input) { // Two independent 64-bit FNV hashes; no private feed URL in episode IDs.
 let a=14695981039346656037n,b=7809847782465536322n;for(const c of new TextEncoder().encode(input)){a=BigInt.asUintN(64,(a^BigInt(c))*1099511628211n);b=BigInt.asUintN(64,(b^BigInt(c))*1099511628211n);}return 'pod-'+a.toString(16).padStart(16,'0')+b.toString(16).padStart(16,'0');
}
export function parseFeed(xml,url) {
 url=requiredUrl(url);const root=xmlDocument(xml).documentElement,atom=root.localName==='feed';const channel=atom?root:first(root,'channel');
 if(!channel)throw new Error('Expected an RSS or Atom podcast feed.');
 const linkOf=n=>atom?attrUrl(named(n,'link').find(x=>!x.getAttribute('rel')||x.getAttribute('rel')==='alternate'),'href',url):safeUrl(value(n,'link'),baseOf(n,url));
 const feed={id:url,url,title:value(channel,'title'),description:value(channel,atom?'subtitle':'description')||mediaValue(channel,'description')||value(channel,'description',DC),author:value(channel,'author',ITUNES)||value(first(channel,'author'),'name')||value(channel,'managingEditor')||value(channel,'creator',DC),image:image(channel,url),link:linkOf(channel),language:value(channel,'language')||channel.getAttribute('xml:lang')||'',explicit:explicit(value(channel,'explicit',ITUNES)),funding:named(channel,'funding',PODCAST).slice(0,100).map(n=>({url:attrUrl(n,'url',url),title:plain(text(n))})).filter(n=>n.url),newFeedUrl:safeUrl(text(first(channel,'new-feed-url',ITUNES)),baseOf(first(channel,'new-feed-url',ITUNES),url)),nextPageUrl:attrUrl(named(channel,'link','http://www.w3.org/2005/Atom').find(n=>n.getAttribute('rel')==='next'),'href',url),episodes:[]};
 const entries=named(channel,atom?'entry':'item');if(entries.length>MAX_ENTRIES)throw new Error('Feed has too many episodes.');
 const seen=new Set();for(const n of entries) {
 const base=url;const enc=atom?named(n,'link').filter(x=>x.getAttribute('rel')==='enclosure'):named(n,'enclosure');
 const playable=enc.filter(x=>attrUrl(x,atom?'href':'url',base)).sort((a,b)=>score(b)-score(a));const enclosure=playable.find(x=>score(x)>=1);const media=mediaNodes(n,'content').filter(x=>mediaScore(x)&&attrUrl(x,'url',base)).sort((a,b)=>Number(b.getAttribute('isDefault')==='true')-Number(a.getAttribute('isDefault')==='true')||mediaScore(b)-mediaScore(a))[0];const audioUrl=enclosure?attrUrl(enclosure,atom?'href':'url',base):attrUrl(media,'url',base);
 const guid=value(n,atom?'id':'guid'),title=value(n,'title')||mediaValue(n,'title')||value(n,'title',DC); const key=guid||audioUrl||`${title}|${value(n,'pubDate')||value(n,'published')}`;const id=stableId(url+'\n'+key);if(seen.has(id))continue;seen.add(id);
 const date=[value(n,atom?'published':'pubDate'),value(n,'updated'),value(n,'date',DC)].map(s=>Date.parse(s)).find(Number.isFinite);
 const chapterNode=first(n,'chapters',PODCAST);
 const inline=children(first(n,'chapters','http://podlove.org/simple-chapters')).map(c=>({start:duration(c.getAttribute('start')),title:plain(c.getAttribute('title')),url:attrUrl(c,'href',base),image:attrUrl(c,'image',base)}));
 feed.episodes.push({id,feedId:url,guid,title,description:value(n,'encoded','http://purl.org/rss/1.0/modules/content/')||value(n,atom?'content':'description')||value(n,'summary')||mediaValue(n,'description')||value(n,'description',DC),author:value(n,'author',ITUNES)||value(first(n,'author'),'name')||value(n,'creator',DC)||feed.author,audioUrl,image:image(n,url)||feed.image,published:Number.isFinite(date)?date:0,duration:duration(value(n,'duration',ITUNES))||duration(media?.getAttribute('duration')),website:linkOf(n),socialLinks:named(n,'socialInteract',PODCAST).slice(0,100).map(t=>({url:attrUrl(t,'uri',url),protocol:plain(t.getAttribute('protocol')),accountId:plain(t.getAttribute('accountId')),priority:/^\d+$/.test(t.getAttribute('priority')||'')?Math.min(1000000,Number(t.getAttribute('priority'))):0})).filter(t=>t.url),transcripts:named(n,'transcript',PODCAST).slice(0,100).map(t=>({url:attrUrl(t,'url',base),type:t.getAttribute('type')||'',language:t.getAttribute('language')||''})).filter(t=>t.url),chaptersUrl:attrUrl(chapterNode,'url',base),chapters:inline,season:Number(value(n,'season',ITUNES))||0,episodeNumber:Number(value(n,'episode',ITUNES))||0,explicit:first(n,'explicit',ITUNES)?explicit(value(n,'explicit',ITUNES)):feed.explicit});
 }return feed;
}
function score(n) {const t=n.getAttribute('type')||'';return /^audio\//i.test(t)?3:/^video\//i.test(t)?2:!t||/octet-stream/i.test(t)?1:0;}
export function parseOPML(xml) {
 const root=xmlDocument(xml).documentElement;if(root.localName!=='opml')throw new Error('Expected an OPML document.');const rows=new Map();
 function visit(n,tags,depth) {if(depth>64)throw new Error('OPML nesting is too deep.');for(const o of named(n,'outline')) {const raw=o.getAttribute('xmlUrl')||o.getAttribute('xmlurl'),title=plain(o.getAttribute('title')||o.getAttribute('text'));const extra=(o.getAttribute('category')||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(raw){const url=requiredUrl(raw);const row=rows.get(url)||{url,title,tags:[]};row.tags=[...new Set([...row.tags,...tags,...extra])].slice(0,100);rows.set(url,row);}visit(o,raw?tags:[...tags,...(title?[title]:[])],depth+1);}}
 visit(first(root,'body'),[],0);if(rows.size>MAX_ENTRIES)throw new Error('Too many OPML subscriptions.');return [...rows.values()];
}
const escapeXML=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function exportOPML(subscriptions) {
 if(!Array.isArray(subscriptions)||subscriptions.length>MAX_ENTRIES)throw new Error('Too many OPML subscriptions.');return '<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>Podlingua subscriptions</title></head><body>'+subscriptions.map(s=>`<outline type="rss" text="${escapeXML(s.titleOverride||s.title)}" title="${escapeXML(s.titleOverride||s.title)}" xmlUrl="${escapeXML(requiredUrl(s.url||s.id))}" category="${escapeXML((s.tags||[]).join(','))}"/>`).join('')+'</body></opml>';
}
export function parseChapters(json) {
 if(typeof json==='string'){if(json.length>MAX_XML)throw new Error('Chapter file is too large.');try{json=JSON.parse(json);}catch{throw new Error('Invalid chapter JSON.');}}
 if(!Array.isArray(json?.chapters)||json.chapters.length>10000)throw new Error('Invalid chapter list.');let previous=-1;
 return json.chapters.map(c=>{const start=c.startTime??c.start;if(typeof start!=='number'||!Number.isFinite(start)||start<0||start<previous||start>31536000)throw new Error('Chapter times must be chronological, finite seconds.');previous=start;const out={start,title:plain(c.title)};const end=c.endTime??c.end;if(end!==undefined){if(typeof end!=='number'||!Number.isFinite(end)||end<start||end>31536000)throw new Error('Chapter end times must be finite seconds after their start.');out.end=end;}for(const key of ['url','image']){const u=safeUrl(c[key]||c[key==='image'?'img':'url']);if(u)out[key]=u;}return out;});
}
