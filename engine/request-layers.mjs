import {clone,fail} from './common.mjs';
import {compilePromptLayerPlan,LAYER_AUTHORITY_IDENTIFIER} from './prompt-layers.mjs';

export function wrapRequestLayer(text,layer){
 if(!['rule','tisya'].includes(layer))fail('REQUEST_LAYER','请求配置层级无效',{layer});
 const encoded=new RegExp('<\\/?'+layer+'\\b','i').test(text);
 const body=encoded?JSON.stringify(text).replaceAll('<','\\u003c'):text;
 return '<'+layer+(encoded?' encoding="json"':'')+'>\n'+body+'\n</'+layer+'>';
}

function occurrences(text,needle){
 const found=[];if(!needle)return found;
 for(let at=0;(at=text.indexOf(needle,at))!==-1;at+=needle.length)found.push(at);
 return found;
}

// Shared by preset replacement and final projection. History is recognized
// through the enabled preset's exact anchors, never by a quoted short label.
export function createPromptSourceMap(messages,preset,{expand=s=>s}={}){
 if(!Array.isArray(messages))fail('REQUEST_LAYERS_MESSAGES','最终请求缺少消息列表');
 const parts=[];let cursor=0;
 for(const [messageIndex,message]of messages.entries()){
  const add=(text,partIndex)=>{const part={text,partIndex,messageIndex,message,role:message.role,base:cursor};parts.push(part);cursor+=text.length+1;};
  if(typeof message.content==='string')add(message.content,null);
  else if(Array.isArray(message.content))for(const [index,item]of message.content.entries())if(item?.type==='text'&&typeof item.text==='string')add(item.text,index);
 }
 const all=parts.map(part=>part.text).join('\0'),ranges=[],tokens=[...all.matchAll(/<\s*\/?\s*DreamMaterial\b/gi)].map(token=>{
  const at=token.index,tail=all.slice(at);return {at,closing:/^<\/DreamMaterial\s*>/.exec(tail),opening:/^<DreamMaterial\s+source="[^"<>\r\n]*"\s*>/.exec(tail)};
 });
 // Locate exact history anchors without mistaking a sealed native quotation
 // for those anchors. This preliminary pass does not yet validate literals:
 // ordinary history may discuss an unmatched opening or closing tag.
 let stack=[],lastPart=null;
 for(const token of tokens){
  const part=parts.find(part=>token.at>=part.base&&token.at<part.base+part.text.length);
  if(part!==lastPart){stack=[];lastPart=part;}
  if(token.opening)stack.push(token.at);
  else if(token.closing&&stack.length)ranges.push({kind:'native',start:stack.pop(),end:token.at+token.closing[0].length});
 }
 const protection=(part,start,end)=>{
  const a=part.base+start,b=part.base+end;
  // An owned configuration may expand a native outlet in its middle. Keep
  // that complete DreamMaterial child at its lower source authority. A whole
  // historical quotation remains historical even when it contains such a child.
  const containing=ranges.find(range=>a>=range.start&&b<=range.end);
  if(containing)return containing.kind;
  for(const range of ranges){
   if(range.kind==='native'&&a<=range.start&&b>=range.end)continue;
   if(a<range.end&&range.start<b)fail('REQUEST_SOURCE_OVERLAP','配置片段跨越资料边界，未猜测归属');
  }
  return null;
 };
 const find=(text,{role}={})=>{
  const found=[],ignored={native:0,history:0};let wrongRole=0;
  for(const part of parts)for(const start of occurrences(part.text,text)){
   const end=start+text.length,kind=protection(part,start,end);
   if(kind){ignored[kind]++;continue;}
   if(role!==undefined&&part.role!==role){wrongRole++;continue;}
   found.push({part,start,end,globalStart:part.base+start,globalEnd:part.base+end});
  }
  return {found,wrongRole,ignored};
 };
 const plan=preset.layerPlan??compilePromptLayerPlan(preset),active=plan.entries.filter(entry=>entry.enabled&&!entry.marker),open=active.find(entry=>entry.identifier==='tisya_history_open'),close=active.find(entry=>entry.identifier==='tisya_history_close'),historyEnabled=plan.entries.some(entry=>entry.identifier==='chatHistory'&&entry.enabled&&entry.marker);
 let history=null;
 if(historyEnabled&&!open&&!close)fail('REQUEST_HISTORY_BOUNDARY','已启用聊天历史缺少可验证的资料边界');
 if(open||close){
  if(!open||!close)fail('REQUEST_HISTORY_BOUNDARY','历史资料边界只启用了一端');
  const expanded=entry=>{const text=expand(entry.content??'');if(typeof text!=='string')fail('REQUEST_LAYER_CONTENT','提示词展开结果不是文本',{identifier:entry.identifier});return text.trim();};
  const startText=expanded(open),endText=expanded(close);
  if(!startText||!endText)fail('REQUEST_HISTORY_BOUNDARY','已启用历史边界为空');
  const starts=find(startText,{role:open.role}).found,ends=find(endText,{role:close.role}).found;
  if(starts.length!==1||ends.length!==1)fail('REQUEST_HISTORY_BOUNDARY','历史资料边界缺失或重复，未猜测归属',{starts:starts.length,ends:ends.length});
  if(starts[0].globalEnd>ends[0].globalStart)fail('REQUEST_HISTORY_BOUNDARY','历史资料起止顺序无效');
  history={kind:'history',start:starts[0].globalEnd,end:ends[0].globalStart,open:starts[0],close:ends[0]};
 }
 // The verified history window is already lower-layer data. Ignore its literal
 // tags, then strictly validate every native delimiter outside that window.
 ranges.length=0;if(history)ranges.push(history);let opened=null;
 for(const {at,opening,closing}of tokens){
  if(history&&at>=history.start&&at<history.end)continue;
  if(closing){
   if(!opened)fail('REQUEST_SOURCE_BOUNDARY','原生资料结束标记缺少对应起点',{position:at});
   const end=at+closing[0].length;
   if(!parts.some(part=>opened.start>=part.base&&end<=part.base+part.text.length))fail('REQUEST_SOURCE_BOUNDARY','原生资料边界跨越消息或内容片段');
   if(history&&opened.start<history.end&&history.start<end)fail('REQUEST_SOURCE_OVERLAP','原生资料与历史边界交叉');
   ranges.push({kind:'native',start:opened.start,end});opened=null;
  }else if(opening){
   if(opened)fail('REQUEST_SOURCE_BOUNDARY','原生资料边界嵌套，未猜测归属',{position:at});
   opened={start:at};
  }else fail('REQUEST_SOURCE_BOUNDARY','原生资料边界格式无效',{position:at});
 }
 if(opened)fail('REQUEST_SOURCE_BOUNDARY','原生资料起点缺少对应结束标记',{position:opened.start});
 return {parts,ranges,history,protection,find};
}

// Native ingress must already have assigned source provenance. A quotation of
// a preset inside a sealed native source is not another owned preset fragment.
export function applyRequestLayers(messages,compiled,{expand=s=>s}={}){
 if(!Array.isArray(messages))fail('REQUEST_LAYERS_MESSAGES','最终请求缺少消息列表');
 const out=clone(messages),plan=compiled.layerPlan??compilePromptLayerPlan(compiled),sourceMap=createPromptSourceMap(out,compiled,{expand}),{parts}=sourceMap;
 const active=plan.entries.filter(entry=>entry.enabled&&!entry.marker),matches=[];
 const audit={version:1,priority:[...plan.priority],matched:[],wrapped:[],moved:[],skippedEmpty:[],nativeQuotedMatches:0,historyQuotedMatches:0,historyBoundary:sourceMap.history?'unique':'not-enabled',boundary:'not-enabled',authority:{present:plan.authority.present,enabled:plan.authority.enabled,inserted:false}};
 const expanded=entry=>{const text=expand(entry.content??'');if(typeof text!=='string')fail('REQUEST_LAYER_CONTENT','提示词展开结果不是文本',{identifier:entry.identifier});return text.trim();};

 function locate(entry,{optional=false,ownedWrapper=false}={}){
  const text=expanded(entry);if(!text){audit.skippedEmpty.push(entry.identifier);return null;}
  const found=[],wrapper=['rule','tisya'].includes(entry.layer)?wrapRequestLayer(text,entry.layer):null;
  let wrongRole=0;
  for(const part of parts){
   const add=(start,end,alreadyWrapped=false)=>{
    const source=sourceMap.protection(part,start,end);if(source){audit[source==='native'?'nativeQuotedMatches':'historyQuotedMatches']++;return;}
    if(part.role!==entry.role){wrongRole++;return;}
    if(!found.some(row=>row.part===part&&row.start===start&&row.end===end))found.push({entry,part,start,end,text,alreadyWrapped,globalStart:part.base+start,globalEnd:part.base+end});
   };
   if(wrapper)for(const at of occurrences(part.text,wrapper))add(at,at+wrapper.length,true);
   if(!ownedWrapper)for(const at of occurrences(part.text,text)){
    if(found.some(row=>row.part===part&&row.alreadyWrapped&&at>=row.start&&at+text.length<=row.end))continue;
    add(at,at+text.length);
   }
  }
  if(found.length>1)fail('REQUEST_LAYER_MATCH','已启用配置在最终请求中重复，未猜测归属',{identifier:entry.identifier,matches:found.length});
  if(!found.length){if(optional)return null;fail(wrongRole?'REQUEST_LAYER_ROLE':'REQUEST_LAYER_MISSING',wrongRole?'已启用配置的最终消息角色不匹配':'最终请求缺少已启用配置，未补造原文',{identifier:entry.identifier,role:entry.role});}
  return found[0];
 }

 const opening=active.find(entry=>entry.identifier==='tisya_material_boundary_open'),closing=active.find(entry=>entry.identifier==='tisya_material_boundary_close');
 let open=null,close=null;
 if(opening&&closing&&expanded(opening)&&expanded(closing)){
  open=locate(opening);close=locate(closing);
  if(open.globalEnd>close.globalStart)fail('REQUEST_LAYER_BOUNDARY','资料层起止顺序无效');
  audit.boundary='unique';
 }
 for(const entry of active){
  if(!['rule','tisya'].includes(entry.layer))continue;
  const match=locate(entry);if(!match)continue;
  if(matches.some(other=>match.globalStart<other.globalEnd&&other.globalStart<match.globalEnd))fail('REQUEST_LAYER_OVERLAP','已启用配置片段重叠，未猜测拆分',{identifier:entry.identifier});
  if(open&&[open,close].some(boundary=>match.globalStart<boundary.globalEnd&&boundary.globalStart<match.globalEnd))fail('REQUEST_LAYER_OVERLAP','配置片段与资料边界重叠',{identifier:entry.identifier});
  matches.push(match);audit.matched.push(entry.identifier);
 }
 const moving=matches.filter(match=>open&&match.globalStart>=open.globalEnd&&match.globalEnd<=close.globalStart).sort((a,b)=>a.globalStart-b.globalStart);
 const events=new Map(),event=(part,value)=>{if(!events.has(part))events.set(part,[]);events.get(part).push(value);};
 const movedMessages=[];
 const standalone=(match,content)=>{
  if(match.part.message.tool_calls||match.part.message.tool_call_id)fail('REQUEST_LAYER_TOOL_TURN','工具消息不能作为可移动预设配置',{identifier:match.entry.identifier});
  return {...clone(match.part.message),content};
 };
 for(const match of matches){
  const moved=moving.includes(match),content=match.alreadyWrapped?match.part.text.slice(match.start,match.end):wrapRequestLayer(match.text,match.entry.layer);
  if(moved){movedMessages.push({match,message:standalone(match,content)});audit.moved.push({identifier:match.entry.identifier,role:match.entry.role,layer:match.entry.layer});event(match.part,{kind:'replace',start:match.start,end:match.end,text:''});}
  else if(!match.alreadyWrapped)event(match.part,{kind:'replace',start:match.start,end:match.end,text:content});
  if(!match.alreadyWrapped)audit.wrapped.push({identifier:match.entry.identifier,role:match.entry.role,layer:match.entry.layer});
 }
 let prepend=[];
 if(!plan.authority.present&&plan.authority.enabled){
  const authority={...plan.authority,identifier:LAYER_AUTHORITY_IDENTIFIER,layer:'rule'},existing=locate(authority,{optional:true,ownedWrapper:true});
  if(!existing){
   const message={role:authority.role,content:wrapRequestLayer(expanded(authority),'rule')},reset=matches.find(match=>match.entry.identifier==='tisya_new_chat'),movedReset=movedMessages.findIndex(item=>item.match===reset);
   if(movedReset>=0)movedMessages.splice(movedReset+1,0,{match:null,message});
   else if(reset)event(reset.part,{kind:'insert',start:reset.end,messages:[message],priority:0});
   else prepend=[message];
   audit.authority.inserted=true;
  }
 }
 if(movedMessages.length)event(open.part,{kind:'insert',start:open.start,messages:movedMessages.map(item=>item.message),priority:1});

 const result=[...prepend],partsByMessage=new Map();
 for(const part of parts){if(!partsByMessage.has(part.messageIndex))partsByMessage.set(part.messageIndex,new Map());partsByMessage.get(part.messageIndex).set(part.partIndex,part);}
 for(const [messageIndex,message]of out.entries()){
  const textParts=partsByMessage.get(messageIndex);
  if(!textParts||![...textParts.values()].some(part=>events.has(part))){result.push(message);continue;}
  const stringContent=typeof message.content==='string';let buffer=[];
  const append=(text,template)=>{if(text)buffer.push({...clone(template),text});};
  const flush=()=>{
   const content=stringContent?buffer.map(item=>item.text).join(''):buffer;
   const meaningful=stringContent?content.trim().length:content.some(item=>item.type!=='text'||item.text.trim().length);
   if(meaningful)result.push({...clone(message),content});
   buffer=[];
  };
  const items=stringContent?[{type:'text',text:message.content}]:message.content;
  for(const [partIndex,item]of items.entries()){
   const part=textParts.get(stringContent?null:partIndex),operations=part?events.get(part):null;
   if(!operations){buffer.push(clone(item));continue;}
   let at=0;
   for(const operation of operations.sort((a,b)=>a.start-b.start||Number(a.kind!=='insert')-Number(b.kind!=='insert')||(a.priority??0)-(b.priority??0))){
    if(operation.start<at)fail('REQUEST_LAYER_OVERLAP','配置改写与插入位置冲突');
    append(item.text.slice(at,operation.start),item);
    if(operation.kind==='insert'){flush();result.push(...operation.messages.map(message=>clone(message)));at=operation.start;}
    else{append(operation.text,item);at=operation.end;}
   }
   append(item.text.slice(at),item);
  }
  flush();
 }
 return {messages:result,audit};
}
