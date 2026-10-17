import {ARCHIVE_TABLE_TASKS} from './task-kinds.js';
import {archiveEvidenceSources} from './source-text.js';
import {formSections,formRow,FORM_TEXT_INSTRUCTIONS} from './foundation/form-text.js';
// Ephemeral model surface only. The existing registry and ledger own all data.
import {createSheetEngine} from './foundation/engine.js';
import {check,copy,object,normalized,registryIndex,typeFields,valueValid,mapValue,mapRowReferences,validateRow} from './schema.js';

export const COMPACT_FILL_FORMAT='tisya.compact-fill/1';
const supported=new Set(ARCHIVE_TABLE_TASKS);
const roles=new Set(['读者','记录整理','叙事组织']);
const prohibited=new Set(['__proto__','prototype','constructor']);
const at=(value,path)=>path.reduce((v,k)=>v?.[k],value);
function put(value,path,item){let cursor=value;for(const key of path.slice(0,-1)){check(!prohibited.has(key),'字段路径无效');cursor=cursor[key]??={};}check(!prohibited.has(path.at(-1)),'字段路径无效');cursor[path.at(-1)]=copy(item);}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function encodeName(name){check(typeof name==='string'&&!!name.trim()&&name.length<=4000,'记录名称无效');return name.replace(/[%\r\n|【】；;]/gu,c=>encodeURIComponent(c));}
function decodeName(name){try{return decodeURIComponent(name);}catch{throw Error('记录名称转义无效');}}
function locator(table,kind,name){return table+'／'+(kind||'—')+'／'+encodeName(name);}
function formName(registry,table,kind){return (kind?registry.types.find(t=>t.id===kind):registry.tables.find(t=>t.id===table))?.name??table;}
function publicLocator(registry,table,kind,name){return formName(registry,table,kind)+'／'+encodeName(name);}
function publicField(field){return field.key==='$readers'?'谁可看到':field.key==='$knowers'?'故事里谁已知':field.label.replace(/^属性·/,'');}
function fillHint(d){const type={text:'填原文或有依据的简短描述',time:'填明确时间',number:'填数字',duration:'填数字',boolean:'填是或否',enum:'从这些值中选：'+(d.values??[]).join('、'),ref:'填目录中的档案名称',refs:'填档案名称，多项用；分开',texts:'多项用；分开',json:'填来源中的值，文字可直接写',array:'填来源中的完整列表',map:'填来源中的完整对应项',object:'填来源中的完整组合值',type:'填类别名称'};return [type[d.type]??'按来源填写',d.description?.replace(/稳定ID|稳定 ID|对象ID|对象 ID/g,'档案名称')].filter(Boolean).join('；');}
// Sparse public answers expand only inside the adapter; unknown cells stay absent.
function fillLines(template,lines){const values=new Map();for(const line of lines){const {number,field,raw}=formRow(line,template.fields,{labels:f=>[f.label,publicField(f)]});check(!values.has(number),'行号重复：'+number);let value=raw;if(value&&field.definition.type==='json'){try{JSON.parse(value);}catch{check(!/^[\[{"]/.test(value),'组合值格式不完整：'+field.label);value=JSON.stringify(value);}}values.set(number,value);}
 return template.fields.map((f,i)=>(i+1)+' '+f.label+'：'+(values.get(i+1)??''));}

function merge(before,patch){const out=copy(before??{});for(const [key,value]of Object.entries(patch)){check(!prohibited.has(key),'字段路径无效');out[key]=object(value)&&object(out[key])?merge(out[key],value):copy(value);}return out;}
function jsonReferenceSurface(def){const next=copy(def);if(next.type==='ref')next.type='text';else if(next.type==='refs')next.type='texts';if(next.fields)next.fields=Object.fromEntries(Object.entries(next.fields).map(([k,d])=>[k,jsonReferenceSurface(d)]));if(next.items)next.items=jsonReferenceSurface(next.items);return next;}
function flatten(fields,path=[],result=[]){for(const [key,definition]of Object.entries(fields)){check(!prohibited.has(key),'字段路径无效');if(definition.formula)continue;const next=[...path,key];if(definition.type==='object'&&definition.fields&&Object.keys(definition.fields).length)flatten(definition.fields,next,result);else result.push({key:next.join('·'),label:next.join('·'),path:next,definition:copy(definition)});}return result;}
function templatesFor(registry){const templates=[];for(const table of registry.tables.filter(t=>t.owner==='archive'&&t.id!=='native_cells')){for(const type of table.id==='objects'?registry.types:[null]){const fields=copy(table.fields);delete fields.名称;delete fields.类型;delete fields.核心引用;if(type){fields.属性={type:'object',fields:typeFields(registry,type.id)};delete fields.属性.fields.原生能力引用;}const values=flatten(fields);const meta=[{key:'$evidence',label:'来源依据',path:['meta','evidence'],definition:{type:'text',required:true}},{key:'$readers',label:'读者',path:['meta','readers'],definition:{type:'texts'}},{key:'$knowers',label:'知情者',path:['meta','knowers'],definition:{type:'refs'}}];const mapped=values.map(f=>({...f,path:['values',...f.path],definition:['json','array','map','object'].includes(f.definition.type)?jsonReferenceSurface(f.definition):f.definition}));const combined=[...meta,...mapped,{key:'$operation',label:'处理方式',path:['meta','operation'],definition:{type:'enum',values:['更新','新建','撤销']}},{key:'$unset',label:'清空字段',path:['meta','unset'],definition:{type:'texts'}}];check(new Set(combined.map(f=>f.label)).size===combined.length,'字段标签与归档元数据冲突：'+table.id);templates.push({id:table.id+':'+(type?.id??'—'),table:table.id,kind:type?.id??null,label:table.name+(type?'／'+type.name:''),fields:combined.map(f=>({...f,group:'填写'})),valueFields:values});}}return templates;}
function allowed(task,table,phase,separate,registry){const def=registry.tables.find(t=>t.id===table);if(!def||def.owner!=='archive'||table==='native_cells')return false;const origin=['objects','facts'].includes(table);if(task==='templateInit')return phase==='base'?origin:phase==='initial'&&!origin&&table!=='events';if(phase!=='archive')return false;if(task==='objectArchive')return origin;return !separate||!origin;}
function control(heading,definitions,section){const template={id:'control',table:'core-draft',label:heading,fields:definitions.map(([key,definition])=>({key,label:key,path:[key],group:'控制',definition}))};const engine=createSheetEngine({version:COMPACT_FILL_FORMAT,templates:[template]},valueValid),row=engine.create('control'),task=engine.request(row.id,{heading});engine.accept(task.token,'【'+heading+'】\n'+section.lines.join('\n'));return engine.values(row.id).values;}

export function prepareCompactFill(task,input){
 check(supported.has(task),'任务没有极简填表适配：'+task);check(object(input)&&object(input.registry),'极简任务缺少当前注册表');registryIndex(input.registry);
 const rows=copy(input.currentRows??input.rows??[]);check(Array.isArray(rows),'当前记录无效');if(input.sourceUser?.objectId&&!rows.some(r=>r.id===input.sourceUser.objectId)){check(typeof input.sourceUser.name==='string','原生用户缺少名称');rows.push({id:input.sourceUser.objectId,table:'objects',rev:0,values:{名称:input.sourceUser.name,类型:'character',描述:input.sourceUser.description??''},...(input.sourceUser.access?{access:copy(input.sourceUser.access)}:{}),nativeUserVirtual:true});}const ids=new Set();for(const row of rows){check(typeof row.id==='string'&&!ids.has(row.id)&&row.values&&typeof row.values.名称==='string','当前记录身份无效或重复');ids.add(row.id);}
 const registry=copy(input.registry),templates=templatesFor(registry),identities=rows.map(row=>({id:row.id,label:locator(row.table,row.table==='objects'?row.values.类型:null,row.values.名称),row}));
 const byId=new Map(identities.map(x=>[x.id,publicLocator(registry,x.row.table,x.row.table==='objects'?x.row.values.类型:null,x.row.values.名称)]));
 const modelState=identities.map(({label,row})=>{const value=copy(row.values);mapRowReferences({table:row.table,values:value},registry,id=>byId.get(id)??'未提供的引用');const native=row.id===input.sourceUser?.objectId,locks=[...new Set([...(row.lockedFields??[]),...(native?['名称','描述']:[])])];delete value.类型;delete value.核心引用;if(value.属性)delete value.属性.原生能力引用;return {记录:byId.get(row.id),仅读取身份:row.referenceOnly===true,值:value,...(row.access?{读者:row.access.readers.map(x=>roles.has(x)?x:byId.get(x)??'未提供的主体'),知情者:row.access.knowers.map(x=>byId.get(x)??'未提供的主体')}:{}),...(locks.length?{不可修改字段:locks}:{}),...(native?{原生用户:true}:{})};});
 const schema=templates.filter(t=>task==='templateInit'||allowed(task,t.table,'archive',input.objectsSeparate===true,registry)).map(t=>({table:t.table,type:t.kind??'—',form:formName(registry,t.table,t.kind),fields:t.fields.map((f,i)=>({row:i+1,label:f.label,definition:copy(t.valueFields.find(v=>v.key===f.key)?.definition??f.definition)}))}));
 const contract=[
  '按下面的表格填资料。每条记录用【类别：完整名称】作标题，例如【人物：甲】；类别照表格标题，已有名称照目录填写。不同人物同名时，用来源中已有身份区分，不合并。',
  '只写有依据的新内容或修正，格式为“行号 字段名：值”。空格和未变化的行不用抄；未填写表示不改。未知不要猜。',
  '来源依据填连续原句。谁可看到、故事里谁已知分别核对；人物被提及不等于他知道。确实没有填无；不同知情范围的事实分开记录。',
  '需要关联时抄目录中的“类别／名称”；多项用；分开，没有填无。数字0和否都应如实填写。',
  FORM_TEXT_INSTRUCTIONS,
  '固定原文不能改写。只列出名称的档案需先补读；表中没有合适位置或来源冲突的内容写待处理，不自行增加字段。',
  '最后填写【完成】三行：1 状态：完成；2 待处理：无或具体问题；3 补读记录：无或目录名称。待处理或补读不为空时，保留问题等待解决。',
  '默认补充或更新。明确要建立新记录时，处理方式填新建；已有同名档案则停止并核对。只有原文明示误登记或撤回时才把处理方式填撤销，其他内容格留空；死亡、离场或失去物品不撤销档案。需删除一个可选字段时在清空字段列出字段名，空白格本身不删除。',
  '只交表格，不附解释或推理。'
 ].join('\n');
 const modelInput='本次可填表格：\n'+schema.map(t=>'【'+t.form+'：完整名称】\n'+t.fields.map(f=>f.row+' '+publicField({key:f.label==='读者'?'$readers':f.label==='知情者'?'$knowers':f.label,label:f.label})+'：____（'+fillHint(f.definition)+'）').join('\n')).join('\n\n');
 return {format:COMPACT_FILL_FORMAT,task,registry,rows,identities,objectsSeparate:input.objectsSeparate===true,source:archiveEvidenceSources(task,input).join('\n\n'),evidenceSources:archiveEvidenceSources(task,input),sourceUser:copy(input.sourceUser??null),schema,contract,modelInput,modelState};
}

export function parseCompactFill(plan,raw){
 check(plan?.format===COMPACT_FILL_FORMAT,'极简填表任务版本无效');const sections=formSections(raw);check(sections.length&&sections.at(-1).heading==='完成','缺少最后的显式完成组');
 const completion=control('完成',[['状态',{type:'enum',values:['完成']}],['待处理',{type:'texts'}],['补读记录',{type:'texts'}]],sections.pop());check(completion.状态==='完成'&&Array.isArray(completion.待处理)&&Array.isArray(completion.补读记录),'完成组必须明确填写状态、待处理和补读记录');
 let extension={templates:[],schemaChanges:[]},registry=copy(plan.registry);
 check(!sections.some(s=>s.heading==='结构扩展'),'填写资料时不设计字段；请将缺项列入待处理');
 const templates=templatesFor(registry);check(sections.length<=(plan.task==='templateInit'?2000:200),'本次记录数量超过限制');
 const candidates=[],identityIndex=new Map();for(const x of plan.identities){const key=normalized(x.label);if(!identityIndex.has(key))identityIndex.set(key,[]);identityIndex.get(key).push(x);}
 const objectNames=new Map();for(const x of plan.identities.filter(x=>x.row.table==='objects'))for(const name of [x.row.values.名称,...(x.row.values.别名??[])]){const key=normalized(name);if(!objectNames.has(key))objectNames.set(key,new Set());objectNames.get(key).add(x.id);}
 const touched=new Set(),reservedIds=new Set(plan.rows.map(r=>r.id));let serial=0;
 for(const section of sections){
  const cut=section.heading.indexOf('：');check(cut>0,'记录标题须为类别：完整名称');const form=section.heading.slice(0,cut),formMatches=templates.filter(t=>formName(registry,t.table,t.kind)===form);check(formMatches.length===1,'表格类别未提供或重名：'+form);const {table,kind}=formMatches[0],name=decodeName(section.heading.slice(cut+1).trim()),phase=plan.task==='templateInit'?(['objects','facts'].includes(table)?'base':'initial'):'archive';

  check(allowed(plan.task,table,phase,plan.objectsSeparate,registry),'任务阶段不能填写此表：'+section.heading);const template=templates.find(t=>t.table===table&&t.kind===kind);check(template,'分组类型未登记：'+section.heading);
  const label=locator(table,kind,name),matches=identityIndex.get(normalized(label))??[];check(matches.length<=1,'同名记录身份不唯一：'+label);const existing=matches[0]?.row;
  check(!existing?.referenceOnly,'薄档须补读后才能更新：'+label);check(!touched.has(normalized(label)),'同一记录重复提交：'+label);touched.add(normalized(label));
  if(table==='objects'){const collision=objectNames.get(normalized(name));check(!collision||existing&&collision.size===1&&collision.has(existing.id),'对象名称或别名冲突，须核对身份：'+name);if(!collision)objectNames.set(normalized(name),new Set(['candidate:'+candidates.length]));}
  let id=existing?.id;if(!id){do{id='new:compact-'+plan.task+'-'+(++serial);}while(reservedIds.has(id));reservedIds.add(id);}
  const candidate={phase,table,kind,name,label,template,existing,id,section};candidates.push(candidate);
  if(!matches.length)identityIndex.set(normalized(label),[{id:candidate.id,label,row:{table,values:{名称:name,...(kind?{类型:kind}:{})}}}]);
 }
 const refTemplate={id:'reference',table:'objects',label:'引用',fields:[{key:'名称',label:'名称',path:['名称'],group:'引用',definition:{type:'text'}}]},engine=createSheetEngine({version:COMPACT_FILL_FORMAT,templates:[refTemplate,...templates]},valueValid),referenceIds=[],draftToReal=new Map(),referenceByLabel=new Map();
 const publicToPrivate=new Map();for(const list of identityIndex.values())if(list.length===1){const item=list[0],display=publicLocator(registry,item.row.table,item.row.table==='objects'?item.row.values.类型:null,item.row.values.名称);publicToPrivate.set(display,item.label);for(const label of [display]){const ref=engine.create('reference');engine.edit(ref.id,'名称',label);referenceIds.push(ref.id);draftToReal.set(ref.id,item.id);referenceByLabel.set(label,item.id);}}
 const resolve=value=>{if(draftToReal.has(value))return draftToReal.get(value);check(referenceByLabel.has(value),'引用名称不存在、重名或未获授权：'+value);return referenceByLabel.get(value);};
 const needsRows=completion.补读记录.map(label=>{const matches=identityIndex.get(normalized(publicToPrivate.get(label)??''))??[];check(matches.length===1&&plan.rows.some(r=>r.id===matches[0].id),'补读对象不在当前授权身份目录：'+label);return matches[0].id;});
 const changes=[];
 for(const candidate of candidates){
  const row=engine.create(candidate.template.id),task=engine.request(row.id,{referenceIds,heading:candidate.section.heading});engine.accept(task.token,'【'+candidate.section.heading+'】\n'+fillLines(candidate.template,candidate.section.lines).join('\n'));
  const parsed=engine.values(row.id).values,meta=parsed.meta??{};check(typeof meta.evidence==='string'&&meta.evidence.trim()&&Array.isArray(plan.evidenceSources)&&plan.evidenceSources.some(source=>source.includes(meta.evidence)),'来源依据不是当前可引用正文中的连续原句：'+candidate.label);check(Array.isArray(meta.readers)&&Array.isArray(meta.knowers),'读者与知情者必须明确填写，无项填无：'+candidate.label);
  const access={readers:meta.readers.map(x=>roles.has(x)?x:resolve(x)),knowers:meta.knowers.map(resolve)},patch={};
  for(const field of candidate.template.valueFields){const value=at(parsed.values,field.path);if(value!==undefined)put(patch,field.path,mapValue(value,field.definition,resolve));}
  const unset=meta.unset??[];check(unset.every(key=>{const field=registry.tables.find(t=>t.id===candidate.table)?.fields[key];return field&&!field.required;}),'不能清除必填或未知字段');
  check(!plan.sourceUser||candidate.id!==plan.sourceUser.objectId||!unset.some(key=>['名称','类型','描述'].includes(key)),'原生用户字段由程序维护');
  check(meta.operation!=='新建'||!candidate.existing,'对象名称冲突，待处理：'+candidate.name);
  if(meta.operation==='撤销'){
   check(plan.task!=='templateInit'&&candidate.existing,'只能撤销已有存档记录');check(!Object.keys(patch).length&&!unset.length,'撤销不能同时修改字段');check(candidate.id!==plan.sourceUser?.objectId,'原生用户不能撤销');check(!candidate.existing.lockedFields?.length,'撤销涉及人工锁定字段');check(same(access,candidate.existing.access),'撤销不能改变记录权限');
   changes.push({id:candidate.id,table:candidate.table,expected:candidate.existing.rev,values:{},delete:true,access:copy(candidate.existing.access),evidence:meta.evidence,phase:candidate.phase});continue;
  }
  for(const key of candidate.existing?.lockedFields??[])check(!unset.includes(key)&&!Object.hasOwn(patch,key)&&!candidate.template.valueFields.some(f=>at(parsed.values,f.path)!==undefined&&(f.path.join('.')===key||f.path.join('.').startsWith(key+'.')||key.startsWith(f.path.join('.')+'.'))),'更新涉及人工锁定字段：'+key);
  if(!candidate.existing){patch.名称=candidate.name;if(candidate.kind)patch.类型=candidate.kind;}
  if(plan.sourceUser&&candidate.id===plan.sourceUser.objectId){check(!Object.hasOwn(patch,'描述'),'原生用户描述由程序逐字维护');if(candidate.existing?.access)check(same(access,candidate.existing.access),'原生用户权限由程序维护，不能扩大或缩小');}
  // Preserve untouched nested siblings even for callers that replace objects.
  for(const [key,value]of Object.entries(patch))if(object(value)&&object(candidate.existing?.values[key]))patch[key]=merge(candidate.existing.values[key],value);
  const values=merge(candidate.existing?.values??{},patch);for(const key of unset)delete values[key];validateRow(registry,{id:candidate.id,table:candidate.table,values,access});
  if(candidate.existing&&same(values,candidate.existing.values)&&same(access,candidate.existing.access))continue;
  changes.push({id:candidate.id,table:candidate.table,expected:candidate.existing?.rev??0,values:patch,...(unset.length?{unset}:{}),access,evidence:meta.evidence,phase:candidate.phase});
 }
 const pending=copy(completion.待处理);for(const label of completion.补读记录)pending.push('需补读记录：'+label);
 const common={...extension,pending,...(needsRows.length?{needsRows}:{}),semantic:'pending-independent-review'};
 if(plan.task==='templateInit')return {registry,...common,base:{changes:changes.filter(x=>x.phase==='base').map(({phase,...x})=>x),pending:copy(pending)},initial:{changes:changes.filter(x=>x.phase==='initial').map(({phase,...x})=>x),pending:copy(pending)},notes:copy(pending)};
 return {...common,changes:changes.map(({phase,...x})=>x)};
}
