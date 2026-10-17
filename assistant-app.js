import {mountIdentityPage} from './user-identity-page.js';
import {mountTablePanel} from './tables/panel.js';
import {mountRunView} from './tables/run-view.js';
import {PANEL_CSS} from './config/panel-style.js';
import {UTILITY_STYLE} from './utility-style.js';

export function mountAssistantApp(document,container,{service,identity,store,onClose,onNative,onWorldbook,onAtlas,onIdentity,onSaved=()=>{}}){
 const root=document.createElement('section');root.className='tisya-assistant-app';container.append(root);const dom=root.attachShadow({mode:'open'});
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const style=el('style',PANEL_CSS+UTILITY_STYLE+'main{padding:0}.assistant-tasks{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));background:transparent;border:0;padding:0}.assistant-tasks button{text-align:left}.assistant-tasks button[aria-pressed=true]{background:#c8b57e;color:#172b20}.assistant-intro{border-left:1px solid #c8b57e;padding:4px 0 4px 18px;margin:20px 0}.tisya-tables>nav{display:none}.tisya-user>header{display:none}.assistant-task-body{min-width:0}.assistant-task-body:empty{display:none}@media(max-width:350px){.assistant-tasks{grid-template-columns:1fr}}');dom.append(style);
 const header=el('header'),title=el('h1','缇斯亚助手'),close=el('button','聊天 ›');close.type='button';close.onclick=onClose;header.append(title,close);dom.append(header);
 const intro=el('p','把想法交给小缇。先生成可修改的草稿，核对后再保存；已有档案和当前故事各自保留。');intro.className='assistant-intro';dom.append(intro);
 const tasks=[['idea','设计用户身份'],['core','基点＋角色卡'],['genesis','设计世界与角色'],['foundation','提炼人物档案'],['core-assets','提取与适配基点'],['assistant','调整配置'],['history','整理会话历史'],['style','文风与禁词']];
 const nav=el('nav');nav.className='assistant-tasks';const notice=el('p');notice.setAttribute('role','status');dom.append(nav,notice);
 const progress=mountRunView(document,dom,{service,onMinimize:onClose}),body=el('main');dom.append(body);
 const panes=new Map();let current='',tablePanel=null,alive=true,pending=Promise.resolve();
 const buttons=new Map();for(const [id,label]of tasks){const button=el('button',label);button.type='button';button.onclick=()=>navigate(id).catch(e=>notice.textContent=e.message);buttons.set(id,button);nav.append(button);}
 async function navigate(id='assistant'){
  if(!alive)return;if(service.state().busy||[...panes.values()].some(p=>p.api.busy))throw Error('任务正在进行；可收起回聊天，完成或停止后再切换任务。');
  notice.textContent='';const identityTask=id==='idea'||id==='core';const slot=identityTask?id:'tables';
  if(!panes.has(slot)){
   const node=el('div');node.className='assistant-task-body';let api;
   if(identityTask)api=mountIdentityPage(node,{service:identity,tables:service,initialDesign:id,onNative,onWorldbook,onAtlas,onClose,onMinimize:onClose});
   else{api=mountTablePanel(document,node,{service,store,onIdentity,onSaved,initialPage:id==='core-assets'?'core':id});tablePanel=api;}
   panes.set(slot,{node,api});body.append(node);await api.ready;
  }else if(!identityTask)await tablePanel.navigate(id==='core-assets'?'core':id);
  for(const [key,pane]of panes)pane.node.hidden=key!==slot;
  progress.root.hidden=identityTask;current=id;for(const [key,b]of buttons)b.setAttribute('aria-pressed',String(key===id));
 }
 const timer=setInterval(()=>{if(!alive)return;try{if(current!=='idea'&&current!=='core')progress.tick();for(const b of buttons.values())b.disabled=!!service.state().busy||[...panes.values()].some(p=>p.api.busy);}catch(e){notice.textContent='读取任务状态失败：'+e.message;}},400);
 return {root,kind:'assistant',keepAlive:true,navigate(id){pending=navigate(id);return pending;},settled:async()=>{await pending;for(const p of panes.values())await p.api.settled?.();},requestLeave:()=>({allowed:true,preserved:true}),resume(){if(current!=='idea'&&current!=='core')progress.tick();},dispose(){alive=false;clearInterval(timer);for(const p of panes.values())p.api.dispose();panes.clear();root.remove();}};
}
