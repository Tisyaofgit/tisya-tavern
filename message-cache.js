// Persistent derived message data. Never writes chat, variables or native frames.
// Hot memory may evict freely; disk entries survive until their source is removed.
export function messageCacheOwner(message){
 return JSON.stringify([message.send_date??null,message.name??null,message.is_user===true,message.is_system===true,message.role??null]);
}
export function messageCacheInventory(messages){
 const owners=new Map();let complete=true;
 for(const message of messages??[]){
  if(!message||typeof message.mes!=='string'){complete=false;continue;}
  const owner=messageCacheOwner(message);let row=owners.get(owner);
  if(!row){row={sources:new Set(),cold:false,count:0};owners.set(owner,row);}
  row.count++;row.sources.add(message.mes);row.cold ||= !!message.tt_swipe_cold;
  for(const source of message.swipes??[])if(typeof source==='string')row.sources.add(source);else row.cold=true;
 }
 return {owners,complete};
}
export function createMessageCache(window,{version,onError=()=>{},digest,timeout=2500}={}){
 let db=null,state='loading',error=null,closed=false,epoch=0,hits=0,misses=0,tail=Promise.resolve();
 const inventories=new Map(),knownScopes=new Set(),inflight=new Map();
 const hash=digest??(async text=>{const data=new TextEncoder().encode(text),bytes=await window.crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');});
 const fail=e=>{const first=state!=='failed';state='failed';error=e.message??String(e);if(first)onError(Error('逐条显示缓存不可用：'+error+'。原聊天未修改。'));};
 const ready=(async()=>{
  if(!window.indexedDB){state='unsupported';onError(Error('当前宿主不支持逐条显示缓存；原聊天未修改。'));return;}
  db=await new Promise((resolve,reject)=>{
   const open=window.indexedDB.open('tisya-render-cache',2);let done=false;
   const stop=e=>{if(done)return;done=true;clearTimeout(timer);reject(e);};
   const timer=setTimeout(()=>stop(Error('缓存读取超时，已继续显示原消息')),timeout);
   open.onupgradeneeded=()=>{const d=open.result;if(d.objectStoreNames.contains('snapshots'))d.deleteObjectStore('snapshots');if(!d.objectStoreNames.contains('messages')){const s=d.createObjectStore('messages',{keyPath:'id'});s.createIndex('scope','scope');}};
   open.onblocked=()=>stop(Error('显示缓存升级被旧窗口占用，请关闭旧窗口后重试'));
   open.onerror=()=>stop(open.error??Error('无法打开显示缓存'));
   open.onsuccess=()=>{if(done){open.result.close();return;}done=true;clearTimeout(timer);resolve(open.result);};
  });
  if(closed){db.close();db=null;return;}
  db.onversionchange=()=>{db.close();db=null;state='closed';onError(Error('显示缓存版本已变更，请重新加载扩展。'));};
  state='ready';
 })().catch(fail);
 const allowed=(inv,owner,source)=>{const row=inv.owners.get(owner);return row?row.cold||row.sources.has(source):!inv.complete;};
 const eligible=(scope,owner,source)=>{const inv=inventories.get(scope);return inv?allowed(inv,owner,source):!knownScopes.has(scope);};
 function transaction(mode,work){return new Promise((resolve,reject)=>{
  if(!db){reject(Error('缓存尚不可用'));return;}
  const tx=db.transaction('messages',mode);let value,done=false;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{finish(Error('显示缓存事务超时'));try{tx.abort();}catch{}},timeout);
  tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error??Error('缓存事务失败'));tx.onabort=()=>finish(tx.error??Error('缓存事务中止'));
  try{work(tx.objectStore('messages'),v=>value=v);}catch(e){finish(e);try{tx.abort();}catch{}}
 });}

 function enqueue(work){const operation=tail.then(async()=>{await ready;if(closed||state!=='ready'||!db)return;return work();});tail=operation.catch(fail);return tail;}
 async function key(scope,owner,source){return JSON.stringify([scope,await hash(JSON.stringify([version,owner,source]))]);}
 function valid(row,id,scope,owner,source){if(!row)return;if(row.id!==id||row.scope!==scope||row.owner!==owner||row.source!==source||row.version!==version||!Array.isArray(row.projections))throw Error('缓存内容与原消息不符');}
 async function readRow(scope,owner,source){await ready;if(closed||state!=='ready'||!db)return null;const id=await key(scope,owner,source);const row=await transaction('readonly',(store,set)=>{const r=store.get(id);r.onsuccess=()=>set(r.result);});valid(row,id,scope,owner,source);return row??{id,scope,owner,source,version,projections:[]};}
 function prepare({scope,owner,source,variant},compute){
  const started=epoch,signature=JSON.stringify([started,scope,owner,source,variant]);if(inflight.has(signature))return inflight.get(signature);
  const job=(async()=>{
   let row;try{row=await readRow(scope,owner,source);}catch(e){fail(e);}
   if(started!==epoch)row=null;
   const cached=row?.projections.find(p=>p.variant===variant);let value;
   if(cached){hits++;value=cached.value;}else{misses++;value=compute();}
   if(row&&!cached&&started===epoch&&eligible(scope,owner,source))enqueue(async()=>{
    if(started!==epoch||!eligible(scope,owner,source))return;
    // Re-read inside the serialized queue so a concurrent view-state save is retained.
    const current=await readRow(scope,owner,source);if(!current)return;
    current.projections=current.projections.filter(p=>p.variant!==variant);current.projections.push({variant,value});current.projections=current.projections.slice(-4);
    if(started===epoch&&eligible(scope,owner,source))await transaction('readwrite',store=>store.put(current));
   });
   return {value,view:inventories.get(scope)?.owners.get(owner)?.count>1?null:row?.view??null,fromDisk:!!cached};
  })();inflight.set(signature,job);job.finally(()=>{if(inflight.get(signature)===job)inflight.delete(signature);}).catch(()=>{});return job;
 }
 function saveView({scope,owner,source},view){if(inventories.get(scope)?.owners.get(owner)?.count>1)return Promise.resolve();const started=epoch;return enqueue(async()=>{if(started!==epoch||!eligible(scope,owner,source))return;const row=await readRow(scope,owner,source);if(!row||started!==epoch||!eligible(scope,owner,source))return;row.view=view;await transaction('readwrite',store=>store.put(row));});}
 function reconcile(scope,messages){
  const inventory=messageCacheInventory(messages);knownScopes.add(scope);inventories.delete(scope);inventories.set(scope,inventory);
  while(inventories.size>3)inventories.delete(inventories.keys().next().value);
  return enqueue(()=>transaction('readwrite',store=>{const cursor=store.index('scope').openCursor(scope);cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;const row=c.value;if(row.version!==version||!allowed(inventories.get(scope)??inventory,row.owner,row.source))c.delete();c.continue();};}));
 }
 async function clear(){epoch++;inflight.clear();await enqueue(()=>transaction('readwrite',store=>store.clear()));if(state!=='ready')throw Error('显示缓存未清理：'+(error??state));}
 return {ready,prepare,saveView,reconcile,clear,flush:()=>tail,report:()=>({state,error,hits,misses,pending:inflight.size}),async dispose(){await tail;closed=true;epoch++;db?.close();db=null;state='closed';}};
}
