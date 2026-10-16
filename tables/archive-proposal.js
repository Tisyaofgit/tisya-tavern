import {copy,object,normalized,typeFields,validateFields,sameDefinition,mapRowReferences} from './schema.js';
import {digest} from './books.js';
import {reconcileProposal,fieldMerge} from './reconcile.js';
import {prepareCommit} from './ledger.js';

export class ArchiveProposalError extends Error{constructor(code,message){super(message);this.name='ArchiveProposalError';this.code=code;}}
const requireProposal=(condition,code,message)=>{if(!condition)throw new ArchiveProposalError(code,message);};
const forbidden=new Set(['__proto__','prototype','constructor']);
function canonical(value,depth=0,state={nodes:0}){
 requireProposal(depth<=16&&++state.nodes<=6000,'INVALID_PROPOSAL','草案结构超出范围');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){requireProposal(Number.isFinite(value),'INVALID_PROPOSAL','草案数值无效');return value;}
 if(Array.isArray(value))return value.map(v=>canonical(v,depth+1,state));
 requireProposal(object(value)&&Object.getPrototypeOf(value)===Object.prototype,'INVALID_PROPOSAL','草案只能包含JSON数据');
 const out={};for(const key of Object.keys(value).sort()){requireProposal(!forbidden.has(key),'INVALID_PROPOSAL','草案字段无效');out[key]=canonical(value[key],depth+1,state);}return out;
}
const names=row=>[row?.values?.名称,...(Array.isArray(row?.values?.别名)?row.values.别名:[])].filter(x=>typeof x==='string'&&x.trim()).map(normalized);

// Full authoritative view stays inside the trusted writer. A collision receipt
// never identifies a hidden record or confirms how many matching records exist.
function checkIdentity(view,changes){
 const rows=new Map(view.rows.filter(r=>r.table==='objects').map(r=>[r.id,copy(r)])),checks=[];
 for(const op of changes){if(op.table!=='objects')continue;if(op.delete){rows.delete(op.id);continue;}const before=rows.get(op.id),oldNames=new Set(names(before));
  const after={id:op.id,values:{...before?.values,...copy(op.values)}};for(const key of op.unset??[])delete after.values[key];rows.set(op.id,after);
  checks.push({id:op.id,names:names(after).filter(name=>!before||!oldNames.has(name))});
 }
 for(const item of checks)for(const name of item.names)requireProposal(![...rows.values()].some(row=>row.id!==item.id&&names(row).includes(name)),'IDENTITY_REVIEW_REQUIRED','对象身份需要核对；本草案未接纳，不据查询结果自动新建或合并。');
}
function checkStateValues(view,changes){
 changes.forEach((op,index)=>{if(op.table!=='state'||op.delete)return;const before=view.rows.find(row=>row.id===op.id),values={...copy(before?.values??{}),...copy(op.values)};for(const key of op.unset??[])delete values[key];const count=['值','值引用','原生引用'].filter(key=>Object.hasOwn(values,key)).length;requireProposal(count===1,'INVALID_PROPOSAL','第 '+(index+1)+' 项（state）必须且只能提交 值、值引用、原生引用 之一；整批未接纳，未写入档案。');
 });
}

// Run only after every operation has host authorization and canonical fields.
// A diagnostic names submitted paths, never stored values or unrelated locks.
function checkProtectedUpdates(view,changes,basis){
 const currentTables=new Set(['scene','state','relations','cognition','holdings','tasks','timers','clues','activities','experiences','growth']);
 const order=basis.sourceOrder??{},position=key=>key!=null&&Object.hasOwn(order,key)&&Number.isSafeInteger(order[key])&&order[key]>=0?order[key]:null;
 const incoming=position(basis.key),conflicts=[];
 changes.forEach((op,index)=>{
  const before=view.rows.find(row=>row.id===op.id);if(!before)return;
  const paths=[...(op.delete?(before.lockedFields??[]).map(key=>({key,path:'delete.'+key})):[]),...Object.keys(op.values).map(key=>({key,path:'values.'+key})),...(op.unset??[]).map(key=>({key,path:'unset.'+key}))];
  const previous=position(before.source),reasons=[];
  if(currentTables.has(op.table)&&previous!==null&&incoming!==null&&previous>incoming)reasons.push('当前记录来自更晚楼层；旧来源不能覆盖');
  const locked=paths.filter(({key})=>before.lockedFields?.includes(key)).map(({path})=>path);
  if(locked.length)reasons.push('提交字段 '+locked.join('、')+' 被人工锁定');
  if(reasons.length)conflicts.push('第 '+(index+1)+' 项：'+reasons.join('；'));
 });
 requireProposal(!conflicts.length,'INVALID_PROPOSAL',conflicts.join('。')+'。整批未接纳，未写入档案；保留现有记录，将仍无法忠实表达的必要修改及来源冲突写入最终notes，不静默删项。');
}

// Only declared references receive durable ID mapping. Reject exact batch IDs
// left in ordinary values so open JSON/text cannot silently retain broken links.
function checkUnboundTemporaryReferences(registry,rows,operations){
 const temporary=new Set(operations.filter(op=>op.id.startsWith('new:')).map(op=>op.id));
 operations.forEach((op,index)=>{
  const values=copy(op.values);if(op.table==='objects'&&!Object.hasOwn(values,'类型'))values.类型=rows.find(row=>row.id===op.id)?.values.类型;
  const probe=mapRowReferences({table:op.table,values},registry,()=>null);
  function visit(value,path){
   requireProposal(typeof value!=='string'||!temporary.has(value),'INVALID_PROPOSAL','第 '+(index+1)+' 项字段路径 '+path+' 在非引用字段中使用临时编号；请改为有依据的文字，或显式声明兼容ref/refs字段。整批未接纳，未写入档案。');
   if(Array.isArray(value))value.forEach((v,i)=>visit(v,path+'['+i+']'));
   else if(object(value))for(const [key,v]of Object.entries(value))visit(v,path+'.'+key);
  }
  visit(probe.values,'values');
 });
}

function registered(items,value){return items.find(item=>[item.id,item.name,...(item.aliases??[])].some(name=>normalized(name)===normalized(value)));}
function registeredField(fields,value){for(const [name,definition]of Object.entries(fields))if([name,...(definition.aliases??[])].some(alias=>normalized(alias)===normalized(value)))return {name,definition};return null;}
function schemaDiagnostic(index,path,label='字段'){
 throw new ArchiveProposalError('INVALID_PROPOSAL','第 '+(index+1)+' 项'+label+'路径 '+path+' 未登记；请复用既有字段，或在本批显式提交有依据的结构扩展。整批未接纳，未写入档案。');
}
function normalizeField(value,definition,index,path){
 if(definition.type==='json')return copy(value);
 if(definition.type==='array')return Array.isArray(value)?value.map((item,i)=>normalizeField(item,definition.items,index,path+'['+i+']')):copy(value);
 if(definition.type==='map')return object(value)?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalizeField(item,definition.items,index,path+'.'+key)])):copy(value);
 if(definition.type!=='object'||!object(value)||!definition.fields)return copy(value);
 const out={};for(const [key,item]of Object.entries(value)){const field=registeredField(definition.fields,key);if(!field){if(definition.additionalProperties===true){out[key]=copy(item);continue;}schemaDiagnostic(index,path+'.'+key);}requireProposal(!Object.hasOwn(out,field.name),'INVALID_PROPOSAL','第 '+(index+1)+' 项字段路径 '+path+'.'+key+' 重复；整批未接纳，未写入档案。');out[field.name]=normalizeField(item,field.definition,index,path+'.'+key);}return out;
}
// Resolve values against the bound registry plus explicitly authorized deltas.
// It resolves registered spellings and inherited attributes, while preserving
// open objects and JSON payloads. Diagnostics contain only the submitted item
// number/path; they never echo existing rows or values.
function reviewArchiveSchema(registry,rows,operations){
 operations.forEach((operation,index)=>{
  const table=registered(registry.tables,operation.table);if(!table)schemaDiagnostic(index,'table','表');
  requireProposal(object(operation.values),'INVALID_PROPOSAL','第 '+(index+1)+' 项字段路径 values 必须是对象；整批未接纳，未写入档案。');
  let attributes,attributePath;const values={},seen=new Set();
  for(const [key,value]of Object.entries(operation.values)){const field=registeredField(table.fields,key);if(!field)schemaDiagnostic(index,'values.'+key);requireProposal(!seen.has(field.name),'INVALID_PROPOSAL','第 '+(index+1)+' 项字段路径 values.'+key+' 重复；整批未接纳，未写入档案。');seen.add(field.name);if(table.id==='objects'&&field.name==='属性'){attributes=value;attributePath='values.'+key;}else values[field.name]=normalizeField(value,field.definition,index,'values.'+key);}
  if(operation.unset){operation.unset=operation.unset.map(key=>{const field=registeredField(table.fields,key);if(!field)schemaDiagnostic(index,'unset.'+key);return field.name;});}
  operation.table=table.id;operation.values=values;if(table.id!=='objects'||attributes===undefined&&!Object.hasOwn(values,'类型'))return;
  const typePath=Object.keys(operation.values).find(key=>registeredField(table.fields,key)?.name==='类型')??'类型',before=rows.find(row=>row.id===operation.id),type=registered(registry.types,values.类型??before?.values?.类型??'');if(!type)schemaDiagnostic(index,'values.'+typePath,'类型');
  if(attributes!==undefined){if(object(attributes)){const fields=typeFields(registry,type.id),out={};for(const [key,value]of Object.entries(attributes)){const field=registeredField(fields,key);if(!field)schemaDiagnostic(index,(attributePath??'values.属性')+'.'+key,'对象属性');requireProposal(!Object.hasOwn(out,field.name),'INVALID_PROPOSAL','第 '+(index+1)+' 项字段路径 '+(attributePath??'values.属性')+'.'+key+' 重复；整批未接纳，未写入档案。');out[field.name]=normalizeField(value,field.definition,index,(attributePath??'values.属性')+'.'+key);}operation.values.属性=out;}else operation.values.属性=copy(attributes);}
 });
}

// These options apply identically at draft, preview and durable commit time.
export const ARCHIVE_SCHEMA_OPTIONS=Object.freeze({allowSchemaExtensions:true,inferSchemaFields:false});
function structureDeclarations(value,registry){
 const templates=value.templates??[],schemaChanges=value.schemaChanges??[];
 requireProposal(Array.isArray(templates)&&templates.length<=20&&Array.isArray(schemaChanges)&&schemaChanges.length<=20,'INVALID_PROPOSAL','结构提案须为数组，每类最多20项');
 const declarations=[...templates.map(item=>({kind:'type',definition:item,template:true})),...schemaChanges.map(item=>({...item,template:false}))];
 return declarations.map(item=>{
  requireProposal(object(item)&&['table','type'].includes(item.kind)&&((object(item.definition)&&item.id===undefined&&item.fields===undefined)||(typeof item.id==='string'&&object(item.fields)&&item.definition===undefined)),'INVALID_PROPOSAL','结构提案须明确新增定义或已有目标字段');
  const evidence=item.template?item.definition.evidence:item.evidence,definition=item.definition?copy(item.definition):undefined;
  if(definition)delete definition.evidence;
  const id=definition?.id??registered(registry[item.kind==='table'?'tables':'types'],item.id)?.id??item.id;
  const change=definition?{kind:item.kind,definition}:{kind:item.kind,id,fields:copy(item.fields)};
  return {change,id,evidence,template:item.template};
 });
}
function validateInheritedDefinitions(registry){
 for(const type of registry.types){
  const inherited=type.parent?typeFields(registry,type.parent):{};
  for(const [key,definition]of Object.entries(type.fields)){
   const parent=registeredField(inherited,key);
   if(parent){requireProposal(parent.name===key,'INVALID_PROPOSAL','子类型字段与父类型别名冲突');const merged=fieldMerge(parent.definition,definition,type.id+'.'+key);requireProposal(sameDefinition({...merged,aliases:definition.aliases??[]},{...definition,aliases:definition.aliases??[]}),'INVALID_PROPOSAL','子类型不能删除或收窄继承字段');}
  }
  validateFields(typeFields(registry,type.id));
 }
}

// No write callback is accepted here. Only a separate trusted service may
// apply an inspected draft after rechecking its canonical source and versions.
export function createArchiveProposalSession({view,context,source,allowedTables,authorizeChange,authorizeSchemaChange,guard,recorded=[],limits={}}){
 requireProposal(view&&Array.isArray(view.rows)&&object(view.registry)&&object(context)&&typeof context.world==='string'&&typeof context.branch==='string'&&context.task==='tableArchive'&&typeof source?.key==='string'&&typeof source.evidence==='string'&&source.evidence.trim()&&Array.isArray(allowedTables)&&typeof authorizeChange==='function'&&typeof guard==='function','AUTHORIZATION_REQUIRED','归档草案缺少宿主来源与任务授权');
 const budget={maxDrafts:8,maxCalls:24,maxChanges:50,maxChars:32768,ttlMs:300000,...limits};
 requireProposal(Object.values(budget).every(x=>Number.isSafeInteger(x)&&x>0)&&budget.maxDrafts<=24&&budget.maxCalls<=100&&budget.maxChanges<=200&&budget.maxChars<=262144&&budget.ttlMs<=900000,'INVALID_BUDGET','归档草案预算无效');
 const bound=copy(context),basis=copy(source),raw=copy(view),tables=copy(allowedTables),receipts=copy(recorded),drafts=new Map(),pending=new Map(),started=Date.now();let closed=false,calls=0;
 async function assertFresh(){requireProposal(!closed&&Date.now()-started<=budget.ttlMs,'SNAPSHOT_EXPIRED','归档草案会话已过期');await guard();requireProposal(!closed&&Date.now()-started<=budget.ttlMs,'SNAPSHOT_EXPIRED','归档草案会话已过期');}
 function getDraft(requestId){const draft=drafts.get(requestId);requireProposal(draft&&!closed,'DRAFT_NOT_FOUND','归档草案不存在');return copy(draft);}
 async function propose_archive_change(input){
  const value=canonical(input),encoded=JSON.stringify(value);
  await assertFresh();requireProposal(++calls<=budget.maxCalls,'BUDGET_EXCEEDED','归档草案调用预算已用尽');
  requireProposal(encoded.length<=budget.maxChars&&object(value)&&Object.keys(value).every(k=>['requestId','changes','templates','schemaChanges'].includes(k))&&typeof value.requestId==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(value.requestId)&&Array.isArray(value.changes)&&value.changes.length>0&&value.changes.length<=budget.maxChanges,'INVALID_PROPOSAL','草案须提供请求编号与完整changes批次');
  const fingerprint=await digest(encoded);await assertFresh();
  const previous=drafts.get(value.requestId),inflight=pending.get(value.requestId);
  if(previous||inflight){requireProposal((previous??inflight).fingerprint===fingerprint,'REQUEST_CONFLICT','相同草案请求编号的内容发生变化');if(inflight)await inflight.promise;await assertFresh();return receipt(getDraft(value.requestId));}
  requireProposal(drafts.size+pending.size<budget.maxDrafts,'BUDGET_EXCEEDED','本轮草案数量已达上限');
  const promise=(async()=>{
   const saved=receipts.find(r=>r.requestId===value.requestId);
   if(saved){requireProposal(saved.fingerprint===fingerprint&&saved.source===basis.key&&saved.task===bound.task,'REQUEST_CONFLICT','相同草案请求编号的内容或来源发生变化');const draft={format:'tisya.archive-proposal/1',id:crypto.randomUUID(),requestId:value.requestId,fingerprint,hash:saved.hash,context:copy(bound),source:{key:basis.key,floor:basis.floor??null},proposal:null,recorded:true,changes:saved.changes};await assertFresh();drafts.set(value.requestId,draft);return draft;}
   const declarations=structureDeclarations(value,raw.registry);
   const schemaAuthorizations=declarations.map(({change})=>typeof authorizeSchemaChange==='function'?authorizeSchemaChange(copy(change),copy(bound)):false);
   requireProposal(schemaAuthorizations.every(allowed=>typeof allowed==='boolean'),'AUTHORIZATION_REQUIRED','结构写入授权必须返回明确布尔值');
   requireProposal(schemaAuthorizations.every(Boolean),'NOT_AVAILABLE','结构目标不可用或未获本任务授权');
   const newTables=declarations.filter(({change})=>change.kind==='table'&&change.definition&&!raw.registry.tables.some(t=>t.id===change.definition.id)).map(({id})=>id);
   const prepared=value.changes.map(change=>{
    requireProposal(object(change)&&Object.keys(change).every(k=>['intent','id','table','expected','values','access','evidence','unset'].includes(k))&&['create','update','delete'].includes(change.intent)&&typeof change.id==='string'&&typeof change.table==='string'&&Number.isSafeInteger(change.expected)&&change.expected>=0,'INVALID_PROPOSAL','草案操作缺少明确意图、身份或预期修订');
    const before=raw.rows.find(row=>row.id===change.id),create=change.intent==='create';
    requireProposal(create?change.id.startsWith('new:')&&change.id.length>4&&change.expected===0&&!before:!change.id.startsWith('new:')&&!!before,'NOT_AVAILABLE','草案目标不可用或未获本任务授权');
    return {change,before};
   });
   const authorizations=prepared.map(({change,before})=>{const authorized=copy(change),table=registered(raw.registry.tables,authorized.table);if(table)authorized.table=table.id;return authorizeChange(authorized,before?copy(before):null,copy(bound),{newTables:copy(newTables)});});
   requireProposal(authorizations.every(allowed=>typeof allowed==='boolean'),'AUTHORIZATION_REQUIRED','草案写入授权必须返回明确布尔值');requireProposal(authorizations.every(Boolean),'NOT_AVAILABLE','草案目标不可用或未获本任务授权');
   const operations=prepared.map(({change,before})=>{if(before)requireProposal(before.rev===change.expected,'REVISION_CONFLICT','草案目标修订已改变，请重新读取');const {intent,...operation}=change;if(intent==='delete')operation.delete=true;return operation;});
   const invalidEvidence=operations.flatMap((change,index)=>typeof change.evidence==='string'&&change.evidence.trim()&&basis.evidence.includes(change.evidence)?[]:[index+1]);
   requireProposal(!invalidEvidence.length,'INVALID_PROPOSAL','第 '+invalidEvidence.join('、')+' 项 evidence 不是本轮来源中的连续原文；请直接复制原文，不拼接段落或自行加入省略号。整批未接纳，未写入档案。');
   const invalidStructureEvidence=declarations.flatMap((d,i)=>typeof d.evidence==='string'&&d.evidence.trim()&&basis.evidence.includes(d.evidence)?[]:[i+1]);
   requireProposal(!invalidStructureEvidence.length,'INVALID_PROPOSAL','第 '+invalidStructureEvidence.join('、')+' 项结构依据不是本轮来源中的连续原文；整批未接纳，未写入档案。');
   let proposal;
   try{
    const templates=declarations.filter(d=>d.template).map(d=>d.change.definition),schemaChanges=declarations.filter(d=>!d.template).map(d=>d.change);
    const schema=reconcileProposal(raw.registry,{templates,schemaChanges,changes:[]},ARCHIVE_SCHEMA_OPTIONS).registry;validateInheritedDefinitions(schema);
    reviewArchiveSchema(schema,raw.rows,operations);
    proposal={templates,schemaChanges,changes:operations,schemaEvidence:declarations.map(({change,id,evidence})=>({kind:change.kind,id,evidence}))};
    const reconciled=reconcileProposal(raw.registry,{...proposal,currentRows:raw.rows},ARCHIVE_SCHEMA_OPTIONS);proposal.changes=reconciled.proposal.changes;
    checkIdentity(raw,proposal.changes);checkStateValues(raw,proposal.changes);checkUnboundTemporaryReferences(reconciled.registry,raw.rows,proposal.changes);checkProtectedUpdates(raw,proposal.changes,basis);
    prepareCommit(raw,proposal,{source:basis.key,kind:'archive',evidence:basis.evidence,worldTime:basis.worldTime??null,allowedTables:tables,sourceOrder:basis.sourceOrder??{},...ARCHIVE_SCHEMA_OPTIONS});
   }
   catch(error){if(error instanceof ArchiveProposalError)throw error;throw new ArchiveProposalError('INVALID_PROPOSAL','归档草案未通过字段、证据、引用或批次校验；未写入档案。');}
   await assertFresh();const hash=await digest(JSON.stringify(canonical({world:bound.world,branch:bound.branch,task:bound.task,source:basis.key,proposal})));await assertFresh();
   const draft={format:'tisya.archive-proposal/1',id:crypto.randomUUID(),requestId:value.requestId,fingerprint,hash,context:copy(bound),source:{key:basis.key,floor:basis.floor??null},proposal};drafts.set(value.requestId,draft);return draft;
  })();pending.set(value.requestId,{fingerprint,promise});
  try{return receipt(await promise);}finally{pending.delete(value.requestId);}
 }
 function receipt(draft){return {status:'ok',state:draft.recorded?'recorded':'draft',requestId:draft.requestId,draftId:draft.id,changes:draft.proposal?.changes.length??draft.changes,source:copy(draft.source),written:false};}
 return {propose_archive_change,assertFresh,getDraft,dispose(){closed=true;drafts.clear();},context:copy(bound)};
}

export function archiveProposalToolDefinition(){
 const strings={type:'array',items:{type:'string'}};
 const operation={type:'object',additionalProperties:false,required:['intent','id','table','expected','values','access','evidence'],properties:{
  intent:{type:'string',enum:['create','update','delete']},id:{type:'string'},table:{type:'string'},expected:{type:'integer',minimum:0},values:{type:'object'},
  access:{type:'object',additionalProperties:false,required:['readers','knowers'],properties:{readers:copy(strings),knowers:copy(strings)}},evidence:{type:'string',description:'从本轮来源直接复制一段连续原文，保留原标点和段号；不要用省略号拼接非连续片段。'},unset:copy(strings)
 }};
 return {method:'propose_archive_change',name:'tisya_propose_archive_change',description:'将当前宿主绑定来源支持的新增、修改或删除提交为归档草案；不写入事实。合法结构扩展随templates/schemaChanges提交，每项附连续原文evidence；未知拼写不自动扩展。零查询结果不是新建依据。同一请求重试保持requestId及完整内容。',parameters:{type:'object',additionalProperties:false,required:['requestId','changes'],properties:{requestId:{type:'string',pattern:'^[A-Za-z0-9_.:-]{1,80}$'},changes:{type:'array',minItems:1,maxItems:50,items:operation},templates:{type:'array',maxItems:20,items:{type:'object',required:['id','name','aliases','version','parent','fields','evidence'],properties:{id:{type:'string'},name:{type:'string'},aliases:copy(strings),version:{type:'integer'},parent:{type:'string'},fields:{type:'object'},evidence:{type:'string'}}}},schemaChanges:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:['kind','evidence'],properties:{kind:{type:'string',enum:['table','type']},id:{type:'string'},fields:{type:'object'},definition:{type:'object'},evidence:{type:'string'}}}}}}};
}
