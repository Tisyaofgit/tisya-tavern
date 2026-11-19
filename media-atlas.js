import {dialogueBlocks} from './prose-dialogue.js';
import {objectArchiveIdentity} from './engine/object-archive.mjs';

export const MEDIA_TABLE='T_SYS_MEDIA_ASSETS';
export const MEDIA_LOCATOR_PREFIX='tisya-media://';
export const MEDIA_USE_LABELS=Object.freeze({avatar:'头像',portrait:'立绘',expression:'表情'});
export const MEDIA_SCOPE_LABELS=Object.freeze({chat:'本聊天',card:'角色卡',global:'全局'});
const IMAGE_KINDS=new Set(['立绘','头像','图像','图片','image']);
const aliases=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'):typeof value==='string'?value.split(/[,，、\n]/).map(x=>x.trim()).filter(Boolean):[];
const rows=(bundle,id)=>Object.entries(bundle?.state?.tables?.[id]??{}).map(([id,row])=>({id,...row.values}));
const localId=locator=>typeof locator==='string'&&locator.startsWith(MEDIA_LOCATOR_PREFIX)?locator.slice(MEDIA_LOCATOR_PREFIX.length):null;
const mediaUse=value=>{
 const text=String(value.purpose??value.kind??'');
 if(text.includes('头像'))return 'avatar';
 if(text.includes('表情')||value.display_variant)return 'expression';
 return 'portrait';
};
const targetCopy=target=>({entity:String(target.entity),table:String(target.table??''),group:String(target.group??''),label:String(target.label??target.entity),archive_entry_ref:String(target.archive_entry_ref??'')});
const cardCopies=value=>{const seen=new Set();return (value??[]).filter(card=>card?.id).map(card=>({id:String(card.id),name:String(card.name??card.id)})).filter(card=>!seen.has(card.id)&&seen.add(card.id));};

// Chat bindings remain canonical Matrix rows. Card/global metadata and all Blob
// bytes stay in IndexedDB, outside chat, character-card and archive JSON.
export function projectMediaBundle(bundle,resolve=value=>value){
 const scope={session_ref:String(bundle?.contextKey??''),...(bundle?.state?.runtime?.scope??{})};
 const characters=rows(bundle,'T_CHAR_DOSSIER').map(row=>({id:row.id,name:row.name||row.id,aliases:aliases(row.aliases),archive_entry_ref:objectArchiveIdentity(bundle.state,'T_CHAR_DOSSIER',row.id).archive_id,avatar:row.avatar?resolve(row.avatar):''}));
 const media={};
 for(const row of rows(bundle,MEDIA_TABLE)){
  if(!IMAGE_KINDS.has(row['载体类型']??row.kind)&&!IMAGE_KINDS.has(row.kind))continue;
  const use=mediaUse(row),variant=String(row.display_variant??'');
  const bindings=Array.isArray(row['内容绑定'])?row['内容绑定']:row.entity_ref?[{target:{entity:row.entity_ref,field:''},use,variant,scope}]:[];
  media[row.id]={...row,'载体类型':'image','内容绑定':bindings,asset_locator:resolve(row.asset_locator),source_locator:row.asset_locator};
 }
 return {scope,characters,media};
}

export function mediaTargets(bundle){
 const targets=[];
 for(const [table,group]of [['T_CHAR_DOSSIER','人物'],['T_STATIC_ITEMS_SKILLS','物品']]){
  for(const row of rows(bundle,table))targets.push({entity:row.id,table,group,label:String(row.name||row.title||row.id),archive_entry_ref:objectArchiveIdentity(bundle.state,table,row.id).archive_id});
 }
 return targets;
}

export function createMediaAssetStore({indexedDB=globalThis.indexedDB,URL:URLApi=globalThis.URL,crypto:cryptoApi=globalThis.crypto,maxBytes=20*1024*1024}={}){
 if(!indexedDB){const unsupported=()=>{throw Error('当前宿主不支持本地图鉴数据库');};return {ready:Promise.resolve(),put:async()=>unsupported(),load:async locator=>localId(locator)?'':String(locator??''),remove:async locator=>{if(localId(locator))unsupported();},listBindings:async()=>[],saveBinding:async()=>unsupported(),removeBinding:async()=>unsupported(),cached:locator=>localId(locator)?'':String(locator??''),dispose(){}};}
 let db=null,disposed=false;const urls=new Map(),pending=new Map();
 const ready=new Promise((resolve,reject)=>{
  const open=indexedDB.open('tisya-media-atlas',2);
  open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('assets'))open.result.createObjectStore('assets',{keyPath:'id'});if(!open.result.objectStoreNames.contains('bindings'))open.result.createObjectStore('bindings',{keyPath:'id'});};
  open.onsuccess=()=>{if(disposed){open.result.close();resolve();return;}db=open.result;db.onversionchange=()=>{db.close();db=null;};resolve();};
  open.onerror=()=>reject(open.error??Error('无法打开本地图鉴数据库'));
  open.onblocked=()=>reject(Error('本地图鉴升级被旧页面占用，请关闭旧页面后重试'));
 });
 const transaction=async(mode,work,name='assets')=>{
  await ready;if(disposed||!db)throw Error('本地图鉴数据库已关闭');
  return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode),store=tx.objectStore(name);let value;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error??Error('本地图鉴事务失败'));tx.onabort=()=>reject(tx.error??Error('本地图鉴事务中止'));try{work(store,v=>value=v);}catch(error){reject(error);try{tx.abort();}catch{}}});
 };
 async function put(file){
  if(!file||typeof file.arrayBuffer!=='function')throw Error('请选择图片文件');
  if(!/^image\/(?:png|jpeg|webp|gif|avif)$/i.test(file.type))throw Error('仅支持 PNG、JPEG、WebP、GIF 或 AVIF 图片');
  if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>maxBytes)throw Error('图片为空或超过 20 MiB 上限');
  const bytes=await file.arrayBuffer(),digest=await cryptoApi.subtle.digest('SHA-256',bytes),checksum=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''),id='sha256-'+checksum;
  const created=await transaction('readwrite',(store,set)=>{const request=store.get(id);request.onsuccess=()=>{const created=!request.result;if(created)store.put({id,checksum,blob:file,mime:file.type,bytes:file.size,createdAt:Date.now()});set(created);};});
  return {id,checksum,bytes:file.size,mime:file.type,locator:MEDIA_LOCATOR_PREFIX+id,created};
 }
 async function load(locator){
  const id=localId(locator);if(!id)return String(locator??'');
  if(urls.has(id))return urls.get(id);if(pending.has(id))return pending.get(id);
  const task=transaction('readonly',(store,set)=>{const request=store.get(id);request.onsuccess=()=>set(request.result);}).then(record=>{
   if(disposed||!record?.blob||record.id!==id)return '';
   const url=URLApi.createObjectURL(record.blob);urls.set(id,url);return url;
  }).finally(()=>pending.delete(id));pending.set(id,task);return task;
 }
 async function remove(locator){
  const id=localId(locator);if(!id)return;
  await transaction('readwrite',store=>{store.delete(id);});const url=urls.get(id);if(url){URLApi.revokeObjectURL(url);urls.delete(id);}
 }
 return {ready,put,load,remove,
  listBindings:()=>transaction('readonly',(store,set)=>{const request=store.getAll();request.onsuccess=()=>set(request.result??[]);},'bindings'),
  saveBinding:binding=>transaction('readwrite',store=>{store.put(structuredClone(binding));},'bindings'),
  removeBinding:id=>transaction('readwrite',store=>{store.delete(id);},'bindings'),
  cached:locator=>{const id=localId(locator);return id?urls.get(id)??'':String(locator??'');},dispose(){disposed=true;for(const url of urls.values())URLApi.revokeObjectURL(url);urls.clear();pending.clear();db?.close();db=null;}};
}

export function createChatMediaAtlas({peek,mutate,store,cardContext=()=>[],onChange=()=>{},onError=()=>{}}){
 let bundle=null,external=[],activeCards=[],current={...projectMediaBundle(null),targets:[],cards:[],rows:[],revision:'empty',resolve:value=>value},pending=null,lastKey='',disposed=false;
 const keyOf=(value,cards)=>JSON.stringify([value?.contextKey??null,value?.revision??null,value?.local_revision??null,cards.map(card=>card.id)]);
 function project(){
  const resolve=locator=>store.cached(locator),state=projectMediaBundle(bundle,resolve),targets=mediaTargets(bundle),labels=new Map(targets.map(x=>[x.entity,x]));
  const chatRows=rows(bundle,MEDIA_TABLE).map(row=>({...row,target:labels.get(row.entity_ref)??null,archive_entry_ref:labels.get(row.entity_ref)?.archive_entry_ref??'',url:resolve(row.asset_locator),source_locator:row.asset_locator,binding_scope:'chat',binding_scope_label:MEDIA_SCOPE_LABELS.chat}));
  const list=[...chatRows];
  for(const binding of external){
   if(!['card','global'].includes(binding?.scope)||!binding.asset_locator)continue;
   if(binding.scope==='card'&&!activeCards.some(card=>card.id===binding.card_ref))continue;
   const savedTarget=binding.target??{},byArchive=savedTarget.archive_entry_ref?targets.filter(target=>target.archive_entry_ref===savedTarget.archive_entry_ref):[],byName=savedTarget.archive_entry_ref?[]:targets.filter(target=>target.table===savedTarget.table&&target.label===savedTarget.label),byId=!savedTarget.archive_entry_ref&&binding.scope==='card'?targets.filter(target=>target.table===savedTarget.table&&target.entity===savedTarget.entity):[],matches=savedTarget.archive_entry_ref?byArchive:byId.length?byId:byName;
   const use=mediaUse(binding),variant=String(binding.display_variant??''),order=binding.scope==='card'?-1:0;
   for(const target of matches){
    const id=binding.id+'@'+target.entity;
    state.media[id]={...binding,entity_ref:target.entity,'载体类型':'image','内容绑定':[{target:{entity:target.entity,field:'',archive_entry_ref:target.archive_entry_ref},use,variant,scope:{},order,updatedAt:binding.updatedAt??0}],asset_locator:resolve(binding.asset_locator),source_locator:binding.asset_locator};
   }
   list.push({...binding,entity_ref:matches[0]?.entity??savedTarget.entity,archive_entry_ref:matches[0]?.archive_entry_ref??savedTarget.archive_entry_ref??'',target:matches[0]??savedTarget,url:resolve(binding.asset_locator),source_locator:binding.asset_locator,applicable:matches.length>0,binding_scope:binding.scope,binding_scope_label:MEDIA_SCOPE_LABELS[binding.scope]});
  }
  current={...state,targets,cards:activeCards,rows:list,revision:JSON.stringify([keyOf(bundle,activeCards),external.map(row=>[row.id,row.updatedAt,row.asset_locator])]),resolve};
  return current;
 }
 async function refresh(force=false){
  if(disposed)return current;const next=await peek(),cards=cardCopies(cardContext()),key=keyOf(next,cards);if(!force&&key===lastKey&&bundle!==null)return current;
  const scoped=await store.listBindings();bundle=next;activeCards=cards;external=scoped;lastKey=key;project();
  const sources=new Map();for(const row of [...Object.values(current.media),...current.rows])if(row.source_locator)sources.set(row.source_locator,true);
  await Promise.all([...sources.keys()].map(locator=>store.load(locator).catch(error=>{onError(error);return '';})));
  if(disposed)return current;project();onChange(current);return current;
 }
 function request(){if(!pending)pending=refresh().catch(error=>{onError(error);throw error;}).finally(()=>pending=null);return pending;}
 async function importImage({file,target,use='avatar',scope='chat',card=null,variant='',width=null,height=null,licenseSource='本地上传'}){
  if(disposed)throw Error('本地图鉴已关闭');if(!target?.entity)throw Error('请选择要绑定的人物或物品');if(!Object.hasOwn(MEDIA_USE_LABELS,use))throw Error('请选择头像、立绘或表情用途');if(!Object.hasOwn(MEDIA_SCOPE_LABELS,scope))throw Error('请选择本聊天、角色卡或全局绑定范围');
  if(scope==='card'){card=cardCopies(cardContext()).find(item=>item.id===card?.id);if(!card)throw Error('请选择当前聊天中的角色卡');}else card=null;
  variant=String(variant??'').trim();if(use==='expression'&&!variant)throw Error('表情需要填写与对白标记完全一致的情绪名称');if(use!=='expression')variant='';
  const asset=await store.put(file),recordId=(scope==='chat'?'':scope+':')+crypto.randomUUID();let committed=false;
  const values={entity_ref:target.entity,kind:use==='portrait'?'立绘':'图像',asset_locator:asset.locator,checksum:asset.checksum,display_variant:variant,purpose:MEDIA_USE_LABELS[use],...(Number.isFinite(width)?{width}:{}),...(Number.isFinite(height)?{height}:{}),license_source:licenseSource};
  try{
   if(scope==='chat')await mutate(engine=>{engine.newRecord(MEDIA_TABLE,values,recordId);});
   else await store.saveBinding({...values,id:recordId,scope,card_ref:card?.id??'',card_name:card?.name??'',target:targetCopy(target),updatedAt:Date.now()});
   committed=true;
  }finally{if(!committed&&asset.created)await store.remove(asset.locator).catch(onError);}
  await refresh(true);return recordId;
 }
 async function remove(recordId){
  const scoped=external.find(row=>row.id===recordId),chat=rows(bundle,MEDIA_TABLE).find(row=>row.id===recordId),row=scoped??chat;if(!row)throw Error('所选媒体绑定已不存在');
  if(scoped)await store.removeBinding(recordId);
  else await mutate(engine=>{delete engine.data.tables[MEDIA_TABLE]?.[recordId];for(const [id,meta]of Object.entries(engine.data.tables.X_RECORD_META??{}))if(meta.values?.table_id===MEDIA_TABLE&&meta.values?.record_id===recordId)delete engine.data.tables.X_RECORD_META[id];});
  const referenced=rows(bundle,MEDIA_TABLE).some(item=>item.id!==recordId&&item.asset_locator===row.asset_locator)||external.some(item=>item.id!==recordId&&item.asset_locator===row.asset_locator);
  if(!referenced)await store.remove(row.asset_locator);
  await refresh(true);
 }
 function avatar(label,mood=''){
  const registry=dialogueBlocks.characterRegistry(()=>current,current.resolve);return registry.avatar(label,mood);
 }
 return {view:()=>current,request,refresh,importImage,remove,avatar,dispose(){disposed=true;store.dispose();}};
}
