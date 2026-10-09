import {mountMessageAppearance,mountChatEffects} from './message-ui.js';
import {mountPet} from './pet.js';
import { iconMarkup } from './icons.js';
import { mountMessageNavigation } from './navigation.js';
import { mountMessageReader } from './reader.js';
import { getContext } from '/scripts/st-context.js';
import { isGenerating, Generate, messageFormatting } from '/script.js';
import { getAgentGenerationOptions } from '/scripts/tauritavern/agent/agent-generation-router.js';
import { hasActiveAgentRun } from '/scripts/tauritavern/agent/agent-run-controller.js';
import { capture, validate, groupContacts } from './model.js';
import { loadReadingFont } from './font.js';
import { VERSION, SECTIONS, drawerEntries, chatPreview, chatTitle, mountLayout, installComposer } from './layout.js';

const KEY = '缇斯亚界面';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const query = selector => document.querySelector(selector);
const iconButton = (text, action, icon) => `<button type="button" class="tisya-icon-button" data-tisya-action="${esc(action)}" aria-label="${esc(text)}" title="${esc(text)}">${iconMarkup(icon)}</button>`;
const button = (text, action) => `<button type="button" data-tisya-action="${esc(action)}">${esc(text)}</button>`;
let layout, top, controls, messageNavigation, releaseReader, appearance, chatEffects, pet;
let motionEnabled=true;
const visualError=err=>console.warn('[Tisya visual]',err);
function refreshVisuals(){appearance?.refresh();chatEffects?.refresh();pet?.refresh();}
let root, overlay, observer, enabled = true, busy = false, generationBusy = false, hold, cleanups = [], renderEpoch = 0, sheetEpoch = 0;
let managed = false, participant, fontController, releaseFont, fontState='使用默认字体';
const FONT_URLS=Array.from({length:4},(_,i)=>`https://raw.githubusercontent.com/Tisyaofgit/tisya-tavern/cfc9d8c1ce4be94334c3b748addb0936802b2d2b/font/reading.part${i+1}.bin`);
async function startFont(){
 if(fontController)return;const controller=new AbortController();fontController=controller;
 const timer=setTimeout(()=>controller.abort(),120000);
 try{releaseFont=await loadReadingFont({urls:FONT_URLS,headers:()=>context().getRequestHeaders(),signal:controller.signal,onState:text=>{fontState=text;const el=query('#tisya-font-state');if(el)el.textContent=text;}});}
 catch(err){if(enabled){fontState='使用默认字体 · '+String(err.message??err);error(err);const el=query('#tisya-font-state');if(el)el.textContent=fontState;}}
 finally{clearTimeout(timer);if(fontController===controller)fontController=null;}
}
const context = () => getContext();
function error(err) { console.error('[Tisya UI]', err); window.toastr?.error(String(err.message ?? err), '缇斯亚界面'); }
function settings() {
    const s = context().extensionSettings[KEY];
    if (s === undefined) return { 联系人分组: {} };
    if (!s || typeof s !== 'object' || !s.联系人分组 || typeof s.联系人分组 !== 'object' || Array.isArray(s.联系人分组)) throw new Error('缇斯亚界面配置损坏；已停止读取');
    if(s.继续用户消息!==undefined&&typeof s.继续用户消息!=='string')throw new Error('继续设置损坏');
    return s;
}
function assertIdle() {
    if (isGenerating() || hasActiveAgentRun() || generationBusy) throw new Error('请先等待或停止正在进行的生成');
    if (query('#chat .mes.editing') || query('#chat .edit_textarea')) throw new Error('请先保存或取消消息编辑');
}
function clearReader() {releaseReader?.();releaseReader=null;delete overlay._actionDraft;}
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
function hidePage() { renderEpoch++; root.querySelector('.tisya-page').replaceChildren(); root.classList.remove('tisya-page-open'); refreshVisuals(); }
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
function extensionSection(key) {
    const entry=SECTIONS.find(([id])=>id===key);
    const section=entry&&document.getElementById(entry[1]);
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
    const sections=SECTIONS.filter(([,id])=>document.getElementById(id)?.querySelector('.inline-drawer-toggle')).map(([key,,label])=>button(label,`section:${key}`)).join('');
    const native=groupOrder.filter(name=>groups.has(name)).map(name=>`<h3>${esc(name)}</h3><div class="tisya-list">${name==='工作流'?sections:''}${groups.get(name).map(entry=>button(entry.label,`drawer:${entry.key}`)).join('')}</div>`).join('');
    const styleVersion=getComputedStyle(document.body).getPropertyValue('--tisya-style-version').replace(/["']/g,'').trim();
    sheet('TISYA · 月潮', `<h3>聊天</h3><div class="tisya-list">${button('返回聊天','chat')}${button('会话','home')}${button('联系人','contacts')}${button('全部聊天功能','chat-all')}${button('继续设置','continue-settings')}</div>${native}<h3>界面</h3><div class="tisya-list">${button('输入快捷栏','input-tools')}${button(pet?.isVisible()?'隐藏桌宠':'显示桌宠','pet-toggle')}${button(motionEnabled?'暂停动态效果':'开启动态效果','motion-toggle')}${fullscreenButton}${button('重试下载字体','font-retry')}${button('返回原生界面','disable')}</div><p id="tisya-font-state" class="tisya-note" role="status">${esc(fontState)}</p><p class="tisya-version">${VERSION} · TauriTavern 2.3.0</p>${styleVersion!==VERSION?'<p role="alert">界面样式版本不一致，请更新扩展并重启应用。</p>':''}`);
    overlay.querySelector('.tisya-backdrop').classList.add('tisya-navigation');
}
function page(title, html) {
    close(); closeNativeDrawers(); root.classList.add('tisya-page-open'); refreshVisuals();
    root.querySelector('.tisya-page').innerHTML = `<header>${button('菜单','menu')}<h2>${esc(title)}</h2>${button('返回聊天','chat')}</header>${html}`;
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
function messageToken(id) { return capture(context(),id); }
function messageMenu(node) {
    const id = Number(node.getAttribute('mesid'));
    const token = messageToken(id);
    sheet('消息操作',`<div class="tisya-list">${button('阅读与回合记录','msg-read')}${button('改写','msg-edit')}${button('回溯 · 删除这条及以下全部','msg-rollback')}${button('删除本条','msg-delete')}${button('创建分支','msg-branch')}${button('复制消息正文','msg-copy')}${button('更多功能','msg-native')}</div>`);
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
    if(action==='msg-read') {openReader(token);return;}
    if(action==='msg-copy') { const epoch=sheetEpoch;await navigator.clipboard.writeText(validate(context(),token).mes);close(epoch);return; }
    if(action==='msg-native') { close(); node.classList.toggle('tisya-native-tools'); node.querySelector('.extraMesButtonsHint')?.click(); return; }
    assertIdle();
    if(action==='msg-edit'||action==='msg-branch') {
        const target = node.querySelector(action==='msg-edit'?'.mes_edit':'.mes_create_branch');
        if(!target) throw new Error('原生消息操作未挂载');
        close();target.click();return;
    }
    if(action==='msg-delete'||action==='msg-rollback') {
        const count = action==='msg-delete'?1:context().chat.length-token.id;
        sheet(action==='msg-delete'?'删除本条':'回溯确认',`<p>将删除 ${count} 条消息${action==='msg-rollback'?'，包括选中消息及其后的全部消息':''}。操作使用宿主删除接口。</p>${button('取消','close')}${button('确认删除',action==='msg-delete'?'delete-confirm':'rollback-confirm')}`);
        overlay._messageToken = token;
    }
}
function openReader(token) {
    const message=validate(context(),token);
    sheet('阅读与回合记录','<div id="tisya-reader"></div>');
    releaseReader=mountMessageReader(document,query('#tisya-reader'),{
        source:message.mes,
        formatBody:body=>messageFormatting(body,message.name,!!message.is_system,!!message.is_user,token.id,
            {FORBID_TAGS:['script','style','custom-style','iframe','object','embed','form','input','button','select','textarea'],FORBID_ATTR:['style','id']},
            false,{regexPrepared:true,regexSourceText:body}),
        onChooseAction:text=>run(()=>chooseReaderAction(token,text)),
    }).dispose;
}
function chooseReaderAction(token,text) {
    assertIdle();nodeFor(token);
    const input=query('#send_textarea');if(!input)throw new Error('宿主输入框不存在');
    if(input.value.length){
        const draft=input.value;
        sheet('填入行动建议',`<p>输入框已有草稿，请选择如何放入这条行动。</p><blockquote>${esc(text)}</blockquote><div class="tisya-list">${button('追加到草稿后','action-append')}${button('替换草稿','action-replace')}${button('取消','close')}</div>`);
        overlay._actionDraft={token,text,draft};return;
    }
    fillReaderAction(token,text,'');
}
function fillReaderAction(token,text,draft) {
    assertIdle();nodeFor(token);
    const input=query('#send_textarea');if(!input||input.value!==draft)throw new Error('输入草稿已变化，请重新选择行动');
    input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));close();closeNativeDrawers();hidePage();input.focus({preventScroll:true});
}
function confirmReaderAction(append) {
    const choice=overlay._actionDraft;if(!choice)throw new Error('行动选择已失效，请重新打开消息');
    fillReaderAction(choice.token,append?choice.draft+'\n'+choice.text:choice.text,choice.draft);
}
async function removeMessages(rollback) {
    const token=overlay._messageToken,epoch=sheetEpoch;assertIdle();validate(context(),token,{tail:true});
    const original=context().chat.slice(token.id);
    const snapshots=original.map(message=>message && ({text:message.mes,swipe:message.swipe_id}));
    if(rollback && original.some(message=>!message)) throw new Error('后续历史尚未完整加载，未执行回溯');
    let deleted=0;
    try {
        const end=rollback?token.length-1:token.id;
        for(let id=end;id>=token.id;id--) {
            const message=context().chat[id], snapshot=snapshots[id-token.id];
            if(context().getCurrentChatId()!==token.chatId||message!==original[id-token.id]||!snapshot||message?.mes!==snapshot.text||message?.swipe_id!==snapshot.swipe) throw new Error('删除期间消息发生变化');
            await context().deleteMessage(id,undefined,false);deleted++;
        }
        await context().saveChat();close(epoch);
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
    (element ? [element] : [...document.querySelectorAll('#chat .mes')]).forEach(node=>{
        if(!node.querySelector('.tisya-actions')) {
            const row=document.createElement('div');row.className='tisya-actions';
            row.innerHTML=`${iconButton('重骰','regen','reroll')}${iconButton('继续','next','continue')}${iconButton('更多','more','more')}`;
            (node.querySelector('.mes_block')??node).append(row);
            row.addEventListener('click',e=>{const b=e.target.closest('[data-tisya-action]');if(!b)return;e.stopPropagation();run(async()=>{
                const token=messageToken(Number(node.getAttribute('mesid')));
                if(b.dataset.tisyaAction==='more')return messageMenu(node);
                if(b.dataset.tisyaAction==='next')return generateAt(token);
                return generateAt(token,true);
            },{exclusive:b.dataset.tisyaAction!=='more'});});
        }
        const id=Number(node.getAttribute('mesid')),msg=context().chat[id];
        appearance?.sync(node,{pending:id===context().chat.length-1&&(isGenerating()||hasActiveAgentRun()||generationBusy)});
        node.querySelectorAll('.tisya-actions button').forEach(b=>{if(b.dataset.tisyaAction!=='more'){const reason=!msg?'消息尚未加载':isGenerating()||hasActiveAgentRun()||generationBusy?'正在生成，请先停止或等待结束':'';b.disabled=!!reason;b.title=reason||(id<context().chat.length-1?'将自动删除下面的消息，再'+b.getAttribute('aria-label'):b.getAttribute('aria-label'));b.setAttribute('aria-disabled',String(!!reason));}});
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
    clearReader();enabled=false;fontController?.abort();releaseFont?.();releaseFont=null;observer?.disconnect();cleanups.forEach(fn=>fn());cleanups=[];layout.dispose();document.body.classList.remove('tisya-active','tisya-show-native-menu');
    document.querySelectorAll('.tisya-actions').forEach(el=>el.remove());
    document.querySelectorAll('.tisya-native-tools').forEach(el=>el.classList.remove('tisya-native-tools'));
}
function init() {
    if(query('#tisya-shell'))return;
    if(!query('#chat')||!query('#sheld')||!query('#top-settings-holder'))throw new Error('当前宿主布局不匹配，未启用界面');
    settings();
    layout=mountLayout(document);
    ({root,top,controls,overlay}=layout);
    cleanups.push(installComposer(document));
    motionEnabled=settings().动态效果!==false;
    appearance=mountMessageAppearance(document,{
        getMessage:node=>context().chat[Number(node.getAttribute('mesid'))],
        getMotion:()=>motionEnabled&&!root.classList.contains('tisya-page-open'),onError:visualError,
        formatBody:(body,msg,node)=>messageFormatting(body,msg.name,!!msg.is_system,!!msg.is_user,Number(node.getAttribute('mesid')),
            {FORBID_TAGS:['script','style','custom-style','iframe','object','embed','form','input','button','select','textarea'],FORBID_ATTR:['style','id']},false,{regexPrepared:true,regexSourceText:body}),
        onChooseAction:(node,source,text)=>run(()=>{const token=messageToken(Number(node.getAttribute('mesid')));if(validate(context(),token).mes!==source)throw new Error('消息已变化，请重新选择行动');chooseReaderAction(token,text);}),
    });
    cleanups.push(()=>appearance.dispose());
    chatEffects=mountChatEffects(document,{getMotion:()=>motionEnabled,onError:visualError});cleanups.push(()=>chatEffects.dispose());
    pet=mountPet(document,{getMotion:()=>motionEnabled,onError:visualError,onVisibility:value=>{const next=structuredClone(settings());next.显示桌宠=value;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();}});cleanups.push(()=>pet.dispose());
    if(settings().显示桌宠===false)pet.setVisible(false);
    messageNavigation=mountMessageNavigation(document,{onNavigate:()=>{closeNativeDrawers();hidePage();}});cleanups.push(()=>messageNavigation.dispose());
    const cancelDialog=e=>{e.preventDefault();close();};overlay.addEventListener('cancel',cancelDialog);
    const listener=e=>{const b=e.target.closest('[data-tisya-action]');if(!b||(!root.contains(b)&&!overlay.contains(b)&&!top.contains(b)&&!controls.contains(b)))return;const [action,id]=b.dataset.tisyaAction.split(':');
        if(action==='home'){home().catch(error);return;}
        if(action==='contacts'){renderEpoch++;contacts();return;}
        if(action==='chat'){close();closeNativeDrawers();hidePage();return;}
        if(action==='menu'){nav();return;}
        run(async()=>{
        if(action==='pet-toggle'){pet.setVisible(!pet.isVisible());close();hidePage();}else if(action==='motion-toggle'){motionEnabled=!motionEnabled;const next=structuredClone(settings());next.动态效果=motionEnabled;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();refreshVisuals();nav();}else if(action==='continue-settings'){sheet('继续设置',`<p>点消息下的“继续”，保留该条并生成下一条。旧消息之后的内容会自动删除。</p><label for="tisya-continue-text">自动发送的用户消息</label><p class="tisya-note">需要 user 消息的渠道可在此填写；留空则直接请求下一条。</p><textarea id="tisya-continue-text" aria-label="继续时自动发送的用户消息">${esc(settings().继续用户消息??'')}</textarea>${button('保存','save-continue')}`);}else if(action==='save-continue'){const next=structuredClone(settings());next.继续用户消息=query('#tisya-continue-text').value;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();close();}else if(action==='font-retry'){startFont();}else if(action==='close')close();else if(action==='drawer')nativeDrawer(id);else if(action==='section')extensionSection(id);else if(action==='fullscreen')nativeControl('#option_toggle_fullscreen');else if(action==='input-tools'){close();closeNativeDrawers();hidePage();query('#tisya-attach')?.focus({preventScroll:true});}else if(action==='card')await showCard(Number(id));else if(action==='select'){assertIdle();await context().selectCharacterById(Number(id),{switchMenu:true});if(String(context().characterId)!==id)throw new Error('宿主未切换角色');close();hidePage();nativeDrawer('rightNavHolder');}else if(action==='disable')stopUI();
        else if(action==='action-append'||action==='action-replace')confirmReaderAction(action==='action-append');
        else if(action==='group') {
            const card=context().characters[Number(id)];if(!card)throw new Error('角色不存在');
            sheet('联系人分组',`<input id="tisya-group-name" aria-label="分组名称" value="${esc(settings().联系人分组[card.avatar]??'未分组')}">${button('保存',`save-group:${encodeURIComponent(card.avatar)}`)}`);
        } else if(action==='save-group') {
            const name=query('#tisya-group-name').value.trim();if(!name)throw new Error('请输入分组名称');
            const avatar=decodeURIComponent(id);if(!context().characters.some(x=>x.avatar===avatar))throw new Error('角色已变化');
            const next=structuredClone(settings());next.联系人分组[avatar]=name;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();contacts();
        } else if(action.startsWith('msg-'))await messageAction(action);else if(action==='delete-confirm'||action==='rollback-confirm')await removeMessages(action==='rollback-confirm');
        else if(action==='chat-all') {close();hidePage();document.body.classList.add('tisya-show-native-menu');nativeControl('#options_button');}
    },{exclusive:['select','msg-edit','msg-branch','msg-delete','msg-rollback','delete-confirm','rollback-confirm','action-append','action-replace'].includes(action)});};
    document.addEventListener('click',listener);cleanups.push(()=>document.removeEventListener('click',listener));
    const escape=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',escape);cleanups.push(()=>document.removeEventListener('keydown',escape));
    const input=e=>{if(!e.target.classList.contains('tisya-search'))return;const q=e.target.value.toLowerCase();root.querySelectorAll('[data-search]').forEach(el=>el.hidden=!el.dataset.search.includes(q));};root.addEventListener('input',input);
    const down=e=>{const node=e.target.closest('#chat .mes');if(!node||e.composedPath().some(n=>n.matches?.('button,a,input,textarea,iframe,.mes_button,.mes_edit_buttons'))||e.button!==0)return;clearTimeout(hold?.timer);hold={x:e.clientX,y:e.clientY,timer:setTimeout(()=>{if(!String(window.getSelection()))run(()=>messageMenu(node),{exclusive:false});},650)};};
    const cancel=()=>{clearTimeout(hold?.timer);hold=null;};
    const move=e=>{if(hold&&Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>10)cancel();};
    query('#chat').addEventListener('pointerdown',down);query('#chat').addEventListener('pointermove',move);document.addEventListener('pointerup',cancel);document.addEventListener('pointercancel',cancel);
    cleanups.push(()=>{cancel();query('#chat')?.removeEventListener('pointerdown',down);query('#chat')?.removeEventListener('pointermove',move);document.removeEventListener('pointerup',cancel);document.removeEventListener('pointercancel',cancel);});
    if(!managed) {
        observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&!n.classList?.contains('tisya-actions'))))decorate();});
        observer.observe(query('#chat'),{childList:true,subtree:true});
    }
    let refreshTimer;
    const refreshActions=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(enabled)decorate();},0);};
    for(const name of ['GENERATION_STARTED','GENERATION_ENDED','GENERATION_STOPPED','MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_SWIPED']) {
        const event=context().eventTypes[name];if(!event)continue;
        context().eventSource.on(event,refreshActions);cleanups.push(()=>context().eventSource.removeListener(event,refreshActions));
    }
    cleanups.push(()=>clearTimeout(refreshTimer));
    const onChange=()=>{close();hidePage();messageNavigation.reset();decorate();};context().eventSource.on(context().eventTypes.CHAT_CHANGED,onChange);cleanups.push(()=>context().eventSource.removeListener(context().eventTypes.CHAT_CHANGED,onChange));
    decorate();home().catch(error);startFont();
}
export function registerChatSurface() {
    const api=window.__TAURITAVERN__?.api?.chatSurface;
    managed=api?.isManagedOwnershipRequired?.()===true;
    if(managed) participant=api.registerParticipant({id:'tisya-ui/message-actions',protocolVersion:api.protocolVersion,didCommitContent({element}){decorate(element);},didMount({element}){decorate(element);return ()=>{appearance?.restore(element);element.querySelector('.tisya-actions')?.remove();};}});
}
context().eventSource.on(context().eventTypes.APP_READY,()=>{try{init();}catch(err){error(err);}});
