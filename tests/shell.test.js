import {inspectNativeRender} from '../native-render-diagnostic.js';
import {createDefaultActivation} from '../default-activation.js';
import {describeChatMetadataFailure} from '../chat-persistence-error.js';
import {installBuiltInPreset} from '../builtin-preset.js';
import {createPhoneService,phoneSnapshot} from '../phone-core.mjs';
import {streamingMessageSource} from '../streaming-message.js';
import {createPhoneDatabaseStorage,readPhoneDatabaseProfile,decodePhoneDatabase,PHONE_DATABASE_SCHEMAS} from '../engine/phone-database.mjs';
import {createNativeBuiltinBooks} from '../engine/builtin-book-host.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {createExtensionPresentationService} from '../extension-host.mjs';
import {mountExtensionPreferences} from '../extension-preferences-ui.mjs';
import {EXTENSION_PREFERENCE_TABLE} from '../extension-preferences.mjs';
import {createPhonePresentationMedia} from '../phone-life/presentation-media.mjs';
import {finishMatrixGeneration} from '../engine/lifecycle.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {createPhoneTurnHost} from '../phone-turn-host.js';
import {chatKey} from '../engine/controller.mjs';
import {baseline as matrixBaseline} from '../engine/config.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {mountGenerationIdleGuard} from '../generation-idle-guard.js';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
import {createWorldSeedService,mountWorldSeed} from '../world-seed.js';
import {createNativePersonaSlotHost} from '../persona-slots.js';
import {mountAssistantApp} from '../assistant-app.js';
import {createPresetUpdateController,mountPresetUpdateControl,showPresetUpdateError} from '../builtin-preset-controls.js';
import {isOnePassPreset} from '../onepass/preset.mjs';
import {outputEnabled} from '../preset.js';
import {nativePanelContentProcessor} from '../native-panel-source.js';
import {resetNativePanelSources} from '../native-panels.js';
import {selectChatReady,notifySelectedChatContent,chatSelectionDiagnostic,chatSelectionSummary} from '../chat-selection.js';
import * as uiOperation from '../ui-operation.js';
import * as generationOperation from '../generation-operation.js';
import {initializePresetConnection} from '../preset-connection.js';
import {createGlobalFonts} from '../global-fonts.js';
import {mountThemeWorkbench} from '../theme-workbench.js';
import {messageCardCover} from '../message-cover.js';
import {createIdentityService} from '../user-identity-service.js';
import {mountIdentityPage} from './legacy-fixtures/user-identity-page.js';
import {createStoryIdentity,storyAvatar} from '../engine/identity.mjs';
import {mountMatrixIdentity,mountMatrixCreation,mountStoryResources} from '../engine/identity-ui.mjs';
import {excludeTemplateBookEntries,scanStoryReferenceBooks,readStoryReferenceBooks} from '../engine/template-book.mjs';
import {createPersonaGateway} from '../tables/persona.js';
import {createWorldbookConditionGate} from '../worldbook-conditions.js';
import * as panelSurfaces from '../panel-surface.js';
import {mountSettingsHome} from '../settings-home.js';
import * as settingsNavigation from '../settings-navigation.js';
import * as userRevision from '../user-revision.js';
import * as homeDirectory from '../home-directory.js';
import {mountHome} from '../home.js';
import * as chatLoading from '../chat-loading.js';
import * as messageCache from '../message-cache.js';
import {mountMessageAppearance as realMessageAppearance} from '../message-ui.js';
import * as paragraphActions from '../paragraph-actions.js';
import * as fullscreen from '../fullscreen.js';
import * as communication from '../communication.js';
import * as revision from '../revision.js';
import * as revisionUI from '../revision-ui.js';
import {createTextTransport} from '../config/text-transport.js';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';
import {defaultRegistry} from '../tables/schema.js';
import {interfaceSnapshot,validateInterfaceSettings} from '../tables/interface-config.js';
import {createNativeConfiguration,createRegexGate} from '../tables/native-config.js';
import {createTableService} from '../tables/service.js';
import {createConditionService} from '../tables/condition-service.js';
import {createNativeVectors} from '../tables/vectors.js';
import {mountInputShortcuts} from '../input-shortcuts.js';
import {createEditToolbarPlacement} from '../edit-toolbar.js';
import {createNativeDisplayPipeline} from '../native-display.js';
import * as replyFormats from '../reply-formats.js';import * as configCore from '../config/core.js';import * as configHost from '../config/host.js';import * as configPanel from './legacy-fixtures/config-panel.js';import * as configContracts from '../config/contracts.js';import * as nativeBeauty from '../native-beauty.js';
import * as liveSettings from '../narrative-bridge.js';import * as appearanceSettings from '../appearance-settings.js';import {mountSettingsApp} from '../settings-app.js';
import * as displaySettings from '../display-settings.js';
import {HEART_DIRECTIONS,HEART_ROWS} from '../preset-hearts.js';import * as actions from '../actions.js';import {registerPresetProtocol} from '../preset.js';import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Window} from 'happy-dom';import {IDBFactory} from 'fake-indexeddb';import * as model from '../model.js';import * as layout from '../layout.js';import * as icons from '../icons.js';import * as navigation from '../navigation.js';import * as reader from '../reader.js';import * as notebook from '../notebook.js';import {fixture as replyFixture} from './fixtures/journey-r4.cjs';
const matrixCatalog=JSON.parse(await readFile(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const phoneSeed=JSON.parse(await readFile(new URL('../phone-seed.json',import.meta.url),'utf8'));
const fixtureWindows=new Set();
test.afterEach(async()=>{
 for(const window of fixtureWindows){
  window.dispatchEvent(new window.Event('pagehide'));
  window.assistantPanel?.dispose();
  await window.happyDOM.close();
 }
 fixtureWindows.clear();
});
async function setup({generateWait,optionsWait,idleWait=async()=>{},welcome=false,bookHelper,nativeIdentity,persistSettings,realMessages=false,mediaStorage=false,nativePresets=false,chatLoaded=true,configureContext=null,presetInstaller=async()=>({name:'Tisya',status:'current',active:true})}={}){const w=new Window({url:'http://localhost'});fixtureWindows.add(w);w.document.body.innerHTML='<div id="top-settings-holder">'+Array.from({length:9},(_,i)=>`<div id="${['ai-config-button','sys-settings-button','advanced-formatting-button','WI-SP-button','user-settings-button','backgrounds-button','extensions-settings-button','persona-management-button','rightNavHolder'][i]}" class="drawer"><div class="drawer-toggle"><i class="drawer-icon" title="${i}"></i></div><div class="drawer-content closedDrawer"></div></div>`).join('')+'</div><div id="sheld"><div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">正文</div><div class="mes_buttons"><button class="mes_edit">edit</button><button class="mes_create_branch">branch</button><div class="extraMesButtonsHint"></div></div></div></div></div></div><div id="nonQRFormItems"><div id="leftSendForm"></div><textarea id="send_textarea"></textarea><div id="rightSendForm"></div></div><button id="option_regenerate"></button><button id="options_button"></button>';
if(mediaStorage||nativePresets)Object.defineProperty(w,'indexedDB',{value:new IDBFactory(),configurable:true,writable:true});if(realMessages)w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.structuredClone=structuredClone;const nativeBooks=new Map(),matrixStorage=indexedStorage(new IDBFactory()),worldInfoNative={world_names:[],async flushWorldInfoSaves(){},async updateWorldInfoList(){this.world_names=[...nativeBooks.keys()];},async saveWorldInfo(name,data){nativeBooks.set(name,structuredClone(data));await this.updateWorldInfoList();return true;}};w.fetch=async(url,options)=>String(url).endsWith('/engine/catalog.json')?{ok:true,json:async()=>structuredClone(matrixCatalog)}:String(url)==='/api/worldinfo/get'?{ok:true,json:async()=>structuredClone(nativeBooks.get(JSON.parse(options.body).name))}:String(url).endsWith('/phone-seed.json')?{ok:true,json:async()=>structuredClone(phoneSeed)}:{ok:true,json:async()=>[{file_name:JSON.parse(options.body).avatar_url+'.jsonl',mes:'已保存正文'}]};const macros=new Map(),expand=s=>String(s).replace(/\{\{([^{}]+)\}\}/g,(raw,name)=>macros.has(name)?macros.get(name)():raw);const errors=[],handlers={},formatCalls=[],listeners=new Map();const on=(e,f)=>{if(!listeners.has(e))listeners.set(e,[]);listeners.get(e).push(f);handlers[e]=(...args)=>Promise.all([...(listeners.get(e)??[])].map(fn=>fn(...args)));};const ctx={registerMacro:(name,handler)=>macros.set(name,handler),unregisterMacro:name=>macros.delete(name),saveChat:async()=>true,chatId:'a',characterId:0,chatMetadata:{},chatCompletionSettings:{prompts:[]},chat:[{mes:'正文',is_user:false}],characters:[{avatar:'a.png',name:'同名',chat:'a',tags:['悬疑']},{avatar:'b.png',name:'同名',chat:'b',tags:['日常']}],extensionSettings:{},getRequestHeaders:()=>({}),getChatCompletionModel:()=> 'test-model',substituteParams:expand,getCurrentChatId:()=>ctx.chatId,getWorldInfoNames:()=>[...nativeBooks.keys()],loadWorldInfo:async name=>structuredClone(nativeBooks.get(name)),getPresetManager:()=>({getAllPresets:()=>[],getSelectedPresetName:()=>'',getCompletionPresetByName:()=>({})}),eventTypes:{WORLDINFO_ENTRIES_LOADED:'entries-loaded',WORLDINFO_SCAN_DONE:'scan-done',OAI_PRESET_CHANGED_AFTER:'preset-after',GENERATION_AFTER_COMMANDS:'before',CHAT_COMPLETION_SETTINGS_READY:'payload',APP_READY:'ready',CHAT_CHANGED:'chat',GENERATION_STARTED:'generation-start',GENERATION_ENDED:'generation-end',GENERATION_STOPPED:'generation-stop',MESSAGE_RECEIVED:'received',MESSAGE_UPDATED:'updated',MESSAGE_EDITED:'edited',MESSAGE_DELETED:'deleted',MESSAGE_SWIPED:'swiped'},eventSource:{on,removeListener:(e,f)=>{const list=listeners.get(e);if(list)listeners.set(e,list.filter(fn=>fn!==f));}},saveSettingsDebounced:()=>{},mainApi:'openai'};let generating=false,generated=[];w.fixture={inspectNativeRender,createDefaultActivation,describeChatMetadataFailure,streamingMessageSource,phoneSnapshot,createPhoneDatabaseStorage,readPhoneDatabaseProfile,decodePhoneDatabase,createNativeBuiltinBooks:options=>createNativeBuiltinBooks({...options,fetchImpl:(...args)=>w.fetch(...args)}),worldInfoNative,createMatrixCreator,mountMatrixCreation:(...args)=>{const panel=mountMatrixCreation(...args);w.creationPanel=panel;return panel;},createBookGateway:()=>createBookGateway(bookHelper?()=>bookHelper:undefined,()=>ctx),createExtensionPresentationService,mountExtensionPreferences:(...args)=>{const panel=mountExtensionPreferences(...args);w.preferencePanel=panel;return panel;},createPhonePresentationMedia,finishMatrixGeneration,createStoryIdentity:options=>createStoryIdentity({...options,...(bookHelper?{getHelper:()=>bookHelper}:{})}),storyAvatar,mountMatrixIdentity:(...args)=>{const panel=mountMatrixIdentity(...args);w.identityPanel=panel;return panel;},mountStoryResources,excludeTemplateBookEntries,scanStoryReferenceBooks,readStoryReferenceBooks,createPhoneService,createPhoneTurnHost,chatKey,createMatrixHost:options=>createMatrixHost({...options,storage:matrixStorage}),mountGenerationIdleGuard,mountMatrixConfiguration,createWorldSeedService,mountWorldSeed,createNativePersonaSlotHost,mountAssistantApp:(...args)=>{const panel=mountAssistantApp(...args);w.assistantPanel=panel;return panel;},personaNative:{},hostNative:{},isOnePassPreset,outputEnabled,nativePanelContentProcessor,resetNativePanelSources,chatSelectionDiagnostic,chatSelectionSummary,selectChatReady:options=>selectChatReady({...options,schedule:fn=>setTimeout(fn,16),cancel:clearTimeout}),notifySelectedChatContent,...uiOperation,...generationOperation,waitForGenerationIdle:idleWait,initializePresetConnection,createPresetUpdateController:options=>createPresetUpdateController({...options,install:nativePresets?installBuiltInPreset:presetInstaller}),mountPresetUpdateControl,showPresetUpdateError,createGlobalFonts,mountThemeWorkbench,messageCardCover,createIdentityService,mountIdentityPage,convertCharacterToPersona:async()=>true,saveMetadata:async()=>true,createPersonaGateway,createWorldbookConditionGate,projectToolTurns:undefined,user_avatar:'',initUserAvatar:()=>{},setPersonaDescription:()=>{},setUserName:()=>{},...panelSurfaces,mountSettingsHome,createCharacterGroupHost:()=>({open(target){w.characterGroupTarget=target;},identity:{connect(){}},bindings:{list:()=>[]},isBusy:()=>false,hasDraft:()=>false,dispose(){}}),installWorldbookOrder:()=>({clear(){},assertReady(){},available:true}),createWorldbookConsole:({openNative})=>({open(){w.worldbookOpened=(w.worldbookOpened??0)+1;},isBusy:()=>false,hasDraft:()=>false,dispose(){},openNative}),select_group_chats:(id)=>{w.groupEditorId=id;},...homeDirectory,deleteCharacter:async()=>false,deleteCharacterChatByName:async()=>{},closeCurrentChat:async()=>true,timestampToMoment:()=>({isValid:()=>false}),mountHome:(d,c,o)=>mountHome(d,c,{...o,mountArt:()=>({ready:Promise.resolve(),setPlaying(){},dispose(){}})}),getCharaFilename:()=>String(ctx.characters[ctx.characterId]?.avatar??'').replace(/\.png$/i,''),getThumbnailUrl:(type,file)=>`/thumbnail?type=${type}&file=${encodeURIComponent(file)}`,...chatLoading,power_user:{chat_truncation:100},isBoundedChatSurfaceView:()=>false,...messageCache,...paragraphActions,...fullscreen,...communication,...revision,...userRevision,...settingsNavigation,...revisionUI,swipe:async(_,direction,{forceMesId:id,forceSwipeId:index})=>{ctx.chat[id].swipe_id=index;ctx.chat[id].mes=ctx.chat[id].swipes[index];},deleteSwipe:async(index,id)=>{const m=ctx.chat[id];m.swipes.splice(index,1);m.swipe_id=Math.min(m.swipe_id,m.swipes.length-1);m.mes=m.swipes[m.swipe_id];return m.swipe_id;},messageEdit:async id=>{const n=w.document.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);n.innerHTML='<textarea class="edit_textarea"></textarea>';n.firstChild.value=ctx.chat[id].mes;},hydrateChatMessageSwipes:async()=>{},isMessageSwipeable:()=>true,getOverswipeBehavior:()=>'regenerate',branchChat:async()=>{},createTextTransport,createEditToolbarPlacement,interfaceSnapshot,validateInterfaceSettings,createNativeConfiguration,createRegexGate,isScopedScriptsAllowed:()=>true,allowScopedScripts:()=>{},isPresetScriptsAllowed:()=>true,allowPresetScripts:()=>{},createConditionService,createTableService:options=>(w.tableService=createTableService({...options,...(bookHelper?{books:createBookGateway(()=>bookHelper,()=>ctx)}:{})})),createNativeVectors,setExtensionPrompt:()=>{},mountInputShortcuts,createNativeDisplayPipeline:options=>(w.displayPipeline=createNativeDisplayPipeline(options)),RegexProvider:{instance:{get:()=>null}},substituteParams:expand,substituteParamsExtended:expand,...replyFormats,appendFileContent:async(m,s)=>s,yaml:{parse:JSON.parse},...configCore,...configHost,...configPanel,...configContracts,...nativeBeauty,loadAgentSystemSettings:async()=>({agentModeEnabled:false}),getRegexScripts:()=>[],getRegexedString:s=>s,proxies:[],createGenerationParameters:async(settings,model,type,messages)=>({generate_data:{messages,model,type}}),...displaySettings,...liveSettings,...appearanceSettings,mountSettingsApp,enqueueChatSave:task=>task(),persistedChatMetadata:()=>({...ctx.chatMetadata}),saveCharacterChatMetadata:async()=>{},saveGroupChatMetadata:async()=>{},emotionCatalog:()=>({ready:Promise.resolve(),names:()=>[]}),mountEmotionAtlas:()=>({dispose(){}}),saveSettings:async()=>persistSettings?persistSettings(ctx):true,HEART_DIRECTIONS,HEART_ROWS,...actions,sendTextareaMessage:async()=>{generated.push(['native-send',w.document.querySelector('#send_textarea').value]);w.document.querySelector('#send_textarea').value='';},registerPresetProtocol,promptManager:{getPromptOrderForCharacter:()=>ctx.chatCompletionSettings.prompt_order?.find(row=>row.character_id===100001)?.order??ctx.chatCompletionSettings.prompt_order?.[0]?.order??[]},mountMessageAppearance:realMessages?realMessageAppearance:()=>({sync(){},shouldRender:()=>true,revealHistory(){},dispose(){},restore(){},refresh(){}}),mountChatEffects:()=>({dispose(){},refresh(){}}),mountPet:(_,options)=>{w.phoneOptions=options;return {dispose(){},refresh(){},isVisible:()=>true,setVisible(){}}},getContext:()=>ctx,isGenerating:()=>generating,Generate:async(...args)=>{generated.push([...args,w.document.querySelector('#send_textarea').value]);await generateWait?.(...args);},getAgentGenerationOptions:async()=>await optionsWait?.()??({}),hasActiveAgentRun:()=>false,loadReadingFont:async()=>{},messageFormatting:(...args)=>{formatCalls.push(args);return args[0].replaceAll('&','&amp;').replaceAll('<','&lt;');},...model,...layout,...icons,...navigation,...reader,...notebook};w.toastr={error:t=>errors.push(t)};
if(nativeIdentity){w.indexedDB=new IDBFactory();const {active,...state}=structuredClone(nativeIdentity);Object.assign(ctx,state);ctx.powerUserSettings={chat_truncation:100,...ctx.powerUserSettings};Object.assign(w.fixture,{user_avatar:active??'',power_user:ctx.powerUserSettings,initUserAvatar:id=>{w.fixture.user_avatar=id;},setUserName:name=>{ctx.name1=name;},setPersonaDescription:()=>{ctx.powerUserSettings.persona_description=ctx.powerUserSettings.persona_descriptions?.[w.fixture.user_avatar]?.description??'';}});}
if(welcome){ctx.chatId=undefined;ctx.characterId=undefined;if(welcome!=='existing')ctx.characters=[];ctx.chat=[{mes:'欢迎',is_system:true}];}
let presetHost=null;
if(nativePresets){
 const select=w.document.createElement('select');select.id='tisya-test-native-presets';w.document.body.append(select);
 const other={name:'Other',prompts:[{identifier:'other',content:'User-owned Other prompt'}],prompt_order:[],extensions:{other:true}},disk=new Map([['Other',structuredClone(other)]]),list={presets:[structuredClone(other)],preset_names:{Other:0}};
 const option=w.document.createElement('option');option.value='0';option.textContent='Other';select.append(option);select.value='0';
 Object.assign(ctx.chatCompletionSettings,{preset_settings_openai:'Other',custom_model:'preserved-model',temp_openai:0.73,bind_preset_to_connection:true});
 ctx.eventTypes.OAI_PRESET_CHANGED_BEFORE='preset-before';let saves=0,selections=0;
 const emitNative=async(name,value)=>{for(const callback of [...(listeners.get(name)??[])])await callback(value);};
 const manager={select:{0:select,length:1},getAllPresets:()=>Object.keys(list.preset_names),getSelectedPresetName:()=>select.options[select.selectedIndex]?.text??'',getCompletionPresetByName:name=>list.presets[list.preset_names[name]],getPresetList:()=>list,findPreset:name=>String(list.preset_names[name]),
  async savePreset(name,value,{skipUpdate}={}){assert.equal(skipUpdate,true);saves++;disk.set(name,structuredClone(value));},
  selectPreset(index){selections++;select.value=String(index);void(async()=>{const name=manager.getSelectedPresetName(),preset=structuredClone(manager.getCompletionPresetByName(name)),mapping={prompts:['','prompts',false,false],prompt_order:['','prompt_order',false,false],temperature:['','temp_openai',false,false],custom_model:['','custom_model',false,true],extensions:['','extensions',false,false]};await emitNative('preset-before',{preset,presetName:name,settings:ctx.chatCompletionSettings,settingsToUpdate:mapping});for(const [source,[,target,,connection]]of Object.entries(mapping)){if(connection&&!ctx.chatCompletionSettings.bind_preset_to_connection)continue;if(preset[source]!==undefined)ctx.chatCompletionSettings[target]=preset[source];}ctx.chatCompletionSettings.preset_settings_openai=name;await emitNative('preset-after');})();}
 };
 ctx.getPresetManager=()=>manager;presetHost={manager,disk,list,saves:()=>saves,selections:()=>selections};
}
w.fixture.createHost=options=>{const host=configHost.createHost(options);w.configurationHost=host;return host;};
// Real native chat loading supplies integrity before CHAT_CHANGED. Tests may
// explicitly leave the loading placeholder intact with chatLoaded:false.
if(chatLoaded&&ctx.chatId&&!ctx.chatMetadata.integrity)ctx.chatMetadata.integrity='synthetic-loaded-'+ctx.chatId;
await configureContext?.(ctx,{window:w,nativeBooks,matrixStorage,emit:async(e,...args)=>{for(const fn of [...(listeners.get(e)??[])])await fn(...args);}});
let code=await readFile(new URL('../index.js',import.meta.url),'utf8');code=code.replaceAll('import.meta.url',JSON.stringify('http://localhost/scripts/extensions/third-party/tisya-tavern/index.js')).replace(/^import \{([^}]+)\} from '[^']+';/gm,(_,names)=>{const ids=names.split(',').map(name=>name.trim());if(nativeIdentity&&ids.includes('user_avatar'))return `let user_avatar=window.fixture.user_avatar;const initUserAvatar=id=>{window.fixture.initUserAvatar(id);user_avatar=window.fixture.user_avatar;};const {${ids.filter(name=>!['user_avatar','initUserAvatar'].includes(name)).join(',')}}=window.fixture;`;return `const {${names.replace(/\b([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\b/g,'$1:$2')}}=window.fixture;`;}).replace(/^import \* as ([A-Za-z_$][\w$]*) from '[^']+';/gm,(_,name)=>`const ${name}=window.fixture.${name};`).replace('export function registerChatSurface','function registerChatSurface');w.eval(code);await handlers.ready();await w.happyDOM.whenAsyncComplete();return {w,ctx,errors,generated,handlers,presetHost,nativeBooks,matrixStorage,expand,macros,emit:async(e,...args)=>{for(const fn of [...(listeners.get(e)??[])])await fn(...args);},formatCalls,setGenerating:v=>generating=v};}
function selectFixtureChat(f,id,chatFile){
 const c=f.ctx,changed=c.characterId!==id||c.chatId!==chatFile;c.characterId=id;c.chatId=chatFile;c.characters[id].chat=chatFile;
 if(changed){c.chatMetadata={integrity:'synthetic-loaded-'+chatFile};c.chat=structuredClone(c.chat);for(const message of c.chat)delete message.extra?.tisya_engine;}
}
async function waitForShell(predicate,label){const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>=deadline)assert.fail('Timed out: '+label);await new Promise(resolve=>setTimeout(resolve,5));}}
function nativeMatrixPayload(f,messages=[]){
 const source=f.ctx.chatCompletionSettings,order=source.prompt_order?.find(row=>row.character_id===100001)?.order??source.prompt_order?.[0]?.order??[];
 const enabled=new Set(order.filter(row=>row.enabled).map(row=>row.identifier));
 return {messages:[...source.prompts.filter(row=>!row.marker&&row.enabled!==false&&enabled.has(row.identifier)&&f.expand(row.content??'').trim()).map(row=>({role:row.role,content:f.expand(row.content)})),...messages],model:'test-model'};
}
async function click(f,a){let target=a==='menu'?f.w.document.querySelector('#tisya-menu-trigger'):f.w.document.querySelector(`[data-tisya-action="${a}"]`);if(!target&&['contacts','home'].includes(a)){await click(f,'menu');if(a==='contacts')await click(f,'home');target=f.w.document.querySelector(`[data-tisya-action="${a}"]`);}target.click();await f.w.happyDOM.whenAsyncComplete();}
test('APP_READY selects Tisya through the native preset lifecycle and attaches an enabled empty engine',async()=>{
 const f=await setup({nativePresets:true});try{
  assert.equal(f.presetHost.manager.getSelectedPresetName(),'Tisya');assert.equal(f.presetHost.saves(),1);assert.equal(f.presetHost.selections(),1);
  assert.deepEqual(f.presetHost.disk.get('Other'),{name:'Other',prompts:[{identifier:'other',content:'User-owned Other prompt'}],prompt_order:[],extensions:{other:true}});
  assert.equal(f.ctx.chatCompletionSettings.custom_model,'preserved-model');assert.equal(f.ctx.chatCompletionSettings.temp_openai,.73);assert.equal(f.ctx.chatCompletionSettings.bind_preset_to_connection,false);
  const metadata=f.ctx.chatMetadata.tisya_engine,bundle=await f.matrixStorage.get(metadata.chat_uid);
  assert.equal(metadata.enabled,true);assert.equal(metadata.owner_chat_key,chatKey(f.ctx));assert.equal(metadata.binding_pending,undefined);
  assert.equal(Object.keys(bundle.state.tables.T_CHAR_DOSSIER??{}).length,0);assert(Object.keys(bundle.state.schema).length>100);
  assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);assert.equal(f.ctx.chatMetadata['缇斯亚虚拟手机'],undefined);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('actual startup waits for native chat metadata before writing, then binds on CHAT_CHANGED',async()=>{
 let writes=0;
 const f=await setup({chatLoaded:false,configureContext:async(c,{window})=>{window.fixture.saveCharacterChatMetadata=async()=>{writes++;if(!c.chatMetadata.integrity)throw Object.assign(Error('integrity'),{code:'integrity'});};}});
 try{
  assert.equal(writes,0);assert.equal(f.ctx.chatMetadata.tisya_engine,undefined);assert.deepEqual(f.errors,[]);
  f.ctx.chatMetadata={integrity:'actual-load-completed'};f.ctx.chat=[{is_user:false,mes:'已载入的完整聊天'}];
  await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();
  assert.equal(writes,2);assert.equal(f.ctx.chatMetadata.tisya_engine.enabled,true);
  assert.equal(f.ctx.chatMetadata.integrity,'actual-load-completed');assert.equal(f.ctx.chat[0].mes,'已载入的完整聊天');assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('initial CHAT_CHANGED during slow builtin-book startup is observed before APP_READY finishes',async()=>{
 let emitted=false;
 const f=await setup({chatLoaded:false,configureContext:async(c,{window,emit})=>{
  const create=window.fixture.createNativeBuiltinBooks;
  window.fixture.createNativeBuiltinBooks=options=>{const books=create(options),update=books.update;return {...books,async update(...args){
   if(!emitted){emitted=true;c.chatMetadata={integrity:'loaded-during-books'};c.chat=[{is_user:false,mes:'载入在内置书更新期间完成'}];await emit('chat');}
   return update(...args);
  }};};
 }});
 try{assert.equal(emitted,true);assert.equal(f.ctx.chatMetadata.tisya_engine?.enabled,true);assert.equal(f.ctx.chatMetadata.integrity,'loaded-during-books');assert.deepEqual(f.errors,[]);}
 finally{await f.w.happyDOM.abort();}
});

test('native metadata integrity refusal stays blocked with actionable feedback and no successful engine state',async()=>{
 const native=Object.assign(Error('integrity'),{code:'integrity'});let writes=0;
 const f=await setup({configureContext:async(c,{window})=>{window.fixture.saveCharacterChatMetadata=async()=>{writes++;throw native;};}});
 try{
  assert.equal(writes,1);assert(f.errors.some(message=>/聊天保存冲突.*integrity/.test(message)));assert(!f.errors.includes('integrity'));
  assert.equal(f.ctx.chatMetadata.tisya_engine?.enabled,false);assert(f.ctx.chatMetadata.tisya_engine.binding_pending);
  assert.equal(await f.matrixStorage.get(f.ctx.chatMetadata.tisya_engine.chat_uid),undefined);
  assert.equal(f.ctx.chatMetadata.integrity,'synthetic-loaded-a');assert.equal(f.ctx.chat[0].mes,'正文');
 }finally{await f.w.happyDOM.abort();}
});

test('CHAT_CHANGED attaches each real chat once and reopening enables the original saved state without replacement',async()=>{
 const f=await setup({nativePresets:true});try{
  const a={chat:f.ctx.chat,metadata:f.ctx.chatMetadata},first=await f.w.Tisya.matrix.readDatabase();
  await f.w.Tisya.matrix.commitDatabase({contextKey:first.contextKey,expectedRevision:first.revision,operationId:'retain-default-binding',changes:[{tableId:'T_CHAR_DOSSIER',recordId:'retained-person',values:{name:'保留人物',manifest:'原来的设定'}}]});
  const id=a.metadata.tisya_engine.chat_uid,original=structuredClone((await f.matrixStorage.get(id)).state.tables);
  await f.emit('chat');assert.equal(f.ctx.chatMetadata.tisya_engine.chat_uid,id);
  f.ctx.chatId='second';f.ctx.characterId=1;f.ctx.characters[1].chat='second';f.ctx.chatMetadata={integrity:'synthetic-loaded-second'};f.ctx.chat=[{is_user:true,mes:'另一个故事'}];
  await f.emit('chat');const second=f.ctx.chatMetadata.tisya_engine;
  assert.equal(second.enabled,true,JSON.stringify(f.errors));assert.notEqual(second.chat_uid,id);assert.equal(second.owner_chat_key,chatKey(f.ctx));
  assert.equal((await f.w.Tisya.matrix.readDatabase()).state.tables.T_CHAR_DOSSIER?.['retained-person'],undefined);
  a.metadata.tisya_engine.enabled=false;f.ctx.chatId='a';f.ctx.characterId=0;f.ctx.chatMetadata=a.metadata;f.ctx.chat=a.chat;
  await f.emit('chat');assert.equal(f.ctx.chatMetadata.tisya_engine.chat_uid,id);assert.equal(f.ctx.chatMetadata.tisya_engine.enabled,true);
  assert.deepEqual((await f.matrixStorage.get(id)).state.tables,original);assert.equal(f.presetHost.selections(),1);
  assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('APP_READY reports an existing missing engine state and preserves its owner instead of resetting the chat',async()=>{
 const original={chat_uid:'missing-saved-engine',owner_chat_key:JSON.stringify(['character','0','a']),origin_chat_keys:[],enabled:true};
 const f=await setup({nativePresets:true,configureContext:ctx=>{ctx.chatMetadata.tisya_engine=structuredClone(original);}});try{
  assert.equal(f.presetHost.manager.getSelectedPresetName(),'Tisya');assert.deepEqual(f.ctx.chatMetadata.tisya_engine,original);
  assert.equal(await f.matrixStorage.get(original.chat_uid),undefined);assert(f.errors.some(message=>/保存的状态无法读取/.test(message)));
  assert(f.w.document.querySelector('#tisya-shell'));assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);
  await assert.rejects(f.emit('before','normal',{},false),/保存的状态无法读取/);
  assert.deepEqual(f.ctx.chatMetadata.tisya_engine,original);assert.equal(f.generated.length,0);
 }finally{await f.w.happyDOM.abort();}
});

test('W71 actual welcome sidebar opens idea-only creation without a card and retains the draft across navigation',async()=>{
 const f=await setup({welcome:true}),d=f.w.document,baselineErrors=[...f.errors];await click(f,'menu');await click(f,'new-world');assert(d.querySelector('[aria-label="我的世界点子"]'));d.querySelector('[aria-label="我的世界点子"]').value='天空群岛与失落的朋友';
 await click(f,'menu');await click(f,'assistant');assert.equal(d.querySelector('[aria-label="我的世界点子"]').value,'天空群岛与失落的朋友');assert.equal(f.ctx.chatId,undefined);assert.equal(f.ctx.characters.length,0);assert.deepEqual(f.errors,baselineErrors);await f.w.happyDOM.abort();
});
test('mounted preset recovery is available on both settings and native preset page and clears startup failure',async()=>{
 let fail=true,calls=0;
 const f=await setup({presetInstaller:async(_c,_d,options)=>{calls++;if(fail)throw Object.assign(Error('preset load mismatch'),{tisyaPresetUpdate:true});assert.equal(options.force,true);return {name:'Tisya',status:'updated',active:true};}});
 const chat=structuredClone(f.ctx.chat);assert.match(f.w.Tisya.builtinPreset().error,/preset load mismatch/);
 assert.equal(f.w.document.querySelectorAll('#ai-config-button .tisya-preset-update button').length,1);
 await click(f,'menu');await click(f,'preset-update');assert.match(f.w.document.querySelector('#tisya-preset-update-page').textContent,/preset load mismatch/);
 fail=false;f.w.document.querySelector('#tisya-preset-update-page button').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(calls,2);assert.equal(f.w.Tisya.builtinPreset().error,null);assert.equal(f.w.Tisya.builtinPreset().receipt.status,'updated');assert.deepEqual(f.ctx.chat,chat);assert.match(f.w.document.querySelector('#ai-config-button .tisya-preset-update').textContent,/已就绪/);await f.w.happyDOM.close();
});
test('new configuration replaces legacy panels and preserves unsaved tag edits',async()=>{
 const f=await setup(),d=f.w.document;try{await click(f,'menu');await click(f,'settings-app');const root=d.querySelector('#tisya-settings-app');assert(root.textContent.includes('缇斯亚 · 配置'));assert.equal(d.querySelector('.tisya-config'),null);[...root.querySelectorAll('button')].find(b=>b.textContent==='回复格式').click();await f.w.happyDOM.whenAsyncComplete();const input=[...root.querySelectorAll('label')].find(n=>n.textContent==='正文').querySelector('input');input.value='replyboby';input.dispatchEvent(new f.w.Event('input'));await click(f,'home');assert(input.isConnected);assert.equal(d.querySelectorAll('[role=dialog][aria-label="保存未完成的修改"]').length,1);[...d.querySelectorAll('.tisya-unsaved-prompt button')].find(b=>b.textContent==='保存并切换').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(input.isConnected,false);assert.equal(f.w.Tisya.configuration.read().tags.body,'replyboby');assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);}finally{await f.w.happyDOM.abort();}
});
test('phone and sidebar open the same read-only notes and public memory pages',async()=>{
 const f=await setup(),d=f.w.document;f.ctx.chat[0].mes=replyFixture();const source=f.ctx.chat[0].mes;
 assert.equal(f.w.phoneOptions.onOpenApp('手记'),true);await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-page h2').textContent,/会话手记/);assert.equal(d.querySelectorAll('.tisya-notebook-card').length,1);
 d.querySelector('.tisya-notebook-card button').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('[data-reader-tab="body"]').getAttribute('aria-pressed'),'true');assert.equal(d.querySelector('#tisya-overlay').open,true);
 await click(f,'close');await click(f,'memory');assert.match(d.querySelector('.tisya-page h2').textContent,/公开记忆/);assert.equal(f.ctx.chat[0].mes,source);assert.equal(f.generated.length,0);
 assert.equal(f.w.phoneOptions.onOpenApp('图鉴'),true);assert.equal(f.w.phoneOptions.onOpenApp('不存在'),false);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('native image and voice entries open existing settings without generating or rewriting controls',async()=>{
 const f=await setup(),d=f.w.document;
 for(const [name,selector]of [['生图','.sd_settings'],['语音','#tts_settings']]){
  const section=d.createElement('div');if(selector[0]==='.')section.className=selector.slice(1);else section.id=selector.slice(1);
  section.innerHTML='<div class="inline-drawer-toggle"><i class="inline-drawer-icon down"></i></div><input value="kept">';d.querySelector('#extensions-settings-button .drawer-content').append(section);let opened=0;section.querySelector('.inline-drawer-toggle').addEventListener('click',()=>opened++);
  assert.equal(f.w.phoneOptions.onOpenApp(name),true);await f.w.happyDOM.whenAsyncComplete();assert.equal(opened,1);assert.equal(section.querySelector('input').value,'kept');assert.equal(d.querySelector(selector),section);
 }
 assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('unavailable native phone actions report failure, never substitute another configuration',async()=>{
 const f=await setup();f.w.phoneOptions.onOpenApp('生图');await f.w.happyDOM.whenAsyncComplete();assert.match(f.errors.at(-1),/扩展尚未就绪/);assert.equal(f.generated.length,0);f.w.happyDOM.abort();
});
test('phone settings opens the new configuration; theme and protocol keep native surfaces',async()=>{
 const f=await setup(),d=f.w.document;try{f.w.phoneOptions.onOpenApp('设置');await f.w.happyDOM.whenAsyncComplete();await click(f,'settings-app');assert(d.querySelector('#tisya-settings-app').textContent.includes('缇斯亚 · 配置'));f.w.phoneOptions.onOpenApp('主题');await f.w.happyDOM.whenAsyncComplete();assert(d.querySelector('.tisya-theme-workbench'));let n=0;d.querySelector('#advanced-formatting-button .drawer-toggle').onclick=()=>n++;f.w.phoneOptions.onOpenApp('协议');await f.w.happyDOM.whenAsyncComplete();assert.equal(n,1);assert.equal(f.generated.length,0);}finally{await f.w.happyDOM.abort();}
});
test('theme workshop saves live effects without the removed configuration categories',async()=>{
 const f=await setup(),d=f.w.document;try{f.w.phoneOptions.onOpenApp('主题');await f.w.happyDOM.whenAsyncComplete();const root=d.querySelector('.tisya-theme-workbench').shadowRoot;root.querySelector('[data-page=effects]').click();await f.w.happyDOM.whenAsyncComplete();for(const [label,on]of [['落雪',true],['水纹',false]]){const i=root.querySelector('[aria-label="'+label+'"]');i.checked=on;i.onchange();}assert.equal(f.ctx.extensionSettings.缇斯亚界面,undefined);[...root.querySelectorAll('button')].find(b=>b.textContent==='保存').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.ctx.extensionSettings.缇斯亚界面.显示区块.extensions.落雪,true);assert.equal(f.ctx.extensionSettings.缇斯亚界面.显示区块.extensions.水纹,false);assert.match(root.querySelector('.status').textContent,/已保存/);}finally{await f.w.happyDOM.abort();}
});
test('editing or swiping invalidates an open reader and notebook without touching messages',async()=>{
 const f=await setup(),d=f.w.document;f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();d.querySelector('.tisya-notebook-card button').click();
 f.ctx.chat[0].mes='已更新';f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('.tisya-reader'),null);assert.match(d.querySelector('#tisya-overlay').textContent,/已变化/);assert.equal(d.querySelectorAll('.tisya-notebook-card').length,0);assert.match(d.querySelector('#tisya-notebook').textContent,/已变化/);assert.equal(f.ctx.chat[0].mes,'已更新');
 await click(f,'close');d.querySelector('.tisya-notebook-pager').lastElementChild.click();await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-notebook-card').textContent,/已更新/);
 f.ctx.chatId='b';f.handlers.chat();assert.equal(d.querySelector('#tisya-notebook'),null);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('notebook lookup works during a pending generation and tears down on return to native UI',async()=>{
 const stream=deferred(),f=await setup({generateWait:()=>stream.promise}),d=f.w.document;await click(f,'next');assert.equal(f.generated.length,1);
 f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelectorAll('.tisya-notebook-card').length,1);d.querySelector('.tisya-notebook-actions').children[1].click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('#tisya-notebook'),null);assert.equal(f.generated.length,1);
 stream.resolve();await new Promise(resolve=>setTimeout(resolve,0));f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();const old=d.querySelector('.tisya-notebook-card button');await click(f,'menu');await click(f,'disable');old.click();assert.equal(d.querySelector('#tisya-overlay'),null);assert.equal(f.w.phoneOptions.onOpenApp('手记'),false);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('contacts, labels, grouping and teardown keep native nodes',async()=>{const f=await setup();const native=f.w.document.querySelector('.mes_text');await click(f,'contacts');assert.equal(f.w.document.querySelectorAll('.tisya-contact').length,2);f.w.document.querySelector('.tisya-contact [data-tisya-action^="directory-menu:"]').click();await click(f,'directory-group');f.w.document.querySelector('#tisya-directory-group-name').value='世界卡';await click(f,'directory-group-save');assert.deepEqual(f.errors,[]);assert.equal(f.ctx.extensionSettings.缇斯亚界面.联系人分组['a.png'],'世界卡');await click(f,'menu');assert.match(f.w.document.querySelector('[data-tisya-action="drawer:backgrounds-button"]').textContent,/背景/);await click(f,'disable');assert.equal(f.w.document.querySelector('#tisya-shell'),null);assert.equal(f.w.document.querySelectorAll('.tisya-actions').length,0);assert.equal(f.w.document.querySelector('.mes_text'),native);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();});
test('continue requests next normal response, never submits composer draft',async()=>{const f=await setup();f.w.document.querySelector('#send_textarea').value='未发送草稿';await click(f,'next');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/草稿/);f.w.document.querySelector('#send_textarea').value='';await click(f,'next');assert.equal(f.generated.length,1);assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,true);f.w.happyDOM.abort();});
test('message menu refuses edited source and generation blocks editing',async()=>{const f=await setup();let edits=0;f.w.document.querySelector('.mes_edit').addEventListener('click',()=>edits++);await click(f,'more');f.ctx.chat[0].mes='变化';await click(f,'msg-edit');assert.equal(edits,0);assert.match(f.errors.at(-1),/变化/);f.ctx.chat[0].mes='正文';await click(f,'close');await click(f,'more');f.setGenerating(true);await click(f,'msg-edit');assert.equal(edits,0);assert.match(f.errors.at(-1),/生成/);f.w.happyDOM.abort();});

test('home lists every persisted chat and keeps same-name contacts separate',async()=>{const f=await setup();assert.equal(f.w.document.querySelectorAll('[data-home-chat]').length,2);assert.match(f.w.document.querySelector('[data-home-card="0"]').textContent,/a.png/);assert.match(f.w.document.querySelector('[data-home-card="1"]').textContent,/b.png/);f.w.fetch=async()=>{throw new Error('连接失败')};await click(f,'home');assert.equal(f.w.document.querySelectorAll('[role="alert"]').length,2);assert.equal(f.w.document.querySelectorAll('[data-home-chat]').length,0);f.w.happyDOM.abort();});

test('production home checks avatar identity and selects the exact persisted chat before closing',async()=>{
 const f=await setup(),d=f.w.document,calls=[];f.ctx.selectCharacterById=async(id,options)=>{calls.push({id,options});f.ctx.characterId=id;f.ctx.chatId=options.chatFile;};
 f.ctx.characters[0].avatar='replaced.png';d.querySelector('[data-home-card="0"]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(calls.length,0);assert.match(f.errors.at(-1),/角色列表已变化/);
 d.querySelector('[data-home-card="1"]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(calls.length,1);assert.equal(calls[0].id,1);assert.equal(calls[0].options.switchMenu,false);assert.equal(calls[0].options.chatFile,'b.png');assert.equal(d.querySelector('#tisya-shell').classList.contains('tisya-page-open'),false);assert(!d.querySelector('.tisya-home'),'home remains open');await f.w.happyDOM.abort();
});
test('homepage USER opens the unified identity page and retains a real native-controls exit',async()=>{
 const f=await setup({mediaStorage:true}),d=f.w.document;let opened=0;d.querySelector('#persona-management-button .drawer-toggle').onclick=()=>opened++;
 await click(f,'drawer:persona-management-button');await settleIdentityRoute(f);assert.equal(opened,0);assert(d.querySelector('#tisya-user-page').classList.contains('tisya-matrix-identity'));await pressRouteButton(f,d.querySelector('#tisya-user-page'),'原生身份管理');assert.equal(opened,1,JSON.stringify({errors:f.errors,identity:f.w.identityPanel?.state?.(),status:d.querySelector('.tisya-identity-status')?.textContent}));await click(f,'home');
 d.querySelector('#WI-SP-button .drawer-toggle').onclick=()=>opened++;await click(f,'drawer:WI-SP-button');assert.equal(opened,1);assert.equal(f.w.worldbookOpened,1);await click(f,'home');
 d.querySelector('.tisya-home-role-open').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('.tisya-page h2').textContent,'同名');assert(d.querySelector('[data-tisya-action="select:0"]'));assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});

test('worldbook entry stays accessible during streaming and chat editing stays locked',async()=>{const f=await setup();try{f.setGenerating(true);await click(f,'drawer:WI-SP-button');assert.equal(f.w.worldbookOpened,1);assert.deepEqual(f.errors,[]);await click(f,'more');await click(f,'msg-edit');assert.match(f.errors.at(-1),/生成/);}finally{await f.w.happyDOM.abort();}});

test('streaming disables actions and generation end re-enables both on same mounted message',async()=>{
 const f=await setup(),regen=f.w.document.querySelector('[data-tisya-action="regen"]'),next=f.w.document.querySelector('[data-tisya-action="next"]');
 f.setGenerating(true);f.handlers['generation-start']();await f.w.happyDOM.whenAsyncComplete();
 assert.equal(regen.disabled,true);assert.equal(next.disabled,true);assert.match(next.title,/生成/);
 f.setGenerating(false);f.handlers['generation-end']();await f.w.happyDOM.whenAsyncComplete();
 assert.equal(regen.disabled,false);assert.equal(next.disabled,false);
 await click(f,'more');await click(f,'msg-revision');assert.equal(f.generated.length,0);assert.ok(f.w.document.querySelector('#tisya-revision-panel'));await click(f,'close');
 await click(f,'next');assert.equal(f.generated.length,1);assert.equal(f.generated[0][0],'normal');
 await click(f,'menu');await click(f,'disable');f.handlers['generation-end']();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.document.querySelector('.tisya-actions'),null);f.w.happyDOM.abort();
});

function addHistory(f){
 f.ctx.chat=[{mes:'第一条',is_user:false},{mes:'用户第二条',is_user:true},{mes:'最后条',is_user:false}];
 f.w.document.querySelector('.mes_text').textContent='第一条';
 const log=[];f.ctx.deleteMessage=async id=>{log.push('delete:'+id);f.ctx.chat.splice(id,1);};f.ctx.saveChat=async()=>{log.push('save');};
 return log;
}
test('old AI advanced reroll opens review without deleting history',async()=>{
 const f=await setup(),log=addHistory(f);await click(f,'more');await click(f,'msg-revision');
 assert.deepEqual(log,[]);assert.equal(f.ctx.chat.length,3);assert.equal(f.generated.length,0);assert.ok(f.w.document.querySelector('#tisya-revision-panel'));assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('old user continue returns to that turn and requests next reply',async()=>{
 const f=await setup(),log=addHistory(f);f.ctx.chat[0].is_user=true;await click(f,'next');
 assert.deepEqual(log,['delete:2','delete:1','save']);assert.equal(f.ctx.chat[0].mes,'第一条');assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,true);f.w.happyDOM.abort();
});
test('rollback save failure prevents generation and reports partial deletion',async()=>{
 const f=await setup();addHistory(f);f.ctx.saveChat=async()=>{throw Error('保存失败');};await click(f,'next');
 assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/已删除后续 2 条消息.*保存失败/);f.w.happyDOM.abort();
});
test('draft and disconnected model prevent any history deletion',async()=>{
 for(const offline of [false,true]){const f=await setup(),log=addHistory(f);if(offline)f.ctx.onlineStatus='no_connection';else f.w.document.querySelector('#send_textarea').value='草稿';await click(f,'next');assert.deepEqual(log,[]);assert.equal(f.ctx.chat.length,3);assert.equal(f.generated.length,0);f.w.happyDOM.abort();}
});
test('custom continue text persists and reaches native normal generation as user input',async()=>{
 const f=await setup();await click(f,'menu');await click(f,'continue-settings');f.w.document.querySelector('#tisya-continue-text').value='请从这里继续。';await click(f,'save-continue');
 assert.equal(f.ctx.extensionSettings.缇斯亚界面.继续用户消息,'请从这里继续。');
 await click(f,'next');assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,false);assert.equal(f.generated[0][2],'请从这里继续。');f.w.happyDOM.abort();
});

test('typing a draft during rollback preserves it and stops generation',async()=>{
 const f=await setup();addHistory(f);const remove=f.ctx.deleteMessage;
 f.ctx.deleteMessage=async id=>{await remove(id);f.w.document.querySelector('#send_textarea').value='刚写的草稿';};
 f.ctx.extensionSettings.缇斯亚界面={联系人分组:{},继续用户消息:'继续'};
 await click(f,'next');assert.equal(f.generated.length,0);assert.equal(f.w.document.querySelector('#send_textarea').value,'刚写的草稿');assert.match(f.errors.at(-1),/新增了草稿/);f.w.happyDOM.abort();
});
test('unloaded sparse history is rejected without deletion',async()=>{
 const f=await setup(),log=addHistory(f);delete f.ctx.chat[1];await click(f,'next');assert.deepEqual(log,[]);assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/完整加载/);f.w.happyDOM.abort();
});

test('workflow navigation retains the original expansion control without duplicate shortcuts',async()=>{
 const f=await setup(),d=f.w.document,container=d.createElement('div');container.id='mcp_manager_container';container.innerHTML='<div class="inline-drawer-toggle"><i class="inline-drawer-icon down"></i></div><input value="preserved">';d.querySelector('#extensions-settings-button .drawer-content').append(container);
 let clicks=0;container.querySelector('.inline-drawer-toggle').addEventListener('click',()=>clicks++);
 await click(f,'menu');assert.equal(d.querySelector('[data-tisya-action="section:mcp"]'),null);await click(f,'drawer:extensions-settings-button');container.querySelector('.inline-drawer-toggle').click();assert.equal(clicks,1);assert.equal(container.querySelector('input').value,'preserved');assert.equal(d.querySelector('#mcp_manager_container'),container);assert.equal(d.querySelector('#tisya-overlay').open,false);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});

test('chat menu keeps the native anchor and removes the duplicated settings entry',async()=>{
 const f=await setup(),d=f.w.document,anchor=d.querySelector('#options_button');anchor.setAttribute('tabindex','0');let focused=false;
 anchor.addEventListener('click',()=>{focused=d.activeElement===anchor;});
 await click(f,'menu');assert.equal(d.querySelector('[data-tisya-action="chat-all"]'),null);await click(f,'chat');anchor.focus();anchor.click();assert.equal(d.querySelector('#tisya-input-more'),null);assert.equal(focused,true);f.w.happyDOM.abort();
});

test('sidebar shortcut entry closes the page and opens seven position selectors',async()=>{
 const f=await setup();await click(f,'menu');await click(f,'input-tools');const d=f.w.document;
 assert.equal(d.querySelector('#tisya-shell').classList.contains('tisya-page-open'),false);
 assert.equal(d.querySelector('#tisya-overlay').open,false);assert.equal(d.querySelectorAll('#tisya-shortcuts select').length,7);
 assert.equal(d.querySelector('#tisya-input-more'),null);assert.equal(d.body.classList.contains('tisya-tools-collapsed'),false);f.w.happyDOM.abort();
});

test('supported system fullscreen routes to native action while app header stays removed',async()=>{
 const f=await setup(),d=f.w.document,control=d.createElement('button');control.id='option_toggle_fullscreen';d.body.append(control);let count=0;control.addEventListener('click',()=>count++);
 await click(f,'menu');await click(f,'fullscreen');assert.equal(count,1);assert.equal(d.body.style.getPropertyValue('--topBarBlockSize'),'0px');assert.equal(d.querySelector('#tisya-top'),null);assert.equal(d.querySelector('#tisya-overlay').open,false);f.w.happyDOM.abort();
});

test('message and bottom menu icons retain accessible names and native source nodes',async()=>{
 const f=await setup(),d=f.w.document;
 for(const [selector,label]of [['[data-tisya-action="regen"]','重骰'],['[data-tisya-action="next"]','继续'],['[data-tisya-action="more"]','更多'],['#tisya-menu-trigger','设置与功能']]){const b=d.querySelector(selector);if(selector!=='#tisya-menu-trigger')assert.equal(b.querySelector('.tisya-orb-caption')?.textContent.length,2);assert.equal(b.getAttribute('aria-label'),label);assert.equal(b.querySelector('svg').getAttribute('aria-hidden'),'true');}
 assert.equal(d.querySelectorAll('#tisya-previous-message').length,1);assert.equal(d.querySelectorAll('#tisya-next-message').length,1);
 await click(f,'menu');await click(f,'disable');assert.equal(d.querySelector('#tisya-previous-message'),null);assert.ok(d.querySelector('#option_regenerate'));f.w.happyDOM.abort();
});
async function openActions(f){f.ctx.chat[0].mes=replyFixture();await click(f,'more');await click(f,'msg-read');f.w.document.querySelector('[data-reader-tab="actions"]').click();return f.w.document.querySelector('.tisya-reader-actions button');}
test('reading formats body without rerunning regex; selecting action fills composer and never generates or rewinds',async()=>{
 const f=await setup(),originalNode=f.w.document.querySelector('.mes_text'),button=await openActions(f),source=f.ctx.chat[0].mes;
 assert.ok(f.formatCalls.length);assert.equal(f.formatCalls[0][7].regexPrepared,true);assert.ok(f.formatCalls[0][5].FORBID_TAGS.includes('custom-style'));
 let inputEvents=0;f.w.document.querySelector('#send_textarea').addEventListener('input',()=>inputEvents++);
 button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.document.querySelector('#send_textarea').value,'察看门锁');assert.equal(inputEvents,1);assert.equal(f.generated.length,0);assert.equal(f.ctx.chat[0].mes,source);assert.equal(f.w.document.querySelector('.mes_text'),originalNode);assert.equal(f.w.document.querySelector('#tisya-overlay').open,false);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
for(const mode of ['append','replace'])test('inline action mode '+mode+' changes draft without a confirmation modal',async()=>{
 const f=await setup(),button=await openActions(f),d=f.w.document,input=d.querySelector('#send_textarea');input.value='已有草稿';
 d.querySelector('.action-mode-toggle').click();d.querySelector('[data-mode="'+mode+'"]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(input.value,'已有草稿');assert.equal(f.generated.length,0);
 button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(input.value,mode==='append'?'已有草稿\n察看门锁':'察看门锁');assert.equal(d.querySelector('#tisya-overlay').open,false);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
for(const change of ['message','chat'])test('action refuses changed '+change+' after opening inline mode menu',async()=>{
 const f=await setup(),button=await openActions(f),d=f.w.document;d.querySelector('#send_textarea').value='原草稿';d.querySelector('.action-mode-toggle').click();
 if(change==='message')f.ctx.chat[0].mes='发生变化';else f.ctx.getCurrentChatId=()=> 'another-chat';
 button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('#send_textarea').value,'原草稿');assert.equal(f.generated.length,0);assert.match(d.querySelector('.action-feedback').textContent,/变化|会话/);await f.w.happyDOM.abort();
});
test('direct send is an explicit mode and native submission occurs only after an action click',async()=>{
 const f=await setup(),button=await openActions(f),d=f.w.document;d.querySelector('.action-mode-toggle').click();d.querySelector('[data-mode="send"]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.generated.length,0);assert.equal(d.querySelector('#send_textarea').value,'');
 button.click();await f.w.happyDOM.whenAsyncComplete();assert.deepEqual(f.generated,[['native-send','察看门锁']]);assert.equal(d.querySelector('#send_textarea').value,'');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('direct send preserves a nonempty draft with inline feedback',async()=>{
 const f=await setup(),button=await openActions(f),d=f.w.document;d.querySelector('#send_textarea').value='我的草稿';d.querySelector('.action-mode-toggle').click();d.querySelector('[data-mode="send"]').click();await f.w.happyDOM.whenAsyncComplete();button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('#send_textarea').value,'我的草稿');assert.equal(f.generated.length,0);assert.match(d.querySelector('.action-feedback').textContent,/已有草稿/);await f.w.happyDOM.abort();
});
test('chat change closes reader and stale actions cannot write into the next conversation',async()=>{
 const f=await setup(),button=await openActions(f);f.ctx.chatId='b';f.handlers.chat();button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.document.querySelector('#send_textarea').value,'');assert.equal(f.w.document.querySelector('#tisya-overlay').open,false);assert.equal(f.generated.length,0);f.w.happyDOM.abort();
});


test('holding a shadow UI button never opens the native long-press message menu',async()=>{
 const f=await setup(),d=f.w.document;await click(f,'menu');await click(f,'chat');const host=d.createElement('div'),shadow=host.attachShadow({mode:'open'}),button=d.createElement('button');button.textContent='挂坠';shadow.append(button);d.querySelector('.mes_text').append(host);button.dispatchEvent(new f.w.PointerEvent('pointerdown',{bubbles:true,composed:true,button:0,clientX:20,clientY:20}));await new Promise(resolve=>setTimeout(resolve,700));assert.equal(d.querySelector('#tisya-overlay').open,false);d.dispatchEvent(new f.w.PointerEvent('pointerup',{bubbles:true}));await f.w.happyDOM.abort();
});

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
test('stopping a hung native generation releases history after host idle and a late result cannot unlock a new run',async()=>{
 const first=deferred(),second=deferred(),idle=deferred();let calls=0;const f=await setup({generateWait:()=>++calls===1?first.promise:second.promise,idleWait:()=>idle.promise}),d=f.w.document;
 try{
  await click(f,'next');assert.equal(calls,1);f.setGenerating(true);await f.emit('generation-stop');await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('[data-tisya-action="next"]').disabled,true);
  f.setGenerating(false);idle.resolve();await f.w.happyDOM.whenAsyncComplete();const next=d.querySelector('[data-tisya-action="next"]');assert.equal(next.disabled,false);assert.match(f.errors.at(-1),/生成已停止/);
  await click(f,'next');assert.equal(calls,2);first.resolve();await f.w.happyDOM.whenAsyncComplete();assert.equal(next.disabled,true);next.disabled=false;await click(f,'next');assert.equal(calls,2);assert.match(f.errors.at(-1),/当前操作尚未结束：继续（已等待 \d+ 秒）/);
  await f.emit('generation-stop');await f.w.happyDOM.whenAsyncComplete();assert.equal(next.disabled,false);await click(f,'more');await click(f,'msg-edit');assert(d.querySelector('.edit_textarea'),'history editing works after confirmed stop');
 }finally{idle.resolve();first.resolve();second.resolve();await f.w.happyDOM.abort();}
});

test('stopping generation options cancels the pending action without a late send',async()=>{
 const options=deferred(),f=await setup({optionsWait:()=>options.promise});
 try{await click(f,'next');assert.equal(f.generated.length,0);await f.emit('generation-stop');await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.document.querySelector('[data-tisya-action="next"]').disabled,false);options.resolve({});await f.w.happyDOM.whenAsyncComplete();assert.equal(f.generated.length,0);}finally{options.resolve({});await f.w.happyDOM.abort();}
});
test('stop during rollback persists the completed deletion before unlocking and reports the actual count',async()=>{
 const deletion=deferred(),f=await setup();let saves=0;f.ctx.chat.push({mes:'后文'});f.ctx.deleteMessage=async id=>{await deletion.promise;f.ctx.chat.splice(id,1);};f.ctx.saveChat=async()=>{saves++;};
 try{await click(f,'next');await f.emit('generation-stop');assert.equal(f.generated.length,0);deletion.resolve();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.ctx.chat.length,1);assert.equal(saves,1);assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/已删除后续 1 条消息/);assert.equal(f.w.document.querySelector('[data-tisya-action="next"]').disabled,false);}finally{deletion.resolve();await f.w.happyDOM.abort();}
});

test('a pending stream allows all dialog dismissals, reading, settings and native navigation without interrupting generation',async()=>{
 const stream=deferred(),f=await setup({generateWait:()=>stream.promise}),d=f.w.document;
 try {
  await click(f,'next');assert.equal(f.generated.length,1);assert.equal(d.querySelector('[data-tisya-action="next"]').disabled,true);
  for(const dismiss of ['close','backdrop','escape','cancel']){
   await click(f,'menu');assert(d.querySelector('#tisya-settings-home'));await click(f,'continue-settings');const dialog=d.querySelector('#tisya-overlay');assert.equal(dialog.open,true);
   if(dismiss==='close')await click(f,'close');
   else if(dismiss==='backdrop')dialog.querySelector('.tisya-backdrop').click();
   else if(dismiss==='escape')d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   else dialog.dispatchEvent(new f.w.Event('cancel',{cancelable:true}));
   await f.w.happyDOM.whenAsyncComplete();assert.equal(dialog.open,false,dismiss);
  }
  await click(f,'more');await click(f,'msg-read');assert.equal(d.querySelector('#tisya-overlay').getAttribute('aria-label'),'阅读与回合记录');await click(f,'close');
  await click(f,'menu');await click(f,'continue-settings');d.querySelector('#tisya-continue-text').value='以后继续用这条';await click(f,'save-continue');assert.equal(f.ctx.extensionSettings.缇斯亚界面.继续用户消息,'以后继续用这条');
  await click(f,'menu');await click(f,'motion-toggle');assert.equal(f.ctx.extensionSettings.缇斯亚界面.动态效果,false);
  let opened=0;d.querySelector('#backgrounds-button .drawer-toggle').addEventListener('click',()=>opened++);await click(f,'drawer:backgrounds-button');assert.equal(opened,1);assert.equal(d.querySelector('#tisya-overlay').open,false);
  assert.deepEqual(f.errors,[]);assert.equal(f.generated.length,1);
  const next=d.querySelector('[data-tisya-action="next"]');next.disabled=false;await click(f,'next');assert.equal(f.generated.length,1);assert.match(f.errors.at(-1),/当前操作尚未结束：继续（已等待 \d+ 秒）/);
  stream.resolve();await f.w.happyDOM.whenAsyncComplete();assert.equal(next.disabled,false);
 } finally {stream.resolve();await f.w.happyDOM.abort();}
});

test('UI completions cannot release the history lock while generation options are pending',async()=>{
 const options=deferred();let calls=0;const f=await setup({optionsWait:()=>{calls++;return options.promise;}});
 try {
  await click(f,'next');assert.equal(calls,1);assert.equal(f.generated.length,0);
  await click(f,'more');await click(f,'close');await click(f,'menu');await click(f,'input-tools');assert.deepEqual(f.errors,[]);
  await click(f,'next');assert.equal(calls,1);assert.match(f.errors.at(-1),/当前操作尚未结束：继续（已等待 \d+ 秒）/);
  options.resolve({});await f.w.happyDOM.whenAsyncComplete();assert.equal(f.generated.length,1);
 } finally {options.resolve({});await f.w.happyDOM.abort();}
});

test('late clipboard completion leaves a newly opened menu intact',async()=>{
 const copy=deferred(),f=await setup(),d=f.w.document;let copied;
 Object.defineProperty(f.w.navigator.clipboard,'writeText',{value:async text=>{copied=text;await copy.promise;}});
 try {
  await click(f,'more');await click(f,'msg-copy');assert.equal(copied,'正文');
  await click(f,'close');await click(f,'menu');copy.resolve();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelector('#tisya-overlay').open,false);assert(d.querySelector('#tisya-settings-home'));assert.equal(d.querySelector('.tisya-sub-title').textContent,'设置');assert.deepEqual(f.errors,[]);
 } finally {copy.resolve();await f.w.happyDOM.abort();}
});

test('pending history save allows menu dismissal and does not close a later panel',async()=>{
 const save=deferred(),f=await setup(),d=f.w.document;addHistory(f);f.ctx.saveChat=()=>save.promise;
 try {
  await click(f,'more');await click(f,'msg-delete');await click(f,'delete-confirm');assert.equal(f.ctx.chat.length,2);
  await click(f,'close');await click(f,'menu');save.resolve();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelector('#tisya-overlay').open,false);assert(d.querySelector('#tisya-settings-home'));assert.equal(d.querySelector('.tisya-sub-title').textContent,'设置');assert.deepEqual(f.errors,[]);
 } finally {save.resolve();await f.w.happyDOM.abort();}
});

 test('message toolbar supports only more, custom order, full expansion, and persists independently',async()=>{const f=await setup(),d=f.w.document;await click(f,'more');await click(f,'message-tools');await click(f,'message-tools-collapse');await click(f,'message-tools-save');assert.deepEqual([...d.querySelectorAll('.tisya-actions button')].map(x=>x.dataset.tisyaAction),['more']);await click(f,'more');assert.ok(d.querySelector('[data-tisya-action="msg-regen"]'));await click(f,'message-tools');await click(f,'message-tools-expand');const selects=[...d.querySelectorAll('#tisya-message-slots select')];selects[0].value='more';selects[9].value='regen';await click(f,'message-tools-save');assert.equal(d.querySelectorAll('.tisya-actions button').length,10);assert.equal(d.querySelector('.tisya-actions button').dataset.tisyaAction,'more');assert.equal(f.ctx.extensionSettings.缇斯亚界面.消息快捷栏[0],'more');assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();});

test('an explicitly disabled engine rejects generation without reopening it or starting old tables',async()=>{
 const f=await setup({nativePresets:true});try{
  const id=f.ctx.chatMetadata.tisya_engine.chat_uid;f.ctx.chatMetadata.tisya_engine.enabled=false;
  await assert.rejects(f.handlers.before('normal'),/已停用/);
  const payload={messages:[{role:'user',content:'继续'}]};await assert.rejects(f.handlers.payload(payload),/已停用/);assert.throws(()=>JSON.stringify(payload));
  assert.equal(f.ctx.chatMetadata.tisya_engine.chat_uid,id);assert.equal(f.ctx.chatMetadata.tisya_engine.enabled,false);assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);
 }finally{await f.w.happyDOM.abort();}
});
test('native edit focus places confirmation controls below the editor and exit restores them',async()=>{
 const f=await setup(),d=f.w.document,node=d.querySelector('#chat .mes'),block=node.querySelector('.mes_block'),header=d.createElement('div');header.className='ch_name';header.innerHTML='<div class="nested"><div class="mes_edit_buttons"><button class="mes_edit_done">保存</button><button class="mes_edit_cancel">取消</button></div></div>';block.prepend(header);
 const toolbar=header.querySelector('.mes_edit_buttons'),origin=toolbar.parentElement,text=node.querySelector('.mes_text');let saves=0;toolbar.querySelector('.mes_edit_done').onclick=()=>saves++;
 text.innerHTML='<textarea class="edit_textarea">原生草稿</textarea>';text.querySelector('textarea').focus();await f.w.happyDOM.whenAsyncComplete();
 assert.equal(block.lastElementChild,toolbar);toolbar.querySelector('.mes_edit_done').click();assert.equal(saves,1);assert.equal(text.querySelector('textarea').value,'原生草稿');
 text.textContent='已保存';f.handlers.edited();await f.w.happyDOM.whenAsyncComplete();assert.equal(toolbar.parentElement,origin);
 text.innerHTML='<textarea class="edit_textarea">另一次草稿</textarea>';text.querySelector('textarea').focus();await f.w.happyDOM.whenAsyncComplete();assert.equal(block.lastElementChild,toolbar);
 await click(f,'menu');await click(f,'disable');assert.equal(toolbar.parentElement,origin);assert.equal(text.querySelector('textarea').value,'另一次草稿');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});


test('welcome startup mounts the pet and functional sidebar without a world or persistence',async()=>{
 for(const welcome of [true,'existing']){const f=await setup({welcome}),d=f.w.document;
 try{
  assert.deepEqual(f.errors,[]);
  assert.ok(f.w.phoneOptions,'pet was mounted after the display pipeline');
  assert.equal(f.w.displayPipeline.state().enabled,false);
  await click(f,'menu');assert(d.querySelector('#tisya-settings-home'));assert.equal(d.querySelector('#tisya-overlay').open,false);
  assert.equal(d.querySelector('.tisya-sub-title').textContent,'设置');
  await click(f,'settings-app');assert.match(d.querySelector('.tisya-page').textContent,/先打开一段会话/);await click(f,'home');await click(f,'contacts');assert.equal(d.querySelector('#tisya-overlay').open,false);
  assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);
  assert.equal(f.w.Tisya.configuration.read().format,1);assert.equal(f.ctx.extensionSettings.tisya_matrix_configuration,undefined);
  assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}}
});

test('welcome to chat to welcome keeps sidebar alive and reads only the selected world display settings',async()=>{
 const f=await setup({welcome:true}),d=f.w.document;
 try{
  assert.deepEqual(f.errors,[]);const pet=f.w.phoneOptions,shell=d.querySelector('#tisya-shell');
  f.ctx.characters=[{avatar:'a.png',name:'甲',chat:'a'},{avatar:'b.png',name:'乙',chat:'b'}];
  f.ctx.chatId='a';f.ctx.characterId=0;await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();
  assert.equal(f.w.displayPipeline.state().enabled,true);
  assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined,'read-only defaults are not saved');
  const config=configCore.emptyConfig(),world=configCore.defaultWorld();world.theme.nativeRegex=false;
  f.ctx.chatId='b';f.ctx.characterId=1;config.worlds[configCore.worldKey(f.ctx)]=world;f.ctx.extensionSettings.缇斯亚配置=config;
  const before=JSON.stringify(config);await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();
  assert.equal(f.w.displayPipeline.state().enabled,false);
  f.ctx.chatId='a';f.ctx.characterId=0;await f.emit('chat');assert.equal(f.w.displayPipeline.state().enabled,true);
  f.ctx.chatId=undefined;f.ctx.characterId=undefined;await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();
  assert.equal(f.w.displayPipeline.state().enabled,false);assert.deepEqual(f.w.displayPipeline.state().scripts,[]);
  await click(f,'menu');assert(d.querySelector('#tisya-settings-home'));assert.equal(d.querySelector('#tisya-overlay').open,false);
  assert.equal(f.w.phoneOptions,pet);assert.equal(d.querySelector('#tisya-shell'),shell);
  assert.equal(d.querySelectorAll('#tisya-menu-trigger').length,1);
  assert.equal(JSON.stringify(f.ctx.extensionSettings.缇斯亚配置),before);
  assert.equal(f.w.Tisya.configuration.read().format,1);assert.equal(f.ctx.extensionSettings.tisya_matrix_configuration,undefined);
  assert.deepEqual(f.errors,[]);assert.equal(f.generated.length,0);
 }finally{await f.w.happyDOM.abort();}
});
for(const initializedPhone of [true,false])test('native composer persists requirements separately and clears the draft before awaiting the reply: '+(initializedPhone?'explicitly initialized phone':'uninitialized phone stays absent'),async()=>{
 const f=await setup({mediaStorage:true,nativePresets:true});if(initializedPhone){await bindMatrixPhoneFixture(f);await f.w.Tisya.phone.initializeLife();}else assert.equal((await f.w.Tisya.matrix.readDatabase()).state.tables.X_PHONE_BINDINGS?.['phone-current'],undefined);const d=f.w.document,input=d.querySelector('#tisya-contractor-input');input.value='请让角色主动回应';input.dispatchEvent(new f.w.Event('input'));d.querySelector('#send_textarea').value='递出礼物';
 await f.emit('before','normal',{},false);f.ctx.chat.push({is_user:true,mes:'递出礼物'});const payload=nativeMatrixPayload(f,[{role:'user',content:'递出礼物'}]);await f.emit('payload',payload);
 assert(payload.messages.some(row=>row.role==='user'&&row.content==='递出礼物'));const requirements=payload.messages.filter(m=>m.role==='user'&&m.content.startsWith('{\"format\":\"tisya.turn-direction/1\"')),phones=payload.messages.filter(m=>m.role==='user'&&m.content.startsWith('{\"format\":\"tisya.phone-turn-input/1\"'));assert.equal(requirements.length,1);assert.equal(JSON.parse(requirements[0].content).text,'请让角色主动回应');assert.equal(phones.length,initializedPhone?1:0);if(initializedPhone)assert.equal(JSON.parse(phones[0].content).requestId,f.w.Tisya.phone.state().requestId);else{assert.equal((await f.w.Tisya.matrix.readDatabase()).state.tables.X_PHONE_BINDINGS?.['phone-current'],undefined);assert.equal(f.ctx.chatMetadata['缇斯亚虚拟手机'],undefined);}assert.equal(input.value,'');
 f.ctx.chat.push({is_user:false,mes:'角色接过礼物并回应'});await f.emit('generation-end');assert.equal(input.value,'');assert.equal(f.ctx.chat.at(-2).mes,'递出礼物');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});


test('Android immersive entry remains discoverable and invokes the persistent native toggle',async()=>{const f=await setup(),d=f.w.document;let enabled=false,calls=0;f.w.TauriTavernAndroidSystemUiBridge={setImmersiveFullscreenEnabled:v=>{enabled=v;},isImmersiveFullscreenEnabled:()=>enabled};const control=d.createElement('button');control.id='option_toggle_fullscreen';control.onclick=()=>{calls++;enabled=!enabled;};d.body.append(control);await click(f,'menu');assert.equal(d.querySelector('[data-tisya-action=fullscreen]').getAttribute('aria-label'),'沉浸全屏');await click(f,'fullscreen');assert.equal(calls,1);assert.equal(enabled,true);await click(f,'menu');assert.equal(d.querySelector('[data-tisya-action=fullscreen]').getAttribute('aria-label'),'退出沉浸全屏');await click(f,'fullscreen');assert.equal(enabled,false);await f.w.happyDOM.abort();});

test('legacy native shortcut is hidden without overwriting settings; advanced revision remains in More',async()=>{const f=await setup(),d=f.w.document;f.ctx.extensionSettings.缇斯亚界面={联系人分组:{},消息快捷栏:['regen','msg-native','more']};f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('[data-tisya-action=msg-native]'),null);assert.deepEqual(f.ctx.extensionSettings.缇斯亚界面.消息快捷栏,['regen','msg-native','more']);await click(f,'more');assert(d.querySelector('[data-tisya-action=msg-revision]'));assert(!d.querySelector('[data-tisya-action=msg-native]'));await f.w.happyDOM.abort();});

test('candidate navigation has its own final row after message tools',async()=>{const f=await setup(),d=f.w.document;f.ctx.chat[0].swipes=['旧版','正文','新版'];f.ctx.chat[0].swipe_id=1;f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();const actions=d.querySelector('.tisya-actions'),tools=actions.querySelector('.tisya-message-tools'),versions=actions.querySelector('.tisya-candidate-row');assert(versions);assert.equal(actions.lastElementChild,versions);assert.equal(tools.querySelector('[data-tisya-action=candidate-prev]'),null);assert(tools.querySelector('[data-tisya-action=more]'));assert.equal(versions.querySelectorAll('button').length,3);assert.equal(versions.querySelector('[aria-label="当前候选"]').textContent,'2/3');assert.equal(versions.querySelector('[data-tisya-action=candidate-prev]').disabled,false);assert.equal(versions.querySelector('[data-tisya-action=candidate-next]').disabled,false);await f.w.happyDOM.abort();});

test('direct candidate jump edits the selected native text and deletes only selected version',async()=>{const f=await setup(),d=f.w.document;const m=f.ctx.chat[0];m.swipes=Array.from({length:11},(_,i)=>'版本'+(i+1));m.swipe_id=0;m.mes=m.swipes[0];f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();await click(f,'candidate-picker');d.querySelector('#tisya-candidate-select').value='10';await click(f,'candidate-select');assert.equal(m.swipe_id,10);assert.equal(m.mes,'版本11');await click(f,'more');await click(f,'msg-edit');assert.equal(d.querySelector('.edit_textarea').value,'版本11');d.querySelector('.edit_textarea').remove();f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();await click(f,'candidate-picker');assert.equal(d.querySelector('#tisya-candidate-select').value,'10');await click(f,'candidate-delete');await click(f,'candidate-delete-confirm');assert.equal(m.swipes.length,10);assert.equal(m.mes,'版本10');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();});

test('production initializer wires asynchronous message cache without disabling the shell',async()=>{
 const f=await setup({realMessages:true});try{f.ctx.chat[0].mes=replyFixture();await f.emit('updated',0);await new Promise(r=>setTimeout(r,60));const visual=f.w.document.querySelector('#chat .tisya-message-visual');assert(visual);assert.match(visual.shadowRoot.querySelector('.story').textContent,/门开了/);assert.equal(visual.shadowRoot.querySelector('#cover').getAttribute('src'),messageCardCover(f.ctx,f.ctx.chat[0],avatar=>f.w.fixture.getThumbnailUrl('avatar',avatar)));await click(f,'menu');assert(f.w.document.querySelector('#tisya-settings-home'));assert.equal(f.w.document.querySelector('#tisya-overlay').open,false);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);}finally{await f.w.happyDOM.abort();}
});
test('production long-press More saves manual order and keeps copy reachable',async()=>{
 const f=await setup(),d=f.w.document,node=d.querySelector('#chat .mes_text');node.textContent='正文';
 const press=async()=>{node.dispatchEvent(new f.w.PointerEvent('pointerdown',{bubbles:true,composed:true,button:0,pointerId:1,isPrimary:true,clientX:80,clientY:120}));await new Promise(r=>setTimeout(r,600));};
 const menuButton=label=>[...d.querySelectorAll('#tisya-paragraph-menu button')].find(b=>b.textContent===label);
 await press();menuButton('更多').click();await f.w.happyDOM.whenAsyncComplete();menuButton('配置长按菜单').click();await f.w.happyDOM.whenAsyncComplete();
 const selects=[...d.querySelectorAll('#tisya-longpress-slots select')];assert.equal(selects.length,paragraphActions.LONG_PRESS_TOOLS.length);selects.forEach(s=>s.value='');selects[0].value='edit';selects[1].value='copy-source';selects[2].value='more';await click(f,'longpress-save');
 assert.deepEqual([...f.ctx.extensionSettings.缇斯亚界面.长按菜单],['edit','copy-source','more']);await press();assert.deepEqual([...d.querySelectorAll('#tisya-paragraph-menu button')].map(b=>b.textContent),['手工编辑','复制原消息','更多','关闭']);assert.deepEqual(f.errors.filter(e=>!e.includes('当前宿主不支持逐条显示缓存')),[]);await f.w.happyDOM.abort();
});
test('production display route saves the real host loading field without replacing history',async()=>{
 const f=await setup(),before=JSON.stringify(f.ctx.chat);try{await click(f,'menu');await click(f,'display-cache');const root=f.w.document.querySelector('#tisya-chat-loading'),press=text=>[...root.querySelectorAll('button')].find(n=>n.textContent===text).click();press('设为 10 条');press('保存');await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.fixture.power_user.chat_truncation,10);assert.equal(JSON.stringify(f.ctx.chat),before);assert.match(root.textContent,/已保存，下次进入会话生效/);assert.deepEqual(f.errors,[]);}finally{await f.w.happyDOM.abort();}
});

test('settings has one destination per entry and discovers later native drawers',async()=>{
 const f=await setup(),d=f.w.document,extra=d.createElement('div');extra.className='drawer';extra.innerHTML='<button class="drawer-toggle"><i class="drawer-icon" title="新增扩展"></i></button><div class="drawer-content"><input value="kept"></div>';d.querySelector('#top-settings-holder').append(extra);
 await click(f,'menu');const menu=d.querySelector('#tisya-settings-home'),actions=[...menu.querySelectorAll('.tisya-settings-links [data-tisya-action]')].map(n=>n.dataset.tisyaAction);assert.equal(new Set(actions).size,actions.length);
 for(const obsolete of ['contacts','drawer:rightNavHolder','drawer:persona-management-button','cache-clear','memory','chat-all','section:mcp'])assert.equal(menu.querySelector(`[data-tisya-action="${obsolete}"]`),null);
 const entry=[...menu.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')==='新增扩展');assert(entry);let opened=0;extra.querySelector('.drawer-toggle').onclick=()=>opened++;entry.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opened,1);assert.equal(extra.querySelector('input').value,'kept');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('groups use stable native IDs; inline management does not load a chat',async()=>{
 const f=await setup(),d=f.w.document;f.ctx.groups=[{id:'g:1',name:'同名群',members:['a.png'],chats:['chat-1'],chat_id:'chat-1'},{id:'g2',name:'同名群',members:['b.png'],chats:['chat-2'],chat_id:'chat-2'}];let reads=0;f.ctx.openGroupChat=async(id,file)=>{reads++;f.ctx.groupId=id;f.ctx.chatId=file;};
 await click(f,'groups');assert.equal(d.querySelectorAll('.tisya-group-row').length,2);await click(f,'group-menu:g%3A1');assert.equal(d.querySelectorAll('.tisya-directory-inline').length,1);assert.equal(d.querySelector('#tisya-overlay').open,false);await click(f,'group-edit:g%3A1');assert.equal(f.w.characterGroupTarget.id,'g:1');assert.equal(reads,0);assert.equal(f.ctx.chatId,'a');assert(d.querySelector('.tisya-group-row'));
 await click(f,'group-open:g2');assert.equal(reads,1);assert.equal(f.ctx.groupId,'g2');assert.equal(f.ctx.chatId,'chat-2');assert.equal(d.querySelector('.tisya-group-row'),null);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('cache drafts block page and phone navigation until saved or discarded',async()=>{
 const f=await setup(),d=f.w.document;await click(f,'menu');await click(f,'display-cache');const input=d.querySelector('[aria-label="首批消息条数"]');input.value='17';await click(f,'home');assert.equal(d.querySelector('[aria-label="首批消息条数"]'),input);f.w.phoneOptions.onOpenApp('通信');await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('[aria-label="首批消息条数"]'),input);assert.equal(f.w.fixture.power_user.chat_truncation,100);
 assert.equal(d.querySelectorAll('[role=dialog][aria-label="保存未完成的修改"]').length,1);[...d.querySelectorAll('.tisya-unsaved-prompt button')].find(n=>n.textContent==='保存并切换').click();await f.w.happyDOM.whenAsyncComplete();assert(d.querySelector('.tisya-home'));assert.equal(f.w.fixture.power_user.chat_truncation,17);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('native API editor opens from clean configuration and preserves unsaved tags',async()=>{
 const f=await setup(),d=f.w.document;try{await click(f,'menu');await click(f,'settings-tab:api');const root=d.querySelector('#tisya-settings-app');let opens=0;d.querySelector('#sys-settings-button .drawer-toggle').onclick=()=>opens++;const manage=[...root.querySelectorAll('button')].find(n=>n.textContent==='连接与模型');manage.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opens,1);[...root.querySelectorAll('button')].find(b=>b.textContent==='回复格式').click();await f.w.happyDOM.whenAsyncComplete();const input=root.querySelector('input');input.value='storyReply';input.dispatchEvent(new f.w.Event('input'));[...root.querySelectorAll('button')].find(n=>n.textContent==='连接与模型').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opens,1);assert.equal(root.querySelectorAll('[role=dialog]').length,1);assert.equal(input.value,'storyReply');[...root.querySelectorAll('.tisya-unsaved-prompt button')].find(n=>n.textContent==='继续编辑').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opens,1);assert.equal(input.isConnected,true);}finally{await f.w.happyDOM.abort();}
});
test('home settings invokes the menu; menu rename and pin persist with native names unchanged',async()=>{
 const f=await setup(),d=f.w.document;d.querySelector('.tisya-home-rail-bottom [data-tisya-action="menu"]').click();await f.w.happyDOM.whenAsyncComplete();assert(d.querySelector('#tisya-settings-home').textContent.includes('游玩偏好'));assert(!d.querySelector('.tisya-home'),'home remains open');assert.equal(d.querySelector('#tisya-overlay').open,false);await click(f,'home');
 d.querySelector('.tisya-home-chat-row .tisya-home-menu').click();await click(f,'directory-rename');d.querySelector('#tisya-directory-name').value='我喜欢的故事';await click(f,'directory-save');assert.match(d.querySelector('[data-home-chat]').textContent,/我喜欢的故事/);assert.equal(f.ctx.characters[0].name,'同名');assert.equal(f.ctx.chat[0].mes,'正文');
 d.querySelectorAll('.tisya-home-role>summary .tisya-home-menu')[1].click();await click(f,'directory-pin');assert.match(d.querySelector('.tisya-home-role-open').dataset.tisyaAction,/card:1/);assert.equal(d.querySelector('.tisya-home-form-note'),null);assert.equal(d.querySelector('.tisya-home-profile small').textContent,'用户入口 ↗');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('late host autoload leaves home visible, while choosing a row still opens exact chat',async()=>{
 const f=await setup(),d=f.w.document;const home=d.querySelector('.tisya-home');selectFixtureChat(f,0,'loaded-later');await f.emit('chat');assert(d.querySelector('.tisya-home')===home,'late host autoload replaced or closed the home');let selections=0;f.ctx.selectCharacterById=async(id,o)=>{selections++;selectFixtureChat(f,id,o.chatFile);await f.emit('chat');};
 d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();await waitForShell(()=>!d.querySelector('.tisya-home'),'selected chat leaves home');assert.equal(selections,1);assert(!d.querySelector('.tisya-home'),'home remains open');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('deletion requires confirmation and checks the native result instead of assuming success',async()=>{
 const f=await setup(),d=f.w.document;d.querySelector('.tisya-home-chat-row .tisya-home-menu').click();await click(f,'directory-delete');assert.equal(d.querySelector('#tisya-overlay').open,false);assert.match(d.querySelector('.tisya-directory-inline').textContent,/永久删除/);assert(d.querySelector('[data-tisya-action="directory-delete-confirm"]'));await click(f,'directory-delete-confirm');assert.match(f.errors.at(-1),/会话仍在/);assert(d.querySelector('[data-home-chat]'));await f.w.happyDOM.abort();
});

test('directory menus toggle in their own row, remain nonmodal, edit in place and dismiss with Escape',async()=>{
 const f=await setup(),d=f.w.document;try{
 const role=d.querySelector('.tisya-home-role'),arrow=role.querySelector('.tisya-home-menu');role.open=false;
 arrow.click();assert.equal(d.querySelector('#tisya-overlay').open,false);assert(role.querySelector('summary>.tisya-directory-inline'));assert.equal(arrow.getAttribute('aria-expanded'),'true');
 await click(f,'directory-rename');assert(role.querySelector('#tisya-directory-name'));await click(f,'directory-back');await click(f,'directory-group');assert(role.querySelector('#tisya-directory-group-name'));await click(f,'directory-back');await click(f,'directory-delete');assert(role.querySelector('.tisya-directory-warning'));await click(f,'directory-back');
 arrow.click();assert.equal(d.querySelector('.tisya-directory-inline'),null);assert.equal(arrow.getAttribute('aria-expanded'),'false');
 arrow.click();const other=d.querySelectorAll('.tisya-home-role .tisya-home-menu')[1];other.click();assert.equal(d.querySelectorAll('.tisya-directory-inline').length,1);assert.equal(arrow.getAttribute('aria-expanded'),'false');
 d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(d.querySelector('.tisya-directory-inline'),null);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});
test('detached inline edit is rejected instead of saving against a stale row',async()=>{
 const f=await setup(),d=f.w.document;try{
 d.querySelector('.tisya-home-chat-row .tisya-home-menu').click();await click(f,'directory-rename');d.querySelector('#tisya-directory-name').value='迟到保存';
 const stale=d.querySelector('[data-tisya-action="directory-save"]');d.querySelector('.tisya-directory-inline').remove();d.querySelector('.tisya-page').append(stale);stale.click();await f.w.happyDOM.whenAsyncComplete();assert.match(f.errors.at(-1),/目录页面已变化/);assert.equal(d.querySelector('#tisya-overlay').open,false);
 }finally{await f.w.happyDOM.abort();}
});


test('user message exposes reroll-next, preserves draft guard and sends edited comparison only once',async()=>{
 let f,payload;f=await setup({nativePresets:true,configureContext:ctx=>{ctx.chat[0].is_user=true;},generateWait:async()=>{await f.emit('before','normal',{},false);payload=nativeMatrixPayload(f,[{role:'user',content:f.ctx.chat[0].mes}]);await f.emit('payload',payload);await f.emit('generation-end');}});
 await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();
 await click(f,'more');await click(f,'msg-edit');f.ctx.chat[0].mes='改成停下来等他';await f.emit('edited',0);f.w.document.querySelector('.edit_textarea').remove();await f.emit('updated',0);await f.w.happyDOM.whenAsyncComplete();
 const regen=f.w.document.querySelector('[data-tisya-action=regen]');assert.equal(regen.disabled,false);assert.equal(regen.getAttribute('aria-label'),'重投下一条');
 f.w.document.querySelector('#send_textarea').value='没发送';await click(f,'regen');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/草稿/);f.w.document.querySelector('#send_textarea').value='';
 await click(f,'regen');await waitForShell(()=>f.generated.length===1,'Matrix reroll starts: '+JSON.stringify(f.errors));await waitForShell(()=>payload&&f.w.Tisya.operationState()===null,'Matrix reroll payload completes: '+JSON.stringify(f.errors));assert.equal(f.generated.length,1,JSON.stringify(f.errors));assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,true);assert.ok(payload,'generation must reach payload; errors: '+JSON.stringify(f.errors));assert.deepEqual(JSON.parse(payload.messages.at(-1).content),{kind:'user-rewrite-material',previous:'正文',current:'改成停下来等他'});
 await click(f,'next');await waitForShell(()=>f.generated.length===2&&f.w.Tisya.operationState()===null,'next Matrix request completes: '+JSON.stringify(f.errors));assert.equal(f.generated.length,2);assert.doesNotMatch(JSON.stringify(payload),/user-rewrite-material/);assert.equal(f.ctx.chat.length,1);await f.w.happyDOM.abort();
});

test('all settings entry points reuse one page, preserve search and discover a drawer installed while open',async()=>{
 const f=await setup(),d=f.w.document;try{
 await click(f,'menu');const page=d.querySelector('#tisya-settings-home'),input=page.querySelector('input');input.value='世界书';input.oninput();
 f.w.phoneOptions.onOpenApp('设置');await f.w.happyDOM.whenAsyncComplete();await click(f,'menu');assert.equal(d.querySelector('#tisya-settings-home'),page);assert.equal(page.querySelector('input'),input);assert.equal(input.value,'世界书');assert.equal(d.querySelectorAll('#tisya-settings-home').length,1);assert.equal(d.querySelector('#tisya-overlay').open,false);
 const extra=d.createElement('div');extra.id='late-plugin';extra.className='drawer';extra.innerHTML='<button class="drawer-toggle"><i class="drawer-icon" title="后装扩展"></i></button><div class="drawer-content"></div>';d.querySelector('#top-settings-holder').append(extra);await click(f,'menu');assert.equal(d.querySelector('#tisya-settings-home'),page);assert.equal(page.querySelector('input').value,'世界书');const search=page.querySelector('input');search.value='';search.oninput();assert(page.querySelector('[data-tisya-action="drawer:late-plugin"]'));
 for(const action of ['role-library','group-library','drawer:WI-SP-button','drawer:ai-config-button'])assert.equal(page.querySelectorAll(`[data-tisya-action="${action}"]`).length,1);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('settings and identity headers return directly to current chat without changing its contents',async()=>{const f=await setup(),d=f.w.document,history=JSON.stringify(f.ctx.chat),chatId=f.ctx.chatId;await click(f,'menu');for(const route of ['settings-app','user-identity']){await click(f,route);await settleIdentityRoute(f);const back=d.querySelector('.tisya-sub-header [data-tisya-action="chat"]');assert.equal(back.textContent,'聊天 ›');back.click();await f.w.happyDOM.whenAsyncComplete();await f.w.identityPanel?.settled();assert(!d.querySelector('#tisya-shell').classList.contains('tisya-page-open'),JSON.stringify({errors:f.errors,identity:f.w.identityPanel?.state?.(),status:d.querySelector('.tisya-identity-status')?.textContent}));assert.equal(f.ctx.chatId,chatId);assert.equal(JSON.stringify(f.ctx.chat),history);await click(f,'menu');}assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();});


test('pending native clipboard on the actual message toolbar never blocks a new chat action',async()=>{
 const copy=deferred(),f=await setup();
 Object.defineProperty(f.w.navigator.clipboard,'writeText',{value:async()=>{await copy.promise;}});
 try{
  await click(f,'more');await click(f,'msg-copy');
  assert.equal(f.w.Tisya.operationState(),null);
  await click(f,'next');assert.equal(f.generated.length,1);
  assert.equal(f.w.Tisya.operationState(),null);assert.deepEqual(f.errors,[]);
 }finally{copy.resolve();await f.w.happyDOM.abort();}
});


test('rendered target chat releases actual home navigation lock while native selection promise stays pending',async()=>{
 const host=deferred(),f=await setup(),d=f.w.document;let selections=0;
 f.ctx.selectCharacterById=async(id,o)=>{selections++;selectFixtureChat(f,id,o.chatFile);await f.emit('chat');await host.promise;};
 try{
  d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();await waitForShell(()=>!d.querySelector('.tisya-home'),'chat event releases home while native promise waits');
  assert(!d.querySelector('.tisya-home'),'home remains open');assert.equal(f.w.Tisya.operationState(),null);
  await click(f,'home');assert(d.querySelector('.tisya-home'));
  d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(selections,1);assert(!d.querySelector('.tisya-home'),'home remains open');assert.equal(f.w.Tisya.operationState(),null);
  await click(f,'next');assert.equal(f.generated.length,1);assert.deepEqual(f.errors,[]);
 }finally{host.resolve();await f.w.happyDOM.abort();}
});


test('managed committed tail releases home lock even when host never emits CHAT_CHANGED',async()=>{
 const host=deferred(),f=await setup(),d=f.w.document;let participant,processor;
 f.w.__TAURITAVERN__={api:{chatSurface:{protocolVersion:1,isManagedOwnershipRequired:()=>true,registerContentProcessor:p=>{processor=p;},registerParticipant:p=>{participant=p;return {};}}}};
 f.w.eval('registerChatSurface()');
 assert.equal(processor.id,'tisya-ui/native-panel-source');
 assert.equal(await processor.prepare({message:f.ctx.chat[0],mesid:0},async()=>'base'),'base');
 f.ctx.selectCharacterById=async(id,o)=>{f.ctx.characterId=id;f.ctx.chatId=o.chatFile;await host.promise;};
 try{
  d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();assert(f.w.Tisya.operationState());
  const element=d.querySelector('#chat .mes'),content=element.querySelector('.mes_text');
  participant.didCommitContent({element,content,mesid:0,signal:new f.w.AbortController().signal});
  await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.Tisya.operationState(),null);assert(!d.querySelector('.tisya-home'),'home remains open');
  await click(f,'next');assert.equal(f.generated.length,1);assert.deepEqual(f.errors,[]);
 }finally{host.resolve();await f.w.happyDOM.abort();}
});


test('pending selection diagnostics remain reachable and show actual target mismatch without clearing the lock',async()=>{
 const host=deferred(),f=await setup(),d=f.w.document;
 f.ctx.selectCharacterById=async()=>{await host.promise;};
 try{
  d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();assert(f.w.Tisya.operationState());
  await click(f,'menu');await click(f,'selection-diagnostic');
  const data=JSON.parse(d.querySelector('#tisya-selection-diagnostic').textContent);
  assert.equal(data.selection.status,'宿主调用未返回');assert.equal(data.selection.matchesChat,false);
  assert.equal(data.selection.chatEvents,0);assert.equal(data.selection.contentCommits,0);
  assert(f.w.Tisya.operationState());assert.equal(f.ctx.chat[0].mes,'正文');assert.equal(f.generated.length,0);
 }finally{host.resolve();await f.w.happyDOM.abort();}
});


test('target data loaded without completion events closes the directory and releases chat operations',async()=>{
 const host=deferred(),f=await setup(),d=f.w.document;
 f.ctx.selectCharacterById=async(id,o)=>{f.ctx.characterId=id;f.ctx.chatId=o.chatFile;f.ctx.chatMetadata={integrity:'new-loaded-chat'};f.ctx.getCurrentChatId=()=>f.ctx.chatId;f.ctx.chat=[{...f.ctx.chat[0],mes:'已切换的聊天'}];await host.promise;};
 try{
  d.querySelector('[data-home-chat]').click();await new Promise(r=>setTimeout(r,50));await f.w.happyDOM.whenAsyncComplete();
  assert(!d.querySelector('.tisya-home'),'home remains open');assert.equal(f.w.Tisya.operationState(),null);
  await click(f,'next');assert.equal(f.generated.length,1);assert.deepEqual(f.errors,[]);
 }finally{host.resolve();await f.w.happyDOM.abort();}
});

test('a manually selected foreign preset passes native input through without either retired generation writer',async()=>{
 const f=await setup({nativePresets:true});try{
  f.presetHost.manager.selectPreset('0');await f.w.happyDOM.whenAsyncComplete();
  const before=await f.w.Tisya.matrix.readDatabase();let oldWrites=0;
  for(const name of ['clear','prepare','archiveFromMessages','acceptOnePass','discardOnePass'])assert.equal(typeof f.w.Tisya.tables[name],'undefined');
  f.w.configurationHost.before=()=>{throw Error('retired configuration writer called');};f.w.configurationHost.payloadReady=()=>{throw Error('retired configuration payload called');};
  const payload={messages:[{role:'system',content:'Other preset unchanged'},{role:'user',content:'保留原生请求'}],model:'native-model'},original=structuredClone(payload);
  await f.emit('before','normal',{},false);await f.emit('payload',payload);await f.emit('generation-end');
  assert.deepEqual(payload,original);assert.equal(oldWrites,0);assert.equal(f.presetHost.manager.getSelectedPresetName(),'Other');
  assert.deepEqual(await f.w.Tisya.matrix.readDatabase(),before);assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('native token-count dry runs do not clear pending one-pass storage work',async()=>{
 const f=await setup();let clears=0,discards=0,accepts=0;f.w.tableService.clear=()=>clears++;f.w.tableService.discardOnePass=()=>discards++;f.w.tableService.acceptOnePass=async()=>accepts++;
 await f.emit('before','normal',{},true);assert.equal(await f.w.tisyaHistoryInput([],100,()=>{},'normal'),null);await f.emit('generation-end');assert.equal(clears,0);assert.equal(discards,0);assert.equal(accepts,0);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});

test('token count between a real start and its end completes the Matrix lifecycle once without legacy settlement',async()=>{
 const f=await setup({nativePresets:true});let ends=0,oldWrites=0;const event=f.w.Tisya.matrix.event;
 f.w.Tisya.matrix.event=async(name,...args)=>{if(name==='GENERATION_ENDED')ends++;return event(name,...args);};
 for(const name of ['clear','prepare','archiveFromMessages','acceptOnePass','discardOnePass'])assert.equal(typeof f.w.Tisya.tables[name],'undefined');
 await f.emit('before','normal',{},false);await f.emit('payload',nativeMatrixPayload(f));await f.emit('before','normal',{},true);
 await f.emit('generation-end');assert.equal(ends,1);await f.emit('generation-end');assert.equal(ends,1);assert.equal(oldWrites,0);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});

// These route regressions execute index.js with the actual Matrix identity UI,
// identity service and story-identity service. Only native host persistence and
// worldbook storage are in-memory fixtures; they never touch a user's data.
async function setupIdentityRoute({empty=false,persistSettings,cold=false,matrix=true,welcome=false,nativePresets=false,configureContext=null}={}){
 const books=cold?{}:{基点书:[{uid:0,name:'【角色】原角色',content:'原角色的完整设定',enabled:false}]};
 let bookWrites=0;
 const bookHelper={
  getWorldbookNames:async()=>Object.keys(books),
  getWorldbook:async name=>structuredClone(books[name]),
  createWorldbook:async(name,entries)=>{bookWrites++;books[name]=entries.map((entry,uid)=>({...entry,uid}));return true;},
  updateWorldbookWith:async(name,update)=>{bookWrites++;books[name]=update(structuredClone(books[name])).map((entry,uid)=>({...entry,uid:entry.uid??uid}));},
  getCharWorldbookNames:async()=>({primary:'',additional:[]})
 };
 const f=await setup({bookHelper,persistSettings,welcome,nativePresets,configureContext,nativeIdentity:{
  active:empty?'':'native-a',name1:empty?'用户':'原身份',
  chatCompletionSettings:{prompts:matrix?structuredClone(matrixBaseline.prompts):[],preset_settings_openai:matrix?'Tisya':'Other'},
  powerUserSettings:{
   personas:empty?{}:{'native-a':'原身份','native-b':'另一身份'},
   persona_descriptions:empty?{}:{'native-a':{description:'原心愿',connections:[]},'native-b':{description:'另一身份的心愿',connections:[]}},
   persona_description:'原心愿'
  }
 }});
 f.ctx.loadWorldInfo=async name=>Object.hasOwn(books,name)
  ?{entries:Object.fromEntries(books[name].map(entry=>[entry.uid,{...entry,comment:entry.name}]))}
  :structuredClone(f.nativeBooks.get(name)??{entries:{}});
 if(!cold){
  const config=f.w.Tisya.configuration.read();
  config.story={...config.story,userMode:'generic',userBinding:null,userName:'',play:{choices:{W:[]}}};
  await f.w.Tisya.configuration.save(config);
  await f.w.Tisya.matrix.ensureDatabase();const db=await f.w.Tisya.matrix.readDatabase();
  await f.w.Tisya.matrix.commitDatabase({contextKey:db.contextKey,expectedRevision:db.revision,operationId:'identity-route-fixture',changes:[
   {tableId:'T_CHAR_DOSSIER',recordId:'route-character',values:{name:'原角色',manifest:'原角色的完整设定'}},
   {tableId:'T_SYS_ENTITIES',recordId:'route-character',values:{kind:'character',origin_record_ref:'route-origin'}},
   {tableId:'M_FIELD_REFERENCES',recordId:'route-origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'route-character',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'route-character',reference_kind:'record',resolution_status:'resolved'}}
  ]});
 }
 return {...f,books,bookWrites:()=>bookWrites};
}
function routeButton(root,label){const button=[...root.querySelectorAll('button')].find(node=>node.textContent===label);assert(button,`missing visible button: ${label}`);return button;}
async function settleIdentityRoute(f){
 await f.w.identityPanel?.ready;await f.w.preferencePanel?.ready;
 await f.w.creationPanel?.ready;await f.w.assistantPanel?.settled?.();
 await f.w.identityPanel?.settled?.();await f.w.preferencePanel?.settled?.();await f.w.creationPanel?.settled?.();await f.w.happyDOM.whenAsyncComplete();
}
async function pressRouteButton(f,root,label){routeButton(root,label).click();await f.w.happyDOM.whenAsyncComplete();await settleIdentityRoute(f);}
function editIdentityField(f,selector,value,event='input'){
 const node=f.w.document.querySelector('#tisya-user-page '+selector);assert(node,`missing identity field: ${selector}`);
 if(node.type==='checkbox')node.checked=value;else node.value=value;
 node.dispatchEvent(new f.w.Event(event,{bubbles:true}));return node;
}
function assistantCreationRoot(f){
 const shadow=f.w.document.querySelector('#tisya-assistant-slot .tisya-assistant-app')?.shadowRoot;
 const page=shadow?.querySelector('.tisya-matrix-identity');
 assert(page?.querySelector('[data-database-creation]'),'the production assistant must mount the actual Matrix creation page');
 assert.equal(shadow.querySelector('.tisya-tables'),null,'creation must not mount the retired table setup');return page;
}
function editCreationField(f,page,selector,value,event='input'){
 const node=page.querySelector(selector);assert(node,`missing creation field: ${selector}`);
 if(node.type==='checkbox')node.checked=value;else node.value=value;
 node.dispatchEvent(new f.w.Event(event,{bubbles:true}));return node;
}
async function openIdentityFromSettings(f){
 await click(f,'menu');await click(f,'settings-app');
 await pressRouteButton(f,f.w.document.querySelector('#tisya-settings-app'),'用户身份');
 const page=f.w.document.querySelector('#tisya-user-page');
 assert(page?.classList.contains('tisya-matrix-identity'),'the production route must mount the actual Matrix identity page');return page;
}
function unsavedDialog(f){const dialogs=f.w.document.querySelectorAll('[role="dialog"][aria-label="保存未完成的修改"]');assert.equal(dialogs.length,1,'one attempted navigation must have one decision');return dialogs[0];}

test('cold-start without a chat opens unified identity and routes creation to the independent world start without writing',async()=>{
 const f=await setupIdentityRoute({cold:true,matrix:false,empty:true,welcome:true,nativePresets:true}),d=f.w.document;
 try{
  const native=structuredClone(f.ctx.powerUserSettings);
  assert.equal(f.presetHost.manager.getSelectedPresetName(),'Tisya');
  assert.equal(f.ctx.chatMetadata.tisya_engine,undefined);
  assert.equal(f.ctx.extensionSettings.tisya_matrix_configuration,undefined);
  await click(f,'menu');await click(f,'user-identity');await settleIdentityRoute(f);
  let page=d.querySelector('#tisya-user-page');
  assert(page.classList.contains('tisya-matrix-identity'));
  assert(page.querySelector('[data-database-identity]'));assert(page.querySelector('[data-source-books]'));
  assert.equal(page.querySelector('[data-role-create]'),null);assert.equal(page.querySelector('[data-database-creation]'),null);
  assert(page.querySelector('.tisya-identity-content'));assert.equal(page.querySelectorAll('.tisya-settings-actions').length,1);
  assert.equal(page.querySelector('.tisya-user'),null);assert.equal(page.querySelector('[data-identity-preset-notice]'),null);
  assert.deepEqual(f.books,{});assert.equal(f.bookWrites(),0);assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);
  let requests=0;f.w.configurationHost.request=async()=>{requests++;throw Error('无聊天不得调用模型');};
  await pressRouteButton(f,page,'前往缇斯亚助手创建人物');
  const seed=d.querySelector('#tisya-world-seed-slot .tisya-world-seed');assert(seed);
  assert(seed.querySelector('textarea[aria-label="我的世界点子"]'));
  assert.equal(d.querySelector('#tisya-assistant-slot'),null);assert.equal(requests,0);
  assert.equal(f.ctx.chatMetadata.tisya_engine,undefined);assert.deepEqual(f.ctx.powerUserSettings,native);assert.equal(f.bookWrites(),0);
  await pressRouteButton(f,seed,'返回');
  await click(f,'user-identity');await settleIdentityRoute(f);page=d.querySelector('#tisya-user-page');
  assert(page.classList.contains('tisya-matrix-identity'));assert.equal(f.bookWrites(),0);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('cold-start source selection opens the production assistant and archives reviewed fields before binding the saved character',async()=>{
 const f=await setupIdentityRoute({cold:true,matrix:false,nativePresets:true}),d=f.w.document;
 try{
  assert.equal(f.presetHost.manager.getSelectedPresetName(),'Tisya');assert.equal(f.ctx.chatMetadata.tisya_engine.enabled,true);
  const history=structuredClone(f.ctx.chat),native=structuredClone(f.ctx.powerUserSettings);
  const original='初次角色是河口旅人。\n原文与 {{user}} 保留。';
  f.books.首次基点=[{uid:7,name:'【角色】初次角色',content:original,enabled:false}];
  const originalBook=structuredClone(f.books.首次基点),requests=[];
  f.w.configurationHost.request=async(task,text)=>{requests.push({task,input:JSON.parse(text)});return '<reply><task/><anchor phase="before"/><title>初次角色</title><body>1 初次角色是河口旅人。</body><anchor phase="after"/><extra/><cells>【人物原点档案／1】\n1 显示名称：初次角色\n20 公开身份：河口旅人</cells><vars/><archive/><actions/></reply>';};
  const before=await f.w.Tisya.matrix.readDatabase();let page=await openIdentityFromSettings(f);
  editIdentityField(f,'[data-role-book]','首次基点','change');await settleIdentityRoute(f);
  editIdentityField(f,'[data-source-entry]','7','change');await settleIdentityRoute(f);
  assert.match(page.querySelector('[data-source-books]').textContent,/原文与 \{\{user\}\} 保留/);
  await pressRouteButton(f,page,'交给缇斯亚助手提炼');page=assistantCreationRoot(f);
  assert.equal(page.querySelector('[data-creation-kind]').value,'character');
  assert.equal(page.querySelector('[data-creation-persona]').checked,false);
  assert.equal(page.querySelector('[data-creation-book]').value,'首次基点');
  await pressRouteButton(f,page,'生成表单草稿');assert(page.querySelector('[data-creation-draft]'),page.textContent);
  assert.equal(requests.length,1);assert.equal(requests[0].task,'tableGenesis');
  assert.equal(requests[0].input.source.book,'首次基点');assert.equal(requests[0].input.source.uid,7);assert.equal(requests[0].input.source.content,original);
  assert.deepEqual(await f.w.Tisya.matrix.readDatabase(),before,'generating and reviewing never commit');assert.deepEqual(f.books.首次基点,originalBook);assert.equal(f.bookWrites(),0);
  editCreationField(f,page,'[data-creation-key=public_identity]','核对后的河口旅人');
  editCreationField(f,page,'[data-creation-confirm]',true,'change');await pressRouteButton(f,page,'保存');
  assert.equal(page.querySelector('.tisya-settings-actions [role="alert"]'),null,page.textContent);
  const after=await f.w.Tisya.matrix.readDatabase(),dossiers=Object.entries(after.state.tables.T_CHAR_DOSSIER),[dossierId,dossier]=dossiers[0];
  assert.equal(dossiers.length,1);assert.equal(dossier.values.name,'初次角色');assert.equal(dossier.values.public_identity,'核对后的河口旅人');assert.equal(Object.hasOwn(dossier.values,'manifest'),false);assert.equal(dossier.states.manifest??'unset','unset');
  assert.equal(f.books.首次基点.length,1);assert.equal(f.books.首次基点[0].uid,7);assert.equal(f.books.首次基点[0].enabled,false);assert.equal(f.bookWrites(),1);
  const definition=readMatrixDefinition(f.books.首次基点[0]);assert.equal(definition.kind,'character');assert.equal(definition.source.entry.content,original);
  assert.equal(definition.matrix.binding.dossierId,dossierId);assert.equal(definition.matrix.changes.find(row=>row.tableId==='T_CHAR_DOSSIER').values.public_identity,'核对后的河口旅人');
  assert.equal(f.w.Tisya.configuration.read().story.userBinding,null,'saving a definition does not choose the player character');
  assert.equal(routeButton(page,'保存').disabled,true);await f.w.creationPanel.saveDraft();assert.equal(f.bookWrites(),1);assert.deepEqual(await f.w.Tisya.matrix.readDatabase(),after);
  assert.deepEqual(f.ctx.chat,history);assert.deepEqual(f.ctx.powerUserSettings,native);
  page=await openIdentityFromSettings(f);editIdentityField(f,'[data-avatar-mode]','bound','change');
  editIdentityField(f,'[data-role-entry]',dossierId,'change');await settleIdentityRoute(f);await pressRouteButton(f,page,'保存');
  const saved=f.w.Tisya.configuration.read(),binding=saved.story.userBinding;
  assert.equal(saved.story.userMode,'bound');assert.equal(binding.database,true);assert.equal(binding.dossierId,dossierId);
  await pressRouteButton(f,page,'返回');await click(f,'user-identity');await settleIdentityRoute(f);page=d.querySelector('#tisya-user-page');
  assert.equal(page.querySelector('[data-role-entry]').value,binding.dossierId);
  assert.equal(Object.keys((await f.w.Tisya.matrix.readDatabase()).state.tables.T_CHAR_DOSSIER).length,1);
  assert.deepEqual(f.w.Tisya.configuration.read().story.userBinding,binding);assert.deepEqual(f.ctx.powerUserSettings,native);assert.equal(requests.length,1);assert.equal(f.bookWrites(),1);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('manual preset navigation protects identity edits and does not reactivate Tisya until plugin enable',async()=>{
 const f=await setupIdentityRoute({cold:true,nativePresets:true}),d=f.w.document;
 try{
  f.presetHost.manager.selectPreset('0');await f.w.happyDOM.whenAsyncComplete();
  assert.equal(f.presetHost.manager.getSelectedPresetName(),'Other');
  let opened=0;d.querySelector('#ai-config-button .drawer-toggle').onclick=()=>opened++;
  const page=await openIdentityFromSettings(f);editIdentityField(f,'[data-identity-wish]','尚未保存的心愿');
  routeButton(page,'打开预设设置').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opened,0);
  await pressRouteButton(f,unsavedDialog(f),'继续编辑');assert.equal(opened,0);
  assert.equal(page.querySelector('[data-identity-wish]').value,'尚未保存的心愿');
  routeButton(page,'打开预设设置').click();await f.w.happyDOM.whenAsyncComplete();await pressRouteButton(f,unsavedDialog(f),'放弃修改');
  assert.equal(opened,1);assert.equal(f.ctx.powerUserSettings.persona_description,'原心愿');
  assert.equal(f.presetHost.manager.getSelectedPresetName(),'Other');assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('cold-start identity omits retired origin recovery and preserves existing native and form data',async()=>{
 const f=await setupIdentityRoute({cold:true,nativePresets:true}),d=f.w.document;
 try{
  const original=structuredClone(f.ctx.powerUserSettings),page=await openIdentityFromSettings(f),before=await f.w.Tisya.matrix.readDatabase();
  assert.equal(page.querySelector('[data-legacy-origins]'),null);
  assert.equal(page.querySelector('[data-origin-reviewed]'),null);
  assert.equal([...page.querySelectorAll('button')].some(b=>/核对未完成的原点绑定/.test(b.textContent)),false);
  assert(page.querySelector('[data-identity-wish]'));assert(page.classList.contains('tisya-matrix-identity'));
  assert.deepEqual(f.ctx.powerUserSettings,original);assert.deepEqual(await f.w.Tisya.matrix.readDatabase(),before);
  assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);assert.equal(f.bookWrites(),0);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('explicit retired origin target cannot invoke the removed recovery adapter or write either data owner',async()=>{
 const f=await setupIdentityRoute(),d=f.w.document;
 try{
  const ref={book:'旧原点书',originId:'origin-a',id:'person-a',rev:3},seen=[],before=await f.w.Tisya.matrix.readDatabase(),native=structuredClone(f.ctx.powerUserSettings);
  f.w.tableService.previewIdentityOrigin=async value=>{seen.push(structuredClone(value));throw Error('retired origin adapter must remain unreachable');};
  f.w.requestedOrigin=ref;await f.w.eval('openIdentity(window.requestedOrigin)');await settleIdentityRoute(f);
  const page=d.querySelector('#tisya-user-page');assert(page.classList.contains('tisya-matrix-identity'));assert.equal(page.querySelector('.tisya-user'),null);
  assert.deepEqual(seen,[]);assert.equal(page.querySelector('[data-legacy-origins]'),null);assert.equal(page.querySelector('[data-origin-reviewed]'),null);
  assert.deepEqual(f.ctx.powerUserSettings,native);assert.deepEqual(await f.w.Tisya.matrix.readDatabase(),before);assert.equal(f.bookWrites(),0);assert.deepEqual(f.errors,[]);
 }finally{
  const page=d.querySelector('#tisya-user-page');if(page)await pressRouteButton(f,page,'取消修改');
  f.w.eval('clearNotebook()');await f.w.happyDOM.abort();
 }
});

test('identity keeps native editing available when the existing database cannot be read and never creates old tables',async()=>{
 const f=await setup(),d=f.w.document;
 try{
  const id=f.ctx.chatMetadata.tisya_engine.chat_uid;await f.matrixStorage.set(id,undefined);
  await click(f,'menu');await click(f,'user-identity');await settleIdentityRoute(f);const page=d.querySelector('#tisya-user-page');
  assert(page.classList.contains('tisya-matrix-identity'));assert(page.querySelector('[data-identity-wish]'));
  assert.match(page.querySelector('[data-database-identity]').textContent,/暂不可读/);
  assert(routeButton(page,'原生身份管理'));assert.equal(page.getAttribute('aria-busy'),'false');
  assert.equal(f.ctx.extensionSettings.缇斯亚配置,undefined);assert.equal(await f.matrixStorage.get(id),undefined);
 }finally{await f.w.happyDOM.abort();}
});

test('Matrix identity production route saves mixed profile, wish and story binding through its only save and reads them back',async()=>{
 const f=await setupIdentityRoute(),d=f.w.document,history=structuredClone(f.ctx.chat),chatId=f.ctx.chatId;
 try{
  await click(f,'menu');await click(f,'settings-app');let settings=d.querySelector('#tisya-settings-app');
  await pressRouteButton(f,settings,'回复格式');
  const body=[...settings.querySelectorAll('label')].find(node=>node.textContent==='正文').querySelector('input');
  body.value='identity_route_body';body.dispatchEvent(new f.w.Event('input',{bubbles:true}));
  await pressRouteButton(f,settings,'用户身份');
  assert.equal(d.querySelector('#tisya-user-page'),null);assert(body.isConnected);
  await pressRouteButton(f,unsavedDialog(f),'保存并切换');
  let page=d.querySelector('#tisya-user-page');assert(page?.classList.contains('tisya-matrix-identity'));
  assert.equal(d.querySelectorAll('.tisya-unsaved-prompt').length,0);
  assert.equal(f.w.Tisya.configuration.read().tags.body,'identity_route_body');
  assert.deepEqual([...page.querySelectorAll('button')].filter(node=>node.textContent.includes('保存')).map(node=>node.textContent),['保存']);
  const beforeNative=structuredClone(f.ctx.powerUserSettings),beforeConfig=f.w.Tisya.configuration.read();
  editIdentityField(f,'[data-identity-name]','改后的身份');
  editIdentityField(f,'[data-identity-wish]','混改后的完整心愿');
  editIdentityField(f,'[data-wish-option="W00"]',true,'change');
  editIdentityField(f,'[data-avatar-mode]','bound','change');
  editIdentityField(f,'[data-role-entry]','route-character','change');await settleIdentityRoute(f);
  assert.deepEqual(f.ctx.powerUserSettings,beforeNative);assert.deepEqual(f.w.Tisya.configuration.read(),beforeConfig);
  await pressRouteButton(f,page,'保存');
  assert.equal(page.querySelector('[role=alert]'),null,page.querySelector('[role=alert]')?.textContent);
  const saved=f.w.Tisya.configuration.read();
  assert.equal(f.ctx.powerUserSettings.personas['native-a'],'改后的身份');
  assert.equal(f.ctx.powerUserSettings.persona_descriptions['native-a'].description,'混改后的完整心愿');
  assert.equal(f.ctx.powerUserSettings.persona_description,'混改后的完整心愿');
  assert.deepEqual(saved.story.play.choices.W,['W00','W07']);
  assert.equal(saved.story.userMode,'bound');assert.deepEqual(saved.story.userBinding,{database:true,entityId:'route-character',dossierId:'route-character'});
  assert.equal(saved.story.userName,'原角色');assert.equal(f.bookWrites(),0);
  d.querySelector('.tisya-sub-header [data-tisya-action="chat"]').click();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelectorAll('.tisya-unsaved-prompt').length,0);assert.equal(d.querySelector('#tisya-user-page'),null);
  page=await openIdentityFromSettings(f);
  assert.equal(page.querySelector('[data-identity-name]').value,'改后的身份');
  assert.equal(page.querySelector('[data-identity-wish]').value,'混改后的完整心愿');
  assert.equal(page.querySelector('[data-wish-option="W00"]').checked,true);
  assert.equal(page.querySelector('[data-avatar-mode]').value,'bound');assert.equal(page.querySelector('[data-role-entry]').value,'route-character');
  assert.equal(f.ctx.chatId,chatId);assert.deepEqual(f.ctx.chat,history);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('Matrix identity production route cancels a staged persona switch and all mixed changes without writing them',async()=>{
 const f=await setupIdentityRoute(),d=f.w.document;
 try{
  let page=await openIdentityFromSettings(f);
  const beforeNative=structuredClone(f.ctx.powerUserSettings),beforeConfig=f.w.Tisya.configuration.read(),beforeMetadata=structuredClone(f.ctx.chatMetadata),beforeDatabase=await f.w.Tisya.matrix.readDatabase();
  editIdentityField(f,'[data-identity-picker]','native-b','change');await f.w.happyDOM.whenAsyncComplete();await settleIdentityRoute(f);
  assert.equal(f.w.fixture.user_avatar,'native-a');assert.deepEqual(f.ctx.chatMetadata,beforeMetadata);
  editIdentityField(f,'[data-identity-name]','不应保存的名称');
  editIdentityField(f,'[data-identity-wish]','不应保存的心愿');
  editIdentityField(f,'[data-wish-option="W00"]',true,'change');
  editIdentityField(f,'[data-avatar-mode]','ensemble','change');
  editIdentityField(f,'[data-role-entry]','route-character','change');await settleIdentityRoute(f);
  editIdentityField(f,'[data-role-field="public_identity"]','不应保存的公开身份');
  routeButton(page,'前往缇斯亚助手创建人物').click();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelector('#tisya-assistant-slot'),null);
  await pressRouteButton(f,unsavedDialog(f),'继续编辑');assert(page.isConnected);
  assert.equal(page.querySelector('[data-role-field="public_identity"]').value,'不应保存的公开身份');
  await pressRouteButton(f,page,'取消修改');
  assert.deepEqual(f.ctx.powerUserSettings,beforeNative);assert.deepEqual(f.w.Tisya.configuration.read(),beforeConfig);
  assert.deepEqual(await f.w.Tisya.matrix.readDatabase(),beforeDatabase);
  assert.deepEqual(f.ctx.chatMetadata,beforeMetadata);assert.equal(f.w.fixture.user_avatar,'native-a');assert.equal(f.bookWrites(),0);
  assert.equal(page.querySelector('[data-identity-picker]').value,'native-a');assert.equal(page.querySelector('[data-identity-name]').value,'原身份');
  assert.equal(page.querySelector('[data-identity-wish]').value,'原心愿');assert.equal(page.querySelector('[data-wish-option="W00"]').checked,false);
  assert.equal(page.querySelector('[data-avatar-mode]').value,'generic');assert.equal(page.querySelector('[data-role-entry]').value,'');assert.equal(page.querySelector('[data-role-edit]'),null);
  d.querySelector('.tisya-sub-header [data-tisya-action="chat"]').click();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelectorAll('.tisya-unsaved-prompt').length,0);
  page=await openIdentityFromSettings(f);assert.equal(page.querySelector('[data-identity-picker]').value,'native-a');
  assert.equal(page.querySelector('[data-identity-wish]').value,'原心愿');assert.equal(page.querySelector('[data-avatar-mode]').value,'generic');
  assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('Matrix identity production route preserves an empty-registry wish on stay and failed leave-save, then saves and leaves on retry',async()=>{
 let failSave=false;
 const f=await setupIdentityRoute({empty:true,persistSettings:async()=>{if(failSave)throw Error('模拟宿主保存失败');return true;}}),d=f.w.document;
 try{
  let page=await openIdentityFromSettings(f);
  editIdentityField(f,'[data-identity-wish]','无身份注册表的心愿草稿');
  editIdentityField(f,'[data-wish-option="W00"]',true,'change');
  editIdentityField(f,'[data-avatar-mode]','ensemble','change');
  const chat=()=>d.querySelector('.tisya-sub-header [data-tisya-action="chat"]').click();
  chat();await f.w.happyDOM.whenAsyncComplete();
  await pressRouteButton(f,unsavedDialog(f),'继续编辑');
  assert.equal(d.querySelectorAll('.tisya-unsaved-prompt').length,0);assert(page.isConnected);
  assert.equal(page.querySelector('[data-identity-wish]').value,'无身份注册表的心愿草稿');
  assert.equal(f.ctx.powerUserSettings.persona_description,'原心愿');
  chat();await f.w.happyDOM.whenAsyncComplete();failSave=true;
  await pressRouteButton(f,unsavedDialog(f),'保存并切换');
  const failed=unsavedDialog(f);assert.match(failed.querySelector('[role="alert"]').textContent,/模拟宿主保存失败/);
  assert(page.isConnected);assert.equal(page.querySelector('[data-identity-wish]').value,'无身份注册表的心愿草稿');
  assert.equal(f.ctx.powerUserSettings.persona_description,'原心愿');assert.deepEqual(f.ctx.powerUserSettings.personas,{});
  failSave=false;await pressRouteButton(f,failed,'保存并切换');
  assert.equal(d.querySelectorAll('.tisya-unsaved-prompt').length,0);assert.equal(d.querySelector('#tisya-user-page'),null);
  assert.equal(f.ctx.powerUserSettings.persona_description,'无身份注册表的心愿草稿');
  assert.deepEqual(f.w.Tisya.configuration.read().story.play.choices.W,['W00','W07']);
  assert.equal(f.w.Tisya.configuration.read().story.userMode,'ensemble');
  page=await openIdentityFromSettings(f);assert.equal(page.querySelector('[data-identity-wish]').value,'无身份注册表的心愿草稿');
  assert.equal(page.querySelector('[data-avatar-mode]').value,'ensemble');assert.equal(f.bookWrites(),0);
  assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});


async function bindMatrixPhoneFixture(f){
  await f.w.Tisya.matrix.ensureDatabase();const db=await f.w.Tisya.matrix.readDatabase();
  await f.w.Tisya.matrix.commitDatabase({contextKey:db.contextKey,expectedRevision:db.revision,operationId:'pet-life-fixture',schema:PHONE_DATABASE_SCHEMAS,changes:[
   {tableId:'T_STATIC_WORLDS',recordId:'world-ui',values:{name:'UI世界'}},
   {tableId:'T_CHAR_DOSSIER',recordId:'ui-person',values:{name:'界面角色',manifest:'角色介绍。'}},
   {tableId:'T_SYS_ENTITIES',recordId:'ui-person',values:{kind:'character',origin_record_ref:'origin-ui-person'}},
   {tableId:'M_FIELD_REFERENCES',recordId:'origin-ui-person',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'ui-person',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'ui-person',reference_kind:'record',resolution_status:'resolved'}},
   {tableId:'T_STATIC_ITEMS_SKILLS',recordId:'ui-currency',values:{name:'星币',category:'currency'}},
   {tableId:'T_DYN_CURRENCY_BALANCES',recordId:'cash',values:{owner_ref:'ui-person',currency_ref:'ui-currency',balance:123.45}},
   {tableId:'X_PHONE_WORLD_CONFIG',recordId:'ui-world-phone',values:{world_ref:'world-ui',apps:['wallet','album'],currency_ref:'ui-currency'}}
  ]});
  const config=f.w.Tisya.configuration.read();config.story.userMode='bound';config.story.userBinding={database:true,entityId:'ui-person',dossierId:'ui-person'};config.story.phoneWorld={database:true,worldId:'world-ui'};await f.w.Tisya.configuration.save(config);
}

test('pet life entry initializes the selected Matrix profile in the original phone frame',async()=>{
 const f=await setup({mediaStorage:true}),d=f.w.document;
 try{
  await bindMatrixPhoneFixture(f);
  assert.equal(f.w.phoneOptions.getLifeDesktop().apps[0].id,'home');
  assert.equal(f.w.phoneOptions.onOpenApp('life:wallet'),true);await f.w.happyDOM.whenAsyncComplete();
  // The production Matrix bridge uses IndexedDB tasks outside Happy DOM's scheduler.
  for(let i=0;i<300&&!d.querySelector('#tisya-phone-host-slot iframe')&&!f.errors.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  const frame=d.querySelector('#tisya-phone-host-slot iframe');assert.ok(frame,JSON.stringify(f.errors));assert.equal(new URL(frame.src).searchParams.get('app'),'wallet');assert.equal(new URL(frame.src).searchParams.get('chat'),chatKey(f.ctx));
  const service=await f.w.Tisya.phone.service(),life=service.readLife();assert.equal(life.state.wallet.accounts[0].balance,12345);assert.equal(life.binding.carrier.id,'a.png');assert.equal(life.binding.character.entityId,'ui-person');assert.equal(f.w.phoneOptions.getLifeDesktop().apps.length,2);const after=await f.w.Tisya.matrix.readDatabase();assert.equal(after.state.tables.T_DYN_CURRENCY_BALANCES.cash.values.balance,123.45);assert.equal(Object.keys(after.state.tables.T_DYN_CURRENCY_BALANCES).length,1);assert.equal(f.ctx.chatMetadata['缇斯亚虚拟手机'],undefined);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});


test('canonical phone history events refresh the cached phone without legacy metadata',async()=>{
 const f=await setup({mediaStorage:true});
 try{
  await bindMatrixPhoneFixture(f);const service=await f.w.Tisya.phone.service();await f.w.Tisya.phone.initializeLife();
  assert.equal(f.ctx.chatMetadata['缇斯亚虚拟手机'],undefined);
  assert.equal(service.readLife().state.wallet.accounts[0].balance,12345);
  f.ctx.chat.push({is_user:true,mes:'下一时点'});
  const db=await f.w.Tisya.matrix.readDatabase();
  await f.w.Tisya.matrix.commitDatabase({contextKey:db.contextKey,expectedRevision:db.revision,operationId:'phone-later-balance',changes:[{tableId:'T_DYN_CURRENCY_BALANCES',recordId:'cash',values:{balance:100}}]});
  await service.refresh();assert.equal(service.readLife().state.wallet.accounts[0].balance,10000);
  f.ctx.chat.pop();await f.emit('deleted');
  for(let i=0;i<100&&service.readLife().state.wallet.accounts[0].balance!==12345&&!f.errors.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(service.readLife().state.wallet.accounts[0].balance,12345);
  assert.equal((await f.w.Tisya.matrix.readDatabase()).state.tables.T_DYN_CURRENCY_BALANCES.cash.values.balance,123.45);
  assert.equal(f.ctx.chatMetadata['缇斯亚虚拟手机'],undefined);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('history events preserve the automatically bound engine without initializing absent phone rows',async()=>{
 const f=await setup();
 try{
  for(const event of ['edited','deleted','swiped','chat'])await f.emit(event);
  await new Promise(resolve=>setTimeout(resolve,30));
  const database=await f.w.Tisya.matrix.peekDatabase();assert(database);
  assert.equal(database.state.tables.X_PHONE_BINDINGS?.['phone-current'],undefined);
  assert.equal(f.ctx.chatMetadata['缇斯亚虚拟手机'],undefined);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

async function dirtySettingsForPhoneNavigation(f){
 await click(f,'menu');await click(f,'settings-app');
 const page=f.w.document.querySelector('#tisya-settings-app');
 await pressRouteButton(f,page,'回复格式');
 const body=[...page.querySelectorAll('label')].find(node=>node.textContent==='正文').querySelector('input');
 body.value='phone_navigation_draft';body.dispatchEvent(new f.w.Event('input',{bubbles:true}));
 return {page,body,before:f.w.Tisya.configuration.read()};
}

test('direct phone opening waits for the settings leave decision and cancellation keeps the draft',async()=>{
 const f=await setup(),d=f.w.document;
 try{
  const {page,body,before}=await dirtySettingsForPhoneNavigation(f);
  const opening=f.w.Tisya.phone.open();await f.w.happyDOM.whenAsyncComplete();
  assert(page.isConnected,'phone must not replace settings before confirmation');
  assert.equal(d.querySelector('#tisya-phone-host-slot'),null);
  await pressRouteButton(f,unsavedDialog(f),'继续编辑');
  assert.equal(await opening,false);assert(page.isConnected);assert.equal(body.value,'phone_navigation_draft');
  assert.deepEqual(f.w.Tisya.configuration.read(),before);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('direct phone close waits for the settings leave decision and only hides after confirmed discard',async()=>{
 const f=await setup(),d=f.w.document;
 try{
  const {page,before}=await dirtySettingsForPhoneNavigation(f);
  const closing=f.w.Tisya.phone.close();await f.w.happyDOM.whenAsyncComplete();
  assert(page.isConnected,'a Promise is not leave permission');
  await pressRouteButton(f,unsavedDialog(f),'放弃修改');
  assert.equal(await closing,true);assert.equal(d.querySelector('#tisya-settings-app'),null);
  assert.deepEqual(f.w.Tisya.configuration.read(),before);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('life setup entry retains the boolean dispatch contract while awaiting the settings leave decision',async()=>{
 const f=await setup(),d=f.w.document;
 try{
  const {page,body,before}=await dirtySettingsForPhoneNavigation(f);
  assert.equal(f.w.phoneOptions.onOpenApp('life:setup'),true);
  await f.w.happyDOM.whenAsyncComplete();assert(page.isConnected);assert.equal(d.querySelector('#tisya-user-page'),null);
  await pressRouteButton(f,unsavedDialog(f),'继续编辑');
  assert(page.isConnected);assert.equal(body.value,'phone_navigation_draft');
  assert.deepEqual(f.w.Tisya.configuration.read(),before);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

function editExtensionField(f,selector,value){
 const node=f.w.document.querySelector('#tisya-story-resources '+selector);assert(node,`missing presentation field: ${selector}`);
 if(node.type==='checkbox')node.checked=value;else node.value=value;
 node.dispatchEvent(new f.w.Event('input',{bubbles:true}));return node;
}

test('identity production route owns presentation fields in its scroll region and saves both through one footer',async()=>{
 const f=await setupIdentityRoute(),d=f.w.document;
 try{
  await bindMatrixPhoneFixture(f);let page=await openIdentityFromSettings(f);
  const content=page.querySelector('.tisya-identity-content'),presentation=d.querySelector('#tisya-story-resources');
  assert(content.contains(presentation),'all same-page fields must scroll above the common footer');
  assert.equal(page.querySelectorAll('.tisya-settings-actions').length,1);
  assert.deepEqual([...page.querySelectorAll('button')].filter(node=>node.textContent==='保存').map(node=>node.textContent),['保存']);
  editIdentityField(f,'[data-identity-wish]','同时保存论坛偏好的心愿');
  editExtensionField(f,'[data-extension-count]','3');editExtensionField(f,'[data-extension-enabled]',true);
  const before=await f.w.Tisya.matrix.readDatabase();assert.equal(Object.keys(before.state.tables[EXTENSION_PREFERENCE_TABLE]??{}).length,0);
  await pressRouteButton(f,page,'保存');
  assert.equal(page.querySelector('[role=alert]'),null,page.querySelector('[role=alert]')?.textContent);
  assert.equal(f.ctx.powerUserSettings.persona_descriptions['native-a'].description,'同时保存论坛偏好的心愿');
  const rows=Object.values((await f.w.Tisya.matrix.readDatabase()).state.tables[EXTENSION_PREFERENCE_TABLE]);
  assert.equal(rows.length,1);assert.equal(rows[0].values.generate_count,3);assert.equal(rows[0].values.enabled,true);
  assert.equal(rows[0].values.owner_ref,'ui-person');assert.equal(rows[0].values.world_ref,'world-ui');
  d.querySelector('.tisya-sub-header [data-tisya-action="chat"]').click();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelectorAll('.tisya-unsaved-prompt').length,0);page=await openIdentityFromSettings(f);
  assert.equal(page.querySelector('[data-extension-count]').value,'3');assert.equal(page.querySelector('[data-extension-enabled]').checked,true);
  assert.equal(page.querySelector('[data-identity-wish]').value,'同时保存论坛偏好的心愿');assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('presentation-only edits participate in the identity route leave prompt and common cancel without writing',async()=>{
 const f=await setupIdentityRoute(),d=f.w.document;
 try{
  await bindMatrixPhoneFixture(f);const page=await openIdentityFromSettings(f),before=await f.w.Tisya.matrix.readDatabase();
  editExtensionField(f,'[data-extension-count]','9');
  const opening=f.w.Tisya.phone.open();await f.w.happyDOM.whenAsyncComplete();
  assert(page.isConnected);assert.equal(d.querySelector('#tisya-phone-host-slot'),null);
  await pressRouteButton(f,unsavedDialog(f),'继续编辑');assert.equal(await opening,false);
  assert.equal(page.querySelector('[data-extension-count]').value,'9');
  await pressRouteButton(f,page,'取消修改');
  assert.equal(page.querySelector('[data-extension-count]').value,'');
  assert.deepEqual(await f.w.Tisya.matrix.readDatabase(),before);
  d.querySelector('.tisya-sub-header [data-tisya-action="chat"]').click();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelectorAll('.tisya-unsaved-prompt').length,0);assert.equal(d.querySelector('#tisya-user-page'),null);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});


test('message display check stays read-only while generation runs and copies only diagnostic facts',async()=>{
 const f=await setup({mediaStorage:true}),d=f.w.document;
 try{
  const source=d.querySelector('#chat .mes_text');
  source.innerHTML='<div class="TH-render"><pre><code>PRIVATE_CARD_SOURCE</code></pre><div class="TH-collapse-code-block-button">显示前端代码块</div></div>';
  f.ctx.chat[0].mes='PRIVATE_CHAT_TEXT';
  const sourceBefore=source.outerHTML,chatBefore=structuredClone(f.ctx.chat),databaseBefore=await f.w.Tisya.matrix.readDatabase();
  let copied;Object.defineProperty(f.w.navigator.clipboard,'writeText',{value:async text=>{copied=text;}});
  f.setGenerating(true);await click(f,'more');await click(f,'msg-display-check');
  const report=JSON.parse(d.querySelector('#tisya-render-diagnostic').textContent);
  assert.equal(report.runtime.state,'code-only');assert.equal(report.counts.codeToggles,1);
  assert.equal(report.version,layout.VERSION);assert.equal(report.runtime.activeIframeCount,0);
  await click(f,'msg-display-check-copy');assert.deepEqual(JSON.parse(copied),report);
  assert.doesNotMatch(copied,/PRIVATE_CARD_SOURCE|PRIVATE_CHAT_TEXT/);
  assert.equal(source.outerHTML,sourceBefore);assert.deepEqual(f.ctx.chat,chatBefore);
  assert.deepEqual(await f.w.Tisya.matrix.readDatabase(),databaseBefore);
  assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});
