import registryDefault from './config/registry.json';
import presetDefault from './config/task-preset.txt';
import {createOriginalStore} from './originals/original-store.mjs';
import {createWorldbookOriginalAdapter} from './host/worldbook-adapter.mjs';
import {createWorldbookTableStorage} from './host/table-storage.mjs';
import {createFloorIdentityManager,IDENTITY_NAMESPACE} from './host/floor-identities.mjs';
import {createMessageOriginalBridge} from './host/message-bridge.mjs';
import {createHostController} from './host/controller.mjs';
import {createPreflightRunner,createInitialState} from './runner/preflight-runner.mjs';
import {createWorldbookPreferenceStorage,createPreferenceOverlayStorage,createSharedPreferenceService} from './preferences/shared-store.mjs';
import {compileTask} from './config/task-compiler.mjs';

/** New-protocol composition root. All generation entrypoints share one awaited runner. */
export async function createFormSystem({transport,books,owner,getContext,getStableChatId,saveChat,readMetadata,requestA,writerB,resolveOutputFloor,invalidate,query,nativeRuntime,eventSource,initialRows=[],registry=registryDefault,preset=presetDefault,isPreferencesEnabled=()=>true,getPreferenceProjectionOptions=()=>({}),guard=()=>{}}){
 for(const [key,value]of Object.entries({getContext,getStableChatId,saveChat,readMetadata,requestA,writerB,resolveOutputFloor,invalidate,guard}))if(typeof value!=='function')throw Error(`Missing host binding: ${key}`);
 if(!books?.originals||!books?.tables||!books?.preferences||new Set(Object.values(books)).size!==3)throw Error('Three distinct private book names are required');
 if(!owner?.chatId||!owner?.branchId)throw Error('Stable chat/branch owner is required');
 owner=structuredClone(owner);
 if(await getStableChatId()!==owner.branchId)throw Error('Active branch does not match the requested form owner');
 const sessionStorage=createWorldbookTableStorage({transport,bookId:books.tables,initialState:createInitialState({registry,rows:initialRows}),owner});
 const preferenceStorage=createWorldbookPreferenceStorage({transport,bookId:books.preferences,registry});
 const storage=createPreferenceOverlayStorage({sessionStorage,preferenceStorage});
 const originals=createOriginalStore({adapter:createWorldbookOriginalAdapter({transport}),bookId:books.originals});
 const identities=createFloorIdentityManager({getContext,getStableChatId,saveChat,readMetadata});
 const bound=await identities.sync(),boundContext=getContext();
 if(bound.chatId!==owner.chatId||bound.branchId!==owner.branchId)throw Error('Host chat identity does not match the form owner');
 const liveOwner=()=>{
  const current=getContext(),identity=current.chatMetadata?.[IDENTITY_NAMESPACE];
  if(current.chat!==boundContext.chat||current.chatMetadata!==boundContext.chatMetadata||identity?.chatId!==owner.chatId||identity?.branchId!==owner.branchId)throw Error('Active chat or branch changed');
  return {chatId:identity.chatId,branchId:identity.branchId};
 };
 const projectionOptions=()=>{liveOwner();const options=getPreferenceProjectionOptions();if(options.context?.chatId&&options.context.chatId!==owner.chatId)throw Error('Preference projection belongs to another chat');return {...options,context:{...options.context,chatId:owner.chatId}};};
 const checkedEnabled=()=>{liveOwner();return isPreferencesEnabled();};
 const liveGuard=()=>{liveOwner();guard();};
 const sourceBridge=createMessageOriginalBridge({originals,identities,getContext,nativeRuntime});
 const preferences=createSharedPreferenceService({sessionStorage,preferenceStorage,getSessionOwner:liveOwner,isEnabled:checkedEnabled,getProjectionOptions:projectionOptions});
 const runner=createPreflightRunner({storage,bindArchiveParagraphs:originals.bindArchiveParagraphs,resolveEvidence:originals.resolveEvidence,sourceGuard:sourceBridge.sourceGuard,guard:liveGuard,
  native:{runtime:nativeRuntime,eventSource,context:getContext()},query,
  requestA:prepared=>requestA({messages:compileTask({preset,input:prepared}),requestKey:prepared.requestKey,stage:'preflight'}),
  writerB,acceptWriterOutput:sourceBridge.acceptWriterOutput({resolveFloor:resolveOutputFloor}),
 });
 const controller=createHostController({identities,invalidate,run:input=>runner.run({...input,originalScope:owner,preferencesEnabled:checkedEnabled(),preferenceProjectionOptions:projectionOptions()})});
 return Object.freeze({protocol:'tisya.table-advancement/v3',controller,runner,preferences,originals,sourceBridge,identities,sessionStorage,preferenceStorage,storage});
}
