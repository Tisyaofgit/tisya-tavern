import {fail} from './common.mjs';

// A character has one origin dossier and one live entity. Runtime states are
// projections of that entity, never independent referents for object links.
export function characterOriginValues(entityId,dossierId){
 return {owner_table:'T_SYS_ENTITIES',owner_row_uuid:entityId,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:dossierId,reference_kind:'record',resolution_status:'resolved'};
}

export function characterOriginChanges({entityId,dossierId,originId,entityValues={}}){
 return [
  {tableId:'T_SYS_ENTITIES',recordId:entityId,values:{kind:'character',...entityValues,origin_record_ref:originId}},
  {tableId:'M_FIELD_REFERENCES',recordId:originId,values:characterOriginValues(entityId,dossierId)}
 ];
}

export function characterOrigin(state,entityId,read){
 const entity=state.tables?.T_SYS_ENTITIES?.[entityId];if(!entity)return null;
 const value=(tableId,recordId,key)=>read?read(tableId,recordId,key):state.tables?.[tableId]?.[recordId]?.values?.[key];
 const selected=value('T_SYS_ENTITIES',entityId,'origin_record_ref');if(read&&!selected)return null;
 const ids=typeof selected==='string'?[selected]:Array.isArray(selected)?selected:[];
 const links=Object.entries(state.tables?.M_FIELD_REFERENCES??{}).filter(([id])=>value('M_FIELD_REFERENCES',id,'owner_table')==='T_SYS_ENTITIES'&&value('M_FIELD_REFERENCES',id,'owner_row_uuid')===entityId&&value('M_FIELD_REFERENCES',id,'owner_field')==='origin_record_ref'&&value('M_FIELD_REFERENCES',id,'target_table')==='T_CHAR_DOSSIER');
 const linked=links.filter(([id])=>!ids.length||ids.includes(id));
 if(linked.length>1)fail('CHARACTER_IDENTITY_AMBIGUOUS','人物实体的原点档案引用不唯一',{entityId});
 if(linked.length){const [originId]=linked[0],dossierId=value('M_FIELD_REFERENCES',originId,'target_row_uuid');return typeof dossierId==='string'&&dossierId?{entityId,dossierId,originId}:null;}
 if(selected)return null;
 return state.tables?.T_CHAR_DOSSIER?.[entityId]?{entityId,dossierId:entityId,originId:null}:null;
}

export function characterDossierId(state,entityId){return characterOrigin(state,entityId)?.dossierId??null;}

export function characterEntityForDossier(state,dossierId){
 const matches=[];
 for(const entityId of Object.keys(state.tables?.T_SYS_ENTITIES??{}))if(characterDossierId(state,entityId)===dossierId)matches.push(entityId);
 if(matches.length>1)fail('CHARACTER_IDENTITY_AMBIGUOUS','人物档案对应多个实体，请先核对稳定编号',{dossierId,entityIds:matches});
 return matches[0]??null;
}

// Returns the canonical live entity represented by a dossier/entity/state row.
// The caller still decides which records and fields are visible to its scope.
export function characterProjection(state,tableId,recordId){
 if(tableId==='T_SYS_ENTITIES')return {tableId,recordId};
 if(tableId==='T_DYN_ENTITY_STATE'){
  const entityId=state.tables?.T_DYN_ENTITY_STATE?.[recordId]?.values?.entity_id;
  return typeof entityId==='string'&&state.tables?.T_SYS_ENTITIES?.[entityId]?{tableId:'T_SYS_ENTITIES',recordId:entityId}:null;
 }
 if(tableId!=='T_CHAR_DOSSIER')return null;
 const entityId=characterEntityForDossier(state,recordId);
 return entityId?{tableId:'T_SYS_ENTITIES',recordId:entityId}:null;
}
