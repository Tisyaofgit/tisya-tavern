import {clone,fail} from './common.mjs';
import {createPromptSourceMap,wrapRequestLayer} from './request-layers.mjs';
import {insertNativeDreamSources} from './native-source-placement.mjs';
import {wrapNativeSource} from './native-source-layers.mjs';
import {isStockPrompt} from './prompt-layers.mjs';

const upper=role=>role==='system'||role==='developer';
const tool=message=>message.role==='tool'||message.tool_calls||message.tool_call_id;
const meaningful=content=>typeof content==='string'?!!content.trim():Array.isArray(content)&&content.some(part=>part?.type!=='text'||part.text?.trim());

// Only shipped Tisya entries retain upper-layer authority. Card/book text and
// user-added system prompts are moved verbatim; no per-card cleanup is needed.
export function projectSystemAuthority(messages,compiled,{expand=s=>s}={}){
 if(!Array.isArray(messages))fail('SYSTEM_AUTHORITY_MESSAGES','最终请求缺少消息列表');
 const out=clone(messages),sourceMap=createPromptSourceMap(out,compiled,{expand}),owned=new Map(),material=[],audit={status:'tisya-system-only',movedMessages:0,movedParts:0,movedCharacters:0,sources:[]};
 const active=[...(compiled.layerPlan?.entries??[])],fallback=compiled.layerPlan?.authority;
 // Legacy installed presets receive the stock authority during request-layer
 // projection. That generated rule is Tisya-owned too, not foreign system text.
 if(fallback&&!fallback.present&&fallback.enabled)active.push({...fallback,layer:'rule',marker:false});
 for(const entry of active){
  if(!entry.enabled||entry.marker||!upper(entry.role)||!isStockPrompt(entry.identifier))continue;
  const text=expand(entry.content??'').trim();if(!text)continue;
  const wrapper=['rule','tisya'].includes(entry.layer)?wrapRequestLayer(text,entry.layer):null;
  const wrapped=wrapper?sourceMap.find(wrapper,{role:entry.role}).found:[];
  const matches=wrapped.length?wrapped:sourceMap.find(text,{role:entry.role}).found;
  for(const match of matches){
   const key=match.part.messageIndex+':'+String(match.part.partIndex);
   if(!owned.has(key))owned.set(key,[]);owned.get(key).push({start:match.start,end:match.end});
  }
 }
 const add=(text,kind)=>{
  if(!text.trim())return;
  const value=kind==='native'?text:wrapNativeSource(text,kind==='history'?'聊天系统记录':'外来系统提示词');
  material.push(value);audit.movedParts++;audit.movedCharacters+=text.length;
  if(!audit.sources.includes(kind))audit.sources.push(kind);
 };
 for(const [messageIndex,message]of out.entries()){
  if(!upper(message.role)||tool(message))continue;
  let moved=false;
  const project=(text,partIndex)=>{
   const key=messageIndex+':'+String(partIndex),keep=owned.get(key)??[],part=sourceMap.parts.find(row=>row.messageIndex===messageIndex&&row.partIndex===partIndex);
   if(!part)fail('SYSTEM_AUTHORITY_FORMAT','系统消息文本位置无法核验');
   const ranges=sourceMap.ranges.filter(range=>range.start<part.base+text.length&&range.end>part.base).map(range=>({start:Math.max(range.start,part.base)-part.base,end:Math.min(range.end,part.base+text.length)-part.base,kind:range.kind}));
   const cuts=new Set([0,text.length]);
   for(const range of [...keep,...ranges]){if(range.start>0)cuts.add(range.start);if(range.end<text.length)cuts.add(range.end);}
   const points=[...cuts].sort((a,b)=>a-b);let result='';
   for(let i=0;i+1<points.length;i++){
    const start=points[i],end=points[i+1];if(start===end)continue;
    if(keep.some(range=>start>=range.start&&end<=range.end)){result+=text.slice(start,end);continue;}
    const range=ranges.find(range=>start>=range.start&&end<=range.end),fragment=text.slice(start,end);
    // Separators between owned preset entries are host formatting, not a
    // foreign system instruction. Preserve them instead of creating noise.
    if(!fragment.trim()){result+=fragment;continue;}
    add(fragment,range?.kind??'external');moved=true;
   }
   return result;
  };
  if(typeof message.content==='string')message.content=project(message.content,null);
  else if(Array.isArray(message.content))message.content=message.content.flatMap((part,index)=>{
   if(part?.type!=='text'||typeof part.text!=='string')return [part];
   const text=project(part.text,index);return text.trim()?[{...part,text}]:[];
  });
  if(moved)audit.movedMessages++;
 }
 const remaining=out.filter(message=>!upper(message.role)||tool(message)||meaningful(message.content));
 if(!material.length)return {messages:remaining,audit};
 const inserted=insertNativeDreamSources(remaining,compiled,material,{expand});
 return {messages:inserted.messages,audit};
}
