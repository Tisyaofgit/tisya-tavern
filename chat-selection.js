// CHAT_CHANGED is emitted after the host installs and renders the selected chat.
// selectCharacterById also awaits unrelated event listeners and remote metadata
// housekeeping. Those must not keep our UI navigation lock after this handoff.
const pendingSelections=new Set();
// The managed host commits content before printMessages/CHAT_CHANGED finishes.
// Only a live, non-aborted commit of the target chat's final message is a handoff.
export function notifySelectedChatContent({mesid,element,content,signal}){
 if(signal?.aborted||!element?.isConnected||!content?.isConnected||!element.contains(content)||!element.closest('#chat'))return;
 for(const pending of pendingSelections)pending.contentCommitted(Number(mesid));
}
export async function selectChatReady({getContext,id,file,onLateError=()=>{}}){
 const initial=getContext(),events=initial.eventSource,event=initial.eventTypes.CHAT_CHANGED;
 const matches=()=>{const c=getContext();return String(c.characterId)===String(id)&&c.chatId===file;};
 // Returning from the directory to the already active chat is navigation only.
 // Passing chatFile to the host would force an unnecessary full reload.
 if(matches())return;
 let handedOff=false,resolveReady;
 const ready=new Promise(resolve=>{resolveReady=resolve;});
 const changed=()=>{if(matches()){handedOff=true;resolveReady();}};
 const pending={contentCommitted(mesid){const c=getContext();if(matches()&&Number.isSafeInteger(mesid)&&Array.isArray(c.chat)&&mesid===c.chat.length-1&&c.chat[mesid])changed();}};
 if(!event)throw Error('宿主缺少会话切换完成事件，未打开会话');
 events.on(event,changed);
 pendingSelections.add(pending);
 let host;
 try{
  host=Promise.resolve().then(()=>initial.selectCharacterById(id,{switchMenu:false,chatFile:file}));
  // Observe late failures even when the rendered-chat handoff wins the race.
  host.catch(e=>{if(handedOff)onLateError(Error('会话已进入，但宿主后续收尾失败：'+e.message));});
  await Promise.race([host,ready]);
  if(!matches())throw Error('宿主未切换到目标会话');
 }finally{events.removeListener(event,changed);pendingSelections.delete(pending);}
}
