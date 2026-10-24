import {shellV3} from './fixtures/v3-shell-host.mjs';
import {formatSimpleSheet,parseSimpleSheet} from '../tables/simple-sheet.js';
import {IDBFactory} from 'fake-indexeddb';
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
import {createNativePersonaGateway} from '../native-persona-gateway.js';
import {evaluateIdentityOnboarding,mountIdentityOnboarding} from '../identity-onboarding.js';
import {mountIdentityPage} from '../user-identity-page.js';
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
import {createBookGateway} from '../tables/books.js';
import {defaultRegistry} from '../tables/schema.js';
import {SLOT_TARGETS} from '../tables/slots.js';
import {interfaceSnapshot,validateInterfaceSettings} from '../tables/interface-config.js';
import {createNativeConfiguration,createRegexGate} from '../tables/native-config.js';
import {createTableService} from '../tables/service.js';
import {createNativeVectors} from '../tables/vectors.js';
import {mountInputShortcuts} from '../input-shortcuts.js';
import {createEditToolbarPlacement} from '../edit-toolbar.js';
import {createNativeDisplayPipeline} from '../native-display.js';
import * as replyFormats from '../reply-formats.js';import * as configCore from '../config/core.js';import * as configHost from '../config/host.js';import * as configPanel from '../config/panel.js';import * as configContracts from '../config/contracts.js';import * as nativeBeauty from '../native-beauty.js';
import * as liveSettings from '../narrative-bridge.js';import * as appearanceSettings from '../appearance-settings.js';import {mountSettingsApp} from '../settings-app.js';
import * as displaySettings from '../display-settings.js';
import {HEART_DIRECTIONS,HEART_ROWS} from '../preset-hearts.js';import * as actions from '../actions.js';import {registerPresetProtocol} from '../preset.js';import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Window} from 'happy-dom';import * as model from '../model.js';import * as layout from '../layout.js';import * as icons from '../icons.js';import * as navigation from '../navigation.js';import * as reader from '../reader.js';import * as notebook from '../notebook.js';import {fixture as replyFixture} from './fixtures/journey-r4.cjs';
async function setup({generateWait,optionsWait,idleWait=async()=>{},welcome=false,bookHelper,realMessages=false,nativeIdentity=false,cacheAvailable=true,bindStory=!welcome&&!nativeIdentity}={}){const w=new Window({url:'http://localhost'});w.document.body.innerHTML='<div id="top-settings-holder">'+Array.from({length:9},(_,i)=>`<div id="${['ai-config-button','sys-settings-button','advanced-formatting-button','WI-SP-button','user-settings-button','backgrounds-button','extensions-settings-button','persona-management-button','rightNavHolder'][i]}" class="drawer"><div class="drawer-toggle"><i class="drawer-icon" title="${i}"></i></div><div class="drawer-content closedDrawer"></div></div>`).join('')+'</div><div id="sheld"><div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">正文</div><div class="mes_buttons"><button class="mes_edit">edit</button><button class="mes_create_branch">branch</button><div class="extraMesButtonsHint"></div></div></div></div></div></div><div id="nonQRFormItems"><div id="leftSendForm"></div><textarea id="send_textarea"></textarea><div id="rightSendForm"></div></div><button id="option_regenerate"></button><button id="options_button"></button>';
if(nativeIdentity||cacheAvailable)w.indexedDB=new IDBFactory();if(realMessages)w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.structuredClone=structuredClone;const uploadedAvatars=new Set();w.nativeUploads=0;w.fetch=async(url,options)=>{if(url==='img/user-default.png')return {ok:true,blob:async()=>new Blob(['isolated-avatar'])};if(url==='/api/avatars/upload'){w.nativeUploads++;const path=options.body.get('overwrite_name');uploadedAvatars.add(path);return {ok:true,json:async()=>({path})};}return {ok:true,json:async()=>[{file_name:JSON.parse(options.body).avatar_url+'.jsonl',mes:'已保存正文'}]};};const errors=[],handlers={},formatCalls=[],listeners=new Map();const on=(e,f)=>{if(!listeners.has(e))listeners.set(e,[]);listeners.get(e).push(f);handlers[e]=(...args)=>Promise.all([...(listeners.get(e)??[])].map(fn=>fn(...args)));};const ctx={registerMacro:()=>{},unregisterMacro:()=>{},saveChat:async()=>true,chatId:'a',characterId:0,chatMetadata:{},chatCompletionSettings:{prompts:[]},chat:[{mes:'正文',is_user:false}],characters:[{avatar:'a.png',name:'同名',chat:'a',tags:['悬疑']},{avatar:'b.png',name:'同名',chat:'b',tags:['日常']}],extensionSettings:{},getRequestHeaders:()=>({}),getChatCompletionModel:()=> 'test-model',substituteParams:s=>s,getCurrentChatId:()=> 'a',getWorldInfoNames:()=>[],getPresetManager:()=>({getAllPresets:()=>[],getSelectedPresetName:()=>'',getCompletionPresetByName:()=>({})}),eventTypes:{WORLDINFO_ENTRIES_LOADED:'entries-loaded',WORLDINFO_SCAN_DONE:'scan-done',OAI_PRESET_CHANGED_AFTER:'preset-after',GENERATION_AFTER_COMMANDS:'before',CHAT_COMPLETION_SETTINGS_READY:'payload',APP_READY:'ready',CHAT_CHANGED:'chat',CHAT_CREATED:'chat-created',GROUP_CHAT_CREATED:'group-chat-created',PERSONA_CHANGED:'persona-changed',GENERATION_STARTED:'generation-start',GENERATION_ENDED:'generation-end',GENERATION_STOPPED:'generation-stop',MESSAGE_RECEIVED:'received',MESSAGE_UPDATED:'updated',MESSAGE_EDITED:'edited',MESSAGE_DELETED:'deleted',MESSAGE_SWIPED:'swiped'},eventSource:{on,emit:async(e,...args)=>{for(const fn of [...(listeners.get(e)??[])])await fn(...args);},removeListener:(e,f)=>{const list=listeners.get(e);if(list)listeners.set(e,list.filter(fn=>fn!==f));}},saveSettingsDebounced:()=>{},mainApi:'openai'};let generating=false,generated=[];w.fixture={SLOT_TARGETS,nativePanelContentProcessor,resetNativePanelSources,chatSelectionDiagnostic,chatSelectionSummary,selectChatReady:options=>selectChatReady({...options,schedule:fn=>setTimeout(fn,16),cancel:clearTimeout}),notifySelectedChatContent,...uiOperation,...generationOperation,waitForGenerationIdle:idleWait,initializePresetConnection,createGlobalFonts,mountThemeWorkbench,messageCardCover,createIdentityService,createNativePersonaGateway,evaluateIdentityOnboarding,mountIdentityOnboarding,mountIdentityPage,default_user_avatar:'img/user-default.png',getUserAvatars:async()=>[...new Set([...Object.keys(ctx.powerUserSettings?.personas??{}),...uploadedAvatars])],initPersona:async(id,name,description)=>{ctx.powerUserSettings.personas[id]=name;ctx.powerUserSettings.persona_descriptions[id]={description};},convertCharacterToPersona:async()=>true,saveMetadata:async()=>true,createPersonaGateway,createWorldbookConditionGate,projectToolTurns:undefined,user_avatar:'',initUserAvatar:id=>w.fixture.setActivePersona(id),setPersonaDescription:()=>{ctx.powerUserSettings.persona_description=ctx.powerUserSettings.persona_descriptions[w.fixture.user_avatar]?.description??'';},setUserName:name=>{ctx.name1=name;},...panelSurfaces,mountSettingsHome,createCharacterGroupHost:()=>({open(target){w.characterGroupTarget=target;},identity:{connect(){}},bindings:{list:()=>[]},isBusy:()=>false,hasDraft:()=>false,dispose(){}}),installWorldbookOrder:()=>({clear(){},assertReady(){},available:true}),createWorldbookConsole:({openNative})=>({open(){w.worldbookOpened=(w.worldbookOpened??0)+1;},isBusy:()=>false,hasDraft:()=>false,dispose(){},openNative}),select_group_chats:(id)=>{w.groupEditorId=id;},...homeDirectory,deleteCharacter:async()=>false,deleteCharacterChatByName:async()=>{},closeCurrentChat:async()=>true,timestampToMoment:()=>({isValid:()=>false}),mountHome:(d,c,o)=>mountHome(d,c,{...o,mountArt:()=>({ready:Promise.resolve(),setPlaying(){},dispose(){}})}),getThumbnailUrl:(type,file)=>`/thumbnail?type=${type}&file=${encodeURIComponent(file)}`,...chatLoading,power_user:{chat_truncation:100},isBoundedChatSurfaceView:()=>false,...messageCache,...paragraphActions,...fullscreen,...communication,...revision,...userRevision,...settingsNavigation,...revisionUI,swipe:async(_,direction,{forceMesId:id,forceSwipeId:index})=>{ctx.chat[id].swipe_id=index;ctx.chat[id].mes=ctx.chat[id].swipes[index];},deleteSwipe:async(index,id)=>{const m=ctx.chat[id];m.swipes.splice(index,1);m.swipe_id=Math.min(m.swipe_id,m.swipes.length-1);m.mes=m.swipes[m.swipe_id];return m.swipe_id;},messageEdit:async id=>{const n=w.document.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);n.innerHTML='<textarea class="edit_textarea"></textarea>';n.firstChild.value=ctx.chat[id].mes;},hydrateChatMessageSwipes:async()=>{},isMessageSwipeable:()=>true,getOverswipeBehavior:()=>'regenerate',branchChat:async()=>{},createTextTransport,createEditToolbarPlacement,interfaceSnapshot,validateInterfaceSettings,createNativeConfiguration,createRegexGate,isScopedScriptsAllowed:()=>true,allowScopedScripts:()=>{},isPresetScriptsAllowed:()=>true,allowPresetScripts:()=>{},createTableService:options=>createTableService({...options,...(bookHelper?{books:createBookGateway(()=>bookHelper,()=>ctx)}:{})}),createNativeVectors,setExtensionPrompt:()=>{},mountInputShortcuts,createNativeDisplayPipeline:options=>(w.displayPipeline=createNativeDisplayPipeline(options)),RegexProvider:{instance:{get:()=>null}},substituteParams:s=>s,substituteParamsExtended:s=>s,...replyFormats,appendFileContent:async(m,s)=>s,yaml:{parse:JSON.parse},...configCore,...configHost,...configPanel,...configContracts,...nativeBeauty,loadAgentSystemSettings:async()=>({agentModeEnabled:false}),getRegexScripts:()=>[],getRegexedString:s=>s,proxies:[],createGenerationParameters:async(settings,model,type,messages)=>({generate_data:{messages,model,type}}),...displaySettings,...liveSettings,...appearanceSettings,mountSettingsApp,enqueueChatSave:task=>task(),persistedChatMetadata:()=>({...ctx.chatMetadata}),saveCharacterChatMetadata:async()=>{},saveGroupChatMetadata:async()=>{},emotionCatalog:()=>({ready:Promise.resolve(),names:()=>[]}),mountEmotionAtlas:()=>({dispose(){}}),saveSettings:async()=>true,HEART_DIRECTIONS,HEART_ROWS,...actions,sendTextareaMessage:async()=>{generated.push(['native-send',w.document.querySelector('#send_textarea').value]);w.document.querySelector('#send_textarea').value='';},registerPresetProtocol,promptManager:{getPromptOrderForCharacter:()=>[]},mountMessageAppearance:realMessages?realMessageAppearance:()=>({sync(){},shouldRender:()=>true,revealHistory(){},dispose(){},restore(){},refresh(){}}),mountChatEffects:()=>({dispose(){},refresh(){}}),mountPet:(_,options)=>{w.phoneOptions=options;return {dispose(){},refresh(){},isVisible:()=>true,setVisible(){}}},getContext:()=>ctx,isGenerating:()=>generating,Generate:async(...args)=>{generated.push([...args,w.document.querySelector('#send_textarea').value]);await generateWait?.(...args);},getAgentGenerationOptions:async()=>await optionsWait?.()??({}),hasActiveAgentRun:()=>false,loadReadingFont:async()=>{},messageFormatting:(...args)=>{formatCalls.push(args);return args[0].replaceAll('&','&amp;').replaceAll('<','&lt;');},...model,...layout,...icons,...navigation,...reader,...notebook};Object.assign(w.fixture.power_user,{personas:{},persona_descriptions:{},persona_description:''});if(nativeIdentity){ctx.powerUserSettings=w.fixture.power_user;ctx.name1='玩家';}w.toastr={error:t=>errors.push(t)};
if(welcome){ctx.chatId=undefined;ctx.characterId=undefined;if(welcome!=='existing')ctx.characters=[];ctx.chat=[{mes:'欢迎',is_system:true}];}
Object.assign(w.fixture,shellV3(w,ctx,{bindStory}));
let code=await readFile(new URL('../index.js',import.meta.url),'utf8');code=code.replaceAll('import.meta.url',JSON.stringify('http://localhost/scripts/extensions/third-party/tisya-tavern/index.js')).replace(/^import \{([^}]+)\} from '[^']+';/gm,(_,names)=>{const parts=names.split(',').map(x=>x.trim());return parts.includes('user_avatar')?`const {${parts.filter(x=>x!=='user_avatar').join(',')}}=window.fixture;let user_avatar=window.fixture.user_avatar;window.fixture.setActivePersona=id=>{user_avatar=id;window.fixture.user_avatar=id;};`:`const {${names}}=window.fixture;`;}).replace('export function registerChatSurface','function registerChatSurface');w.eval(code);await handlers.ready();if(bindStory)await w.Tisya.forms.initialize();await w.happyDOM.whenAsyncComplete();return {w,ctx,errors,generated,handlers,emit:async(e,...args)=>{for(const fn of [...(listeners.get(e)??[])])await fn(...args);},formatCalls,setGenerating:v=>generating=v};}
async function click(f,a){const errorCount=f.errors.length;
 let target=a==='menu'?f.w.document.querySelector('#tisya-menu-trigger'):f.w.document.querySelector(`[data-tisya-action="${a}"]`);
 if(!target&&['contacts','home'].includes(a)){await click(f,'menu');if(a==='contacts')await click(f,'home');target=f.w.document.querySelector(`[data-tisya-action="${a}"]`);}
 // The current settings directory is inside the workbench shadow root. Exercise
 // its visible search and row click instead of invoking a hidden legacy route.
 if(!target){const shadow=f.w.document.querySelector('.tisya-v3-workbench')?.shadowRoot,search=shadow?.querySelector('[aria-label="查找设置"]'),cap=f.w.fixture.CAPABILITIES.find(row=>row.id===a);if(search&&cap){search.value=a;search.dispatchEvent(new f.w.Event('input'));target=[...shadow.querySelectorAll('button.row')].find(b=>b.querySelector('strong')?.textContent===cap.label)??shadow.querySelector('button.row');}}
 assert(target,'Missing visible action: '+a);if(target.getRootNode().host?.classList.contains('tisya-v3-workbench'))await target.onclick();else target.click();await f.w.happyDOM.whenAsyncComplete();
 if(a==='menu'&&workbench(f)?.querySelector('.tw').getAttribute('aria-busy')!=='true')await f.w.workbenchViews?.find(v=>v.root===f.w.document.querySelector('.tisya-v3-workbench'))?.settled();
 if(['message-tools-save','longpress-save','directory-save','directory-pin','directory-group-save','save-continue'].includes(a))await waitFor(()=>!target.isConnected||f.errors.length>errorCount,'saving '+a);
}
async function waitFor(predicate,label='condition'){for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.ok(predicate(),label);}
const workbench=f=>f.w.document.querySelector('.tisya-v3-workbench')?.shadowRoot;
async function workbenchClick(f,text){const root=workbench(f),button=[...root.querySelectorAll('button')].find(n=>n.textContent===text||n.querySelector('strong')?.textContent===text);assert(button,'Missing workbench button: '+text);await button.onclick();await f.w.happyDOM.whenAsyncComplete();}
test('mounted initializer survives unrelated generation cleanup, saves reviewed forms and retains editor drafts',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true}),previous=globalThis.fetch;let release,signal,payload,calls=0;
 const source='北门是一座石门。',reply={schemaChanges:[],templates:[],base:{templates:[],changes:[{id:'new:gate',table:'objects',expected:0,values:{名称:'北门',类型:'place',描述:'石门'},access:{readers:['读者'],knowers:[]},evidence:source}]},initial:{templates:[],changes:[]},notes:['地点档案']};
 globalThis.fetch=async(_,options)=>{calls++;payload=JSON.parse(options.body);signal=options.signal;await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true});});return {ok:true,json:async()=>({choices:[{message:{content:formatSimpleSheet(reply)}}]})};};
 try{
  await click(f,'menu');await workbenchClick(f,'工作台');await workbenchClick(f,'初始化／从资料提炼');const root=workbench(f);
  const field=root.querySelector('[aria-label="待整理的资料"]');assert.ok(field);field.value=source;field.dispatchEvent(new f.w.Event('input'));
  const button=text=>[...root.querySelectorAll('button')].find(n=>n.textContent===text||n.querySelector('strong')?.textContent===text);
  const pending=button('生成设定草案').onclick();for(let i=0;!release&&i<200;i++)await new Promise(r=>setTimeout(r,5));assert.ok(release,root.querySelector('[role=alert]')?.textContent||JSON.stringify(f.errors));
  assert.equal(root.querySelector('.tw').getAttribute('aria-busy'),'true');assert.equal((await f.w.Tisya.tables.inspect()).rows.some(r=>r.values.名称==='北门'),false);
  await f.emit('generation-stop');await f.emit('generation-end');await f.emit('chat');await new Promise(r=>setTimeout(r,20));assert.equal(root.host.isConnected,true);assert.equal(field.isConnected,true);assert.equal(signal.aborted,false);assert.match(JSON.stringify(payload.messages),/北门是一座石门/);assert.equal(calls,1);
  button('全部设置').click();assert.equal(field.isConnected,true);assert.equal(field.value,source);
  release();await pending;await f.w.happyDOM.whenAsyncComplete();assert.ok(root.querySelector('[aria-label="采用设定 北门"]'));assert.equal(calls,1);
  await workbenchClick(f,'全部设置');assert.match(root.querySelector('[role=alert]').textContent,/草案/);
  await workbenchClick(f,'北门');const desc=root.querySelector('[aria-label="描述 · 值"]');assert.ok(desc);desc.value='石门，门面完整';desc.dispatchEvent(new f.w.Event('input'));
  root.querySelector('[aria-label="返回上一层"]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(desc.isConnected,true);assert.equal(desc.value,'石门，门面完整');
  await workbenchClick(f,'保留这一项修改');await workbenchClick(f,'核对整组变更');await workbenchClick(f,'保存已选设定');
  const rows=(await f.w.Tisya.tables.inspect()).rows.filter(r=>r.values.名称==='北门');assert.equal(rows.length,1);assert.equal(rows[0].values.描述,'石门，门面完整');assert.match(root.querySelector('[role=status]').textContent,/已保存/);
  await workbenchClick(f,'北门');await workbenchClick(f,'手动编辑');const name=root.querySelector('[aria-label="名称 · 值"]');assert.ok(name);name.value='北门修订';name.dispatchEvent(new f.w.Event('input'));await workbenchClick(f,'全部设置');assert.equal(name.isConnected,true);assert.match(root.querySelector('[role=alert]').textContent,/未保存/);
  await workbenchClick(f,'放弃修改');assert.equal((await f.w.Tisya.tables.inspect()).rows.find(r=>r.id===rows[0].id).values.名称,'北门');
 }finally{release?.();globalThis.fetch=previous;await f.w.happyDOM.abort();}
});
test('phone and sidebar open the same read-only notes and public memory pages',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true}),d=f.w.document;f.ctx.chat[0].mes=replyFixture();const source=f.ctx.chat[0].mes;
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
test('phone settings, theme and protocol use original settings routes; applications remain native',async()=>{
 const f=await setup(),d=f.w.document;
 for(const [name,title]of [['设置','游玩偏好'],['主题','外观与阅读']]){f.w.phoneOptions.onOpenApp(name);await f.w.happyDOM.whenAsyncComplete();await new Promise(r=>setTimeout(r,5));if(name==='设置'){assert(workbench(f)?.querySelector('[aria-label="查找设置"]'));await click(f,'settings-app');}const root=d.querySelector('.tisya-config').shadowRoot;assert.equal(root.querySelector('h2').textContent,title);[...root.querySelectorAll('button')].find(b=>b.textContent==='返回设置').click();}
 let protocol=0;d.querySelector('#advanced-formatting-button .drawer-toggle').onclick=()=>protocol++;f.w.phoneOptions.onOpenApp('协议');await f.w.happyDOM.whenAsyncComplete();assert.equal(protocol,1);assert.equal(d.querySelector('.tisya-config'),null);let opened=0;d.querySelector('#extensions-settings-button .drawer-toggle').onclick=()=>opened++;f.w.phoneOptions.onOpenApp('应用');await f.w.happyDOM.whenAsyncComplete();assert.equal(opened,1);f.w.phoneOptions.onOpenApp('通信');await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-page h2').textContent,/角色/);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('phone theme workshop saves live effect choices and preserves atlas destination',async()=>{
 const f=await setup(),d=f.w.document;f.w.phoneOptions.onOpenApp('主题');await f.w.happyDOM.whenAsyncComplete();await new Promise(r=>setTimeout(r,5));const panel=d.querySelector('.tisya-config').shadowRoot,root=panel.querySelector('.tisya-theme-workbench').shadowRoot;root.querySelector('[data-page=effects]').click();await new Promise(r=>setTimeout(r,5));for(const [label,on]of [['落雪',true],['水纹',false]]){const input=root.querySelector('[aria-label="'+label+'"]');input.checked=on;input.onchange();}assert.equal(f.ctx.extensionSettings['缇斯亚界面']?.显示区块?.extensions?.落雪,undefined);assert.equal([...root.querySelectorAll('button')].some(n=>n.textContent==='保存外观'),false);[...panel.querySelectorAll('button')].find(n=>n.textContent==='保存配置').click();await f.w.happyDOM.whenAsyncComplete();await new Promise(r=>setTimeout(r,5));assert.equal(f.ctx.extensionSettings['缇斯亚界面'].显示区块.extensions.落雪,true);assert.equal(f.ctx.extensionSettings['缇斯亚界面'].显示区块.extensions.水纹,false);assert.match(root.querySelector('.status').textContent,/已保存/);f.w.phoneOptions.onOpenApp('图鉴');await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-page h2').textContent,/图鉴/);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('editing or swiping invalidates an open reader and notebook without touching messages',async()=>{
 const f=await setup(),d=f.w.document;f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();d.querySelector('.tisya-notebook-card button').click();
 f.ctx.chat[0].mes='已更新';f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('.tisya-reader'),null);assert.match(d.querySelector('#tisya-overlay').textContent,/已变化/);assert.equal(d.querySelectorAll('.tisya-notebook-card').length,0);assert.match(d.querySelector('#tisya-notebook').textContent,/已变化/);assert.equal(f.ctx.chat[0].mes,'已更新');
 await click(f,'close');d.querySelector('.tisya-notebook-pager').lastElementChild.click();await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-notebook-card').textContent,/已更新/);
 f.ctx.chatId='b';f.handlers.chat();assert.equal(d.querySelector('#tisya-notebook'),null);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('notebook lookup works during a pending generation and tears down on return to native UI',async()=>{
 const stream=deferred(),f=await setup({generateWait:()=>stream.promise,bindStory:true,cacheAvailable:true}),d=f.w.document;await click(f,'next');assert.equal(f.generated.length,1,JSON.stringify(f.errors));
 f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelectorAll('.tisya-notebook-card').length,1);d.querySelector('.tisya-notebook-actions').children[1].click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelectorAll('#tisya-notebook').length,0);assert.equal(f.generated.length,1,JSON.stringify(f.errors));
 stream.resolve();await new Promise(resolve=>setTimeout(resolve,0));f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();const old=d.querySelector('.tisya-notebook-card button');await click(f,'menu');await click(f,'disable');old.click();assert.equal(d.querySelector('#tisya-overlay'),null);assert.equal(f.w.phoneOptions.onOpenApp('手记'),false);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('contacts, labels, grouping and teardown keep native nodes',async()=>{const f=await setup();const native=f.w.document.querySelector('.mes_text');await click(f,'contacts');assert.equal(f.w.document.querySelectorAll('.tisya-contact').length,2);f.w.document.querySelector('.tisya-contact [data-tisya-action^="directory-menu:"]').click();await click(f,'directory-group');f.w.document.querySelector('#tisya-directory-group-name').value='世界卡';await click(f,'directory-group-save');for(let i=0;i<100&&f.ctx.extensionSettings.缇斯亚界面.联系人分组['a.png']!=='世界卡'&&!f.errors.length;i++)await new Promise(r=>setTimeout(r,5));assert.deepEqual(f.errors,[]);assert.equal(f.ctx.extensionSettings.缇斯亚界面.联系人分组['a.png'],'世界卡');await click(f,'menu');const search=workbench(f).querySelector('[aria-label="查找设置"]');search.value='背景';search.dispatchEvent(new f.w.Event('input'));assert.match(workbench(f).querySelector('button.row').textContent,/聊天背景/);let backgrounds=0;f.w.document.querySelector('#backgrounds-button .drawer-toggle').onclick=()=>backgrounds++;await click(f,'drawer:backgrounds-button');assert.equal(backgrounds,1);await click(f,'menu');await click(f,'disable');assert.equal(f.w.document.querySelectorAll('#tisya-shell').length,0);assert.equal(f.w.document.querySelectorAll('.tisya-actions').length,0);assert.equal(f.w.document.querySelector('.mes_text'),native);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();});
test('continue requests next normal response, never submits composer draft',async()=>{const f=await setup({bindStory:true,cacheAvailable:true});f.w.document.querySelector('#send_textarea').value='未发送草稿';await click(f,'next');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/草稿/);f.w.document.querySelector('#send_textarea').value='';await click(f,'next');assert.equal(f.generated.length,1);assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,true);f.w.happyDOM.abort();});
test('message menu refuses edited source and generation blocks editing',async()=>{const f=await setup();let edits=0;f.w.document.querySelector('.mes_edit').addEventListener('click',()=>edits++);await click(f,'more');f.ctx.chat[0].mes='变化';await click(f,'msg-edit');assert.equal(edits,0);assert.match(f.errors.at(-1),/变化/);f.ctx.chat[0].mes='正文';await click(f,'close');await click(f,'more');f.setGenerating(true);await click(f,'msg-edit');assert.equal(edits,0);assert.match(f.errors.at(-1),/生成/);f.w.happyDOM.abort();});

test('home lists every persisted chat and keeps same-name contacts separate',async()=>{const f=await setup();assert.equal(f.w.document.querySelectorAll('[data-home-chat]').length,2);assert.match(f.w.document.querySelector('[data-home-card="0"]').textContent,/a.png/);assert.match(f.w.document.querySelector('[data-home-card="1"]').textContent,/b.png/);f.w.fetch=async()=>{throw new Error('连接失败')};await click(f,'home');assert.equal(f.w.document.querySelectorAll('[role="alert"]').length,2);assert.equal(f.w.document.querySelectorAll('[data-home-chat]').length,0);f.w.happyDOM.abort();});

test('production home checks avatar identity and selects the exact persisted chat before closing',async()=>{
 const f=await setup(),d=f.w.document,calls=[];f.ctx.selectCharacterById=async(id,options)=>{calls.push({id,options});f.ctx.characterId=id;f.ctx.chatId=options.chatFile;};
 f.ctx.characters[0].avatar='replaced.png';d.querySelector('[data-home-card="0"]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(calls.length,0);assert.match(f.errors.at(-1),/角色列表已变化/);
 d.querySelector('[data-home-card="1"]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(calls.length,1);assert.equal(calls[0].id,1);assert.equal(calls[0].options.switchMenu,false);assert.equal(calls[0].options.chatFile,'b.png');assert.equal(d.querySelector('#tisya-shell').classList.contains('tisya-page-open'),false);assert.equal(d.querySelector('.tisya-home'),null);await f.w.happyDOM.abort();
});
test('homepage USER opens the unified identity page and retains a real native-controls exit',async()=>{
 const f=await setup(),d=f.w.document;let opened=0;d.querySelector('#persona-management-button .drawer-toggle').onclick=()=>opened++;
 await click(f,'drawer:persona-management-button');assert.equal(opened,0);assert(d.querySelector('#tisya-user-page'));d.querySelector('[data-action=manage]').click();await f.w.happyDOM.whenAsyncComplete();d.querySelector('[data-user-action=native]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opened,1);await click(f,'home');
 d.querySelector('#WI-SP-button .drawer-toggle').onclick=()=>opened++;await click(f,'drawer:WI-SP-button');assert.equal(opened,1);assert.equal(f.w.worldbookOpened,1);await click(f,'home');
 d.querySelector('.tisya-home-role-open').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('.tisya-page h2').textContent,'同名');assert(d.querySelector('[data-tisya-action="select:0"]'));assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});

test('worldbook entry stays accessible during streaming and chat editing stays locked',async()=>{const f=await setup();try{f.setGenerating(true);await click(f,'drawer:WI-SP-button');assert.equal(f.w.worldbookOpened,1);assert.deepEqual(f.errors,[]);await click(f,'more');await click(f,'msg-edit');assert.match(f.errors.at(-1),/生成/);}finally{await f.w.happyDOM.abort();}});

test('streaming disables actions and generation end re-enables both on same mounted message',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true}),regen=f.w.document.querySelector('[data-tisya-action="regen"]'),next=f.w.document.querySelector('[data-tisya-action="next"]');
 f.setGenerating(true);f.handlers['generation-start']();await f.w.happyDOM.whenAsyncComplete();
 assert.equal(regen.disabled,true);assert.equal(next.disabled,true);assert.match(next.title,/生成/);
 f.setGenerating(false);f.handlers['generation-end']();await f.w.happyDOM.whenAsyncComplete();
 assert.equal(regen.disabled,false);assert.equal(next.disabled,false);
 await click(f,'more');await click(f,'msg-revision');assert.equal(f.generated.length,0);assert.ok(f.w.document.querySelector('#tisya-revision-panel'));await click(f,'close');
 await click(f,'next');assert.equal(f.generated.length,1,JSON.stringify(f.errors));assert.equal(f.generated[0][0],'normal');
 await click(f,'menu');await click(f,'disable');f.handlers['generation-end']();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.document.querySelectorAll('.tisya-actions').length,0);f.w.happyDOM.abort();
});

async function addHistory(f){
 f.ctx.chat=[{mes:'第一条',is_user:false},{mes:'用户第二条',is_user:true},{mes:'最后条',is_user:false}];
 await f.emit('chat');await f.w.Tisya.forms.initialize();
 f.w.document.querySelector('.mes_text').textContent='第一条';
 const log=[];f.ctx.deleteMessage=async id=>{log.push('delete:'+id);f.ctx.chat.splice(id,1);};f.ctx.saveChat=async()=>{log.push('save');};
 return log;
}
test('old AI advanced reroll opens review without deleting history',async()=>{
 const f=await setup(),log=await addHistory(f);await click(f,'more');await click(f,'msg-revision');
 assert.deepEqual(log,[]);assert.equal(f.ctx.chat.length,3);assert.equal(f.generated.length,0);assert.ok(f.w.document.querySelector('#tisya-revision-panel'));assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('old user continue returns to that turn and requests next reply',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true}),log=await addHistory(f);f.ctx.chat[0].is_user=true;await click(f,'next');
 for(let i=0;i<100&&!f.generated.length&&!f.errors.length;i++)await new Promise(r=>setTimeout(r,5));assert.deepEqual(f.errors,[]);assert.deepEqual(log.filter(x=>x.startsWith('delete:')),['delete:2','delete:1']);assert.equal(log.at(-1),'save');assert.equal(f.ctx.chat[0].mes,'第一条');assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,true);f.w.happyDOM.abort();
});
test('rollback marker-save failure prevents deletion and generation',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true}),log=await addHistory(f);delete f.ctx.chat[2].tisya_w24_floor;await f.emit('chat');f.ctx.saveChat=async()=>{throw Error('保存失败');};await click(f,'next');
 assert.equal(f.generated.length,0);assert.deepEqual(log,[]);assert.equal(f.ctx.chat.length,3);assert.match(f.errors.at(-1),/保存失败/);f.w.happyDOM.abort();
});
test('rollback final-save failure reports completed deletions and prevents generation',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true}),log=await addHistory(f);const save=f.ctx.saveChat;f.ctx.saveChat=async()=>{if(f.ctx.chat.length===1)throw Error('保存失败');return save();};await click(f,'next');
 for(let i=0;i<150&&!f.errors.length;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(f.generated.length,0);assert.equal(f.ctx.chat.length,1);assert.deepEqual(log.filter(x=>x.startsWith('delete:')),['delete:2','delete:1']);assert.match(f.errors.at(-1),/已删除后续 2 条消息.*保存失败/);f.w.happyDOM.abort();
});
test('draft and disconnected model prevent any history deletion',async()=>{
 for(const offline of [false,true]){const f=await setup(),log=await addHistory(f);if(offline)f.ctx.onlineStatus='no_connection';else f.w.document.querySelector('#send_textarea').value='草稿';await click(f,'next');assert.deepEqual(log,[]);assert.equal(f.ctx.chat.length,3);assert.equal(f.generated.length,0);f.w.happyDOM.abort();}
});
test('custom continue text persists and reaches native normal generation as user input',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true});await click(f,'menu');await click(f,'continue-settings');f.w.document.querySelector('#tisya-continue-text').value='请从这里继续。';await click(f,'save-continue');
 for(let i=0;i<100&&f.ctx.extensionSettings.缇斯亚界面.继续用户消息!=='请从这里继续。'&&!f.errors.length;i++)await new Promise(r=>setTimeout(r,5));assert.deepEqual(f.errors,[]);assert.equal(f.ctx.extensionSettings.缇斯亚界面.继续用户消息,'请从这里继续。');
 await click(f,'next');assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,false);assert.equal(f.generated[0][2],'请从这里继续。');f.w.happyDOM.abort();
});

test('typing a draft during rollback preserves it and stops generation',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true});await addHistory(f);const remove=f.ctx.deleteMessage;
 f.ctx.deleteMessage=async id=>{await remove(id);f.w.document.querySelector('#send_textarea').value='刚写的草稿';};
 await f.w.eval("saveInterfaceSettings({联系人分组:{},继续用户消息:'继续'})");
 await click(f,'next');for(let i=0;i<150&&!f.errors.length;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.generated.length,0);assert.equal(f.w.document.querySelector('#send_textarea').value,'刚写的草稿');assert.match(f.errors.at(-1),/新增了草稿/);f.w.happyDOM.abort();
});
test('unloaded sparse history is rejected without deletion',async()=>{
 const f=await setup(),log=await addHistory(f);delete f.ctx.chat[1];await click(f,'next');assert.deepEqual(log,[]);assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/完整加载/);f.w.happyDOM.abort();
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
 d.querySelector('.action-mode-toggle').click();await d.querySelector('[data-mode="'+mode+'"]').onclick();await f.w.happyDOM.whenAsyncComplete();assert.equal(input.value,'已有草稿');assert.equal(f.generated.length,0);
 button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(input.value,mode==='append'?'已有草稿\n察看门锁':'察看门锁');assert.equal(d.querySelector('#tisya-overlay').open,false);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
for(const change of ['message','chat'])test('action refuses changed '+change+' after opening inline mode menu',async()=>{
 const f=await setup(),button=await openActions(f),d=f.w.document;d.querySelector('#send_textarea').value='原草稿';d.querySelector('.action-mode-toggle').click();
 if(change==='message')f.ctx.chat[0].mes='发生变化';else f.ctx.getCurrentChatId=()=> 'another-chat';
 button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('#send_textarea').value,'原草稿');assert.equal(f.generated.length,0);assert.match(d.querySelector('.action-feedback').textContent,/变化|会话/);await f.w.happyDOM.abort();
});
test('direct send is an explicit mode and native submission occurs only after an action click',async()=>{
 const f=await setup(),button=await openActions(f),d=f.w.document;d.querySelector('.action-mode-toggle').click();await d.querySelector('[data-mode="send"]').onclick();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.generated.length,0);assert.equal(d.querySelector('#send_textarea').value,'');
 button.click();await f.w.happyDOM.whenAsyncComplete();assert.deepEqual(f.generated,[['native-send','察看门锁']]);assert.equal(d.querySelector('#send_textarea').value,'');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('direct send preserves a nonempty draft with inline feedback',async()=>{
 const f=await setup(),button=await openActions(f),d=f.w.document;d.querySelector('#send_textarea').value='我的草稿';d.querySelector('.action-mode-toggle').click();await d.querySelector('[data-mode="send"]').onclick();await f.w.happyDOM.whenAsyncComplete();button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('#send_textarea').value,'我的草稿');assert.equal(f.generated.length,0);assert.match(d.querySelector('.action-feedback').textContent,/已有草稿/);await f.w.happyDOM.abort();
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
 const deletion=deferred(),f=await setup();let saves=0;f.ctx.chat.push({mes:'后文'});await f.emit('chat');await f.w.Tisya.forms.initialize();f.ctx.deleteMessage=async id=>{await deletion.promise;f.ctx.chat.splice(id,1);};f.ctx.saveChat=async()=>{saves++;};
 try{await click(f,'next');await f.emit('generation-stop');assert.equal(f.generated.length,0);deletion.resolve();await waitFor(()=>f.errors.length>0,'rollback cancellation reported');await f.w.happyDOM.whenAsyncComplete();assert.equal(f.ctx.chat.length,1);assert.ok(saves>=1,'completed deletion was persisted');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/已删除后续 1 条消息/);assert.equal(f.w.document.querySelector('[data-tisya-action="next"]').disabled,false);}finally{deletion.resolve();await f.w.happyDOM.abort();}
});

test('a pending stream allows all dialog dismissals, reading, settings and native navigation without interrupting generation',async()=>{
 const stream=deferred(),f=await setup({generateWait:()=>stream.promise}),d=f.w.document;
 try {
  await click(f,'next');assert.equal(f.generated.length,1);assert.equal(d.querySelector('[data-tisya-action="next"]').disabled,true);
  for(const dismiss of ['close','backdrop','escape','cancel']){
   await click(f,'menu');assert(workbench(f));await click(f,'continue-settings');const dialog=d.querySelector('#tisya-overlay');assert.equal(dialog.open,true);
   if(dismiss==='close')await click(f,'close');
   else if(dismiss==='backdrop')dialog.querySelector('.tisya-backdrop').click();
   else if(dismiss==='escape')d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   else dialog.dispatchEvent(new f.w.Event('cancel',{cancelable:true}));
   await f.w.happyDOM.whenAsyncComplete();assert.equal(dialog.open,false,dismiss);
  }
  await click(f,'more');await click(f,'msg-read');assert.equal(d.querySelector('#tisya-overlay').getAttribute('aria-label'),'阅读与回合记录');await click(f,'close');
  await click(f,'menu');await click(f,'continue-settings');d.querySelector('#tisya-continue-text').value='以后继续用这条';await click(f,'save-continue');assert.notEqual(f.ctx.extensionSettings.缇斯亚界面.继续用户消息,'以后继续用这条');assert.match(f.errors.pop(),/等待或停止/);await click(f,'close');
  await click(f,'menu');await click(f,'motion-toggle');assert.notEqual(f.ctx.extensionSettings.缇斯亚界面.动态效果,false);assert.match(workbench(f).querySelector('[role=alert]').textContent,/等待或停止/);
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
  assert.equal(d.querySelector('#tisya-overlay').open,false);assert(workbench(f));assert.equal(d.querySelector('.tisya-sub-title').textContent,'缇斯亚');assert.deepEqual(f.errors,[]);
 } finally {copy.resolve();await f.w.happyDOM.abort();}
});

test('pending history save allows menu dismissal and does not close a later panel',async()=>{
 const save=deferred(),f=await setup(),d=f.w.document;await addHistory(f);f.ctx.saveChat=()=>save.promise;
 try {
  await click(f,'more');await click(f,'msg-delete');await click(f,'delete-confirm');assert.equal(f.ctx.chat.length,2);
  await click(f,'close');await click(f,'menu');save.resolve();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelector('#tisya-overlay').open,false);assert(workbench(f));assert.equal(d.querySelector('.tisya-sub-title').textContent,'缇斯亚');assert.deepEqual(f.errors,[]);
 } finally {save.resolve();await f.w.happyDOM.abort();}
});

 test('message toolbar supports only more, custom order, full expansion, and persists independently',async()=>{const f=await setup(),d=f.w.document;await click(f,'more');await click(f,'message-tools');await click(f,'message-tools-collapse');await click(f,'message-tools-save');assert.deepEqual([...d.querySelectorAll('.tisya-actions button')].map(x=>x.dataset.tisyaAction),['more']);await click(f,'more');assert.ok(d.querySelector('[data-tisya-action="msg-regen"]'));await click(f,'message-tools');await click(f,'message-tools-expand');const selects=[...d.querySelectorAll('#tisya-message-slots select')];selects[0].value='more';selects[9].value='regen';await click(f,'message-tools-save');assert.equal(d.querySelectorAll('.tisya-actions button').length,10);assert.equal(d.querySelector('.tisya-actions button').dataset.tisyaAction,'more');assert.equal(f.ctx.extensionSettings.缇斯亚界面.消息快捷栏[0],'more');assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();});

test('failed automatic table initialization is latched before the payload can be sent',async()=>{
 const f=await setup({bindStory:false});try{let aborted=false;await f.emit('before','normal',{},false);await assert.rejects(f.w.tisyaHistoryInput(f.ctx.chat,10000,value=>{aborted=value;},'normal'),/绑定|存档|原点|Select an archive/);assert.equal(aborted,true);assert.equal(f.generated.length,0);}finally{await f.w.happyDOM.abort();}
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


test('welcome startup exposes global settings without requiring a story archive',async()=>{
 for(const welcome of [true,'existing']){const f=await setup({welcome}),d=f.w.document;try{
 assert.deepEqual(f.errors,[]);assert.ok(f.w.phoneOptions);assert.equal(f.w.displayPipeline.state().enabled,false);const before=JSON.stringify(f.ctx.extensionSettings.缇斯亚配置);
 await click(f,'menu');assert(workbench(f));assert.equal(d.querySelector('#tisya-overlay').open,false);await click(f,'settings-app');assert.match(d.querySelector('.tisya-config').shadowRoot.textContent,/游玩偏好/);await click(f,'home');await click(f,'contacts');assert.equal(JSON.stringify(f.ctx.extensionSettings.缇斯亚配置),before);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}}
});
test('welcome to chat to welcome preserves the global display setting and the mounted shell',async()=>{
 const f=await setup({welcome:true}),d=f.w.document;try{
 const pet=f.w.phoneOptions,shell=d.querySelector('#tisya-shell');f.ctx.characters=[{avatar:'a.png',name:'甲',chat:'a'},{avatar:'b.png',name:'乙',chat:'b'}];f.ctx.chatId='a';f.ctx.characterId=0;await f.emit('chat');assert.equal(f.w.displayPipeline.state().enabled,true);
 const state=f.w.Tisya.configuration.read();state.data.worlds[state.key].theme.nativeRegex=false;await f.w.Tisya.configuration.save(state.data,state.revision,state.key);
 for(const [chatId,characterId]of [['b',1],['a',0],[undefined,undefined]]){f.ctx.chatId=chatId;f.ctx.characterId=characterId;await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.displayPipeline.state().enabled,false);}
 await click(f,'menu');assert(workbench(f));assert.ok(f.w.phoneOptions===pet);assert.ok(d.querySelector('#tisya-shell')===shell);assert.equal(d.querySelectorAll('#tisya-menu-trigger').length,1);assert.deepEqual(f.errors,[]);assert.equal(f.generated.length,0);
 }finally{await f.w.happyDOM.abort();}
});

test('native composer persists requirements separately and clears the draft before awaiting the reply',async()=>{
 const f=await setup(),d=f.w.document,input=d.querySelector('#tisya-contractor-input');try{
 input.value='请让角色主动回应';input.dispatchEvent(new f.w.Event('input'));d.querySelector('#send_textarea').value='递出礼物';
 await f.emit('generation-start','normal',{},false);await f.emit('before','normal',{},false);f.ctx.chat.push({is_user:true,mes:'递出礼物'});let aborted=false;
 await f.w.tisyaHistoryInput(f.ctx.chat,10000,value=>{aborted=value;},'normal');assert.equal(aborted,true);
 const writer=f.w.v3Requests.at(-1),materials=writer.messages.filter(m=>m.content.includes('contractor-direction'));assert.equal(materials.length,1);assert.equal(parseSimpleSheet(materials[0].content).text,'请让角色主动回应');assert.equal(input.value,'');assert.equal(f.ctx.chat.at(-2).mes,'递出礼物');assert.match(f.ctx.chat.at(-1).mes,/角色接过礼物并回应/);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});


test('Android immersive entry remains discoverable and invokes the persistent native toggle',async()=>{const f=await setup(),d=f.w.document;try{let enabled=false,calls=0;f.w.TauriTavernAndroidSystemUiBridge={setImmersiveFullscreenEnabled:v=>{enabled=v;},isImmersiveFullscreenEnabled:()=>enabled};const control=d.createElement('button');control.id='option_toggle_fullscreen';control.onclick=()=>{calls++;enabled=!enabled;};d.body.append(control);for(const label of ['沉浸全屏','退出沉浸全屏']){await click(f,'menu');const search=workbench(f).querySelector('[aria-label="查找设置"]');search.value='fullscreen';search.oninput();assert.equal(workbench(f).querySelector('button.row strong').textContent,label);await click(f,'fullscreen');}assert.equal(calls,2);assert.equal(enabled,false);assert.deepEqual(f.errors,[]);}finally{await f.w.happyDOM.abort();}});

test('legacy native shortcut is hidden without overwriting settings; advanced revision remains in More',async()=>{const f=await setup(),d=f.w.document;f.ctx.extensionSettings.缇斯亚界面={联系人分组:{},消息快捷栏:['regen','msg-native','more']};f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('[data-tisya-action=msg-native]'),null);assert.deepEqual(f.ctx.extensionSettings.缇斯亚界面.消息快捷栏,['regen','msg-native','more']);await click(f,'more');assert(d.querySelector('[data-tisya-action=msg-revision]'));assert(!d.querySelector('[data-tisya-action=msg-native]'));await f.w.happyDOM.abort();});

test('candidate navigation has its own final row after message tools',async()=>{const f=await setup(),d=f.w.document;f.ctx.chat[0].swipes=['旧版','正文','新版'];f.ctx.chat[0].swipe_id=1;f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();const actions=d.querySelector('.tisya-actions'),tools=actions.querySelector('.tisya-message-tools'),versions=actions.querySelector('.tisya-candidate-row');assert(versions);assert.equal(actions.lastElementChild,versions);assert.equal(tools.querySelector('[data-tisya-action=candidate-prev]'),null);assert(tools.querySelector('[data-tisya-action=more]'));assert.equal(versions.querySelectorAll('button').length,3);assert.equal(versions.querySelector('[aria-label="当前候选"]').textContent,'2/3');assert.equal(versions.querySelector('[data-tisya-action=candidate-prev]').disabled,false);assert.equal(versions.querySelector('[data-tisya-action=candidate-next]').disabled,false);await f.w.happyDOM.abort();});

test('direct candidate jump edits the selected native text and deletes only selected version',async()=>{const f=await setup({bindStory:true,cacheAvailable:true}),d=f.w.document;const m=f.ctx.chat[0];m.swipes=Array.from({length:11},(_,i)=>'版本'+(i+1));m.swipe_id=0;m.mes=m.swipes[0];f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();await click(f,'candidate-picker');d.querySelector('#tisya-candidate-select').value='10';await click(f,'candidate-select');assert.equal(m.swipe_id,10);assert.equal(m.mes,'版本11');await click(f,'more');await click(f,'msg-edit');assert.equal(d.querySelector('.edit_textarea').value,'版本11');d.querySelector('.edit_textarea').remove();f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();await click(f,'candidate-picker');assert.equal(d.querySelector('#tisya-candidate-select').value,'10');await click(f,'candidate-delete');await click(f,'candidate-delete-confirm');assert.equal(m.swipes.length,10);assert.equal(m.mes,'版本10');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();});

test('production initializer wires asynchronous message cache without disabling the shell',async()=>{
 const f=await setup({realMessages:true,bindStory:false});try{f.ctx.chat[0].mes=replyFixture();await f.emit('updated',0);await new Promise(r=>setTimeout(r,60));const visual=f.w.document.querySelector('#chat .tisya-message-visual');assert(visual);assert.match(visual.shadowRoot.querySelector('.story').textContent,/门开了/);assert.equal(visual.shadowRoot.querySelector('#cover').getAttribute('src'),messageCardCover(f.ctx,f.ctx.chat[0],avatar=>f.w.fixture.getThumbnailUrl('avatar',avatar)));await click(f,'menu');assert(workbench(f));assert.equal(f.w.document.querySelector('#tisya-overlay').open,false);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);}finally{await f.w.happyDOM.abort();}
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
 const f=await setup(),before=JSON.stringify(f.ctx.chat);try{await click(f,'menu');await click(f,'display-cache');const root=f.w.document.querySelector('#tisya-chat-loading'),press=text=>[...root.querySelectorAll('button')].find(n=>n.textContent===text).click();press('设为 10 条');press('保存条数');await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.fixture.power_user.chat_truncation,10);assert.equal(JSON.stringify(f.ctx.chat),before);assert.match(root.textContent,/已保存，下次进入会话生效/);assert.deepEqual(f.errors,[]);}finally{await f.w.happyDOM.abort();}
});

test('settings has one destination per entry and discovers later native drawers',async()=>{
 const f=await setup(),d=f.w.document;try{const extra=d.createElement('div');extra.className='drawer';extra.innerHTML='<button class="drawer-toggle"><i class="drawer-icon" title="新增扩展"></i></button><div class="drawer-content"><input value="kept"></div>';d.querySelector('#top-settings-holder').append(extra);
 await click(f,'menu');const catalog=f.w.Tisya.capabilities.list();assert.equal(new Set(catalog.map(r=>r.id)).size,catalog.length);for(const obsolete of ['contacts','drawer:rightNavHolder','drawer:persona-management-button','cache-clear','memory','chat-all','section:mcp'])assert.equal(catalog.some(r=>r.id===obsolete),false);
 const search=workbench(f).querySelector('[aria-label="查找设置"]');search.value='新增扩展';search.oninput();let opened=0;extra.querySelector('.drawer-toggle').onclick=()=>opened++;await workbenchClick(f,'新增扩展');assert.equal(opened,1);assert.equal(extra.querySelector('input').value,'kept');assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('groups use stable native IDs; inline management does not load a chat',async()=>{
 const f=await setup(),d=f.w.document;f.ctx.groups=[{id:'g:1',name:'同名群',members:['a.png'],chats:['chat-1'],chat_id:'chat-1'},{id:'g2',name:'同名群',members:['b.png'],chats:['chat-2'],chat_id:'chat-2'}];let reads=0;f.ctx.openGroupChat=async(id,file)=>{reads++;f.ctx.groupId=id;f.ctx.chatId=file;};
 await click(f,'groups');assert.equal(d.querySelectorAll('.tisya-group-row').length,2);await click(f,'group-menu:g%3A1');assert.equal(d.querySelectorAll('.tisya-directory-inline').length,1);assert.equal(d.querySelector('#tisya-overlay').open,false);await click(f,'group-edit:g%3A1');assert.equal(f.w.characterGroupTarget.id,'g:1');assert.equal(reads,0);assert.equal(f.ctx.chatId,'a');assert(d.querySelector('.tisya-group-row'));
 await click(f,'group-open:g2');assert.equal(reads,1);assert.equal(f.ctx.groupId,'g2');assert.equal(f.ctx.chatId,'chat-2');assert.equal(d.querySelector('.tisya-group-row'),null);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('cache drafts block page and phone navigation until saved or discarded',async()=>{
 const f=await setup(),d=f.w.document;await click(f,'menu');await click(f,'display-cache');const input=d.querySelector('[aria-label="首批消息条数"]');input.value='17';await click(f,'home');assert.equal(d.querySelector('[aria-label="首批消息条数"]'),input);f.w.phoneOptions.onOpenApp('通信');await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('[aria-label="首批消息条数"]'),input);assert.equal(f.w.fixture.power_user.chat_truncation,100);
 [...d.querySelectorAll('#tisya-chat-loading button')].find(n=>n.textContent==='保存条数').click();await f.w.happyDOM.whenAsyncComplete();await click(f,'home');assert(d.querySelector('.tisya-home'));assert.equal(f.w.fixture.power_user.chat_truncation,17);assert(f.errors.every(e=>e.includes('尚未保存')));await f.w.happyDOM.abort();
});
test('native API editor opens from clean config but never discards an edited route',async()=>{
 const f=await setup(),d=f.w.document;await click(f,'menu');await click(f,'settings-tab:api');const dom=d.querySelector('.tisya-config').shadowRoot;let opens=0;d.querySelector('#sys-settings-button .drawer-toggle').onclick=()=>opens++;
 const manage=[...dom.querySelectorAll('button')].find(n=>n.textContent==='管理 API、凭据和模型');manage.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opens,1);
 const model=dom.querySelector('[aria-label="通用 模型"]');model.value='draft-model';model.dispatchEvent(new f.w.Event('change'));manage.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opens,1);assert.match(dom.querySelector('footer').textContent,/保存或放弃/);assert.equal(model.value,'draft-model');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('home settings invokes the menu; menu rename and pin persist with native names unchanged',async()=>{
 const f=await setup(),d=f.w.document;d.querySelector('.tisya-home-rail-bottom [data-tisya-action="menu"]').click();await f.w.happyDOM.whenAsyncComplete();assert(workbench(f).textContent.includes('游玩偏好'));assert.equal(d.querySelector('.tisya-home'),null);assert.equal(d.querySelector('#tisya-overlay').open,false);await click(f,'home');
 d.querySelector('.tisya-home-chat-row .tisya-home-menu').click();await click(f,'directory-rename');d.querySelector('#tisya-directory-name').value='我喜欢的故事';await click(f,'directory-save');assert.match(d.querySelector('[data-home-chat]').textContent,/我喜欢的故事/);assert.equal(f.ctx.characters[0].name,'同名');assert.equal(f.ctx.chat[0].mes,'正文');
 d.querySelectorAll('.tisya-home-role>summary .tisya-home-menu')[1].click();await click(f,'directory-pin');assert.match(d.querySelector('.tisya-home-role-open').dataset.tisyaAction,/card:1/);assert.equal(d.querySelector('.tisya-home-form-note'),null);assert.equal(d.querySelector('.tisya-home-profile small').textContent,'用户入口 ↗');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('late host autoload leaves home visible, while choosing a row still opens exact chat',async()=>{
 const f=await setup(),d=f.w.document;const home=d.querySelector('.tisya-home');f.ctx.chatId='loaded-later';await f.emit('chat');assert.equal(d.querySelector('.tisya-home'),home);let selections=0;f.ctx.selectCharacterById=async(id,o)=>{selections++;f.ctx.characterId=id;f.ctx.chatId=o.chatFile;await f.emit('chat');};
 d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(selections,1);assert.equal(d.querySelector('.tisya-home'),null);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
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
 let f;f=await setup({generateWait:async()=>{await f.emit('generation-start','normal',{automatic_trigger:true},false);await f.emit('before','normal',{},false);await f.w.tisyaHistoryInput(f.ctx.chat,10000,()=>{},'normal');await f.emit('generation-end');}});
 try{f.ctx.chat[0].is_user=true;await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();
 await click(f,'more');await click(f,'msg-edit');f.ctx.chat[0].mes='改成停下来等他';await f.emit('edited',0);f.w.document.querySelector('.edit_textarea').remove();await f.emit('updated',0);await f.w.happyDOM.whenAsyncComplete();
 const regen=f.w.document.querySelector('[data-tisya-action=regen]');assert.equal(regen.disabled,false);assert.equal(regen.getAttribute('aria-label'),'重投下一条');
 f.w.document.querySelector('#send_textarea').value='没发送';await click(f,'regen');assert.equal(f.generated.length,0);assert.match(f.errors.pop(),/草稿/);f.w.document.querySelector('#send_textarea').value='';
 await click(f,'regen');await waitFor(()=>f.generated.length===1||f.errors.length,'reroll dispatched');assert.deepEqual(f.errors,[]);assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,true);
 for(let i=0;i<1000&&regen.disabled&&!f.errors.length;i++)await new Promise(r=>setTimeout(r,5));assert.deepEqual(f.errors,[]);assert.equal(regen.disabled,false);
 const writer=f.w.v3Requests.at(-1),comparison=writer.messages.find(m=>m.role==='user'&&m.content.includes('user-rewrite-material'));assert.ok(comparison);assert.deepEqual(parseSimpleSheet(comparison.content),{kind:'user-rewrite-material',previous:'正文',current:'改成停下来等他'});
 await click(f,'next');await waitFor(()=>f.generated.length===2||f.errors.length,'ordinary continuation dispatched');for(let i=0;i<1000&&regen.disabled&&!f.errors.length;i++)await new Promise(r=>setTimeout(r,5));assert.deepEqual(f.errors,[]);assert.equal(f.generated.length,2);assert.doesNotMatch(JSON.stringify(f.w.v3Requests.at(-1)),/user-rewrite-material/);assert.equal(f.ctx.chat.length,2);
 }finally{await f.w.happyDOM.abort();}
});

test('all settings entry points reuse one page, preserve search and discover a drawer installed while open',async()=>{
 const f=await setup(),d=f.w.document;try{
 await click(f,'menu');const page=d.querySelector('.tisya-v3-workbench');let input=workbench(f).querySelector('[aria-label="查找设置"]');input.value='世界书';input.oninput();
 f.w.phoneOptions.onOpenApp('设置');await f.w.happyDOM.whenAsyncComplete();await click(f,'menu');assert.ok(d.querySelector('.tisya-v3-workbench')===page);assert.equal(workbench(f).querySelector('[aria-label="查找设置"]').value,'世界书');assert.equal(d.querySelectorAll('.tisya-v3-workbench').length,1);assert.equal(d.querySelector('#tisya-overlay').open,false);
 const extra=d.createElement('div');extra.id='late-plugin';extra.className='drawer';extra.innerHTML='<button class="drawer-toggle"><i class="drawer-icon" title="后装扩展"></i></button><div class="drawer-content"></div>';d.querySelector('#top-settings-holder').append(extra);await click(f,'menu');assert.ok(d.querySelector('.tisya-v3-workbench')===page);input=workbench(f).querySelector('[aria-label="查找设置"]');assert.equal(input.value,'世界书');input.value='后装扩展';input.oninput();assert.equal([...workbench(f).querySelectorAll('strong')].filter(n=>n.textContent==='后装扩展').length,1);
 const catalog=f.w.Tisya.capabilities.list();for(const id of ['role-library','group-library','drawer:WI-SP-button','drawer:ai-config-button'])assert.equal(catalog.filter(r=>r.id===id).length,1);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('settings and identity headers return directly to current chat without changing its contents',async()=>{const f=await setup(),d=f.w.document,history=JSON.stringify(f.ctx.chat),chatId=f.ctx.chatId;await click(f,'menu');for(const route of ['settings-app','user-identity']){await click(f,route);const back=d.querySelector('.tisya-sub-header [data-tisya-action="chat"]');assert.equal(back.textContent,'聊天 ›');back.click();await f.w.happyDOM.whenAsyncComplete();assert(!d.querySelector('#tisya-shell').classList.contains('tisya-page-open'));assert.equal(f.ctx.chatId,chatId);assert.equal(JSON.stringify(f.ctx.chat),history);await click(f,'menu');}assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();});


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
 f.ctx.selectCharacterById=async(id,o)=>{selections++;f.ctx.characterId=id;f.ctx.chatId=o.chatFile;await f.emit('chat');await host.promise;};
 try{
  d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelector('.tisya-home'),null);assert.equal(f.w.Tisya.operationState(),null);
  await click(f,'home');assert(d.querySelector('.tisya-home'));
  d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(selections,1);assert.equal(d.querySelector('.tisya-home'),null);assert.equal(f.w.Tisya.operationState(),null);
  await click(f,'next');await waitFor(()=>f.errors.length>0,'unbound target rejected');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/archive|chat|branch|聊天|会话|存档|绑定|handle/);
 }finally{host.resolve();await f.w.happyDOM.abort();}
});


test('managed committed tail releases home lock even when host never emits CHAT_CHANGED',async()=>{
 const host=deferred(),f=await setup(),d=f.w.document;let participant,processor;
 f.w.__TAURITAVERN__={api:{...f.w.__TAURITAVERN__.api,chatSurface:{protocolVersion:1,isManagedOwnershipRequired:()=>true,registerContentProcessor:p=>{processor=p;},registerParticipant:p=>{participant=p;return {};}}}};
 f.w.eval('registerChatSurface()');
 assert.equal(processor.id,'tisya-ui/native-panel-source');
 assert.equal(await processor.prepare({message:f.ctx.chat[0],mesid:0},async()=>'base'),'base');
 f.ctx.selectCharacterById=async(id,o)=>{f.ctx.characterId=id;f.ctx.chatId=o.chatFile;await host.promise;};
 try{
  d.querySelector('[data-home-chat]').click();await f.w.happyDOM.whenAsyncComplete();assert(f.w.Tisya.operationState());
  const element=d.querySelector('#chat .mes'),content=element.querySelector('.mes_text');
  participant.didCommitContent({element,content,mesid:0,signal:new f.w.AbortController().signal});
  await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.Tisya.operationState(),null);assert.equal(d.querySelector('.tisya-home'),null);
  await click(f,'next');await waitFor(()=>f.errors.length>0,'unbound target rejected');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/archive|chat|branch|聊天|会话|存档|绑定|handle/);
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
  assert.equal(d.querySelector('.tisya-home'),null);assert.equal(f.w.Tisya.operationState(),null);
  await click(f,'next');await waitFor(()=>f.errors.length>0,'unbound target rejected');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/archive|chat|branch|聊天|会话|存档|绑定|handle/);
 }finally{host.resolve();await f.w.happyDOM.abort();}
});

test('cached configuration retains drafts across menu and cards, rejects stale save, and prevents shutdown from losing them',async()=>{
 const f=await setup(),d=f.w.document;try{
  await click(f,'menu');await click(f,'settings-tab:api');const first=d.querySelector('.tisya-config'),dom=first.shadowRoot,input=dom.querySelector('[aria-label="通用 模型"]');input.value='draft-only-A';input.dispatchEvent(new f.w.Event('change'));
  await click(f,'menu');assert.equal(first.isConnected,false);await click(f,'settings-tab:api');assert.equal(d.querySelector('.tisya-config'),first);assert.equal(input.value,'draft-only-A');
  f.ctx.chatId='b';f.ctx.characterId=1;await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();await click(f,'menu');await click(f,'settings-tab:api');assert.ok(d.querySelector('.tisya-config')!==first);assert.notEqual(d.querySelector('.tisya-config').shadowRoot.querySelector('[aria-label="通用 模型"]').value,'draft-only-A');
  await click(f,'menu');await click(f,'disable');assert(d.body.classList.contains('tisya-active'));assert.match(workbench(f).querySelector('[role=alert]').textContent,/保存或放弃/);
  f.ctx.chatId='a';f.ctx.characterId=0;await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();await click(f,'menu');await click(f,'settings-tab:api');assert.equal(d.querySelector('.tisya-config'),first);assert.equal(input.value,'draft-only-A');
  const snapshot=f.w.Tisya.configuration.read();snapshot.data.worlds[snapshot.key].context.history=9;await f.w.Tisya.configuration.save(snapshot.data,snapshot.revision,snapshot.key);
  await [...dom.querySelectorAll('button')].find(b=>b.textContent==='保存配置').onclick();assert.match(dom.querySelector('[role="alert"]').textContent,/其他页面修改/);assert.equal(input.value,'draft-only-A');assert.notEqual(f.w.Tisya.configuration.read().data.routes.global.model,'draft-only-A');assert.equal(f.w.Tisya.configuration.read().world.context.history,9);
 }finally{await f.w.happyDOM.abort();}
});

test('cached settings entry resolves request inspection and ordinary mode pages independently',async()=>{
 const f=await setup(),d=f.w.document;try{
  await click(f,'menu');await click(f,'settings-tab:api');const host=d.querySelector('.tisya-config');await click(f,'menu');await click(f,'context-overview');assert.equal(d.querySelector('.tisya-config'),host);assert.match(host.shadowRoot.querySelector('main').textContent,/尚无本版请求快照/);
  await click(f,'menu');await click(f,'settings-tab:mode');assert.equal(d.querySelector('.tisya-config'),host);assert(host.shadowRoot.querySelector('[aria-label="选择润色规则"]'));assert.doesNotMatch(host.shadowRoot.querySelector('main').textContent,/尚无本版请求快照/);
 }finally{await f.w.happyDOM.abort();}
});

function seedNativePlayer(f,{linked=true}={}){const p=f.ctx.powerUserSettings;p.personas['old-player.png']='旧玩家';p.persona_descriptions['old-player.png']={description:'旧卡人物设定',connections:[{type:'character',id:linked?'a.png':'other-card.png'}]};p.default_persona='old-player.png';p.persona_description='旧卡人物设定';f.ctx.name1='旧玩家';f.w.fixture.setActivePersona('old-player.png');}
const playerClick=async(f,action)=>{f.w.document.querySelector('.tisya-player-setup [data-action="'+action+'"]').click();await f.w.happyDOM.whenAsyncComplete();await new Promise(r=>setTimeout(r,0));};
test('canonical identity entry creates through the real gateway and binds only this card/chat',async()=>{
 const f=await setup({nativeIdentity:true}),d=f.w.document;try{
  seedNativePlayer(f,{linked:false});const before=structuredClone(f.ctx.powerUserSettings.persona_descriptions['old-player.png']);
  await click(f,'user-identity');assert(workbench(f));await workbenchClick(f,'管理用户身份');assert(d.querySelector('.tisya-user'));
  d.querySelector('[data-user-action=new-player]').click();await f.w.happyDOM.whenAsyncComplete();
  for(const [selector,value]of [['[data-native-name]','本卡新玩家'],['[data-native-description]','独立的新设定']]){const n=d.querySelector(selector);n.value=value;n.dispatchEvent(new f.w.Event('input',{bubbles:true}));}
  d.querySelector('[data-user-action=native-create]').click();await f.w.happyDOM.whenAsyncComplete();
  const created=f.w.fixture.user_avatar;assert.match(created,/^tisya-player-[a-f0-9-]+\.png$/);assert.equal(f.w.nativeUploads,1);assert.equal(f.ctx.chatMetadata.persona,created);assert.deepEqual(f.ctx.powerUserSettings.persona_descriptions[created].connections,[{type:'character',id:'a.png'}]);assert.deepEqual(f.ctx.powerUserSettings.persona_descriptions['old-player.png'],before);assert.equal(f.ctx.powerUserSettings.default_persona,'old-player.png');assert.equal(f.ctx.powerUserSettings.personas[created],'本卡新玩家');assert(d.querySelector('.tisya-user'));assert.equal(d.querySelector('.tisya-player-notice'),null);
  d.querySelector('[data-user-action=close]').click();await f.w.happyDOM.whenAsyncComplete();assert(workbench(f)?.querySelector('[aria-label="查找设置"]'));assert.deepEqual(f.errors,[]);
 }finally{f.w.eval('hidePage()');await f.w.happyDOM.abort();}
});
test('real new-chat event opens archive and identity selection without implicit binding and fires once per scope',async()=>{
 const f=await setup({nativeIdentity:true}),d=f.w.document;try{seedNativePlayer(f);await f.emit('chat-created');await f.w.workbenchViews.at(-1).settled();assert.match(workbench(f).textContent,/本故事资料/);assert.equal(f.ctx.chatMetadata.persona,undefined);assert.equal((await f.w.Tisya.books.binding()).pointer,null);assert.equal(f.w.nativeUploads,0);await click(f,'chat');await f.emit('chat-created');assert.equal(d.querySelectorAll('.tisya-v3-workbench').length,0);assert.equal(f.ctx.powerUserSettings.default_persona,'old-player.png');assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});
test('identity creation draft blocks navigation until explicitly saved or discarded',async()=>{
 const f=await setup({nativeIdentity:true}),d=f.w.document;try{seedNativePlayer(f,{linked:false});await click(f,'user-identity');await workbenchClick(f,'管理用户身份');d.querySelector('[data-user-action=new-player]').click();await f.w.happyDOM.whenAsyncComplete();const name=d.querySelector('[data-native-name]');name.value='还没提交的玩家';name.dispatchEvent(new f.w.Event('input',{bubbles:true}));await click(f,'menu');assert.ok(name.isConnected);assert.equal(name.value,'还没提交的玩家');assert.match(f.errors.pop(),/保存或放弃/);assert.equal(f.w.nativeUploads,0);assert.equal(f.ctx.chatMetadata.persona,undefined);d.querySelector('[data-user-action=native-cancel]').click();await f.w.happyDOM.whenAsyncComplete();await click(f,'menu');assert(workbench(f));assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});
test('new-chat prompt does not displace an edited profile; its notice uses the same identity entry',async()=>{
 const f=await setup({nativeIdentity:true}),d=f.w.document;try{seedNativePlayer(f);f.ctx.chatMetadata.persona='old-player.png';await click(f,'user-identity');await workbenchClick(f,'管理用户身份');d.querySelector('[data-user-action=edit-profile]').click();await f.w.happyDOM.whenAsyncComplete();const name=d.querySelector('[data-field=name]');name.value='未保存编辑';name.dispatchEvent(new f.w.Event('input',{bubbles:true}));await f.emit('chat-created');assert.ok(d.querySelector('[data-field=name]')===name);assert.equal(name.value,'未保存编辑');assert.equal(d.querySelectorAll('.tisya-v3-workbench').length,0);assert.equal(d.querySelector('.tisya-player-notice button').dataset.tisyaAction,'user-identity');d.querySelector('[data-user-action=discard]').click();await f.w.happyDOM.whenAsyncComplete();await click(f,'home');assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});
test('native group-created event opens shared binding UI and identity selection binds only the group',async()=>{
 const f=await setup({nativeIdentity:true}),d=f.w.document;try{seedNativePlayer(f);f.ctx.groupId='g-new';f.ctx.chatId='g-chat';f.ctx.chatMetadata={};f.ctx.powerUserSettings.persona_descriptions['old-player.png'].connections.push({type:'group',id:'g-new'});await f.emit('group-chat-created');await f.w.workbenchViews.at(-1).settled();assert.match(workbench(f).textContent,/本故事资料/);assert.equal(f.ctx.chatMetadata.persona,undefined);await workbenchClick(f,'管理用户身份');d.querySelector('[data-user-action=select]').click();await f.w.happyDOM.whenAsyncComplete();await waitFor(()=>f.ctx.chatMetadata.persona==='old-player.png','group persona saved');assert.deepEqual(f.ctx.powerUserSettings.persona_descriptions['old-player.png'].connections,[{type:'character',id:'a.png'},{type:'group',id:'g-new'}]);assert.equal(f.w.nativeUploads,0);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('current composition root exposes initialization and history intake from home and world archives',async()=>{
 const f=await setup({bindStory:true,cacheAvailable:true});try{
  await click(f,'menu');await click(f,'assistant');await workbenchClick(f,'工作台');
  assert([...workbench(f).querySelectorAll('button')].some(n=>n.querySelector('strong')?.textContent==='初始化／从资料提炼'));
  await workbenchClick(f,'历史补录');assert(workbench(f).querySelector('[aria-label="完整历史原文"]'));assert.match(workbench(f).textContent,/旧状态不能覆盖较新的进度/);
  const source=workbench(f).querySelector('[aria-label="完整历史原文"]');source.value='旧历史原文\n  保留空白';source.dispatchEvent(new f.w.Event('input'));
  await click(f,'menu');await click(f,'assistant');await workbenchClick(f,'工作台');await workbenchClick(f,'世界档案');
  // Parking the workbench retains the pending source; returning from intake is explicit.
  assert.equal(workbench(f).querySelector('[aria-label="完整历史原文"]').value,'旧历史原文\n  保留空白');
  await workbenchClick(f,'‹ 返回世界档案');await workbenchClick(f,'初始化／从资料提炼');assert(workbench(f).querySelector('[aria-label="待整理的资料"]'));assert(!workbench(f).querySelector('[aria-label="完整历史原文"]'));assert.deepEqual(f.errors,[]);
 }finally{f.w.eval('hidePage()');await f.w.happyDOM.abort();}
});
