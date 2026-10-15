// Explicit opt-in text transport alongside host-owned function tools.
// No executor, provider request, retry or history mutation lives here.
import {prepareAntiTruncation,CONTINUATION_INSTRUCTION} from '../vendor/vertex-transport/anti-truncation.mjs';
import {createSseParser} from '../vendor/vertex-transport/wire.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code:'TISYA_TRANSPORT_'+code});};

export function prepareToolTextMode(payload,included,{continuation=false}={}){
 if(payload.functions?.length||payload.function_call!=null)fail('WRAP_LEGACY','正文工具包装不支持旧式 functions；请使用标准函数工具');
 if(['tools','toolConfig','tool_choice','parallel_tool_calls','functions','function_call'].some(k=>included[k]!==undefined))fail('WRAP_OVERRIDE','正文工具包装与附加参数中的工具定义冲突；请使用宿主标准工具入口');
 const tools=payload.tools??[];
 if(!Array.isArray(tools)||tools.some(t=>!object(t)||t.type!=='function'||!object(t.function)||typeof t.function.name!=='string'||!t.function.name))fail('WRAP_TOOLS','正文工具包装只支持标准函数工具，原请求未改动');
 if(payload.messages.some(m=>m.role==='function'||m.function_call))fail('WRAP_LEGACY','正文工具包装不支持旧式函数历史');
 const names=tools.map(t=>t.function.name);
 if(new Set(names).size!==names.length)fail('WRAP_TOOLS','正文工具包装发现重名工具');
 const choice=payload.tool_choice;
 if(choice!=null&&!['auto','required'].includes(choice)&&!(object(choice)&&choice.type==='function'&&names.includes(choice.function?.name)))fail('WRAP_CHOICE','正文工具包装与禁止工具或未知工具选择冲突');
 const prepared=prepareAntiTruncation({messages:[]},true,false,{continuation});
 const toolName=prepared.toolName;
 if(names.includes(toolName))fail('WRAP_TOOLS','正文工具包装名称冲突，请重新生成');
 const instruction=prepared.payload.messages[0];
 instruction.content=`Text-delivery transport contract for this response: choose one of two mutually exclusive rounds. If information or actions from the existing real tools are needed, call only those real tools and wait for their results; do not call ${toolName} in that round. When ready to deliver the answer, call ${toolName} alone exactly once and put ${continuation?'only the new continuation text':'the entire user-visible answer'} in its content string. Preserve all requested formatting, markup, language and sections. Do not put final answer text outside this string. This function only transports text; it performs no external action and needs no tool-result follow-up.${continuation?'\n'+CONTINUATION_INSTRUCTION:''}`;
 return {toolName,realToolNames:names,payload:{...structuredClone(payload),messages:[...structuredClone(payload.messages),instruction],tools:[...structuredClone(tools),prepared.payload.tools[0]],tool_choice:object(choice)?structuredClone(choice):names.length?'required':prepared.payload.tool_choice,...(!names.length?{parallel_tool_calls:false}:{})}};
}

export function classifyToolTurn(names,plan){
 const owned=names.filter(n=>n===plan.toolName),real=names.filter(n=>n!==plan.toolName);
 if(owned.length>1)fail('WRAP_MULTIPLE','正文提交工具被调用多次，回复未被接纳');
 if(owned.length&&real.length)fail('WRAP_MIXED','正文提交和真实工具出现在同一回合，回复未被接纳');
 if(real.some(n=>!plan.realToolNames.includes(n)))fail('WRAP_UNKNOWN','响应包含本次未声明的工具，未交给宿主执行');
 return owned.length?'synthetic':real.length?'real':'none';
}

// Inspect all public-text carriers, not just the one a normalizer selects.
// A wrapper must never silently discard text from a shadow field.
export function hasOutsideToolText(value){
 const text=v=>typeof v==='string'?!!v.trim():Array.isArray(v)&&v.some(p=>typeof p?.text==='string'&&p.text.trim());
 const parts=p=>Array.isArray(p)&&p.some(x=>!x?.thought&&typeof x?.text==='string'&&x.text.trim());
 return text(value.content)||text(value.text)||text(value.message?.content)||
  (value.choices??[]).some(c=>text(c.text)||text(c.message?.content)||text(c.delta?.content))||
  parts(value.responseContent?.parts)||(value.candidates??[]).some(c=>parts(c.content?.parts));
}

// The host executes responseContent before choices. Validate the same calls
// (including arguments and order) before returning the original envelope.
export function verifyBufferedToolMirrors(value,plan){
 if(Array.isArray(value.content)&&value.content.some(p=>p?.type!=='text'))fail('WRAP_MEDIA','正文工具包装收到非文字输出');
 if(value.responseContent?.parts===undefined)return;
 const parts=value.responseContent.parts;
 if(!Array.isArray(parts))fail('WRAP_MIRROR','原生工具响应格式无效');
 if(parts.some(p=>p?.inlineData||p?.fileData||p?.functionResponse))fail('WRAP_MEDIA','正文工具包装收到非文字输出');
 const native=parts.filter(p=>p?.functionCall).map(p=>p.functionCall);
 classifyToolTurn(native.map(f=>f.name),plan);
 const projected=value.choices?.[0]?.message?.tool_calls??[];
 const stable=v=>Array.isArray(v)?v.map(stable):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 if(native.length!==projected.length)fail('WRAP_MIRROR','宿主工具与检查工具数量不一致，回复未交给宿主执行');
 for(let i=0;i<native.length;i++){
  const n=native[i],p=projected[i];let args;
  try{args=JSON.parse(p.function.arguments);}catch{fail('WRAP_MIRROR','工具参数无法核对');}
  if(!object(n.args)||n.partialArgs||n.willContinue||n.name!==p.function.name||n.id&&p.id&&n.id!==p.id||JSON.stringify(stable(n.args))!==JSON.stringify(stable(args)))fail('WRAP_MIRROR','宿主工具与检查工具内容不一致，回复未交给宿主执行');
 }
}

// A mixed-tool stream is collected once so no synthetic call can escape to the
// host executor. The selected original bytes are then checked by existing parsers.
export async function selectToolTextStream(response,plan,status,{signal,guard,limit}){
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),chunks=[];
 let size=0,rejectAbort,raw='';
 const interrupted=new Promise((_,reject)=>{rejectAbort=reject;});interrupted.catch(()=>{});
 const abort=()=>{rejectAbort(signal.reason);reader.cancel(signal.reason).catch(()=>{});};
 signal.addEventListener('abort',abort,{once:true});
 try{
  for(;;){guard();signal.throwIfAborted();const r=await Promise.race([reader.read(),interrupted]);guard();signal.throwIfAborted();if(r.done)break;size+=r.value.byteLength;if(size>limit)fail('OUTPUT_LIMIT','正文工具响应超过本地读取限制');chunks.push(r.value);raw+=decoder.decode(r.value,{stream:true});}
  raw+=decoder.decode();
  const names=[],calls=new Map();let plainText=false;
  const parser=createSseParser(({data})=>{
   if(!data||data.trim()==='[DONE]')return;
   const p=JSON.parse(data);
   if(hasOutsideToolText(p))plainText=true;
   if(plan.protocol==='gemini')for(const c of p.candidates??[])for(const part of c.content?.parts??[]){
    if(!part.thought&&typeof part.text==='string'&&part.text.trim())plainText=true;
    if(part.inlineData||part.fileData)fail('WRAP_MEDIA','正文工具包装收到非文字输出');
    if(part.functionCall?.name)names.push(part.functionCall.name);
   }
   else for(const c of p.choices??[]){
    const d=c.delta??c.message;
    if(typeof d?.content==='string'&&d.content.trim())plainText=true;
    if(d?.function_call)fail('WRAP_LEGACY','正文工具包装收到旧式函数响应');
    if(d?.images||Array.isArray(d?.content)&&d.content.some(p=>p.type!=='text'))fail('WRAP_MEDIA','正文工具包装收到非文字输出');
    for(const [position,call]of (d?.tool_calls??[]).entries()){
     const key=(c.index??0)+':'+(call.index??position);
     if(!calls.has(key))calls.set(key,'');
     if(typeof call.function?.name==='string')calls.set(key,calls.get(key)+call.function.name);
    }
   }
  });parser.push(new TextEncoder().encode(raw));parser.finish();
  // Native partialArgs may repeat the same synthetic function name across frames.
  const selected=classifyToolTurn(plan.protocol==='gemini'?[...new Set(names)]:[...calls.values()],plan);
  if(selected==='synthetic'&&plainText)fail('WRAP_MIXED_TEXT','正文同时出现在工具内外，回复未被接纳');
  status.toolTextTurn=selected;status.bufferedToolStream=true;
  return {response:new Response(new Blob(chunks),{status:response.status,headers:response.headers}),selected};
 }finally{signal.removeEventListener('abort',abort);reader.cancel().catch(()=>{});reader.releaseLock();}
}
