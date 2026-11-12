import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {acceptReply} from '../engine/reply.mjs';
import {recallCharacterFragments} from '../engine/character-knowledge.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
const scope={audience:'character',subject_ref:'a',branch_ref:'main'};
function fixture(){
 const e=new Runtime(initializeState(catalog,{branch_ref:'main'}));
 for(const [id,name]of [['a','阿青'],['b','阿白']]){e.newRecord('T_CHAR_DOSSIER',{name},'d-'+id);e.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:id,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'d-'+id,reference_kind:'record'},'o-'+id);e.newRecord('T_SYS_ENTITIES',{kind:'character',name,origin_record_ref:'o-'+id},id);}
 e.newRecord('T_STATIC_FACTS',{name:'后台命题标题',proposition:'BACKEND_TRUE_SECRET'},'f');
 e.newRecord('T_DYN_EVENTS',{title:'BACKEND_EVENT_TITLE',spine_digest:'BACKEND_EVENT_FACT',multi_party_psychology:'OTHER_PRIVATE_PSYCHOLOGY'},'event');
 e.newRecord('T_DYN_COGNITION',{name:'BACKEND_COG_TITLE',subject_ref:'a',target_fact_ref:'f',event_ref:'event',epistemic_level:'K1',subjective_belief:'他只听到门后响了一声',belief_truth_status:'部分正确'},'a-cog');
 e.newRecord('T_DYN_COGNITION',{name:'OTHER_COG_TITLE',subject_ref:'b',epistemic_level:'K3',subjective_belief:'OTHER_COG_PRIVATE'},'b-cog');
 e.newRecord('T_DYN_COGNITION',{name:'K0_TITLE_SECRET',subject_ref:'a',target_fact_ref:'f',epistemic_level:'K0',subjective_belief:'K0_BACKEND_VALUE'},'unseen');
 e.newRecord('T_DYN_EVENT_PARTICIPANTS',{event_ref:'event',entity_ref:'a',role:'witness',then_understanding:'他以为有人经过',psychology:'他有些疑惑'},'pa');
 e.newRecord('T_DYN_EVENT_PARTICIPANTS',{event_ref:'event',entity_ref:'b',role:'participant',psychology:'OTHER_PARTICIPANT_SECRET'},'pb');
 return e;
}
const all=slots=>Object.values(slots).join('\n');
test('explicit character sees their actual clue and own interpretation, never other minds or K0/backend facts',()=>{
 const e=fixture(),text=all(materials(e,scope));
 for(const expected of ['他只听到门后响了一声','他以为有人经过','他有些疑惑'])assert(text.includes(expected));
 for(const hidden of ['BACKEND_TRUE_SECRET','BACKEND_EVENT_TITLE','BACKEND_EVENT_FACT','OTHER_PRIVATE_PSYCHOLOGY','OTHER_COG_PRIVATE','OTHER_PARTICIPANT_SECRET','K0_TITLE_SECRET','K0_BACKEND_VALUE','BACKEND_COG_TITLE'])assert(!text.includes(hidden),hidden);
 const author=all(materials(e,{...scope,audience:'author'}));for(const value of ['BACKEND_TRUE_SECRET','OTHER_PRIVATE_PSYCHOLOGY','OTHER_COG_PRIVATE'])assert(author.includes(value),value);
});
test('confirmed K3 permits its exact fact; confidence, mistaken K3 and cross-branch cognition do not',()=>{
 const e=fixture();e.set('T_DYN_COGNITION#a-cog.epistemic_level','K3');e.set('T_DYN_COGNITION#a-cog.belief_truth_status','错误');assert(!all(materials(e,scope)).includes('BACKEND_TRUE_SECRET'));
 e.set('T_DYN_COGNITION#a-cog.belief_truth_status','正确');assert(all(materials(e,scope)).includes('BACKEND_TRUE_SECRET'));
 e.data.runtime.scope.branch_ref='other';e.newRecord('T_STATIC_FACTS',{name:'另一命题',proposition:'SECOND_SECRET'},'f2');e.newRecord('T_DYN_COGNITION',{name:'另一分支确认',subject_ref:'a',target_fact_ref:'f2',epistemic_level:'K3',belief_truth_status:'正确'},'foreign');e.data.runtime.scope.branch_ref='main';assert(!all(materials(e,scope)).includes('SECOND_SECRET'));
});
test('child record reference names obey the same character field boundary',()=>{
 const e=fixture();e.newRecord('M_CONDITIONS',{owner_table:'T_DYN_COGNITION',owner_row_uuid:'a-cog',owner_field:'understanding_scope',narrative:'仅听到声音'},'understanding');e.set('T_DYN_COGNITION#a-cog.understanding_scope','understanding');
 const text=all(materials(e,scope));assert(!text.includes('BACKEND_COG_TITLE'));assert(!text.includes('OTHER_COG_TITLE'));
});
function sourceFixture(){
 const e=fixture(),raw='<reply><title>纸条</title><body>1 阿青捡起纸条，只看清半个名字。\n\n2 门后那人想起另一张纸条，私下决定销毁证据。</body><cells/><archive/></reply>';
 acceptReply(e,raw,'m1');const own=e.rows('T_DYN_COGNITION')['a-cog'];own.metadata.archive_source={source_key:'main/m1@1',paragraphs:['P1']};
 const fragments=Object.entries(e.rows('T_SYS_SOURCE_FRAGMENTS')),allow=(paragraph,decision='allow')=>{const [id]=fragments.find(([,r])=>r.values.paragraph_id===paragraph);e.newRecord('M_ACCESS_RULES',{owner_table:'T_SYS_SOURCE_FRAGMENTS',owner_row_uuid:id,owner_field:'chunk_text',audience_kind:'character',audience_entity_ref:'a',permission:'read',decision},paragraph+'-'+decision);};
 return {e,allow};
}
test('provenance is not a read grant: character recall selects only explicitly readable known paragraphs before matching',()=>{
 const {e,allow}=sourceFixture();assert.deepEqual(recallCharacterFragments(e,'纸条',scope),[]);allow('P1');allow('P2');
 const hits=recallCharacterFragments(e,'纸条',scope);assert.equal(hits.length,1);assert.deepEqual(hits[0].fragments.map(f=>f.paragraph_id),['P1']);assert.equal(hits[0].fragments[0].raw_block,e.data.runtime.sources['main/m1@1'].fragments[0].raw_block);
 assert.deepEqual(recallCharacterFragments(e,'销毁证据',scope),[]);const projected=all(materials(e,scope,'纸条'));assert(!projected.includes('销毁证据'));
 allow('P1','deny');assert.deepEqual(recallCharacterFragments(e,'纸条',scope),[]);
});
test('K0 never gains source access from an event link or even a paragraph read grant',()=>{
 const {e,allow}=sourceFixture();allow('P1');e.set('T_DYN_COGNITION#a-cog.epistemic_level','K0');assert.deepEqual(recallCharacterFragments(e,'纸条',scope),[]);
});
test('readable character fragments preserve integrity errors; author and reader retrieval remain complete',()=>{
 const {e,allow}=sourceFixture();allow('P1');assert(all(materials(e,{audience:'reader',subject_ref:'a',branch_ref:'main'},'纸条')).includes('销毁证据'));
 e.data.runtime.sources['main/m1@1'].fragments[0].raw_block+='corrupt';assert.throws(()=>recallCharacterFragments(e,'纸条',scope),/校验不一致/);
});
test('two form groups use one field catalog and keep empty-database current business creation surfaces',()=>{
 const e=new Runtime(initializeState(catalog)),form=materials(e,{}).tisya_material_cell_prompts;
 assert(form.includes('cells 可填写的表单：'));assert(form.includes('archive 可填写的表单：'));
 for(const table of ['T_SYS_ENTITIES','T_CHAR_DOSSIER','T_DYN_TASKS','T_DYN_ENTITY_STATE','T_DYN_EVENTS','T_DYN_COGNITION'])assert(form.includes('【'+e.data.schema[table].label+'／序号】'),table);
 assert.equal((form.match(/两组共用填写方法/g)??[]).length,1);
 const labels=[...form.matchAll(/^【(.+)／序号】$/gm)].map(m=>m[1]);assert.equal(labels.length,new Set(labels).size,'shared child fields are not duplicated');
});
