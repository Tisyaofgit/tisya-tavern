import {chatKey,NS} from './engine/controller.mjs';

// One owner for startup activation and each observed chat opening. Generation
// waits for this same promise; it never performs a second initialization.
export function createDefaultActivation({getContext,activatePreset,ensureBound}){
 let startup=null,startupError=null,current=null,epoch=0,disposed=false;
 const snapshot=()=>{const c=getContext();return {key:chatKey(c),metadata:c.chatMetadata,chat:c.chat};};
 const same=(a,b)=>a?.key===b?.key&&a?.metadata===b?.metadata&&a?.chat===b?.chat;
 const stale=()=>Object.assign(Error('自动接入期间聊天已变化，原操作已停止'),{code:'CHAT_CHANGED'});
 function open({retry=false}={}){
  if(disposed)return Promise.reject(Object.assign(Error('插件已关闭'),{code:'PLUGIN_CLOSED'}));
  const captured=snapshot();
  if(!retry&&same(current,captured))return current.promise;
  const token=++epoch;
  const record={...captured,promise:null};current=record;
  record.promise=Promise.resolve().then(()=>{
   if(!captured.key)return {status:'no-chat',key:null};
   const assertCurrent=()=>{if(disposed||epoch!==token||!same(captured,snapshot()))throw stale();};
   assertCurrent();return ensureBound({assertCurrent});
  });
  return record.promise;
 }
 function start(){
  startup??=Promise.resolve().then(()=>activatePreset()).then(receipt=>{if(receipt?.active!==true)throw Error('Tisya 预设尚未选中，自动接入未开始');return receipt;}).catch(error=>{startupError=error;throw error;});
  return startup.then(()=>open());
 }
 async function chatChanged(){if(!startup)return start();await startup;return open();}
 async function ready(){
  const result=await chatChanged();
  if(result?.key&&getContext().chatMetadata?.[NS]?.enabled!==true)throw Object.assign(Error('当前聊天的新引擎已停用；重新打开聊天后默认启用'),{code:'ENGINE_DISABLED'});
  return result;
 }
 return {start,chatChanged,ready,retry:async()=>{if(startupError){startup=null;startupError=null;epoch++;current=null;return start();}if(!startup)return start();await startup;return open({retry:true});},dispose(){disposed=true;epoch++;current=null;},state:()=>({started:!!startup,key:current?.key??null,disposed})};
}
