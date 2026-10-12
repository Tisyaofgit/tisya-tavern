// Form definitions are data shared by Genesis, archive filling and the editor.
export const FORMAT = 'tisya.tables/1';
export const copy = value => structuredClone(value);
export const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
export const check = (ok, message) => { if (!ok) throw Error(message); };
export const normalized = text => String(text).normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_·・-]+/gu, '');
const f = (type='text', extra={}) => ({type, ...extra});
const text = names => Object.fromEntries(names.split(' ').map(n => [n, f()]));
const refs = names => Object.fromEntries(names.split(' ').map(n => [n, f('refs')]));
const table = (id, name, fields, owner='archive') => ({id, name, aliases:[], version:1, owner, fields:{名称:f('text',{required:true}), ...fields}});
export const TABLES = [
 table('objects','常量档案',{类型:f('type',{required:true}),别名:f('texts'),...text('世界 描述'),...refs('关联'),标签:f('texts'),属性:f('object')}),
 table('facts','事实与发现',{...text('命题 条件 生效时间 验证状态'),...refs('对象 替代事实'),证据:f('texts')}),
 table('scene','场景与全局进度',{...text('世界 时代 场景 地点 当前时间 阶段'),...refs('参与者'),标志:f('object')}),
 table('state','对象当前状态',{对象:f('ref',{required:true}),字段:f('text',{required:true}),值:f('json',{required:true}),...text('生效时间 失效时间 变动原因'),原生引用:f('text')}),
 table('relations','关系',{主体:f('ref',{required:true}),对象:f('ref',{required:true}),维度:f('object'),...text('证据 生效时间')}),
 table('cognition','认知与心理',{主体:f('ref',{required:true}),...refs('事实'),...text('获知途径 确认程度 认识 心理 授权依据')}),
 table('holdings','持有与流转',{物品:f('ref',{required:true}),...refs('所有者 保管者 地点 容器'),数量:f('number'),...text('单位 流转原因 原生引用')}),
 table('tasks','任务待办',{...text('来源 发布者 目标 条件 下一步 截止时间'),...refs('负责人'),状态:f('enum',{values:['发布','接受','进行','完成','取消']})}),
 table('timers','日程倒计时',{...text('时间基准 起点 到期时间 触发条件 失效条件 重复规则'),到期轮次:f('number',{description:'绝对已保留AI回复数；重投不新增轮次，非相对延后数'}),...refs('任务'),状态:f('enum',{values:['等待','到期','完成','取消']})}),
 table('clues','伏笔线索',{...text('已出现内容 阶段 公开范围 推进条件'),...refs('事件 对象')}),
 table('events','历史事件记忆',{...text('时间 时代 地点 经过 场面 台词 意象 伏笔 影响 心理层 视角 结果 设定变动'),...refs('参与者 关联事件'),标签:f('texts'),原文段落:f('texts')}),
 table('preferences','用户叙事偏好',{...text('内容 范围 证据 修订原因'),性质:f('enum',{values:['明确要求','推测偏好']}),强度:f('enum',{values:['必须','偏好']}),置信度:f('number'),例外:f('texts'),启用:f('boolean')},'preferences'),
];
export const TYPES = [
 {id:'character',name:'人物',aliases:['角色','人类','NPC','角色档案'],fields:{...text('身份 外貌 性格 经历 能力'),关系:f('texts')}},
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
   for(const [key,field] of Object.entries(item.fields)){
    check(!denied.has(key)&&object(field)&&['text','texts','number','boolean','enum','ref','refs','json','object','type'].includes(field.type),'字段定义无效：'+key);
    if(field.type==='enum')check(Array.isArray(field.values)&&field.values.length&&field.values.every(x=>typeof x==='string'),'枚举未定义：'+key);
    if(field.formula)validateFormula(field.formula);
   }
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
function valueValid(v, def){
 if(v===null)return def.nullable===true||def.type==='json';
 switch(def.type){case'text':case'ref':case'type':return typeof v==='string'&&(!def.required||!!v.trim());case'texts':case'refs':return Array.isArray(v)&&v.every(x=>typeof x==='string'&&!!x.trim())&&new Set(v).size===v.length;case'number':return typeof v==='number'&&Number.isFinite(v);case'boolean':return typeof v==='boolean';case'enum':return def.values.includes(v);case'object':return object(v);case'json':return v!==undefined;default:return false;}
}
export function validateRow(registry,row){
 check(object(row)&&typeof row.id==='string'&&row.id&&object(row.values),'表单记录无效');
 const table=registry.tables.find(t=>t.id===row.table);check(table,'未知表：'+row.table);
 for(const [key,def]of Object.entries(table.fields))check(!def.required||Object.hasOwn(row.values,key),'缺少必填字段：'+key);
 for(const [key,value]of Object.entries(row.values)){const def=table.fields[key];check(def&&!denied.has(key),'未知字段：'+key);check(!def.formula,'公式字段由程序计算：'+key);check(valueValid(value,def),'字段类型不符：'+key);}
 check(object(row.access)&&Array.isArray(row.access.readers)&&Array.isArray(row.access.knowers)&&row.access.readers.every(x=>typeof x==='string')&&row.access.knowers.every(x=>typeof x==='string'),'记录缺少读者／人物知情范围');
 if(row.table==='objects'){
  const type=registry.types.find(t=>t.id===row.values.类型);check(type,'对象类型未登记');
  const fields=typeFields(registry,type.id);for(const [key,value]of Object.entries(row.values.属性??{}))check(fields[key]&&valueValid(value,fields[key]),'类型属性无效：'+key);
 }
 return row;
}
export function references(row,registry){const t=registry.tables.find(t=>t.id===row.table);return Object.entries(row.values).flatMap(([k,v])=>t.fields[k]?.type==='ref'?[v]:t.fields[k]?.type==='refs'?v:[]);}
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
export const TABLE_SETTINGS = Object.freeze({enabled:false,archive:true,plot:true,preferences:false,objectsSeparate:false,injection:'worldbook',retrieval:'keywords',topK:8,originBook:'',sessionBook:'',originPins:[],hardRules:[],contextChars:40000});
export function tableSettings(world){const s={...copy(TABLE_SETTINGS),...world.tables};check(['worldbook','direct'].includes(s.injection),'表单注入方式无效');check(['keywords','vector'].includes(s.retrieval),'检索方式无效');for(const key of ['enabled','archive','plot','preferences','objectsSeparate'])check(typeof s[key]==='boolean','表格开关无效：'+key);check(Number.isSafeInteger(s.topK)&&s.topK>=0&&s.topK<=100,'检索数量须为 0—100');check(Number.isSafeInteger(s.contextChars)&&s.contextChars>=2000,'表格上下文预算至少 2000 字符');check(Array.isArray(s.hardRules)&&s.hardRules.every(x=>typeof x==='string'),'明确偏好规则格式无效');check(Array.isArray(s.originPins),'原点版本引用无效');return s;}
