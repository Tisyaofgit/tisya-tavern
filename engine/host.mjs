import {effectivePreferences} from './preferences.mjs';
import {limitNativeHistory} from '../config/history-context.js';
import {contractorMessages} from './contractor.mjs';
import {resourcePromptSlots,configureRenderingResources} from '../rendering-resources.js';
import {revisionMessages} from '../revision.js';
import {userRevisionMaterial,userRevisionMessages} from '../user-revision.js';
import {appendContractorMessages} from '../communication.js';
import {applyGeneration,generationValues,assertGeneration} from './generation.mjs';
import {Controller,indexedStorage,chatKey,captureMessages,ensureMessages,NS,PROMPT_KEY} from './controller.mjs';
import {Runtime} from './runtime.mjs';
import {decodePhoneDatabase} from './phone-database.mjs';
import {importPhone} from '../phone-core.mjs';
import {databaseSnapshotAtMessage} from './database-snapshot.mjs';
import {reconcile,inversePatch} from './journal.mjs';
import {materials,initializeState} from './materials.mjs';
import {createConfiguration,materialNames,identitySlots,compilePrompts,compilePromptText,isMatrixPreset,applyCompiledMessages} from './config.mjs';
import {configureTags} from './tags.mjs';
import {clone,fail,asError,digest} from './common.mjs';
import {prepareNativeMvu} from '../config/native-mvu.js';
import {excludeTemplateBookEntries,readStoryReferenceBooks,applyStoryReferenceBooks} from './template-book.mjs';
const nativeWorld={context:{owner:'native',card:true},mode:'matrix',modes:{matrix:{nativeMvu:'on'}},tables:{nativeBridge:false}};
export function createMatrixHost({getContext,getSource,loadCatalog,storage=null,persistSettings,persistMetadata,persona=()=>'',getHistoryLimit=()=>50,projectToolTurns,getContractorMessages=async()=>[],expand=s=>s,assertIdle=()=>{},onError=()=>{}}){
 let storageOwner;storage??={get:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).get(...a),set:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).set(...a),commit:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).commit(...a)};
 let pendingRevision=null,pendingUserRevision=null;let catalogPromise,prepared=null,latest=null,slots={},busy=false,referenceSnapshot=null;const listeners=new Set();
 const catalog=()=>catalogPromise??=loadCatalog();
 const config=createConfiguration({getContext,persist:persistSettings,assertIdle});
 const ctx=()=>{const c=getContext();return {...c,saveMetadata:()=>persistMetadata(c,{id:c.chatId,character:c.characterId,group:c.groupId,meta:c.chatMetadata})};};
 const notify=r=>{latest=r;for(const fn of listeners)fn(r);};
 const controller=new Controller({getContext:ctx,storage,onUpdate:notify,request:async(_path,{bundle,messages,scope})=>{
  const result=reconcile(bundle,messages,scope);let values={},materials_error;
  try{values=materials(new Runtime(result.bundle.state),scope);}catch(e){materials_error=asError(e);}
  return {...result,materials:values,materials_error};
 }});
 controller.inject=async()=>{ctx().setExtensionPrompt?.(PROMPT_KEY,'',0,0,false,0);};
 const active=()=>isMatrixPreset(getSource());
 const referenceSources=settings=>readStoryReferenceBooks(getContext,settings);
 async function entriesLoaded(data){
  const settings={...config.read(),builtinBooks:ctx().extensionSettings.tisya_builtin_books?.books},key=chatKey(ctx()),binding=settings.story.userBinding,libraryBooks=new Set([settings.coreBook??'基点书',binding?.book].filter(Boolean)),native=prepared?.native;
  excludeTemplateBookEntries(data,settings);
  for(const name of ['globalLore','characterLore','chatLore','personaLore'])if(Array.isArray(data[name]))data[name].splice(0,data[name].length,...data[name].filter(e=>!libraryBooks.has(e.world)&&!(native?.book&&e.world===native.book&&e.uid!=null&&native.materialEntries?.some(source=>source.uid!=null&&String(source.uid)===String(e.uid)&&source.content===String(e.content)))));
  const sources=await referenceSources(settings);
  if(key!==chatKey(ctx())||settings.revision!==config.read().revision)fail('REFERENCE_BOOK_SCOPE','读取资料书期间聊天或配置已变化');
  applyStoryReferenceBooks(data,sources,settings);
  referenceSnapshot={key,revision:settings.revision,source:JSON.stringify(sources)};
 }
 async function assertReferences(settings,key){
  if(!(settings.story.referenceBooks??[]).length)return;
  if(!referenceSnapshot||referenceSnapshot.key!==key||referenceSnapshot.revision!==settings.revision)fail('REFERENCE_BOOK_NOT_SCANNED','所选资料书尚未完成当前回合扫描，请重新生成');
  const captured=referenceSnapshot,sources=await referenceSources(settings);
  if(referenceSnapshot!==captured||captured.source!==JSON.stringify(sources)||key!==chatKey(ctx())||settings.revision!==config.read().revision)fail('REFERENCE_BOOK_STALE','资料书在扫描后已变化，请重新生成');
 }
 function register(){const c=getContext();if(!c.macros?.register&&!c.registerMacro)fail('HOST_MACROS','宿主缺少动态资料宏接口');for(const name of materialNames){const handler=()=>active()?slots[name]??'':'';if(c.macros?.register)c.macros.register(name,{handler,description:'缇斯亚新版动态资料'});else c.registerMacro(name,handler,'缇斯亚新版动态资料');}}
 function historyLimit(){const count=effectivePreferences(config.read()).parameters.history_messages??getHistoryLimit();if(!Number.isSafeInteger(count)||count<0)fail('HISTORY_COUNT','历史聊天条数须为非负整数');return count;}
 function historyInput(chat,type='normal'){if(['quiet','impersonate'].includes(type))return null;if(chat===ctx().chat)fail('HISTORY_COPY','宿主应传入历史发送副本');const count=prepared?.historyLimit??historyLimit(),report=limitNativeHistory(chat,count,type,projectToolTurns);if(prepared)prepared.historyWindow=report;latest={...latest,historyWindow:report};return report;}
 async function initialize(){assertIdle();const current=await controller.current();if(current)fail('ENGINE_EXISTS','本会话已有引擎状态，请导出备份或继续使用');const c=ctx();await controller.attach({state:initializeState(await catalog(),{session_ref:String(c.chatId),branch_ref:'main'})});await sync();}
 async function sync(options={}){busy=true;try{const r=await controller.run(options);if(r?.materials_error)fail('MATERIALS_ERROR','表单已保存，材料读取失败',{error:r.materials_error});slots={...(r?.materials??{})};const selected=config.read().story.outputConfigId;if(selected){const row=r?.bundle?.state?.tables?.T_PREF_OUTPUT_CONFIG?.[selected];if(!row)fail('OUTPUT_CONFIGURATION_MISSING','当前输出配置记录已不存在');slots.tisya_output_configuration=JSON.stringify(row.values);}const identities=await identitySlots(ctx(),config.read(),persona(),{state:r?.bundle?.state,revision:r?.bundle?.local_revision??0,contextKey:chatKey(ctx())});slots.tisya_contractor_wish=identities.tisya_contractor_wish?identities.tisya_contractor_wish.replace('[/CONTRACTOR.WISH]',()=>[slots.tisya_contractor_wish,'[/CONTRACTOR.WISH]'].filter(Boolean).join('\n')):slots.tisya_contractor_wish?'[CONTRACTOR.WISH]\n'+slots.tisya_contractor_wish+'\n[/CONTRACTOR.WISH]':'';slots.tisya_user_identity=identities.tisya_user_identity;slots.tisya_user_name=identities.tisya_user_name;for(const [name,text]of Object.entries(resourcePromptSlots(config.read().resources??[])))slots[name]=[slots[name],text].filter(Boolean).join('\n');return r;}finally{busy=false;}}
 async function before(type,options={},dryRun=false){if(dryRun||['quiet','impersonate'].includes(type)){prepared={passthrough:true,accepted:true};return;}prepared=null;referenceSnapshot=null;await controller.inject();if(!controller.enabled())fail('ENGINE_NOT_BOUND','请在新版配置的“表单与存档”中接入本会话，或导入已有新版状态');const key=chatKey(ctx()),settings=config.read();configureTags(settings.tags,settings.aliases);applyGeneration(ctx(),settings.generation);await controller.beginGeneration();try{await sync({preview:true,omitLastAssistant:['swipe','regenerate','continue'].includes(type)});const native=await prepareNativeMvu(ctx(),nativeWorld,type);if(native)slots.tisya_material_rule_material=[slots.tisya_material_rule_material,native.text].filter(Boolean).join('\n');if(chatKey(ctx())!==key)fail('CHAT_CHANGED','准备期间已切换会话');const user=ctx().chat?.[ctx().chat.length-(ctx().chat.at(-1)?.is_user?1:2)],rewrite=['swipe','regenerate'].includes(type)?userRevisionMaterial(user):null,directives=[...revisionMessages(pendingRevision),...userRevisionMessages(pendingUserRevision??rewrite)],directions=await getContractorMessages({prepare:true});prepared={native,type,historyLimit:historyLimit(),directives,directions,user,userText:user?.mes,key,revision:settings.revision,source:clone(getSource()),settings,slots:clone(slots),accepted:false};}catch(e){controller.generating.delete(key);throw e;}}
 // MVU copies identical variables to a newly sent user message asynchronously.
 // Compare script, contract and value bytes; a copied floor alone is not stale.
 async function payloadReady(payload){if(prepared?.passthrough)return payload;if(!prepared)fail('PREPARATION_MISSING','新版引擎未完成本轮资料准备');if(prepared.key!==chatKey(ctx())||prepared.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(!Array.isArray(payload.messages))fail('PAYLOAD_MESSAGES','宿主最终请求缺少消息列表');const captured=prepared;await assertReferences(captured.settings,captured.key);if(captured.historyLimit!==historyLimit())fail('HISTORY_STALE','历史可见条数已变化，请重新生成');const native=await prepareNativeMvu(ctx(),nativeWorld,captured.type);if(prepared!==captured||captured.key!==chatKey(ctx())||captured.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(!!native!==!!captured.native||native&&['signature','stateDigest','text'].some(k=>native[k]!==captured.native[k]))fail('NATIVE_MVU_STALE','原卡 MVU 来源或变量已变化，请重新生成');assertGeneration(ctx(),captured.settings.generation);const compiled=compilePrompts(prepared.source,prepared.settings,prepared.slots);payload.messages=contractorMessages(applyCompiledMessages(payload.messages,prepared.source,compiled,expand),ctx(),persona(),expand);const system=payload.messages.filter(m=>m.role==='system').flatMap(m=>typeof m.content==='string'?[m.content]:(m.content??[]).filter(p=>p.type==='text').map(p=>p.text)).join('\n');if(/\{\{tisya_[^{}]+\}\}/.test(system))fail('UNEXPANDED_MACRO','最终请求有未展开的缇斯亚资料宏');const identity=expand(compilePromptText(prepared.slots.tisya_user_identity??'',prepared.settings,prepared.slots));if(identity&&system.split(identity).length-1!==1)fail('USER_IDENTITY_COUNT','最终请求缺少或重复了绑定的user身份资料',{matches:system.split(identity).length-1});if([...system.matchAll(/(?:^|\n)\[REGISTRY\]\s*\n/g)].length!==1)fail('REGISTRY_COUNT','最终请求需要唯一新版输出合同');if(prepared.user&&prepared.user.mes!==prepared.userText)fail('USER_REVISION_STALE','用户改写依据在准备后变化');if(JSON.stringify(await getContractorMessages())!==JSON.stringify(prepared.directions))fail('TURN_DIRECTION_STALE','本轮场外要求在准备后变化，请重新生成');appendContractorMessages(payload.messages,prepared.directions);for(const m of prepared.directives)if(!payload.messages.some(x=>x.role===m.role&&x.content===m.content))payload.messages.push(m);prepared.accepted=true;latest={...latest,promptAudit:{status:'validated',messages:payload.messages.length,configurationRevision:prepared.revision,tags:clone(prepared.settings.tags)}};return payload;}
 async function event(name,...args){if(name==='CHAT_CHANGED'){prepared=null;referenceSnapshot=null;configureTags(config.read().tags,config.read().aliases);configureRenderingResources(config.read().resources??[]);}if(!active())return;try{await controller.event(name,...args);if(['CHAT_CHANGED','GENERATION_ENDED','GENERATION_STOPPED'].includes(name))prepared=null;}catch(e){notify({status:e.message,error:asError(e)});onError(e);throw e;}}
 async function mutate(callback){
  assertIdle();
  const {ctx:c,id,key}=await controller.identity();
  if(ensureMessages(c))await c.saveChat();
  const bundle=await storage.get(id);
  if(!bundle)fail('ENGINE_NOT_BOUND','请先接入本会话');
  if(chatKey(ctx())!==key)fail('CHAT_CHANGED','保存期间已切换会话');
  const messages=captureMessages(c),current=reconcile(bundle,messages).bundle;
  const e=new Runtime(current.state),result=e.transaction('manual:'+crypto.randomUUID(),{source:'configuration'},()=>callback(e));
  if(result.status==='FAILED')fail(result.error.code,result.error.message,result.error.details);
  const patch=inversePatch({schema:e.data.schema,tables:e.data.tables},{schema:current.state.schema,tables:current.state.tables});
  if(e.data.tables.X_PHONE_BINDINGS?.['phone-current']){const archive=decodePhoneDatabase(e.data);if(archive)importPhone(archive);}
  const ids=messages.map(m=>m.uid),edit={uid:'manual:'+crypto.randomUUID(),after_uid:ids.at(-1),previous_uids:ids.slice(0,-1),patch};
  const staged={...current,manual_edits:[...(current.manual_edits??[]),edit]};
  const next={...reconcile(staged,messages).bundle,local_revision:(bundle.local_revision??0)+1};
  if(!await storage.commit(id,bundle.local_revision??0,next))fail('SAVE_CONFLICT','另一页面已经更新此会话，请重开配置');
  if(chatKey(ctx())===key)await sync();
  return result;
 }

 // The forms database is available regardless of the prompt preset. Reads do
 // not create business rows; all clients share this single bundle CAS boundary.
 async function peekDatabase(){const c=ctx(),key=chatKey(c),meta=c.chatMetadata?.[NS];if(!meta?.chat_uid||meta.owner_chat_key!==key)return null;const bundle=await storage.get(meta.chat_uid);return bundle?{state:clone(bundle.state),revision:bundle.local_revision??0,contextKey:key}:null;}
 async function readDatabase(){
  const c=ctx(),key=chatKey(c),meta=c.chatMetadata?.[NS];if(!meta?.chat_uid||meta.owner_chat_key!==key)return null;
  const bundle=await storage.get(meta.chat_uid);if(!bundle)return null;
  const hasIds=(c.chat??[]).every(m=>m.extra?.[NS]?.uid);const current=hasIds?reconcile(bundle,captureMessages(c)).bundle:bundle;
  let allowedOriginContextKeys=[];if(typeof c.chatMetadata?.main_chat==='string'&&c.chatMetadata?.integrity){const scope=JSON.parse(key),parent=JSON.stringify([scope[0],scope[1],c.chatMetadata.main_chat]);if((meta.origin_chat_keys??[]).includes(parent))allowedOriginContextKeys=(meta.origin_chat_keys??[]).filter(k=>{try{const a=JSON.parse(k);return a[0]===scope[0]&&a[1]===scope[1];}catch{return false;}});}
  return {state:clone(current.state),revision:bundle.local_revision??0,contextKey:key,allowedOriginContextKeys,phoneActionReservations:clone(bundle.phone_action_reservations??{})};
 }
 async function readDatabaseSnapshot(input){const c=ctx(),key=chatKey(c),meta=c.chatMetadata?.[NS];if(!meta?.chat_uid||meta.owner_chat_key!==key)return null;const bundle=await storage.get(meta.chat_uid);return bundle?databaseSnapshotAtMessage(bundle,input,key):null;}
 async function ensureDatabase(){const current=await controller.current();if(!current){await initialize();return readDatabase();}return readDatabase();}
 const lifecycleKinds=new Set(['turn-prepare','turn-accept','turn-fail','turn-reconcile','turn-reject']);
 function createPhoneDatabaseBridge(){return {read:readDatabase,commit:commitDatabase,commitLifecycle(input){if(input?.source?.kind!=='phone'||!lifecycleKinds.has(input.source.lifecycle))fail('DATABASE_CAPABILITY','仅手机内部回合生命周期可以在生成期间保存');const job=databaseChain.then(()=>commitDatabaseNow(input,true));databaseChain=job.catch(()=>{});return job;}};}
 let databaseChain=Promise.resolve();
 function commitDatabase(input){const job=databaseChain.then(()=>commitDatabaseNow(input));databaseChain=job.catch(()=>{});return job;}
 async function commitDatabaseNow({operationId,expectedRevision,contextKey,changes=[],schema=[],source=null}={},lifecycle=false){
  if(!lifecycle)assertIdle();if(typeof operationId!=='string'||!operationId.trim())fail('OPERATION_ID','表单提交需要稳定操作ID');
  if(!Array.isArray(changes)||!Array.isArray(schema))fail('DATABASE_BATCH','表单批次必须为列表');
  const {ctx:c,id,key}=await controller.identity();if(contextKey!==key)fail('CHAT_CHANGED','表单提交归属已变化');
  if(ensureMessages(c))await c.saveChat();const bundle=await storage.get(id);if(!bundle)fail('ENGINE_NOT_BOUND','请先接入本会话');
  const messages=captureMessages(c),current=reconcile(bundle,messages).bundle,request={operationId,contextKey,changes,schema,source},hash=digest(request),prior=bundle.database_operations?.[operationId];
  if(prior){if(prior.hash!==hash)fail('OPERATION_CONFLICT','同一操作ID不能替换内容');const receipt=current.state.runtime?.receipts?.[operationId];if(!receipt)fail('OPERATION_DETACHED','这项操作属于已离开的历史，不能搬到当前分支');return {state:clone(current.state),revision:bundle.local_revision??0,contextKey:key,receipt:{...clone(receipt),replayed:true}};}
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==(bundle.local_revision??0))fail('SAVE_CONFLICT','表单已被另一页面更新，请刷新后重试');
  for(const action of source?.newPhoneActions??[]){const priorAction=bundle.phone_action_reservations?.[action.id];if(priorAction)fail('PHONE_LIFE_ACTION_BRANCH','这个操作ID已在旧历史中使用，不能搬到当前分支',{actionId:action.id});}
  const e=new Runtime(current.state),registered=await catalog();
  for(const table of [...registered.tables,...schema]){
   if(!e.data.schema[table.id]){e.data.schema[table.id]=clone(table);e.data.tables[table.id]={};}
   else for(const field of table.fields??[]){const old=e.data.schema[table.id].fields.find(x=>x.key===field.key);if(!old)e.declareField(table.id,field);else if(old.type!==field.type)fail('SCHEMA_TYPE_CHANGE','已有字段类型不可隐式迁移',{table:table.id,field:field.key});}
  }
  const transaction=e.transaction(operationId,request,()=>{
   for(const change of changes){const tid=change.tableId??change.table,rid=change.recordId??change.id;if(typeof tid!=='string'||typeof rid!=='string'||!tid||!rid)fail('DATABASE_TARGET','表单修改缺少表或稳定记录ID');if(!e.data.schema[tid])fail('TABLE_MISSING','目标表尚未注册',{table:tid});
    if(e.rows(tid)[rid]?.metadata?.phone_projection&&source?.kind!=='phone')fail('DERIVED_WRITE','这个网络页面是生活微博的只读投影，请编辑X_SOCIAL_POSTS原记录');
    if(change.remove){delete e.data.tables[tid][rid];continue;}
    if(!e.rows(tid)[rid])e.newRecord(tid,{},rid);
    for(const [field,value]of Object.entries(change.values??{})){const spec=e.spec(tid,field);if(spec.read_only&&!['row_uuid','common.row_uuid'].includes(spec.alias_of)&&field!=='row_uuid'&&JSON.stringify(e.record(tid,rid).values[field])!==JSON.stringify(value))fail('DERIVED_WRITE','派生字段不能直接修改，请修改原点字段',{table:tid,field});e.set([tid,rid,field,[]],value,change.states?.[field]??'known');}
    if(change.metadata)e.record(tid,rid).metadata={...(e.record(tid,rid).metadata??{}),...clone(change.metadata)};
   }
   // Entity summaries are derived from their one registered origin record.
   for(const [rid,row]of Object.entries(e.rows('T_SYS_ENTITIES'))){const ref=row.values.origin_record_ref,link=typeof ref==='string'?e.rows('M_FIELD_REFERENCES')[ref]?.values:null;if(link?.target_table&&link?.target_row_uuid){const origin=e.rows(link.target_table)[link.target_row_uuid],name=origin?.values?.[link.target_field||'name'];if(typeof name==='string')e.set(['T_SYS_ENTITIES',rid,'name',[]],name,'derived');}}
   for(const change of changes){if(change.remove)continue;const tid=change.tableId??change.table,rid=change.recordId??change.id,row=e.record(tid,rid);
    for(const spec of e.data.schema[tid].fields){const v=row.values[spec.key],state=row.states[spec.key];if(spec.required&&(v==null||!['known','derived'].includes(state)))fail('REQUIRED_FIELD','表单必填字段尚未完整填写',{table:tid,record:rid,field:spec.key});
     if(v==null||!['REF','CHILD_REF'].includes(spec.type)||!spec.ref)continue;const target=spec.ref.startsWith('@')?row.values[spec.ref.slice(1)]:spec.ref;if(!target||!e.data.schema[target])continue;const refs=Array.isArray(v)?v:[v];for(const ref of refs)if(typeof ref==='string'&&!e.rows(target)[ref])fail('REFERENCE_MISSING','表单引用的目标记录不存在',{table:tid,record:rid,field:spec.key,target,reference:ref});
    }
   }
   return {changed:changes.length,source:clone(source)};
  });
  if(transaction.status==='FAILED')fail(transaction.error.code,transaction.error.message,transaction.error.details);
  if(e.data.tables.X_PHONE_BINDINGS?.['phone-current']){const archive=decodePhoneDatabase(e.data);if(archive)importPhone(archive);}
  const ids=messages.map(m=>m.uid),edit={uid:'database:'+operationId,after_uid:ids.at(-1),previous_uids:ids.slice(0,-1),strict:true,anchor_chain:messages.map(m=>({uid:m.uid,signature:digest({role:m.role,text:m.text??'',uid:m.uid})})),patch:inversePatch(e.data,current.state)};
  const staged={...current,manual_edits:[...(current.manual_edits??[]),edit],database_operations:{...(bundle.database_operations??{}),[operationId]:{hash,contextKey:key,anchor_uid:ids.at(-1)??null}},phone_action_reservations:{...(bundle.phone_action_reservations??{}),...Object.fromEntries((source?.newPhoneActions??[]).map(a=>[a.id,{fingerprint:digest(a),operationId,contextKey:key}]))}};
  const next={...reconcile(staged,messages).bundle,local_revision:(bundle.local_revision??0)+1};
  if(chatKey(ctx())!==key)fail('CHAT_CHANGED','保存期间已切换会话');if(!await storage.commit(id,bundle.local_revision??0,next))fail('SAVE_CONFLICT','另一页面已经更新此会话，请刷新后重试');
  notify({status:'表单事务已保存',bundle:clone(next),database:true});
  return {state:clone(next.state),revision:next.local_revision,contextKey:key,receipt:clone(transaction)};
 }
 return {active,register,config,catalog,readDatabase,peekDatabase,readDatabaseSnapshot,commitDatabase,ensureDatabase,createPhoneDatabaseBridge,setRevision:value=>{pendingRevision=value?clone(value):null;},setUserRevision:value=>{pendingUserRevision=value?clone(value):null;},async defer(){const saved=controller.candidatePending(true);controller.generating.delete(chatKey(ctx()));prepared=null;await saved;},async acceptCandidate(){await controller.candidatePending(false);return sync();},generationValues:()=>generationValues(ctx()),controller,initialize,historyLimit,historyInput,sync,before,payloadReady,event,mutate,latest:()=>latest,isBusy:()=>busy,accepted:()=>prepared?.accepted===true,clear:()=>{prepared=null;},entriesLoaded,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},async import(value){assertIdle();await controller.attach(value.state?value:{state:value});await sync();},export:()=>controller.current()};
}
