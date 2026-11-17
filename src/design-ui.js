import './design.css';

const stamp=value=>{const n=Math.max(0,Math.floor(Number(value)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};

/** Enhance existing controls without replacing a media node or its listeners. */
export function initDesignUI(){
 // All innerHTML below is static authored UI; episode/user text is never interpolated.
 if(document.querySelector('#listening-dock'))return;
 const media=document.querySelector('#audio'),player=document.querySelector('.player');
 if(!media||!player)return;
 document.body.classList.add('design-ready');
 document.querySelector('.honest-note')?.remove();
 const intro=document.querySelector('.intro');
 const introCopy=intro?.querySelector(':scope > div');
 if(introCopy)introCopy.innerHTML='<p class="eyebrow">WORDS IN TWO WORLDS</p><h1>Study reader<span class="title-period">.</span></h1>';
 const transcriptImport=document.querySelector('.import-strip .import-label');
 if(transcriptImport)intro?.append(transcriptImport);
 document.querySelector('.import-strip')?.remove();
 const empty=()=>{
  const el=document.querySelector('#transcript .empty-state');
  if(!el||el.dataset.designed)return;
  el.dataset.designed='true';
  el.innerHTML='<div class="listening-dial" aria-hidden="true"><span></span><i></i></div><p class="eyebrow">THE SPACE BETWEEN SOUND & MEANING</p><h3>Ready for a closer listen.</h3><p>Bring an audio file or a transcript.<br>Your words, with room for another language.</p><div class="empty-notation" aria-hidden="true">01 — LISTEN <span>↔</span> 02 — UNDERSTAND</div>';
 };
 empty();
 new MutationObserver(empty).observe(document.querySelector('#transcript'),{childList:true,subtree:true});
 const dock=document.createElement('section');dock.id='listening-dock';dock.setAttribute('aria-label','Persistent audio player');
 document.body.append(dock);
 // Move, never clone. Existing playback state, IDs and event listeners survive.
 dock.append(player);
 const play=document.createElement('button');play.type='button';play.id='design-play';play.setAttribute('aria-label','Play audio');play.textContent='▶';
 player.querySelector('.record')?.replaceWith(play);
 const transport=document.createElement('div');transport.className='design-transport';
 transport.innerHTML='<output id="design-elapsed" aria-label="Elapsed audio time">0:00</output><input id="design-seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="Seek audio" disabled><output id="design-duration" aria-label="Audio duration">0:00</output>';
 const area=player.querySelector('.audio-area');area.insertBefore(transport,media);
 const seek=transport.querySelector('input'),elapsed=transport.querySelector('#design-elapsed'),duration=transport.querySelector('#design-duration');
 const update=()=>{
  const valid=Number.isFinite(media.duration)&&media.duration>0;
  play.disabled=!media.getAttribute('src')&&!media.currentSrc;
  play.setAttribute('aria-label',media.paused?'Play audio':'Pause audio');
  play.textContent=media.paused?'▶':'Ⅱ';
  play.setAttribute('aria-pressed',String(!media.paused));
  seek.disabled=!valid;seek.max=valid?String(media.duration):'0';seek.value=valid?String(media.currentTime):'0';
  seek.setAttribute('aria-valuetext',`${stamp(media.currentTime)} of ${valid?stamp(media.duration):'unknown duration'}`);
  seek.style.setProperty('--played',`${valid?100*media.currentTime/media.duration:0}%`);
  elapsed.textContent=stamp(media.currentTime);duration.textContent=valid?stamp(media.duration):'—:—';
  player.classList.toggle('is-playing',!media.paused);
  player.classList.toggle('with-video',media.videoWidth>0);
 };
 play.addEventListener('click',async()=>{if(!media.paused){media.pause();return;}try{await media.play();}catch(error){const status=document.querySelector('#status');if(status)status.textContent=`Playback unavailable: ${error.message}`;}});
 seek.addEventListener('input',()=>{if(Number.isFinite(media.duration))media.currentTime=Math.max(0,Math.min(media.duration,Number(seek.value)));update();});
 for(const event of ['play','pause','timeupdate','loadedmetadata','durationchange','emptied','ended','error','loadstart'])media.addEventListener(event,update);
 update();
 const sidebar=document.querySelector('.sidebar');sidebar.id ||= 'listening-navigation';
 const toggle=document.createElement('button');toggle.type='button';toggle.id='design-menu';toggle.setAttribute('aria-controls',sidebar.id);toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');toggle.innerHTML='<span aria-hidden="true">☰</span> Library';
 document.querySelector('.topbar').prepend(toggle);
 const mobile=matchMedia('(max-width: 700px)');
 const setOpen=open=>{
  document.body.classList.toggle('navigation-open',open);
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  sidebar.inert=mobile.matches&&!open;
 };
 toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){setOpen(false);toggle.focus();}});
 sidebar.addEventListener('click',event=>{if(mobile.matches&&event.target.closest('button,a')){setOpen(false);toggle.focus();}});
 mobile.addEventListener('change',()=>setOpen(false));setOpen(false);
 // Outside click dismisses mobile navigation without intercepting its controls.
 document.addEventListener('pointerdown',event=>{if(mobile.matches&&!sidebar.contains(event.target)&&!toggle.contains(event.target))setOpen(false);});
}
