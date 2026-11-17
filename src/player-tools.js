import {resumePosition,nextQueued,listeningDelta} from './playback.js';
import {patchEpisode,safePodcastURL} from './library-services.js';
import './player-style.css';
const stamp=n=>`${Math.floor((n||0)/60)}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
export function initPlayerTools(bridge){
 const media=document.querySelector('#audio'),speed=document.querySelector('#speed');
 // Only static interface markup is used below; episode and bookmark values use textContent.
 const tools=document.createElement('div');tools.className='player-tools';tools.innerHTML=`<div class="player-button-row"><button type="button" id="skip-back">↶ 15s</button><button type="button" id="skip-forward">30s ↷</button><button type="button" id="play-next">Next in queue</button><button type="button" id="bookmark-add">＋ Bookmark</button><button type="button" id="bookmarks-show">Bookmarks</button><button type="button" id="chapters-show">Chapters</button><button type="button" id="episode-download">Download episode</button><button type="button" id="publisher-import">Publisher transcript</button></div><div class="player-button-row"><label>Sleep <input id="sleep-minutes" type="number" min="0.01" max="1440" value="15" step="1" aria-label="Sleep timer minutes"> min</label><button type="button" id="sleep-start">Set timer</button><button type="button" id="sleep-end">At episode end</button><button type="button" id="sleep-cancel">Cancel timer</button><span id="sleep-status" aria-live="polite">Off</span><button type="button" id="loop-a">Loop A</button><button type="button" id="loop-b">Loop B</button><button type="button" id="loop-clear">Clear loop</button><button type="button" id="pip-video">Picture in picture</button><button type="button" id="fullscreen-video">Full screen</button></div><div id="download-status" aria-live="polite"></div><button type="button" id="cancel-download" hidden>Cancel download</button>`;
 document.querySelector('.player').after(tools);
 const dialog=document.createElement('dialog');dialog.id='bookmarks-dialog';dialog.innerHTML='<h2>Bookmarks</h2><div id="bookmarks-list"></div><button type="button" id="bookmarks-close">Close bookmarks</button>';document.body.append(dialog);
 const chapterDialog=document.createElement('dialog');chapterDialog.id='chapters-dialog';chapterDialog.innerHTML='<h2>Chapters</h2><div id="chapters-list"></div><button type="button" id="chapters-close">Close chapters</button>';document.body.append(chapterDialog);
 const $=id=>document.getElementById(id),guard=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>bridge.status(e.message,true));
 let episode,subscription,prefs={},selectedGeneration=0,lastMedia=0,lastWall=performance.now(),wallTotal=0,mediaTotal=0,lastFlush=0,flushChain=Promise.resolve(),sleepDeadline=0,sleepEnd=false,loopA,loopB,finished=false,downloadController;
 const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('podlingua-playback'):null,tabId=crypto.randomUUID();
 channel?.addEventListener('message',e=>{if(e.data?.type==='playing'&&e.data.tabId!==tabId)media.pause();});
 const catalog=()=>import('./catalog.js');
 const onSaved=saved=>{if(episode?.id===saved.id){episode=saved;bridge.onSaved?.(saved);}window.dispatchEvent(new Event('podlingua:library'));};
 const flush=()=>{
  if(!episode||(!media.currentSrc&&!media.src))return flushChain;
  const id=episode.id,position=Number.isFinite(media.currentTime)?media.currentTime:0,duration=Number.isFinite(media.duration)?media.duration:episode.duration,wall=wallTotal,amount=mediaTotal;
  wallTotal=0;mediaTotal=0;lastFlush=performance.now();
  flushChain=flushChain.catch(()=>{}).then(async()=>{
   const current=await bridge.getEpisode(id);if(!current)return;
   const saved=await patchEpisode(id,{position,duration,...(wall>0?{playedAt:Date.now(),listenedSeconds:(Number(current.listenedSeconds)||0)+wall}:{})});onSaved(saved);
   if(wall>0){const db=await catalog();const change=state=>{const old=state.stats||{},day=new Date().toISOString().slice(0,10),daily=Array.isArray(old.daily)?old.daily.slice(-3650):[],entry=daily.find(d=>d.day===day);if(entry)entry.seconds+=wall;else daily.push({day,seconds:wall});return {...state,stats:{...old,listeningSeconds:(Number(old.listeningSeconds)||0)+wall,totalMediaSeconds:(Number(old.totalMediaSeconds)||0)+amount,daily}};};if(db.mutateAppState)await db.mutateAppState(change);else await db.setAppState(change(await db.getAppState()));}
  }).catch(e=>bridge.status(e.message,true));
  return flushChain;
 };
 async function setEpisode(value){
  episode=value;subscription=undefined;finished=false;loopA=loopB=undefined;lastMedia=0;lastWall=performance.now();const generation=++selectedGeneration;
  const db=await catalog(),state=await db.getAppState();if(generation!==selectedGeneration)return;prefs=state.settings||{};
  if(value.feedId)subscription=(await db.listSubscriptions()).find(f=>f.id===value.feedId);
  if(generation!==selectedGeneration)return;
  $('skip-back').textContent=`↶ ${Number(prefs.skipBack??10)}s`;$('skip-forward').textContent=`${Number(prefs.skipForward??30)}s ↷`;
  const rate=Number(subscription?.speed)||Number(prefs.defaultSpeed)||1;
  if(![...speed.options].some(o=>Number(o.value)===rate))speed.add(new Option(rate+'×',String(rate)));
  speed.value=String(rate);media.playbackRate=rate;
  const apply=()=>{if(generation!==selectedGeneration)return;media.currentTime=resumePosition(value,media.duration,{skipIntro:subscription?.skipIntro,rememberPosition:prefs.rememberPosition});media.classList.toggle('has-video',media.videoWidth>0);lastMedia=media.currentTime;lastWall=performance.now();};
  if(media.readyState>=1)apply();else media.addEventListener('loadedmetadata',apply,{once:true});
  await db.setAppState({lastEpisodeId:value.id});
  if('mediaSession' in navigator){try{navigator.mediaSession.metadata=new MediaMetadata({title:value.title,artist:subscription?.author||subscription?.title||'Podlingua',album:subscription?.title||'',artwork:value.image?[{src:safePodcastURL(value.image)}]:[]});}catch{}}
 }
 async function advance(){const generation=selectedGeneration,currentId=episode?.id,db=await catalog(),state=await db.getAppState(),rows=await bridge.listEpisodes();if(generation!==selectedGeneration)return;const id=nextQueued(state.queue||[],rows,currentId,state.settings?.skipCompleted!==false);if(!id){bridge.status('No more episodes in the listening queue.');return;}await bridge.openEpisode(id,{play:true});}
 async function ended(){
  if(!episode||finished)return;finished=true;const id=episode.id,generation=selectedGeneration,position=Number.isFinite(media.duration)?media.duration:media.currentTime;await flush();
  const saved=await patchEpisode(id,{played:true,playedAt:Date.now(),position});onSaved(saved);
  const db=await catalog(),state=await db.mutateAppState(state=>({...state,queue:(state.queue||[]).filter(x=>x!==id),stats:{...state.stats,playedEpisodes:(Number(state.stats?.playedEpisodes)||0)+1}}));
  if(state.settings?.autoDeletePlayed && saved.audio && saved.audioUrl)await bridge.removeDownload(id);
  if(generation!==selectedGeneration)return;
  if(sleepEnd){sleepEnd=false;$('sleep-status').textContent='Finished';media.pause();return;}
  if(state.settings?.followQueue!==false)await advance();
 }
 media.addEventListener('timeupdate',()=>{
  const now=performance.now();if(!media.paused&&!media.seeking){const delta=listeningDelta(lastMedia,media.currentTime,(now-lastWall)/1000,media.playbackRate);wallTotal+=delta.wall;mediaTotal+=delta.media;}
  lastMedia=media.currentTime;lastWall=now;
  if(loopA!==undefined&&loopB!==undefined&&media.currentTime>=loopB){media.currentTime=loopA;return;}
  if(!media.paused&&!finished&&subscription?.skipOutro>0&&media.duration>subscription.skipOutro&&media.currentTime>=media.duration-subscription.skipOutro){media.pause();ended().catch(e=>bridge.status(e.message,true));}
  if(now-lastFlush>5000&&wallTotal>0)flush();
  if('mediaSession' in navigator&&Number.isFinite(media.duration)&&media.duration>0){try{navigator.mediaSession.setPositionState({duration:media.duration,playbackRate:media.playbackRate,position:Math.min(media.duration,media.currentTime)});}catch{}}
 });
 media.addEventListener('play',()=>{finished=false;lastMedia=media.currentTime;lastWall=performance.now();channel?.postMessage({type:'playing',tabId});if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing';});
 media.addEventListener('pause',()=>{flush();if('mediaSession' in navigator)navigator.mediaSession.playbackState='paused';});
 media.addEventListener('seeked',()=>{lastMedia=media.currentTime;lastWall=performance.now();});
 media.addEventListener('ended',()=>ended().catch(e=>bridge.status(e.message,true)));
 speed.addEventListener('change',guard(async()=>{media.playbackRate=Number(speed.value);const db=await catalog(),state=await db.getAppState();if(subscription){subscription=await db.saveSubscription({...subscription,speed:media.playbackRate});}else await db.setAppState({settings:{...state.settings,defaultSpeed:media.playbackRate}});}));
 const seek=delta=>{if(Number.isFinite(media.duration))media.currentTime=Math.max(0,Math.min(media.duration,media.currentTime+delta));};
 $('skip-back').onclick=()=>seek(-Number(prefs.skipBack??10));$('skip-forward').onclick=()=>seek(Number(prefs.skipForward??30));$('play-next').onclick=guard(advance);
 if('mediaSession' in navigator){for(const [name,fn] of Object.entries({play:()=>media.play().catch(()=>{}),pause:()=>media.pause(),seekbackward:e=>seek(-Number(e.seekOffset??prefs.skipBack??10)),seekforward:e=>seek(Number(e.seekOffset??prefs.skipForward??30)),seekto:e=>{if(Number.isFinite(e.seekTime))media.currentTime=e.seekTime;},nexttrack:()=>advance().catch(()=>{}),previoustrack:()=>{media.currentTime=0;}})){try{navigator.mediaSession.setActionHandler(name,fn);}catch{}}}
 const renderBookmarks=async()=>{const current=episode&&await bridge.getEpisode(episode.id);$('bookmarks-list').replaceChildren();for(const mark of current?.bookmarks||[]){const row=document.createElement('div'),seekButton=document.createElement('button'),remove=document.createElement('button');seekButton.textContent=`${stamp(mark.position)} · ${mark.label}`;seekButton.onclick=()=>{media.currentTime=mark.position;dialog.close();};remove.textContent='Remove';remove.onclick=guard(async()=>{const latest=await bridge.getEpisode(current.id);onSaved(await patchEpisode(current.id,{bookmarks:(latest.bookmarks||[]).filter(m=>m.id!==mark.id)}));await renderBookmarks();});row.append(seekButton,remove);$('bookmarks-list').append(row);}if(!$('bookmarks-list').children.length)$('bookmarks-list').textContent='No bookmarks for this episode yet.';};
 $('bookmark-add').onclick=guard(async()=>{if(!episode)throw new Error('Choose an episode first.');const label=prompt('Bookmark label',`At ${stamp(media.currentTime)}`);if(label===null)return;const current=await bridge.getEpisode(episode.id);onSaved(await patchEpisode(episode.id,{bookmarks:[...(current.bookmarks||[]),{id:crypto.randomUUID(),position:media.currentTime,label:label.slice(0,200),createdAt:Date.now()}].slice(-1000)}));bridge.status('Bookmark saved.');});
 $('bookmarks-show').onclick=guard(async()=>{await renderBookmarks();dialog.showModal();});$('bookmarks-close').onclick=()=>dialog.close();
 $('chapters-show').onclick=guard(async()=>{if(!episode)throw new Error('Choose an episode first.');const current=await bridge.loadChapters(episode.id);$('chapters-list').replaceChildren();for(const ch of current.chapters||[]){const b=document.createElement('button');b.textContent=`${stamp(ch.start)} · ${ch.title}`;b.onclick=()=>{media.currentTime=ch.start;chapterDialog.close();};$('chapters-list').append(b);}if(!$('chapters-list').children.length)$('chapters-list').textContent='This publisher did not provide supported chapters.';chapterDialog.showModal();});$('chapters-close').onclick=()=>chapterDialog.close();
 $('episode-download').onclick=guard(async()=>{if(!episode?.audioUrl)throw new Error('Select a podcast episode with a media URL.');if(episode.audio){bridge.status('Already downloaded in this browser.');return;}if(!confirm('Download this publisher media file into browser storage? Network and storage limits apply.'))return;downloadController?.abort();downloadController=new AbortController();$('cancel-download').hidden=false;try{const saved=await bridge.downloadEpisode(episode.id,{signal:downloadController.signal,onProgress:p=>{$('download-status').textContent=`Downloading · ${(p.loaded/1024/1024).toFixed(1)} MB${p.progress?' · '+Math.round(p.progress)+'%':''}`;}});onSaved(saved);$('download-status').textContent='Downloaded. Local transcription is now available.';}finally{$('cancel-download').hidden=true;}});
 $('cancel-download').onclick=()=>downloadController?.abort();
 $('publisher-import').onclick=guard(async()=>{if(!episode)throw new Error('Choose an episode first.');if(episode.doc&&!confirm('Replace this transcript with the publisher transcript?'))return;await bridge.publisherTranscript(episode.id);});
 const updateSleep=()=>{if(!sleepDeadline)return;if(Date.now()>=sleepDeadline){sleepDeadline=0;media.pause();$('sleep-status').textContent='Timer finished';}else $('sleep-status').textContent=`${Math.ceil((sleepDeadline-Date.now())/1000)}s remaining`;};
 $('sleep-start').onclick=()=>{const minutes=Number($('sleep-minutes').value);if(!Number.isFinite(minutes)||minutes<.01||minutes>1440){bridge.status('Enter a sleep timer from 0.01 to 1440 minutes.',true);return;}sleepEnd=false;sleepDeadline=Date.now()+minutes*60000;updateSleep();};$('sleep-end').onclick=()=>{sleepDeadline=0;sleepEnd=true;$('sleep-status').textContent='At episode end';};$('sleep-cancel').onclick=()=>{sleepDeadline=0;sleepEnd=false;$('sleep-status').textContent='Off';};setInterval(updateSleep,250);
 $('loop-a').onclick=()=>{loopA=media.currentTime;loopB=undefined;bridge.status(`Loop starts at ${stamp(loopA)}. Set Loop B after it.`);};$('loop-b').onclick=()=>{if(loopA===undefined||media.currentTime<=loopA){bridge.status('Set Loop A first, then seek later and set Loop B.',true);return;}loopB=media.currentTime;media.currentTime=loopA;bridge.status(`Loop ${stamp(loopA)}–${stamp(loopB)} enabled.`);};$('loop-clear').onclick=()=>{loopA=loopB=undefined;bridge.status('A/B loop cleared.');};
 $('pip-video').onclick=guard(async()=>{if(!media.videoWidth||!media.requestPictureInPicture)throw new Error('Picture in picture requires a video episode and browser support.');await media.requestPictureInPicture();});$('fullscreen-video').onclick=guard(async()=>{if(!media.videoWidth||!media.requestFullscreen)throw new Error('Full screen requires a video episode and browser support.');await media.requestFullscreen();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});window.addEventListener('pagehide',()=>{flush();media.pause();});
 document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName)||document.querySelector('dialog[open]'))return;if(e.code==='Space'){e.preventDefault();media.paused?media.play().catch(()=>{}):media.pause();}if(e.code==='ArrowLeft')seek(-15);if(e.code==='ArrowRight')seek(30);});
 return {setEpisode,beforeSelect:flush,flush};
}
