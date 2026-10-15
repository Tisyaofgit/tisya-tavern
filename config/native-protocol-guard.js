import {transformSse,sseData,isObject} from '../vendor/vertex-transport/wire.mjs';

const fail=code=>{throw Object.assign(new Error('原生响应未完整结束：'+code),{code:'TISYA_TRANSPORT_NATIVE_'+code});};

// Mirror the host's response dialect, not the provider request URL or model alias.
export function detectNativeProtocol(payload){
 const source=payload.chat_completion_source,model=String(payload.model??'').trim();
 if(source==='claude'||source==='custom'&&payload.custom_api_format==='claude_messages'||source==='opencode'&&payload.opencode_api_format==='claude_messages')return 'claude';
 if(source==='vertexai'&&/^claude-/i.test(model))return 'claude';
 if(source==='aws_bedrock')return !payload.aws_bedrock_use_custom_template&&/^(?:(?:us|eu|jp|au|apac|global|us-gov)\.)?anthropic\.claude/i.test(model)?'claude':'unknown'; // Other Bedrock families lose provider terminal evidence in the host's text-only projection.
 if(source==='cohere')return 'cohere';
 if(source==='makersuite'||source==='vertexai'||source==='custom'&&payload.custom_api_format==='gemini_generate_content'||source==='opencode'&&payload.opencode_api_format==='gemini')return 'gemini';
 return 'openai'; // Includes host-normalized OpenAI Responses.
}

export function guardNativeProtocolStream(response,status,plan){
 const protocol=plan.responseDialect??plan.protocol;
 if(protocol==='cohere')return guardCohereStream(response,status);
 if(protocol!=='claude')fail('UNSUPPORTED_PROTOCOL');
 let started=false,ended=false,done=false,reason=null,open=null,nextIndex=0,toolIndex=0,hasTools=false,stopDelta=false;
 const project=(emit,frame,delta={},finish)=>emit(sseData({choices:[{index:0,delta,...(finish?{finish_reason:finish}:{})}],tisyaNativeFrame:frame}));
 return transformSse(response,({data,event},emit)=>{
  if(!data){if(event==='error')fail('UPSTREAM_ERROR');return;}
  if(done)fail('DATA_AFTER_DONE');
  if(data.trim()==='[DONE]'){if(!ended)fail('MISSING_MESSAGE_STOP');done=true;return;}
  let p;try{p=JSON.parse(data);}catch{fail('INVALID_JSON');}
  if(!isObject(p)||p.error||p.type==='error'||event==='error')fail('UPSTREAM_ERROR');
  if(ended)fail('DATA_AFTER_TERMINAL');
  if(p.type==='ping'){project(emit,p);return;}
  if(p.type==='message_start'){
   if(started||!isObject(p.message)||p.message.role!=='assistant'||!Array.isArray(p.message.content)||p.message.content.length||p.message.stop_reason!=null)fail('INVALID_MESSAGE_START');
   started=true;project(emit,p,{role:'assistant'});return;
  }
  if(!started)fail('MISSING_MESSAGE_START');
  if(stopDelta&&p.type!=='message_stop')fail('DATA_AFTER_STOP_REASON');
  if(p.type==='content_block_start'){
   if(open||p.index!==nextIndex||!isObject(p.content_block))fail('INVALID_BLOCK_START');
   const block=p.content_block;open={index:p.index,type:block.type,block,partial:'',partialSeen:false};nextIndex++;
   const supported=['text','thinking','redacted_thinking','tool_use','server_tool_use','web_search_tool_result','web_fetch_tool_result','tool_search_tool_result','code_execution_tool_result','bash_code_execution_tool_result','text_editor_code_execution_tool_result'];
   if(!supported.includes(block.type))fail('UNSUPPORTED_BLOCK_TYPE');
   if(block.type==='redacted_thinking'&&typeof block.data!=='string')fail('INVALID_REDACTED_THINKING');
   if(block.type.endsWith('_tool_result')&&(typeof block.tool_use_id!=='string'||!block.tool_use_id||!Array.isArray(block.content)&&!isObject(block.content)))fail('INVALID_SERVER_RESULT');
   if(block.type==='tool_use'||block.type==='server_tool_use'){
    if(typeof block.id!=='string'||!block.id||typeof block.name!=='string'||!block.name||!(isObject(block.input)||block.type==='server_tool_use'&&block.input===undefined))fail('INVALID_TOOL');
    if(block.type==='tool_use'){open.toolIndex=toolIndex++;hasTools=true;}
   }
   const delta=block.type==='text'?{content:block.text}:block.type==='thinking'?{reasoning_content:block.thinking}:{};
   if(block.type==='text'&&typeof block.text!=='string'||block.type==='thinking'&&typeof block.thinking!=='string')fail('INVALID_BLOCK_TEXT');
   project(emit,p,delta);return;
  }
  if(p.type==='content_block_delta'){
   if(!open||p.index!==open.index||!isObject(p.delta))fail('INVALID_BLOCK_DELTA');
   const d=p.delta;let delta={};
   if(d.type==='text_delta'&&open.type==='text'&&typeof d.text==='string')delta={content:d.text};
   else if(d.type==='thinking_delta'&&open.type==='thinking'&&typeof d.thinking==='string')delta={reasoning_content:d.thinking};
   else if(d.type==='signature_delta'&&open.type==='thinking'&&typeof d.signature==='string'){} // Opaque signature remains on the original sidecar.
   else if(d.type==='citations_delta'&&open.type==='text'&&isObject(d.citation)&&typeof d.citation.type==='string'){} // Citation content and source provenance remain native, not added to正文.
   else if(d.type==='input_json_delta'&&['tool_use','server_tool_use'].includes(open.type)&&typeof d.partial_json==='string'){open.partialSeen=true;open.partial+=d.partial_json;if(open.partial.length>8*1024*1024)fail('TOOL_LIMIT');}
   else fail('UNSUPPORTED_BLOCK_DELTA');
   project(emit,p,delta);return;
  }
  if(p.type==='content_block_stop'){
   if(!open||p.index!==open.index)fail('INVALID_BLOCK_STOP');
   let delta={};
   if(open.type==='tool_use'||open.type==='server_tool_use'){
    let args=open.block.input??{};
    if(open.partialSeen){try{args=JSON.parse(open.partial);}catch{fail('INVALID_TOOL_JSON');}}
    if(!isObject(args))fail('INVALID_TOOL_JSON');
    if(open.type==='tool_use')delta={tool_calls:[{index:open.toolIndex,id:open.block.id,type:'function',function:{name:open.block.name,arguments:JSON.stringify(args)}}]};
   }
   open=null;project(emit,p,delta);return;
  }
  if(p.type==='message_delta'){
   if(open||stopDelta||!isObject(p.delta)||typeof p.delta.stop_reason!=='string')fail('INVALID_MESSAGE_DELTA');
   reason=p.delta.stop_reason;stopDelta=true;status.nativeStopReason=reason;
   if(reason==='max_tokens'||reason==='model_context_window_exceeded')fail('LENGTH');
   if(reason==='refusal')fail('REFUSAL');
   if(reason==='pause_turn'){status.handoff='pause-turn';status.incomplete=true;fail('PAUSE_TURN');} // Host continuation required; never a completed final answer.
   if(!['end_turn','stop_sequence','tool_use'].includes(reason))fail('UNKNOWN_STOP_REASON');
   if(reason==='tool_use'&&!hasTools||hasTools&&reason!=='tool_use')fail('TOOL_STOP_MISMATCH');
   project(emit,p);return;
  }
  if(p.type==='message_stop'){
   if(open||!stopDelta)fail('INVALID_MESSAGE_STOP');ended=true;
   project(emit,p,{},hasTools?'tool_calls':'stop');return;
  }
  fail('UNKNOWN_EVENT');
 },emit=>{if(!started||!ended||open)fail('MISSING_MESSAGE_STOP');emit(sseData('[DONE]'));});
}

// Cohere v2 event contract: https://docs.cohere.com/v2/docs/tool-use-streaming
// Main host reads delta.message.content.text and tool_calls; return its original
// frames, while checking a separate OpenAI projection. Never execute tools here.
function guardCohereStream(response,status){
 let started=false,ended=false,done=false;const contents=new Map(),tools=new Map(),citations=new Set(),seenContents=new Set(),seenTools=new Set(),seenCitations=new Set(),toolIds=new Set();
 const project=(emit,p,delta={},finish)=>emit(sseData({choices:[{index:0,delta,...(finish?{finish_reason:finish}:{})}],tisyaNativeFrame:p}));
 const index=p=>{if(!Number.isSafeInteger(p.index)||p.index<0)fail('COHERE_INDEX');return p.index;};
 return transformSse(response,({data,event},emit)=>{
  if(!data){if(event==='error')fail('COHERE_UPSTREAM_ERROR');return;}
  if(done)fail('COHERE_DATA_AFTER_DONE');
  if(data.trim()==='[DONE]'){if(!ended)fail('COHERE_MISSING_END');done=true;return;}
  let p;try{p=JSON.parse(data);}catch{fail('COHERE_INVALID_JSON');}
  if(!isObject(p)||p.error||p.type==='error'||event==='error')fail('COHERE_UPSTREAM_ERROR');
  if(ended)fail('COHERE_DATA_AFTER_END');
  const m=p.delta?.message;
  if(p.type==='message-start'){
   if(started||!isObject(m)||m.role!=='assistant'||m.content!=null&&(!Array.isArray(m.content)||m.content.length)||m.tool_calls!=null&&(!Array.isArray(m.tool_calls)||m.tool_calls.length))fail('COHERE_INVALID_START');
   started=true;project(emit,p,{role:'assistant'});return;
  }
  if(!started)fail('COHERE_MISSING_START');
  if(p.type==='content-start'){
   const i=index(p),c=m?.content;if(seenContents.has(i)||!isObject(c)||c.type!=='text'||typeof c.text!=='string')fail('COHERE_CONTENT_START');seenContents.add(i);contents.set(i,true);project(emit,p,{content:c.text});return;
  }
  if(p.type==='content-delta'){
   const i=index(p);if(!contents.has(i)||typeof m?.content?.text!=='string')fail('COHERE_CONTENT_DELTA');project(emit,p,{content:m.content.text});return;
  }
  if(p.type==='content-end'){
   if(!contents.delete(index(p)))fail('COHERE_CONTENT_END');project(emit,p);return;
  }
  if(p.type==='tool-plan-delta'){
   if(typeof m?.tool_plan!=='string')fail('COHERE_TOOL_PLAN');project(emit,p,{content:m.tool_plan});return; // Host displays tool_plan as user-visible text.
  }
  if(p.type==='tool-call-start'){
   const i=index(p),t=m?.tool_calls;
   if(seenTools.has(i)||!isObject(t)||typeof t.id!=='string'||!t.id||toolIds.has(t.id)||t.type!=='function'||typeof t.function?.name!=='string'||!t.function.name||typeof t.function.arguments!=='string')fail('COHERE_TOOL_START');
   seenTools.add(i);toolIds.add(t.id);tools.set(i,{id:t.id,name:t.function.name,args:t.function.arguments});project(emit,p);return;
  }
  if(p.type==='tool-call-delta'){
   const t=tools.get(index(p)),f=m?.tool_calls?.function;if(!t||!isObject(f)||typeof f.arguments!=='string'||m.tool_calls.id!=null&&m.tool_calls.id!==t.id||f.name!=null&&f.name!==t.name)fail('COHERE_TOOL_DELTA');t.args+=f.arguments;if(t.args.length>8*1024*1024)fail('COHERE_TOOL_LIMIT');project(emit,p);return;
  }
  if(p.type==='tool-call-end'){
   const i=index(p),t=tools.get(i);if(!t)fail('COHERE_TOOL_END');let args;try{args=JSON.parse(t.args);}catch{fail('COHERE_TOOL_JSON');}if(!isObject(args))fail('COHERE_TOOL_JSON');tools.delete(i);project(emit,p,{tool_calls:[{index:i,id:t.id,type:'function',function:{name:t.name,arguments:t.args}}]});return;
  }
  if(p.type==='citation-start'){
   const i=index(p),c=m?.citations;if(seenCitations.has(i)||!isObject(c)||!Number.isSafeInteger(c.start)||!Number.isSafeInteger(c.end)||c.start<0||c.end<c.start||typeof c.text!=='string'||!Array.isArray(c.sources))fail('COHERE_CITATION_START');seenCitations.add(i);citations.add(i);project(emit,p);return;
  }
  if(p.type==='citation-end'){
   if(!citations.delete(index(p)))fail('COHERE_CITATION_END');project(emit,p);return;
  }
  if(p.type==='message-end'){
   const reason=p.delta?.finish_reason;status.nativeStopReason=reason;
   if(contents.size||tools.size||citations.size||typeof reason!=='string')fail('COHERE_INVALID_END');
   if(reason==='MAX_TOKENS')fail('COHERE_LENGTH');
   if(!['COMPLETE','STOP_SEQUENCE','TOOL_CALL'].includes(reason))fail('COHERE_STOP_REASON');
   if(reason==='TOOL_CALL'&&!seenTools.size||seenTools.size&&reason!=='TOOL_CALL')fail('COHERE_TOOL_STOP_MISMATCH');
   ended=true;project(emit,p,{},seenTools.size?'tool_calls':'stop');return;
  }
  if(p.type==='debug'){project(emit,p);return;}
  fail('COHERE_UNKNOWN_EVENT');
 },emit=>{if(!started||!ended)fail('COHERE_MISSING_END');emit(sseData('[DONE]'));});
}
