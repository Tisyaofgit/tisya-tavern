import {NARRATIVE as N} from '../settings-core.js';
import {TABLE_MODES,taskWorkflow,IDENTITY_ENTRIES} from './modes.js';
import {AUX_TASKS} from './prompts.js';
import {taskSlots,slotText} from './slots.js';
// Auxiliary transport owns a data contract, independent of narrative UI output.
export function pairedPreset({task,configuration}){
 const mode=TABLE_MODES[task];if(!mode)throw Error('未登记配套模式：'+task);
 const settings=configuration.world.modes[configuration.world.mode].narrative;
 const base=N.previewSettings(settings,{summary:false,directions:[]}).rest.entries;
 const entries=Object.fromEntries(IDENTITY_ENTRIES.map(k=>[k,base[k]]));
 entries.tisya_inner_chain=taskWorkflow(task,AUX_TASKS[task].instructions);
 return {entries,mode:mode.id};
}
export function taskMessages({preset,task,input,selected='',substitute=s=>s}){
 const messages=Object.values(preset.entries).filter(Boolean).map(content=>({role:'system',content:substitute(content)}));
 if(selected)messages.push({role:'system',content:substitute(selected)});
 for(const [key,value]of Object.entries(taskSlots(task,input))){const content=slotText(key,value);if(content)messages.push({role:'user',content});}
 messages.push({role:'user',content:'完成本次'+TABLE_MODES[task].name+'，仅返回任务规定的 JSON 对象。'});return messages;
}
