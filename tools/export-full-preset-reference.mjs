import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Usage: node tools/export-full-preset-reference.mjs [sourceRoot] [outDir]
// Read source afresh on every process invocation. No model, network or application writes.
const root=path.resolve(process.argv[2]??path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const outDir=path.resolve(process.argv[3]??process.cwd());
const output=path.join(outDir,'缇斯亚_新版完整预设与注入上下文.txt');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const mod=p=>import(pathToFileURL(path.join(root,p)).href);
const hash=s=>createHash('sha256').update(s).digest('hex');
const [{compileNarrative},{defaultWorld,emptyConfig},{EMOTIONS},{registerPresetProtocol},{buildMessages},slotsModule,{pairedPreset,taskMessages},{TABLE_MODES},{TEXT_TASKS,textTaskPreset,textTaskMessages},{defaultRegistry,TABLE_SETTINGS},{NARRATIVE:N},{CAPTURE_RULES},{styleRules,stylePrompt}]=await Promise.all(['narrative-bridge.js','config/core.js','emotion-catalog.js','preset.js','config/host.js','tables/slots.js','tables/paired-preset.js','tables/modes.js','task-envelope.js','tables/schema.js','settings-core.js','tables/conditions.js','tables/style-rules.js'].map(mod));
const {SLOT_NAMES,SLOT_TARGETS,slotText,taskSlots,narrativeSlot}=slotsModule;
const {narrativeRuleDefault}=await mod('config/rule-text.js');
const {communicationMessages,contractorMessages}=await mod('communication.js');
const {createFoundationInput}=await mod('tables/foundation-intake.js');
const {conditionInstructions}=await mod('tables/condition-rules.js');
const {HEART_CONTROLS}=await mod('preset-heart-variants.js');
const {storyMaterial,storyPreferences,storyContext,storyBlueprint}=await mod('tables/story-material.js');
const {narrativeInstructions}=await mod('tables/prompts.js');
const {revisionMessages}=await mod('revision.js');
const {userRevisionMessages}=await mod('user-revision.js');
const {worldbookEntries}=await mod('tables/worldbook-context.js');
const {formatSimpleSheet}=await mod('tables/simple-sheet.js');
const gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim();
const fallback=read('index.js').match(/new URL\('\.\/(presets\/[^']+\.json)'/)?.[1];
assert.ok(fallback,'Actual mandatory preset fallback not found');
const p=JSON.parse(read(fallback)),source={prompts:p.prompts,order:p.prompt_order[0].order};
const configuration={world:defaultWorld(),data:emptyConfig()},registry=defaultRegistry();
configuration.world.context.owner='tisya';
configuration.world.tables={...TABLE_SETTINGS,enabled:true,archive:true,continuity:'tables',injection:'direct'};
const ctx={chat:[{mes:'《当前用户已经发送的输入原文》',is_user:true}],characters:[],powerUserSettings:{}};
const compiled=compileNarrative(ctx,source,EMOTIONS.map(e=>e.name),configuration);
const macros=new Map(Object.entries(compiled.rest.entries).map(([k,v])=>['tisya_live_'+k,()=>v]));
registerPresetProtocol({registerMacro:(k,v)=>macros.set(k,v),unregisterMacro(){}},()=>source,e=>{throw e;},()=>EMOTIONS.map(e=>e.name),()=>compiled.prose,()=>compiled);
macros.set('tisya_config_selected',()=>narrativeInstructions(configuration.world.tables)+'\n\n《当前实际选中的有效资料；没有资料时不发送本占位》');
const unknown=new Set();
const substitute=s=>String(s??'').replace(/\{\{([^{}]+)\}\}/g,(whole,key)=>{if(macros.has(key))return macros.get(key)();unknown.add(key);return whole;});
const labels={source:'《当前任务实际允许的来源；主聊天当前输入优先保持原user消息，不重复复制》',card:'《当前卡允许模型读取的定义原文；未触发或被字段替代的部分省略》',books:'《经原书绑定、触发和权限筛选后的条目或对应字段》',history:'《按实际历史选择器保留的原文；未实现归档裁剪时不能谎称只含最新必要原文》',archive:'《已确认且本轮相关的历史事件、经历与原话》',state:'《当前有效表单字段；见字段字典及自然资料层实际renderer》',preferences:'《经确认、启用且作用域匹配的长期偏好》',plan:'《条件性剧情方向；不是已发生事实》',genesis:'《仅创世相关任务使用的待审蓝图》',tools:'《真实工具结果；没有回执时为空》',toolInstructions:'《当前明确选用的工具定义》',toolCalls:'《本轮真实调用记录；未调用时为空》'};
const slots=Object.fromEntries(Object.keys(SLOT_NAMES).map(k=>[k,labels[k]??'《'+SLOT_NAMES[k]+'》']));
const record=(id,table,values)=>({id,table,rev:1,values,access:{readers:['读者'],knowers:[]}});
const characterFields=Object.fromEntries(Object.keys(registry.types.find(t=>t.id==='character').fields).map(k=>[k,'《'+k+'的已知原文；未知省略》']));
const materialRows=[
 record('placeholder-user','objects',{名称:'《当前绑定的用户角色名》',类型:'character',属性:{...characterFields}}),
 record('placeholder-focus','objects',{名称:'《当前关注人物名》',类型:'character',属性:{...characterFields}}),
 record('placeholder-present','objects',{名称:'《在场其他人物名》',类型:'character',属性:{...characterFields}}),
 record('placeholder-place','objects',{名称:'《本轮相关地点名》',类型:'place',属性:{环境:'《地点环境已知内容》',出入条件:'《已成立的出入条件》'}}),
 record('placeholder-scene','scene',{名称:'《当前场景名》',地点:'《当前地点》',当前时间:'《已确认世界时间》',参与者:['placeholder-user','placeholder-focus','placeholder-present']}),
 record('placeholder-task','tasks',{名称:'《当前尚未完成事项》',目标:'《已接受或启动的目标》',下一步:'《当前实际待办》',负责人:['placeholder-user']}),
 record('placeholder-state','state',{名称:'《当前快照项目》',对象:'placeholder-user',字段:'《当前已登记状态名》',值:'《实际确认值》'}),
 record('placeholder-event','events',{名称:'《本轮相关历史事件》',经过:'《已成功归档的事件经过》',时间:'《该事件已知时间》',原文段落:['《必要且有定位的原话片段》']})
];
const preferenceRows=[{...record('placeholder-pref','preferences',{名称:'《已确认偏好名称》',内容:'《已确认且作用域匹配的偏好内容》',证据:'《用户确认或明确表达的原句》',启用:true}),preferenceConfirmed:true}];
const stateData={rows:materialRows.filter(r=>r.table!=='events'),rulePolicy:{decisions:[{action:'optimize',changes:[{after:'《玩家已确认的当前适用规则正文》'}]}]},nativeState:{available:true,values:[{path:'/《当前状态名》',value:'《实际校验读回的值》'}]},eventResults:[{event:'《已确认且已结算的事件名》',ownerId:'placeholder-focus',instruction:'《该结果允许叙述的已成立变化》',changes:[{name:'《状态字段名》',before:'《前值》',after:'《实际确认的新值》'}],access:{knowers:['placeholder-focus']}}],conditionResults:[{text:'《已触发并完成结算的条件结果》',access:{knowers:['placeholder-focus']}}]};
slots.state=narrativeSlot(stateData,storyMaterial({rows:stateData.rows,registry,userId:'placeholder-user',focusObjects:['placeholder-focus']})+'\n'+storyContext(stateData,materialRows));
const prefs={explicit:['《用户明确的适用要求》'],style:stylePrompt(styleRules(TABLE_SETTINGS)),rows:preferenceRows};slots.preferences=narrativeSlot(prefs,storyPreferences(prefs));
const archiveData={rows:materialRows.filter(r=>r.table==='events')};slots.archive=narrativeSlot(archiveData,storyMaterial({rows:materialRows,selectedRows:archiveData.rows,registry}));
const blueprint={name:'《当前世界名称》',goal:'《已确认创世设计目标》',decisions:['《已选并获确认的设定》'],unresolved:['《尚未确定的设定》']};slots.genesis=narrativeSlot(blueprint,storyBlueprint(blueprint));
const plot={goal:'《本轮可选叙事目标》',beats:[{proposal:'《尚未发生的可选进展》',condition:'《它实际需要满足的条件》'}],pendingChoices:['《应留给用户的选择》'],constraints:['《本轮已明确限制》']};slots.plan=narrativeSlot(plot,storyMaterial({plot,registry}));
const storyOutput=['state','archive','plan','preferences','genesis'].map(key=>slotText(key,slots[key])).join('\n');
for(const tag of ['user','关注人物','在场其他人物','当前叙事待办','静态图鉴','当前快照','历史事件','用户偏好','世界设定依据'])assert.ok(storyOutput.includes('<'+tag+'>'),'Missing natural material section: '+tag);
assert.doesNotMatch(storyOutput,/placeholder-|originBook|sessionBook|schemaChanges|JSONPatch|数据库路径|缓存路径/);
const messages=buildMessages({source,context:ctx,world:configuration.world,materials:macros.get('tisya_config_selected')(),slots,substitute});
const messageEntries=new Map();
for(const q of source.prompts){
 const slot=Object.keys(SLOT_TARGETS).find(k=>SLOT_TARGETS[k]===q.identifier);
 const enabled=source.order.some(o=>o.identifier===q.identifier&&o.enabled)&&q.enabled!==false;
 if(slot&&slots[slot]!==undefined){const body=slotText(slot,slots[slot]);messageEntries.set(enabled?[substitute(q.content??''),body].filter(Boolean).join('\n\n'):body,q.identifier+(enabled?'':'（未启用槽，由实际兜底追加）'));}
 else if(enabled&&!q.marker&&q.content)messageEntries.set(substitute(q.content),q.identifier);
}
messageEntries.set(ctx.chat[0].mes,'chatHistory／当前user');
assert.equal(unknown.size,0,'Unresolved live macros: '+[...unknown]);
const out=[],add=(...x)=>out.push(...x);
add('缇斯亚：新版完整预设与注入上下文','这是当前候选源码的本地编译导出，不是你手机已经发送的请求。没有读取你的当前角色卡、世界书私文、绑定角色或聊天历史；《……》是可替换的资料占位，不是剧情事实。没有请求模型。',
'生成时间：'+new Date().toISOString(),'源码提交：'+gitHead+(dirty?'（含工作区候选修改；源码摘要见末尾）':'（工作区已提交）'),'实际内置回退主预设：'+fallback,
'阅读顺序：一为实际装配与条件；二为完整主正文；三为全部可选主条目；四为全部 TABLE 任务；五为全部 TEXT 任务；六为资料、字段与条件字典；七为尚未完成的目标与源码校验。',
'格式边界：这次简化的是缇斯亚拥有的业务填表任务和资料装配。原角色卡自行规定的 JSONPatch、变量语法、extra 内显示组件及其占位协议不由缇斯亚擅自改写，仍按对应授权与原消费者保留。API 的 HTTP 请求容器、工具传输容器和内部存储继续可用 JSON；它们不是要求模型手写的复杂业务表。',
'本轮候选代码已实现缇斯亚业务简表及正文自然资料投射；本地验收结果见交付记录。两阶段联合调度、来源感知历史裁剪与原世界书逐条替代仍在第七节明确列为未接线设计。',
'本文件不再附旧 JSON 基线。正文均取这次读取的源码；如源码仍含旧指令，它会真实显示并作为剩余问题记录，不能靠导出器替换文字冒充已经修复。',
'展示用消息标题、entry/role/条件说明不作为模型输入。各“正文”后到下一消息标题前为真实编译文本。某槽没有值时实际省略，不发送本文件的占位说明。');
add('','一、装配范围与分支',
'本次主正文选择：表单开启、自动归档开启、tables 接续、受控主装配、direct 注入；其余叙事选项使用代码默认。该选择仅为展示完整实际编译，不宣称你手机当前就是这一配置。',
'defaultWorld.context.owner 的代码默认仍为 '+defaultWorld().context.owner+'。native 路由的最终主上下文由宿主及其他扩展装配，本文件不能替代该路由请求快照。tables 接续会强制受控 owner，关闭原卡/persona直接复制。',
'原生世界书分支与受控资料槽分支不具有同一位置：受控 buildMessages 的 worldInfoBefore/worldInfoAfter为空；所选资料与表单通道按下面顺序进入。原生世界书实际激活由绑定、扫描、关键词/条件、预算和宿主位置决定。',
'当前输入保留 role=user。独立 tisya_current_input 的开关以源预设为准；导出为展示全部注册槽而提供占位槽，在关闭槽时 buildMessages 会按实际兜底规则补到 MATERIALS 关闭之前；实际服务没有提供的槽不会被自动填入。',
'游玩偏好属于全局配置，经 configuredWorld/compileNarrative 编进规则；叙事指令是可编辑规则措辞覆盖。已确认长期偏好属于资料记录，经确认、启用和作用域筛选后进 preferences 槽。二者不等于当前 user 消息。',
'用户明确本轮要求应在其范围内优先于冲突的既有偏好；本轮推断只可作可撤销短期控制或待确认候选，不凭角色台词、剧情中的拒绝或单纯重骰判定长期喜恶。不改变已确认事实、知情边界及玩家行动授权。此语义目标是否完整接到主请求，见第七节实际缺口。');
for(const [i,o]of source.order.entries()){
 const q=source.prompts.find(q=>q.identifier===o.identifier);assert.ok(q);
 const slot=Object.keys(SLOT_TARGETS).find(k=>SLOT_TARGETS[k]===q.identifier);
 add(`${i+1}. ${q.identifier} | role=${q.identifier==='chatHistory'?'逐条真实角色':q.role??'system'} | ${o.enabled&&q.enabled!==false?'开启':'关闭'} | ${q.marker?'宿主/历史marker':slot?'资料槽：'+SLOT_NAMES[slot]:'固定或实时编译条目'} | 位置=${q.injection_position??0}${q.injection_depth!==undefined?' 深度='+q.injection_depth:''}`);
}
add('','二、主正文：实际编译的完整消息（附全注册动态槽占位）');
messages.forEach((m,i)=>add('',`===== 主消息 ${i+1} | role=${m.role} | entry=${messageEntries.get(m.content)??'实际宿主展开条目'} =====`,'正文：',typeof m.content==='string'?m.content:'《实际多媒体载体，按原role保留；本例未提供》'));
add('','三、主预设其余可触发条目与选项全文',
'默认启用且已经在第二节出现的内容不重复；关闭条目保留实际编译正文。空内容只说明槽用途，不伪造一条消息。');
for(const o of source.order){const q=source.prompts.find(q=>q.identifier===o.identifier);if(o.enabled&&q.enabled!==false)continue;add('',`entry=${q.identifier} | role=${q.role??'system'} | 当前关闭`,q.content?substitute(q.content):'《空条目：按运行时所选配置或资料填入，没有来源则不发送》');}
for(const row of N.rows){add('',row.id+' '+row.label+' | 配置字段='+row.variable);if(row.rules)for(const [choice,text]of Object.entries(row.rules)){let effective=text;try{effective=narrativeRuleDefault(row.id,choice);}catch{}add('选择 '+choice+'：',effective);}else add('参数类型：'+row.type+'；允许值：'+(row.allowed?.join('、')??'运行时合法配置值'));}
add('', '三附：主预设条件分支的实际编译正文', '各分支只替换列出的同名entry，其他entry沿用第二节；这里逐项展开登记开关，不声称穷尽任意自定义规则与交叉组合。相同的完整正文只列一次。');
const mainVariantTexts=new Map();let mainVariantNo=0;
const mainVariants=[['完整工作流',w=>{w.modes[w.mode].workflowDetail='full';}],['仅格式与配置',w=>{w.modes[w.mode].workflowDetail='format';}],['关闭自动归档，主文恢复原记忆合同',w=>{w.tables.archive=false;}],['启用原生变量桥',w=>{w.tables.nativeBridge=true;}],['关闭摘要',w=>{w.modes[w.mode].summary=false;}],['关闭动作建议',w=>{w.modes[w.mode].actions=false;}],['关闭全部心声',w=>{w.modes[w.mode].heartDirections=[];}],...HEART_CONTROLS.map(h=>['仅心声：'+h.name,w=>{w.modes[w.mode].heartDirections=[h.name];}])];
for(const [label,change]of mainVariants){
 const w=structuredClone(configuration.world);change(w);const c=compileNarrative(ctx,source,EMOTIONS.map(e=>e.name),{...configuration,world:w});
 add('',label);let changed=0;
 for(const [id,text]of Object.entries(c.rest.entries))if(text!==compiled.rest.entries[id]){
  changed++;const key=hash(text),prior=mainVariantTexts.get(key),q=source.prompts.find(x=>x.identifier===id);
  if(prior)add(`entry=${id} | role=${q?.role??'system'} | 完整正文同本节主变体 ${prior}`);
  else{const n=++mainVariantNo;mainVariantTexts.set(key,n);add(`主变体 ${n} | entry=${id} | role=${q?.role??'system'}`,text);}
 }
 if(!changed)add('此分支在本次默认组合下没有改变 rest.entries；不是生成器虚构一份额外指令。');
}
add('','四、全部 TABLE 专属预设的完整正文');
function emitPreset(preset,title){
 add('',`========== ${title} ==========`, '任务：'+preset.task);
 const byId=new Map(preset.prompts.map(p=>[p.identifier,p]));
 for(const [i,o]of preset.prompt_order[0].order.entries()){
  const q=byId.get(o.identifier);assert.ok(q);
  add('',`消息 ${i+1} | role=${q.role} | entry=${q.identifier} | ${o.enabled&&q.enabled?'开启':'关闭'}`,'正文：',q.tisyaMaterialSlot?slotText(q.tisyaMaterialSlot,labels[q.tisyaMaterialSlot]):q.tisyaSelectedResources?'《本任务明确选定且适用的资源；无则省略》':q.taskInput?'《本次真实任务输入；按实际输入renderer展开，见第六节》':q.taskResources?'《当前任务明确选定资源；无则省略》':q.content);
 }
}
const auxiliary=new Map();
for(const task of Object.keys(TABLE_MODES)){const preset=pairedPreset({task,configuration});auxiliary.set(task,preset);emitPreset(preset,TABLE_MODES[task].name);assert.ok(taskMessages({preset,task,input:{}}).length>0);}
add('','四附：条件变体的完整差异条目','以下仅替换同名entry，不与默认合同叠加；没变化的entry沿用本任务上面的完整正文。完全相同的条目正文只列一次，其余指向本节明确编号，避免反复复制相同合同。');
const variantTexts=new Map();let variantTextNumber=0;
function emitVariant(q){
 const key=hash(q.content),prior=variantTexts.get(key);
 if(prior){add(`role=${q.role} | entry=${q.identifier} | 完整正文同本节变体正文 ${prior}`);return;}
 const n=++variantTextNumber;variantTexts.set(key,n);add(`变体正文 ${n} | role=${q.role} | entry=${q.identifier}`,q.content);
}
for(const task of ['tableArchive','historyImport'])for(const nativeOwned of [false,true])for(const archiveAlready of [false,true]){
 const nativeBridge={enabled:true,writer:'native-mvu',nativeOwned,archiveAlready};
 for(const archiveProposal of task==='tableArchive'?[false,true]:[false]){
  const variant=pairedPreset({task,configuration,nativeBridge,archiveProposal}),base=auxiliary.get(task);
  add('',`${task}：原生单写入者开启；nativeOwned=${nativeOwned}；archiveAlready=${archiveAlready}；独立归档审核=${archiveProposal}`);
  for(const q of variant.prompts){const old=base.prompts.find(x=>x.identifier===q.identifier);if(q.content!==old?.content)emitVariant(q);}
 }
}
const reviewed=pairedPreset({task:'tableArchive',configuration,archiveProposal:true});add('','tableArchive：仅独立归档审核开启、原生桥关闭');for(const q of reviewed.prompts)if(q.content!==auxiliary.get('tableArchive').prompts.find(x=>x.identifier===q.identifier)?.content)emitVariant(q);
add('','五、全部 TEXT 专属预设的完整正文');
for(const task of Object.keys(TEXT_TASKS)){
 if(task==='foundation-extraction'){
  const context=createFoundationInput({rows:[],registry},{source:'《当前用户选定的完整资料原文》',ownerName:'《待提炼人物名》',model:'《实际接口模型名》'}).context;
  add('', '========== 档案提炼：手动生产入口的实际 compact-v2 完整预设 ==========', '这里调用 createFoundationInput，不以通用 textTaskPreset 空 instructions 代替真实提炼合同。');
  context.body.messages.forEach((m,i)=>add('',`消息 ${i+1} | role=${m.role}`,'正文：',m.content));
 }else{
  const instructions=task==='communication'?communicationMessages({format:'tisya.communication-input/1',text:''})[0].content:'';
  const preset=textTaskPreset({task,instructions,settings:configuration.world.modes[configuration.world.mode].narrative});emitPreset(preset,TEXT_TASKS[task][0]);assert.ok(textTaskMessages({preset,input:'《当前任务输入》'}).length>0);
 }
}
add('', '五附：本轮场外要求的实际追加消息', '仅在本轮存在明确场外要求时追加到主请求；场外要求不是角色台词，不自动存为长期偏好。');
contractorMessages('《契约者明确给本轮的写作要求》').forEach((m,i)=>add('',`消息 ${i+1} | role=${m.role}`,m.content));
add('', '五附：定向重骰实际追加消息（仅此操作触发）');
revisionMessages({mode:'partial',selected:[1],direction:'《用户本次修改方向》',details:'《用户希望增加的细节》',polish:false,source:'《未采纳的旧候选完整正文》',paragraphs:[{id:1,raw:'《已选择的原段落》'}]}).forEach((m,i)=>add('',`消息 ${i+1} | role=${m.role}`,m.content));
add('', '五附：改写用户消息后重投的实际追加消息（仅存在可靠上一版对照时）');
userRevisionMessages({previous:'《该用户消息的上一版原文》',current:'《该用户消息的现行有效原文》'}).forEach((m,i)=>add('',`消息 ${i+1} | role=${m.role}`,m.content));
add('', '主请求追加顺序：受控主消息之后，先本轮场外要求，再定向重骰材料，最后用户消息改写对照；没有对应操作不发送。续写的提醒由 chatHistory 槽之后插入；quiet_prompt 只在调用方明确提供时插入。');
add('', '原生变量桥开启时，主资料处理指令的完整替代正文：',narrativeInstructions({...configuration.world.tables,nativeBridge:true}));
add('','六、所有注册资料槽、表字段、条件与世界书位置',
'这里列的是装配字典，不会整段发给故事模型。新增卡类型、自定义字段和扩展工具可能继续增加资料；“完整”指本次源码已注册集合，不声称穷尽任意未来扩展。');
add('', '当前源预设引用的全部实时宏：');for(const name of [...new Set(source.prompts.flatMap(q=>[...String(q.content??'').matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1])))])add('{{'+name+'}} → '+(macros.has(name)?'本次由实际宏注册器展开':'宿主提供的运行时宏；没有真实来源不可编造'));
for(const [key,label]of Object.entries(SLOT_NAMES))add(key+' → '+SLOT_TARGETS[key]+' → '+label+'；空状态：未提供则不发送。','实际renderer样式：',slotText(key,labels[key]));
add('', 'taskSlots 当前读取的全部输入占位字段（按源码实际访问提取）：');
for(const name of [...new Set([...read('tables/slots.js').matchAll(/input\.(\w+)/g)].map(m=>m[1]))])add(name+'： 《本任务实际提供的 '+name+'；缺少则保留未提供，不补造》');
add('','辅助输入的实际展开样式（只有占位词，无真实卡内容）：');
for(const task of Object.keys(TABLE_MODES)){
 const input={userInput:'《本次用户原文》',archiveSource:'《已确认且本任务可引用的来源原文》',question:'《用户问题》',sourceCardRaw:'《角色卡允许读取的原文》',sourceBooks:'《实际触发并获准使用的世界书原文》',sourceHistory:'《实际选中的历史原文》',currentRows:[],preferences:[],registry:{tables:[],types:[]}};
 add('',task,Object.entries(taskSlots(task,input)).map(([key,value])=>slotText(key,value)).filter(Boolean).join('\n\n'));
}
add('','TEXT 输入实际renderer：',textTaskMessages({preset:textTaskPreset({task:'subtask'}),input:{目标:'《当前任务》',来源:'《允许引用的资料》'}}).find(m=>m.content.includes('《当前任务》'))?.content??'《没有输入消息》');
function describe(value){if(value===null)return '空值';if(Array.isArray(value))return value.map(describe).join('、');if(value&&typeof value==='object')return Object.entries(value).map(([k,v])=>k+'='+describe(v)).join('；');return String(value);}
function fields(defs,prefix=''){for(const [key,v]of Object.entries(defs)){add(prefix+key+' | 类型='+v.type+(v.required?' | 结构必填':'')+' | 注入='+describe(v.include??'未单设')+' | 录入='+String(v.capture??'未单设')+(v.follow?' | 引用跟随='+v.follow:''));if(v.fields)fields(v.fields,prefix+key+'／');if(v.items)fields({'每项':v.items},prefix+key+'／');}}
for(const d of registry.tables){add('',d.name+' | 表='+d.id+' | 写入职责='+d.owner+' | 行触发='+describe(d.assemble));fields(d.fields);}
for(const d of registry.types){add('',d.name+' | 类型='+d.id+' | 父类型='+(d.parent??'无'));fields(d.fields);}
add('', '其他主预设可触发开关：', '工作流详细度：full / compact / format；摘要与动作建议独立开启/关闭；结构化输出开/关；主文 prose 与 utility 任务模式互斥。', '心声可选方向：'+HEART_CONTROLS.map(x=>x.name).join('、'), '登记叙事任务：'+N.tasks.join('、'), '默认功能开关：'+N.protocol.P.features.map(([name,key])=>name+'='+key).join('、'));
add('', '原生世界书登记字段（装配说明，不进入故事资料正文）：');for(const f of JSON.parse(read('worldbook/native-catalog.json')).fields)add(f.key+' | '+f.label+' | '+f.type+' | 默认表达='+f.defaultCode);
add('', '可执行条件填写的现行共同规则：',conditionInstructions({version:1,fields:[]}),'具体状态名、单位、等级、事件名及允许修改字段必须来自当前卡已登记词表；本例没有词表，不编造实际阈值或状态。');
add('','录入规则准确原文：');for(const [id,text]of Object.entries(CAPTURE_RULES))add(id+'：'+text);
add('','条件层不能混同：表/字段 include；状态条件引擎；原生世界书 external gate 分别裁定不同事项。归档层分类不等于触发或权限。',
'表/字段条件当前操作：always、selected、strict、context、cue、tagged、retrieved、focused、rule；any/all/not；eq/oneOf/has；text(previous/user/either)。文字命中保留词边界，不执行脚本。引用闭包还要受字段跟随及材料预算约束。',
'原生世界书条件gate通过后当前会常驻化该条，不能称为自动继承并与原关键词AND。原书四源绑定、条目身份和顺序要分别保留；失败或未知不得默认放行。',
'表单世界书投影当前默认位置：position=4、depth=1、role=0；场景/偏好、检索命中、上回合标签或到期命中可常驻，否则以名称/别名/标签及引用对象名触发。投影分支真实代码摘要见末尾，不能将这套再建触发说成原条目触发自动等价迁移。',
'表 owner 是任务写入职责；condition.objectId 是状态所属对象；access.readers/knowers 是读者及人物知情。它们不能互相代替。');
add('', '六附：世界书投影分支的真实条目占位展开', '这些是缇斯亚生成的临时投影条目，实际触发后才进入；不是已经修改、禁用或替换原世界书的证据。位置、顺序与触发属性在标题中，正文来自实际 worldbookEntries/story renderer。');
for(const e of worldbookEntries({rows:materialRows,registry,scope:'占位会话',userId:'placeholder-user',focusObjects:['placeholder-focus'],forcedIds:['placeholder-focus']})){
 add('', `条目：${e.comment} | 触发=${e.tisyaTable.reason} | 常驻=${e.constant} | position=${e.position} | depth=${e.depth} | role=${e.role} | order=${e.order}`, '关键词：'+e.key.join('、'), '正文：',e.content);
}
add('','七、实现边界与本地校验',
'默认两段联合维护目标：生成前一请求归档已确认来源、世界推演、调取档案；正文一请求接当前user、前段已写回结果和有效上下文，处理当轮偏好。是否已经合并调用链必须以 service.prepare 实际实现为准；本导出不以预设文案宣称调用融合完成。',
'历史目标：已成功归档的长篇格式正文不再重复全注入，保留结构档案和最新必要原文。必须由来源感知的选择器落实，不能只把slot标题改名。',
'世界书目标：缇斯亚存档书与原条目逐项映射，保留绑定、触发、权限和位置；只有字段覆盖、来源验证与可回退替代真正接通后才称替代。当前原生/受控各路由须分别验收。',
'自然资料层本轮候选已由 story-material.js、narrativeSlot 和 service.assemble 接线；第二节用明确占位行展示真实renderer。user、关注人物、在场其他人物、当前叙事待办、静态图鉴、当前快照、历史事件、用户偏好按已有字段生成，缺失分区省略。人物字段能否进一步拆成基础信息、性格标签、详细性格、背景前史、声口习惯，取决于当前卡类型实际已登记字段；不能只改标签就声称历史资料已迁移。');
const targetA={归档变更:{templates:[],schemaChanges:[],changes:[{id:'new:《本批唯一事件编号》',table:'events',expected:0,values:{名称:'《有据名称》',经过:'《本次已确认且来源支持的事件经过》'},evidence:'《连续来源原句》',access:{readers:['读者'],knowers:[]}}],pending:[]},世界推进:{from:'《已确认起点》',to:'《获准终点》',events:[{id:'new:《本批唯一场外事件编号》',name:'《有据场外事件》',summary:'《获准窗口内有依据的过程与结果》',at:'《窗口内实际时点》',actors:['《获准主体引用》'],basis:[{id:'《实际依据行》',rev:1}],changes:[]}],pending:[]},补读请求:[],接续要点:{资料引用:['《本轮确实需要的档案引用》'],未决事项:[]},待处理:[]};
const targetB={本轮调整:[{内容:'《仅本轮采用的写作调整》',依据:'《用户本轮明确原句》',持续范围:'本轮'}],长期偏好候选:[{名称:'《持续偏好的简明名称》',内容:'《原话支持的持续要求》',证据:'《用户原句》',性质:'明确要求',类别:'文风',强度:'偏好',作用域:{会话:['《准确会话引用；全局等范围按用户原话选择》']},例外:[],确认状态:'待用户确认'}]};
const design=read('docs/two-stage-preset-design.txt').replace('===A_RETURN_SHAPE===',formatSimpleSheet(targetA)).replace('===B_RETURN_SHAPE===',formatSimpleSheet(targetB));
assert.ok(!design.includes('===A_RETURN_SHAPE===')&&!design.includes('===B_RETURN_SHAPE==='));
add('',design);
const sourceFiles=['index.js','config/host.js','config/core.js','config/history-context.js','narrative-bridge.js','config/rule-text.js','tables/slots.js','tables/pipes.js','tables/modes.js','tables/prompts.js','tables/paired-preset.js','tables/task-profiles.js','task-envelope.js','communication.js','tables/foundation/extraction.js','tables/schema.js','tables/conditions.js','tables/worldbook-context.js','tables/service.js','tables/story-material.js','tables/simple-sheet.js','tables/task-sheet.js','tables/model-tool-sheet.js','config/tool-loop.js','docs/two-stage-preset-design.txt','tools/export-full-preset-reference.mjs','revision.js','user-revision.js','settings-core.js','preset-heart-variants.js',fallback];
add('','本次源码摘要：');for(const file of sourceFiles)if(fs.existsSync(path.join(root,file)))add(file+' | SHA256 '+hash(read(file)));
add('','校验：所有登记 TABLE 和 TEXT 任务均通过实际preset/messages函数构造；主消息由实际 buildMessages 得到；未解析宏数='+unknown.size+'；没有模型或手机运行测试。');
fs.mkdirSync(path.dirname(output),{recursive:true});const text=out.join('\n')+'\n';fs.writeFileSync(output,text);
console.log(JSON.stringify({output,bytes:Buffer.byteLength(text),sha256:hash(text),mainMessages:messages.length,mainEntries:source.order.length,tableTasks:Object.keys(TABLE_MODES).length,textTasks:Object.keys(TEXT_TASKS).length,source:gitHead,dirty:!!dirty}));
