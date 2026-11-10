import {programOwnedTable,promptFieldAllowed,creationFieldAllowed,compactCreationSchema} from './prompt-boundary.mjs';
import {Runtime} from './runtime.mjs';
import {clone,digest,fail} from './common.mjs';
import {readCreationTemplates,creationTemplateText} from './template-book.mjs';

export const CREATION_CONTRACT='tisya.matrix-creation/1';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
function check(ok,message){if(!ok)fail('MATRIX_CREATION',message);}
export function validateCreationProposal(proposal,snapshot,{mode='extend',kind='world'}={}){
 check(plain(proposal)&&typeof proposal.name==='string'&&proposal.name.trim(),'创作结果缺少名称');
 check(Array.isArray(proposal.unresolved??[])&&(proposal.unresolved??[]).every(x=>typeof x==='string'),'待补事项格式无效');
 check(!proposal.artifacts&&!proposal.phone,'请使用当前表单规范字段，不接受旧原点或独立手机状态');
 check(plain(proposal.matrix)&&Array.isArray(proposal.matrix.changes),'创作结果缺少 matrix.changes');
 check(proposal.matrix.changes.length>0&&proposal.matrix.changes.length<=2000,'创作变更必须在1至2000条之间');
 const runtime=new Runtime(snapshot.state),seen=new Set();
 for(const change of proposal.matrix.changes){
  check(plain(change)&&typeof change.tableId==='string'&&typeof change.recordId==='string'&&change.recordId.trim(),'每条变更需要规范表ID和稳定记录ID');
  check(Object.keys(change).every(k=>['tableId','recordId','values','states'].includes(k)),'创作不能填写程序元数据或未声明的变更属性');
  check(!change.states||plain(change.states)&&Object.keys(change.states).every(k=>Object.hasOwn(change.values??{},k)&&['known','unknown','unset','none','not_applicable','cleared'].includes(change.states[k])),'创作值状态必须对应实际变更字段');
  const {tableId,recordId,values}=change,key=tableId+'#'+recordId;
  check(!seen.has(key),'同一记录须合并为一项变更：'+key);seen.add(key);
  check(runtime.data.schema[tableId]&&plain(values),'表或字段不存在：'+key);
  check(!programOwnedTable(tableId,runtime.data.schema[tableId]),'创作草稿不能编造程序回执或历史快照：'+tableId);
  check(!change.remove,'创作草稿不删除已有记录；请在表单中核对删除');
  const existing=runtime.data.tables[tableId]?.[recordId];check(!existing?.metadata?.phone_projection,'创作不能覆盖程序投影行，请修改其规范原点：'+key);
  check(mode!=='extend'||!existing,'补充创作不能覆盖已有记录：'+key);
  for(const [field,value] of Object.entries(values)){
   const def=runtime.data.schema[tableId].fields.find(f=>f.key===field);
   check(def,'未知字段：'+key+'.'+field);
   check(creationFieldAllowed(def),'创作不能直接填写派生字段：'+key+'.'+field);
  }
  if(!existing)runtime.newRecord(tableId,{},recordId);
  for(const [field,value]of Object.entries(values))runtime.set([tableId,recordId,field,[]],clone(value),change.states?.[field]??'known');
 }
 // References can target a later row in the same proposed batch.
 for(const change of proposal.matrix.changes){const row=runtime.record(change.tableId,change.recordId);for(const spec of runtime.data.schema[change.tableId].fields){
  const value=row.values[spec.key],state=row.states[spec.key];check(!spec.required||spec.read_only||value!==undefined&&value!==null&&['known','derived'].includes(state),'必填字段尚未完整填写：'+change.tableId+'.'+spec.key);
  if(value===null||value===undefined||!['known','derived'].includes(state)||!['REF','CHILD_REF','REF_LIST'].includes(spec.type)||!spec.ref)continue;
  const target=spec.ref.startsWith('@')?row.values[spec.ref.slice(1)]:spec.ref;if(!runtime.data.schema[target])continue;
  for(const ref of Array.isArray(value)?value:[value])if(typeof ref==='string')check(runtime.data.tables[target]?.[ref],'引用记录不存在：'+change.tableId+'.'+spec.key+' → '+target+'#'+ref);
 }}
 const binding=proposal.matrix.binding;
 if(kind==='character'){
  check(plain(binding)&&typeof binding.entityId==='string','新人物必须明确唯一主体 entityId');
  check(runtime.data.tables.T_SYS_ENTITIES?.[binding.entityId],'人物主体未登记在 T_SYS_ENTITIES');
  if(binding.dossierId)check(runtime.data.tables.T_CHAR_DOSSIER?.[binding.dossierId],'人物档案引用不存在');
  if(runtime.data.schema.M_FIELD_REFERENCES&&runtime.data.schema.T_SYS_ENTITIES.fields.some(f=>f.key==='origin_record_ref')){const entity=runtime.data.tables.T_SYS_ENTITIES[binding.entityId].values,ref=runtime.data.tables.M_FIELD_REFERENCES?.[entity.origin_record_ref]?.values;check(ref?.owner_table==='T_SYS_ENTITIES'&&ref.owner_row_uuid===binding.entityId&&ref.owner_field==='origin_record_ref'&&ref.target_table==='T_CHAR_DOSSIER'&&ref.target_row_uuid===binding.dossierId,'人物实体必须以规范原点引用连接所选档案');}
 }
 return clone(proposal);
}

export function createMatrixCreator({database,getContext,request,ensureDatabase=async()=>{},assertIdle=()=>{},onProgress=()=>{}}){
 async function draft(goal,{kind='world',mode='extend',source=null,signal}={}){
  assertIdle();check(typeof goal==='string'&&goal.trim(),'请填写创作要求');check(['world','character'].includes(kind)&&['extend','revise'].includes(mode),'创作类型无效');
  await ensureDatabase();const snapshot=await database.read();check(snapshot,'请先打开聊天并建立表单');
  const templates=mode==='extend'?await readCreationTemplates(getContext,{task:'tableGenesis'}):null;
  const input={databaseContract:CREATION_CONTRACT,sourcePolicy:'来源快照、历史和回执由提交服务记录；模板提及归档来源表仅作定位，不输出这些程序表的变更。',kind,mode,goal,source,schema:compactCreationSchema(snapshot.state),valueStates:['known','unknown','unset','none','not_applicable','cleared'],currentRows:Object.entries(snapshot.state.tables).filter(([id])=>!programOwnedTable(id,snapshot.state.schema[id])).flatMap(([tableId,rows])=>Object.entries(rows).map(([recordId,row])=>({tableId,recordId,name:String(row.values?.name??row.values?.label??''),subject_ref:row.values?.subject_ref??null,readOnly:row.metadata?.phone_projection===true}))),template:templates?creationTemplateText(templates):'',output:{name:'名称',summary:'说明',unresolved:[],matrix:{changes:[{tableId:'已登记表ID',recordId:'稳定记录ID',values:{}}],...(kind==='character'?{binding:{entityId:'主体ID',dossierId:'档案ID'}}:{})}}};
  const raw=await request('tableGenesis',JSON.stringify(input),{signal,onProgress});
  let proposal;try{proposal=typeof raw==='string'?JSON.parse(raw):raw;}catch(cause){throw Object.assign(Error('创作返回不是严格JSON；原始返回已保留',{cause}),{rawResponse:raw});}
  try{validateCreationProposal(proposal,snapshot,{kind,mode});}catch(e){e.rawResponse=raw;throw e;}
  const current=await database.read();check(current?.contextKey===snapshot.contextKey&&current.revision===snapshot.revision,'生成期间聊天或表单已经变化；保留草稿后重新核对');
  return {format:CREATION_CONTRACT,operationId:'creation:'+crypto.randomUUID(),kind,mode,goal,proposal,schema:Object.fromEntries([...new Set(proposal.matrix.changes.map(c=>c.tableId))].map(id=>[id,clone(snapshot.state.schema[id])])),rawResponse:raw,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,...(templates?{creationTemplates:templates}:{})};
 }
 async function save(draft){
  assertIdle();check(draft?.format===CREATION_CONTRACT,'此草稿不是当前表单格式');
  const snapshot=await database.read();check(snapshot?.contextKey===draft.contextKey,'创作草稿属于另一聊天');
  if(draft.creationTemplates){const current=await readCreationTemplates(getContext,{task:'tableGenesis'});check(digest(current)===digest(draft.creationTemplates),'模板内容已经变化，请重新核对草稿');}
  const proposal=validateCreationProposal(draft.proposal,snapshot,{...draft,mode:snapshot.revision===draft.expectedRevision?draft.mode:'revise'});
  check(!(proposal.unresolved??[]).length,'草稿仍有待补事项，请填写后再保存');
  return database.commit({operationId:draft.operationId,expectedRevision:draft.expectedRevision,contextKey:draft.contextKey,changes:proposal.matrix.changes,source:{kind:'creation',name:proposal.name,goal:draft.goal,binding:proposal.matrix.binding??null,templateDigest:draft.creationTemplates?digest(draft.creationTemplates):null}});
 }
 return {draft,save};
}
