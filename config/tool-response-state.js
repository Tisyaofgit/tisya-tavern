// Per-response parser state. Tool arguments are data until the loop preflights
// the complete batch; streaming fragments never execute a tool.
const clone=structuredClone;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail(message){const e=Error(message);e.code='TISYA_RESPONSE_TOOL_PROTOCOL';throw e;}
const MAX_CALLS=8,MAX_ARGUMENTS=32768,MAX_CONTENT=262144,MAX_SIGNATURE=262144,MAX_METADATA=528384;
export function toolResponseState(){
 const calls=new Map();let reason=null,reasoning='',nativeIndex=0,signature=null;
 function providerMetadata(value){if(value?.native!=null||value?.reasoning_details!=null&&(!Array.isArray(value.reasoning_details)||value.reasoning_details.length))fail('该供应商原生思考回传元数据尚未适配，工具循环已停止');if(value?.signature!==undefined){if(typeof value.signature!=='string'||value.signature.length>MAX_SIGNATURE)fail('工具签名元数据无效或过长');signature=value.signature;}}
 function normalized(list){
  if(!Array.isArray(list)||!list.length||list.length>MAX_CALLS)fail('工具调用批次须为1—8项');
  const ids=new Set();return list.map(c=>{
   if(!object(c)||c.type!==undefined&&c.type!=='function'||!object(c.function)||typeof c.id!=='string'||!c.id.trim()||c.id.length>256||ids.has(c.id)||typeof c.function.name!=='string'||!c.function.name.trim()||c.function.name.length>128)fail('工具调用身份无效或ID重复');ids.add(c.id);
   if(c.signature!==undefined&&(typeof c.signature!=='string'||c.signature.length>MAX_SIGNATURE)||c.extra_content!==undefined&&JSON.stringify(c.extra_content).length>MAX_METADATA)fail('工具签名元数据无效或过长');
   const args=typeof c.function.arguments==='string'?c.function.arguments:JSON.stringify(c.function.arguments);
   if(typeof args!=='string'||args.length>MAX_ARGUMENTS)fail('工具参数缺失或超出长度限制');
   return {id:c.id,type:'function',function:{name:c.function.name,arguments:args},...(c.signature?{signature:clone(c.signature)}:{}),...(c.extra_content!==undefined?{extra_content:clone(c.extra_content)}:{})};
  });
 }
 function result(content,list){
  if(content.length>MAX_CONTENT||reasoning.length>MAX_CONTENT)fail('工具响应超出长度限制');
  const toolCalls=list?normalized(list):[];
  return {content,toolCalls,assistant:{role:'assistant',content:content||null,...(toolCalls.length?{tool_calls:clone(toolCalls)}:{}),...(reasoning?{reasoning_content:reasoning}:{}),...(signature?{signature}:{})}};
 }
 return {
  json(payload){
   const choice=payload?.choices?.find?.(c=>c?.index===0)??payload?.choices?.find?.(c=>c?.index===undefined),m=choice?.message;providerMetadata(m);
   if(m?.tool_calls!==undefined&&!payload?.responseContent?.parts?.some?.(p=>p.functionCall)){if(choice.finish_reason!=='tool_calls')fail('工具响应缺少tool_calls完成标记');if(m.refusal)fail('拒绝响应不能同时执行工具');reasoning=typeof m.reasoning_content==='string'?m.reasoning_content:'';return result(typeof m.content==='string'?m.content:'',m.tool_calls);}
   if(payload?.stop_reason==='tool_use'){
    if(!Array.isArray(payload.content))fail('工具响应缺少内容块');let text='';const list=[];
    for(const p of payload.content){if(p.type==='text'&&typeof p.text==='string')text+=p.text;else if(p.type==='tool_use')list.push({id:p.id,function:{name:p.name,arguments:p.input}});else fail('该原始Claude内容块回传尚未适配，请使用宿主标准响应');}
    return result(text,list);
   }
   const candidate=payload?.candidates?.[0],parts=candidate?.content?.parts??payload?.responseContent?.parts;
   if(Array.isArray(parts)&&parts.some(p=>p.functionCall)){
    const finish=candidate?.finishReason??payload.finishReason??choice?.finish_reason;if(!['STOP','stop','tool_calls'].includes(finish))fail('Gemini工具响应未正常完成');let text='';const list=[];
    for(const p of parts){if(p.functionCall){const f=p.functionCall;list.push({id:f.id||'tisya_'+crypto.randomUUID(),function:{name:f.name,arguments:f.args===undefined?{}:f.args},...(p.thoughtSignature?{signature:p.thoughtSignature,extra_content:{google:{thought_signature:p.thoughtSignature}}}:{})});}else if(typeof p.text==='string'){if(p.thought!==true)text+=p.text;if(p.thoughtSignature!==undefined){if(typeof p.thoughtSignature!=='string'||p.thoughtSignature.length>MAX_SIGNATURE)fail('工具签名元数据无效或过长');signature=p.thoughtSignature;}}else fail('档案助手不支持该Gemini响应内容块');}
    return result(text,list);
   }
   return null;
  },
  nativeFrame(payload){
   if(payload.promptFeedback?.blockReason)fail('Gemini工具流被拦截：'+String(payload.promptFeedback.blockReason));
   if(!Object.hasOwn(payload,'candidates'))return undefined;
   if(!Array.isArray(payload.candidates))fail('Gemini候选格式无效');
   if(!payload.candidates.length){if(payload.usageMetadata)return null;fail('Gemini流没有候选');}
   const candidate=payload.candidates.find(c=>c?.index===0)??payload.candidates.find(c=>c?.index===undefined);if(!candidate)return null;
   const parts=candidate.content?.parts??[];if(!Array.isArray(parts))fail('Gemini流内容块格式无效');
   const delta={content:'',tool_calls:[]};
   for(const p of parts){
    if(!object(p))fail('Gemini内容块无效');
    // Native SSE relays may emit an empty terminal padding part.
    if(Object.keys(p).length===0)continue;
    if(p.functionCall){const f=p.functionCall;delta.tool_calls.push({index:nativeIndex++,id:f.id||'tisya_'+crypto.randomUUID(),type:'function',function:{name:f.name,arguments:JSON.stringify(f.args===undefined?{}:f.args)},...(p.thoughtSignature?{signature:p.thoughtSignature,extra_content:{google:{thought_signature:p.thoughtSignature}}}:{})});}
    else if(p.thought!==true&&typeof p.text==='string')delta.content+=p.text;
    else if(p.thought===true&&typeof p.text==='string')delta.reasoning_content=(delta.reasoning_content??'')+p.text;
    else fail('档案助手只接收文本和已授权档案工具，不接受其他响应内容块');
    if(!p.functionCall&&p.thoughtSignature!==undefined){if(typeof p.thoughtSignature!=='string'||p.thoughtSignature.length>MAX_SIGNATURE)fail('工具签名元数据无效或过长');signature=p.thoughtSignature;}
   }
   if(!delta.tool_calls.length)delete delta.tool_calls;
   const finish=candidate.finishReason;return {index:0,delta,finish_reason:finish==='STOP'?(nativeIndex?'tool_calls':'stop'):finish===''?null:finish??null};
  },
  delta(choice){
   if(choice.finish_reason!==undefined&&choice.finish_reason!==null)reason=choice.finish_reason;
   const d=choice.delta;providerMetadata(d);if(typeof d?.reasoning_content==='string'){reasoning+=d.reasoning_content;if(reasoning.length>MAX_CONTENT)fail('工具响应超出长度限制');}
   if(d?.tool_calls===undefined)return;
   if(!Array.isArray(d.tool_calls))fail('工具流片段格式无效');
   for(const c of d.tool_calls){
    if(!object(c)||!Number.isSafeInteger(c.index)||c.index<0||c.index>=MAX_CALLS)fail('工具流序号无效');
    const v=calls.get(c.index)??{id:'',type:'function',function:{name:'',arguments:''}};
    // Compatible relays use null for an omitted type in subsequent SSE deltas.
    // Final call identity is still validated; concrete unsupported types fail.
    if(c.type!=null&&c.type!=='function')fail('不支持该工具类型');
    for(const key of ['id'])if(c[key]!==undefined){if(typeof c[key]!=='string')fail('工具流身份格式无效');v[key]+=c[key];}
    if(c.function!==undefined){if(!object(c.function))fail('工具流函数格式无效');for(const key of ['name','arguments'])if(c.function[key]!==undefined){if(typeof c.function[key]!=='string')fail('工具流参数必须为字符串片段');v.function[key]+=c.function[key];}}
    for(const key of ['signature','extra_content'])if(c[key]!==undefined){if(v[key]!==undefined&&JSON.stringify(v[key])!==JSON.stringify(c[key]))fail('工具签名在流中改变');v[key]=clone(c[key]);}
    if(v.function.arguments.length>MAX_ARGUMENTS||v.id.length>256||v.function.name.length>128)fail('工具流片段超出长度限制');calls.set(c.index,v);
   }
  },
  finish(content){
   if(calls.size){if(reason!=='tool_calls')fail('工具流提前结束，缺少tool_calls完成标记');const entries=[...calls].sort((a,b)=>a[0]-b[0]);if(entries.some(([i],n)=>i!==n))fail('工具流序号不连续');return result(content,entries.map(([,c])=>c));}
   if(reason==='tool_calls')fail('工具完成标记没有实际调用');return result(content);
  },
  final:content=>result(content),
 };
}
