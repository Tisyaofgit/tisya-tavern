// CHAT_CHANGED is emitted after the host installs and renders the selected chat.
// selectCharacterById also awaits unrelated event listeners and remote metadata
// housekeeping. Those must not keep our UI navigation lock after this handoff.
const pendingSelections=new Set();
let diagnostic=null;
export function chatSelectionDiagnostic(){
 if(!diagnostic)return {status:'未发起会话选择'};
 const {getContext,...data}=diagnostic,c=getContext();
 return {...data,current:{characterId:c.characterId??null,chatId:c.chatId??null,messageCount:c.chat?.length??null,hasIntegrity:typeof c.chatMetadata?.integrity==='string'},matchesCharacter:String(c.characterId)===String(data.target.characterId),matchesChat:c.chatId===data.target.chatId};
}
export function chatSelectionSummary(){const d=chatSelectionDiagnostic();return d.target?`宿主：${d.status}；角色匹配：${d.matchesCharacter?'是':'否'}；会话匹配：${d.matchesChat?'是':'否'}；会话事件：${d.chatEvents}；正文提交：${d.contentCommits}；最近提交：${d.lastContent??'无'}`:d.status;}
// The managed host commits content before printMessages/CHAT_CHANGED finishes.
// Only a live, non-aborted commit of the target chat's final message is a handoff.
export function notifySelectedChatContent({mesid,element,content,signal}){
 if(diagnostic){diagnostic.contentCommits++;diagnostic.lastContent=signal?.aborted?'已取消':!element?.isConnected||!content?.isConnected?'未连接':Number(mesid);}
 if(signal?.aborted||!element?.isConnected||!content?.isConnected||!element.contains(content)||!element.closest('#chat'))return;
 for(const pending of pendingSelections)pending.contentCommitted(Number(mesid));
}
export async function selectChatReady({getContext,id,file,onLateError=()=>{},schedule=null,cancel=()=>{}}){
 const trace={getContext,target:{characterId:id,chatId:file},status:'准备调用',chatEvents:0,contentCommits:0,lastContent:null};diagnostic=trace;
 const initial=getContext(),events=initial.eventSource,event=initial.eventTypes.CHAT_CHANGED;
 const previousMetadata=initial.chatMetadata,previousTail=initial.chat?.at(-1);
 const matches=()=>{const c=getContext();return String(c.characterId)===String(id)&&c.chatId===file;};
 // Returning from the directory to the already active chat is navigation only.
 // Passing chatFile to the host would force an unnecessary full reload.
 if(matches()){trace.status='已在目标会话，未调用宿主';return;}
 let handedOff=false,resolveReady;
 let frame=null;
 const ready=new Promise(resolve=>{resolveReady=resolve;});
 const changed=()=>{trace.chatEvents++;if(matches()){handedOff=true;resolveReady();}};
 const pending={contentCommitted(mesid){const c=getContext();if(matches()&&Number.isSafeInteger(mesid)&&Array.isArray(c.chat)&&mesid===c.chat.length-1&&c.chat[mesid]){handedOff=true;resolveReady();}}};
 if(!event)throw Error('宿主缺少会话切换完成事件，未打开会话');
 events.on(event,changed);
 pendingSelections.add(pending);
 // Native selection first installs an empty metadata object, then replaces it
 // with the loaded payload and assigns its integrity ID before printing. Observe
 // that data handoff directly; a copied target ID or a timer is not completion.
 const inspectPayload=()=>{
  const c=getContext(),tail=c.chat?.at(-1);
  if(matches()&&c.chatMetadata!==previousMetadata&&typeof c.chatMetadata?.integrity==='string'&&c.chatMetadata.integrity.length>0&&Array.isArray(c.chat)&&(c.chat.length===0||tail!==previousTail&&typeof tail?.mes==='string')&&(!c.getCurrentChatId||c.getCurrentChatId()===file)){
   handedOff=true;trace.handoff='目标数据已装入';resolveReady();return;
  }
  if(schedule)frame=schedule(inspectPayload);
 };
 let host;
 try{
  trace.status='宿主调用未返回';
  host=Promise.resolve().then(()=>initial.selectCharacterById(id,{switchMenu:false,chatFile:file})).then(value=>{trace.status='宿主调用已返回';return value;},e=>{trace.status='宿主调用失败';trace.error=String(e.message??e);throw e;});
  if(schedule)frame=schedule(inspectPayload);
  // Observe late failures even when the rendered-chat handoff wins the race.
  host.catch(e=>{if(handedOff)onLateError(Error('会话已进入，但宿主后续收尾失败：'+e.message));});
  await Promise.race([host,ready]);
  if(!matches())throw Error('宿主未切换到目标会话');
  if(trace.status==='宿主调用未返回')trace.status='目标已交接，宿主收尾未返回';
 }finally{if(frame!==null)cancel(frame);events.removeListener(event,changed);pendingSelections.delete(pending);}
}
