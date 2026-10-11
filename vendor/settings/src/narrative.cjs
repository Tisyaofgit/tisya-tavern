'use strict';
const D=require('./narrative-data.cjs');
const {PROTOCOL:Protocol}=require('./narrative-protocol.cjs');
const {createCompiler,stable}=require('./narrative-compiler.cjs');
const compile=createCompiler(D.contract,D.tasks);
const MARK='缇斯亚叙事配置提交记录';
const LEGACY=[...D.contract.configurations.map(r=>r.variable),'缇斯亚叙事语言配置','缇斯亚当前任务'];
const BUSINESS=[...LEGACY,...Protocol.KEYS];
const OPTIONAL=['缇斯亚MVU兼容'];
const ALL=[MARK,...new Set([...BUSINESS,...OPTIONAL,...D.contract.extra_fields.map(r=>r.variable)])];
const fail=(code,detail)=>{throw Object.assign(new Error(code),{code,detail});};
const SHAPE_FIELDS=new Set(['id','name','description','entries','basicPrompts','content','identifier','active','enabled','type','role',
  'injectionPosition','injectionDepth','avatar','firstMes','personality','scenario','mesExample','creatorNotes','systemPrompt',
  'postHistoryInstructions','alternateGreetings','tags','creator','characterVersion','nickname','groupOnlyGreetings','creationDate',
  'modificationDate','extensions','data','character_book','keywords','secondaryKeywords','strategy','scanDepth','sortIndex',
  'lower','upper','状态','修订','编号','名称','配置','结构版本','条目','下限','上限','单位',...ALL]);
const SHAPE_REASONS=new Set(['depth-limit','unsupported-type','non-finite-number','accessor','non-enumerable','symbol-key',
  'forbidden-key','sparse-array','cycle','date-in-variable','invalid-date','expected-object','getter-missing','getter-failed']);
function shapeFail(path,reason,value){
  fail('TISHA_NARRATIVE_SHAPE',{path,reason,valueType:value===null?'null':Array.isArray(value)?'array':typeof value});
}
function shapeDetail(error){
  const d=error?.detail;
  if(error?.code!=='TISHA_NARRATIVE_SHAPE'||!d||!SHAPE_REASONS.has(d.reason))return null;
  if(typeof d.path!=='string'||d.path.length>2048||!['null','array','object','undefined','string','number','boolean','function','symbol','bigint'].includes(d.valueType))return null;
  return {path:d.path,reason:d.reason,valueType:d.valueType};
}
function shapeMessage(d){
  const operations={'preset.get':'读取预设','persona.get':'读取用户身份','character.get':'读取角色卡','lorebook.get':'读取世界书',
    'variable.list.chat':'读取当前聊天变量','variable.list.global':'读取全局变量','variable.get.chat':'读取聊天变量',
    'variable.get.global':'读取全局变量','variable.set.chat':'准备写入聊天变量','variable.set.global':'准备写入全局变量'};
  const reasons={'depth-limit':'嵌套过深','unsupported-type':'含不支持的数据类型','non-finite-number':'数值无效',
    'accessor':'字段使用取值器','non-enumerable':'字段不可枚举','symbol-key':'字段名类型不支持','forbidden-key':'字段名不支持',
    'sparse-array':'数组有空位','cycle':'存在循环引用','date-in-variable':'配置变量含日期对象','invalid-date':'日期无效','expected-object':'应返回对象','getter-missing':'字段只有写入器，无法读取','getter-failed':'字段取值失败'};
  return (operations[d.operation]||'读取数据')+'失败：'+d.path+'，'+(reasons[d.reason]||'格式不符')+'（'+d.valueType+'）。输入已保留。';
}

function decode(v,depth=0,path='$',nativeSource=false,ancestors=new Set()){
  if(depth>30)shapeFail(path,'depth-limit',v);
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v==='number')shapeFail(path,'non-finite-number',v);
  if(!v||typeof v!=='object')shapeFail(path,'unsupported-type',v);
  // Date's intrinsic supports dates from other realms and invokes no user toJSON.
  let dateTime;try{dateTime=Date.prototype.getTime.call(v);}catch(_){}
  if(dateTime!==undefined){
    if(!nativeSource)shapeFail(path,'date-in-variable',v);
    if(!Number.isFinite(dateTime))shapeFail(path,'invalid-date',v);
    return new Date(dateTime).toISOString();
  }
  if(ancestors.has(v))shapeFail(path,'cycle',v);
  ancestors.add(v);
  const array=Array.isArray(v),out=array?[]:{};
  try{
    let index=0;
    for(const key of Reflect.ownKeys(v)){
      if(array&&key==='length')continue;
      const part=typeof key==='string'&&SHAPE_FIELDS.has(key)?'.'+key:
        array&&typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)?'['+key+']':'[field#'+index+']';
      index++;const next=path+part,d=Object.getOwnPropertyDescriptor(v,key);
      if(typeof key!=='string')shapeFail(next,'symbol-key',v);
      if(key==='__proto__')shapeFail(next,'forbidden-key',v);
      if(!d)shapeFail(next,'accessor',v);
      let value;
      if(Object.hasOwn(d,'value')){
        if(!d.enumerable&&!nativeSource)shapeFail(next,'non-enumerable',d.value);
        value=d.value;
      }else{
        if(!nativeSource)shapeFail(next,'accessor',v);
        if(typeof d.get!=='function')shapeFail(next,'getter-missing',v);
        // Native API DTOs expose compatibility aliases as accessors (firstMes
        // confirmed on device). Read each own property once per snapshot with
        // its original receiver; never assign to the host object or invoke setters.
        try{value=Reflect.apply(d.get,v,[]);}catch(_){shapeFail(next,'getter-failed',v);}
      }
      out[key]=decode(value,depth+1,next,nativeSource,ancestors);
    }
    if(array){for(let i=0;i<v.length;i++)if(!Object.hasOwn(out,i))shapeFail(path+'['+i+']','sparse-array',v);}
    return out;
  }finally{ancestors.delete(v);}
}
function decodeSource(v){return decode(v,0,'$',true);}

function project(tree){
  if(!tree||typeof tree!=='object'||Array.isArray(tree))shapeFail('$','expected-object',tree);
  const out={};for(const k of ALL){const d=Object.getOwnPropertyDescriptor(tree,k);if(d){if(!Object.hasOwn(d,'value'))shapeFail('$.'+k,'accessor',tree);out[k]=decode(d.value,0,'$.'+k);}}
  return out;
}
function inspect(tree){
  const present=[MARK,...BUSINESS].filter(k=>Object.hasOwn(tree,k));
  if(!present.length)return {kind:'absent',revision:null,settings:null};
  const m=tree[MARK];
  if(!m||m.状态!=='就绪'||typeof m.修订!=='string'||!/^[0-9a-f]{32}$/.test(m.修订))fail('TISHA_NARRATIVE_INCOMPLETE');
  if(LEGACY.every(k=>Object.hasOwn(tree,k))&&Protocol.KEYS.every(k=>!Object.hasOwn(tree,k))){
    const settings=Object.fromEntries(LEGACY.map(k=>[k,tree[k]]));validate({...settings,...Protocol.defaults()});
    return {kind:'needs_setup',revision:m.修订,settings};
  }
  if(present.length!==BUSINESS.length+1)fail('TISHA_NARRATIVE_INCOMPLETE');
  const settings=Object.fromEntries([...BUSINESS,...OPTIONAL.filter(k=>Object.hasOwn(tree,k))].map(k=>[k,tree[k]]));
  validate(settings);
  return {kind:'ready',revision:m.修订,settings};
}
// Validate the injection interface, not user-authored narrative instructions.
// Owned EJS bridges and native material slots belong to this contract.
// Diagnostics contain structural facts only: no prompt text or custom names.
function presetCheck(p){
  const result={expectedVersion:'0.11.0',validationMode:'independent-entries',state:'unreadable',issues:[],independentOrderEditable:true};
  if(!p||!Array.isArray(p.entries)||p.entries.some(e=>!e||typeof e!=='object'))return result;
  const entries=p.entries,issues=result.issues;
  if(!entries.some(e=>typeof e.identifier==='string'&&e.identifier.startsWith('tisya_'))){result.state='unrelated';return result;}
  const core=['main','tisya_task_start','tisya_registry','tisya_internal_login','tisya_inner_chain'];
  const known=new Set([...D.preset.prompts.map(e=>e.identifier),...require('./rest-protocol/legacy-identifiers.json')]);
  const active=entries.filter(e=>e.active===true&&e.enabled===true);
  for(const id of core){
    const found=entries.filter(e=>e.identifier===id);
    if(!found.length)issues.push({entry:id,reason:'missing'});
    else if(!active.some(e=>e.identifier===id))issues.push({entry:id,reason:'inactive-or-disabled'});
  }
  for(const id of new Set(entries.map(e=>e.identifier))){
    if(known.has(id)&&entries.filter(e=>e.identifier===id).length>1)issues.push({entry:id,reason:'duplicate'});
  }
  for(const e of entries.filter(e=>known.has(e.identifier))){
    if(typeof e.active!=='boolean'||typeof e.enabled!=='boolean')issues.push({entry:e.identifier,reason:'invalid-switch'});
    if(active.includes(e)&&!e.marker&&e.type!=='marker'&&typeof e.content!=='string')issues.push({entry:e.identifier,reason:'content-type'});
  }
  if(active.some(e=>/^tisya_protocol_/.test(e.identifier||'')))issues.push({reason:'legacy-fragments'});
  // Narrative text and placement remain user-editable. Only host interfaces
  // and single history ownership are checked here.
  if(active.some(e=>['tisya_recent_reply','tisya_current_input'].includes(e.identifier))&&active.some(e=>e.identifier==='chatHistory'))issues.push({entry:'chatHistory',reason:'duplicate-history'});
  result.entryCount=entries.length;result.activeEntries=active.map(e=>e.identifier).filter(id=>known.has(id));
  result.entries=entries.map((e,index)=>({index,identifier:known.has(e.identifier)?e.identifier:'(extra)',active:e.active===undefined?'absent':e.active,enabled:e.enabled===undefined?'absent':e.enabled}));
  result.activeOrder=result.activeEntries.map(id=>known.has(id)?id:'(extra)');
  result.outputEnabled=result.activeEntries.includes('tisya_output');
  result.state=issues.length?'mismatch':'match';return result;
}
function presetMatches(p,onCheck=()=>{}){
  const check=presetCheck(p);onCheck(check);
  if(check.state==='unreadable')fail('TISHA_NARRATIVE_PRESET_READ');
  if(check.state==='unrelated')return false;
  if(check.state==='mismatch')fail('TISHA_NARRATIVE_PRESET_MISMATCH');
  return true;
}
function presetMismatchMessage(check){
  const labels={'content-type':'条目正文须为文本','legacy-fragments':'当前预设仍包含旧版跨条目拼接片段','fragment-order':'资料拼接片段的先后顺序不符；请连同资料占位整组移动','split-insertion':'独立条目插入了未闭合的资料拼接区；请移至该区之前或之后','invalid-switch':'输出开关状态无效','missing':'缺少条目','inactive-or-disabled':'条目未激活或未启用',
    'duplicate':'条目重复','duplicate-history':'原生角色历史与插件精简消息槽不能同时启用','bridge-content':'插件注入槽的宏／EJS 与配套接口不一致','bridge-type':'插件注入槽应使用自定义条目类型','marker-type':'资料占位条目类型不符','role-or-position':'消息角色或注入位置不符'};
  const issue=check?.issues?.find(i=>i.reason!=='fragment-order')||check?.issues?.[0];
  return '当前预设的注入接口与配套 '+(check?.expectedVersion||'版本')+' 不匹配：'+(labels[issue?.reason]||'请检查当前聊天所选预设')+
    (issue?.entry?'（'+issue.entry+'）':'')+'。输入已保留；详情见“更多 → 复制记录”。';
}

function snapshot(settings,{id='0'.repeat(32),chatId='validation',epoch=0,personaId=0,revision='draft',goal='校验',outputOptions,outputEnabled=true,activeEntries}={}){
  const binding={用户身份编号:personaId,档案引用:null,绑定修订:revision};
  const full={...settings,'缇斯亚玩家绑定方式':'平台身份','缇斯亚玩家换角方式':'界面选择','缇斯亚玩家档案引用':null,'缇斯亚玩家绑定记录':binding};
  const name=settings['缇斯亚当前任务'];
  const mode=settings['缇斯亚叙事创作模式'];
  const output=name==='叙事'?((['互动叙事','大纲扩写'].includes(mode)?'先交付公开创作摘要，再交付叙事正文。正文篇幅只统计正文可见文本。':'交付'+mode+'结果，保留依据与待定事项。')+
    ''):
    '交付'+(D.tasks[name]?.product||'')+'；保持来源引用；缺失事实列为待定。';
  const empty=()=>({status:'ok',text:'',sources:[]});
  return {request:id,context:{chat:chatId,branch:'current-host-chat',epoch,historyRevision:id,configRevision:revision,sourceRevision:id,personaId},
    settings:full,binding,outputOptions,outputEnabled,activeEntries,task:{name,goal,output},
    materials:{playerArchive:empty(),cardflow:empty(),memory:empty()}};
}
function validate(settings){
  if(settings&&stable(Object.keys(settings).sort())===stable([...LEGACY].sort()))fail('TISHA_NARRATIVE_PROTOCOL_SETUP');
  if(!settings||stable(Object.keys(settings).filter(k=>!OPTIONAL.includes(k)).sort())!==stable([...BUSINESS].sort()))fail('TISHA_NARRATIVE_SETTINGS_SHAPE');
  if(OPTIONAL.some(k=>Object.hasOwn(settings,k)&&typeof settings[k]!=='boolean'))fail('TISHA_NARRATIVE_SETTINGS_SHAPE');
  if(settings['缇斯亚叙事视角主体']==='指定 NPC'||settings['缇斯亚叙事文风']==='选文风卡')fail('TISHA_NARRATIVE_ARCHIVE_NOT_CONNECTED');
  // Validate narrative choices even while a utility task is selected.
  try{const fixture={outputOptions:{summary:true,heartEnabled:false,heartDirections:[],generationId:'0'.repeat(32)}};compile(snapshot({...settings,'缇斯亚当前任务':'叙事'},fixture));compile(snapshot(settings,fixture));}
  catch(e){if(e.code)throw e;fail('TISHA_NARRATIVE_'+e.message.replace(/[^A-Z0-9_]/g,'_'),e.message);}
}
function suggestions(){
  const values=['不代写','留给玩家','简短承接','不新增','待玩家选择时','互动叙事',
    '第三','玩家角色','限知','视角人物内心','关闭','不揭示未公开秘密',
    '自然小说','随世界设定','均衡','适中','随场景',[],{下限:2000,上限:5000,单位:'字'},'简体中文','克制套话','遵循人物',
    '标准','关键人物','简短','原本人格','关闭',{下限:4,上限:6},null,null,null,null,null,null];
  return {...Object.fromEntries(D.contract.configurations.map((r,i)=>[r.variable,values[i]])),'缇斯亚当前任务':'叙事','缇斯亚叙事语言配置':[],...Protocol.defaults()};
}
const PROFILE_INDEX='缇斯亚叙事方案目录';
const PROFILE_PREFIX='缇斯亚叙事方案_';
function storageKey(key,scope='chat'){
  if(scope==='chat'&&ALL.includes(key))return key;
  if(scope==='global'&&[MARK,...BUSINESS,...OPTIONAL].includes(key))return key.replace('缇斯亚','缇斯亚默认');
  if(scope==='global'&&(key===PROFILE_INDEX||/^缇斯亚叙事方案_[0-9a-f]{32}$/.test(key)))return key;
  fail('TISHA_NARRATIVE_KEY');
}
function scoped(io,scope='chat'){
  if(!['chat','global'].includes(scope))fail('TISHA_NARRATIVE_SCOPE');
  return {narrativeGet:k=>io.narrativeGet(k,scope),narrativeRead:()=>io.narrativeRead(scope),narrativeSet:(k,v)=>io.narrativeSet(k,v,scope)};
}
function projectScope(tree,scope='chat'){
  if(scope==='chat')return project(tree);
  if(scope!=='global'||!tree||typeof tree!=='object'||Array.isArray(tree))fail('TISHA_NARRATIVE_SCOPE');
  const out={};for(const k of [MARK,...BUSINESS,...OPTIONAL]){const d=Object.getOwnPropertyDescriptor(tree,storageKey(k,scope));if(d){if(!Object.hasOwn(d,'value'))shapeFail('$.'+k,'accessor',tree);out[k]=decode(d.value,0,'$.'+k);}}
  return out;
}
async function initializeFromDefaults(io,operationId){
  const current=await read(io);if(current.kind!=='absent')return current;
  const defaults=await read(scoped(io,'global'));if(defaults.kind==='absent')return current;
  if(defaults.kind==='needs_setup')fail('TISHA_NARRATIVE_PROTOCOL_SETUP');
  const O=require('./task-output-settings.cjs'),currentOutput=await O.read(io.thought,'chat'),defaultOutput=await O.read(io.thought,'global');
  const result=await save(io,defaults.settings,null,operationId);
  if(currentOutput.kind==='absent'&&defaultOutput.kind==='ready')await O.save(io.thought,'chat',{value:defaultOutput.value,revision:null},operationId);
  return result;
}
async function profiles(io){
  const data=await io.narrativeGet(PROFILE_INDEX,'global');
  if(data===undefined)return {修订:null,条目:[]};
  if(!data||typeof data!=='object'||Object.keys(data).length!==2||!/^[0-9a-f]{32}$/.test(data.修订)||!Array.isArray(data.条目)||data.条目.length>100)fail('TISHA_NARRATIVE_PROFILES_INVALID');
  const ids=new Set(),names=new Set();for(const row of data.条目){if(!row||Object.keys(row).length!==2||!/^[0-9a-f]{32}$/.test(row.编号)||!validName(row.名称)||ids.has(row.编号)||names.has(row.名称))fail('TISHA_NARRATIVE_PROFILES_INVALID');ids.add(row.编号);names.add(row.名称);}
  return data;
}
function validName(name){return typeof name==='string'&&name.trim()===name&&name.length>0&&name.length<=32&&!/[\x00-\x1f\x7f]/.test(name);}
async function writeProfileBody(io,key,value,before){
  await io.narrativeSet(key,value,'global');
  if(stable(await io.narrativeGet(key,'global'))!==stable(value))fail('TISHA_NARRATIVE_SAVE_READBACK');
  if(stable(await profiles(io))!==stable(before))fail('TISHA_NARRATIVE_REVISION_CHANGED');
}
async function saveProfile(io,name,settings,operationId,output){
  if(output!==undefined)require('./task-output-settings.cjs').validate(output);
  if(!validName(name))fail('TISHA_NARRATIVE_PROFILE_NAME');validate(settings);
  const before=await profiles(io);if(before.条目.some(p=>p.名称===name))fail('TISHA_NARRATIVE_PROFILE_EXISTS');if(before.条目.length>=100)fail('TISHA_NARRATIVE_PROFILE_LIMIT');
  const id=operationId(),key=PROFILE_PREFIX+id,value={结构版本:1,名称:name,配置:settings,...(output===undefined?{}:{输出:output})};
  if(await io.narrativeGet(key,'global')!==undefined)fail('TISHA_NARRATIVE_PROFILE_EXISTS');
  await writeProfileBody(io,key,value,before);
  const next={修订:id,条目:[...before.条目,{编号:id,名称:name}]};await io.narrativeSet(PROFILE_INDEX,next,'global');
  if(stable(await profiles(io))!==stable(next))fail('TISHA_NARRATIVE_SAVE_READBACK');return next;
}
async function changeProfile(io,operation,payload,operationId){
  const before=await profiles(io);
  if(payload.revision!==before.修订)fail('TISHA_NARRATIVE_REVISION_CHANGED');
  const row=before.条目.find(x=>x.编号===payload.id);if(!row)fail('TISHA_NARRATIVE_PROFILE_MISSING');
  const current=await loadProfile(io,row.编号),key=PROFILE_PREFIX+row.编号,original=await io.narrativeGet(PROFILE_PREFIX+row.编号,'global');
  const name=operation==='rename'?payload.name:row.名称;
  if(!validName(name))fail('TISHA_NARRATIVE_PROFILE_NAME');
  if(before.条目.some(x=>x.编号!==row.编号&&x.名称===name))fail('TISHA_NARRATIVE_PROFILE_EXISTS');
  const revision=operationId();if(!/^[0-9a-f]{32}$/.test(revision))fail('TISHA_NARRATIVE_OPERATION_ID');
  if(operation==='delete'){
    if(payload.confirm!==row.名称)fail('TISHA_NARRATIVE_PROFILE_CONFIRM');
    const next={修订:revision,条目:before.条目.filter(x=>x.编号!==row.编号)};
    await io.narrativeSet(PROFILE_INDEX,next,'global');
    if(stable(await profiles(io))!==stable(next))fail('TISHA_NARRATIVE_SAVE_READBACK');
    try{await io.narrativeDelete(key,'global');if(await io.narrativeGet(key,'global')!==undefined)fail('TISHA_NARRATIVE_SAVE_READBACK');}
    catch(e){fail('TISHA_NARRATIVE_PROFILE_DELETE_PARTIAL');}
    return next;
  }
  const settings=operation==='update'?payload.settings:current;if(operation==='update')validate(settings);
  const output=operation==='update'&&payload.output!==undefined?require('./task-output-settings.cjs').validate(payload.output):original.输出;
  const value={结构版本:1,名称:name,配置:settings,...(output===undefined?{}:{输出:output})};
  await writeProfileBody(io,key,value,before);
  const next={修订:revision,条目:before.条目.map(x=>x.编号===row.编号?{编号:row.编号,名称:name}:x)};
  try{await io.narrativeSet(PROFILE_INDEX,next,'global');if(stable(await profiles(io))!==stable(next))fail('TISHA_NARRATIVE_SAVE_READBACK');}
  catch(e){fail('TISHA_NARRATIVE_PROFILE_UPDATE_PARTIAL');}
  return next;
}
async function loadProfile(io,id){
  const index=await profiles(io),row=index.条目.find(p=>p.编号===id);if(!row)fail('TISHA_NARRATIVE_PROFILE_MISSING');
  const value=await io.narrativeGet(PROFILE_PREFIX+id,'global');
  if(!value||![3,4].includes(Object.keys(value).length)||Object.keys(value).some(k=>!['结构版本','名称','配置','输出'].includes(k))||value.结构版本!==1||value.名称!==row.名称)fail('TISHA_NARRATIVE_PROFILES_INVALID');
  if(stable(Object.keys(value.配置).sort())===stable([...LEGACY].sort()))validate({...value.配置,...Protocol.defaults()});else validate(value.配置);
  if(value.输出!==undefined)require('./task-output-settings.cjs').validate(value.输出);
  return value.配置;
}
async function loadProfileOutput(io,id){await loadProfile(io,id);const value=await io.narrativeGet(PROFILE_PREFIX+id,'global');return value.输出===undefined?null:value.输出;}
function message(error,settings){
  const code=error?.code||'';
  const pair=code==='TISHA_NARRATIVE_CONFLICT_A01_A02'?['A01','A02']:code==='TISHA_NARRATIVE_CONFLICT_B03_B04'?['B03','B04']:null;
  if(pair&&settings){const terms=pair.map(id=>{const row=D.contract.configurations.find(r=>r.id===id);return '“'+row.label+'：'+settings[row.variable]+'”';});return terms.join('与')+'不可同时选择，请调整其中一项。';}
  const messages={
    TISHA_NARRATIVE_ACTION_RANGE:'行动选项数量需填写正整数，上限不能小于下限。',
    TISHA_SETTINGS_PARTIAL_OUTPUT:'叙事配置已保存，输出选择未完整保存。请保留记录，停止发送并重新打开设置核对。',
    TISHA_OUTPUT_SETTINGS_INCOMPLETE:'输出选择处于未完成保存状态，请复制记录检查。',
    TISHA_OUTPUT_CONFIG_CHANGED:'输出设置已变化，请重新打开后再保存。',
    TISHA_NARRATIVE_PROFILE_DELETE_PARTIAL:'方案已从目录移除，底层条目删除未确认。请保留记录，不要重复删除。',
    TISHA_NARRATIVE_PROFILE_UPDATE_PARTIAL:'方案内容已写入，目录更新未确认。请保留记录，停止继续修改。',
    TISHA_NARRATIVE_PROFILE_CONFIRM:'请再次确认要删除的方案。',
    TISHA_NARRATIVE_CONFLICT_A01_A02:'“重大选择权限：允许代演”与当前玩家代写权限不可同时选择，请调整其中一项。',
    TISHA_NARRATIVE_CONFLICT_B03_B04:'“信息视角：外部观察”与直接呈现人物内心不可同时选择，请调整其中一项。',
    TISHA_NARRATIVE_CONFLICT_B02_B03_B04:'限知视角描写多个人物内心时，请将视角主体设为“多人物轮换”。',
    TISHA_NARRATIVE_CONFLICT_B02_B05:'启用视角切换前，请将视角主体设为“多人物轮换”。',
    TISHA_NARRATIVE_LANGUAGES:'指定单语需填写一种语言，双语对白需填写两种不同语言，以逗号分隔。',
    TISHA_NARRATIVE_CONFIG_RANGE_C07:'正文篇幅需填写正整数，上限不能小于下限。',
    TISHA_NARRATIVE_PROFILE_NAME:'方案名称请填写 1～32 个字符。',
    TISHA_NARRATIVE_PROFILE_EXISTS:'已有同名方案，请换一个名称另存。',
    TISHA_NARRATIVE_PROFILE_LIMIT:'方案数量已达 100。',
    TISHA_NARRATIVE_INCOMPLETE:'这份叙事设置未完整保存，请保留现有变量并提供报错。',
    TISHA_NARRATIVE_REVISION_CHANGED:'设置已被其他操作修改，请重新打开后再编辑。'
    ,TISHA_NARRATIVE_PROTOCOL_SETUP:'原有配置已保留，请在叙事设置中补选步序与增强项后保存。'
    ,TISHA_NARRATIVE_STEP_CONFIG:'请补选本轮叙事步序；空列表表示不运行专项步序。'
    ,TISHA_NARRATIVE_FEATURE_CONFIG:'请补全叙事增强项的开关。'
  };return messages[code]||('操作未完成：'+(code||'未知错误'));
}
async function read(io){
  const a=await io.narrativeGet(MARK),tree=await io.narrativeRead(),b=await io.narrativeGet(MARK);
  if(stable(a)!==stable(b)||stable(a)!==stable(tree[MARK]))fail('TISHA_NARRATIVE_MIXED_READ');
  return inspect(tree);
}
async function save(io,settings,expected,operationId){
  validate(settings);const before=await read(io);
  if(before.revision!==expected)fail('TISHA_NARRATIVE_REVISION_CHANGED');
  const revision=operationId();if(!/^[0-9a-f]{32}$/.test(revision))fail('TISHA_NARRATIVE_OPERATION_ID');
  await io.narrativeSet(MARK,{状态:'写入中',修订:revision});
  const optional=OPTIONAL.filter(k=>Object.hasOwn(settings,k)||Object.hasOwn(before.settings??{},k));
  for(const k of BUSINESS)await io.narrativeSet(k,settings[k]);
  for(const k of optional)await io.narrativeSet(k,settings[k]??false);
  const tree=await io.narrativeRead();
  if(stable(tree[MARK])!==stable({状态:'写入中',修订:revision})||BUSINESS.some(k=>stable(tree[k])!==stable(settings[k]))||optional.some(k=>tree[k]!== (settings[k]??false)))fail('TISHA_NARRATIVE_SAVE_READBACK');
  await io.narrativeSet(MARK,{状态:'就绪',修订:revision});
  return read(io);
}
async function prepare(io,{chat,history,id,instruction,thoughtNonce,guard,onPresetCheck,memoryInput={},kernel,worldStatus}){
  // Production adapters supply read-only access to the same chat codex. Retire
  // the old packet before any configuration or archive read can fail. The
  // native lifecycle does this too, before its earlier kernel prerequisites.
  const memoryIO=io.memoryIO;
  if(memoryIO){guard();await io.narrativeSet('缇斯亚本轮注入状态','准备中');await io.narrativeSet('缇斯亚本轮注入标识',id);}
  try{
  const settings=await read(io);if(settings.kind==='needs_setup')fail('TISHA_NARRATIVE_PROTOCOL_SETUP');if(settings.kind!=='ready')fail('TISHA_NARRATIVE_NOT_CONFIGURED');
  const mvuRequested=settings.settings['缇斯亚MVU兼容']===true;
  if(kernel&&(typeof kernel.enabled!=='boolean'||kernel.requested!==mvuRequested||kernel.enabled&&!mvuRequested))fail('TISHA_NARRATIVE_CONFIG_CHANGED');
  const mvuEnabled=kernel?kernel.enabled:mvuRequested;
  // Only this request's compiler input changes. The stored preference and its
  // witness remain intact, including when the current card does not use MVU.
  const requestSettings={...settings.settings,'缇斯亚MVU兼容':mvuEnabled};
  const source=await io.narrativeSources(chat);
  if(!presetMatches(source.find(s=>s.kind==='preset')?.data,onPresetCheck))fail('TISHA_NARRATIVE_PRESET_MISMATCH');
  const prose=settings.settings['缇斯亚当前任务']==='叙事'&&['互动叙事','大纲扩写'].includes(settings.settings['缇斯亚叙事创作模式']);
  const presetInterface=presetCheck(source.find(s=>s.kind==='preset')?.data);
  const outputEnabled=presetInterface.outputEnabled;
  if(presetInterface.activeEntries.some(id=>['tisya_recent_reply','tisya_current_input'].includes(id))&&presetInterface.activeEntries.includes('chatHistory'))fail('TISYA_HISTORY_DOUBLE_SOURCE');
  let outputOptions;
  async function readOutput(){
    const K=require('./thought-contract.cjs').THOUGHT_KEYS;
    const mark=await io.thought.get('chat',K.chatOutputMark);
    if(mark?.状态!=='就绪')fail('TISHA_OUTPUT_SETUP_REQUIRED');
    const [summary,directions]=await Promise.all([io.thought.get('chat',K.chatSummary),io.thought.get('chat',K.chatDirections)]);
    if(typeof summary!=='boolean'||!Array.isArray(directions))fail('TISHA_OUTPUT_SETUP_REQUIRED');
    if(stable(await io.thought.get('chat',K.chatOutputMark))!==stable(mark))fail('TISHA_OUTPUT_CONFIG_CHANGED');
    require('./output-rail.cjs').validateDirections(directions);
    const heartEnabled=directions.length>0;
    return {summary,heartEnabled,heartDirections:heartEnabled?directions:[],generationId:thoughtNonce||id,emotionNames:heartEnabled?await io.emotes():[]};
  }
  if(prose&&outputEnabled)outputOptions=await readOutput();
  const s=snapshot(requestSettings,{id,chatId:chat.id,epoch:io.context().epoch,personaId:chat.persona??'archive-bound',revision:settings.revision,
    goal:'执行本轮用户指令，沿用有效资料与上下文。',outputOptions,outputEnabled,activeEntries:presetInterface.activeEntries});
  if(outputEnabled&&!prose&&thoughtNonce)s.task.thoughtNonce=thoughtNonce;
  const hash=value=>require('./json-serialization.cjs').digest(value,{rawString:false,serialize:stable});
  s.context.historyRevision=await hash(history);s.context.sourceRevision=await hash(source);s.context.branch='chat:'+chat.id;
  let memoryService=null,memoryPrepared=null,atlasService=null,atlasPrepared=null,worldService=null,worldPrepared=null,actorService=null,actorPrepared=null,worldRecord=null,storyPrepared=null;
  if(prose&&io.worldIO){worldService=require('./world-host.cjs').createWorldHost({io:io.worldIO,uniqueId:()=>fail('TISYA_WORLD_READ_ONLY'),readBase:worldStatus?.base,expectedHead:worldStatus?.head});worldRecord=await worldService.load();}
  if(prose&&memoryIO){const codex=require('./codex-service.cjs').createCodexService({io:memoryIO,uniqueId:()=>fail('TISYA_ACTOR_READ_ONLY')});actorService=require('./actor-service.cjs').createActorService({io:memoryIO,codex,uniqueId:()=>fail('TISYA_ACTOR_READ_ONLY')});actorPrepared=await actorService.prepare({world:worldRecord,playerName:source.find(x=>x.kind==='persona')?.data?.name??'user',activeEntries:presetInterface.activeEntries,history,input:memoryInput.text??''});}
  if(chat.persona===null&&!actorPrepared?.replacePersona)fail('TISHA_NARRATIVE_PERSONA_REQUIRED');
  if(prose&&io.worldIO){
    worldService=require('./world-host.cjs').createWorldHost({io:io.worldIO,uniqueId:()=>fail('TISYA_WORLD_READ_ONLY'),readBase:worldStatus?.base,expectedHead:worldStatus?.head});
    worldPrepared=await worldService.prepare({history,input:memoryInput.text??'',playerName:actorPrepared?.name??source.find(x=>x.kind==='persona')?.data?.name??'user',actors:actorPrepared,activeEntries:presetInterface.activeEntries});
    if(worldPrepared.enabled){for(const key of Object.keys(worldPrepared.slots)){const entry=source.find(x=>x.kind==='preset').data.entries.find(x=>x.identifier==='tisya_material_'+key);if(!entry?.content?.includes('tisya-world-slots/1'))fail('TISYA_WORLD_PRESET_INTERFACE');}}
  }
  if(prose&&memoryIO){
    const {createCodexService}=require('./codex-service.cjs');
    const {createMemoryService,MEMORY_ENTRIES}=require('./memory-service.cjs');
    const {createAtlasRoutes,ATLAS_ENTRIES}=require('./atlas-routes.cjs');
    const readOnlyId=()=>fail('TISYA_MEMORY_READ_ONLY');
    const codex=createCodexService({io:memoryIO,uniqueId:readOnlyId});
    memoryService=createMemoryService({io:memoryIO,codex,uniqueId:readOnlyId});
    memoryPrepared=await memoryService.prepare({history,input:memoryInput.text??'',regeneration:memoryInput.regeneration??false,activeEntries:presetInterface.activeEntries,exclude:actorPrepared?.references??[]});
    guard();
    if(memoryPrepared.enabled){
      const entries=source.find(x=>x.kind==='preset').data.entries;
      for(const entryId of Object.values(MEMORY_ENTRIES)){
        if(!presetInterface.activeEntries.includes(entryId))continue;
        const entry=entries.find(e=>e.identifier===entryId);
        if(typeof entry?.content!=='string'||!entry.content.includes('tisya-memory-slots/1'))fail('TISYA_MEMORY_PRESET_INTERFACE');
      }
    }
    // Memory selects first. Atlas routes deduplicate only the exact records
    // actually selected for this turn, not every object in the memory catalog.
    atlasService=createAtlasRoutes({io:memoryIO,codex,uniqueId:readOnlyId});
    atlasPrepared=await atlasService.prepare({nativeBooks:source,activeEntries:presetInterface.activeEntries,memoryReferences:[...memoryPrepared.report.references,...(actorPrepared?.references??[])]});
    guard();
    if(atlasPrepared.enabled){
      const entries=source.find(x=>x.kind==='preset').data.entries;
      for(const slot of new Set(atlasPrepared.report.routes.map(r=>r.slot))){
        const entryId=ATLAS_ENTRIES[slot];
        if(!presetInterface.activeEntries.includes(entryId))continue;
        const entry=entries.find(e=>e.identifier===entryId);
        if(typeof entry?.content!=='string'||!entry.content.includes('tisya-atlas-slots/1'))fail('TISYA_ATLAS_PRESET_INTERFACE');
      }
    }
  }
  const ownsWindow=presetInterface.activeEntries.includes('tisya_recent_reply')||presetInterface.activeEntries.includes('tisya_current_input');
  const modelWindow=ownsWindow?require('./model-wire.cjs').messageWindow(history,{input:memoryInput.text??'',regeneration:memoryInput.regeneration??false,includeBacklog:!prose||!outputEnabled||!worldRecord,preserveRaw:true}):{previous:'',current:memoryInput.text??'',covered:[],backlog:''};
  if(prose){storyPrepared=require('./story-memory.cjs').projectHistory({history,detail:actorPrepared?.detail??worldRecord?.adapter.详略??'标准',world:worldRecord,player:actorPrepared?.name??source.find(x=>x.kind==='persona')?.data?.name??'user',regeneration:memoryInput.regeneration??false,visibleNames:worldPrepared?.visibleNames??[],currentPlace:worldPrepared?.place??null,coveredMessages:presetInterface.activeEntries.includes('tisya_recent_reply')?modelWindow.covered:[],rawCoveredMessages:modelWindow.rawCovered??[],nativeHistory:presetInterface.activeEntries.includes('chatHistory'),requireComplete:outputEnabled&&presetInterface.activeEntries.includes('tisya_recent_reply')&&!presetInterface.activeEntries.includes('chatHistory')});}
  let packet;try{packet=compile(s);}catch(e){fail('TISHA_NARRATIVE_CONFIG_INVALID',e.message);}
  if(memoryIO){
    packet.writes['缇斯亚本轮执行参数'].资料={启用:memoryPrepared?.enabled===true,请求:id,槽:memoryPrepared?.slots??{玩家档案:'',人物档案:'',档案化记忆:'',历史原文摘录:''}};
    packet.writes['缇斯亚本轮执行参数'].图鉴={启用:atlasPrepared?.enabled===true,请求:id,受控槽:[...new Set(atlasPrepared?.report.routes.map(r=>r.slot)??[])],槽:atlasPrepared?.slots??Object.fromEntries(require('./atlas-routes.cjs').ATLAS_SLOTS.map(slot=>[slot,'']))};
    if(memoryPrepared){
      packet.manifest.资料接口='tisya-memory-slots/1';packet.manifest.记忆=decode(memoryPrepared.report);
      const seen=new Set();
      for(const ref of memoryPrepared.report.references){const key=ref.slot+'\0'+ref.id+'\0'+ref.path;if(seen.has(key))continue;seen.add(key);packet.manifest.来源.push({槽:'memory.'+ref.slot,编号:ref.id,修订:ref.path});}
    }
    if(atlasPrepared){
      packet.manifest.图鉴接口='tisya-atlas-slots/1';packet.manifest.图鉴=decode(atlasPrepared.report);
      for(const ref of atlasPrepared.report.references)packet.manifest.来源.push({槽:'atlas.'+ref.slot,编号:ref.id,修订:ref.hash});
    }
  }
  packet.writes['缇斯亚本轮执行参数'].人物=actorPrepared?{请求:id,替换身份:actorPrepared.replacePersona,绑定:actorPrepared.binding,槽:actorPrepared.slots}:{请求:id,替换身份:false,绑定:{模式:'默认用户',角色:source.find(x=>x.kind==='persona')?.data?.name??'user',中心化:'均衡',难度:'常规'},槽:{}};
  const flow=packet.writes['缇斯亚本轮执行参数'];if(flow.prose)flow.stepwise=require('./stepwise-protocol.cjs').renderStepwise({text:flow.text,r:flow.stepwiseRules,checks:flow.checks,actor:flow.人物.绑定,outputEnabled:flow.outputEnabled});
  flow.rest=require('./rest-protocol.cjs').renderRest(flow,{activeEntries:presetInterface.activeEntries,task:s.task,actor:flow.人物.绑定});
  packet.writes['缇斯亚本轮执行参数'].消息=modelWindow;
  packet.writes['缇斯亚本轮执行参数'].记忆={请求:id,槽:presetInterface.activeEntries.includes('chatHistory')?{}:storyPrepared?.slots??{}};
  if(storyPrepared){packet.manifest.叙事记忆=storyPrepared.report;if(worldPrepared?.enabled){worldPrepared=await worldService.prepare({history,input:memoryInput.text??'',playerName:actorPrepared?.name??source.find(x=>x.kind==='persona')?.data?.name??'user',actors:actorPrepared,story:storyPrepared,activeEntries:presetInterface.activeEntries});}}
  packet.writes['缇斯亚本轮执行参数'].世界={启用:worldPrepared?.enabled===true,请求:id,槽:worldPrepared?.slots??{}};
  if(worldPrepared){packet.manifest.世界=worldPrepared.report??{state:'absent'};}
  const materialSize=[...Object.values(worldPrepared?.slots??{}),...Object.values(actorPrepared?.slots??{}),...Object.values(packet.writes['缇斯亚本轮执行参数'].记忆.槽)].reduce((n,x)=>n+x.length,0)+(modelWindow.backlog?.length??0);const materialLimit=worldRecord?.adapter.预算??32000;if(materialSize>materialLimit)fail('TISHA_NARRATIVE_CONTEXT_BUDGET');packet.manifest.上下文预算={使用:materialSize,上限:materialLimit,单位:'UTF-16码元'};
  const mechanicalInstruction=kernel?.enabled?kernel.instruction:undefined;
  if((kernel?.enabled&&(typeof mechanicalInstruction!=='string'||!mechanicalInstruction.trim()))||
     (instruction!==undefined&&typeof instruction!=='string')||
     (kernel?.enabled&&instruction!==undefined&&instruction!==mechanicalInstruction))fail('TISHA_NARRATIVE_MECHANICAL_CONTEXT');
  const taskInstruction=mechanicalInstruction??instruction;
  if(taskInstruction){
    // The current REST task entry consumes this runtime projection; it never
    // reads the legacy task variable. Keep one owner, and never fake an active
    // world package merely to reuse a world-only material slot for MVU.
    if(presetInterface.activeEntries.includes('tisya_session_reset')){
      if(typeof flow.rest?.entries?.tisya_task_start!=='string'||!flow.rest.entries.tisya_task_start.trim())fail('TISHA_NARRATIVE_MECHANICAL_CONTEXT');
      const tag=kernel?.enabled?'mechanical_snapshot':'task_instruction';
      // This is a JSON snapshot in a model prompt, not an HTML attribute.
      // Keep its JSON punctuation and literal entities; JSON Unicode escapes
      // protect tag/template starts without changing parsed keys or values.
      const contextText=kernel?.enabled?taskInstruction.replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\{\{/g,'\\u007b\\u007b').replace(/@@TISYA_/g,'\\u0040@TISYA_'):Protocol.esc(taskInstruction);
      flow.rest.entries.tisya_task_start+='\n<'+tag+'>'+contextText+'</'+tag+'>';
    }else{
      if(kernel?.enabled)fail('TISHA_NARRATIVE_MECHANICAL_CONTEXT');
      // Supported pre-REST presets consume this task variable. Ordinary task
      // instructions retain that explicit adapter; mechanical state may not.
      packet.writes['缇斯亚本轮任务单']+='\n'+taskInstruction;
    }
  }
  const playerRef=actorPrepared?.references.find(x=>x.slot==='玩家档案');const archiveRef=playerRef?{来源类型:'图鉴',来源编号:playerRef.id,角色路径:'人物',实体编号:playerRef.id,修订:playerRef.path}:null;
  const bindings={'缇斯亚玩家绑定方式':archiveRef?'关联档案':'平台身份','缇斯亚玩家换角方式':'界面选择','缇斯亚玩家档案引用':archiveRef,'缇斯亚玩家绑定记录':{...s.binding,档案引用:archiveRef}};
  const writes={...bindings,...packet.writes};
  async function check(){
    guard();
    // Independent reads may overlap; publication still awaits every witness.
    const reads=await Promise.allSettled([
      prose&&outputEnabled?readOutput():null,io.history(),io.chat(),read(io),io.narrativeSources(chat)
    ]);
    const failed=reads.find(x=>x.status==='rejected');if(failed)throw failed.reason;
    const [currentOutput,currentHistory,currentChat,currentSettings,currentSource]=reads.map(x=>x.value);
    if(prose&&outputEnabled&&stable(currentOutput)!==stable(outputOptions))fail('TISHA_OUTPUT_CONFIG_CHANGED');
    if(stable(currentChat)!==stable(chat)||stable(currentHistory)!==stable(history))fail('TISHA_NARRATIVE_CONTEXT_CHANGED');
    if(stable(currentSettings)!==stable(settings))fail('TISHA_NARRATIVE_CONFIG_CHANGED');
    if(stable(currentSource)!==stable(source))fail('TISHA_NARRATIVE_SOURCE_CHANGED');
    const witnesses=await Promise.allSettled([
      actorService?actorService.verify(actorPrepared.witness):null,
      worldService?worldService.verify(worldPrepared.witness):null,
      memoryService?memoryService.verify(memoryPrepared.witness,currentHistory):null,
      atlasService?atlasService.verify(atlasPrepared.witness,{nativeBooks:currentSource,memoryReferences:[...memoryPrepared.report.references,...(actorPrepared?.references??[])]}):null
    ]);
    const invalid=witnesses.find(x=>x.status==='rejected');if(invalid)throw invalid.reason;
    guard();
  }
  await check();
  await io.narrativeSet('缇斯亚本轮注入状态','准备中');
  await io.narrativeSet('缇斯亚本轮注入标识',id);
  for(const [key,value]of Object.entries(writes)){guard();await io.narrativeSet(key,value);}
  const tree=await io.narrativeRead();
  if(Object.entries(writes).some(([k,v])=>stable(tree[k])!==stable(v)))fail('TISHA_NARRATIVE_INJECTION_READBACK');
  await io.narrativeSet('缇斯亚本轮注入清单',packet.manifest);
  // Source/configuration witnesses are rechecked before publishing readiness.
  await check();
  await io.narrativeSet('缇斯亚本轮注入状态','就绪');
  await check();
  const committed=await io.narrativeRead();
  if(committed['缇斯亚本轮注入标识']!==id||committed['缇斯亚本轮注入状态']!=='就绪'||
    stable(committed['缇斯亚本轮注入清单'])!==stable(packet.manifest)||Object.entries(writes).some(([k,v])=>stable(committed[k])!==stable(v)))fail('TISHA_NARRATIVE_INJECTION_READBACK');
  return {statusScope:worldPrepared?.statusScope??{},storyReport:storyPrepared?.report??null,actorReport:actorPrepared?.report??null,worldReport:worldPrepared?.report??null,memoryReport:memoryPrepared?decode(memoryPrepared.report):null,atlasReport:atlasPrepared?decode(atlasPrepared.report):null,auditOptions:prose&&outputEnabled?{...outputOptions,mvuEnabled,actionRange:require('./action-range.cjs').resolveActionRange(settings.settings['缇斯亚叙事行动选项']),range:settings.settings[D.contract.configurations.find(r=>r.id==='C07').variable]}:null,async finish(){await check();if(await io.narrativeGet('缇斯亚本轮注入标识')!==id)fail('TISHA_NARRATIVE_ROUND_CHANGED');
    await io.narrativeSet('缇斯亚本轮注入状态','已结束');if(await io.narrativeGet('缇斯亚本轮注入状态')!=='已结束')fail('TISHA_NARRATIVE_INJECTION_READBACK');}};
  }catch(error){
    // Never invalidate a newer round or write after its chat/epoch changed.
    // Native IO failures may prevent cleanup; the original failure stays visible.
    if(memoryIO)try{guard();if(await io.narrativeGet('缇斯亚本轮注入标识')===id){guard();await io.narrativeSet('缇斯亚本轮注入状态','失败');}}catch(_){}
    throw error;
  }
}
// Read-only draft compilation uses the production compiler and current preset switches.
function previewSettings(settings,output,{activeEntries,outputEnabled=true}={}){
 validate(settings);
 const options={summary:output.summary,heartEnabled:output.directions.length>0,heartDirections:output.directions,generationId:'0'.repeat(32)};
 return compile(snapshot(settings,{outputOptions:options,activeEntries,outputEnabled})).writes['缇斯亚本轮执行参数'];
}
module.exports={NARRATIVE:{MARK,BUSINESS,OPTIONAL,ALL,LEGACY,protocol:Protocol,PROFILE_INDEX,storageKey,scoped,projectScope,initializeFromDefaults,profiles,saveProfile,changeProfile,loadProfile,loadProfileOutput,message,decode,decodeSource,shapeDetail,shapeMessage,project,inspect,presetCheck,presetMismatchMessage,presetMatches,validate,previewSettings,suggestions,read,save,prepare,rows:D.contract.configurations,tasks:Object.keys(D.tasks)}};
