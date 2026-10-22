// Author-defined arithmetic and growth. Pure evaluator; current state stays in ledger.
import {projectStateVocabulary} from './state-registry.js';
import {conditionBindings,parseConditionLiteral,isConditionValue} from './condition-rules.js';
const check=(ok,m)=>{if(!ok)throw Error(m);},copy=structuredClone;
const dim=u=>!u||u==='1'?{}:{[u]:1};
const signature=d=>JSON.stringify(Object.entries(d).filter(([,v])=>v).sort(([a],[b])=>a.localeCompare(b)));
const same=(a,b)=>signature(a)===signature(b);
function product(a,b,sign=1){const out=Object.assign(Object.create(null),a);for(const [k,v]of Object.entries(b))out[k]=(out[k]??0)+sign*v;return out;}
function split(text,delimiter){let depth=0,start=0,out=[];for(let i=0;i<text.length;i++){if(text[i]==='(')depth++;if(text[i]===')')depth--;check(depth>=0,'括号不配对');if(depth===0&&delimiter.includes(text[i])){out.push(text.slice(start,i).trim());start=i+1;}}check(depth===0,'括号不配对');out.push(text.slice(start).trim());check(out.every(Boolean),'存在空项');return out;}
function expression(source,fields){
 check(typeof source==='string'&&source.length&&source.length<=4000,'公式为空或过长');
 const refs=new Map();for(const f of fields)for(const n of [f.name,...f.aliases??[]])refs.set(n,f);
 const names=[...refs.keys()].sort((a,b)=>b.length-a.length),units=[...new Set(fields.map(f=>f.unit).filter(u=>u&&u!=='1'))].sort((a,b)=>b.length-a.length);
 let at=0,nodes=0;const ws=()=>{while(at<source.length&&/\s/.test(source[at]))at++;};
 function parse(min=0,depth=0){check(depth<24&&++nodes<=256,'公式过深或过长');ws();let n;const ch=source[at];
  if(ch==='+'||ch==='-'){at++;const arg=parse(3,depth+1);n={kind:'unary',op:ch,arg,dimension:arg.dimension};}
  else if(ch==='('){at++;n=parse(0,depth+1);ws();check(source[at++]==')','公式括号不配对');}
  else{const name=names.find(name=>source.startsWith(name,at));if(name){at+=name.length;const f=refs.get(name);check(f.type==='number','公式只使用已登记数值/数字等级：'+name);n={kind:'field',key:f.key,dimension:dim(f.unit)};}
   else{const number=source.slice(at).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);if(number){at+=number[0].length;ws();const unit=units.find(u=>source.startsWith(u,at));if(unit)at+=unit.length;n={kind:'number',value:Number(number[0]),dimension:dim(unit)};}
    else{const fn=source.slice(at).match(/^(min|max|abs|floor|ceil|round)\s*\(/);check(fn,'公式有未登记字段或不支持的语法：'+source.slice(at,at+40));at+=fn[0].length;const args=[];do{args.push(parse(0,depth+1));ws();if(source[at]!==',')break;at++;}while(true);check(source[at++]===')','函数括号不配对');check(['min','max'].includes(fn[1])?args.length>=2&&args.length<=16:args.length===1,'函数参数数量不符');check(args.every(a=>same(a.dimension,args[0].dimension)),'函数参数单位不一致');n={kind:'call',op:fn[1],args,dimension:args[0].dimension};}
   }
  }
  while(true){ws();const op=source[at],power=op==='+'||op==='-'?1:op==='*'||op==='/'?2:0;if(!power||power<=min)break;at++;const right=parse(power,depth+1);if(power===1)check(same(n.dimension,right.dimension),'加减单位不一致');n={kind:'binary',op,left:n,right,dimension:power===1?n.dimension:product(n.dimension,right.dimension,op==='/'?-1:1)};}
  return n;
 }
 const ast=parse();ws();check(at===source.length,'公式尾部有不支持内容：'+source.slice(at));return ast;
}
function condition(source,fields){
 check(/^(true|false)[：:]/.test(source),'成长条件须以true/false：开头');
 const branches=source.split(/\s*或\s*/).map(group=>{let bool=true;return split(group,'，,').map(term=>{
  const prefix=term.match(/^(true|false)[：:]\s*(.*)$/);if(prefix){bool=prefix[1]==='true';term=prefix[2];}
  const m=term.replaceAll('≥','>=').replaceAll('≤','<=').replaceAll('≠','!=').replaceAll('＝','=').match(/^(.+?)\s*(>=|<=|!=|==|>|<|=)\s*(.+)$/),name=m?m[1].trim():term.trim(),f=fields.find(f=>f.name===name||f.aliases?.includes(name));check(f&&f.read!==false,'成长条件字段未登记：'+name);
  if(f.type==='number'){check(m,'数值条件缺少比较');if(m[3].trim()==='/'){check(['=','==','!='].includes(m[2]),'没有值只支持相等判断');return {key:f.key,op:m[2],value:'/'};}const rhs=expression(m[3],fields);check(same(dim(f.unit),rhs.dimension),'成长条件比较单位不符');return {key:f.key,op:m[2],rhs};}
  const value=m?parseConditionLiteral(m[3],f):bool;check(value!=='?'&&['boolean','enum'].includes(f.type)&&(m||f.type==='boolean'),'条件值无效');const op=m?.[2]??'=';check(['=','==','!='].includes(op),'非数值条件只支持相等判断');return {key:f.key,op,value};
 });});check(branches.length<=8&&branches.every(b=>b.length<=32),'成长条件过多');return branches;
}
export function compileStateFormulas(catalog){
 const vocabulary=projectStateVocabulary(catalog.registry,catalog.items,{writeDefinitionIds:catalog.registry.definitions.map(d=>d.id)}),fields=vocabulary.fields,actions=[];
 for(const [key,automatic]of [['formulas',false],['growth',true]]){
  const raw=catalog[key]??'';check(typeof raw==='string'&&raw.length<=32000,'运算登记格式无效');
  for(const line of raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
   const m=line.match(/^([^：:]+)[：:]\s*(.*)$/);check(m,'运算须有名称');const name=m[1].trim();check(name&&name.length<=80&&!actions.some(a=>a.name===name),'运算名称重复');let body=m[2],branches=null;
   if(automatic||/^(true|false)[：:]/.test(body)){const parts=body.split(/\s*(?:→|=>)\s*/);check(parts.length===2,'成长规则须有条件与结果');branches=condition(parts[0],fields);body=parts[1];}
   const effects=split(body,'；;').map(token=>{let m=token.match(/^(变更|变动)[：:]\s*(.+?)\s*[=＝]\s*(.+)$/);
    if(!m){const short=token.match(/^变动[：:]\s*(.*)$/),f=short&&fields.find(f=>short[1].startsWith(f.name)&&/^[+-]/.test(short[1].slice(f.name.length).trim()));if(f)m=[token,'变动',f.name,short[1].slice(f.name.length).trim()];}
    check(m,'结果须写 变更：字段 = 表达式 或 变动：字段 + 数量');const target=fields.find(f=>f.name===m[2].trim()||f.aliases?.includes(m[2].trim()));check(target,'结果字段未登记');const mode=m[1]==='变动'?'add':'set';check(mode==='set'||target.type==='number','变动仅支持数值');
    const ast=target.type==='number'?expression(m[3],fields):{kind:'literal',value:parseConditionLiteral(m[3],target)};if(target.type==='number')check(same(ast.dimension,dim(target.unit)),'公式结果单位与目标不符：'+target.name);return {target,mode,ast};});
   check(effects.length<=32&&new Set(effects.map(e=>e.target.key)).size===effects.length,'同一运算目标重复或过多');
   if(automatic)check(effects.some(e=>e.target.levelNames),'成长规则至少更新一项数字等级');
   actions.push({name,automatic,branches,effects,source:line});
  }
 }
 check(actions.length<=64,'运算超过64项');return {vocabulary,actions};
}
export function registerStateFormulas(catalog,{formulas='',growth=''}={}){
 const next=copy(catalog),old=compileStateFormulas(next);const incoming=compileStateFormulas({...next,formulas,growth});
 for(const a of incoming.actions){const prior=old.actions.find(x=>x.name===a.name);if(prior)check(JSON.stringify(prior)===JSON.stringify(a),'已有运算不可改写：'+a.name);else{const k=a.automatic?'growth':'formulas';next[k]=[next[k],a.source].filter(Boolean).join('\n');}}
 compileStateFormulas(next);return next;
}
export function evaluateStateFormula(catalog,name,rows,ownerId){
 const {vocabulary,actions}=compileStateFormulas(catalog),action=actions.find(a=>a.name===name);check(action,'运算未登记：'+name);
 const bindings=conditionBindings({format:'tisya.condition-rule/1',fields:vocabulary.fields},{ownerId}),dependencies=new Map();
 function read(key,optional=false,allowAbsence=false){const b=bindings.find(x=>x.key===key),f=vocabulary.fields.find(x=>x.key===key);const matches=rows.filter(r=>r.table==='state'&&r.values.对象===ownerId&&r.values.字段===b.field);check(matches.length<=1,'状态账本有重复行');const row=matches[0];if(!row||row.values.有效性!=='有效'){if(optional)return undefined;throw Error('公式需要已确认的当前值：'+f.name);}check(Object.hasOwn(row.values,'值')&&!Object.hasOwn(row.values,'值引用')&&!Object.hasOwn(row.values,'原生引用'),'公式不能覆写或读取未接线的原生引用：'+f.name);dependencies.set(row.id,row);if(row.values.值==='/'&&allowAbsence)return '/';if(row.values.值==='?'||row.values.值==='/'){if(optional)return undefined;throw Error('未知或没有值不能参与运算：'+f.name);}check(typeof row.values.值===(f.type==='number'?'number':f.type==='boolean'?'boolean':'string'),'公式输入类型无效');check(isConditionValue(row.values.值,f),'当前状态值超出登记范围：'+f.name);return row.values.值;}
 function calc(n,optional=false){if(n.kind==='literal')return n.value;let value;if(n.kind==='number')value=n.value;else if(n.kind==='field')value=read(n.key,optional);else if(n.kind==='unary'){const a=calc(n.arg,optional);if(a===undefined)return undefined;value=(n.op==='-'?-1:1)*a;}else if(n.kind==='binary'){const a=calc(n.left,optional),b=calc(n.right,optional);if(a===undefined||b===undefined)return undefined;check(n.op!=='/'||b!==0,'公式除数为零');value=n.op==='+'?a+b:n.op==='-'?a-b:n.op==='*'?a*b:a/b;}else{const args=n.args.map(x=>calc(x,optional));if(args.includes(undefined))return undefined;value=Math[n.op](...args);}if(value===undefined&&optional)return undefined;check(Number.isFinite(value),'公式产生非有限结果');return value;}
 if(action.branches){const states=action.branches.map(b=>{const tests=b.map(t=>{const a=read(t.key,true,t.value==='/'),b=t.rhs?calc(t.rhs,true):t.value;if(a===undefined||b===undefined)return null;switch(t.op){case '=':case '==':return a===b;case '!=':return a!==b;case '>':return a>b;case '<':return a<b;case '>=':return a>=b;case '<=':return a<=b;}});return tests.includes(false)?false:tests.includes(null)?null:true;});if(!states.includes(true))return {status:states.includes(null)?'unknown':'unmatched',changes:[],dependencies:[...dependencies.values()],source:action.source,action:name};}
 // Every effect reads the same pre-action snapshot; no implicit execution ordering.
 const changes=action.effects.map(e=>{let value=calc(e.ast);if(e.mode==='add')value+=read(e.target.key);check(isConditionValue(value,e.target),'公式结果超出范围或整数要求：'+e.target.name);const b=bindings.find(b=>b.key===e.target.key);return {key:e.target.key,values:{对象:ownerId,字段:b.field,有效性:'有效',值:value}};});
 return {status:'ready',changes,dependencies:[...dependencies.values()],source:action.source,action:name};
}
export const STATE_SYSTEM_CONTRACT=`Optional artifacts.stateSystem is an object with definitions, items, formulas, growth, events (text fields) and initial (a list of objects with owner, values and evidence text). Define numeric rank tracks generically: 技能／技能水平：等级 = 未掌握，入门，熟练，精通 (stored ranks 1,2,3,4; names are world-specific labels) or 境界／阶位：等级 = 10 (unnamed 1..10). All NEW level/severity/progression fields use 等级, not enum; do not reinterpret already persisted enum fields. Numeric fields: 人物／经验：数值 = 点 [0,10000] 整数. Bounds and 整数 optional, unit mandatory. items: 人物：基础 or 技能：修船; custom categories allowed with matching definitions. formulas: 消耗：变动：经验[基础] = -5 点. growth: 修船晋级：true：经验[基础] >= 技能水平[修船] * 100 点 / 1 级，技能水平[修船] < 4 级 → 变动：经验[基础] = -技能水平[修船] * 100 点 / 1 级；变动：技能水平[修船] = 1 级. + - * /, parentheses,min/max/abs/floor/ceil/round supported, explicit units checked. Semicolon separates effects; each action uses one pre-action snapshot and commits all effects together. Automatic growth previews each registered rule once per settlement; no implicit loop to maximum level. Multiple eligible rules writing the same field conflict. Unknown/missing/absent values are not zero. initial evidence is an exact continuous excerpt of the user goal, card or one blueprint.decisions entry. Each initial item has owner (existing/new object ID), evidence (exact source excerpt), and values (state-form text, one field per line; for example 经验[基础]：100 then 技能水平[修船]：1). Only explicitly designed initial values are allowed. Optional events lines: 完成修船｜奖励｜请表现修船收工后的疲惫与进展。 Each event name maps one registered formula (conditions allowed), plus non-executable narrative guidance. Event flags register automatically as 已触发事件“完成修船”; registration is not occurrence. A concrete archived event ID and explicit affected object must be confirmed before settlement; never infer beneficiaries from mentions. Registration/previews never execute or initialize values; existing owned fields cannot be reinitialized. Unsupported native/MVU rebindings, timing/random/cross-person transfer stay unresolved.`;
