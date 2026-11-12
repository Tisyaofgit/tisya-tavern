import {clone,sha256,fail} from './common.mjs';

// An author/reader view is not a character's knowledge. Only an explicitly
// selected subject activates this projection; ordinary authoring stays intact.
export const characterSubject=scope=>scope?.subject_ref&&!['author','reader','player'].includes(scope.audience)?scope.subject_ref:null;
const rows=(state,id)=>Object.values(state.tables?.[id]??{});
const knownValue=(row,key)=>['known','derived'].includes(row?.states?.[key])?row.values?.[key]:undefined;
export function inKnowledgeScope(state,tableId,recordId,scope){
 const record=state.tables?.[tableId]?.[recordId];if(!record)return false;
 const meta=rows(state,'X_RECORD_META').filter(r=>r.values.table_id===tableId&&r.values.record_id===recordId);
 if(meta.some(r=>knownValue(r,'table_id')!==tableId||knownValue(r,'record_id')!==recordId))return false;
 return ![['world_ref','scope_world_id'],['session_ref','scope_session_id'],['branch_ref','scope_branch_id']].some(([key,field])=>scope[key]&&[...meta,record].some(row=>{
  if(!Object.hasOwn(row.values,field)&&!Object.hasOwn(row.states??{},field))return false;
  if(['none','cleared','not_applicable'].includes(row.states?.[field]))return false;
  if(!['known','derived'].includes(row.states?.[field]))return true;
  const value=knownValue(row,field);return value&&!['GLOBAL',scope[key]].includes(value);
 }));
}
function entityDossier(state,id,row,scope){
 if(!inKnowledgeScope(state,'T_SYS_ENTITIES',id,scope))return null;
 const selected=knownValue(row,'origin_record_ref');
 // Older same-ID dossiers remain readable, but an unset/unknown existing link
 // cannot silently become a different identity or revive its stale target.
 if(!Object.hasOwn(row.values,'origin_record_ref')&&!row.states?.origin_record_ref)return state.tables?.T_CHAR_DOSSIER?.[id]&&inKnowledgeScope(state,'T_CHAR_DOSSIER',id,scope)?id:null;
 if(typeof selected!=='string'||!inKnowledgeScope(state,'T_SYS_ENTITIES',id,scope)||!inKnowledgeScope(state,'M_FIELD_REFERENCES',selected,scope))return null;
 const ref=state.tables?.M_FIELD_REFERENCES?.[selected];
 if(knownValue(ref,'owner_table')!=='T_SYS_ENTITIES'||knownValue(ref,'owner_row_uuid')!==id||knownValue(ref,'owner_field')!=='origin_record_ref'||knownValue(ref,'target_table')!=='T_CHAR_DOSSIER')return null;
 const dossier=knownValue(ref,'target_row_uuid');return dossier&&inKnowledgeScope(state,'T_CHAR_DOSSIER',dossier,scope)?dossier:null;
}
function subjectDossiers(state,scope){
 const subject=characterSubject(scope),entity=state.tables?.T_SYS_ENTITIES?.[subject];
 if(entity){const dossier=entityDossier(state,subject,entity,scope);return new Set(dossier?[dossier]:[]);}
 return new Set(subject&&inKnowledgeScope(state,'T_CHAR_DOSSIER',subject,scope)?[subject]:[]);
}
export function subjectIdentities(state,scope){
 const subject=characterSubject(scope),ids=new Set(subject?[subject]:[]);if(!subject)return ids;
 const dossiers=subjectDossiers(state,scope);for(const id of dossiers)ids.add(id);
 if(!state.tables?.T_SYS_ENTITIES?.[subject]){
  const linked=Object.entries(state.tables?.T_SYS_ENTITIES??{}).filter(([id,row])=>dossiers.has(entityDossier(state,id,row,scope)));
  if(linked.length===1)ids.add(linked[0][0]);
 }
 return ids;
}
// These fields describe the presented person. Their hidden motives, plans,
// history and private identity are not implicitly shared with another actor.
const publicDossierFields=new Set(['name','gender','pronouns','public_identity','social_identity_duty','overall_physique','facial_features','habitual_bearing','habitual_attire','sensory_impression','mask_presentation','diction','voice','cadence','humor','manifest']);
function ownCognitions(state,scope){const ids=subjectIdentities(state,scope);return Object.entries(state.tables?.T_DYN_COGNITION??{}).filter(([id,r])=>ids.has(knownValue(r,'subject_ref'))&&inKnowledgeScope(state,'T_DYN_COGNITION',id,scope));}
function confirmedFact(state,recordId,scope){
 return ownCognitions(state,scope).some(([,r])=>knownValue(r,'target_fact_ref')===recordId&&knownValue(r,'epistemic_level')==='K3'&&knownValue(r,'belief_truth_status')==='正确');
}
export function characterRecordVisible(state,tableId,recordId,scope){
 if(!characterSubject(scope))return true;
 const row=state.tables?.[tableId]?.[recordId],v=row?.values??{},ids=subjectIdentities(state,scope);
 if(!row||!inKnowledgeScope(state,tableId,recordId,scope))return false;
 if(tableId==='T_DYN_COGNITION')return ids.has(knownValue(row,'subject_ref'))&&!!knownValue(row,'epistemic_level')&&knownValue(row,'epistemic_level')!=='K0';
 if(tableId==='T_STATIC_FACTS')return confirmedFact(state,recordId,scope);
 // Whole events and cross-event summaries can contain several people's private
// causes. A character gets their cognition/participation record, not that spine.
 if(['T_DYN_EVENTS','T_DYN_EVENT_LINKS','T_DYN_STAGE_SUMMARIES','T_CHAR_SECRETS'].includes(tableId))return false;
 if(tableId==='T_DYN_EVENT_PARTICIPANTS')return ids.has(knownValue(row,'entity_ref'))&&['participant','witness','hearsay'].includes(knownValue(row,'role'));
 if(tableId==='T_CHAR_ANCHORS')return ids.has(knownValue(row,'char_ref'));
 if(tableId==='T_CHAR_RELATION_ORIGINS')return ids.has(knownValue(row,'subject_ref'));
 if(tableId==='T_DYN_CLUES'){
  if(knownValue(row,'visibility')==='全体公开')return true;
  return knownValue(row,'visibility')==='特定角色已知'&&ownCognitions(state,scope).some(([id,r])=>id===knownValue(row,'cognition_change_ref')&&knownValue(r,'epistemic_level')&&knownValue(r,'epistemic_level')!=='K0');
 }
 return true;
}
export function characterFieldVisible(state,tableId,recordId,field,scope){
 if(!characterSubject(scope))return true;
 const v=state.tables?.[tableId]?.[recordId]?.values??{};
 if(tableId==='T_CHAR_DOSSIER')return subjectDossiers(state,scope).has(recordId)||publicDossierFields.has(field);
 if(tableId==='T_DYN_COGNITION'){
  if(['belief_truth_status','secret_ref','asset_ref','disclosure_permission','auth_basis'].includes(field))return false;
  if(field==='name'){const row=state.tables?.[tableId]?.[recordId];return knownValue(row,'epistemic_level')==='K3'&&knownValue(row,'belief_truth_status')==='正确';}
  if(field==='target_fact_ref'){const row=state.tables?.[tableId]?.[recordId];return knownValue(row,'epistemic_level')==='K3'&&knownValue(row,'belief_truth_status')==='正确';}
  if(field==='event_ref')return false;
  const level=knownValue(state.tables?.[tableId]?.[recordId],'epistemic_level');
  if((!level||level==='K0')&&!['subject_ref','epistemic_level'].includes(field))return false;
 }
 if(tableId==='T_STATIC_FACTS'&&['evidence','validation_status','alternative_fact_ref','world_rule_ref'].includes(field))return false;
 if(tableId==='T_DYN_EVENT_PARTICIPANTS'&&field==='event_ref')return false;
 if(tableId==='T_CHAR_RELATION_ORIGINS'&&field==='understanding_difference')return false;
 if(tableId==='T_DYN_CLUES'&&!['name','shown_content','visibility','object_ref','revealed_content'].includes(field))return false;
 return true;
}

// A provenance pointer proves where a statement came from; it does not grant
// access to the whole reply. Reuse the existing access-rule and fragment tables
// for explicit read grants. Denials win, conditional/absent grants stay closed.
export function recallCharacterFragments(engine,query,scope){
 const state=engine.data,ids=subjectIdentities(state,scope),evidence=new Set(),grants=new Set(),denials=new Set();
 const addSource=row=>{const source=row.metadata?.archive_source;if(source?.source_key)for(const p of source.paragraphs??[])evidence.add(source.source_key+'#'+p);};
 for(const [,r]of ownCognitions(state,scope))if(knownValue(r,'epistemic_level')&&knownValue(r,'epistemic_level')!=='K0')addSource(r);
 for(const [id,r]of Object.entries(state.tables?.T_DYN_EVENT_PARTICIPANTS??{}))if(ids.has(knownValue(r,'entity_ref'))&&['participant','witness','hearsay'].includes(knownValue(r,'role'))&&inKnowledgeScope(state,'T_DYN_EVENT_PARTICIPANTS',id,scope))addSource(r);
 for(const [id,r]of Object.entries(state.tables?.M_ACCESS_RULES??{})){
  const v=r.values;if((knownValue(r,'owner_table')??knownValue(r,'owner_form'))!=='T_SYS_SOURCE_FRAGMENTS'||knownValue(r,'owner_field')!=='chunk_text'||knownValue(r,'permission')!=='read'||!knownValue(r,'owner_row_uuid')||!inKnowledgeScope(state,'M_ACCESS_RULES',id,scope))continue;
  const audience=knownValue(r,'audience_kind');if(audience!=='public'&&!(audience==='character'&&ids.has(knownValue(r,'audience_entity_ref'))))continue;
  if(Object.hasOwn(v,'value_state')&&!['known','AUTO'].includes(knownValue(r,'value_state')))continue;
  if(knownValue(r,'decision')==='deny')denials.add(v.owner_row_uuid);else if(knownValue(r,'decision')==='allow'&&!v.condition_ref&&!['unknown','unset'].includes(r.states.condition_ref))grants.add(v.owner_row_uuid);
 }
 const terms=query.split(/[\s/,，；;]+/).filter(Boolean),selected=new Map();
 for(const [id,r]of Object.entries(state.tables?.T_SYS_SOURCE_FRAGMENTS??{})){
  const v=r.values;if(!grants.has(id)||denials.has(id)||!evidence.has(v.source_locator)||!inKnowledgeScope(state,'T_SYS_SOURCE_FRAGMENTS',id,scope))continue;
  const at=v.source_locator.lastIndexOf('#'),sourceKey=v.source_locator.slice(0,at),source=state.runtime.sources?.[sourceKey];
  if(at<0||v.source_locator.slice(at+1)!==v.paragraph_id)fail('SOURCE_INTEGRITY','原文定位与段号不一致',{source_key:sourceKey,paragraph:v.paragraph_id});
  if(!source||scope.branch_ref&&source.branch!==scope.branch_ref)continue;
  const fragment=source.fragments?.find(f=>f.paragraph_id===v.paragraph_id);if(!fragment)fail('SOURCE_INTEGRITY','已授权段落缺少原文',{source_key:sourceKey,paragraph:v.paragraph_id});
  if(source.entry_id!==v.entry_id||source.revision!==v.revision||source.body_sha256!==v.entry_hash||sha256(source.body_raw)!==source.body_sha256||sha256(fragment.raw_block)!==fragment.sha256||fragment.raw_block!==v.chunk_text||fragment.sha256!==v.chunk_hash)fail('SOURCE_INTEGRITY','已授权原文或段落校验不一致',{source_key:sourceKey,paragraph:v.paragraph_id});
  const hits=terms.filter(t=>fragment.raw_block.includes(t));if(terms.length&&!hits.length)continue;
  if(!selected.has(sourceKey))selected.set(sourceKey,{source_key:sourceKey,entry_id:source.entry_id,revision:source.revision,body_sha256:source.body_sha256,matched_terms:[],fragments:[]});
  const match=selected.get(sourceKey);match.matched_terms.push(...hits);match.fragments.push(clone(fragment));
 }
 return [...selected.values()].map(hit=>({...hit,matched_terms:[...new Set(hit.matched_terms)],fragments:hit.fragments.sort((a,b)=>a.chunk_index-b.chunk_index)}));
}
