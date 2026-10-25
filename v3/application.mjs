import {createHistoryImportService} from './history-import.mjs';
import {createIdentityCommand} from './identity-command.mjs';
import {installV3Host} from './host.mjs';
import {createProgressService} from './progress.mjs';
import {createReviewService} from './review.mjs';
import {createAssistantService} from './assistant.mjs';
import {createCapabilities} from './capabilities.mjs';
import {projectRetained,tableRegistry} from './host-runtime.mjs';
import {historySignature} from '../config/history-context.js';
import {resolveRuntimeConfiguration,readVerifiedNativeRules} from './configuration.mjs';
import {createV3ConditionService,createV3WorldbookScan} from './conditions.mjs';
import {createArchiveService} from './archive-service.mjs';
import {createJourneyService} from './journey.mjs';
import {createTagService} from './tags.mjs';
import {createInitializationSourceProvider} from './initialization-sources.mjs';
import {createOpeningService} from './opening-service.mjs';
import {createDesignProgress} from './design-progress.mjs';

const clone=structuredClone;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** One composition root for the native writer, books, review and all UI consumers. */
export async function createApplication({target=globalThis,getContext,store,configHost,books,
  interfaceConfig,communication,identityService=null,getPlayerId=()=>getContext().userAvatar??getContext().chatMetadata?.persona,routes={},dynamicRoutes=()=>[],capabilityState=()=>({}),runtimeStatus=()=>null,getChoices=()=>({}),onSaved=()=>{},onBusyChanged=null,onError,native,moods,
  readConfiguration:customConfiguration,readWorldbook,worldbookScan=true,configurationBook=null,assertIdle:externalIdle=()=>{}}={}) {
 let host,reviewOwner=null,reviewService=null,archiveService=null,bindingChanging=false;
 const binding=()=>host?.inspect().scope??null;
 const readConfiguration=customConfiguration??(()=>resolveRuntimeConfiguration({snapshot:store.readRuntime?store.readRuntime():store.read(),target,context:getContext(),playerId:getPlayerId()}));
 const hasBinding=async()=>{
  // Observers must not initialize a session against the intermediate pointer
  // while the explicit binding operation is still hydrating its configuration.
  if(bindingChanging||configurationBook?.read().ready===false)return false;
  // The initialized session already owns a verified binding. Its storage lease
  // still checks durable pointers on every fresh read; observers need not reload
  // the complete book binding just to decide whether that read is available.
  if(host?.inspect().scope)return true;
  const active=await books.binding();
  return !bindingChanging&&!!active.pointer;
 };
 const idle=()=>{externalIdle();host?.assertIdle();};
 async function getReview(){
  const s=await host.getSession();
  if(reviewOwner!==s.storage){reviewOwner=s.storage;reviewService=createReviewService({
   storage:s.storage,getScope:s.getScope,projectRetained,preferenceService:s.preferences,
   assertIdle:idle,sourceGuard:owner=>s.sourceGuard(owner)
  });}
  return reviewService;
 }
 const review={list:async args=>await hasBinding()?(await getReview()).list(args):[]};
 for(const method of ['inspectPreferences','beginEdit','previewEdit','saveEdit','preference','discardEdit','batchPreview','batchConfirm'])review[method]=async(...args)=>(await getReview())[method](...args);
 const progress=createProgressService({getBinding:binding,preferencesEnabled:()=>configurationBook?.read().ready===false?false:readConfiguration().preferencesEnabled!==false,readState:async()=>{if(!await hasBinding())return {requests:{}};const session=await host.getSession(),state=await session.storage.read(),preferences=await session.preferences.list();session.guard();return {...state,preferenceDrafts:preferences.drafts};}});
 host=await installV3Host({target,getContext,bookManager:books,readConfiguration,
  getRuntimePreset:stage=>configHost.runtimePresetFor(stage),getConfigurationSnapshot:()=>store.read(),resolveConnection:stage=>configHost.resolveConnectionFor(({communication:'communication',preflight:'tableArchive',archive:'tableArchive',preferences:'preferenceAnalysis',plan:'plotAdvance',writer:'main'}[stage]??stage)),
  selectedMaterials:task=>configHost.selectedMaterialsFor(task),readNativeRules:()=>readVerifiedNativeRules({snapshot:store.read(),context:getContext(),readWorldbook:typeof books.readWorldbook==='function'?(name,options)=>books.readWorldbook(name,options):readWorldbook}),progress,onError,native,moods,communication,onBusyChanged,
  onBindingChanged:configurationBook?()=>configurationBook.hydrate({initializeIfMissing:true}):undefined});
 async function assistantReview(){
  if(!await hasBinding())return {registry:tableRegistry,rows:[],history:[],chatStamp:historySignature(getContext()),storageReady:false,jobs:[]};
  const s=await host.getSession(),state=await s.storage.read();s.guard();const v=projectRetained(state,s.getScope().activeSourceKeys);
  return {registry:v.registry,rows:v.rows,history:[],chatStamp:historySignature(getContext()),storageReady:!!archiveService?.openAssistantArchiveQuery,jobs:[]};
 }
 const companion=host.createCompanion({executeCommand:identityService?createIdentityCommand(identityService):null,readMode:()=>readConfiguration().companionMode,writeMode:async mode=>{
  const snapshot=store.read(),data=clone(snapshot.data),world=data.worlds[snapshot.key];world.modes[world.mode].缇斯亚聊天模式=mode;
  await store.save(data,snapshot.revision,snapshot.key);host.configurationChanged();await onSaved();
 }});
 communication?.setCompanion?.(companion);
 const assistant=createAssistantService({store,getContext,getBinding:binding,getChoices,interfaceConfig,companion,
  review:assistantReview,assertIdle:idle,onSaved:async()=>{host.configurationChanged();await onSaved();},
  requestConfig:(input,{signal})=>configHost.request('tableAssistant',input,{signal,typedInput:input})
 });
 const bookFacade=new Proxy({...books},{get(object,key){const fn=object[key];if(typeof fn!=='function')return fn;
  if(key==='syncWorkspace')return async(...args)=>{const before=books.workspaceState?.(),result=await fn.apply(object,args);if(before?.pendingBooks?.length||configurationBook?.read().ready===false){if(configurationBook)await configurationBook.hydrate({initializeIfMissing:false});host.configurationChanged();}return result;};
  if(!['create','rename','select','resume','selectGlobalCore'].includes(key))return fn.bind(object);
  return async(...args)=>{idle();const switching=['select','resume','selectGlobalCore'].includes(key);if(switching&&configurationBook?.read().draft)throw Error('请先保存或放弃配置草稿，再切换资料');if(switching)bindingChanging=true;let value;try{value=await fn.apply(object,args);if(switching){if(configurationBook)await configurationBook.hydrate({initializeIfMissing:true});host.configurationChanged();}}finally{if(switching)bindingChanging=false;}if(switching)await progress.refresh();return value;};
 }});
 const sourceProvider=createInitializationSourceProvider({getContext,
  getLinkedWorldbookNames:typeof books.getLinkedWorldbookNames==='function'?avatar=>books.getLinkedWorldbookNames(avatar):undefined,
  readWorldbook:typeof books.readWorldbook==='function'?(name,options)=>books.readWorldbook(name,options):readWorldbook});
 const designProgress=createDesignProgress({getBinding:binding});
 archiveService=createArchiveService({getSession:()=>host.getSession(),getContext,sourceProvider,
  getConfigurationWorldKey:()=>store.read().key,assertIdle:idle,books,requestTask:(task,input,options)=>configHost.request(task,input,{...options,typedInput:input})});
 const historyImport=createHistoryImportService({getSession:()=>host.getSession(),getContext,assertIdle:idle,requestTask:(task,input,options)=>configHost.request(task,input,{...options,typedInput:input})});
 const opening=createOpeningService({getSession:()=>host.getSession(),getContext,sourceProvider,assertIdle:idle,requestTask:(task,input,options)=>configHost.request(task,input,{...options,typedInput:input})});
 const design=archiveService,designOwner=mode=>mode==='history'?historyImport:mode==='opening'?opening:null;
 archiveService={...design,inspectHistorySources:args=>historyImport.inspectSources(args),inspectOpening:()=>opening.inspect(),
  generateDesign:args=>designProgress.run({kind:args.mode},onProgress=>designOwner(args.mode)?.generate({...args,onProgress})??design.generateDesign({...args,onProgress})),
  previewDesign:(draft,options)=>designOwner(draft.mode)?.preview(draft,options)??design.previewDesign(draft,options),
  saveDesign:(draft,options={})=>designProgress.run({kind:draft.mode,operation:'save',reviewDraft:{...draft,changes:options.changes??draft.changes}},onProgress=>designOwner(draft.mode)?.save(draft,{...options,onProgress})??design.saveDesign(draft,{...options,onProgress})),
  designState:()=>designProgress.state(),discardDesign:()=>designProgress.discard(),
  cancelDesign:()=>{historyImport.cancel();opening.cancel();design.cancelDesign();},busy:()=>historyImport.busy()||opening.busy()||design.busy()};
 const conditions=createV3ConditionService({getSession:()=>host.getSession(),assertIdle:idle,getContext,getNative:()=>target.Mvu});
 const scanner=worldbookScan?createV3WorldbookScan({getContext,service:conditions,getConfigurationSnapshot:()=>store.read(),readWorldbook,prepareAuthorNote:()=>host.prepareAuthorNote(),onError}):null;
 if(scanner)host.setBeforeWriter(scanner.beforeWriter);
 const journey=createJourneyService({getSession:()=>host.getSession(),store,getContext,books,assertIdle:idle,onSaved:()=>host.configurationChanged()});
 const tags=configurationBook?createTagService({getSession:()=>host.getSession(),configurationBook,review,assertIdle:idle}):null;
 const capabilities=createCapabilities({routes,dynamicRoutes,capabilityState,runtimeStatus,progress,designProgress,review,assistant,books:bookFacade,archives:archiveService,forms:host,conditions,journey,tags,getBinding:binding,getSourceDiagnostics:()=>getContext()?.chatMetadata?.tisya_v3_host?.sourceDiagnostics??[]});
 return {host,progress,designProgress,review,assistant,companion,capabilities,books:bookFacade,archives:archiveService,conditions,scanner,journey,tags,configurationBook,
  getSession:()=>host.getSession(),assertIdle:idle,
  isBindingTransition:()=>bindingChanging||host.bindingTransition?.()===true,
  setArchiveService(value){archiveService=value;},
  openAssistantArchiveQuery(...args){if(!archiveService?.openAssistantArchiveQuery)throw Error('档案查询尚未就绪');return archiveService.openAssistantArchiveQuery(...args);},
  invalidateBinding(event){host.invalidateBinding(event);},
  configurationChanged(){host.configurationChanged();},
  dispose(){assistant.cancel();archiveService?.cancelDesign?.();scanner?.dispose();capabilities.dispose();designProgress.dispose();progress.dispose();host.dispose();}
 };
}
