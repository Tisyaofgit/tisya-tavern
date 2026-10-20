// Ownership is observable; a pending read must never own the history-write lock.
export function messageActionExclusive(action){
 return !['more','msg-read','msg-copy','msg-info','candidate-picker'].includes(action);
}
export function createUiOperations({now=()=>Date.now()}={}){
 let owner=null;
 const state=()=>owner?{label:owner.label,elapsedSeconds:Math.max(0,Math.floor((now()-owner.started)/1000))}:null;
 async function run(fn,{exclusive=true,label='聊天操作'}={}){
  if(exclusive&&owner){const s=state();throw Error(`当前操作尚未结束：${s.label}（已等待 ${s.elapsedSeconds} 秒）。为保护存档，未执行新的修改；阅读、复制和菜单仍可使用。`);}
  const token=exclusive?{label,started:now()}:null;
  if(token)owner=token;
  try{return await fn();}finally{if(token&&owner===token)owner=null;}
 }
 return {run,state,busy:()=>owner!==null};
}
