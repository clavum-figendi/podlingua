import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const root='dist',base='/podlingua/';
async function walk(dir,prefix=''){const paths=[];for(const entry of await readdir(dir,{withFileTypes:true})){const rel=prefix+entry.name;if(entry.isDirectory())paths.push(...await walk(join(dir,entry.name),rel+'/'));else if(!['sw.js','offline-manifest.json'].includes(rel))paths.push(rel);}return paths;}
const paths=(await walk(root)).sort(),hash=createHash('sha256');
for(const p of paths){hash.update(p);hash.update(await readFile(join(root,p)));}
const cachePrefix='podlingua-shell-'+Buffer.from(base).toString('hex')+'-';
const cacheName=cachePrefix+hash.digest('hex').slice(0,16);
const files=[...paths.map(p=>base+p),base+'offline-manifest.json'];
await writeFile(join(root,'offline-manifest.json'),JSON.stringify({cacheName,files}));
await writeFile(join(root,'sw.js'),`const CACHE=${JSON.stringify(cacheName)},FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(${JSON.stringify(cachePrefix)})&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin||!url.pathname.startsWith(${JSON.stringify(base)}))return;event.respondWith((async()=>{const cache=await caches.open(CACHE);if(event.request.mode==='navigate'||url.pathname.endsWith('/offline-manifest.json')){try{return await fetch(event.request);}catch{const saved=await cache.match(event.request.mode==='navigate'?${JSON.stringify(base+'index.html')}:url.pathname);if(saved)return saved;throw new Error('Offline shell unavailable');}}return await cache.match(event.request,{ignoreVary:true})||fetch(event.request);})());});
`);
console.log(`Prepared opt-in offline shell ${cacheName} (${files.length} assets). No models or episode media are precached.`);
