import {assertObjectUniqueness} from './object-identity.mjs';
import {describeReviewForms} from './review-form-document.mjs';
import {createChatArchiveStorage} from './chat-archive-book.mjs';
import {applyReviewAction} from './review-host-actions.mjs';
import {reviewCatalog,projectReviewSchema,validateReviewSettings,reviewRequirements,backfillForm} from './review-workflow.mjs';
import {prepareReviewHistory,applyReviewHistory,ensureReviewHistoryPayload} from './review-history.mjs';
import {enableTurnReview,reviewProjection,reviewBlocks,addTurnDecision} from './turn-review.mjs';
import {phoneOriginStatus} from './phone-origin-status.mjs';
import {readProseIdentity} from './identity.mjs';
import {preferenceTextRows} from './preference-editor.mjs';
import {displayFormatMaterial,restoreDisplayFormatEntities} from './display-format.mjs';
import {narrativeSourceFragments} from './narrative-source-policy.mjs';
import {applyRequestLayers,createPromptSourceMap} from './request-layers.mjs';
import {projectSystemAuthority} from './system-authority.mjs';
import {createMatrixContextRecorder} from './context-recorder.mjs';
import {createNativePresetLayers} from './native-preset-layers.mjs';
import {phoneFormReferenceCandidates} from './phone-form-contract.mjs';
import {effectivePreferences,preferenceWishSlot} from './preferences.mjs';
import {limitNativeHistory} from '../config/history-context.js';
import {contractorMessages} from './contractor.mjs';
import {resourcePromptSlots,configureRenderingResources} from '../rendering-resources.js';
import {revisionMessages} from '../revision.js';
import {userRevisionMaterial,userRevisionMessages} from '../user-revision.js';
import {appendContractorMessages} from '../communication.js';
import {applyGeneration,generationValues,assertGeneration} from './generation.mjs';
import {Controller,indexedStorage,chatKey,captureMessages,ensureMessages,signature as messageListSignature,NS,PROMPT_KEY} from './controller.mjs';
import {Runtime} from './runtime.mjs';
import {decodePhoneDatabase} from './phone-database.mjs';
import {importPhone} from '../phone-core.mjs';
import {databaseSnapshotAtMessage,databaseSnapshotBeforeMessage} from './database-snapshot.mjs';
import {inversePatch} from './journal.mjs';
import {reconcilePhoneBundle} from './phone-bootstrap.mjs';
import {snapshotProjection} from './projection-cache.mjs';
import {createFinalProjectionCache} from './final-projection-cache.mjs';
import {materials,initializeState,extendMatrixCatalog} from './materials.mjs';
import {appendXmlSection} from './prompt-sections.mjs';
import {narrativeSection} from './narrative-material.mjs';
import {createConfiguration,materialNames,identitySlots,compilePrompts,compilePromptText,isMatrixPreset,applyCompiledMessages} from './config.mjs';
import {configureTags} from './tags.mjs';
import {messageSignature} from './message-identity.mjs';
import {clone,fail,asError,digest,stable,sha256Async} from './common.mjs';
import {prepareNativeMvu} from '../config/native-mvu.js';
import {excludeTemplateBookEntries,readStoryReferenceBooks,applyStoryReferenceBooks} from './template-book.mjs';
const nativeWorld={context:{owner:'native',card:true},mode:'matrix',modes:{matrix:{nativeMvu:'on'}},tables:{nativeBridge:false}};
function turnValidationIssues(failures){
 return failures.flatMap(warning=>{
  const error=warning.error??{},issues=error.details?.issues;
  if(Array.isArray(issues)&&issues.length)return clone(issues);
  return [{code:error.code??warning.code??'REVIEW_INVALID',message:error.message??warning.message??'填写校验失败',...clone(error.details?.formLocation??{})}];
 });
}
function turnArchiveIssue(journal,entry){
 if(!entry)return null;
 const sourceKey=(journal.scope?.branch_ref??'main')+'/'+entry.uid+'@'+entry.revision;
 const warning=entry.warnings.find(w=>w.source_key===sourceKey&&/^ARCHIVE_/.test(w.code??'')&&w.code!=='ARCHIVE_DECLARED_PENDING');
 return warning?warning.error?.message??warning.message??null:null;
}
export function createMatrixHost({getContext,getSource,loadCatalog,catalogSignature=null,storage=null,persistSettings,persistMetadata,persona=()=>'',getHistoryLimit=()=>50,projectToolTurns,getContractorMessages=async()=>[],getDisplayRules=()=>[],nativeSources=null,expand=s=>s,assertIdle=()=>{},onError=()=>{},manualReview=false,request=null,archiveBooks=null,retryBinding=null,requestTransport=null,chatExists=null}){
 let storageOwner;storage??={get:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).get(...a),set:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).set(...a),commit:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).commit(...a),stat:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).stat(...a),workspaceToken:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).workspaceToken(...a)};
 let pendingRevision=null,pendingUserRevision=null;let catalogPromise,prepared=null,latest=null,slots={},busy=false,referenceSnapshot=null,narrativeLoreSnapshot=null,warmProjection=null,preparedTurn=null,peekBatch=null;const listeners=new Set();
 const catalogCacheWarning=error=>{try{onError(Error('表单目录缓存不可用，已使用正式目录：'+error.message));}catch{}};
 const catalog=()=>{if(!catalogPromise){const request=Promise.resolve().then(async()=>{
  const cacheKey='derived:matrix-catalog',signed=typeof catalogSignature==='string'&&/^[a-f0-9]{64}$/.test(catalogSignature);
  if(signed)try{const row=await projectionStorage.get(cacheKey);if(row?.format==='tisya.matrix-catalog/3'&&row.signature===catalogSignature&&typeof row.bytes==='string'&&typeof row.projectionSignature==='string'&&await sha256Async(catalogSignature+'\n'+row.bytes)===row.projectionSignature)return JSON.parse(row.bytes);}catch(error){catalogCacheWarning(error);}
  const value=await loadCatalog();
  if(signed){const sourceBytes=stable(value);if(await sha256Async(sourceBytes)!==catalogSignature)fail('CATALOG_SIGNATURE_MISMATCH','新版表单定义内容校验失败，请更新扩展后重试');}
  const result=extendMatrixCatalog(value);
  if(signed)try{const bytes=stable(result),projectionSignature=await sha256Async(catalogSignature+'\n'+bytes);await projectionStorage.set(cacheKey,{format:'tisya.matrix-catalog/3',signature:catalogSignature,projectionSignature,bytes});}catch(error){catalogCacheWarning(error);}
  return result;
 }).catch(error=>{if(catalogPromise===request)catalogPromise=null;throw error;});catalogPromise=request;}return catalogPromise;};
 // The database remains authoritative; this is a complete derived snapshot.
 // Exact input evidence is checked before reuse, so an unchanged reopen does
 // not reconcile the same bundle again and changed evidence cannot go stale.
 const projectionStorage=storage,finalProjection=createFinalProjectionCache({storage:projectionStorage,onError});
 const config=createConfiguration({getContext,persist:persistSettings,assertIdle});
 const ctx=()=>{const c=getContext();return {...c,saveMetadata:()=>persistMetadata(c,{id:c.chatId,character:c.characterId,group:c.groupId,meta:c.chatMetadata})};};
 const contextRecorder=createMatrixContextRecorder({getKey:()=>chatKey(ctx()),transport:requestTransport});
 function phoneOrigins(c,key,meta=c.chatMetadata?.[NS]){if(typeof c.chatMetadata?.main_chat!=='string'||!c.chatMetadata.integrity)return [];const scope=JSON.parse(key),parent=JSON.stringify([scope[0],scope[1],c.chatMetadata.main_chat]);return (meta?.origin_chat_keys??[]).includes(parent)?meta.origin_chat_keys.filter(origin=>{try{const value=JSON.parse(origin);return value[0]===scope[0]&&value[1]===scope[1];}catch{return false;}}):[];}
 const bundleProjection=snapshotProjection((bundle,...args)=>reconcilePhoneBundle(manualReview?enableTurnReview(bundle):bundle,...args)),materialProjection=snapshotProjection((state,scope)=>materials(new Runtime(state),manualReview?{...scope,reviewHistory:true}:scope));
 const archive=archiveBooks?createChatArchiveStorage({storage,books:archiveBooks,getContext:ctx}):null;if(archive)storage=archive.storage;
 const phoneProof=c=>{const key=chatKey(c),nativeMessages=(c.chat??[]).map(m=>({mes:m.mes,is_user:m.is_user,is_system:m.is_system,extra:{tisya_engine:m.extra?.tisya_engine},swipe_id:m.swipe_id,swipes:m.swipes,swipe_info:m.swipe_info?.map(info=>({extra:{tisya_engine:info?.extra?.tisya_engine}})),tt_swipe_cold:m.tt_swipe_cold}));return {contextKey:key,nativeMessages,allowedOriginContextKeys:phoneOrigins(c,key)};};
 const reconcile=(bundle,messages,scope,proof=phoneProof(ctx()))=>bundleProjection(bundle,messages,scope,proof);
 const projectMaterials=(bundle,scope,playerBinding)=>{let materials={},materials_error;try{materials=materialProjection(bundle.state,{...scope,playerBinding,narrativeReading:true});}catch(e){materials_error=asError(e);}return {materials,materials_error};};
 const committedResponse=(result,next)=>({...result,bundle:next,preview:true,...projectMaterials(next,next.journal?.scope??next.state.runtime?.scope,config.read().story.userBinding)});
 const notify=(r,id,stamp)=>{
  latest=r;peekBatch=null;
  if(id&&r?.bundle&&typeof stamp==='string'){
   warmProjection={id,revision:r.bundle.local_revision??0,stamp,bundle:r.bundle};preparedTurn=null;
   // A restored workspace needs no registration. A full legacy/uncached pass
   // adopts even an unchanged result once so its new transactional head and
   // native evidence become a durable /3 workspace; later reopens skip this.
   if(r.preview!==true&&r.workspaceRestored!==true&&(r.unchanged!==true||typeof storage.stat==='function')){
    const c=ctx(),messages=captureMessages(c),scope=r.bundle.journal?.scope??r.bundle.state.runtime?.scope;
    void finalProjection.adopt(id,{bundle:r.bundle,messages,scope,proof:phoneProof(c),playerBinding:config.read().story.userBinding,manualReview},r);
   }
  }
  for(const fn of listeners)fn(r);
 };
 const warmReviewBase=(original,id,messages,stamp=messageListSignature(messages))=>warmProjection?.id===id&&warmProjection.revision===(original?.local_revision??0)&&warmProjection.stamp===stamp?warmProjection.bundle:null;
 // Generation and read-only database clients share the same persistent final
 // projection. A cold archive opening must not reconcile the whole chat again.
 const projectFinal=(id,bundle,messages,scope,proof,playerBinding=config.read().story.userBinding)=>finalProjection.project(id,{bundle,messages,scope,proof,playerBinding,manualReview},()=>{
  const result=reconcile(bundle,messages,scope,{...proof,playerBinding});return {...result,...projectMaterials(result.bundle,scope,playerBinding)};
 });
 async function restoreFinal(id,c,messages){
  const value=await finalProjection.restore(id,{messages,proof:phoneProof(c),playerBinding:config.read().story.userBinding,manualReview});
  if(!value?.bundle?.state?.schema||!value.bundle.state.tables)return null;
  return {...value,preview:false,unchanged:true,workspaceRestored:true};
 }
 const controller=new Controller({getContext:ctx,storage,onUpdate:notify,chatExists,restore:async({id,messages})=>restoreFinal(id,ctx(),messages),request:async(_path,{bundle,messages,scope})=>{
  const id=ctx().chatMetadata?.[NS]?.chat_uid,proof=phoneProof(ctx());return projectFinal(id,bundle,messages,scope,proof);
 }});
 controller.inject=async()=>{ctx().setExtensionPrompt?.(PROMPT_KEY,'',0,0,false,0);};
 const active=()=>isMatrixPreset(getSource());
 const referenceSources=settings=>readStoryReferenceBooks(getContext,settings);
 async function entriesLoaded(data){
  const settings={...config.read(),builtinBooks:ctx().extensionSettings.tisya_builtin_books?.books},key=chatKey(ctx()),binding=settings.story.userBinding,libraryBooks=new Set([settings.coreBook??'基点书',binding?.book,ctx().chatMetadata?.[NS]?.archive_book?.name].filter(Boolean)),native=prepared?.native;
  excludeTemplateBookEntries(data,settings);
  for(const name of ['globalLore','characterLore','chatLore','personaLore'])if(Array.isArray(data[name]))data[name].splice(0,data[name].length,...data[name].filter(e=>e.extensions?.tisyaChatArchive!=='tisya.chat-archive/1'&&!libraryBooks.has(e.world)&&!(native?.book&&e.world===native.book&&e.uid!=null&&native.materialEntries?.some(source=>source.uid!=null&&String(source.uid)===String(e.uid)&&source.content===String(e.content)))));
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
 function promptEnabled(source,id){
  const order=source.order??source.prompt_order?.find(value=>value.character_id===100001)?.order??[];
  return order.some(entry=>entry.identifier===id&&entry.enabled)&&source.prompts.some(p=>p.identifier===id&&p.enabled!==false);
 }
 function restoreHistoryDisplayComponents(messages,compiled,rules){
  const sourceMap=createPromptSourceMap(messages,compiled,{expand}),history=sourceMap.history;
  if(!history)return {messages,restored:0};
  const out=clone(messages);let restored=0;
  for(const part of sourceMap.parts){
   if(part.base<history.start||part.base+part.text.length>history.end)continue;
   const text=restoreDisplayFormatEntities(part.text,rules);if(text===part.text)continue;
   const message=out[part.messageIndex];
   if(typeof message.content==='string')message.content=text;
   else message.content[part.partIndex]={...message.content[part.partIndex],text};
   restored++;
  }
  return {messages:out,restored};
 }
 function assertFinalRequestHygiene(messages){
  const serialized=JSON.stringify(messages);
  if(/⟦TISYA_(?:TEMPLATE|SOURCE)_(?:START|END)_[0-9a-f-]+⟧|<!--TISYA_NATIVE_SOURCE_(?:START|END):/i.test(serialized))
   fail('FINAL_REQUEST_MARKERS','最终发送消息仍包含缇斯亚内部追踪标记');
 }
 function appendNativeMaterial(source,id,text,kind){
  if(!text)return;
  const target=promptEnabled(source,id)?id:'tisya_material_rule_material';
  const frame=value=>nativeSources?.frameMaterial?.(value,kind)??value;
  slots[target]=slots[target]
   ? appendXmlSection(slots[target],null,frame(text),{escaped:true})
   : target===id?frame(narrativeSection(target,text)):narrativeSection(target,frame(text));
 }
 function register(){const c=getContext();if(!c.macros?.register&&!c.registerMacro)fail('HOST_MACROS','宿主缺少动态资料宏接口');for(const name of materialNames){const handler=()=>active()?(name==='tisya_contractor_wish'?preferenceWishSlot(config.read(),slots):slots[name]??''):'';if(c.macros?.register)c.macros.register(name,{handler,description:'缇斯亚新版动态资料'});else c.registerMacro(name,handler,'缇斯亚新版动态资料');}}
 function historyLimit(){const count=effectivePreferences(config.read()).parameters.history_messages??getHistoryLimit();if(!Number.isSafeInteger(count)||count<0)fail('HISTORY_COUNT','历史聊天条数须为非负整数');return count;}
 function historyInput(chat,type='normal'){if(['quiet','impersonate'].includes(type))return null;if(chat===ctx().chat)fail('HISTORY_COPY','宿主应传入历史发送副本');if(manualReview&&prepared?.reviewHistory){const captured=prepared;return refreshReviewHistory(captured).then(()=>{if(captured!==prepared)fail('HISTORY_STALE','本轮准备已变化');const report=applyReviewHistory(chat,captured.reviewHistory);captured.historySentText=captured.reviewHistory.text;captured.historyWindow=report;return report;});}const count=prepared?.historyLimit??historyLimit(),report=limitNativeHistory(chat,count,type,projectToolTurns);if(prepared)prepared.historyWindow=report;latest={...latest,historyWindow:report};return report;}

 async function refreshReviewHistory(captured){
  if(captured!==prepared||captured.key!==chatKey(ctx()))fail('HISTORY_STALE','历史所属会话已变化');const c=ctx(),old=captured.reviewHistory.messages;
  const appended=captured.type==='normal'&&c.chat.length===old.length+1&&c.chat.at(-1).is_user===true;
  if(appended&&ensureMessages(c))await c.saveChat();
  if(captured!==prepared||captured.key!==chatKey(ctx()))fail('HISTORY_STALE','保存本轮消息身份期间会话变化');
  const sources=captureMessages(ctx(),{omitLastAssistant:['swipe','regenerate'].includes(captured.type)}).map((m,i)=>({...m,hidden:!!ctx().chat[i]?.extra?.[Symbol.for('ignore')]}));
  if(digest(sources)===captured.reviewHistory.signature)return;
  if(!appended||digest(sources.slice(0,-1))!==digest(old)||sources.at(-1).role!=='user')fail('HISTORY_STALE','历史在准备后发生变化');
  captured.reviewHistory=prepareReviewHistory(captured.reviewBundle,sources,captured.key,captured.historyLimit,{recall:captured.recall});
 }
 async function ensureBound(options={}){assertIdle();const result=await controller.ensureBound(async scope=>initializeState(await catalog(),scope),options);if(result.key){options.assertCurrent?.();if(chatKey(ctx())!==result.key||ctx().chatMetadata?.[NS]?.chat_uid!==result.id)fail('CHAT_CHANGED','自动接入后聊天已切换');if(options.syncArchive!==false)await archive?.sync();options.assertCurrent?.();}return result;}
 async function initialize(){assertIdle();const current=await controller.current();if(current)fail('ENGINE_EXISTS','本会话已有引擎状态，请导出备份或继续使用');const c=ctx();await controller.attach({state:initializeState(await catalog(),{session_ref:String(c.chatId),branch_ref:'main'})});await sync();}
 async function present(r){
  if(r?.materials_error)fail('MATERIALS_ERROR','表单已保存，材料读取失败',{error:r.materials_error});slots={...(r?.materials??{}),tisya_preference_texts:JSON.stringify(preferenceTextRows(r?.bundle?.state))};const selected=config.read().story.outputConfigId;if(selected){const row=r?.bundle?.state?.tables?.T_PREF_OUTPUT_CONFIG?.[selected];if(!row)fail('OUTPUT_CONFIGURATION_MISSING','当前输出配置记录已不存在');slots.tisya_output_configuration=JSON.stringify(row.values);}const identities=await identitySlots(ctx(),config.read(),persona(),{state:r?.bundle?.state,revision:r?.bundle?.local_revision??0,contextKey:chatKey(ctx())});slots.tisya_contractor_wish=identities.tisya_contractor_wish?identities.tisya_contractor_wish.replace('[/CONTRACTOR.WISH]',()=>[slots.tisya_contractor_wish,'[/CONTRACTOR.WISH]'].filter(Boolean).join('\n')):slots.tisya_contractor_wish?'[CONTRACTOR.WISH]\n'+slots.tisya_contractor_wish+'\n[/CONTRACTOR.WISH]':'';slots.tisya_user_identity=identities.tisya_user_identity;
  if(config.read().story.userBinding?.database&&slots.tisya_material_player_archive&&promptEnabled(getSource(),'tisya_material_player_archive'))slots.tisya_user_identity='[USER.IDENTITY]\n故事主角：'+identities.tisya_user_name+'\n详档见 PlayerArchive。\n[/USER.IDENTITY]';
  slots.tisya_user_name=identities.tisya_user_name;for(const [name,text]of Object.entries(resourcePromptSlots(config.read().resources??[])))slots[name]=[slots[name],text].filter(Boolean).join('\n');return r;
 }
 async function sync(options={}){busy=true;try{return await present(await controller.run(options));}finally{busy=false;}}
 // A successful CAS commit is already the authoritative result. Reuse its
 // journal/state and compute materials once instead of reading and reconciling
 // the identical turn a second time for the button's visual refresh.
 async function syncCommitted(id,response,stamp){busy=true;try{controller.publish(id,response,stamp);return await present(response);}finally{busy=false;}}
 async function before(type,options={},dryRun=false){nativeSources?.end();if(dryRun||['quiet','impersonate'].includes(type)){prepared={passthrough:true,accepted:true};return;}prepared=null;referenceSnapshot=null;narrativeLoreSnapshot=null;await controller.inject();if(!controller.enabled())fail('ENGINE_NOT_BOUND','请在新版配置的“表单与存档”中接入本会话，或导入已有新版状态');await controller.beginGeneration();const key=chatKey(ctx()),settings=config.read();configureTags(settings.tags,settings.aliases);applyGeneration(ctx(),settings.generation);try{const omitLastAssistant=['swipe','regenerate','continue'].includes(type),[reviewed,native,directions]=await Promise.all([sync({preview:true,omitLastAssistant}),prepareNativeMvu(ctx(),nativeWorld,type,undefined,{groupMachineInExtra:true}),getContractorMessages({prepare:true})]);const historySources=captureMessages(ctx(),{omitLastAssistant:['swipe','regenerate'].includes(type)}).map((m,i)=>({...m,hidden:!!ctx().chat[i]?.extra?.[Symbol.for('ignore')]}));const source=getSource(),recall=promptEnabled(source,'tisya_material_memory_excerpt');const reviewHistory=manualReview?prepareReviewHistory(reviewed.bundle,historySources,key,historyLimit(),{recall}):null;nativeSources?.begin({type,dryRun});appendNativeMaterial(source,'tisya_material_cardflow',native?.text,'原卡变量规约');const displayFormats=displayFormatMaterial(getDisplayRules());appendNativeMaterial(source,'tisya_material_display_material',displayFormats,'原卡显示格式');if(chatKey(ctx())!==key)fail('CHAT_CHANGED','准备期间已切换会话');const user=ctx().chat?.[ctx().chat.length-(ctx().chat.at(-1)?.is_user?1:2)],rewrite=['swipe','regenerate'].includes(type)?userRevisionMaterial(user):null,directives=[...revisionMessages(pendingRevision),...userRevisionMessages(pendingUserRevision??rewrite)];if(chatKey(ctx())!==key||config.read().revision!==settings.revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(displayFormatMaterial(getDisplayRules())!==displayFormats)fail('DISPLAY_FORMAT_STALE','显示正则的格式或许可已变化，请重新生成');prepared={native,reviewHistory,recall,reviewBundle:reviewed.bundle,displayFormats,type,historyLimit:historyLimit(),directives,directions,user,userText:user?.mes,key,revision:settings.revision,source:clone(getSource()),settings,slots:clone(slots),narrativeSources:narrativeSourceFragments(ctx()),accepted:false};if(nativeSources)prepared.nativePresetLayers=createNativePresetLayers({settings:prepared.settings,slots:prepared.slots,type:prepared.type});}catch(e){nativeSources?.end();controller.generating.delete(key);throw e;}}
 // MVU copies identical variables to a newly sent user message asynchronously.
 // Compare script, contract and value bytes; a copied floor alone is not stale.
 async function payloadReady(payload){if(prepared?.passthrough)return payload;if(!prepared)fail('PREPARATION_MISSING','新版引擎未完成本轮资料准备');if(prepared.key!==chatKey(ctx())||prepared.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(!Array.isArray(payload.messages))fail('PAYLOAD_MESSAGES','宿主最终请求缺少消息列表');const captured=prepared;await assertReferences(captured.settings,captured.key);if(captured.settings.story.userBinding?.sourceMode==='prose')await readProseIdentity(ctx(),captured.settings.story.userBinding);if(captured.historyLimit!==historyLimit())fail('HISTORY_STALE','历史可见条数已变化，请重新生成');const native=await prepareNativeMvu(ctx(),nativeWorld,captured.type,undefined,{groupMachineInExtra:true});if(prepared!==captured||captured.key!==chatKey(ctx())||captured.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(!!native!==!!captured.native||native&&['signature','stateDigest','text'].some(k=>native[k]!==captured.native[k]))fail('NATIVE_MVU_STALE','原卡 MVU 来源或变量已变化，请重新生成');if(displayFormatMaterial(getDisplayRules())!==captured.displayFormats)fail('DISPLAY_FORMAT_STALE','显示正则的格式或许可已变化，请重新生成');if(digest(narrativeSourceFragments(ctx()))!==digest(captured.narrativeSources??[]))fail('NARRATIVE_SOURCE_STALE','角色卡叙事来源在准备后已变化，请重新生成');assertGeneration(ctx(),captured.settings.generation);const compiled=compilePrompts(prepared.source,prepared.settings,prepared.slots);if(nativeSources)await nativeSources.assertReady();captured.nativePresetLayers?.mergeTemplatePayload(payload);const nativeLayerAudit=captured.nativePresetLayers?.lastFinalization();const compiledMessages=nativeLayerAudit?clone(payload.messages):applyCompiledMessages(payload.messages,prepared.source,compiled,expand);const layerProjection=nativeSources?(nativeLayerAudit?{messages:compiledMessages,audit:nativeLayerAudit}:applyRequestLayers(compiledMessages,compiled,{expand})):null;const narrativeProjection=layerProjection?{messages:layerProjection.messages,audit:{status:'source-envelopes',removed:[],reason:'whole-native-source-preserved'}}:{messages:compiledMessages,audit:{status:'source-text-preserved',removed:[],reason:'role-consolidation-without-card-cleanup'}};const consolidated=contractorMessages(narrativeProjection.messages,ctx(),persona(),expand),authorityProjection=projectSystemAuthority(consolidated,compiled,{expand}),displayProjection=restoreHistoryDisplayComponents(authorityProjection.messages,compiled,getDisplayRules());payload.messages=displayProjection.messages;assertFinalRequestHygiene(payload.messages);narrativeProjection.audit={...narrativeProjection.audit,systemAuthority:authorityProjection.audit,historyDisplayComponents:displayProjection.restored};const system=payload.messages.filter(m=>m.role==='system').flatMap(m=>typeof m.content==='string'?[m.content]:(m.content??[]).filter(p=>p.type==='text').map(p=>p.text)).join('\n');const sourceMap=nativeSources?(nativeLayerAudit?captured.nativePresetLayers.sourceMap(payload.messages):createPromptSourceMap(payload.messages,compiled,{expand})):null;const hasUnexpanded=sourceMap?sourceMap.parts.some(part=>part.role==='system'&&[...part.text.matchAll(/\{\{tisya_[^{}]+\}\}/g)].some(match=>!sourceMap.protection(part,match.index,match.index+match[0].length))):/\{\{tisya_[^{}]+\}\}/.test(system);if(hasUnexpanded)fail('UNEXPANDED_MACRO','最终请求有未展开的缇斯亚资料宏');const identity=expand(compilePromptText(prepared.slots.tisya_user_identity??'',prepared.settings,prepared.slots));const identityCount=identity?(sourceMap?sourceMap.find(identity,{role:'system'}).found.length:system.split(identity).length-1):0;if(identity&&identityCount!==1)fail('USER_IDENTITY_COUNT','最终请求缺少或重复了绑定的user身份资料',{matches:identityCount});const registryCount=sourceMap?sourceMap.parts.filter(part=>part.role==='system').reduce((n,part)=>n+[...part.text.matchAll(/(?:^|\n)\[REGISTRY\]\s*\n/g)].filter(match=>!sourceMap.protection(part,match.index,match.index+match[0].length)).length,0):[...system.matchAll(/(?:^|\n)\[REGISTRY\]\s*\n/g)].length;if(registryCount!==1)fail('REGISTRY_COUNT','最终请求需要唯一新版输出合同');if(prepared.user&&prepared.user.mes!==prepared.userText)fail('USER_REVISION_STALE','用户改写依据在准备后变化');const directions=await getContractorMessages();if(captured.settings.story.userBinding?.sourceMode==='prose')await readProseIdentity(ctx(),captured.settings.story.userBinding);if(prepared!==captured||captured.key!==chatKey(ctx())||captured.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(displayFormatMaterial(getDisplayRules())!==captured.displayFormats)fail('DISPLAY_FORMAT_STALE','显示正则的格式或许可已变化，请重新生成');if(JSON.stringify(directions)!==JSON.stringify(captured.directions))fail('TURN_DIRECTION_STALE','本轮场外要求在准备后变化，请重新生成');if(captured.reviewHistory){await refreshReviewHistory(captured);ensureReviewHistoryPayload(payload,captured.reviewHistory,captured.historySentText);}appendContractorMessages(payload.messages,captured.directions);for(const m of captured.directives)if(!payload.messages.some(x=>x.role===m.role&&x.content===m.content))payload.messages.push(m);assertFinalRequestHygiene(payload.messages);contextRecorder.capture(payload,captured.key);captured.accepted=true;latest={...latest,promptAudit:{status:'validated',messages:payload.messages.length,configurationRevision:captured.revision,tags:clone(captured.settings.tags),narrativeSourceProjection:narrativeProjection.audit,...(layerProjection?{layers:layerProjection.audit,nativeSources:nativeSources.audit()}:{} )}};return payload;}
 async function event(name,...args){if(['CHAT_CHANGED','GENERATION_ENDED','GENERATION_STOPPED'].includes(name))nativeSources?.end();if(name==='CHAT_CHANGED'){contextRecorder.invalidate();bundleProjection.clear();materialProjection.clear();databaseProjection.clear();prepared=null;warmProjection=null;preparedTurn=null;referenceSnapshot=null;narrativeLoreSnapshot=null;configureTags(config.read().tags,config.read().aliases);configureRenderingResources(config.read().resources??[]);}if(!active())return;try{await controller.event(name,...args);if(['CHAT_CHANGED','GENERATION_ENDED','GENERATION_STOPPED'].includes(name))prepared=null;}catch(e){notify({status:e.message,error:asError(e)});onError(e);throw e;}}
 async function mutate(callback){
  assertIdle();
  const {ctx:c,id,key}=await controller.identity();
  if(ensureMessages(c))await c.saveChat();
  const bundle=await storage.get(id);
  if(!bundle)fail('ENGINE_NOT_BOUND','请先接入本会话');
  if(chatKey(ctx())!==key)fail('CHAT_CHANGED','保存期间已切换会话');
  const messages=captureMessages(c),current=reconcile(bundle,messages).bundle;
  const e=new Runtime(current.state),result=e.transaction('manual:'+crypto.randomUUID(),{source:'configuration'},()=>{const value=callback(e);assertObjectUniqueness(current.state,e.data);return value;});
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
  const messages=(c.chat??[]).slice(),logical=(c.chat??[]).every(m=>m.extra?.[NS]?.uid)?captureMessages(c):null,restored=logical?await restoreFinal(id,c,logical):null,bundle=restored?.bundle??await storage.get(id),assertCurrent=()=>{const live=ctx();
   if(chatKey(live)!==key||live.chatMetadata!==c.chatMetadata||live.chatMetadata?.[NS]!==meta||meta.chat_uid!==id||meta.owner_chat_key!==key||live.chat!==c.chat||(live.chat??[]).length!==messages.length||messages.some((m,i)=>live.chat[i]!==m))fail('CHAT_CHANGED','读取期间会话或历史已变化，请重试');
  };
  assertCurrent();if(!bundle)return null;if(restored)warmProjection={id,revision:bundle.local_revision??0,stamp:messageListSignature(logical),bundle};const result=await project(bundle,c,key,meta,restored);assertCurrent();return result;
 }

 async function listTurnReviews(){
  return await readOwnedDatabase((original,c,key,meta)=>{
   const messages=captureMessages(c),bundle=warmReviewBase(original,meta.chat_uid,messages)??reconcile(manualReview?enableTurnReview(original):original,messages).bundle,projection=reviewProjection(bundle,messages),entries=new Map(bundle.journal.entries.map(entry=>[entry.uid,entry]));
   return {contextKey:key,revision:original.local_revision??0,enabled:!!bundle.turn_review,catalog:reviewCatalog(bundle.state),settings:clone(bundle.turn_review?.settings??{policy:{},custom:[],labels:{}}),requirements:reviewRequirements(bundle.state,bundle.turn_review?.settings??{}),backfill:clone(bundle.turn_review?.backfill??null),drafts:clone(bundle.turn_review?.drafts??{}),reviews:projection.reviews.map(review=>{
    const raw=review.decision?.reply??messages[review.index].text;
    const archiveIssue=review.archivePending?turnArchiveIssue(bundle.journal,entries.get(review.uid)):null;
    try{return {...review,...reviewBlocks(raw),archiveIssue};}catch(error){return {...review,error:error.message,cells:'',archive:''};}
   })};
  });
 }
 async function describeTurnReview(input){
  return await readOwnedDatabase((original,c,key,meta)=>{
   if(input.contextKey!==key||input.expectedRevision!==(original.local_revision??0))fail('REVIEW_STALE','表单预览对应的聊天或存档已变化，请重新打开本轮');
   const messages=captureMessages(c),bundle=warmReviewBase(original,meta.chat_uid,messages)??reconcile(enableTurnReview(original),messages).bundle,review=reviewProjection(bundle,messages).reviews.find(r=>r.uid===input.uid);
   if(!review||review.sourceHash!==input.sourceHash)fail('REVIEW_STALE','本轮正文已变化，请重载表单');
   const before=databaseSnapshotBeforeMessage(bundle,{uid:input.uid},key);return describeReviewForms(projectReviewSchema(before.state,bundle.turn_review?.settings??{}),input);
  });
 }
 function confirmTurn(input){const job=databaseChain.then(()=>saveTurnReview(input,false));databaseChain=job.catch(()=>{});return job;}
 function checkTurnReview(input){const job=databaseChain.then(()=>saveTurnReview(input,false,true));databaseChain=job.catch(()=>{});return job;}
 function rewindTurnReviews(input){const job=databaseChain.then(()=>saveTurnReview(input,true));databaseChain=job.catch(()=>{});return job;}
 async function saveTurnReview(input,rewind=false,checkOnly=false){
  assertIdle();const {ctx:c,id,key}=await controller.identity();
  if(input.contextKey!==key)fail('CHAT_CHANGED','确认窗所属会话已变化');
  const original=await storage.get(id);
  if(input.expectedRevision!==(original.local_revision??0))fail('SAVE_CONFLICT','存档已更新，请重新打开确认窗');
  const messages=captureMessages(c),stamp=messageListSignature(messages),inputStamp=JSON.stringify(input),reusable=!rewind&&preparedTurn?.id===id&&preparedTurn.key===key&&preparedTurn.revision===(original.local_revision??0)&&preparedTurn.stamp===stamp&&preparedTurn.inputStamp===inputStamp?preparedTurn:null;
  if(reusable&&checkOnly)return {status:'valid',issues:[],archiveIssue:reusable.archiveIssue};
  if(reusable)preparedTurn=null;
  const bundle=reusable?.bundle??warmReviewBase(original,id,messages,stamp)??(manualReview?enableTurnReview(original):original);
  if(!bundle.turn_review)fail('REVIEW_DISABLED','本会话未启用每轮确认');
  let staged;
  if(reusable)staged=reusable.staged;
  else if(rewind){
   const at=messages.findIndex(m=>m.uid===input.uid);if(at<0)fail('REVIEW_STALE','目标楼层已不存在');
   staged=clone(bundle);const removed=new Set(messages.slice(at).map(m=>m.uid));
   for(const decision of staged.turn_review.decisions)if(removed.has(decision.uid))decision.active=false;
   staged.turn_review.legacy=staged.turn_review.legacy.filter(d=>!removed.has(d.uid));staged.manual_edits=(staged.manual_edits??[]).filter(e=>e.kind!=='reviewBackfill'||!removed.has(e.source_uid));for(const r of staged.turn_review.backfillReceipts??[])if(removed.has(r.messageId))r.active=false;staged.turn_review.backfill=null;
  }else {staged=addTurnDecision(bundle,messages,input).bundle;if(input.settings)staged.turn_review.settings=validateReviewSettings(staged.state,input.settings);}
  const result=reusable?.result??reconcile(staged,messages),target=result.bundle.journal.entries.find(e=>e.uid===input.uid);
  let archiveIssue=reusable?.archiveIssue??null;
  if(!rewind&&!reusable){
   const policy=staged.turn_review.settings??{};const base=projectReviewSchema(clone(bundle.state),policy);const missing=reviewRequirements(base,policy,result.bundle.state,input.responses??{}).filter(r=>!r.done);
   const failures=(target?.warnings??[]).filter(w=>/^CELL.*FAILED/.test(w.code??'')),issues=[...turnValidationIssues(failures),...missing.map(item=>({code:'REVIEW_REQUIRED',message:'请核对必填字段：'+item.recordName+'／'+item.label,channel:item.channel,tableId:item.table,recordId:item.recordId==='*'?null:item.recordId,field:item.key,label:item.label}))];
   if(target?.settlement_status==='FAILED'&&!issues.length)issues.push({code:'REVIEW_INVALID',message:'填写校验失败'});
   if(issues.length){preparedTurn=null;if(checkOnly)return {status:'invalid',issues:clone(issues),archiveIssue:turnArchiveIssue(result.bundle.journal,target)};fail('REVIEW_INVALID','本轮表单尚不能保存，共 '+issues.length+' 处需要修正：\n'+issues.map((issue,index)=>(index+1)+'. '+issue.message).join('\n'),{warnings:failures,issues:clone(issues)});}
   archiveIssue=turnArchiveIssue(result.bundle.journal,target);
   if(checkOnly){preparedTurn={id,key,revision:original.local_revision??0,stamp,inputStamp,bundle,staged,result,archiveIssue};return {status:'valid',issues:[],archiveIssue};}
  }
  if(!rewind){
   const decision=result.bundle.turn_review.decisions.at(-1);decision.confirmedAt=new Date().toISOString();
   decision.archive_pending=archiveIssue!==null;
   if(result.bundle.turn_review.drafts)delete result.bundle.turn_review.drafts[input.uid];
  }
  const live=ctx();if(chatKey(live)!==key||live.chatMetadata?.[NS]?.chat_uid!==id||messageListSignature(captureMessages(live))!==stamp)fail('REVIEW_STALE','确认期间正文或会话已变化');
  const next={...result.bundle,local_revision:(original.local_revision??0)+1};
  if(!await storage.commit(id,original.local_revision??0,next))fail('SAVE_CONFLICT','另一页面已更新存档，请重新核对');
  if(chatKey(ctx())===key&&messageListSignature(captureMessages(ctx()))===stamp)await syncCommitted(id,committedResponse(result,next),stamp);
  else if(chatKey(ctx())===key)await sync({preview:true});
  return {status:rewind?'rewound':archiveIssue!==null?'archive-pending':'confirmed',uid:input.uid,revision:next.local_revision,archiveIssue};
 }

 function reviewAction(input){const job=databaseChain.then(async()=>{
  assertIdle();const {ctx:c,id,key}=await controller.identity();if(input.contextKey!==key)fail('CHAT_CHANGED','归档窗口所属会话已变化');
  const original=await storage.get(id);if(!original||input.expectedRevision!==(original.local_revision??0))fail('SAVE_CONFLICT','存档已更新，请刷新');
  const messages=captureMessages(c),stamp=messageListSignature(messages),current=warmReviewBase(original,id,messages,stamp)??reconcile(enableTurnReview(original),messages).bundle;
  const staged=applyReviewAction(current,messages,key,input),result=reconcile(staged,messages),next={...result.bundle,local_revision:(original.local_revision??0)+1};
  if(chatKey(ctx())!==key||messageListSignature(captureMessages(ctx()))!==stamp)fail('REVIEW_STALE','操作期间会话或正文变化');
  if(!await storage.commit(id,original.local_revision??0,next))fail('SAVE_CONFLICT','另一页面已保存，请刷新');
  if(chatKey(ctx())===key&&messageListSignature(captureMessages(ctx()))===stamp)await syncCommitted(id,committedResponse(result,next),stamp);else await sync({preview:true});return {status:'saved',revision:next.local_revision};
 });databaseChain=job.catch(()=>{});return job;}
 async function generateBackfill(input){
  if(!request)fail('REVIEW_MODEL','尚未配置历史提炼接口，可手动填写');
  const snapshot=await listTurnReviews(),database=await readDatabase();
  if(snapshot.contextKey!==input.contextKey||snapshot.revision!==input.expectedRevision||snapshot.backfill?.id!==input.batchId)fail('REVIEW_STALE','补录批次已变化');
  const floor=snapshot.backfill.floors.find(f=>f.id===input.uid);if(floor?.status!=='pending')fail('REVIEW_STALE','本层不再等待提炼');
  const form=backfillForm(database.state,floor),raw=await request('historyImport',JSON.stringify({formContract:'tisya.simple-form/1',task:'historyImport',goal:'仅提炼下列历史正文中所选字段的事实。不执行消耗、转账、奖励或时钟推进。缺乏依据留空。返回含 body、cells、archive 的 reply；保留原段落依据。',forms:form.form,sourceHistory:floor.body}),{signal:input.signal});
  if(typeof raw!=='string'||!raw.trim())fail('REVIEW_MODEL_EMPTY','提炼接口未返回文本；原候选保留');
  return reviewAction({...input,action:'modelBackfill',raw});
 }
 async function previewReviewHistory(){return readOwnedDatabase((original,c,key,meta)=>{const messages=captureMessages(c).map((m,i)=>({...m,hidden:!!c.chat[i]?.extra?.[Symbol.for('ignore')]})),bundle=warmReviewBase(original,meta.chat_uid,messages)??reconcile(enableTurnReview(original),messages).bundle;return prepareReviewHistory(bundle,messages,key,historyLimit());});}
 function clonePeek(view){
  if(!view)return view;const copy=clone(view);if(view.projectionKey)Object.defineProperty(copy,'projectionKey',{enumerable:false,value:view.projectionKey});return copy;
 }
 async function peekDatabase(){
  const c=ctx(),metadata=c.chatMetadata,chat=c.chat,key=chatKey(c),evidence=JSON.stringify([metadata?.[NS]??null,phoneProof(c),config.read().story.userBinding??null,manualReview]);
  if(peekBatch&&peekBatch.key===key&&peekBatch.metadata===metadata&&peekBatch.chat===chat&&peekBatch.evidence===evidence)return clonePeek(await peekBatch.promise);
  const entry={key,metadata,chat,evidence,promise:Promise.resolve().then(()=>readOwnedDatabase((bundle,_c,key)=>({state:clone(bundle.state),revision:bundle.local_revision??0,contextKey:key})))};peekBatch=entry;
  try{return clonePeek(await entry.promise);}catch(error){if(peekBatch===entry)peekBatch=null;throw error;}
 }
 // Reconciliation can remove a detached binding from bundle.state. Its saved
 // initialization patch remains evidence that this is not a fresh phone.
 function phoneInitializationEdits(bundle,key,origins){
  return (bundle.manual_edits??[]).filter(edit=>(edit.patch??[]).some(patch=>{
   if(patch.op!=='set'||patch.path?.[0]!=='tables'||patch.path[1]!=='X_PHONE_BINDINGS')return false;
   const row=patch.path.length===2?patch.value?.['phone-current']:patch.path.length===3&&patch.path[2]==='phone-current'?patch.value:null;
   const owner=row?.values?.context_key;return typeof owner==='string'&&(owner===key||origins.includes(owner));
  }));
 }
 function databaseView(bundle,messages,proof,projection=null){
  const current=projection?.bundle??bundle,key=proof.contextKey,allowedOriginContextKeys=proof.allowedOriginContextKeys;
  const seenOrigins=new Set(),hasPhone=!!current.state.tables?.X_PHONE_BINDINGS?.['phone-current'];
  const phoneInitializationSources=phoneInitializationEdits(bundle,key,allowedOriginContextKeys).flatMap(edit=>{const messageUid=edit.after_uid??edit.anchor_chain?.at(-1)?.uid;if(!messageUid||seenOrigins.has(messageUid))return [];seenOrigins.add(messageUid);return [{messageUid,index:(messages??[]).findIndex(m=>m.uid===messageUid),...(!hasPhone?phoneOriginStatus(edit,messages):{})}];});
  const view={state:clone(current.state),revision:bundle.local_revision??0,contextKey:key,allowedOriginContextKeys,phoneDetached:!current.state.tables?.X_PHONE_BINDINGS?.['phone-current']&&(!!bundle.state.tables?.X_PHONE_BINDINGS?.['phone-current']||phoneInitializationEdits(bundle,key,allowedOriginContextKeys).length>0),phoneBootstrapHydration:clone(projection?.phone_bootstrap_hydration??[]),phoneInitializationSources,phoneActionReservations:clone(bundle.phone_action_reservations??{})};
  // The phone adapter may reuse its decoded archive only for this exact
  // projection. A deleted/edited message can change the derived state before
  // the authoritative revision advances, so revision alone is not sufficient.
  if(projection&&messages)Object.defineProperty(view,'projectionKey',{enumerable:false,value:JSON.stringify([view.revision,messages,proof])});
  return view;
 }
 const databaseProjection=snapshotProjection((bundle,messages,proof)=>databaseView(bundle,messages,proof,messages?bundleProjection(bundle,messages,undefined,proof):null));
 async function readDatabase(){return readOwnedDatabase(async(bundle,c,key,meta,restored)=>{
  const messages=(c.chat??[]).every(m=>m.extra?.[NS]?.uid)?captureMessages(c):null,proof=phoneProof(c);if(!messages)return databaseProjection(bundle,null,proof);
  const projected=restored??await projectFinal(meta.chat_uid,bundle,messages,bundle.journal?.scope??bundle.state.runtime?.scope,proof);return databaseView(bundle,messages,proof,projected);
 });}

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
    if(change.remove){e.removeRecord(tid,rid);continue;}
    if(!e.rows(tid)[rid])e.newRecord(tid,{},rid);
    for(const [field,value]of Object.entries(change.values??{})){const spec=e.spec(tid,field);if(spec.read_only&&!['row_uuid','common.row_uuid'].includes(spec.alias_of)&&field!=='row_uuid'&&JSON.stringify(e.record(tid,rid).values[field])!==JSON.stringify(value))fail('DERIVED_WRITE','派生字段不能直接修改，请修改原点字段',{table:tid,field});e.set([tid,rid,field,[]],value,change.states?.[field]??'known');}
    if(change.metadata)e.record(tid,rid).metadata={...(e.record(tid,rid).metadata??{}),...clone(change.metadata)};
   }
   // Entity summaries are derived from their one registered origin record.
   for(const [rid,row]of Object.entries(e.rows('T_SYS_ENTITIES'))){const ref=row.values.origin_record_ref,link=typeof ref==='string'?e.rows('M_FIELD_REFERENCES')[ref]?.values:null;if(link?.target_table&&link?.target_row_uuid){const origin=e.rows(link.target_table)[link.target_row_uuid],name=origin?.values?.[link.target_field||'name'];if(typeof name==='string')e.set(['T_SYS_ENTITIES',rid,'name',[]],name,'derived');}}
   for(const change of changes){if(change.remove)continue;const tid=change.tableId??change.table,rid=change.recordId??change.id,row=e.record(tid,rid);
    // Match the shared form validator: derived source projections are not
    // user inputs. Their absence cannot require a caller to forge provenance.
    for(const spec of e.data.schema[tid].fields){const v=row.values[spec.key],state=row.states[spec.key];if(spec.required&&!spec.read_only&&(v==null||!['known','derived'].includes(state)))fail('REQUIRED_FIELD','表单必填字段尚未完整填写',{table:tid,record:rid,field:spec.key});
     if(v==null||!['REF','CHILD_REF'].includes(spec.type)||!spec.ref)continue;const target=spec.ref.startsWith('@')?row.values[spec.ref.slice(1)]:spec.ref;if(!target||!e.data.schema[target])continue;const refs=Array.isArray(v)?v:[v];for(const ref of refs)if(typeof ref==='string'){
      const business=phoneFormReferenceCandidates(e.data,{tableId:tid,recordId:rid,field:spec.key,target,value:ref});
      if(business?.length>1)fail('REFERENCE_AMBIGUOUS','表单业务引用对应多条记录，请明确目标',{table:tid,record:rid,field:spec.key,target,reference:ref});
      if(business?business.length!==1:!e.rows(target)[ref])fail('REFERENCE_MISSING','表单引用的目标记录不存在',{table:tid,record:rid,field:spec.key,target,reference:ref});
     }
    }
   }
   assertObjectUniqueness(current.state,e.data,changes);
   return {changed:changes.length,source:clone(source)};
  });
  if(transaction.status==='FAILED')fail(transaction.error.code,transaction.error.message,transaction.error.details);
  if(e.data.tables.X_PHONE_BINDINGS?.['phone-current']){const archive=decodePhoneDatabase(e.data);if(archive)importPhone(archive);}
  const ids=messages.map(m=>m.uid),edit={uid:'database:'+operationId,after_uid:ids.at(-1),previous_uids:ids.slice(0,-1),strict:true,anchor_chain:messages.map(m=>({uid:m.uid,signature:messageSignature(m)})),patch:inversePatch(e.data,current.state)};
  const staged={...current,manual_edits:[...(current.manual_edits??[]),edit],database_operations:{...(bundle.database_operations??{}),[operationId]:{hash,contextKey:key,anchor_uid:ids.at(-1)??null}},phone_action_reservations:{...(bundle.phone_action_reservations??{}),...Object.fromEntries((source?.newPhoneActions??[]).map(a=>[a.id,{fingerprint:digest(a),operationId,contextKey:key}]))}};
  const reconciled=reconcile(staged,messages),next={...reconciled.bundle,local_revision:(bundle.local_revision??0)+1};
  assertCurrent?.();if(chatKey(ctx())!==key)fail('CHAT_CHANGED','保存期间已切换会话');if(!await storage.commit(id,bundle.local_revision??0,next))fail('SAVE_CONFLICT','另一页面已经更新此会话，请刷新后重试');
  try{assertCurrent?.();}catch(error){error.databaseCommitReceipt={operationId,revision:next.local_revision,contextKey:key};throw error;}
  const scope=next.journal?.scope??next.state.runtime?.scope,playerBinding=config.read().story.userBinding;
  void finalProjection.adopt(id,{bundle:next,messages,scope,proof:phoneProof(c),playerBinding,manualReview},{...reconciled,bundle:next,...projectMaterials(next,scope,playerBinding)});
  notify({status:'表单事务已保存',bundle:clone(next),database:true});
  return {state:clone(next.state),revision:next.local_revision,contextKey:key,receipt:clone(transaction)};
 }
 return {clearProjectionCache:async()=>{const id=ctx().chatMetadata?.[NS]?.chat_uid;if(id)await finalProjection.clear(id);bundleProjection.clear();materialProjection.clear();databaseProjection.clear();},projectionCacheReport:()=>finalProjection.report(),flushProjectionCache:()=>finalProjection.flush(),captureTemplatePayload(payload){if(prepared?.passthrough)return;if(!prepared?.nativePresetLayers)fail('PREPARATION_MISSING','提示词模板处理前缺少本轮准备');prepared.nativePresetLayers.captureTemplatePayload(payload);},archiveStatus:()=>archive?.status()??null,syncArchive:async()=>{if(retryBinding)await retryBinding();else await ensureBound();return archive?.status()??null;},assertNativeResume:options=>{if(nativeSources&&active()&&options?.agentResume===true)fail('NATIVE_LAYER_RESUME_UNAVAILABLE','旧代理轮次没有可恢复的原生资料边界，请重新生成本轮。');},prepareNativePreset:(prompt,manager)=>{if(!prepared||prepared.passthrough)fail('NATIVE_PRESET_SCOPE','本轮配置尚未准备');return prepared.nativePresetLayers.preparePreset(prompt,manager);},finalizeNativeMessages:(messages,info)=>{if(!prepared||prepared.passthrough)fail('NATIVE_PRESET_SCOPE','本轮配置尚未准备');return prepared.nativePresetLayers.finalizeMessages(messages,info);},active,register,config,catalog,async preferenceEditorSource(){const key=chatKey(ctx()),settings=config.read(),database=await readDatabase(),source=clone(getSource());const previewSlots=await identitySlots(ctx(),settings,persona(),database);const selected=settings.story.outputConfigId;if(selected){const row=database?.state?.tables?.T_PREF_OUTPUT_CONFIG?.[selected];if(!row)fail('OUTPUT_CONFIGURATION_MISSING','当前输出配置记录已不存在');previewSlots.tisya_output_configuration=JSON.stringify(row.values);}if(key!==chatKey(ctx())||settings.revision!==config.read().revision)fail('PREPARATION_STALE','读取偏好期间会话或配置已变化');return {source,slots:previewSlots,database};},listTurnReviews,describeTurnReview,checkTurnReview,confirmTurn,rewindTurnReviews,reviewAction,generateBackfill,previewReviewHistory,readDatabase,peekDatabase,readDatabaseSnapshot,commitDatabase,ensureDatabase,ensureBound,createPhoneDatabaseBridge,createConditionDatabaseBridge,setRevision:value=>{pendingRevision=value?clone(value):null;},setUserRevision:value=>{pendingUserRevision=value?clone(value):null;},async defer(){nativeSources?.end();const saved=controller.candidatePending(true);controller.generating.delete(chatKey(ctx()));prepared=null;await saved;},async acceptCandidate(){await controller.candidatePending(false);return sync();},generationValues:()=>generationValues(ctx()),controller,initialize,historyLimit,historyInput,sync,before,payloadReady,event,mutate,latest:()=>latest,contextPreview:()=>contextRecorder.preview(),contextSnapshots:()=>contextRecorder.snapshots(),isBusy:()=>busy,accepted:()=>prepared?.accepted===true,clear:()=>{contextRecorder.invalidate();nativeSources?.end();prepared=null;},entriesLoaded,activated:entries=>{if(prepared&&!prepared.passthrough)nativeSources?.activated(entries);},afterCombine:data=>{if(prepared&&!prepared.passthrough)return nativeSources?.afterCombine(data);},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},async import(value){assertIdle();await controller.attach(value.state?value:{state:value});await sync();},export:()=>controller.current()};
}
