const DATABASE='tisya-durable-workspace-v1',SCHEMA='tisya.durable-workspace/1';
const copy=structuredClone;
const failure=(code,message,cause)=>Object.assign(Error(message,cause?{cause}:undefined),{code});
const text=(value,label)=>{if(typeof value!=='string'||!value.length)throw failure('WORKSPACE_ARGUMENT',label+'必须为非空字符串');return value;};

// Snapshot values are data, never live host objects. This representation retains
// undefined, array holes and number types rather than silently dropping them.
function encoded(value,seen=new Set()){
 if(value===undefined)return ['undefined'];
 if(value===null)return ['null'];
 if(typeof value==='string'||typeof value==='boolean')return [typeof value,value];
 if(typeof value==='number')return ['number',Object.is(value,-0)?'-0':String(value)];
 if(typeof value==='bigint')return ['bigint',String(value)];
 if(typeof value!=='object'||seen.has(value))throw failure('WORKSPACE_DATA','工作区快照必须是可保存的数据，不能包含循环或运行对象');
 seen.add(value);let result;
 if(Array.isArray(value))result=['array',Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)?encoded(value[i],seen):['hole']),Object.keys(value).filter(key=>!(/^(0|[1-9]\d*)$/.test(key)&&Number(key)<value.length)).sort().map(key=>[key,encoded(value[key],seen)])];
 else if(value instanceof Date)result=['date',String(value.getTime())];
 else {const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw failure('WORKSPACE_DATA','工作区快照包含不支持的运行对象');result=['object',Object.keys(value).sort().map(key=>[key,encoded(value[key],seen)])];}
 seen.delete(value);return result;
}
const fingerprint=value=>JSON.stringify(encoded(value));
const bytes=value=>new TextEncoder().encode(value).byteLength;
function ownerOf(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw failure('WORKSPACE_ARGUMENT','工作区缺少所属卡身份');
 const owner=copy(value);owner.account=Object.hasOwn(value,'account')?value.account:'local';text(owner.account,'账号');text(owner.cardId,'卡身份');text(owner.cardName,'卡名称');
 if(owner.chatId!==undefined)text(owner.chatId,'存档身份');if(owner.chatName!==undefined)text(owner.chatName,'存档名称');return owner;
}
const identity=owner=>JSON.stringify([owner.account,owner.cardId,owner.chatId??null]);

/** A reusable persisted working copy, not a host save receipt or authority lease.
 * Keys identify individual messages/books/cards. get() returns a cloned envelope;
 * list() omits payloads. All mutations await committed IDB transactions. No row
 * is evicted automatically; failures retain dirty data until an explicit retry.
 */
export function createDurableWorkspace({indexedDB,onError=()=>{},now=()=>Date.now()}={}){
 const rows=new Map();let db=null,closed=false,tail=Promise.resolve(),openingError=null;
 const report=error=>{try{onError(error);}catch{}return error;};
 const assertOpen=()=>{if(closed)throw failure('WORKSPACE_DISPOSED','持久工作区已关闭');};
 const serial=work=>{const job=tail.then(work);tail=job.catch(()=>{});return job;};
 const envelope=row=>copy({...row.record,state:row.state,...row.error?{error:row.error}:{},...row.remove?{deletePending:true}:{}});
 const summary=row=>{const {data,...record}=row.record;return copy({...record,state:row.state,...row.error?{error:row.error}:{},...row.remove?{deletePending:true}:{}});};
 const fromSaved=record=>{if(record?.schema!==SCHEMA||typeof record.key!=='string'||typeof record.revision!=='string')throw failure('WORKSPACE_FORMAT','持久工作区记录格式损坏，未自动清空');ownerOf(record.owner);return {record:copy(record),savedRevision:record.revision,signature:fingerprint({kind:record.kind,owner:record.owner,data:record.data,sourceRevision:record.sourceRevision}),state:'saved',remove:false};};
 const conflict=()=>failure('WORKSPACE_CONFLICT','这份工作区已被其他窗口更新或删除，未覆盖它；本地修改仍保留');
 function transaction(mode,work){
  return new Promise((resolve,reject)=>{
   let tx,result,reason;
   try{tx=db.transaction('records',mode);tx.oncomplete=()=>resolve(result);tx.onerror=()=>{};tx.onabort=()=>reject(reason??tx.error??failure('WORKSPACE_STORAGE','工作区本地事务已中止'));
    work(tx.objectStore('records'),value=>{result=value;},error=>{reason=error;tx.abort();});
   }catch(error){if(tx){reason=error;try{tx.abort();}catch{reject(error);}}else reject(error);}
  });
 }
 const ready=(async()=>{
  if(!indexedDB?.open)throw failure('WORKSPACE_UNAVAILABLE','当前环境没有持久工作区存储能力');
  db=await new Promise((resolve,reject)=>{let settled=false;const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('records'))request.result.createObjectStore('records',{keyPath:'key'});};request.onsuccess=()=>{if(settled){request.result.close();return;}settled=true;resolve(request.result);};request.onerror=()=>{settled=true;reject(request.error??failure('WORKSPACE_STORAGE','持久工作区无法打开'));};request.onblocked=()=>{settled=true;reject(failure('WORKSPACE_BLOCKED','持久工作区被旧窗口占用，请关闭旧窗口后重试'));};});
  db.onversionchange=()=>{db.close();db=null;openingError=report(failure('WORKSPACE_VERSION_CHANGED','持久工作区版本已变化，请重新打开'));};
  const saved=await transaction('readonly',(store,done)=>{const request=store.getAll();request.onsuccess=()=>done(request.result);});
  for(const record of saved)rows.set(record.key,fromSaved(record));
 })().catch(error=>{db?.close();db=null;openingError=report(error);throw error;});
 // Owners may attach their ready handler after constructing dependent services.
 ready.catch(()=>{});
 async function usable(){assertOpen();await ready;if(openingError)throw openingError;if(!db)throw failure('WORKSPACE_UNAVAILABLE','持久工作区尚不可用');}
 async function persist(row){
  row.state='pending';delete row.error;
   try{await transaction('readwrite',(store,done,abort)=>{const request=store.get(row.record.key);request.onsuccess=()=>{try{
    const actual=request.result;if((actual?.revision??null)!==(row.savedRevision??null)){abort(conflict());return;}
    if(row.remove)store.delete(row.record.key);else store.put(row.record);
   }catch(error){abort(error);}};});
   if(row.remove)rows.delete(row.record.key);else {row.state='saved';row.savedRevision=row.record.revision;}
   return row.remove?{removed:true,key:row.record.key}:envelope(row);
  }catch(error){row.state='error';row.error=error.message;report(error);throw error;}
 }
 async function verifyUnchanged(row){
  try{const actual=await transaction('readonly',(store,done)=>{const request=store.get(row.record.key);request.onsuccess=()=>done(request.result);});if(actual?.revision!==row.savedRevision)throw conflict();return envelope(row);}
  catch(error){row.state='error';row.error=error.message;report(error);throw error;}
 }
 function put(key,input){
  assertOpen();text(key,'工作区记录键');const snapshot=copy(input),owner=ownerOf(snapshot?.owner);text(snapshot.kind,'工作区种类');const data={kind:snapshot.kind,owner,data:snapshot.data,...Object.hasOwn(snapshot,'sourceRevision')?{sourceRevision:snapshot.sourceRevision}:{}};const signature=fingerprint({...data,sourceRevision:data.sourceRevision});
  return serial(async()=>{await usable();const old=rows.get(key);if(old&&identity(old.record.owner)!==identity(owner))throw failure('WORKSPACE_OWNER','工作区键属于另一账号、卡或存档，未覆盖原记录');
   if(old&&!old.remove&&old.signature===signature){if(old.state==='saved')return verifyUnchanged(old);return persist(old);}
   const stamp=now();if(!Number.isFinite(stamp))throw failure('WORKSPACE_ARGUMENT','工作区保存时间无效');
   const record={schema:SCHEMA,key,...data,updatedAt:stamp,bytes:bytes(signature),revision:globalThis.crypto.randomUUID()};const row={record,signature,savedRevision:old?.savedRevision??null,state:'pending',remove:false};rows.set(key,row);return persist(row);
  });
 }
 function remove(key){assertOpen();text(key,'工作区记录键');return serial(async()=>{await usable();let row=rows.get(key);if(!row){const record=await transaction('readonly',(store,done)=>{const request=store.get(key);request.onsuccess=()=>done(request.result);});if(!record)return {removed:false,key};row={record:copy(record),savedRevision:record.revision,state:'saved',remove:false};rows.set(key,row);}row.remove=true;return persist(row);});}
 function selection(filter,all){
  if(all)return ()=>true;if(!filter||typeof filter!=='object'||Array.isArray(filter))throw failure('WORKSPACE_ARGUMENT','请选择要清理的卡或存档');
  const account=Object.hasOwn(filter,'account')?filter.account:'local';text(account,'账号');if(filter.cardId===undefined&&filter.chatId===undefined)throw failure('WORKSPACE_ARGUMENT','清理必须指定卡或存档，全部清理请显式使用 clearAll');
  if(filter.cardId!==undefined)text(filter.cardId,'卡身份');if(filter.chatId!==undefined)text(filter.chatId,'存档身份');
  return record=>record.owner.account===account&&(filter.cardId===undefined||record.owner.cardId===filter.cardId)&&(filter.chatId===undefined||record.owner.chatId===filter.chatId);
 }
 function clearSelection(filter,all){const matches=selection(filter,all);assertOpen();return serial(async()=>{await usable();const removed=[];
   try{await transaction('readwrite',(store,done,abort)=>{const request=store.getAll();request.onsuccess=()=>{try{for(const record of request.result)if(matches(record)){store.delete(record.key);removed.push(record.key);}}catch(error){abort(error);}};});
    // A successful explicit clear also discards unsaved derived rows in scope.
    for(const [key,row]of rows)if(matches(row.record)){rows.delete(key);if(!removed.includes(key))removed.push(key);}return {removed:removed.length,keys:removed};
   }catch(error){for(const row of rows.values())if(matches(row.record)){row.state='error';row.error=error.message;row.remove=true;}report(error);throw error;}
  });}
 async function flush(){return serial(async()=>{await usable();let saved=0,removed=0;for(const row of [...rows.values()])if(row.state!=='saved'){const deleting=row.remove;await persist(row);if(deleting)removed++;else saved++;}return {saved,removed};});}
 function reload(key,{discardDirty=false}={}){
  assertOpen();if(key!==undefined)text(key,'工作区记录键');
  return serial(async()=>{await usable();const selected=[...rows.values()].filter(row=>key===undefined||row.record.key===key);if(!discardDirty&&selected.some(row=>row.state!=='saved'))throw failure('WORKSPACE_DIRTY','本地工作区仍有未保存修改；明确放弃本地副本后才能重新读取');
   const saved=await transaction('readonly',(store,done)=>{const request=key===undefined?store.getAll():store.get(key);request.onsuccess=()=>done(key===undefined?request.result:request.result?[request.result]:[]);});const fresh=saved.map(fromSaved);
   if(key===undefined)rows.clear();else rows.delete(key);for(const row of fresh)rows.set(row.record.key,row);return key===undefined?fresh.map(summary):fresh[0]?envelope(fresh[0]):null;
  });
 }
 return Object.freeze({ready,
  async get(key){text(key,'工作区记录键');await usable();const row=rows.get(key);return row?envelope(row):null;},
  put,remove,clear:filter=>clearSelection(filter,false),clearAll:()=>clearSelection(null,true),flush,reload,
  async list(){await usable();return [...rows.values()].map(summary);},
  async dispose(){if(closed)return;if(openingError&&!db){closed=true;return;}await flush();closed=true;db?.close();db=null;},
 });
}
