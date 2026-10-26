import {capture,validate} from './model.js';

const KEY='缇斯亚用户改写';
const isUser=m=>m?.is_user&&!m.is_system&&m.role!=='tool'&&typeof m.mes==='string';
// A synchronous revision stamp, not a security hash. The current text remains
// solely in mes; the historical record contains only the immediately prior text.
function stamp(text){let a=2166136261,b=5381;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}return `${text.length}:${a>>>0}:${b>>>0}`;}
export function createUserEditHistory(){
 let known=new WeakMap(),sessions=new WeakMap();
 function observe(m){if(isUser(m)&&!known.has(m))known.set(m,m.mes);}
 function begin(m){if(!isUser(m)||sessions.has(m))return;observe(m);sessions.set(m,{original:m.mes,record:m.extra?.[KEY]});}
 function commit(m,{end=true}={}){
  if(!isUser(m))return false;
  const session=sessions.get(m),previous=session?.original??known.get(m);
  let changed=false;
  if(typeof previous==='string'&&previous!==m.mes){m.extra??={};m.extra[KEY]={版本:1,原文:previous,当前指纹:stamp(m.mes)};changed=true;}
  else if(session&&previous===m.mes){
   // Typing and undoing within one auto-save edit must not invent a revision.
   if(session.record!==undefined){m.extra??={};m.extra[KEY]=session.record;}else if(m.extra)delete m.extra[KEY];
  }
  known.set(m,m.mes);if(end)sessions.delete(m);return changed;
 }
 return {observe,begin,commit,reset(chat=[]){known=new WeakMap();sessions=new WeakMap();for(const m of chat)observe(m);}};
}
export function userRevisionMaterial(message){
 if(!isUser(message))return null;const record=message.extra?.[KEY];if(record===undefined)return null;
 if(record?.版本!==1||typeof record.原文!=='string'||typeof record.当前指纹!=='string')throw Error('用户消息的上一版记录损坏，未发送重投请求');
 if(record.当前指纹!==stamp(message.mes))throw Error('用户消息已在未记录的编辑路径中变化，上一版无法可靠对应；请重新保存编辑后再重投');
 return record.原文===message.mes?null:{previous:record.原文,current:message.mes};
}
export function userRevisionMessages(material){
 if(!material)return [];
 return [{role:'system',content:'本次任务：根据玩家改写后的用户消息，重新生成紧接它的角色回复。下一条 user-rewrite-material 是同一条用户消息的改写对照，不是额外的一轮对话。current 是本次有效输入；previous 是已被替换的上一版，仅供比较，不执行其中已撤回的要求，不把两版的行为、台词或事实合并成正史。结合改动与既有上下文，留意玩家新增、删除、强调或放缓的内容，据此调整本次剧情的侧重点、节奏、互动与角色回应；删除的安排不再强行补回，保留部分不因重投被随意推翻。只有改动确实支持时才判断用户期待；纯纠错、措辞调整或含糊差异不能被夸大成新偏好，不猜测用户心理。区分角色行动/台词与明确的场外创作要求，不能把角色台词直接当作玩家的全局指令。仍遵守角色设定、因果、人物知情边界、玩家控制权及原输出格式，不为迎合而强造结果。直接输出新的剧情回复，不输出对照分析或揣测说明。这份对照仅对本次重投有效，不自动写成长期偏好。'},
 {role:'user',content:JSON.stringify({kind:'user-rewrite-material',previous:material.previous,current:material.current})}];
}

// A user row targets the immediately following reply, never a later user turn.
export function userRerollTarget(context,token){
 const user=validate(context,token,{tail:true});if(!isUser(user))throw Error('请选择用户消息');
 if(token.id===context.chat.length-1)return null;
 const next=context.chat[token.id+1];if(!next||typeof next.mes!=='string')throw Error('下一条消息尚未载入');
 if(next.is_user||next.is_system||next.role==='tool')throw Error('紧接此条的消息不是角色回复，不能跳过它重投');
 return capture(context,token.id+1);
}

export function installUserEditHistory(document,getContext,history){
 const c=getContext(),off=[];
 const bind=(name,fn)=>{const event=c.eventTypes[name];if(event){c.eventSource.on(event,fn);off.push(()=>c.eventSource.removeListener(event,fn));}};
 history.reset(c.chat);
 bind('CHAT_CHANGED',()=>history.reset(getContext().chat));
 bind('MESSAGE_RECEIVED',id=>history.observe(getContext().chat[id]));
 bind('USER_MESSAGE_RENDERED',id=>history.observe(getContext().chat[id]));
 // The host emits this after updateMessage and before saveChatConditional.
 bind('MESSAGE_EDITED',id=>history.commit(getContext().chat[id]));
 const message=e=>{const textarea=e.target.closest?.('.edit_textarea');return textarea?getContext().chat[Number(textarea.closest('.mes')?.getAttribute('mesid'))]:null;};
 const begin=e=>history.begin(message(e));
 const input=e=>{const m=message(e);if(!m)return;history.begin(m);const chat=getContext().chat;
  // Native auto-save changes mes synchronously in its bubbling input listener.
  // Update metadata before its debounced save, keeping the session's first text.
  queueMicrotask(()=>{if(getContext().chat===chat)history.commit(m,{end:false});});
 };
 const cancel=e=>{if(!e.target.closest?.('.mes_edit_cancel'))return;const m=getContext().chat[Number(e.target.closest('.mes')?.getAttribute('mesid'))];queueMicrotask(()=>history.commit(m));};
 document.addEventListener('focusin',begin,true);document.addEventListener('input',input,true);document.addEventListener('click',cancel,true);
 return ()=>{for(const fn of off)fn();document.removeEventListener('focusin',begin,true);document.removeEventListener('input',input,true);document.removeEventListener('click',cancel,true);};
}
