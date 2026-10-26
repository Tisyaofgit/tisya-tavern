import {archiveToolDefinitions} from '../tables/archive-tools.js';
import {archiveProposalToolDefinition} from '../tables/archive-proposal.js';
import {readToolResponse,safeDiagnostic} from './stream-response.js';
const copy=structuredClone,object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail(code,message){const e=Error(message);e.code=code;throw e;}
// Owns dispatch. Never delegates model-selected names to the native global registry.
export async function runArchiveToolLoop(options){
 const {signal,timeoutMs=300000}=options;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>900000)fail('TISYA_TOOL_POLICY','工具循环超时配置无效');
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason??Error('工具循环已取消'));
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{const e=Error('档案工具循环达到时间上限，已取消自身请求；没有自动重试');e.code='TISYA_TOOL_TIMEOUT';controller.abort(e);},timeoutMs);
 let stop;const canceled=new Promise((_,reject)=>{stop=()=>reject(controller.signal.reason);if(controller.signal.aborted)stop();else controller.signal.addEventListener('abort',stop,{once:true});});
 // The host bridge may not cancel a read already in flight. Return promptly,
 // while fresh() prevents that read from starting any later tool/request.
 try{return await Promise.race([runLoop({...options,signal:controller.signal,send:(messages,tools,round)=>options.send(messages,tools,round,{signal:controller.signal})}),canceled]);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',stop);}
}
async function runLoop({messages,session,send,guard,signal,onProgress,onRound=()=>{},maxRounds=5,maxCalls=24,includeReasoning=false,mode='read'}){
 if(!session||typeof session.assertFresh!=='function'||typeof send!=='function'||typeof guard!=='function'||!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>17||!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>136)fail('TISYA_TOOL_POLICY','工具循环缺少明确的会话、权限或预算');
 if(!['read','archive-proposal'].includes(mode)||mode==='archive-proposal'&&(session.context?.task!=='tableArchive'||typeof session.propose_archive_change!=='function'))fail('TISYA_TOOL_POLICY','归档草案工具缺少独立任务授权');
 const definitions=[...archiveToolDefinitions(),...(mode==='archive-proposal'?[archiveProposalToolDefinition()]:[])],allowed=new Map(definitions.map(d=>[d.name,d])),tools=definitions.map(({method,displayName,...definition})=>({type:'function',function:copy(definition)}));
 const transcript=copy(messages),seenIds=new Set();let calls=0;
 const fresh=async()=>{signal?.throwIfAborted();await guard();await session.assertFresh();signal?.throwIfAborted();};
 for(let round=0;round<=maxRounds;round++){
  await fresh();const advertised=round<maxRounds&&calls<maxCalls?tools:[];
  const response=await send(copy(transcript),{tools:copy(advertised),tool_choice:advertised.length?'auto':'none'},round);let result;
  try{await fresh();result=await readToolResponse(response,{signal,onProgress});await fresh();}catch(error){try{await response?.body?.cancel?.();}catch{}throw error;}
  if(!result.toolCalls.length){await onRound({round,status:'complete',calls:[],content:result.content,requests:round+1,totalCalls:calls});await fresh();return result.content;}
  if(!advertised.length)fail('TISYA_TOOL_LIMIT','工具调用达到本轮上限，模型仍请求工具；未执行或自动重试');
  if(calls+result.toolCalls.length>maxCalls)fail('TISYA_TOOL_LIMIT','工具调用批次超出本轮次数预算，整批未执行');
  // Preflight every name, ID and JSON object before any operation in this batch.
  const prepared=result.toolCalls.map(call=>{
   const def=allowed.get(call.function.name);if(!def||typeof session[def.method]!=='function')fail('TISYA_TOOL_NOT_ALLOWED','模型请求了本轮未授权的工具，整批未执行');
   if(seenIds.has(call.id))fail('TISYA_TOOL_DUPLICATE','工具调用ID已经执行过，未重放');
   let input;try{input=JSON.parse(call.function.arguments);}catch{fail('TISYA_TOOL_ARGUMENTS','工具参数不是完整JSON，整批未执行');}
   if(!object(input))fail('TISYA_TOOL_ARGUMENTS','工具参数必须是对象，整批未执行');return {call,def,input};
  });
  const assistant=copy(result.assistant);if(!includeReasoning)delete assistant.reasoning_content;
  const execute=async({call,def,input})=>{
   await fresh();seenIds.add(call.id);calls++;let value;
   try{value=await session[def.method](copy(input));}
   catch(error){
    // Only bounded query errors are model-repairable. Staleness, cancellation,
    // total budget and host failures end the run without another paid request.
    // A rejected oversized page returns no data and may be narrowed within limits.
    if(!['INVALID_QUERY','INVALID_PATH','INVALID_FIELD','UNSUPPORTED_QUERY','NOT_AVAILABLE','SOURCE_UNAVAILABLE','INVALID_CURSOR','QUERY_TOO_LARGE',...(mode==='archive-proposal'?['INVALID_PROPOSAL']:[])].includes(error.code))throw error;
    value={status:'error',code:error.code,message:safeDiagnostic(error.message)};
   }
   await fresh();return {id:call.id,name:call.function.name,arguments:copy(input),result:copy(value)};
  };
  let receipts;
  if(prepared.every(({def})=>def.method!=='propose_archive_change')){
   const settled=await Promise.allSettled(prepared.map(execute));
   const failed=settled.find(item=>item.status==='rejected');if(failed)throw failed.reason;
   receipts=settled.map(item=>item.value);
  }else{receipts=[];for(const item of prepared)receipts.push(await execute(item));}
  await fresh();transcript.push(assistant,...receipts.map(r=>({role:'tool',tool_call_id:r.id,name:r.name,content:JSON.stringify(r.result)})));
  await onRound({round,status:'tools',calls:receipts,requests:round+1,totalCalls:calls});await fresh();
 }
 fail('TISYA_TOOL_LIMIT','工具循环已结束');
}
