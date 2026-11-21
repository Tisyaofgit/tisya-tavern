import {clone,stable,stableId} from './common.mjs';

const HISTORY_TABLES=new Set(['T_SYS_CHANGE_LOG','M_TYPED_VALUES','X_RECORD_META']);
const own=(object,key)=>Object.hasOwn(object??{},key);
const row=(values,states={})=>({values,states:Object.fromEntries(Object.keys(values).map(key=>[key,states[key]??'known'])),formulas:{},metadata:{}});

export function extendFieldHistorySchema(state){
 const field=state?.schema?.M_TYPED_VALUES?.fields?.find(item=>item.key==='value_state');if(!field)return state;
 for(const value of ['derived','error']){
  if(!field.enum?.includes(value))field.enum=[...(field.enum??[]),value];
  if(field.wire_enum&&!field.wire_enum.includes(value))field.wire_enum=[...field.wire_enum,value];
 }
 return state;
}

export function extendFieldHistoryCatalog(catalog){
 const copy=clone(catalog);
 extendFieldHistorySchema({schema:Object.fromEntries(copy.tables.map(table=>[table.id,table]))});
 return copy;
}

export function encodeHistoryValue(value,valueState='known'){
 const type=Array.isArray(value)?'list':typeof value==='number'?(Number.isSafeInteger(value)?'integer':'number'):typeof value==='boolean'?'boolean':value&&typeof value==='object'?'object':'text';
 const values={value_type:type,value_state:valueState};
 if(type==='number'||type==='integer')values.number_value=value;
 else if(type==='boolean')values.boolean_value=value;
 else if(type==='list'||type==='object')values.text_value=stable(value??(type==='list'?[]:{}));
 else if(value!=null)values.text_value=String(value);
 return values;
}

export function decodeHistoryValue(record){
 if(!record)return {value:null,state:'unset'};
 const values=record.values??record,type=values.value_type,state=values.value_state??'known';
 if(!['known','derived'].includes(state))return {value:null,state};
 let value=null;
 if(type==='number'||type==='integer')value=values.number_value;
 else if(type==='boolean')value=values.boolean_value;
 else if(type==='list'||type==='object'){
  try{value=JSON.parse(values.text_value??(type==='list'?'[]':'{}'));}catch{return {value:null,state:'invalid_history'};}
 }else value=values.text_value??null;
 return {value:clone(value),state};
}

function historyContext(runtime){
 const context=runtime.historyContext??{},scope=runtime.data.runtime?.scope??{};
 const reference=(value,table)=>typeof value==='string'&&runtime.data.schema[table]&&runtime.rows(table)[value]?value:undefined;
 return {
  reason:typeof context.reason==='string'&&context.reason?context.reason:typeof context.kind==='string'&&context.kind?context.kind:'字段写入',
  event_ref:reference(context.eventRef??context.event_ref,'T_DYN_EVENTS'),
  scene_ref:reference(context.sceneRef??context.scene_ref??scope.scene_ref,'T_DYN_SCENE_SPACE'),
  story_time:reference(context.storyTime??context.story_time??scope.story_time,'M_WORLD_TIME')
 };
}

// Runtime.set is the one write service for business cells. The log rows live in
// the same transaction snapshot, so a failed operation removes its candidates.
export function recordFieldHistory(runtime,tableId,recordId,field,before,after){
 if(HISTORY_TABLES.has(tableId)||runtime.writingHistory)return null;
 const schema=runtime.data.schema?.T_SYS_CHANGE_LOG,typed=runtime.data.schema?.M_TYPED_VALUES,spec=runtime.data.schema?.[tableId]?.fields.find(f=>f.key===field);
 if(!schema||!typed||!spec)return null;
 const beforeValue=own(before,'value')?before.value:null,beforeState=before.state??'unset',afterValue=own(after,'value')?after.value:null,afterState=after.state??'unset';
 if(stable(beforeValue)===stable(afterValue)&&beforeState===afterState)return null;
 const operation=runtime.activeOperation??'direct',sequence=Math.max(runtime.historySequence??0,Object.keys(runtime.rows('T_SYS_CHANGE_LOG')).length)+1;runtime.historySequence=sequence;
 const changeId=stableId(operation+'|field-change|'+sequence+'|'+tableId+'|'+recordId+'|'+field),context=historyContext(runtime);
 runtime.writingHistory=true;
 try{
  const writeValue=(id,kind,value,state)=>runtime.newRecord('M_TYPED_VALUES',{owner_table:'T_SYS_CHANGE_LOG',owner_row_uuid:changeId,owner_field:kind,...encodeHistoryValue(value,state)},stableId(changeId+'|'+kind));
  writeValue(changeId+'-old','old_value',beforeValue,beforeState);writeValue(changeId+'-new','new_value',afterValue,afterState);writeValue(changeId+'-readback','readback_value',afterValue,afterState);
  const values={change_id:changeId,operation_id:operation,sheet_id:tableId,target_row_uuid:recordId,col_key:field,
   old_value:stableId(changeId+'|old_value'),new_value:stableId(changeId+'|new_value'),readback_value:stableId(changeId+'|readback_value'),
   ...context,before_revision:String(runtime.data.runtime?.revision??0),after_revision:String((runtime.data.runtime?.revision??0)+(runtime.inTransaction?1:0)),
   unique_writer:'Runtime.set',recorded_at:new Date().toISOString(),commit_status:runtime.inTransaction?'候选':'已提交',readonly_reference:false};
  runtime.newRecord('T_SYS_CHANGE_LOG',values,changeId);return changeId;
 }finally{runtime.writingHistory=false;}
}

export function finalizeFieldHistory(runtime,revision){
 for(const record of Object.values(runtime.rows('T_SYS_CHANGE_LOG'))){
  if(record.values.commit_status!=='候选')continue;
  record.values.commit_status='已提交';record.values.after_revision=String(revision);record.states.commit_status='known';record.states.after_revision='known';
 }
}

export function readFieldHistory(state,{tableId,recordId,field=null}={}){
 if(typeof tableId!=='string'||typeof recordId!=='string')return [];
 const rows=Object.entries(state.tables?.T_SYS_CHANGE_LOG??{}).filter(([,record])=>record.values.sheet_id===tableId&&record.values.target_row_uuid===recordId&&record.values.commit_status==='已提交'&&(!field||record.values.col_key===field));
 return rows.map(([id,record])=>{
  const values=record.values,typed=id=>decodeHistoryValue(state.tables?.M_TYPED_VALUES?.[id]),before=typed(values.old_value),after=typed(values.new_value),readback=typed(values.readback_value);
  return {id,changeId:values.change_id??id,operationId:values.operation_id??'',tableId,recordId,field:values.col_key,before:before.value,beforeState:before.state,after:after.value,afterState:after.state,readback:readback.value,readbackState:readback.state,
   reason:values.reason??'',eventRef:values.event_ref??null,sceneRef:values.scene_ref??null,storyTime:values.story_time??null,beforeRevision:values.before_revision??'',afterRevision:values.after_revision??'',recordedAt:values.recorded_at??''};
 }).sort((a,b)=>Number(a.afterRevision)-Number(b.afterRevision)||a.recordedAt.localeCompare(b.recordedAt)||a.id.localeCompare(b.id));
}

export function historySummary(state,target){
 const items=readFieldHistory(state,target),fields=new Set(items.map(item=>item.field));
 return {count:items.length,fieldCount:fields.size,first:items[0]?.recordedAt??null,last:items.at(-1)?.recordedAt??null};
}

export function historyStorageTables(){return [...HISTORY_TABLES];}
export function isFieldHistoryRecord(tableId,record){
 if(tableId==='T_SYS_CHANGE_LOG')return true;
 if(tableId==='M_TYPED_VALUES')return record?.values?.owner_table==='T_SYS_CHANGE_LOG';
 return tableId==='X_RECORD_META'&&record?.values?.table_id==='T_SYS_CHANGE_LOG';
}
