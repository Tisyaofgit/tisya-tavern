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
function sameInventory(a,b){
 if(!a||a.complete!==b.complete||a.owners.size!==b.owners.size)return false;
 for(const [owner,row]of a.owners){const next=b.owners.get(owner);if(!next||row.cold!==next.cold||row.count!==next.count||row.sources.size!==next.sources.size||[...row.sources].some(s=>!next.sources.has(s)))return false;}
 return true;
}
export function createMessageCache(window,{version,onError=()=>{},digest,timeout=2500}={}){
 let db=null,state='loading',error=null,closed=false,epoch=0,hits=0,misses=0,tail=Promise.resolve();
 let lastFailure=null,delayedTicks=0,maxSchedulingGap=0;
 const now=()=>globalThis.performance.now();
 // An overdue timer is not evidence that IndexedDB stopped: its success/commit
 // tasks may have been waiting behind the same long rendering task. Charge at
 // most one scheduled interval per callback, not the excess scheduling delay.
 // Every callback still spends budget, even while hidden or repeatedly late:
 // a stalled operation cannot receive an unlimited series of exemptions.
 // Opening, reads, writes and cleanup share this no-progress policy.
 function watchTimeout(phase,onTimeout){
  const interval=Math.max(1,Math.min(100,timeout/4)),started=now();
  const schedule=window.setTimeout?.bind(window)??setTimeout,cancel=window.clearTimeout?.bind(window)??clearTimeout;
  let last=started,remaining=timeout,timer,done=false,delayedMs=0,confirming=false;
  const tick=()=>{
   if(done)return;const at=now(),elapsed=at-last;last=at;
   if(elapsed>interval*2){delayedMs+=elapsed-interval;delayedTicks++;maxSchedulingGap=Math.max(maxSchedulingGap,elapsed);}
   remaining-=Math.min(elapsed,interval);
   if(remaining<=0){
    // If the final tick itself was delayed, allow queued success/commit tasks
    // one turn before aborting. This confirmation is never renewed by lateness.
    if(elapsed>interval*2&&!confirming){confirming=true;timer=schedule(tick,interval);return;}
    done=true;lastFailure={phase,elapsedMs:Math.round(at-started),schedulingDelayMs:Math.round(delayedMs),noProgressBudgetMs:timeout};onTimeout();
   }
   else timer=schedule(tick,interval);
  };
  timer=schedule(tick,interval);
  return {progress(){if(!done){remaining=timeout;last=now();confirming=false;}},stop(){done=true;cancel(timer);}};
 }
 const inventories=new Map(),knownScopes=new Set(),inflight=new Map(),reconciliations=new Map();
 const hash=digest??(async text=>{const data=new TextEncoder().encode(text),bytes=await window.crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');});
 const fail=e=>{const first=state!=='failed';state='failed';error=e.message??String(e);if(first)onError(Error('逐条显示缓存不可用：'+error+'。原聊天未修改。'));};
 const ready=(async()=>{
  if(!window.indexedDB){state='unsupported';onError(Error('当前宿主不支持逐条显示缓存；原聊天未修改。'));return;}
  db=await new Promise((resolve,reject)=>{
   const open=window.indexedDB.open('tisya-render-cache',2);let done=false;
   const stop=e=>{if(done)return;done=true;watch.stop();reject(e);};
   const watch=watchTimeout('open',()=>stop(Error('缓存读取超时，已继续显示原消息')));
   open.onupgradeneeded=()=>{const d=open.result;if(d.objectStoreNames.contains('snapshots'))d.deleteObjectStore('snapshots');if(!d.objectStoreNames.contains('messages')){const s=d.createObjectStore('messages',{keyPath:'id'});s.createIndex('scope','scope');}};
   open.onblocked=()=>stop(Error('显示缓存升级被旧窗口占用，请关闭旧窗口后重试'));
   open.onerror=()=>stop(open.error??Error('无法打开显示缓存'));
   open.onsuccess=()=>{if(done){open.result.close();return;}done=true;watch.stop();resolve(open.result);};
  });
  if(closed){db.close();db=null;return;}
  db.onversionchange=()=>{db.close();db=null;state='closed';onError(Error('显示缓存版本已变更，请重新加载扩展。'));};
  state='ready';
 })().catch(fail);
 const allowed=(inv,owner,source)=>{const row=inv.owners.get(owner);return row?row.cold||row.sources.has(source):!inv.complete;};
 const eligible=(scope,owner,source)=>{const inv=inventories.get(scope);return inv?allowed(inv,owner,source):!knownScopes.has(scope);};
 function transaction(mode,work,phase=mode){return new Promise((resolve,reject)=>{
  if(!db){reject(Error('缓存尚不可用'));return;}
  const tx=db.transaction('messages',mode);let value,done=false;
  const finish=(error)=>{if(done)return;done=true;watch.stop();error?reject(error):resolve(value);};
  const watch=watchTimeout(phase,()=>{finish(Error('显示缓存事务超时（'+phase+'）'));try{tx.abort();}catch{}});
  const progress=()=>watch.progress();
  tx.oncomplete=()=>finish();tx.onerror=()=>finish(tx.error??Error('缓存事务失败'));tx.onabort=()=>finish(tx.error??Error('缓存事务中止'));
  try{work(tx.objectStore('messages'),v=>value=v,progress);}catch(e){finish(e);try{tx.abort();}catch{}}
 });}

 function enqueue(work){const operation=tail.then(async()=>{await ready;if(closed||state!=='ready'||!db)return;return work();});tail=operation.catch(fail);return tail;}
 async function key(scope,owner,source){return JSON.stringify([scope,await hash(JSON.stringify([version,owner,source]))]);}
 function valid(row,id,scope,owner,source){if(!row)return;if(row.id!==id||row.scope!==scope||row.owner!==owner||row.source!==source||row.version!==version||!Array.isArray(row.projections))throw Error('缓存内容与原消息不符');}
 async function readRow(scope,owner,source){await ready;if(closed||state!=='ready'||!db)return null;const id=await key(scope,owner,source);const row=await transaction('readonly',(store,set,progress)=>{const r=store.get(id);r.onsuccess=()=>{progress();set(r.result);};},'读取');valid(row,id,scope,owner,source);return row??{id,scope,owner,source,version,projections:[]};}
 const writeRow=row=>transaction('readwrite',(store,set,progress)=>{store.put(row).onsuccess=progress;},'写入');
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
    if(started===epoch&&eligible(scope,owner,source))await writeRow(current);
   });
   return {value,view:inventories.get(scope)?.owners.get(owner)?.count>1?null:row?.view??null,fromDisk:!!cached};
  })();inflight.set(signature,job);job.finally(()=>{if(inflight.get(signature)===job)inflight.delete(signature);}).catch(()=>{});return job;
 }
 function saveView({scope,owner,source},view){if(inventories.get(scope)?.owners.get(owner)?.count>1)return Promise.resolve();const started=epoch;return enqueue(async()=>{if(started!==epoch||!eligible(scope,owner,source))return;const row=await readRow(scope,owner,source);if(!row||started!==epoch||!eligible(scope,owner,source))return;row.view=view;await writeRow(row);});}
 function reconcile(scope,messages){
  const inventory=messageCacheInventory(messages);if(sameInventory(inventories.get(scope),inventory))return reconciliations.get(scope)?.promise??Promise.resolve();
  knownScopes.add(scope);inventories.delete(scope);inventories.set(scope,inventory);
  while(inventories.size>3)inventories.delete(inventories.keys().next().value);
  const existing=reconciliations.get(scope);if(existing){existing.inventory=inventory;return existing.promise;}
  const job={inventory,promise:null},started=epoch;reconciliations.set(scope,job);
  job.promise=enqueue(async()=>{
   let scanned;
   do{
    scanned=job.inventory;let after=null,more=true;
    while(more&&!closed&&started===epoch&&state==='ready'){
     const page=await transaction('readwrite',(store,set,progress)=>{
      let count=0,last=after;const began=Date.now(),cursor=store.index('scope').openCursor(scope);
      cursor.onsuccess=()=>{progress();const c=cursor.result;if(!c){set({after:last,more:false});return;}
       if(after!==null&&window.indexedDB.cmp(c.primaryKey,after)<=0){if(window.indexedDB.cmp(c.primaryKey,after)<0)c.continuePrimaryKey(scope,after);else c.continue();return;}
       last=c.primaryKey;const row=c.value;if(row.version!==version||!allowed(job.inventory,row.owner,row.source))c.delete().onsuccess=progress;
       count++;if(count>=32||Date.now()-began>=8){set({after:last,more:true});return;}c.continue();
      };
     },'清理');
     after=page.after;more=page.more;
     if(more)await new Promise(resolve=>setTimeout(resolve,0));
    }
   }while(scanned!==job.inventory&&!closed&&started===epoch&&state==='ready');
  });
  job.promise.finally(()=>{if(reconciliations.get(scope)===job)reconciliations.delete(scope);}).catch(()=>{});return job.promise;
 }
 async function clear(){epoch++;inflight.clear();await enqueue(()=>transaction('readwrite',(store,set,progress)=>{store.clear().onsuccess=progress;},'清空'));if(state!=='ready')throw Error('显示缓存未清理：'+(error??state));}
 return {ready,prepare,saveView,reconcile,clear,flush:()=>tail,report:()=>({state,error,hits,misses,pending:inflight.size,delayedTicks,maxSchedulingGapMs:Math.round(maxSchedulingGap),lastFailure:lastFailure?{...lastFailure}:null}),async dispose(){await tail;closed=true;epoch++;db?.close();db=null;state='closed';}};
}
