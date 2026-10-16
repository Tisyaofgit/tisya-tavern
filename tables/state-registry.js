// Shared definitions, never a second current-state store. Pure candidate services.
import {validateConditionVocabulary,parseConditionLiteral,conditionBindings} from './condition-rules.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const forbidden=/[，,；;：:<>＝=≥≤！!→\n\r\[\]／/]|=>|或/;
const nameOK=s=>typeof s==='string'&&s.trim()===s&&s&&!forbidden.test(s);
const key=(...parts)=>JSON.stringify(parts);
const kindNames={技能:'skill',伤病:'injury',人物:'character',物品:'item',事件:'event'};
export const stateKind=label=>kindNames[label]??label;
export const stateKindLabel=kind=>Object.keys(kindNames).find(k=>kindNames[k]===kind)??kind;
const primitive=(f)=>({name:f.name,key:f.id,type:f.type,scope:'record',compact:true,...(f.type==='text'?{read:false}:{}),...(f.values?{values:f.values,ordered:f.ordered}:{}),...(f.unit?{unit:f.unit,allowBareNumber:true}:{}),...Object.fromEntries(['min','max','integer','levelNames'].filter(k=>f[k]!==undefined).map(k=>[k,f[k]]))});

export function emptyStateRegistry(namespace){
 check(typeof namespace==='string'&&namespace.trim()===namespace&&namespace,'注册需要项目命名空间');
 return {format:'tisya.state-registry/2',namespace,revision:0,definitions:[]};
}
export function validateStateRegistry(registry){
 check(registry?.format==='tisya.state-registry/2'&&typeof registry.namespace==='string'&&registry.namespace.trim()&&Number.isSafeInteger(registry.revision)&&registry.revision>=0&&Array.isArray(registry.definitions),'状态注册表无效');
 const ids=new Set(),names=new Set();
 for(const f of registry.definitions){
  check(nameOK(f.kind)&&nameOK(f.name)&&f.id===key(registry.namespace,f.kind,f.name)&&!ids.has(f.id),'状态定义身份无效或重复');ids.add(f.id);
  check(Array.isArray(f.aliases)&&f.aliases.every(nameOK),'状态别名无效');
  check(f.presence===undefined||f.presence===true&&f.type==='boolean','存在标记必须为布尔');
  for(const n of [f.name,...f.aliases]){const k=key(f.kind,n);check(!names.has(k),'同类状态名称/别名冲突：'+n);names.add(k);}
  check(f.type!=='enum'||f.ordered!==true,'有序等级必须使用数字等级定义');
  check(!Object.hasOwn(f,'value')&&!Object.hasOwn(f,'default'),'注册不得初始化当前值');
  if(f.levelNames!==undefined)check(f.type==='number'&&f.unit==='级'&&f.integer===true&&f.min===1&&Array.isArray(f.levelNames)&&f.levelNames.length===f.max&&f.levelNames.length<=1000&&f.levelNames.every(nameOK)&&new Set(f.levelNames).size===f.levelNames.length,'等级名称/级数定义无效');
  validateConditionVocabulary({version:1,fields:[primitive(f)]});
 }
 for(const kind of new Set(registry.definitions.map(f=>f.kind)))check(registry.definitions.filter(f=>f.kind===kind&&f.presence).length<=1,'同类对象只能有一个存在标记');
 return true;
}
const lines=text=>{check(typeof text==='string'&&text.length<=32000,'注册/填表文本无效或过长');return text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);};
const names=text=>{const result=text.split(/[，,]/).map(s=>s.trim());check(result.length&&result.every(nameOK)&&new Set(result).size===result.length,'枚举值无效或重复');return result;};

// Example: 技能／技能水平：等级 = 未掌握，入门，熟练，精通
// Alias: 别名／技能／熟练程度：技能水平
// Whole batch is immutable/atomic. Existing semantics cannot be overwritten.
export function registerStateDefinitions(registry,text){
 validateStateRegistry(registry);const next=structuredClone(registry),aliases=[];let changed=false;
 for(const line of lines(text)){
  const alias=line.match(/^别名／([^／]+)／([^：:]+)[：:]\s*(.+)$/);
  if(alias){aliases.push({kind:stateKind(alias[1]),alias:alias[2].trim(),name:alias[3].trim()});continue;}
  const m=line.match(/^([^／]+)／([^：:]+)[：:]\s*(布尔|存在|数值|文本|枚举|等级)(?:\s*=\s*(.+))?$/);check(m,'注册须写 类别／字段：类型 = 允许值：'+line);
  const [,label,rawName,type,arg]=m,kind=stateKind(label),name=rawName.trim();check(kind&&nameOK(name),'注册类别/名称无效');
  const f={id:key(registry.namespace,kind,name),kind,name,type:['布尔','存在'].includes(type)?'boolean':['数值','等级'].includes(type)?'number':type==='文本'?'text':'enum',aliases:[]};
  if(type==='等级'){check(arg,'等级须登记名称列表或最大级数');const count=/^\d+$/.test(arg)?Number(arg):null;check(count===null||count>=1&&count<=1000,'等级数量须为1—1000');f.levelNames=count===null?names(arg):Array.from({length:count},(_,i)=>String(i+1));f.unit='级';f.min=1;f.max=f.levelNames.length;f.integer=true;}
  else if(f.type==='enum'){check(arg,'枚举缺少允许值');f.values=names(arg);f.ordered=false;}
  else if(f.type==='number'){const n=arg?.match(/^(.+?)(?:\s*\[([+-]?(?:\d+(?:\.\d+)?|\.\d+)),\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\])?(?:\s+(整数))?$/);check(n&&nameOK(n[1].trim()),'数值须显式登记单位，可附 [下限,上限] 整数');f.unit=n[1].trim();if(n[2]!==undefined){f.min=Number(n[2]);f.max=Number(n[3]);}if(n[4])f.integer=true;}
  else{check(arg===undefined,'注册不填当前值');if(type==='存在')f.presence=true;}
  const old=next.definitions.find(x=>x.kind===kind&&x.name===name);
  if(old)check(JSON.stringify({...old,aliases:[]})===JSON.stringify(f),'已有定义冲突，不能改档位/类型/单位/顺序：'+name);
  else{next.definitions.push(f);changed=true;}
 }
 for(const {kind,alias,name}of aliases){
  check(kind&&nameOK(alias)&&nameOK(name),'别名注册无效');const f=next.definitions.find(x=>x.kind===kind&&x.name===name);check(f,'别名目标未登记：'+name);
  if(alias!==name&&!f.aliases.includes(alias)){f.aliases.push(alias);changed=true;}
 }
 if(changed)next.revision++;
 validateStateRegistry(next);return next;
}

// Instances come from the plugin's archive identity table, not invented IDs in prose.
// Definitions are shared; state addresses are owner + stable instance + definition.
export function projectStateVocabulary(registry,instances,{writeDefinitionIds=[]}={}){
 validateStateRegistry(registry);check(Array.isArray(instances)&&instances.length<=256&&Array.isArray(writeDefinitionIds),'对象投影无效');
 check(writeDefinitionIds.every(id=>registry.definitions.some(f=>f.id===id)),'允许写入清单有未登记定义');
 const fields=[],ids=new Set();
 for(const item of instances){
  check(typeof item.id==='string'&&item.id&&nameOK(item.kind)&&nameOK(item.name)&&!ids.has(item.id),'实例身份无效或重复');ids.add(item.id);
  for(const d of registry.definitions.filter(f=>f.kind===item.kind)){
   const name=d.name+'['+item.name+']',aliases=d.aliases.map(n=>n+'['+item.name+']');if(d.presence)aliases.push(item.name);if(item.kind==='event'&&d.name==='已触发'&&d.type==='boolean')aliases.push('已触发事件“'+item.name+'”');
   fields.push({...primitive(d),name,key:key(d.id,item.id),scope:'owner-record',storageKey:d.id,recordKey:item.id,aliases,write:writeDefinitionIds.includes(d.id),definitionId:d.id,registryRevision:registry.revision});
  }
 }
 const vocabulary={version:1,fields};validateConditionVocabulary(vocabulary);return vocabulary;
}
export function stateFillInstructions(vocabulary){
 validateConditionVocabulary(vocabulary);
 return ['？=未知，/=明确没有；是否开启填是/否/？；数字等级填1、2、3……，分类枚举按登记选词，额外效果直接写内容。空白表示此次未填写，不修改已存值。未受训不推断技能水平；伤病存在不推断等级或是否开启。',
  ...vocabulary.fields.map(f=>f.name+'：'+(f.levelNames?f.levelNames.map((n,i)=>(i+1)+'='+n).join('，')+'（填写数字等级）':f.type==='enum'?f.values.join('／')+(f.ordered?'（从低到高）':''):f.type==='boolean'?'是／否':f.type==='text'?'效果文字':'数值（'+f.unit+'）')+'；未知填？，明确没有填/')].join('\n');
}

// A proposed update only. Existing host validation/transaction service owns commit.
// Omitted/blank cells produce no changes; synonyms resolve to one canonical address.
export function proposeStateValues(text,vocabulary,scope){
 validateConditionVocabulary(vocabulary);const byName=new Map();for(const f of vocabulary.fields)for(const n of [f.name,...f.aliases??[]])byName.set(n,f);
 const supplied=new Map();
 for(const line of lines(text)){
  const m=line.match(/^([^：:]+)[：:]\s*(.*)$/);check(m,'状态值须写 字段：值');const f=byName.get(m[1].trim());check(f,'未登记状态字段：'+m[1]);
  check(f.write===true,'状态字段不可写：'+f.name);check(!supplied.has(f.key),'同一状态重复填写（含别名）：'+f.name);
  supplied.set(f.key,m[2].trim()?parseConditionLiteral(m[2],f):undefined);
 }
 const fields=vocabulary.fields.filter(f=>supplied.has(f.key)&&supplied.get(f.key)!==undefined);
 const bindings=conditionBindings({format:'tisya.condition-rule/1',fields},scope);
 return {format:'tisya.state-values-proposal/1',registryRevisions:[...new Set(fields.map(f=>f.registryRevision))],scope:structuredClone(scope),writes:0,requiresHostCommit:true,changes:bindings.map(b=>({key:b.key,values:{对象:b.object,字段:b.field,有效性:'有效',值:supplied.get(b.key)}}))};
}

const gridHeader='项目｜是否开启｜等级｜额外效果';
// A grid is a projection of registered roles, independent of category or field name.
// Multiple rank axes stay in the complete field form rather than being guessed.
export function stateGridColumns(registry,kind){
 const defs=registry.definitions.filter(f=>f.kind===kind),ranks=defs.filter(f=>f.levelNames);
 if(ranks.length>1)return null;
 const columns=[defs.find(f=>f.name==='是否开启'&&f.type==='boolean'),ranks[0],defs.find(f=>f.name==='额外效果'&&f.type==='text')].map(f=>f??null);
 return columns.some(Boolean)?columns:null;
}
export function stateGridTemplate(registry,instances){
 validateStateRegistry(registry);
 check(Array.isArray(instances)&&instances.every(i=>nameOK(i.kind)&&nameOK(i.name)&&!/[|｜]/.test(i.name)),'简表条目名称无效');
 check(new Set(instances.map(i=>i.name)).size===instances.length,'简表同名条目须先消歧');
 return [gridHeader,...instances.map(i=>{const columns=stateGridColumns(registry,i.kind);check(columns,'此条目没有单一简表投影，请使用全部登记字段：'+i.name);return [i.name,...columns.map(f=>f?'？':'/')].join('｜');})].join('\n');
}
export function proposeStateGrid(text,registry,instances,scope){
 stateGridTemplate(registry,instances);const raw=lines(text);check(raw.shift()===gridHeader,'简表表头须为 '+gridHeader);
 const writable=registry.definitions.map(f=>f.id),vocabulary=projectStateVocabulary(registry,instances,{writeDefinitionIds:writable});
 const items=new Map(instances.map(i=>[i.name,i])),seen=new Set(),rows=[];
 for(const line of raw){
  // First three separators locate cells; remaining separators belong to effect text.
  const m=line.match(/^([^｜]+)｜([^｜]*)｜([^｜]*)｜(.*)$/);check(m,'简表须有四列');const name=m[1].trim(),item=items.get(name);check(item&&!seen.has(name),'简表对象未登记或重复：'+name);seen.add(name);
  stateGridColumns(registry,item.kind).forEach((field,i)=>{const value=m[i+2].trim();if(!field){check(!value||value==='/','此条目没有登记该简表列：'+item.name);return;}rows.push(field.name+'['+item.name+']：'+value);});
 }
 return proposeStateValues(rows.join('\n'),vocabulary,scope);
}

// Optional starter definitions. All ranks are numeric; names belong to the world.
export function levelStatePreset(namespace){return registerStateDefinitions(emptyStateRegistry(namespace),['技能／技能水平：等级 = 未掌握，入门，熟练，精通','技能／训练经历：枚举 = 未受训，受训','技能／是否开启：布尔','技能／额外效果：文本','伤病／伤病存在：存在','伤病／伤病等级：等级 = 轻度，中度，重度，危重','伤病／是否开启：布尔','伤病／额外效果：文本'].join('\n'));}
