import { getContext } from '/scripts/st-context.js';
import { isGenerating, Generate } from '/script.js';
import { getAgentGenerationOptions } from '/scripts/tauritavern/agent/agent-generation-router.js';
import { hasActiveAgentRun } from '/scripts/tauritavern/agent/agent-run-controller.js';
import { capture, validate, groupContacts } from './model.js';
import { loadReadingFont } from './font.js';

const KEY = '缇斯亚界面';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const query = selector => document.querySelector(selector);
const button = (text, action) => `<button type="button" data-tisya-action="${esc(action)}">${esc(text)}</button>`;
const labels = ['创作设置','模型连接','输出格式','世界与资料','外观与系统','背景','工作流与扩展','用户身份','角色卡与群聊'];
let root, overlay, observer, enabled = true, busy = false, generationBusy = false, hold, cleanups = [], renderEpoch = 0;
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
function close() { overlay.replaceChildren(); }
function sheet(title, body) {
    overlay.innerHTML = `<div class="tisya-backdrop"><section class="tisya-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2>${button('关闭','close')}</header>${body}</section></div>`;
    overlay.querySelector('.tisya-backdrop').addEventListener('click', e => { if (e.target.classList.contains('tisya-backdrop') && !busy) close(); });
}
function hidePage() { renderEpoch++; root.querySelector('.tisya-page').replaceChildren(); root.classList.remove('tisya-page-open'); }
function nativeDrawer(index) {
    const drawers = [...document.querySelectorAll('#top-settings-holder > .drawer')];
    const target = drawers[index]?.querySelector('.drawer-toggle');
    if (!target) throw new Error('此版本缺少对应的原生入口');
    close(); hidePage();
    if (!drawers[index].querySelector('.openDrawer')) target.click();
}
function nativeControl(selector) {
    const target = query(selector);
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') throw new Error('原生操作当前不可用');
    close(); hidePage(); target.click();
}
function nav() {
    const drawers = [...document.querySelectorAll('#top-settings-holder > .drawer')];
    sheet('TISYA · 月潮', `<div class="tisya-list">${button('会话','home')}${button('联系人','contacts')}${drawers.map((drawer, i) => button(labels[i] ?? drawer.querySelector('.drawer-icon')?.title ?? `原生入口 ${i+1}`,`drawer:${i}`)).join('')}${button('全部聊天功能','chat-all')}${button('继续设置','continue-settings')}<p id="tisya-font-state" role="status">${esc(fontState)}</p>${button('重试下载字体','font-retry')}${button('返回原生界面','disable')}</div>`);
    overlay.querySelector('.tisya-backdrop').classList.add('tisya-navigation');
}
function page(title, html) {
    close(); root.classList.add('tisya-page-open');
    root.querySelector('.tisya-page').innerHTML = `<header><h2>${esc(title)}</h2>${button('返回聊天','chat')}</header>${html}`;
}
function contacts() {
    const groups = groupContacts(context().characters, settings().联系人分组);
    page('联系人', `<input class="tisya-search" placeholder="搜索名称、分组或作者标签" aria-label="搜索联系人"><div class="tisya-list">${[...groups].map(([group,cards])=>`<details open><summary>${esc(group)} · ${cards.length}</summary>${cards.map(card=>`<div class="tisya-contact" data-search="${esc([card.name,group,...card.tags].join(' ').toLowerCase())}">${button(card.name,`card:${card.id}`)}<small>${esc(card.tags.join(' · '))}</small>${button('分组',`group:${card.id}`)}</div>`).join('')}</details>`).join('')}</div><footer>${button('创建或导入角色卡','drawer:8')}${button('群聊','drawer:8')}</footer>`);
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
    page(card.name,`<div class="tisya-list">${chats.map((chat,i)=>`<button type="button" data-chat-index="${i}"><strong>${esc(chat.file_name.replace(/\.jsonl$/,''))}</strong><small>${esc(chat.mes ?? '')}</small></button>`).join('') || '<p>还没有会话</p>'}</div>${button('打开角色卡 / 新建会话',`select:${id}`)}`);
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
    page('会话',`<p class="tisya-note">每个联系人下的聊天独立保存。群聊保留专用入口。</p><input class="tisya-search" placeholder="搜索联系人或会话" aria-label="搜索会话"><div class="tisya-list">${cards.map((card,index)=>{
        const result=results[index];
        if(!result?.error&&!result?.chats?.length)return '';
        return `<details open data-search="${esc([card.name,...(result.chats??[]).map(c=>c.file_name)].join(' ').toLowerCase())}"><summary>${esc(card.name)}</summary>${result.error?`<p role="alert">${esc(result.error)}</p>`:result.chats.map((chat,i)=>`<button type="button" data-home-card="${index}" data-home-chat="${i}"><strong>${esc(chat.file_name.replace(/\.jsonl$/,''))}</strong><small>${esc(chat.mes??'')}</small></button>`).join('')}${button('联系人详情',`card:${card.id}`)}</details>`;
    }).join('')||'<p>暂无会话，先选择联系人。</p>'}</div>${button('刷新会话','home')}${button('全部联系人','contacts')}${button('群聊与会话管理','drawer:8')}`);
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
    sheet('消息操作',`<div class="tisya-list">${button('改写','msg-edit')}${button('回溯 · 删除这条及以下全部','msg-rollback')}${button('删除本条','msg-delete')}${button('创建分支','msg-branch')}${button('复制消息正文','msg-copy')}${button('更多功能','msg-native')}</div>`);
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
    if(action==='msg-copy') { await navigator.clipboard.writeText(validate(context(),token).mes); close(); return; }
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
async function removeMessages(rollback) {
    const token=overlay._messageToken;assertIdle();validate(context(),token,{tail:true});
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
        await context().saveChat();close();
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
            row.innerHTML=`${button('重骰','regen')}${button('继续','next')}${button('更多','more')}`;
            (node.querySelector('.mes_block')??node).append(row);
            row.addEventListener('click',e=>{const b=e.target.closest('[data-tisya-action]');if(!b)return;e.stopPropagation();run(async()=>{
                const token=messageToken(Number(node.getAttribute('mesid')));
                if(b.dataset.tisyaAction==='more')return messageMenu(node);
                if(b.dataset.tisyaAction==='next')return generateAt(token);
                return generateAt(token,true);
            });});
        }
        const id=Number(node.getAttribute('mesid')),msg=context().chat[id];
        node.querySelectorAll('.tisya-actions button').forEach(b=>{if(b.dataset.tisyaAction!=='more'){const reason=!msg?'消息尚未加载':isGenerating()||hasActiveAgentRun()||generationBusy?'正在生成，请先停止或等待结束':'';b.disabled=!!reason;b.title=reason||(id<context().chat.length-1?'将自动删除下面的消息，再'+b.textContent:b.textContent);b.setAttribute('aria-disabled',String(!!reason));}});
        node.querySelectorAll('.mes_button, .mes_edit_buttons > div').forEach(el=>{
            const title=el.getAttribute('title')??el.getAttribute('data-tooltip')?.split('\n')[0];
            if(title)el.dataset.tisyaLabel=title;
        });
    });
}
async function run(fn) {
    if(busy){error(new Error('上一项操作仍在进行，请稍后再试'));return;}
    busy=true;
    try{await fn();}catch(err){error(err);}finally{busy=false;decorate();}
}
function stopUI() {
    if(generationBusy)throw new Error('请等当前操作完成再返回原生界面');
    enabled=false;fontController?.abort();releaseFont?.();releaseFont=null;observer?.disconnect();cleanups.forEach(fn=>fn());cleanups=[];root.remove();overlay.remove();document.body.classList.remove('tisya-active','tisya-show-native-menu','tisya-input-expanded');query('#tisya-input-more')?.remove();
    document.querySelectorAll('.tisya-actions').forEach(el=>el.remove());
    document.querySelectorAll('.tisya-native-tools').forEach(el=>el.classList.remove('tisya-native-tools'));
}
function init() {
    if(query('#tisya-shell'))return;
    if(!query('#chat')||!query('#top-settings-holder'))throw new Error('当前宿主布局不匹配，未启用界面');
    settings();
    root=document.createElement('div');root.id='tisya-shell';root.innerHTML=`<div class="tisya-top">${button('☰','menu')}<span>TISYA · 月潮</span>${button('会话','home')}${button('联系人','contacts')}</div><main class="tisya-page"></main>`;
    overlay=document.createElement('div');overlay.id='tisya-overlay';document.body.append(root,overlay);document.body.classList.add('tisya-active');
    const listener=e=>{const b=e.target.closest('[data-tisya-action]');if(!b||(!root.contains(b)&&!overlay.contains(b)))return;run(async()=>{
        const [action,id]=b.dataset.tisyaAction.split(':');
        if(action==='continue-settings'){sheet('继续设置',`<p>点继续时自动发送以下用户消息。留空时直接请求下一条回复。</p><textarea id="tisya-continue-text" aria-label="继续时自动发送的用户消息">${esc(settings().继续用户消息??'')}</textarea>${button('保存','save-continue')}`);}else if(action==='save-continue'){const next=structuredClone(settings());next.继续用户消息=query('#tisya-continue-text').value;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();close();}else if(action==='input-more'){document.body.classList.toggle('tisya-input-expanded');b.setAttribute('aria-expanded',String(document.body.classList.contains('tisya-input-expanded')));}else if(action==='font-retry'){startFont();}else if(action==='close')close();else if(action==='menu')nav();else if(action==='home')await home();else if(action==='contacts'){renderEpoch++;contacts();}else if(action==='chat'){close();hidePage();}else if(action==='drawer')nativeDrawer(Number(id));else if(action==='card')await showCard(Number(id));else if(action==='select'){assertIdle();await context().selectCharacterById(Number(id),{switchMenu:true});if(String(context().characterId)!==id)throw new Error('宿主未切换角色');close();hidePage();nativeDrawer(8);}else if(action==='disable')stopUI();
        else if(action==='group') {
            const card=context().characters[Number(id)];if(!card)throw new Error('角色不存在');
            sheet('联系人分组',`<input id="tisya-group-name" aria-label="分组名称" value="${esc(settings().联系人分组[card.avatar]??'未分组')}">${button('保存',`save-group:${encodeURIComponent(card.avatar)}`)}`);
        } else if(action==='save-group') {
            const name=query('#tisya-group-name').value.trim();if(!name)throw new Error('请输入分组名称');
            const avatar=decodeURIComponent(id);if(!context().characters.some(x=>x.avatar===avatar))throw new Error('角色已变化');
            const next=structuredClone(settings());next.联系人分组[avatar]=name;context().extensionSettings[KEY]=next;context().saveSettingsDebounced();contacts();
        } else if(action.startsWith('msg-'))await messageAction(action);else if(action==='delete-confirm'||action==='rollback-confirm')await removeMessages(action==='rollback-confirm');
        else if(action==='chat-all') {close();hidePage();document.body.classList.add('tisya-show-native-menu');nativeControl('#options_button');}
    });};
    const left=query('#leftSendForm');if(left){const extra=document.createElement('button');extra.id='tisya-input-more';extra.type='button';extra.textContent='＋';extra.dataset.tisyaAction='input-more';extra.setAttribute('aria-label','更多输入操作');extra.setAttribute('aria-expanded','false');extra.addEventListener('click',()=>{document.body.classList.toggle('tisya-input-expanded');extra.setAttribute('aria-expanded',String(document.body.classList.contains('tisya-input-expanded')));});left.append(extra);}
    document.addEventListener('click',listener);cleanups.push(()=>document.removeEventListener('click',listener));
    const escape=e=>{if(e.key==='Escape'&&!busy)close();};document.addEventListener('keydown',escape);cleanups.push(()=>document.removeEventListener('keydown',escape));
    const input=e=>{if(!e.target.classList.contains('tisya-search'))return;const q=e.target.value.toLowerCase();root.querySelectorAll('[data-search]').forEach(el=>el.hidden=!el.dataset.search.includes(q));};root.addEventListener('input',input);
    const down=e=>{const node=e.target.closest('#chat .mes');if(!node||e.target.closest('button,a,input,textarea,iframe,.mes_button,.mes_edit_buttons')||e.button!==0)return;clearTimeout(hold?.timer);hold={x:e.clientX,y:e.clientY,timer:setTimeout(()=>{if(!String(window.getSelection()))run(()=>messageMenu(node));},650)};};
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
    const onChange=()=>{close();hidePage();decorate();};context().eventSource.on(context().eventTypes.CHAT_CHANGED,onChange);cleanups.push(()=>context().eventSource.removeListener(context().eventTypes.CHAT_CHANGED,onChange));
    decorate();home().catch(error);startFont();
}
export function registerChatSurface() {
    const api=window.__TAURITAVERN__?.api?.chatSurface;
    managed=api?.isManagedOwnershipRequired?.()===true;
    if(managed) participant=api.registerParticipant({id:'tisya-ui/message-actions',protocolVersion:api.protocolVersion,didCommitContent({element}){decorate(element);},didMount({element}){decorate(element);return ()=>element.querySelector('.tisya-actions')?.remove();}});
}
context().eventSource.on(context().eventTypes.APP_READY,()=>{try{init();}catch(err){error(err);}});
