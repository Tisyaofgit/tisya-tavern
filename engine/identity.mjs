import {decode,digest} from './common.mjs';
import {templateBookName} from './template-book.mjs';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';
import {validateCreationProposal} from './creation.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const roleName=entry=>String(entry.comment??entry.name??'');
export function storyAvatar(config){
 const story=config.story??{},legacy=Object.hasOwn(story.play?.choices??{},'N01')?story.play.choices.N01:config.playDefaults?.choices?.N01;
 const managed=Object.hasOwn(story,'userMode')||!!story.userBinding;
 const mode=story.userMode??(story.userBinding?'bound':legacy==='N01-B'?'bound':legacy==='N01-C'?'ensemble':'unbound');
 return {mode,managed,choice:managed?(mode==='bound'?'N01-B':mode==='generic'?'N01-A':'N01-C'):legacy,
  binding:mode==='bound'?story.userBinding??null:null};
}
export const avatarReference=binding=>binding?(binding.database?'T_CHAR_DOSSIER#'+binding.dossierId:binding.book+'#'+binding.uid):'';
export function createStoryIdentity({config,getContext,getHelper=()=>globalThis.TavernHelper,assertIdle=()=>{},database=null,builtins=null,creator=null,sourceBooks=null}){
 check(database,'身份服务需要统一表单；书籍原文请先交给助手提炼，再选择已登记人物');
 return createDatabaseStoryIdentity({config,getContext,getHelper,assertIdle,database,builtins,creator,sourceBooks});
}

const DATABASE_LABEL='当前世界表单';
const rowEntries=(state,table)=>Object.entries(state?.tables?.[table]??{}).map(([id,row])=>({id,values:row.values??row,states:row.states??{}}));
const sameValue=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function entityDossierId(state,entity){
 const refs=rowEntries(state,'M_FIELD_REFERENCES').filter(r=>r.values.owner_table==='T_SYS_ENTITIES'&&r.values.owner_row_uuid===entity.id&&r.values.owner_field==='origin_record_ref'&&r.values.target_table==='T_CHAR_DOSSIER');
 const selected=entity.values.origin_record_ref,ids=typeof selected==='string'?[selected]:Array.isArray(selected)?selected:[];
 const linked=refs.filter(r=>!ids.length||ids.includes(r.id));check(linked.length<=1,'人物实体的原点档案引用不唯一');
 if(linked.length)return linked[0].values.target_row_uuid;
 if(selected)return null;
 return state.tables?.T_CHAR_DOSSIER?.[entity.id]?entity.id:null;
}
function databaseCharacters(snapshot){
 const entities=rowEntries(snapshot.state,'T_SYS_ENTITIES');
 return rowEntries(snapshot.state,'T_CHAR_DOSSIER').map(row=>{
  const candidates=entities.filter(e=>entityDossierId(snapshot.state,e)===row.id);
  check(candidates.length<=1,'人物档案对应多个实体，请先核对稳定编号');
  return {uid:row.id,dossierId:row.id,entityId:candidates[0]?.id??null,name:'【角色】'+String(row.values.name??row.id),content:String(row.values.manifest??''),values:structuredClone(row.values),states:structuredClone(row.states),revision:snapshot.revision,contextKey:snapshot.contextKey};
 });
}
export function projectDatabaseIdentity(snapshot,binding){
 check(snapshot?.state,'当前聊天尚未接入统一表单');check(binding?.database&&binding.entityId&&binding.dossierId,'人物表单绑定不完整');
 const entity=snapshot.state.tables?.T_SYS_ENTITIES?.[binding.entityId],dossier=snapshot.state.tables?.T_CHAR_DOSSIER?.[binding.dossierId];check(entity&&dossier,'所选人物表单记录已不存在');
 const entityValues=entity.values??entity,values=dossier.values??dossier;check(entityDossierId(snapshot.state,{id:binding.entityId,values:entityValues})===binding.dossierId,'人物档案与实体归属不一致');
 const name=String(['known','derived'].includes(dossier.states?.name??'known')?values.name??binding.dossierId:binding.dossierId),specs=snapshot.state.schema?.T_CHAR_DOSSIER?.fields??[];
 const text=Object.entries(values).filter(([key])=>!['row_uuid','char_id','name'].includes(key)).map(([key,value])=>(specs.find(f=>f.key===key)?.label??key)+'：'+(!['known','derived'].includes(dossier.states?.[key]??'known')?'['+(dossier.states?.[key]??'未提供')+']':typeof value==='string'?value:JSON.stringify(value))).join('\n');
 return {name,text,entityId:binding.entityId,dossierId:binding.dossierId,revision:snapshot.revision,contextKey:snapshot.contextKey};
}
function createDatabaseStoryIdentity({config,getContext,getHelper,assertIdle,database,builtins,creator,sourceBooks}){
 check(typeof database.read==='function'&&typeof database.commit==='function','统一表单接口尚未就绪');const drafts=new Map(),boundCompletions=new Set(),databaseCompletions=new Set();
 const books=sourceBooks??createBookGateway(getHelper,getContext);
 const scope=()=>{const c=getContext();return JSON.stringify([c.chatId,c.characterId,c.groupId]);};
 const read=async()=>{const key=scope(),snapshot=await database.read();check(key===scope(),'聊天已切换，请重新读取');check(snapshot?.state,'当前聊天尚未接入统一表单，请先创建世界或接入表单');return snapshot;};
 const names=async()=>{const c=getContext(),helper=getHelper();const result=typeof c.getWorldInfoNames==='function'?await c.getWorldInfoNames():typeof helper?.getWorldbookNames==='function'?await helper.getWorldbookNames():null;check(Array.isArray(result),'宿主世界书列表尚未就绪');return result;};
 async function list(){const snapshot=await read();return {book:DATABASE_LABEL,books:[DATABASE_LABEL],exists:true,database:true,entries:databaseCharacters(snapshot),schema:structuredClone(snapshot.state.schema.T_CHAR_DOSSIER?.fields??[]),revision:snapshot.revision};}
 async function bind({uid,dossierId=uid,entityId,mode='bound'},expected=config.read().revision){
  assertIdle();const key=scope(),value=config.read();check(value.revision===expected,'身份配置已变化，请重新读取');check(getContext().chatId,'请先打开聊天');
  if(mode==='bound'){const snapshot=await read(),row=databaseCharacters(snapshot).find(r=>r.dossierId===String(dossierId));check(row&&row.entityId,'人物缺少统一实体登记，请先在表单补齐');if(entityId)check(entityId===row.entityId,'人物实体引用不匹配');value.story.userBinding={database:true,entityId:row.entityId,dossierId:row.dossierId};value.story.userName=row.name.slice(4);value.story.userMode='bound';}
  else{check(['unbound','generic','ensemble'].includes(mode),'角色绑定模式无效');value.story.userBinding=null;value.story.userName='';value.story.userMode=mode;}
  check(key===scope(),'聊天已切换，选择未保存');return config.save(value);
 }
 async function previewEdit({uid,dossierId=uid,values={},name,content,before}){
  assertIdle();const key=scope(),snapshot=await read(),row=databaseCharacters(snapshot).find(r=>r.dossierId===String(dossierId));check(row&&row.entityId,'人物档案或统一实体登记不存在');
  check(content===undefined,'整段作者原文须先提炼为标准字段；本领外显表现仅接受明确的该字段修改');
  if(before?.revision!==undefined)check(before.revision===snapshot.revision&&before.contextKey===snapshot.contextKey,'表单已变化，请重新读取角色');
  const candidate={...structuredClone(values),...(name!==undefined?{name:name.replace(/^【角色】/u,'')}:{})},specs=snapshot.state.schema.T_CHAR_DOSSIER.fields,changed={},diff=[];
  for(const [field,value]of Object.entries(candidate)){const spec=specs.find(f=>f.key===field);check(spec&&!spec.read_only&&!spec.alias_of&&!spec.formula&&spec.type!=='ID','字段不存在或由系统维护：'+field);decode(value,spec);if(field==='name')check(typeof value==='string'&&value.trim()===value&&value,'角色名称不能为空');if(!sameValue(row.values[field],value)){changed[field]=value;diff.push({field,label:spec.label??field,before:row.values[field],after:value});}}
  const changes=Object.keys(changed).length?[{tableId:'T_CHAR_DOSSIER',recordId:row.dossierId,values:changed}]:[];
  check(changes.length,'没有需要提交的档案变化');
  const draft={id:'identity:'+crypto.randomUUID(),kind:'edit',scope:key,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,configurationRevision:config.read().revision,changes,diff,binding:{database:true,entityId:row.entityId,dossierId:row.dossierId},source:{kind:'identity-form',dossierId:row.dossierId}};drafts.set(draft.id,structuredClone(draft));return structuredClone(draft);
 }
 async function previewCreate({name,content='',values={}}){
  assertIdle();check(typeof name==='string'&&name.trim()===name&&name,'请填写角色名称');check(typeof content==='string','人物设定须为文字');check(!content.trim()||Object.keys(values).some(key=>key!=='name'),'叙事资料须先交给助手提炼为标准字段；作者原文不会写入本领外显表现');const snapshot=await read(),id=crypto.randomUUID(),originId=crypto.randomUUID();
  const changes=[{tableId:'T_CHAR_DOSSIER',recordId:id,values:{...structuredClone(values),name}},{tableId:'T_SYS_ENTITIES',recordId:id,values:{kind:'character',origin_record_ref:originId}},{tableId:'M_FIELD_REFERENCES',recordId:originId,values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:id,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:id,reference_kind:'record',resolution_status:'resolved'}}];
  validateCreationProposal({name,matrix:{changes,binding:{entityId:id,dossierId:id}}},snapshot,{kind:'character'});
  const draft={id:'identity:'+crypto.randomUUID(),kind:'create',scope:scope(),contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,configurationRevision:config.read().revision,changes,diff:Object.entries(changes[0].values).map(([field,after])=>({field,label:snapshot.state.schema.T_CHAR_DOSSIER.fields.find(f=>f.key===field)?.label??field,before:undefined,after})),binding:{database:true,entityId:id,dossierId:id},source:{kind:'manual-character',text:content},bindOnCommit:true};drafts.set(draft.id,structuredClone(draft));return structuredClone(draft);
 }
 async function sourceChoices(book=config.read().coreBook??'基点书'){
  const key=scope(),result=await books.listSources({book,kind:'character'});check(key===scope(),'聊天已切换，请重新选择来源');const managed=builtins?.bookNames?.()??{},excluded=[managed.templates??templateBookName(config.read()),managed.beauty??'缇斯亚美化书'];
  return {...result,books:result.books.filter(name=>!excluded.includes(name)),...(excluded.includes(result.book)?{book:'',exists:false,entries:[],unmarkedEntries:[]}:{})};
 }
 async function readAuthorSource({book,uid},{allowAuxiliary=false}={}){
  check(typeof book==='string'&&book.trim()===book&&book&&uid!==null&&uid!==undefined,'角色来源定位不完整');
  const managed=builtins?.bookNames?.()??{};check(![managed.templates??templateBookName(config.read()),managed.beauty??'缇斯亚美化书'].includes(book),'定义专用书不能作为当前角色来源');
  const key=scope();let result;
  if(sourceBooks||!builtins?.readSourceBook)result=await books.readSource({book,uid});else{const data=await builtins.readSourceBook(book);check(data?.entries&&typeof data.entries==='object','角色来源书不存在或损坏');const rows=Object.values(data.entries).filter(e=>String(e.uid)===String(uid));check(rows.length===1,'角色 UID 不存在或重复');const row=rows[0],title=roleName(row);check(typeof row.content==='string','来源不是完整文本条目');const definition=readMatrixDefinition(row);result={book,uid:row.uid,name:title,title,content:row.content,entry:structuredClone(row),digest:digest({book,entry:row}),version:definition?.revision??null,definition};}
  check(key===scope(),'聊天已切换，未读取角色来源');check(allowAuxiliary||!result.definition||result.definition.kind==='character','所选初始化条目是世界定义，请选择人物条目');return result;
 }
 async function previewSourceExtraction(reference){
  assertIdle();check(reference?.book&&reference.uid!==undefined&&!reference.database,'请选择待提炼的书籍原文');check(!reference.revisionTarget,'旧迁移目标已退役，请重新选择原文并核对提炼结果');
  const author=await readAuthorSource(reference);if(reference.digest)check(reference.digest===author.digest,'来源已变化，请重新读取后提炼');if(author.definition)return previewSourceImport(author);
  return {kind:'source-extraction',requiresExtraction:true,mode:'extend',source:author,destination:{book:author.book,uid:author.uid},goal:'按原文提炼 '+author.title.replace(/^【角色】/u,'')+' 的标准人物字段；保留原文，未知留空，不猜数值。'};
 }
 async function previewAuthorSource(input){
  assertIdle();const key=scope(),managed=builtins?.bookNames?.()??{};
  check(![managed.templates??templateBookName(config.read()),managed.beauty??'缇斯亚美化书'].includes(input.book),'定义专用书不能保存简单人物');
  const plan=await books.prepareAuthorSource(input);check(key===scope(),'聊天已切换，人物原文未保存');return {scope:key,plan};
 }
 async function saveAuthorSource(draft){
  assertIdle();const guard=()=>check(draft.scope===scope(),'聊天已切换，未覆盖其他聊天的角色来源');guard();
  return books.commitAuthorSource(draft.plan,{guard});
 }
 const archiveReference=source=>({book:source.book,uid:source.uid,definitionId:source.definition.id,version:source.definition.revision,digest:source.digest,definitionDigest:digest(source.definition),operationId:source.definition.operationId??null,kind:source.definition.kind});
 function isInstantiatedFrom(snapshot,row,source,record){const ref=archiveReference(source),same=link=>link?.book===ref.book&&String(link.uid)===String(ref.uid)&&link.definitionId===ref.definitionId&&link.version===ref.version&&link.definitionDigest===ref.definitionDigest;if(same(row.metadata?.sourceDefinition))return true;const owns=link=>!link?.records||link.records.some(value=>value.tableId===record.tableId&&value.recordId===record.recordId);return Object.values(snapshot.state.runtime?.receipts??{}).some(receipt=>{const saved=receipt.result?.source,links=[saved?.sourceArchive,...(saved?.sourceArchive?.entries??[]),...(saved?.sourceArchives??[])];return links.some(link=>same(link)&&owns(link));});}
 async function definitionClosure(source,snapshot){
  const key=scope(),listed=await books.listSources({book:source.book,kind:'all'});check(key===scope(),'聊天已切换，未读取人物定义依赖');
  const candidates=(listed.entries??[]).filter(row=>row.definition),root=candidates.find(row=>String(row.uid)===String(source.uid));check(root?.digest===source.digest,'来源已变化，请重新预览人物定义');
  const recordKey=record=>record.tableId+'#'+record.recordId,owners=new Map(),selected=new Map(),records=new Map(),queue=[];
  for(const owner of candidates)for(const change of owner.definition.matrix.changes){const id=recordKey(change),matches=owners.get(id)??[];matches.push(owner);owners.set(id,matches);}
  const known=(change,field)=>['known','derived'].includes(change.states?.[field]??'known');
  const add=owner=>{if(selected.has(String(owner.uid)))return;selected.set(String(owner.uid),owner);for(const change of owner.definition.matrix.changes){const id=recordKey(change);check(owners.get(id)?.length===1,'同一记录在来源书中有多个定义，请核对：'+id);check(snapshot.state.schema[change.tableId],'来源定义包含未登记表：'+change.tableId);records.set(id,{change,source:owner});queue.push(change);}};
  add(root);
  // Explicit ownership edges bring this person's skills, balances and other
  // authored records along without selecting other people from the same book.
  const binding=root.definition.matrix.binding??{};
  for(const owner of candidates)for(const change of owner.definition.matrix.changes){const fields=snapshot.state.schema[change.tableId]?.fields??[];if(fields.some(field=>field.type==='REF'&&known(change,field.key)&&typeof change.values[field.key]==='string'&&change.values[field.key]&&(field.key==='char_ref'&&field.ref==='T_CHAR_DOSSIER'&&change.values[field.key]===binding.dossierId||field.key==='owner_ref'&&field.ref==='T_SYS_ENTITIES'&&change.values[field.key]===binding.entityId)))add(owner);}
  const include=(tableId,recordId)=>{if(typeof recordId!=='string'||!recordId)return;check(typeof tableId==='string'&&snapshot.state.schema[tableId],'定义引用的目标表无效：'+String(tableId));const id=tableId+'#'+recordId,matches=owners.get(id)??[];check(matches.length===1,matches.length?'同一记录在来源书中有多个定义，请核对：'+id:'来源书缺少关联定义：'+id);add(matches[0]);};
  for(let index=0;index<queue.length;index++){
   const change=queue[index],spec=snapshot.state.schema[change.tableId];
   for(const field of spec.fields??[]){if(!['REF','CHILD_REF','REF_LIST'].includes(field.type)||!known(change,field.key))continue;const value=change.values[field.key],target=field.ref?.startsWith('@')?change.values[field.ref.slice(1)]:field.ref;for(const id of Array.isArray(value)?value:[value])include(target,id);}
   if(['M_FIELD_REFERENCES','M_LIST_VALUES'].includes(change.tableId)&&change.values.reference_kind!=='external'&&known(change,'target_table')&&known(change,'target_row_uuid'))include(change.values.target_table,change.values.target_row_uuid);
  }
  return {sources:[...selected.values()],records:[...records.values()]};
 }
 async function verifyImportSources(draft,snapshot){
  if(draft.importSources){const source=await readAuthorSource(draft.importSource);check(source.digest===draft.importSource.digest,'来源已变化，请重新预览');const closure=await definitionClosure(source,snapshot??await read()),current=new Map(closure.sources.map(row=>[String(row.uid),row]));check(current.size===draft.importSources.length,'来源的关联定义已变化，请重新预览');for(const expected of draft.importSources)check(current.get(String(expected.uid))?.digest===expected.digest,'来源已变化，请重新预览；待保存的依赖仍保留：'+expected.book+' / '+expected.uid);return;}
  if(draft.importSource){const fresh=await readAuthorSource(draft.importSource);check(fresh.digest===draft.importSource.digest,'来源已变化，请重新预览；待保存的原文仍保留');}
 }
 async function previewSourceImport(input,{bindOnCommit=true}={}){
  assertIdle();check(input?.book&&input.uid!==undefined&&typeof input.digest==='string','缺少来源快照，请重新选择');const source=await readAuthorSource(input);check(source.digest===input.digest,'来源已变化，请重新读取后提炼');const snapshot=await read();
  check(source.definition,'叙事条目须先交给助手提炼并归档，不能作为已完成的标准人物直接迁移');
  check(source.definition.matrix.binding?.entityId&&source.definition.matrix.binding.dossierId,'人物定义缺少规范实体与档案绑定');
  const closure=await definitionClosure(source,snapshot),candidate=structuredClone({name:source.definition.name,matrix:{...source.definition.matrix,changes:closure.records.map(row=>row.change)}});validateCreationProposal(candidate,snapshot,{kind:'character',mode:'revise'});
  const identity=candidate.matrix.binding;check(identity?.entityId&&identity?.dossierId,'人物定义缺少规范实体与档案绑定');
  const sourceArchive=archiveReference(source),changes=[],diff=[];
  for(const change of candidate.matrix.changes){const owner=closure.records.find(row=>row.change.tableId===change.tableId&&row.change.recordId===change.recordId).source,existing=snapshot.state.tables[change.tableId]?.[change.recordId],fromSource=existing&&isInstantiatedFrom(snapshot,existing,owner,change);if(existing){check(fromSource,'记录 ID 已被另一份内容占用，或缺少同版来源凭证，未覆盖当前聊天：'+change.tableId+'#'+change.recordId);diff.push({field:change.tableId+'#'+change.recordId,label:'沿用已实例化记录，当前进度保持',before:structuredClone(existing.values),after:structuredClone(existing.values)});continue;}
   changes.push({...structuredClone(change),metadata:{sourceDefinition:archiveReference(owner)}});for(const [field,after]of Object.entries(change.values))diff.push({field:change.tableId+'#'+change.recordId+'.'+field,label:snapshot.state.schema[change.tableId].fields.find(f=>f.key===field)?.label??field,before:undefined,after});
  }
  const importSources=closure.sources.map(row=>({book:row.book,uid:row.uid,digest:row.digest})),sourceArchives=closure.sources.map(row=>({...archiveReference(row),records:row.definition.matrix.changes.map(change=>({tableId:change.tableId,recordId:change.recordId}))}));
  const draft={id:'identity:'+crypto.randomUUID(),kind:'source-import',scope:scope(),contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,configurationRevision:config.read().revision,changes,diff,binding:{database:true,entityId:identity.entityId,dossierId:identity.dossierId,source:sourceArchive},source:{kind:'definition-instance',sourceArchive,sourceArchives,rawEntry:source.entry,rawDependencies:closure.sources.filter(row=>String(row.uid)!==String(source.uid)).map(row=>({book:row.book,uid:row.uid,entry:row.entry,digest:row.digest})),sourceDigest:source.digest},importSource:{book:source.book,uid:source.uid,digest:source.digest},importSources,bindOnCommit};drafts.set(draft.id,structuredClone(draft));return structuredClone(draft);
 }
 async function validateEdit(input){
  assertIdle();const draft=drafts.get(input?.id);check(draft&&sameValue(input,draft),'角色草稿已改变，请重新预览');check(draft.scope===scope(),'聊天已切换，未提交旧角色草稿');
  if(!databaseCompletions.has(draft.id)){
   const snapshot=await read();check(snapshot.contextKey===draft.contextKey&&snapshot.revision===draft.expectedRevision,'表单已变化，请重新读取角色');
   if(draft.importSource)await verifyImportSources(draft,snapshot);
  }
  if(draft.bindOnCommit&&!boundCompletions.has(draft.id))check(config.read().revision===draft.configurationRevision,'人物草稿所依聊天选择已改变，请重新核对');
  check(draft.scope===scope(),'聊天已切换，未提交旧角色草稿');return true;
 }
 async function commitEdit(input){
  assertIdle();const draft=drafts.get(input?.id);check(draft&&sameValue(input,draft),'角色草稿已改变，请重新预览');check(draft.scope===scope(),'聊天已切换，未提交旧角色草稿');
  if(draft.kind==='source-import')await validateEdit(input);
  if(draft.importSource&&!databaseCompletions.has(draft.id)&&draft.kind!=='source-import')await verifyImportSources(draft);
  const result=await database.commit({operationId:draft.id,expectedRevision:draft.expectedRevision,contextKey:draft.contextKey,changes:structuredClone(draft.changes),source:structuredClone(draft.source)});
  check(result?.state&&result.contextKey===draft.contextKey,'表单提交未返回匹配的归属，尚未确认保存');databaseCompletions.add(draft.id);
  const databaseReceipt={confirmed:true,operationId:draft.id,contextKey:result.contextKey,beforeRevision:draft.expectedRevision,revision:result.revision,records:draft.changes.map(change=>({tableId:change.tableId,recordId:change.recordId}))};
  const partial=message=>Object.assign(Error(message),{databaseReceipt});
  if(draft.scope!==scope())throw partial('角色表单已保存，聊天已切换；没有改动新聊天绑定');
  const value=config.read();if(!boundCompletions.has(draft.id)&&(draft.bindOnCommit||value.story.userBinding?.database&&value.story.userBinding.dossierId===draft.binding.dossierId)){
   if(draft.bindOnCommit&&value.revision!==draft.configurationRevision)throw partial('人物表单已保存，但聊天选择已改变；请重新选择该人物');
   const projected=projectDatabaseIdentity(result,draft.binding);value.story.userBinding=structuredClone(draft.binding);value.story.userName=projected.name;value.story.userMode='bound';try{await config.save(value);boundCompletions.add(draft.id);}catch(error){throw Object.assign(partial('角色表单已保存，当前聊天绑定尚未确认：'+error.message),{cause:error});}
  }
  return {databaseReceipt,...projectDatabaseIdentity(result,draft.binding),uid:draft.binding.dossierId,name:'【角色】'+projectDatabaseIdentity(result,draft.binding).name,content:String(result.state.tables.T_CHAR_DOSSIER[draft.binding.dossierId].values.manifest??''),values:structuredClone(result.state.tables.T_CHAR_DOSSIER[draft.binding.dossierId].values)};
 }
 async function resources(){const snapshot=await database.read(),all=await names(),value=config.read(),managed=builtins?.bookNames?.()??{};return {database:true,books:all,templateBook:managed.templates??templateBookName(value),referenceBooks:[...(value.story.referenceBooks??[])],phoneWorld:value.story.phoneWorld??null,excluded:[managed.templates??templateBookName(value),managed.beauty??'缇斯亚美化书',value.coreBook??'基点书'].filter(Boolean),worlds:rowEntries(snapshot?.state,'T_STATIC_WORLDS').map(r=>({uid:r.id,worldId:r.id,name:String(r.values.name??r.id)})),builtinStatus:builtins?.status?.()??null};}
 async function saveResources({referenceBooks=[],phoneWorld=null},expected=config.read().revision){
  assertIdle();const key=scope(),value=config.read();check(value.revision===expected,'身份配置已变化，请重新读取');const available=await resources();check(Array.isArray(referenceBooks)&&new Set(referenceBooks).size===referenceBooks.length&&referenceBooks.every(name=>available.books.includes(name)&&!available.excluded.includes(name)),'资料书选择无效、重复或包含定义专用书');
  if(phoneWorld!==null)check(phoneWorld.database===true&&available.worlds.some(w=>w.worldId===phoneWorld.worldId),'请选择当前表单中实际世界');
  check(key===scope(),'聊天已切换，资料选择未保存');value.story.referenceBooks=[...referenceBooks];value.story.phoneWorld=phoneWorld?{database:true,worldId:phoneWorld.worldId}:null;return config.save(value);
 }
 async function phoneProfile(){const value=config.read(),binding=storyAvatar(value).binding,world=value.story.phoneWorld;if(!binding?.database||!world?.database)return null;const snapshot=await read();projectDatabaseIdentity(snapshot,binding);check(snapshot.state.tables?.T_STATIC_WORLDS?.[world.worldId],'选中的世界表单记录已不存在');return {database:true,entityId:binding.entityId,dossierId:binding.dossierId,worldId:world.worldId,contextKey:snapshot.contextKey,revision:snapshot.revision};}
 async function ensureTemplates(){check(builtins,'内置书安装服务尚未接入');return builtins.update();}
 const rejectLegacySource=draft=>check(!draft?.source?.revisionTarget,'旧迁移目标已退役，请重新选择原文并核对提炼结果');
 async function createDraft({goal,kind='character',mode='extend',source=null,destination,messages,onProgress,signal}){
  check(creator?.draft,'统一创作服务尚未接入');rejectLegacySource({source});
  if(kind==='character'&&source?.book&&source.uid!==undefined){const handoff=await previewSourceExtraction(source);check(handoff.requiresExtraction,'此来源已是规范人物，请先预览使用已有档案');check(mode==='extend','书籍原文须先提炼为新定义；修订请明确选择当前标准人物');source=handoff.source;}
  return creator.draft(goal,{kind,mode,source,destination,messages,onProgress,signal});
 }
 async function validateCreation(draft){check(creator?.validate,'统一创作预检服务尚未接入');rejectLegacySource(draft);return creator.validate(draft);}
 async function saveCreation(draft){check(creator?.save,'统一创作保存服务尚未接入');rejectLegacySource(draft);return creator.save(draft);}
 async function pendingCreation(){
  const pending=await creator?.pending?.();if(pending)return pending;
  const key=scope(),snapshot=await database.read();check(key===scope(),'聊天已切换，请重新读取');if(snapshot===null||snapshot===undefined)return null;
  check(snapshot.state,'当前表单读取结果损坏，人物绑定恢复已停止');
  const receipts=snapshot.state.runtime?.receipts??{},unfinished=[];
  for(const receipt of Object.values(receipts)){
   const saved=receipt.result?.source?.kind==='creation-intent'?receipt.result.source.draft:null;
   if(saved?.bindOnSave&&receipts[saved.operationId]&&!receipts[saved.operationId+':character-binding'])unfinished.push(saved);
  }
  check(unfinished.length<=1,'当前聊天有多份人物绑定待核对，请先查看已保存档案');
  return unfinished.length?structuredClone(unfinished[0]):null;
 }
 async function completeCreationBinding(draft,{keepCurrent=false}={}){
  assertIdle();const key=scope(),snapshot=await read(),receipts=snapshot.state.runtime?.receipts??{};
  const saved=receipts[draft.operationId+':creation-intent']?.result?.source?.draft,binding=saved?.proposal?.matrix?.binding;
  check(saved?.bindOnSave&&saved.contextKey===snapshot.contextKey&&receipts[draft.operationId]?.result?.source?.kind==='creation','人物使用意图与已保存档案不匹配');
  check(sameValue(binding,draft.proposal?.matrix?.binding),'人物使用目标已变化，请核对已保存档案');
  const current=storyAvatar(config.read());if(!keepCurrent)check(current.mode==='bound'&&current.binding?.database&&current.binding.dossierId===binding.dossierId&&current.binding.entityId===binding.entityId,'当前人物绑定尚未确认');
  check(key===scope(),'聊天已切换，未确认另一聊天的人物绑定');
  const operationId=draft.operationId+':character-binding';
  const result=await database.commit({operationId,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,changes:[],source:{kind:'creation-binding',operationId:draft.operationId,binding:structuredClone(binding),resolution:keepCurrent?'kept-current':'bound'}});
  check(result?.contextKey===snapshot.contextKey&&result.state?.runtime?.receipts?.[operationId],'人物绑定收尾未获确认，已保存档案与选择保留');return result;
 }
 async function repairCreation(saved,options={}){
  check(creator?.repair,'待修服务尚未接入；原始内容与已保存条目仍保留');rejectLegacySource(saved?.repairContext??saved?.draft??saved);return creator.repair(saved,options);
 }
 return {database:true,scope,list,bind,sourceChoices,readSource:readAuthorSource,previewAuthorSource,saveAuthorSource,previewSourceImport,previewEdit,validateEdit,commitEdit,previewCreate,previewSourceExtraction,edit:previewEdit,create:previewCreate,ensureBook:async()=>DATABASE_LABEL,ensureTemplates,resources,worldDefinitions:async()=>{const r=await resources();return r.worlds;},saveResources,phoneProfile,creationTask:()=>creator?.creationTask?.()??null,subscribeCreation:fn=>creator?.subscribeCreation?.(fn)??(()=>{}),cancelCreation:()=>creator?.cancelCreation?.()??false,rememberCreationView:view=>creator?.rememberCreationView?.(view),creationView:()=>creator?.creationView?.()??null,clearCreationView:()=>creator?.clearCreationView?.(),createDraft,repairCreation,validateCreation,saveCreation,pendingCreation,completeCreationBinding,builtinStatus:()=>builtins?.status?.(),resolveBuiltinConflict:args=>{check(builtins,'内置书服务尚未接入');return builtins.resolveConflict(args);}};
}
