import {interfaceSnapshot,validateInterfaceSettings} from './tables/interface-config.js';
import {createNativeConfiguration,createRegexGate} from './tables/native-config.js';
import {createTableService} from './tables/service.js';
import {createNativeVectors} from './tables/vectors.js';
import {appendFileContent} from '/scripts/chats.js';
import {yaml} from '/lib.js';
import {configureReplyFormats} from './reply-formats.js';
import {GENERATION_CONTRACTS,MODE_CONTRACT,ARCHIVE_CONTRACT,validateGeneratedTask} from './config/contracts.js';
import {loadAgentSystemSettings} from '/scripts/tauritavern/agent/agent-system-settings.js';
import {createStore,register,registry} from './config/core.js';
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
let inputShortcuts=null;
let editToolbarPlacement=null;
import { mountMessageReader } from './reader.js';
import { mountNotebook } from './notebook.js';
import { getContext } from '/scripts/st-context.js';
import { promptManager,createGenerationParameters,proxies } from '/scripts/openai.js';
import { registerPresetProtocol } from './preset.js';
import { setExtensionPrompt, isGenerating, Generate, messageFormatting, substituteParams, substituteParamsExtended, sendTextareaMessage, saveSettings, enqueueChatSave, persistedChatMetadata } from '/script.js';
import { getAgentGenerationOptions } from '/scripts/tauritavern/agent/agent-generation-router.js';
import { hasActiveAgentRun } from '/scripts/tauritavern/agent/agent-run-controller.js';
import { capture, validate, groupContacts } from './model.js';
import { loadReadingFont } from './font.js';
import { VERSION, SECTIONS, drawerEntries, chatPreview, chatTitle, mountLayout, installComposer } from './layout.js';

const KEY = '缇斯亚界面';
configureReplyFormats({yaml});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const query = selector => document.querySelector(selector);
const iconButton = (text, action, icon) => `<button type="button" class="tisya-icon-button" data-tisya-action="${esc(action)}" aria-label="${esc(text)}" title="${esc(text)}">${iconMarkup(icon)}</button>`;
const button = (text, action) => `<button type="button" data-tisya-action="${esc(action)}">${esc(text)}</button>`;
let layout, top, controls, messageNavigation, releaseReader, readerToken, notebook, appearance, chatEffects, pet;
let motionEnabled=true,utility=null,nativeDisplay=null;
const getAppearance=owner=>appearanceValues(settings(),owner);
const getDisplay=()=>getAppearance('extensions');
const getPlayerName=()=>context().name1??null;
let displaySaving=false;
async function saveDisplayPreference(field,value,expected){if(displaySaving)throw Error('阅读设置正在保存');if(getDisplay()[field]!==expected)throw Error('阅读设置已在其他位置修改，请重新点击');displaySaving=true;try{await saveInterfaceSettings(withAppearanceOverrides(settings(),'extensions',{...appearanceOverrides(settings(),'extensions'),[field]:value}));}finally{displaySaving=false;}}
const visualError=err=>console.warn('[Tisya visual]',err);
function refreshVisuals(){nativeDisplay?.refresh();appearance?.refresh();chatEffects?.refresh();pet?.refresh();}
let root, overlay, observer, enabled = true, busy = false, generationBusy = false, hold, cleanups = [], renderEpoch = 0, sheetEpoch = 0;
let managed = false, participant, fontController, releaseFont, fontState='使用默认字体';
const FONT_URLS=Array.from({length:4},(_,i)=>`https://raw.githubusercontent.com/Tisyaofgit/tisya-tavern/cfc9d8c1ce4be94334c3b748addb0936802b2d2b/font/reading.part${i+1}.bin`);
async function startFont(){
 if(fontController)return;const controller=new AbortController();fontController=controller;
 const timer=setTimeout(()=>controller.abort(),120000);
 try{releaseFont=await loadReadingFont({urls:FONT_URLS,headers:()=>context().getRequestHeaders(),signal:controller.signal,onState:text=>{fontState=text;const el=query('#tisya-font-state');if(el)el.textContent=text;}});appearance?.refresh();}
 catch(err){if(enabled){fontState='使用默认字体 · '+String(err.message??err);error(err);const el=query('#tisya-font-state');if(el)el.textContent=fontState;}}
 finally{clearTimeout(timer);if(fontController===controller)fontController=null;}
}
const context = () => getContext();
const configStore=createStore({getContext:context,persist:saveSettings,assertIdle,legacy:()=>readNarrative(context()).settings});
let requiredPreset=null;
async function mandatoryPresetSource(){if(!requiredPreset){const response=await fetch(new URL('./presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url));if(!response.ok)throw Error('必需协议加载失败，请更新并重启扩展');requiredPreset=await response.json();}return {prompts:requiredPreset.prompts,order:requiredPreset.prompt_order[0].order};}
const configHost=createHost({getContext:context,getSource:presetSource,getBaseSource:mandatoryPresetSource,prepareMessage:m=>appendFileContent(m,String(m.mes??'')),parseRequestBody:s=>typeof yaml.parse==='function'?yaml.parse(s):yaml.load(s),store:configStore,createParameters:createGenerationParameters,getProxies:()=>proxies,getMoods:()=>emotionCatalog(document).names(),isAgentEnabled:async()=>(await loadAgentSystemSettings()).agentModeEnabled,onError:error});
const nativeConfiguration=createNativeConfiguration({getContext:context,regexGate:createRegexGate({getContext:context,isScopedScriptsAllowed,allowScopedScripts,isPresetScriptsAllowed,allowPresetScripts,saveSettings})});
const tableService=createTableService({store:configStore,getContext:context,request:(...args)=>configHost.request(...args),nativeConfig:nativeConfiguration,getConfigurationChoices:()=>({connections:configHost.connections(),presets:configHost.presets()}),interfaceConfig:{read:()=>interfaceSnapshot(settings()),save:saveAssistantConfiguration},vector:createNativeVectors({getContext:context}),setPrompt:(text,filter)=>{setExtensionPrompt('tisya_style_rules','',1,1,false,0);setExtensionPrompt('tisya_table_context',text,1,1,false,0,filter);}});
let tableGeneration=false,preparationError=null;
globalThis.tisyaHistoryInput=async(chat,contextSize,abort,type)=>{try{if(['quiet','impersonate'].includes(type))return configHost.historyInput(chat,type);const result=await tableService.prepare(type);tableGeneration=!!result;const rules=result?null:tableService.rulesContext();setExtensionPrompt('tisya_style_rules',rules?.text??'',1,1,false,0);configHost.attachTableContext(result??rules);return configHost.historyInput(chat,type);}catch(e){abort(true);error(e);throw e;}};
function error(err) { console.error('[Tisya UI]', err); window.toastr?.error(String(err.message ?? err), '缇斯亚界面'); }
function settings() {
    const s = context().extensionSettings[KEY];
    if (s === undefined) return { 联系人分组: {} };
    if (!s || typeof s !== 'object' || !s.联系人分组 || typeof s.联系人分组 !== 'object' || Array.isArray(s.联系人分组)) throw new Error('缇斯亚界面配置损坏；已停止读取');
    if(s.继续用户消息!==undefined&&typeof s.继续用户消息!=='string')throw new Error('继续设置损坏');
    return s;
}
function getActionMode(){const value=settings().行动建议?.写入方式??'续接输入框';const row=ACTION_MODES.find(row=>row.label===value);if(!row)throw Error('行动写入方式配置损坏');return row.id;}
function setActionMode(mode){const row=ACTION_MODES.find(row=>row.id===mode);if(!row)throw Error('行动写入方式无效');const next=structuredClone(settings());next.行动建议={...(next.行动建议??{}),写入方式:row.label};context().extensionSettings[KEY]=next;context().saveSettingsDebounced();appearance?.refresh();}
function assertIdle() {
    if (isGenerating() || hasActiveAgentRun() || generationBusy) throw new Error('请先等待或停止正在进行的生成');
    if (query('#chat .mes.editing') || query('#chat .edit_textarea')) throw new Error('请先保存或取消消息编辑');
}
function clearReader() {releaseReader?.();releaseReader=null;readerToken=null;}
function checkReadingSource(){
    notebook?.checkCurrent();
    if(readerToken)try{validate(context(),readerToken);}catch{sheet('阅读已失效','<p role="status">原消息或候选已变化，请重新打开阅读。</p>');}
}
function clearNotebook(){notebook?.dispose();notebook=null;utility?.dispose();utility=null;}
function close(expectedEpoch = sheetEpoch) { if(expectedEpoch!==sheetEpoch)return;sheetEpoch++;clearReader();if(overlay.open)overlay.close();overlay.replaceChildren();delete overlay._messageToken; }
function sheet(title, body) {
    sheetEpoch++;
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
function hidePage() { renderEpoch++; clearNotebook();root.querySelector('.tisya-page').replaceChildren(); root.classList.remove('tisya-page-open'); refreshVisuals(); }
function nativeDrawer(key) {
    const entry=drawerEntries(document).find(entry=>entry.key===key);
    const target=entry?.element.querySelector('.drawer-toggle');
    if(!target)throw new Error('此版本缺少对应的原生入口');
    close(); hidePage(); closeNativeDrawers(entry.element);
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
function nav() {
    const groups=new Map();
    for(const entry of drawerEntries(document)) {
        if(!groups.has(entry.group))groups.set(entry.group,[]);
        groups.get(entry.group).push(entry);
    }
    const groupOrder=['创作','资料','工作流','系统','其他扩展'];
    const fullscreen=query('#option_toggle_fullscreen');
    const fullscreenButton=fullscreen&&!fullscreen.classList.contains('displayNone')?button('切换系统全屏','fullscreen'):'';
    const sections=SECTIONS.filter(([,id])=>sectionNode(id)?.querySelector('.inline-drawer-toggle')).map(([key,,label])=>button(label,`section:${key}`)).join('');
    const native=groupOrder.filter(name=>groups.has(name)).map(name=>`<h3>${esc(name)}</h3><div class="tisya-list">${name==='工作流'?sections:''}${groups.get(name).map(entry=>button(entry.label,`drawer:${entry.key}`)).join('')}</div>`).join('');
    const styleVersion=getComputedStyle(document.body).getPropertyValue('--tisya-style-version').replace(/["']/g,'').trim();
    sheet('TISYA · 月潮', `<div class="tisya-list">${button('配置','settings-app')}${button('上下文一览','context-overview')}</div><h3>聊天</h3><div class="tisya-list">${button('返回聊天','chat')}${button('会话','home')}${button('联系人','contacts')}${button('会话手记','notes')}${button('公开记忆','memory')}${button('全部聊天功能','chat-all')}${button('继续设置','continue-settings')}</div>${native}<h3>界面</h3><div class="tisya-list">${button('主题配置','display-settings')}${button('表情图鉴','emotion-atlas')}${button('输入快捷栏','input-tools')}${button(pet?.isVisible()?'隐藏桌宠':'显示桌宠','pet-toggle')}${button(motionEnabled?'暂停动态效果':'开启动态效果','motion-toggle')}${fullscreenButton}${button('重试下载字体','font-retry')}${button('返回原生界面','disable')}</div><p id="tisya-font-state" class="tisya-note" role="status">${esc(fontState)}</p><p class="tisya-version">${VERSION} · TauriTavern 2.3.0</p>${styleVersion!==VERSION?'<p role="alert">界面样式版本不一致，请更新扩展并重启应用。</p>':''}`);
    overlay.querySelector('.tisya-backdrop').classList.add('tisya-navigation');
}
function page(title, html) {
    clearNotebook();close(); closeNativeDrawers(); root.classList.add('tisya-page-open'); refreshVisuals();
    root.querySelector('.tisya-page').innerHTML = `<header>${button('菜单','menu')}<h2>${esc(title)}</h2>${button('返回聊天','chat')}</header>${html}`;
}
function openNotebook(mode){
    renderEpoch++;
    page(mode==='memory'?'公开记忆':'会话手记',`<div id="tisya-notebook"></div><footer>${button(mode==='memory'?'查看会话手记':'查看公开记忆',mode==='memory'?'notes':'memory')}</footer>`);
    notebook=mountNotebook(document,query('#tisya-notebook'),{getContext:context,getDisplay,mode,onRead:openReader,onError:error,onLocate:token=>{
        const node=nodeFor(token);close();closeNativeDrawers();hidePage();node.scrollIntoView({block:'start',behavior:'auto'});
    }});
}
function presetSource(){const c=context();return {identity:[c.chatCompletionSettings?.preset_settings_openai,query('#settings_preset_openai')?.value,c.characterId,c.groupId],prompts:c.chatCompletionSettings?.prompts??[],order:promptManager?.getPromptOrderForCharacter(promptManager.activeCharacter)??[]};}
function narrativeController(){return createNarrativeBridge({getContext:context,getSource:presetSource,assertIdle,persistGlobal:saveSettings,refreshPrompts:()=>promptManager.render(false),persistChat:async(c,t)=>enqueueChatSave(async()=>{
 const live=context();if(live.chatId!==t.id||live.characterId!==t.character||live.groupId!==t.group||live.chatMetadata!==t.meta)throw Error('聊天已切换，旧页面未写入新聊天。');
 const metadata=persistedChatMetadata();if(t.group){await saveGroupChatMetadata({id:t.id,chatMetadata:metadata});}else{const card=c.characters[t.character];if(!card||card.chat!==t.id)throw Error('聊天目标已变化。');await saveCharacterChatMetadata({characterName:card.name,avatarUrl:card.avatar,fileName:t.id,chatMetadata:metadata});}
 })});}
async function saveAssistantConfiguration({data,revision,key,value,expected}){
 assertIdle();if(JSON.stringify(settings())!==expected)throw Error('界面配置已变化，请重新让助手核对');validateInterfaceSettings(value);
 const c=context(),previous=c.extensionSettings[KEY],beforeConfig=c.extensionSettings.缇斯亚配置;c.extensionSettings[KEY]=value;
 try{await configStore.save(data,revision,key);}catch(e){if(c.extensionSettings[KEY]===value&&c.extensionSettings.缇斯亚配置===beforeConfig){if(previous===undefined)delete c.extensionSettings[KEY];else c.extensionSettings[KEY]=previous;}throw e;}
 motionEnabled=settings().动态效果!==false;if(pet&&pet.isVisible()!==(settings().显示桌宠!==false))pet.setVisible(settings().显示桌宠!==false);refreshVisuals();inputShortcuts?.refresh();messageNavigation?.update();decorate();
}
async function saveInterfaceSettings(next){assertIdle();const previous=settings();context().extensionSettings[KEY]=next;refreshVisuals();try{if(await saveSettings()!==true)throw Error('宿主尚未确认保存');}catch(e){if(context().extensionSettings[KEY]===next)context().extensionSettings[KEY]=previous;refreshVisuals();throw Error('保存未完成，草稿保留：'+e.message);}}
function openSettings(tab='mode'){
 renderEpoch++;page('缇斯亚 · 配置','<div id="tisya-settings-app"></div>');
 utility=mountConfiguration(document,query('#tisya-settings-app'),{store:configStore,host:configHost,tableService,getSettings:settings,initialTab:tab,
 saveAppearance:async(owner,value)=>{await saveInterfaceSettings(withAppearanceOverrides(settings(),owner,value));messageNavigation?.update();},
 saveAppearanceProfiles:async bank=>saveInterfaceSettings({...settings(),外观方案:bank}),onApplied:()=>{appearance?.refresh();decorate();},onClose:hidePage,
 onNative:kind=>{if(utility?.requestLeave?.().allowed===false)throw Error('请先保存或放弃修改');if(kind==='agent')extensionSection('agent');else nativeDrawer(kind==='api'?'sys-settings-button':'ai-config-button');}
 });utility.ready.catch(error);
}
function openDisplaySettings(){openSettings('theme');}
function openEmotionAtlas(){renderEpoch++;page('图鉴 · 内置表情','<div id="tisya-emotion-atlas"></div>');utility=mountEmotionAtlas(document,query('#tisya-emotion-atlas'));}
function phoneApp(name){
    if(!enabled)return false;
    const routes={手记:()=>openNotebook('notes'),记忆:()=>openNotebook('memory'),通信:()=>{renderEpoch++;contacts();},生图:()=>extensionSection('image'),语音:()=>extensionSection('voice'),主题:openDisplaySettings,图鉴:openEmotionAtlas,协议:()=>openSettings('chat','output'),应用:()=>nativeDrawer('extensions-settings-button'),设置:()=>openSettings()};
    if(!Object.hasOwn(routes,name))return false;
    run(routes[name],{exclusive:false});return true;
}
function contacts() {
    const groups = groupContacts(context().characters, settings().联系人分组);
    page('联系人', `<input class="tisya-search" placeholder="搜索名称、分组或作者标签" aria-label="搜索联系人"><div class="tisya-list">${[...groups].map(([group,cards])=>`<details open><summary>${esc(group)} · ${cards.length}</summary>${cards.map(card=>`<div class="tisya-contact" data-search="${esc([card.name,group,...card.tags].join(' ').toLowerCase())}">${button(card.name,`card:${card.id}`)}<small>${esc(card.tags.join(' · '))}</small>${button('分组',`group:${card.id}`)}</div>`).join('')}</details>`).join('')}</div><footer>${button('创建或导入角色卡','drawer:rightNavHolder')}${button('群聊','drawer:rightNavHolder')}</footer>`);
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
    page(card.name,`<div class="tisya-list">${chats.map((chat,i)=>`<button type="button" class="tisya-chat-row" data-chat-index="${i}"><strong>${esc(chatTitle(chat.file_name,card.name))}</strong><small>${esc(chatPreview(chat.mes))}</small></button>`).join('') || '<p>还没有会话</p>'}</div>${button('打开角色卡 / 新建会话',`select:${id}`)}`);
    root.querySelectorAll('[data-chat-index]').forEach(el=>el.addEventListener('click',()=>run(async()=>{assertIdle();const file=chats[Number(el.dataset.chatIndex)].file_name.replace(/\.jsonl$/,'');await context().selectCharacterById(id,{switchMenu:false,chatFile:file});if(String(context().characterId)!==String(id)||context().chatId!==file)throw new Error('宿主未切换到目标会话');hidePage();})));
}
async function home() {
    const epoch=++renderEpoch;
    const cards=context().characters.map((card,id)=>({id,avatar:card.avatar,name:card.name}));
    page('会话','<p role="status">正在读取各联系人的全部会话…</p>');
    const results=new Array(cards.length);
    let cursor=0;
    const current=()=>enabled&&epoch===renderEpoch;
    await Promise.all(Array.from({length:Math.min(4,cards.length)},async()=>{
        while(current()&&cursor<cards.length) {
            const index=cursor++,card=cards[index];
            if(context().characters[card.id]?.avatar!==card.avatar) { results[index]={error:'联系人列表已变化，请刷新'};continue; }
            const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
            try { results[index]={chats:await listChats(card.id,controller.signal)}; }
            catch(err) { results[index]={error:err.name==='AbortError'?'读取超时':String(err.message??err)}; }
            finally { clearTimeout(timer); }
        }
    }));
    if(!current())return;
    page('会话',`<p class="tisya-note">按联系人查看各段会话。</p><input class="tisya-search" placeholder="搜索联系人或会话" aria-label="搜索会话"><div class="tisya-list">${cards.map((card,index)=>{
        const result=results[index];
        if(!result?.error&&!result?.chats?.length)return '';
        return `<details open data-search="${esc([card.name,...(result.chats??[]).map(c=>c.file_name)].join(' ').toLowerCase())}"><summary>${esc(card.name)} · ${result.chats?.length??0}</summary>${result.error?`<p role="alert">${esc(result.error)}</p>`:result.chats.map((chat,i)=>`<button type="button" class="tisya-chat-row" data-home-card="${index}" data-home-chat="${i}"><strong>${esc(chatTitle(chat.file_name,card.name))}</strong><small>${esc(chatPreview(chat.mes))}</small></button>`).join('')}<button type="button" class="tisya-contact-link" data-tisya-action="card:${card.id}">查看联系人</button></details>`;
    }).join('')||'<p>暂无会话，先选择联系人。</p>'}</div><footer>${button('刷新','home')}${button('联系人','contacts')}${button('群聊管理','drawer:rightNavHolder')}</footer>`);
    root.querySelectorAll('[data-home-chat]').forEach(el=>el.addEventListener('click',()=>run(async()=>{
        assertIdle();const index=Number(el.dataset.homeCard),card=cards[index],chat=results[index].chats[Number(el.dataset.homeChat)];
        if(context().characters[card.id]?.avatar!==card.avatar)throw new Error('联系人列表已变化，请刷新');
        const file=chat.file_name.replace(/\.jsonl$/,'');
        await context().selectCharacterById(card.id,{switchMenu:false,chatFile:file});
        if(String(context().characterId)!==String(card.id)||context().chatId!==file)throw new Error('宿主未切换到目标会话');
        hidePage();
    })));
}
const MESSAGE_TOOLS=[['regen','重骰'],['next','继续'],['msg-read','阅读与回合记录'],['msg-edit','改写'],['msg-rollback','回溯 · 删除这条及以下全部'],['msg-delete','删除本条'],['msg-branch','创建分支'],['msg-copy','复制消息正文'],['msg-native','原生功能'],['more','更多']];
function messageSlots(){const slots=settings().消息快捷栏??['regen','next','more'];if(!Array.isArray(slots)||!slots.includes('more')||new Set(slots).size!==slots.length||slots.some(id=>!MESSAGE_TOOLS.some(t=>t[0]===id)))throw Error('消息快捷栏配置损坏；未覆盖设置');return [...slots];}
function messageToolButton(id){const label=MESSAGE_TOOLS.find(t=>t[0]===id)[1];return ['regen','next','more'].includes(id)?iconButton(label,id,{regen:'reroll',next:'continue',more:'more'}[id]):button(label,id);}
function messageToolsEditor(token){const original=messageSlots();sheet('消息快捷栏',`<p>选择顺序与可见按钮；留空的操作收入更多。“更多”可放在任意位置。</p><div id="tisya-message-slots">${MESSAGE_TOOLS.map((_,i)=>`<label>位置 ${i+1}<select aria-label="消息位置 ${i+1}"><option value="">收起</option>${MESSAGE_TOOLS.map(([id,label])=>`<option value="${id}" ${original[i]===id?'selected':''}>${label}</option>`).join('')}</select></label>`).join('')}</div>${button('全部收起','message-tools-collapse')}${button('全部展开','message-tools-expand')}${button('保存位置','message-tools-save')}`);overlay._messageToken=token;overlay._messageSlots=original;const selects=[...overlay.querySelectorAll('#tisya-message-slots select')];selects.forEach(select=>select.onchange=()=>{if(select.value)for(const other of selects)if(other!==select&&other.value===select.value)other.value='';});}
function messageToken(id) { return capture(context(),id); }
function messageMenu(node) {
    const id = Number(node.getAttribute('mesid'));
    const token = messageToken(id);
    const visible=messageSlots();sheet('消息操作',`<div class="tisya-list">${MESSAGE_TOOLS.filter(([id])=>id!=='more'&&!visible.includes(id)).map(([id,label])=>button(label,id==='regen'?'msg-regen':id==='next'?'msg-next':id)).join('')}${button('配置消息快捷栏','message-tools')}</div>`);
    overlay._messageToken = token;
}
function nodeFor(token) {
    validate(context(),token);
    const node = query(`#chat .mes[mesid="${token.id}"]`);
    if (!node) throw new Error('消息已经离开当前视图，请重新定位');
    return node;
}
async function messageAction(action) {
    const token = overlay._messageToken;
    const node = nodeFor(token);
    if(action==='msg-regen'||action==='msg-next'){close();return generateAt(token,action==='msg-regen');}
    if(action==='msg-read') {openReader(token);return;}
    if(action==='msg-copy') { const epoch=sheetEpoch;await navigator.clipboard.writeText(validate(context(),token).mes);close(epoch);return; }
    if(action==='msg-native') { close(); node.classList.toggle('tisya-native-tools'); node.querySelector('.extraMesButtonsHint')?.click(); return; }
    assertIdle();
    if(action==='msg-branch'&&configStore.read().world.tables?.enabled){sheet('创建平行分支',`<p>保留此条消息及以前进度。后续事件可以作为条件蓝本保留，也可以全部清空。</p>${button('保留后续可能性','branch-keep')}${button('清空后续蓝本','branch-clear')}${button('取消','close')}`);overlay._messageToken=token;return;}
    if(action==='msg-edit'||action==='msg-branch') {
        const target = node.querySelector(action==='msg-edit'?'.mes_edit':'.mes_create_branch');
        if(!target) throw new Error('原生消息操作未挂载');
        close();target.click();return;
    }
    if(action==='msg-delete'||action==='msg-rollback') {
        const count = action==='msg-delete'?1:context().chat.length-token.id;
        sheet(action==='msg-delete'?'删除本条':'回溯确认',`<p>将删除 ${count} 条消息${action==='msg-rollback'?'，包括选中消息及其后的全部消息':''}。操作使用宿主删除接口。</p>${action==='msg-rollback'&&configStore.read().world.tables?.enabled?'<label>后续时间锚<select id="tisya-future-choice"><option value="keep">保留事件可能性</option><option value="clear">清空后续蓝本</option></select></label>':''}${button('取消','close')}${button('确认删除',action==='msg-delete'?'delete-confirm':'rollback-confirm')}`);
        overlay._messageToken = token;
    }
}
function openReader(token,initialTab='body') {
    const message=validate(context(),token);
    nativeDisplay?.refresh();
    sheet('阅读与回合记录','<div id="tisya-reader"></div>');
    releaseReader=mountMessageReader(document,query('#tisya-reader'),{
        source:message.mes,getNativeDisplay:()=>nativeDisplay?.project(message.mes,message,{getAttribute:()=>String(token.id)}),
        initialTab,getAppearance,getDisplay,getPlayerName,
        formatBody:body=>messageFormatting(body,message.name,!!message.is_system,!!message.is_user,token.id,
            {FORBID_TAGS:['script','style','custom-style','iframe','object','embed','form','input','button','select','textarea'],FORBID_ATTR:['style','id']},
            false,{regexPrepared:true,regexSourceText:body}),
        onChooseAction:(text,mode)=>chooseReaderAction(token,text,mode),getActionMode,setActionMode,
    }).dispose;
    readerToken=token;
}
async function chooseReaderAction(token,text,mode) {
    if(busy)throw new Error('当前聊天操作尚未完成，请稍后再选行动');
    assertIdle();nodeFor(token);busy=true;
    try{
        const result=await executeAction({document,text,mode,validate:()=>{assertIdle();nodeFor(token);},send:async()=>{close();closeNativeDrawers();hidePage();try{await sendTextareaMessage();}catch(e){error(e);throw e;}}});
        close();closeNativeDrawers();hidePage();query('#send_textarea')?.focus({preventScroll:true});return result;
    }finally{busy=false;decorate();}
}
async function removeMessages(rollback) {
    const token=overlay._messageToken,epoch=sheetEpoch;assertIdle();validate(context(),token,{tail:true});
    const original=context().chat.slice(token.id);
    const snapshots=original.map(message=>message && ({text:message.mes,swipe:message.swipe_id}));
    if(rollback && original.some(message=>!message)) throw new Error('后续历史尚未完整加载，未执行回溯');
    if(rollback)await tableService.stageFork(token.id,query('#tisya-future-choice')?.value!=='clear');
    let deleted=0;
    try {
        const end=rollback?token.length-1:token.id;
        for(let id=end;id>=token.id;id--) {
            const message=context().chat[id], snapshot=snapshots[id-token.id];
            if(context().getCurrentChatId()!==token.chatId||message!==original[id-token.id]||!snapshot||message?.mes!==snapshot.text||message?.swipe_id!==snapshot.swipe) throw new Error('删除期间消息发生变化');
            await context().deleteMessage(id,undefined,false);deleted++;
        }
        await context().saveChat();if(rollback)await tableService.activateFork({rollback:true});close(epoch);
    } catch(err) { throw new Error(`删除未完整完成（已调用删除 ${deleted} 条）：${err.message}`); }
}
async function generateAt(token, reroll = false) {
    assertIdle();const selected=validate(context(),token,{tail:true});
    if(String(query('#send_textarea')?.value??'').trim()) throw new Error('输入框有草稿，请先发送或清空后操作');
    if(context().onlineStatus==='no_connection')throw new Error('模型尚未连接，未回溯消息');
    const continueText=reroll?'':String(settings().继续用户消息??'').trim();
    const type=reroll&&!selected.is_user&&!selected.is_system?'regenerate':'normal';
    const ctx=context();
    const options=await getAgentGenerationOptions({generationType:type,mainApi:ctx.mainApi,selectedGroup:ctx.groupId});
    assertIdle();validate(context(),token,{tail:true});
    if(String(query('#send_textarea')?.value??'').trim())throw new Error('输入框新增了草稿，未回溯消息');
    const following=context().chat.slice(token.id+1);
    if(Array.from(following).some(m=>!m||typeof m.mes!=='string'))throw new Error('后续历史尚未完整加载，未回溯消息');
    const snapshots=following.map(m=>JSON.stringify(m));
    generationBusy=true;decorate();let deleted=0;
    try {
        for(let id=token.length-1;id>token.id;id--) {
            validate(context(),token);
            if(context().chat.length!==token.length-deleted||context().chat[id]!==following[id-token.id-1]||JSON.stringify(context().chat[id])!==snapshots[id-token.id-1])throw new Error('回溯期间历史已变化');
            await context().deleteMessage(id,undefined,false);
            if(context().chat.length!==token.length-deleted-1)throw new Error('宿主未完成消息删除');
            deleted++;
        }
        validate(context(),token);
        if(deleted)await context().saveChat();
        validate(context(),token);
        if(context().chat.length!==token.id+1)throw new Error('回溯后消息数量不符');
        if(String(query('#send_textarea')?.value??'').trim())throw new Error('输入框新增了草稿，未发送继续信息');
        if(continueText){const input=query('#send_textarea');if(!input)throw new Error('宿主输入框不存在');input.value=continueText;input.dispatchEvent(new Event('input',{bubbles:true}));}
        await Generate(type,{...options,automatic_trigger:!continueText});
    } catch(err) {
        throw new Error(`${deleted?'已删除后续 '+deleted+' 条消息；':''}生成未完成：${err.message}`);
    } finally { generationBusy=false;decorate(); }
}
function decorate(element = null) {
    if(!enabled)return;
    nativeDisplay?.refresh();
    (element ? [element] : [...document.querySelectorAll('#chat .mes')]).forEach(node=>{
        if(!node.querySelector('.tisya-actions')) {
            const row=document.createElement('div');row.className='tisya-actions';

            (node.querySelector('.mes_block')??node).append(row);
            row.addEventListener('click',e=>{const b=e.target.closest('[data-tisya-action]');if(!b)return;e.stopPropagation();run(async()=>{
                const token=messageToken(Number(node.getAttribute('mesid')));
                if(b.dataset.tisyaAction==='more')return messageMenu(node);
                if(b.dataset.tisyaAction.startsWith('msg-')){overlay._messageToken=token;return messageAction(b.dataset.tisyaAction);}
                if(b.dataset.tisyaAction==='next')return generateAt(token);
                return generateAt(token,true);
            },{exclusive:b.dataset.tisyaAction!=='more'});});
        }
        const row=node.querySelector('.tisya-actions'),key=JSON.stringify(messageSlots());if(row.dataset.slots!==key){row.innerHTML=messageSlots().map(messageToolButton).join('');row.dataset.slots=key;}
        const id=Number(node.getAttribute('mesid')),msg=context().chat[id];
        appearance?.sync(node,{pending:id===context().chat.length-1&&(isGenerating()||hasActiveAgentRun()||generationBusy)});
        editToolbarPlacement?.sync(node);
        node.querySelectorAll('.tisya-actions button').forEach(b=>{if(b.dataset.tisyaAction!=='more'){const reason=!msg?'消息尚未加载':isGenerating()||hasActiveAgentRun()||generationBusy?'正在生成，请先停止或等待结束':'';b.disabled=!!reason;b.title=reason||(['regen','next'].includes(b.dataset.tisyaAction)&&id<context().chat.length-1?'将自动删除下面的消息，再'+b.getAttribute('aria-label'):(b.getAttribute('aria-label')??b.textContent));b.setAttribute('aria-disabled',String(!!reason));}});
        node.querySelectorAll('.mes_button, .mes_edit_buttons > div').forEach(el=>{
            const title=el.getAttribute('title')??el.getAttribute('data-tooltip')?.split('\n')[0];
            if(title)el.dataset.tisyaLabel=title;
        });
    });
}
async function run(fn,{exclusive=true}={}) {
    if(exclusive&&busy){error(new Error('正在生成或修改聊天，请等待完成后再修改历史'));return;}
    if(exclusive)busy=true;
    try{await fn();}catch(err){error(err);}finally{if(exclusive)busy=false;decorate();}
}
function stopUI() {
    if(busy||generationBusy)throw new Error('请等当前聊天操作完成再返回原生界面');
    clearNotebook();clearReader();enabled=false;fontController?.abort();releaseFont?.();releaseFont=null;observer?.disconnect();cleanups.forEach(fn=>fn());cleanups=[];layout.dispose();document.body.classList.remove('tisya-active','tisya-show-native-menu');
    document.querySelectorAll('.tisya-actions').forEach(el=>el.remove());
    document.querySelectorAll('.tisya-native-tools').forEach(el=>el.classList.remove('tisya-native-tools'));
}
function init() {
    if(query('#tisya-shell'))return;
    if(!query('#chat')||!query('#sheld')||!query('#top-settings-holder'))throw new Error('当前宿主布局不匹配，未启用界面');
    settings();getDisplay();
    layout=mountLayout(document);
    ({root,top,controls,overlay}=layout);
    cleanups.push(installComposer(document));
    editToolbarPlacement=createEditToolbarPlacement(document);
    // Managed surfaces do not necessarily emit a commit for transient edit UI.
    // Native messageEdit focuses the new textarea after inserting its controls.
    const placeEditor=e=>{if(e.target.matches?.('#chat .edit_textarea'))editToolbarPlacement.sync(e.target.closest('.mes'));};
    document.addEventListener('focusin',placeEditor);
    cleanups.push(()=>{document.removeEventListener('focusin',placeEditor);editToolbarPlacement.dispose();editToolbarPlacement=null;});
    motionEnabled=settings().动态效果!==false;
    nativeDisplay=createNativeDisplayPipeline({enabled:()=>!!context().chatId&&configStore.read().world.theme.nativeRegex,scripts:()=>context().extensionSettings.disabledExtensions?.includes('regex')?[]:getRegexScripts({allowedOnly:true}),regexProvider:RegexProvider.instance,substitute:substituteParams,substituteExtended:substituteParamsExtended,contextKey:()=>JSON.stringify([context().chatId,context().characterId,context().groupId,context().chatMetadata?.variables,context().extensionSettings.variables,context().name1,context().name2]),depth:(msg,node)=>Math.max(0,context().chat.length-Number(node.getAttribute('mesid'))-1)});
    appearance=mountMessageAppearance(document,{
        getMessage:node=>context().chat[Number(node.getAttribute('mesid'))],
        formatPreparedBody:(body,msg,node)=>messageFormatting(body,msg.name,!!msg.is_system,!!msg.is_user,Number(node.getAttribute('mesid')),{},false,{regexPrepared:true,regexSourceText:body}),
        getNativeDisplay:(...args)=>nativeDisplay.project(...args),getRenderKey:(...args)=>nativeDisplay.key(...args),
        preferNative:(message,native,data)=>preferNativeBeauty({message,native,structured:data.structured,...nativeDisplay.state()}),
        formatNativeBody:createNativeBodyFormatter({contextKey:()=>context().chat.length,onError:visualError,enabled:()=>nativeDisplay.state().enabled,scripts:()=>nativeDisplay.state().scripts,regex:(body,msg,node)=>getRegexedString(body,msg.is_user?1:2,{isMarkdown:true,characterOverride:msg.name,depth:Math.max(0,context().chat.length-Number(node.getAttribute('mesid'))-1)}),format:(prepared,source,msg,node)=>messageFormatting(prepared,msg.name,!!msg.is_system,!!msg.is_user,Number(node.getAttribute('mesid')),{},false,{regexPrepared:true,regexSourceText:source})}),
        getDisplay,getAppearance,getPlayerName,saveDisplayPreference,getMotion:()=>motionEnabled&&!root.classList.contains('tisya-page-open'),onError:visualError,
        formatBody:(body,msg,node)=>messageFormatting(body,msg.name,!!msg.is_system,!!msg.is_user,Number(node.getAttribute('mesid')),
            {FORBID_TAGS:['script','style','custom-style','iframe','object','embed','form','input','button','select','textarea'],FORBID_ATTR:['style','id']},false,{regexPrepared:true,regexSourceText:body}),
        getActionMode,setActionMode,onChooseAction:async(node,source,text,mode)=>{const token=messageToken(Number(node.getAttribute('mesid')));if(validate(context(),token).mes!==source)throw new Error('消息已变化，请重新选择行动');return chooseReaderAction(token,text,mode);},
    });
    cleanups.push(()=>appearance.dispose());
    chatEffects=mountChatEffects(document,{getDisplay,getAppearance,getMotion:()=>motionEnabled&&getAppearance('extensions').动画效果,onError:visualError});cleanups.push(()=>chatEffects.dispose());
    pet=mountPet(document,{getMotion:()=>motionEnabled,onError:visualError,onOpenApp:phoneApp,onVisibility:value=>{const next=structuredClone(settings());next.显示桌宠=value;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();}});cleanups.push(()=>pet.dispose());
    if(settings().显示桌宠===false)pet.setVisible(false);
    messageNavigation=mountMessageNavigation(document,{getLanding:()=>getDisplay().上条落点,onNavigate:()=>{closeNativeDrawers();hidePage();}});cleanups.push(()=>messageNavigation.dispose());
    inputShortcuts=mountInputShortcuts(document,{getSettings:settings,save:async value=>saveInterfaceSettings({...settings(),输入快捷栏:value}),onError:visualError});cleanups.unshift(()=>inputShortcuts.dispose());
    const cancelDialog=e=>{e.preventDefault();close();};overlay.addEventListener('cancel',cancelDialog);
    const listener=e=>{const b=e.target.closest('[data-tisya-action]');if(!b||(!root.contains(b)&&!overlay.contains(b)&&!top.contains(b)&&!controls.contains(b)))return;const [action,id]=b.dataset.tisyaAction.split(':');
        if(action==='home'){home().catch(error);return;}
        if(action==='contacts'){renderEpoch++;contacts();return;}
        if(action==='notes'||action==='memory'){run(()=>openNotebook(action),{exclusive:false});return;}
        if(action==='chat'){close();closeNativeDrawers();hidePage();return;}
        if(action==='menu'){nav();return;}
        run(async()=>{
        if(action==='message-tools')messageToolsEditor(overlay._messageToken);else if(action==='message-tools-collapse'||action==='message-tools-expand'){const selects=[...overlay.querySelectorAll('#tisya-message-slots select')];selects.forEach((s,i)=>s.value=action==='message-tools-collapse'?(i===0?'more':''):MESSAGE_TOOLS[i][0]);}else if(action==='message-tools-save'){const slots=[...overlay.querySelectorAll('#tisya-message-slots select')].map(s=>s.value).filter(Boolean);if(!slots.includes('more'))throw Error('请保留一个“更多”，以便找回收起的操作');if(new Set(slots).size!==slots.length)throw Error('按钮位置重复');if(JSON.stringify(messageSlots())!==JSON.stringify(overlay._messageSlots))throw Error('配置已变化，请重新打开');await saveInterfaceSettings({...settings(),消息快捷栏:slots});decorate();close();}else if(action==='settings-app')openSettings();else if(action==='context-overview'){openSettings();utility.root.shadowRoot.querySelector('header button:nth-of-type(2)').click();}else if(action==='display-settings')openDisplaySettings();else if(action==='emotion-atlas')openEmotionAtlas();else if(action==='pet-toggle'){pet.setVisible(!pet.isVisible());close();hidePage();}else if(action==='motion-toggle'){motionEnabled=!motionEnabled;const next=structuredClone(settings());next.动态效果=motionEnabled;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();refreshVisuals();nav();}else if(action==='continue-settings'){sheet('继续设置',`<p>点消息下的“继续”，保留该条并生成下一条。旧消息之后的内容会自动删除。</p><label for="tisya-continue-text">自动发送的用户消息</label><p class="tisya-note">需要 user 消息的渠道可在此填写；留空则直接请求下一条。</p><textarea id="tisya-continue-text" aria-label="继续时自动发送的用户消息">${esc(settings().继续用户消息??'')}</textarea>${button('保存','save-continue')}`);}else if(action==='save-continue'){const next=structuredClone(settings());next.继续用户消息=query('#tisya-continue-text').value;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();close();}else if(action==='font-retry'){startFont();}else if(action==='close')close();else if(action==='drawer')nativeDrawer(id);else if(action==='section')extensionSection(id);else if(action==='fullscreen')nativeControl('#option_toggle_fullscreen');else if(action==='input-tools'){close();closeNativeDrawers();hidePage();inputShortcuts?.open('slots');}else if(action==='card')await showCard(Number(id));else if(action==='select'){assertIdle();await context().selectCharacterById(Number(id),{switchMenu:true});if(String(context().characterId)!==id)throw new Error('宿主未切换角色');close();hidePage();nativeDrawer('rightNavHolder');}else if(action==='disable')stopUI();
        else if(action==='group') {
            const card=context().characters[Number(id)];if(!card)throw new Error('角色不存在');
            sheet('联系人分组',`<input id="tisya-group-name" aria-label="分组名称" value="${esc(settings().联系人分组[card.avatar]??'未分组')}">${button('保存',`save-group:${encodeURIComponent(card.avatar)}`)}`);
        } else if(action==='save-group') {
            const name=query('#tisya-group-name').value.trim();if(!name)throw new Error('请输入分组名称');
            const avatar=decodeURIComponent(id);if(!context().characters.some(x=>x.avatar===avatar))throw new Error('角色已变化');
            const next=structuredClone(settings());next.联系人分组[avatar]=name;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();contacts();
        } else if(action==='branch-keep'||action==='branch-clear'){const token=overlay._messageToken;validate(context(),token,{tail:true});await tableService.stageFork(token.id+1,action==='branch-keep');const target=nodeFor(token).querySelector('.mes_create_branch');if(!target)throw Error('原生分支操作未挂载');close();target.click();} else if(action.startsWith('msg-'))await messageAction(action);else if(action==='delete-confirm'||action==='rollback-confirm')await removeMessages(action==='rollback-confirm');
        else if(action==='chat-all') {close();hidePage();document.body.classList.add('tisya-show-native-menu');nativeControl('#options_button');}
    },{exclusive:['select','msg-edit','msg-branch','msg-delete','msg-rollback','delete-confirm','rollback-confirm'].includes(action)});};
    document.addEventListener('click',listener);cleanups.push(()=>document.removeEventListener('click',listener));
    const escape=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',escape);cleanups.push(()=>document.removeEventListener('keydown',escape));
    const input=e=>{if(!e.target.classList.contains('tisya-search'))return;const q=e.target.value.toLowerCase();root.querySelectorAll('[data-search]').forEach(el=>el.hidden=!el.dataset.search.includes(q));};root.addEventListener('input',input);
    const down=e=>{const node=e.target.closest('#chat .mes');if(!node||e.composedPath().some(n=>n.matches?.('button,a,input,textarea,iframe,.mes_button,.mes_edit_buttons'))||e.button!==0)return;clearTimeout(hold?.timer);hold={x:e.clientX,y:e.clientY,timer:setTimeout(()=>{if(!String(window.getSelection()))run(()=>messageMenu(node),{exclusive:false});},650)};};
    const cancel=()=>{clearTimeout(hold?.timer);hold=null;};
    const move=e=>{if(hold&&Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>10)cancel();};
    query('#chat').addEventListener('pointerdown',down);query('#chat').addEventListener('pointermove',move);document.addEventListener('pointerup',cancel);document.addEventListener('pointercancel',cancel);
    cleanups.push(()=>{cancel();query('#chat')?.removeEventListener('pointerdown',down);query('#chat')?.removeEventListener('pointermove',move);document.removeEventListener('pointerup',cancel);document.removeEventListener('pointercancel',cancel);});
    if(!managed) {
        observer=new MutationObserver(records=>{const changed=new Set();for(const r of records){if(r.target.closest?.('.tisya-actions,.tisya-message-visual'))continue;if(r.target.closest?.('.mes_text'))changed.add(r.target.closest('.mes'));for(const n of r.addedNodes)if(n.nodeType===1){if(n.matches?.('.mes'))changed.add(n);else if(!n.matches?.('.tisya-actions,.tisya-message-visual'))for(const mes of n.querySelectorAll?.('.mes')??[])changed.add(mes);}}for(const node of changed)if(node?.isConnected)decorate(node);});
        observer.observe(query('#chat'),{childList:true,subtree:true});
    }
    let refreshTimer;
    const refreshActions=()=>{if(!enabled)return;checkReadingSource();clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(enabled)decorate();},0);};
    for(const name of ['GENERATION_STARTED','GENERATION_ENDED','GENERATION_STOPPED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_DELETED','MESSAGE_SWIPED']) {
        const event=context().eventTypes[name];if(!event)continue;
        context().eventSource.on(event,refreshActions);cleanups.push(()=>context().eventSource.removeListener(event,refreshActions));
    }
    for(const name of ['STREAM_TOKEN_RECEIVED','CHARACTER_MESSAGE_RENDERED','USER_MESSAGE_RENDERED']){
        const event=context().eventTypes[name];if(!event)continue;
        context().eventSource.on(event,checkReadingSource);cleanups.push(()=>context().eventSource.removeListener(event,checkReadingSource));
    }
    cleanups.push(()=>clearTimeout(refreshTimer));
    let visibleWorld=context().chatId?configStore.read().key:null;const onChange=()=>{const current=context().chatId?configStore.read().key:null;if(current===visibleWorld)return;visibleWorld=current;close();hidePage();messageNavigation.reset();decorate();};context().eventSource.on(context().eventTypes.CHAT_CHANGED,onChange);cleanups.push(()=>context().eventSource.removeListener(context().eventTypes.CHAT_CHANGED,onChange));
    decorate();home().catch(error);startFont();
}
export function registerChatSurface() {
    const api=window.__TAURITAVERN__?.api?.chatSurface;
    managed=api?.isManagedOwnershipRequired?.()===true;
    if(managed) participant=api.registerParticipant({id:'tisya-ui/message-actions',protocolVersion:api.protocolVersion,didCommitContent({element}){decorate(element);},didMount({element}){decorate(element);return ()=>{editToolbarPlacement?.restore(element);appearance?.restore(element);element.querySelector('.tisya-actions')?.remove();};}});
}
context().eventSource.on(context().eventTypes.APP_READY,async()=>{
    // Register once independently of the visible surface; expanding a macro is read-only.
    try{context().registerMacro('tisya_config_selected',()=>configHost.selectedText(),'缇斯亚：只装入选中资源');
     const bind=(name,fn)=>{const ev=context().eventTypes[name];if(!ev)throw Error('宿主缺少事件 '+name);context().eventSource.on(ev,fn);};
     bind('GENERATION_AFTER_COMMANDS',async(...args)=>{tableGeneration=false;tableService.clear({scope:'generation',reason:'主聊天开始新一轮，旧推进任务已停止'});nativeConfiguration.clearScan();preparationError=null;try{if(!['quiet','impersonate'].includes(args[0])){await tableService.ensureInitialized({scope:'generation'});await tableService.syncNative({scope:'generation'});}return await configHost.before(...args);}catch(e){preparationError=e;context().stopGeneration?.();error(e);throw e;}});if(tableService.worldbook.available()){bind('WORLDINFO_ENTRIES_LOADED',async p=>{await nativeConfiguration.entriesLoaded(p);tableService.worldbook.entriesLoaded(p);});bind('WORLD_INFO_ACTIVATED',entries=>tableService.worldbook.activated(entries));}bind('CHAT_COMPLETION_SETTINGS_READY',p=>{try{if(preparationError)throw preparationError;nativeConfiguration.assertReady();const projection=tableService.state().latest;if(projection?.injection==='worldbook')configHost.attachTableActivation({world:projection.world,text:tableService.worldbook.selectedText()});return configHost.payloadReady(p);}catch(e){blockPayload(p,e);context().stopGeneration?.();error(e);throw e;}});bind('GENERATION_ENDED',async()=>{configHost.clear();const runTables=tableGeneration;tableGeneration=false;tableService.clear({scope:'generation',reason:'主聊天已结束'});if(runTables&&!tableService.state().busy)try{await tableService.archive({scope:'generation'});}catch(e){error(e);}});bind('GENERATION_STOPPED',()=>{tableGeneration=false;tableService.clear({scope:'generation',reason:'主聊天已停止，附属推进任务已停止'});configHost.clear();});bind('CHAT_CHANGED',()=>{if(!tableService.contextChanged())return;tableGeneration=false;configHost.clear();tableService.activateFork().catch(error);});
     window.Tisya=Object.freeze({version:VERSION,register,registry,tables:tableService,contracts:{generation:GENERATION_CONTRACTS,mode:MODE_CONTRACT,archive:ARCHIVE_CONTRACT,validateGeneratedTask},configuration:{read:()=>configStore.read(),save:(...args)=>configStore.save(...args)},request:(...args)=>configHost.request(...args),context:()=>configHost.preview()});
     const activeSource=()=>configHost.activeSource()??presetSource();const live=registerLivePreset(context(),activeSource,context,()=>emotionCatalog(document).names(),error);registerPresetProtocol(context(),activeSource,error,()=>emotionCatalog(document).names(),source=>!isLivePreset(source)||live.execution().prose,()=>isLivePreset(activeSource())?live.execution():null);
     const initialize=async()=>{if(context().chatId&&configStore.read().revision!==null)return;const bridge=narrativeController();try{await bridge.initialize();}catch(e){error(e);}finally{bridge.dispose();}};
     context().eventSource.on(context().eventTypes.CHAT_CHANGED,initialize);await initialize();
    }catch(err){error(err);}
    emotionCatalog(document).ready.catch(()=>error(new Error('表情图鉴加载失败，请更新扩展后重启。')));
    try{init();}catch(err){error(err);}
});
