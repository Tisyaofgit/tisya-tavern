import {HEART_DIRECTIONS,HEART_ROWS} from './preset-hearts.js';
// The native preset owns prompt text, order and switches. This adapter only
// resolves the output-mode macros; it never installs a preset or writes data.
export function outputEnabled({prompts,order}){
 if(!Array.isArray(prompts)||!Array.isArray(order))throw Error('TISYA_PRESET_SOURCE_UNAVAILABLE');
 const entries=prompts.filter(p=>p?.identifier==='tisya_output'),slots=order.filter(p=>p?.identifier==='tisya_output');
 if(entries.length>1||slots.length>1)throw Error('TISYA_PRESET_DUPLICATE_OUTPUT');
 if(!entries.length||!slots.length)return false;
 const entry=entries[0],slot=slots[0];
 if(typeof slot.enabled!=='boolean'||entry.enabled!==undefined&&typeof entry.enabled!=='boolean')throw Error('TISYA_PRESET_SWITCH_INVALID');
 return slot.enabled&&entry.enabled!==false;
}
export const DELIVERY_WARNING='【特别警告】\n内部规划与检查完成后，立即按既定格式输出完整的 <reply> 正文；不复述任何思考过程，回复在 </reply> 处结束。';
export function registerPresetProtocol(context,getSource,onError=()=>{}){
 const names=['tisya_output_kind','tisya_delivery_warning','tisya_heart_directions','tisya_heart_rows'];
 if(typeof context.registerMacro!=='function'||typeof context.unregisterMacro!=='function')throw Error('TISYA_PRESET_MACROS_UNAVAILABLE');
 const wrap=fn=>()=>{try{return fn(outputEnabled(getSource()));}catch(error){onError(error);throw error;}};
 context.registerMacro(names[0],wrap(on=>on?'structured':'plain'),'缇斯亚配套预设：跟随十块结构开关');
 context.registerMacro(names[1],wrap(on=>on?DELIVERY_WARNING:''),'缇斯亚配套预设：结构化交付提示');
 context.registerMacro(names[2],wrap(on=>on?HEART_DIRECTIONS:''),'缇斯亚配套预设：首尾心声方向');
 context.registerMacro(names[3],wrap(on=>on?HEART_ROWS:''),'缇斯亚配套预设：首尾心声格式');
 return ()=>names.forEach(name=>context.unregisterMacro(name));
}
