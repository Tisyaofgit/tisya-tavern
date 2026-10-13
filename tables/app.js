import {PANEL_CSS} from '../config/panel-style.js';
import {mountTablePanel} from './panel.js';
import {mountRunView} from './run-view.js';

// A separate utility view. The shell may park its root while the user chats,
// so closing or opening Configuration does not commit/discard a table draft.
export function mountTableApp(document,container,{service,store,onClose=()=>{},onSaved=()=>{}}){
 const root=document.createElement('div');root.className='tisya-table-app';container.append(root);
 const dom=root.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=PANEL_CSS;dom.append(style);
 const header=document.createElement('header'),title=document.createElement('h1'),close=document.createElement('button');
 title.textContent='表单推进';close.type='button';close.textContent='收起';header.append(title,close);dom.append(header);
 const world=document.createElement('p');world.className='note';const snapshot=store.read();world.textContent='当前世界／分支：'+(snapshot.label??snapshot.key);dom.append(world);
 const body=document.createElement('main'),notice=document.createElement('p');notice.className='note';notice.setAttribute('role','status');notice.hidden=true;dom.append(notice,body);
 let alive=true,panel,runView,timer;
 if(!service){notice.hidden=false;notice.setAttribute('role','alert');notice.textContent='表单推进服务尚未加载，无法读取或保存表单。';}
 else {
  runView=mountRunView(document,dom,{service,onMinimize:()=>onClose()});dom.insertBefore(runView.root,body);
  panel=mountTablePanel(document,body,{service,store,onSaved:()=>{if(alive)onSaved();}});
  timer=setInterval(()=>{if(!alive)return;try{runView.tick();}catch(error){notice.hidden=false;notice.setAttribute('role','alert');notice.textContent='读取任务状态失败：'+error.message;}},500);
 }
 close.onclick=()=>{
  const leave=panel?.requestLeave({preserve:true})??{allowed:true};
  if(!leave.allowed){notice.hidden=false;notice.setAttribute('role','alert');notice.textContent=leave.reason||'当前任务尚未完成，请等待或停止任务。';return;}
  if(leave.dirty){notice.hidden=false;notice.setAttribute('role','status');notice.textContent='草稿已保留，重新打开表单推进可继续编辑。';}
  onClose();
 };
 return {root,kind:'tables',keepAlive:true,ready:panel?.ready??Promise.resolve(),settled:()=>panel?.settled()??Promise.resolve(),resume:()=>{runView?.tick();return panel?.resume()??Promise.resolve();},requestLeave:options=>panel?.requestLeave(options)??{allowed:true,reason:''},dispose(){alive=false;clearInterval(timer);panel?.dispose();root.remove();}};
}
