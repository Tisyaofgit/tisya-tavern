// Media selection is owned by media-contract.js; dialogue only consumes this service.
import {objectArchiveIdentity,OBJECT_ARCHIVE_TABLES} from './engine/object-archive.mjs';
import {openMediaDatabase,MEDIA_STORES} from './engine/media-database.mjs';
import {transact} from './engine/idb-framework.mjs';
import {MEDIA_TABLE,MEDIA_USE_LABELS,MEDIA_SCOPE_LABELS,mediaUse,mediaAspectFrame,mediaTargetCandidates,resolveMediaTarget,selectBoundMedia} from './media-contract.js';
export {MEDIA_TABLE,MEDIA_USE_LABELS,MEDIA_SCOPE_LABELS,mediaAspectFrame} from './media-contract.js';

export const MEDIA_LOCATOR_PREFIX='tisya-media://';
const IMAGE_KINDS=new Set(['立绘','头像','图像','图片','image']);
const aliases=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'):typeof value==='string'?value.split(/[,，、\n]/).map(x=>x.trim()).filter(Boolean):[];
const rows=(bundle,id)=>Object.entries(bundle?.state?.tables?.[id]??{}).map(([id,row])=>({id,...row.values}));
const localId=locator=>typeof locator==='string'&&locator.startsWith(MEDIA_LOCATOR_PREFIX)?locator.slice(MEDIA_LOCATOR_PREFIX.length):null;
const targetCopy=target=>target?.entity?{entity:String(target.entity),table:String(target.table??''),group:String(target.group??''),label:String(target.label??target.entity),archive_entry_ref:String(target.archive_entry_ref??'')}:{entity:'',table:'',group:'通用',label:'通用表情',archive_entry_ref:''};
const cardCopies=value=>{const seen=new Set();return (value??[]).filter(card=>card?.id).map(card=>({id:String(card.id),name:String(card.name??card.id)})).filter(card=>!seen.has(card.id)&&seen.add(card.id));};
const atlasImageUrl=value=>{const url=String(value??'');return /^(?:https?:|blob:|data:image\/(?:png|jpe?g|webp|gif);)/i.test(url)||url&&!/[\s:]/.test(url)?url:'';};

// Matrix atlas IDs are table#entity while media bindings keep the raw entity.
// Resolve through the current, already visibility-filtered targets; never borrow by name.
export function createAtlasMediaProjection(source={}){
 const view=()=>typeof source==='function'?source()??{}:source??{};
 return {for(id){
  const key=String(id??''),hash=key.indexOf('#'),table=hash<0?'':key.slice(0,hash),entity=hash<0?key:key.slice(hash+1),current=view();
  let targets=(current.targets??[]).filter(target=>String(target.entity)===entity&&(!table||String(target.table)===table));
  if(!table&&new Set(targets.map(target=>target.table)).size>1)targets=[];
  if(!targets.length)return {cover:null,images:[]};
  const identities=new Set(targets.map(target=>String(target.archive_entry_ref??'')).filter(Boolean)),entities=new Set(targets.map(target=>String(target.entity)));
  const images=(current.rows??[]).filter(row=>{
   if(row.applicable===false||!atlasImageUrl(row.url))return false;
   const identity=String(row.archive_entry_ref??row.target?.archive_entry_ref??'');
   return identity?identities.has(identity):entities.has(String(row.entity_ref??''));
  }).map(row=>({id:String(row.id??''),url:atlasImageUrl(row.url),use:String(row.purpose??MEDIA_USE_LABELS[row.use]??'立绘'),variant:String(row.display_variant??row.variant??''),life_stage:String(row.life_stage??''),frame:mediaAspectFrame(Number(row.width),Number(row.height)),scope:String(row.binding_scope_label??MEDIA_SCOPE_LABELS[row.binding_scope]??row.binding_scope??'')}));
  const rank=row=>row.use.includes('头像')?0:row.use.includes('立绘')?1:2;
  const cover=[...images].sort((a,b)=>rank(a)-rank(b)||Number(!!a.variant)-Number(!!b.variant)||a.id.localeCompare(b.id))[0]??null;
  return {cover,images};
 }};
}

// Chat bindings remain canonical Matrix rows. Card/global metadata and all Blob
// bytes stay in IndexedDB, outside chat, character-card and archive JSON.
export function projectMediaBundle(bundle,resolve=value=>value){
 const scope={session_ref:String(bundle?.contextKey??''),...(bundle?.state?.runtime?.scope??{})},targets=mediaTargets(bundle);
 const characters=targets.filter(target=>target.table==='T_CHAR_DOSSIER').map(target=>{
  const row=bundle.state.tables.T_CHAR_DOSSIER[target.origin_record_id]??{};
  return {id:target.entity,name:target.label,aliases:aliases(row.values?.aliases),archive_entry_ref:target.archive_entry_ref,avatar:row.values?.avatar?resolve(row.values.avatar):''};
 });
 const media={};
 for(const row of rows(bundle,MEDIA_TABLE)){
  if(!IMAGE_KINDS.has(row['载体类型']??row.kind)&&!IMAGE_KINDS.has(row.kind))continue;
  const use=mediaUse(row),variant=String(row.display_variant??'');
  const bindings=Array.isArray(row['内容绑定'])?row['内容绑定']:row.entity_ref?[{target:{entity:row.entity_ref,field:''},use,variant,scope}]:[];
  media[row.id]={...row,'载体类型':'image','内容绑定':bindings,asset_locator:resolve(row.asset_locator),source_locator:row.asset_locator};
 }
 return {scope,characters,objects:targets,media};
}

const targetGroups={T_CHAR_DOSSIER:'人物',T_STATIC_ITEMS_SKILLS:'物品',T_STATIC_PLACES:'地点',T_STATIC_ORGANIZATIONS:'组织',T_STATIC_FACILITIES:'设施'};
const kindGroups={character:'人物',item:'物品',place:'地点',organization:'组织',facility:'设施',world:'世界'};
export function mediaTargets(bundle){
 const state=bundle?.state,targets=[],represented=new Set(),entities=rows(bundle,'T_SYS_ENTITIES'),references=new Map(rows(bundle,'M_FIELD_REFERENCES').map(row=>[row.id,row]));
 for(const entity of entities){
  const link=references.get(entity.origin_record_ref),table=link?.target_table??'',originId=link?.target_row_uuid??'',origin=state?.tables?.[table]?.[originId];
  if(link&&(!origin||link.owner_table!=='T_SYS_ENTITIES'||link.owner_row_uuid!==entity.id||link.owner_field!=='origin_record_ref'))continue;
  let archive_entry_ref='';if(origin)archive_entry_ref=objectArchiveIdentity(state,table,originId).archive_id;
  const values=origin?.values??{},label=String(entity.instance_name||entity.name||values.name||values.title||entity.id);
  targets.push({entity:entity.id,table,origin_record_id:originId,group:targetGroups[table]??kindGroups[entity.kind]??'对象',label,aliases:aliases(values.aliases),archive_entry_ref,life_stage:String(values.life_stage??'')});
  if(origin)represented.add(table+'#'+originId);
 }
 // Imported archive rows without an entity registration remain visible, but a
 // registered stable entity always wins over a second name-based target.
 for(const table of OBJECT_ARCHIVE_TABLES)for(const row of rows(bundle,table)){
  if(represented.has(table+'#'+row.id))continue;
  targets.push({entity:row.id,table,origin_record_id:row.id,group:targetGroups[table]??'对象',label:String(row.name||row.title||row.id),aliases:aliases(row.aliases),archive_entry_ref:objectArchiveIdentity(state,table,row.id).archive_id,life_stage:String(row.life_stage??'')});
 }
 return targets;
}

export function createMediaAssetStore({indexedDB=globalThis.indexedDB,URL:URLApi=globalThis.URL,crypto:cryptoApi=globalThis.crypto,maxBytes=20*1024*1024}={}){
 if(!indexedDB){const unsupported=()=>{throw Error('当前宿主不支持本地图鉴数据库');};return {ready:Promise.resolve(),put:async()=>unsupported(),load:async locator=>localId(locator)?'':String(locator??''),remove:async locator=>{if(localId(locator))unsupported();},listBindings:async()=>[],saveBinding:async()=>unsupported(),removeBinding:async()=>unsupported(),cached:locator=>localId(locator)?'':String(locator??''),dispose(){}};}
 let db=null,disposed=false;const urls=new Map(),pending=new Map();
 const ready=(async()=>{const handle=await openMediaDatabase({indexedDB,label:'本地图鉴数据库',messages:{open:error=>error??Error('无法打开本地图鉴数据库'),blocked:()=>Error('本地图鉴升级被旧页面占用，请关闭旧页面后重试')},onVersionChange:()=>{db=null;}});if(disposed){handle.close();return;}db=handle;})();
 const transaction=async(mode,work,name=MEDIA_STORES.atlasAssets)=>{
  await ready;if(disposed||!db)throw Error('本地图鉴数据库已关闭');
  return transact(db,name,mode,work,{label:'本地图鉴事务'});
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
  listBindings:()=>transaction('readonly',(store,set)=>{const request=store.getAll();request.onsuccess=()=>set(request.result??[]);},MEDIA_STORES.atlasBindings),
  saveBinding:binding=>transaction('readwrite',store=>{store.put(structuredClone(binding));},MEDIA_STORES.atlasBindings),
  removeBinding:id=>transaction('readwrite',store=>{store.delete(id);},MEDIA_STORES.atlasBindings),
  cached:locator=>{const id=localId(locator);return id?urls.get(id)??'':String(locator??'');},dispose(){disposed=true;for(const url of urls.values())URLApi.revokeObjectURL(url);urls.clear();pending.clear();db?.close();db=null;}};
}

export function createChatMediaAtlas({peek,mutate,store,cardContext=()=>[],evaluateConditions=null,onChange=()=>{},onError=()=>{}}){
 let bundle=null,external=[],activeCards=[],conditionResults={},current={...projectMediaBundle(null),targets:[],cards:[],rows:[],conditions:{},revision:'empty',resolve:value=>value},pending=null,lastKey='',disposed=false;
 const keyOf=(value,cards)=>JSON.stringify([value?.contextKey??null,value?.revision??null,value?.local_revision??null,cards.map(card=>card.id)]);
 function project(){
  const resolve=locator=>store.cached(locator),state=projectMediaBundle(bundle,resolve),targets=mediaTargets(bundle),labels=new Map(targets.map(x=>[x.entity,x]));
  const chatRows=rows(bundle,MEDIA_TABLE).map(row=>({...row,target:labels.get(row.entity_ref)??null,archive_entry_ref:labels.get(row.entity_ref)?.archive_entry_ref??'',url:resolve(row.asset_locator),source_locator:row.asset_locator,binding_scope:'chat',binding_scope_label:MEDIA_SCOPE_LABELS.chat}));
  const list=[...chatRows];
  for(const binding of external){
   if(!['card','global'].includes(binding?.scope)||!binding.asset_locator)continue;
   if(binding.scope==='card'&&!activeCards.some(card=>card.id===binding.card_ref))continue;
   const savedTarget=binding.target??{},use=mediaUse(binding),generic={entity:'',table:'',group:'通用',label:'通用表情',archive_entry_ref:''},byArchive=use==='sticker'?[generic]:savedTarget.archive_entry_ref?targets.filter(target=>target.archive_entry_ref===savedTarget.archive_entry_ref):[],byName=use==='sticker'||savedTarget.archive_entry_ref?[]:targets.filter(target=>target.table===savedTarget.table&&target.label===savedTarget.label),byId=use==='sticker'||savedTarget.archive_entry_ref||binding.scope!=='card'?[]:targets.filter(target=>target.table===savedTarget.table&&target.entity===savedTarget.entity),matches=use==='sticker'?[generic]:savedTarget.archive_entry_ref?byArchive:byId.length?byId:byName;
   const variant=String(binding.display_variant??''),order=binding.scope==='card'?-1:0;
   for(const target of matches){
    const id=binding.id+'@'+target.entity;
    state.media[id]={...binding,entity_ref:target.entity,'载体类型':'image','内容绑定':[{target:{entity:target.entity,field:'',archive_entry_ref:target.archive_entry_ref},use,variant,scope:{},order,updatedAt:binding.updatedAt??0}],asset_locator:resolve(binding.asset_locator),source_locator:binding.asset_locator};
   }
   list.push({...binding,entity_ref:matches[0]?.entity??savedTarget.entity,archive_entry_ref:matches[0]?.archive_entry_ref??savedTarget.archive_entry_ref??'',target:matches[0]??savedTarget,url:resolve(binding.asset_locator),source_locator:binding.asset_locator,applicable:matches.length>0,binding_scope:binding.scope,binding_scope_label:MEDIA_SCOPE_LABELS[binding.scope]});
  }
  current={...state,targets,cards:activeCards,rows:list,conditions:conditionResults,revision:JSON.stringify([keyOf(bundle,activeCards),external.map(row=>[row.id,row.updatedAt,row.asset_locator]),conditionResults]),resolve};
  return current;
 }
 async function refresh(force=false){
  if(disposed)return current;const next=await peek(),cards=cardCopies(cardContext()),key=keyOf(next,cards);if(!force&&key===lastKey&&bundle!==null)return current;
  const scoped=await store.listBindings();bundle=next;activeCards=cards;external=scoped;lastKey=key;conditionResults={};project();
  const cgIds=current.rows.filter(row=>row.binding_scope==='chat'&&mediaUse(row)==='cg'&&row.trigger_condition).map(row=>row.id);
  if(evaluateConditions&&cgIds.length){
   try{const evaluated=await evaluateConditions({recordIds:cgIds});conditionResults=Object.fromEntries((evaluated?.results??[]).map(row=>[row.recordId,{state:row.state,reasonCode:row.reasonCode}]));}
   catch(error){conditionResults={};onError(error);}
  }
  project();
  const sources=new Map();for(const row of [...Object.values(current.media),...current.rows])if(row.source_locator)sources.set(row.source_locator,true);
  await Promise.all([...sources.keys()].map(locator=>store.load(locator).catch(error=>{onError(error);return '';})));
  if(disposed)return current;project();onChange(current);return current;
 }
 function request(){if(!pending)pending=refresh().catch(error=>{onError(error);throw error;}).finally(()=>pending=null);return pending;}
 async function importImage({file,target,use='avatar',scope='chat',card=null,variant='',lifeStage='',sceneDescription='',triggerCondition='',width=null,height=null,licenseSource='本地上传'}){
  if(disposed)throw Error('本地图鉴已关闭');if(use==='sticker')target=null;if(!target?.entity&&use!=='sticker')throw Error('请选择要绑定的对象');if(!Object.hasOwn(MEDIA_USE_LABELS,use))throw Error('请选择已登记的图片用途');if(!Object.hasOwn(MEDIA_SCOPE_LABELS,scope))throw Error('请选择本聊天、角色卡或全局绑定范围');
  if(use==='cg'&&scope!=='chat')throw Error('条件CG只保存在本聊天，条件所有权不能落到外部名称绑定');
  if(scope==='card'){card=cardCopies(cardContext()).find(item=>item.id===card?.id);if(!card)throw Error('请选择当前聊天中的角色卡');}else card=null;
  variant=String(variant??'').trim();if(['expression','sticker','cg'].includes(use)&&!variant)throw Error(use==='cg'?'条件CG需要填写CG名称':use==='expression'?'表情需要填写与对白标记完全一致的情绪名称':'通用表情需要填写表情名称');if(use==='avatar')variant='';
  lifeStage=String(lifeStage??'').trim();if(!['portrait','expression'].includes(use))lifeStage='';sceneDescription=String(sceneDescription??'').trim();triggerCondition=String(triggerCondition??'').trim();
  if(use==='cg'&&(!sceneDescription||!triggerCondition))throw Error('条件CG必须填写场景描述并引用已登记条件');
  const assertCondition=state=>{if(use!=='cg')return;const first=state?.tables?.M_CONDITIONS?.[triggerCondition]?.values;if(!first||first.group_key==null)throw Error('条件CG引用的规范条件组不存在');};
  assertCondition((bundle??await peek())?.state);
  const asset=await store.put(file),recordId=(scope==='chat'?'':scope+':')+crypto.randomUUID();let committed=false;
  const values={...(target?.entity?{entity_ref:target.entity}:{}),kind:use==='portrait'?'立绘':'图像',asset_locator:asset.locator,checksum:asset.checksum,display_variant:variant,purpose:MEDIA_USE_LABELS[use],...(lifeStage?{life_stage:lifeStage}:{}),...(use==='cg'?{scene_description:sceneDescription,trigger_condition:triggerCondition}:{}),...(Number.isFinite(width)&&width>0?{width}:{}),...(Number.isFinite(height)&&height>0?{height}:{}),license_source:licenseSource};
  try{
   if(scope==='chat')await mutate(engine=>{assertCondition(engine.data);engine.newRecord(MEDIA_TABLE,values,recordId);});
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
  const target=resolveMediaTarget(current.targets,label);if(!target)return {entity:null,url:'',status:'unresolved',reason:mediaTargetCandidates(current.targets,label).length?'ambiguous':'missing-target'};
  const selected=(mood?selectBoundMedia(current,{entity:target.entity,use:'expression',variant:mood,lifeStage:target.life_stage}):null)??selectBoundMedia(current,{entity:target.entity,use:'avatar',lifeStage:target.life_stage})??selectBoundMedia(current,{entity:target.entity,use:'portrait',variant:mood,lifeStage:target.life_stage});
  return result(selected,target);
 }
 function result(row,target=null){
  if(!row)return {status:'missing',url:'',entity:target?.entity??'',frame:mediaAspectFrame(null,null)};
  const width=Number(row.width),height=Number(row.height),frame=mediaAspectFrame(width,height);
  return {status:'bound',id:row.id,url:row.url??current.resolve(row.asset_locator),entity:row.entity_ref??target?.entity??'',use:mediaUse(row),variant:row.display_variant??'',name:String(row.display_variant??'')||target?.label||row.purpose||'已绑定图片',life_stage:row.life_stage??'',frame,presentation:globalThis.TisyaMediaBindings?.imagePresentation(row,{}, {width,height})};
 }
 function portrait(label,mood=''){
  const target=resolveMediaTarget(current.targets,label);if(!target)return {status:'unresolved',url:''};
  return result(selectBoundMedia(current,{entity:target.entity,use:'portrait',variant:mood,lifeStage:target.life_stage}),target);
 }
 function sticker(name){return result(selectBoundMedia(current,{use:'sticker',variant:name}));}
 function cg(name,description){
  const row=selectBoundMedia(current,{use:'cg',variant:name,description});if(row)return result(row);
  const named=current.rows.filter(item=>mediaUse(item)==='cg'&&String(item.display_variant??'').trim()===String(name??'').trim()),exists=named.some(item=>!description||String(item.scene_description??'').trim()===String(description).trim());
  if(named.length&&description&&!exists)return {status:'mismatch',url:''};
  return {status:exists?'locked':'missing',url:''};
 }
 function heart(variants,name='缇斯亚'){
  if(!Array.isArray(variants)||!variants.length||variants.some(value=>typeof value!=='string'||!value.trim()))throw Error('缇斯亚心声须给出一个或多个可选表情名称');
  const target=resolveMediaTarget(current.targets,name),items=[...new Set(variants.map(value=>value.trim()))].map(variant=>({variant,...result(selectBoundMedia(current,{use:'sticker',variant})??(target?selectBoundMedia(current,{entity:target.entity,use:'expression',variant,lifeStage:target.life_stage}):null),target)}));
  return {name,items};
 }
 function rendering(id,slot='body'){
  if(!['anchor','body','extra'].includes(slot))throw Error('媒体调用位置未登记：'+slot);
  const key=String(id??'').trim();if(!key)throw Error('媒体调用内容为空');
  if(slot==='anchor'){
   const item=heart([key]).items[0];if(item.status!=='bound')throw Error('心声表情未绑定：'+key);if(!item.url)throw Error('心声表情原图尚未载入：'+key);
   return {...item,kind:'image',slot};
  }
  const stickerCall=/^通用表情[:：](.+)$/u.exec(key);let selected=null;
  if(stickerCall){
   const name=stickerCall[1].trim();if(!name)throw Error('通用表情名称为空');selected=sticker(name);if(selected.status!=='bound')throw Error('通用表情未绑定：'+name);
  }else{
   const boundary=key.search(/[:：]/u);if(boundary<=0||boundary===key.length-1)throw Error('正文媒体调用应为“角色名：情绪名称”或“CG名称：场景描述”');
   const left=key.slice(0,boundary).trim(),right=key.slice(boundary+1).trim();if(!left||!right)throw Error('媒体调用的名称与内容都不能为空');
   const portraitResult=portrait(left,right),cgResult=cg(left,right),bound=[portraitResult,cgResult].filter(row=>row.status==='bound');
   if(bound.length>1)throw Error('同一调用同时匹配角色立绘与条件CG，请使用唯一名称：'+key);
   selected=bound[0]??null;
   if(!selected){if(cgResult.status==='locked')throw Error('条件CG尚未通过规范条件：'+left);if(cgResult.status==='mismatch')throw Error('正文媒体未绑定或场景描述不一致：'+key);if(portraitResult.status==='unresolved')throw Error('角色名不存在或有同名歧义：'+left);throw Error('正文媒体未绑定：'+key);}
  }
  if(!selected.url)throw Error('媒体原图尚未载入，请稍后重试：'+key);
  return {...selected,kind:'image',slot};
 }
 return {view:()=>current,request,refresh,importImage,remove,avatar,portrait,sticker,cg,heart,rendering,dispose(){disposed=true;store.dispose();}};
}
