let database;
export const episodeMetadataFields=['author','socialLinks','feedId','guid','audioUrl','image','description','published','duration','website','transcripts','chaptersUrl','chapters','season','episodeNumber','explicit','favorite','played','archived','position','playedAt','bookmarks','downloadedAt','mediaType','listenedSeconds'];
async function openDatabase() {
  if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable. Use a normal browser window with site storage enabled.');
  if (!database) database = new Promise((resolve,reject)=>{
    const request = indexedDB.open('podlingua-library',1);
    request.onupgradeneeded = ()=>request.result.createObjectStore('episodes',{keyPath:'id'});
    request.onsuccess = ()=>{
      request.result.onversionchange = ()=>{request.result.close();database=undefined;};
      resolve(request.result);
    };
    request.onerror = ()=>{database=undefined;reject(new Error('Could not open the local library. Check browser storage permissions.'));};
    request.onblocked = ()=>{database=undefined;reject(new Error('Close other Podlingua tabs to update the library.'));};
  });
  return database;
}
async function transaction(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('episodes',mode);
    const request = action(tx.objectStore('episodes'));
    tx.oncomplete = ()=>resolve(request?.result);
    tx.onabort = ()=>reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'Browser storage is full. Export and delete episodes before retrying.' : 'Local library write/read failed. Changes were not saved.'));
    tx.onerror = ()=>{};
  });
}
export async function listEpisodes() {
  const rows = await transaction('readonly',s=>s.getAll());
  return rows.map(withRevision).sort((a,b)=>(b.createdAt || 0)-(a.createdAt || 0));
}
const withRevision=row=>row?{...row,revision:row.revision || 'legacy'}:undefined;
export async function getEpisode(id) { return withRevision(await transaction('readonly',s=>s.get(id))); }
export async function saveEpisode(episode) {
  if (!episode || typeof episode.id !== 'string' || !episode.id || episode.id.length>128) throw new Error('Invalid library episode identifier');
  const {id,title,audio,doc,createdAt} = episode;
  const expectedRevision=episode.revision ?? null;
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('episodes','readwrite'),store=tx.objectStore('episodes');
    let failure,saved;
    const read=store.get(id);
    read.onsuccess=()=>{
      const current=withRevision(read.result);
      if((current?.revision ?? null)!==expectedRevision){failure=new Error('Episode changed or was deleted in another tab. Result not saved.');tx.abort();return;}
      saved={id,title,audio,doc,createdAt,revision:crypto.randomUUID()};
      for(const field of episodeMetadataFields)if(Object.hasOwn(episode,field))saved[field]=episode[field];
      store.put(saved);
    };
    tx.oncomplete=()=>resolve(saved);
    tx.onabort=()=>reject(failure || new Error('Local library write failed. Check storage quota and permissions.'));
    tx.onerror=()=>{};
  });
}
export async function deleteEpisode(id) { return transaction('readwrite',s=>s.delete(id)); }
export async function clearEpisodes() { return transaction('readwrite',s=>s.clear()); }
