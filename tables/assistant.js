import {createSheetEngine} from './foundation/engine.js';
import {envelope} from '../engine/reply.mjs';
import {PREFERENCE_GROUPS} from '../engine/preferences.mjs';
import {generationValues} from '../engine/generation.mjs';
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
 const w=copy(snapshot.world);w.tables=tableSettings(w);delete w.tables.contextChars;for(const task of Object.keys(AUX_TASKS))w.tables.taskInstructions[task]??='';
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
export function createTableAssistant({store,getContext,review,run,call,getChoices=()=>({}),interfaceConfig=null,matrixConfig=null}){
 if(matrixConfig)return matrixConfigurationAssistant({store,getContext,review,run,call,getChoices,interfaceConfig,matrixConfig});
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

// The assistant presents one workbook; each setting is still validated and saved
// by its actual configuration owner. Internal paths never become model output.
function matrixConfigurationAssistant({store,getContext,review,run,call,getChoices,interfaceConfig,matrixConfig}){
 const snapshot=()=>({...store.read(),matrix:matrixConfig.read(),generation:generationValues(getContext()),...(interfaceConfig?{interface:interfaceConfig.read()}: {})});
 const choices=()=>({connections:[],presets:[],...getChoices(),...(interfaceConfig?{interface:interfaceConfig.read().choices}:{})});
 const assign=(target,path,value,remove=false)=>{const keys=segments(path),last=keys.pop();let node=target;for(const key of keys)node=node[key]??={};if(remove)delete node[last];else node[last]=copy(value);};
 function matrixView(value,generation){
  const selection=()=>Object.fromEntries(PREFERENCE_GROUPS.map(group=>[group.id,null]));
  const parameters={history_messages:null,min_length:null,max_length:null};
  return {tags:copy(value.tags),generation:{...generation,...copy(value.generation??{})},playDefaults:{choices:{...selection(),...copy(value.playDefaults?.choices??{})},parameters:{...parameters,...copy(value.playDefaults?.parameters??{})}},story:{play:{choices:{...selection(),...copy(value.story?.play?.choices??{})},parameters:{...parameters,...copy(value.story?.play?.parameters??{})}}}};
 }
 function formFor(captured){
  const native=configurationView(captured),view={routes:native.routes,context:{maxInputTokens:native.world.context.maxInputTokens},...(native.interface?{interface:native.interface}:{}),matrix:matrixView(captured.matrix,captured.generation)},items=[];
  const walk=(value,path=[])=>{if(value&&typeof value==='object'&&!Array.isArray(value)){for(const [key,v]of Object.entries(value))walk(v,[...path,key]);return;}
   if(Array.isArray(value)&&value.some(v=>v&&typeof v==='object'))return;
   const pointer='/'+path.map(escape).join('/'),owner=path[0]==='matrix'?'matrix':'native',nativePath=path[0]==='context'?'/world/context/'+path.slice(1).map(escape).join('/'):pointer;
   const group=path.includes('choices')?PREFERENCE_GROUPS.find(g=>g.id===path.at(-1)):null;
   const label=group?(path.includes('story')?'本聊天偏好 · ':'全局偏好 · ')+group.label:configurationLabel(nativePath).replace(/^matrix › /,'当前引擎 · ');
   const numeric=typeof value==='number'||path.includes('parameters')&&['history_messages','min_length','max_length','temp_openai','openai_max_tokens','top_p_openai'].includes(path.at(-1));
   const type=group?(group.multiple?'list':'text'):numeric?'number':typeof value==='boolean'?'boolean':Array.isArray(value)?'list':'text';
   const options=group?.options.map(o=>({id:o.id,label:o.label}));items.push({key:'f'+(items.length+1),label,path:owner==='matrix'?'/'+path.slice(1).map(escape).join('/'):nativePath,owner,type,before:copy(value),options});
  };walk(view);
  const template={id:'configuration',table:'configuration',label:'配置',fields:items.map(item=>({key:item.key,label:item.label,path:[item.key],group:'设置',definition:{type:'text'}}))};
  const engine=createSheetEngine({version:1,templates:[template]},value=>typeof value==='string'),record=engine.create(template.id),ticket=engine.requestWorkbook([{recordId:record.id,heading:'配置'}]);
  const current=items.map((item,i)=>({row:i+1,label:item.label,value:item.before,type:item.type,...(item.options?{options:item.options}: {})}));
  return {engine,record,ticket,items,current};
 }
 function valueFor(raw,item){
  if(raw==='（继承）'){
   if(item.owner==='matrix')return '（继承）';
   if(item.path.startsWith('/routes/'))return /\/(preset|reasoning_effort|custom_prompt_post_processing)$/.test(item.path)?'__inherit__':'';
   if(item.path.startsWith('/interface/显示区块/'))return '__inherit__';
   throw Error('此配置没有继承层：'+item.label);
  }
  if(raw==='（空）')return '';
  if(item.options){const tokens=item.type==='list'?(raw==='无'?[]:raw.split(/[；;、]/).map(s=>s.trim()).filter(Boolean)):[raw];const ids=tokens.map(token=>{const match=item.options.filter(o=>o.id===token||o.label===token);check(match.length===1,'偏好选项不存在或不唯一：'+token);return match[0].id;});return item.type==='list'?ids:ids[0];}
  if(item.type==='boolean'){check(['是','否','true','false'].includes(raw),'开关须填写是或否：'+item.label);return ['是','true'].includes(raw);}
  if(item.type==='number'){check(raw.trim()&&Number.isFinite(Number(raw)),'数值配置无效：'+item.label);return Number(raw);}
  if(item.type==='list')return raw==='无'?[]:raw.split(/[；;]/).map(s=>s.trim()).filter(Boolean);
  return raw;
 }
 function prepare(captured,changes){
  const allowed=new Map(formFor(captured).items.map(item=>[item.owner+':'+item.path,item])),seen=new Set();
  check(Array.isArray(changes)&&changes.length<=allowed.size,'配置修改列表无效');
  for(const change of changes){const key=change.owner+':'+change.path;check(allowed.has(key)&&!seen.has(key),'配置字段未开放或重复');seen.add(key);check(typeof change.reason==='string'&&Object.hasOwn(change,'value')&&Object.keys(change).every(k=>['owner','path','value','reason','remove'].includes(k)),'配置修改字段无效');if(change.remove)check(change.owner==='matrix'&&change.value==='（继承）','配置继承标记无效');}
  const native=changes.filter(c=>c.owner==='native').map(({owner,...change})=>change),matrix=changes.filter(c=>c.owner==='matrix');
  const plan=native.length?prepared(captured,native,choices()):{data:copy(captured.data),diff:[]};
  const matrixValue=copy(captured.matrix);for(const change of matrix)assign(matrixValue,change.path,change.value,change.remove);matrixConfig.validate(matrixValue);
  return {...plan,matrixValue,matrixChanges:matrix,nativeChanges:native};
 }
 async function ask(question,conversation=[]){return run(async signal=>{
  check(typeof question==='string'&&question.trim(),'请告诉缇斯亚要调整什么');check(Array.isArray(conversation)&&conversation.length<=12&&conversation.every(x=>object(x)&&['user','assistant'].includes(x.role)&&typeof x.content==='string'),'助手对话格式无效');const state=await review(),captured=snapshot(),form=formFor(captured);
  const input={formContract:'tisya.simple-form/1',question,conversation,goal:'核对当前配置，只填写用户要求改变的格；保持完整reply。body解释方案；cells使用给定配置分组与行号字段。未知留空，无需修改时cells留空。空文字填（空），恢复继承填（继承）；生成参数继承当前原生设置。不要返回JSON、存储路径或旧表单开关。',source:{configuration:form.current,choices:choices(),history:state.history,conversation},forms:form.ticket.modelInput,current:state.rows,references:[],output:{kind:'configuration'}};
  const raw=await call(input,signal);try{let parsed;try{parsed=envelope(raw);}catch(cause){throw Error('配置助手没有返回完整reply；原答已保留',{cause});}
  check(!parsed.blocks.vars?.trim()&&!parsed.blocks.archive?.trim(),'配置助手不能直接执行故事指令');
  if(parsed.blocks.cells?.trim())form.engine.accept(form.ticket.token,parsed.blocks.cells);
  const values=form.engine.values(form.record.id).values,changes=Object.entries(values).map(([key,rawValue])=>{const item=form.items.find(x=>x.key===key);check(item,'配置字段未开放');return {owner:item.owner,path:item.path,value:valueFor(rawValue,item),...(rawValue==='（继承）'&&item.owner==='matrix'?{remove:true}:{}),reason:'用户核对后应用',label:item.label,before:item.before};}).filter(c=>c.remove||JSON.stringify(c.value)!==JSON.stringify(c.before));
  const clean=changes.map(({before,label,...c})=>c);const plan=prepare(captured,clean);const now=snapshot();check(now.key===captured.key&&now.revision===captured.revision&&JSON.stringify(now.matrix)===JSON.stringify(captured.matrix)&&JSON.stringify(now.generation)===JSON.stringify(captured.generation)&&now.interface?.stamp===captured.interface?.stamp&&state.chatStamp===historySignature(getContext()),'生成期间会话或配置已经改变，原答保留');
  return {format:'tisya.assistant-sheet-draft/1',id:'configuration:'+crypto.randomUUID(),answer:parsed.blocks.body.trim(),changes:clean,diff:changes,backfill:null,genesisGoal:'',world:captured.key,revision:captured.revision,matrixRevision:captured.matrix.revision,interfaceStamp:captured.interface?.stamp,chatStamp:state.chatStamp,question,rawResponse:raw,captured:copy(captured),applied:{}};
  }catch(error){error.rawResponse=raw;throw error;}
 });}
 function guard(draft){const now=snapshot();check(draft.format==='tisya.assistant-sheet-draft/1'&&draft.world===now.key&&draft.chatStamp===historySignature(getContext()),'会话已变化，请重新核对配置');
  check(!draft.uncertainOwner,'部分配置保存结果未知，请重新读取持久配置核对；未自动重复保存');
  if(draft.appliedSignature)check(draft.appliedSignature===JSON.stringify(draft.changes),'已开始保存的配置草稿不能改写，请重新核对');
  check(now.revision===(draft.applied.native?.revision??draft.revision)&&now.matrix.revision===(draft.applied.matrix?.revision??draft.matrixRevision),'配置已被其他位置修改，请重新核对');
  if(draft.applied.native)check(JSON.stringify(now.data)===draft.applied.native.digest,'原生配置回执与当前内容不符');
  check(JSON.stringify(now.matrix)===(draft.applied.matrix?.digest??JSON.stringify(draft.captured.matrix)),'引擎配置回执或原始来源与当前内容不符');
  check(JSON.stringify(now.generation)===(draft.applied.matrix?.generationDigest??JSON.stringify(draft.captured.generation)),'原生生成设置已变化，请重新核对');
  if(interfaceConfig)check(now.interface.stamp===(draft.applied.native?.interfaceStamp??draft.interfaceStamp),'界面配置已变化，请重新核对');return now;}
 async function applyChanges(draft,continuing){return run(async()=>{
  guard(draft);check(draft.changes.length,'没有待应用的更改');const plan=prepare(draft.captured,draft.changes);let attempted=null;draft.appliedSignature=JSON.stringify(draft.changes);
  try{
   if(plan.matrixChanges.length&&!draft.applied.matrix){attempted='matrix';await matrixConfig.save(plan.matrixValue);const current=matrixConfig.read();draft.applied.matrix={revision:current.revision,digest:JSON.stringify(current),generationDigest:JSON.stringify(generationValues(getContext()))};attempted=null;guard(draft);}
   if(plan.nativeChanges.length&&!draft.applied.native){attempted='native';if(plan.interfaceValue!==undefined)await interfaceConfig.save({data:plan.data,revision:draft.revision,key:draft.world,value:plan.interfaceValue,expected:draft.interfaceStamp});else await store.save(plan.data,draft.revision,draft.world);const current=snapshot();draft.applied.native={revision:current.revision,digest:JSON.stringify(current.data),interfaceStamp:current.interface?.stamp};attempted=null;}
   guard(draft);
  }catch(error){if(attempted&&!['CONFIG_CONFLICT','CONFIG_BUSY','CONFIG_SCOPE'].includes(error.code)){draft.uncertainOwner=attempted;error.message+='；'+(attempted==='matrix'?'引擎':'原生')+'配置保存结果未确认，已停止重复提交';}const confirmed=Object.keys(draft.applied).map(owner=>owner==='matrix'?'引擎配置':'原生配置');if(confirmed.length)error.message+='；已确认保存：'+confirmed.join('、');error.configurationReceipts={...copy(draft.applied),...(draft.uncertainOwner?{[draft.uncertainOwner]:{status:'unknown'}}:{})};throw error;}
  const count=draft.changes.length;if(!continuing)return count;const now=snapshot();return {count,next:{...copy(draft),changes:[],diff:[],appliedSignature:'[]',revision:now.revision,matrixRevision:now.matrix.revision,interfaceStamp:now.interface?.stamp}};
 });}
 return {ask,guard,apply:d=>applyChanges(d,false),applyAndContinue:d=>applyChanges(d,true),catalog:()=>({configuration:formFor(snapshot()).current,choices:choices(),registry:{format:'tisya.matrix-schema/1'},tasks:[]})};
}
