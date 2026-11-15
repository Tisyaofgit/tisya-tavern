import {clone,fail,decimal} from './common.mjs';
import {matrixRecordVisible} from './prompt-boundary.mjs';

export const RELATION_AXES='T_DYN_RELATION_AXES';
export const ATTITUDE_FIELDS=Object.freeze([
 {key:'name',label:'态度名称',type:'TEXT'},
 {key:'definition',label:'态度定义',type:'LONG_TEXT'},
 {key:'status_tags',label:'状态标签',type:'TAGS'},
 {key:'status_definition',label:'标签含义',type:'LONG_TEXT'},
 {key:'time_enabled',label:'启用时间变化',type:'BOOLEAN'},
 {key:'time_delta',label:'每周期变化量',type:'NUMBER'},
 {key:'time_period_minutes',label:'变化周期',type:'INTEGER',minimum:1,unit:'故事分钟'}
]);
// Add fields in place, retaining original row coordinates and all legacy data.
// Old affection/reputation families remain valid stored values.
export function extendAttitudeSchema(state){
 const schema=state.schema?.[RELATION_AXES];if(!schema)return state;
 schema.label='正负态度与专项关系';
 for(const field of ATTITUDE_FIELDS)if(!schema.fields.some(f=>f.key===field.key))schema.fields.push(clone(field));
 const family=schema.fields.find(f=>f.key==='axis_family');if(family){family.label='态度方向';family.enum=[...new Set(['正向态度','负向态度','专项',...(family.enum??[])])];}
 return state;
}
export function extendAttitudeCatalog(catalog){
 if(!catalog?.tables?.some(t=>t.id===RELATION_AXES))return catalog;
 const copy=clone(catalog);extendAttitudeSchema({schema:Object.fromEntries(copy.tables.map(t=>[t.id,t]))});return copy;
}
export function advanceAttitudes(engine,start,end){
 const changes=[],scope={...engine.data.runtime.scope,audience:'author'};
 for(const [id,row]of Object.entries(engine.rows(RELATION_AXES))){
  const v=row.values,known=key=>['known','derived'].includes(row.states[key]);
  if(!known('time_enabled')||v.time_enabled!==true||!matrixRecordVisible(engine.data,RELATION_AXES,id,scope))continue;
  if(v.relation_ref&&!matrixRecordVisible(engine.data,'T_DYN_RELATIONS_PACTS',v.relation_ref,scope))continue;
  if(end<start)fail('ATTITUDE_TIME_REVERSE','关系时间回退须使用对应楼层存档');
  if(end===start||!known('value'))continue; // Unknown is never treated as zero.
  if(!['time_delta','time_period_minutes','minimum','maximum'].every(k=>known(k)&&Number.isFinite(v[k]))||!Number.isSafeInteger(v.time_period_minutes)||v.time_period_minutes<=0||v.minimum>v.maximum||!Number.isFinite(v.value))fail('ATTITUDE_TIME_RULE','启用时间变化须填有效周期、变化量及上下限',{record:id});
  const after=Math.max(v.minimum,Math.min(v.maximum,decimal(v.value,(end-start)/v.time_period_minutes*v.time_delta)));
  if(after===v.value)continue;
  changes.push({record_id:id,before:v.value,after,elapsed_minutes:end-start});
 }
 // Validate the whole group before writing; the enclosing turn transaction
 // supplies replay protection and the existing inverse journal supplies undo.
 for(const change of changes)engine.set([RELATION_AXES,change.record_id,'value',[]],change.after);
 return changes;
}
