import {worldFramework} from '../engine/world-framework.mjs';
import {check} from './schema.js';
import {matrixRecordVisible,modelFieldAllowed,modelTableAllowed} from '../engine/prompt-boundary.mjs';
const scalar=new Set(['TEXT','LONG_TEXT','ENUM','NUMBER','INTEGER','BOOLEAN','REF']);
export const CONDITION_COMPARATORS=[['eq','等于'],['ne','不等于'],['ge','至少'],['gt','大于'],['le','至多'],['lt','小于'],['exists','已填写']];
export function conditionCells(state,allowed=()=>true){
 const out=[],scope=state.runtime?.scope??{},names=new Map(worldFramework(state,scope).references.map(r=>[r.tableId+'#'+r.recordId,r.display]));
 for(const [table,rows]of Object.entries(state.tables??{})){
  const schema=state.schema[table];if(!schema||!modelTableAllowed(table,schema)&&table!=='X_WORLD_CLOCKS'||['M_CONDITIONS','M_FIELD_REFERENCES','M_ACCESS_RULES'].includes(table))continue;
  for(const [id,row]of Object.entries(rows)){
   if(table==='X_WORLD_CLOCKS'?(scope.world_ref&&row.values.world_ref!==scope.world_ref):!matrixRecordVisible(state,table,id,scope))continue;
   for(const f of schema.fields){
    if(!Object.hasOwn(row.values,f.key)&&!Object.hasOwn(row.formulas??{},f.key)||['scope_world_id','world_ref','value_state','owner_table','owner_row_uuid','owner_field','sequence'].includes(f.key)||f.classification==='derived_calendar_projection'||!scalar.has(f.type)||!modelFieldAllowed(f,schema)||!allowed(table,id,f.key)||table==='X_WORLD_CLOCKS'&&!['year','season','month','day','hour','minute'].includes(f.key))continue;
    const target=f.ref?.startsWith('@')?row.values[f.ref.slice(1)]:f.ref,valueOptions=f.type==='REF'&&target?Object.entries(state.tables[target]??{}).filter(([rid])=>matrixRecordVisible(state,target,rid,scope)&&allowed(target,rid,'')).map(([rid,r])=>[rid,names.get(target+'#'+rid)??r.values.name??r.values.label??r.values.title??'未命名']):(f.enum??[]).map(v=>[String(v),String(v)]);
    out.push({key:JSON.stringify([table,id,f.key]),table,id,field:f.key,type:f.type,choices:f.enum??[],valueOptions,name:(names.get(table+'#'+id)??(schema.label??table)+'／'+(row.values.name??row.values.label??row.values.title??'未命名'))+'／'+(f.label??f.key).replace(/n$/,'')});
   }
  }
 }
 return out;
}
export function conditionForm(rule,state){
 const groups={};let editable=true;
 for(const group of rule.groups){
  const nodes=group.nodes.slice().sort((a,b)=>a.sequence-b.sequence),rows=nodes.map(n=>{
   const ref=state.tables.M_FIELD_REFERENCES?.[n.lhs_ref]?.values,rhs=state.tables.M_FIELD_REFERENCES?.[n.rhs_ref]?.values;
   if(n.predicate_kind!=='comparison'||!CONDITION_COMPARATORS.some(([k])=>k===n.comparator)||n.narrative||n.value_state!=='known'||!ref||ref.reference_kind!=='cell'||ref.resolution_status!=='resolved'||nodes.some(x=>x.combine!==n.combine)||n.rhs_kind==='reference'&&(!rhs||rhs.reference_kind!=='cell'||rhs.resolution_status!=='resolved'))editable=false;
   return {cell:ref?JSON.stringify([ref.target_table,ref.target_row_uuid,ref.target_field]):'',comparator:n.comparator,kind:n.rhs_kind??'text',value:n['rhs_'+n.rhs_kind]??'',reference:rhs?JSON.stringify([rhs.target_table,rhs.target_row_uuid,rhs.target_field]):''};
  });groups[group.field]={combine:nodes[0]?.combine??'all',rows};
 }
 return {id:rule.id,revision:rule.revision,name:rule.name,policy:rule.policy,active:groups.activation_condition,expiry:groups.expiry_condition??{combine:'all',rows:[]},editable};
}
export function compileConditionForm(state,input,cells,old=null){
 check(input&&typeof input.name==='string'&&input.name.trim()&&input.name.length<=120,'请填写条件名称（至多120字）');
 check(!old||old.editable,'这个条件含有扩展判定，请在原定义处修订，未覆盖原规则');
 const id=old?.id??'gate:'+crypto.randomUUID(),changes=[],cellMap=new Map(cells.map(c=>[c.key,c]));
 const existing=Object.entries(state.tables.M_CONDITIONS??{}).filter(([,r])=>r.values.owner_table==='T_SYS_SOURCE_ROUTES'&&r.values.owner_row_uuid===id);
 const oldNodes=new Set(existing.map(([id])=>id));
 const obsoleteRefs=Object.entries(state.tables.M_FIELD_REFERENCES??{}).filter(([,r])=>r.values.owner_table==='M_CONDITIONS'&&oldNodes.has(r.values.owner_row_uuid));
 // Owned nodes may be replaced only if no other owner has reused their identities.
 const removed=new Map([['M_CONDITIONS',oldNodes],['M_FIELD_REFERENCES',new Set(obsoleteRefs.map(([id])=>id))]]);
 for(const [table,rows]of Object.entries(state.tables))for(const [rid,r]of Object.entries(rows))for(const f of state.schema[table]?.fields??[]){
  const target=f.ref?.startsWith('@')?r.values[f.ref.slice(1)]:f.ref;if(!removed.has(target))continue;
  if(table==='T_SYS_SOURCE_ROUTES'&&rid===id||removed.get(table)?.has(rid))continue;
  check(!(Array.isArray(r.values[f.key])?r.values[f.key]:[r.values[f.key]]).some(v=>removed.get(target).has(v)),'条件明细被其他记录直接引用，请先修订该引用');
 }
 for(const [rid,r]of Object.entries(state.tables.X_RECORD_META??{}))if(removed.get(r.values.table_id)?.has(r.values.record_id))changes.push({tableId:'X_RECORD_META',recordId:rid,remove:true});
 for(const [rid]of existing)changes.push({tableId:'M_CONDITIONS',recordId:rid,remove:true});
 for(const [rid]of obsoleteRefs)changes.push({tableId:'M_FIELD_REFERENCES',recordId:rid,remove:true});
 const route={source_name:input.name.trim(),source_type:'worldbook'};
 const reference=(key,node,field)=>{
  const c=cellMap.get(key);check(c,'引用的字段已不存在、跨世界或不可公开读取');const ref='field:'+crypto.randomUUID();
  changes.push({tableId:'M_FIELD_REFERENCES',recordId:ref,values:{owner_table:'M_CONDITIONS',owner_row_uuid:node,owner_field:field,target_table:c.table,target_row_uuid:c.id,target_field:c.field,reference_kind:'cell',resolution_status:'resolved'}});return {ref,cell:c};
 };
 for(const [field,group,required]of [['activation_condition',input.active,true],['expiry_condition',input.expiry,false]]){
  check(group&&['all','any'].includes(group.combine)&&Array.isArray(group.rows)&&group.rows.length<=128&&(!required||group.rows.length>0),'条件须包含1—128行，失效条件可留空');route[field]=null;
  for(const [sequence,row]of group.rows.entries()){
   const node='condition:'+crypto.randomUUID();route[field]??=node;check(CONDITION_COMPARATORS.some(([v])=>v===row.comparator),'未知比较方式');
   const lhs=reference(row.cell,node,'lhs_ref'),v={owner_table:'T_SYS_SOURCE_ROUTES',owner_row_uuid:id,owner_field:field,group_key:field,sequence,combine:group.combine,predicate_kind:'comparison',lhs_ref:lhs.ref,comparator:row.comparator,value_state:'known'};
   if(row.comparator!=='exists'){
    check(['number','text','boolean','reference'].includes(row.kind),'未知比较值类型');v.rhs_kind=row.kind;
    if(row.kind==='reference'){const rhs=reference(row.reference,node,'rhs_ref');check(lhs.cell.type===rhs.cell.type||['NUMBER','INTEGER'].includes(lhs.cell.type)&&['NUMBER','INTEGER'].includes(rhs.cell.type),'比较字段类型不同');v.rhs_ref=rhs.ref;}
    else {const value=row.value;check(row.kind==='number'?typeof value==='number'&&Number.isFinite(value):row.kind==='boolean'?typeof value==='boolean':typeof value==='string','比较值类型不符');check(row.kind==='number'?['NUMBER','INTEGER'].includes(lhs.cell.type):row.kind==='boolean'?lhs.cell.type==='BOOLEAN'||lhs.cell.choices.includes(true):!['NUMBER','INTEGER','BOOLEAN'].includes(lhs.cell.type),'比较值与字段类型不符');check(row.kind!=='text'||lhs.cell.type!=='REF'||lhs.cell.valueOptions.some(([id])=>id===value),'请选择可读取的引用对象');v['rhs_'+row.kind]=value;}
    check(!['gt','ge','lt','le'].includes(row.comparator)||['NUMBER','INTEGER'].includes(lhs.cell.type),'大小比较须使用数值字段');
   }
   changes.push({tableId:'M_CONDITIONS',recordId:node,values:v});
  }
 }
 const p=input.policy??{};
 for(const [key,property,fallback]of [['condition_chance','chance',100],['condition_cooldown_turns','cooldown',0],['condition_limit','limit',null],['condition_start_turn','start',0],['condition_end_turn','end',null]])route[key]=p[property]??fallback;
 changes.push({tableId:'T_SYS_SOURCE_ROUTES',recordId:id,values:route});return {id,changes,route};
}
