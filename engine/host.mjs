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
import {reconcile,inversePatch} from './journal.mjs';
import {materials,initializeState} from './materials.mjs';
import {createConfiguration,materialNames,identitySlots,compilePrompts,compilePromptText,isMatrixPreset,applyCompiledMessages} from './config.mjs';
import {configureTags} from './tags.mjs';
import {clone,fail,asError} from './common.mjs';
import {prepareNativeMvu} from '../config/native-mvu.js';
const nativeWorld={context:{owner:'native',card:true},mode:'matrix',modes:{matrix:{nativeMvu:'on'}},tables:{nativeBridge:false}};
export function createMatrixHost({getContext,getSource,loadCatalog,storage=null,persistSettings,persistMetadata,persona=()=>'',getHistoryLimit=()=>50,projectToolTurns,getContractorMessages=async()=>[],expand=s=>s,assertIdle=()=>{},onError=()=>{}}){
 let storageOwner;storage??={get:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).get(...a),set:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).set(...a),commit:(...a)=>(storageOwner??=indexedStorage(globalThis.indexedDB)).commit(...a)};
 let pendingRevision=null,pendingUserRevision=null;let catalogPromise,prepared=null,latest=null,slots={},busy=false;const listeners=new Set();
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
 function register(){const c=getContext();if(!c.macros?.register&&!c.registerMacro)fail('HOST_MACROS','宿主缺少动态资料宏接口');for(const name of materialNames){const handler=()=>active()?slots[name]??'':'';if(c.macros?.register)c.macros.register(name,{handler,description:'缇斯亚新版动态资料'});else c.registerMacro(name,handler,'缇斯亚新版动态资料');}}
 function historyLimit(){const count=effectivePreferences(config.read()).parameters.history_messages??getHistoryLimit();if(!Number.isSafeInteger(count)||count<0)fail('HISTORY_COUNT','历史聊天条数须为非负整数');return count;}
 function historyInput(chat,type='normal'){if(['quiet','impersonate'].includes(type))return null;if(chat===ctx().chat)fail('HISTORY_COPY','宿主应传入历史发送副本');const count=prepared?.historyLimit??historyLimit(),report=limitNativeHistory(chat,count,type,projectToolTurns);if(prepared)prepared.historyWindow=report;latest={...latest,historyWindow:report};return report;}
 async function initialize(){assertIdle();const current=await controller.current();if(current)fail('ENGINE_EXISTS','本会话已有引擎状态，请导出备份或继续使用');const c=ctx();await controller.attach({state:initializeState(await catalog(),{session_ref:String(c.chatId),branch_ref:'main'})});await sync();}
 async function sync(options={}){busy=true;try{const r=await controller.run(options);if(r?.materials_error)fail('MATERIALS_ERROR','表单已保存，材料读取失败',{error:r.materials_error});slots={...(r?.materials??{})};const selected=config.read().story.outputConfigId;if(selected){const row=r?.bundle?.state?.tables?.T_PREF_OUTPUT_CONFIG?.[selected];if(!row)fail('OUTPUT_CONFIGURATION_MISSING','当前输出配置记录已不存在');slots.tisya_output_configuration=JSON.stringify(row.values);}const identities=await identitySlots(ctx(),config.read(),persona());slots.tisya_contractor_wish=identities.tisya_contractor_wish?identities.tisya_contractor_wish.replace('[/CONTRACTOR.WISH]',()=>[slots.tisya_contractor_wish,'[/CONTRACTOR.WISH]'].filter(Boolean).join('\n')):slots.tisya_contractor_wish?'[CONTRACTOR.WISH]\n'+slots.tisya_contractor_wish+'\n[/CONTRACTOR.WISH]':'';slots.tisya_user_identity=identities.tisya_user_identity;slots.tisya_user_name=identities.tisya_user_name;for(const [name,text]of Object.entries(resourcePromptSlots(config.read().resources??[])))slots[name]=[slots[name],text].filter(Boolean).join('\n');return r;}finally{busy=false;}}
 async function before(type,options={},dryRun=false){if(dryRun||['quiet','impersonate'].includes(type)){prepared={passthrough:true,accepted:true};return;}prepared=null;await controller.inject();if(!controller.enabled())fail('ENGINE_NOT_BOUND','请在新版配置的“表单与存档”中接入本会话，或导入已有新版状态');const key=chatKey(ctx()),settings=config.read();configureTags(settings.tags,settings.aliases);applyGeneration(ctx(),settings.generation);await controller.beginGeneration();try{await sync({preview:true,omitLastAssistant:['swipe','regenerate','continue'].includes(type)});const native=await prepareNativeMvu(ctx(),nativeWorld,type);if(native)slots.tisya_material_rule_material=[slots.tisya_material_rule_material,native.text].filter(Boolean).join('\n');if(chatKey(ctx())!==key)fail('CHAT_CHANGED','准备期间已切换会话');const user=ctx().chat?.[ctx().chat.length-(ctx().chat.at(-1)?.is_user?1:2)],rewrite=['swipe','regenerate'].includes(type)?userRevisionMaterial(user):null,directives=[...revisionMessages(pendingRevision),...userRevisionMessages(pendingUserRevision??rewrite)],directions=await getContractorMessages({prepare:true});prepared={native,type,historyLimit:historyLimit(),directives,directions,user,userText:user?.mes,key,revision:settings.revision,source:clone(getSource()),settings,slots:clone(slots),accepted:false};}catch(e){controller.generating.delete(key);throw e;}}
 // MVU copies identical variables to a newly sent user message asynchronously.
 // Compare script, contract and value bytes; a copied floor alone is not stale.
 async function payloadReady(payload){if(prepared?.passthrough)return payload;if(!prepared)fail('PREPARATION_MISSING','新版引擎未完成本轮资料准备');if(prepared.key!==chatKey(ctx())||prepared.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(!Array.isArray(payload.messages))fail('PAYLOAD_MESSAGES','宿主最终请求缺少消息列表');const captured=prepared;if(captured.historyLimit!==historyLimit())fail('HISTORY_STALE','历史可见条数已变化，请重新生成');const native=await prepareNativeMvu(ctx(),nativeWorld,captured.type);if(prepared!==captured||captured.key!==chatKey(ctx())||captured.revision!==config.read().revision)fail('PREPARATION_STALE','会话或配置在准备期间变化');if(!!native!==!!captured.native||native&&['signature','stateDigest','text'].some(k=>native[k]!==captured.native[k]))fail('NATIVE_MVU_STALE','原卡 MVU 来源或变量已变化，请重新生成');assertGeneration(ctx(),captured.settings.generation);const compiled=compilePrompts(prepared.source,prepared.settings,prepared.slots);payload.messages=contractorMessages(applyCompiledMessages(payload.messages,prepared.source,compiled,expand),ctx(),persona(),expand);const system=payload.messages.filter(m=>m.role==='system').flatMap(m=>typeof m.content==='string'?[m.content]:(m.content??[]).filter(p=>p.type==='text').map(p=>p.text)).join('\n');if(/\{\{tisya_[^{}]+\}\}/.test(system))fail('UNEXPANDED_MACRO','最终请求有未展开的缇斯亚资料宏');const identity=expand(compilePromptText(prepared.slots.tisya_user_identity??'',prepared.settings,prepared.slots));if(identity&&system.split(identity).length-1!==1)fail('USER_IDENTITY_COUNT','最终请求缺少或重复了绑定的user身份资料',{matches:system.split(identity).length-1});if([...system.matchAll(/(?:^|\n)\[REGISTRY\]\s*\n/g)].length!==1)fail('REGISTRY_COUNT','最终请求需要唯一新版输出合同');if(prepared.user&&prepared.user.mes!==prepared.userText)fail('USER_REVISION_STALE','用户改写依据在准备后变化');if(JSON.stringify(await getContractorMessages())!==JSON.stringify(prepared.directions))fail('TURN_DIRECTION_STALE','本轮场外要求在准备后变化，请重新生成');appendContractorMessages(payload.messages,prepared.directions);for(const m of prepared.directives)if(!payload.messages.some(x=>x.role===m.role&&x.content===m.content))payload.messages.push(m);prepared.accepted=true;latest={...latest,promptAudit:{status:'validated',messages:payload.messages.length,configurationRevision:prepared.revision,tags:clone(prepared.settings.tags)}};return payload;}
 async function event(name,...args){if(name==='CHAT_CHANGED'){prepared=null;configureTags(config.read().tags,config.read().aliases);configureRenderingResources(config.read().resources??[]);}if(!active())return;try{await controller.event(name,...args);if(['CHAT_CHANGED','GENERATION_ENDED','GENERATION_STOPPED'].includes(name))prepared=null;}catch(e){notify({status:e.message,error:asError(e)});onError(e);throw e;}}
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
  const ids=messages.map(m=>m.uid),edit={uid:'manual:'+crypto.randomUUID(),after_uid:ids.at(-1),previous_uids:ids.slice(0,-1),patch};
  const staged={...current,manual_edits:[...(current.manual_edits??[]),edit]};
  const next={...reconcile(staged,messages).bundle,local_revision:(bundle.local_revision??0)+1};
  if(!await storage.commit(id,bundle.local_revision??0,next))fail('SAVE_CONFLICT','另一页面已经更新此会话，请重开配置');
  if(chatKey(ctx())===key)await sync();
  return result;
 }

 return {active,register,config,catalog,setRevision:value=>{pendingRevision=value?clone(value):null;},setUserRevision:value=>{pendingUserRevision=value?clone(value):null;},async defer(){const saved=controller.candidatePending(true);controller.generating.delete(chatKey(ctx()));prepared=null;await saved;},async acceptCandidate(){await controller.candidatePending(false);return sync();},generationValues:()=>generationValues(ctx()),controller,initialize,historyLimit,historyInput,sync,before,payloadReady,event,mutate,latest:()=>latest,isBusy:()=>busy,accepted:()=>prepared?.accepted===true,clear:()=>{prepared=null;},entriesLoaded(data){const settings=config.read(),binding=settings.story.userBinding,libraryBooks=new Set([settings.coreBook??'基点书',binding?.book].filter(Boolean)),native=prepared?.native;for(const name of ['globalLore','characterLore','chatLore','personaLore'])if(Array.isArray(data[name]))data[name].splice(0,data[name].length,...data[name].filter(e=>!libraryBooks.has(e.world)&&!(native?.book&&e.world===native.book&&e.uid!=null&&native.materialEntries?.some(source=>source.uid!=null&&String(source.uid)===String(e.uid)&&source.content===String(e.content)))));},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},async import(value){assertIdle();await controller.attach(value.state?value:{state:value});await sync();},export:()=>controller.current()};
}
