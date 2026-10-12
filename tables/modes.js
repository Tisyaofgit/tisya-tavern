import {SLOT_ROUTER} from './slots.js';
export const TABLE_MODES=Object.freeze({tableArchive:{id:'archive',name:'记忆归档',steps:'核来源与归档边界→比对当前表→按模板提出有证据的变更→校验版本、权限和关联；不推进剧情'},plotAdvance:{id:'plot',name:'剧情推进',steps:'读取用户输入和最新进度→核任务、到期条件与伏笔→按人物动机设计条件性节拍→保留玩家未定选择；不写入事实'},preferenceAnalysis:{id:'preferences',name:'偏好确认',steps:'识别用户明确要求→分析候选表现偏好→逐项绑定用户原句→标注推测与作用域→交给用户确认；重投本身不证明原因'},tableGenesis:{id:'genesis',name:'创世设计',steps:'接续创世蓝图→登记表、字段与类型→生成底档和初始状态→核关联、公式及后续填录规则→形成可修改草稿'},objectArchive:{id:'objects',name:'新发现建档',steps:'区分新对象与已有对象的新事实→复用类型及别名→补齐有依据字段→形成档案提案'},historyImport:{id:'history',name:'历史补录',steps:'按来源楼层和已知时间整理→保留事件经过→核对象与当时状态→防止旧状态覆盖新进度→形成补录提案'}});
export function addSlotRouting(entries){const route=SLOT_ROUTER.split('\n').slice(1,-1).join('\n');if(!entries.tisya_task_start.includes('@ROUTE TISYA.DATA.SOURCE'))entries.tisya_task_start=entries.tisya_task_start.replace('[/TASK.START]',route+'\n[/TASK.START]');return entries;}
export const IDENTITY_ENTRIES=['main','tisya_identity_attestation','tisya_user_relation'];
export const auxiliaryWire='只返回一个严格 JSON 对象，字段依本任务契约；不加代码围栏、XML 外层、工作报告或场外短评。这是待校验数据，不是写入回执。';
export function taskWorkflow(task,instructions){
 const mode=TABLE_MODES[task];if(!mode)throw Error('辅助模式未登记');
 return '[MODE.ANALYZE]\n'+mode.name+'：'+mode.steps+'。核对来源、版本、类型和权限；不输出内部推理。\n'+instructions+'\n'+auxiliaryWire+'\n[/MODE.ANALYZE]';
}
export function compileTaskMode({compiledBase:c},task,instructions=''){
 const previous=c.rest.entries,entries=Object.fromEntries(Object.keys(previous).map(k=>[k,'']));
 for(const id of IDENTITY_ENTRIES)entries[id]=previous[id];
 entries.tisya_task_start='当前来源、表单、偏好、蓝图和工具回执分别按资料槽读取。草稿与计划不是已发生事实；未提供的资料不补造。';
 entries.tisya_inner_chain=taskWorkflow(task,instructions);c.rest.entries=entries;c.taskMode=TABLE_MODES[task].id;c.heartActive=false;c.outputEnabled=false;c.prose=false;return c;
}
