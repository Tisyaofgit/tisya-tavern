import {clone,digest,fail} from './common.mjs';

export const PREFERENCE_SOURCE_TYPE='tisya.worldbook-preference/1';
const check=(ok,message)=>{if(!ok)fail('PREFERENCE_SOURCE',message);};
export const sourceIdentity=(book,uid)=>JSON.stringify([book,String(uid)]);
export function validatePreferenceSource(source){
 check(source&&typeof source==='object'&&!Array.isArray(source)&&Object.keys(source).every(k=>['routeId','book','uid','hash'].includes(k)),'偏好来源字段无效');
 check(typeof source.routeId==='string'&&source.routeId&&typeof source.book==='string'&&source.book.trim()===source.book&&source.book&&Number.isSafeInteger(source.uid)&&source.uid>=0&&/^[a-f0-9]{64}$/.test(source.hash),'偏好来源身份或修订无效');
 return source;
}
export function preferenceSourceFromRoute(state,id){
 const row=state?.tables?.T_SYS_SOURCE_ROUTES?.[id],v=row?.values;
 check(v?.source_type===PREFERENCE_SOURCE_TYPE&&v.source_field_path==='content','文风来源路由不存在或用途已变化');
 for(const field of ['source_type','source_object_key','source_hash','source_field_path'])check(['known','derived'].includes(row.states?.[field]),'文风来源路由字段尚未确认：'+field);
 let address;try{address=JSON.parse(v.source_object_key);}catch{check(false,'文风来源地址损坏');}
 check(Array.isArray(address)&&address.length===2,'文风来源地址损坏');
 return validatePreferenceSource({routeId:id,book:address[0],uid:address[1],hash:v.source_hash});
}
export function preferenceSourceChange(row,group){
 const source=validatePreferenceSource(row.source);
 return {tableId:'T_SYS_SOURCE_ROUTES',recordId:source.routeId,values:{source_type:PREFERENCE_SOURCE_TYPE,source_name:source.book+' / '+source.uid,source_version:'canonical-entry-sha256/1:'+source.hash,source_object_key:JSON.stringify([source.book,source.uid]),source_field_path:'content',source_hash:source.hash,load_scope:'selected-entry',host_role:'system',host_position:group.slot}};
}
export function nativeSourceMode(entry){return entry.extensions?.tisyaWorldbook?.condition?.mode==='external'?'condition':entry.constant?'constant':entry.vectorized?'vector':'keyword';}
export function sourceEntry(book,entry){
 const uid=typeof entry?.uid==='string'&&/^\d+$/.test(entry.uid)?Number(entry.uid):entry?.uid;
 check(typeof book==='string'&&book&&entry&&Number.isSafeInteger(uid)&&uid>=0&&typeof entry.content==='string','世界书条目标识或正文无效');
 return {book,uid,name:String(entry.comment??entry.name??'未命名条目'),text:entry.content,hash:digest(entry),mode:nativeSourceMode(entry),nativeDisabled:entry.disable===true,keys:clone(entry.key??[]),condition:clone(entry.extensions?.tisyaWorldbook?.condition??null),entry:clone(entry)};
}
export function sourceAdoption(item,group,rows){
 check(['文风与凝视','技法与场合'].includes(group.section),'请选择文风或技法用途');
 check(item.text.trim(),'空条目不能作为文风或技法');
 const existing=Object.values(rows).find(row=>row.group===group.id&&row.source&&sourceIdentity(row.source.book,row.source.uid)===sourceIdentity(item.book,item.uid));
 const id=existing?.id??crypto.randomUUID(),selection=group.multiple?['custom:'+id]:'custom:'+id;
 return {id,group:group.id,selection:JSON.stringify(selection),kind:'custom',name:item.name,text:item.text,enabled:true,source:{routeId:existing?.source.routeId??crypto.randomUUID(),book:item.book,uid:item.uid,hash:item.hash}};
}
// Native book bytes stay in the native owner. The route pins provenance; the
// existing preference record owns the explicitly adopted story text.
export function createPreferenceSourceLibrary({books,getContextKey,getRevision,conditions}){
 const scope=()=>[getContextKey(),getRevision()];
 const guard=stamp=>check(JSON.stringify(stamp)===JSON.stringify(scope()),'读取资料期间会话或配置已变化，请重新打开');
 async function names(){check(typeof books?.list==='function','宿主尚未连接世界书目录');const stamp=scope(),result=await books.list();guard(stamp);check(Array.isArray(result)&&result.every(n=>typeof n==='string'&&n.trim()===n&&n),'世界书目录格式无效');return [...new Set(result)];}
 async function read(book){check(typeof books?.read==='function','宿主尚未连接世界书读取');const stamp=scope(),data=await books.read(book);guard(stamp);check(data?.entries&&typeof data.entries==='object'&&!Array.isArray(data.entries),'世界书不存在或格式损坏：'+book);const items=Object.values(data.entries).map(entry=>sourceEntry(book,entry)),ids=new Set();for(const item of items){check(!ids.has(item.uid),'世界书条目UID重复：'+book);ids.add(item.uid);}return items;}
 async function inspect(book,uid){const items=await read(book),item=items.find(row=>row.uid===uid);check(item,'来源条目已删除：'+book+' / '+uid);return item;}
 async function preview(book,uid){const stamp=scope(),item=await inspect(book,uid);let condition=null,conditionError=null;
  if(item.mode==='condition')try{check(conditions,'条件服务尚未连接');const ref=item.condition,response=await conditions.evaluateConditionEntries({requestId:'source-preview:'+crypto.randomUUID(),entryRefs:[{bookRef:book,uid,provider:ref.provider,ruleRef:ref.ruleRef,ruleVersion:ref.ruleVersion,...(item.entry.useProbability?{chance:item.entry.probability}:{})}],dryRun:true});guard(stamp);await response.assertCurrent();condition=response.results[0];}catch(error){guard(stamp);conditionError={code:error.code??'CONDITION_PREVIEW',message:error.message};}
  guard(stamp);return {...item,conditionPreview:condition,conditionError};
 }
 async function validate(rows,{activeOnly=false,choices={},groups=[]}={}){
  const stamp=scope(),cache=new Map(),seen=new Set(),snapshots=[];
  for(const row of Object.values(rows)){
   if(!row.source||!row.enabled)continue;
   const group=groups.find(g=>g.id===row.group);check(group,'来源引用分组不存在');
   const selection=choices[row.group],active=row.kind==='custom'?(Array.isArray(selection)?selection:[selection]).includes('custom:'+row.id):JSON.stringify(selection??null)===row.selection;
   if(activeOnly&&!active)continue;
   const source=validatePreferenceSource(row.source),key=sourceIdentity(source.book,source.uid),consumer=key+'@'+group.slot;
   if(active){check(!seen.has(consumer),'同一来源已被重复选入同一提示词位置，请保留一项：'+source.book+' / '+source.uid);seen.add(consumer);}
   if(!cache.has(source.book))cache.set(source.book,await read(source.book));guard(stamp);
   const item=cache.get(source.book).find(item=>item.uid===source.uid);check(item,'来源条目已删除：'+source.book+' / '+source.uid);
   check(item.hash===source.hash,'来源已变化，请在资料与文风库比较并确认新版本：'+source.book+' / '+source.uid);
   snapshots.push({book:source.book,uid:source.uid,hash:source.hash,rowId:row.id,slot:group.slot,entry:clone(item.entry),mode:item.mode});
  }
  guard(stamp);return snapshots;
 }
 return {names,read,inspect,preview,validate};
}

export function preferenceGateEntry(source){return {...clone(source.entry),world:'tisya.preference:'+JSON.stringify([source.book,source.slot]),disable:false};}
