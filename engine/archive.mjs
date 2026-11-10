import {clone,digest,stableId,fail,asError} from './common.mjs';
import {Runtime} from './runtime.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges,sheetSections} from '../tables/foundation/engine.js';

// One archive consumer: semantic rows become the same reviewable workbook used
// by main cells and creation. The enclosing reply journal owns persistence.
export const ARCHIVE_ROUTES=Object.freeze({
 '引用':['T_SYS_ENTITIES'],
 '事件':['T_DYN_EVENTS'],
 '状态与流转':['T_DYN_ENTITY_STATE','T_DYN_ENTITY_GAUGES','T_DYN_TRANSFERS'],
 '认知':['T_DYN_COGNITION'],
 '新建档案':['T_CHAR_DOSSIER','T_STATIC_ITEMS_SKILLS','T_STATIC_PLACES','T_STATIC_ORGANIZATIONS','T_STATIC_WORLD_RULES','T_SYS_ENTITIES'],
 '事实与底稿':['T_STATIC_FACTS','T_STATIC_WORLD_RULES','T_DYN_EVENTS','T_CHAR_RELATION_ORIGINS'],
 '隐情':['T_CHAR_SECRETS'],
 '习惯锚点':['T_CHAR_ANCHORS'],
 '伏笔':['T_DYN_CLUES'],
 '场外与日程':['T_DYN_ACTIVITIES_LIFELINES','T_DYN_TASKS','T_DYN_TIMERS'],
 '待定':['T_SYS_CELL_REQUESTS','T_SYS_ARCHIVE_BATCHES']
});
const allowed=new Set([...Object.values(ARCHIVE_ROUTES).flat(),'T_DYN_EVENT_LINKS','T_DYN_EVENT_PARTICIPANTS','T_DYN_STAGE_SUMMARIES']);
export const ARCHIVE_PROTOCOL=`记忆归档与 cells 共用本轮已登记的极简表单、字段行号与关联名称。在 <archive format="form"> 中使用【表名／序号】及“行号 字段名：值 | Pn”；更新已有记录使用给定的完整已有标题。只填本轮正文支持的事实、认知、档案、关系、线索、已成立事务与日程；不用 JSON，不写程序回执。未知字段省略，明确需要后续核对的值填“?”，由程序保留未知状态与待补提示；不把愿望变成玩家义务。每条业务记录须有真实 Pn 依据，程序核范围并绑定原消息、修订与原文校验。来源原文即时保存，最近两条已接纳回复保持临时层，较早归档经同一事务校验后入表；停止、未选重骰与其他分支不进入当前正史。
非空归档只使用当前 format="form"。不接受旧管道语义协议，不猜测旧文本的字段归属；缺块或坏格式保留原文并明确待处理。没有新增语义记忆时输出 <archive/>。状态数值与已由 cells 精确落位的事实不在 archive 重复写。`;

const check=(ok,code,message,details)=>{if(!ok)fail(code,message,details);};
const VERSION='tisya.semantic-archive/1';
const own=(o,k)=>Object.hasOwn(o??{},k);
const fieldState=(row,key)=>({present:own(row?.values,key),value:clone(row?.values?.[key]??null),state:row?.states?.[key]??'unset'});
function evidence(text,source,{required=true}={}){
 const refs=[...String(text).matchAll(/\bP(\d+)(?:\.\.P?(\d+))?\b/gi)],ids=new Set();
 check(!required||refs.length,'ARCHIVE_EVIDENCE','归档业务记录缺少本条正文段号依据');
 for(const m of refs){const from=Number(m[1]),to=Number(m[2]??m[1]);check(from>=1&&to>=from&&to<=source.fragments.length,'ARCHIVE_EVIDENCE','归档引用的正文段号越界或倒序',{reference:m[0],paragraphs:source.fragments.length});for(let n=from;n<=to;n++)ids.add('P'+n);}
 return [...ids];
}
function matchesGuards(runtime,guards){return guards.every(guard=>{const row=runtime.rows(guard.tableId)[guard.recordId];return !!row===guard.exists&&Object.entries(guard.fields).every(([key,before])=>digest(fieldState(row,key))===digest(before));});}
function stagingView(runtime,sourceKey){
 let temp=new Runtime(runtime.data);const dependencies=new Map(),schema=[],warnings=[];
 for(const batch of runtime.data.runtime.archive_queue){
  if(batch.source_key===sourceKey)break;
  if(batch.format!==VERSION||batch.status!=='staged'||!batch.plan||!matchesGuards(temp,batch.plan.guards))continue;
  const next=new Runtime(temp.data),added=[];try{
   for(const change of batch.plan.schema??[])if(!next.data.schema[change.tableId].fields.some(f=>f.key===change.field.key)){next.declareField(change.tableId,change.field);added.push(clone(change));}
   if(batch.plan.changes.length)applyMatrixChanges(next,batch.plan.changes,{mode:'revise'});
   for(const change of batch.plan.changes)dependencies.set(change.tableId+'#'+change.recordId,batch.source_key);
   schema.push(...added);temp=next;
  }catch(error){warnings.push({code:'ARCHIVE_TEMPORARY_VIEW',source_key:batch.source_key,error:asError(error),message:'临时层关联读取失败，未授予该批关联；原文保留'});}
 }
 return {temp,dependencies,schema,warnings};
}
function preparePlan(runtime,source,sourceKey){
 check(source.archive_present===true,'ARCHIVE_MISSING','回复缺少 archive 区块；原文已保存，语义记忆待补');
 const raw=source.archive_raw??'',format=source.archive_format??'';
 check(format==='form'||!raw.trim()&&format==='','ARCHIVE_FORMAT','非空归档仅接受当前 format="form" 极简表单；旧格式保留原文待处理',{format});
 if(!raw.trim())return {changes:[],guards:[],schema:[],references:[],pending:[],paragraphs:[]};
 const {temp,dependencies,schema,warnings}=stagingView(runtime,sourceKey);
 const snapshot={state:temp.data},context=prepareMatrixSheets(snapshot,{kind:'rows',mode:'revise',task:'main',operationId:'archive:'+sourceKey}),evidenceByHeading={};
 for(const section of sheetSections(raw)){const t=context.catalog.templates.find(t=>section.heading.startsWith(t.label+'／')),owned=t&&context.schemas[t.id].fields.some(f=>f.key==='owner_row_uuid');evidenceByHeading[section.heading]=evidence(section.lines.join('\n'),source,{required:!owned});}
 const input={form:raw,evidenceByHeading,pending:[]};
 const accepted=input.form.trim()?acceptMatrixSheets(context,snapshot,{blocks:{cells:input.form,body:source.body_raw,title:source.title},parsed:source}):{proposal:{matrix:{changes:[]}}};
 const changes=accepted.proposal.matrix.changes;
 for(const change of changes)check(allowed.has(change.tableId)||change.tableId.startsWith('M_'),'ARCHIVE_TABLE','该表不属于语义记忆归档写集',{table:change.tableId});
 for(const change of changes){
  if(change.tableId==='T_DYN_TASKS'){const existing=temp.rows(change.tableId)[change.recordId]?.values??{},status=own(change.values,'status')?change.values.status:existing.status,accepted=own(change.values,'accept_evidence')?change.values.accept_evidence:existing.accept_evidence;check(status,'ARCHIVE_TASK_ACCEPTANCE','归档任务必须明确状态，不能将愿望默记为已接受');if(['接受','进行','完成'].includes(status))check(accepted,'ARCHIVE_TASK_ACCEPTANCE','已接受任务需要明确接受证据');}
  for(const [field,state]of Object.entries(change.states??{}))if(['unknown','unset'].includes(state))input.pending.push({target:context.schemas[change.tableId].label+'／'+(change.values.name??change.values.title??change.recordId)+'／'+(context.schemas[change.tableId].fields.find(f=>f.key===field)?.label??field),missing:'本轮表单明确标为未知，尚无可采用值',condition:'提供该字段的明确依据',tableId:change.tableId,recordId:change.recordId,field});
 }
 const guards=changes.map(c=>({tableId:c.tableId,recordId:c.recordId,exists:!!temp.rows(c.tableId)[c.recordId],fields:Object.fromEntries(Object.keys(c.values).map(k=>[k,fieldState(temp.rows(c.tableId)[c.recordId],k)]))}));
 const dependencyKeys=new Set();for(const change of changes){const direct=dependencies.get(change.tableId+'#'+change.recordId);if(direct)dependencyKeys.add(direct);for(const value of Object.values(change.values).flat())if(typeof value==='string')for(const [target,key]of dependencies)if(target.endsWith('#'+value))dependencyKeys.add(key);}
 if(changes.length)applyMatrixChanges(temp,changes,{mode:'revise'});
 const recordParagraphs=Object.fromEntries((accepted.bindings??[]).map(b=>[b.tableId+'#'+b.recordId,clone(input.evidenceByHeading[b.heading]??[])]));
 for(let pass=0;pass<3;pass++)for(const change of changes){const key=change.tableId+'#'+change.recordId;if(recordParagraphs[key]?.length)continue;const v=change.values,origin=changes.find(c=>c.tableId==='M_FIELD_REFERENCES'&&c.recordId===v.origin_record_ref)?.values,owner=v.owner_table&&v.owner_row_uuid?v.owner_table+'#'+v.owner_row_uuid:origin?.target_table&&origin.target_row_uuid?origin.target_table+'#'+origin.target_row_uuid:null;if(owner&&recordParagraphs[owner]?.length)recordParagraphs[key]=clone(recordParagraphs[owner]);}
 const references=[];for(const change of changes)for(const spec of temp.data.schema[change.tableId].fields){if(!['REF','ROW_REF','CHILD_REF','REF_LIST'].includes(spec.type))continue;const target=spec.ref?.startsWith('@')?change.values[spec.ref.slice(1)]:spec.ref;if(!target)continue;for(const value of [change.values[spec.key]].flat())if(typeof value==='string'&&temp.rows(target)[value])references.push({tableId:target,recordId:value,field:spec.key});}

 for(const ref of references){const dep=dependencies.get(ref.tableId+'#'+ref.recordId);if(dep)dependencyKeys.add(dep);}
 return {changes:clone(changes),guards,schema,dependencies:[...dependencyKeys],references,pending:input.pending,warnings,recordParagraphs,paragraphs:evidence(raw,source,{required:false})};
}
function batchRow(runtime,batch,source,status,error=null){
 const tid='T_SYS_ARCHIVE_BATCHES';if(!runtime.data.schema[tid])return;
 const id=stableId('archive-batch:'+batch.source_key);if(!runtime.rows(tid)[id])runtime.newRecord(tid,{},id);
 const values={source_sequence:batch.sequence,chat_ref:runtime.data.runtime.scope.session_ref??'',message_ref:source.entry_id,candidate_ref:batch.source_key,revision_ref:String(source.revision),source_hash:source.body_sha256,formal_boundary:'已接纳回复序号 <= 当前序号 - 2',temporary_boundary:'最近两条已接纳回复',review_mode:'自动隔层接纳',commit_status:status,blocked_dependencies:error?error.message:(batch.plan?.pending??[]).map(p=>p.target+'：'+p.missing+'；'+p.condition).join('\n')};
 for(const [key,value]of Object.entries(values))if(runtime.data.schema[tid].fields.some(f=>f.key===key))runtime.set([tid,id,key,[]],value);
}
export function stageArchive(runtime,sourceKey){
 const source=runtime.data.runtime.sources[sourceKey],batch=runtime.data.runtime.archive_queue.find(b=>b.source_key===sourceKey);
 batch.format=VERSION;batch.rows=clone(source.archive_rows??[]);batch.raw=source.archive_raw??'';batch.mapped=true;
 try{batch.plan=preparePlan(runtime,source,sourceKey);batch.status='staged';batchRow(runtime,batch,source,'未写入');return [...(batch.plan.warnings??[]),...(batch.plan.pending.length?[{code:'ARCHIVE_DECLARED_PENDING',message:'归档包含明确待补项；不会把缺失条件当作已成立事实',source_key:sourceKey,pending:clone(batch.plan.pending)}]:[])];}
 catch(error){batch.status='blocked';batch.error=asError(error);batchRow(runtime,batch,source,'未写入',batch.error);return [{code:error.code?.startsWith('ARCHIVE_')?error.code:'ARCHIVE_VALIDATION',message:'语义记忆未入表；原文已保存，需修正归档后重试',source_key:sourceKey,error:asError(error),raw:batch.raw}];}
}
export function formalizeArchives(runtime){
 const sequence=runtime.data.runtime.turn_order.length,formal=[],warnings=[];
 for(const key of runtime.data.runtime.archive_queue.filter(b=>b.sequence<=sequence-2&&b.status==='staged').map(b=>b.source_key)){
  let batch=runtime.data.runtime.archive_queue.find(b=>b.source_key===key),source=runtime.data.runtime.sources[key];
  if(batch.format!==VERSION){batch.status='blocked';batch.error={code:'ARCHIVE_VERSION',message:'旧归档批次不自动执行，原文保留待核对'};warnings.push({code:'ARCHIVE_VERSION',source_key:key,message:batch.error.message});continue;}
  const plan=batch.plan,request={source_key:key,source_sha256:source.reply_sha256,plan_digest:digest(plan)},result=runtime.transaction('archive:'+key,request,()=>{
   for(const dependency of plan.dependencies??[])check(runtime.data.runtime.archive_queue.some(b=>b.source_key===dependency&&b.status==='formal')&&runtime.data.runtime.receipts['archive:'+dependency],'ARCHIVE_DEPENDENCY','临时层引用的来源尚未完成正式归档',{source_key:dependency});
   for(const change of plan.schema??[]){const fields=runtime.data.schema[change.tableId].fields,old=fields.find(f=>f.key===change.field.key);if(!old)runtime.declareField(change.tableId,change.field);else check(old.type===change.field.type,'ARCHIVE_SCHEMA_CONFLICT','归档字段类型已变化');}
   for(const guard of plan.guards){const row=runtime.rows(guard.tableId)[guard.recordId];check(!!row===guard.exists,'ARCHIVE_CONFLICT','归档目标记录在临时层之后已变化',{table:guard.tableId,record:guard.recordId});for(const [key,before]of Object.entries(guard.fields))check(digest(fieldState(row,key))===digest(before),'ARCHIVE_CONFLICT','归档字段已有较新修改，保留当前值并等待复核',{table:guard.tableId,record:guard.recordId,field:key});}
   if(plan.changes.length)applyMatrixChanges(runtime,plan.changes,{mode:'revise'});
   for(const change of plan.changes){const row=runtime.record(change.tableId,change.recordId),paragraphs=plan.recordParagraphs?.[change.tableId+'#'+change.recordId]??[];row.metadata.archive_source={source_key:key,entry_id:source.entry_id,revision:source.revision,body_sha256:source.body_sha256,paragraphs:clone(paragraphs),fragment_ids:paragraphs.map(p=>stableId(key+'#'+p))};for(const field of Object.keys(change.values))row.metadata[field]={...(row.metadata[field]??{}),source_pointer:clone(row.metadata.archive_source)};
    // Source projections are filled by the host from the retained fragments,
    // never accepted as a second model-authored source of identity or hashes.
    if(change.tableId==='T_DYN_EVENTS')for(const [field,value]of Object.entries({source_entry_id:source.entry_id,source_revision:source.revision,source_hash:source.body_sha256,source_paragraphs:paragraphs.join('、')}))if(runtime.data.schema[change.tableId].fields.some(f=>f.key===field))runtime.set([change.tableId,change.recordId,field,[]],value,'derived');
   }
   for(const [i,p]of plan.pending.entries()){const tid='T_SYS_CELL_REQUESTS';if(!runtime.data.schema[tid])continue;const id=stableId('archive-pending:'+key+':'+i);runtime.newRecord(tid,{instruction:p.target,action:'未知',source_entry_ref:source.entry_id,source_revision:String(source.revision),result_status:'待填写',task_purpose:'归档',missing_reason:p.missing+'；解除条件：'+p.condition,commit_status:'未提交'},id);}
   batch=runtime.data.runtime.archive_queue.find(b=>b.source_key===key);batch.status='formal';batchRow(runtime,batch,source,'完成');runtime.data.runtime.archive.push(clone(batch));source.archive_references=clone(plan.references);return {source_key:key,changes:plan.changes.length,pending:clone(plan.pending),references:clone(plan.references)};
  });
  if(result.status==='FAILED'){batch=runtime.data.runtime.archive_queue.find(b=>b.source_key===key);batch.status='blocked';batch.error=result.error;batchRow(runtime,batch,source,'冲突',result.error);warnings.push({code:result.error.code?.startsWith('ARCHIVE_')?result.error.code:'ARCHIVE_COMMIT',message:'本批语义归档未写入，较新数据与原文保留',source_key:key,error:result.error,raw:batch.raw});}
  else formal.push(key);
 }
 return {formalized_sources:formal,warnings};
}
export function stagedArchiveReferences(runtime){
 const {temp,warnings}=stagingView(runtime,null);if(warnings.length)fail('ARCHIVE_TEMPORARY_VIEW','临时层关联读取失败；原文与正式状态保留',{warnings});const current=new Set(Object.entries(runtime.data.tables).flatMap(([tid,rows])=>Object.keys(rows).map(id=>tid+'#'+id)));
 return Object.entries(temp.data.tables).filter(([tid])=>!tid.startsWith('M_')&&!['T_CHAR_SECRETS','T_SYS_ARCHIVE_BATCHES','T_SYS_CELL_REQUESTS'].includes(tid)).flatMap(([tid,rows])=>Object.entries(rows).filter(([id])=>!current.has(tid+'#'+id)).map(([,row])=>({table:temp.data.schema[tid].label,name:row.values.name??row.values.title??row.values.short_code??row.values.instance_name})).filter(r=>r.name));
}
