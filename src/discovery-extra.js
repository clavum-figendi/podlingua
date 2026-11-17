import {fetchResource,safeUrl} from './podcasts.js';
// Official authentication and endpoint: https://podcastindex-org.github.io/docs-api/
// User-owned keys only. The raw secret never leaves the current JS context.
export async function searchPodcastIndex(query,{apiKey='',apiSecret='',consent=false,now=Date.now,fetchFn=globalThis.fetch,signal,proxy='',allowProxy=false,...options}={}){
 if(!String(query).trim())return [];
 if(query.length>500)throw new Error('Search is too long.');
 if(!apiKey.trim()||!apiSecret)throw new Error('Enter your own Podcast Index API key and secret.');
 if(!consent)throw new Error('Podcast Index requires explicit consent before searching.');
 if(proxy||allowProxy)throw new Error('Podcast Index credentials cannot be sent through a proxy.');
 if(!globalThis.crypto?.subtle)throw new Error('Podcast Index signing requires a secure browser context.');
 const timestamp=String(Math.floor(now()/1000));
 const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(apiKey.trim()+apiSecret+timestamp));
 const authorization=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const url='https://api.podcastindex.org/api/1.0/search/byterm?'+new URLSearchParams({q:query.trim(),max:'30'});
 const response=await fetchResource(url,{...options,signal,maxBytes:4*1024*1024,fetchFn:(target,init)=>fetchFn(target,{...init,redirect:'error',headers:{'X-Auth-Key':apiKey.trim(),'X-Auth-Date':timestamp,Authorization:authorization,'User-Agent':'Podlingua/1.0'}})});
 let data;try{data=await response.json();}catch{throw new Error('Invalid Podcast Index response.');}
 if(data.status===false||data.status==='false'||!Array.isArray(data.feeds))throw new Error('Invalid Podcast Index response. Check your keys and try again.');
 const rows=new Map();for(const row of data.feeds.slice(0,100)){const url=safeUrl(row.url);if(url)rows.set(url,{title:String(row.title||''),author:String(row.author||''),image:safeUrl(row.artwork||row.image),url,id:url});}return [...rows.values()];
}
export async function searchFyyd(query,options={}){if(!query.trim())return [];if(query.length>500)throw new Error('Search is too long.');const data=await(await fetchResource('https://api.fyyd.de/0.2/search/podcast?'+new URLSearchParams({title:query,count:'30'}),options)).json();if(!Array.isArray(data.data))throw new Error('Invalid fyyd response.');return data.data.slice(0,100).map(row=>({title:String(row.title||''),author:String(row.author||''),image:safeUrl(row.thumbImageURL),url:safeUrl(row.xmlURL),id:safeUrl(row.xmlURL)})).filter(row=>row.url);}
export function discoverFeedLinks(html,url){if(html.length>4*1024*1024)throw new Error('Website exceeds discovery limit.');const document=new DOMParser().parseFromString(html,'text/html'),seen=new Set(),rows=[];for(const link of Array.from(document.getElementsByTagName('link'))){if(!/\balternate\b/i.test(link.getAttribute('rel')||'')||!/^application\/(rss|atom)\+xml$/i.test(link.getAttribute('type')||''))continue;const href=safeUrl(link.getAttribute('href'),url);if(href&&!seen.has(href)){seen.add(href);rows.push({title:link.getAttribute('title')||href,url:href});}}return rows.slice(0,50);}
export async function discoverWebsite(url,options={}){return discoverFeedLinks(await(await fetchResource(url,{...options,maxBytes:4*1024*1024})).text(),url);}
