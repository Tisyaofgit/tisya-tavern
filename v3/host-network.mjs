import {readTaskResponse} from '../config/stream-response.js';
import {detectNativeProtocol} from '../config/native-protocol-guard.js';
import {markRequestFailureForSettlement} from './request-failure.mjs';

const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
export async function loadNativeBindings(target=globalThis){
 const [script,openai,bookmarks,authorsNote]=await Promise.all([import('/script.js'),import('/scripts/openai.js'),import('/scripts/bookmarks.js'),import('/scripts/authors-note.js')]);
 return {script,openai,bookmarks,authorsNote,fetch:(...args)=>target.fetch(...args)};
}

/** Materialize the native interval/character-note result at its actual anchor. */
export async function prepareNativeAuthorNote({native,getContext,guard}){
 guard();const api=native.authorsNote;
 if(typeof api?.setFloatingPrompt!=='function'||typeof api.NOTE_MODULE_NAME!=='string')fail('V3_AUTHOR_NOTE_UNAVAILABLE','原生作者备注接口不可用');
 await api.setFloatingPrompt();guard();
 const note=getContext().extensionPrompts?.[api.NOTE_MODULE_NAME];
 if(api.shouldWIAddPrompt!==true)return {content:'',role:'system',depth:Number.isSafeInteger(note?.depth)&&note.depth>=0?note.depth:0,position:-1,enabled:false};
 if(!note||typeof note.value!=='string'||![0,1,2].includes(note.position)||!Number.isSafeInteger(note.depth)||note.depth<0)fail('V3_AUTHOR_NOTE_INVALID','原生作者备注锚点无效');
 const role={0:'system',1:'user',2:'assistant'}[note.role];
 if(!role)fail('V3_AUTHOR_NOTE_INVALID','原生作者备注角色无效');
 return {content:note.value,role,depth:note.depth,position:note.position,enabled:true};
}

/** Uses the active host connection settings; never stores credentials in journals. */
export function createNativeRequests({getContext,native,resolveConnection,guard,signal,progress,beforeSend=null,prepareRequest=null}){
 for(const [name,fn]of Object.entries({getContext,resolveConnection,guard,signal}))if(typeof fn!=='function')fail('V3_DEPENDENCY','Missing request binding: '+name);
 if(beforeSend!==null&&typeof beforeSend!=='function')fail('V3_DEPENDENCY','beforeSend must be a function');
 if(typeof native?.openai?.createGenerationParameters!=='function'||typeof native.fetch!=='function')fail('V3_NATIVE_API','Native completion APIs are unavailable');
 return async function request(stage,messages,requestKey){
  let route,payload;
  try{if(!Array.isArray(messages)||!messages.length||messages.some(m=>!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))fail('V3_MESSAGES','Invalid compiled request');
  guard();route=await resolveConnection(stage);guard();
  if(!route?.settings||typeof route.model!=='string'||!route.model)fail('V3_ROUTE','The selected task connection has no model');
  ({generate_data:payload}=await native.openai.createGenerationParameters(structuredClone(route.settings),route.model,'quiet',structuredClone(messages),{allowToolCalls:false,toolData:{}}));
  guard();payload.stream=true;
  if(!Array.isArray(payload.messages)||JSON.stringify(payload.messages.map(({role,content})=>({role,content})))!==JSON.stringify(messages))fail('V3_REQUEST_REWRITE','Host changed the compiled message shape');
  }catch(error){throw markRequestFailureForSettlement(error,{guard,stage,phase:'request-construction'});}
  // Source/storage checkpoint failures never authorize automatic settlement,
  // including when the auxiliary runner catches the same error higher up.
  if(beforeSend)try{await beforeSend({stage,requestKey});guard();}catch(error){if(error&&typeof error==='object')error.workspaceRecoveryUnsafe=true;throw error;}
  let responseDialect,validateResponse=null;try{responseDialect=detectNativeProtocol(payload);if(prepareRequest){const prepared=await prepareRequest(payload,route,{stage,requestKey,guard});guard();responseDialect=prepared?.responseDialect??detectNativeProtocol(payload);validateResponse=prepared?.validateResponse;}}catch(error){throw markRequestFailureForSettlement(error,{guard,stage,phase:'request-construction'});}
  const abortSignal=signal();abortSignal?.throwIfAborted();progress?.({requestKey,phase:stage==='writer'?'writer':'model-a',status:'running'});
  try{const response=await native.fetch('/api/backends/chat-completions/generate',{method:'POST',headers:getContext().getRequestHeaders(),body:JSON.stringify(payload),signal:abortSignal});
  guard();const text=await readTaskResponse(response,{signal:abortSignal,responseDialect,taskLabel:({writer:'正文 API',preflight:'辅助 API（合并）',archive:'辅助 API（归档）',preferences:'辅助 API（偏好）',plan:'辅助 API（推进）',communication:'小缇 API'})[stage]??'任务 API',onProgress:update=>{guard();progress?.({requestKey,phase:stage==='writer'?'writer':'model-a',status:'running',characters:update.characters??update.chars});}});validateResponse?.();return text;
  }catch(error){markRequestFailureForSettlement(error,{guard,stage,phase:'request'});if(error?.preparationSettlementSafe===true)error.runtimeRequestFailed=true;throw error;}
 };
}
