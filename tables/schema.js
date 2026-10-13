// Form definitions are data shared by Genesis, archive filling and the editor.
export const FORMAT = 'tisya.tables/1';
export const copy = value => structuredClone(value);
export const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
export const check = (ok, message) => { if (!ok) throw Error(message); };
export const normalized = text => String(text).normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_·・-]+/gu, '');
const f = (type='text', extra={}) => ({type, ...extra});
const text = names => Object.fromEntries(names.split(' ').map(n => [n, f()]));
const refs = names => Object.fromEntries(names.split(' ').map(n => [n, f('refs')]));
const scale = () => f('object',{fields:{值:f('number'),最小:f('number'),最大:f('number'),低端:f(),高端:f(),依据:f('refs'),原生引用:f()}});
const pair = () => f('object',{fields:{正面:scale(),负面:scale()}});
const table = (id, name, fields, owner='archive') => ({id, name, aliases:[], version:1, owner, fields:{名称:f('text',{required:true}), ...fields}});
export const TABLES = [
 table('objects','常量档案',{类型:f('type',{required:true}),别名:f('texts'),...text('世界 描述 核心引用'),...refs('关联'),标签:f('texts'),发现环境:f('object',{fields:{地点:f('refs'),时段:f(),出现条件:f(),来源依据:f(),确认程度:f('enum',{values:['设定明确','当事人陈述','一次观察']}),可复用:f('boolean')}}),属性:f('object')}),
 table('facts','事实与发现',{...text('命题 条件 生效时间 验证状态'),...refs('对象 替代事实'),证据:f('texts')}),
 table('scene','场景与全局进度',{...text('世界 时代 场景 地点 当前时间 阶段'),...refs('参与者'),标志:f('object')}),
 table('state','对象当前状态',{对象:f('ref',{required:true}),字段:f('text',{required:true}),有效性:f('enum',{values:['有效','失效','待确认']}),值:f('json'),值引用:f('ref'),...text('生效时间 失效时间 变动原因'),原生引用:f('text')}),
 table('relations','关系',{主体:f('ref',{required:true}),对象:f('ref',{required:true}),维度:f('object'),好感:pair(),声望:pair(),印象:f('map',{items:scale()}),...refs('锚点事件'),...text('证据 生效时间')}),
 table('cognition','认知与心理',{主体:f('ref',{required:true}),...refs('事实'),...text('获知途径 确认程度 认识 心理 授权依据')}),
 table('holdings','持有与流转',{物品:f('ref',{required:true}),...refs('所有者 保管者 地点 容器'),数量:f('number'),...text('单位 流转原因 原生引用')}),
 table('tasks','任务待办',{...text('来源 发布者 目标 条件 下一步 截止时间'),类别:f('enum',{values:['主线','支线','日常','个人']}),进度:f('object',{fields:{当前:f('number'),目标:f('number'),单位:f()}}),...refs('负责人 前置任务 锚点事件'),蓝本节点:f(),状态:f('enum',{values:['发布','接受','进行','完成','取消']})}),
 table('timers','日程倒计时',{...text('时间基准 起点 到期时间 触发条件 失效条件 重复规则'),到期轮次:f('number',{description:'绝对已保留AI回复数；重投不新增轮次，非相对延后数'}),...refs('任务'),状态:f('enum',{values:['等待','到期','完成','取消']})}),
 table('clues','伏笔线索',{...text('已出现内容 阶段 公开范围 推进条件'),...refs('事件 对象')}),
 table('events','历史事件记忆',{...text('时间 地点 经过 结果'),...refs('参与者 关联事件'),标签:f('texts'),原文段落:f('texts')}),
 table('activities','进行中事务',{主体:f('ref',{required:true}),...text('目标 行动 开始时间 推进至 预计结束 阻力 下一步'),进度:f('number',{min:0,max:100}),状态:f('enum',{values:['计划','进行','等待','完成','取消']}),...refs('任务 地点 知情依据 锚点事件'),资源:f('object')}),
 table('experiences','习惯喜好与回忆',{主体:f('ref',{required:true}),...refs('相关对象 锚点事件'),类别:f('enum',{values:['喜好','厌恶','习惯','回忆','安心方式','边界']}),...text('情境 内容 感受 例外'),确定性:f('enum',{values:['明确自述','反复表现','单次观察','暂定']}),有效性:f('enum',{values:['有效','已改变','待确认']})}),
 table('growth','角色成长',{主体:f('ref',{required:true}),...text('方面 原有倾向 当前倾向 变化依据 反例 生效时间'),...refs('锚点事件'),阶段:f('enum',{values:['萌芽','积累','稳定','回退']}),原生引用:f()}),
 table('native_cells','原生变量映射',{路径:f('text',{required:true}),值:f('json',{required:true}),启用:f('boolean')}),
 table('preferences','用户叙事偏好',{...text('内容 范围 证据 修订原因'),性质:f('enum',{values:['明确要求','推测偏好']}),强度:f('enum',{values:['必须','喜爱','厌恶','禁止','偏好']}),类别:f('enum',{values:['用词','NSFW题材','SFW角色表现','剧情走向','文风','特定情节']}),标签:f('texts'),作用域:f('object',{fields:{全局:f('boolean'),用户角色:f('texts'),角色卡:f('texts'),世界:f('texts'),会话:f('texts')}}),置信度:f('number'),例外:f('texts'),启用:f('boolean')},'preferences'),
];
export const TYPES = [
 {id:'character',name:'人物',aliases:['角色','人类','NPC','角色档案'],fields:{...text('身份 外貌 性格 背景')}},
 {id:'item',name:'物品',aliases:['道具','物件','装备'],fields:{...text('形态 用途 材质 规则')}},
 {id:'place',name:'地点',aliases:['场所','位置','地区'],fields:{...text('环境 位置 特征 出入条件')}},
 {id:'rule',name:'规则',aliases:['法则','机制','制度'],fields:{...text('适用范围 条件 效果 例外')}},
 {id:'organization',name:'组织',aliases:['势力','团体'],fields:{...text('职责 结构 立场 历史')}},
].map(t=>({...t,version:1,parent:null}));
export const defaultRegistry = () => ({tables:copy(TABLES),types:copy(TYPES)});
const ID = /^[a-z][a-z0-9._-]{0,79}$/;
const denied = new Set(['__proto__','constructor','prototype']);
export function registryIndex(registry){
 check(object(registry)&&Array.isArray(registry.tables)&&Array.isArray(registry.types),'模板注册表损坏');
 const result = {};
 for(const kind of ['tables','types']){
  const names=new Map(),ids=new Set();
  for(const item of registry[kind]){
   check(ID.test(item.id)&&!ids.has(item.id),'模板 ID 无效或重复：'+item.id);ids.add(item.id);
   check(typeof item.name==='string'&&item.name.trim()&&Array.isArray(item.aliases)&&Number.isSafeInteger(item.version)&&item.version>0,'模板名称或版本无效');
   for(const label of [item.id,item.name,...item.aliases]){
    check(typeof label==='string'&&label.trim(),'模板别名不能为空');const key=normalized(label);
    check(!names.has(key)||names.get(key).id===item.id,'同义名称已属于 '+names.get(key)?.name+'：'+label);names.set(key,item);
   }
   check(object(item.fields)&&Object.keys(item.fields).length>0,'模板必须定义字段');
   validateFields(item.fields);
  }
  result[kind]=names;
 }
 for(const type of registry.types){const seen=new Set([type.id]);let parent=type.parent;while(parent){const next=registry.types.find(t=>t.id===parent);check(next&&!seen.has(parent),'父模板不存在或循环');seen.add(parent);parent=next.parent;}}
 return result;
}
export function addTypes(registry, proposals=[]){
 check(Array.isArray(proposals)&&proposals.length<=20,'新模板数量无效');const next=copy(registry);
 for(const p of proposals){
  check(object(p),'新模板无效');const index=registryIndex(next).types;const same=index.get(normalized(p.name));
  if(same){check(same.id===p.id,'请复用已有模板 '+same.id+'，不能另建同义类名');check(JSON.stringify(same)===JSON.stringify(p),'已有模板不能由自动归档覆盖');continue;}
  check(p.parent&&next.types.some(t=>t.id===p.parent),'新模板必须扩展已登记父模板');next.types.push(copy(p));registryIndex(next);
 }
 return next;
}
export function typeFields(registry,id){const t=registry.types.find(t=>t.id===id);check(t,'未登记类型：'+id);return {...(t.parent?typeFields(registry,t.parent):{}),...t.fields};}
const FIELD_TYPES=['text','texts','number','boolean','enum','ref','refs','json','object','map','array','type','time','duration'];
export function validateFields(fields,depth=0){
 check(object(fields)&&depth<12,'字段嵌套过深或无效');const names=new Map();
 for(const [key,def] of Object.entries(fields)){
  check(!denied.has(key)&&object(def)&&FIELD_TYPES.includes(def.type),'字段定义无效：'+key);
  for(const name of [key,...(def.aliases??[])]){check(typeof name==='string'&&name.trim(),'字段别名无效');const n=normalized(name);check(!names.has(n)||names.get(n)===key,'字段同义名冲突：'+name);names.set(n,key);}
  if(def.type==='enum')check(Array.isArray(def.values)&&def.values.length&&def.values.every(x=>typeof x==='string'),'枚举未定义：'+key);
  if(def.fields)validateFields(def.fields,depth+1);
  if(['array','map'].includes(def.type)){check(object(def.items),'集合必须定义 items：'+key);validateFields({item:def.items},depth+1);}
  if(def.formula)validateFormula(def.formula);
 }
}
export function valueValid(v,def,depth=0){
 if(depth>12)return false;if(v===null)return def.nullable===true||def.type==='json';
 switch(def.type){
 case'text':case'time':case'ref':case'type':return typeof v==='string'&&(!def.required||!!v.trim());
 case'texts':case'refs':return Array.isArray(v)&&v.every(x=>typeof x==='string'&&!!x.trim())&&new Set(v).size===v.length;
 case'number':case'duration':return typeof v==='number'&&Number.isFinite(v)&&(def.min===undefined||v>=def.min)&&(def.max===undefined||v<=def.max);
 case'boolean':return typeof v==='boolean';case'enum':return def.values.includes(v);
 case'array':return Array.isArray(v)&&v.every(x=>valueValid(x,def.items,depth+1))&&(!def.idKey||v.every(x=>object(x)&&typeof x[def.idKey]==='string')&&new Set(v.map(x=>x[def.idKey])).size===v.length);
 case'map':return object(v)&&Object.entries(v).every(([k,x])=>!denied.has(k)&&valueValid(x,def.items,depth+1));
 case'object':return object(v)&&(!def.fields||Object.entries(v).every(([k,x])=>!denied.has(k)&&(def.fields[k]?valueValid(x,def.fields[k],depth+1):def.additionalProperties===true))&&Object.entries(def.fields).every(([k,d])=>!d.required||Object.hasOwn(v,k)));
 case'json':return v!==undefined;default:return false;
 }
}
function invalidPath(v,d,path){if(valueValid(v,d))return '';if(d.type==='array'&&Array.isArray(v)){for(let i=0;i<v.length;i++){const p=invalidPath(v[i],d.items,path+'['+i+']');if(p)return p;}}if(object(v)&&['object','map'].includes(d.type))for(const [k,x]of Object.entries(v)){const child=d.type==='map'?d.items:d.fields?.[k];if(child){const p=invalidPath(x,child,path+'.'+k);if(p)return p;}}return path+' ('+d.type+')';}
export function mapValue(v,def,fn,path='值'){if(v===undefined||v===null)return v;check(valueValid(v,def),'关联字段类型无效：'+invalidPath(v,def,path));if(def.type==='ref')return fn(v);if(def.type==='refs')return v.map(fn);if(def.type==='array')return v.map((x,i)=>mapValue(x,def.items,fn,path+'['+i+']'));if(def.type==='map')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,mapValue(x,def.items,fn,path+'.'+k)]));if(def.type==='object'&&def.fields)return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,def.fields[k]?mapValue(x,def.fields[k],fn,path+'.'+k):x]));return v;}
export function mapRowReferences(row,registry,fn){const t=registry.tables.find(t=>t.id===row.table),prefix=(row.id??row.table)+'.';for(const [k,d]of Object.entries(t.fields))if(Object.hasOwn(row.values,k))row.values[k]=mapValue(row.values[k],d,fn,prefix+k);if(row.table==='objects')for(const [k,d]of Object.entries(typeFields(registry,row.values.类型)))if(Object.hasOwn(row.values.属性??{},k))row.values.属性[k]=mapValue(row.values.属性[k],d,fn,prefix+'属性.'+k);return row;}
export function validateRow(registry,row){
 check(object(row)&&typeof row.id==='string'&&row.id&&object(row.values),'表单记录无效');
 const table=registry.tables.find(t=>t.id===row.table);check(table,'未知表：'+row.table);
 for(const [key,def]of Object.entries(table.fields))check(!def.required||Object.hasOwn(row.values,key),'缺少必填字段：'+key);
 for(const [key,value]of Object.entries(row.values)){const def=table.fields[key];check(def&&!denied.has(key),'未知字段：'+key);check(!def.formula,'公式字段由程序计算：'+key);check(valueValid(value,def),'字段类型不符：'+key);}
 check(object(row.access)&&Array.isArray(row.access.readers)&&Array.isArray(row.access.knowers)&&row.access.readers.every(x=>typeof x==='string')&&row.access.knowers.every(x=>typeof x==='string'),'记录缺少读者／人物知情范围');
 if(row.table==='state')check([Object.hasOwn(row.values,'值'),!!row.values.原生引用,!!row.values.值引用].filter(Boolean).length===1,'当前状态必须且只能填写值、值引用或原生引用');
 if(row.table==='objects'){
  const type=registry.types.find(t=>t.id===row.values.类型);check(type,'对象类型未登记');
  const fields=typeFields(registry,type.id);for(const [key,def]of Object.entries(fields))check(!def.required||Object.hasOwn(row.values.属性??{},key),'缺少类型必填属性：'+key);for(const [key,value]of Object.entries(row.values.属性??{}))check(fields[key]&&valueValid(value,fields[key]),'类型属性无效：'+key);
 }
 for(const group of ['好感','声望'])if(row.table==='relations'&&row.values[group])for(const axis of Object.values(row.values[group]))validateScale(axis);if(row.table==='relations')for(const axis of Object.values(row.values.印象??{}))validateScale(axis);
 return row;
}
export function references(row,registry){const refs=[];mapRowReferences(copy(row),registry,id=>{refs.push(id);return id;});return refs;}
export function validateReferences(rows,registry){const ids=new Set(rows.map(r=>r.id));for(const row of rows)for(const id of references(row,registry))check(ids.has(id),'关联对象不存在：'+id);}
// Formula AST, not JavaScript. Bounded lookup; no eval, property paths or network.
const OPS=new Set(['field','lookup','count','unique','join','add','subtract']);
export function validateFormula(node,depth=0){check(depth<12&&object(node)&&OPS.has(node.op),'公式无效或过深');check(!Object.keys(node).some(k=>denied.has(k)),'公式键名无效');for(const key of ['field','match'])if(node[key])check(typeof node[key]==='string'&&!denied.has(node[key]),'公式字段无效');if(node.args){check(Array.isArray(node.args)&&node.args.length<=30,'公式参数过多');for(const n of node.args)if(object(n))validateFormula(n,depth+1);}return node;}
export function formula(node,row,rows,depth=0){validateFormula(node,depth);const args=(node.args??[]).map(x=>object(x)?formula(x,row,rows,depth+1):x);switch(node.op){
 case'field':return row.values[node.field];
 case'lookup':{check(typeof node.table==='string'&&typeof node.field==='string'&&typeof node.match==='string','查询公式缺少字段');return rows.filter(r=>r.table===node.table&&r.values[node.match]===args[0]).map(r=>r.values[node.field]);}
 case'count':check(Array.isArray(args[0]),'count 需要数组');return args[0].length;
 case'unique':check(Array.isArray(args[0]),'unique 需要数组');return [...new Set(args[0])];
 case'join':check(Array.isArray(args[0]),'join 需要数组');return args[0].join(String(args[1]??'、'));
 case'add':case'subtract':check(args.length===2&&args.every(Number.isFinite),'算术公式需要两个数');return node.op==='add'?args[0]+args[1]:args[0]-args[1];}}
export function derive(rows,registry){return rows.map(row=>{const out=copy(row),visible=rows.filter(other=>row.access.readers.every(r=>other.access.readers.includes(r))&&row.access.knowers.every(r=>other.access.knowers.includes(r)));for(const [key,field]of Object.entries(registry.tables.find(t=>t.id===row.table).fields))if(field.formula)out.values[key]=formula(field.formula,row,visible);return out;});}
export const TABLE_SETTINGS = Object.freeze({enabled:false,styleEnabled:true,archive:true,plot:false,preferences:false,offstage:false,nativeBridge:false,focusObjects:[],focusText:'',playerObjects:[],objectsSeparate:false,injection:'worldbook',retrieval:'keywords',topK:8,originBook:'',sessionBook:'',originPins:[],hardRules:[],taskInstructions:{},contextChars:40000});
export function tableSettings(world){const s={...copy(TABLE_SETTINGS),styleEnabled:world.modes?.[world.mode]?.narrative?.缇斯亚叙事防八股??true,...world.tables};check(['worldbook','direct'].includes(s.injection),'表单注入方式无效');check(['keywords','vector'].includes(s.retrieval),'检索方式无效');for(const key of ['enabled','styleEnabled','archive','plot','preferences','offstage','nativeBridge','objectsSeparate'])check(typeof s[key]==='boolean','表格开关无效：'+key);check(Number.isSafeInteger(s.topK)&&s.topK>=0&&s.topK<=100,'检索数量须为 0—100');check(Number.isSafeInteger(s.contextChars)&&s.contextChars>=2000,'表格上下文预算至少 2000 字符');check(Array.isArray(s.hardRules)&&s.hardRules.every(x=>typeof x==='string'),'明确偏好规则格式无效');check(Array.isArray(s.focusObjects)&&s.focusObjects.every(x=>typeof x==='string')&&Array.isArray(s.playerObjects)&&s.playerObjects.every(x=>typeof x==='string')&&typeof s.focusText==='string','推进关注配置无效');check(Array.isArray(s.originPins),'原点版本引用无效');check(object(s.taskInstructions)&&Object.entries(s.taskInstructions).every(([k,v])=>['tableAssistant','tableArchive','objectArchive','historyImport','tableGenesis','plotAdvance','preferenceAnalysis','templateInit','assetAdapt','nativeFill'].includes(k)&&typeof v==='string'),'辅助模式补充指令无效');return s;}

export const FORM_GROUPS=Object.freeze([{id:'definitions',name:'世界定义',tables:['facts']},{id:'archives',name:'对象底档',tables:['objects']},{id:'current',name:'当前状态',tables:['scene','state']},{id:'relationships',name:'关系与归属',tables:['relations','holdings']},{id:'knowledge',name:'认知与信息',tables:['cognition','experiences','growth']},{id:'affairs',name:'事务与日程',tables:['tasks','timers','activities']},{id:'history',name:'事件与修改历史',tables:['events']},{id:'threads',name:'线索与未解事项',tables:['clues']}]);
export function upgradeRegistry(source){const r=copy(source),state=r.tables.find(t=>t.id==='state'),objects=r.tables.find(t=>t.id==='objects');if(state){if(JSON.stringify(state.fields.值)===JSON.stringify({type:'json',required:true}))state.fields.值={type:'json'};state.fields.值引用??={type:'ref'};state.fields.有效性??=copy(TABLES.find(t=>t.id==='state').fields.有效性);}if(objects)objects.fields.发现环境??=copy(TABLES.find(t=>t.id==='objects').fields.发现环境);for(const def of TABLES){const old=r.tables.find(t=>t.id===def.id);if(!old)r.tables.push(copy(def));else for(const [name,field]of Object.entries(def.fields))old.fields[name]??=copy(field);}return r;}

export function validateScale(axis){check(!(axis.原生引用&&Object.hasOwn(axis,'值')),'原生刻度只保存引用，不复制数值');if(axis.值!==undefined){check(Number.isFinite(axis.最小)&&Number.isFinite(axis.最大)&&axis.最小<axis.最大,'刻度须明确上下限');check(axis.值>=axis.最小&&axis.值<=axis.最大,'刻度值超出范围');}return axis;}

export function isObjectType(registry,row,base){let type=registry.types.find(t=>t.id===row.values.类型);const seen=new Set();while(type&&!seen.has(type.id)){if(type.id===base)return true;seen.add(type.id);type=registry.types.find(t=>t.id===type.parent);}return false;}
