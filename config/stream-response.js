import {toolResponseState} from './tool-response-state.js';
// Response parsing only: the host owns requests and the service owns task validation.
export function safeDiagnostic(text){
 let value=String(text??'');
 const keys='(?:proxy[-_ ]?authorization|authorization|(?:x[-_])?api[-_ ]?key|api[-_ ]?secret|client[-_ ]?secret|secret(?:[-_ ]?key)?|proxy[-_ ]?password|password|passwd|access[-_ ]?token|refresh[-_ ]?token|auth[-_ ]?token|session[-_ ]?token|token)';
 const quoted=new RegExp('((?:["\\\']?'+keys+'["\\\']?)\\s*[:=]\\s*)("(?:\\\\.|[^"\\\\])*"|\\\'(?:\\\\.|[^\\\'\\\\])*\\\')','gi');
 value=value.replace(quoted,(_,prefix,secret)=>prefix+secret[0]+'[REDACTED]'+secret[0]);
 value=value.replace(/(\b(?:proxy[-_ ]?)?authorization\b["']?\s*[:=]\s*)(?:Bearer|Basic)\s+[^\s,;}"'&]+/gi,'$1[REDACTED]');
 const bare=new RegExp('((?:["\\\']?'+keys+'["\\\']?)\\s*[:=]\\s*)(?!["\\\']|\\[REDACTED\\])([^\\s,;&}\\]"\\\']+)','gi');
 value=value.replace(bare,'$1[REDACTED]');
 value=value.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+={0,2}/gi,'Bearer [REDACTED]');
 return value.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi,'$1[REDACTED]@');
}

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function failure(code,message){const error=new Error(safeDiagnostic(message));error.code=code;return error;}
function aborted(signal){const reason=signal?.reason;const error=failure('TISYA_RESPONSE_ABORTED',reason instanceof Error?reason.message:reason===undefined?'辅助 API 读取已取消':String(reason));error.name='AbortError';return error;}
function description(value){
 if(typeof value==='string')return value;
 if(object(value))return typeof value.message==='string'?value.message:typeof value.detail==='string'?value.detail:typeof value.code==='string'?value.code:'服务器返回错误';
 return '服务器返回错误';
}
function apiError(payload){
 if(!object(payload))return '';
 if(Object.hasOwn(payload,'error')&&payload.error!==null&&payload.error!==false)return description(payload.error)||'服务器返回错误';
 if(Array.isArray(payload.errors)&&payload.errors.length)return payload.errors.map(description).join('；');
 if(payload.success===false||payload.ok===false||typeof payload.type==='string'&&/(?:^|_)error$/.test(payload.type)||['error','failed','failure'].includes(payload.status)||Number(payload.status)>=400||Number(payload.status_code)>=400||Number(payload.statusCode)>=400)return description(payload);
 if(typeof payload.message==='string'&&typeof payload.code==='string'&&/invalid|denied|unauthor|quota|rate_limit|overload|error/i.test(payload.code))return payload.message;
 return '';
}
function checkFinish(reason){
 if(reason===undefined||reason===null)return false;
 if(reason==='stop'||reason==='STOP'||reason==='end_turn')return true;
 if(reason==='length'||reason==='MAX_TOKENS')throw failure('TISYA_RESPONSE_TRUNCATED','辅助 API 输出达到长度限制（finish_reason: '+reason+'），结果不完整');
 if(reason==='content_filter'||reason==='SAFETY')throw failure('TISYA_RESPONSE_FILTERED','辅助 API 输出被内容过滤（finish_reason: '+reason+'），未取得完整结果');
 throw failure('TISYA_RESPONSE_FINISH','辅助 API 未正常完成（finish_reason: '+reason+'）');
}
function textParts(value){
 if(value===undefined||value===null)return '';
 if(typeof value==='string')return value;
 if(!Array.isArray(value))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 正文字段格式无效');
 let text='';for(const part of value){
  if(!object(part))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 文本块格式无效');
  if(part.type==='text'||part.type==='output_text'){if(typeof part.text!=='string')throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 文本块缺少正文');text+=part.text;}
 }
 return text;
}
function firstChoice(choices){
 if(!Array.isArray(choices)||choices.some(choice=>!object(choice)))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API choices 格式无效');
 return choices.find(choice=>choice.index===0)??choices.find(choice=>choice.index===undefined);
}
// Host relays can preserve Gemini parts inside an OpenAI-shaped delta.
// Select one representation; never concatenate mirrored native and plain text.
function geminiEnvelope(payload,part){
 if(object(part)&&Object.hasOwn(part,'candidates'))return part;
 if(object(payload)&&Object.hasOwn(payload,'candidates'))return payload;
 return null;
}
function geminiTextChoice(payload){
 if(payload.promptFeedback?.blockReason)throw failure('TISYA_RESPONSE_FILTERED','辅助 API 输出被拦截：'+payload.promptFeedback.blockReason);
 if(!Array.isArray(payload.candidates))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API candidates 格式无效');
 const candidate=payload.candidates.find(c=>object(c)&&c.index===0)??payload.candidates.find(c=>object(c)&&c.index===undefined);
 if(!candidate){if(!payload.candidates.length&&object(payload.usageMetadata))return null;throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 没有可读取的 Gemini 候选');}
 const parts=candidate.content?.parts??[];if(!Array.isArray(parts))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API Gemini 文本块格式无效');
 let content='',thinking=false;
 for(const part of parts){
  if(!object(part))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API Gemini 文本块格式无效');
  if(part.functionCall)throw failure('TISYA_RESPONSE_FINISH','正文任务收到未授权的工具调用，未作为表单结果接纳');
  if(typeof part.text==='string'){if(part.thought===true)thinking=true;else content+=part.text;}
  else if(Object.keys(part).some(key=>key!=='thoughtSignature'))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API Gemini 返回了非文本内容，未作为表单结果接纳');
 }
 return {index:0,delta:{content,...(thinking?{reasoning_content:true}:{})},finish_reason:candidate.finishReason||null};
}
function mergeNativeChoice(plain,native){
 if(!native)return null;
 const visible=textParts(plain?.delta?.content??plain?.message?.content);
 if(visible&&native.delta.content&&visible!==native.delta.content)throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 原生正文与兼容正文不一致，未猜测选择');
 return {...native,delta:{...native.delta,content:visible||native.delta.content},finish_reason:[native.finish_reason,plain?.finish_reason].find(reason=>reason!=null&&!['stop','STOP','end_turn'].includes(reason))??native.finish_reason??plain?.finish_reason};
}
function jsonText(payload,raw,remember=()=>{}){
 const error=apiError(payload);if(error)throw failure('TISYA_RESPONSE_API','辅助 API 返回错误：'+error);
 if(typeof payload==='string')return payload;
 if(!object(payload))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 没有返回有效的正文对象');
 if(payload.promptFeedback?.blockReason)throw failure('TISYA_RESPONSE_FILTERED','辅助 API 输出被拦截：'+payload.promptFeedback.blockReason);
 const plain=Object.hasOwn(payload,'choices')?firstChoice(payload.choices):null,native=geminiEnvelope(payload,plain?.message);
 if(native){const choice=mergeNativeChoice(plain,geminiTextChoice(native));if(!choice)return '';remember(choice.delta.content);checkFinish(choice.finish_reason);return choice.delta.content;}
 if(Object.hasOwn(payload,'choices')){
  const choice=plain;if(!choice)throw failure('TISYA_RESPONSE_EMPTY','辅助 API 没有返回文本选项');remember(object(choice.message)?textParts(choice.message.content):typeof choice.text==='string'?choice.text:'');checkFinish(choice.finish_reason);
  if(choice.message?.refusal)throw failure('TISYA_RESPONSE_REFUSED','辅助 API 拒绝生成：'+description(choice.message.refusal));
  if(object(choice.message))return textParts(choice.message.content);
  if(typeof choice.text==='string')return choice.text;
  throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 文本选项缺少 message.content');
 }
 // Preserve the non-stream response shapes already accepted by parseJSONResponse.
 if(Array.isArray(payload.content)){
  remember(textParts(payload.content));checkFinish(payload.stop_reason);return textParts(payload.content);
 }
 if(Object.hasOwn(payload,'candidates')){
  if(!Array.isArray(payload.candidates)||!object(payload.candidates[0]))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API candidates 格式无效');
  const candidate=payload.candidates[0];const parts=candidate.content?.parts;
  if(!Array.isArray(parts))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 候选缺少正文');
  const result=parts.filter(part=>object(part)&&part.thought!==true&&typeof part.text==='string').map(part=>part.text).join('');remember(result);checkFinish(candidate.finishReason);return result;
 }
 if(!Object.keys(payload).length||Object.hasOwn(payload,'reasoning')||Object.hasOwn(payload,'reasoning_content')||Object.hasOwn(payload,'finish_reason')||Object.hasOwn(payload,'usage')||typeof payload.object==='string'&&payload.object.startsWith('chat.completion')||payload.type==='message')throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 返回了状态或推理数据，但没有正文');
 // Some hosts return the task's JSON object directly instead of a model envelope.
 return raw??JSON.stringify(payload);
}

export function readTaskResponse(response,options={}){return readResponse(response,options,false);}
export function readToolResponse(response,options={}){return readResponse(response,options,true);}
async function readResponse(response,{signal,onProgress}={},allowTools=false){
 const tools=allowTools?toolResponseState():null;
 if(!response||typeof response!=='object')throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 响应对象无效');
 let reader=null,ended=false,text='',lastStage='',lastText='',abortReject;
 const diagnostic={httpStatus:Number(response.status)||null,contentType:safeDiagnostic(response.headers?.get?.('content-type')??''),receivedBytes:0,frames:0,done:false,finishReason:null,reasoningDetected:false,envelopeKeys:[],choiceKeys:[],deltaKeys:[]};
 const inspect=payload=>{if(!object(payload))return;diagnostic.envelopeKeys=[...new Set([...diagnostic.envelopeKeys,...Object.keys(payload).map(safeDiagnostic)])].slice(0,40);const choice=Array.isArray(payload.choices)?payload.choices.find(x=>x?.index===0||x?.index===undefined):null;const value=choice?.delta??choice?.message??payload;diagnostic.choiceKeys=[...new Set([...diagnostic.choiceKeys,...Object.keys(choice??{}).map(safeDiagnostic)])].slice(0,40);diagnostic.deltaKeys=[...new Set([...diagnostic.deltaKeys,...Object.keys(object(value)?value:{}).map(safeDiagnostic)])].slice(0,40);diagnostic.reasoningDetected ||= !!(value.reasoning||value.reasoning_content||value.reasoning_details||payload.content?.some?.(x=>x?.type==='thinking')||payload.candidates?.some?.(x=>x?.content?.parts?.some?.(p=>p?.thought===true)));const reason=choice?.finish_reason??payload.stop_reason??payload.candidates?.[0]?.finishReason;if(reason!=null)diagnostic.finishReason=safeDiagnostic(String(reason));};
 const remember=value=>{text=value;};
 const interrupted=new Promise((_,reject)=>{abortReject=reject;});
 // The read race consumes this rejection; the catch also covers aborts before a read starts.
 interrupted.catch(()=>{});
 const checkAbort=()=>{if(signal?.aborted)throw aborted(signal);};
 const cancel=()=>{try{Promise.resolve((reader??response.body)?.cancel?.()).catch(()=>{});}catch{}};
 const onAbort=()=>{abortReject(aborted(signal));cancel();};
 signal?.addEventListener('abort',onAbort,{once:true});
 const guarded=async promise=>{checkAbort();const result=await Promise.race([promise,interrupted]);checkAbort();return result;};
 const progress=async stage=>{
  checkAbort();if(stage===lastStage&&text===lastText)return;lastStage=stage;lastText=text;
  if(typeof onProgress==='function')await guarded(Promise.resolve().then(()=>onProgress({stage,characters:text.length,text,responseDiagnostic:{...diagnostic}})));
 };
 async function bodyText(){
  if(reader){const decoder=new TextDecoder('utf-8',{fatal:true});let raw='';for(;;){const part=await guarded(reader.read());if(part.done){ended=true;return raw+decoder.decode();}diagnostic.receivedBytes+=part.value.byteLength;raw+=decoder.decode(part.value,{stream:true});}}
  if(typeof response.text==='function'){const raw=await guarded(Promise.resolve().then(()=>response.text()));diagnostic.receivedBytes=new TextEncoder().encode(raw).byteLength;return raw;}
  return null;
 }
 try{
  checkAbort();if(typeof response.body?.getReader==='function')reader=response.body.getReader();
  if(response.ok===false||Number(response.status)>=400){
   let detail='';const raw=await bodyText();
   if(raw!==null){try{const parsed=JSON.parse(raw);detail=apiError(parsed)||description(parsed);}catch{detail=/^\s*[\[{]/.test(raw)?'服务器错误正文格式无效':raw;}}
   else if(typeof response.json==='function'){const payload=await guarded(Promise.resolve().then(()=>response.json()));detail=apiError(payload)||description(payload);}
   throw failure('TISYA_RESPONSE_HTTP','生成请求失败（HTTP '+(response.status??'未知')+'）'+(detail?'：'+detail:''));
  }
  const contentType=response.headers?.get?.('content-type')??'';
  if(!/text\/event-stream/i.test(contentType)){
   await progress('buffered');const raw=await bodyText();let payload;
   if(raw!==null){if(typeof raw!=='string'||!raw.trim())throw failure('TISYA_RESPONSE_EMPTY','辅助 API 返回了空正文');try{payload=JSON.parse(raw);}catch{throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 返回的正文不是有效 JSON');}}
   else if(typeof response.json==='function')payload=await guarded(Promise.resolve().then(()=>response.json()));
   else throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 响应缺少可读取的正文接口');
   inspect(payload);const apiFailure=apiError(payload);if(apiFailure)throw failure('TISYA_RESPONSE_API','辅助 API 返回错误：'+apiFailure);
   const toolResult=tools?.json(payload);if(toolResult){text=toolResult.content;await progress('received');return toolResult;}
   text=jsonText(payload,raw,remember);if(typeof text!=='string'||!text.trim())throw failure('TISYA_RESPONSE_EMPTY','辅助 API 没有返回文本结果');
   await progress('received');return tools?tools.final(text):text;
  }
  await progress('connected');let pending='',data=[],event='',done=false,finished=false;
  async function frame(){
   if(!data.length){if(event==='error')throw failure('TISYA_RESPONSE_API','辅助 API 返回了错误事件');event='';return;}
   const raw=data.join('\n'),kind=event;data=[];event='';
   if(kind==='error'){let detail=raw;try{const payload=JSON.parse(raw);detail=apiError(payload)||description(payload);}catch{}throw failure('TISYA_RESPONSE_API','辅助 API 返回错误：'+detail);}
   if(raw.trim()==='[DONE]'){done=true;diagnostic.done=true;return;}
   let payload;try{payload=JSON.parse(raw);}catch{throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 流帧不是有效 JSON');}
   diagnostic.frames++;inspect(payload);const error=apiError(payload);if(error)throw failure('TISYA_RESPONSE_API','辅助 API 返回错误：'+error);
   if(!object(payload))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 流帧不是有效对象');
   let choice=Object.hasOwn(payload,'choices')?firstChoice(payload.choices):undefined;
   const native=geminiEnvelope(payload,choice?.delta);
   if(native){inspect(native);choice=mergeNativeChoice(choice,tools?tools.nativeFrame(native):geminiTextChoice(native));}
   else if(choice===undefined&&!Object.hasOwn(payload,'choices')){choice=tools?.nativeFrame(payload);if(choice===undefined&&(object(payload.usage)||object(payload.usageMetadata)))return;if(choice===undefined)throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 流帧缺少支持的 choices/candidates');}
   if(!choice)return;
   if(choice.delta?.reasoning_content)diagnostic.reasoningDetected=true;
   tools?.delta(choice);const reason=choice.finish_reason;
   if(choice.delta!==undefined&&!object(choice.delta))throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 流帧 delta 格式无效');
   if(!choice.delta&&reason==null)throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 流帧缺少 delta');
   if(choice.delta?.refusal)throw failure('TISYA_RESPONSE_REFUSED','辅助 API 拒绝生成：'+description(choice.delta.refusal));
   const part=textParts(choice.delta?.content);
   if(part){text+=part;if(tools&&text.length>262144)throw failure('TISYA_RESPONSE_TOOL_PROTOCOL','工具响应超出长度限制');await progress('receiving');}
   else if(!text&&(choice.delta?.reasoning_content||choice.delta?.reasoning||choice.delta?.reasoning_details))await progress('thinking');
   const terminal=tools&&reason==='tool_calls'?true:checkFinish(reason);if(terminal)finished=true;
  }
  async function line(value){
   if(value===''){await frame();return;}if(value.startsWith(':'))return;
   const separator=value.indexOf(':'),field=separator<0?value:value.slice(0,separator);let content=separator<0?'':value.slice(separator+1);if(content.startsWith(' '))content=content.slice(1);
   if(field==='data')data.push(content);else if(field==='event')event=content;
  }
  async function consume(chunk,final=false){
   pending+=chunk;let start=0;
   for(let index=0;index<pending.length;index++){
    if(pending[index]!=='\n'&&pending[index]!=='\r')continue;if(pending[index]==='\r'&&index===pending.length-1&&!final)break;
    const value=pending.slice(start,index);if(pending[index]==='\r'&&pending[index+1]==='\n')index++;start=index+1;await line(value);if(done||finished){pending='';return;}
   }
   pending=pending.slice(start);
   if(final){if(pending){await line(pending);pending='';}await frame();}
  }
  if(reader){
   const decoder=new TextDecoder('utf-8',{fatal:true});
   while(!done&&!finished){const part=await guarded(reader.read());if(part.done){ended=true;await consume(decoder.decode(),true);break;}diagnostic.receivedBytes+=part.value.byteLength;await consume(decoder.decode(part.value,{stream:true}));}
  }else if(typeof response.text==='function'){const raw=await guarded(Promise.resolve().then(()=>response.text()));diagnostic.receivedBytes=new TextEncoder().encode(raw).byteLength;await consume(raw,true);}
  else throw failure('TISYA_RESPONSE_PROTOCOL','辅助 API 流响应缺少正文读取接口');
  if(!done&&!finished)throw failure('TISYA_RESPONSE_TRUNCATED','辅助 API 流提前结束，缺少完成标记，结果未被接纳');
  const toolResult=tools?.finish(text);if(!text.trim()&&!toolResult?.toolCalls.length)throw failure('TISYA_RESPONSE_EMPTY','辅助 API 完成但没有返回文本结果');
  await progress('received');return toolResult??text;
 }catch(error){
  const result=signal?.aborted?aborted(signal):error?.code?.startsWith?.('TISYA_RESPONSE_')?error:failure('TISYA_RESPONSE_READ','辅助 API 读取失败：'+(error?.message??String(error)));if(signal?.aborted)cancel();result.responseDiagnostic={...diagnostic,text:safeDiagnostic(text),accepted:false};throw result;
 }finally{signal?.removeEventListener('abort',onAbort);if(reader){if(!ended)cancel();try{reader.releaseLock();}catch{}}}
}
