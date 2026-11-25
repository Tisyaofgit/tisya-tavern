// Read only media originals already registered in this message's frozen phone
// snapshot. Opening a reader never creates an asset or sharing grant; the single
// exception is the one-time framework relocation of a legacy media database
// (copies and verifies originals, then removes the legacy database).
import {openExistingMediaDatabase,MEDIA_STORES} from '../engine/media-database.mjs';

export function createPhonePresentationMedia({indexedDB=globalThis.indexedDB,URL=globalThis.URL,getContextKey}={}){
 const urls=new Map();let connection=null;
 const keyOf=(snapshot,contextKey,id)=>JSON.stringify([snapshot.life.mediaOriginContextKey??contextKey,snapshot.life.bindingKey,id]);
 const assertScope=contextKey=>{if(getContextKey()!==contextKey)throw Error('读取媒体时聊天已切换');};
 async function openExisting(){
  if(connection)return connection;
  if(!indexedDB)return null;
  const db=await openExistingMediaDatabase({indexedDB,label:'媒体原件库',requireStores:[MEDIA_STORES.phoneAssets],messages:{open:error=>Error('媒体原件库读取失败：'+(error?.message??'未知错误')),blocked:()=>Error('媒体库正被其他页面占用，请稍后重试')},onVersionChange:handle=>{if(connection===handle)connection=null;}});
  if(db)connection=db;
  return connection;
 }
 async function readMedia({ids,snapshot,contextKey}){
  assertScope(contextKey);if(!snapshot?.life?.bindingKey||!Array.isArray(ids))return [];
  const state=snapshot.life.state,authorized=new Map();
  for(const row of state.media?.photos??[])if(row.source==='file'){const media={assetId:row.assetId,kind:row.mime?.startsWith('video/')?'video':'image',name:row.name};authorized.set(row.id,media);if(row.assetId)authorized.set(row.assetId,media);}
  for(const row of state.media?.songs??[])if(row.audioId)authorized.set(row.audioId,{assetId:row.audioId,kind:'audio',name:row.title});
  const chosen=[...new Set(ids)].filter(id=>authorized.has(id));if(!chosen.length)return [];
  const db=await openExisting();assertScope(contextKey);if(!db)return [];
  const result=[];
  try{for(const id of chosen){const cacheKey=keyOf(snapshot,contextKey,authorized.get(id).assetId),kind=authorized.get(id);let cached=urls.get(cacheKey);
    if(!cached){const asset=await new Promise((resolve,reject)=>{const request=db.transaction(MEDIA_STORES.phoneAssets,'readonly').objectStore(MEDIA_STORES.phoneAssets).get(cacheKey);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('媒体原件读取失败：'+id));});assertScope(contextKey);if(!asset?.blob)continue;
     const expected=kind.kind+'/';if(asset.blob.type&&!asset.blob.type.startsWith(expected)&&asset.blob.type!=='application/octet-stream')throw Error('媒体原件类型与登记不一致：'+id);
     cached={url:URL.createObjectURL(asset.blob),refs:0};urls.set(cacheKey,cached);
    }
    cached.refs++;result.push({id,kind:kind.kind,name:kind.name,url:cached.url,contextKey,allowed:true});
   }return result;
  }catch(error){releaseMedia({ids:result.map(r=>r.id),snapshot,contextKey});throw error;}
 }
 function releaseMedia({ids,snapshot,contextKey}){if(!snapshot?.life?.bindingKey)return;for(const id of new Set(ids??[])){const photo=snapshot.life.state?.media?.photos?.find(p=>p.id===id);const key=keyOf(snapshot,contextKey,photo?.assetId??id),entry=urls.get(key);if(entry&&--entry.refs<=0){URL.revokeObjectURL(entry.url);urls.delete(key);}}}
 function dispose(){for(const entry of urls.values())URL.revokeObjectURL(entry.url);urls.clear();connection?.close();connection=null;}
 return {readMedia,releaseMedia,dispose};
}
