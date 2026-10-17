import {failTransport as fail} from './transport-error.js';
import {prepareToolTextMode} from './tool-text-mode.js';
import {nativeRequestBody} from '../vendor/vertex-transport/vertex-native.mjs';
import {detectNativeProtocol} from './native-protocol-guard.js';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

// Decide once before sending. Native modes retain their search/media/schema and
// tool choice; a response failure never starts a replacement request.
export function prepareUniversalTransport(payload,{isTauri=true}={}){
 if(!isTauri)fail('HOST','当前环境没有正文传输接口');
 if(!Array.isArray(payload.messages)||!payload.messages.length)fail('MESSAGES','请求缺少消息');
 const custom=payload.chat_completion_source==='custom',format=payload.custom_api_format||'openai_compat';
 const protocol=detectNativeProtocol(payload);
 let included={};try{if(payload.custom_include_body)included=typeof payload.custom_include_body==='string'?JSON.parse(payload.custom_include_body):structuredClone(payload.custom_include_body);}catch{fail('PARAMETERS','附加请求参数不是有效 JSON');}
 if(!object(included))fail('PARAMETERS','附加请求参数必须是对象');
 let strategy='wrapped',reason=null;
 const native=why=>{strategy='native';reason=why;};
 const declared=payload.tools??[];
 const structured=payload.json_schema||payload.responseSchema||payload.responseMimeType&&payload.responseMimeType!=='text/plain'||payload.response_format&&payload.response_format.type!=='text'||included.response_format&&included.response_format.type!=='text'||included.generationConfig?.responseSchema||included.generationConfig?.responseJsonSchema||included.generationConfig?.responseMimeType&&included.generationConfig.responseMimeType!=='text/plain';
 const media=payload.request_images||included.modalities?.some?.(x=>x!=='text')||included.generationConfig?.responseModalities?.some?.(x=>x!=='TEXT');
 const explicitChoice=included.toolConfig?.functionCallingConfig?.mode??included.tool_choice??payload.tool_choice;
 if(!custom&&payload.chat_completion_source!=='openai')native('provider-native');
 if(custom&&!['gemini_generate_content','openai_compat'].includes(format))native('provider-native');
 // Built-in search support cannot imply support for mixing it with a function.
 // Preserve the original search request; validate the same response without an
 // injected function or a second paid request (relay combination rejection AT10).
 if(payload.enable_web_search||(included.tools??[]).some?.(t=>t.googleSearch||t.google_search||t.googleSearchRetrieval))native('builtin-search');
 if(structured)native('structured-output');
 if(media)native('media-output');
 if(explicitChoice==='none'||explicitChoice==='NONE')native('tools-disabled');
 if(payload.functions?.length||payload.function_call!=null||payload.messages.some(m=>m.role==='function'||m.function_call))native('legacy-tools');
 if(payload.custom_exclude_body&&String(payload.custom_exclude_body).trim())native('custom-exclusions');
 if(['messages','contents','systemInstruction','cachedContent','stream'].some(k=>Object.hasOwn(included,k)))native('custom-body');
 if(payload.n>1||payload.best_of>1||included.n>1||included.generationConfig?.candidateCount>1)native('multiple-candidates');
 if(!Array.isArray(declared)||declared.some(t=>t?.type!=='function'||!object(t.function)))native('native-tools');
 if(protocol==='openai'&&['tools','functions','function_call','tool_choice','parallel_tool_calls'].some(k=>Object.hasOwn(included,k)))native('custom-tools');
 let wire=structuredClone(payload),toolName=null,realToolNames=[];
 if(strategy==='wrapped'){
  const extraTools=protocol==='gemini'?(included.tools??[]):[];
  if(!Array.isArray(extraTools))fail('PARAMETERS','原生工具列表格式无效');
  const nativeDeclarations=extraTools.flatMap(t=>t.functionDeclarations??[]);
  const all=[...declared,...nativeDeclarations.map(f=>({type:'function',function:{name:f.name,description:f.description,parameters:f.parametersJsonSchema??f.parameters}}))];
  const safeIncluded={...included};for(const k of ['tools','toolConfig','tool_choice','parallel_tool_calls','functions','function_call'])delete safeIncluded[k];
  const choice=payload.tool_choice;
  const prepared=prepareToolTextMode({...payload,tools:all,tool_choice:choice==='none'?undefined:choice},safeIncluded,{continuation:payload.type==='continue'});
  wire=prepared.payload;toolName=prepared.toolName;realToolNames=prepared.realToolNames;
  // AUTO lets built-in search execute before final delivery. Forcing a function
  // with ANY/required can suppress the server-side search the user requested.
  if(payload.enable_web_search)wire.tool_choice='auto';
  if(protocol==='gemini'){
   const fn=nativeRequestBody({messages:[],tools:wire.tools,tool_choice:wire.tool_choice});
   const builtins=extraTools.map(t=>{const copy=structuredClone(t);delete copy.functionDeclarations;return copy;}).filter(t=>Object.keys(t).length);
   if(payload.enable_web_search&&!builtins.some(t=>t.googleSearch||t.google_search||t.googleSearchRetrieval))builtins.push({googleSearch:{}});
   const builtinSearch=builtins.length>0;
   wire.custom_include_body=JSON.stringify({...included,tools:[...builtins,...fn.tools],toolConfig:{...fn.toolConfig,...included.toolConfig,...(builtinSearch?{functionCallingConfig:{mode:'AUTO'},includeServerSideToolInvocations:true}:{})}});
   if(builtinSearch)wire.tool_choice='auto';
  }
 }
 if(new TextEncoder().encode(JSON.stringify(wire)).length>8*1024*1024)fail('REQUEST_LIMIT','请求超过本地处理上限');
 const plan={id:toolName??'tisya_universal_'+crypto.randomUUID(),toolName,realToolNames,protocol,model:payload.model,stream:payload.stream===true,continuation:payload.type==='continue',mode:'universal',strategy,allowTools:true,allowImages:true,multiple:reason==='multiple-candidates'};
 return {payload:wire,plan,audit:{mode:'universal',strategy,reason,state:'prepared',label:'已准备通用抗截断',protocol,requestImages:payload.request_images===true,allowTools:true,searchRequested:payload.enable_web_search===true,toolsRequested:!!declared.length,protection:strategy==='wrapped'?'tool-text':'native-completion',continuation:plan.continuation,clientStream:plan.stream,upstreamStream:plan.stream,nativeTools:protocol==='gemini'?JSON.parse(wire.custom_include_body||'{}').tools??[]:wire.tools??[],toolConfig:protocol==='gemini'?JSON.parse(wire.custom_include_body||'{}').toolConfig??null:wire.tool_choice??null}};
}
