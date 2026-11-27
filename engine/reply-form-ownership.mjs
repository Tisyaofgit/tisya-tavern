import {fail,digest} from './common.mjs';
import {programOwnedTable} from './prompt-boundary.mjs';

// Only new reply forms use this partition. Stored rows, legacy delta operations
// and already prepared archive plans keep their original lifecycle and data.
// Preserve each saved reply's decoder when the journal replays an earlier
// branch: v2 adds common units; v3 accepts plain narrative time text; v4 continues unique named scenes; v5 uses event codes and directed pairs; v6 decodes evidence lists and named active holdings; v7 resolves sparse updates to ongoing narrative states.
export const REPLY_FORM_OWNERSHIP_VERSION='tisya.reply-form-ownership/8';
export const PRE_PROPOSAL_REPLY_FORM_VERSION='tisya.reply-form-ownership/7';
const PRE_STATE_PATCH_VERSION='tisya.reply-form-ownership/6';
export const PRE_EVIDENCE_LIST_REPLY_FORM_VERSION='tisya.reply-form-ownership/5';
export const PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION='tisya.reply-form-ownership/4';
export const PRE_SCENE_REUSE_REPLY_FORM_VERSION='tisya.reply-form-ownership/3';
export const PRE_TIME_TEXT_REPLY_FORM_VERSION='tisya.reply-form-ownership/2';
export const PRE_UNIT_REPLY_FORM_VERSION='tisya.reply-form-ownership/1';
export const LEGACY_REPLY_FORM_OWNERSHIP_VERSION='tisya.reply-form-ownership/legacy';
export const ARCHIVE_ROUTES=Object.freeze({
 '事件与参与':Object.freeze(['T_DYN_EVENTS','T_DYN_EVENT_LINKS','T_DYN_EVENT_PARTICIPANTS','T_DYN_STAGE_SUMMARIES']),
 '事实与认知':Object.freeze(['T_STATIC_FACTS','T_DYN_COGNITION','T_CHAR_SECRETS']),
 '回忆与关系来历':Object.freeze(['T_CHAR_ANCHORS','T_CHAR_RELATION_ORIGINS']),
 '线索':Object.freeze(['T_DYN_CLUES'])
});
export const ARCHIVE_TABLE_IDS=Object.freeze([...new Set(Object.values(ARCHIVE_ROUTES).flat())]);
// These were available from the former shared archive catalog even in an
// empty world. Retain their creation surfaces at their immediate entry point.
export const CELLS_BOOTSTRAP_TABLE_IDS=Object.freeze([
 'M_UNITS','M_UNIT_RATIOS','T_SYS_ENTITIES','T_CHAR_DOSSIER','T_STATIC_ITEMS_SKILLS','T_STATIC_PLACES','T_STATIC_ORGANIZATIONS','T_STATIC_WORLD_RULES',
 'T_DYN_ENTITY_STATE','T_DYN_ENTITY_GAUGES','T_DYN_TRANSFERS','T_DYN_ACTIVITIES_LIFELINES','T_DYN_TASKS','T_DYN_TIMERS'
]);
const memoryTables=new Set(ARCHIVE_TABLE_IDS);
export const PROPOSAL_TABLE_IDS=Object.freeze(['T_PROP_PREFERENCES','T_PROP_TAGS','T_PROP_COORDINATES','T_PROP_CORPORA','T_PROP_TECHNIQUES','T_PROP_CHAINS']);
const proposalTables=new Set(PROPOSAL_TABLE_IDS);
// Historical source replay is authorized by its saved journal provenance, not
// by the text of a new model reply. Preserve the previous archive decoder for
// that path; it is never offered as a choice in the current prompt.
const legacyArchiveTables=new Set([...ARCHIVE_TABLE_IDS,...CELLS_BOOTSTRAP_TABLE_IDS,'T_SYS_CELL_REQUESTS','T_SYS_ARCHIVE_BATCHES']);
export function assertReplyFormVersion(version){
 if(![REPLY_FORM_OWNERSHIP_VERSION,PRE_PROPOSAL_REPLY_FORM_VERSION,PRE_STATE_PATCH_VERSION,PRE_EVIDENCE_LIST_REPLY_FORM_VERSION,PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION,PRE_SCENE_REUSE_REPLY_FORM_VERSION,PRE_TIME_TEXT_REPLY_FORM_VERSION,PRE_UNIT_REPLY_FORM_VERSION,LEGACY_REPLY_FORM_OWNERSHIP_VERSION].includes(version))fail('REPLY_FORM_VERSION','回复表单协议版本未知，原文保留待核',{version});
 return version;
}
export function replyFormDecoding(version){
 assertReplyFormVersion(version);
 return {commonUnits:[REPLY_FORM_OWNERSHIP_VERSION,PRE_PROPOSAL_REPLY_FORM_VERSION,PRE_STATE_PATCH_VERSION,PRE_EVIDENCE_LIST_REPLY_FORM_VERSION,PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION,PRE_SCENE_REUSE_REPLY_FORM_VERSION,PRE_TIME_TEXT_REPLY_FORM_VERSION].includes(version),plainTimeText:[REPLY_FORM_OWNERSHIP_VERSION,PRE_PROPOSAL_REPLY_FORM_VERSION,PRE_STATE_PATCH_VERSION,PRE_EVIDENCE_LIST_REPLY_FORM_VERSION,PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION,PRE_SCENE_REUSE_REPLY_FORM_VERSION].includes(version),sceneNameReuse:[REPLY_FORM_OWNERSHIP_VERSION,PRE_PROPOSAL_REPLY_FORM_VERSION,PRE_STATE_PATCH_VERSION,PRE_EVIDENCE_LIST_REPLY_FORM_VERSION,PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION].includes(version),narrativeIdentity:[REPLY_FORM_OWNERSHIP_VERSION,PRE_PROPOSAL_REPLY_FORM_VERSION,PRE_STATE_PATCH_VERSION,PRE_EVIDENCE_LIST_REPLY_FORM_VERSION].includes(version),multipleEvidence:[REPLY_FORM_OWNERSHIP_VERSION,PRE_PROPOSAL_REPLY_FORM_VERSION,PRE_STATE_PATCH_VERSION].includes(version),namedHoldingReuse:[REPLY_FORM_OWNERSHIP_VERSION,PRE_PROPOSAL_REPLY_FORM_VERSION,PRE_STATE_PATCH_VERSION].includes(version),stateNamePatches:[REPLY_FORM_OWNERSHIP_VERSION,PRE_PROPOSAL_REPLY_FORM_VERSION].includes(version)};
}

export const CELLS_PROTOCOL='<cells format="form"> 填当前状态、本轮业务变化及新人物档案。状态字段行末可加 | Pn 标明正文依据。任务保留接受证据。无变化写 <cells/>。';
export const ARCHIVE_PROTOCOL=[
 '<archive format="form"> 填本轮需保留的经过、事实、认知、关系来历和线索。猜测归所属人物认知；关联可填本轮新建名称。事件实际结束时填事件生命周期=已结束；后续纠正新增同主体认知并关联被修正记录，阶段和召回编号不手填。',
 '每条业务记录（每个新增或修订分组）至少在一条承载该记录依据的字段行末填写 | Pn。例如 19{旅人把信交给船夫} | P3。跨段填 | P3..P5，分散在数段填 | P3、P7。',
 '段号取自本轮最终 <body>。父记录同批填写时，所属明细可沿用父记录的证据；单独修订明细时，在明细字段行附正文段号。',
 '输出前逐组核对段号存在且原文支持记录内容。缺少正文依据的记录留待后续补证；本轮无新增或修订的归档记录时写 <archive/>。'
].join('\n');
export const PROPOSALS_PROTOCOL=[
 '<proposals format="form"> 在同一条主回复中填偏好、标签、坐标组、语料、技法和执行链的新增／修订／停用提案。只填简表，不写JSON、数据库路径或内部操作。',
 '提案只是待确认候选，不是已发生事实，也不会直接生效。从本轮正文和用户明确反馈提炼；没有值得提出的变化写 <proposals/>。',
 '新增时修订目标留空；修订或停用填写已有资源ID或唯一名称。执行链每阶段一行，使用页面给出的六个文字位置，不填结构标记。'
].join('\n');
export const REPLY_FORM_PROTOCOL=CELLS_PROTOCOL+'\n'+ARCHIVE_PROTOCOL+'\n'+PROPOSALS_PROTOCOL+'\n每个信息点只填一处；归档不复抄当前状态，提案不复抄 cells／archive。';

const ownedSchema=schema=>schema?.fields?.some(f=>f.key==='owner_row_uuid')&&schema.fields.some(f=>f.key==='owner_table'||f.key==='owner_form');
export function replyFormOwner(state,tableId){
 if(!state?.schema?.[tableId])return null;
 if(ownedSchema(state.schema[tableId]))return 'owned';
 if(proposalTables.has(tableId))return 'proposals';
 return memoryTables.has(tableId)?'archive':'cells';
}

// Select writable roots without treating a reference to the other group as an
// authorization to edit it. Only owned detail schemas follow their parent.
export function replyFormTableIds(state,block,tableIds=Object.keys(state.schema??{})){
 if(!['cells','archive','proposals'].includes(block))fail('REPLY_FORM_BLOCK','未知表单入口',{block});
 const selected=new Set(tableIds.filter(id=>replyFormOwner(state,id)===block));
 for(const id of selected)for(const field of state.schema[id]?.fields??[])if(replyFormOwner(state,field.ref)==='owned')selected.add(field.ref);
 return [...selected];
}

function assertTaskAcceptance(state,changes,block,legacy=false){
 for(const change of changes)if(change.tableId==='T_DYN_TASKS'){
  const task={...(state.tables?.[change.tableId]?.[change.recordId]?.values??{}),...(change.values??{})},code=legacy?'ARCHIVE_TASK_ACCEPTANCE':'REPLY_TASK_ACCEPTANCE';
  if(!task.status)fail(code,'任务必须明确状态，不能将愿望默记为已接受',{block,table:change.tableId,record:change.recordId});
  if(['接受','进行','完成'].includes(task.status)&&!task.accept_evidence)fail(code,'已接受任务需要明确接受证据；可沿用该记录已有的接受证据',{block,table:change.tableId,record:change.recordId});
 }
}
export function assertReplyFormOwnership(state,changes,block,{version=REPLY_FORM_OWNERSHIP_VERSION,generatedIdentities=[]}={}){
 if(!['cells','archive','proposals'].includes(block))fail('REPLY_FORM_BLOCK','未知表单入口',{block});
 assertReplyFormVersion(version);
 if(block==='proposals'&&version!==REPLY_FORM_OWNERSHIP_VERSION)fail('REPLY_FORM_VERSION','旧回复没有主 API 提案写集，不能补写提案',{block,version});
 if(version===LEGACY_REPLY_FORM_OWNERSHIP_VERSION){
  if(block==='archive'){
   for(const change of changes)if(!legacyArchiveTables.has(change.tableId)&&!change.tableId.startsWith('M_'))fail('ARCHIVE_TABLE','该表不属于已存旧版来源的语义记忆归档写集',{table:change.tableId});
   assertTaskAcceptance(state,changes,block,true);
  }
  return changes;
 }
 // Only parser-created minimum identity objects may accompany an archive
 // reference. Authored cross-group records never receive this exemption.
 const generated=new Set(generatedIdentities);
 const pending=new Map();
 for(const change of changes){const key=change.tableId+'#'+change.recordId;pending.set(key,{...(pending.get(key)??{}),...(change.values??{})});}
 const values=(tableId,recordId)=>{
  const stored=state.tables?.[tableId]?.[recordId],change=pending.get(tableId+'#'+recordId);
  return stored||change?{...(stored?.values??{}),...(change??{})}:null;
 };
 const resolve=(tableId,recordId,trail=new Set())=>{
  const owner=replyFormOwner(state,tableId),key=tableId+'#'+recordId;
  if(!owner)fail('REPLY_FORM_OWNER','表单所属表尚未登记',{block,table:tableId,record:recordId});
  if(programOwnedTable(tableId,state.schema[tableId]))fail('REPLY_FORM_OWNER','所属业务父记录由程序管理，不能通过明细改写其内容或读取规则',{block,table:tableId,record:recordId});
  if(owner!=='owned')return {block:owner,table:tableId,record:recordId};
  if(trail.has(key))fail('REPLY_FORM_OWNER','所属明细形成循环，不能确定业务父记录',{block,table:tableId,record:recordId});
  const row=values(tableId,recordId),parentTable=row?.owner_table??row?.owner_form,parentId=row?.owner_row_uuid;
  if(!parentTable||!parentId||!values(parentTable,parentId))fail('REPLY_FORM_OWNER','所属明细缺少已存在或同批创建的业务父记录',{block,table:tableId,record:recordId,parentTable,parentId});
  const next=new Set(trail);next.add(key);return resolve(parentTable,parentId,next);
 };
 for(const change of changes){
  const prior=state.tables?.[change.tableId]?.[change.recordId];
  if(prior&&replyFormOwner(state,change.tableId)==='owned')for(const key of ['owner_table','owner_form','owner_row_uuid','owner_field'])if(Object.hasOwn(change.values??{},key)&&digest(change.values[key]??null)!==digest(prior.values?.[key]??null))fail('REPLY_FORM_OWNER','已有所属明细不能改挂业务父记录或字段',{block,table:change.tableId,record:change.recordId,field:key});
  if(generated.has(change)){
   if(!prior)continue;
   // A newly discovered dossier may complete the origin link of an already
   // registered subject. This parser-owned operation cannot overwrite facts.
   const v=change.values??{},link=values('M_FIELD_REFERENCES',v.origin_record_ref),dossier=link?.target_table==='T_CHAR_DOSSIER'&&values('T_CHAR_DOSSIER',link.target_row_uuid);
   if(change.tableId==='T_SYS_ENTITIES'&&!prior.values.origin_record_ref&&['unclassified','character'].includes(prior.values.kind)&&Object.keys(v).every(k=>['kind','origin_record_ref'].includes(k))&&v.kind==='character'&&link?.owner_table==='T_SYS_ENTITIES'&&link.owner_row_uuid===change.recordId&&link.owner_field==='origin_record_ref'&&dossier?.name===(prior.values.name??prior.values.instance_name))continue;
  }
  const target=resolve(change.tableId,change.recordId);
  if(target.block!==block)fail('REPLY_FORM_OWNERSHIP','该记录应由 <'+target.block+' format="form"> 填写，不能写入 <'+block+'>；本块不写入任何业务记录',{block,expected:target.block,table:change.tableId,record:change.recordId,owner_table:target.table,owner_record:target.record});
 }
 // Tasks remain current business records. Moving their entry point must not
 // lose the former archive acceptance check or demand copied evidence again.
 assertTaskAcceptance(state,changes,block);
 return changes;
}
