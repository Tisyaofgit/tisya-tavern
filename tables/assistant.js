import {historySignature} from '../config/history-context.js';
import {NARRATIVE as N} from '../settings-core.js';
import {validateInterfaceSettings} from './interface-config.js';
import {check,copy,object,tableSettings,defaultRegistry} from './schema.js';
import {registry,defaultMode,validateConfig,effectiveResources,compileSelected,resolveRoute} from '../config/core.js';
import {AUX_TASKS} from './prompts.js';
import {pairedPreset} from './paired-preset.js';
const escape=s=>s.replaceAll('~','~0').replaceAll('/','~1');
const params={temp_openai:'',openai_max_tokens:'',top_p_openai:'',reasoning_effort:'__inherit__',custom_prompt_post_processing:'__inherit__'};
const route=r=>({connection:'',preset:'__inherit__',model:'',profile:'',...copy(r??{}),parameters:{...params,...copy(r?.parameters??{})}});
function unroute(r){const out=copy(r);for(const k of ['connection','model','profile'])if(!out[k])delete out[k];if(out.preset==='__inherit__')delete out.preset;for(const [k,v]of Object.entries(out.parameters??{}))if(v==='__inherit__'||v===''&&k!=='custom_prompt_post_processing')delete out.parameters[k];if(!Object.keys(out.parameters??{}).length)delete out.parameters;return out;}
export function configurationView(snapshot){
 const w=copy(snapshot.world);w.tables=tableSettings(w);for(const task of Object.keys(AUX_TASKS))w.tables.taskInstructions[task]??='';
 for(const m of Object.values(w.modes)){m.nativeMvu??='auto';m.heartDirections??=['输入评价','回应用户评价','剧情吐槽'];m.workflowDetail??='compact';for(const [id,task]of registry.tasks)if(!task.aliasOf)m.routes[id]=route(m.routes[id]);}
 const routes=copy(snapshot.data.routes);routes.global=route(routes.global);for(const [id,task]of registry.tasks)if(!task.aliasOf)routes.tasks[id]=route(routes.tasks[id]);
 return {world:w,routes,agent:copy(snapshot.data.agent),resources:copy(snapshot.data.resources),...(snapshot.interface?{interface:copy(snapshot.interface.value)}:{})};
}
export function editablePaths(value,path=''){if(Array.isArray(value)||!object(value))return [path];return Object.entries(value).flatMap(([key,v])=>editablePaths(v,path+'/'+escape(key)));}
const segments=path=>{check(typeof path==='string'&&path.startsWith('/')&&!/~(?![01])/u.test(path),'配置路径无效');const parts=path.slice(1).split('/').map(s=>s.replaceAll('~1','/').replaceAll('~0','~'));check(parts.every(p=>!['__proto__','prototype','constructor'].includes(p)),'配置路径含保留键');return parts;};
function get(root,path){let v=root;for(const key of segments(path)){check(object(v)||Array.isArray(v),'配置路径不存在');check(Object.hasOwn(v,key),'配置路径不存在：'+path);v=v[key];}return v;}
function put(root,path,value){const keys=segments(path),key=keys.pop();let v=root;for(const k of keys)v=v[k];v[key]=copy(value);}
export function configurationLabel(path){
 const keys=segments(path),last=keys.at(-1),names={world:'当前会话',interface:'界面',routes:'API 路由',global:'通用',tasks:'任务',modes:'模式',context:'上下文',tables:'表单推进',theme:'主题',agent:'Agent',resources:'已登记资源',history:'历史聊天条数',owner:'上下文来源',maxInputTokens:'输入 token 预算',enabled:'启用',archive:'自动归档历史',plot:'剧情推进',offstage:'场外演算',focusObjects:'关注对象',playerObjects:'玩家控制对象',focusText:'推进重点',preferences:'用户偏好分析',objectsSeparate:'独立新发现建档',styleEnabled:'禁词与防套话',injection:'注入方式',retrieval:'检索方式',topK:'补充检索条数',contextChars:'注入字符预算',connection:'API 连接',model:'模型',preset:'预设',taskInstructions:'辅助补充要求',parameters:'参数',nativeMvu:'原卡变量更新',heartDirections:'心声方向',workflowDetail:'流程详略',summary:'公开摘要',actions:'行动建议'};
 const narrative=N.rows.find(r=>r.variable===last);if(narrative)return '叙事 · '+narrative.label;
 return keys.map(k=>names[k]??registry.tasks.get(k)?.name??registry.modes.get(k)?.name??k).join(' › ');
}
function prepared(snapshot,changes,choices){
 check(Array.isArray(changes)&&changes.length<=1000,'批量修改必须为不超过 1000 项的列表');const base=configurationView(snapshot),next=copy(base),allowed=new Set(editablePaths(base)),seen=new Set();
 for(const c of changes){check(object(c)&&Object.keys(c).every(k=>['path','value','reason'].includes(k))&&typeof c.reason==='string'&&Object.hasOwn(c,'value'),'配置建议字段无效');check(allowed.has(c.path),'尚无此配置项，请交给创世：'+c.path);check(!seen.has(c.path),'同一配置项重复修改');seen.add(c.path);put(next,c.path,c.value);}
 // Existing resources are editable; new resources belong to Genesis.
 check(Array.isArray(next.resources)&&next.resources.every(r=>base.resources.some(b=>b.id===r.id)),'新增资源请交给创世');
 check(registry.modes.has(next.world.mode),'模式未登记，请交给创世');next.world.modes[next.world.mode]??=defaultMode();
 const allRoutes=[next.routes.global,...Object.values(next.routes.tasks),...Object.values(next.world.modes).flatMap(m=>Object.values(m.routes))];
 const beforeRoutes=[base.routes.global,...Object.values(base.routes.tasks),...Object.values(base.world.modes).flatMap(m=>Object.values(m.routes))];
 for(const r of allRoutes){check(r.connection===''||r.connection==='native'||choices.connections?.some(c=>c.id===r.connection)||beforeRoutes.some(b=>b.connection===r.connection),'连接引用不存在，请先在原生 API 配置中添加');check(r.preset==null||['__inherit__','native'].includes(r.preset)||choices.presets?.includes(r.preset)||beforeRoutes.some(b=>b.preset===r.preset),'预设不存在，请交给创世');}
 for(const [mode,m]of Object.entries(next.world.modes))for(const id of Object.keys(m.routes)){m.routes[id]=unroute(m.routes[id]);if(!Object.keys(m.routes[id]).length&&!Object.hasOwn(snapshot.world.modes[mode]?.routes??{},id))delete m.routes[id];}next.routes.global=unroute(next.routes.global);for(const id of Object.keys(next.routes.tasks)){next.routes.tasks[id]=unroute(next.routes.tasks[id]);if(!Object.keys(next.routes.tasks[id]).length&&!Object.hasOwn(snapshot.data.routes.tasks,id))delete next.routes.tasks[id];}
 const delta={world:copy(snapshot.world),routes:copy(snapshot.data.routes),agent:copy(snapshot.data.agent),resources:copy(snapshot.data.resources),...(snapshot.interface?{interface:copy(snapshot.interface.source)}:{})};
 for(const c of changes){const keys=segments(c.path),last=keys.at(-1);let source=next;for(const key of keys)source=source?.[key];let target=delta;for(const key of keys.slice(0,-1)){target[key]??={};target=target[key];}if(source===undefined||c.path.startsWith('/interface/显示区块/')&&source==='__inherit__')delete target[last];else target[last]=copy(source);}
 if(!delta.world.modes[delta.world.mode])delta.world.modes[delta.world.mode]=defaultMode();
 const data=copy(snapshot.data);data.worlds[snapshot.key]=delta.world;data.routes=delta.routes;data.agent=delta.agent;data.resources=delta.resources;validateConfig(data);effectiveResources(data,delta.world);
 if(delta.interface)validateInterfaceSettings(delta.interface);return {data,interfaceValue:changes.some(c=>c.path.startsWith('/interface/'))?delta.interface:undefined,diff:changes.map(c=>({...copy(c),label:configurationLabel(c.path),before:copy(get(base,c.path))}))};
}
export function createTableAssistant({store,getContext,review,run,call,getChoices=()=>({}),interfaceConfig=null}){
 const choices=()=>({connections:[],presets:[],narrative:N.rows.map(r=>({key:r.variable,label:r.label,type:r.type,allowed:r.allowed})),...getChoices(),...(interfaceConfig?{interface:interfaceConfig.read().choices}:{}),modes:[...registry.modes.values()].map(x=>({id:x.id,name:x.name}))});
 const snapshot=()=>({...store.read(),...(interfaceConfig?{interface:interfaceConfig.read()}: {})});
 function catalog(){const s=snapshot();return {configuration:configurationView(s),choices:choices(),registry:defaultRegistry(),tasks:Object.entries(AUX_TASKS).map(([id,t])=>({id,name:t.name,route:resolveRoute(s.data,s.world,id),instructions:t.instructions,supplement:s.world.tables?.taskInstructions?.[id]??'',entries:pairedPreset({task:id,configuration:s}).entries,selected:compileSelected(s.data,s.world,id)}))};}
 async function ask(question,conversation=[]){return run(async signal=>{
  check(typeof question==='string'&&question.trim(),'请告诉缇斯亚你想修改什么');check(Array.isArray(conversation)&&conversation.length<=12&&conversation.every(x=>object(x)&&['user','assistant'].includes(x.role)&&typeof x.content==='string'),'助手对话格式无效');
  const state=await review(),captured=snapshot(),configuration=configurationView(captured),options=choices();
  const response=await call({question,conversation,configuration,editablePaths:editablePaths(configuration),choices:options,registry:state.registry,currentRows:state.rows,storage:{ready:state.storageReady,error:state.storageError},history:state.history,blueprint:state.blueprint,diagnostics:{jobs:state.jobs,presets:catalog().tasks.map(t=>({id:t.id,name:t.name,route:t.route,instructions:t.instructions,supplement:t.supplement})),instructions:'connection/model/preset 是引用。空 connection/model 表示继承，preset=__inherit__ 表示继承。数组作为一项完整替换，其余只允许 editablePaths 中的叶字段。'}},signal);
  check(object(response)&&Object.keys(response).every(k=>['answer','changes','backfill','genesisGoal'].includes(k))&&typeof response.answer==='string'&&response.answer.trim()&&typeof response.genesisGoal==='string','助手结果格式无效，请重试');
  if(response.backfill!==null){const b=response.backfill;check(object(b)&&Object.keys(b).every(k=>['from','to','limit'].includes(k))&&Number.isSafeInteger(b.from)&&Number.isSafeInteger(b.to)&&b.from>=1&&b.to>=b.from&&b.to<=(state.history.at(-1)?.floor??0)&&Number.isSafeInteger(b.limit)&&b.limit>=1&&b.limit<=100,'助手补录范围无效');}
  const now=store.read();check(now.key===captured.key&&now.revision===captured.revision,'配置已变化，助手结果未采用');check(!captured.interface||interfaceConfig.read().stamp===captured.interface.stamp,'界面配置已变化，助手结果未采用');const plan=prepared(captured,response.changes,options);
  return {format:'tisya.assistant-draft/1',...copy(response),diff:plan.diff,world:captured.key,revision:captured.revision,interfaceStamp:captured.interface?.stamp,chatStamp:state.chatStamp,question};
 });}
 function guard(draft){const s=snapshot();check(!interfaceConfig||draft.interfaceStamp===s.interface.stamp,'界面配置已变化，请重新让助手核对');check(draft.format==='tisya.assistant-draft/1'&&draft.world===s.key&&draft.revision===s.revision&&draft.chatStamp===historySignature(getContext()),'会话或配置已变化，请重新让助手核对');return s;}
 async function applyChanges(draft,continueActions){return run(async()=>{
  const s=guard(draft);check(draft.changes.length,'没有待应用的配置修改');const plan=prepared(s,draft.changes,choices());
  if(plan.interfaceValue!==undefined)await interfaceConfig.save({data:plan.data,revision:s.revision,key:s.key,value:plan.interfaceValue,expected:s.interface.stamp});else await store.save(plan.data,s.revision,s.key);
  if(!continueActions)return plan.diff.length;
  const after=snapshot(),expected={...plan.data,revision:s.data.revision+1};
  check(after.key===s.key&&JSON.stringify(after.data)===JSON.stringify(expected),'配置已保存，但后续配置发生变化，请重新让助手核对');
  if(after.interface)check(after.interface.stamp===JSON.stringify(plan.interfaceValue??s.interface.source),'界面配置已保存，但后续配置发生变化，请重新让助手核对');
  const next={...copy(draft),changes:[],diff:[],revision:after.revision,interfaceStamp:after.interface?.stamp};guard(next);
  return {count:plan.diff.length,next};
 });}
 const apply=draft=>applyChanges(draft,false),applyAndContinue=draft=>applyChanges(draft,true);
 return {ask,apply,applyAndContinue,guard,catalog};
}
