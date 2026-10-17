import {framePrompts} from '../prompt-envelope.js';
import {preferenceFirst} from '../config/preference-layer.js';
import {simpleFillMessages} from './simple-fill-messages.js';
import {NARRATIVE as N} from '../settings-core.js';
import {TABLE_MODES,SIMPLE_TABLE_TASKS,auxiliaryEntries} from './modes.js';
import {AUX_TASKS} from './prompts.js';
import {taskSlots,slotText,SLOT_TARGETS,SLOT_NAMES} from './slots.js';
// Auxiliary transport owns a data contract, independent of narrative UI output.
export function pairedPreset({task,configuration,archiveProposal=false}){
 const mode=TABLE_MODES[task];if(!mode)throw Error('未登记配套模式：'+task);
 if(archiveProposal&&task!=='tableArchive')throw Error('提案审核只能用于独立记忆归档');
 const settings=configuration.world.modes[configuration.world.mode].narrative;
 const base=N.previewSettings(settings,{summary:false,directions:[]}).rest.entries;
 const entries=auxiliaryEntries(base,task,AUX_TASKS[task].instructions+(configuration.world.tables?.taskInstructions?.[task]?'\n本模式补充要求：\n'+configuration.world.tables.taskInstructions[task]:''));
 const prompts=framePrompts(entries,[{identifier:'tisya_selected_resources',role:'user',content:'',tisyaSelectedResources:true},...Object.entries(SLOT_TARGETS).map(([slot,identifier])=>({identifier,name:SLOT_NAMES[slot],role:'user',content:'',tisyaMaterialSlot:slot}))]).map(p=>({name:p.identifier,enabled:true,marker:false,system_prompt:false,injection_position:0,...p}));
 return {name:AUX_TASKS[task].name,task,entries,supplement:configuration.world.tables?.taskInstructions?.[task]??'',mode:mode.id,prompts,prompt_order:[{character_id:100001,order:preferenceFirst(prompts.map(p=>({identifier:p.identifier,enabled:true})))}]};
}
export function taskMessages({preset,task,input,selected='',substitute=s=>s}){
 if(preset.task!==task)throw Error('专用预设与任务不匹配');
 if(input.simpleForm){
  if(!['tableGenesis','assetAdapt'].includes(task)||!Array.isArray(input.simpleForm.messages)||!input.simpleForm.messages.length)throw Error('极简表格任务无效');
  const messages=structuredClone(input.simpleForm.messages);
  if(!messages.every(m=>['system','user'].includes(m.role)&&typeof m.content==='string'))throw Error('极简表格消息无效');
  const extra=[preset.supplement&&'用户对本任务的补充要求：\n'+substitute(preset.supplement),selected&&'用户选用的补充说明：\n'+substitute(selected)].filter(Boolean);
  if(extra.length){const first=messages.find(m=>m.role==='system');if(first)first.content=extra.join('\n\n')+'\n\n'+first.content;else messages.unshift({role:'system',content:extra.join('\n\n')});}
  return messages;
 }
 if(input.compactFill)return simpleFillMessages({task,input,supplement:preset.supplement,selected,substitute});
 if(SIMPLE_TABLE_TASKS.includes(task))throw Error('此任务需要由档案、创世或基点入口准备可填写的表格，未发送旧格式请求');
 const slots=taskSlots(task,input),messages=[],seen=new Set(),byId=new Map(preset.prompts.map(p=>[p.identifier,p]));
 for(const order of preset.prompt_order[0].order){
  if(seen.has(order.identifier))throw Error('专用预设条目重复：'+order.identifier);seen.add(order.identifier);
  const p=byId.get(order.identifier);if(!p)throw Error('专用预设条目缺失：'+order.identifier);if(!order.enabled||!p.enabled)continue;
  // Only instruction text is macro-expanded. Source values are serialized once
  // without executing scripts, applying display regex or substituting macros.
  const content=p.tisyaMaterialSlot?slotText(p.tisyaMaterialSlot,slots[p.tisyaMaterialSlot]):p.tisyaSelectedResources?(selected?'[SELECTED_RESOURCE]\n'+substitute(selected)+'\n[/SELECTED_RESOURCE]':''):substitute(p.content);
  if(content)messages.push({role:p.role,content});
 }
 for(const key of Object.keys(slots))if(slots[key]!==undefined&&slots[key]!==null&&!preset.prompts.some(p=>p.tisyaMaterialSlot===key&&p.enabled&&preset.prompt_order[0].order.some(o=>o.identifier===p.identifier&&o.enabled)))throw Error('专用预设缺少来源资料槽：'+key);
 return messages;
}
