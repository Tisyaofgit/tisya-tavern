import {archivePrefixRole} from './archive-prefix.js';
import {archiveBookEntries} from './archive-book-entries.js';
import {characterWorldbookScope} from './character-scope.js';
import {FORMAT, check, copy, object, defaultRegistry} from './schema.js';
import {digest as matrixDigest,decode as decodeMatrix,stableId} from '../engine/common.mjs';
import {programOwnedTable,creationFieldAllowed} from '../engine/prompt-boundary.mjs';
const MANAGED=['【图鉴／静态】存档最新版','【图鉴／数据】存档最新版','【图鉴／动态快照】存档最新版','【图鉴／记忆】存档最新版','【原点】初始档案','【基点】核心版本','【存档】时间锚与变更路径'];
const ENTRY = '缇斯亚 · 表单数据';
export const MATRIX_DEFINITION_FORMAT='tisya.matrix-definition/1';
const ARCHIVE_PLAN_FORMAT='tisya.definition-archive-plan/1';
const definitionTitle=entry=>String(entry.name??entry.comment??'');
const disabledEntry=(name,content)=>({name,enabled:false,content,strategy:{type:'selective',keys:[],keys_secondary:{logic:'and_any',keys:[]},scan_depth:0},position:{type:'after_character_definition',role:'system',depth:0,order:100},probability:100,recursion:{prevent_incoming:true,prevent_outgoing:true,delay_until:null},effect:{sticky:null,cooldown:null,delay:null}});
export function readMatrixDefinition(entry){
 let data;try{data=JSON.parse(entry.content);}catch{return null;}
 if(data?.format!==MATRIX_DEFINITION_FORMAT)return null;
 check(object(data)&&['character','world'].includes(data.kind)&&typeof data.id==='string'&&data.id&&Number.isSafeInteger(data.revision)&&data.revision>0&&typeof data.name==='string'&&data.name.trim()&&object(data.matrix)&&Array.isArray(data.matrix.changes),'规范定义条目损坏，原文已保留');
 check(data.matrix.changes.length>0&&data.matrix.changes.length<=2000&&data.matrix.changes.every(c=>object(c)&&typeof c.tableId==='string'&&typeof c.recordId==='string'&&object(c.values)),'规范定义记录无效');
 if(data.payloadDigest)check(data.payloadDigest===matrixDigest(Object.fromEntries(Object.entries(data).filter(([key])=>key!=='payloadDigest'))),'规范定义摘要不符；请保留原文后重新核对');
 return copy(data);
}
function validateDefinitionChanges(changes,schema){
 check(Array.isArray(changes)&&changes.length>0&&changes.length<=2000&&object(schema),'归档需要当前规范表结构与记录');const seen=new Set();
 for(const change of changes){
  check(object(change)&&Object.keys(change).every(k=>['tableId','recordId','values','states'].includes(k))&&typeof change.recordId==='string'&&change.recordId.trim()&&object(change.values),'归档仅接受规范记录，不接受删除或程序元数据');
  const spec=schema[change.tableId],key=change.tableId+'#'+change.recordId;check(spec&&!programOwnedTable(change.tableId,spec)&&!seen.has(key),'归档记录重复、未登记或属于程序表：'+key);seen.add(key);
  check(!change.states||object(change.states)&&Object.keys(change.states).every(k=>Object.hasOwn(change.values,k)&&['known','unknown','unset','none','not_applicable','cleared'].includes(change.states[k])),'归档值状态无效');
  for(const [field,value]of Object.entries(change.values)){const def=spec.fields?.find(f=>f.key===field);check(def&&creationFieldAllowed(def),'归档字段未登记或由程序维护：'+key+'.'+field);decodeMatrix(value,def);}
 }
 return copy(changes);
}
const planHash=plan=>matrixDigest(Object.fromEntries(Object.entries(plan).filter(([key])=>key!=='digest')));
export async function digest(value){const bytes=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const uuid = prefix => prefix+':'+crypto.randomUUID();
export function createBookGateway(getHelper=()=>globalThis.TavernHelper,getContext){
 const locks=new Map();
 function helper(){const h=getHelper();check(h&&['getWorldbook','getWorldbookNames','createWorldbook','updateWorldbookWith'].every(k=>typeof h[k]==='function'),'表单存档需要新版酒馆助手的世界书 API；未启用表单时不影响聊天');return h;}
 function find(entries){check(Array.isArray(entries),'世界书未返回条目列表');const matches=entries.filter(e=>e.name===ENTRY);check(matches.length<=1,'表单数据条目重复，请保留原书并检查冲突');return matches[0];}
 function decode(entry){check(entry&&entry.enabled===false,'表单存档条目不存在或被改为自动注入，请在世界书中关闭该条目的自动激活');let data;try{data=JSON.parse(entry.content);}catch{throw Error('表单世界书 JSON 损坏，原文已保留');}check(data.format===FORMAT&&['origin','session'].includes(data.kind)&&Number.isSafeInteger(data.revision)&&data.revision>=0,'表单存档版本无效');return data;}
 async function read(name){check(name,'尚未绑定表单世界书');const entries=await helper().getWorldbook(name),entry=find(entries),data=decode(entry);if(data.archiveView){const expected=archiveBookEntries(data);for(const item of expected){const found=entries.filter(e=>e.name===item.name);check(found.length===1&&found[0].content===item.content&&found[0].enabled===false,'自动分层条目已被外部改动：'+item.name+'；请保留原书并核对');}}return {name,data,stamp:await digest(entry.content),raw:entry.content,uid:entry.uid};}
 async function create(kind,owner,name){const h=helper();check(!(await h.getWorldbookNames()).includes(name),'世界书已经存在，请选择读取或换名');const data={format:FORMAT,kind,id:uuid(kind),owner,revision:0,registry:defaultRegistry(),bases:[],commits:[]};
  const entry={name:ENTRY,enabled:false,content:JSON.stringify(data),strategy:{type:'selective',keys:[],keys_secondary:{logic:'and_any',keys:[]},scan_depth:0},position:{type:'after_character_definition',role:'system',depth:0,order:100},probability:100,recursion:{prevent_incoming:true,prevent_outgoing:true,delay_until:null},effect:{sticky:null,cooldown:null,delay:null}};
  check(await h.createWorldbook(name,[entry])===true,'世界书创建未确认；请检查是否已存在同名书');return read(name);
 }
 async function write(snapshot,next,guard=()=>{}){
  check(!locks.has(snapshot.name),'这本表单世界书正在保存');locks.set(snapshot.name,true);
  try{
   guard();check(next.id===snapshot.data.id&&next.kind===snapshot.data.kind&&next.revision===snapshot.data.revision+1,'表单更新版本不连续');
   const current=await read(snapshot.name);guard();check(current.stamp===snapshot.stamp,'表单已在其他页面修改，未覆盖新版本');
   const projections=archiveBookEntries(next),encoded=JSON.stringify(next),expected=await digest(encoded);let invoked=false;
   await helper().updateWorldbookWith(snapshot.name,entries=>{guard();const entry=find(entries);check(entry&&entry.uid===snapshot.uid&&entry.content===snapshot.raw,'表单写入前版本已变化');for(const projection of projections){const found=entries.filter(e=>e.name===projection.name);check(found.length<=1,'分层条目重复');if(!snapshot.data.archiveView)check(!found.length,'同名世界书条目已存在，未覆盖：'+projection.name);else{const prior=archiveBookEntries(snapshot.data).find(x=>x.name===projection.name);check(found.length===1&&found[0].content===prior.content&&found[0].enabled===false,'分层条目写入前已改变');}if(found.length){found[0].content=projection.content;}else entries.push({...copy(entry),uid:Math.max(-1,...entries.map(e=>Number(e.uid)).filter(Number.isFinite))+1,name:projection.name,content:projection.content,enabled:false});}entry.content=encoded;entry.enabled=false;invoked=true;return entries;},{render:'debounced'});
   check(invoked,'宿主未执行表单更新');const verified=await read(snapshot.name);check(verified.stamp===expected,'表单保存结果不一致；写入状态未知，请重新载入核对');return verified;
  }catch(e){throw Error('表单保存未完成：'+e.message);}finally{locks.delete(snapshot.name);}
 }
 async function bindOrigin(card,name,outerGuard=()=>{},{removeMissing=[]}={}){const h=helper();check(typeof h.getCharWorldbookNames==='function'&&typeof h.rebindCharWorldbooks==='function','宿主缺少角色卡世界书绑定接口');const {target,guard}=characterWorldbookScope(card,getContext,outerGuard);guard();const prior=await h.getCharWorldbookNames(target);guard();check(object(prior)&&Array.isArray(prior.additional),'角色卡世界书绑定格式无效');const names=removeMissing.length?await h.getWorldbookNames():null;guard();check(removeMissing.every(n=>!names.includes(n)),'待移除的旧书已重新出现，请重新核对');const removed=new Set(removeMissing),kept={primary:removed.has(prior.primary)?'':prior.primary,additional:prior.additional.filter(n=>!removed.has(n))};if(!removeMissing.length&&(prior.primary===name||prior.additional.includes(name)))return;await h.rebindCharWorldbooks(target,{primary:kept.primary,additional:[...new Set([...kept.additional,name])]});guard();const after=await h.getCharWorldbookNames(target);guard();check(after.primary===kept.primary&&Array.isArray(after.additional)&&after.additional.includes(name)&&kept.additional.every(n=>after.additional.includes(n))&&removeMissing.every(n=>after.primary!==n&&!after.additional.includes(n)),'原点书绑定未确认，原有角色书请核对');}
 async function cardBooks(card){const h=helper();check(typeof h.getCharWorldbookNames==='function','宿主缺少角色书绑定读取接口');const {target,guard}=characterWorldbookScope(card,getContext);const refs=await h.getCharWorldbookNames(target);guard();check(object(refs)&&Array.isArray(refs.additional),'角色卡世界书绑定格式无效');return [...new Set([refs.primary,...refs.additional].filter(Boolean))];}
 async function materials(card,{includeDisabled=false}={}){const out=[];for(const name of await cardBooks(card)){const entries=await helper().getWorldbook(name),journal=find(entries),generated=journal?!!decode(journal).archiveView:false;for(const e of entries)if(e.name!==ENTRY&&!(generated&&MANAGED.includes(e.name))&&(includeDisabled||e.enabled!==false)&&typeof e.content==='string')out.push({book:name,entry:e.name,content:e.content,...(archivePrefixRole(name,e.name)?{archiveRole:archivePrefixRole(name,e.name),sourcePath:[name,e.uid??e.name]}:{}),...(e.enabled===false?{enabled:false}:{})});}return out;}
 async function originNames(){
  const h=helper(),out=[];
  for(const name of await h.getWorldbookNames()){
   const entries=await h.getWorldbook(name),entry=find(entries);if(!entry)continue;
   if(decode(entry).kind==='origin')out.push(name);
  }
  return out;
 }
 // Reusable definitions live in native worldbooks. Chat state remains in the
 // Matrix database; this gateway never saves runtime history into a second ledger.
 async function sourceNames(){const h=getHelper(),c=getContext?.(),names=typeof h?.getWorldbookNames==='function'?await h.getWorldbookNames():typeof c?.getWorldInfoNames==='function'?await c.getWorldInfoNames():null;check(Array.isArray(names)&&names.every(n=>typeof n==='string')&&new Set(names).size===names.length,'世界书列表无效');return names;}
 async function sourceEntries(book){
  check(typeof book==='string'&&book.trim()===book&&book,'请选择世界书');const h=getHelper(),c=getContext?.();let entries;
  if(typeof h?.getWorldbook==='function')entries=await h.getWorldbook(book);else{check(typeof c?.loadWorldInfo==='function','宿主缺少世界书读取接口');const data=await c.loadWorldInfo(book);check(object(data?.entries),'世界书不存在或损坏：'+book);entries=Object.values(data.entries);}
  check(Array.isArray(entries),'世界书条目格式无效：'+book);const ids=new Set();for(const e of entries){check(object(e)&&((Number.isSafeInteger(e.uid)&&e.uid>=0)||(typeof e.uid==='string'&&e.uid.trim()))&&!ids.has(String(e.uid))&&typeof e.content==='string','世界书条目标识或正文无效：'+book);ids.add(String(e.uid));}return copy(entries);
 }
 const sourceSnapshot=(book,entry)=>{const definition=readMatrixDefinition(entry);return {book,uid:entry.uid,name:definitionTitle(entry),title:definitionTitle(entry),content:entry.content,entry:copy(entry),digest:matrixDigest({book,entry}),version:definition?.revision??null,definition};};
 async function readSource({book,uid}){check(uid!==null&&uid!==undefined,'请选择世界书条目');const entries=await sourceEntries(book),rows=entries.filter(e=>String(e.uid)===String(uid));check(rows.length===1,'来源条目不存在或 UID 重复：'+book);return sourceSnapshot(book,rows[0]);}
 async function nativeSourceBook(book){const c=getContext?.();if(typeof c?.loadWorldInfo==='function'){const data=await c.loadWorldInfo(book);check(object(data?.entries),'原生世界书读取格式无效：'+book);return {name:book,entries:copy(Object.values(data.entries))};}return {name:book,entries:await sourceEntries(book)};}
 async function listSources({book,kind='character'}={}){
  check(['character','world','all'].includes(kind),'来源类型无效');const books=await sourceNames(),exists=typeof book==='string'&&books.includes(book),all=exists?(await sourceEntries(book)).filter(e=>definitionTitle(e)!==ENTRY).map(e=>sourceSnapshot(book,e)):[];
  const matches=row=>kind==='all'||row.definition?.kind===kind||(kind==='character'&&/^【角色】.+/u.test(row.name));
  return {books,book:book??'',exists,entries:all.filter(matches),unmarkedEntries:all.filter(row=>!row.definition&&!/^【(?:角色|资料|初始化|模板|说明|扩展|美化)】/u.test(row.name))};
 }
 const definitionBody=definition=>Object.fromEntries(Object.entries(definition).filter(([key])=>key!=='payloadDigest'));
 const assertDefinitionIntegrity=definition=>{if(definition.payloadDigest)check(definition.payloadDigest===matrixDigest(definitionBody(definition)),'规范定义摘要不符；请保留原文后重新核对');};
 function readableDefinition(name,changes,schema){return [name,...changes.flatMap(change=>Object.entries(change.values).filter(([key,value])=>typeof value==='string'&&value.trim()&&!['row_uuid','origin_record_ref'].includes(key)&&!['REF','CHILD_REF','ID'].includes(schema[change.tableId]?.fields?.find(f=>f.key===key)?.type)).map(([key,value])=>(schema[change.tableId]?.fields?.find(f=>f.key===key)?.label??key)+'：'+value))].join('\n');}
 async function prepareDefinitionArchive({operationId,kind,name,changes,binding=null,destination,source=null,schema,summary='',mode='extend'}){
  check(typeof operationId==='string'&&operationId.trim()&&['character','world'].includes(kind),'归档操作标识或类型无效');check(typeof name==='string'&&name.trim()===name&&name&&!/[\r\n]/.test(name),'归档名称须为单行非空文字');
  check(object(destination)&&typeof destination.book==='string'&&destination.book.trim()===destination.book&&destination.book,'请选择这份定义要保存的世界书');
  const normalized=validateDefinitionChanges(changes,schema),book=destination.book,names=await sourceNames(),exists=names.includes(book),entries=exists?await sourceEntries(book):[],bookBefore=exists?await nativeSourceBook(book):null,definitions=entries.map(entry=>({entry,definition:readMatrixDefinition(entry)})).filter(x=>x.definition);definitions.forEach(x=>assertDefinitionIntegrity(x.definition));
  const requestDigest=matrixDigest({kind,name,changes:normalized,binding,summary,source}),sameOperation=definitions.filter(x=>x.definition.operationId===operationId);check(sameOperation.length<=1,'同一归档操作出现多个条目，请保留原书核对');
  if(sameOperation.length){const existing=sameOperation[0];check(existing.definition.requestDigest===requestDigest,'同一归档操作不能替换内容');const plan={format:ARCHIVE_PLAN_FORMAT,operationId,kind,book,definitionId:existing.definition.id,requestDigest,definition:existing.definition,schema:copy(Object.fromEntries(existing.definition.matrix.changes.map(c=>[c.tableId,schema[c.tableId]]))),basis:{exists:true,bookDigest:matrixDigest(entries)},bookBefore,documents:[],replay:true};plan.digest=planHash(plan);return plan;}
  check(!destination.newBook||!exists,'新世界书名称已存在；请换名或明确选择已有定义');check(exists||destination.newBook===true,'所选世界书不存在；请明确选择新建世界书');check(kind!=='world'||destination.newBook===true||destination.uid!==undefined,'新世界须新建世界书；修订已有世界须选择其初始化条目');
  let target=null;if(destination.uid!==undefined&&destination.uid!==null){check(exists,'目标条目所在世界书不存在');target=entries.find(e=>String(e.uid)===String(destination.uid));check(target,'要修订的世界书条目不存在');}
  if(!target&&kind==='character'&&binding?.dossierId){const matches=definitions.filter(x=>x.definition.kind==='character'&&x.definition.matrix.binding?.dossierId===binding.dossierId);check(matches.length<=1,'同一人物定义在此书中有多个条目，请先核对');if(matches.length)target=matches[0].entry;}
  const prior=target?readMatrixDefinition(target):null;if(prior){assertDefinitionIntegrity(prior);check(prior.kind===kind,'不能把世界定义改成人物或反向改写');}
  check(mode!=='revise'||prior||source?.entry&&typeof source.entry.content==='string','没有可复用的原书定义基线；请先从完整作者原文提炼，不能用聊天修改片段冒充完整初始定义');
  if(source?.book&&source.uid!==undefined&&source.digest){const fresh=await readSource(source);check(fresh.digest===source.digest,'原始来源已变化，请重新提炼后归档');}
  if(target&&!prior){check(source?.book===book&&String(source.uid)===String(target.uid)&&source.digest===matrixDigest({book,entry:target}),'覆盖原叙事条目须提供同一 UID 与原文快照');}
  const id=prior?.id??stableId('worldbook-definition:'+kind+':'+(kind==='character'?binding?.dossierId:binding?.worldId??normalized.find(c=>c.tableId==='T_STATIC_WORLDS')?.recordId??operationId));
  check(!definitions.some(x=>x.definition.id===id&&String(x.entry.uid)!==String(target?.uid)),'此定义已在所选世界书中存在；请使用已有条目');
  const merged=new Map((prior?.matrix.changes??[]).map(c=>[c.tableId+'#'+c.recordId,copy(c)]));for(const c of normalized){const key=c.tableId+'#'+c.recordId,old=merged.get(key),states={...old?.states};for(const field of Object.keys(c.values)){if(c.states&&Object.hasOwn(c.states,field))states[field]=c.states[field];else delete states[field];}merged.set(key,{tableId:c.tableId,recordId:c.recordId,values:{...old?.values,...c.values},...(Object.keys(states).length?{states}:{})});}
  // These links express record identity, not current chat progress. Reusing the
  // author's definition never copies a live balance, clock or state into it.
  if(kind==='character'&&binding?.entityId&&binding?.dossierId){const entityKey='T_SYS_ENTITIES#'+binding.entityId;let entity=merged.get(entityKey);if(!entity){entity={tableId:'T_SYS_ENTITIES',recordId:binding.entityId,values:{kind:'character',origin_record_ref:binding.originRefId??stableId('definition-origin:'+id)}};merged.set(entityKey,entity);}const linkId=entity.values.origin_record_ref;check(typeof linkId==='string'&&linkId,'人物定义缺少稳定原点链接');if(!merged.has('M_FIELD_REFERENCES#'+linkId))merged.set('M_FIELD_REFERENCES#'+linkId,{tableId:'M_FIELD_REFERENCES',recordId:linkId,values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:binding.entityId,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:binding.dossierId,reference_kind:'record',resolution_status:'resolved'}});}
  const archivedChanges=[...merged.values()];validateDefinitionChanges(archivedChanges,schema);
  for(const c of archivedChanges)for(const field of schema[c.tableId].fields??[])if(field.required&&creationFieldAllowed(field)){const decoded=decodeMatrix(c.values[field.key],field);check(decoded[0]!==null&&decoded[0]!==undefined&&decoded[1]==='known'&&(!c.states?.[field.key]||c.states[field.key]==='known'),'定义必填字段尚未完整填写：'+c.tableId+'.'+field.key);}
  if(kind==='character'){check(binding?.entityId&&binding?.dossierId,'人物定义缺少明确实体与档案绑定');const entity=archivedChanges.find(c=>c.tableId==='T_SYS_ENTITIES'&&c.recordId===binding.entityId),dossier=archivedChanges.find(c=>c.tableId==='T_CHAR_DOSSIER'&&c.recordId===binding.dossierId),link=archivedChanges.find(c=>c.tableId==='M_FIELD_REFERENCES'&&c.recordId===entity?.values.origin_record_ref);check(entity?.values.kind==='character'&&dossier&&link?.values.owner_table==='T_SYS_ENTITIES'&&link.values.owner_row_uuid===binding.entityId&&link.values.owner_field==='origin_record_ref'&&link.values.target_table==='T_CHAR_DOSSIER'&&link.values.target_row_uuid===binding.dossierId,'人物定义的规范实体、档案与来源引用不一致');}
  if(kind==='world')check(archivedChanges.some(c=>c.tableId==='T_STATIC_WORLDS'&&typeof c.values.name==='string'&&c.values.name.trim()&&(!binding?.worldId||binding.worldId===c.recordId)),'世界定义需要明确的世界身份记录');
  const available=new Map();for(const {definition}of definitions)for(const c of definition.matrix.changes)available.set(c.tableId+'#'+c.recordId,c);for(const c of archivedChanges)available.set(c.tableId+'#'+c.recordId,c);
  for(const c of archivedChanges)for(const field of schema[c.tableId].fields??[]){const value=c.values[field.key];if(value==null||!['REF','CHILD_REF','REF_LIST'].includes(field.type)||!field.ref||c.states&&c.states[field.key]&&!['known','derived'].includes(c.states[field.key]))continue;const table=field.ref.startsWith('@')?c.values[field.ref.slice(1)]:field.ref;if(!schema[table])continue;for(const ref of Array.isArray(value)?value:[value])if(typeof ref==='string')check(available.has(table+'#'+ref),'定义引用尚未保存在此世界书：'+table+'#'+ref+'；请先归档其定义，不能复制聊天当前数值代替初值');}
  const definition={format:MATRIX_DEFINITION_FORMAT,id,revision:(prior?.revision??0)+1,kind,name,operationId,requestDigest,summary:typeof summary==='string'&&summary.trim()?summary:readableDefinition(name,archivedChanges,schema),matrix:{changes:archivedChanges,...(binding?{binding:copy(binding)}:{})},source:copy(source)};definition.payloadDigest=matrixDigest(definitionBody(definition));
  const title=(kind==='character'?'【角色】':'【初始化】')+name;check(!entries.some(e=>String(e.uid)!==String(target?.uid)&&definitionTitle(e)===title),'目标世界书已有同名条目，请选择它或换名');
  const primary={...disabledEntry(title,JSON.stringify(definition)),...(target?{uid:target.uid}:{}),...(target&&Object.hasOwn(target,'comment')?{comment:title}:{})};
  const documents=[{role:'definition',uid:target?.uid??null,before:target?copy(target):null,entry:primary}];
  if(kind==='world'){
   const previousName=prior?'【资料】'+prior.name:null,oldLore=previousName?entries.filter(e=>definitionTitle(e)===previousName):[];check(oldLore.length<=1,'世界资料展示条目重复');if(oldLore.length)check(oldLore[0].content===prior.summary&&oldLore[0].enabled===false,'世界资料展示已被外部修改，请先核对，未覆盖');
   const loreName='【资料】'+name;check(!entries.some(e=>definitionTitle(e)===loreName&&e!==oldLore[0]),'目标世界书已有同名资料条目');documents.push({role:'lore',uid:oldLore[0]?.uid??null,before:oldLore[0]?copy(oldLore[0]):null,entry:{...disabledEntry(loreName,definition.summary),...(oldLore[0]?{uid:oldLore[0].uid}:{})}});
  }
  const plan={format:ARCHIVE_PLAN_FORMAT,operationId,kind,book,definitionId:id,requestDigest,definition,schema:copy(Object.fromEntries(archivedChanges.map(c=>[c.tableId,schema[c.tableId]]))),basis:{exists,bookDigest:matrixDigest(entries)},bookBefore,documents,replay:false};plan.digest=planHash(plan);return plan;
 }
 async function archivedReceipt(plan,status='confirmed'){
  const entries=await sourceEntries(plan.book),rows=entries.filter(e=>{const d=readMatrixDefinition(e);return d?.id===plan.definitionId&&d.operationId===plan.operationId;});check(rows.length===1,'归档条目保存后未能唯一回读');const row=rows[0],definition=readMatrixDefinition(row);assertDefinitionIntegrity(definition);check(matrixDigest(definition)===matrixDigest(plan.definition)&&row.enabled===false,'定义写入后回读不一致或自动注入未关闭');
  if(definition.kind==='world'){const lore=entries.filter(e=>definitionTitle(e)==='【资料】'+definition.name);check(lore.length===1&&lore[0].content===definition.summary&&lore[0].enabled===false,'世界资料条目回读不一致');}
  const snap=sourceSnapshot(plan.book,row),sourceArchive={book:plan.book,uid:row.uid,definitionId:definition.id,version:definition.revision,digest:snap.digest,definitionDigest:matrixDigest(definition),operationId:plan.operationId,kind:definition.kind};
  const bookAfter=await nativeSourceBook(plan.book),changedEntries=entries.filter(e=>String(e.uid)===String(row.uid)||definition.kind==='world'&&definitionTitle(e)==='【资料】'+definition.name).map(e=>({uid:e.uid,name:definitionTitle(e),content:e.content,enabled:false})),changedIds=new Set(changedEntries.map(e=>String(e.uid))),beforeNative=plan.bookBefore?.entries??[];
  for(const before of beforeNative)if(!changedIds.has(String(before.uid))){const after=bookAfter.entries.find(e=>String(e.uid)===String(before.uid));check(after&&matrixDigest(after)===matrixDigest(before),'无关世界书条目在保存期间改变，未确认完整归档');}
  check(bookAfter.entries.every(e=>changedIds.has(String(e.uid))||beforeNative.some(before=>String(before.uid)===String(e.uid))),'保存期间出现额外世界书条目，需重新核对来源');
  return {confirmed:true,status,operationId:plan.operationId,sourceArchive,bookBefore:copy(plan.bookBefore),bookAfter,changedEntries,records:definition.matrix.changes.map(c=>({tableId:c.tableId,recordId:c.recordId}))};
 }
 async function commitDefinitionArchive(plan,{guard=()=>{}}={}){
  check(plan?.format===ARCHIVE_PLAN_FORMAT&&plan.digest===planHash(plan),'归档计划已改变，请重新预览');validateDefinitionChanges(plan.definition.matrix.changes,plan.schema);assertDefinitionIntegrity(plan.definition);check(!locks.has(plan.book),'这本世界书正在保存');locks.set(plan.book,true);let attempted=false;
  try{
   guard();const names=await sourceNames();guard();
   if(names.includes(plan.book)){const current=await sourceEntries(plan.book);guard();if(current.some(e=>readMatrixDefinition(e)?.operationId===plan.operationId)){const receipt=await archivedReceipt(plan,'replayed');guard();return receipt;}check(plan.basis.exists&&matrixDigest(current)===plan.basis.bookDigest,'目标世界书已变化，请重新预览，未覆盖');}
   else check(!plan.basis.exists,'目标世界书已被删除，未自动重建');
   if(plan.bookBefore){const nativeNow=await nativeSourceBook(plan.book);guard();check(matrixDigest(nativeNow)===matrixDigest(plan.bookBefore),'原生世界书在预览后已变化，未覆盖');}
   check(!plan.replay,'已归档的定义不见了，请保留计划核对，未重新复制');
   if(plan.definition.source?.book&&plan.definition.source.uid!==undefined&&plan.definition.source.digest){const fresh=await readSource(plan.definition.source);guard();check(fresh.digest===plan.definition.source.digest,'原始来源已变化，未归档旧草稿');}
   const apply=entries=>{guard();check(matrixDigest(entries)===plan.basis.bookDigest,'世界书写入前已变化');const out=copy(entries);let nextUid=Math.max(-1,...out.map(e=>Number(e.uid)).filter(Number.isFinite))+1;for(const item of plan.documents){check(item.entry.enabled===false,'初始化与定义条目必须关闭自动注入');if(item.uid===null)out.push({...copy(item.entry),uid:nextUid++});else{const at=out.findIndex(e=>String(e.uid)===String(item.uid));check(at>=0&&matrixDigest(out[at])===matrixDigest(item.before),'目标条目写入前已变化');out[at]={...out[at],...copy(item.entry)};}}return out;};
   const h=helper();attempted=true;if(!plan.basis.exists){const wanted=apply([]);check(await h.createWorldbook(plan.book,wanted)===true,'世界书创建未确认');}else{let invoked=false;await h.updateWorldbookWith(plan.book,entries=>{invoked=true;return apply(entries);},{render:'immediate'});check(invoked,'宿主未执行定义归档');}
   const receipt=await archivedReceipt(plan,'written');guard();return receipt;
  }catch(error){
   let receipt={confirmed:false,status:attempted?'unknown':'not-written',operationId:plan.operationId,book:plan.book,definitionId:plan.definitionId};
   if(attempted)try{receipt=await archivedReceipt(plan,'written-before-error');}catch(readError){receipt.readError=readError.message;}
   throw Object.assign(new Error((receipt.confirmed?'世界书定义已保存；后续步骤未完成：':'世界书归档未完成：')+error.message,{cause:error}),{archivePlan:copy(plan),archiveReceipt:receipt});
  }finally{locks.delete(plan.book);}
 }
 return {read,write,create,bindOrigin,cardBooks,materials,originNames,listSources,readSource,prepareDefinitionArchive,commitDefinitionArchive,names:sourceNames,available:()=>{try{helper();return true;}catch{return false;}}};
}
