import {readPublicReplyEnvelope} from './reply-formats.js';
import {prepareNativePanelSource} from './native-panel-source.js';

const registrations=new WeakMap();
const runtimeSelector='iframe,object,embed,.TH-render,.TH-streaming,.xiaobaix-iframe-wrapper,[data-tt-runtime-slot-id],.tt-runtime-placeholder,.tt-runtime-ghost';
const unsafeSelector=runtimeSelector+',pre,textarea,[contenteditable="true"],[aria-busy="true"],.edit_textarea,.reasoning_edit_textarea';
const canonical=text=>String(text??'').replace(/\r\n?/g,'\n').trim();
function contains(root,selector){
 if(root.querySelector(selector))return true;
 return [...root.querySelectorAll('*')].some(node=>node.shadowRoot&&contains(node.shadowRoot,selector));
}
function complete(source){
 if(typeof source!=='string'||source.length>2000000)return false;
 try{readPublicReplyEnvelope(source);return true;}catch{return false;}
}
function contextKey(context){
 if(!Number.isInteger(context?.messageId)||context.messageId<0)return null;
 return JSON.stringify([context.messageId,context.ch_name,!!context.isUser,!!context.isSystem,!!context.isReasoning]);
}

// Both host execution modes use these public synchronous formatter stages.
// Per-message frames support the host's BEFORE-all / AFTER-all batch formatting.
// The public API has no call id: overlapping calls for one message are ambiguous
// (nested and async completion orders differ), so every overlapping ticket is
// invalidated. Keep empty frames until completion; fragments cannot borrow one.
export function installNativePanelFormatting({formatter,document,getMessage,scope=()=>null,enabled=()=>true,project,onError=()=>{},isEager=()=>false,busy=()=>false,updateMessageBlock,requestRender}){
 if(!formatter||typeof formatter.addHook!=='function'||typeof formatter.stage?.BEFORE_REGEX!=='string'||typeof formatter.stage?.AFTER_MARKDOWN!=='string')return Object.freeze({installed:false,repairMissing:async()=>[],state:()=>({installed:false})});
 if(registrations.has(formatter))return registrations.get(formatter);
 let active=true,repairing=false,ticketOverflow=false;
 const pending=new Map(),projecting=new Set(),attempts=new WeakMap(),stats={ambiguousCalls:0,repairAttempts:0,sourcePrepared:0,renderRequests:0,failures:0,lastRecovery:null};
 const report=error=>{stats.failures++;onError(error);};
 const current=ticket=>active&&enabled()&&scope()===ticket.scope&&getMessage(ticket.id)===ticket.message&&ticket.message.mes===ticket.source&&ticket.message.name===ticket.name&&!ticket.message.is_user&&!ticket.message.is_system&&!['user','system','tool'].includes(ticket.message.role)&&(!ticket.message.extra?.display_text||ticket.message.extra.display_text===ticket.source);
 const owns=(node,id,native)=>node.isConnected&&node.parentElement===document.querySelector('#chat')&&node.getAttribute('mesid')===String(id)&&document.querySelectorAll('#chat > .mes[mesid="'+id+'"]').length===1&&node.querySelectorAll('.mes_text').length===1&&node.querySelector('.mes_text')===native;
 function before(text,context){
  const key=contextKey(context);if(key===null)return text;
  if(!active||ticketOverflow)return text;
  let message,nextScope;
  const frames=pending.get(key)??[];
  const frame={ticket:null};
  const nested=frames.length>0||projecting.has(key);
  if(nested){for(const other of frames)other.ticket=null;stats.ambiguousCalls++;}
  frames.push(frame);pending.set(key,frames);
  if(pending.size>1024||frames.length>32){ticketOverflow=true;pending.clear();report(new RangeError('Native panel formatter has too many unfinished calls'));return text;}
  try{
   if(nested||!active||!enabled()||context.isUser||context.isSystem||context.isReasoning)return text;
   nextScope=scope();message=getMessage(context.messageId);
   if(!message||message.is_user||message.is_system||['user','system','tool'].includes(message.role)||message.name!==context.ch_name||text!==message.mes||!complete(text))return text;
   frame.ticket={id:context.messageId,message,source:text,name:message.name,scope:nextScope};
  }catch(error){report(error);}
  return text;
 }
 function after(html,context){
  const key=contextKey(context),frames=pending.get(key),frame=frames?.pop();
  if(frames?.length===0)pending.delete(key);
  if(ticketOverflow||!frame?.ticket)return html;
  try{
   const ticket=frame.ticket;if(!current(ticket))return html;
   projecting.add(key);
   const display=project(ticket.source,ticket.message,ticket.id);
   if(!current(ticket))return html;
   return prepareNativePanelSource(document,html,display);
  }catch(error){report(error);return html;}finally{projecting.delete(key);}
 }
 async function repairMissing(){
  if(repairing||!active||typeof updateMessageBlock!=='function'||typeof requestRender!=='function')return [];
  repairing=true;const results=[];
  try{
   if(!enabled()||!isEager()||busy())return results;
   for(const node of document.querySelectorAll('#chat > .mes[mesid]')){
    if(!enabled()||!isEager()||busy())break;
    const id=Number(node.getAttribute('mesid')),message=Number.isInteger(id)&&id>=0?getMessage(id):null;
    if(!message||message.is_user||message.is_system||['user','system','tool'].includes(message.role)||!complete(message.mes)||!node.isConnected||contains(node,unsafeSelector))continue;
    const native=node.querySelector('.mes_text');if(!native||!owns(node,id,native))continue;
    if(message.extra?.display_text&&message.extra.display_text!==message.mes)continue;
    const ticket={id,message,source:message.mes,name:message.name,scope:scope()},prior=attempts.get(message);
    if(prior?.source===ticket.source&&prior.scope===ticket.scope)continue;
    try{
     const display=project(ticket.source,message,id);
     const prepared=prepareNativePanelSource(document,native.innerHTML,display);
     if(prepared===native.innerHTML)continue;
     const staged=document.createElement('div');staged.innerHTML=prepared;
     const expected=[...staged.querySelectorAll('pre')].map(pre=>canonical((pre.querySelector('code')??pre).textContent));
     if(!expected.length||!current(ticket)||busy()||!isEager()||!owns(node,id,native)||contains(node,unsafeSelector))continue;
     // Set the attempt marker before callbacks: reentrant decoration cannot
     // repeat a refresh, including when the host or helper reports an error.
     attempts.set(message,{source:ticket.source,scope:ticket.scope});stats.repairAttempts++;
     const clone=structuredClone(message);
     if(!current(ticket)||busy()||!isEager()||!owns(node,id,native)||contains(node,unsafeSelector))continue;
     updateMessageBlock(id,clone,{rerenderMessage:true,transient:false});
     if(!current(ticket)||busy()||!isEager()||!owns(node,id,native)||contains(node,runtimeSelector)){
      stats.lastRecovery={messageId:id,status:'changed-before-request'};results.push(stats.lastRecovery);continue;
     }
     const actual=[...native.querySelectorAll('pre')].map(pre=>canonical((pre.querySelector('code')??pre).textContent));
     if(actual.length!==expected.length||actual.some((source,index)=>source!==expected[index])){
      stats.lastRecovery={messageId:id,status:'source-not-prepared'};results.push(stats.lastRecovery);continue;
     }
     stats.sourcePrepared++;
     // Pinned JS-Slash-Runner internal recovery contract, not a public host ABI
     // or a fabricated message update. Never request a live runtime restart.
     await requestRender(id);
     stats.renderRequests++;stats.lastRecovery={messageId:id,status:'render-requested'};results.push(stats.lastRecovery);
    }catch(error){stats.lastRecovery={messageId:id,status:'failed',errorType:error?.name??'Error'};results.push(stats.lastRecovery);report(error);}
   }
  }catch(error){report(error);}finally{repairing=false;}
  return results;
 }
 const handle=Object.freeze({get installed(){return active;},repairMissing,state:()=>({installed:active,pending:pending.size,repairing,ticketOverflow,...stats,lastRecovery:stats.lastRecovery?{...stats.lastRecovery}:null})});
 registrations.set(formatter,handle);
 try{
  formatter.addHook(before,{stage:formatter.stage.BEFORE_REGEX,order:formatter.order?.EARLIEST??0});
  formatter.addHook(after,{stage:formatter.stage.AFTER_MARKDOWN,order:formatter.order?.LATEST??100});
 }catch(error){active=false;pending.clear();report(error);}
 return handle;
}
