import {matrixRecordVisible,matrixFieldVisible} from './engine/prompt-boundary.mjs';

const clone=value=>structuredClone(value);
const clean=(value,limit=280)=>{
 const text=typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';
 return text?(text.length>limit?text.slice(0,limit-1)+'…':text):'';
};
const entityKinds={character:'人物',place:'地点',organization:'势力与群体',item:'器物',skill:'技艺',world:'世界'};
const splitAliases=value=>clean(value,600).split(/[、，,；;|]/u).map(v=>v.trim()).filter(Boolean);

// Build a small author-facing read model from the exact message snapshot. The
// model never authors these links and no latest-state fallback is permitted.
export function matrixArchiveLinkIndex(snapshot,{sourceId,contextKey,scope={}}={}){
 if(!snapshot?.state||snapshot.contextKey!==contextKey||snapshot.snapshotId!==sourceId)return {entries:[]};
 const state=snapshot.state,runtime=state.runtime?.scope??{},authorization={audience:'author',world_ref:scope.worldId??runtime.world_ref??null,session_ref:runtime.session_ref??null,branch_ref:runtime.branch_ref??null,phone_context_key:contextKey};
 const meta=new Map(Object.values(state.tables?.X_RECORD_META??{}).map(row=>[row.values.table_id+'#'+row.values.record_id,row.values])),visible=new Map(),entries=[];
 const allowed=(tableId,recordId)=>{
  const key=tableId+'#'+recordId;if(!visible.has(key))visible.set(key,matrixRecordVisible(state,tableId,recordId,authorization,meta));return visible.get(key);
 };
 const field=(tableId,recordId,key)=>{
  const row=state.tables?.[tableId]?.[recordId],spec=state.schema?.[tableId]?.fields?.find(field=>field.key===key);
  if(!row||!spec||!['known','derived'].includes(row.states?.[key])||!allowed(tableId,recordId)||!matrixFieldVisible(spec,row,authorization,tableId,state,recordId))return undefined;
  return row.values?.[key];
 };
 const text=(tableId,recordId,key,limit)=>clean(field(tableId,recordId,key),limit);
 const childTexts=(tableId,recordId,key)=>{
  const result=[],raw=field(tableId,recordId,key),spec=state.schema?.[tableId]?.fields?.find(item=>item.key===key);
  const append=value=>{
   if(typeof value==='string'&&spec?.ref&&state.tables?.[spec.ref]?.[value]){
    const child=value,narrative=text(spec.ref,child,'narrative')||text(spec.ref,child,'name')||text(spec.ref,child,'text_value');if(narrative)result.push(narrative);return;
   }
   if(Array.isArray(value)){for(const item of value)append(item);return;}
   if(value&&typeof value==='object'){for(const candidate of [value.narrative,value.name,value.text,value.value]){const valueText=clean(candidate);if(valueText){result.push(valueText);return;}}return;}
   const valueText=clean(value);if(valueText)result.push(...splitAliases(valueText));
  };
  append(raw);
  if(spec?.type==='CHILD_REF'&&spec.ref)for(const [childId,row]of Object.entries(state.tables?.[spec.ref]??{})){
   if(row.values?.owner_table!==tableId||row.values?.owner_row_uuid!==recordId||row.values?.owner_field!==key)continue;
   const value=text(spec.ref,childId,'narrative')||text(spec.ref,childId,'name')||text(spec.ref,childId,'text_value');if(value)result.push(value);
  }
  return [...new Set(result)];
 };
 const originOf=(tableId,recordId)=>{
  const referenceId=field(tableId,recordId,'origin_record_ref');if(typeof referenceId!=='string'||!allowed('M_FIELD_REFERENCES',referenceId))return null;
  const targetTable=text('M_FIELD_REFERENCES',referenceId,'target_table'),targetId=text('M_FIELD_REFERENCES',referenceId,'target_row_uuid');
  if(!targetTable||!targetId||text('M_FIELD_REFERENCES',referenceId,'owner_table')!==tableId||text('M_FIELD_REFERENCES',referenceId,'owner_row_uuid')!==recordId||!allowed(targetTable,targetId))return null;
  return {tableId:targetTable,recordId:targetId};
 };
 const add=({tableId,recordId,kind,title,names=[],fields=[]})=>{
  title=clean(title,80);names=[...new Set([title,...names.flatMap(value=>splitAliases(value))].map(name=>clean(name,80)).filter(name=>[...name].length>=2))];
  if(!title||!names.length)return;
  entries.push({reference:{tableId,recordId,snapshotId:sourceId},kind:clean(kind,40)||'档案',title,names,fields:fields.map(([label,value])=>[label,clean(value)]).filter(([,value])=>value).slice(0,4),contextKey,allowed:true});
 };
 const linkedDossiers=new Set();
 for(const [recordId]of Object.entries(state.tables?.T_SYS_ENTITIES??{})){
  if(!allowed('T_SYS_ENTITIES',recordId))continue;
  const origin=originOf('T_SYS_ENTITIES',recordId);if(origin?.tableId==='T_CHAR_DOSSIER')linkedDossiers.add(origin.recordId);
  const title=text('T_SYS_ENTITIES',recordId,'instance_name')||text('T_SYS_ENTITIES',recordId,'name')||(origin&&text(origin.tableId,origin.recordId,'name'));
  const kindValue=text('T_SYS_ENTITIES',recordId,'kind'),names=[...childTexts('T_SYS_ENTITIES',recordId,'aliases'),...childTexts('T_SYS_ENTITIES',recordId,'instance_aliases')];
  if(origin)names.push(text(origin.tableId,origin.recordId,'name'),...childTexts(origin.tableId,origin.recordId,'aliases'));
  const fields=[['简介',text('T_SYS_ENTITIES',recordId,'description')]];
  if(origin)fields.push(['公开身份',text(origin.tableId,origin.recordId,'public_identity')]);
  const runtimeId=text('T_SYS_ENTITIES',recordId,'runtime_state_ref');if(runtimeId&&allowed('T_DYN_ENTITY_STATE',runtimeId))fields.push(['当前外观',text('T_DYN_ENTITY_STATE',runtimeId,'live_appearance')],['当前姿态',text('T_DYN_ENTITY_STATE',runtimeId,'posture')]);
  const aliases=names.filter(name=>name!==title);if(aliases.length)fields.push(['别名',aliases.join('、')]);
  add({tableId:'T_SYS_ENTITIES',recordId,kind:entityKinds[kindValue]??kindValue??'对象',title,names,fields});
 }
 // Ordinary form writes register an origin dossier without manufacturing an
 // entity instance. Index that dossier directly; a visible linked entity remains
 // the single representative so the same name never becomes spuriously ambiguous.
 for(const [recordId]of Object.entries(state.tables?.T_CHAR_DOSSIER??{})){
  if(linkedDossiers.has(recordId)||!allowed('T_CHAR_DOSSIER',recordId))continue;
  add({tableId:'T_CHAR_DOSSIER',recordId,kind:'人物',title:text('T_CHAR_DOSSIER',recordId,'name'),names:childTexts('T_CHAR_DOSSIER',recordId,'aliases'),fields:[['公开身份',text('T_CHAR_DOSSIER',recordId,'public_identity')]]});
 }
 for(const [recordId]of Object.entries(state.tables?.T_DYN_CLUES??{}))if(allowed('T_DYN_CLUES',recordId))add({tableId:'T_DYN_CLUES',recordId,kind:'线索',title:text('T_DYN_CLUES',recordId,'name'),fields:[['阶段',text('T_DYN_CLUES',recordId,'stage')],['已出现',text('T_DYN_CLUES',recordId,'shown_content')]]});
 for(const [recordId]of Object.entries(state.tables?.T_DYN_EVENTS??{}))if(allowed('T_DYN_EVENTS',recordId)){
  const code=text('T_DYN_EVENTS',recordId,'short_code');add({tableId:'T_DYN_EVENTS',recordId,kind:'事件',title:text('T_DYN_EVENTS',recordId,'title'),names:[code],fields:[['短码',code],['梗概',text('T_DYN_EVENTS',recordId,'spine_digest')],['结果',text('T_DYN_EVENTS',recordId,'result')],['影响',text('T_DYN_EVENTS',recordId,'impact')]]});
 }
 for(const [recordId]of Object.entries(state.tables?.T_STATIC_WORLDS??{}))if(allowed('T_STATIC_WORLDS',recordId))add({tableId:'T_STATIC_WORLDS',recordId,kind:'世界',title:text('T_STATIC_WORLDS',recordId,'name'),fields:[['核心命题',text('T_STATIC_WORLDS',recordId,'core_proposition')]]});
 const targets=new Map(),ambiguous=new Set();
 for(const entry of entries)for(const name of entry.names){const key=entry.reference.tableId+'#'+entry.reference.recordId;if(targets.has(name)&&targets.get(name)!==key)ambiguous.add(name);else targets.set(name,key);}
 return {entries:entries.filter(entry=>entry.names.some(name=>!ambiguous.has(name))).map(entry=>({...entry,names:entry.names.filter(name=>!ambiguous.has(name))}))};
 }

export function archiveLinkTextIndex({entries=[]}={}){
 const names=new Map();for(const entry of entries)for(const name of entry.names??[]){if(!names.has(name))names.set(name,[]);names.get(name).push(entry);}
 return [...names.entries()].filter(([,matches])=>matches.length===1).map(([name,matches])=>({name,entry:clone(matches[0])})).sort((a,b)=>[...b.name].length-[...a.name].length||a.name.localeCompare(b.name,'zh-CN'));
}
