import {NARRATIVE as N} from '../settings-core.js';
import {TABLE_MODES,auxiliaryEntries} from './modes.js';
import {AUX_TASKS} from './prompts.js';
import {taskSlots,slotText} from './slots.js';
// Auxiliary transport owns a data contract, independent of narrative UI output.
export function pairedPreset({task,configuration}){
 const mode=TABLE_MODES[task];if(!mode)throw Error('未登记配套模式：'+task);
 const settings=configuration.world.modes[configuration.world.mode].narrative;
 const base=N.previewSettings(settings,{summary:false,directions:[]}).rest.entries;
 const entries=auxiliaryEntries(base,task,AUX_TASKS[task].instructions+(configuration.world.tables?.taskInstructions?.[task]?'\n本模式补充要求：\n'+configuration.world.tables.taskInstructions[task]:''));
 return {entries,mode:mode.id};
}
export function taskMessages({preset,task,input,selected='',substitute=s=>s}){
 const messages=[],add=(id)=>{if(preset.entries[id])messages.push({role:id==='tisya_identity_attestation'||id==='tisya_think_commit'?'assistant':id==='tisya_user_relation'?'user':'system',content:substitute(preset.entries[id])});};
 for(const id of ['tisya_new_chat','main','tisya_identity_attestation','tisya_user_relation','tisya_task_start','tisya_material_boundary_open'])add(id);
 if(selected)messages.push({role:'user',content:'[SELECTED_RESOURCE]\n'+substitute(selected)+'\n[/SELECTED_RESOURCE]'});
 for(const [key,value]of Object.entries(taskSlots(task,input))){const content=slotText(key,value);if(content)messages.push({role:'user',content});}
 for(const id of ['tisya_material_boundary_close','tisya_registry','tisya_internal_login','tisya_inner_chain','tisya_think_commit','tisya_delivery_warning','tisya_prepare_trigger'])add(id);return messages;
}
