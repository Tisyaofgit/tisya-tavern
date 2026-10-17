import {NARRATIVE as N} from '../settings-core.js';
import {TABLE_MODES,auxiliaryEntries} from './modes.js';
import {AUX_TASKS,archiveInstructions,compactFillInstructions} from './prompts.js';
import {taskSlots,slotText,SLOT_TARGETS,SLOT_NAMES} from './slots.js';
const HEAD=['tisya_new_chat','tisya_session_reset','main','tisya_identity_attestation','tisya_user_relation','tisya_task_start','tisya_material_boundary_open'];
const TAIL=['tisya_material_boundary_close','tisya_registry','tisya_internal_login','tisya_inner_chain','tisya_think_commit','tisya_delivery_warning','tisya_prepare_trigger'];
const role=id=>id==='tisya_identity_attestation'||id==='tisya_think_commit'?'assistant':id==='tisya_user_relation'?'user':'system';
// Auxiliary transport owns a data contract, independent of narrative UI output.
export function pairedPreset({task,configuration,archiveProposal=false}){
 const mode=TABLE_MODES[task];if(!mode)throw Error('未登记配套模式：'+task);
 const settings=configuration.world.modes[configuration.world.mode].narrative;
 const base=N.previewSettings(settings,{summary:false,directions:[]}).rest.entries;
 const entries=auxiliaryEntries(base,task,(archiveProposal?archiveInstructions(true):AUX_TASKS[task].instructions)+(configuration.world.tables?.taskInstructions?.[task]?'\n本模式补充要求：\n'+configuration.world.tables.taskInstructions[task]:''),{archiveProposal});
 const prompts=[...HEAD.map(id=>({identifier:id,role:role(id),content:entries[id]})),{identifier:'tisya_selected_resources',role:'user',content:'',tisyaSelectedResources:true},...Object.entries(SLOT_TARGETS).map(([slot,identifier])=>({identifier,name:SLOT_NAMES[slot],role:'user',content:'',tisyaMaterialSlot:slot})),...TAIL.map(id=>({identifier:id,role:role(id),content:entries[id]}))].map(p=>({name:p.identifier,enabled:true,marker:false,system_prompt:false,injection_position:0,...p}));
 return {name:AUX_TASKS[task].name,task,entries,compactBase:Object.fromEntries(['tisya_new_chat',...['main','tisya_identity_attestation','tisya_user_relation']].map(id=>[id,base[id]])),supplement:configuration.world.tables?.taskInstructions?.[task]??'',mode:mode.id,prompts,prompt_order:[{character_id:100001,order:prompts.map(p=>({identifier:p.identifier,enabled:true}))}]};
}
export function taskMessages({preset,task,input,selected='',substitute=s=>s}){
 if(preset.task!==task)throw Error('专用预设与任务不匹配');
 const compactEntries=input.compactFill?auxiliaryEntries(preset.compactBase??preset.entries,task,compactFillInstructions(task)+'\n'+(preset.supplement??'')+'\n'+input.compactFill.contract,{compactFill:true}):null;
 const slots=taskSlots(task,input),messages=[],seen=new Set(),byId=new Map(preset.prompts.map(p=>[p.identifier,p]));
 for(const order of preset.prompt_order[0].order){
  if(seen.has(order.identifier))throw Error('专用预设条目重复：'+order.identifier);seen.add(order.identifier);
  const p=byId.get(order.identifier);if(!p)throw Error('专用预设条目缺失：'+order.identifier);if(!order.enabled||!p.enabled)continue;
  // Only instruction text is macro-expanded. Source values are serialized once
  // without executing scripts, applying display regex or substituting macros.
  const content=p.tisyaMaterialSlot?slotText(p.tisyaMaterialSlot,slots[p.tisyaMaterialSlot]):p.tisyaSelectedResources?(selected?'[SELECTED_RESOURCE]\n'+substitute(selected)+'\n[/SELECTED_RESOURCE]':''):substitute(compactEntries?.[p.identifier]??p.content);
  if(content)messages.push({role:p.role,content});
 }
 for(const key of Object.keys(slots))if(slots[key]!==undefined&&slots[key]!==null&&!preset.prompts.some(p=>p.tisyaMaterialSlot===key&&p.enabled&&preset.prompt_order[0].order.some(o=>o.identifier===p.identifier&&o.enabled)))throw Error('专用预设缺少来源资料槽：'+key);
 return messages;
}
