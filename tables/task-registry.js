import {TASK_MATERIALS,selectTaskMaterials} from './task-materials.js';
import {createCapabilityRegistry} from '../services/capabilities.js';
import {ARCHIVE_TASKS} from './compact-fill.js';
import {GENESIS_TASK} from './simple-genesis.js';
import {CORE_TASK} from './simple-core.js';
import {STRUCTURED_TASKS} from './structured-tasks.js';
import {check,copy} from './schema.js';

// Entry, authorization and request/answer adapter share one capability owner.
// Domain services retain validation and persistence ownership.
export function createTaskRegistry(definitions){
 const modes=new Set();
 const registry=createCapabilityRegistry(definitions,{key:'task',label:'任务能力',validate(definition){
  const {task,kind,surface,mode,prepare}=definition;
  check(definition.materials&&typeof definition.materials==='object','任务缺少输入区块登记：'+task);
  check(typeof definition.rulePolicy==='boolean','任务缺少规则选择策略：'+task);
  check(typeof kind==='string'&&kind&&['form','structured'].includes(surface),'任务登记类型无效：'+task);
  check(mode?.id&&!modes.has(mode.id),'模式重复登记：'+task);
  check(typeof prepare==='function'&&typeof definition.name==='string'&&typeof definition.instructions==='string','任务缺少入口或执行适配：'+task);
  check(surface!=='structured'||definition.profile,'结构化任务缺少专属授权：'+task);
  modes.add(mode.id);
 }});
 return Object.freeze({...registry,prepare(task,input){
  const definition=registry.get(task),plan=definition.prepare(selectTaskMaterials(definition.materials,input));
  check(plan&&typeof plan.parse==='function'&&plan.payload,'任务没有完整请求/解析契约：'+task);
  return plan;
 }});
}
export const taskRegistry=createTaskRegistry([...STRUCTURED_TASKS,...ARCHIVE_TASKS,GENESIS_TASK,CORE_TASK].map(d=>({...d,materials:TASK_MATERIALS[d.task]})).sort((a,b)=>a.order-b.order));
export const TABLE_MODES=Object.freeze(Object.fromEntries(taskRegistry.definitions.map(d=>[d.task,d.mode])));
export const AUX_TASKS=Object.freeze(Object.fromEntries(taskRegistry.definitions.map(d=>[d.task,Object.freeze({name:d.name,instructions:d.instructions})])));
export const TASK_PROFILES=Object.freeze(Object.fromEntries(taskRegistry.definitions.filter(d=>d.profile).map(d=>[d.task,d.profile])));
export const SIMPLE_TABLE_TASKS=Object.freeze(taskRegistry.definitions.filter(d=>d.surface==='form').map(d=>d.task));
export const ARCHIVE_TABLE_TASKS=Object.freeze(ARCHIVE_TASKS.map(d=>d.task));
export function taskProfile(task){const profile=taskRegistry.get(task).profile;check(profile,'结构化辅助预设未登记：'+task);return profile;}
