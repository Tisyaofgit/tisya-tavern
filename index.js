import {selectArchiveIdentity} from './v3/identity-selection.mjs';
import {resolveRuntimeConfiguration} from './v3/configuration.mjs';
import {createApplication} from './v3/application.mjs';
import {registerJourneyRoute} from './v3/journey-routes.mjs';
import {createNativeBookHost,BOOK_POINTER_KEY} from './v3/book-host.mjs';
import {createConfigurationBook} from './v3/configuration-book.mjs';
import {validateTagTemplateBank} from './v3/tags.mjs';
import {validateWorldbookPreferences} from './config/worldbook-preferences.js';
import {mountWorkbench} from './v3/workbench.mjs';
import {mountProgressBubble} from './v3/bubble.mjs';
import {CAPABILITIES} from './v3/capabilities.mjs';
import {makeRevision} from './revision.js';
let v3Application=null,v3BookHost=null,v3ConfigurationBook=null,v3Bubble=null,v3Installing=null,applyingInterface=false;
const v3Views=new Map();
import {nativePanelContentProcessor} from './native-panel-source.js';
import {selectChatReady,notifySelectedChatContent,chatSelectionDiagnostic,chatSelectionSummary} from './chat-selection.js';
import {createUiOperations,messageActionExclusive} from './ui-operation.js';
import {createGenerationOperations} from './generation-operation.js';
import {initializePresetConnection} from './preset-connection.js';
import {createGlobalFonts} from './global-fonts.js';
import {mountThemeWorkbench} from './theme-workbench.js';
import {messageCardCover} from './message-cover.js';
import {mountAssistantApp} from './assistant-app.js';
import {createIdentityService} from './user-identity-service.js';
import {createNativePersonaGateway} from './native-persona-gateway.js';
import {evaluateIdentityOnboarding,mountIdentityOnboarding} from './identity-onboarding.js';
import {mountIdentityPage} from './user-identity-page.js';
import {createWorldbookConditionGate} from './worldbook-conditions.js';
import {createPersonaGateway} from './tables/persona.js';
import {projectToolTurns} from '/scripts/tauritavern/tool-turn-projection.js';
import {user_avatar,initUserAvatar,setPersonaDescription,convertCharacterToPersona,initPersona,getUserAvatars} from '/scripts/personas.js';
import {createCharacterGroupHost} from './character-group-host.js';
import {installWorldbookOrder} from './worldbook-order.js';
import {createWorldbookConsole} from './worldbook-console.js';
import {settingsDestinations} from './settings-navigation.js';
import {mountSettingsHome} from './settings-home.js';
import {hideFullPanels,hideAllPanels,refreshPanelFonts} from './panel-surface.js';
import {createUserEditHistory,installUserEditHistory,userRevisionMaterial,userRerollTarget} from './user-revision.js';
import {directoryState,directoryEntry,directoryToken,changeDirectory,mountDirectoryHold} from './home-directory.js';
import {deleteCharacterChatByName,closeCurrentChat,default_user_avatar} from '/script.js';
import {createChatLoadingController,mountChatLoadingSettings} from './chat-loading.js';
import {select_group_chats} from '/scripts/group-chats.js';
import {power_user} from '/scripts/power-user.js';
import {isBoundedChatSurfaceView,getThumbnailUrl} from '/script.js';
import {mountHome} from './home.js';
import {timestampToMoment} from '/scripts/utils.js';
import {resetNativePanelSources} from './native-panels.js';
import {immersiveState,immersiveSupported} from './fullscreen.js';
import {createCommunication,mountCommunication,readTurnDirection} from './communication.js';
import {createRevisionController,candidatePosition} from './revision.js';
import {startReaderCache,clearReaderCache,prepareReaderMessage,reconcileReaderCache,readerCacheGeneration} from './reader.js';
import {messageCacheOwner} from './message-cache.js';
import {mountParagraphActions,LONG_PRESS_TOOLS,longPressSlots} from './paragraph-actions.js';
import {mountRevisionEditor} from './revision-ui.js';
import {branchChat} from '/scripts/bookmarks.js';
import {createTextTransport} from './config/text-transport.js';
import {interfaceSnapshot,validateInterfaceSettings} from './tables/interface-config.js';
import {createNativeConfiguration,createRegexGate} from './tables/native-config.js';
import {SLOT_TARGETS} from './tables/slots.js';
import {createNativeVectors} from './tables/vectors.js';
import {appendFileContent} from '/scripts/chats.js';
import {yaml} from '/lib.js';
import {configureReplyFormats} from './reply-formats.js';
import {GENERATION_CONTRACTS,MODE_CONTRACT,ARCHIVE_CONTRACT,validateGeneratedTask} from './config/contracts.js';
import {loadAgentSystemSettings} from '/scripts/tauritavern/agent/agent-system-settings.js';
import {createStore,register,registry,worldKey,configuredWorld,emptyConfig} from './config/core.js';
import {createHost,blockPayload} from './config/host.js';
import {mountConfiguration} from './config/panel.js';
import {preferNativeBeauty,createNativeBodyFormatter} from './native-beauty.js';
import {createNativeDisplayPipeline} from './native-display.js';
import {getRegexScripts,getRegexedString,RegexProvider,isScopedScriptsAllowed,allowScopedScripts,isPresetScriptsAllowed,allowPresetScripts} from '/scripts/extensions/regex/engine.js';
import {readNarrative} from './narrative-bridge.js';
import {createNarrativeBridge,registerLivePreset,isLivePreset} from './narrative-bridge.js';
import {mountSettingsApp} from './settings-app.js';
import {appearanceValues,appearanceOverrides,withAppearanceOverrides} from './appearance-settings.js';
import {saveCharacterChatMetadata,saveGroupChatMetadata} from '/scripts/chat-payload-transport.js';
import {emotionCatalog,mountEmotionAtlas} from './emotion-catalog.js';
import {ACTION_MODES,executeAction} from './actions.js';
import {mountMessageAppearance,mountChatEffects} from './message-ui.js';
import {mountPet} from './pet.js';
import { iconMarkup } from './icons.js';
import { mountMessageNavigation } from './navigation.js';
import {mountInputShortcuts} from './input-shortcuts.js';
import {createEditToolbarPlacement} from './edit-toolbar.js';
let inputShortcuts=null,communicationUI=null,revisionEditor=null,paragraphActions=null;
const revisionDrafts=new Map();
let editToolbarPlacement=null;
import { mountMessageReader } from './reader.js';
import { mountNotebook } from './notebook.js';
import { getContext } from '/scripts/st-context.js';
import { promptManager,createGenerationParameters,proxies } from '/scripts/openai.js';
import { registerPresetProtocol } from './preset.js';
import { setUserName, setExtensionPrompt, isGenerating, Generate, swipe, deleteSwipe, messageEdit, hydrateChatMessageSwipes, isMessageSwipeable, getOverswipeBehavior, messageFormatting, substituteParams, substituteParamsExtended, sendTextareaMessage, saveSettings, enqueueChatSave, persistedChatMetadata, waitForGenerationIdle } from '/script.js';
import { getAgentGenerationOptions } from '/scripts/tauritavern/agent/agent-generation-router.js';
import { hasActiveAgentRun } from '/scripts/tauritavern/agent/agent-run-controller.js';
import { capture, validate, groupContacts } from './model.js';
import { loadReadingFont } from './font.js';
import { VERSION, SECTIONS, drawerEntries, chatPreview, chatTitle, mountLayout, installComposer } from './layout.js';

const KEY = '缇斯亚界面';
configureReplyFormats({yaml});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const query = selector => document.querySelector(selector);
const iconButton = (text, action, icon, extraClass="") => `<button type="button" class="tisya-icon-button ${esc(extraClass)}" data-tisya-action="${esc(action)}" aria-label="${esc(text)}" title="${esc(text)}">${iconMarkup(icon)}${extraClass.includes('tisya-orb-button')?`<small class="tisya-orb-caption" aria-hidden="true">${esc(text==='重投下一条'?'重投下一条':({regen:'重骰','msg-regen':'重骰',next:'继续','msg-next':'继续','msg-revision':'高级','msg-read':'阅读','msg-edit':'改写','msg-rollback':'回溯','msg-delete':'删除','msg-branch':'分支','msg-copy':'复制',more:'更多','message-tools':'设置','candidate-prev':'上版','candidate-next':'下版'})[action]??text.slice(0,2))}</small>`:''}</button>`;
const button = (text, action) => `<button type="button" data-tisya-action="${esc(action)}">${esc(text)}</button>`;
let layout, top, controls, messageNavigation, releaseReader, readerToken, notebook, appearance, chatEffects, pet;
const assistantViews=new Map(),configurationViews=new Map();
let motionEnabled=true,utility=null,nativeDisplay=null,homeView=null;
const getAppearance=owner=>appearanceValues(settings(),owner);
const getDisplay=()=>getAppearance('extensions');
const getPlayerName=()=>context().name1??null;
let displaySaving=false;
async function saveDisplayPreference(field,value,expected,owner='extensions'){if(displaySaving)throw Error('阅读设置正在保存');if(getAppearance(owner)[field]!==expected)throw Error('阅读设置已在其他位置修改，请重新点击');displaySaving=true;try{await saveInterfaceSettings(withAppearanceOverrides(settings(),owner,{...appearanceOverrides(settings(),owner),[field]:value}));}finally{displaySaving=false;}}
const visualError=err=>console.warn('[Tisya visual]',err);
function refreshVisuals(){document.body.classList.toggle('tisya-motion-paused',!motionEnabled||document.hidden);nativeDisplay?.refresh();appearance?.refresh();chatEffects?.refresh();pet?.refresh();homeView?.refreshMotion(motionEnabled&&getAppearance('extensions').动画效果,getDisplay());}
const uiOperations=createUiOperations();
let nativeGenerationEpoch=0;
let root, overlay, observer, enabled = true, generationBusy = false, cleanups = [], renderEpoch = 0, sheetEpoch = 0;
let managed = false, participant, fontController, releaseFont, fontState='使用默认字体';
let globalFonts=null;
function fontsService(){return globalFonts??=createGlobalFonts(document,{getSettings:settings,saveSettings:saveInterfaceSettings,headers:()=>context().getRequestHeaders(),onError:error});}
const FONT_URLS=Array.from({length:4},(_,i)=>new URL(`./font/reading.part${i+1}.bin`,import.meta.url).href);
async function startFont(){
 if(fontController)return;const controller=new AbortController();fontController=controller;
 const timer=setTimeout(()=>controller.abort(),120000);
 try{releaseFont=await loadReadingFont({urls:FONT_URLS,headers:()=>context().getRequestHeaders(),signal:controller.signal,onState:text=>{fontState=text;const el=query('#tisya-font-state');if(el)el.textContent=text;}});await fontsService().refresh();refreshPanelFonts(document);appearance?.refresh();}
 catch(err){if(enabled){fontState='使用默认字体 · '+String(err.message??err);error(err);const el=query('#tisya-font-state');if(el)el.textContent=fontState;}}
 finally{clearTimeout(timer);if(fontController===controller)fontController=null;}
}
const context = () => getContext();
const configStore=createStore({getContext:context,persist:saveSettings,assertIdle,legacy:()=>readNarrative(context()).settings});
let worldbookOrder=null;
let requiredPreset=null;
async function mandatoryPresetSource(){if(!requiredPreset){const response=await fetch(new URL('./presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url));if(!response.ok)throw Error('必需协议加载失败，请更新并重启扩展');requiredPreset=await response.json();}return {prompts:requiredPreset.prompts,order:requiredPreset.prompt_order[0].order};}
const textTransport=createTextTransport({target:window});
const configHost=createHost({projectToolTurns,openArchiveQuery:(task,input,options)=>{if(task!=='tableAssistant')throw Error('此任务没有档案工具授权');if(!v3Application)throw Error('缇斯亚正在初始化');return v3Application.openAssistantArchiveQuery(input,options);},getContractorMessages:()=>communication.directions(),transport:textTransport,getContext:context,getSource:presetSource,getBaseSource:mandatoryPresetSource,prepareMessage:m=>appendFileContent(m,String(m.mes??'')),parseRequestBody:s=>typeof yaml.parse==='function'?yaml.parse(s):yaml.load(s),store:configStore,createParameters:createGenerationParameters,getProxies:()=>proxies,getMoods:()=>emotionCatalog(document).names(),isAgentEnabled:async()=>(await loadAgentSystemSettings()).agentModeEnabled,onError:error});
const nativeConfiguration=createNativeConfiguration({getContext:context,regexGate:createRegexGate({getContext:context,isScopedScriptsAllowed,allowScopedScripts,isPresetScriptsAllowed,allowPresetScripts,saveSettings})});
const personaGateway=createPersonaGateway({getContext:context,getAvatar:()=>user_avatar,applyActive:(id,name)=>{initUserAvatar(id);setUserName(name,{toastPersonaNameChange:false});setPersonaDescription();},persist:saveSettings});

let tableGeneration=false,preparationError=null;
globalThis.tisyaHistoryInput=async(chat,size,abort,type)=>{if(['quiet','impersonate'].includes(type))return;abort(true);throw Error('缇斯亚尚未完成初始化，请查看助手中的资料绑定');};
function error(err) { console.error('[Tisya UI]', err); window.toastr?.error(String(err.message ?? err), '缇斯亚界面'); }
function settings() {
    const s = context().extensionSettings[KEY];
    if (s === undefined) return { 联系人分组: {} };
    if (!s || typeof s !== 'object' || !s.联系人分组 || typeof s.联系人分组 !== 'object' || Array.isArray(s.联系人分组)) throw new Error('缇斯亚界面配置损坏；已停止读取');
    if(s.继续用户消息!==undefined&&typeof s.继续用户消息!=='string')throw new Error('继续设置损坏');
    return s;
}
function getActionMode(){const value=settings().行动建议?.写入方式??'续接输入框';const row=ACTION_MODES.find(row=>row.label===value);if(!row)throw Error('行动写入方式配置损坏');return row.id;}
async function setActionMode(mode){const row=ACTION_MODES.find(row=>row.id===mode);if(!row)throw Error('行动写入方式无效');const next=structuredClone(settings());next.行动建议={...(next.行动建议??{}),写入方式:row.label};await saveInterfaceSettings(next);}
const generationOperations=createGenerationOperations({waitForIdle:()=>waitForGenerationIdle()});
const communication=createCommunication({getContext:context,persist:persistConversationMetadata,request:(...args)=>configHost.request(...args),assertIdle,onChange:()=>communicationUI?.refresh()});
const userEditHistory=createUserEditHistory();
const revisionController={
 active:()=>v3Application?.host.busy()??false,navigating:()=>false,
 async generate(token,options){validate(context(),token,{tail:true});const host=await requireV3();
  if(token.id<context().chat.length-1){await host.branch({floor:token.id,swipeId:token.swipe??0});token=capture(context(),token.id);}
  const result=options===null?await host.reroll({floor:token.id}):await host.advancedReroll({floor:token.id,revision:makeRevision(token,options??{})});decorate();return result;},
 async select(token,index){validate(context(),token,{tail:true});const host=await requireV3();await host.selectSwipe({floor:token.id,swipeId:index});decorate();},
 async remove(token,index){validate(context(),token,{tail:true});const host=await requireV3();await host.deleteCandidate({floor:token.id,swipeId:index});decorate();},
 received(){},ended(){return false;},stopped(){v3Application?.host.cancel();}
};
async function requireV3(){if(!v3Application)await installV3();if(!v3Application)throw Error('缇斯亚初始化未完成');return v3Application.host;}

function assertIdle() {
    if (isGenerating() || hasActiveAgentRun() || generationBusy || revisionController.active() || communication.busy()) throw new Error('请先等待或停止正在进行的生成');
    if (query('#chat .mes.editing') || query('#chat .edit_textarea')) throw new Error('请先保存或取消消息编辑');
}
function clearReader() {releaseReader?.();releaseReader=null;readerToken=null;}
function checkReadingSource(){
    notebook?.checkCurrent();
    if(readerToken)try{validate(context(),readerToken);}catch{sheet('阅读已失效','<p role="status">原消息或候选已变化，请重新打开阅读。</p>');}
}
function clearNotebook(){closeDirectoryMenu();homeView?.dispose();homeView=null;notebook?.dispose();notebook=null;if(['assistant','configuration','v3-workbench'].includes(utility?.kind)){utility.setVisible?.(false);utility.root.remove();}else utility?.dispose();utility=null;}
function close(expectedEpoch = sheetEpoch) { if(expectedEpoch!==sheetEpoch)return;sheetEpoch++;clearReader();revisionEditor?.dispose();revisionEditor=null;if(overlay.open)overlay.close();overlay.replaceChildren();delete overlay._messageToken; }
function sheet(title, body) {
    closeDirectoryMenu();sheetEpoch++;
    clearReader();
    overlay.setAttribute('aria-label',title);
    overlay.innerHTML = `<div class="tisya-backdrop"><section class="tisya-sheet"><header><h2>${esc(title)}</h2>${button('关闭','close')}</header>${body}</section></div>`;
    if(!overlay.open)overlay.showModal();
    overlay.querySelector('.tisya-backdrop').addEventListener('click', e => { if (e.target.classList.contains('tisya-backdrop')) close(); });
}
function closeNativeDrawers(except=null) {
    for(const entry of drawerEntries(document)) {
        if(entry.element!==except&&entry.element.querySelector(':scope > .drawer-content.openDrawer'))entry.element.querySelector('.drawer-toggle')?.click();
    }
}
function hidePage() { hideFullPanels(document);renderEpoch++; clearNotebook();root.querySelector('.tisya-page').replaceChildren(); root.classList.remove('tisya-page-open'); refreshVisuals(); }
let worldbookConsole=null,characterGroup=null;
const nativePersona=createNativePersonaGateway({getContext:context,getAvatar:()=>user_avatar,fetch:(...args)=>window.fetch(...args),defaultAvatar:default_user_avatar,initPersona,persistSettings:saveSettings,readAvatarIds:()=>getUserAvatars(false)});
const identityNewChats=new Set(),identityPromptSeen=new Set();
const identityService=createIdentityService({nativePersona,getContext:context,getAvatar:()=>user_avatar,applyActive:(id,name)=>{initUserAvatar(id);setUserName(name,{toastPersonaNameChange:false});setPersonaDescription();},persistSettings:saveSettings,persistChat:()=>{const c=context();return persistConversationMetadata(c,{id:c.chatId,character:c.characterId,group:c.groupId,meta:c.chatMetadata});},afterSelect:async id=>{if(!v3Application)return;const b=await v3Application.books.binding();if(b.binding&&b.binding.player.id!==id)throw Error('请从资料绑定切换用户，以保持当前存档关联');},assertIdle:()=>{assertIdle();if(v3Application?.host.busy())throw Error('缇斯亚任务正在进行，请先完成或停止，再切换用户身份');},prepareArchiveSelection:id=>selectArchiveIdentity(v3Application?.books,context().powerUserSettings?.personas,id),convertCharacter:async id=>{const i=context().characters.findIndex(c=>c.avatar===id);if(i<0)throw Error('角色已不存在');return convertCharacterToPersona(i);},openNative:()=>nativeDrawerOriginal('persona-management-button'),openPage:()=>openIdentity(),onChanged:()=>{refreshIdentityNotice();v3Application?.configurationChanged();worldbookConsole?.refreshContext();const c=context(),event=c.eventTypes?.PERSONA_CHANGED;if(event)Promise.resolve(c.eventSource.emit(event,user_avatar)).catch(error);}});
function identityPrompt(){const state=identityService.read(),key=JSON.stringify(state.scope),target=state.scope.groupId!=null?{type:'group',id:state.scope.groupId}:{type:'character',id:state.scope.characterAvatar};const linked=state.personas.some(p=>p.descriptor?.connections?.some(x=>x.type===target.type&&String(x.id)===String(target.id)));const fresh=identityNewChats.has(key);return {state,key,fresh,model:evaluateIdentityOnboarding(state,{newChat:fresh||!linked})};}
function refreshIdentityNotice(){if(!root||!enabled)return;const {model}=identityPrompt();let notice=root.querySelector('.tisya-player-notice');if(!model.needed){notice?.remove();return;}if(!notice){notice=document.createElement('div');notice.className='tisya-player-notice';notice.setAttribute('role','status');notice.style.cssText='position:absolute;inset:auto 8px 8px;pointer-events:auto;z-index:3;max-width:640px;margin:6px auto;padding:8px 12px;border:1px solid #b7a46f66;background:#0d2b22;color:#e4ddc8;border-radius:8px;display:flex;gap:10px;align-items:center;justify-content:space-between;font:inherit';root.append(notice);}const text=model.kind==='new-card'?'为此卡创建或选择玩家角色':model.kind==='new-chat'?'新聊天：沿用或切换玩家角色':model.kind==='pending'?'玩家身份保存待核对':'当前聊天需要选择玩家角色';notice.innerHTML='<style>#tisya-shell.tisya-page-open>.tisya-player-notice{display:none!important}</style><span>'+esc(text)+'</span>'+button('查看','user-identity');}
function openIdentity(initialOrigin=null,{management=false}={}){if(!mayLeaveUtility())return false;const prompt=identityPrompt();close();closeNativeDrawers();hideAllPanels(document);renderEpoch++;page('用户身份','<div id="tisya-user-page"></div>');if(!initialOrigin&&!management&&prompt.model.needed){utility=mountIdentityOnboarding(query('#tisya-user-page'),{service:identityService,newChat:prompt.fresh||prompt.model.kind==='new-card',onDone:()=>{identityNewChats.delete(prompt.key);refreshIdentityNotice();openIdentity(null,{management:true});},onManage:()=>openIdentity(null,{management:true}),onClose:()=>{if(mayLeaveUtility())nav();}});}else utility=mountIdentityPage(query('#tisya-user-page'),{service:identityService,initialOrigin,onBooks:()=>openWorkbench('books'),onNative:()=>nativeDrawerOriginal('persona-management-button'),onWorldbook:()=>openWorldbook(),onAtlas:()=>openSettings('tables','atlas'),onAssistant:task=>openAssistant(task),onClose:()=>nav()});refreshIdentityNotice();return true;}
function promptNewChatIdentity(){const state=identityService.read(),key=JSON.stringify(state.scope);if(!state.scope.chatId||identityPromptSeen.has(key))return;identityNewChats.add(key);refreshIdentityNotice();if(!enabled)return;const gate=utility?.kind==='configuration'?utility.requestSuspend():utility?.requestLeave?.();if(gate?.allowed===false)return;if(openWorkbench('books'))identityPromptSeen.add(key);}


function openAssistant(task=null){return openWorkbench(['home','review','books','archives','settings','genesis','extract','history','conditions','chat'].includes(task)?task:task==='idea'?'genesis':task==='core'?'extract':'assistant');}
function openWorkbench(initialPage='home'){
 if(!mayLeaveUtility())return false;

 if(!v3Application){installV3().then(()=>openWorkbench(initialPage)).catch(error);return false;}
 const key=JSON.stringify([worldKey(context()),context().chatMetadata?.[BOOK_POINTER_KEY]?.archiveId??null,user_avatar]);renderEpoch++;page('缇斯亚','<div id="tisya-workbench-slot"></div>');
 let view=v3Views.get(key);if(!view){view=mountWorkbench(document,query('#tisya-workbench-slot'),{capabilities:v3Application.capabilities,initialPage,stylesheetURL:new URL('./v3/workbench.css',import.meta.url).href,onClose:()=>hidePage()});v3Views.set(key,view);}
 else {query('#tisya-workbench-slot').append(view.root);view.resume().then(()=>view.navigate(initialPage)).catch(error);}
 utility=view;view.ready.catch(error);return true;
}
function v3Routes(){const routes={};
 for(const row of CAPABILITIES){const id=row.id;
  if(id.startsWith('drawer:'))routes[id]=()=>nativeDrawer(id.slice(7));
  else if(id.startsWith('settings-tab:'))routes[id]=()=>openSettings(id.slice(13));
 }
 return {...routes,'journey.openSource':openJourneySource,
 'configuration.status':()=>v3ConfigurationBook.read(),
 'configuration.hydrate':args=>v3ConfigurationBook.hydrate({initializeIfMissing:true,...args}),
 'configuration.previewRestore':args=>{v3Application.assertIdle();return v3ConfigurationBook.previewRestore(args);},
 'configuration.restore':args=>{v3Application.assertIdle();return v3ConfigurationBook.restore(args);},
 'configuration.discardRestore':args=>v3ConfigurationBook.discardRestore(args),
 'configuration.retryDraft':args=>{v3Application.assertIdle();return v3ConfigurationBook.retryDraft(args);},
 'configuration.discardDraft':()=>v3ConfigurationBook.discardDraft(),
 contacts:()=>openCharacterGroup(),'role-detail':({id}={})=>openCharacterGroup('character',id??context().characters[context().characterId]?.avatar),groups:()=>openCharacterGroup('group'),chat:()=>{close();hidePage();},home:()=>home(),phone:()=>{pet.setVisible(true);pet.setMode('folded');},'drawer:persona-management-button':()=>openIdentity(null,{management:true}),assistant:()=>openWorkbench('assistant'),'user-identity':()=>openWorkbench('books'),
 'settings-tab:tables':()=>openWorkbench('archives'),'role-library':()=>openCharacterGroup(),'group-library':()=>openCharacterGroup('group'),
 'settings-app':()=>openSettings(),'display-settings':openDisplaySettings,notes:()=>openNotebook('notes'),'display-cache':openChatLoading,
 'input-tools':()=>{close();closeNativeDrawers();hidePage();inputShortcuts?.open('slots');},'emotion-atlas':openEmotionAtlas,'pet-toggle':()=>{pet.setVisible(!pet.isVisible());},
 'motion-toggle':async()=>{await saveInterfaceSettings({...settings(),动态效果:!motionEnabled});},
 fullscreen:()=>{close();hidePage();nativeControl('#option_toggle_fullscreen');},'continue-settings':()=>{sheet('继续设置',`<label for="tisya-continue-text">自动发送的用户消息</label><textarea id="tisya-continue-text">${esc(settings().继续用户消息??'')}</textarea>${button('保存','save-continue')}`);},
 'selection-diagnostic':()=>showSelectionDiagnostic(),'context-overview':()=>openSettings('mode','overview'),'font-retry':startFont,disable:stopUI};
}
async function installV3(){
 if(v3Application)return v3Application;if(v3Installing)return v3Installing;
 v3Installing=(async()=>{
  await configHost.ensureRuntimePresets();
  v3BookHost=await createNativeBookHost({target:window,getContext:context,getHost:()=>v3Application?.host,getPlayerId:()=>user_avatar,
   assertIdle:()=>{if(isGenerating()||hasActiveAgentRun()||generationBusy)throw Error('请先等待当前操作完成');},
   readConfiguration:()=>{const data=configStore.cacheSnapshot()??emptyConfig(),key=worldKey(context()),world=configuredWorld(data,key);return resolveRuntimeConfiguration({snapshot:{data,key,world,revision:JSON.stringify(data)},target:window,context:context(),playerId:user_avatar});},
   invalidate:()=>v3Application?.configurationChanged()});
  v3ConfigurationBook=createConfigurationBook({books:v3BookHost.manager,store:configStore,getContext:context,getPlayerId:()=>user_avatar,
   readInterface:settings,applyInterface:applyInterfaceSettings,validateInterface:validateInterfaceSettings,domainValidators:{tagTemplates:validateTagTemplateBank,worldbookInterface:validateWorldbookPreferences},
   domainCaches:{worldbookInterface:{read:()=>context().extensionSettings['缇斯亚世界书']??{},apply:value=>{context().extensionSettings['缇斯亚世界书']=structuredClone(value);},defaultValue:{}}},
   onApplied:()=>{if(v3Application&&!v3Application.host.busy())v3Application.configurationChanged();}});
  try{await v3ConfigurationBook.hydrate({initializeIfMissing:true});}catch(err){if(!['GLOBAL_UNBOUND','UNBOUND','HOST_OWNER','CHAT_IDENTITY','CHAT_UNAVAILABLE','CHAT_REQUIRED','CONFIGURATION_NOT_READY'].includes(err.code))error(err);}
  v3Application=await createApplication({target:window,getContext:context,store:configStore,configHost,books:v3BookHost.manager,readWorldbook:(...args)=>v3BookHost.callbacks.transport.readFresh(...args),communication,getPlayerId:()=>user_avatar,
   configurationBook:v3ConfigurationBook,identityService,
   interfaceConfig:{read:()=>interfaceSnapshot(settings()),save:saveAssistantConfiguration},getChoices:()=>({connections:configHost.connections(),presets:configHost.presets()}),
   routes:v3Routes(),onSaved:()=>{appearance?.refresh();decorate();},onError:error,moods:()=>emotionCatalog(document).names(),
   assertIdle:()=>{if(isGenerating()||hasActiveAgentRun()||generationBusy)throw Error('请先等待当前操作完成');}});
  v3Bubble?.dispose();v3Bubble=mountProgressBubble(document,{pet,progress:v3Application.progress,capabilities:v3Application.capabilities,assistant:v3Application.assistant,
   isPanelOpen:()=>utility?.kind==='v3-workbench'&&utility.root.isConnected,onOpen:page=>openWorkbench(page??'review'),fallbackElement:document.querySelector('[data-tisya-action="assistant"]')});
  return v3Application;
 })();try{return await v3Installing;}finally{v3Installing=null;}
}

function returnToSettings(){if(!mayLeaveUtility())return false;nav();return true;}
function ensureCharacterGroup(){characterGroup??=createCharacterGroupHost({document,pins:{read:(type,id)=>directoryEntry(settings(),{avatar:type==='group'?'group:'+id:id}).置顶,write:async(type,id,enabled)=>saveInterfaceSettings(changeDirectory(settings(),directoryToken({avatar:type==='group'?'group:'+id:id}),{置顶:enabled?Date.now():null}))},getContext:context,assertIdle,persistSettings:saveSettings,onError:error,onSettings:returnToSettings,worldbookBlocked:()=>!!worldbookConsole?.hasDraft()||!!worldbookConsole?.isBusy(),openWorldbook:async id=>openWorldbook(id)});characterGroup.identity.connect(identityService);return characterGroup;}
function openCharacterGroup(type='character',id){close();closeNativeDrawers();ensureCharacterGroup().open({type,id});}

function openWorldbook(characterId){close();closeNativeDrawers();worldbookConsole??=createWorldbookConsole({configurationBook:v3ConfigurationBook,conditionEngine:{describeRules:()=>{if(!v3Application)throw Error('缇斯亚正在初始化');return v3Application.conditions.describeConditionRules();}},document,getContext:context,persistSettings:saveSettings,onError:error,onSettings:returnToSettings,openNative:()=>nativeDrawerOriginal('WI-SP-button'),characterLinks:ensureCharacterGroup().bindings});worldbookConsole.open(characterId);}
function nativeDrawer(key){if(key==='persona-management-button')return openIdentity();if(key==='WI-SP-button')return openWorldbook();return nativeDrawerOriginal(key)}
function nativeDrawerOriginal(key) {
    const entry=drawerEntries(document).find(entry=>entry.key===key);
    const target=entry?.element.querySelector('.drawer-toggle');
    if(!target)throw new Error('此版本缺少对应的原生入口');
    close();hideAllPanels(document); closeNativeDrawers(entry.element);
    if(!entry.element.querySelector(':scope > .openDrawer'))target.click();
}
function nativeControl(selector) {
    const target = query(selector);
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') throw new Error('原生操作当前不可用');
    close(); closeNativeDrawers(); hidePage();
    target.focus({preventScroll:true});
    target.click();
}
function sectionNode(selector){return selector.startsWith('.')?query(selector):document.getElementById(selector);}
function extensionSection(key) {
    const entry=SECTIONS.find(([id])=>id===key);
    const section=entry&&sectionNode(entry[1]);
    const toggle=section?.querySelector('.inline-drawer-toggle');
    if(!toggle)throw new Error('该扩展尚未就绪，可从“全部扩展与自动化”查看');
    nativeDrawer('extensions-settings-button');
    if(toggle.querySelector('.inline-drawer-icon.down'))toggle.click();
    requestAnimationFrame(()=>{if(enabled&&section.isConnected)section.scrollIntoView({block:'start',behavior:'auto'});});
}
function showSelectionDiagnostic(){
 const data={version:VERSION,managedSurface:managed,operation:uiOperations.state(),selection:chatSelectionDiagnostic()};
 page('会话进入诊断',`<p>${esc(chatSelectionSummary())}</p><p>只读取当前操作状态，不读取正文、不调用模型、不修改存档。</p><pre style="white-space:pre-wrap;user-select:text" id="tisya-selection-diagnostic">${esc(JSON.stringify(data,null,2))}</pre><div>${button('刷新诊断','selection-diagnostic')}${button('复制诊断','selection-diagnostic-copy')}</div>`);
}
function nav(){return openWorkbench('settings');}

function nativePanelAction(selector){
    const target=query(selector);
    if(!target||target.disabled||target.getAttribute('aria-disabled')==='true')throw Error('原生管理入口尚未就绪');
    nativeDrawer('rightNavHolder');target.click();
}
function groupPage(){
    renderEpoch++;
    const c=context(),groups=Array.isArray(c.groups)?c.groups:[];
    page('群聊',`<p class="tisya-page-intro">让不同的声音，在此相逢。</p><label class="tisya-sub-search">${iconMarkup('search')}<input class="tisya-search" placeholder="搜索群聊或成员" aria-label="搜索群聊"></label><section class="tisya-sub-card">${[...groups].sort((a,b)=>Number(!!b.fav)-Number(!!a.fav)).map(g=>{
        const members=(g.members??[]).map(avatar=>c.characters.find(x=>x.avatar===avatar||x.name===avatar)).filter(Boolean);
        const id=encodeURIComponent(String(g.id)),name=String(g.name||'未命名群聊');
        return `<div class="tisya-group-row" data-group="${esc(id)}" data-search="${esc([name,...members.map(m=>m.name)].join(' ').toLowerCase())}"><button class="tisya-group-open" type="button" data-tisya-action="group-open:${id}"><span class="tisya-group-avatars">${members.slice(0,3).map(m=>`<img src="${esc(getThumbnailUrl('avatar',m.avatar))}" alt="" loading="lazy">`).join('')||iconMarkup('group')}</span><span><strong>${esc(name)}</strong><small>${g.fav?'收藏 · ':''}${members.length} 位角色 · ${(g.chats??[]).length} 段会话</small></span></button><button type="button" class="tisya-directory-menu" data-tisya-action="group-menu:${id}" aria-expanded="false" aria-label="${esc(name)}操作菜单">&gt;</button></div>`;
    }).join('')||'<p class="tisya-empty">尚无群聊。</p>'}</section><footer>${button('创建群聊','group-create')}</footer>`);
}
function groupTarget(id){const group=context().groups?.find(g=>String(g.id)===decodeURIComponent(id));if(!group)throw Error('群聊已变化，请刷新');return group;}
function groupMenu(id){
    groupTarget(id);const row=[...root.querySelectorAll('[data-group]')].find(n=>n.dataset.group===id);if(!row)throw Error('群聊页面已变化');
    const open=row.querySelector('.tisya-directory-inline');
    root.querySelectorAll('.tisya-group-row .tisya-directory-inline').forEach(n=>n.remove());
    root.querySelectorAll('[data-tisya-action^="group-menu:"]').forEach(n=>n.setAttribute('aria-expanded','false'));
    if(open)return;
    const panel=document.createElement('div');panel.className='tisya-directory-inline';panel.setAttribute('role','group');panel.setAttribute('aria-label','群聊管理');
    panel.innerHTML=`<div class="tisya-directory-buttons">${button('资料与成员管理',`group-edit:${id}`)}${button('收起',`group-menu:${id}`)}</div>`;row.append(panel);row.querySelector('[aria-expanded]').setAttribute('aria-expanded','true');
}
async function openGroup(id){
    assertIdle();const group=groupTarget(id),epoch=renderEpoch;
    if(typeof context().openGroupChat!=='function')throw Error('此版本缺少群聊读取入口');
    await context().openGroupChat(group.id,group.chat_id);
    if(String(context().groupId)!==String(group.id))throw Error('宿主未切换到目标群聊');
    if(enabled&&epoch===renderEpoch){closeNativeDrawers();hidePage();}
}
function page(title, html) {
    hideFullPanels(document);clearNotebook();close(); closeNativeDrawers(); root.classList.add('tisya-page-open'); refreshVisuals();
    root.querySelector('.tisya-page').innerHTML = `<header class="tisya-sub-header">${button('‹ 会话','home')}<span>TISYA</span>${button('聊天 ›','chat')}</header><h2 class="tisya-sub-title">${esc(title)}</h2>${html}`;
    root.querySelector('.tisya-page').scrollTop=0;
}
function openNotebook(mode){
    renderEpoch++;
    page(mode==='memory'?'公开记忆':'会话手记',`<nav class="tisya-sub-tabs" aria-label="记录分类">${button('会话手记','notes')}${button('公开记忆','memory')}</nav><div id="tisya-notebook"></div>`);
    notebook=mountNotebook(document,query('#tisya-notebook'),{getContext:context,getDisplay,mode,onRead:openReader,onError:error,
    getJourney:options=>{if(!v3Application)throw Error('缇斯亚正在初始化');return v3Application.journey.read(options);},
    getJourneyTimeline:options=>v3Application.journey.timeline(options),getJourneyAnchor:options=>v3Application.journey.currentAnchor(options),onJourneySource:openJourneySource,onLocate:token=>{
        const node=nodeFor(token);close();closeNativeDrawers();hidePage();node.scrollIntoView({block:'start',behavior:'auto'});
    }});
}
function presetSource(){const c=context();return {identity:[c.chatCompletionSettings?.preset_settings_openai,query('#settings_preset_openai')?.value,c.characterId,c.groupId],prompts:c.chatCompletionSettings?.prompts??[],order:promptManager?.getPromptOrderForCharacter(promptManager.activeCharacter)??[]};}
async function persistConversationMetadata(c,t){return enqueueChatSave(async()=>{
 const live=context();if(live.chatId!==t.id||live.characterId!==t.character||live.groupId!==t.group||live.chatMetadata!==t.meta)throw Error('聊天已切换，旧页面未写入新聊天。');
 const metadata=persistedChatMetadata();if(t.group){await saveGroupChatMetadata({id:t.id,chatMetadata:metadata});}else{const card=c.characters[t.character];if(!card||card.chat!==t.id)throw Error('聊天目标已变化。');await saveCharacterChatMetadata({characterName:card.name,avatarUrl:card.avatar,fileName:t.id,chatMetadata:metadata});}return true;
 });}
function narrativeController(){return createNarrativeBridge({getContext:context,getSource:presetSource,assertIdle,persistGlobal:saveSettings,refreshPrompts:()=>promptManager.render(false),persistChat:persistConversationMetadata});}

async function saveAssistantConfiguration({data,revision,key,value,expected}){
 assertIdle();if(JSON.stringify(settings())!==expected)throw Error('界面配置已变化，请重新让助手核对');validateInterfaceSettings(value);
 if(!v3ConfigurationBook)throw Error('配置书尚未就绪');
 return v3ConfigurationBook.saveCombined({configuration:data,interface:value,configurationRevision:revision,key},v3ConfigurationBook.read());
}
function applyInterfaceSettings(value){
 applyingInterface=true;
 try{context().extensionSettings[KEY]=structuredClone(value);motionEnabled=value.动态效果!==false;if(pet&&pet.isVisible()!==(value.显示桌宠!==false))pet.setVisible(value.显示桌宠!==false);refreshVisuals();inputShortcuts?.refresh();messageNavigation?.update();if(root)decorate();}
 finally{applyingInterface=false;}
}
async function saveInterfaceSettings(next){assertIdle();validateInterfaceSettings(next);if(!v3ConfigurationBook)throw Error('配置书尚未就绪');return v3ConfigurationBook.saveDomain('interface',next,v3ConfigurationBook.read());}
const chatLoading=createChatLoadingController({powerUser:power_user,persist:saveSettings,assertIdle,isBounded:isBoundedChatSurfaceView,clearCache:async()=>{await clearReaderCache();nativeDisplay?.clear();},onApplied:count=>{for(const id of ['chat_truncation','chat_truncation_counter']){const input=document.getElementById(id);if(input)input.value=String(count);}}});
function openSettings(tab='play',initialView=''){
 if(tab==='tables')return openWorkbench(initialView==='assistant'?'assistant':initialView==='genesis'?'genesis':initialView==='foundation'?'extract':initialView==='history'?'history':initialView==='core'?'books':initialView==='conditions'?'conditions':'archives');
 if(tab==='theme'&&!context().chatId){if(!mayLeaveUtility())return;renderEpoch++;page('外观工坊','<div id="tisya-theme-workbench"></div>');utility=mountThemeWorkbench(document,query('#tisya-theme-workbench'),{getSettings:settings,saveAppearance:async(owner,value)=>saveInterfaceSettings(withAppearanceOverrides(settings(),owner,value)),saveAppearanceProfiles:async bank=>saveInterfaceSettings({...settings(),外观方案:bank}),fontService:fontsService(),onError:error});return;}
 if(!v3ConfigurationBook?.read().ready)return openWorkbench('books');
 if(!mayLeaveUtility())return false;
 const key=configStore.read().key;renderEpoch++;page(tab==='play'?'游玩偏好':'缇斯亚 · 设置','<div id="tisya-settings-app"></div>');
 const cached=configurationViews.get(key);if(cached){query('#tisya-settings-app').append(cached.root);utility=cached;cached.setVisible(true);cached.resume().then(()=>cached.navigate(tab,initialView)).catch(error);return true;}
 utility=mountConfiguration(document,query('#tisya-settings-app'),{store:configStore,host:configHost,runtimeV3:!!v3Application,getSettings:settings,onTables:()=>openWorkbench('archives'),initialTab:tab,initialView,version:VERSION,embedded:true,preserveOnClose:true,
 saveAppearance:async(owner,value)=>{await saveInterfaceSettings(withAppearanceOverrides(settings(),owner,value));messageNavigation?.update();},
 saveAppearanceProfiles:async bank=>saveInterfaceSettings({...settings(),外观方案:bank}),fontService:fontsService(),onApplied:()=>{v3Application?.configurationChanged();appearance?.refresh();decorate();},onClose:()=>nav(),onTitle:title=>{const heading=root.querySelector('.tisya-sub-title');if(heading)heading.textContent=title;},
 onIdentity:ref=>openIdentity(ref),onAssistant:task=>openAssistant(task),onNative:kind=>{if(kind==='agent')extensionSection('agent');else nativeDrawer(kind==='api'?'sys-settings-button':'ai-config-button');}
 });utility.kind='configuration';configurationViews.set(key,utility);utility.ready.catch(error);
}
function openDisplaySettings(){openSettings('theme');}
function openChatLoading(){renderEpoch++;page('聊天显示与缓存','<div id="tisya-chat-loading"></div>');utility=mountChatLoadingSettings(document,query('#tisya-chat-loading'),{controller:chatLoading});utility.ready?.catch(error);}
function openEmotionAtlas(){renderEpoch++;page('图鉴 · 内置表情','<div id="tisya-emotion-atlas"></div>');utility=mountEmotionAtlas(document,query('#tisya-emotion-atlas'));}
function mayLeaveUtility(){const state=['configuration','v3-workbench'].includes(utility?.kind)?utility.requestSuspend():utility?.requestLeave?.();if(state?.allowed===false){error(new Error(state.reason||'请先保存或放弃修改'));return false;}return true;}
function phoneApp(name){
    if(!enabled)return false;
    const routes={手记:()=>openNotebook('notes'),记忆:()=>openNotebook('memory'),通信:()=>{renderEpoch++;contacts();},生图:()=>extensionSection('image'),语音:()=>extensionSection('voice'),主题:openDisplaySettings,图鉴:openEmotionAtlas,协议:()=>nativeDrawer('advanced-formatting-button'),应用:()=>nativeDrawer('extensions-settings-button'),设置:()=>nav()};
    if(!Object.hasOwn(routes,name))return false;
    if(mayLeaveUtility())run(routes[name],{exclusive:false});return true;
}
function contacts() {
    const groups=groupContacts(context().characters,settings().联系人分组),prefs=settings();directoryState(prefs);
    page('角色', `<p class="tisya-page-intro">每一次相遇，都有新的故事。</p><label class="tisya-sub-search">${iconMarkup('search')}<input class="tisya-search" placeholder="搜索角色、分组或标签" aria-label="搜索角色"></label><section class="tisya-sub-card tisya-role-library">${[...groups].map(([group,cards])=>`<details open><summary>${esc(group)}<small>${cards.length} 位</small></summary>${cards.sort((a,b)=>(directoryEntry(prefs,b).置顶||0)-(directoryEntry(prefs,a).置顶||0)).map(card=>{
        const entry=directoryEntry(prefs,card),name=entry.名称||card.name;
        return `<div class="tisya-contact" data-directory="${esc(directoryToken(card))}" data-search="${esc([name,card.name,group,...card.tags].join(' ').toLowerCase())}"><button type="button" class="tisya-role-open" data-tisya-action="card:${card.id}"><img src="${esc(getThumbnailUrl('avatar',card.avatar))}" loading="lazy" alt=""><span><strong>${esc(name)}</strong><small>${entry.置顶?'置顶 · ':''}${esc(card.tags.join(' · ')||'查看会话')}</small></span></button><button type="button" class="tisya-directory-menu" data-tisya-action="directory-menu:${encodeURIComponent(directoryToken(card))}" aria-label="${esc(name)}操作菜单">&gt;</button></div>`;
    }).join('')}</details>`).join('')||'<p class="tisya-empty">还没有角色，导入一张角色卡开始。</p>'}</section><footer>${button('创建、导入与整理角色','role-library')}</footer>`);
}
let directoryTarget=null,directoryPanel=null,directoryRow=null,directoryRevision=0;
function closeDirectoryMenu(){
    directoryRevision++;directoryPanel?.remove();directoryPanel=null;
    directoryRow?.classList.remove('tisya-directory-expanded');
    directoryRow?.querySelector('[data-tisya-action^="directory-menu:"]')?.setAttribute('aria-expanded','false');
    directoryRow=null;directoryTarget=null;
}
function resolveDirectory(token){
    const target=JSON.parse(token),id=context().characters.findIndex(c=>c.avatar===target.avatar);
    if(id<0||typeof target.avatar!=='string'||(target.file!==undefined&&typeof target.file!=='string'))throw Error('目录目标已变化，请刷新');
    return {target,card:{...context().characters[id],id},chat:target.file===undefined?null:{file_name:target.file+'.jsonl'}};
}
function directoryBody(html){
    if(!directoryPanel?.isConnected)throw Error('目录页面已变化，请重新打开菜单');
    directoryRevision++;directoryPanel.innerHTML=html;
}
function directoryMenu(token){
    directoryState(settings());
    if(directoryTarget?.token===token&&directoryPanel?.isConnected){closeDirectoryMenu();return;}
    const {card,chat}=resolveDirectory(token),entry=directoryEntry(settings(),card,chat);
    const row=[...root.querySelectorAll('[data-directory]')].find(n=>n.dataset.directory===token);
    if(!row)throw Error('目录行已变化，请重新打开');
    closeDirectoryMenu();
    const origin=homeView?'home':root.querySelector('.tisya-search')?'contacts':'card';
    directoryTarget={token,origin,stamp:JSON.stringify(settings()),epoch:renderEpoch};
    directoryRow=row;row.classList.add('tisya-directory-expanded');
    row.querySelector('[data-tisya-action^="directory-menu:"]')?.setAttribute('aria-expanded','true');
    directoryPanel=document.createElement('div');directoryPanel.className='tisya-directory-inline';
    directoryPanel.setAttribute('role','group');directoryPanel.setAttribute('aria-label',(entry.名称||(chat?chatTitle(chat.file_name,card.name):card.name))+'操作');
    // A role summary owns its submenu even when its conversations are folded.
    // Prevent the summary default without cancelling editing/input focus.
    directoryPanel.addEventListener('click',event=>{if(!event.target.closest('button,input,label'))event.preventDefault();});
    row.append(directoryPanel);directoryButtons();
}
function directoryButtons(){
    const d=checkedDirectory(),entry=directoryEntry(settings(),d.card,d.chat);
    directoryBody(`<div class="tisya-directory-buttons">${button('改名','directory-rename')}${button(entry.置顶?'取消置顶':'置顶','directory-pin')}${!d.chat?button('分组','directory-group'):''}${button('删除','directory-delete')}${button('收起','directory-close')}</div>`);
}
function checkedDirectory(){
    if(!directoryTarget||directoryTarget.epoch!==renderEpoch||!directoryPanel?.isConnected)throw Error('目录页面已变化，请重新打开菜单');
    if(directoryTarget.stamp!==JSON.stringify(settings()))throw Error('目录设置已变化，请重新打开菜单');
    return {...resolveDirectory(directoryTarget.token),...directoryTarget,sheet:sheetEpoch,revision:directoryRevision};
}
function directoryRename(){
    const d=checkedDirectory(),entry=directoryEntry(settings(),d.card,d.chat);
    directoryBody(`<label for="tisya-directory-name">显示名称</label><input id="tisya-directory-name" maxlength="120" value="${esc(entry.名称||(d.chat?chatTitle(d.chat.file_name,d.card.name):d.card.name))}"><p>仅改列表显示名，留空恢复原名。</p><div class="tisya-directory-buttons">${button('保存','directory-save')}${button('返回','directory-back')}</div>`);
}
function directoryGroup(){const d=checkedDirectory();if(d.chat)throw Error('请从角色行设置分组');directoryBody(`<label for="tisya-directory-group-name">角色分组</label><input id="tisya-directory-group-name" maxlength="120" value="${esc(settings().联系人分组[d.card.avatar]??'未分组')}"><div class="tisya-directory-buttons">${button('保存','directory-group-save')}${button('返回','directory-back')}</div>`);}
async function directoryGroupSave(){const d=checkedDirectory(),name=query('#tisya-directory-group-name').value.trim();if(!name)throw Error('请输入分组名称');if(name.length>120)throw Error('分组最多120字');await saveInterfaceSettings({...settings(),联系人分组:{...settings().联系人分组,[d.card.avatar]:name}});await refreshDirectory(d);}
async function refreshDirectory(d){if(d.epoch!==renderEpoch||d.sheet!==sheetEpoch||d.revision!==directoryRevision)return;closeDirectoryMenu();if(d.origin==='home')await home();else if(d.origin==='contacts'){renderEpoch++;contacts();}else {const id=context().characters.findIndex(c=>c.avatar===d.target.avatar);if(id>=0)await showCard(id);else{renderEpoch++;contacts();}}}
async function directorySave(){const d=checkedDirectory(),name=query('#tisya-directory-name').value.trim();if(name.length>120)throw Error('名称最多120字');await saveInterfaceSettings(changeDirectory(settings(),d.token,{名称:name||null}));await refreshDirectory(d);}
async function directoryPin(){const d=checkedDirectory(),entry=directoryEntry(settings(),d.card,d.chat);await saveInterfaceSettings(changeDirectory(settings(),d.token,{置顶:entry.置顶?null:Date.now()}));await refreshDirectory(d);}
function directoryDeleteAsk(){const d=checkedDirectory();directoryBody(`<p class="tisya-directory-warning">${d.chat?'永久删除这段聊天记录？':'永久删除这张角色卡？关联聊天文件保留。'}此操作无法撤销。</p><div class="tisya-directory-buttons">${button('取消','directory-back')}${button('确认删除','directory-delete-confirm')}</div>`);}
async function directoryDelete(){
    assertIdle();const d=checkedDirectory();
    if(d.chat){
        const before=await listChats(d.card.id);if(d.epoch!==renderEpoch||d.sheet!==sheetEpoch||d.revision!==directoryRevision||!directoryPanel?.isConnected)throw Error('页面已变化，未删除会话');assertIdle();if(!before.some(c=>c.file_name.replace(/\.jsonl$/i,'')===d.target.file))throw Error('会话已不存在，请刷新');
        // Closing the active chat prevents a later autosave from recreating it.
        if(String(context().characterId)===String(d.card.id)&&context().chatId===d.target.file){if(!await closeCurrentChat())throw Error('当前聊天未能关闭，未删除');}
        const live=resolveDirectory(d.token);await deleteCharacterChatByName(live.card.id,d.target.file);
        if((await listChats(live.card.id)).some(c=>c.file_name.replace(/\.jsonl$/i,'')===d.target.file))throw Error('宿主未确认删除，会话仍在');
    }else{const manager=ensureCharacterGroup(),card=await manager.dispatch('read',{id:d.target.avatar});await manager.dispatch('delete',{type:'character',id:d.target.avatar,revision:card.revision,confirm:d.target.avatar,deleteChats:false});if(context().characters.some(c=>c.avatar===d.target.avatar))throw Error('宿主未确认角色已删除');}
    // The host has committed deletion; a failed preference save must not pretend rollback.
    const current=settings(),next=changeDirectory(current,d.token,{名称:null,置顶:null});
    try{await saveInterfaceSettings(next);}catch(e){error(new Error('内容已删除，但目录偏好清理未完成：'+e.message));}
    await refreshDirectory({...d,epoch:renderEpoch});
}
async function listChats(id, signal) {
    const card = context().characters[id];
    if (!card) throw new Error('角色卡已不存在');
    const response = await fetch('/api/characters/chats',{method:'POST',signal,headers:context().getRequestHeaders(),body:JSON.stringify({avatar_url:card.avatar,ch_name:card.name})});
    if (!response.ok) throw new Error(`读取会话失败 (${response.status})`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || data.error) throw new Error('读取会话返回了无效数据');
    return Object.values(data).filter(x=>x && typeof x.file_name === 'string');
}
async function showCard(id) {
    const card = context().characters[id];
    if (!card) throw new Error('角色卡已不存在');
    const epoch = ++renderEpoch;
    page(card.name,'<p>正在读取会话…</p>');
    const chats = await listChats(id);
    if (epoch !== renderEpoch || !enabled) return;
    if(context().characters[id]?.avatar!==card.avatar)throw Error('角色列表已变化，请重新打开');
    const prefs=settings();directoryState(prefs);const label=directoryEntry(prefs,card).名称||card.name;
    chats.sort((a,b)=>(directoryEntry(prefs,card,b).置顶||0)-(directoryEntry(prefs,card,a).置顶||0));
    page(label,`<div class="tisya-role-hero"><img src="${esc(getThumbnailUrl('avatar',card.avatar))}" alt=""><p>${esc(chatPreview(card.description||card.data?.description||'故事，仍在继续。'))}</p></div><section class="tisya-sub-card"><h3>会话 <small>${chats.length} 段</small></h3><div class="tisya-list tisya-chat-timeline">${chats.map((chat,i)=>{const entry=directoryEntry(prefs,card,chat);return `<div class="tisya-directory-row" data-directory="${esc(directoryToken(card,chat))}"><button type="button" class="tisya-chat-row" data-chat-index="${i}"><strong>${entry.置顶?'置顶 · ':''}${esc(entry.名称||chatTitle(chat.file_name,card.name))}</strong><small>${esc(chatPreview(chat.mes))}</small></button><button type="button" class="tisya-directory-menu" data-tisya-action="directory-menu:${encodeURIComponent(directoryToken(card,chat))}" aria-label="会话操作菜单">&gt;</button></div>`;}).join('') || '<p>还没有会话</p>'}</div></section><footer>${button('角色资料与会话管理',`select:${id}`)}</footer>`);
    root.querySelectorAll('[data-chat-index]').forEach(el=>el.addEventListener('click',()=>run(async()=>{assertIdle();if(context().characters[id]?.avatar!==card.avatar)throw Error('角色列表已变化，请重新打开');const file=chats[Number(el.dataset.chatIndex)].file_name.replace(/\.jsonl$/,'');await selectChatReady({getContext:context,id,file,onLateError:error,schedule:fn=>requestAnimationFrame(fn),cancel:id=>cancelAnimationFrame(id)});if(String(context().characterId)!==String(id)||context().chatId!==file)throw new Error('宿主未切换到目标会话');if(epoch===renderEpoch)hidePage();},{label:'打开所选会话'})));
}
async function home() {
    const epoch=++renderEpoch;
    const cards=context().characters.map((card,id)=>({id,avatar:card.avatar,name:card.name}));
    page('会话','');
    const owner=context();
    homeView=mountHome(document,root.querySelector('.tisya-page'),{
        cards,preferences:settings(),profile:{name:owner.name1,description:owner.powerUserSettings?.persona_description},
        current:()=>enabled&&epoch===renderEpoch,playing:motionEnabled&&getAppearance('extensions').动画效果,effects:getDisplay(),
        thumbnail:avatar=>getThumbnailUrl('avatar',avatar),onError:error,
        chatDate:value=>{if(value===undefined||value===null||value==='')return null;const date=timestampToMoment(value);return date.isValid()?{timestamp:date.valueOf(),day:date.format('MM/DD'),time:date.format('HH:mm')}:null;},
        listChats:async(card,signal)=>{
            if(context().characters[card.id]?.avatar!==card.avatar)throw Error('角色列表已变化，请刷新');
            const chats=await listChats(card.id,signal);
            if(context().characters[card.id]?.avatar!==card.avatar)throw Error('角色列表已变化，请刷新');
            return chats;
        },
        onSelect:(card,chat)=>run(async()=>{
            assertIdle();
            if(!enabled||epoch!==renderEpoch)throw Error('会话主页已关闭，请重新打开');
            if(context().characters[card.id]?.avatar!==card.avatar)throw Error('角色列表已变化，请刷新');
            const file=chat.file_name.replace(/\.jsonl$/,'');
            await selectChatReady({getContext:context,id:card.id,file,onLateError:error,schedule:fn=>requestAnimationFrame(fn),cancel:id=>cancelAnimationFrame(id)});
            if(String(context().characterId)!==String(card.id)||context().chatId!==file)throw Error('宿主未切换到目标会话');
            if(enabled&&epoch===renderEpoch)hidePage();
        },{label:'打开所选会话'})
    });
    await homeView.ready;
}

const MESSAGE_TOOLS=[
 ['regen','重骰','reroll','角色回复重新生成并保留旧候选；用户消息则重投下一条。较早楼层在新分支处理。'],
 ['next','继续','continue','从这条消息继续生成；选择较早楼层时会删除其后的消息，请先核对位置。'],
 ['msg-read','阅读与回合记录','book','打开本条消息的阅读页、回合状态与记忆记录。'],
 ['msg-edit','改写','edit','打开本条消息的原生编辑器，手动修改内容。'],
 ['msg-rollback','回溯 · 删除这条及以下全部','rollback','删除本条及其后所有消息，执行前会要求确认。'],
 ['msg-delete','删除本条','trash','仅删除这一条消息，执行前会要求确认。'],
 ['msg-branch','创建分支','branch','在本条消息处创建分支，保留原会话。'],
 ['msg-copy','复制消息正文','copy','复制这条原始消息文本到剪贴板。'],
 ['msg-revision','高级重骰','sliders','选段修改、补充发展方向或全篇润色，保留旧候选。'],
 ['more','更多','more','查看收起的消息操作，并进入按钮位置配置。']
];
function messageSlots(){const slots=settings().消息快捷栏??['regen','next','more'];if(!Array.isArray(slots)||!slots.includes('more')||new Set(slots).size!==slots.length||slots.some(id=>id!=='msg-native'&&!MESSAGE_TOOLS.some(t=>t[0]===id)))throw Error('消息快捷栏配置损坏；未覆盖设置');return slots.filter(id=>id!=='msg-native');}
function messageToolButton(id,action=id,user=false){const [,label,icon]=MESSAGE_TOOLS.find(t=>t[0]===id);return iconButton(user&&id==='regen'?'重投下一条':label,action,icon,'tisya-orb-button');}
function messageToolsEditor(token){
 const original=messageSlots();
 sheet('消息快捷栏',`<p>选择顺序与可见按钮；留空的操作收入更多。“更多”可放在任意位置。</p><div id="tisya-message-slots">${MESSAGE_TOOLS.map((_,i)=>`<label><span>位置 ${i+1}</span><select aria-label="消息位置 ${i+1}" aria-describedby="tisya-message-slot-help-${i}"><option value="">收起</option>${MESSAGE_TOOLS.map(([id,label])=>`<option value="${id}" ${original[i]===id?'selected':''}>${label}</option>`).join('')}</select><small id="tisya-message-slot-help-${i}"></small></label>`).join('')}</div><div id="tisya-message-tool-guide" aria-label="消息按钮说明">${MESSAGE_TOOLS.map(([id,label,icon,description])=>`<div data-tool-guide="${id}"><span class="tisya-message-icon-preview" aria-hidden="true">${iconMarkup(icon)}</span><div><strong>${esc(label)}</strong><p>${esc(description)}</p></div></div>`).join('')}</div>${button('全部收起','message-tools-collapse')}${button('全部展开','message-tools-expand')}${button('保存位置','message-tools-save')}`);
 overlay._messageToken=token;overlay._messageSlots=original;
 const selects=[...overlay.querySelectorAll('#tisya-message-slots select')];
 const describe=()=>selects.forEach(select=>{overlay.querySelector('#'+select.getAttribute('aria-describedby')).textContent=MESSAGE_TOOLS.find(t=>t[0]===select.value)?.[3]??'这个位置不显示按钮；对应操作仍可在“更多”中找到。';});
 overlay._describeMessageSlots=describe;
 selects.forEach(select=>select.onchange=()=>{if(select.value)for(const other of selects)if(other!==select&&other.value===select.value)other.value='';describe();});describe();
}
function longPressEditor(token){
 const original=longPressSlots(settings());
 sheet('长按菜单',`<p>配置长按后直接显示的操作及顺序；收起的操作仍在更多里。复制不会改动消息。</p><div id="tisya-longpress-slots">${LONG_PRESS_TOOLS.map((_,i)=>`<label>位置 ${i+1}<select aria-label="长按位置 ${i+1}"><option value="">收起</option>${LONG_PRESS_TOOLS.map(([id,label])=>`<option value="${id}" ${original[i]===id?'selected':''}>${label}</option>`).join('')}</select></label>`).join('')}</div>${button('保存位置','longpress-save')}`);
 overlay._messageToken=token;overlay._longPressSlots=original;
 const selects=[...overlay.querySelectorAll('#tisya-longpress-slots select')];
 selects.forEach(select=>select.onchange=()=>{if(select.value)for(const other of selects)if(other!==select&&other.value===select.value)other.value='';});
}
function messageToken(id) { return capture(context(),id); }
function messageMenu(node) {
    const id = Number(node.getAttribute('mesid'));
    const token = messageToken(id);
    const visible=messageSlots();sheet('消息操作',`<div class="tisya-message-actions" aria-label="更多消息操作">${MESSAGE_TOOLS.filter(([id])=>id!=='more'&&!visible.includes(id)).map(([id])=>messageToolButton(id,id==='regen'?'msg-regen':id==='next'?'msg-next':id,token.message.is_user)).join('')}${iconButton('配置消息快捷栏','message-tools','sliders','tisya-orb-button')}</div>`);
    overlay._messageToken = token;
}
function openCandidates(token){
 validate(context(),token,{tail:true});const pos=candidatePosition(token.message);
 sheet('回复版本',`<label>选择版本<select id="tisya-candidate-select" aria-label="选择版本">${Array.from({length:pos.total},(_,i)=>`<option value="${i}" ${i===pos.index?'selected':''}>第 ${i+1} 版${i===pos.index?' · 当前':''}</option>`).join('')}</select></label><div class="tisya-list">${button('切换','candidate-select')}${button('重写','candidate-rewrite')}${button('删除','candidate-delete')}</div>`);overlay._messageToken=token;query('#tisya-candidate-select').value=String(pos.index);
}
async function candidateAction(action){
 const token=overlay._messageToken;assertIdle();validate(context(),token,{tail:true});const index=action==='candidate-delete-confirm'?overlay._candidateIndex:Number(query('#tisya-candidate-select')?.value);
 if(action==='candidate-delete'){
  if(candidatePosition(token.message).total<=1)throw Error('至少保留一个版本');
  sheet('删除版本',`<p>删除第 ${index+1} 版？其他版本保留。</p>${button('取消','close')}${button('删除','candidate-delete-confirm')}`);overlay._messageToken=token;overlay._candidateIndex=index;return;
 }
 close();if(action==='candidate-delete-confirm')await revisionController.remove(token,index);else{await revisionController.select(token,index);if(action==='candidate-rewrite')await generateAt(messageToken(token.id),true);}
 decorate();
}
function nodeFor(token) {
    validate(context(),token);
    const node = query(`#chat .mes[mesid="${token.id}"]`);
    if (!node) throw new Error('消息已经离开当前视图，请重新定位');
    return node;
}
async function messageAction(action) {
    if(revisionController.navigating())throw Error('版本切换尚未完成，请稍候');
    const token = overlay._messageToken;
    const node = nodeFor(token);
    if(action==='msg-regen'||action==='msg-next'){close();return generateAt(token,action==='msg-regen');}
    if(action==='msg-read') {openReader(token);return;}
    if(action==='msg-copy') { const epoch=sheetEpoch;await navigator.clipboard.writeText(validate(context(),token).mes);close(epoch);return; }
    if(action==='msg-revision') {openRevision(token);return;}
    assertIdle();
    if(action==='msg-branch'&&v3Application?.host.inspect().enabled){sheet('创建平行分支',`<p>将此条消息及以前的进度接续到独立存档。</p>${button('创建分支','branch-create')}${button('取消','close')}`);overlay._messageToken=token;return;}
    if(action==='msg-edit'||action==='msg-branch') {
        if(action==='msg-edit'){userEditHistory.begin(token.message);close();await messageEdit(token.id);return;}
        const target = node.querySelector('.mes_create_branch');
        if(!target) throw new Error('原生消息操作未挂载');
        close();target.click();return;
    }
    if(action==='msg-delete'||action==='msg-rollback') {
        const count = action==='msg-delete'?1:context().chat.length-token.id;
        sheet(action==='msg-delete'?'删除本条':'回溯确认',`<p>将删除 ${count} 条消息${action==='msg-rollback'?'，包括选中消息及其后的全部消息':''}。操作使用宿主删除接口。</p>${button('取消','close')}${button('确认删除',action==='msg-delete'?'delete-confirm':'rollback-confirm')}`);
        overlay._messageToken = token;
    }
}
async function openJourneySource(payload) {
    if(!v3Application)throw Error('缇斯亚正在初始化');
    const source=await v3Application.journey.locate(payload);
    openReader(capture(context(),source.floor));
    const paragraphs=new Set(source.paragraphs??[]),matches=[...document.querySelectorAll('#tisya-reader [data-paragraph]')].filter(node=>paragraphs.has(Number(node.dataset.paragraph)));
    for(const node of matches){node.setAttribute('data-source-match','true');node.style.outline='1px solid #bda56e';node.style.outlineOffset='5px';}
    matches[0]?.scrollIntoView({block:'center',behavior:'auto'});
    return source;
}
function openReader(token,initialTab='body') {
    const message=validate(context(),token);
    nativeDisplay?.refresh();
    sheet('阅读与回合记录','<div id="tisya-reader"></div>');
    releaseReader=mountMessageReader(document,query('#tisya-reader'),{
        source:message.mes,getNativeDisplay:()=>nativeDisplay?.project(message.mes,message,{getAttribute:()=>String(token.id)}),
        initialTab,getAppearance,getDisplay,getPlayerName,saveDisplayPreference,onError:error,
        getJourney:options=>{validate(context(),token);if(!v3Application)throw Error('缇斯亚正在初始化');return v3Application.journey.read({floor:token.id,...options});},
        getJourneyTimeline:options=>{validate(context(),token);return v3Application.journey.timeline(options);},
        getJourneyAnchor:options=>{validate(context(),token);return v3Application.journey.currentAnchor({...options,floor:token.id});},
        setJourneyFocus:payload=>v3Application.journey.focus(payload),onJourneySource:openJourneySource,
        formatBody:body=>messageFormatting(body,message.name,!!message.is_system,!!message.is_user,token.id,
            {FORBID_TAGS:['script','style','custom-style','iframe','object','embed','form','input','button','select','textarea'],FORBID_ATTR:['style','id']},
            false,{regexPrepared:true,regexSourceText:body}),
        onChooseAction:(text,mode)=>chooseReaderAction(token,text,mode),getActionMode,setActionMode,
    }).dispose;
    readerToken=token;
}
async function chooseReaderAction(token,text,mode) {
    if(uiOperations.busy())throw new Error('当前聊天操作尚未完成，请稍后再选行动');
    assertIdle();nodeFor(token);
    try{return await uiOperations.run(async()=>{
        const result=await executeAction({document,text,mode,validate:()=>{assertIdle();nodeFor(token);},send:async()=>{close();closeNativeDrawers();hidePage();try{await sendTextareaMessage();}catch(e){error(e);throw e;}}});
        close();closeNativeDrawers();hidePage();query('#send_textarea')?.focus({preventScroll:true});return result;
    },{label:'执行所选行动'});}finally{decorate();}
}
async function removeMessages(rollback) {
    const token=overlay._messageToken,epoch=sheetEpoch;assertIdle();validate(context(),token,{tail:true});
    const original=context().chat.slice(token.id);
    const snapshots=original.map(message=>message && ({text:message.mes,swipe:message.swipe_id}));
    if(rollback && original.some(message=>!message)) throw new Error('后续历史尚未完整加载，未执行回溯');
    const v3Host=await requireV3();
    let deleted=0;
    try {
        const end=rollback?token.length-1:token.id;
        for(let id=end;id>=token.id;id--) {
            const message=context().chat[id], snapshot=snapshots[id-token.id];
            if(context().getCurrentChatId()!==token.chatId||message!==original[id-token.id]||!snapshot||message?.mes!==snapshot.text||message?.swipe_id!==snapshot.swipe) throw new Error('删除期间消息发生变化');
            await v3Host.deleteFloor({floor:id});deleted++;
        }
        await context().saveChat();close(epoch);
    } catch(err) { throw new Error(`删除未完整完成（已调用删除 ${deleted} 条）：${err.message}`); }
}
function openRevision(token,selection){
 if(revisionController.navigating())throw Error('版本切换尚未完成，请稍候');
 assertIdle();const message=validate(context(),token,{tail:true});if(message.is_user||message.is_system)throw Error('请选择角色回复进行重骰');
 const key=JSON.stringify([configStore.read().key,token.id,token.swipe??0,token.text]);sheet('高级重骰','<div id="tisya-revision-panel"></div>');overlay._messageToken=token;
 revisionEditor=mountRevisionEditor(document,query('#tisya-revision-panel'),{token,draft:{...revisionDrafts.get(key),...(selection?{mode:'partial',selected:selection}: {})},onDraft:value=>revisionDrafts.set(key,value),onError:error,onSubmit:async options=>{
  assertIdle();validate(context(),token,{tail:true});if(String(query('#send_textarea')?.value??'').trim())throw Error('剧情输入框有草稿；请先发送或暂存后再重骰，场外草稿可以保留。');
  close();closeNativeDrawers();hidePage();try{await revisionController.generate(token,options);}finally{decorate();}
 }});
}
async function rerollAfterUser(token,operation){
    const target=userRerollTarget(context(),token);
    if(target)return revisionController.generate(target,null);
    if(context().onlineStatus==='no_connection')throw Error('模型尚未连接，未改动消息');
    userRevisionMaterial(token.message);
    const options=await operation.wait(()=>getAgentGenerationOptions({generationType:'normal',mainApi:context().mainApi,selectedGroup:context().groupId}));
    await (await requireV3()).initialize();operation.check();assertIdle();validate(context(),token,{tail:true});
    if(String(query('#send_textarea')?.value??'').trim())throw Error('输入框新增了草稿，未发送重投');
    const material=userRevisionMaterial(token.message);generationBusy=true;
    try{configHost.setUserRevision(material?{...material,messageId:token.id}:null);decorate();await operation.host(()=>Generate('normal',{...options,automatic_trigger:true}));}
    finally{configHost.setUserRevision(null);generationBusy=false;decorate();}
}
function generateAt(token,reroll=false){return generationOperations.run(operation=>generateAtOperation(token,reroll,operation));}
async function generateAtOperation(token, reroll, operation) {
    if(reroll){assertIdle();validate(context(),token,{tail:true});if(String(query('#send_textarea')?.value??'').trim())throw Error('剧情输入框有草稿，请先发送或暂存后再重骰');closeNativeDrawers();hidePage();try{if(token.message.is_user)await rerollAfterUser(token,operation);else await revisionController.generate(token,null);}finally{decorate();}return;}
    assertIdle();const selected=validate(context(),token,{tail:true});
    if(String(query('#send_textarea')?.value??'').trim()) throw new Error('输入框有草稿，请先发送或清空后操作');
    if(context().onlineStatus==='no_connection')throw new Error('模型尚未连接，未回溯消息');
    const continueText=reroll?'':String(settings().继续用户消息??'').trim();
    const type=reroll&&!selected.is_user&&!selected.is_system?'regenerate':'normal';
    const ctx=context();
    const options=await operation.wait(()=>getAgentGenerationOptions({generationType:type,mainApi:ctx.mainApi,selectedGroup:ctx.groupId}));
    assertIdle();validate(context(),token,{tail:true});
    if(String(query('#send_textarea')?.value??'').trim())throw new Error('输入框新增了草稿，未回溯消息');
    // Establish stable floor markers before comparing the remaining history.
    // Initializing during the first deletion otherwise looks like a user edit.
    const v3Host=await requireV3();await v3Host.initialize();operation.check();
    assertIdle();validate(context(),token,{tail:true});
    if(String(query('#send_textarea')?.value??'').trim())throw new Error('输入框新增了草稿，未回溯消息');
    const following=context().chat.slice(token.id+1);
    if(Array.from(following).some(m=>!m||typeof m.mes!=='string'))throw new Error('后续历史尚未完整加载，未回溯消息');
    const snapshots=following.map(m=>JSON.stringify(m));
    generationBusy=true;decorate();let deleted=0;
    try {
        for(let id=token.length-1;id>token.id;id--) {
            operation.check();validate(context(),token);
            if(context().chat.length!==token.length-deleted||context().chat[id]!==following[id-token.id-1]||JSON.stringify(context().chat[id])!==snapshots[id-token.id-1])throw new Error('回溯期间历史已变化');
            await v3Host.deleteFloor({floor:id});
            if(context().chat.length!==token.length-deleted-1)throw new Error('宿主未完成消息删除');
            deleted++;
            if(operation.signal.aborted){await context().saveChat();operation.check();}
        }
        validate(context(),token);
        if(deleted)await context().saveChat();operation.check();
        validate(context(),token);
        if(context().chat.length!==token.id+1)throw new Error('回溯后消息数量不符');
        if(String(query('#send_textarea')?.value??'').trim())throw new Error('输入框新增了草稿，未发送继续信息');
        if(continueText){const input=query('#send_textarea');if(!input)throw new Error('宿主输入框不存在');input.value=continueText;input.dispatchEvent(new Event('input',{bubbles:true}));}
        await operation.host(()=>Generate(type,{...options,automatic_trigger:!continueText}));
    } catch(err) {
        throw new Error(`${deleted?'已删除后续 '+deleted+' 条消息；':''}生成未完成：${err.message}`);
    } finally { generationBusy=false;decorate(); }
}
function decorate(element = null) {
    if(!enabled)return;
    nativeDisplay?.refresh();paragraphActions?.check();
    (element ? [element] : [...document.querySelectorAll('#chat .mes')]).forEach(node=>{
        if(appearance&&!appearance.shouldRender(node))return;
        if(!node.querySelector('.tisya-actions')) {
            const row=document.createElement('div');row.className='tisya-actions';

            (node.querySelector('.mes_block')??node).append(row);
            row.addEventListener('click',e=>{const b=e.target.closest('[data-tisya-action]');if(!b)return;e.stopPropagation();run(async()=>{
                const token=messageToken(Number(node.getAttribute('mesid')));
                if(b.dataset.tisyaAction==='candidate-picker'){openCandidates(token);return;}
                if(b.dataset.tisyaAction==='candidate-prev'||b.dataset.tisyaAction==='candidate-next'){const pos=candidatePosition(validate(context(),token));await revisionController.select(token,pos.index+(b.dataset.tisyaAction==='candidate-prev'?-1:1));decorate();return;}
                if(b.dataset.tisyaAction==='more')return messageMenu(node);
                if(b.dataset.tisyaAction.startsWith('msg-')){overlay._messageToken=token;return messageAction(b.dataset.tisyaAction);}
                if(b.dataset.tisyaAction==='next')return generateAt(token);
                return generateAt(token,true);
            },{exclusive:messageActionExclusive(b.dataset.tisyaAction),label:b.getAttribute('aria-label')||b.textContent.trim()||b.dataset.tisyaAction});});
        }
        const id=Number(node.getAttribute('mesid')),msg=context().chat[id],pos=candidatePosition(msg),candidates=msg&&!msg.is_user&&!msg.is_system&&pos.total>1;
        let note='';try{note=msg?.is_user?readTurnDirection(msg):'';}catch(e){note='无法读取本轮要求：'+e.message;}let noteView=node.querySelector('.tisya-turn-direction');
        if(note){if(!noteView){noteView=document.createElement('details');noteView.className='tisya-turn-direction';const heading=document.createElement('summary');heading.textContent='本轮场外要求';noteView.append(heading,document.createElement('p'));(node.querySelector('.mes_block')??node).append(noteView);}if(noteView.lastElementChild.textContent!==note)noteView.lastElementChild.textContent=note;}else noteView?.remove();
        const row=node.querySelector('.tisya-actions'),key=JSON.stringify([messageSlots(),pos.label,!!msg?.is_user]);if(row.dataset.slots!==key){row.innerHTML=`<div class="tisya-message-tools">${messageSlots().map(id=>messageToolButton(id)).join('')}</div>`+(candidates?`<div class="tisya-candidate-row" role="group" aria-label="回复版本">${iconButton('上一候选','candidate-prev','left','tisya-orb-button')}<button type="button" class="tisya-candidate-count" data-tisya-action="candidate-picker" aria-label="当前候选" title="选择版本">${esc(pos.label)}</button>${iconButton('下一候选','candidate-next','right','tisya-orb-button')}</div>`:'');row.dataset.slots=key;}
        if(msg?.is_user){for(const b of row.querySelectorAll('[data-tisya-action=regen],[data-tisya-action=msg-regen]')){b.setAttribute('aria-label','重投下一条');const caption=b.querySelector('small');if(caption)caption.textContent='重投下一条';}}
        appearance?.sync(node,{pending:id===context().chat.length-1&&(isGenerating()||hasActiveAgentRun()||generationBusy)});
        const actionBlock=node.querySelector('.mes_block')??node;if(row.parentElement!==actionBlock||actionBlock.lastElementChild!==row)actionBlock.append(row);
        editToolbarPlacement?.sync(node);
        node.querySelectorAll('.tisya-actions button').forEach(b=>{if(b.dataset.tisyaAction!=='more'){const reason=!msg?'消息尚未加载':['regen','msg-regen','msg-revision'].includes(b.dataset.tisyaAction)&&(msg.is_system||msg.role==='tool'||msg.is_user&&b.dataset.tisyaAction==='msg-revision')?'请选择角色回复进行重骰':messageActionExclusive(b.dataset.tisyaAction)&&(isGenerating()||hasActiveAgentRun()||generationBusy||revisionController.active()||revisionController.navigating()||communication.busy())?'正在生成，请先停止或等待结束':b.dataset.tisyaAction==='candidate-prev'&&pos.index===0?'已经是第一个版本':b.dataset.tisyaAction==='candidate-next'&&pos.index>=pos.total-1?'已经是最后一个版本':'';b.disabled=!!reason;b.title=reason||(b.dataset.tisyaAction==='regen'?(msg.is_user?'重投下一条角色回复；保留旧候选，较早楼层先建立分支':'重骰保留旧候选；较早楼层先建立分支'):b.dataset.tisyaAction==='next'&&id<context().chat.length-1?'将删除后文再继续':(b.getAttribute('aria-label')??b.textContent));b.setAttribute('aria-disabled',String(!!reason));}});
        node.querySelectorAll('.mes_button, .mes_edit_buttons > div').forEach(el=>{
            const title=el.getAttribute('title')??el.getAttribute('data-tooltip')?.split('\n')[0];
            if(title)el.dataset.tisyaLabel=title;
        });
    });
}
async function run(fn,options={}) {
    try{return await uiOperations.run(fn,options);}catch(err){if(err.code==='TISYA_UI_BUSY'&&uiOperations.state()?.label==='打开所选会话')err.message+=' '+chatSelectionSummary();error(err);}finally{if(options.exclusive!==false)decorate();}
}
function stopUI() {
    if(characterGroup?.isBusy()||characterGroup?.hasDraft())throw Error('角色页面还有未保存的修改');characterGroup?.dispose();characterGroup=null;
    if(worldbookConsole?.isBusy()||worldbookConsole?.hasDraft())throw Error('世界书还有未保存的修改，请先保存或放弃');worldbookConsole?.dispose();worldbookConsole=null;
    if(uiOperations.busy()||generationBusy)throw new Error('请等当前聊天操作完成再返回原生界面');
    for(const view of [...configurationViews.values(),...v3Views.values()]){const gate=view.requestLeave();if(gate.allowed===false)throw Error(gate.reason+'；请回到对应会话保存或放弃后关闭界面');}
    clearNotebook();for(const view of configurationViews.values())view.dispose();configurationViews.clear();for(const view of v3Views.values())view.dispose();v3Views.clear();v3Bubble?.dispose();v3Bubble=null;clearReader();enabled=false;fontController?.abort();releaseFont?.();releaseFont=null;globalFonts?.dispose();globalFonts=null;observer?.disconnect();cleanups.forEach(fn=>fn());cleanups=[];layout.dispose();document.body.classList.remove('tisya-active','tisya-show-native-menu','tisya-motion-paused');
    document.querySelectorAll('.tisya-actions,.tisya-turn-direction').forEach(el=>el.remove());
    document.querySelectorAll('.tisya-native-tools').forEach(el=>el.classList.remove('tisya-native-tools'));
}
function ensureNativeDisplay(){
 if(!nativeDisplay)nativeDisplay=createNativeDisplayPipeline({enabled:()=>{if(!context().chatId||v3Application?.isBindingTransition())return false;try{return configStore.read().world.theme.nativeRegex;}catch(err){if(['CONFIGURATION_NOT_READY','CONFIGURATION_SCOPE','CONFIGURATION_BINDING','CONFIGURATION_PLAYER'].includes(err.code))return false;throw err;}},scripts:()=>context().extensionSettings.disabledExtensions?.includes('regex')?[]:getRegexScripts({allowedOnly:true}),regexProvider:RegexProvider.instance,substitute:substituteParams,substituteExtended:substituteParamsExtended,contextKey:()=>JSON.stringify([context().chatId,context().characterId,context().groupId,context().chatMetadata?.variables,context().extensionSettings.variables,context().name1,context().name2]),depth:(msg,node)=>Math.max(0,context().chat.length-Number(node.getAttribute('mesid'))-1)});
 return nativeDisplay;
}
function init() {
    if(query('#tisya-shell'))return;
    if(!query('#chat')||!query('#sheld')||!query('#top-settings-holder'))throw new Error('当前宿主布局不匹配，未启用界面');
    settings();getDisplay();
    layout=mountLayout(document);
    ({root,top,controls,overlay}=layout);
    cleanups.push(installComposer(document));
    cleanups.push(mountDirectoryHold(root,{onMenu:directoryMenu,onError:error}));
    editToolbarPlacement=createEditToolbarPlacement(document);
    // Managed surfaces do not necessarily emit a commit for transient edit UI.
    // Native messageEdit focuses the new textarea after inserting its controls.
    const placeEditor=e=>{if(e.target.matches?.('#chat .edit_textarea'))editToolbarPlacement.sync(e.target.closest('.mes'));};
    document.addEventListener('focusin',placeEditor);
    cleanups.push(()=>{document.removeEventListener('focusin',placeEditor);editToolbarPlacement.dispose();editToolbarPlacement=null;});
    motionEnabled=settings().动态效果!==false;
    ensureNativeDisplay();
    appearance=mountMessageAppearance(document,{
        getMessage:node=>context().chat[Number(node.getAttribute('mesid'))],
        getCover:msg=>messageCardCover(context(),msg,avatar=>getThumbnailUrl('avatar',avatar)),
        getMessageCount:()=>context().chat.length,getInitialRenderCount:()=>power_user.chat_truncation,getScope:()=>context().getCurrentChatId(),onHistoryReady:node=>decorate(node),
        getCacheKey:msg=>JSON.stringify([context().chatId?worldKey(context()):null,messageCacheOwner(msg),msg.mes,getDisplay().显示角色心理===true,getPlayerName(),readerCacheGeneration(),isGenerating()]),
        getStateKey:msg=>JSON.stringify([context().chatId?worldKey(context()):null,messageCacheOwner(msg),msg.mes]),
        prepareMessage:msg=>context().chatId&&!isGenerating()?prepareReaderMessage({scope:worldKey(context()),owner:messageCacheOwner(msg),source:msg.mes},{showPsychology:getDisplay().显示角色心理===true,playerName:getPlayerName()}):null,
        formatPreparedBody:(body,msg,node)=>messageFormatting(body,msg.name,!!msg.is_system,!!msg.is_user,Number(node.getAttribute('mesid')),{},false,{regexPrepared:true,regexSourceText:body}),
        getNativeDisplay:(...args)=>nativeDisplay.project(...args),getRenderKey:(...args)=>nativeDisplay.key(...args),
        preferNative:(message,native,data)=>preferNativeBeauty({message,native,structured:data.structured,...nativeDisplay.state()}),
        formatNativeBody:createNativeBodyFormatter({contextKey:()=>context().chat.length,onError:visualError,enabled:()=>nativeDisplay.state().enabled,scripts:()=>nativeDisplay.state().scripts,regex:(body,msg,node)=>getRegexedString(body,msg.is_user?1:2,{isMarkdown:true,characterOverride:msg.name,depth:Math.max(0,context().chat.length-Number(node.getAttribute('mesid'))-1)}),format:(prepared,source,msg,node)=>messageFormatting(prepared,msg.name,!!msg.is_system,!!msg.is_user,Number(node.getAttribute('mesid')),{},false,{regexPrepared:true,regexSourceText:source})}),
        getDisplay,getAppearance,getPlayerName,saveDisplayPreference,getMotion:()=>motionEnabled&&!root.classList.contains('tisya-page-open'),onError:visualError,
        getJourney:(msg,node,options)=>{if(!v3Application)throw Error('缇斯亚正在初始化');return v3Application.journey.read({floor:Number(node.getAttribute('mesid')),...options});},
        getJourneyTimeline:(msg,node,options)=>v3Application.journey.timeline(options),
        getJourneyAnchor:(msg,node,options)=>v3Application.journey.currentAnchor({...options,floor:Number(node.getAttribute('mesid'))}),
        setJourneyFocus:payload=>v3Application.journey.focus(payload),onJourneySource:openJourneySource,
        formatBody:(body,msg,node)=>messageFormatting(body,msg.name,!!msg.is_system,!!msg.is_user,Number(node.getAttribute('mesid')),
            {FORBID_TAGS:['script','style','custom-style','iframe','object','embed','form','input','button','select','textarea'],FORBID_ATTR:['style','id']},false,{regexPrepared:true,regexSourceText:body}),
        getActionMode,setActionMode,onChooseAction:async(node,source,text,mode)=>{const token=messageToken(Number(node.getAttribute('mesid')));if(validate(context(),token).mes!==source)throw new Error('消息已变化，请重新选择行动');return chooseReaderAction(token,text,mode);},
    });
    cleanups.push(()=>appearance.dispose());
    chatEffects=mountChatEffects(document,{getDisplay,getAppearance,getMotion:()=>motionEnabled&&getAppearance('extensions').动画效果,onError:visualError});cleanups.push(()=>chatEffects.dispose());
    pet=mountPet(document,{getMotion:()=>motionEnabled,onError:visualError,onOpenApp:phoneApp,onPoke:()=>{if(v3Application)v3Bubble?.showAside(v3Application.assistant.poke());},onVisibility:value=>{if(applyingInterface)return;saveInterfaceSettings({...settings(),显示桌宠:value}).catch(err=>{applyInterfaceSettings(settings());error(err);});}});cleanups.push(()=>pet.dispose());
    if(settings().显示桌宠===false)pet.setVisible(false);
    messageNavigation=mountMessageNavigation(document,{getLanding:()=>getDisplay().上条落点,onNavigate:()=>{appearance?.revealHistory();closeNativeDrawers();hidePage();}});cleanups.push(()=>messageNavigation.dispose());
    communicationUI=mountCommunication(document,{controller:communication,onError:error});cleanups.push(()=>{communicationUI?.dispose();communicationUI=null;});
    inputShortcuts=mountInputShortcuts(document,{getSettings:settings,save:async value=>saveInterfaceSettings({...settings(),输入快捷栏:value}),onError:visualError});cleanups.unshift(()=>inputShortcuts.dispose());
    const cancelDialog=e=>{e.preventDefault();close();};overlay.addEventListener('cancel',cancelDialog);
    const listener=e=>{if(directoryPanel&&!directoryRow?.contains(e.target))closeDirectoryMenu();const b=e.target.closest('[data-tisya-action]');if(!b||(!root.contains(b)&&!overlay.contains(b)&&!top.contains(b)&&!controls.contains(b)))return;const [action,id]=b.dataset.tisyaAction.split(':');
        if(['assistant','user-identity','home','contacts','groups','notes','memory','chat','menu','settings-app','settings-tab','display-settings','display-cache','context-overview','emotion-atlas','role-library','group-library','group-create','group-edit','select','drawer','section','input-tools','disable','fullscreen'].includes(action)&&!mayLeaveUtility())return;
        if(action==='home'){home().catch(error);return;}
        if(action==='contacts'){renderEpoch++;contacts();return;}
        if(action==='groups'){groupPage();return;}
        if(action==='notes'||action==='memory'){run(()=>openNotebook(action),{exclusive:false});return;}
        if(action==='chat'){close();closeNativeDrawers();hidePage();return;}
        if(action==='menu'){nav();return;}
        if(action==='selection-diagnostic'){showSelectionDiagnostic();return;}
        if(action==='selection-diagnostic-copy'){navigator.clipboard.writeText(query('#tisya-selection-diagnostic').textContent).catch(error);return;}
        if(action==='directory-menu'){try{directoryMenu(decodeURIComponent(id));}catch(e){error(e);}return;}
        run(async()=>{
        if(action==='assistant')openAssistant();else if(action==='user-identity')openWorkbench('books');else if(action==='directory-close')closeDirectoryMenu();else if(action==='directory-back')directoryButtons();else if(action==='directory-group')directoryGroup();else if(action==='directory-group-save')await directoryGroupSave();else if(action==='directory-rename')directoryRename();else if(action==='directory-save')await directorySave();else if(action==='directory-pin')await directoryPin();else if(action==='directory-delete')directoryDeleteAsk();else if(action==='directory-delete-confirm')await directoryDelete();else if(action==='longpress-save'){const slots=[...overlay.querySelectorAll('#tisya-longpress-slots select')].map(s=>s.value).filter(Boolean);longPressSlots({长按菜单:slots});if(JSON.stringify(longPressSlots(settings()))!==JSON.stringify(overlay._longPressSlots))throw Error('配置已变化，请重新打开');await saveInterfaceSettings({...settings(),长按菜单:slots});close();}else if(['candidate-select','candidate-rewrite','candidate-delete','candidate-delete-confirm'].includes(action))await candidateAction(action);else if(action==='message-tools')messageToolsEditor(overlay._messageToken);else if(action==='message-tools-collapse'||action==='message-tools-expand'){const selects=[...overlay.querySelectorAll('#tisya-message-slots select')];selects.forEach((s,i)=>s.value=action==='message-tools-collapse'?(i===0?'more':''):MESSAGE_TOOLS[i][0]);overlay._describeMessageSlots?.();}else if(action==='message-tools-save'){const slots=[...overlay.querySelectorAll('#tisya-message-slots select')].map(s=>s.value).filter(Boolean);if(!slots.includes('more'))throw Error('请保留一个“更多”，以便找回收起的操作');if(new Set(slots).size!==slots.length)throw Error('按钮位置重复');if(JSON.stringify(messageSlots())!==JSON.stringify(overlay._messageSlots))throw Error('配置已变化，请重新打开');await saveInterfaceSettings({...settings(),消息快捷栏:slots});decorate();close();}else if(action==='settings-app')openSettings();else if(action==='settings-tab')openSettings(id);else if(action==='display-cache')openChatLoading();else if(action==='context-overview')openSettings('mode','overview');else if(action==='role-library')openCharacterGroup();else if(action==='group-library')openCharacterGroup('group');else if(action==='group-create'){openCharacterGroup('group');}else if(action==='group-menu')groupMenu(id);else if(action==='group-edit'){const g=groupTarget(id);openCharacterGroup('group',String(g.id));}else if(action==='group-open')await openGroup(id);else if(action==='display-settings')openDisplaySettings();else if(action==='emotion-atlas')openEmotionAtlas();else if(action==='pet-toggle'){pet.setVisible(!pet.isVisible());close();hidePage();}else if(action==='motion-toggle'){await saveInterfaceSettings({...settings(),动态效果:!motionEnabled});nav(true);}else if(action==='continue-settings'){sheet('继续设置',`<p>点消息下的“继续”，保留该条并生成下一条。旧消息之后的内容会自动删除。</p><label for="tisya-continue-text">自动发送的用户消息</label><p class="tisya-note">需要 user 消息的渠道可在此填写；留空则直接请求下一条。</p><textarea id="tisya-continue-text" aria-label="继续时自动发送的用户消息">${esc(settings().继续用户消息??'')}</textarea>${button('保存','save-continue')}`);}else if(action==='save-continue'){const next=structuredClone(settings());next.继续用户消息=query('#tisya-continue-text').value;await saveInterfaceSettings(next);close();}else if(action==='cache-clear'){await chatLoading.clear();sheet('显示缓存','<p>显示缓存已清理，原聊天、回复候选、记忆与偏好保留。</p>');}else if(action==='font-retry'){startFont();}else if(action==='close')close();else if(action==='drawer')nativeDrawer(id);else if(action==='section')extensionSection(id);else if(action==='fullscreen'){close();hidePage();nativeControl('#option_toggle_fullscreen');}else if(action==='input-tools'){close();closeNativeDrawers();hidePage();inputShortcuts?.open('slots');}else if(action==='card')await showCard(Number(id));else if(action==='select'){openCharacterGroup('character',context().characters[Number(id)]?.avatar);}else if(action==='disable')stopUI();
        else if(action==='group') {
            const card=context().characters[Number(id)];if(!card)throw new Error('角色不存在');
            sheet('角色分组',`<input id="tisya-group-name" aria-label="分组名称" value="${esc(settings().联系人分组[card.avatar]??'未分组')}">${button('保存',`save-group:${encodeURIComponent(card.avatar)}`)}`);
        } else if(action==='save-group') {
            const name=query('#tisya-group-name').value.trim();if(!name)throw new Error('请输入分组名称');
            const avatar=decodeURIComponent(id);if(!context().characters.some(x=>x.avatar===avatar))throw new Error('角色已变化');
            const next=structuredClone(settings());next.联系人分组[avatar]=name;await saveInterfaceSettings(next);contacts();
        } else if(action==='branch-create'){const token=overlay._messageToken;validate(context(),token,{tail:true});const host=await requireV3();close();await host.branch({floor:token.id,swipeId:token.swipe??0});} else if(action.startsWith('msg-'))await messageAction(action);else if(action==='delete-confirm'||action==='rollback-confirm')await removeMessages(action==='rollback-confirm');
        else if(action==='chat-all') {close();hidePage();document.body.classList.add('tisya-show-native-menu');nativeControl('#options_button');}
    },{exclusive:['directory-group-save','directory-save','directory-pin','directory-delete-confirm','select','msg-edit','msg-branch','msg-delete','msg-rollback','delete-confirm','rollback-confirm'].includes(action),label:b.getAttribute('aria-label')||b.textContent.trim()||action});};
    document.addEventListener('click',listener);cleanups.push(()=>document.removeEventListener('click',listener));
    const escape=e=>{if(e.key==='Escape'){closeDirectoryMenu();close();}};document.addEventListener('keydown',escape);cleanups.push(()=>document.removeEventListener('keydown',escape));
    const input=e=>{if(!e.target.classList.contains('tisya-search'))return;const q=e.target.value.toLowerCase();root.querySelectorAll('[data-search]').forEach(el=>el.hidden=!el.dataset.search.includes(q));};root.addEventListener('input',input);
    paragraphActions=mountParagraphActions(document,{
        capture:node=>messageToken(Number(node.getAttribute('mesid'))),validate:token=>validate(context(),token,{tail:true}),assertIdle,
        format:(text,token)=>messageFormatting(text,token.message.name,!!token.message.is_system,!!token.message.is_user,token.id,{},false,{regexPrepared:true,regexSourceText:text}),
        getSettings:settings,onConfigure:longPressEditor,
        onAction:(token,id)=>{overlay._messageToken=token;return id==='versions'?openCandidates(token):messageAction(({regen:'msg-regen',next:'msg-next',branch:'msg-branch',delete:'msg-delete',rollback:'msg-rollback'})[id]);},
        onRead:token=>{overlay._messageToken=token;return messageAction('msg-read');},
        onMessage:token=>{validate(context(),token,{tail:true});const node=document.querySelector(`#chat .mes[mesid="${token.id}"]`);if(!node)throw Error('消息已离开显示区');messageMenu(node);},
        onRevise:(token,selected)=>openRevision(token,selected),
        onEdit:token=>{overlay._messageToken=token;return messageAction('msg-edit');},
        onError:error,
    });
    cleanups.push(()=>{paragraphActions?.dispose();paragraphActions=null;});
    const visibility=()=>refreshVisuals();document.addEventListener('visibilitychange',visibility);cleanups.push(()=>document.removeEventListener('visibilitychange',visibility));refreshVisuals();
    if(!managed) {
        observer=new MutationObserver(records=>{const changed=new Set();for(const r of records){if(r.target.closest?.('.tisya-actions,.tisya-message-visual'))continue;if(r.target.closest?.('.mes_text'))changed.add(r.target.closest('.mes'));for(const n of r.addedNodes)if(n.nodeType===1){if(n.matches?.('.mes'))changed.add(n);else if(!n.matches?.('.tisya-actions,.tisya-message-visual'))for(const mes of n.querySelectorAll?.('.mes')??[])changed.add(mes);}}for(const node of changed)if(node?.isConnected)decorate(node);});
        observer.observe(query('#chat'),{childList:true,subtree:true});
    }
    let refreshTimer;
    const refreshActions=()=>{if(!enabled)return;checkReadingSource();clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(enabled)decorate();},0);};
    for(const name of ['GENERATION_STARTED','GENERATION_ENDED','GENERATION_STOPPED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','MESSAGE_SWIPE_DELETED']) {
        const event=context().eventTypes[name];if(!event)continue;
        context().eventSource.on(event,refreshActions);cleanups.push(()=>context().eventSource.removeListener(event,refreshActions));
    }
    for(const name of ['STREAM_TOKEN_RECEIVED','CHARACTER_MESSAGE_RENDERED','USER_MESSAGE_RENDERED']){
        const event=context().eventTypes[name];if(!event)continue;
        context().eventSource.on(event,checkReadingSource);cleanups.push(()=>context().eventSource.removeListener(event,checkReadingSource));
    }
    cleanups.push(()=>clearTimeout(refreshTimer));
    const viewKey=()=>{const c=context();return c.chatId?JSON.stringify([c.groupId,c.characters?.[c.characterId]?.avatar??c.characterId,c.chatId]):null;};let visibleWorld=viewKey();const onChange=()=>{const current=viewKey();if(current===visibleWorld)return;visibleWorld=current;if(notebook||utility){close();hidePage();}else if(readerToken||revisionEditor||!root.classList.contains('tisya-page-open'))close();messageNavigation.reset();decorate();};context().eventSource.on(context().eventTypes.CHAT_CHANGED,onChange);cleanups.push(()=>context().eventSource.removeListener(context().eventTypes.CHAT_CHANGED,onChange));
    const identityChanged=()=>refreshIdentityNotice();context().eventSource.on(context().eventTypes.CHAT_CHANGED,identityChanged);cleanups.push(()=>context().eventSource.removeListener(context().eventTypes.CHAT_CHANGED,identityChanged));
    for(const name of ['CHAT_CREATED','GROUP_CHAT_CREATED']){const event=context().eventTypes[name];if(event){context().eventSource.on(event,promptNewChatIdentity);cleanups.push(()=>context().eventSource.removeListener(event,promptNewChatIdentity));}}
    refreshIdentityNotice();
    home().catch(error);decorate();startFont();void fontsService().refresh().catch(error);
}
export function registerChatSurface() {
    const api=window.__TAURITAVERN__?.api?.chatSurface;
    managed=api?.isManagedOwnershipRequired?.()===true;
    if(managed&&typeof api.registerContentProcessor==='function')api.registerContentProcessor(nativePanelContentProcessor({document,current:(message,id)=>context().chat[id]===message,project:(source,message,id)=>{const pipeline=ensureNativeDisplay();pipeline.refresh();return pipeline.project(source,message,{getAttribute:()=>String(id)});},onError:visualError}));
    if(managed) participant=api.registerParticipant({id:'tisya-ui/message-actions',protocolVersion:api.protocolVersion,didCommitContent({element,content,mesid,signal}){notifySelectedChatContent({element,content,mesid,signal});resetNativePanelSources(content);decorate(element);},didMount({element}){decorate(element);return ()=>{editToolbarPlacement?.restore(element);appearance?.restore(element);element.querySelector('.tisya-actions')?.remove();element.querySelector('.tisya-turn-direction')?.remove();};}});
}
context().eventSource.on(context().eventTypes.APP_READY,async()=>{
    initializePresetConnection(context(),document);
    installUserEditHistory(document,context,userEditHistory);
    const readerCache=startReaderCache(window,error);
    try{init();}catch(err){error(err);}

    // Register once independently of the visible surface; expanding a macro is read-only.
    try{const syncMessageCache=()=>{const c=context();if(c.chatId)reconcileReaderCache(worldKey(c),c.chat);};
     for(const name of ['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED','MESSAGE_SWIPE_DELETED','GENERATION_ENDED','GENERATION_STOPPED']){const event=context().eventTypes[name];if(event)context().eventSource.on(event,()=>{if(!isGenerating()||['MESSAGE_DELETED','MESSAGE_SWIPE_DELETED','CHAT_CHANGED'].includes(name))syncMessageCache();});}
     syncMessageCache();document.addEventListener('visibilitychange',()=>{if(document.hidden)readerCache.flush();});textTransport.install();window.addEventListener('pagehide',event=>{if(!event.persisted)textTransport.dispose();});context().registerMacro('tisya_config_selected',()=>configHost.selectedText(),'缇斯亚：只装入选中资源');for(const key of ['style','environment','gameplay','lorebook'])context().registerMacro('tisya_material_'+key,()=>configHost.materialText(key),'缇斯亚：选中资料 '+key);for(const key of Object.keys(SLOT_TARGETS))context().registerMacro('tisya_slot_'+key,()=>configHost.tableSlotText(key),'缇斯亚：本轮资料 '+key);
     const bind=(name,fn)=>{const ev=context().eventTypes[name];if(!ev)throw Error('宿主缺少事件 '+name);context().eventSource.on(ev,fn);};
     worldbookOrder=installWorldbookOrder({getContext:context,onError:error});
     bind('WORLDINFO_ENTRIES_LOADED',p=>nativeConfiguration.entriesLoaded(p));
     await installV3();
     bind('GENERATION_AFTER_COMMANDS',()=>{nativeGenerationEpoch++;nativeConfiguration.clearScan();});
     bind('GENERATION_ENDED',()=>{generationBusy=false;decorate();});
     bind('GENERATION_STOPPED',()=>{nativeGenerationEpoch++;generationOperations.stop();v3Application.host.cancel();v3Application.assistant.cancel();configHost.cancelTransport();});
     bind('CHAT_CHANGED',async()=>{nativeGenerationEpoch++;configHost.cancelTransport();communication.contextChanged();v3Application.assistant.cancel();const reopen=utility?.kind==='v3-workbench';if(reopen)hidePage();if(v3Application.isBindingTransition())return;try{await v3ConfigurationBook.hydrate({initializeIfMissing:true});}catch(err){if(!['UNBOUND','GLOBAL_UNBOUND'].includes(err.code))error(err);}if(reopen&&context().chatId)openWorkbench('home');});
     window.Tisya=Object.freeze({version:VERSION,operationState:()=>uiOperations.state(),register,registry,communication:{read:()=>communication.view()},tables:v3Application.archives,forms:v3Application.host,books:v3Application.books,journey:Object.freeze({...v3Application.journey,registerRoute:registerJourneyRoute}),capabilities:v3Application.capabilities,assistant:v3Application.assistant,contracts:{generation:GENERATION_CONTRACTS,mode:MODE_CONTRACT,archive:ARCHIVE_CONTRACT,validateGeneratedTask},configuration:{read:()=>configStore.read(),save:(...args)=>configStore.save(...args)},request:(...args)=>configHost.request(...args),context:()=>v3Application.host.inspect()});


    }catch(err){error(err);}
    emotionCatalog(document).ready.catch(()=>error(new Error('表情图鉴加载失败，请更新扩展后重启。')));
});
