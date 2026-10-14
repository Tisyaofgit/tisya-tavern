import {createSseParser,sseData,transformSse} from '../vendor/vertex-transport/wire.mjs';
import {inspectCompletion} from '../vendor/vertex-transport/completion-integrity.mjs';
import {restoreAntiTruncationCompletion} from '../vendor/vertex-transport/anti-truncation.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nativeReason=v=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(v)?v:null;
export function transportFailure(value){
 const code=typeof value==='string'&&/^[a-zA-Z0-9_]{1,100}$/.test(value)?value:'read';
 let message='正文传输失败，已显示片段未作为完整结果归档';
 if(/length|MAX_TOKENS/i.test(code))message='输出达到长度上限，回复不完整';
 else if(/filter|SAFETY|block/i.test(code))message='上游拦截了输出，未取得完整回复';
 else if(/TIMEOUT|timeout/i.test(code))message='正文传输超时，未自动重试';
 else if(/HTTP/i.test(code))message='上游 HTTP 请求失败，未自动重试';
 else if(/not_restored/i.test(code))message='服务商没有按正文工具格式返回，抗截断未生效';
 else if(/content_type/i.test(code))message='流式请求未收到 SSE 响应，请核对接口支持';
 else if(/empty/i.test(code))message='上游未返回可用正文';
 else if(/incomplete|interrupted|missing_finish/i.test(code))message='回复中途结束，缺少完整完成信息；已显示片段未作为完整结果归档';
 else if(/data_after|duplicate_finish/i.test(code))message='完成信息之后仍有异常数据，回复未被接纳';
 else if(/invalid|malformed/i.test(code))message='上游响应格式损坏，回复未被接纳';
 return Object.assign(new Error(message),{code:code.startsWith('TISYA_')?code:'TISYA_TRANSPORT_'+code.toUpperCase()});
}

// Count wire bytes and fixed terminal metadata only. Never retain response text
// or endpoint/credential values in diagnostics. Fatal UTF-8 avoids silent repair.
export function observeResponse(response,status,now){
 const decoder=new TextDecoder('utf-8',{fatal:true});
 const parser=/text\/event-stream/i.test(response.headers.get('content-type')??'')?createSseParser(({data})=>{
  if(!data)return;status.receivedEvents=(status.receivedEvents??0)+1;
  if(data.trim()==='[DONE]'){status.sawDone=true;return;}
  let p;try{p=JSON.parse(data);}catch{return;}
  if(p.choices?.length>1||p.choices?.some(x=>x.index!==undefined&&x.index!==0)||p.candidates?.length>1)throw transportFailure('invalid_multiple_candidates');
  if(Number.isInteger(p.error?.code))status.upstreamStatus=p.error.code;
  const hostText=p.candidates?.[0]?.content?.parts?.map(x=>x.text??'').join('')??'';
  if(/^\[API (?:Error|错误)\]/.test(hostText)&&/endpoint failed|HTTP \d{3}/.test(hostText)){status.hostError=true;const http=hostText.match(/(?:status|HTTP)\s+(\d{3})/);if(http)status.upstreamStatus=Number(http[1]);throw transportFailure('upstream_stream_error');}
  const reason=nativeReason(p.candidates?.[0]?.finishReason??p.promptFeedback?.blockReason);
  if(reason)status.nativeFinishReason=reason;
  const finish=p.choices?.[0]?.finish_reason;
  if(typeof finish==='string'&&/^[a-z_]{1,40}$/.test(finish))status.finishReason=finish;
 }):null;
 status.receivedBytes=0;status.receivedEvents=0;
 return new Response(response.body.pipeThrough(new TransformStream({
  transform(chunk,c){
   decoder.decode(chunk,{stream:true});status.receivedBytes+=chunk.byteLength;status.lastByteAt=now();
   if(status.receivedBytes>32*1024*1024)throw transportFailure('output_limit');
   parser?.push(chunk);c.enqueue(chunk);
  },flush(){decoder.decode();parser?.finish();},
 })),{status:response.status,headers:response.headers});
}

const mapReason=reason=>reason==='STOP'?'stop':reason==='MAX_TOKENS'?'length':/SAFETY|RECITATION|BLOCKLIST|PROHIBITED|SPII|IMAGE_SAFETY/.test(reason??'')?'content_filter':'invalid';

// Inspect native Gemini text without losing signatures or opaque metadata on
// the main-chat path. The original event is carried locally through validation.
export function geminiTextStream(response,status,{allowTools=false}={}){
 let terminal=false,done=false,toolIndex=0,hasTools=false;
 return transformSse(response,({data,event},emit)=>{
  if(!data){if(event==='error')throw transportFailure('upstream_stream_error');return;}
  if(done)throw transportFailure('data_after_done');
  if(data.trim()==='[DONE]'){done=true;return;}
  let p;try{p=JSON.parse(data);}catch{throw transportFailure('invalid_sse_json');}
  if(!object(p)||p.error||event==='error')throw transportFailure('upstream_stream_error');
  if(p.candidates!==undefined&&(!Array.isArray(p.candidates)||p.candidates.length>1))throw transportFailure('invalid_candidates');
  const c=p.candidates?.[0];if(c!==undefined&&(!object(c)||(c.index!==undefined&&c.index!==0)))throw transportFailure('invalid_candidate');
  const parts=c?.content?.parts??[];if(!Array.isArray(parts)||parts.some(x=>!object(x)||(!allowTools&&(x.functionCall||x.functionResponse))||x.inlineData||x.fileData))throw transportFailure('unexpected_content');
  let content='',reasoning='';for(const part of parts){if(part.text!==undefined&&typeof part.text!=='string')throw transportFailure('invalid_text');if(part.thought)reasoning+=part.text??'';else content+=part.text??'';}
  const calls=[];
  for(const part of parts)if(part.functionCall){const f=part.functionCall;if(typeof f.name!=='string'||!f.name||!object(f.args)||f.partialArgs||f.willContinue)throw transportFailure('invalid_tool_arguments');calls.push({index:toolIndex++,id:f.id,type:'function',function:{name:f.name,arguments:JSON.stringify(f.args)}});}
  hasTools ||= calls.length>0;
  const reason=c?.finishReason??p.promptFeedback?.blockReason;
  if(terminal&&(content||reasoning||calls.length||reason))throw transportFailure('data_after_finish');
  if(reason!==undefined){status.nativeFinishReason=nativeReason(reason);terminal=true;}
  // Tauri may append choices[].delta.native as history metadata after STOP.
  if(p.choices?.some(x=>x.delta?.content||x.delta?.tool_calls||x.finish_reason))throw transportFailure('invalid_native_envelope');
  const choices=c||reason!==undefined?[{index:0,delta:{...(content?{content}:{}),...(reasoning?{reasoning_content:reasoning}:{}),...(calls.length?{tool_calls:calls}:{})},...(reason!==undefined?{finish_reason:reason==='STOP'&&hasTools?'tool_calls':mapReason(reason),native_finish_reason:nativeReason(reason)}:{})}]:[];
  emit(sseData({choices,tisyaNativeFrame:p}));
 },emit=>{if(!terminal)throw transportFailure('missing_finish_reason');emit(sseData('[DONE]'));});
}

function normalizeGemini(value,status){
 if(value.promptFeedback?.blockReason)throw transportFailure('filtered');
 if(Array.isArray(value.choices)){
  // The host projects non-streaming Gemini responses into choices, sometimes
  // discarding the native finish code. Report that limit instead of inventing STOP.
  status.completionEvidence='host-normalized';return value;
 }
 if(!Array.isArray(value.candidates)||value.candidates.length!==1)throw transportFailure('invalid_candidates');
 const c=value.candidates[0],reason=c.finishReason;
 if(typeof reason!=='string')throw transportFailure('missing_finish_reason');
 status.nativeFinishReason=nativeReason(reason);status.completionEvidence='native';
 const parts=c.content?.parts;if(!Array.isArray(parts))throw transportFailure('invalid_parts');
 const message={role:'assistant',content:''},calls=[];
 for(const part of parts){
  if(!object(part))throw transportFailure('invalid_part');
  if(part.functionCall){const f=part.functionCall;if(typeof f.name!=='string'||!f.name||!object(f.args)||f.partialArgs||f.willContinue)throw transportFailure('invalid_tool_arguments');calls.push({id:f.id??'text_transport',type:'function',function:{name:f.name,arguments:JSON.stringify(f.args)}});}
  else if(typeof part.text==='string'){if(part.thought)message.reasoning_content=(message.reasoning_content??'')+part.text;else message.content+=part.text;}
  else if(part.inlineData||part.fileData)throw transportFailure('unexpected_content');
 }
 if(calls.length)message.tool_calls=calls;
 return {choices:[{index:0,message,finish_reason:reason==='STOP'&&calls.length?'tool_calls':mapReason(reason),native_finish_reason:nativeReason(reason)}],responseContent:c.content,usageMetadata:value.usageMetadata};
}

export async function bufferedResponse(response,plan,status,{signal,guard,limit}){
 if(/text\/event-stream/i.test(response.headers.get('content-type')??''))throw transportFailure('invalid_buffered_response');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let raw='',size=0,rejectAbort;
 const interrupted=new Promise((_,reject)=>{rejectAbort=reject;});interrupted.catch(()=>{});
 const abort=()=>{rejectAbort(signal.reason??transportFailure('cancelled'));reader.cancel(signal.reason).catch(()=>{});};
 signal.addEventListener('abort',abort,{once:true});
 try{
  for(;;){guard();signal.throwIfAborted();const r=await Promise.race([reader.read(),interrupted]);guard();signal.throwIfAborted();if(r.done)break;size+=r.value.byteLength;if(size>limit)throw transportFailure('output_limit');raw+=decoder.decode(r.value,{stream:true});}
  raw+=decoder.decode();let value;try{value=JSON.parse(raw);}catch{throw transportFailure('invalid_json');}
  if(Number.isInteger(value?.error?.code))status.upstreamStatus=value.error.code;
  if(!object(value)||value.error)throw transportFailure('upstream_error');
  const original=value;
  if(plan.protocol==='gemini')value=normalizeGemini(value,status);else status.completionEvidence='provider';
  if(!Array.isArray(value.choices)||value.choices.length!==1)throw transportFailure('invalid_choices');
  const before=inspectCompletion(value);Object.assign(status,{finishReason:before.integrity.finishReason});
  if(!before.valid)throw transportFailure(before.reason);
  if(['length','content_filter'].includes(before.integrity.outcome))throw transportFailure(before.integrity.outcome==='length'?'length':'filtered');
  if(plan.toolName){value=restoreAntiTruncationCompletion(value,plan.toolName);status.restored=value.router_anti_truncation?.restored===true;if(!status.restored)throw transportFailure('not_restored');}
  const checked=inspectCompletion(value),toolTurn=plan.allowTools&&checked.integrity.outcome==='tool_calls';if(!checked.valid||checked.integrity.outcome!=='complete'&&!toolTurn)throw transportFailure(checked.reason??'unexpected_tools');
  const message=value.choices[0].message;
  if(!toolTurn&&(typeof message.content!=='string'||!message.content.trim()))throw transportFailure('empty_completion');
  if(plan.toolName){
   // A synthetic function is never persisted as an executable/native tool turn.
   delete message.native;delete message.function_call;
   if(plan.protocol==='gemini')value.responseContent={role:'model',parts:[...(message.reasoning_content?[{thought:true,text:message.reasoning_content}]:[]),{text:message.content}]};
  }
  Object.assign(status,{outcome:checked.integrity.outcome,toolTurn:!!toolTurn,finishReason:checked.integrity.finishReason});
  return new Response(JSON.stringify(plan.mode==='verify-tools'?original:value),{headers:{'content-type':'application/json'}});
 }finally{signal.removeEventListener('abort',abort);reader.cancel().catch(()=>{});reader.releaseLock();}
}
