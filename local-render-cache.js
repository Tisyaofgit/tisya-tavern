// Local derived display cache only: never feeds prompts, commits or native chat.
// One bounded snapshot, versioned with the renderer. No network or external data.
export function createLocalRenderCache(window,{version,snapshot,restore,onError=()=>{}}){
 let db=null,timer=null,closed=false,state='loading',error=null,writes=Promise.resolve();
 const report=()=>({state,error});
 const failed=e=>{state='failed';error=e.message??String(e);onError(Error('本地显示缓存未保存：'+error));};
 const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error??Error('缓存读写失败'));});
 const transaction=(mode,work)=>new Promise((resolve,reject)=>{const tx=db.transaction('snapshots',mode);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??Error('缓存事务失败'));tx.onabort=()=>reject(tx.error??Error('缓存事务中止'));work(tx.objectStore('snapshots'));});
 const ready=(async()=>{
  if(!window.indexedDB){state='unsupported';return;}
  const open=window.indexedDB.open('tisya-render-cache',1);open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('snapshots'))open.result.createObjectStore('snapshots');};
  open.onblocked=()=>{state='blocked';onError(Error('本地显示缓存被其他窗口占用'));};db=await request(open);db.onversionchange=()=>{db.close();db=null;state='closed';};
  if(closed){db.close();db=null;return;}
  const saved=await request(db.transaction('snapshots','readonly').objectStore('snapshots').get('reader'));
  if(saved?.version===version)restore(saved.rows);state='ready';
 })().catch(failed);
 function flush(){window.clearTimeout(timer);timer=null;writes=writes.then(async()=>{await ready;if(closed||!db||state!=='ready')return;const rows=snapshot();await transaction('readwrite',store=>store.put({version,rows},'reader'));}).catch(failed);return writes;}
 return {ready,report,schedule(){if(closed||['unsupported','closed','failed','blocked'].includes(state))return;window.clearTimeout(timer);timer=window.setTimeout(flush,1200);},flush,
  async clear(){window.clearTimeout(timer);timer=null;await ready;await writes;if(!db)throw Error('本地显示缓存尚不可用');await transaction('readwrite',store=>store.delete('reader'));},
  async dispose(){await flush();closed=true;window.clearTimeout(timer);db?.close();db=null;}
 };
}
