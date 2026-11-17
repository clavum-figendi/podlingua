import {fetchFeed,safeUrl} from './podcasts.js';
import {listEpisodes,getEpisode,saveEpisode,deleteEpisode} from './storage.js';
let database;
const pendingLocks=new Map();
async function feedLock(id,fn){
 if(globalThis.navigator?.locks)return navigator.locks.request('podlingua-feed:'+id,fn);
 if(typeof document!=='undefined')throw new Error('Safe subscription updates require a browser with Web Locks support.');
 // Node fixture fallback; browsers use an origin-wide lock across databases/tabs.
 const next=(pendingLocks.get(id)||Promise.resolve()).catch(()=>{}).then(fn);pendingLocks.set(id,next);
 try{return await next;}finally{if(pendingLocks.get(id)===next)pendingLocks.delete(id);}
}
const feedGeneration=id=>read('state','feed-generation:'+id);
async function invalidateSubscription(id){await change('state','feed-generation:'+id,()=>crypto.randomUUID());return change('subscriptions',id,()=>undefined);}
async function openDatabase(){
 if(!globalThis.indexedDB)throw new Error('IndexedDB is unavailable. Enable browser site storage.');
 if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('podlingua-podcasts',1);r.onupgradeneeded=()=>{r.result.createObjectStore('subscriptions',{keyPath:'id'});r.result.createObjectStore('state');};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();database=undefined;};resolve(r.result);};r.onerror=r.onblocked=()=>{database=undefined;reject(new Error('Could not open podcast catalog. Check storage permissions and close other tabs.'));};});return database;
}
async function read(store,key){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(store);const r=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(new Error('Could not read local podcast catalog.'));});}
async function change(store,key,mutator){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store);let result,failure;const r=s.get(key);r.onsuccess=()=>{try{result=mutator(r.result);if(result?.then)throw new Error('Catalog mutators must be synchronous.');if(result===undefined)s.delete(key);else if(store==='state')s.put(result,key);else s.put(result);}catch(e){failure=e;tx.abort();}};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||new Error('Podcast catalog write failed. Check storage quota.'));tx.onerror=()=>{};});}
const boundedString=(v,max=10000)=>typeof v==='string'?v.slice(0,max):'';
function subscriptionRow(input){
 const out={};for(const k of ['downloadInclude','downloadExclude'])if(k in input)out[k]=boundedString(input[k],2000);
 if(['inbox','queue','nothing'].includes(input.newEpisodeAction))out.newEpisodeAction=input.newEpisodeAction;
 for(const k of ['id','url','title','titleOverride','description','author','image','link','language'])if(k in input)out[k]=boundedString(input[k],k==='description'?100000:10000);
 if('id' in out){const url=safeUrl(out.id);if(!url)throw new Error('Invalid HTTPS subscription URL.');out.id=url;}
 if('url' in out){out.url=safeUrl(out.url);if(!out.url)throw new Error('Invalid HTTPS subscription URL.');}
 for(const key of ['newFeedUrl','nextPageUrl'])if(key in input)out[key]=safeUrl(input[key]);
 if(Array.isArray(input.funding))out.funding=input.funding.slice(0,100).map(f=>({url:safeUrl(f.url),title:boundedString(f.title,300)})).filter(f=>f.url);
 for(const k of ['image','link'])if(k in out)out[k]=safeUrl(out[k]);
 if('tags' in input)out.tags=[...new Set((Array.isArray(input.tags)?input.tags:[]).filter(x=>typeof x==='string').map(x=>x.slice(0,100)))].slice(0,100);
 for(const k of ['explicit','autoDownload','autoDelete','keepUpdated','includeInQueue'])if(k in input)out[k]=!!input[k];
 for(const [k,min,max] of [['speed',0.25,4],['skipIntro',0,86400],['skipOutro',0,86400],['createdAt',0,1e15],['updatedAt',0,1e15],['lastRefresh',0,1e15],['episodeCount',0,20000]])if(Number.isFinite(input[k]))out[k]=Math.max(min,Math.min(max,input[k]));
 return out;
}
export async function listSubscriptions(){return (await read('subscriptions')).sort((a,b)=>(a.titleOverride||a.title||'').localeCompare(b.titleOverride||b.title||''));}
export async function saveSubscription(feed){const patch=subscriptionRow(feed||{});if(!patch.id)throw new Error('Missing subscription identifier.');return change('subscriptions',patch.id,current=>({...current,...patch,url:patch.url||current?.url||patch.id,createdAt:current?.createdAt||patch.createdAt||Date.now()}));}
export async function deleteSubscription(id){return feedLock(id,()=>invalidateSubscription(id));}
const defaultState=()=>({queue:[],settings:{},stats:{},downloadLog:[]});
const SETTINGS_NUMBERS={skipBack:[0,3600],skipForward:[0,3600],defaultSpeed:[0.25,4],autoDownloadLimit:[0,100],refreshMinutes:[0,10080],maxDownloadMB:[1,512]};
const SETTINGS_FLAGS=['queueLocked','queueKeepSorted','followQueue','skipCompleted','autoDeletePlayed','enqueueDownloaded','autoDownload','allowProxy','includeExplicit','rememberPosition'];
function cleanState(input){
 const out=defaultState();
 out.queue=[...new Set((Array.isArray(input?.queue)?input.queue:[]).filter(x=>typeof x==='string'&&x.length<=128))].slice(0,20000);
 const settings=input?.settings||{};for(const [k,[min,max]] of Object.entries(SETTINGS_NUMBERS))if(Number.isFinite(settings[k]))out.settings[k]=Math.min(max,Math.max(min,settings[k]));for(const k of SETTINGS_FLAGS)if(typeof settings[k]==='boolean')out.settings[k]=settings[k];
 if(['title','newest','oldest','duration'].includes(settings.queueSort))out.settings.queueSort=settings.queueSort;
 if(['back','front','after-current','random'].includes(settings.enqueuePosition))out.settings.enqueuePosition=settings.enqueuePosition;
 if(/^[A-Z]{2}$/.test(settings.country||''))out.settings.country=settings.country;
 if(['light','dark','system'].includes(settings.theme))out.settings.theme=settings.theme;
 if(typeof settings.proxy==='string'&&settings.proxy.length<2000&&settings.proxy.includes('{url}')){const safe=safeUrl(settings.proxy.replaceAll('{url}','https%3A%2F%2Fexample.org'));if(safe){const u=new URL(safe);if(!u.searchParams.size||[...u.searchParams.keys()].every(k=>!/token|key|auth|secret|password|signature/i.test(k)))out.settings.proxy=settings.proxy;}}
 if(typeof input?.lastEpisodeId==='string'&&input.lastEpisodeId.length<=128)out.lastEpisodeId=input.lastEpisodeId;
 for(const k of ['listeningSeconds','totalMediaSeconds','playedEpisodes'])if(Number.isFinite(input?.stats?.[k]))out.stats[k]=Math.max(0,input.stats[k]);
 if(Array.isArray(input?.stats?.daily))out.stats.daily=input.stats.daily.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x?.day)&&Number.isFinite(x.seconds)&&x.seconds>=0).slice(-3660).map(x=>({day:x.day,seconds:x.seconds}));
 out.downloadLog=(Array.isArray(input?.downloadLog)?input.downloadLog:[]).slice(-1000).map(x=>{const row={};for(const k of ['episodeId','title','status'])if(typeof x?.[k]==='string')row[k]=x[k].slice(0,500);for(const k of ['at','timestamp','bytes'])if(Number.isFinite(x?.[k]))row[k]=Math.max(0,x[k]);return row;});return out;
}
export async function getAppState(){return cleanState(await read('state','app'));}
export async function mutateAppState(fn){if(typeof fn!=='function')throw new Error('A synchronous state mutator is required.');return change('state','app',current=>{const state=cleanState(current),result=fn(state);if(result?.then)throw new Error('State mutators must be synchronous.');return cleanState(result===undefined?state:result);});}
export async function setAppState(patch){return mutateAppState(current=>({...current,...patch}));}
async function mergeFeed(feed,generation,requireExisting=false,expectedUrl,archive=false){return feedLock(feed.id,async()=>{
 if(await feedGeneration(feed.id)!==generation||(requireExisting&&!await read('subscriptions',feed.id)))throw new Error('Subscription changed or was unsubscribed while fetching. Refresh explicitly.');
 if(expectedUrl&&((await read('subscriptions',feed.id))?.url||feed.id)!==expectedUrl)throw new Error('Subscription URL changed while fetching. Retry explicitly.');
 const existing=(await listEpisodes()).filter(e=>e.feedId===feed.id),previousIds=existing.map(e=>e.id),saved=[];
 for(const incoming of feed.episodes){
 const match=existing.find(e=>e.id===incoming.id||(incoming.guid&&e.guid===incoming.guid)||(incoming.audioUrl&&e.audioUrl===incoming.audioUrl));const id=match?.id||incoming.id;
 let result;for(let attempt=0;attempt<4;attempt++){
 const current=await getEpisode(id);const metadata={...incoming,id};
 // Missing feed fields must not erase previously discovered chapters/transcripts or dates.
 if(current)for(const k of ['image','description','published','duration','website','chaptersUrl','season','episodeNumber','audioUrl','guid'])if(!metadata[k])delete metadata[k];
 if(current)for(const k of ['chapters','transcripts'])if(!metadata[k]?.length)delete metadata[k];
 try{result=await saveEpisode({...current,...metadata,createdAt:current?.createdAt||Date.now()});break;}catch(error){if(attempt===3||!/changed|deleted in another tab/i.test(error.message))throw error;}
 }const i=existing.findIndex(e=>e.id===result.id);if(i>=0)existing[i]=result;else existing.push(result);const j=saved.findIndex(e=>e.id===result.id);if(j>=0)saved[j]=result;else saved.push(result);
 }
 if(archive){const latest=await read('subscriptions',feed.id);for(const field of ['title','description','author','image','link','language','funding','newFeedUrl']){if(Object.hasOwn(latest,field))feed[field]=latest[field];else delete feed[field];}}
 const subscription=await saveSubscription({...feed,episodeCount:saved.length,updatedAt:Date.now(),lastRefresh:Date.now()});const {applyFreshEpisodePolicy}=await import('./parity.js');await applyFreshEpisodePolicy(subscription,saved,previousIds,await listEpisodes(),{currentId:(await getAppState()).lastEpisodeId});return {...feed,...subscription,episodes:saved};
});}
export async function subscribe(url,options={}) {const id=safeUrl(url);if(!id)throw new Error('Invalid HTTPS subscription URL.');const snapshot=await feedLock(id,async()=>({generation:await feedGeneration(id),existing:await read('subscriptions',id)}));const source=snapshot.existing?.url||id;return mergeFeed(canonicalFeed(await fetchFeed(source,options),id,source),snapshot.generation,!!snapshot.existing,source);}
const canonicalFeed=(feed,id,url)=>({...feed,id,url,episodes:feed.episodes.map(e=>({...e,feedId:id}))});
async function snapshotFeed(id){const snapshot=await feedLock(id,async()=>({subscription:await read('subscriptions',id),generation:await feedGeneration(id)}));if(!snapshot.subscription)throw new Error('Subscription no longer exists.');return snapshot;}
export async function refreshSubscription(id,options={}) {const {subscription,generation}=await snapshotFeed(id);return mergeFeed(canonicalFeed(await fetchFeed(subscription.url,options),id,subscription.url),generation,true,subscription.url);}
export async function relocateSubscription(id,url,options={}){url=safeUrl(url);if(!url)throw new Error('Use a valid HTTPS feed URL.');const {subscription,generation}=await snapshotFeed(id);const feed=await fetchFeed(url,options);return mergeFeed({...canonicalFeed(feed,id,url),newFeedUrl:''},generation,true,subscription.url);}
export async function loadArchivePage(id,options={}){const {subscription,generation}=await snapshotFeed(id);if(!subscription.nextPageUrl)throw new Error('No archive page advertised.');const page=await fetchFeed(subscription.nextPageUrl,options);return mergeFeed({...canonicalFeed(page,id,subscription.url),nextPageUrl:page.nextPageUrl||''},generation,true,subscription.url,true);}
export async function unsubscribe(id,{removeEpisodes=false}={}) {return feedLock(id,async()=>{
 await invalidateSubscription(id);
 if(removeEpisodes){const episodes=(await listEpisodes()).filter(e=>e.feedId===id);for(const e of episodes)await deleteEpisode(e.id);const removed=new Set(episodes.map(e=>e.id));await mutateAppState(s=>({...s,queue:s.queue.filter(x=>!removed.has(x)),...(removed.has(s.lastEpisodeId)?{lastEpisodeId:''}:{})}));}
});}
