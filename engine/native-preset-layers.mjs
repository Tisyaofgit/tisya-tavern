import {compilePrompts} from './config.mjs';
import {applyRequestLayers,wrapRequestLayer,createPromptSourceMap} from './request-layers.mjs';
import {clone,fail} from './common.mjs';

// Compile the actual manager's selected preset before its one native macro
// expansion and token accounting. Agent preset-ref assemblies use a separate
// manager and must cross this same boundary, even without SETTINGS_READY.
export function createNativePresetLayers({settings,slots,type='normal'}){
 const owners=new WeakMap();let finalization=null,finalizedCompiled=null,managerCount=0;
 function owner(manager){
  let value=owners.get(manager);if(value)return value;
  const prompts=manager?.serviceSettings?.prompts;
  if(!Array.isArray(prompts))fail('NATIVE_PRESET_SETTINGS','宿主没有提供本轮真实预设');
  const order=typeof manager.getPromptOrderForCharacter==='function'
   ?manager.getPromptOrderForCharacter(manager.activeCharacter)
   :manager.serviceSettings.prompt_order?.find(row=>row.character_id===100001)?.order;
  if(!Array.isArray(order))fail('NATIVE_PRESET_ORDER','宿主没有提供本轮真实预设顺序');
  const scopedOrder=order.map(entry=>{
   const prompt=prompts.find(row=>row.identifier===entry.identifier);
   return {...entry,enabled:entry.enabled===true&&(typeof manager.shouldTrigger!=='function'||manager.shouldTrigger(prompt,String(type||'normal').toLowerCase().trim()))};
  });
  const compiled=compilePrompts({prompts:clone(prompts),order:scopedOrder},settings,slots);
  const entries=new Map(compiled.layerPlan.entries.map(entry=>[entry.identifier,entry]));
  const authority=compiled.layerPlan.authority;
  const anchor=!authority.present&&authority.enabled?compiled.layerPlan.entries.find(entry=>entry.enabled&&!entry.marker&&['rule','tisya'].includes(entry.layer)&&entry.role===authority.role&&entry.content.trim()):null;
  if(!authority.present&&authority.enabled&&!anchor)fail('NATIVE_PRESET_AUTHORITY','旧预设没有可承载层级定义的启用条目');
  value={compiled,entries,expanded:new Map(),authority,anchor,number:++managerCount};owners.set(manager,value);return value;
 }
 function preparePreset(prompt,manager){
  const value=owner(manager),entry=value.entries.get(prompt.identifier);
  if(!entry||entry.marker||!entry.enabled||prompt.extension===true)return null;
  return {content:entry.content,finish(text){
   if(typeof text!=='string')fail('NATIVE_PRESET_EXPANSION','预设原生展开结果不是文本',{identifier:entry.identifier});
   const previous=value.expanded.get(entry.identifier);
   if(previous!==undefined&&previous!==text)fail('NATIVE_PRESET_EXPANSION_CHANGED','同轮配置展开结果不一致',{identifier:entry.identifier});
   value.expanded.set(entry.identifier,text);
   let content=['rule','tisya'].includes(entry.layer)&&text.trim()?wrapRequestLayer(text.trim(),entry.layer):text;
   if(value.anchor?.identifier===entry.identifier){
    if(/\{\{/.test(value.authority.content))fail('NATIVE_PRESET_AUTHORITY_MACRO','内置层级定义包含未声明的宏');
    content+='\n'+wrapRequestLayer(value.authority.content.trim(),'rule');
   }
   return content;
  }};
 }
 function finalizeMessages(messages,{manager}={}){
  const value=owner(manager);
  const entries=value.compiled.layerPlan.entries.map(entry=>{
   if(!entry.enabled||entry.marker)return entry;
   if(!value.expanded.has(entry.identifier))fail('NATIVE_PRESET_UNPREPARED','启用配置未经过本轮原生展开',{identifier:entry.identifier});
   return {...entry,content:value.expanded.get(entry.identifier)};
  });
  const compiled={...value.compiled,layerPlan:{...value.compiled.layerPlan,entries}};
  const result=applyRequestLayers(messages,compiled);
  const sources=createPromptSourceMap(result.messages,compiled);
  for(const part of sources.parts)for(const match of part.text.matchAll(/\{\{tisya_[^{}]+\}\}/g))if(!sources.protection(part,match.index,match.index+match[0].length))fail('UNEXPANDED_MACRO','最终请求有未展开的缇斯亚资料宏');
  finalizedCompiled=compiled;
  finalization={manager:value.number,managers:managerCount,compiledBeforeNativeBudget:true,macroExpansion:'native-once',...result.audit};
  return result.messages;
 }
 return {preparePreset,finalizeMessages,lastFinalization:()=>finalization?clone(finalization):null,sourceMap:messages=>{
  if(!finalizedCompiled)fail('NATIVE_PRESET_UNFINALIZED','本轮配置尚未完成最终分层');
  return createPromptSourceMap(messages,finalizedCompiled);
 }};
}
