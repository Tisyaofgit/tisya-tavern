import {fail} from './common.mjs';
import {wrapNativeSource} from './native-source-layers.mjs';
import {insertNativeDreamSources,NATIVE_DREAM_OPEN,NATIVE_DREAM_CLOSE} from './native-source-placement.mjs';

// Prompt Template 1.17 adds system rows and before/after text during
// CHAT_COMPLETION_SETTINGS_READY. Mark the host-owned content across that
// event so its output can be moved as data without re-running the template.
const templateOutlet=/\{\{outletPromptsInjected:[^{}\r\n]+\}\}|<%[-=]\s*(?:await\s+)?(?:getPromptsInjected|getWorldInfo|getWorldInfoEntries)\s*\([^%]*?%>/g;
const isTool=message=>message.role==='tool'||!!message.tool_calls||!!message.tool_call_id;
const kind='世界书提示词模板';
const isUpper=role=>role==='system'||role==='developer';

function boundary(){
 const id=globalThis.crypto.randomUUID();
 return {start:'⟦TISYA_TEMPLATE_START_'+id+'⟧',end:'⟦TISYA_TEMPLATE_END_'+id+'⟧'};
}
function splitMarked(text,{start,end}){
 const a=typeof text==='string'?text.indexOf(start):-1;
 const b=a<0?-1:text.indexOf(end,a+start.length);
 if(a<0||b<0||text.indexOf(start,a+start.length)!==-1||text.indexOf(end)!==b||text.indexOf(end,b+end.length)!==-1)
  fail('TEMPLATE_SOURCE_BOUNDARY','提示词模板改写了来源边界，本轮无法确认资料归属');
 return {before:text.slice(0,a),inside:text.slice(a+start.length,b),after:text.slice(b+end.length)};
}

export function captureTemplateSources(messages,nativeContent){
 if(!Array.isArray(messages))fail('TEMPLATE_SOURCE_MESSAGES','宿主没有提供提示词模板的原始消息');
 const rows=new Map();
 let nativeFound=false;
 const prepared=messages.map(message=>{
  if(isTool(message))return message;
  const isNative=!nativeFound&&message.role==='assistant'&&typeof nativeContent==='string'&&message.content===nativeContent;
  if(isNative)nativeFound=true;
  const parts=new Map();
  const frame=(text,index)=>{
   const outer=boundary(),outlets=[];
   const body=isNative
    ? text.slice(NATIVE_DREAM_OPEN.length+1,-NATIVE_DREAM_CLOSE.length-1)
    : text.replace(templateOutlet,token=>{
     const outlet={...boundary(),token};outlets.push(outlet);
     return outlet.start+token+outlet.end;
    });
   const upperLiteral=!isNative&&isUpper(message.role)?text.replace(templateOutlet,''):null;
   parts.set(index,{outer,outlets,upperLiteral});
   return outer.start+body+outer.end;
  };
  const content=typeof message.content==='string'
   ? frame(message.content,null)
   : Array.isArray(message.content)
    ? message.content.map((part,index)=>part?.type==='text'&&typeof part.text==='string'?{...part,text:frame(part.text,index)}:part)
    : message.content;
  const next=parts.size?{...message,content}:message;
  rows.set(next,{role:message.role,parts,isNative});
  return next;
 });
 if(nativeContent&&!nativeFound)fail('TEMPLATE_SOURCE_MISSING','模板展开前缺少已核验的梦境原生资料');
 return {messages:prepared,rows};
}

export function projectTemplateSources(messages,capture,compiled){
 if(!Array.isArray(messages))fail('TEMPLATE_SOURCE_MESSAGES','提示词模板没有返回消息数组');
 const remaining=[],material=[],seen=new Set();
 let additions=0;
 const collect=text=>{
  if(text.trim()){material.push(wrapNativeSource(text,kind));additions++;}
 };
 for(const message of messages){
  const row=capture.rows.get(message);
  if(!row){
   if(isTool(message)){remaining.push(message);continue;}
   if(typeof message.content!=='string')fail('TEMPLATE_SOURCE_FORMAT','提示词模板新增的消息须为可识别的文本资料');
   collect(message.content);continue;
  }
  if(seen.has(message)||row.role!==message.role)fail('TEMPLATE_SOURCE_ROLE','提示词模板改写了原有消息的身份');
  seen.add(message);
  if(!row.parts.size){remaining.push(message);continue;}
  const unframe=(text,index)=>{
   const part=row.parts.get(index);
   if(!part)fail('TEMPLATE_SOURCE_FORMAT','提示词模板改动了原有附件的文本位置');
   const {before,inside,after}=splitMarked(text,part.outer);
   collect(before);
   let owned=inside;
   if(row.isNative)material.push(owned);
   else for(const outlet of part.outlets){
    const value=splitMarked(owned,outlet);
    if(value.inside===outlet.token)fail('TEMPLATE_SOURCE_UNEXPANDED','世界书模板出口没有展开');
    collect(value.inside);
    owned=value.before+value.after;
   }
   if(part.upperLiteral!==null&&owned!==part.upperLiteral)
    fail('TEMPLATE_SOURCE_UPPER_CHANGED','提示词模板改写了缇斯亚系统原文，无法确认这段生成文字的来源');
   collect(after);
   return owned;
  };
  if(row.isNative){unframe(message.content,null);continue;}
  const content=typeof message.content==='string'
   ? unframe(message.content,null)
   : Array.isArray(message.content)
    ? message.content.map((part,index)=>part?.type==='text'?{...part,text:unframe(part.text,index)}:part)
    : fail('TEMPLATE_SOURCE_FORMAT','提示词模板改动了原有消息格式');
  const count=typeof content==='string'?1:content.filter(part=>part?.type==='text').length;
  if(count!==row.parts.size)fail('TEMPLATE_SOURCE_FORMAT','提示词模板改动了原有文本片段数量');
  remaining.push({...message,content});
 }
 for(const [message,row]of capture.rows)if(row.parts.size&&!seen.has(message))
  fail('TEMPLATE_SOURCE_MISSING','提示词模板替换或移除了原有消息来源');
 // Preserve any original tools and media. Refuse to send leaked temporary tags.
 if([...material,...remaining.map(message=>JSON.stringify(message.content))].some(text=>/⟦TISYA_TEMPLATE_(?:START|END)_[0-9a-f-]+⟧/u.test(text)))
  fail('TEMPLATE_SOURCE_BOUNDARY','待发送消息仍包含提示词模板追踪标记');
 return {...insertNativeDreamSources(remaining,compiled,material),additions};
}

export function usesPromptTemplate(ctx){
 const setting=ctx.extensionSettings?.EjsTemplate;
 return Boolean(setting&&setting.enabled!==false&&setting.generate_enabled!==false);
}
