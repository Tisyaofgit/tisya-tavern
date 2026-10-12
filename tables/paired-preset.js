import {compileNarrative} from '../narrative-bridge.js';
import {TABLE_MODES} from './modes.js';
import {taskSlots,slotText,SLOT_TARGETS} from './slots.js';
export function pairedPreset({task,source,configuration,context,moods=[]}){
 const mode=TABLE_MODES[task];if(!mode)throw Error('未登记配套模式：'+task);
 const s=structuredClone(source),cfg=structuredClone(configuration);s.order??=s.prompt_order?.find(x=>x.character_id===100001)?.order??s.prompt_order?.[0]?.order;
 if(!s.order)throw Error('配套预设缺少提示词顺序');
 for(const target of Object.values(SLOT_TARGETS)){const p=s.prompts.find(p=>p.identifier===target),o=s.order.find(o=>o.identifier===target);if(!p||!o)throw Error('配套预设缺少固定槽：'+target);p.enabled=true;o.enabled=true;}
 cfg.world.modes[mode.id]??=structuredClone(cfg.world.modes[cfg.world.mode]);cfg.world.mode=mode.id;cfg.world.modes[mode.id].narrative.缇斯亚当前任务='叙事';cfg.world.modes[mode.id].narrative.缇斯亚叙事创作模式='互动叙事';
 const compiled=compileNarrative(context,s,moods,cfg);return {source:s,entries:compiled.rest.entries,mode:mode.id};
}
export function taskMessages({preset,task,input,selected='',substitute=s=>s}){
 const slots=taskSlots(task,input),targets=Object.fromEntries(Object.entries(SLOT_TARGETS).map(([k,v])=>[v,k])),messages=[],consumed=new Set();
 for(const item of preset.source.order.filter(x=>x.enabled)){
  const p=preset.source.prompts.find(x=>x.identifier===item.identifier);if(!p||p.enabled===false||p.marker)continue;
  let content='';const slot=targets[p.identifier];
  if(slot){content=slotText(slot,slots[slot]);consumed.add(slot);}
  else if(p.identifier==='tisya_selected_resources')content=selected;
  else if(p.identifier.startsWith('tisya_material_')||['tisya_recent_reply','tisya_current_input'].includes(p.identifier))continue;
  else content=(p.content??'').replace(/\{\{tisya_live_([a-z_]+)\}\}/g,(_,id)=>preset.entries[id]??'');
  if(content.trim())messages.push({role:p.role??'system',content:substitute(content)});
 }
 const missing=Object.keys(slots).filter(k=>!consumed.has(k)&&slotText(k,slots[k]));if(missing.length)throw Error('配套预设缺少资料槽：'+missing.join('、'));
 messages.push({role:'user',content:'执行本次'+TABLE_MODES[task].name+'任务，使用已提供的来源快照并按共用回复格式交付。'});return messages;
}
