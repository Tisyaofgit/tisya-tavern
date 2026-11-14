// Ask the native chat surface to materialize historical messages. DOM presence
// is only a rendering detail; it is not evidence that a chat message is missing.
export async function revealPhoneOrigin({document,context,ownsCurrent,messageUid,native,beforeReveal=()=>{}}){
 if(!ownsCurrent())return false;
 const messages=context().chat,index=messages.findIndex(m=>m.extra?.tisya_engine?.uid===messageUid);
 if(index<0)throw Error('初始化所在回复已不在当前聊天中。');
 const stillCurrent=()=>ownsCurrent()&&context().chat[index]?.extra?.tisya_engine?.uid===messageUid;
 beforeReveal();
 let node=document.querySelector('#chat .mes[mesid="'+index+'"]');
 if(!node){
  if(native.isBoundedChatSurfaceView?.()){
   if(typeof native.jumpBoundedChatSurfaceToMessage!=='function')throw Error('当前宿主未提供历史楼层定位，请更新宿主后重试。');
   await native.jumpBoundedChatSurfaceToMessage(index);
  }else{
   if(typeof native.showMoreMessages!=='function')throw Error('当前宿主未提供历史载入入口，请在聊天中载入第 '+(index+1)+' 楼后核对。');
   const mounted=[...document.querySelectorAll('#chat .mes[mesid]')].map(n=>Number(n.getAttribute('mesid'))).filter(Number.isSafeInteger);
   const first=mounted.length?Math.min(...mounted):messages.length;
   await native.showMoreMessages(Math.max(1,first-index));
  }
  if(!stillCurrent())return false;
  node=document.querySelector('#chat .mes[mesid="'+index+'"]');
 }
 if(!stillCurrent())return false;
 if(!node?.scrollIntoView)throw Error('宿主尚未显示第 '+(index+1)+' 楼，请稍后重试。');
 node.scrollIntoView({block:'center',behavior:'smooth'});
 return true;
}
