import {createIdentityService} from '../user-identity-service.js';
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
async function setup({generateWait,optionsWait,welcome=false,bookHelper,realMessages=false}={}){const w=new Window({url:'http://localhost'});w.document.body.innerHTML='<div id="top-settings-holder">'+Array.from({length:9},(_,i)=>`<div id="${['ai-config-button','sys-settings-button','advanced-formatting-button','WI-SP-button','user-settings-button','backgrounds-button','extensions-settings-button','persona-management-button','rightNavHolder'][i]}" class="drawer"><div class="drawer-toggle"><i class="drawer-icon" title="${i}"></i></div><div class="drawer-content closedDrawer"></div></div>`).join('')+'</div><div id="sheld"><div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">正文</div><div class="mes_buttons"><button class="mes_edit">edit</button><button class="mes_create_branch">branch</button><div class="extraMesButtonsHint"></div></div></div></div></div></div><div id="nonQRFormItems"><div id="leftSendForm"></div><textarea id="send_textarea"></textarea><div id="rightSendForm"></div></div><button id="option_regenerate"></button><button id="options_button"></button>';
if(realMessages)w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.structuredClone=structuredClone;w.fetch=async(url,options)=>({ok:true,json:async()=>[{file_name:JSON.parse(options.body).avatar_url+'.jsonl',mes:'已保存正文'}]});const errors=[],handlers={},formatCalls=[],listeners=new Map();const on=(e,f)=>{if(!listeners.has(e))listeners.set(e,[]);listeners.get(e).push(f);handlers[e]=(...args)=>Promise.all([...(listeners.get(e)??[])].map(fn=>fn(...args)));};const ctx={registerMacro:()=>{},unregisterMacro:()=>{},saveChat:async()=>true,chatId:'a',characterId:0,chatMetadata:{},chatCompletionSettings:{prompts:[]},chat:[{mes:'正文',is_user:false}],characters:[{avatar:'a.png',name:'同名',chat:'a',tags:['悬疑']},{avatar:'b.png',name:'同名',chat:'b',tags:['日常']}],extensionSettings:{},getRequestHeaders:()=>({}),getChatCompletionModel:()=> 'test-model',substituteParams:s=>s,getCurrentChatId:()=> 'a',getWorldInfoNames:()=>[],getPresetManager:()=>({getAllPresets:()=>[],getSelectedPresetName:()=>'',getCompletionPresetByName:()=>({})}),eventTypes:{WORLDINFO_ENTRIES_LOADED:'entries-loaded',WORLDINFO_SCAN_DONE:'scan-done',OAI_PRESET_CHANGED_AFTER:'preset-after',GENERATION_AFTER_COMMANDS:'before',CHAT_COMPLETION_SETTINGS_READY:'payload',APP_READY:'ready',CHAT_CHANGED:'chat',GENERATION_STARTED:'generation-start',GENERATION_ENDED:'generation-end',GENERATION_STOPPED:'generation-stop',MESSAGE_RECEIVED:'received',MESSAGE_UPDATED:'updated',MESSAGE_EDITED:'edited',MESSAGE_DELETED:'deleted',MESSAGE_SWIPED:'swiped'},eventSource:{on,removeListener:(e,f)=>{const list=listeners.get(e);if(list)listeners.set(e,list.filter(fn=>fn!==f));}},saveSettingsDebounced:()=>{},mainApi:'openai'};let generating=false,generated=[];w.fixture={createIdentityService,mountIdentityPage,convertCharacterToPersona:async()=>true,saveMetadata:async()=>true,createPersonaGateway,createWorldbookConditionGate,projectToolTurns:undefined,user_avatar:'',initUserAvatar:()=>{},setPersonaDescription:()=>{},setUserName:()=>{},...panelSurfaces,mountSettingsHome,createCharacterGroupHost:()=>({open(target){w.characterGroupTarget=target;},identity:{connect(){}},bindings:{list:()=>[]},isBusy:()=>false,hasDraft:()=>false,dispose(){}}),installWorldbookOrder:()=>({clear(){},assertReady(){},available:true}),createWorldbookConsole:({openNative})=>({open(){w.worldbookOpened=(w.worldbookOpened??0)+1;},isBusy:()=>false,hasDraft:()=>false,dispose(){},openNative}),select_group_chats:(id)=>{w.groupEditorId=id;},...homeDirectory,deleteCharacter:async()=>false,deleteCharacterChatByName:async()=>{},closeCurrentChat:async()=>true,timestampToMoment:()=>({isValid:()=>false}),mountHome:(d,c,o)=>mountHome(d,c,{...o,mountArt:()=>({ready:Promise.resolve(),setPlaying(){},dispose(){}})}),getThumbnailUrl:(type,file)=>`/thumbnail?type=${type}&file=${encodeURIComponent(file)}`,...chatLoading,power_user:{chat_truncation:100},isBoundedChatSurfaceView:()=>false,...messageCache,...paragraphActions,...fullscreen,...communication,...revision,...userRevision,...settingsNavigation,...revisionUI,swipe:async(_,direction,{forceMesId:id,forceSwipeId:index})=>{ctx.chat[id].swipe_id=index;ctx.chat[id].mes=ctx.chat[id].swipes[index];},deleteSwipe:async(index,id)=>{const m=ctx.chat[id];m.swipes.splice(index,1);m.swipe_id=Math.min(m.swipe_id,m.swipes.length-1);m.mes=m.swipes[m.swipe_id];return m.swipe_id;},messageEdit:async id=>{const n=w.document.querySelector(`#chat .mes[mesid="${id}"] .mes_text`);n.innerHTML='<textarea class="edit_textarea"></textarea>';n.firstChild.value=ctx.chat[id].mes;},hydrateChatMessageSwipes:async()=>{},isMessageSwipeable:()=>true,getOverswipeBehavior:()=>'regenerate',branchChat:async()=>{},createTextTransport,createEditToolbarPlacement,interfaceSnapshot,validateInterfaceSettings,createNativeConfiguration,createRegexGate,isScopedScriptsAllowed:()=>true,allowScopedScripts:()=>{},isPresetScriptsAllowed:()=>true,allowPresetScripts:()=>{},createTableService:options=>createTableService({...options,...(bookHelper?{books:createBookGateway(()=>bookHelper,()=>ctx)}:{})}),createNativeVectors,setExtensionPrompt:()=>{},mountInputShortcuts,createNativeDisplayPipeline:options=>(w.displayPipeline=createNativeDisplayPipeline(options)),RegexProvider:{instance:{get:()=>null}},substituteParams:s=>s,substituteParamsExtended:s=>s,...replyFormats,appendFileContent:async(m,s)=>s,yaml:{parse:JSON.parse},...configCore,...configHost,...configPanel,...configContracts,...nativeBeauty,loadAgentSystemSettings:async()=>({agentModeEnabled:false}),getRegexScripts:()=>[],getRegexedString:s=>s,proxies:[],createGenerationParameters:async(settings,model,type,messages)=>({generate_data:{messages,model,type}}),...displaySettings,...liveSettings,...appearanceSettings,mountSettingsApp,enqueueChatSave:task=>task(),persistedChatMetadata:()=>({...ctx.chatMetadata}),saveCharacterChatMetadata:async()=>{},saveGroupChatMetadata:async()=>{},emotionCatalog:()=>({ready:Promise.resolve(),names:()=>[]}),mountEmotionAtlas:()=>({dispose(){}}),saveSettings:async()=>true,HEART_DIRECTIONS,HEART_ROWS,...actions,sendTextareaMessage:async()=>{generated.push(['native-send',w.document.querySelector('#send_textarea').value]);w.document.querySelector('#send_textarea').value='';},registerPresetProtocol,promptManager:{getPromptOrderForCharacter:()=>[]},mountMessageAppearance:realMessages?realMessageAppearance:()=>({sync(){},shouldRender:()=>true,revealHistory(){},dispose(){},restore(){},refresh(){}}),mountChatEffects:()=>({dispose(){},refresh(){}}),mountPet:(_,options)=>{w.phoneOptions=options;return {dispose(){},refresh(){},isVisible:()=>true,setVisible(){}}},getContext:()=>ctx,isGenerating:()=>generating,Generate:async(...args)=>{generated.push([...args,w.document.querySelector('#send_textarea').value]);await generateWait?.(...args);},getAgentGenerationOptions:async()=>await optionsWait?.()??({}),hasActiveAgentRun:()=>false,loadReadingFont:async()=>{},messageFormatting:(...args)=>{formatCalls.push(args);return args[0].replaceAll('&','&amp;').replaceAll('<','&lt;');},...model,...layout,...icons,...navigation,...reader,...notebook};w.toastr={error:t=>errors.push(t)};
if(welcome){ctx.chatId=undefined;ctx.characterId=undefined;if(welcome!=='existing')ctx.characters=[];ctx.chat=[{mes:'欢迎',is_system:true}];}
let code=await readFile(new URL('../index.js',import.meta.url),'utf8');code=code.replaceAll('import.meta.url',JSON.stringify('http://localhost/scripts/extensions/third-party/tisya-tavern/index.js')).replace(/^import \{([^}]+)\} from '[^']+';/gm,(_,names)=>`const {${names}}=window.fixture;`).replace('export function registerChatSurface','function registerChatSurface');w.eval(code);await handlers.ready();await w.happyDOM.whenAsyncComplete();return {w,ctx,errors,generated,handlers,emit:async(e,...args)=>{for(const fn of [...(listeners.get(e)??[])])await fn(...args);},formatCalls,setGenerating:v=>generating=v};}
async function click(f,a){let target=a==='menu'?f.w.document.querySelector('#tisya-menu-trigger'):f.w.document.querySelector(`[data-tisya-action="${a}"]`);if(!target&&['contacts','home'].includes(a)){await click(f,'menu');if(a==='contacts')await click(f,'home');target=f.w.document.querySelector(`[data-tisya-action="${a}"]`);}target.click();await f.w.happyDOM.whenAsyncComplete();}
test('mounted initializer survives unrelated generation cleanup, saves usable forms and retains dropdown drafts',async()=>{
 const saved=new Map(),binding={primary:'',additional:[]};let uid=0;
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>structuredClone(saved.get(name)),createWorldbook:async(name,entries)=>{saved.set(name,entries.map(e=>({...structuredClone(e),uid:++uid})));return true;},updateWorldbookWith:async(name,fn)=>{const result=fn(structuredClone(saved.get(name)));saved.set(name,result);return result;},getCharWorldbookNames:async()=>structuredClone(binding),rebindCharWorldbooks:async(_,next)=>Object.assign(binding,next)};
 const f=await setup({bookHelper:helper}),previous=globalThis.fetch;let release,signal,payload,calls=0,ruleReviews=0;
 f.ctx.characters[0].description='北门是一座石门。';
 const reply={registry:defaultRegistry(),base:{changes:[{id:'new:gate',table:'objects',expected:0,values:{名称:'北门',类型:'place',属性:{外观:'石门'}},access:{readers:['读者'],knowers:[]},evidence:'北门是一座石门。'}]},initial:{changes:[]},notes:[]};
 globalThis.fetch=async(_,options)=>{const wire=JSON.parse(options.body);if(wire.messages.some(m=>m.content.includes('@MODE rule-review'))){ruleReviews++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({issues:[]})}}]})};}calls++;signal=options.signal;payload=wire;await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(new DOMException('The operation was aborted.','AbortError')),{once:true});});return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(reply)}}]})};};
 try{
  f.w.phoneOptions.onOpenApp('设置');await f.w.happyDOM.whenAsyncComplete();await click(f,'settings-app');const root=f.w.document.querySelector('.tisya-config').shadowRoot,category=root.querySelector('[aria-label="配置分类"]');category.value='tables';await category.onchange();
  const page=root.querySelector('[aria-label="表单功能"]');assert.equal(page.options.length,17);assert.equal(root.querySelectorAll('nav button').length,0);page.value='history';await page.onchange();
  const button=text=>[...root.querySelectorAll('button')].find(n=>n.textContent===text);
  const pending=button('按所选来源建立表单').onclick();for(let i=0;!release&&i<100;i++)await new Promise(r=>setTimeout(r,5));assert(release);assert.equal(page.disabled,true);
  await f.emit('generation-stop');await f.emit('generation-end');await f.emit('chat');assert(root.host.isConnected);assert.equal(signal.aborted,false);assert.match(JSON.stringify(payload.messages),/北门是一座石门/);assert.equal(payload.stream,true);assert.equal(calls,1);assert.equal(ruleReviews,1);
  category.value='world';await category.onchange();assert.equal(category.value,'tables');assert(root.querySelector('footer').textContent.includes('请先保存或放弃'));assert.equal(root.querySelector('footer').hidden,false);button('放弃修改').click();assert(page.isConnected);assert.equal(page.disabled,true);
  release();await pending;assert.match(root.querySelector('.tisya-tables [role=status]').textContent,/建表完成/);assert.equal(f.w.Tisya.tables.state().busy,false);assert.equal((await f.w.Tisya.tables.inspect()).rows[0].values.名称,'北门');
  page.value='forms';await page.onchange();assert.equal(root.querySelectorAll('.tisya-tables fieldset').length,1);const table=root.querySelector('[aria-label="选择表格"]');assert.equal(table.options.length,16);
  await button('编辑此表单').onclick();const input=[...root.querySelectorAll('.tisya-tables input,.tisya-tables textarea')].find(n=>n.value==='北门');assert(input);input.value='北门修订';input.dispatchEvent(new f.w.Event('input'));
  table.value='events';await table.onchange();assert.equal(table.value,'objects');assert.equal(input.value,'北门修订');page.value='history';await page.onchange();assert.equal(page.value,'history');assert.equal(input.isConnected,false);assert.equal((await f.w.Tisya.tables.inspect()).rows[0].values.名称,'北门');page.value='forms';await page.onchange();assert.equal(input.isConnected,true);assert.equal(input.value,'北门修订');
  await button('放弃当前未保存修改').onclick();assert.equal(page.value,'forms');assert(!root.textContent.includes('北门修订'));assert.equal((await f.w.Tisya.tables.inspect()).rows[0].values.名称,'北门');
  category.value='data';await category.onchange();const count=root.querySelector('[aria-label="历史聊天条数（当前输入始终保留）"]');count.value='12';count.dispatchEvent(new f.w.Event('change'));await button('保存配置').onclick();assert.equal(f.w.Tisya.configuration.read().world.context.history,12);assert.match(root.querySelector('footer').textContent,/配置已保存/);
 }finally{release?.();globalThis.fetch=previous;await f.w.happyDOM.abort();}
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
test('phone settings, theme and protocol use original settings routes; applications remain native',async()=>{
 const f=await setup(),d=f.w.document;
 for(const [name,title]of [['设置','游玩偏好'],['主题','主题配置']]){f.w.phoneOptions.onOpenApp(name);await f.w.happyDOM.whenAsyncComplete();await new Promise(r=>setTimeout(r,5));if(name==='设置'){assert(d.querySelector('#tisya-settings-home'));await click(f,'settings-app');}const root=d.querySelector('.tisya-config').shadowRoot;assert.equal(root.querySelector('h2').textContent,title);[...root.querySelectorAll('button')].find(b=>b.textContent==='返回设置').click();}
 let protocol=0;d.querySelector('#advanced-formatting-button .drawer-toggle').onclick=()=>protocol++;f.w.phoneOptions.onOpenApp('协议');await f.w.happyDOM.whenAsyncComplete();assert.equal(protocol,1);assert.equal(d.querySelector('.tisya-config'),null);let opened=0;d.querySelector('#extensions-settings-button .drawer-toggle').onclick=()=>opened++;f.w.phoneOptions.onOpenApp('应用');await f.w.happyDOM.whenAsyncComplete();assert.equal(opened,1);f.w.phoneOptions.onOpenApp('通信');await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-page h2').textContent,/角色/);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('phone original theme editor saves live display settings; atlas keeps its real destination',async()=>{
 const f=await setup(),d=f.w.document;f.w.phoneOptions.onOpenApp('主题');await f.w.happyDOM.whenAsyncComplete();await new Promise(r=>setTimeout(r,5));const root=d.querySelector('.tisya-config').shadowRoot;[...root.querySelectorAll('button')].find(n=>n.textContent==='旅程与聊天外观').click();await f.w.happyDOM.whenAsyncComplete();await new Promise(r=>setTimeout(r,5));const only=[...root.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')==='仅开启落雪');only.click();assert.equal(f.ctx.extensionSettings['缇斯亚界面'],undefined);root.querySelector('[data-apply]').click();await f.w.happyDOM.whenAsyncComplete();await new Promise(r=>setTimeout(r,5));assert.equal(f.ctx.extensionSettings['缇斯亚界面'].显示区块.extensions.落雪,true);assert.equal(f.ctx.extensionSettings['缇斯亚界面'].显示区块.extensions.水纹,false);assert.match(root.querySelector('.appearance-status').textContent,/已保存并应用/);f.w.phoneOptions.onOpenApp('图鉴');await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-page h2').textContent,/图鉴/);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
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
 d.querySelector('[data-home-card="1"]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(calls.length,1);assert.equal(calls[0].id,1);assert.equal(calls[0].options.switchMenu,false);assert.equal(calls[0].options.chatFile,'b.png');assert.equal(d.querySelector('#tisya-shell').classList.contains('tisya-page-open'),false);assert.equal(d.querySelector('.tisya-home'),null);await f.w.happyDOM.abort();
});
test('homepage USER opens the unified identity page and retains a real native-controls exit',async()=>{
 const f=await setup(),d=f.w.document;let opened=0;d.querySelector('#persona-management-button .drawer-toggle').onclick=()=>opened++;
 await click(f,'drawer:persona-management-button');assert.equal(opened,0);assert(d.querySelector('#tisya-user-page'));d.querySelector('[data-user-action=native]').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opened,1);await click(f,'home');
 d.querySelector('#WI-SP-button .drawer-toggle').onclick=()=>opened++;await click(f,'drawer:WI-SP-button');assert.equal(opened,1);assert.equal(f.w.worldbookOpened,1);await click(f,'home');
 d.querySelector('.tisya-home-role-open').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('.tisya-page h2').textContent,'同名');assert(d.querySelector('[data-tisya-action="select:0"]'));assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});

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
  const next=d.querySelector('[data-tisya-action="next"]');next.disabled=false;await click(f,'next');assert.equal(f.generated.length,1);assert.match(f.errors.at(-1),/生成或修改聊天/);
  stream.resolve();await f.w.happyDOM.whenAsyncComplete();assert.equal(next.disabled,false);
 } finally {stream.resolve();await f.w.happyDOM.abort();}
});

test('UI completions cannot release the history lock while generation options are pending',async()=>{
 const options=deferred();let calls=0;const f=await setup({optionsWait:()=>{calls++;return options.promise;}});
 try {
  await click(f,'next');assert.equal(calls,1);assert.equal(f.generated.length,0);
  await click(f,'more');await click(f,'close');await click(f,'menu');await click(f,'input-tools');assert.deepEqual(f.errors,[]);
  await click(f,'next');assert.equal(calls,1);assert.match(f.errors.at(-1),/生成或修改聊天/);
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

test('failed automatic table initialization is latched before the payload can be sent',async()=>{
 const f=await setup();const state=f.w.Tisya.configuration.read();state.data.worlds[state.key].tables={enabled:true};await f.w.Tisya.configuration.save(state.data,state.revision,state.key);await assert.rejects(f.handlers.before('normal'),/酒馆助手/);const payload={messages:[{role:'user',content:'继续'}]};await assert.rejects(f.handlers.payload(payload),/酒馆助手/);assert.throws(()=>JSON.stringify(payload));await f.w.happyDOM.abort();
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
  assert.throws(()=>f.w.Tisya.configuration.read(),/请先打开一个世界的聊天/);
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
  assert.throws(()=>f.w.Tisya.configuration.read(),/请先打开一个世界的聊天/);
  assert.deepEqual(f.errors,[]);assert.equal(f.generated.length,0);
 }finally{await f.w.happyDOM.abort();}
});
test('native composer persists requirements separately and clears the draft before awaiting the reply',async()=>{
 const f=await setup(),d=f.w.document,input=d.querySelector('#tisya-contractor-input');input.value='请让角色主动回应';input.dispatchEvent(new f.w.Event('input'));d.querySelector('#send_textarea').value='递出礼物';
 await f.emit('before','normal',{},false);f.ctx.chat.push({is_user:true,mes:'递出礼物'});const payload={messages:[{role:'user',content:'递出礼物'}],model:'test-model'};await f.emit('payload',payload);
 assert.equal(payload.messages[0].content,'递出礼物');assert.equal(JSON.parse(payload.messages.at(-1).content).text,'请让角色主动回应');assert.equal(input.value,'');
 f.ctx.chat.push({is_user:false,mes:'角色接过礼物并回应'});await f.emit('generation-end');assert.equal(input.value,'');assert.equal(f.ctx.chat.at(-2).mes,'递出礼物');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});


test('Android immersive entry remains discoverable and invokes the persistent native toggle',async()=>{const f=await setup(),d=f.w.document;let enabled=false,calls=0;f.w.TauriTavernAndroidSystemUiBridge={setImmersiveFullscreenEnabled:v=>{enabled=v;},isImmersiveFullscreenEnabled:()=>enabled};const control=d.createElement('button');control.id='option_toggle_fullscreen';control.onclick=()=>{calls++;enabled=!enabled;};d.body.append(control);await click(f,'menu');assert.equal(d.querySelector('[data-tisya-action=fullscreen]').getAttribute('aria-label'),'沉浸全屏');await click(f,'fullscreen');assert.equal(calls,1);assert.equal(enabled,true);await click(f,'menu');assert.equal(d.querySelector('[data-tisya-action=fullscreen]').getAttribute('aria-label'),'退出沉浸全屏');await click(f,'fullscreen');assert.equal(enabled,false);await f.w.happyDOM.abort();});

test('legacy native shortcut is hidden without overwriting settings; advanced revision remains in More',async()=>{const f=await setup(),d=f.w.document;f.ctx.extensionSettings.缇斯亚界面={联系人分组:{},消息快捷栏:['regen','msg-native','more']};f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('[data-tisya-action=msg-native]'),null);assert.deepEqual(f.ctx.extensionSettings.缇斯亚界面.消息快捷栏,['regen','msg-native','more']);await click(f,'more');assert(d.querySelector('[data-tisya-action=msg-revision]'));assert(!d.querySelector('[data-tisya-action=msg-native]'));await f.w.happyDOM.abort();});

test('candidate navigation has its own final row after message tools',async()=>{const f=await setup(),d=f.w.document;f.ctx.chat[0].swipes=['旧版','正文','新版'];f.ctx.chat[0].swipe_id=1;f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();const actions=d.querySelector('.tisya-actions'),tools=actions.querySelector('.tisya-message-tools'),versions=actions.querySelector('.tisya-candidate-row');assert(versions);assert.equal(actions.lastElementChild,versions);assert.equal(tools.querySelector('[data-tisya-action=candidate-prev]'),null);assert(tools.querySelector('[data-tisya-action=more]'));assert.equal(versions.querySelectorAll('button').length,3);assert.equal(versions.querySelector('[aria-label="当前候选"]').textContent,'2/3');assert.equal(versions.querySelector('[data-tisya-action=candidate-prev]').disabled,false);assert.equal(versions.querySelector('[data-tisya-action=candidate-next]').disabled,false);await f.w.happyDOM.abort();});

test('direct candidate jump edits the selected native text and deletes only selected version',async()=>{const f=await setup(),d=f.w.document;const m=f.ctx.chat[0];m.swipes=Array.from({length:11},(_,i)=>'版本'+(i+1));m.swipe_id=0;m.mes=m.swipes[0];f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();await click(f,'candidate-picker');d.querySelector('#tisya-candidate-select').value='10';await click(f,'candidate-select');assert.equal(m.swipe_id,10);assert.equal(m.mes,'版本11');await click(f,'more');await click(f,'msg-edit');assert.equal(d.querySelector('.edit_textarea').value,'版本11');d.querySelector('.edit_textarea').remove();f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();await click(f,'candidate-picker');assert.equal(d.querySelector('#tisya-candidate-select').value,'10');await click(f,'candidate-delete');await click(f,'candidate-delete-confirm');assert.equal(m.swipes.length,10);assert.equal(m.mes,'版本10');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();});

test('production initializer wires asynchronous message cache without disabling the shell',async()=>{
 const f=await setup({realMessages:true});try{f.ctx.chat[0].mes=replyFixture();await f.emit('updated',0);await new Promise(r=>setTimeout(r,60));const visual=f.w.document.querySelector('#chat .tisya-message-visual');assert(visual);assert.match(visual.shadowRoot.querySelector('.story').textContent,/门开了/);await click(f,'menu');assert(f.w.document.querySelector('#tisya-settings-home'));assert.equal(f.w.document.querySelector('#tisya-overlay').open,false);assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);}finally{await f.w.happyDOM.abort();}
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
 [...d.querySelectorAll('#tisya-chat-loading button')].find(n=>n.textContent==='保存条数').click();await f.w.happyDOM.whenAsyncComplete();await click(f,'home');assert(d.querySelector('.tisya-home'));assert.equal(f.w.fixture.power_user.chat_truncation,17);assert(f.errors.every(e=>e.includes('尚未保存')));await f.w.happyDOM.abort();
});
test('native API editor opens from clean config but never discards an edited route',async()=>{
 const f=await setup(),d=f.w.document;await click(f,'menu');await click(f,'settings-tab:api');const dom=d.querySelector('.tisya-config').shadowRoot;let opens=0;d.querySelector('#sys-settings-button .drawer-toggle').onclick=()=>opens++;
 const manage=[...dom.querySelectorAll('button')].find(n=>n.textContent==='管理 API、凭据和模型');manage.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opens,1);
 const model=dom.querySelector('[aria-label="通用 模型"]');model.value='draft-model';model.dispatchEvent(new f.w.Event('change'));manage.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(opens,1);assert.match(dom.querySelector('footer').textContent,/保存或放弃/);assert.equal(model.value,'draft-model');assert.deepEqual(f.errors,[]);await f.w.happyDOM.abort();
});
test('home settings invokes the menu; menu rename and pin persist with native names unchanged',async()=>{
 const f=await setup(),d=f.w.document;d.querySelector('.tisya-home-rail-bottom [data-tisya-action="menu"]').click();assert(d.querySelector('#tisya-settings-home').textContent.includes('游玩偏好'));assert.equal(d.querySelector('.tisya-home'),null);assert.equal(d.querySelector('#tisya-overlay').open,false);await click(f,'home');
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
 let f,payload;f=await setup({generateWait:async()=>{await f.emit('before','normal',{},false);payload={messages:[{role:'user',content:f.ctx.chat[0].mes}]};await f.emit('payload',payload);await f.emit('generation-end');}});
 f.ctx.chat[0].is_user=true;await f.emit('chat');await f.w.happyDOM.whenAsyncComplete();
 await click(f,'more');await click(f,'msg-edit');f.ctx.chat[0].mes='改成停下来等他';await f.emit('edited',0);f.w.document.querySelector('.edit_textarea').remove();await f.emit('updated',0);await f.w.happyDOM.whenAsyncComplete();
 const regen=f.w.document.querySelector('[data-tisya-action=regen]');assert.equal(regen.disabled,false);assert.equal(regen.getAttribute('aria-label'),'重投下一条');
 f.w.document.querySelector('#send_textarea').value='没发送';await click(f,'regen');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/草稿/);f.w.document.querySelector('#send_textarea').value='';
 await click(f,'regen');assert.equal(f.generated.length,1);assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,true);assert.deepEqual(JSON.parse(payload.messages.at(-1).content),{kind:'user-rewrite-material',previous:'正文',current:'改成停下来等他'});
 await click(f,'next');assert.equal(f.generated.length,2);assert.doesNotMatch(JSON.stringify(payload),/user-rewrite-material/);assert.equal(f.ctx.chat.length,1);await f.w.happyDOM.abort();
});

test('all settings entry points reuse one page, preserve search and discover a drawer installed while open',async()=>{
 const f=await setup(),d=f.w.document;try{
 await click(f,'menu');const page=d.querySelector('#tisya-settings-home'),input=page.querySelector('input');input.value='世界书';input.oninput();
 f.w.phoneOptions.onOpenApp('设置');await f.w.happyDOM.whenAsyncComplete();await click(f,'menu');assert.equal(d.querySelector('#tisya-settings-home'),page);assert.equal(page.querySelector('input'),input);assert.equal(input.value,'世界书');assert.equal(d.querySelectorAll('#tisya-settings-home').length,1);assert.equal(d.querySelector('#tisya-overlay').open,false);
 const extra=d.createElement('div');extra.id='late-plugin';extra.className='drawer';extra.innerHTML='<button class="drawer-toggle"><i class="drawer-icon" title="后装扩展"></i></button><div class="drawer-content"></div>';d.querySelector('#top-settings-holder').append(extra);await click(f,'menu');assert.equal(d.querySelector('#tisya-settings-home'),page);assert.equal(page.querySelector('input').value,'世界书');const search=page.querySelector('input');search.value='';search.oninput();assert(page.querySelector('[data-tisya-action="drawer:late-plugin"]'));
 for(const action of ['role-library','group-library','drawer:WI-SP-button','drawer:ai-config-button'])assert.equal(page.querySelectorAll(`[data-tisya-action="${action}"]`).length,1);assert.deepEqual(f.errors,[]);
 }finally{await f.w.happyDOM.abort();}
});

test('settings and identity headers return directly to current chat without changing its contents',async()=>{const f=await setup(),d=f.w.document,history=JSON.stringify(f.ctx.chat),chatId=f.ctx.chatId;await click(f,'menu');for(const route of ['settings-app','user-identity']){await click(f,route);const back=d.querySelector('.tisya-sub-header [data-tisya-action="chat"]');assert.equal(back.textContent,'聊天 ›');back.click();await f.w.happyDOM.whenAsyncComplete();assert(!d.querySelector('#tisya-shell').classList.contains('tisya-page-open'));assert.equal(f.ctx.chatId,chatId);assert.equal(JSON.stringify(f.ctx.chat),history);await click(f,'menu');}assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();});
