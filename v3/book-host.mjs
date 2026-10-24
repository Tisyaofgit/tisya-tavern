import {createBookManager,BookError} from './books.mjs';
import {createTauriWorldbookTransport,createFloorIdentityManager,projectRetained,sha256Utf16} from './host-runtime.mjs';

export const BOOK_POINTER_KEY='tisya_v3_books';
const ID='tisya_w24',SOURCES='tisya_v3_host';
const copy=value=>value==null?value:structuredClone(value);
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const check=(ok,code,message,details)=>{if(!ok)throw new BookError(code,message,details);};
const need=(name,fn)=>{check(typeof fn==='function','CAPABILITY_UNAVAILABLE',`Native capability unavailable: ${name}`,{capability:name});return fn;};

/** Uses the exact 2.4.0 host exports. Inject native modules only for tests or an already-loaded host. */
export async function loadBookHostModules(){
  const [worldInfo,persistence,script,personas,groups]=await Promise.all([
    import('/scripts/world-info.js'),import('/scripts/world-info-persistence.js'),import('/script.js'),import('/scripts/personas.js'),import('/scripts/group-chats.js'),
  ]);return {worldInfo,persistence,script,personas,groups};
}

export async function createNativeBookHost({target=globalThis,getContext,getHost=()=>null,getPlayerId,
  readConfiguration=()=>({}),assertIdle,isBusy,invalidate,readDraft,persistDraft,native:providedNative}={}){
  need('getContext',getContext);need('getPlayerId',getPlayerId);need('getHost',getHost);
  const native=providedNative??await loadBookHostModules(),{worldInfo,persistence,script,personas,groups}=native;
  const api=target.__TAURITAVERN__?.api?.chat;need('chat.current.handle',api?.current?.handle);need('chat.open',api?.open);
  const fetcher=need('fetch',target.fetch).bind(target);let disposed=false,epoch=0,lastChat=null,lastMetadata=null,preparing=null,core;
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
  function context(){const c=raw();if(c.chat!==lastChat||c.chatMetadata!==lastMetadata){epoch++;lastChat=c.chat;lastMetadata=c.chatMetadata;}const identity=c.chatMetadata?.[ID];
    return {owner:identity?{chatId:identity.chatId,branchId:identity.branchId}:null,playerId:getPlayerId(),epoch,draft:currentDraft(),...hasChat()?{locator:locator()}:{}};
  }
  async function prepare(){
    if(!hasChat())return null;if(preparing)return preparing;
    preparing=(async()=>{const c=raw(),h=handle();const identity=createFloorIdentityManager({getContext:raw,getStableChatId:()=>h.stableId(),saveChat:()=>need('saveChat',c.saveChat)(),readMetadata:()=>h.metadata.get()});const state=await identity.sync();scopeGuard(c,h);context();return {chatId:state.chatId,branchId:state.branchId};})();
    try{return await preparing;}finally{preparing=null;}
  }
  const transport=createTauriWorldbookTransport({worldInfo:{...worldInfo,discardWorldInfoDocument:persistence?.discardWorldInfoDocument},fetch:fetcher,getRequestHeaders:headers});
  async function readMetadata(){if(!hasChat())return null;const c=raw(),h=handle(),data=await h.metadata.get();scopeGuard(c,h);return copy(data?.[BOOK_POINTER_KEY]??null);}
  async function saveMetadata(pointer,{expected,operationId}){
    const c=raw(),h=handle(),prior=await h.metadata.get();scopeGuard(c,h);check(same(prior?.[BOOK_POINTER_KEY]??null,expected),'POINTER_CONFLICT','Native pointer changed before saving',{operationId});
    const memoryBefore=copy(c.chatMetadata[BOOK_POINTER_KEY]);check(same(memoryBefore??null,expected),'POINTER_CONFLICT','In-memory pointer differs from its persisted value');c.chatMetadata[BOOK_POINTER_KEY]=copy(pointer);
    try{await need('saveChat',c.saveChat)();scopeGuard(c,h);const after=await h.metadata.get();scopeGuard(c,h);check(same(after?.[BOOK_POINTER_KEY],pointer),'POINTER_READBACK','Native pointer did not persist');}
    catch(error){let actual;try{actual=await h.metadata.get();}catch{}if(!same(actual?.[BOOK_POINTER_KEY],pointer)&&raw().chatMetadata===c.chatMetadata){if(memoryBefore===undefined)delete c.chatMetadata[BOOK_POINTER_KEY];else c.chatMetadata[BOOK_POINTER_KEY]=memoryBefore;}throw error;}
  }
  async function nativeCheckpoint(){
    const c=raw(),current=context(),base={format:'tisya.native-checkpoint/1',owner:copy(current.owner),locator:locator()};
    if(readConfiguration().nativeBridge!==true)return {...base,mode:'none'};
    const runtime=target.Mvu;need('Mvu.getMvuData',runtime?.getMvuData);need('Mvu.parseMessage',runtime?.parseMessage);need('Mvu.replaceMvuData',runtime?.replaceMvuData);
    for(let floor=c.chat.length-1;floor>=0;floor--){const value=runtime.getMvuData({type:'message',message_id:floor});if(value?.stat_data&&typeof value.stat_data==='object')return {...base,mode:'mvu',floor,hashTarget:'stat_data',hash:await sha256Utf16(JSON.stringify(canonical(value.stat_data)))};}
    throw new BookError('NATIVE_CHECKPOINT_MISSING','The active card has no native MVU snapshot');
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
  const callbacks={transport,listNames:async()=>{const data=await settings();check(Array.isArray(data.world_names),'BOOK_NAMES','Native worldbook inventory is unavailable');return [...data.world_names];},getContext:context,assertIdle:idle,readMetadata,saveMetadata,saveCurrentBranch,activateChat,activateUser,restoreNative,readNative:nativeCheckpoint,projectLedger,requireChatLocator:true,
    invalidate:async event=>{if(typeof invalidate==='function')return invalidate(event);const host=getHost();need('V3 configurationChanged',host?.configurationChanged);return host.configurationChanged();},
  };
  core=createBookManager(callbacks);
  const prepared=fn=>async(...args)=>{await prepare();return fn(...args);};
  const manager=Object.freeze({...core,create:prepared(core.create),rename:prepared(core.rename),saveDefinition:prepared(core.saveDefinition),select:prepared(core.select),fork:prepared(core.fork),resume:prepared(core.resume),readRuntime:prepared(core.readRuntime),binding:prepared(core.binding),readConfiguration:prepared(core.readConfiguration),saveConfiguration:prepared(core.saveConfiguration),
    async options(){const owner=await prepare(),c=raw(),id=getPlayerId(),players=Object.entries(c.powerUserSettings?.personas??{}).map(([id,name])=>({id,name})),defaultPreferenceOwner=id?{kind:'player',id}:null;return {owner,currentPlayer:players.find(p=>p.id===id)??(id?{id,name:c.name1??id}:null),players,defaultPreferenceOwner,accountPreferenceOwner:null,availablePreferenceOwners:defaultPreferenceOwner?[defaultPreferenceOwner]:[]};},
  });
  return Object.freeze({manager,prepare,callbacks,dispose(){disposed=true;}});
}
