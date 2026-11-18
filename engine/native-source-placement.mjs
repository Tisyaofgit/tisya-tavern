import {clone,fail} from './common.mjs';
import {createPromptSourceMap,wrapRequestLayer} from './request-layers.mjs';

export const NATIVE_DREAM_OPEN='<NativeDreamSources>';
export const NATIVE_DREAM_CLOSE='</NativeDreamSources>';

export function insertNativeDreamSources(messages,compiled,material){
 if(!material.length)return {messages,content:null};
 const content=[NATIVE_DREAM_OPEN,...material,NATIVE_DREAM_CLOSE].join('\n');
 const sourceMap=createPromptSourceMap(messages,compiled);
 const active=compiled.layerPlan.entries.filter(entry=>entry.enabled&&!entry.marker);
 const boundary=id=>{
  const entry=active.find(candidate=>candidate.identifier===id);
  if(!entry?.content?.trim())fail('NATIVE_SOURCE_DESTINATION','梦境资料层必须具备启用的起止边界');
  const found=sourceMap.find(entry.content.trim(),{role:entry.role}).found;
  if(found.length!==1)fail('NATIVE_SOURCE_DESTINATION','梦境资料层边界缺失或重复');
  return found[0];
 };
 const open=boundary('tisya_material_boundary_open'),close=boundary('tisya_material_boundary_close');
 if(open.globalEnd>close.globalStart)fail('NATIVE_SOURCE_DESTINATION','梦境资料层起止顺序无效');
 const {messageIndex,partIndex}=close.part,anchor=messages[messageIndex];
 if(anchor.role==='tool'||anchor.tool_calls||anchor.tool_call_id)
  fail('NATIVE_SOURCE_DESTINATION','梦境资料层结束边界不能位于工具消息内');
 const first=typeof anchor.content==='string'
  ? anchor.content.slice(0,close.start)
  : [...anchor.content.slice(0,partIndex),{...anchor.content[partIndex],text:close.part.text.slice(0,close.start)}];
 const last=typeof anchor.content==='string'
  ? anchor.content.slice(close.start)
  : [{...anchor.content[partIndex],text:close.part.text.slice(close.start)},...anchor.content.slice(partIndex+1)];
 const inserted=[];
 if(hasContent(first))inserted.push({...anchor,content:first});
 inserted.push({role:'assistant',content});
 if(hasContent(last))inserted.push({...anchor,content:last});
 return {messages:[...messages.slice(0,messageIndex),...inserted,...messages.slice(messageIndex+1)],content};
}

function hasContent(content){
 if(typeof content==='string')return !!content.trim();
 if(Array.isArray(content))return content.some(part=>part.type!=='text'||part.text?.trim());
 return !!content;
}

// Only this generation's unpredictable ownership tokens identify movable data.
// A historical quotation of an identical DreamMaterial block is never selected.
export function createNativeSourcePlacement(){
 const boundaries=[],byText=new Map();
 const strip=text=>typeof text==='string'?boundaries.reduce((s,b)=>s.replaceAll(b.start,'').replaceAll(b.end,''),text):text;
 function mark(text){
  text=strip(text);const prior=byText.get(text);if(prior)return prior.start+text+prior.end;
  const id=globalThis.crypto.randomUUID(),boundary={start:'⟦TISYA_SOURCE_START_'+id+'⟧',end:'⟦TISYA_SOURCE_END_'+id+'⟧'};
  boundaries.push(boundary);byText.set(text,boundary);return boundary.start+text+boundary.end;
 }
 function relocate(messages,compiled,cardSources=[]){
  const out=clone(messages),sources=[];
  // Remove only owned spans, in final native order, including injections attached
  // inside history. Leave the surrounding user/assistant text and media intact.
  function take(text,message,collector=sources){
   const spans=[],encoded=[];
   // A preset may quote its own layer tag, causing lossless JSON framing.
   // Decode only an actual encoded upper-layer envelope, extract its owned
   // sources, then re-encode the remaining rule with the same layer wrapper.
   for(const match of text.matchAll(/<(rule|tisya) encoding="json">\n([\s\S]*?)\n<\/\1>/g)){
    if(!boundaries.some(b=>match[2].includes(b.start)||match[2].includes(b.end)))continue;
    let raw;try{raw=JSON.parse(match[2]);}catch{fail('NATIVE_SOURCE_PLACEMENT','配置 JSON 包裹损坏，不能安全归位');}
    if(typeof raw!=='string')fail('NATIVE_SOURCE_PLACEMENT','配置 JSON 包裹不是文本');
    const children=[],remaining=take(raw,message,children),span={start:match.index,end:match.index+match[0].length,replacement:wrapRequestLayer(remaining,match[1]),sources:children};
    encoded.push(span);spans.push(span);
   }
   for(const b of boundaries){
    let at=0;
    while((at=text.indexOf(b.start,at))!==-1){
     const container=encoded.find(span=>at>=span.start&&at<span.end);if(container){at=container.end;continue;}
     const begin=at+b.start.length,end=text.indexOf(b.end,begin);
     if(end<0)fail('NATIVE_SOURCE_PLACEMENT','原生资料归位缺少完整结束边界');
     const content=text.slice(begin,end);
     if(!/^<DreamMaterial source="[^"<>\r\n]*">\n[\s\S]*\n<\/DreamMaterial>$/.test(content))fail('NATIVE_SOURCE_PLACEMENT','原生资料包裹在最终配置中被改写，不能安全归位');
     spans.push({start:at,end:end+b.end.length,content});at=end+b.end.length;
    }
   }
   let cursor=0,result='';
   for(const span of spans.sort((a,b)=>a.start-b.start)){
    if(span.start<cursor)fail('NATIVE_SOURCE_PLACEMENT','原生资料归位边界重叠');
    if(message.role==='tool'||message.tool_calls||message.tool_call_id)fail('NATIVE_SOURCE_PLACEMENT','工具消息中的原生资料不能作为普通资料移动');
    result+=text.slice(cursor,span.start)+(span.replacement??'');cursor=span.end;
    if(span.sources)collector.push(...span.sources);
    else {
     collector.push(span.content);
    }
   }
   result+=text.slice(cursor);
   if(boundaries.some(b=>result.includes(b.start)||result.includes(b.end)))fail('NATIVE_SOURCE_PLACEMENT','原生资料归位残留不完整边界');
   return result;
  }
  for(const message of out){
   if(typeof message.content==='string')message.content=take(message.content,message);
   else if(Array.isArray(message.content))for(const part of message.content)if(part?.type==='text')part.text=take(part.text,message);
  }
  sources.unshift(...cardSources);
  const remaining=out.filter(message=>hasContent(message.content)||message.tool_calls||message.role==='tool');
  const inserted=insertNativeDreamSources(sources.length?remaining:out,compiled,sources);
  return {...inserted,audit:{placement:'dream-material',role:'assistant',moved:sources.length,order:'native-final-order'}};
 }
 return {mark,strip,relocate};
}
