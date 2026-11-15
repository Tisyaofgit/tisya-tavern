import {phoneFormReference,phoneFormReferenceCandidates,PHONE_FORM_LIST_REFERENCES} from './phone-form-contract.mjs';
import {matrixRecordVisible,matrixFieldVisible,modelFieldAllowed} from './prompt-boundary.mjs';

export const materialText=v=>v==null?'~':typeof v==='boolean'?(v?'是':'否'):Array.isArray(v)?v.map(materialText).join('、')||'无':typeof v==='object'?Object.entries(v).map(([k,x])=>k+'='+materialText(x)).join('；')||'无':String(v).replace(/\r?\n/g,' ⏎ ');
const ownerKeys=new Set(['owner_table','owner_form','owner_row_uuid','owner_field','sequence','value_state','item_type','target_row_uuid','target_revision','reference_kind','resolution_status','external_id']);

// References keep their canonical coordinates in storage. The model sees a
// visible name; owned details are expanded at their one owning field.
export function renderBlocks(engine,slots,scope=engine.data.runtime?.scope??{},references=[]){
 const state=engine.data,out={},names=new Map(references.map(r=>[r.tableId+'#'+r.recordId,r.display]));
 const known=(row,key)=>['known','derived'].includes(row.states?.[key]);
 const visible=(tid,rid)=>matrixRecordVisible(state,tid,rid,scope);
 const ref=(tid,rid)=>{if(names.has(tid+'#'+rid))return names.get(tid+'#'+rid);if(!visible(tid,rid))return '未明确对象';const row=state.tables[tid][rid],name=['name','label','title','instance_name'].find(k=>known(row,k)&&matrixFieldVisible(state.schema[tid].fields.find(f=>f.key===k)??{key:k},row,scope,tid,state,rid));return (state.schema[tid].label??'资料')+(name?'／'+row.values[name]:'');};
 const fieldText=(tid,rid,key,value,trail=new Set())=>{
  const row=state.tables[tid]?.[rid],schema=state.schema[tid],field=schema?.fields.find(f=>f.key===key)??{};
  if(!row||!known(row,key))return materialText(value);
  const phoneTarget=phoneFormReference(tid,key)??PHONE_FORM_LIST_REFERENCES[tid]?.[key];
  if(phoneTarget){const targets=Array.isArray(phoneTarget)?phoneTarget:[phoneTarget],one=value=>{
   const found=targets.flatMap(target=>{const candidates=phoneFormReferenceCandidates(state,{tableId:tid,recordId:rid,field:key,target,value})??(state.tables[target]?.[value]?[value]:[]);return candidates.filter(id=>visible(target,id)).map(id=>ref(target,id));});
   return found.length===1?found[0]:'未明确对象';
  };return Array.isArray(value)?value.map(one).join('、'):one(value);}
  const target=field.ref?.startsWith('@')?row.values[field.ref.slice(1)]:field.ref;
  if(field.type==='CHILD_REF'&&target){
   const ids=Array.isArray(value)?value:[value];
   return ids.map(id=>detail(target,id,trail)).filter(Boolean).join('；')||'未明确';
  }
  if(['REF','ROW_REF','REF_LIST'].includes(field.type)){
   const one=id=>target?ref(target,id):(()=>{const hits=[...names].filter(([k])=>k.endsWith('#'+id));return hits.length===1?hits[0][1]:'未明确对象';})();
   return Array.isArray(value)?value.map(one).join('、'):one(value);
  }
  return materialText(value);
 };
 const detail=(tid,rid,trail)=>{
  const token=tid+'#'+rid;if(trail.has(token))return ref(tid,rid);if(!visible(tid,rid))return '';
  const row=state.tables[tid][rid],v=row.values,next=new Set(trail).add(token);
  if(['M_FIELD_REFERENCES','M_LIST_VALUES'].includes(tid)&&v.target_table&&v.target_row_uuid){const field=state.schema[v.target_table]?.fields.find(f=>f.key===v.target_field),target=state.tables[v.target_table]?.[v.target_row_uuid];return ref(v.target_table,v.target_row_uuid)+(field&&target&&matrixFieldVisible(field,target,scope,v.target_table,state,v.target_row_uuid)?' → '+field.label:'')+(v.narrative?'（'+materialText(v.narrative)+'）':'');}
  if(tid==='M_LIST_VALUES')return ['text_value','number_value','boolean_value'].filter(k=>known(row,k)).map(k=>materialText(v[k])).join('；')+(v.narrative?'（'+materialText(v.narrative)+'）':'');
  return fields(tid,rid,v,ownerKeys,next).join('；');
 };
 const fields=(tid,rid,values,omit=new Set(),trail=new Set())=>Object.entries(values).filter(([k])=>{const f=state.schema[tid]?.fields.find(f=>f.key===k);return f&&!omit.has(k)&&modelFieldAllowed(f,state.schema[tid])&&matrixFieldVisible(f,state.tables[tid][rid],scope,tid,state,rid);}).map(([k,v])=>{
  const f=state.schema[tid].fields.find(f=>f.key===k);return (f.label??k)+'='+fieldText(tid,rid,k,v,trail);
 });
 for(const [slot,rows]of Object.entries(slots)){
  const rendered=[];
  for(const b of rows){
   const v={...b.values},omit=new Set(['name','title','label','instance_name']);
   // Detailed source prose and its generated digest represent one event.
   if(b.table_id==='T_DYN_EVENTS'){if(v.full_process!=null||v.spine_digest===v.title)omit.add('spine_digest');omit.add('short_code');}
   const parts=fields(b.table_id,b.record_id,v,omit);
   const content='【'+ref(b.table_id,b.record_id)+'】'+(parts.length?' '+parts.join('；'):'');
   rendered.push(b.table_id==='T_CHAR_ANCHORS'?'<十维行为锚点>'+content+'</十维行为锚点>':b.table_id==='T_PREF_CHAR_FILTER'?'<演出时角色滤镜>'+content+'</演出时角色滤镜>':content);
  }
  if(rendered.length)out[slot]=rendered;
 }
 return out;
}
