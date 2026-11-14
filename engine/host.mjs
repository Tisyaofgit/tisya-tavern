import {phoneOriginStatus} from './phone-origin-status.mjs';
import {readProseIdentity} from './identity.mjs';
import {extendPreferenceCatalog,preferenceTextRows} from './preference-editor.mjs';
import {displayFormatMaterial} from './display-format.mjs';
import {narrativeSourceFragments,projectNarrativeSourceDefaults} from './narrative-source-policy.mjs';
import {applyRequestLayers,createPromptSourceMap} from './request-layers.mjs';
import {createNativePresetLayers} from './native-preset-layers.mjs';
import {extendPhoneFormCatalog,phoneFormReferenceCandidates} from './phone-form-contract.mjs';
import {effectivePreferences,preferenceWishSlot} from './preferences.mjs';
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
import {inversePatch} from './journal.mjs';
import {reconcilePhoneBundle} from './phone-bootstrap.mjs';
import {snapshotProjection} from './projection-cache.mjs';
import {materials,initializeState} from './materials.mjs';
import {createConfiguration,materialNames,identitySlots,compilePrompts,compilePromptText,isMatrixPreset,applyCompiledMessages} from './config.mjs';
import {configureTags} from './tags.mjs';
import {clone,fail,asError,digest} from './common.mjs';
import {prepareNativeMvu} from '../config/native-mvu.js';
import {excludeTemplateBookEntries,readStoryReferenceBooks,applyStoryReferenceBooks} from './template-book.mjs';
const nativeWorld={context:{owner:'native',card:true},mode:'matrix',modes:{matrix:{nativeMvu:'on'}},tables:{nativeBridge:false}};
export function createMatrixHost({getContext,getSource,loadCatalog,storage=null,persistSettings,persistMetadata,persona=()=>'',getHistoryLimit=()=>50,projectToolTurns,getContractorMessages=async()=>[],getDisplayRules=()=>[],nativeSources=null,expand=s=>s,assertIdle=()=>{},onError=()=>{}}){
 let storageOwner;storage??={get:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).get(...a),set:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).set(...a),commit:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).commit(...a)};
 let pendingRevision=null,pendingUserRevision=null;let catalogPromise,prepared=null,latest=null,slots={},busy=false,referenceSnapshot=null,narrativeLoreSnapshot=null;const listeners=new Set();
 const catalog=()=>{if(!catalogPromise){const request=Promise.resolve().then(loadCatalog).then(extendPhoneFormCatalog).then(extendPreferenceCatalog).catch(error=>{if(catalogPromise===request)catalogPromise=null;throw error;});catalogPromise=request;}return catalogPromise;};
 const config=createConfiguration({getContext,persist:persistSettings,assertIdle});
 const ctx=()=>{const c=getContext();return {...c,saveMetadata:()=>persistMetadata(c,{id:c.chatId,character:c.characterId,group:c.groupId,meta:c.chatMetadata})};};
 function phoneOrigins(c,key,meta=c.chatMetadata?.[NS]){if(typeof c.chatMetadata?.main_chat!=='string'||!c.chatMetadata.integrity)return [];const scope=JSON.parse(key),parent=JSON.stringify([scope[0],scope[1],c.chatMetadata.main_chat]);return (meta?.origin_chat_keys??[]).includes(parent)?meta.origin_chat_keys.filter(origin=>{try{const value=JSON.parse(origin);return value[0]===scope[0]&&value[1]===scope[1];}catch{return false;}}):[];}
 const bundleProjection=snapshotProjection(reconcilePhoneBundle),materialProjection=snapshotProjection((state,scope)=>materials(new Runtime(state),scope));
 const phoneProof=c=>{const key=chatKey(c),nativeMessages=(c.chat??[]).map(m=>({mes:m.mes,is_user:m.is_user,is_system:m.is_system,extra:{tisya_engine:m.extra?.tisya_engine},swipe_id:m.swipe_id,swipes:m.swipes,swipe_info:m.swipe_info?.map(info=>({extra:{tisya_engine:info?.extra?.tisya_engine}})),tt_swipe_cold:m.tt_swipe_cold}));return {contextKey:key,nativeMessages,allowedOriginContextKeys:phoneOrigins(c,key)};};
 const reconcile=(bundle,messages,scope)=>bundleProjection(bundle,messages,scope,phoneProof(ctx()));
 const notify=r=>{latest=r;for(const fn of listeners)fn(r);};
 const controller=new Controller({getContext:ctx,storage,onUpdate:notify,request:async(_path,{bundle,messages,scope})=>{
  const result=reconcile(bundle,messages,scope);let values={},materials_error;
  try{values=materialProjection(result.bundle.state,scope);}catch(e){materials_error=asError(e);}
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
  narrativeLoreSnapshot={key,revision:settings.revision,sources:narrativeSourceFragments({},data)};
  nativeSources?.entriesLoaded(data);
 }
 async function assertReferences(settings,key){
  if(!(settings.story.referenceBooks??[]).length)return;
  if(!referenceSnapshot||referenceSnapshot.key!==key||referenceSnapshot.revision!==settings.revision)fail('REFERENCE_BOOK_NOT_SCANNED','所选资料书尚未完成当前回合扫描，请重新生成');
  const captured=referenceSnapshot,sources=await referenceSources(settings);
  if(referenceSnapshot!==captured||captured.source!==JSON.stringify(sources)||key!==chatKey(ctx())||settings.revision!==config.read().revision)fail('REFERENCE_BOOK_STALE','资料书在扫描后已变化，请重新生成');
 }
 function register(){const c=getContext();if(!c.macros?.register&&!c.registerMacro)fail('HOST_MACROS','宿主缺少动态资料宏接口');for(const name of materialNames){const handler=()=>active()?(name==='tisya_contractor_wish'?preferenceWishSlot(config.read(),slots):slots[name]??''):'';if(c.macros?.register)c.macros.register(name,{handler,description:'缇斯亚新版动态资料'});else c.registerMacro(name,handler,'缇斯亚新版动态资料');}}
 function historyLimit(){const count=effectivePreferences(config.read()).parameters.history_messages??getHistoryLimit();if(!Number.isSafeInteger(count)||count<0)fail('HISTORY_COUNT','历史聊天条数须为非负整数');return count;}
 function historyInput(chat,type='normal'){if(['quiet','impersonate'].includes(type))return null;if(chat===ctx().chat)fail('HISTORY_COPY','宿主应传入历史发送副本');const count=prepared?.historyLimit??historyLimit(),report=limitNativeHistory(chat,count,type,projectToolTurns);if(prepared)prepared.historyWindow=report;latest={...latest,historyWindow:report};return report;}
 async function ensureBound(options={}){assertIdle();return controller.ensureBound(async scope=>initializeState(await catalog(),scope),options);}
 async function initialize(){assertIdle();const current=await controller.current();if(current)fail('ENGINE_EXISTS','本会话已有引擎状态，请导出备份或继续使用');const c=ctx();await controller.attach({state:initializeState(await catalog(),{session_ref:String(c.chatId),branch_ref:'main'})});await sync();}
 async function sync(options={}){busy=true;try{const r=await controller.run(options);if(r?.materials_error)fail('MATERIALS_ERROR','表单已保存，材料读取失败',{error:r.materials_error});slots={...(r?.materials??{}),tisya_preference_texts:JSON.stringify(preferenceTextRows(r?.bundle?.state))};const selected=config.read().story.outputConfigId;if(selected){const row=r?.bundle?.state?.tables?.T_PREF_OUTPUT_CONFIG?.[selected];if(!row)fail('OUTPUT_CONFIGURATION_MISSING','当前输出配置记录已不存在');slots.tisya_output_configuration=JSON.stringify(row.values);}const identities=await identitySlots(ctx(),config.read(),persona(),{state:r?.bundle?.state,revision:r?.bundle?.local_revision??0,contextKey:chatKey(ctx())});slots.tisya_contractor_wish=identities.tisya_contractor_wish?identities.tisya_contractor_wish.replace('[/CONTRACTOR.WISH]',()=>[slots.tisya_contractor_wish,'[/CONTRACTOR.WISH]'].filter(Boolean).join('\n')):slots.tisya_contractor_wish?'[CONTRACTOR.WISH]\n'+slots.tisya_contractor_wish+'\n[/CONTRACTOR.WISH]':'';slots.tisya_user_identity=identities.tisya_user_identity;slots.tisya_user_name=identities.tisya_user_name;for(const [name,text]of Object.entries(resourcePromptSlots(config.read().resources??[])))slots[name]=[slots[name],text].filter(Boolean).join('\n');return r;}finally{busy=false;}}
 async function before(type,options={},dryRun=false){nativeSources?.end();if(dryRun||['quiet','impersonate'].includes(type)){prepared={passthrough:true,accepted:true};return;}prepared=null;referenceSnapshot=null;narrativeLoreSnapshot=null;await controller.inject();if(!controller.enabled())fail('ENGINE_NOT_BOUND','请在新版配置的“表单与存档”中接入本会话，或导入已有新版状态');const key=chatKey(ctx()),settings=config.read();configureTags(settings.tags,settings.aliases);applyGeneration(ctx(),settings.generation);await controller.beginGeneration();try{await sync({preview:true,omitLastAssistant:['swipe','regenerate','continue'].includes(type)});const native=await prepareNativeMvu(ctx(),nativeWorld,type,undefined,{groupMachineInExtra:true});if(native)slots.tisya_material_rule_material=[slots.tisya_material_rule_material,native.text].filter(Boolean).join('\n');const displayFormats=displayFormatMaterial(getDisplayRules());if(displayFormats)slots.tisya_material_rule_material=[slots.tisya_material_rule_material,displayFormats].filter(Boolean).join('\n');if(chatKey(ctx())!==key)fail('CHAT_CHANGED','准备期间已切换会话');const user=ctx().chat?.[ctx().chat.length-(ctx().chat.at(-1)?.is_user?1:2)],rewrite=['swipe','regenerate'].includes(type)?userRevisionMaterial(user):null,directives=[...revisionMessages(pendingRevision),...userRevisionMessages(pendingUserRevision??rewrite)],directions=await getContractorMessages({prepare:true});if(chatKey(ctx())!==key||config.read().revision!==settings.revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(displayFormatMaterial(getDisplayRules())!==displayFormats)fail('DISPLAY_FORMAT_STALE','显示正则的格式或许可已变化，请重新生成');prepared={native,displayFormats,type,historyLimit:historyLimit(),directives,directions,user,userText:user?.mes,key,revision:settings.revision,source:clone(getSource()),settings,slots:clone(slots),narrativeSources:narrativeSourceFragments(ctx()),accepted:false};if(nativeSources)prepared.nativePresetLayers=createNativePresetLayers({settings:prepared.settings,slots:prepared.slots,type:prepared.type});nativeSources?.begin({type,dryRun});}catch(e){nativeSources?.end();controller.generating.delete(key);throw e;}}
 // MVU copies identical variables to a newly sent user message asynchronously.
 // Compare script, contract and value bytes; a copied floor alone is not stale.
 async function payloadReady(payload){if(prepared?.passthrough)return payload;if(!prepared)fail('PREPARATION_MISSING','新版引擎未完成本轮资料准备');if(prepared.key!==chatKey(ctx())||prepared.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(!Array.isArray(payload.messages))fail('PAYLOAD_MESSAGES','宿主最终请求缺少消息列表');const captured=prepared;await assertReferences(captured.settings,captured.key);if(captured.settings.story.userBinding?.sourceMode==='prose')await readProseIdentity(ctx(),captured.settings.story.userBinding);if(captured.historyLimit!==historyLimit())fail('HISTORY_STALE','历史可见条数已变化，请重新生成');const native=await prepareNativeMvu(ctx(),nativeWorld,captured.type,undefined,{groupMachineInExtra:true});if(prepared!==captured||captured.key!==chatKey(ctx())||captured.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(!!native!==!!captured.native||native&&['signature','stateDigest','text'].some(k=>native[k]!==captured.native[k]))fail('NATIVE_MVU_STALE','原卡 MVU 来源或变量已变化，请重新生成');if(displayFormatMaterial(getDisplayRules())!==captured.displayFormats)fail('DISPLAY_FORMAT_STALE','显示正则的格式或许可已变化，请重新生成');if(digest(narrativeSourceFragments(ctx()))!==digest(captured.narrativeSources??[]))fail('NARRATIVE_SOURCE_STALE','角色卡叙事来源在准备后已变化，请重新生成');assertGeneration(ctx(),captured.settings.generation);const compiled=compilePrompts(prepared.source,prepared.settings,prepared.slots);if(nativeSources)await nativeSources.assertReady();const nativeLayerAudit=captured.nativePresetLayers?.lastFinalization();const compiledMessages=nativeLayerAudit?clone(payload.messages):applyCompiledMessages(payload.messages,prepared.source,compiled,expand);const layerProjection=nativeSources?(nativeLayerAudit?{messages:compiledMessages,audit:nativeLayerAudit}:applyRequestLayers(compiledMessages,compiled,{expand})):null;const narrativeProjection=layerProjection?{messages:layerProjection.messages,audit:{status:'source-envelopes',removed:[],reason:'whole-native-source-preserved'}}:projectNarrativeSourceDefaults(compiledMessages,{compiled,sources:[...(captured.narrativeSources??[]),...(narrativeLoreSnapshot?.key===captured.key&&narrativeLoreSnapshot.revision===captured.revision?narrativeLoreSnapshot.sources:[])],expand});payload.messages=contractorMessages(narrativeProjection.messages,ctx(),persona(),expand);const system=payload.messages.filter(m=>m.role==='system').flatMap(m=>typeof m.content==='string'?[m.content]:(m.content??[]).filter(p=>p.type==='text').map(p=>p.text)).join('\n');const sourceMap=nativeSources?(nativeLayerAudit?captured.nativePresetLayers.sourceMap(payload.messages):createPromptSourceMap(payload.messages,compiled,{expand})):null;const hasUnexpanded=sourceMap?sourceMap.parts.some(part=>part.role==='system'&&[...part.text.matchAll(/\{\{tisya_[^{}]+\}\}/g)].some(match=>!sourceMap.protection(part,match.index,match.index+match[0].length))):/\{\{tisya_[^{}]+\}\}/.test(system);if(hasUnexpanded)fail('UNEXPANDED_MACRO','最终请求有未展开的缇斯亚资料宏');const identity=expand(compilePromptText(prepared.slots.tisya_user_identity??'',prepared.settings,prepared.slots));const identityCount=identity?(sourceMap?sourceMap.find(identity,{role:'system'}).found.length:system.split(identity).length-1):0;if(identity&&identityCount!==1)fail('USER_IDENTITY_COUNT','最终请求缺少或重复了绑定的user身份资料',{matches:identityCount});const registryCount=sourceMap?sourceMap.parts.filter(part=>part.role==='system').reduce((n,part)=>n+[...part.text.matchAll(/(?:^|\n)\[REGISTRY\]\s*\n/g)].filter(match=>!sourceMap.protection(part,match.index,match.index+match[0].length)).length,0):[...system.matchAll(/(?:^|\n)\[REGISTRY\]\s*\n/g)].length;if(registryCount!==1)fail('REGISTRY_COUNT','最终请求需要唯一新版输出合同');if(prepared.user&&prepared.user.mes!==prepared.userText)fail('USER_REVISION_STALE','用户改写依据在准备后变化');const directions=await getContractorMessages();if(captured.settings.story.userBinding?.sourceMode==='prose')await readProseIdentity(ctx(),captured.settings.story.userBinding);if(prepared!==captured||captured.key!==chatKey(ctx())||captured.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(displayFormatMaterial(getDisplayRules())!==captured.displayFormats)fail('DISPLAY_FORMAT_STALE','显示正则的格式或许可已变化，请重新生成');if(JSON.stringify(directions)!==JSON.stringify(captured.directions))fail('TURN_DIRECTION_STALE','本轮场外要求在准备后变化，请重新生成');appendContractorMessages(payload.messages,captured.directions);for(const m of captured.directives)if(!payload.messages.some(x=>x.role===m.role&&x.content===m.content))payload.messages.push(m);captured.accepted=true;latest={...latest,promptAudit:{status:'validated',messages:payload.messages.length,configurationRevision:captured.revision,tags:clone(captured.settings.tags),narrativeSourceProjection:narrativeProjection.audit,...(layerProjection?{layers:layerProjection.audit,nativeSources:nativeSources.audit()}:{} )}};return payload;}
 async function event(name,...args){if(['CHAT_CHANGED','GENERATION_ENDED','GENERATION_STOPPED'].includes(name))nativeSources?.end();if(name==='CHAT_CHANGED'){bundleProjection.clear();materialProjection.clear();databaseProjection.clear();prepared=null;referenceSnapshot=null;narrativeLoreSnapshot=null;configureTags(config.read().tags,config.read().aliases);configureRenderingResources(config.read().resources??[]);}if(!active())return;try{await controller.event(name,...args);if(['CHAT_CHANGED','GENERATION_ENDED','GENERATION_STOPPED'].includes(name))prepared=null;}catch(e){notify({status:e.message,error:asError(e)});onError(e);throw e;}}
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
 async function readOwnedDatabase(project){
  const c=ctx(),key=chatKey(c),meta=c.chatMetadata?.[NS],id=meta?.chat_uid;if(!id||meta.owner_chat_key!==key)return null;
  // Native chat loading mutates a shared array. Retaining that array alone
  // would pair the old owner's bundle with the newly loaded chat's messages.
  const messages=(c.chat??[]).slice(),bundle=await storage.get(id),live=ctx();
  if(chatKey(live)!==key||live.chatMetadata!==c.chatMetadata||live.chatMetadata?.[NS]!==meta||meta.chat_uid!==id||meta.owner_chat_key!==key||live.chat!==c.chat||(live.chat??[]).length!==messages.length||messages.some((m,i)=>live.chat[i]!==m))fail('CHAT_CHANGED','读取期间会话或历史已变化，请重试');
  return bundle?project(bundle,c,key,meta):null;
 }
 async function peekDatabase(){return readOwnedDatabase((bundle,_c,key)=>({state:clone(bundle.state),revision:bundle.local_revision??0,contextKey:key}));}
 // Reconciliation can remove a detached binding from bundle.state. Its saved
 // initialization patch remains evidence that this is not a fresh phone.
 function phoneInitializationEdits(bundle,key,origins){
  return (bundle.manual_edits??[]).filter(edit=>(edit.patch??[]).some(patch=>{
   if(patch.op!=='set'||patch.path?.[0]!=='tables'||patch.path[1]!=='X_PHONE_BINDINGS')return false;
   const row=patch.path.length===2?patch.value?.['phone-current']:patch.path.length===3&&patch.path[2]==='phone-current'?patch.value:null;
   const owner=row?.values?.context_key;return typeof owner==='string'&&(owner===key||origins.includes(owner));
  }));
 }
 const databaseProjection=snapshotProjection((bundle,messages,proof)=>{
  const projection=messages?bundleProjection(bundle,messages,undefined,proof):null,current=projection?.bundle??bundle,key=proof.contextKey,allowedOriginContextKeys=proof.allowedOriginContextKeys;
  const seenOrigins=new Set(),hasPhone=!!current.state.tables?.X_PHONE_BINDINGS?.['phone-current'];
  const phoneInitializationSources=phoneInitializationEdits(bundle,key,allowedOriginContextKeys).flatMap(edit=>{const messageUid=edit.after_uid??edit.anchor_chain?.at(-1)?.uid;if(!messageUid||seenOrigins.has(messageUid))return [];seenOrigins.add(messageUid);return [{messageUid,index:(messages??[]).findIndex(m=>m.uid===messageUid),...(!hasPhone?phoneOriginStatus(edit,messages):{})}];});
  return {state:clone(current.state),revision:bundle.local_revision??0,contextKey:key,allowedOriginContextKeys,phoneDetached:!current.state.tables?.X_PHONE_BINDINGS?.['phone-current']&&(!!bundle.state.tables?.X_PHONE_BINDINGS?.['phone-current']||phoneInitializationEdits(bundle,key,allowedOriginContextKeys).length>0),phoneBootstrapHydration:clone(projection?.result?.phone_bootstrap_hydration??[]),phoneInitializationSources,phoneActionReservations:clone(bundle.phone_action_reservations??{})};
 });
 async function readDatabase(){return readOwnedDatabase((bundle,c)=>databaseProjection(bundle,(c.chat??[]).every(m=>m.extra?.[NS]?.uid)?captureMessages(c):null,phoneProof(c)));}

 async function readDatabaseSnapshot(input){return readOwnedDatabase((bundle,_c,key)=>databaseSnapshotAtMessage(bundle,input,key));}
 async function ensureDatabase(){await ensureBound();return readDatabase();}
 const lifecycleKinds=new Set(['turn-prepare','turn-accept','turn-fail','turn-reconcile','turn-reject']);
 function createPhoneDatabaseBridge(){return {read:readDatabase,commit:commitDatabase,commitLifecycle(input){if(input?.source?.kind!=='phone'||!lifecycleKinds.has(input.source.lifecycle))fail('DATABASE_CAPABILITY','仅手机内部回合生命周期可以在生成期间保存');const job=databaseChain.then(()=>commitDatabaseNow(input,true));databaseChain=job.catch(()=>{});return job;}};}
 let databaseChain=Promise.resolve();
 function createConditionDatabaseBridge(){return {read:readDatabase,commit:commitDatabase,commitGate(input){
  if(input?.source?.kind!=='worldbook-condition'||!Array.isArray(input.changes)||input.changes.length||input.schema?.length)fail('DATABASE_CAPABILITY','世界书扫描只可保存已核对的条件机会回执，不可改写业务字段');
  const job=databaseChain.then(()=>commitDatabaseNow(input,true));databaseChain=job.catch(()=>{});return job;
 }};}
 function commitDatabase(input,{assertCurrent}={}){const job=databaseChain.then(()=>commitDatabaseNow(input,false,assertCurrent));databaseChain=job.catch(()=>{});return job;}
 async function commitDatabaseNow({operationId,expectedRevision,contextKey,changes=[],schema=[],source=null}={},lifecycle=false,assertCurrent){
  assertCurrent?.();
  if(!lifecycle)assertIdle();if(typeof operationId!=='string'||!operationId.trim())fail('OPERATION_ID','表单提交需要稳定操作ID');
  if(!Array.isArray(changes)||!Array.isArray(schema))fail('DATABASE_BATCH','表单批次必须为列表');
  const {ctx:c,id,key}=await controller.identity();assertCurrent?.();if(contextKey!==key)fail('CHAT_CHANGED','表单提交归属已变化');
  if(ensureMessages(c))await c.saveChat();assertCurrent?.();const bundle=await storage.get(id);assertCurrent?.();if(!bundle)fail('ENGINE_NOT_BOUND','请先接入本会话');
  const messages=captureMessages(c),current=reconcile(bundle,messages).bundle,request={operationId,contextKey,changes,schema,source},hash=digest(request),prior=bundle.database_operations?.[operationId];
  if(prior){if(prior.hash!==hash)fail('OPERATION_CONFLICT','同一操作ID不能替换内容');const receipt=current.state.runtime?.receipts?.[operationId];if(!receipt)fail('OPERATION_DETACHED','这项操作属于已离开的历史，不能搬到当前分支');return {state:clone(current.state),revision:bundle.local_revision??0,contextKey:key,receipt:{...clone(receipt),replayed:true}};}
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==(bundle.local_revision??0))fail('SAVE_CONFLICT','表单已被另一页面更新，请刷新后重试');
  for(const action of source?.newPhoneActions??[]){const priorAction=bundle.phone_action_reservations?.[action.id];if(priorAction)fail('PHONE_LIFE_ACTION_BRANCH','这个操作ID已在旧历史中使用，不能搬到当前分支',{actionId:action.id});}
  const e=new Runtime(current.state),registered=await catalog();assertCurrent?.();
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
     if(v==null||!['REF','CHILD_REF'].includes(spec.type)||!spec.ref)continue;const target=spec.ref.startsWith('@')?row.values[spec.ref.slice(1)]:spec.ref;if(!target||!e.data.schema[target])continue;const refs=Array.isArray(v)?v:[v];for(const ref of refs)if(typeof ref==='string'){
      const business=phoneFormReferenceCandidates(e.data,{tableId:tid,recordId:rid,field:spec.key,target,value:ref});
      if(business?.length>1)fail('REFERENCE_AMBIGUOUS','表单业务引用对应多条记录，请明确目标',{table:tid,record:rid,field:spec.key,target,reference:ref});
      if(business?business.length!==1:!e.rows(target)[ref])fail('REFERENCE_MISSING','表单引用的目标记录不存在',{table:tid,record:rid,field:spec.key,target,reference:ref});
     }
    }
   }
   return {changed:changes.length,source:clone(source)};
  });
  if(transaction.status==='FAILED')fail(transaction.error.code,transaction.error.message,transaction.error.details);
  if(e.data.tables.X_PHONE_BINDINGS?.['phone-current']){const archive=decodePhoneDatabase(e.data);if(archive)importPhone(archive);}
  const ids=messages.map(m=>m.uid),edit={uid:'database:'+operationId,after_uid:ids.at(-1),previous_uids:ids.slice(0,-1),strict:true,anchor_chain:messages.map(m=>({uid:m.uid,signature:digest({role:m.role,text:m.text??'',uid:m.uid})})),patch:inversePatch(e.data,current.state)};
  const staged={...current,manual_edits:[...(current.manual_edits??[]),edit],database_operations:{...(bundle.database_operations??{}),[operationId]:{hash,contextKey:key,anchor_uid:ids.at(-1)??null}},phone_action_reservations:{...(bundle.phone_action_reservations??{}),...Object.fromEntries((source?.newPhoneActions??[]).map(a=>[a.id,{fingerprint:digest(a),operationId,contextKey:key}]))}};
  const next={...reconcile(staged,messages).bundle,local_revision:(bundle.local_revision??0)+1};
  assertCurrent?.();if(chatKey(ctx())!==key)fail('CHAT_CHANGED','保存期间已切换会话');if(!await storage.commit(id,bundle.local_revision??0,next))fail('SAVE_CONFLICT','另一页面已经更新此会话，请刷新后重试');
  try{assertCurrent?.();}catch(error){error.databaseCommitReceipt={operationId,revision:next.local_revision,contextKey:key};throw error;}
  notify({status:'表单事务已保存',bundle:clone(next),database:true});
  return {state:clone(next.state),revision:next.local_revision,contextKey:key,receipt:clone(transaction)};
 }
 return {assertNativeResume:options=>{if(nativeSources&&active()&&options?.agentResume===true)fail('NATIVE_LAYER_RESUME_UNAVAILABLE','旧代理轮次没有可恢复的原生资料边界，请重新生成本轮。');},prepareNativePreset:(prompt,manager)=>{if(!prepared||prepared.passthrough)fail('NATIVE_PRESET_SCOPE','本轮配置尚未准备');return prepared.nativePresetLayers.preparePreset(prompt,manager);},finalizeNativeMessages:(messages,info)=>{if(!prepared||prepared.passthrough)fail('NATIVE_PRESET_SCOPE','本轮配置尚未准备');return prepared.nativePresetLayers.finalizeMessages(messages,info);},active,register,config,catalog,async preferenceEditorSource(){const key=chatKey(ctx()),settings=config.read(),database=await readDatabase(),source=clone(getSource());const previewSlots=await identitySlots(ctx(),settings,persona(),database);const selected=settings.story.outputConfigId;if(selected){const row=database?.state?.tables?.T_PREF_OUTPUT_CONFIG?.[selected];if(!row)fail('OUTPUT_CONFIGURATION_MISSING','当前输出配置记录已不存在');previewSlots.tisya_output_configuration=JSON.stringify(row.values);}if(key!==chatKey(ctx())||settings.revision!==config.read().revision)fail('PREPARATION_STALE','读取偏好期间会话或配置已变化');return {source,slots:previewSlots,database};},readDatabase,peekDatabase,readDatabaseSnapshot,commitDatabase,ensureDatabase,ensureBound,createPhoneDatabaseBridge,createConditionDatabaseBridge,setRevision:value=>{pendingRevision=value?clone(value):null;},setUserRevision:value=>{pendingUserRevision=value?clone(value):null;},async defer(){nativeSources?.end();const saved=controller.candidatePending(true);controller.generating.delete(chatKey(ctx()));prepared=null;await saved;},async acceptCandidate(){await controller.candidatePending(false);return sync();},generationValues:()=>generationValues(ctx()),controller,initialize,historyLimit,historyInput,sync,before,payloadReady,event,mutate,latest:()=>latest,isBusy:()=>busy,accepted:()=>prepared?.accepted===true,clear:()=>{nativeSources?.end();prepared=null;},entriesLoaded,activated:entries=>{if(prepared&&!prepared.passthrough)nativeSources?.activated(entries);},afterCombine:data=>{if(prepared&&!prepared.passthrough)return nativeSources?.afterCombine(data);},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},async import(value){assertIdle();await controller.attach(value.state?value:{state:value});await sync();},export:()=>controller.current()};
}
