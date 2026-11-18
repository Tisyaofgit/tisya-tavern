import catalog from './builtin-units-and-ratios.json' with {type:'json'};
import {fail,stableId} from '../../engine/common.mjs';

const units=catalog.M_UNITS_seed_rows.filter(row=>row.active);
const ratios=catalog.M_UNIT_RATIOS_seed_rows;
const unitsById=new Map(units.map(row=>[row.unit_key,row]));
const ratiosById=new Map(ratios.map(row=>[row.row_uuid,row]));
const unitsByLabel=new Map();
for(const unit of units){
 const same=unitsByLabel.get(unit.label)??[];
 same.push(unit);
 unitsByLabel.set(unit.label,same);
}

const aliasOf=label=>Object.hasOwn(catalog.unit_aliases,label)?catalog.unit_aliases[label]:label;
const canonicalLabel=(label,dimension)=>{
 if(dimension==='currency')return label;
 const alias=aliasOf(label);
 return unitsByLabel.get(alias)?.some(unit=>unit.dimension===dimension)?alias:label;
};
const unitName=unit=>unit.label+'（'+(unit.custom_dimension??catalog.dimension_labels[unit.dimension])+'）';
const ratioName=ratio=>ratio.source_note;

export const unitSeedOptions=Object.freeze({
 unitCount:catalog.M_UNITS_seed_rows.length,
 unitChoices:Object.freeze(units.map(unit=>Object.freeze([unit.unit_key,unitName(unit)]))),
 ratioChoices:Object.freeze(ratios.map(ratio=>Object.freeze([ratio.row_uuid,ratioName(ratio)]))),
});

export function seedUnitDefinition(name){
 const original=unitsByLabel.get(name),candidates=original??unitsByLabel.get(aliasOf(name));
 if(candidates?.length!==1)return undefined;
 const unit=candidates[0];
 // Bare currency symbols and colloquial currency aliases are world-specific.
 if(!original&&unit.dimension==='currency')return undefined;
 return {label:canonicalLabel(unit.label,unit.dimension),dimension:unit.dimension,customDimension:unit.custom_dimension};
}

export function planUnitSeedImport(state,view,{unitIds=[],ratioIds=[]}={}){
 const {worldId}=view;
 if(!worldId)fail('UNIT_SEED_WORLD','请先选择要采用这些单位的世界');
 if(!Array.isArray(unitIds)||!Array.isArray(ratioIds)||!unitIds.length&&!ratioIds.length)
  fail('UNIT_SEED_SELECTION','请选择要导入的单位或换算');
 const tableRows=table=>view.groups.flatMap(group=>group.records).filter(row=>row.table_id===table)
  .map(({record_id:id})=>({id,values:state.tables[table][id].values}));
 const currentUnits=tableRows('M_UNITS'),currentRatios=tableRows('M_UNIT_RATIOS'),changes=[],items=[];
 const reused=new Map();
 const add=(tableId,recordId,values)=>{
  if(state.tables[tableId]?.[recordId])fail('UNIT_SEED_ID','种子编号已有其他记录，请先核对公共定义',{tableId,recordId});
  changes.push({tableId,recordId,values},{tableId:'X_RECORD_META',recordId:stableId(tableId+'#'+recordId),values:{
   table_id:tableId,record_id:recordId,scope_world_id:worldId,scope_session_id:null,scope_branch_id:null,
   record_revision:1,record_status:'生效',default_source_status:'用户确认'
  }});
 };
 const preferred=(rows,label)=>{
  const local=rows.filter(row=>row.values.scope_world_id===worldId);
  const matches=local.length?local:rows;
  if(matches.length>1)fail('UNIT_SEED_AMBIGUOUS','存在多条可匹配的定义，请先核对「'+label+'」');
  return matches[0];
 };
 function useUnit(seed){
  if(reused.has(seed.unit_key))return reused.get(seed.unit_key);
  const {label,dimension,custom_dimension}=seed,canonical=canonicalLabel(label,dimension);
  const matches=currentUnits.filter(({values})=>values.dimension===dimension&&
    (values.custom_dimension??null)===(custom_dimension??null)&&canonicalLabel(values.label,dimension)===canonical);
  const fitted=preferred(matches,unitName(seed));
  const id=fitted?.id??stableId(['unit-seed',worldId,dimension,custom_dimension,canonical].join('|'));
  if(!fitted){
   const values={scope_world_id:worldId,unit_key:id,label:canonical,dimension,
    ...(custom_dimension?{custom_dimension}:{})
   };
   add('M_UNITS',id,values);
   currentUnits.push({id,values});
  }
  const resolved=fitted??currentUnits.at(-1);
  items.push({kind:'单位',name:unitName(seed),status:fitted?'已有定义':'新增',recordId:id});
  reused.set(seed.unit_key,resolved);
  return resolved;
 }
 const endpoint=(ratio,label)=>{
  const candidates=unitsByLabel.get(label)?.filter(unit=>unit.dimension===ratio.dimension)??[];
  if(candidates.length!==1)fail('UNIT_SEED_ENDPOINT','换算端点的单位或量纲无法唯一确定',{ratio:ratio.row_uuid,label});
  return useUnit(candidates[0]);
 };
 for(const id of new Set(unitIds)){
  const seed=unitsById.get(id);
  if(!seed)fail('UNIT_SEED_SELECTION','单位种子不存在或属于随历法建立的语义单位',{id});
  useUnit(seed);
 }
 for(const id of new Set(ratioIds)){
  const ratio=ratiosById.get(id);
  if(!ratio)fail('UNIT_SEED_SELECTION','未找到换算种子',{id});
  const from=endpoint(ratio,ratio.from_unit),to=endpoint(ratio,ratio.to_unit);
  if(from.id===to.id||(from.values.calendar_ref??null)!==(to.values.calendar_ref??null))
   fail('UNIT_SEED_ENDPOINT','现有单位与所选换算的端点不兼容',{id});
  const current=preferred(currentRatios.filter(({values})=>values.scope_world_id===worldId&&values.from_unit===from.id&&values.to_unit===to.id),ratioName(ratio));
  const recordId=current?.id??stableId(['unit-ratio-seed',worldId,id].join('|'));
  if(!current){
   const values={ratio_id:recordId,scope_world_id:worldId,conversion_mode:ratio.conversion_mode,
    from_unit:from.id,to_unit:to.id,numerator:ratio.numerator,denominator:ratio.denominator,
    offset:ratio.offset,value_state:ratio.value_state,source_note:ratio.source_note
   };
   add('M_UNIT_RATIOS',recordId,values);
   currentRatios.push({id:recordId,values});
  }
  items.push({kind:'换算',name:ratioName(ratio),status:current?'保留已有换算':'新增',recordId});
 }
 return {changes,items};
}
