import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {acceptReply} from '../engine/reply.mjs';
import {recallCharacterFragments,subjectIdentities} from '../engine/character-knowledge.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const scope={audience:'character',subject_ref:'a',branch_ref:'main'};
const all=slots=>Object.values(slots).join('\n');
function fixture(){
 const e=new Runtime(initializeState(catalog,{branch_ref:'main'}));
 for(const [id,name]of [['a','甲'],['b','乙']]){
  e.newRecord('T_CHAR_DOSSIER',{name,overall_physique:'PUBLIC_SHAPE_'+id,voice:'PUBLIC_VOICE_'+id,public_identity:'PUBLIC_JOB_'+id,mask_presentation:'PUBLIC_MASK_'+id,mask_gap:'PRIVATE_MASK_'+id,short_term_plans:'PRIVATE_PLAN_'+id,desire_double_helix:'PRIVATE_MOTIVE_'+id},'d-'+id);
  e.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:id,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'d-'+id,reference_kind:'record'},'o-'+id);
  e.newRecord('T_SYS_ENTITIES',{kind:'character',name,origin_record_ref:'o-'+id},id);
 }
 e.newRecord('T_DYN_COGNITION',{name:'OWN_COG_BACKEND_TITLE',subject_ref:'a',epistemic_level:'K1',subjective_belief:'只看见纸条'},'own');
 return e;
}
function sourceFixture(field='chunk_text'){
 const e=fixture();acceptReply(e,'<reply><title>纸条</title><body>1 甲看见纸条。\n\n2 乙另有秘密计划。</body><cells/><archive/></reply>','m1');
 e.rows('T_DYN_COGNITION').own.metadata.archive_source={source_key:'main/m1@1',paragraphs:['P1']};
 const [id,row]=Object.entries(e.rows('T_SYS_SOURCE_FRAGMENTS')).find(([,r])=>r.values.paragraph_id==='P1');
 const grant={owner_table:'T_SYS_SOURCE_FRAGMENTS',owner_row_uuid:id,owner_field:field,audience_kind:'character',audience_entity_ref:'a',permission:'read',decision:'allow'};
 e.newRecord('M_ACCESS_RULES',grant,'grant');return {e,id,row,grant};
}

test('only explicit character views narrow private dossiers, retaining their own and other public presentation',()=>{
 const e=fixture();
 for(const selected of [scope,{subject_ref:'a',branch_ref:'main'},{...scope,subject_ref:'d-a'}]){
  const text=all(materials(e,selected));
  for(const value of ['PRIVATE_MASK_a','PRIVATE_PLAN_a','PRIVATE_MOTIVE_a','PUBLIC_SHAPE_b','PUBLIC_VOICE_b','PUBLIC_JOB_b','PUBLIC_MASK_b'])assert(text.includes(value),value);
  for(const value of ['PRIVATE_MASK_b','PRIVATE_PLAN_b','PRIVATE_MOTIVE_b'])assert(!text.includes(value),value);
 }
 for(const selected of [{branch_ref:'main'},...['author','reader','player'].map(audience=>({...scope,audience}))]){
  const text=all(materials(e,selected));for(const value of ['PRIVATE_MASK_b','PRIVATE_PLAN_b','PRIVATE_MOTIVE_b'])assert(text.includes(value),value);
 }
});

test('a stale or foreign origin pointer cannot make another dossier the subject; legal same-ID legacy identity survives',()=>{
 for(const alter of [e=>e.set('T_SYS_ENTITIES#a.origin_record_ref','o-b'),e=>e.set('T_SYS_ENTITIES#a.origin_record_ref','o-a','unknown')]){
  const e=fixture();alter(e);assert(!subjectIdentities(e.data,scope).has('d-b'));assert(!all(materials(e,scope)).includes('PRIVATE_PLAN_b'));
 }
 const e=fixture();e.newRecord('T_SYS_ENTITIES',{kind:'character',name:'丙'},'c');e.newRecord('T_CHAR_DOSSIER',{name:'丙',short_term_plans:'LEGACY_OWN_PLAN'},'c');
 assert(all(materials(e,{...scope,subject_ref:'c'})).includes('LEGACY_OWN_PLAN'));
});

test('main and non-main character form references hide other minds and private owned details; author tasks keep them',()=>{
 const e=fixture();e.newRecord('T_DYN_COGNITION',{name:'OTHER_COG_PRIVATE_TITLE',subject_ref:'b',epistemic_level:'K3',subjective_belief:'乙另有打算'},'other');
 e.newRecord('M_CONDITIONS',{owner_table:'T_CHAR_DOSSIER',owner_row_uuid:'d-b',owner_field:'negotiation_conditions',narrative:'PRIVATE_NEGOTIATION'},'private-child');e.set('T_CHAR_DOSSIER#d-b.negotiation_conditions','private-child');
 e.newRecord('M_CONDITIONS',{owner_table:'T_DYN_COGNITION',owner_row_uuid:'own',owner_field:'understanding_scope',narrative:'只听到动静'},'own-scope');e.set('T_DYN_COGNITION#own.understanding_scope','own-scope');
 const options={operationId:'knowledge-regression',scope,tableIds:['T_DYN_COGNITION','T_CHAR_DOSSIER'],expandReferences:'children'};
 for(const task of ['main','tableGenesis','tableAssistant']){
  const sheet=prepareMatrixSheets({state:e.data},{...options,task});assert(!sheet.referenceText.includes('OTHER_COG_PRIVATE_TITLE'));assert(!sheet.referenceText.includes('OWN_COG_BACKEND_TITLE'));assert(!sheet.references.some(r=>r.recordId==='private-child'));assert(sheet.references.some(r=>r.recordId==='own-scope'));
 }
 const author=prepareMatrixSheets({state:e.data},{...options,task:'tableGenesis',scope:{...scope,audience:'author'}});
 assert(author.referenceText.includes('OTHER_COG_PRIVATE_TITLE'));assert(author.references.some(r=>r.recordId==='private-child'));
});

test('a metadata-field grant does not read paragraph text and an unrelated field denial does not erase a valid text grant',()=>{
 assert.deepEqual(recallCharacterFragments(sourceFixture('entry_hash').e,'纸条',scope),[]);
 const {e,grant}=sourceFixture();e.newRecord('M_ACCESS_RULES',{...grant,owner_field:'entry_hash',decision:'deny'},'metadata-denial');
 assert.equal(recallCharacterFragments(e,'纸条',scope).length,1);
 e.newRecord('M_ACCESS_RULES',{...grant,decision:'deny'},'text-denial');assert.deepEqual(recallCharacterFragments(e,'纸条',scope),[]);
});

test('unknown grant states and unresolved conditions never authorize retained old values',()=>{
 for(const alter of [
  e=>e.set('M_ACCESS_RULES#grant.decision','allow','unknown'),
  e=>e.set('M_ACCESS_RULES#grant.owner_field','chunk_text','unknown'),
  e=>e.set('M_ACCESS_RULES#grant.value_state','unknown'),
  e=>e.set('M_ACCESS_RULES#grant.value_state','known','unknown'),
  e=>e.set('M_ACCESS_RULES#grant.condition_ref',null,'unknown'),
 ]){const {e}=sourceFixture();alter(e);assert.deepEqual(recallCharacterFragments(e,'纸条',scope),[]);}
 assert.equal(recallCharacterFragments(sourceFixture().e,'纸条',scope).length,1);
});

test('source locator and paragraph identity cannot disagree even when substituted fragment hashes are valid',()=>{
 const {e,row}=sourceFixture(),second=e.data.runtime.sources['main/m1@1'].fragments[1];
 Object.assign(row.values,{paragraph_id:'P2',chunk_text:second.raw_block,chunk_hash:second.sha256});
 assert.throws(()=>recallCharacterFragments(e,'秘密计划',scope),error=>error.code==='SOURCE_INTEGRITY');
});

test('K0 K1 K2 K_MIS and stale K3 truth flags never expose backend facts or cognition titles',()=>{
 for(const level of ['K0','K1','K2','K_MIS']){
  const e=fixture();e.newRecord('T_STATIC_FACTS',{name:'BACKEND_FACT_TITLE',proposition:'BACKEND_TRUE'},'f');e.set('T_DYN_COGNITION#own.target_fact_ref','f');e.set('T_DYN_COGNITION#own.epistemic_level',level);e.set('T_DYN_COGNITION#own.belief_truth_status','正确');
  const text=all(materials(e,scope));assert(!text.includes('BACKEND_TRUE'));assert(!text.includes('BACKEND_FACT_TITLE'));assert(!text.includes('OWN_COG_BACKEND_TITLE'));if(level!=='K0')assert(text.includes('只看见纸条'));
 }
 for(const field of ['epistemic_level','belief_truth_status']){
  const e=fixture();e.newRecord('T_STATIC_FACTS',{name:'BACKEND_FACT_TITLE',proposition:'BACKEND_TRUE'},'f');e.set('T_DYN_COGNITION#own.target_fact_ref','f');e.set('T_DYN_COGNITION#own.epistemic_level','K3');e.set('T_DYN_COGNITION#own.belief_truth_status','正确');e.set(`T_DYN_COGNITION#own.${field}`,field==='epistemic_level'?'K3':'正确','unknown');
  const text=all(materials(e,scope));assert(!text.includes('BACKEND_TRUE'));assert(!text.includes('BACKEND_FACT_TITLE'));assert(!text.includes('OWN_COG_BACKEND_TITLE'));
 }
});

test('staged archive and pending-work names do not bypass character projection while author views keep the work queue',()=>{
 const e=fixture(),schema=e.data.schema.T_STATIC_FACTS;
 const line=(key,value)=>{const i=schema.fields.findIndex(f=>f.key===key);return `${i+1} ${schema.fields[i].label}：${value} | P1`;};
 const raw=`<reply><title>未公开</title><body>1 幕后另有安排。</body><cells/><archive format="form">【${schema.label}／1】\n${line('name','PENDING_BACKEND_TITLE')}\n${line('proposition','?')}</archive></reply>`;
 assert.equal(acceptReply(e,raw,'m2').status,'COMMITTED');assert.equal(e.data.runtime.archive_queue[0].status,'staged');
 assert(!all(materials(e,scope)).includes('PENDING_BACKEND_TITLE'));
 for(const audience of ['author','reader'])assert(all(materials(e,{...scope,audience})).includes('PENDING_BACKEND_TITLE'));
});

test('unknown subject, participation, clue and scope fields cannot authorize their retained old values',()=>{
 const cases=[
  ['T_DYN_EVENT_PARTICIPANTS','entity_ref','a',{entity_ref:'a',role:'witness',psychology:'PRIVATE_PARTICIPATION'},'PRIVATE_PARTICIPATION'],
  ['T_DYN_EVENT_PARTICIPANTS','role','witness',{entity_ref:'a',role:'witness',psychology:'PRIVATE_PARTICIPATION'},'PRIVATE_PARTICIPATION'],
  ['T_CHAR_ANCHORS','char_ref','d-a',{char_ref:'d-a',name:'自己的锚点',internal_motive:'PRIVATE_ANCHOR'},'PRIVATE_ANCHOR'],
  ['T_CHAR_RELATION_ORIGINS','subject_ref','a',{subject_ref:'a',target_ref:'b',nature:'PRIVATE_RELATION'},'PRIVATE_RELATION'],
  ['T_DYN_CLUES','visibility','特定角色已知',{visibility:'特定角色已知',cognition_change_ref:'own',shown_content:'PRIVATE_CLUE'},'PRIVATE_CLUE'],
  ['T_DYN_CLUES','cognition_change_ref','own',{visibility:'特定角色已知',cognition_change_ref:'own',shown_content:'PRIVATE_CLUE'},'PRIVATE_CLUE'],
  ['T_DYN_CLUES','visibility','全体公开',{visibility:'全体公开',shown_content:'PRIVATE_CLUE'},'PRIVATE_CLUE'],
 ];
 for(const [table,field,oldValue,values,marker]of cases){
  const e=fixture();e.newRecord(table,values,'tested');assert(all(materials(e,scope)).includes(marker));
  e.set(`${table}#tested.${field}`,oldValue,'unknown');assert(!all(materials(e,scope)).includes(marker),table+'.'+field);
  for(const audience of ['author','reader'])assert(all(materials(e,{...scope,audience})).includes(marker));
 }
 const e=fixture();e.newRecord('T_DYN_CLUES',{visibility:'特定角色已知',cognition_change_ref:'own',revealed_content:'PRIVATE_STALE_CLUE'},'clue');
 e.set('T_DYN_COGNITION#own.epistemic_level','K1','unknown');assert(!all(materials(e,scope)).includes('PRIVATE_STALE_CLUE'));
 const other=fixture();other.set('T_DYN_COGNITION#own.subject_ref','a','unknown');assert(!all(materials(other,scope)).includes('只看见纸条'));
 const scoped=fixture(),meta=Object.entries(scoped.rows('X_RECORD_META')).find(([,r])=>r.values.table_id==='T_DYN_COGNITION'&&r.values.record_id==='own');
 assert(meta);scoped.set(`X_RECORD_META#${meta[0]}.scope_branch_id`,'main','unknown');assert(!all(materials(scoped,scope)).includes('只看见纸条'));
});
