// Read only media originals already registered in this message's frozen phone
// snapshot. Opening a reader never creates a database, asset or sharing grant.
export function createPhonePresentationMedia({indexedDB=globalThis.indexedDB,URL=globalThis.URL,getContextKey}={}){
 const urls=new Map();let connection=null;
 const keyOf=(snapshot,contextKey,id)=>JSON.stringify([snapshot.life.mediaOriginContextKey??contextKey,snapshot.life.bindingKey,id]);
 const assertScope=contextKey=>{if(getContextKey()!==contextKey)throw Error('读取媒体时聊天已切换');};
 async function openExisting(){
  if(connection)return connection;
  if(!indexedDB)return null;
  if(typeof indexedDB.databases==='function'&&!(await indexedDB.databases()).some(d=>d.name==='tisya-phone-host-media'))return null;
  return new Promise((resolve,reject)=>{const request=indexedDB.open('tisya-phone-host-media');let nonexistent=false;
   request.onupgradeneeded=()=>{nonexistent=true;request.transaction.abort();};
   request.onerror=()=>nonexistent?resolve(null):reject(Error('媒体原件库读取失败：'+(request.error?.message??'未知错误')));
   request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('assets')){db.close();resolve(null);return;}connection=db;db.onversionchange=()=>{db.close();if(connection===db)connection=null;};resolve(db);};request.onblocked=()=>reject(Error('媒体库正被其他页面占用，请稍后重试'));
  });
 }
 async function readMedia({ids,snapshot,contextKey}){
  assertScope(contextKey);if(!snapshot?.life?.bindingKey||!Array.isArray(ids))return [];
  const state=snapshot.life.state,authorized=new Map();
  for(const row of state.media?.photos??[])if(row.source==='file')authorized.set(row.id,{kind:'image',name:row.name});
  for(const row of state.media?.songs??[])if(row.audioId)authorized.set(row.audioId,{kind:'audio',name:row.title});
  const chosen=[...new Set(ids)].filter(id=>authorized.has(id));if(!chosen.length)return [];
  const db=await openExisting();assertScope(contextKey);if(!db)return [];
  const result=[];
  try{for(const id of chosen){const cacheKey=keyOf(snapshot,contextKey,id),kind=authorized.get(id);let cached=urls.get(cacheKey);
    if(!cached){const asset=await new Promise((resolve,reject)=>{const request=db.transaction('assets','readonly').objectStore('assets').get(cacheKey);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('媒体原件读取失败：'+id));});assertScope(contextKey);if(!asset?.blob)continue;
     const expected=kind.kind+'/';if(asset.blob.type&&!asset.blob.type.startsWith(expected)&&asset.blob.type!=='application/octet-stream')throw Error('媒体原件类型与登记不一致：'+id);
     cached={url:URL.createObjectURL(asset.blob),refs:0};urls.set(cacheKey,cached);
    }
    cached.refs++;result.push({id,kind:kind.kind,name:kind.name,url:cached.url,contextKey,allowed:true});
   }return result;
  }catch(error){releaseMedia({ids:result.map(r=>r.id),snapshot,contextKey});throw error;}
 }
 function releaseMedia({ids,snapshot,contextKey}){if(!snapshot?.life?.bindingKey)return;for(const id of new Set(ids??[])){const key=keyOf(snapshot,contextKey,id),entry=urls.get(key);if(entry&&--entry.refs<=0){URL.revokeObjectURL(entry.url);urls.delete(key);}}}
 function dispose(){for(const entry of urls.values())URL.revokeObjectURL(entry.url);urls.clear();connection?.close();connection=null;}
 return {readMedia,releaseMedia,dispose};
}
