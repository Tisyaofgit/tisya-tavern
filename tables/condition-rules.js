// Candidate narrative conditions. Pure compiler/evaluator; never eval code or write a ledger.
// Source cells remain authoritative. Programs and change plans are rebuildable derivatives.
const check=(ok,message)=>{if(!ok)throw Error(message);};
const own=(o,k)=>Object.hasOwn(o,k);
const NUMBER='[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const reserved=/[，,；;：:<>＝=≥≤！!→\n\r]|=>|或/;
function registry(vocabulary){
 check(vocabulary?.version===1&&Array.isArray(vocabulary.fields),'条件词表版本无效');
 const byName=new Map(),byKey=new Map();
 for(const f of vocabulary.fields){
  check(typeof f.name==='string'&&f.name.trim()===f.name&&f.name&&!reserved.test(f.name),'条件字段名称无效');
  check(typeof f.key==='string'&&f.key&&!byKey.has(f.key)&&!byName.has(f.name),'条件字段重复或缺少键');
  check(['boolean','number','enum','text'].includes(f.type)&&['owner','record','context','record-context','owner-record','bound'].includes(f.scope),'条件字段类型/作用域无效');
  if(f.compact!==undefined)check(typeof f.compact==='boolean','简写标记无效');
  if(f.scope==='bound')check(typeof f.objectId==='string'&&f.objectId&&typeof f.fieldPath==='string'&&f.fieldPath,'条件缺少明确绑定地址');
  if(f.scope==='owner-record')check(typeof f.recordKey==='string'&&f.recordKey&&typeof f.storageKey==='string'&&f.storageKey,'对象状态缺少稳定记录/定义键');
  check(f.unit===undefined||f.type==='number'&&typeof f.unit==='string'&&f.unit&&!reserved.test(f.unit),'条件单位无效');
  if(f.allowBareNumber!==undefined)check(typeof f.allowBareNumber==='boolean'&&f.type==='number'&&typeof f.unit==='string'&&f.unit,'裸数值必须绑定登记单位');
  for(const k of ['min','max'])if(f[k]!==undefined)check(f.type==='number'&&Number.isFinite(f[k]),'数值边界无效');
  if(f.min!==undefined&&f.max!==undefined)check(f.min<=f.max,'数值上下限倒置');
  if(f.integer!==undefined)check(f.type==='number'&&typeof f.integer==='boolean','整数要求无效');
  if(f.type==='enum')check(Array.isArray(f.values)&&f.values.length&&new Set(f.values).size===f.values.length&&f.values.every(x=>typeof x==='string'&&x&&!reserved.test(x)),'枚举值无效');
  if(f.ordered!==undefined)check(f.type==='enum'&&typeof f.ordered==='boolean','有序标记仅适用于枚举');
  byName.set(f.name,f);byKey.set(f.key,f);
  check(f.aliases===undefined||Array.isArray(f.aliases),'条件别名须为数组');
  for(const name of f.aliases??[]){check(typeof name==='string'&&name.trim()===name&&name&&!reserved.test(name)&&!byName.has(name),'条件别名无效或重复：'+name);byName.set(name,f);}
 }
 return {byName,byKey};
}
export function validateConditionVocabulary(vocabulary){registry(vocabulary);return true;}
export function parseConditionLiteral(text,f){
 text=text.trim();
 if(f.compact){if(text==='?'||text==='？')return '?';if(text==='/')return '/';if(f.type==='boolean'){if(text==='是')return true;if(text==='否')return false;}}
 if(f.type==='text'){check(text.length>0&&text.length<=4000,'效果文本为空或过长');return text;}
 if(f.type==='boolean'){check(text==='true'||text==='false','布尔值须为true/false：'+f.name);return text==='true';}
 if(f.type==='enum'){check(f.values.includes(text),'未登记枚举值：'+f.name);return text;}
 const m=text.match(new RegExp('^('+NUMBER+')(?:\\s*(.*))?$'));check(m,'数值无效：'+f.name);
 check((m[2]??'')===(f.unit??'')||!m[2]&&f.allowBareNumber===true&&f.unit,'单位不符或缺失：'+f.name);
 const n=Number(m[1]);check(validValue(n,f),'数值超出范围或整数要求：'+f.name);return n;
}
const literal=parseConditionLiteral;
function validValue(value,f){if(f.compact&&(value==='?'||value==='/'))return true;return f.type==='boolean'?typeof value==='boolean':f.type==='number'?typeof value==='number'&&Number.isFinite(value)&&(f.min===undefined||value>=f.min)&&(f.max===undefined||value<=f.max)&&(!f.integer||Number.isSafeInteger(value)):f.type==='text'?typeof value==='string'&&value.length>0&&value.length<=4000:f.values.includes(value);}
export const isConditionValue=validValue;
const normalize=s=>s.replaceAll('＞','>').replaceAll('＜','<').replaceAll('＝','=').replaceAll('≥','>=').replaceAll('≤','<=').replaceAll('≠','!=');
function terms(text){const list=text.split(/[，,]/).map(s=>s.trim());check(list.length<=32&&list.every(Boolean),'条件/结果有空项或超过32项');return list;}
function compare(text,byName,defaultBoolean=true){
 const m=normalize(text).match(/^(.+?)\s*(>=|<=|!=|==|>|<|=)\s*(.+)$/);
 const name=m?m[1].trim():text.trim(),f=byName.get(name);check(f&&f.read!==false,'未登记可读条件：'+name);
 const op=m?m[2].replace('==','='):'=',value=m?literal(m[3],f):defaultBoolean;
 check(!(f.compact&&value==='?'),'未知值不能作为满足条件的目标：'+name);
 if(f.compact&&value==='/')check(['=','!='].includes(op),'没有值仅支持 = / 或 != /：'+name);
 check(m||f.type==='boolean','只有布尔状态可以省略 = true：'+name);
 check(f.type==='number'||f.type==='enum'&&f.ordered===true||['=','!='].includes(op),'此字段不支持大小比较：'+name);
 return {key:f.key,op,value};
}
export function compileConditionRule(source,vocabulary,policy={}){
 check(typeof source==='string'&&source.length>0&&source.length<=8000,'条件格为空或过长');
 const {byName,byKey}=registry(vocabulary);
 // A cell uses → (or =>); a standalone two/three-line form is also accepted.
 const text=source.trim().replace(/\r\n/g,'\n');
 const parts=text.split(/\s*(?:→|=>|\n(?=(?:变动|变更)[：:]))\s*/);
 check(parts.length>=1&&(/^(?:true|false)[：:]/.test(parts[0]))&&(parts.length>=2||policy.predicate===true),'条件须写 true/false：条件 → 变动/变更：结果');
 // Prefix persists within a comma group; a later prefix changes only shorthand
 // boolean terms. Explicit comparisons retain their own meaning.
 const branches=parts[0].split(/\s*或\s*/).map(group=>{let defaultBoolean=true;return terms(group).map(t=>{const prefix=t.match(/^(true|false)[：:]\s*(.*)$/);if(prefix){defaultBoolean=prefix[1]==='true';t=prefix[2];}return compare(t,byName,defaultBoolean);});});
 check(branches.length<=8,'条件分支超过8项');
 for(const branch of branches){
  check(new Set(branch.map(x=>JSON.stringify(x))).size===branch.length,'条件重复');
  for(const key of policy.requiredTrue??[])check(branch.some(t=>t.key===key&&t.op==='='&&t.value===true),'缺少本字段必要的真实状态：'+(byKey.get(key)?.name??key));
 }
 let mode;const effects=[];
 for(const token of (parts.length>1?terms(parts.slice(1).join('，')):[])){
  const prefix=token.match(/^(变动|变更)[：:]\s*(.*)$/);if(prefix)mode=prefix[1];check(mode,'结果缺少变动/变更');
  const body=normalize(prefix?prefix[2]:token),m=mode==='变更'?body.match(/^(.+?)\s*=\s*(.+)$/):body.match(new RegExp('^(.+?)\\s*([+-]\\s*(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:\\s*.*)?)$'));
  check(m,'结果语法无效：'+token);const name=m[1].trim(),f=byName.get(name);check(f&&f.write===true,'未登记可写结果：'+name);
  check(!policy.writeKeys||policy.writeKeys.includes(f.key),'此格不能变更该字段：'+name);
  check(mode==='变更'||f.type==='number','变动仅用于数值：'+name);
  effects.push({key:f.key,op:mode==='变更'?'set':'add',value:literal(m[2].replace(/^([+-])\s+/,'$1'),mode==='变动'?{...f,min:undefined,max:undefined}:f)});
 }
 check(new Set(effects.map(x=>x.key)).size===effects.length,'同一规则不能重复修改同一字段');
 const used=[...new Set([...branches.flat().map(x=>x.key),...effects.map(x=>x.key)])];
 return {format:'tisya.condition-rule/1',source,branches,effects,fields:used.map(key=>structuredClone(byKey.get(key)))};
}
// Caller supplies the ledger projection for the selected branch/time. No defaults,
// text guessing, cross-person lookup, or stored parallel current-value map.
export function conditionBindings(program,{ownerId,recordId,contextId}){
 check(program?.format==='tisya.condition-rule/1','条件程序版本无效');
 return program.fields.map(f=>{
  const object=f.scope==='bound'?f.objectId:['owner','owner-record'].includes(f.scope)?ownerId:f.scope==='record'?recordId:contextId;
  check(typeof object==='string'&&object,'缺少条件作用域：'+f.scope);
  if(f.scope==='record-context')check(typeof recordId==='string'&&recordId,'缺少本条档案作用域');
  return {key:f.key,name:f.name,object,field:f.scope==='bound'?f.fieldPath:f.scope==='owner-record'?JSON.stringify([f.recordKey,f.storageKey]):f.scope==='record-context'?JSON.stringify([recordId,f.key]):f.key,type:f.type,...(f.unit?{unit:f.unit}:{})};
 });
}
export function evaluateConditionRule(program,rows,scope){
 check(Array.isArray(rows),'需要当前账本投影行');
 const bindings=conditionBindings(program,scope),current=new Map();
 for(const b of bindings){
  const matches=rows.filter(r=>r.table==='state'&&r.values?.对象===b.object&&r.values?.字段===b.field&&r.values?.有效性==='有效');
  check(matches.length<=1,'同一作用域有多个有效状态：'+b.name);
  const row=matches[0],f=program.fields.find(f=>f.key===b.key);
  if(row){check(own(row.values,'值')&&!own(row.values,'值引用')&&!own(row.values,'原生引用')&&validValue(row.values.值,f),'当前状态类型无效：'+b.name);check(typeof row.id==='string'&&Number.isSafeInteger(row.rev)&&row.rev>=0,'状态行缺少版本');}
  current.set(b.key,row??null);
 }
 const states=program.branches.map(branch=>{
  const tests=branch.map(t=>{const r=current.get(t.key);if(!r)return null;const f=program.fields.find(f=>f.key===t.key);if(f.compact&&r.values.值==='?')return null;if(f.compact&&(r.values.值==='/'||t.value==='/'))return t.op==='='?r.values.值===t.value:t.op==='!='?r.values.值!==t.value:false;const ordered=f.type==='enum'&&f.ordered===true,value=ordered?f.values.indexOf(r.values.值):r.values.值,target=ordered?f.values.indexOf(t.value):t.value;switch(t.op){case '=':return value===target;case '!=':return value!==target;case '>':return value>target;case '<':return value<target;case '>=':return value>=target;case '<=':return value<=target;default:throw Error('未知比较操作');}});
  return tests.includes(false)?false:tests.includes(null)?null:true;
 });
 const matched=states.includes(true)?true:states.includes(null)?null:false;
 const basis=bindings.map(b=>{const row=current.get(b.key);return {key:b.key,object:b.object,field:b.field,id:row?.id??null,expected:row?.rev??0,exists:!!row};});
 const base={format:'tisya.condition-plan/1',ruleSource:program.source,scope:structuredClone(scope),matched,bindings,basis,changes:[],writes:0};
 if(matched!==true)return {...base,status:matched===null?'unknown':'unmatched'};
 const missing=program.effects.filter(e=>e.op==='add'&&(!current.get(e.key)||typeof current.get(e.key).values.值!=='number')).map(e=>e.key);
 if(missing.length)return {...base,status:'blocked-missing-value',missing};
 // Result is a transaction proposal, not an automatic event, cognition or commit.
 const changes=program.effects.map(e=>{
  const row=current.get(e.key),binding=bindings.find(b=>b.key===e.key),value=e.op==='add'?row.values.值+e.value:e.value;
  check(validValue(value,program.fields.find(f=>f.key===e.key)),'结果数值超出范围');
  return {key:e.key,op:e.op,operand:e.value,id:row?.id??null,expected:row?.rev??0,exists:!!row,...(row?{before:row.values.值}:{}),values:{对象:binding.object,字段:binding.field,有效性:'有效',值:value}};
 });
 return {...base,status:'ready',changes};
}
export function compileWorkbookConditions(engine,recordIds,vocabulary){
 const programs=[];
 for(const id of recordIds){const record=engine.read(id),slots=vocabulary.slots?.[record.template]??{};
  for(const [field,policy] of Object.entries(slots)){
   const value=engine.get(id,field);if(value===undefined)continue;
   for(const [index,source] of (Array.isArray(value)?value:[value]).entries()){
    if(policy.mode==='mixed'&&!/^(?:(?:true|false)[：:])|→|=>/.test(source))continue;
    try{programs.push({recordId:id,field,index,program:compileConditionRule(source,vocabulary,policy)});}catch(error){throw Error('条件格 '+field+' #'+(index+1)+'：'+error.message);}
   }
  }
 }
 return programs;
}
export function conditionInstructions(vocabulary){
 registry(vocabulary);
 return [
  '条件格用“true：条件，条件 → 变动：数值字段 + 数值，变更：字段 = 值”。逗号表示全部满足；确需任选一组时用“或”分组，组内逗号仍表示全部。true：后的裸状态名表示为真，false：后的裸状态名表示为假，后续标签可切换；明确比较不受标签影响。比较可用 > < = ≥ ≤ !=。结果中变动做有符号增减，变更设值；同类结果逗号分隔，换类再写标签。多条独立规则用“；”分隔（只用于多项格）。未知条件留空，不造阈值、因果或当前状态。',
  ...(vocabulary.fields.some(f=>f.allowBareNumber)?['数值格的裸数值沿用该字段已登记单位；若显式写单位，必须一致，不做隐式换算。']:[]),
  '词表只规定可引用字段及类型，不证明其当前值，也不意味着必须使用。未提供的当前状态是未知；过去已发生前置事件须由对应事件状态提供，不能因文字提到就设true。',
  ...(vocabulary.fields.some(f=>f.compact)?['简写字段支持 是/否、？（未知）、/（明确没有）；未知不满足真假条件，没有不参加等级大小比较。等级按登记顺序比较，效果文字不自动执行。']:[]),
  '协商、改变、沉默、揭示条件的非空格必须使用该写法；代价限制里有明确条件的条目也这样写，无条件能力边界保留短句。关系的成立条件是既有联系依据，继续用原文描述。',
  '已登记状态（true/false）：'+vocabulary.fields.filter(f=>f.type==='boolean'&&!f.eventName).map(f=>f.name).join('，'),
  '已登记数值：'+vocabulary.fields.filter(f=>f.type==='number').map(f=>f.name+(f.unit?'（'+f.unit+'）':'')).join('，'),
  ...vocabulary.fields.filter(f=>f.type==='enum').map(f=>'已登记'+(f.ordered?'有序单选（从低到高，可比较）':'单选')+'：'+f.name+' = '+f.values.join('/')),
  ...vocabulary.fields.filter(f=>f.aliases?.length).map(f=>'同一字段别名：'+f.aliases.join('/')+' = '+f.name),
  ...(vocabulary.fields.some(f=>f.eventName)?['已登记事件：'+vocabulary.fields.filter(f=>f.eventName).map(f=>f.eventName).join('，')+'；条件中写 已触发事件“事件名”。']:[]),
  '结果只能修改该格要求列出的字段；其余登记项用于判断。'
 ].join('\n');
}

// Flat registration surface. No current values are initialized by registration.
// A project namespace and caller-selected owner/record/context bind equal names.
export function registerConditionNames({states='',numbers='',events='',enums=[]},{namespace,scope='owner'}={}){
 check(typeof namespace==='string'&&namespace.trim(),'注册需要项目命名空间');
 const names=s=>{check(typeof s==='string','注册清单须为逗号分隔文本');return s.trim()?terms(s):[];};
 const fields=[];
 for(const name of names(states))fields.push({name,key:JSON.stringify([namespace,'状态',name]),type:'boolean',scope,write:true});
 for(const spec of names(numbers)){
  const m=spec.match(/^(.+?)(?:[（(]([^()（）]+)[）)])?$/);check(m,'数值注册无效');
  fields.push({name:m[1].trim(),key:JSON.stringify([namespace,'数值',m[1].trim()]),type:'number',scope,write:true,...(m[2]?{unit:m[2].trim()}:{})});
 }
 check(Array.isArray(enums),'枚举注册须为单选定义列表');
 for(const spec of enums){const m=spec.match(/^(.+?)\s*=\s*(.+)$/);check(m,'枚举须写 字段 = a/b/c');const name=m[1].trim();fields.push({name,key:JSON.stringify([namespace,'枚举',name]),type:'enum',values:m[2].split('/').map(x=>x.trim()),scope,write:true});}
 for(const name of names(events))fields.push({name:'已触发事件“'+name+'”',eventName:name,key:JSON.stringify([namespace,'事件',name]),type:'boolean',scope,write:true});
 const vocabulary={version:1,fields};registry(vocabulary);return vocabulary;
}
// Explicit event marks only. This compiles proposed flags; the existing host
// transaction writer must validate occurrence/source and commit before dispatch.
export function compileEventMarks(text,vocabulary){
 const {byName}=registry(vocabulary);return [...new Set(terms(text))].map(name=>{
  const f=byName.get(name);check(f?.eventName&&f.write===true,'未登记已触发事件：'+name);
  return {key:f.key,value:true,eventName:f.eventName};
 });
}
