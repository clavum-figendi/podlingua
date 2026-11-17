import {mutateAppState} from './catalog.js';

export const QUEUE_SORTS=['title','newest','oldest','duration'];
export const ENQUEUE_POSITIONS=['back','front','after-current','random'];
const unique=ids=>[...new Set(ids.filter(id=>typeof id==='string'&&id.length>0&&id.length<=128))];
const number=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):0;
const date=v=>Number.isFinite(new Date(v).getTime())?new Date(v).getTime():0;
export function sortQueue(queue,episodes,sort='newest'){
 const byId=new Map(episodes.map(e=>[e.id,e]));
 return [...queue].sort((a,b)=>{const x=byId.get(a)||{},y=byId.get(b)||{};return sort==='title'?String(x.title||'').localeCompare(String(y.title||'')):sort==='duration'?number(x.duration)-number(y.duration):(sort==='oldest'?1:-1)*(date(x.published||x.createdAt)-date(y.published||y.createdAt));});
}
export function shuffleQueue(queue,random=Math.random){
 const result=[...queue];for(let i=result.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[result[i],result[j]]=[result[j],result[i]];}return result;
}
/** Pure queue reducer. Manual lock never blocks completion or opt-in automation. */
export function reduceQueue(state,action,episodes=[],random=Math.random){
 const settings=state.settings||{};let queue=unique(state.queue||[]);
 if(settings.queueLocked&&action.type!=='complete'&&action.automatic!==true)throw new Error('Queue is locked. Unlock it before making manual changes.');
 if(settings.queueKeepSorted&&['move','shuffle'].includes(action.type))throw new Error('Turn off keep-sorted before moving or shuffling episodes.');
 switch(action.type){
 case 'add':{const ids=unique(action.ids||[]);queue=queue.filter(id=>!ids.includes(id));const placement=action.position||settings.enqueuePosition||'back';if(!ENQUEUE_POSITIONS.includes(placement))throw new Error('Invalid queue placement.');const at=placement==='front'?0:placement==='after-current'?queue.indexOf(action.currentId)+1:placement==='random'?Math.min(queue.length,Math.max(0,Math.floor(random()*(queue.length+1)))):queue.length;queue.splice(at,0,...ids);break;}
 case 'remove':case 'complete':queue=queue.filter(id=>id!==action.id);break;
 case 'clear':queue=[];break;
 case 'move':{const i=queue.indexOf(action.id),j=i+Number(action.delta);if(i>=0&&Number.isInteger(j)&&j>=0&&j<queue.length)[queue[i],queue[j]]=[queue[j],queue[i]];break;}
 case 'shuffle':queue=shuffleQueue(queue,random);break;
 case 'sort':queue=sortQueue(queue,episodes,action.sort||settings.queueSort);break;
 default:throw new Error('Unknown queue action.');
 }
 return settings.queueKeepSorted?sortQueue(queue,episodes,settings.queueSort):queue;
}
export function mutateQueue(action,episodes=[],options={}){return mutateAppState(state=>{state.queue=reduceQueue(state,action,episodes,options.random);});}
export function saveQueuePreferences(patch,episodes=[]){return mutateAppState(state=>{for(const key of ['queueLocked','queueKeepSorted'])if(typeof patch[key]==='boolean')state.settings[key]=patch[key];if(QUEUE_SORTS.includes(patch.queueSort))state.settings.queueSort=patch.queueSort;if(ENQUEUE_POSITIONS.includes(patch.enqueuePosition))state.settings.enqueuePosition=patch.enqueuePosition;if(state.settings.queueKeepSorted)state.queue=sortQueue(state.queue,episodes,state.settings.queueSort);});}

/** Whitespace terms or double-quoted phrases; literal substring matching, never regex. */
export function parseFilterTerms(value){return (String(value||'').slice(0,2000).match(/"[^"]+"|[^\s"]+/g)||[]).map(v=>v.replaceAll('"','').trim().toLocaleLowerCase()).filter(Boolean);}
export function matchesDownloadFilter(episode,subscription={}){
 const title=String(episode.title||'').toLocaleLowerCase(),include=parseFilterTerms(subscription.downloadInclude),exclude=parseFilterTerms(subscription.downloadExclude);
 return !exclude.some(term=>title.includes(term))&&(!include.length||include.some(term=>title.includes(term)));
}
/** Call only after a successful merge, with IDs captured BEFORE refresh. */
export async function applyFreshEpisodePolicy(subscription,incoming,previousIds,allEpisodes=incoming,{currentId}={}){
 if(subscription.newEpisodeAction!=='queue')return;
 const before=new Set(previousIds),ids=incoming.filter(e=>!before.has(e.id)&&!e.played&&!e.archived).map(e=>e.id);
 if(ids.length)return mutateQueue({type:'add',ids,automatic:true,currentId},allEpisodes);
}

/** Re-read on every attempt. A deleted record must never be resurrected. */
export async function patchEpisodeCAS(bridge,id,patch){
 for(let attempt=0;attempt<4;attempt++){
  const current=await bridge.getEpisode(id);if(!current)return;
  try{return await bridge.saveEpisode({...current,...(typeof patch==='function'?patch(current):patch),id:current.id,revision:current.revision});}
  catch(error){if(attempt===3||!/changed|deleted in another tab/i.test(error.message))throw error;}
 }
}
/** Browser history consists of saved position and completion date. This intentionally clears both. */
export async function clearHistory(bridge){
 let count=0;for(const episode of await bridge.listEpisodes())if(episode.position||episode.playedAt){await patchEpisodeCAS(bridge,episode.id,{position:0,playedAt:null});count++;}return count;
}
export async function resetStatistics(bridge){
 for(const episode of await bridge.listEpisodes())if(episode.listenedSeconds)await patchEpisodeCAS(bridge,episode.id,{listenedSeconds:0});
 return mutateAppState(state=>{state.stats={listeningSeconds:0,totalMediaSeconds:0,playedEpisodes:0,daily:[]};});
}
/** Library inventory is not listening: only measured counters contribute to listening totals. */
export function computeStatistics(episodes,subscriptions=[],state={}){
 const groups=new Map(subscriptions.map(s=>[s.id,{id:s.id,title:s.titleOverride||s.title||s.id,episodes:0,played:0,listeningSeconds:0,savedBytes:0,remainingSeconds:0}]));
 let savedBytes=0,remainingSeconds=0,knownDurationSeconds=0;
 for(const e of episodes){const id=e.feedId||'local';if(!groups.has(id))groups.set(id,{id,title:id==='local'?'Local library':id,episodes:0,played:0,listeningSeconds:0,savedBytes:0,remainingSeconds:0});const group=groups.get(id),bytes=number(e.audio?.size),remaining=e.played||e.archived?0:Math.max(0,number(e.duration)-number(e.position));group.episodes++;group.played+=e.played?1:0;group.listeningSeconds+=number(e.listenedSeconds);group.savedBytes+=bytes;group.remainingSeconds+=remaining;savedBytes+=bytes;remainingSeconds+=remaining;knownDurationSeconds+=number(e.duration);}
 return {episodes:episodes.length,played:episodes.filter(e=>e.played).length,savedEpisodes:episodes.filter(e=>e.audio instanceof Blob).length,savedBytes,remainingSeconds,knownDurationSeconds,recordedListeningSeconds:number(state.stats?.listeningSeconds),recordedMediaSeconds:number(state.stats?.totalMediaSeconds),completionEvents:number(state.stats?.playedEpisodes),daily:(state.stats?.daily||[]).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.day)&&Number.isFinite(d.seconds)&&d.seconds>=0).map(d=>({...d})),byShow:[...groups.values()].sort((a,b)=>b.listeningSeconds-a.listeningSeconds||a.title.localeCompare(b.title))};
}

export const MAX_LOCAL_FILE_BYTES=512*1024*1024;
export function isLocalMedia(file){return /^(audio|video)\//i.test(file.type||'')||(!file.type||file.type==='application/octet-stream')&&/\.(mp3|m4a|m4b|ogg|oga|opus|wav|flac|aac|mp4|webm|mov)$/i.test(file.name||'');}
/** Copies user-selected files into IndexedDB; no directory watchers or retained path permissions. */
export async function importLocalFiles(files,bridge,{maxBytes=MAX_LOCAL_FILE_BYTES,maxFiles=500,onProgress=()=>{}}={}){
 const selected=Array.from(files||[]);if(selected.length>maxFiles)throw new Error(`Choose at most ${maxFiles} files per import.`);
 const result={imported:[],skipped:[],errors:[]};let used=0;
 for(const [index,file] of selected.entries()){
  try{
   if(!(file instanceof Blob)||!isLocalMedia(file))throw new Error('Unsupported media type. Choose audio or video files.');
   if(!file.size||file.size>MAX_LOCAL_FILE_BYTES||used+file.size>maxBytes)throw new Error('Local import exceeds the size budget (512 MiB maximum per batch).');
   used+=file.size;const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),id='local-'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
   if(await bridge.getEpisode(id)){result.skipped.push(file.name);continue;}
   try{await bridge.saveEpisode({id,title:String(file.name||'Local media').split(/[\\/]/).pop().replace(/\.[^.]+$/,'').slice(0,500),audio:file,createdAt:Date.now(),downloadedAt:Date.now(),mediaType:file.type||'application/octet-stream'});result.imported.push(id);}
   catch(error){if(/changed|deleted in another tab/i.test(error.message)&&await bridge.getEpisode(id))result.skipped.push(file.name);else throw error;}
  }catch(error){result.errors.push({name:String(file.name||'File').split(/[\\/]/).pop(),message:error.message});}
  finally{onProgress({done:index+1,total:selected.length});}
 }
 return result;
}
