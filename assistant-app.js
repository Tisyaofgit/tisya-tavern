import {mountTablePanel} from './tables/panel.js';
import {mountRunView} from './tables/run-view.js';
import {PANEL_CSS} from './config/panel-style.js';
import {UTILITY_STYLE} from './utility-style.js';

export function mountAssistantApp(document,container,{service,identity,store,onClose,onNative,onWorldbook,onAtlas,onIdentity,onNewWorld,mountCreation,initialGoal='',onSaved=()=>{}}){
 const root=document.createElement('section');root.className='tisya-assistant-app';container.append(root);const dom=root.attachShadow({mode:'open'});
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const style=el('style',PANEL_CSS+UTILITY_STYLE+'main{padding:0}.assistant-tasks{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));background:transparent;border:0;padding:0}.assistant-tasks button{text-align:left}.assistant-tasks button[aria-pressed=true]{background:#c8b57e;color:#172b20}.assistant-intro{border-left:1px solid #c8b57e;padding:4px 0 4px 18px;margin:20px 0}.tisya-tables>nav{display:none}.tisya-user>header{display:none}.assistant-task-body{min-width:0}.assistant-task-body:empty{display:none}@media(max-width:350px){.assistant-tasks{grid-template-columns:1fr}}');dom.append(style);
 const header=el('header'),title=el('h1','缇斯亚助手'),close=el('button','聊天 ›');close.type='button';close.onclick=onClose;header.append(title,close);dom.append(header);
 const intro=el('p','把想法交给小缇。先生成可修改的草稿，核对后再保存；已有档案和当前故事各自保留。');intro.className='assistant-intro';dom.append(intro);
 const tasks=[['idea','创作人物'],['genesis','创作世界'],['foundation','从已有资料提炼'],['assistant','调整配置'],['history','角色卡建表与记忆归档'],['style','文风与禁词']];
 const nav=el('nav');nav.className='assistant-tasks';const notice=el('p');notice.setAttribute('role','status');dom.append(nav,notice);
 const progress=mountRunView(document,dom,{service,onMinimize:onClose}),body=el('main');dom.append(body);
 const panes=new Map();let current='',tablePanel=null,alive=true,pending=Promise.resolve();
 if(onNewWorld){const create=el('button','从点子开新世界');create.type='button';create.onclick=()=>{if(!service.state().busy)onNewWorld();};nav.append(create);}
 const buttons=new Map();for(const [id,label]of tasks){const button=el('button',label);button.type='button';button.onclick=()=>navigate(id).catch(e=>notice.textContent=e.message);buttons.set(id,button);nav.append(button);}
 async function navigate(id='assistant',goal='',creationOptions=null){
  if(!alive)return;if(service.state().busy||[...panes.values()].some(p=>p.api.busy||p.api.state?.().busy))throw Error('任务正在进行；可收起回聊天，完成或停止后再切换任务。');
  notice.textContent='';
  if(['idea','core','genesis','foundation','core-assets'].includes(id)){
   if(typeof mountCreation!=='function')throw Error('创作表单服务尚未接入');
   const slot='creation',options={kind:id==='genesis'?'world':'character',goal:goal||initialGoal,mode:'extend',createPersona:false,...creationOptions};
   const previous=panes.get(slot),signature=JSON.stringify(options);
   if(previous&&previous.signature!==signature){
    if(previous.api.confirmLeave&&!await previous.api.confirmLeave())return false;
    previous.api.dispose();previous.node.remove();panes.delete(slot);
   }
   if(!panes.has(slot)){
    const node=el('div');node.className='assistant-task-body';body.append(node);
    const api=mountCreation(document,node,options);panes.set(slot,{node,api,signature});await api.ready;
   }
   for(const [key,pane]of panes)pane.node.hidden=key!==slot;
   progress.root.hidden=true;current=id;for(const [key,b]of buttons)b.setAttribute('aria-pressed',String(key===id));
   return true;
  }
  const slot='tables';
  if(!panes.has(slot)){
   const node=el('div');node.className='assistant-task-body';let api;
   api=mountTablePanel(document,node,{service,store,onIdentity,onSaved,initialPage:id==='core-assets'?'core':id,initialGoal:goal||initialGoal});tablePanel=api;
   panes.set(slot,{node,api});body.append(node);await api.ready;
  }else await tablePanel.navigate(id==='core-assets'?'core':id,goal||initialGoal);
  for(const [key,pane]of panes)pane.node.hidden=key!==slot;
  progress.root.hidden=false;current=id;for(const [key,b]of buttons)b.setAttribute('aria-pressed',String(key===id));
 }
 const timer=setInterval(()=>{if(!alive)return;try{if(current!=='idea'&&current!=='core')progress.tick();for(const b of buttons.values())b.disabled=!!service.state().busy||[...panes.values()].some(p=>p.api.busy||p.api.state?.().busy);}catch(e){notice.textContent='读取任务状态失败：'+e.message;}},400);
 return {root,kind:'assistant',keepAlive:true,navigate(id,goal='',options=null){pending=navigate(id,goal,options);return pending;},settled:async()=>{await pending;for(const p of panes.values())await p.api.settled?.();},requestLeave:()=>({allowed:true,preserved:true}),resume(){if(current!=='idea'&&current!=='core')progress.tick();},dispose(){alive=false;clearInterval(timer);for(const p of panes.values())p.api.dispose();panes.clear();root.remove();}};
}
