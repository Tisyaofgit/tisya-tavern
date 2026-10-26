import {hasToolMetadata,historyGroups} from './tool-history.js';
import {onePassStoryText,isOnePassReply} from '../onepass/source.mjs';
// Read the selected native branch on every request. No mirror, state write,
// reader projection, vector service, or stale cross-chat cache is involved.
// TauriTavern 2.3.0 constants.js publishes IGNORE_SYMBOL via Symbol.for.
const ignored=message=>!!message.extra?.[Symbol.for('ignore')];
export function historyWindow(context,world,type='normal'){
 const available=context.chat.map((message,index)=>({message,index})).filter(r=>!r.message.is_system&&!ignored(r.message));
 if(['swipe','regenerate'].includes(type)&&!available.at(-1)?.message.is_user)available.pop();
 const currentInput=type!=='continue'&&available.at(-1)?.message.is_user===true;
 const keep=Math.min(available.length,Math.max(type==='continue'?1:0,world.context.history+(currentInput?1:0))),split=available.length-keep;
 return {recent:available.slice(split),earlier:available.slice(0,split),currentInput};
}
export function selectedHistory(context,world,type){
 const recent=historyWindow(context,world,type).recent;
 // This compiler emits text/media messages, not provider tool turns. Never
 // flatten an operation into assistant prose or silently discard its result.
 if(recent.some(({message,index})=>hasToolMetadata(message)||hasToolMetadata(context.chat[index+1])&&context.chat[index+1]?.is_system===true))throw Error('所选历史包含工具调用；手选资料装配尚未支持完整工具历史，请使用原生上下文或调整历史范围。');
 return recent.map(r=>r.message);
}
export function historySignature(context){return JSON.stringify(context.chat.map(m=>{const onepass=!m.is_user&&isOnePassReply(m.mes);return [m.is_user,m.is_system,m.role,m.name,onepass?onePassStoryText(m.mes):m.mes,onepass?(m.swipe_id??0):m.swipe_id,m.extra?.media,m.extra?.file,m.tool_calls,m.tool_call_id,m.error,m.extra?.tool_invocations,ignored(m)];}));}

// Host generate_interceptor receives a prepared coreChat copy after swipe
// selection and before worldbook/preset assembly. Never edit stored chat rows.
export function limitNativeHistory(chat,history,type='normal',projectToolTurns){
 if(!Array.isArray(chat)||!Number.isInteger(history)||history<0)throw Error('历史范围输入无效');
 const native=message=>Number.isSafeInteger(message.index)&&message.index>=0;
 const groups=historyGroups(chat,projectToolTurns);
 const turns=groups.filter(g=>!g.tool).map(g=>({message:g.message,index:g.indices[0]})).filter(r=>native(r.message)&&!r.message.is_system&&r.message.role!=='tool'&&!ignored(r.message));
 if(chat.length&&!turns.length&&groups.some(g=>!g.tool&&!g.message.is_system&&g.message.role!=='tool'&&!ignored(g.message)))throw Error('宿主历史副本缺少 index 来源，未猜测或裁剪消息。');
 const currentInput=type!=='continue'&&(turns.at(-1)?.message.is_user===true||turns.at(-1)?.message.role==='user');
 const keep=Math.min(turns.length,Math.max(type==='continue'?1:0,history+(currentInput?1:0))),start=keep?turns[turns.length-keep].index:chat.length;
 // A result may be separated from its owner by extension side effects. If
 // any member crosses the cut, keep the whole group in physical order.
 const indices=new Set(groups.filter(g=>g.indices.some(index=>index>=start||!native(chat[index]))).flatMap(g=>g.indices));
 const retained=chat.filter((message,index)=>indices.has(index)),removed=chat.length-retained.length;
 chat.splice(0,chat.length,...retained);
 return {configured:history,retained:keep,currentInput,removed,totalBefore:turns.length,toolTurns:groups.filter(g=>g.tool&&indices.has(g.indices[0])).length};
}
