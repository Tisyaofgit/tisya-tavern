import {readResponseText} from './response-reader.js';
import {transportError} from './transport-error.js';
import {classifyToolTurn,hasOutsideToolText,verifyBufferedToolMirrors} from './tool-text-mode.js';
import {createSseParser,sseData,transformSse} from '../vendor/vertex-transport/wire.mjs';
import {inspectCompletion} from '../vendor/vertex-transport/completion-integrity.mjs';
import {restoreAntiTruncationCompletion} from '../vendor/vertex-transport/anti-truncation.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nativeReason=v=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(v)?v:null;
// Image bytes/URLs remain opaque and host-owned; validate the envelope only.
const imageUrl=p=>p?.type==='image_url'&&typeof p.image_url?.url==='string'&&/^(data:image\/|https?:\/\/)/i.test(p.image_url.url);
export function hasImageContent(message){
 const images=message?.images;
 if(images!==undefined&&(!Array.isArray(images)||images.some(p=>!imageUrl(p))))throw transportFailure('invalid_images');
 const parts=Array.isArray(message?.content)?message.content:[];
 if(parts.some(p=>p?.type==='image_url'&&!imageUrl(p)))throw transportFailure('invalid_images');
 return !!images?.length||parts.some(imageUrl);
}
const inlineImage=part=>object(part?.inlineData)&&/^image\/[a-z0-9.+-]+$/i.test(part.inlineData.mimeType??'')&&typeof part.inlineData.data==='string'&&part.inlineData.data.length>0;
const imagePart=part=>({type:'image_url',image_url:{url:`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}});
const hasText=message=>typeof message?.content==='string'?!!message.content.trim():Array.isArray(message?.content)&&message.content.some(p=>typeof p?.text==='string'&&p.text.trim());
export function transportFailure(value){
 const code=typeof value==='string'&&/^[a-zA-Z0-9_]{1,100}$/.test(value)?value:'read';
 let message='正文传输失败，已显示片段未作为完整结果归档';
 if(/length|MAX_TOKENS/i.test(code))message='输出达到长度上限，回复不完整';
 else if(/filter|SAFETY|block/i.test(code))message='上游拦截了输出，未取得完整回复';
 else if(/TIMEOUT|timeout/i.test(code))message='正文传输超时，未自动重试';
 else if(/HTTP/i.test(code))message='上游 HTTP 请求失败，未自动重试';
 else if(/not_restored/i.test(code))message='服务商没有按正文工具格式返回，抗截断未生效';
 else if(/content_type/i.test(code))message='流式请求未收到 SSE 响应，请核对接口支持';
 else if(/empty/i.test(code))message='完整性检查未识别到可用正文；可能为空或响应格式未适配';
 else if(/incomplete|interrupted|missing_finish/i.test(code))message='回复中途结束，缺少完整完成信息；已显示片段未作为完整结果归档';
 else if(/data_after|duplicate_finish/i.test(code))message='完成信息之后仍有异常数据，回复未被接纳';
 else if(/invalid|malformed/i.test(code))message='上游响应格式损坏，回复未被接纳';
 return transportError(code.startsWith('TISYA_')?code:code.toUpperCase(),message);
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
export function geminiTextStream(response,status,{allowTools=false,allowImages=false}={}){
 let terminal=false,done=false,toolIndex=0,hasTools=false;
 return transformSse(response,({data,event},emit)=>{
  if(!data){if(event==='error')throw transportFailure('upstream_stream_error');return;}
  if(done)throw transportFailure('data_after_done');
  if(data.trim()==='[DONE]'){done=true;return;}
  let p;try{p=JSON.parse(data);}catch{throw transportFailure('invalid_sse_json');}
  if(!object(p)||p.error||event==='error')throw transportFailure('upstream_stream_error');
  if(p.candidates!==undefined&&(!Array.isArray(p.candidates)||p.candidates.length>1))throw transportFailure('invalid_candidates');
  const c=p.candidates?.[0];if(c!==undefined&&(!object(c)||(c.index!==undefined&&c.index!==0)))throw transportFailure('invalid_candidate');
  const parts=c?.content?.parts??[];if(!Array.isArray(parts)||parts.some(x=>!object(x)||(!allowTools&&(x.functionCall||x.functionResponse))||x.inlineData&&(!allowImages||!inlineImage(x))||x.fileData))throw transportFailure('unexpected_content');
  const images=parts.filter(p=>p.inlineData&&!p.thought).map(imagePart);
  if(images.length)status.hasImages=true;
  let content='',reasoning='';for(const part of parts){if(part.text!==undefined&&typeof part.text!=='string')throw transportFailure('invalid_text');if(part.thought)reasoning+=part.text??'';else content+=part.text??'';}
  if(content.trim())status.hasText=true;
  const calls=[];
  for(const part of parts)if(part.functionCall){const f=part.functionCall;if(typeof f.name!=='string'||!f.name||!object(f.args)||f.partialArgs||f.willContinue)throw transportFailure('invalid_tool_arguments');calls.push({index:toolIndex++,id:f.id,type:'function',function:{name:f.name,arguments:JSON.stringify(f.args)}});}
  hasTools ||= calls.length>0;
  const reason=c?.finishReason??p.promptFeedback?.blockReason;
  if(terminal&&(content||reasoning||images.length||calls.length||reason))throw transportFailure('data_after_finish');
  if(reason!==undefined){status.nativeFinishReason=nativeReason(reason);terminal=true;}
  // Tauri may append choices[].delta.native as history metadata after STOP.
  if(p.choices?.some(x=>x.delta?.content||x.delta?.tool_calls||x.finish_reason))throw transportFailure('invalid_native_envelope');
  const choices=c||reason!==undefined?[{index:0,delta:{...(images.length?{images}:{}),...(content?{content}:{}),...(reasoning?{reasoning_content:reasoning}:{}),...(calls.length?{tool_calls:calls}:{})},...(reason!==undefined?{finish_reason:reason==='STOP'&&hasTools?'tool_calls':mapReason(reason),native_finish_reason:nativeReason(reason)}:{})}]:[];
  emit(sseData({choices,tisyaNativeFrame:p}));
 },emit=>{if(!terminal)throw transportFailure('missing_finish_reason');emit(sseData('[DONE]'));});
}

// Match the main host's extractMessageFromData nullish precedence. An explicit
// empty string/array is authoritative; never promote reasoning or tool args.
function hostTextView(value,status){
 const choice=value.choices?.[0],message=choice?.message;
 let content,source;
 if(Array.isArray(value.content)){
  const parts=value.content.filter(p=>p?.type==='text');
  if(parts.some(p=>typeof p.text!=='string'))throw transportFailure('invalid_text');
  content=parts.map(p=>p.text).join('\n\n');source='content';
 }else if(message?.content!=null){content=message.content;source='message.content';}
 else if(choice?.text!=null){content=choice.text;source='choice.text';}
 else if(value.text!=null){content=value.text;source='text';}
 else return value;
 if(typeof content!=='string'&&!Array.isArray(content))throw transportFailure('invalid_text');
 status.hostTextSource=source;
 if(source==='message.content')return value;
 if(!object(choice)||message!=null&&!object(message))throw transportFailure('invalid_message');
 const projected=structuredClone(value);
 projected.choices[0].message={...(message??{role:'assistant'}),content};
 return projected;
}

// Fixed counts only, captured before validation; no text, arguments, names or URLs.
function responseShape(value){
 const choice=value.choices?.[0],message=choice?.message;
 const chars=v=>typeof v==='string'?v.length:Array.isArray(v)?v.reduce((n,p)=>n+(typeof p?.text==='string'?p.text.length:0),0):0;
 const parts=value.responseContent?.parts??message?.native?.gemini?.content?.parts??value.candidates?.[0]?.content?.parts;
 return {messageTextChars:chars(message?.content),choiceTextChars:chars(choice?.text),topTextChars:chars(value.text),contentTextChars:chars(Array.isArray(value.content)?value.content.filter(p=>p?.type==='text'):null),reasoningChars:chars(message?.reasoning_content),toolCalls:Array.isArray(message?.tool_calls)?message.tool_calls.length:message?.function_call?1:0,nativeTextChars:chars(Array.isArray(parts)?parts.filter(p=>!p?.thought):null),nativeToolCalls:Array.isArray(parts)?parts.filter(p=>p?.functionCall).length:0};
}

function normalizeGemini(value,status,{allowImages=false}={}){
 if(value.promptFeedback?.blockReason)throw transportFailure('filtered');
 if(Array.isArray(value.choices)){
  // The host projects non-streaming Gemini responses into choices, sometimes
  // discarding the native finish code. Report that limit instead of inventing STOP.
  status.completionEvidence='host-normalized';
  if(allowImages){
   const parts=value.responseContent?.parts??value.choices[0]?.message?.native?.gemini?.content?.parts;
   if(parts!==undefined){
    if(!Array.isArray(parts)||parts.some(p=>!object(p)||p.inlineData&&!inlineImage(p)||p.fileData))throw transportFailure('invalid_images');
    const images=parts.filter(p=>p.inlineData&&!p.thought).map(imagePart);
    if(images.length){value=structuredClone(value);if(!object(value.choices[0]?.message))throw transportFailure('invalid_message');value.choices[0].message.images=images;}
   }
  }
  return value;
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
  else if(allowImages&&inlineImage(part)){if(!part.thought)(message.images??=[]).push(imagePart(part));}
  else if(part.inlineData||part.fileData)throw transportFailure('unexpected_content');
 }
 if(calls.length)message.tool_calls=calls;
 return {...value,choices:[{index:0,message,finish_reason:reason==='STOP'&&calls.length?'tool_calls':mapReason(reason),native_finish_reason:nativeReason(reason)}],responseContent:c.content,usageMetadata:value.usageMetadata};
}

// Cohere's host adapter returns v2 JSON unchanged. Validate a projection but
// return the original envelope to main chat, including citations and tool IDs.
function normalizeCohere(value,status,{hostReader=false}={}){
 const reason=value.finish_reason;status.nativeStopReason=reason;status.completionEvidence='native';
 if(reason==='MAX_TOKENS')throw transportFailure('length');
 if(!['COMPLETE','STOP_SEQUENCE','TOOL_CALL'].includes(reason))throw transportFailure('incomplete_native_stop');
 const m=value.message;if(!object(m)||m.role!=='assistant')throw transportFailure('invalid_message');
 if(m.content!=null&&(!Array.isArray(m.content)||m.content.some(p=>!object(p)||p.type!=='text'||typeof p.text!=='string')))throw transportFailure('invalid_text');
 if(m.tool_plan!=null&&typeof m.tool_plan!=='string')throw transportFailure('invalid_text');
 const calls=m.tool_calls??[];
 if(!Array.isArray(calls))throw transportFailure('invalid_tool_call');
 const ids=new Set();
 for(const c of calls){
  if(!object(c)||c.type!=='function'||typeof c.id!=='string'||!c.id||ids.has(c.id)||typeof c.function?.name!=='string'||!c.function.name||typeof c.function.arguments!=='string')throw transportFailure('invalid_tool_call');
  ids.add(c.id);let args;try{args=JSON.parse(c.function.arguments);}catch{throw transportFailure('invalid_tool_arguments');}if(!object(args))throw transportFailure('invalid_tool_arguments');
 }
 if(reason==='TOOL_CALL'&&!calls.length||calls.length&&reason!=='TOOL_CALL')throw transportFailure('invalid_tool_stop');
 // Main host uses only the first content block, then tool_plan, with nullish
 // precedence. An explicit empty first block must not become a hidden success.
 const content=hostReader?(m.content?.[0]?.text??m.tool_plan??''):(m.content?.map(p=>p.text).join('')??m.tool_plan??'');
 const message={role:'assistant',content,...(calls.length?{tool_calls:calls}:{})};
 return {...value,choices:[{index:0,message,finish_reason:calls.length?'tool_calls':'stop'}]};
}

export async function bufferedResponse(response,plan,status,{signal,guard,limit}){
 if(/text\/event-stream/i.test(response.headers.get('content-type')??''))throw transportFailure('invalid_buffered_response');
 const {text:raw}=await readResponseText(response,{signal,guard,limit,limitError:()=>transportFailure('output_limit')});
  let value;try{value=JSON.parse(raw);}catch{throw transportFailure('invalid_json');}
  if(Number.isInteger(value?.error?.code))status.upstreamStatus=value.error.code;
  if(!object(value)||value.error)throw transportFailure('upstream_error');
  const original=value;
  if(plan.protocol==='claude'){
   const reason=value.stop_reason??value.choices?.[0]?.message?.native?.claude?.stop_reason;
   if(reason!=null){
    status.nativeStopReason=reason;
    if(['max_tokens','model_context_window_exceeded'].includes(reason))throw transportFailure('length');
    if(reason==='refusal')throw transportFailure('filtered');
    if(!['end_turn','stop_sequence','tool_use'].includes(reason))throw transportFailure('incomplete_native_stop');
   }
  }
  status.responseShape=responseShape(original);
  if(plan.protocol==='gemini')value=normalizeGemini(value,status,plan);else if(plan.protocol==='cohere')value=normalizeCohere(value,status,plan);else status.completionEvidence='provider';
  if(!Array.isArray(value.choices)||value.choices.length!==1)throw transportFailure('invalid_choices');
  let toolName=plan.toolName;
  if(plan.mode==='universal'&&toolName){
   const turn=classifyToolTurn((value.choices[0].message?.tool_calls??[]).map(c=>c.function?.name),plan);
   status.toolTextTurn=turn;if(turn!=='synthetic')toolName=null;
  }
  if(plan.hostReader&&!toolName)value=hostTextView(value,status);
  const extra=plan.allowImages?hasImageContent:undefined;
  const before=inspectCompletion(value,extra);Object.assign(status,{finishReason:before.integrity.finishReason});
  if(!before.valid)throw transportFailure(before.reason);
  if(['length','content_filter'].includes(before.integrity.outcome))throw transportFailure(before.integrity.outcome==='length'?'length':'filtered');
  if(plan.mode==='tool-text-tools'||plan.mode==='universal'&&plan.toolName){
   const message=value.choices[0].message;
   if(message?.function_call||message?.images||Array.isArray(message?.content)&&message.content.some(p=>p.type!=='text'))throw transportFailure('unexpected_content');
   const turn=classifyToolTurn((message?.tool_calls??[]).map(c=>c.function?.name),plan);status.toolTextTurn=turn;if(turn==='real')toolName=null;
   verifyBufferedToolMirrors(value,plan);
   if(turn==='synthetic'&&hasOutsideToolText(original))throw transportFailure('wrap_mixed_text');
  }
  if(toolName){value=restoreAntiTruncationCompletion(value,toolName);status.restored=value.router_anti_truncation?.restored===true;if(!status.restored)throw transportFailure('not_restored');}
  const checked=inspectCompletion(value,extra),toolTurn=plan.allowTools&&checked.integrity.outcome==='tool_calls';if(!checked.valid||checked.integrity.outcome!=='complete'&&!toolTurn)throw transportFailure(checked.reason??'unexpected_tools');
  const message=value.choices[0].message;
  status.hasText=hasText(message);status.hasImages=!!(plan.allowImages&&hasImageContent(message));
  if(!toolTurn&&!status.hasText&&!status.hasImages)throw transportFailure('empty_completion');
  if(toolName){
   // A synthetic function is never persisted as an executable/native tool turn.
   delete message.native;delete message.function_call;
   delete value.content;delete value.text;delete value.choices[0].text;
   if(plan.protocol==='gemini'){
    // Preserve search provenance and server-side tool records, but never put the
    // synthetic function or its signature back into an executable history part.
    const oldParts=value.responseContent?.parts??[];
    const serverParts=oldParts.filter(p=>p.toolCall||p.toolResponse).map(p=>structuredClone(p));
    value.responseContent={role:'model',parts:[...serverParts,...(message.reasoning_content?[{thought:true,text:message.reasoning_content}]:[]),{text:message.content}]};
    if(value.candidates)value.candidates=value.candidates.map(c=>{const metadata={...c};delete metadata.content;return metadata;});
   }
  }
  Object.assign(status,{delivery:toolTurn?'tools':toolName?'wrapped':'direct',outcome:checked.integrity.outcome,toolTurn:!!toolTurn,finishReason:checked.integrity.finishReason});
  return new Response(JSON.stringify(plan.protocol==='cohere'&&plan.hostReader||plan.mode==='verify-tools'||['tool-text-tools','universal'].includes(plan.mode)&&toolTurn?original:value),{headers:{'content-type':'application/json'}});
}
