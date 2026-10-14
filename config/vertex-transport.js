// Text-only transport adapter. Core streaming recognizers are MIT-licensed;
// exact upstream identity and notices live in vendor/vertex-transport.
import {prepareAntiTruncation,wrapAntiTruncationStream} from '../vendor/vertex-transport/anti-truncation.mjs';
import {nativeRequestBody} from '../vendor/vertex-transport/vertex-native.mjs';
import {wrapNativeTextStream} from '../vendor/vertex-transport/vertex-text-stream.mjs';
import {guardCompletionStream} from '../vendor/vertex-transport/completion-integrity.mjs';
import {validateGemini4Output} from '../vendor/vertex-transport/gemini4.mjs';
import {createSseParser,sseData,transformSse} from '../vendor/vertex-transport/wire.mjs';

export const TRANSPORT_MODES=[['off','关闭'],['vertex-streaming','Vertex 流式抗截断']];
const PATH='/api/backends/chat-completions/generate',OWNER=Symbol.for('tisya.vertex-transport'),OTHER=Symbol.for('vertex-anti-truncation.fetch');
const LIMIT=8*1024*1024,OUTPUT_LIMIT=32*1024*1024;
const bytes=value=>new TextEncoder().encode(value).length;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const problem=(code,message)=>Object.assign(new Error(message),{code});
const reasonLabels={off:'关闭',provider:'当前连接不是原生 Vertex',proxy:'代理连接未接入',model:'此模型尚未列入参数流适用范围',tools:'本次带有工具调用',history:'本次含工具历史',schema:'本次使用结构化输出',candidates:'本次请求多个候选',search:'本次使用搜索',media:'本期仅处理纯文字请求',parameters:'附加请求参数不适用',size:'包装后请求超过本功能大小限制',host:'当前宿主不是 TauriTavern'};
export const transportReason=reason=>reasonLabels[reason]??reason;

export function prepareVertexTransport(payload,mode,{isTauri=true}={}){
 if(!TRANSPORT_MODES.some(([id])=>id===mode))throw problem('TISYA_TRANSPORT_MODE','抗截断配置无效');
 const skip=reason=>({payload,audit:{mode,state:mode==='off'?'off':'bypassed',reason,label:transportReason(reason)}});
 if(mode==='off')return skip('off');
 if(!isTauri)return skip('host');
 if(payload.chat_completion_source!=='vertexai')return skip('provider');
 if(payload.reverse_proxy)return skip('proxy');
 if(!/^gemini-[34](?:[.\w-]*)$/.test(payload.model??'')||/flash-lite|image|embedding/i.test(payload.model))return skip('model');
 if(payload.tools?.length||payload.functions?.length||payload.tool_choice!=null||payload.function_call!=null)return skip('tools');
 if(payload.json_schema||payload.responseSchema||payload.responseMimeType&&payload.responseMimeType!=='text/plain'||payload.response_format&&payload.response_format.type!=='text')return skip('schema');
 if(payload.n!=null&&payload.n!==1||payload.best_of!=null&&payload.best_of!==1)return skip('candidates');
 if(payload.enable_web_search)return skip('search');
 if(!Array.isArray(payload.messages)||!payload.messages.length)throw problem('TISYA_TRANSPORT_MESSAGES','抗截断请求缺少消息');
 if(payload.messages.some(m=>m.role==='tool'||m.role==='function'||m.tool_calls?.length||m.function_call||m.tool_call_id))return skip('history');
 if(payload.request_images||payload.messages.some(m=>!['system','developer','user','assistant'].includes(m.role)||typeof m.content!=='string'&&!(Array.isArray(m.content)&&m.content.every(p=>p?.type==='text'&&typeof p.text==='string'))))return skip('media');
 let included={};
 try{if(payload.custom_include_body)included=typeof payload.custom_include_body==='string'?JSON.parse(payload.custom_include_body):structuredClone(payload.custom_include_body);}catch{return skip('parameters');}
 if(!object(included)||payload.custom_exclude_body&&String(payload.custom_exclude_body).trim()||Object.keys(included).some(k=>/^(tools?|toolConfig|tool_choice|functions?|function_call|contents?|messages?|systemInstruction|cachedContent)$/i.test(k))||included.generationConfig?.responseSchema||included.generationConfig?.responseMimeType&&included.generationConfig.responseMimeType!=='text/plain')return skip('parameters');
 validateGemini4Output(payload,payload.model,true);
 const continuation=payload.type==='continue',prepared=prepareAntiTruncation({messages:payload.messages},true,false,{continuation});
 const native=nativeRequestBody({...prepared.payload,messages:[]});
 // Native parameter streaming is used even when the client wants a buffered reply.
 native.toolConfig.functionCallingConfig.streamFunctionCallArguments=true;
 const wire={...payload,messages:prepared.payload.messages,stream:true,custom_include_body:JSON.stringify({...included,tools:native.tools,toolConfig:native.toolConfig})};
 if(bytes(JSON.stringify(wire))>LIMIT)return skip('size');
 return {payload:wire,plan:{toolName:prepared.toolName,model:payload.model,stream:payload.stream===true,continuation},
  audit:{mode,state:'prepared',label:'已准备抗截断传输',continuation,clientStream:payload.stream===true,upstreamStream:true,nativeTools:structuredClone(native.tools),toolConfig:structuredClone(native.toolConfig)}};
}

// The host must not commit a truncated reply merely because it saw a finish
// frame. Release terminal frames only after the complete upstream is verified.
function verifiedStream(response,{guard,signal,status,onComplete,onFailure}){
 let integrity,restored=null,held=[],heldBytes=0,total=0,terminal=false,controller,reader,settled=false,emitted=0;
 const checked=guardCompletionStream(response,meta=>{integrity=meta;},null,OUTPUT_LIMIT);
 reader=checked.body.getReader();const encoder=new TextEncoder();
 const parser=createSseParser(({raw,data})=>{
  if(!data)return;
  if(data.trim()==='[DONE]')terminal=true;
  else {const p=JSON.parse(data);if(p.router_anti_truncation)restored=p.router_anti_truncation.restored===true;if(p.choices?.some(c=>c.finish_reason!=null))terminal=true;}
  const frame=encoder.encode(raw+'\n\n');total+=frame.length;if(total>OUTPUT_LIMIT)throw problem('TISYA_TRANSPORT_OUTPUT_LIMIT','抗截断输出超过本地读取限制');
  if(terminal){heldBytes+=frame.length;if(heldBytes>LIMIT)throw problem('TISYA_TRANSPORT_TAIL_LIMIT','抗截断结束信息过大');held.push(frame);}else {controller.enqueue(frame);emitted++;}
 });
 const finish=()=>{signal?.removeEventListener('abort',abort);};
 const abort=()=>{if(settled)return;settled=true;finish();reader.cancel(signal.reason).catch(()=>{});onFailure(signal.reason??problem('TISYA_TRANSPORT_ABORTED','抗截断读取已取消'),'cancelled');try{controller.error(signal.reason??new DOMException('Aborted','AbortError'));}catch{}};
 return new Response(new ReadableStream({
  start(c){controller=c;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();},
  async pull(c){if(settled)return;try{const before=emitted;while(!settled&&emitted===before){
   guard();signal?.throwIfAborted();const part=await reader.read();if(settled)return;guard();signal?.throwIfAborted();
   if(!part.done){parser.push(part.value);continue;}
   parser.finish();if(!integrity?.streamDone)throw problem('TISYA_TRANSPORT_INCOMPLETE','抗截断流缺少完整结束信息');
   Object.assign(status,{outcome:integrity.outcome,finishReason:integrity.finishReason,nativeFinishReason:integrity.nativeFinishReason,restored});
   if(integrity.outcome!=='complete')throw problem('TISYA_TRANSPORT_INCOMPLETE','抗截断输出未完整结束');
   settled=true;finish();Object.assign(status,{state:'complete',label:'本次完整结束'});
   onComplete();for(const frame of held)c.enqueue(frame);c.close();}
  }catch(e){if(settled)return;settled=true;finish();reader.cancel(e).catch(()=>{});onFailure(e,signal?.aborted?'cancelled':'error');c.error(e);}},
  cancel(reason){if(!settled){settled=true;finish();onFailure(reason??problem('TISYA_TRANSPORT_CANCELLED','抗截断读取提前结束'),'cancelled');}return reader.cancel(reason);},
 }),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}

function nativeStream(response,getUsage){
 const reasons={stop:'STOP',length:'MAX_TOKENS',content_filter:'SAFETY'};
 return transformSse(response,({data},emit)=>{if(!data)return;if(data.trim()==='[DONE]')return emit(sseData('[DONE]'));const p=JSON.parse(data);if(p.error)return emit(sseData(p));
  const out={candidates:(p.choices??[]).map(c=>{if(c.delta?.tool_calls?.length)throw problem('TISYA_TRANSPORT_TOOL','文本传输出现意外工具');const parts=[];if(c.delta?.reasoning_content)parts.push({thought:true,text:c.delta.reasoning_content});if(c.delta?.content)parts.push({text:c.delta.content});return {index:c.index??0,content:{role:'model',parts},...(c.finish_reason!=null?{finishReason:c.native_finish_reason??reasons[c.finish_reason]??'OTHER'}:{})};})};
  if(p.usage){out.usage=p.usage;out.usageMetadata=getUsage();}if(p.router_anti_truncation)out.vertexAntiTruncation=p.router_anti_truncation;emit(sseData(out));
 });
}
async function bufferedCompletion(response,plan,getUsage){
 const message={role:'assistant',content:''};let ending,usage,metadata;
 const parser=createSseParser(({data})=>{if(!data||data.trim()==='[DONE]')return;const p=JSON.parse(data);for(const c of p.choices??[]){if(c.delta?.content)message.content+=c.delta.content;if(c.delta?.reasoning_content)message.reasoning_content=(message.reasoning_content??'')+c.delta.reasoning_content;if(c.finish_reason!=null)ending={finish_reason:c.finish_reason,native_finish_reason:c.native_finish_reason};}if(p.usage)usage=p.usage;if(p.router_anti_truncation)metadata=p.router_anti_truncation;});
 const reader=response.body.getReader();try{for(;;){const r=await reader.read();if(r.done)break;parser.push(r.value);}parser.finish();}finally{reader.releaseLock();}
 const parts=[];if(message.reasoning_content)parts.push({thought:true,text:message.reasoning_content});if(message.content)parts.push({text:message.content});
 return new Response(JSON.stringify({object:'chat.completion',model:plan.model,choices:[{index:0,message,...ending}],usage,responseContent:{role:'model',parts},usageMetadata:getUsage(),vertexAntiTruncation:metadata}),{headers:{'content-type':'application/json'}});
}
function errorEvents(response,signal){
 const reader=response.body.getReader();return new Response(new ReadableStream({async pull(c){try{const r=await reader.read();r.done?c.close():c.enqueue(r.value);}catch(e){if(signal.aborted)return c.error(e);c.enqueue(new TextEncoder().encode(sseData({error:{code:typeof e?.code==='string'&&/^[a-zA-Z0-9_]+$/.test(e.code)?e.code:'TISYA_TRANSPORT_FAILED',message:'抗截断传输未完整结束，结果未被接纳。'}})));c.close();}},cancel:r=>reader.cancel(r)}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}

export function createVertexTransport({target=globalThis,isTauri=()=>!!target.__TAURITAVERN__,origin=()=>target.location?.origin,timeoutMs=600000,now=()=>Date.now()}={}){
 let original,wrapped,installed=false,disposed=false,last=null;const pending=new Map(),spent=new Set(),active=new Set();
 const publish=(status,notify)=>{last=status;notify?.(structuredClone(status));};
 function assertOwner(){if(!installed||disposed||target.fetch!==wrapped||target[OWNER]!==api)throw problem('TISYA_TRANSPORT_OWNER','请求通道已变化，请停用冲突扩展并重启应用');if(target[OTHER])throw problem('TISYA_TRANSPORT_CONFLICT','检测到社区抗截断扩展；请只启用一个传输实现并重启应用');}
 function prepare(payload,mode){const result=prepareVertexTransport(payload,mode,{isTauri:isTauri()});if(result.plan)assertOwner();return result;}
 function authorize(payload,result,{kind='main',guard=()=>{},notify=()=>{}}={}){
  const status={...result.audit};publish(status,notify);if(!result.plan)return status;assertOwner();guard();
  // Store exact serialization, not only a guessed message id or loose URL match.
  if(pending.size>=8)throw problem('TISYA_TRANSPORT_PENDING','等待发送的抗截断请求过多，请停止旧请求后重试');
  const key=JSON.stringify(payload);if(pending.has(key)||spent.has(result.plan.toolName))throw problem('TISYA_TRANSPORT_DUPLICATE','同一抗截断请求不能重复发送');
  pending.set(key,{plan:result.plan,kind,guard,notify,status,created:now()});return status;
 }
 // Keep only small random identifiers after dispatch, never whole chat bodies.
 function retire(key,entry){pending.delete(key);spent.add(entry.plan.toolName);}
 function invalidate(kind,reason='上下文已变化，抗截断请求已停止'){
  for(const [key,e]of pending)if(!kind||e.kind===kind){retire(key,e);Object.assign(e.status,{state:'cancelled',label:reason});publish(e.status,e.notify);}
  for(const a of active)if(!kind||a.kind===kind)a.controller.abort(problem('TISYA_TRANSPORT_CANCELLED',reason));
 }
 function install(){
  if(installed)return api;if(disposed||target[OWNER])throw problem('TISYA_TRANSPORT_OWNER','抗截断通道已被占用，请重启应用');
  original=target.fetch; if(typeof original!=='function')throw problem('TISYA_TRANSPORT_FETCH','宿主请求接口不可用');
  wrapped=async function(input,init){
   let url;try{url=new URL(typeof input==='string'||input instanceof URL?input:input.url,origin());}catch{return original.call(target,input,init);}
   const method=init?.method??input?.method??'GET';if(url.origin!==origin()||url.pathname!==PATH||method.toUpperCase()!=='POST')return original.call(target,input,init);
   const key=typeof init?.body==='string'?init.body:input instanceof Request&&init?.body==null?await input.clone().text():null;
   const e=pending.get(key);
   if(!e){if(typeof key==='string'&&([...spent].some(name=>key.includes(name))||[...pending.values()].some(p=>key.includes(p.plan.toolName))))throw problem('TISYA_TRANSPORT_UNVERIFIED','抗截断请求已变更或已发送，未再次提交');return original.call(target,input,init);}
   retire(key,e);const controller=new AbortController(),parent=init?.signal??input?.signal;
   const abort=()=>controller.abort(parent.reason);parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
   let timer;const a={kind:e.kind,controller};active.add(a);
   const clean=()=>{clearTimeout(timer);parent?.removeEventListener('abort',abort);active.delete(a);};
   const failed=(error,state='error')=>{Object.assign(e.status,{state,label:state==='cancelled'?'本次已取消':'本次抗截断失败',errorCode:typeof error?.code==='string'&&/^[a-zA-Z0-9_]+$/.test(error.code)?error.code:'TISYA_TRANSPORT_FAILED'});publish(e.status,e.notify);clean();};
   try{
    assertOwner();if(now()-e.created>300000)throw problem('TISYA_TRANSPORT_EXPIRED','抗截断请求已过期，请重新生成');e.guard();controller.signal.throwIfAborted();
    timer=setTimeout(()=>controller.abort(problem('TISYA_TRANSPORT_TIMEOUT','抗截断请求超时')),timeoutMs);
    Object.assign(e.status,{state:'receiving',label:'正在接收抗截断输出',upstreamRequests:1});publish(e.status,e.notify);
    const response=await original.call(target,input,{...init,signal:controller.signal});e.guard();controller.signal.throwIfAborted();
    if(!response.ok){failed(problem('TISYA_TRANSPORT_HTTP','上游请求失败'));return response;}
    if(!response.body)throw problem('TISYA_TRANSPORT_EMPTY','抗截断请求没有响应正文');
    let usage;
    const translated=wrapNativeTextStream(response,e.plan.toolName,e.plan.model,v=>{usage=v;});
    const restored=wrapAntiTruncationStream(translated,e.plan.toolName);
    const checked=verifiedStream(restored,{guard:e.guard,signal:controller.signal,status:e.status,onComplete:()=>{publish(e.status,e.notify);clean();},onFailure:failed});
    if(!e.plan.stream)return await bufferedCompletion(checked,e.plan,()=>usage);
    return errorEvents(e.kind==='main'?nativeStream(checked,()=>usage):checked,controller.signal);
   }catch(error){failed(error,controller.signal.aborted?'cancelled':'error');throw error;}
  };
  target.fetch=wrapped;target[OWNER]=api;installed=true;return api;
 }
 const api={install,prepare,authorize,invalidate,status:()=>last?structuredClone(last):null,dispose(){if(disposed)return;invalidate(null,'抗截断通道已卸载');disposed=true;if(target.fetch===wrapped)target.fetch=original;if(target[OWNER]===api)delete target[OWNER];},pendingCount:()=>pending.size};return api;
}
