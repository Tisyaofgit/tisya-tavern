// 统一 IndexedDB 基础设施。所有本地媒体库与派生缓存共用同一套打开握手
// （版本/schema/blocked/versionchange）、事务封装（错误归一、可选无进展看门狗）
// 与一次性搬迁（复制→核对→删除旧库）。禁止各模块自建 indexedDB.open 或私有事务链。

// openDatabase：声明式打开。schema(db, oldVersion) 在 upgradeneeded 内执行，抛错即
// 中止升级并拒绝；watchFor(phase, onTimeout) 由调用方提供无进展看门狗（须返回
// {progress(), stop()}），超时以 messages.timeout 拒绝，随后到达的成功只关闭句柄。
export function openDatabase({indexedDB,name,version,schema=null,label='数据',messages={},watchFor=null,onVersionChange=null}){
 return new Promise((resolve,reject)=>{
  let settled=false,request;
  const settle=(fn,v)=>{if(settled)return;settled=true;watch?.stop();fn(v);};
  const watch=watchFor?.('open',()=>settle(reject,messages.timeout?.('open')??Error(label+'打开超时')));
  try{request=version===undefined?indexedDB.open(name):indexedDB.open(name,version);}catch(error){settle(reject,error);return;}
  request.onupgradeneeded=()=>{if(!schema)return;try{schema(request.result,request.oldVersion??0);}catch(error){try{request.transaction.abort();}catch{}settle(reject,error);}};
  request.onblocked=()=>settle(reject,messages.blocked?.()??Error(label+'升级被旧页面占用，请关闭旧页面后重试'));
  request.onerror=()=>settle(reject,messages.open?messages.open(request.error):(request.error??Error(label+'无法打开')));
  request.onsuccess=()=>{const db=request.result;if(settled||!db){db?.close();return;}db.onversionchange=()=>{db.close();onVersionChange?.(db);};settle(resolve,db);};
 });
}

// openExistingDatabase：只读探开，绝不创建。库不存在（触发升级即中止）或缺少必需
// store 时返回 null。databases() 可用时先查名录，避免触发升级事务。
export async function openExistingDatabase({indexedDB,name,label='数据',messages={},requireStores=[],onVersionChange=null}){
 if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(entry=>entry.name===name))return null;
 return new Promise((resolve,reject)=>{
  let nonexistent=false;const request=indexedDB.open(name);
  request.onupgradeneeded=()=>{nonexistent=true;try{request.transaction.abort();}catch{}};
  request.onerror=()=>nonexistent?resolve(null):reject(messages.open?messages.open(request.error):(request.error??Error(label+'无法打开')));
  request.onblocked=()=>reject(messages.blocked?.()??Error(label+'正被其他页面占用，请稍后重试'));
  request.onsuccess=()=>{const db=request.result;if(requireStores.some(store=>!db.objectStoreNames.contains(store))){db.close();resolve(null);return;}db.onversionchange=()=>{db.close();onVersionChange?.(db);};resolve(db);};
 });
}

// transact：统一事务封装。work(store, set, progress)；onerror 默认透传 DOMException，
// 可用 onError 包装成面向用户的文案；看门狗超时先以「label超时（phase）」拒绝再中止。
export function transact(db,storeName,mode,work,{label='数据',phase=mode,watchFor=null,onError=null}={}){
 return new Promise((resolve,reject)=>{
  let value,settled=false,tx;
  try{tx=db.transaction(storeName,mode);}catch(error){reject(error);return;}
  const settle=(fn,v)=>{if(settled)return;settled=true;watch?.stop();fn(v);};
  const watch=watchFor?.(phase,()=>{settle(reject,Error(label+'超时（'+phase+'）'));try{tx.abort();}catch{}});
  tx.oncomplete=()=>settle(resolve,value);
  tx.onerror=()=>settle(reject,onError?onError(tx.error):(tx.error??Error(label+'失败')));
  tx.onabort=()=>settle(reject,tx.error??Error(label+'已中止。'));
  try{work(tx.objectStore(storeName),v=>value=v,()=>watch?.progress());}catch(error){settle(reject,error);try{tx.abort();}catch{}}
 });
}

const relocationFlights=new Map();

// relocateLegacyDatabase：一次性搬迁。旧库不存在时零副作用（不创建目标库）；存在时
// 逐 store 原子复制（同一事务内全量 put，键同则幂等），复制后按条数核对，再删除旧库。
// 删除被其他页面阻塞时保留旧库待下次清理，不影响已核对的新库数据。同库并发共享一单。
export async function relocateLegacyDatabase({indexedDB,from,stores,target,label='数据'}){
 const key=from+'→'+target.name;
 if(relocationFlights.has(key))return relocationFlights.get(key);
 const task=(async()=>{
  const legacy=await openExistingDatabase({indexedDB,name:from,label});
  if(!legacy)return {from,relocated:false,moved:0,deleted:false};
  try{
   const db=await openDatabase({indexedDB,name:target.name,version:target.version,schema:target.schema,label});
   let moved=0;
   try{
    for(const {from:sourceStore,to:targetStore}of stores){
     if(!legacy.objectStoreNames.contains(sourceStore))continue;
     const records=await transact(legacy,sourceStore,'readonly',(store,set)=>{const request=store.getAll();request.onsuccess=()=>set(request.result??[]);},{label,phase:'搬迁读取'});
     await transact(db,targetStore,'readwrite',store=>{for(const record of records)store.put(record);},{label,phase:'搬迁写入'});
     const count=await transact(db,targetStore,'readonly',(store,set)=>{const request=store.count();request.onsuccess=()=>set(request.result??0);},{label,phase:'搬迁核对'});
     if(count<records.length)throw Error(label+'搬迁核对失败：'+sourceStore+'（'+count+'/'+records.length+'）');
     moved+=records.length;
    }
   }finally{db.close();}
   const deleted=await new Promise(resolve=>{let request;try{request=indexedDB.deleteDatabase(from);}catch{resolve(false);return;}request.onsuccess=()=>resolve(true);request.onerror=()=>resolve(false);request.onblocked=()=>resolve(false);});
   return {from,relocated:true,moved,deleted};
  }finally{legacy.close();}
 })();
 relocationFlights.set(key,task);
 try{return await task;}finally{if(relocationFlights.get(key)===task)relocationFlights.delete(key);}
}
