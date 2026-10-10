import {HEART_CONTROLS,HEART_VARIANTS} from './preset-heart-variants.js';
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
// The native prompt list and per-character order are the only authority.
// Older paired presets have no control entries/token and retain all three.
export function heartSelection(source){
 if(!Array.isArray(source.prompts)||!Array.isArray(source.order))throw Error('TISYA_PRESET_SOURCE_UNAVAILABLE');
 const current=source.prompts.some(p=>HEART_CONTROLS.some(c=>c.id===p?.identifier)||p?.identifier==='tisya_inner_chain'&&typeof p.content==='string'&&p.content.includes('{{tisya_heart_protocol}}'));
 if(!current)return 7;
 let mask=0;
 HEART_CONTROLS.forEach((control,i)=>{
  const entries=source.prompts.filter(p=>p?.identifier===control.id),slots=source.order.filter(p=>p?.identifier===control.id);
  if(entries.length>1||slots.length>1)throw Error('TISYA_PRESET_DUPLICATE_HEART');
  if(!entries.length||!slots.length)return;
  if(typeof slots[0].enabled!=='boolean'||entries[0].enabled!==undefined&&typeof entries[0].enabled!=='boolean')throw Error('TISYA_PRESET_HEART_SWITCH_INVALID');
  if(slots[0].enabled&&entries[0].enabled!==false)mask|=1<<i;
 });
 return mask;
}
export const DELIVERY_WARNING='【特别警告】\n内部规划与检查完成后，立即按既定格式输出完整的 <reply> 正文；不复述任何思考过程，回复在 </reply> 处结束。';
export function registerPresetProtocol(context,getSource,onError=()=>{},getEmotionNames=()=>[]){
 const names=['tisya_output_kind','tisya_delivery_warning','tisya_heart_directions','tisya_heart_rows','tisya_heart_moods','tisya_heart_protocol'];
 if(typeof context.registerMacro!=='function'||typeof context.unregisterMacro!=='function')throw Error('TISYA_PRESET_MACROS_UNAVAILABLE');
 const wrap=fn=>()=>{try{const source=getSource();return fn(outputEnabled(source),heartSelection(source));}catch(error){onError(error);throw error;}};
 context.registerMacro(names[0],wrap(on=>on?'structured':'plain'),'缇斯亚配套预设：跟随十块结构开关');
 context.registerMacro(names[1],wrap(on=>on?DELIVERY_WARNING:''),'缇斯亚配套预设：结构化交付提示');
 context.registerMacro(names[2],wrap((on,mask)=>on?HEART_DIRECTIONS.split('\n').filter((_,i)=>mask&(1<<i)).join('\n'):''),'缇斯亚配套预设：首尾心声方向');
 context.registerMacro(names[3],wrap((on,mask)=>HEART_VARIANTS[mask][on?'on':'off'].rows),'缇斯亚配套预设：首尾心声格式');
 const moodList=()=>{const moods=getEmotionNames();if(!Array.isArray(moods)||moods.some(x=>typeof x!=='string'||!x.trim())||new Set(moods).size!==moods.length)throw Error('TISYA_EMOTION_NAMES_INVALID');return JSON.stringify([null,...moods]);};
 context.registerMacro(names[4],wrap((on,mask)=>on&&mask?moodList():'[null]'),'缇斯亚配套预设：实际可用心声表情');
 context.registerMacro(names[5],wrap((on,mask)=>{const protocol=HEART_VARIANTS[mask][on?'on':'off'].protocol;return on&&mask?protocol.replace('mood must be one of [null]','mood must be one of '+moodList()):protocol;}),'缇斯亚配套预设：跟随三个原生心声方向开关');
 return ()=>names.forEach(name=>context.unregisterMacro(name));
}
