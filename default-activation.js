import {chatKey,NS} from './engine/controller.mjs';

// One owner for startup activation and each observed chat opening. Generation
// waits for this same promise; it never performs a second initialization.
export function createDefaultActivation({getContext,activatePreset,ensureBound,isChatReady=()=>true}){
 let startup=null,startupError=null,current=null,epoch=0,disposed=false;
 const snapshot=()=>{const c=getContext();return {key:chatKey(c),metadata:c.chatMetadata,chat:c.chat,ready:isChatReady(c)};};
 const same=(a,b)=>a?.key===b?.key&&a?.metadata===b?.metadata&&a?.chat===b?.chat&&a?.ready===b?.ready;
 const stale=()=>Object.assign(Error('自动接入期间聊天已变化，原操作已停止'),{code:'CHAT_CHANGED'});
 function open({retry=false,syncArchive=true}={}){
  if(disposed)return Promise.reject(Object.assign(Error('插件已关闭'),{code:'PLUGIN_CLOSED'}));
  const captured=snapshot();
  // APP_READY does not await the host's initial chat load. A target ID may
  // already exist while its metadata is still the empty loading placeholder.
  // Do not create an owner or cache this placeholder as a completed opening.
  if(captured.key&&!captured.ready){epoch++;current=null;return Promise.resolve({status:'chat-loading',key:captured.key});}
  if(!retry&&same(current,captured)&&(current.syncArchive||!syncArchive))return current.promise;
  const token=++epoch;
  const record={...captured,syncArchive,promise:null};current=record;
  record.promise=Promise.resolve().then(()=>{
   if(!captured.key)return {status:'no-chat',key:null};
   const assertCurrent=()=>{if(disposed||epoch!==token||!same(captured,snapshot()))throw stale();};
   assertCurrent();return ensureBound({assertCurrent,syncArchive});
  });
  return record.promise;
 }
 function start(options={}){
  startup??=Promise.resolve().then(()=>activatePreset()).then(receipt=>{if(receipt?.active!==true)throw Error('Tisya 预设尚未选中，自动接入未开始');return receipt;}).catch(error=>{startupError=error;throw error;});
  return startup.then(()=>open(options));
 }
 async function chatChanged(options={}){if(!startup)return start(options);await startup;return open(options);}
 async function ready(){
  const c=getContext(),meta=c.chatMetadata?.[NS];
  // Generation must not use the reopen path to silently re-enable an owner the
  // user explicitly disabled. Pending initial/fork bindings still complete.
  if(chatKey(c)&&meta?.enabled===false&&!meta.binding_pending)throw Object.assign(Error('当前聊天的新引擎已停用；重新打开聊天后默认启用'),{code:'ENGINE_DISABLED'});
  const result=await chatChanged();
  if(result?.status==='chat-loading')throw Object.assign(Error('聊天内容尚在载入，请等载入完成后重试。'),{code:'HOST_CHAT_LOADING'});
  if(result?.key&&getContext().chatMetadata?.[NS]?.enabled!==true)throw Object.assign(Error('当前聊天的新引擎已停用；重新打开聊天后默认启用'),{code:'ENGINE_DISABLED'});
  return result;
 }
 return {start,chatChanged,ready,retry:async()=>{if(startupError){startup=null;startupError=null;epoch++;current=null;return start();}if(!startup)return start();await startup;return open({retry:true});},dispose(){disposed=true;epoch++;current=null;},state:()=>({started:!!startup,key:current?.key??null,disposed})};
}
