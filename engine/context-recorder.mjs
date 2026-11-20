import {clone,fail} from './common.mjs';

const OBSERVATION_KIND='matrix-main';
const SENSITIVE=/^(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret(?:[-_]?id)?|password|proxy_password|credentials?)$/i;

// Request diagnostics stay in memory and contain no connection credential values.
// The payload's messages, tools and generation parameters remain complete.
export function sanitizeContextValue(value){
 if(Array.isArray(value))return value.map(sanitizeContextValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,SENSITIVE.test(key)?'[已隐藏敏感字段]':sanitizeContextValue(item)]));
 return value;
}

function parametersOf(payload){
 return sanitizeContextValue(Object.fromEntries(Object.entries(payload).filter(([key])=>!['messages','tools'].includes(key))));
}

export function createMatrixContextRecorder({getKey,transport=null,now=()=>new Date()}={}){
 const snapshots=[];
 const current=()=>snapshots.filter(row=>row.session===getKey());
 function capture(payload,session=getKey()){
 if(!Array.isArray(payload?.messages))fail('CONTEXT_RECORD_MESSAGES','上下文记录缺少完整消息列表');
 const at=now().toISOString(),expectedMessages=clone(payload.messages),expectedTools=clone(payload.tools??[]),snapshot={
  at,session,world:session,task:'main',contextOwner:'matrix',observedOnly:true,
  dispatch:{stage:'assembled',at,observation:'pending'},
  messages:sanitizeContextValue(expectedMessages),tools:sanitizeContextValue(expectedTools),
  parameters:parametersOf(payload),
 };
 const observed=transport?.observeRequest?.(payload,{kind:OBSERVATION_KIND,match:body=>
  JSON.stringify(body.messages??[])===JSON.stringify(expectedMessages)
  &&JSON.stringify(body.tools??[])===JSON.stringify(expectedTools),
 notify:update=>{
  if(!snapshots.includes(snapshot)||snapshot.session!==getKey())return;
  snapshot.dispatch={stage:update.stage,at:update.at,observation:'read-back'};
  snapshot.messages=sanitizeContextValue(clone(update.messages??[]));
  snapshot.tools=sanitizeContextValue(clone(update.tools??[]));
  if(update.parameters)snapshot.parameters=sanitizeContextValue(clone(update.parameters));
  snapshot.hostFetch={messageCount:snapshot.messages.length,toolCount:snapshot.tools.length};
 },});
 if(observed!==true)snapshot.dispatch.observation='unavailable';
 snapshots.push(snapshot);
 const same=current();if(same.length>10)snapshots.splice(snapshots.indexOf(same[0]),1);
 return snapshot;
 }
 return {
  capture,
  preview:()=>clone(current().at(-1)??null),
  snapshots:()=>clone(current()),
  invalidate:()=>transport?.invalidate?.(OBSERVATION_KIND),
 };
}
