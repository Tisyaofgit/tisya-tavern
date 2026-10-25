// Text-output transport adapter; supported media inputs stay host-owned. Core streaming recognizers are MIT-licensed;
// exact upstream identity and notices live in vendor/vertex-transport.
import {prepareAntiTruncation,wrapAntiTruncationStream} from '../vendor/vertex-transport/anti-truncation.mjs';
import {prepareToolTextMode,selectToolTextStream} from './tool-text-mode.js';
import {nativeRequestBody} from '../vendor/vertex-transport/vertex-native.mjs';
import {wrapNativeTextStream} from '../vendor/vertex-transport/vertex-text-stream.mjs';
import {guardCompletionStream} from '../vendor/vertex-transport/completion-integrity.mjs';
import {geminiTextStream,bufferedResponse,observeResponse,transportFailure,hasImageContent} from './transport-response.js';
import {createSseParser,sseData,transformSse} from '../vendor/vertex-transport/wire.mjs';

import {guardNativeProtocolStream} from './native-protocol-guard.js';
import {TRANSPORT_MODES,LEGACY_TRANSPORT_MODES} from './transport-modes.js';
import {prepareUniversalTransport} from './universal-transport.js';
export {TRANSPORT_MODES};
const PATH='/api/backends/chat-completions/generate',OWNER=Symbol.for('tisya.vertex-transport'),OTHER=Symbol.for('vertex-anti-truncation.fetch');
const LIMIT=8*1024*1024,OUTPUT_LIMIT=32*1024*1024;
const bytes=value=>new TextEncoder().encode(value).length;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const problem=(code,message)=>Object.assign(new Error(message),{code});
const reasonLabels={off:'关闭',retired:'旧 Vertex 选项已停用，请重新选择传输模式',provider:'仅支持 OpenAI Chat Completions 和自定义 Gemini generateContent',proxy:'代理连接未接入',tools:'本次带有工具调用',history:'本次含工具或原生回合历史',schema:'本次使用结构化输出',candidates:'本次请求多个候选',search:'本次使用搜索',media:'本次含不支持或格式无效的消息内容',media_output:'本次请求图片／音频输出；当前仅支持文字输出',parameters:'附加请求参数不适用',size:'包装后请求超过本功能大小限制',host:'当前宿主不是 TauriTavern'};
export const transportReason=reason=>reasonLabels[reason]??reason;

// Inspect only known host input shapes. Never rewrite, fetch or decode media.
// media_inlining is an input setting; request_images requests image OUTPUT.
function inputShape(messages){
 const counts={image:0,audio:0,video:0};let unsupported=0;
 const nonempty=v=>typeof v==='string'&&v.length>0;
 for(const m of Array.isArray(messages)?messages:[])if(Array.isArray(m?.content))for(const p of m.content){
  if(!object(p)){unsupported++;continue;}
  if(p.type==='text'){if(typeof p.text!=='string')unsupported++;continue;}
  const kind={image_url:'image',audio_url:'audio',video_url:'video'}[p.type];
  if(kind){const value=p[p.type];if(nonempty(value)||object(value)&&nonempty(value.url))counts[kind]++;else unsupported++;}
  else if(p.type==='input_audio'&&object(p.input_audio)&&nonempty(p.input_audio.data)&&nonempty(p.input_audio.format))counts.audio++;
  else unsupported++;
 }
 return {counts,unsupported};
}

export function prepareTextTransport(payload,mode,{isTauri=true}={}){
 if(mode==='universal')return prepareUniversalTransport(payload,{isTauri});
 if(!LEGACY_TRANSPORT_MODES.includes(mode)&&!TRANSPORT_MODES.some(([id])=>id===mode))throw problem('TISYA_TRANSPORT_MODE','正文传输配置无效');
 const wrapping=mode==='tool-text-tools',compatible=mode==='verify-tools'||wrapping;
 const checking=mode==='verify'||mode==='verify-tools';
 const shape=inputShape(payload.messages),inputMedia=shape.counts,requestImages=payload.request_images===true;
 const skip=reason=>{if(wrapping)throw problem('TISYA_TRANSPORT_WRAP_'+reason.toUpperCase(),'正文工具包装未启用：'+transportReason(reason)+'；请调整设置或明确改选其他传输模式');return {payload,audit:{mode,state:mode==='off'?'off':'bypassed',reason,label:transportReason(reason),requestImages,inputMedia,unsupportedContentParts:shape.unsupported}};};
 if(mode==='off')return skip('off');
 if(mode==='vertex-streaming')return skip('retired');
 if(!isTauri)return skip('host');
 const custom=payload.chat_completion_source==='custom',format=payload.custom_api_format||'openai_compat';
 const protocol=custom&&format==='gemini_generate_content'?'gemini':payload.chat_completion_source==='openai'||custom&&format==='openai_compat'?'openai':null;
 if(!protocol)return skip('provider');
 if(payload.reverse_proxy)return skip('proxy');
 if(!compatible&&(payload.tools?.length||payload.functions?.length||payload.tool_choice!=null||payload.function_call!=null))return skip('tools');
 if(payload.json_schema||payload.responseSchema||payload.responseMimeType&&payload.responseMimeType!=='text/plain'||payload.response_format&&payload.response_format.type!=='text')return skip('schema');
 if(payload.n!=null&&payload.n!==1||payload.best_of!=null&&payload.best_of!==1)return skip('candidates');
 if(payload.enable_web_search&&(!compatible||wrapping))return skip('search');
 if(!Array.isArray(payload.messages)||!payload.messages.length)throw problem('TISYA_TRANSPORT_MESSAGES','正文传输请求缺少消息');
 if(!compatible&&payload.messages.some(m=>m.role==='tool'||m.role==='function'||m.tool_calls?.length||m.function_call||m.tool_call_id||m.native))return skip('history');
 if(payload.request_images&&(!compatible||wrapping))return skip('media_output');
 if(shape.unsupported||payload.messages.some(m=>!object(m)||!(compatible?['system','developer','user','assistant','tool','function']:['system','developer','user','assistant']).includes(m.role)||!(compatible&&m.content==null&&(m.tool_calls?.length||m.function_call))&&typeof m.content!=='string'&&!Array.isArray(m.content)))return skip('media');
 let included={};
 try{if(payload.custom_include_body)included=typeof payload.custom_include_body==='string'?JSON.parse(payload.custom_include_body):structuredClone(payload.custom_include_body);}catch{return skip('parameters');}
 if(included?.modalities?.some?.(x=>x!=='text'&&!(compatible&&!wrapping&&x==='image'))||included?.generationConfig?.responseModalities?.some?.(x=>x!=='TEXT'&&!(compatible&&!wrapping&&x==='IMAGE')))return skip('media_output');
 if(!object(included)||payload.custom_exclude_body&&String(payload.custom_exclude_body).trim()||Object.keys(included).some(k=>!(compatible&&['tools','toolConfig','tool_choice','parallel_tool_calls','functions','function_call'].includes(k))&&/^(tools?|toolConfig|tool_choice|parallel_tool_calls|functions?|function_call|contents?|messages?|systemInstruction|cachedContent|stream|stream_options|n|best_of|response_format|responseSchema|responseMimeType)$/i.test(k))||included.generationConfig?.responseSchema||included.generationConfig?.responseJsonSchema||included.generationConfig?.responseMimeType&&included.generationConfig.responseMimeType!=='text/plain'||included.generationConfig?.candidateCount>1)return skip('parameters');
 const continuation=payload.type==='continue',prepared=prepareAntiTruncation({messages:payload.messages},mode==='tool-text',false,{continuation});
 let toolName=prepared.toolName,realToolNames=[];
 const id=toolName??'tisya_check_'+crypto.randomUUID();
 let wire=structuredClone(payload),native;
 if(mode==='tool-text'){
  wire.messages=prepared.payload.messages;
  if(protocol==='gemini'){
   native=nativeRequestBody({...prepared.payload,messages:[]});
   wire.custom_include_body=JSON.stringify({...included,tools:native.tools,toolConfig:native.toolConfig});
  }else{
   Object.assign(wire,{tools:prepared.payload.tools,tool_choice:prepared.payload.tool_choice,parallel_tool_calls:false});
  }
 }
 if(wrapping){const merged=prepareToolTextMode(payload,included,{continuation});wire=merged.payload;toolName=merged.toolName;realToolNames=merged.realToolNames;}
 if(bytes(JSON.stringify(wire))>LIMIT)return skip('size');
 return {payload:wire,plan:{id:toolName??id,toolName,realToolNames,protocol,model:payload.model,stream:payload.stream===true,continuation,mode,allowTools:compatible,allowImages:compatible&&!wrapping},
  audit:{mode,protocol,requestImages,inputMedia,unsupportedContentParts:shape.unsupported,state:'prepared',label:checking?'已准备完整性检查':'已准备正文抗截断',allowTools:compatible,searchRequested:payload.enable_web_search===true,toolsRequested:!!(payload.tools?.length||payload.functions?.length),protection:checking?'integrity-only':wrapping?'tool-text-tools':'tool-text',continuation,clientStream:payload.stream===true,upstreamStream:payload.stream===true,nativeTools:native?.tools??wire.tools??[],toolConfig:native?.toolConfig??wire.tool_choice??null}};
}

// The host must not commit a truncated reply merely because it saw a finish
// frame. Release terminal frames only after the complete upstream is verified.
function verifiedStream(response,{guard,signal,status,onComplete,onFailure,allowTools=false,allowImages=false}){
 let integrity,restored=null,held=[],heldBytes=0,total=0,terminal=false,controller,reader,settled=false,emitted=0;
 const checked=guardCompletionStream(response,meta=>{integrity=meta;Object.assign(status,{outcome:meta.outcome,finishReason:meta.finishReason,nativeFinishReason:meta.nativeFinishReason});},null,OUTPUT_LIMIT,allowImages?hasImageContent:undefined);
 reader=checked.body.getReader();const encoder=new TextEncoder();
 const parser=createSseParser(({raw,data})=>{
  if(!data)return;
  if(data.trim()==='[DONE]')terminal=true;
  else {const p=JSON.parse(data);for(const c of p.choices??[]){const d=c.delta??c.message;if(typeof d?.content==='string'&&d.content.trim()||Array.isArray(d?.content)&&d.content.some(x=>typeof x?.text==='string'&&x.text.trim()))status.hasText=true;if(allowImages&&hasImageContent(d))status.hasImages=true;}if(p.router_anti_truncation)restored=p.router_anti_truncation.restored===true;if(p.choices?.some(c=>c.finish_reason!=null))terminal=true;}
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
   if(integrity.outcome!=='complete'&&!(allowTools&&integrity.outcome==='tool_calls'))throw transportFailure(integrity.outcome==='length'?'length':integrity.outcome==='content_filter'?'filtered':'incomplete');
   if(['tool-text','tool-text-tools'].includes(status.mode)&&restored!==true&&!(allowTools&&integrity.outcome==='tool_calls'))throw transportFailure('not_restored');
   settled=true;finish();Object.assign(status,{toolTurn:integrity.outcome==='tool_calls',delivery:integrity.outcome==='tool_calls'?'tools':restored?'wrapped':'direct'});
   onComplete();for(const frame of held)c.enqueue(frame);c.close();}
  }catch(e){if(settled)return;settled=true;finish();reader.cancel(e).catch(()=>{});onFailure(e,signal?.aborted?'cancelled':'error');c.error(e);}},
  cancel(reason){if(!settled){settled=true;finish();onFailure(reason??problem('TISYA_TRANSPORT_CANCELLED','抗截断读取提前结束'),'cancelled');}return reader.cancel(reason);},
 }),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}

function nativeStream(response,getUsage){
 const reasons={stop:'STOP',length:'MAX_TOKENS',content_filter:'SAFETY'};
 return transformSse(response,({data},emit)=>{if(!data)return;if(data.trim()==='[DONE]')return emit(sseData('[DONE]'));const p=JSON.parse(data);if(p.error)return emit(sseData(p));
  if(p.tisyaNativeFrame)return emit(sseData(p.tisyaNativeFrame));
  if(p.tisyaNativeMetadata)return emit(sseData(p.tisyaNativeMetadata));
  const out={candidates:(p.choices??[]).map(c=>{if(c.delta?.tool_calls?.length)throw problem('TISYA_TRANSPORT_TOOL','文本传输出现意外工具');const parts=[];if(c.delta?.reasoning_content)parts.push({thought:true,text:c.delta.reasoning_content});if(c.delta?.content)parts.push({text:c.delta.content});return {index:c.index??0,content:{role:'model',parts},...(c.finish_reason!=null?{finishReason:c.native_finish_reason??reasons[c.finish_reason]??'OTHER'}:{})};})};
  if(p.usage){out.usage=p.usage;out.usageMetadata=getUsage();}if(p.router_anti_truncation)out.vertexAntiTruncation=p.router_anti_truncation;emit(sseData(out));
 });
}
function errorEvents(response,signal){
 const reader=response.body.getReader();return new Response(new ReadableStream({async pull(c){try{const r=await reader.read();r.done?c.close():c.enqueue(r.value);}catch(e){if(signal.aborted)return c.error(e);c.enqueue(new TextEncoder().encode(sseData({error:{code:typeof e?.code==='string'&&/^[a-zA-Z0-9_]+$/.test(e.code)?e.code:'TISYA_TRANSPORT_FAILED',message:'抗截断传输未完整结束，结果未被接纳。'}})));c.close();}},cancel:r=>reader.cancel(r)}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}

export function createTextTransport({target=globalThis,isTauri=()=>!!target.__TAURITAVERN__,origin=()=>target.location?.origin,timeoutMs=600000,now=()=>Date.now()}={}){
 let original,wrapped,installed=false,disposed=false,last=null;const pending=new Map(),spent=new Set(),active=new Set();
 const publish=(status,notify)=>{last=status;notify?.(structuredClone(status));};
 function assertOwner({allowOuterFetchWrapper=false}={}){if(!installed||disposed||typeof target.fetch!=='function'||!allowOuterFetchWrapper&&target.fetch!==wrapped||target[OWNER]!==api)throw problem('TISYA_TRANSPORT_OWNER','请求通道已变化，请停用冲突扩展并重启应用');if(target[OTHER])throw problem('TISYA_TRANSPORT_CONFLICT','检测到社区抗截断扩展；请只启用一个传输实现并重启应用');}
 function prepare(payload,mode,{allowOuterFetchWrapper=false}={}){const result=prepareTextTransport(payload,mode,{isTauri:isTauri()});if(result.plan){result.plan.allowOuterFetchWrapper=allowOuterFetchWrapper;assertOwner(result.plan);}return result;}
 function authorize(payload,result,{kind='main',guard=()=>{},notify=()=>{}}={}){
  const status={...result.audit};publish(status,notify);if(!result.plan)return status;assertOwner(result.plan);guard();
  // Store exact serialization, not only a guessed message id or loose URL match.
  if(pending.size>=8)throw problem('TISYA_TRANSPORT_PENDING','等待发送的抗截断请求过多，请停止旧请求后重试');
  const key=JSON.stringify(payload);if(pending.has(key)||spent.has(result.plan.id))throw problem('TISYA_TRANSPORT_DUPLICATE','同一抗截断请求不能重复发送');
  pending.set(key,{plan:result.plan,kind,guard,notify,status,created:now()});return status;
 }
 // Keep only small random identifiers after dispatch, never whole chat bodies.
 function retire(key,entry){pending.delete(key);spent.add(entry.plan.id);}
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
   if(!e){if(typeof key==='string'&&([...spent].some(name=>key.includes(name))||[...pending.values()].some(p=>p.plan.toolName&&key.includes(p.plan.toolName))))throw problem('TISYA_TRANSPORT_UNVERIFIED','抗截断请求已变更或已发送，未再次提交');return original.call(target,input,init);}
   retire(key,e);const controller=new AbortController(),parent=init?.signal??input?.signal;
   const abort=()=>controller.abort(parent.reason);parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
   let timer;const a={kind:e.kind,controller};active.add(a);
   const clean=()=>{clearTimeout(timer);parent?.removeEventListener('abort',abort);active.delete(a);};
   let failureReported=false;
   const failed=(error,state='error')=>{if(failureReported)return;failureReported=true;const detail=transportFailure(error?.code??'read');Object.assign(e.status,{state,label:state==='cancelled'?'本次已取消':detail.message+((e.status.upstreamStatus??e.status.httpStatus)>=400?'（HTTP '+(e.status.upstreamStatus??e.status.httpStatus)+'）':''),errorCode:detail.code,elapsedMs:Math.max(0,now()-(e.started??e.created))});publish(e.status,e.notify);clean();};
   try{
    assertOwner(e.plan);if(now()-e.created>300000)throw problem('TISYA_TRANSPORT_EXPIRED','抗截断请求已过期，请重新生成');e.guard();controller.signal.throwIfAborted();
    e.started=now();timer=setTimeout(()=>controller.abort(problem('TISYA_TRANSPORT_TIMEOUT','抗截断请求超时')),timeoutMs);
    Object.assign(e.status,{state:'receiving',label:'正在接收抗截断输出',upstreamRequests:1});publish(e.status,e.notify);
    const response=await original.call(target,input,{...init,signal:controller.signal});e.guard();controller.signal.throwIfAborted();
    e.status.httpStatus=response.status;if(!response.ok){failed(problem('TISYA_TRANSPORT_HTTP','上游请求失败'));return response;}
    if(!response.body)throw problem('TISYA_TRANSPORT_EMPTY','抗截断请求没有响应正文');
    let observed=observeResponse(response,e.status,now);
    const complete=()=>{Object.assign(e.status,{state:e.status.toolTurn?'tool-handoff':e.status.hasImages&&!e.status.hasText?'media-complete':'complete',label:e.status.toolTurn?'工具调用响应完整，交回酒馆处理；尚非最终正文':e.status.hasImages&&!e.status.hasText?'图片响应完整，交回宿主显示；不作为剧情正文归档':e.status.completionEvidence==='host-normalized'?'宿主报告完成（原始结束原因不可得）':'本次协议完整结束',elapsedMs:Math.max(0,now()-(e.started??e.created))});publish(e.status,e.notify);clean();};
    if(!e.plan.stream){const result=await bufferedResponse(observed,{...e.plan,hostReader:e.kind==='main',allowTools:e.plan.allowTools&&e.kind==='main',allowImages:e.plan.allowImages&&e.kind==='main'},e.status,{signal:controller.signal,guard:e.guard,limit:OUTPUT_LIMIT});e.guard();controller.signal.throwIfAborted();complete();return result;}
    if(!/text\/event-stream/i.test(response.headers.get('content-type')??'')){await observed.body.cancel();throw transportFailure('content_type');}
    let usage,toolName=e.plan.toolName;
    if(e.plan.mode==='tool-text-tools'||e.plan.strategy==='wrapped'){const selected=await selectToolTextStream(observed,e.plan,e.status,{signal:controller.signal,guard:e.guard,limit:OUTPUT_LIMIT});observed=selected.response;if(selected.selected==='real'||e.plan.mode==='universal'&&selected.selected==='none')toolName=null;}
    const translated=['claude','cohere','unknown'].includes(e.plan.protocol)?guardNativeProtocolStream(observed,e.status,e.plan):e.plan.protocol==='gemini'?(toolName?wrapNativeTextStream(observed,toolName,e.plan.model,v=>{usage=v;},true,e.plan.mode==='universal'):geminiTextStream(observed,e.status,{allowTools:e.plan.allowTools&&e.kind==='main',allowImages:e.plan.allowImages&&e.kind==='main'})):observed;
    let restored=toolName?wrapAntiTruncationStream(translated,toolName):translated;
    if((e.plan.mode==='tool-text-tools'||e.plan.mode==='universal')&&toolName&&e.plan.protocol==='openai')restored=transformSse(restored,({data,raw},emit)=>{if(!data||data.trim()==='[DONE]')return emit(raw+'\n\n');const p=JSON.parse(data);for(const c of p.choices??[])if(c.delta)delete c.delta.native;emit(sseData(p));});
    const checked=verifiedStream(restored,{guard:e.guard,signal:controller.signal,status:e.status,onComplete:complete,onFailure:failed,allowTools:e.plan.allowTools&&e.kind==='main',allowImages:e.plan.allowImages&&e.kind==='main'});
    return errorEvents(e.kind==='main'&&['gemini','claude','cohere'].includes(e.plan.protocol)?nativeStream(checked,()=>usage):checked,controller.signal);
   }catch(error){failed(error,controller.signal.aborted?'cancelled':'error');throw error;}
  };
  target.fetch=wrapped;target[OWNER]=api;installed=true;return api;
 }
 const api={install,prepare,authorize,invalidate,status:()=>last?structuredClone(last):null,dispose(){if(disposed)return;invalidate(null,'抗截断通道已卸载');disposed=true;if(target.fetch===wrapped)target.fetch=original;if(target[OWNER]===api)delete target[OWNER];},pendingCount:()=>pending.size};return api;
}
