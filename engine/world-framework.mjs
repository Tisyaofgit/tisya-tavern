import {matrixRecordVisible,matrixFieldVisible,modelFieldAllowed} from './prompt-boundary.mjs';
import {fail,stableId} from './common.mjs';
export const WORLD_FRAMEWORK_GROUPS=[
 {name:'世界',tables:['T_STATIC_WORLDS']},
 {name:'历法',tables:['M_CALENDAR_RULES','M_CALENDAR_MONTHS','M_CALENDAR_EXCEPTIONS']},
 {name:'地理',tables:['T_STATIC_PLACES','T_STATIC_PLACE_LINKS']},
 {name:'货币与度量',tables:['T_STATIC_ITEMS_SKILLS','M_UNITS','M_UNIT_RATIOS']}
];
const hidden=new Set(['row_uuid','world_id','calendar_id','unit_key','ratio_id','rule_id','scope_world_id','world_ref','value_state']);
const hiddenKey=(table,key)=>hidden.has(key)&&!(table==='T_STATIC_WORLDS'&&key==='calendar_id');
const currencyFields=new Set(['name','base_value','value_currency_ref','identified_full_desc','material','shape','usage','narrative_meaning','origin']);
const worldFields=new Set(['name','core_proposition','calendar_id','era_name','base_year','time_order_rule','special_cycle_definition']);
const known=(r,k)=>['known','derived'].includes(r.states?.[k]);
export function worldFramework(state,scope=state.runtime?.scope??{}){
 const worldInventoryScope={...scope};delete worldInventoryScope.world_ref;
 const worlds=Object.entries(state.tables?.T_STATIC_WORLDS??{}).filter(([id])=>matrixRecordVisible(state,'T_STATIC_WORLDS',id,worldInventoryScope));
 const worldId=scope.world_ref??(worlds.length===1?worlds[0][0]:null),world=worlds.find(([id])=>id===worldId);
 if(!world)return {worldId:null,worlds,groups:[],references:[]};
 const meta=new Map(Object.values(state.tables.X_RECORD_META??{}).map(r=>[r.values.table_id+'#'+r.values.record_id,r.values])),worldName=world[1].values.name??'世界';
 const inScope=(t,id,r)=>{
  if(!matrixRecordVisible(state,t,id,{...scope,world_ref:worldId},meta))return false;
  const m=meta.get(t+'#'+id);if(['归档','废弃'].includes(m?.record_status))return false;const explicit=r.values.scope_world_id??r.values.world_ref??m?.scope_world_id;
  if(explicit)return ['GLOBAL',worldId].includes(explicit);
  return worlds.length===1;
 };
 const calendarIds=new Set(Object.entries(state.tables.M_CALENDAR_RULES??{}).filter(([id,r])=>inScope('M_CALENDAR_RULES',id,r)&&(r.values.world_ref===worldId||id===world[1].values.calendar_id)).map(([id])=>id));
 const currencyIds=new Set();
 for(const [t,rows]of Object.entries(state.tables))for(const [id,r]of Object.entries(rows))if(inScope(t,id,r))for(const f of state.schema[t]?.fields??[])if(f.ref==='T_STATIC_ITEMS_SKILLS'&&/currency/.test(f.key)&&known(r,f.key))currencyIds.add(r.values[f.key]);
 const groups=WORLD_FRAMEWORK_GROUPS.map(group=>({...group,records:group.tables.flatMap(table=>Object.entries(state.tables[table]??{}).filter(([id,r])=>{
  if(table==='T_STATIC_WORLDS')return id===worldId;
  if(table==='M_CALENDAR_RULES')return calendarIds.has(id);
  if(['M_CALENDAR_MONTHS','M_CALENDAR_EXCEPTIONS'].includes(table))return calendarIds.has(r.values.calendar_ref)&&matrixRecordVisible(state,table,id,{...scope,world_ref:worldId});
  if(!inScope(table,id,r))return false;
  if(table==='T_STATIC_ITEMS_SKILLS')return currencyIds.has(id)||/^(货币|币种|currency)$/i.test(r.values.category??'');
  return true;
 }).map(([id,r])=>{
  const schema=state.schema[table],name=r.values.name??r.values.label??(table==='M_CALENDAR_RULES'?worldName+'历法':table==='M_CALENDAR_MONTHS'?String(r.values.month??'')+'月':schema.label),values={};
  for(const [key,v]of Object.entries(r.values)){const f=schema.fields.find(f=>f.key===key);if(!f||hiddenKey(table,key)||!modelFieldAllowed(f,schema)||!matrixFieldVisible(f,r,scope,table,state,id))continue;
   if(known(r,key))values[key]=v;else if(r.states[key]==='unknown')values[key]='?';
  }
  return {table_id:table,record_id:id,name,values};
 }))}));
 return {worldId,worlds,groups,references:groups.flatMap(g=>g.records.map(r=>({tableId:r.table_id,recordId:r.record_id,display:(state.schema[r.table_id].label??g.name)+'／'+r.name})))};
}
export function frameworkFields(state,table){
 return (state.schema[table]?.fields??[]).filter(f=>!hiddenKey(table,f.key)&&(table!=='T_STATIC_ITEMS_SKILLS'||currencyFields.has(f.key))&&(table!=='T_STATIC_WORLDS'||worldFields.has(f.key))&&!f.read_only&&!f.alias_of&&!f.formula&&!f.key.startsWith('legacy_')&&modelFieldAllowed(f,state.schema[table])&&['TEXT','LONG_TEXT','NUMBER','INTEGER','BOOLEAN','ENUM','REF'].includes(f.type));
}
export function createWorldFrameworkService(database){
 async function readWorldFramework(worldId){const db=await database.read();if(!db?.state)fail('WORLD_FRAMEWORK','请先接入当前会话');return {...db,...worldFramework(db.state,{...db.state.runtime?.scope,...(worldId?{world_ref:worldId}:{})})};}
 async function saveWorldFrameworkRecord({table,id,worldId,values,revision,contextKey}){
  const db=await database.read();if(!db||db.revision!==revision||db.contextKey!==contextKey)fail('SAVE_CONFLICT','世界框架已变化，请刷新后重试');
  if(!WORLD_FRAMEWORK_GROUPS.some(g=>g.tables.includes(table)))fail('WORLD_FRAMEWORK','这不是世界公共定义表');
  const view=worldFramework(db.state,{...db.state.runtime?.scope,world_ref:worldId});
  if(table!=='T_STATIC_WORLDS'&&!view.worldId)fail('WORLD_FRAMEWORK','请先选择所属世界');
  if(id&&!view.groups.some(g=>g.records.some(r=>r.table_id===table&&r.record_id===id)))fail('WORLD_FRAMEWORK','记录不属于所选世界框架');
  const fields=frameworkFields(db.state,table),allowed=new Map(fields.map(f=>[f.key,f]));
  for(const [key,v]of Object.entries(values)){
   if(!allowed.has(key))fail('WORLD_FRAMEWORK','字段不能在世界框架修改',{field:key});
   const f=allowed.get(key);if(v!==null&&f.type==='REF'&&f.ref&&!f.ref.startsWith('@')){
    const r=db.state.tables[f.ref]?.[v];if(!r||!matrixRecordVisible(db.state,f.ref,v,{...db.state.runtime?.scope,world_ref:worldId}))fail('WORLD_FRAMEWORK','引用不属于当前可读世界');
    const refs=worldFramework(db.state,{...db.state.runtime?.scope,world_ref:worldId}).references;
    if(WORLD_FRAMEWORK_GROUPS.some(g=>g.tables.includes(f.ref))&&!refs.some(x=>x.tableId===f.ref&&x.recordId===v))fail('WORLD_FRAMEWORK','引用必须来自同一世界框架');
   }
  }
  const recordId=id??'world-definition:'+crypto.randomUUID(),next={...values};
  if(!id){if(table==='T_STATIC_ITEMS_SKILLS')next.category='货币';if(table==='T_STATIC_WORLDS')next.world_id=recordId;
   if(table==='M_CALENDAR_RULES')Object.assign(next,{calendar_id:recordId,world_ref:worldId,value_state:'known'});
   if(table==='M_UNITS')Object.assign(next,{unit_key:recordId,scope_world_id:worldId});
   if(table==='M_UNIT_RATIOS')Object.assign(next,{ratio_id:recordId,scope_world_id:worldId,value_state:'known'});
   if(table==='M_CALENDAR_EXCEPTIONS')next.rule_id=recordId;
  }
  const changes=[{tableId:table,recordId,values:next}];
  if(!id)changes.push({tableId:'X_RECORD_META',recordId:stableId(table+'#'+recordId),values:{table_id:table,record_id:recordId,scope_world_id:table==='T_STATIC_WORLDS'?recordId:worldId,scope_session_id:null,scope_branch_id:null,record_revision:1,record_status:'生效',default_source_status:'用户确认'}});
  const result=await database.commit({operationId:'world-framework:'+crypto.randomUUID(),expectedRevision:revision,contextKey,changes,source:{kind:'world-framework'}});
  return {...result,recordId,worldId:table==='T_STATIC_WORLDS'?recordId:worldId};
 }
 return {readWorldFramework,saveWorldFrameworkRecord};
}
