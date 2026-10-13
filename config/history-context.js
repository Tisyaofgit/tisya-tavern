// Read the selected native branch on every request. No mirror, state write,
// reader projection, vector service, or stale cross-chat cache is involved.
export function historyWindow(context,world,type='normal'){
 const available=context.chat.map((message,index)=>({message,index})).filter(r=>!r.message.is_system);
 if(['swipe','regenerate'].includes(type)&&!available.at(-1)?.message.is_user)available.pop();
 const currentInput=type!=='continue'&&available.at(-1)?.message.is_user===true;
 const keep=Math.min(available.length,Math.max(type==='continue'?1:0,world.context.history+(currentInput?1:0))),split=available.length-keep;
 return {recent:available.slice(split),earlier:available.slice(0,split),currentInput};
}
export function selectedHistory(context,world,type){return historyWindow(context,world,type).recent.map(r=>r.message);}
export function historySignature(context){return JSON.stringify(context.chat.map(m=>[m.is_user,m.is_system,m.mes,m.swipe_id,m.extra?.media,m.extra?.file]));}


// Host generate_interceptor receives a prepared coreChat copy after swipe
// selection and before worldbook/preset assembly. Never edit stored chat rows.
export function limitNativeHistory(chat,history,type='normal'){
 if(!Array.isArray(chat)||!Number.isInteger(history)||history<0)throw Error('历史范围输入无效');
 const native=message=>Number.isSafeInteger(message.index)&&message.index>=0;
 const turns=chat.map((message,index)=>({message,index})).filter(r=>native(r.message)&&!r.message.is_system&&r.message.role!=='tool');
 if(chat.length&&!turns.length&&chat.some(m=>!m.is_system&&m.role!=='tool'))throw Error('宿主历史副本缺少 index 来源，未猜测或裁剪消息。');
 const currentInput=type!=='continue'&&(turns.at(-1)?.message.is_user===true||turns.at(-1)?.message.role==='user');
 const keep=Math.min(turns.length,Math.max(type==='continue'?1:0,history+(currentInput?1:0))),start=keep?turns[turns.length-keep].index:chat.length;
 const retained=chat.filter((message,index)=>index>=start||!native(message)),removed=chat.length-retained.length;
 chat.splice(0,chat.length,...retained);
 return {configured:history,retained:keep,currentInput,removed,totalBefore:turns.length};
}
