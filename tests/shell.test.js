import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {Window} from 'happy-dom';import * as model from '../model.js';import * as layout from '../layout.js';import * as icons from '../icons.js';import * as navigation from '../navigation.js';import * as reader from '../reader.js';import * as notebook from '../notebook.js';import {fixture as replyFixture} from './fixtures/journey-r4.cjs';
async function setup({generateWait,optionsWait}={}){const w=new Window({url:'http://localhost'});w.document.body.innerHTML='<div id="top-settings-holder">'+Array.from({length:9},(_,i)=>`<div id="${['ai-config-button','sys-settings-button','advanced-formatting-button','WI-SP-button','user-settings-button','backgrounds-button','extensions-settings-button','persona-management-button','rightNavHolder'][i]}" class="drawer"><div class="drawer-toggle"><i class="drawer-icon" title="${i}"></i></div><div class="drawer-content closedDrawer"></div></div>`).join('')+'</div><div id="sheld"><div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">正文</div><div class="mes_buttons"><button class="mes_edit">edit</button><button class="mes_create_branch">branch</button><div class="extraMesButtonsHint"></div></div></div></div></div></div><div id="nonQRFormItems"><div id="leftSendForm"></div><textarea id="send_textarea"></textarea><div id="rightSendForm"></div></div><button id="option_regenerate"></button><button id="options_button"></button>';
w.structuredClone=structuredClone;w.fetch=async(url,options)=>({ok:true,json:async()=>[{file_name:JSON.parse(options.body).avatar_url+'.jsonl',mes:'已保存正文'}]});const errors=[],handlers={},formatCalls=[];const ctx={chat:[{mes:'正文',is_user:false}],characters:[{avatar:'a.png',name:'同名',chat:'a',tags:['悬疑']},{avatar:'b.png',name:'同名',chat:'b',tags:['日常']}],extensionSettings:{},getRequestHeaders:()=>({}),getCurrentChatId:()=> 'a',eventTypes:{APP_READY:'ready',CHAT_CHANGED:'chat',GENERATION_STARTED:'generation-start',GENERATION_ENDED:'generation-end',GENERATION_STOPPED:'generation-stop',MESSAGE_RECEIVED:'received',MESSAGE_UPDATED:'updated',MESSAGE_EDITED:'edited',MESSAGE_DELETED:'deleted',MESSAGE_SWIPED:'swiped'},eventSource:{on:(e,f)=>{handlers[e]=f},removeListener:()=>{}},saveSettingsDebounced:()=>{},mainApi:'openai'};let generating=false,generated=[];w.fixture={mountMessageAppearance:()=>({sync(){},dispose(){},restore(){},refresh(){}}),mountChatEffects:()=>({dispose(){},refresh(){}}),mountPet:(_,options)=>{w.phoneOptions=options;return {dispose(){},refresh(){},isVisible:()=>true,setVisible(){}}},getContext:()=>ctx,isGenerating:()=>generating,Generate:async(...args)=>{generated.push([...args,w.document.querySelector('#send_textarea').value]);await generateWait?.(...args);},getAgentGenerationOptions:async()=>await optionsWait?.()??({}),hasActiveAgentRun:()=>false,loadReadingFont:async()=>{},messageFormatting:(...args)=>{formatCalls.push(args);return args[0].replaceAll('&','&amp;').replaceAll('<','&lt;');},...model,...layout,...icons,...navigation,...reader,...notebook};w.toastr={error:t=>errors.push(t)};
let code=await readFile(new URL('../index.js',import.meta.url),'utf8');code=code.replace(/^import \{([^}]+)\} from '[^']+';/gm,(_,names)=>`const {${names}}=window.fixture;`).replace('export function registerChatSurface','function registerChatSurface');w.eval(code);handlers.ready();await w.happyDOM.whenAsyncComplete();return {w,ctx,errors,generated,handlers,formatCalls,setGenerating:v=>generating=v};}
async function click(f,a){let target=a==='menu'?f.w.document.querySelector('#tisya-menu-trigger'):f.w.document.querySelector(`[data-tisya-action="${a}"]`);if(!target&&['contacts','home'].includes(a)){await click(f,'menu');target=f.w.document.querySelector(`[data-tisya-action="${a}"]`);}target.click();await f.w.happyDOM.whenAsyncComplete();}
test('phone and sidebar open the same read-only notes and public memory pages',async()=>{
 const f=await setup(),d=f.w.document;f.ctx.chat[0].mes=replyFixture();const source=f.ctx.chat[0].mes;
 assert.equal(f.w.phoneOptions.onOpenApp('手记'),true);await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-page h2').textContent,/会话手记/);assert.equal(d.querySelectorAll('.tisya-notebook-card').length,1);
 d.querySelector('.tisya-notebook-card button').click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('[data-reader-tab="body"]').getAttribute('aria-pressed'),'true');assert.equal(d.querySelector('#tisya-overlay').open,true);
 await click(f,'close');await click(f,'memory');assert.match(d.querySelector('.tisya-page h2').textContent,/公开记忆/);assert.equal(f.ctx.chat[0].mes,source);assert.equal(f.generated.length,0);
 assert.equal(f.w.phoneOptions.onOpenApp('图鉴'),false);assert.equal(f.w.phoneOptions.onOpenApp('不存在'),false);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
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
test('phone settings, theme, protocol, applications and contacts reach their named existing destinations',async()=>{
 const f=await setup(),d=f.w.document;
 for(const [name,id]of [['主题','user-settings-button'],['协议','advanced-formatting-button'],['应用','extensions-settings-button']]){
  let hits=0;d.querySelector('#'+id+' .drawer-toggle').addEventListener('click',()=>hits++);f.w.phoneOptions.onOpenApp(name);await f.w.happyDOM.whenAsyncComplete();assert.equal(hits,1);
 }
 f.w.phoneOptions.onOpenApp('设置');await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('#tisya-overlay').textContent,/TISYA/);
 f.w.phoneOptions.onOpenApp('通信');await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelectorAll('.tisya-contact').length,2);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('editing or swiping invalidates an open reader and notebook without touching messages',async()=>{
 const f=await setup(),d=f.w.document;f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();d.querySelector('.tisya-notebook-card button').click();
 f.ctx.chat[0].mes='已更新';f.handlers.updated();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('.tisya-reader'),null);assert.match(d.querySelector('#tisya-overlay').textContent,/已变化/);assert.equal(d.querySelectorAll('.tisya-notebook-card').length,0);assert.match(d.querySelector('#tisya-notebook').textContent,/已变化/);assert.equal(f.ctx.chat[0].mes,'已更新');
 await click(f,'close');d.querySelector('.tisya-notebook-pager').lastElementChild.click();await f.w.happyDOM.whenAsyncComplete();assert.match(d.querySelector('.tisya-notebook-card').textContent,/已更新/);
 f.handlers.chat();assert.equal(d.querySelector('#tisya-notebook'),null);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('notebook lookup works during a pending generation and tears down on return to native UI',async()=>{
 const stream=deferred(),f=await setup({generateWait:()=>stream.promise}),d=f.w.document;await click(f,'next');assert.equal(f.generated.length,1);
 f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelectorAll('.tisya-notebook-card').length,1);d.querySelector('.tisya-notebook-actions').children[1].click();await f.w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('#tisya-notebook'),null);assert.equal(f.generated.length,1);
 stream.resolve();await new Promise(resolve=>setTimeout(resolve,0));f.w.phoneOptions.onOpenApp('手记');await f.w.happyDOM.whenAsyncComplete();const old=d.querySelector('.tisya-notebook-card button');await click(f,'menu');await click(f,'disable');old.click();assert.equal(d.querySelector('#tisya-overlay'),null);assert.equal(f.w.phoneOptions.onOpenApp('手记'),false);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
test('contacts, labels, grouping and teardown keep native nodes',async()=>{const f=await setup();const native=f.w.document.querySelector('.mes_text');await click(f,'contacts');assert.equal(f.w.document.querySelectorAll('.tisya-contact').length,2);await click(f,'group:0');f.w.document.querySelector('#tisya-group-name').value='世界卡';await click(f,'save-group:a.png');assert.deepEqual(f.errors,[]);assert.equal(f.ctx.extensionSettings.缇斯亚界面.联系人分组['a.png'],'世界卡');await click(f,'menu');assert.match(f.w.document.querySelector('[data-tisya-action="drawer:backgrounds-button"]').textContent,/背景/);await click(f,'disable');assert.equal(f.w.document.querySelector('#tisya-shell'),null);assert.equal(f.w.document.querySelectorAll('.tisya-actions').length,0);assert.equal(f.w.document.querySelector('.mes_text'),native);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();});
test('continue requests next normal response, never submits composer draft',async()=>{const f=await setup();f.w.document.querySelector('#send_textarea').value='未发送草稿';await click(f,'next');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/草稿/);f.w.document.querySelector('#send_textarea').value='';await click(f,'next');assert.equal(f.generated.length,1);assert.equal(f.generated[0][0],'normal');assert.equal(f.generated[0][1].automatic_trigger,true);f.w.happyDOM.abort();});
test('message menu refuses edited source and generation blocks editing',async()=>{const f=await setup();let edits=0;f.w.document.querySelector('.mes_edit').addEventListener('click',()=>edits++);await click(f,'more');f.ctx.chat[0].mes='变化';await click(f,'msg-edit');assert.equal(edits,0);assert.match(f.errors.at(-1),/变化/);f.ctx.chat[0].mes='正文';await click(f,'close');await click(f,'more');f.setGenerating(true);await click(f,'msg-edit');assert.equal(edits,0);assert.match(f.errors.at(-1),/生成/);f.w.happyDOM.abort();});

test('home lists every persisted chat and keeps same-name contacts separate',async()=>{const f=await setup();assert.equal(f.w.document.querySelectorAll('[data-home-chat]').length,2);assert.match(f.w.document.querySelector('[data-home-card="0"]').textContent,/a.png/);assert.match(f.w.document.querySelector('[data-home-card="1"]').textContent,/b.png/);f.w.fetch=async()=>{throw new Error('连接失败')};await click(f,'home');assert.equal(f.w.document.querySelectorAll('[role="alert"]').length,2);assert.equal(f.w.document.querySelectorAll('[data-home-chat]').length,0);f.w.happyDOM.abort();});

test('streaming disables actions and generation end re-enables both on same mounted message',async()=>{
 const f=await setup(),regen=f.w.document.querySelector('[data-tisya-action="regen"]'),next=f.w.document.querySelector('[data-tisya-action="next"]');
 f.setGenerating(true);f.handlers['generation-start']();await f.w.happyDOM.whenAsyncComplete();
 assert.equal(regen.disabled,true);assert.equal(next.disabled,true);assert.match(next.title,/生成/);
 f.setGenerating(false);f.handlers['generation-end']();await f.w.happyDOM.whenAsyncComplete();
 assert.equal(regen.disabled,false);assert.equal(next.disabled,false);
 await click(f,'regen');assert.equal(f.generated[0][0],'regenerate');
 await click(f,'next');assert.equal(f.generated.length,2);assert.equal(f.generated[1][0],'normal');
 await click(f,'menu');await click(f,'disable');f.handlers['generation-end']();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.document.querySelector('.tisya-actions'),null);f.w.happyDOM.abort();
});

function addHistory(f){
 f.ctx.chat=[{mes:'第一条',is_user:false},{mes:'用户第二条',is_user:true},{mes:'最后条',is_user:false}];
 f.w.document.querySelector('.mes_text').textContent='第一条';
 const log=[];f.ctx.deleteMessage=async id=>{log.push('delete:'+id);f.ctx.chat.splice(id,1);};f.ctx.saveChat=async()=>{log.push('save');};
 return log;
}
test('old AI reroll deletes following messages before regenerating selected turn',async()=>{
 const f=await setup(),log=addHistory(f);await click(f,'regen');
 assert.deepEqual(log,['delete:2','delete:1','save']);assert.equal(f.ctx.chat.length,1);assert.equal(f.generated[0][0],'regenerate');assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
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

test('workflow navigation expands the existing native section and does not replace it',async()=>{
 const f=await setup(),d=f.w.document,container=d.createElement('div');container.id='mcp_manager_container';container.innerHTML='<div class="inline-drawer-toggle"><i class="inline-drawer-icon down"></i></div><input value="preserved">';d.querySelector('#extensions-settings-button .drawer-content').append(container);
 let clicks=0;container.querySelector('.inline-drawer-toggle').addEventListener('click',()=>clicks++);
 await click(f,'menu');await click(f,'section:mcp');assert.equal(clicks,1);assert.equal(container.querySelector('input').value,'preserved');assert.equal(d.querySelector('#mcp_manager_container'),container);assert.equal(d.querySelector('#tisya-overlay').open,false);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});

test('chat menu navigation exposes and focuses its actual native anchor',async()=>{
 const f=await setup(),d=f.w.document,anchor=d.querySelector('#options_button');anchor.setAttribute('tabindex','0');let focused=false;
 anchor.addEventListener('click',()=>{focused=d.activeElement===anchor;});
 await click(f,'menu');await click(f,'chat-all');assert.equal(d.querySelector('#tisya-input-more'),null);assert.equal(focused,true);f.w.happyDOM.abort();
});

test('sidebar shortcut entry closes the page and focuses the persistent attachment action',async()=>{
 const f=await setup();await click(f,'menu');await click(f,'input-tools');const d=f.w.document;
 assert.equal(d.querySelector('#tisya-shell').classList.contains('tisya-page-open'),false);
 assert.equal(d.querySelector('#tisya-overlay').open,false);assert.equal(d.activeElement,d.querySelector('#tisya-attach'));
 assert.equal(d.querySelector('#tisya-input-more'),null);assert.equal(d.body.classList.contains('tisya-tools-collapsed'),false);f.w.happyDOM.abort();
});

test('supported system fullscreen routes to native action while app header stays removed',async()=>{
 const f=await setup(),d=f.w.document,control=d.createElement('button');control.id='option_toggle_fullscreen';d.body.append(control);let count=0;control.addEventListener('click',()=>count++);
 await click(f,'menu');await click(f,'fullscreen');assert.equal(count,1);assert.equal(d.body.style.getPropertyValue('--topBarBlockSize'),'0px');assert.equal(d.querySelector('#tisya-top'),null);assert.equal(d.querySelector('#tisya-overlay').open,false);f.w.happyDOM.abort();
});

test('message and bottom menu icons retain accessible names and native source nodes',async()=>{
 const f=await setup(),d=f.w.document;
 for(const [selector,label]of [['[data-tisya-action="regen"]','重骰'],['[data-tisya-action="next"]','继续'],['[data-tisya-action="more"]','更多'],['#tisya-menu-trigger','打开侧栏']]){const b=d.querySelector(selector);assert.equal(b.textContent,'');assert.equal(b.getAttribute('aria-label'),label);assert.equal(b.querySelector('svg').getAttribute('aria-hidden'),'true');}
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
for(const choice of ['action-append','action-replace','close'])test('reader respects explicit draft choice '+choice,async()=>{
 const f=await setup(),button=await openActions(f);f.w.document.querySelector('#send_textarea').value='已有草稿';button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.document.querySelector('#send_textarea').value,'已有草稿');await click(f,choice);
 assert.equal(f.w.document.querySelector('#send_textarea').value,choice==='action-append'?'已有草稿\n察看门锁':choice==='action-replace'?'察看门锁':'已有草稿');assert.equal(f.generated.length,0);assert.deepEqual(f.errors,[]);f.w.happyDOM.abort();
});
for(const change of ['draft','message','chat'])test('pending action refuses changed '+change,async()=>{
 const f=await setup(),button=await openActions(f);f.w.document.querySelector('#send_textarea').value='原草稿';button.click();await f.w.happyDOM.whenAsyncComplete();
 if(change==='draft')f.w.document.querySelector('#send_textarea').value='刚编辑';else if(change==='message')f.ctx.chat[0].mes='发生变化';else f.ctx.getCurrentChatId=()=> 'another-chat';
 await click(f,'action-replace');assert.equal(f.w.document.querySelector('#send_textarea').value,change==='draft'?'刚编辑':'原草稿');assert.equal(f.generated.length,0);assert.match(f.errors.at(-1),/变化|会话/);f.w.happyDOM.abort();
});
test('chat change closes reader and stale actions cannot write into the next conversation',async()=>{
 const f=await setup(),button=await openActions(f);f.handlers.chat();button.click();await f.w.happyDOM.whenAsyncComplete();assert.equal(f.w.document.querySelector('#send_textarea').value,'');assert.equal(f.w.document.querySelector('#tisya-overlay').open,false);assert.equal(f.generated.length,0);f.w.happyDOM.abort();
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
   await click(f,'menu');const dialog=d.querySelector('#tisya-overlay');assert.equal(dialog.open,true);
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
  assert.equal(d.querySelector('#tisya-overlay').open,true);assert.equal(d.querySelector('#tisya-overlay').getAttribute('aria-label'),'TISYA · 月潮');assert.deepEqual(f.errors,[]);
 } finally {copy.resolve();await f.w.happyDOM.abort();}
});

test('pending history save allows menu dismissal and does not close a later panel',async()=>{
 const save=deferred(),f=await setup(),d=f.w.document;addHistory(f);f.ctx.saveChat=()=>save.promise;
 try {
  await click(f,'more');await click(f,'msg-delete');await click(f,'delete-confirm');assert.equal(f.ctx.chat.length,2);
  await click(f,'close');await click(f,'menu');save.resolve();await f.w.happyDOM.whenAsyncComplete();
  assert.equal(d.querySelector('#tisya-overlay').open,true);assert.equal(d.querySelector('#tisya-overlay').getAttribute('aria-label'),'TISYA · 月潮');assert.deepEqual(f.errors,[]);
 } finally {save.resolve();await f.w.happyDOM.abort();}
});
