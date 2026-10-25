import {createWorldbookWorkspace,createIndexedDBWorkspaceJournal} from './worldbook-workspace.mjs';
import {createBookManager,BookError} from './books.mjs';
import {createTauriWorldbookTransport,loadWorldbookHostModules,createFloorIdentityManager,projectRetained,sha256Utf16} from './host-runtime.mjs';

export const BOOK_POINTER_KEY='tisya_v3_books';
export const GLOBAL_BOOK_KEY='tisya_v3_global';
const ID='tisya_w24',SOURCES='tisya_v3_host';
const copy=value=>value==null?value:structuredClone(value);
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const check=(ok,code,message,details)=>{if(!ok)throw new BookError(code,message,details);};
const need=(name,fn)=>{check(typeof fn==='function','CAPABILITY_UNAVAILABLE',`Native capability unavailable: ${name}`,{capability:name});return fn;};

/** Same character scope as TT 2.4 collectCharacterWorldsToSearch/getCharaFilename. */
export function characterWorldbookNames(context,worldInfo,avatar){
  const character=context?.characters?.[context.characterId];
  check(character&&typeof character.avatar==='string'&&character.avatar===avatar,'CHARACTER_SOURCE_CHANGED','当前角色卡已变化，请重新读取初始化来源');
  check(worldInfo&&typeof worldInfo==='object'&&!Array.isArray(worldInfo),'CHARACTER_BOOK_BINDINGS','宿主角色世界书绑定不可读取');
  const primary=character.data?.extensions?.world,fileName=avatar.replace(/\.[^/.]+$/,'');
  const extra=worldInfo.charLore?.find(row=>row.name===fileName)?.extraBooks??[];
  check(Array.isArray(extra)&&extra.every(name=>typeof name==='string'),'CHARACTER_BOOK_BINDINGS','角色配套世界书列表格式无效');
  check(primary===undefined||primary===null||typeof primary==='string','CHARACTER_BOOK_BINDINGS','角色主世界书名称格式无效');
  return [...new Set([primary,...extra].filter(name=>typeof name==='string'&&name.length>0))];
}

/** Uses the exact 2.4.0 host exports. Inject native modules only for tests or an already-loaded host. */
export async function loadBookHostModules(){
  const [{worldInfo,persistence},script,personas,groups]=await Promise.all([
    loadWorldbookHostModules(),import('/script.js'),import('/scripts/personas.js'),import('/scripts/group-chats.js'),
  ]);return {worldInfo,persistence,script,personas,groups};
}

export async function createNativeBookHost({target=globalThis,getContext,getHost=()=>null,getPlayerId,
  readConfiguration=()=>({}),assertIdle,isBusy,invalidate,readDraft,persistDraft,native:providedNative,enableWorkspace=false,workspaceJournal,durableCache,durableOwner,getWorkspaceDependencies=()=>[],refreshWorkspaceSources=null}={}){
  need('getContext',getContext);need('getPlayerId',getPlayerId);need('getHost',getHost);
  const native=providedNative??await loadBookHostModules(),{worldInfo,persistence,script,personas,groups}=native;
  const api=target.__TAURITAVERN__?.api?.chat;need('chat.current.handle',api?.current?.handle);need('chat.open',api?.open);
  const fetcher=need('fetch',target.fetch).bind(target);let disposed=false,epoch=0,lastChat=null,lastMetadata=null,lastAccount=null,preparing=null,core,bindingSnapshot=null,bindingRead=null,bindingEpoch=0,bindingScopeEpoch=0,bindingReadVersion=0;
  function raw(){check(!disposed,'BOOK_HOST_DISPOSED','Book host is disposed');return getContext();}
  const hasChat=()=>{const c=raw();return !!c?.chatId&&Array.isArray(c.chat)&&c.chatMetadata&&typeof c.chatMetadata==='object';};
  const handle=()=>api.current.handle();
  function scopeGuard(c,h){const live=raw();check(live.chat===c.chat&&live.chatMetadata===c.chatMetadata&&same(handle().ref,h.ref),'CHAT_CHANGED','Native chat changed during persistence');}
  function headers(){const c=raw();return need('getRequestHeaders',c.getRequestHeaders)();}
  async function settings(){const response=await fetcher('/api/settings/get',{method:'POST',headers:headers(),body:'{}',cache:'no-cache'});check(response.ok,'SETTINGS_READ','Native settings could not be read',{status:response.status});return response.json();}
  function settingsValue(data){let value=data.settings;if(typeof value==='string'){try{value=JSON.parse(value);}catch{throw new BookError('SETTINGS_FORMAT','Saved native settings are not JSON');}}check(value&&typeof value==='object','SETTINGS_FORMAT','Native settings payload is unavailable');return value;}
  async function idle(){if(typeof assertIdle==='function')await assertIdle();else if(getHost()?.assertIdle)await getHost().assertIdle();else {check(typeof isBusy==='function'||typeof script?.isGenerating==='function','CAPABILITY_UNAVAILABLE','Native generation guard is unavailable');}
    if(typeof isBusy==='function')check(!isBusy(),'BUSY','A task is still running');if(typeof script?.isGenerating==='function')check(!script.isGenerating(),'BUSY','Native generation is still running');
  }
  function locator(){const c=raw(),ref=copy(handle().ref);return {format:'tisya.chat-locator/1',ref,...ref.kind==='group'?{groupId:c.groupId}:{avatar:c.characters?.[c.characterId]?.avatar}};}
  function currentDraft(){if(typeof readDraft==='function')return copy(readDraft());const value=target.document?.getElementById?.('send_textarea')?.value;return typeof value==='string'&&value.length?value:null;}
  function context(){const c=raw(),account=durableOwner?.()?.account??null;if(c.chat!==lastChat||c.chatMetadata!==lastMetadata||account!==lastAccount){epoch++;lastChat=c.chat;lastMetadata=c.chatMetadata;lastAccount=account;}const identity=c.chatMetadata?.[ID];
    return {owner:identity?{chatId:identity.chatId,branchId:identity.branchId}:null,playerId:getPlayerId(),epoch,draft:currentDraft(),...hasChat()?{locator:locator()}:{}};
  }
  // This is a working-copy lease, never durable authority. Local fields and
  // events guard every reuse; sends and physical writes explicitly request fresh.
  function captureBindingLocal(){
    const c=raw(),chat=hasChat(),h=chat?handle():null,version=bindingEpoch,scopeVersion=bindingScopeEpoch,account=durableOwner?.()?.account??null,player=getPlayerId(),owner=copy(context().owner),global=copy(c.extensionSettings?.[GLOBAL_BOOK_KEY]??null),pointer=copy(c.chatMetadata?.[BOOK_POINTER_KEY]??null),avatar=c.characters?.[c.characterId]?.avatar??null;
    const guardFields=()=>{
      const live=raw();check(live.chat===c.chat&&live.chatMetadata===c.chatMetadata&&(!h||same(handle().ref,h.ref)),'CHAT_CHANGED','Native chat changed during binding snapshot');
      const changed=[];
      if((durableOwner?.()?.account??null)!==account)changed.push('account');
      if(getPlayerId()!==player)changed.push('player');
      if(!same(context().owner,owner))changed.push('owner');
      if(!same(live.extensionSettings?.[GLOBAL_BOOK_KEY]??null,global))changed.push('globalPointer');
      if(!same(live.chatMetadata?.[BOOK_POINTER_KEY]??null,pointer))changed.push('archivePointer');
      if((live.characters?.[live.characterId]?.avatar??null)!==avatar)changed.push('avatar');
      check(!changed.length,'BINDING_SNAPSHOT_CHANGED','宿主绑定或配置在工作区读取期间变化，请重新核对',{changed});
    };
    return {c,h,owner,guard(){guardFields();check(bindingEpoch===version,'BINDING_SNAPSHOT_CHANGED','宿主绑定或配置在工作区读取期间变化，请重新核对',{changed:['event'],capturedEpoch:version,currentEpoch:bindingEpoch});},
      canRecapture(){if(bindingScopeEpoch!==scopeVersion||bindingEpoch===version)return false;guardFields();return true;}};
  }
  async function readBindingSnapshot({fresh=false}={}){
    if(!fresh&&bindingSnapshot){try{bindingSnapshot.guard();return bindingSnapshot;}catch{bindingSnapshot=null;}}
    if(!fresh&&bindingRead){const current=await bindingRead;current.guard();return current;}
    const readVersion=++bindingReadVersion;
    const job=(async()=>{
      // Opening a chat can finish while its settings-save notification is still
      // queued. Reacquire only this read batch, never a business operation, and
      // only when all scope fields stayed exact and no scope/card event occurred.
      for(let attempt=0;attempt<3;attempt++){
        const local=captureBindingLocal();
        const [saved,data]=await Promise.all([settings(),local.h?local.h.metadata.get():null]);
        try{local.guard();}catch(error){let recapture=false;if(attempt<2&&error.code==='BINDING_SNAPSHOT_CHANGED')try{recapture=local.canRecapture();}catch{}if(recapture)continue;throw error;}
        const global=copy(settingsValue(saved).extension_settings?.[GLOBAL_BOOK_KEY]??null),pointer=copy(data?.[BOOK_POINTER_KEY]??null);
        if(local.owner)check(data?.[ID]?.chatId===local.owner.chatId&&data?.[ID]?.branchId===local.owner.branchId,'BINDING_SNAPSHOT_OWNER','Saved native metadata belongs to another chat or branch');
        // Only these actual fresh reads can seed the reusable snapshot. Ordinary
        // save() return values and serialized caches never enter this path.
        const snapshot=Object.freeze({global:freeze(global),pointer:freeze(pointer),guard(){local.guard();check(same(raw().extensionSettings?.[GLOBAL_BOOK_KEY]??null,global)&&same(raw().chatMetadata?.[BOOK_POINTER_KEY]??null,pointer),'BINDING_SNAPSHOT_CHANGED','工作区绑定与宿主持久化值不一致，请重新载入');}});if(readVersion===bindingReadVersion)bindingSnapshot=snapshot;return snapshot;
      }
    })();bindingRead=job;
    try{return await job;}finally{if(bindingRead===job)bindingRead=null;}
  }
  async function prepare(){
    if(!hasChat())return null;if(preparing)return preparing;
    preparing=(async()=>{const c=raw(),h=handle(),stableId=await h.stableId();scopeGuard(c,h);const current=c.chatMetadata?.[ID];
      // Binding reads need the stable owner, not a second floor-marker writer.
      // The active host owns floor reconciliation, including pending deletions.
      if(current?.schema==='tisya.floor-identities/1'&&current.chatId&&current.branchId===stableId){context();return {chatId:current.chatId,branchId:current.branchId};}
      const identity=createFloorIdentityManager({getContext:raw,getStableChatId:()=>h.stableId(),saveChat:()=>need('saveChat',c.saveChat)(),readMetadata:()=>h.metadata.get()});const state=await identity.sync();scopeGuard(c,h);context();return {chatId:state.chatId,branchId:state.branchId};})();
    try{return await preparing;}finally{preparing=null;}
  }
  const diskTransport=createTauriWorldbookTransport({worldInfo:{...worldInfo,discardWorldInfoDocument:persistence?.discardWorldInfoDocument},fetch:fetcher,getRequestHeaders:headers});
  const workspace=enableWorkspace?createWorldbookWorkspace({transport:diskTransport,journal:workspaceJournal??createIndexedDBWorkspaceJournal(target.indexedDB),getScope:()=>({...durableOwner?{account:durableOwner()?.account??null}:{},chat:raw().chatId??null,character:raw().characterId??null,group:raw().groupId??null,player:getPlayerId()??null,archive:canonical(raw().chatMetadata?.[BOOK_POINTER_KEY]??null),global:canonical(raw().extensionSettings?.[GLOBAL_BOOK_KEY]??null)}),durableCache,getDurableOwner:durableOwner,beforePersist:()=>readBindingSnapshot({fresh:true})}):null,transport=workspace??diskTransport,workspaceListeners=[];
  {const c=raw(),events=c.eventTypes??{},canObserve=c.eventSource?.on&&c.eventSource?.removeListener;
    if(workspace)check(canObserve&&events.WORLDINFO_UPDATED,'WORKSPACE_EVENTS','宿主缺少世界书保存事件，不能启用工作区');
    const observe=(event,fn)=>{if(event&&canObserve){c.eventSource.on(event,fn);workspaceListeners.push(()=>c.eventSource.removeListener(event,fn));}};
    const invalidateSnapshot=scopeChanged=>{bindingEpoch++;if(scopeChanged)bindingScopeEpoch++;bindingSnapshot=null;};
    for(const key of ['CHAT_CHANGED','CHAT_LOADED','PERSONA_CHANGED','PERSONA_UPDATED','PERSONA_DELETED','CHARACTER_EDITED','CHARACTER_DELETED','CHARACTER_RENAMED'])observe(events[key],()=>invalidateSnapshot(true));
    for(const key of ['SETTINGS_UPDATED','SETTINGS_LOADED'])observe(events[key],()=>invalidateSnapshot(false));
    if(workspace){observe(events.WORLDINFO_UPDATED,name=>{if(workspace.invalidate(name)&&workspace.status().active)getHost()?.cancel('世界书在工作区推进期间被编辑，请先同步核对');});for(const key of ['CHAT_CHANGED','PERSONA_CHANGED'])observe(events[key],()=>workspace.contextChanged?workspace.contextChanged():workspace.invalidateClean());}
  }

  async function readMetadata(){if(!hasChat())return null;const c=raw(),h=handle(),data=await h.metadata.get();scopeGuard(c,h);return copy(data?.[BOOK_POINTER_KEY]??null);}
  async function saveMetadata(pointer,{expected,operationId}){
    const c=raw(),h=handle(),prior=await h.metadata.get();scopeGuard(c,h);check(same(prior?.[BOOK_POINTER_KEY]??null,expected),'POINTER_CONFLICT','Native pointer changed before saving',{operationId});
    const memoryBefore=copy(c.chatMetadata[BOOK_POINTER_KEY]);check(same(memoryBefore??null,expected),'POINTER_CONFLICT','In-memory pointer differs from its persisted value');c.chatMetadata[BOOK_POINTER_KEY]=copy(pointer);
    try{await need('saveMetadata',c.saveMetadata??c.saveChat)();scopeGuard(c,h);const after=await h.metadata.get();scopeGuard(c,h);check(same(after?.[BOOK_POINTER_KEY],pointer),'POINTER_READBACK','Native pointer did not persist');}
    catch(error){let actual;try{actual=await h.metadata.get();}catch{}if(!same(actual?.[BOOK_POINTER_KEY],pointer)&&raw().chatMetadata===c.chatMetadata){if(memoryBefore===undefined)delete c.chatMetadata[BOOK_POINTER_KEY];else c.chatMetadata[BOOK_POINTER_KEY]=memoryBefore;}throw error;}
  }
  async function readGlobalMetadata(){
    const saved=settingsValue(await settings());
    const value=copy(saved.extension_settings?.[GLOBAL_BOOK_KEY]??null);
    if(value===null)delete raw().extensionSettings[GLOBAL_BOOK_KEY];else raw().extensionSettings[GLOBAL_BOOK_KEY]=copy(value);
    return value;
  }
  async function saveGlobalMetadata(pointer,{expected,operationId}){
    const before=await readGlobalMetadata();check(same(before,expected),'GLOBAL_CONFLICT','全局基点已变化，请重新载入',{operationId});
    const settingsObject=raw().extensionSettings;settingsObject[GLOBAL_BOOK_KEY]=copy(pointer);
    let failure;try{check(await need('saveSettings',script?.saveSettings)()===true,'GLOBAL_UNSAVED','宿主未确认全局基点保存');}catch(error){failure=error;}
    const actual=await readGlobalMetadata();if(!same(actual,pointer)){if(failure)throw failure;throw new BookError('GLOBAL_READBACK','全局基点保存读回不一致');}
  }
  async function nativeCheckpoint(){
    const c=raw(),current=context(),base={format:'tisya.native-checkpoint/1',owner:copy(current.owner),locator:locator()};
    if(readConfiguration().nativeBridge!==true)return {...base,mode:'none'};
    const runtime=target.Mvu,missing=['getMvuData','parseMessage','replaceMvuData'].filter(name=>typeof runtime?.[name]!=='function');
    check(missing.length===0,'NATIVE_MVU_UNAVAILABLE','当前角色卡或本会话已有原生 MVU 变量，需要先安装并启用酒馆助手，让该卡的 MVU 脚本完成初始化。原聊天和变量未修改。',{capabilities:missing.map(name=>'Mvu.'+name)});
    for(let floor=c.chat.length-1;floor>=0;floor--){const value=runtime.getMvuData({type:'message',message_id:floor});if(value?.stat_data&&typeof value.stat_data==='object')return {...base,mode:'mvu',floor,hashTarget:'stat_data',hash:await sha256Utf16(JSON.stringify(canonical(value.stat_data)))};}
    throw new BookError('NATIVE_CHECKPOINT_MISSING','当前角色卡需要原生 MVU 变量，但本会话尚无可读取的变量快照。请先完成原卡开场初始化；原聊天和变量未修改。');
  }
  async function saveCurrentBranch({archiveId,binding,draft,operationId}){
    const c=raw(),h=handle();check(same(context().owner,binding.owner),'ARCHIVE_OWNER','Current branch differs from the archive being saved');const before=await nativeCheckpoint();await need('saveChat',c.saveChat)();scopeGuard(c,h);
    const persisted=await h.metadata.get();scopeGuard(c,h);check(same(persisted?.[ID],c.chatMetadata[ID])&&same(persisted?.[BOOK_POINTER_KEY]??null,c.chatMetadata[BOOK_POINTER_KEY]??null),'BRANCH_READBACK','Current branch metadata did not persist');
    const after=await nativeCheckpoint();check(same(before,after),'NATIVE_CHANGED','Native snapshot changed while the branch was being saved');
    let draftReceipt;if(typeof persistDraft==='function')draftReceipt=await persistDraft({archiveId,owner:binding.owner,draft:copy(draft),operationId});else draftReceipt=await core.saveDraft({archiveId,owner:binding.owner,draft:copy(draft),operationId});
    check(draftReceipt?.saved===true,'DRAFT_UNSAVED','Current input draft did not persist');return {saved:true,draftSaved:true,nativeCheckpoint:after};
  }
  async function activateChat({owner,locator:targetLocator,operationId}){
    check(targetLocator?.format==='tisya.chat-locator/1'&&targetLocator.ref,'CHAT_LOCATOR_REQUIRED','Archive has no verified native chat locator',{operationId});const remote=api.open(targetLocator.ref),metadata=await remote.metadata.get(),stableId=await remote.stableId();
    check(stableId===owner.branchId&&metadata?.[ID]?.chatId===owner.chatId,'CHAT_LOCATOR_CHANGED','Native chat locator no longer matches the archive owner');
    if(targetLocator.ref.kind==='character'){check(typeof targetLocator.avatar==='string'&&targetLocator.avatar,'CHARACTER_LOCATOR','Character avatar identity is missing');await need('openCharacterChat',script?.openCharacterChat)(targetLocator.ref.fileName,targetLocator.avatar);}
    else if(targetLocator.ref.kind==='group'){check(targetLocator.groupId!==undefined&&targetLocator.groupId!==null,'GROUP_LOCATOR','Group identity is missing');await need('openGroupChat',groups?.openGroupChat)(targetLocator.groupId,targetLocator.ref.chatId);}
    else throw new BookError('CHAT_LOCATOR','Unsupported native chat locator');
    check(same(handle().ref,targetLocator.ref),'CHAT_ACTIVATION_READBACK','Native active chat differs from the requested locator');await prepare();check(same(context().owner,owner),'CHAT_ACTIVATION_READBACK','Native owner differs after chat activation');
  }
  async function activateUser({player,operationId}){
    const c=raw(),h=handle(),name=c.powerUserSettings?.personas?.[player.id];check(typeof name==='string','PLAYER_MISSING','Selected native persona does not exist',{id:player.id});
    need('initUserAvatar',personas?.initUserAvatar)(player.id);need('setUserName',script?.setUserName)(name,{toastPersonaNameChange:false});need('setPersonaDescription',personas?.setPersonaDescription)();
    check(getPlayerId()===player.id,'PLAYER_ACTIVATION_READBACK','Native persona activation did not match');check(await need('saveSettings',script?.saveSettings)()===true,'PLAYER_SETTINGS_UNSAVED','Native persona settings did not persist');scopeGuard(c,h);
    const saved=settingsValue(await settings());scopeGuard(c,h);check(saved.user_avatar===player.id&&saved.power_user?.personas?.[player.id]===name,'PLAYER_SETTINGS_READBACK','Saved native persona differs from its selection',{operationId});
    c.chatMetadata.persona=player.id;await need('saveChat',c.saveChat)();scopeGuard(c,h);check((await h.metadata.get())?.persona===player.id,'PLAYER_CHAT_READBACK','Chat persona lock did not persist');
  }
  async function restoreNative({checkpoint,owner}){check(same(context().owner,owner),'NATIVE_OWNER','Native restore belongs to another branch');
    // Opening the actual native chat loads its own message snapshots. Verify that
    // restored authority; do not replay a second numeric copy from worldbooks.
    check(same(await nativeCheckpoint(),checkpoint),'NATIVE_READBACK','Selected native chat snapshot differs from the archive checkpoint');
  }
  async function projectLedger({state,owner,locator:storedLocator}){
    let metadata;if(same(context().owner,owner))metadata=raw().chatMetadata;else {check(storedLocator?.ref,'CHAT_LOCATOR_REQUIRED','Cannot project a foreign archive without its native chat locator');const remote=api.open(storedLocator.ref);metadata=await remote.metadata.get();check(await remote.stableId()===owner.branchId&&metadata?.[ID]?.chatId===owner.chatId,'LEDGER_OWNER','Foreign ledger source chain belongs to another owner');}
    const active=metadata?.[SOURCES]?.active;if((state.commits??[]).some(commit=>commit.source!==null||commit.contextSource))check(Array.isArray(active),'SOURCE_CHAIN_MISSING','Retained source chain is required for the current ledger projection');
    return projectRetained(state,active??[]);
  }
  const callbacks={transport,listNames:async()=>{const data=await settings();check(Array.isArray(data.world_names),'BOOK_NAMES','Native worldbook inventory is unavailable');return [...data.world_names];},getContext:context,assertIdle:idle,readBindingSnapshot,readMetadata,saveMetadata,readGlobalMetadata,saveGlobalMetadata,saveCurrentBranch,activateChat,activateUser,restoreNative,readNative:nativeCheckpoint,projectLedger,requireChatLocator:true,
    invalidate:async event=>{if(typeof invalidate==='function')return invalidate(event);const host=getHost();need('V3 configurationChanged',host?.configurationChanged);return host.configurationChanged();},
  };
  core=createBookManager(callbacks);
  const prepared=fn=>async(...args)=>{await prepare();return fn(...args);};
  const manager=Object.freeze({...core,refreshWorkspaceSources:async runtime=>{if(!workspace)return false;try{const dependencies=[...getWorkspaceDependencies(),...(runtime?.workspaceDependencies??[])];workspace.consume(dependencies);await workspace.beginReads(dependencies);return false;}catch(error){if(!['WORKSPACE_CHANGED','WORKSPACE_DEPENDENCY'].includes(error.code)||typeof refreshWorkspaceSources!=='function')throw error;await workspace.ready();const state=workspace.status();check(!state.active&&!state.flushing&&!state.pendingBooks.length,'WORKSPACE_SYNC_REQUIRED','请先同步上次未完成的工作区，再重新载入资料');if(typeof getHost()?.assertSourceRefreshIdle==='function')await getHost().assertSourceRefreshIdle();else await idle();await refreshWorkspaceSources();await workspace.beginReads(getWorkspaceDependencies());return true;}},checkpointWorkspace:async runtime=>{const snapshot=await(runtime?.checkpointBinding?runtime.checkpointBinding():readBindingSnapshot({fresh:true}));snapshot.guard();workspace?.consume?.([...getWorkspaceDependencies(),...(runtime?.workspaceDependencies??[])]);await workspace?.checkpoint?.();snapshot.guard();return {verified:true};},runWorkspace:workspace?(fn,{dependencies=[]}={})=>workspace.run(fn,{dependencies:[...getWorkspaceDependencies(),...dependencies]}):undefined,syncWorkspace:async()=>{if(!workspace)return {saved:0};await workspace.ready();const state=workspace.status();if(state.active||state.flushing||state.pendingBooks.length)await idle();return workspace.sync();},workspaceState:()=>workspace?.status()??null,clearWorkspaceMemory:filter=>workspace?.clearMemory(filter),retryWorkspaceCache:()=>workspace?.retryCache(),create:request=>request.kind==='core'?core.create(request):prepared(core.create)(request),rename:prepared(core.rename),saveDefinition:prepared(core.saveDefinition),select:prepared(core.select),fork:prepared(core.fork),resume:prepared(core.resume),readRuntime:prepared(core.readRuntime),binding:prepared(core.binding),readConfiguration:core.readConfiguration,saveConfiguration:core.saveConfiguration,
    getLinkedWorldbookNames(avatar){return characterWorldbookNames(raw(),worldInfo.world_info,avatar);},
    async readWorldbook(name,{fresh=false}={}){const c=raw(),h=handle(),data=await(fresh?transport.readFresh:transport.readWorking??transport.readFresh).call(transport,name);scopeGuard(c,h);check(data,'CHARACTER_BOOK_MISSING','角色配套世界书不存在：'+name);return data;},
    async options(){const owner=await prepare(),c=raw(),id=getPlayerId(),players=Object.entries(c.powerUserSettings?.personas??{}).map(([id,name])=>({id,name})),defaultPreferenceOwner=id?{kind:'player',id}:null;const global=await core.globalBinding();return {owner,global,currentPlayer:players.find(p=>p.id===id)??(id?{id,name:c.name1??id}:null),players,defaultPreferenceOwner,accountPreferenceOwner:null,availablePreferenceOwners:defaultPreferenceOwner?[defaultPreferenceOwner]:[]};},
  });
  return Object.freeze({manager,prepare,callbacks,dispose(){for(const off of workspaceListeners)off();workspace?.dispose();disposed=true;}});
}
