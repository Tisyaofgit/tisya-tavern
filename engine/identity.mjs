import {decode,digest} from './common.mjs';
import {templateBookName,ensureTemplateBook,stripPhoneInitialization} from './template-book.mjs';
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
export function createStoryIdentity({config,getContext,getHelper=()=>globalThis.TavernHelper,assertIdle=()=>{},database=null,builtins=null,creator=null}){
 if(database)return createDatabaseStoryIdentity({config,getContext,getHelper,assertIdle,database,builtins,creator});
 const scope=()=>{const c=getContext();return JSON.stringify([c.chatId,c.characterId,c.groupId]);};
 const helper=()=>{const h=getHelper();check(h,'世界书接口尚未就绪');return h;};
 let preparation=null,templatePreparation=null,editing=false;
 async function ensureBook(book=config.read().story.userBinding?.book??config.read().coreBook??'基点书'){
  if(preparation)return preparation;
  const work=async()=>{
   assertIdle();check(typeof book==='string'&&book.trim()===book&&book,'基点书名称不能为空');check(book!==templateBookName(config.read()),'模板书不能作为角色档案书');
   const captured=scope(),h=helper(),guard=()=>check(captured===scope(),'聊天已切换；基点书已保存的部分保留，请重新打开身份页');
   const names=await h.getWorldbookNames();guard();
   if(!names.includes(book)){check(await h.createWorldbook(book,[])===true,'基点书创建未确认');guard();check((await h.getWorldbookNames()).includes(book),'基点书创建后回读失败');}
   guard();return book;
  };
  preparation=work();try{return await preparation;}finally{preparation=null;}
 }
 async function list(book=config.read().story.userBinding?.book??config.read().coreBook??'基点书'){
  const h=helper(),all=await h.getWorldbookNames(),books=all.filter(name=>name!==templateBookName(config.read()));
  const entries=all.includes(book)?Object.values((await getContext().loadWorldInfo(book))?.entries??{}).filter(e=>/^【角色】.+/u.test(roleName(e))).map(e=>({uid:e.uid,name:roleName(e),content:e.content})):[];
  return {book,books,exists:all.includes(book),entries};
 }
 async function bind({book,uid,mode='bound'},expected=config.read().revision){
  assertIdle();const captured=scope(),value=config.read();check(value.revision===expected,'身份配置已变化，请重新读取');check(getContext().chatId,'请先打开要绑定的聊天');
  if(mode==='bound'){
   const rows=await list(book);check(rows.exists,'请选择已建立的基点书');const found=rows.entries.filter(e=>String(e.uid)===String(uid));check(found.length===1,'基点书的角色条目已不存在或标识重复');const entry=found[0];
   value.coreBook=book;value.story.userBinding={book,uid:entry.uid};value.story.userName=entry.name.slice('【角色】'.length);value.story.userMode='bound';
  }else{check(['unbound','generic','ensemble'].includes(mode),'角色绑定模式无效');value.story.userBinding=null;value.story.userName='';value.story.userMode=mode;}
  check(captured===scope(),'聊天已切换，绑定尚未保存');return config.save(value);
 }
 async function create({book=config.read().coreBook??'基点书',name,content},expected=config.read().revision){
  assertIdle();check(getContext().chatId,'请先打开要绑定的聊天');check(typeof book==='string'&&book.trim()===book&&book,'基点书名称不能为空');check(typeof name==='string'&&name.trim()===name&&name&&!/[\r\n]/.test(name),'角色名称须为单行非空文字');check(typeof content==='string'&&content.trim(),'请填写角色条目原文');
  check(book!==templateBookName(config.read()),'模板书不能作为角色档案书');
  const captured=scope(),h=helper(),title=name.startsWith('【角色】')?name:'【角色】'+name;
  check(title.slice('【角色】'.length).trim(),'角色名称不能为空');
  check(config.read().revision===expected,'身份配置已变化，请重新读取');
  const guard=()=>check(scope()===captured,'聊天已切换；已保存的角色条目保留，尚未绑定到新聊天');
  const wanted={name:title,content,enabled:false,strategy:{type:'selective',keys:[],keys_secondary:{logic:'and_any',keys:[]},scan_depth:'same_as_global'},position:{type:'after_character_definition',role:'system',depth:0,order:100},probability:100,recursion:{prevent_incoming:true,prevent_outgoing:true,delay_until:null},effect:{sticky:null,cooldown:null,delay:null}};
  const names=await h.getWorldbookNames();guard();
  if(!names.includes(book)){check(await h.createWorldbook(book,[wanted])===true,'基点书保存未确认');}
  else {const entries=await h.getWorldbook(book);guard();const same=entries.filter(e=>e.name===title);check(same.length<=1,'基点书中有多个同名角色，请先核对');if(same.length)check(same[0].content===content,'已有同名角色且内容不同，请选择已有条目或使用另一名称');else await h.updateWorldbookWith(book,entries=>{guard();check(!entries.some(e=>e.name===title),'保存期间出现同名角色');return [...entries,wanted];},{render:'immediate'});}
  guard();
  const rows=await list(book),entry=rows.entries.find(e=>e.name===title&&e.content===content);check(entry,'角色条目保存后回读不同');
  try{await bind({book,uid:entry.uid},expected);}catch(e){throw Error('角色已保存至 '+book+' / '+title+'；聊天绑定未完成：'+e.message);}
  return entry;
 }
 async function edit({book,uid,name,content,before},expected=config.read().revision){
  check(!editing,'角色档案正在保存，请稍候');assertIdle();
  check(typeof book==='string'&&book.trim()===book&&book,'基点书名称不能为空');
  check(uid!==undefined&&uid!==null&&String(uid).trim(),'角色条目标识缺失');
  check(typeof name==='string'&&name.trim()===name&&name&&!/[\r\n]/.test(name),'角色名称须为单行非空文字');
  check(typeof content==='string'&&content.trim(),'请填写角色条目原文');
  check(before&&typeof before.name==='string'&&typeof before.content==='string','缺少原档案快照，请重新读取');
  check(book!==templateBookName(config.read()),'模板书不能作为角色档案书');
  const captured=scope(),h=helper(),title=name.startsWith('【角色】')?name:'【角色】'+name;
  check(title.slice('【角色】'.length).trim(),'角色名称不能为空');
  check(typeof h.getWorldbook==='function'&&typeof h.updateWorldbookWith==='function','宿主尚未提供档案更新接口');
  const guard=()=>{check(captured===scope(),'聊天已切换，请重新打开角色档案');check(config.read().revision===expected,'身份配置已变化，请重新读取');};
  const selected=entries=>{check(Array.isArray(entries),'角色书读取格式无效');const rows=entries.filter(e=>String(e.uid)===String(uid));check(rows.length===1,'角色条目不存在或标识重复，请重新读取');return rows[0];};
  const verify=entries=>{const row=selected(entries);check(/^【角色】.+/u.test(roleName(row)),'所选条目不是角色档案');check(roleName(row)===before.name&&row.content===before.content,'角色档案已被其他页面修改，请重新读取后核对');check(!entries.some(e=>String(e.uid)!==String(uid)&&roleName(e)===title),'已有同名角色，请使用不同名称');return row;};
  editing=true;let written=false;
  try{
   guard();const entries=await h.getWorldbook(book);guard();const original=verify(entries);
   if(roleName(original)!==title||original.content!==content){
    let invoked=false;
    await h.updateWorldbookWith(book,rows=>{guard();verify(rows);invoked=true;return rows.map(e=>String(e.uid)===String(uid)?{...e,name:title,...(Object.hasOwn(e,'comment')?{comment:title}:{}),content}:e);},{render:'immediate'});
    check(invoked,'宿主没有执行角色档案更新，请重新读取核对');
   }
   const actual=selected(await h.getWorldbook(book));
   check(roleName(actual)===title&&actual.content===content,'角色档案写入后回读不同，尚未确认保存');written=true;
   guard();const value=config.read();
   if(value.story.userBinding?.book===book&&String(value.story.userBinding.uid)===String(uid)&&value.story.userName!==title.slice('【角色】'.length)){
    value.story.userName=title.slice('【角色】'.length);await config.save(value);
   }
   return {uid:actual.uid,name:title,content};
  }catch(error){if(written)throw Error('角色档案已保存至 '+book+' / '+title+'；当前聊天身份同步未完成：'+error.message);throw error;}
  finally{editing=false;}
 }
 async function ensureTemplates(){
  if(templatePreparation)return templatePreparation;
  templatePreparation=(async()=>{assertIdle();const captured=scope(),value=config.read(),name=templateBookName(value),guard=()=>check(captured===scope(),'聊天已切换，已准备的模板书保留');
   const receipt=await ensureTemplateBook({name,getHelper,guard});guard();
   if(value.templateBook!==name){check(config.read().revision===value.revision,'配置已变化，模板书已保存，请重新读取');value.templateBook=name;await config.save(value);}
   return receipt;
  })();try{return await templatePreparation;}finally{templatePreparation=null;}
 }
 async function resources(){const value=config.read(),all=await helper().getWorldbookNames();check(Array.isArray(all),'世界书列表无效');return {books:all,templateBook:templateBookName(value),referenceBooks:[...(value.story.referenceBooks??[])],phoneWorld:value.story.phoneWorld??null,excluded:[templateBookName(value),value.coreBook??'基点书',value.story.userBinding?.book].filter(Boolean)};}
 async function worldDefinitions(book){
  if(!book)return [];const captured=scope();check(book!==templateBookName(config.read()),'模板骨架不能直接作为当前手机世界');
  const data=await getContext().loadWorldInfo(book);check(captured===scope(),'聊天已切换，未选择旧世界');check(data?.entries&&typeof data.entries==='object','手机世界资料书不存在或损坏：'+book);
  const rows=Object.values(data.entries).filter(e=>/^【手机世界】.+/u.test(roleName(e))),ids=new Set();for(const row of rows){check(Number.isSafeInteger(row.uid)&&row.uid>=0&&!ids.has(row.uid)&&typeof row.content==='string','手机世界条目标识或正文无效：'+book);ids.add(row.uid);}return rows.map(e=>({uid:e.uid,name:roleName(e),content:e.content}));
 }
 async function saveResources({referenceBooks=[],phoneWorld=null},expected=config.read().revision){
  assertIdle();const captured=scope(),value=config.read();check(value.revision===expected,'身份配置已变化，请重新读取');check(getContext().chatId,'请先打开聊天');
  check(Array.isArray(referenceBooks)&&referenceBooks.every(n=>typeof n==='string'&&n.trim()===n&&n)&&new Set(referenceBooks).size===referenceBooks.length,'资料书选择无效或重复');
  const all=await helper().getWorldbookNames();check(captured===scope(),'聊天已切换，资料书选择未保存');
  const excluded=new Set([templateBookName(value),value.coreBook??'基点书',value.story.userBinding?.book].filter(Boolean));
  check(referenceBooks.every(n=>all.includes(n)&&!excluded.has(n)),'所选资料书缺失，或包含模板书／基点角色书');
  if(phoneWorld!==null){check(phoneWorld&&typeof phoneWorld.book==='string'&&phoneWorld.uid!==null&&phoneWorld.uid!==undefined,'手机世界引用不完整');check(all.includes(phoneWorld.book),'手机世界资料书不存在');const rows=await worldDefinitions(phoneWorld.book);check(rows.some(e=>String(e.uid)===String(phoneWorld.uid)),'手机世界定义已不存在，请重新选择');}
  check(captured===scope()&&config.read().revision===expected,'聊天或配置已变化，资料书选择未保存');
  value.story.referenceBooks=[...referenceBooks];value.story.phoneWorld=phoneWorld?{book:phoneWorld.book,uid:phoneWorld.uid}:null;return config.save(value);
 }
 async function phoneProfile(){
  const captured=scope(),value=config.read(),character=storyAvatar(value).binding,world=value.story.phoneWorld;if(!character||!world)return null;
  check(world.book!==templateBookName(value)&&character.book!==templateBookName(value),'模板骨架不能直接作为当前手机世界或角色');
  check(typeof getContext().loadWorldInfo==='function','世界书读取接口尚未就绪');
  const read=async(ref,prefix)=>{const data=await getContext().loadWorldInfo(ref.book);check(data?.entries&&typeof data.entries==='object','初始化资料书不存在或损坏：'+ref.book);const rows=Object.values(data.entries).filter(e=>String(e.uid)===String(ref.uid));check(rows.length===1&&roleName(rows[0]).startsWith(prefix),'初始化资料条目已不存在或类型改变：'+ref.book);check(typeof rows[0].content==='string','初始化资料正文无效');return rows[0].content;};
  const [worldText,characterText]=await Promise.all([read(world,'【手机世界】'),read(character,'【角色】')]);
  check(captured===scope()&&config.read().revision===value.revision,'聊天或初始化选择已变化，请重新打开手机');
  return {worldText,characterText,binding:{world:{book:world.book,uid:world.uid},character:{book:character.book,uid:character.uid}}};
 }
 return {scope,list,bind,create,edit,ensureBook,ensureTemplates,resources,worldDefinitions,saveResources,phoneProfile};
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
 const text=Object.entries(values).filter(([key])=>!['row_uuid','char_id','name'].includes(key)).map(([key,value])=>(specs.find(f=>f.key===key)?.label??key)+'：'+(!['known','derived'].includes(dossier.states?.[key]??'known')?'['+(dossier.states?.[key]??'未提供')+']':typeof value==='string'?stripPhoneInitialization(stripPhoneInitialization(value,'手机世界'),'手机初态'):JSON.stringify(value))).join('\n');
 return {name,text,entityId:binding.entityId,dossierId:binding.dossierId,revision:snapshot.revision,contextKey:snapshot.contextKey};
}
function createDatabaseStoryIdentity({config,getContext,getHelper,assertIdle,database,builtins,creator}){
 check(typeof database.read==='function'&&typeof database.commit==='function','统一表单接口尚未就绪');const drafts=new Map(),boundCompletions=new Set(),databaseCompletions=new Set();
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
  if(before?.revision!==undefined)check(before.revision===snapshot.revision&&before.contextKey===snapshot.contextKey,'表单已变化，请重新读取角色');
  const candidate={...structuredClone(values),...(name!==undefined?{name:name.replace(/^【角色】/u,'')}:{}) ,...(content!==undefined?{manifest:content}:{})},specs=snapshot.state.schema.T_CHAR_DOSSIER.fields,changed={},diff=[];
  for(const [field,value]of Object.entries(candidate)){const spec=specs.find(f=>f.key===field);check(spec&&!spec.read_only&&!spec.alias_of&&!spec.formula&&spec.type!=='ID','字段不存在或由系统维护：'+field);decode(value,spec);if(field==='name')check(typeof value==='string'&&value.trim()===value&&value,'角色名称不能为空');if(!sameValue(row.values[field],value)){changed[field]=value;diff.push({field,label:spec.label??field,before:row.values[field],after:value});}}
  const changes=Object.keys(changed).length?[{tableId:'T_CHAR_DOSSIER',recordId:row.dossierId,values:changed}]:[];
  check(changes.length,'没有需要提交的档案变化');
  const draft={id:'identity:'+crypto.randomUUID(),kind:'edit',scope:key,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,configurationRevision:config.read().revision,changes,diff,binding:{database:true,entityId:row.entityId,dossierId:row.dossierId},source:{kind:'identity-form',dossierId:row.dossierId}};drafts.set(draft.id,structuredClone(draft));return structuredClone(draft);
 }
 async function previewCreate({name,content=''}){
  assertIdle();check(typeof name==='string'&&name.trim()===name&&name,'请填写角色名称');check(typeof content==='string','人物设定须为文字');const snapshot=await read(),id=crypto.randomUUID(),originId=crypto.randomUUID();
  const changes=[{tableId:'T_CHAR_DOSSIER',recordId:id,values:{name,...(content?{manifest:content}:{})}},{tableId:'T_SYS_ENTITIES',recordId:id,values:{kind:'character',origin_record_ref:originId}},{tableId:'M_FIELD_REFERENCES',recordId:originId,values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:id,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:id,reference_kind:'record',resolution_status:'resolved'}}];
  const draft={id:'identity:'+crypto.randomUUID(),kind:'create',scope:scope(),contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,configurationRevision:config.read().revision,changes,diff:[{field:'name',label:'显示名称',before:undefined,after:name},{field:'manifest',label:'人物设定',before:undefined,after:content}],binding:{database:true,entityId:id,dossierId:id},source:{kind:'manual-character',text:content},bindOnCommit:true};drafts.set(draft.id,structuredClone(draft));return structuredClone(draft);
 }
 async function readAuthorSource({book,uid}){
  check(typeof book==='string'&&book.trim()===book&&book&&uid!==null&&uid!==undefined,'旧角色来源定位不完整');
  const managed=builtins?.bookNames?.()??{};check(![managed.templates??templateBookName(config.read()),managed.beauty??'缇斯亚美化书'].includes(book),'定义专用书不能作为当前角色来源');
  const key=scope(),data=builtins?.readSourceBook?await builtins.readSourceBook(book):await getContext().loadWorldInfo(book);check(key===scope(),'聊天已切换，未读取旧角色来源');
  check(data?.entries&&typeof data.entries==='object','旧角色来源书不存在或损坏');const rows=Object.values(data.entries).filter(e=>String(e.uid)===String(uid));check(rows.length===1,'旧角色 UID 不存在或重复');const row=rows[0],title=roleName(row);check(/^【角色】.+/u.test(title)&&typeof row.content==='string','旧来源不是完整角色条目');return {book,uid:row.uid,title,content:row.content,entry:structuredClone(row),digest:digest({book,entry:row})};
 }
 async function previewSourceMigration(binding=config.read().story.userBinding){
  assertIdle();check(binding&&!binding.database,'请选择待迁移的旧书籍档案');const author=await readAuthorSource(binding),content=stripPhoneInitialization(stripPhoneInitialization(author.content,'手机世界'),'手机初态');
  const draft=await previewCreate({name:author.title.slice(4),content});draft.kind='source-migration';draft.importSource={book:author.book,uid:author.uid,digest:author.digest};draft.source={kind:'legacy-character-import',book:author.book,uid:author.uid,entryDigest:author.digest,rawEntry:author.entry,phoneInitializationPreserved:true};drafts.set(draft.id,structuredClone(draft));return structuredClone(draft);
 }
 async function commitEdit(input){
  assertIdle();const draft=drafts.get(input?.id);check(draft&&sameValue(input,draft),'角色草稿已改变，请重新预览');check(draft.scope===scope(),'聊天已切换，未提交旧角色草稿');
  if(draft.importSource&&!databaseCompletions.has(draft.id)){const fresh=await readAuthorSource(draft.importSource);check(fresh.digest===draft.importSource.digest,'旧角色来源已变化，请重新生成迁移草稿');}
  const result=await database.commit({operationId:draft.id,expectedRevision:draft.expectedRevision,contextKey:draft.contextKey,changes:structuredClone(draft.changes),source:structuredClone(draft.source)});
  check(result?.state&&result.contextKey===draft.contextKey,'表单提交未返回匹配的归属，尚未确认保存');databaseCompletions.add(draft.id);
  check(draft.scope===scope(),'角色表单已保存，聊天已切换；没有改动新聊天绑定');
  const value=config.read();if(!boundCompletions.has(draft.id)&&(draft.bindOnCommit||value.story.userBinding?.database&&value.story.userBinding.dossierId===draft.binding.dossierId)){
   if(draft.bindOnCommit)check(value.revision===draft.configurationRevision,'人物表单已保存，但聊天选择已改变；请重新选择该人物');
   const projected=projectDatabaseIdentity(result,draft.binding);value.story.userBinding=structuredClone(draft.binding);value.story.userName=projected.name;value.story.userMode='bound';try{await config.save(value);boundCompletions.add(draft.id);}catch(error){throw Error('角色表单已保存，当前聊天绑定尚未确认：'+error.message);}
  }
  return {...projectDatabaseIdentity(result,draft.binding),uid:draft.binding.dossierId,name:'【角色】'+projectDatabaseIdentity(result,draft.binding).name,content:String(result.state.tables.T_CHAR_DOSSIER[draft.binding.dossierId].values.manifest??''),values:structuredClone(result.state.tables.T_CHAR_DOSSIER[draft.binding.dossierId].values)};
 }
 async function resources(){const snapshot=await database.read(),all=await names(),value=config.read(),managed=builtins?.bookNames?.()??{};return {database:true,books:all,templateBook:managed.templates??templateBookName(value),referenceBooks:[...(value.story.referenceBooks??[])],phoneWorld:value.story.phoneWorld??null,excluded:[managed.templates??templateBookName(value),managed.beauty??'缇斯亚美化书',value.coreBook??'基点书'].filter(Boolean),worlds:rowEntries(snapshot?.state,'T_STATIC_WORLDS').map(r=>({uid:r.id,worldId:r.id,name:String(r.values.name??r.id)})),builtinStatus:builtins?.status?.()??null};}
 async function saveResources({referenceBooks=[],phoneWorld=null},expected=config.read().revision){
  assertIdle();const key=scope(),value=config.read();check(value.revision===expected,'身份配置已变化，请重新读取');const available=await resources();check(Array.isArray(referenceBooks)&&new Set(referenceBooks).size===referenceBooks.length&&referenceBooks.every(name=>available.books.includes(name)&&!available.excluded.includes(name)),'资料书选择无效、重复或包含定义专用书');
  if(phoneWorld!==null)check(phoneWorld.database===true&&available.worlds.some(w=>w.worldId===phoneWorld.worldId),'请选择当前表单中实际世界，旧手机世界块仅供迁移');
  check(key===scope(),'聊天已切换，资料选择未保存');value.story.referenceBooks=[...referenceBooks];value.story.phoneWorld=phoneWorld?{database:true,worldId:phoneWorld.worldId}:null;return config.save(value);
 }
 async function phoneProfile(){const value=config.read(),binding=storyAvatar(value).binding,world=value.story.phoneWorld;if(!binding?.database||!world?.database)return null;const snapshot=await read();projectDatabaseIdentity(snapshot,binding);check(snapshot.state.tables?.T_STATIC_WORLDS?.[world.worldId],'选中的世界表单记录已不存在');return {database:true,entityId:binding.entityId,dossierId:binding.dossierId,worldId:world.worldId,contextKey:snapshot.contextKey,revision:snapshot.revision};}
 async function ensureTemplates(){check(builtins,'内置书安装服务尚未接入');return builtins.update();}
 async function createDraft({goal,kind='character',mode='extend'}){check(creator?.draft,'统一创作服务尚未接入');return creator.draft(goal,{kind,mode});}
 async function saveCreation(draft){check(creator?.save,'统一创作保存服务尚未接入');return creator.save(draft);}
 return {database:true,scope,list,bind,previewEdit,commitEdit,previewCreate,previewSourceMigration,edit:previewEdit,create:previewCreate,ensureBook:async()=>DATABASE_LABEL,ensureTemplates,resources,worldDefinitions:async()=>{const r=await resources();return r.worlds;},saveResources,phoneProfile,createDraft,saveCreation,builtinStatus:()=>builtins?.status?.(),resolveBuiltinConflict:args=>{check(builtins,'内置书服务尚未接入');return builtins.resolveConflict(args);}};
}
