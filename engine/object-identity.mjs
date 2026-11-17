import {matrixRecordVisible,matrixFieldVisible} from './prompt-boundary.mjs';
import {fail} from './common.mjs';

export const normalizeIdentityName=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-US'):value;
// Definition names and owner-qualified state keys are identities. History,
// transactions, messages, physical copies and owned details are not deduced
// from similar prose. Each continues through its explicit canonical UUID.
export const OBJECT_IDENTITY_FIELDS=Object.freeze({
 T_STATIC_WORLDS:['name'],T_STATIC_WORLD_RULES:['name'],T_STATIC_PLACES:['name'],T_STATIC_ORGANIZATIONS:['name'],T_STATIC_ITEMS_SKILLS:['name'],T_STATIC_FACILITIES:['name'],T_CHAR_DOSSIER:['name'],T_DYN_SCENE_SPACE:['name'],
 T_STATIC_ORG_RELATIONS:['subject_org_ref','target_org_ref'],T_CHAR_TYPE_BINDINGS:['char_ref','type_ref'],T_CHAR_SKILLS:['char_ref','asset_ref'],T_CHAR_ANCHORS:['char_ref','name'],T_CHAR_RELATION_ORIGINS:['subject_ref','target_ref'],
 T_DYN_HOLDINGS_INVENTORY:['item_instance_ref'],T_DYN_RELATIONS_PACTS:['subject_ref','target_ref'],T_DYN_RELATION_AXES:['relation_ref','axis_key'],T_DYN_ENTITY_STATE:['entity_id'],T_DYN_ENTITY_GAUGES:['entity_id','field_key'],T_DYN_SCENE_PARTICIPANTS:['scene_ref','entity_ref'],T_DYN_EVENT_PARTICIPANTS:['event_ref','entity_ref'],T_DYN_COMMUNICATIONS:['source_ref','target_ref','medium'],T_DYN_CURRENCY_BALANCES:['owner_ref','currency_ref','native_ref'],
 T_STATIC_CONSTANTS:['rule_ref','matrix_name','row_key','column_key'],T_STATIC_RECIPE_COMPONENTS:['recipe_ref','component_role','asset_ref'],T_STATIC_FACILITY_LEVELS:['fac_type_ref','level','branch_name'],T_STATIC_FACILITY_MATERIALS:['upgrade_ref','asset_ref']
});
const named=new Set(Object.entries(OBJECT_IDENTITY_FIELDS).filter(([,keys])=>keys.length===1&&keys[0]==='name').map(([id])=>id));
export const namedIdentityTable=table=>named.has(table);
export function objectIdentity(state,table,values){
 let keys=OBJECT_IDENTITY_FIELDS[table],v=values??{};
 if(table==='T_SYS_ENTITIES'){
  const origin=state.tables.M_FIELD_REFERENCES?.[v.origin_record_ref]?.values;
  if(origin?.target_table==='T_CHAR_DOSSIER')return JSON.stringify(['origin',origin.target_table,origin.target_row_uuid]);
  if(['character','unclassified'].includes(v.kind)&&(v.name||v.instance_name))return JSON.stringify(['subject',normalizeIdentityName(v.name??v.instance_name)]);
  // Physical copies need independent instance names. Their template alone is
  // never a uniqueness key (two keys can share one key template).
  if(v.kind&&v.instance_name)return JSON.stringify(['instance',v.kind,normalizeIdentityName(v.instance_name),origin?.target_table??null,origin?.target_row_uuid??null]);
  return null;
 }
 if(table==='T_DYN_EVENTS')keys=['short_code'];
 if(table==='T_DYN_HOLDINGS_INVENTORY'&&v.holding_end)return null;
 if(table==='T_STATIC_PLACES'&&v.name)return JSON.stringify([normalizeIdentityName(v.name),v.parent_place_ref??null]);
 if(!keys||keys.some(k=>v[k]===undefined||v[k]===null||v[k]===''))return null;
 return JSON.stringify(keys.map(k=>state.schema[table]?.fields.find(f=>f.key===k)?.ref?v[k]:normalizeIdentityName(v[k])));
}
export function identityAliases(state,table,id,scope=state.runtime?.scope??{}){
 const row=state.tables[table]?.[id];if(!row)return [];
 const ids=['aliases','instance_aliases'].filter(key=>matrixFieldVisible(state.schema[table]?.fields.find(f=>f.key===key)??{key},row,scope,table,state,id)).flatMap(key=>[row.values[key]].flat()).filter(Boolean);
 return ids.flatMap(key=>{const child=state.tables.M_LIST_VALUES?.[key];return child&&matrixRecordVisible(state,'M_LIST_VALUES',key,scope)&&matrixFieldVisible(state.schema.M_LIST_VALUES?.fields.find(f=>f.key==='text_value')??{key:'text_value'},child,scope,'M_LIST_VALUES',state,key)&&child.values.text_value?[child.values.text_value]:[];});
}
export function identityCandidates(state,table,values,{ids,scope=state.runtime?.scope??{}}={}){
 const key=objectIdentity(state,table,values);if(!key)return [];
 return Object.entries(state.tables[table]??{}).filter(([id,row])=>(!ids||ids.has(id))&&matrixRecordVisible(state,table,id,scope)&&(objectIdentity(state,table,row.values)===key||named.has(table)&&(table!=='T_STATIC_PLACES'||(values.parent_place_ref??null)===(row.values.parent_place_ref??null))&&identityAliases(state,table,id,scope).some(alias=>normalizeIdentityName(alias)===normalizeIdentityName(values.name)))).map(([id])=>id);
}
// Storage barrier: refuse only newly introduced collisions. Existing ambiguous
// records stay intact and editable by UUID; importing or reading never merges.
export function assertObjectUniqueness(before,after,changes){
 for(const change of changes??Object.entries(after.tables).flatMap(([tableId,rows])=>Object.keys(rows).map(recordId=>({tableId,recordId})))){if(change.remove)continue;const table=change.tableId??change.table,id=change.recordId??change.id,row=after.tables[table]?.[id];if(!row)continue;
  const key=objectIdentity(after,table,row.values);if(!key)continue;
  const oldKey=objectIdentity(before,table,before.tables[table]?.[id]?.values);
  if(oldKey===key)continue;
  const matches=identityCandidates(after,table,row.values).filter(other=>other!==id);
  if(matches.length)fail('OBJECT_IDENTITY_EXISTS','对象身份已存在，请续接已有记录；本次未创建副本',{table,record:id,existing:matches});
 }
}
