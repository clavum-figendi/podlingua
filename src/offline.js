export function initOfflineUI(){
 const box=document.createElement('div'),button=document.createElement('button'),status=document.createElement('p');
 button.type='button';button.id='offline-enable';button.textContent='Enable offline app';status.id='offline-status';status.style.fontSize='10px';status.textContent='Offline shell not enabled';box.append(button,status);document.querySelector('.sidebar-bottom').prepend(box);
 let installPrompt;
 const installButton=document.createElement('button');installButton.type='button';installButton.textContent='Install app';installButton.hidden=true;box.append(installButton);
 // Do not suppress the browser's native banner. A separate click owns installation.
 window.addEventListener('beforeinstallprompt',event=>{installPrompt=event;installButton.hidden=false;});
 window.addEventListener('appinstalled',()=>{installPrompt=null;installButton.hidden=true;});
 installButton.onclick=()=>{if(!installPrompt)return;const event=installPrompt;installPrompt=null;installButton.hidden=true;try{const result=event.prompt();Promise.resolve(result).catch(()=>{status.textContent='Use your browser menu to install this app. Offline caching is separate.';});}catch{status.textContent='Use your browser menu to install this app. Offline caching is separate.';}};
 async function check(){
  try{
   const registration=await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL);if(!registration?.active){status.textContent='Offline shell not enabled';return false;}
   const response=await fetch(new URL('offline-manifest.json',location.href),{cache:'no-store'});if(!response.ok)throw new Error('No manifest');
   const manifest=await response.json(),cache=await caches.open(manifest.cacheName),matches=await Promise.all(manifest.files.map(path=>cache.match(path)));
   const complete=matches.every(Boolean);status.textContent=complete?'Ready offline · saved media & reader':'Offline shell incomplete · enable to repair';return complete;
  }catch{status.textContent='Offline shell not verified · enable to repair';return false;}
 }
 async function enable(){
  if(!('serviceWorker' in navigator))throw new Error('This browser does not support an offline application shell.');
  if(!confirm('Cache the app interface and runtime assets (about 30 MB) for offline use? This does not download podcast media or AI model weights.'))return;
  button.disabled=true;status.textContent='Caching application assets…';
  try{
   const base=import.meta.env.BASE_URL;
   const registration=await navigator.serviceWorker.register(base+'sw.js?repair='+Date.now(),{scope:base,updateViaCache:'none'});
   const worker=registration.installing||registration.waiting;
   if(worker)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Offline installation timed out. Retry when the connection is stable.')),90000);const changed=()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(new Error('Offline caching failed. No readiness guarantee.'));}};worker.addEventListener('statechange',changed);changed();});
   await navigator.serviceWorker.ready;
   if(!await check())throw new Error('Not all required app assets were cached. Retry to repair.');
   navigator.storage?.persist?.().catch(()=>{});

  }catch(error){status.textContent=error.message;throw error;}finally{button.disabled=false;}
 }
 button.onclick=()=>enable().catch(()=>{});window.podlinguaOffline={check,enable};
 if('serviceWorker' in navigator)navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL).then(r=>{if(r)check();}).catch(()=>{});
 return {check,enable};
}
