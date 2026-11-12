import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {acceptReply} from '../engine/reply.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import legacyFixture from './fixtures/reply-form-legacy-staged.json' with {type:'json'};
import {replyFormTableIds,REPLY_FORM_OWNERSHIP_VERSION} from '../engine/reply-form-ownership.mjs';

const fresh=()=>new Runtime(initializeState(catalog,{session_ref:'ownership-test',branch_ref:'main',audience:'author'}));
function seed(){
 const e=fresh();
 for(const [id,name]of [['a','阿青'],['b','阿白']]){
  e.newRecord('T_CHAR_DOSSIER',{name},'d-'+id);
  e.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:id,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'d-'+id,reference_kind:'record',resolution_status:'resolved'},'o-'+id);
  e.newRecord('T_SYS_ENTITIES',{name,kind:'character',origin_record_ref:'o-'+id},id);
 }
 return e;
}
function form(e,tableId,values,{recordId,number=1}={}){
 const c=prepareMatrixSheets({state:e.data},{operationId:'test-preview',kind:'rows',task:'main',mode:'revise'}),t=c.catalog.templates.find(t=>t.id===tableId);
 assert(t,tableId);const heading=recordId?c.references.find(r=>r.tableId===tableId&&r.recordId===recordId)?.display:t.label+'／'+number;assert(heading,recordId);
 return '【'+heading+'】\n'+Object.entries(values).map(([key,value])=>{const f=t.fields.find(f=>f.key===key);assert(f,tableId+'.'+key);return f.row+' '+f.label+'：'+value+' | P1';}).join('\n');
}
function reply(cells='',archive='',body='1 阿青抵达门前，看见木盒，记下本次见闻。'){
 return '<reply><title>门前</title><body>'+body+'</body><extra/><'+(cells?'cells format="form">'+cells+'</cells>':'cells/>')+'<vars/>'+(archive?'<archive format="form">'+archive+'</archive>':'<archive/>')+'<actions/></reply>';
}
const accept=(e,cells='',archive='',id='m1')=>acceptReply(e,reply(cells,archive),id);
const business=e=>Object.fromEntries(Object.entries(e.data.tables).filter(([id])=>!['T_SYS_SOURCE_FRAGMENTS','T_SYS_ARCHIVE_BATCHES','X_RECORD_META'].includes(id)));
const rows=(e,id)=>Object.values(e.rows(id));

test('current forms create canonical people immediately and archive can reference them in the same reply',()=>{
 const e=fresh(),cells=form(e,'T_CHAR_DOSSIER',{name:'阿青',public_identity:'记账人'})+'\n'+form(e,'T_DYN_ENTITY_GAUGES',{name:'余力',entity_id:'阿青',field_key:'energy',value:12,effective_from:'原文：抵达门前时'});
 const archive=form(e,'T_DYN_EVENTS',{title:'抵达门前',spine_digest:'阿青抵达门前，看见木盒',story_time:'原文：当天上午'})+'\n'+form(e,'T_DYN_COGNITION',{name:'木盒见闻',subject_ref:'阿青',event_ref:'双层历史事件／1',epistemic_level:'K3',subjective_belief:'知道门前有木盒',belief_truth_status:'正确'});
 const raw=reply(cells,archive),r=acceptReply(e,raw,'m1');
 assert.equal(r.result.operations[0].status,'COMMITTED',JSON.stringify(r.result));
 assert.equal(rows(e,'T_CHAR_DOSSIER').length,1);assert.equal(rows(e,'T_SYS_ENTITIES').length,1);assert.equal(rows(e,'T_DYN_ENTITY_GAUGES')[0].values.value,12);
 assert.equal(rows(e,'T_DYN_EVENTS').length,0);assert.equal(e.data.runtime.archive_queue[0].status,'staged',JSON.stringify(e.data.runtime.archive_queue[0].error));
 assert.equal(e.data.runtime.archive_queue[0].plan.ownership_version,REPLY_FORM_OWNERSHIP_VERSION);
 accept(e,'','','m2');assert.equal(rows(e,'T_DYN_EVENTS').length,0);accept(e,'','','m3');
 const event=rows(e,'T_DYN_EVENTS')[0],actor=Object.keys(e.rows('T_SYS_ENTITIES'))[0],cognition=rows(e,'T_DYN_COGNITION')[0];
 assert(event);assert.equal(cognition.values.subject_ref,actor);assert.equal(cognition.values.event_ref,event.values.row_uuid);assert.equal(event.values.source_paragraphs,'P1');
 assert.equal(e.data.runtime.sources['main/m1@1'].reply_raw,raw);
 assert.deepEqual(rows(e,'M_WORLD_TIME').map(r=>r.values.owner_table).sort(),['T_DYN_ENTITY_GAUGES','T_DYN_EVENTS'].sort());
});

test('a memory record in cells rejects the whole form and retains the exact reply',()=>{
 const e=seed(),before=structuredClone(business(e));
 const cells=form(e,'T_DYN_ENTITY_GAUGES',{name:'余力',entity_id:'阿青',value:12})+'\n'+form(e,'T_DYN_EVENTS',{title:'放错入口的事件'}),raw=reply(cells),r=acceptReply(e,raw,'wrong-cells');
 assert.equal(r.result.operations[0].status,'FAILED');assert.equal(r.result.operations[0].error.code,'REPLY_FORM_OWNERSHIP');assert.equal(r.result.operations[0].error.details.expected,'archive');
 assert.deepEqual(business(e),before);assert.equal(e.data.runtime.sources['main/wrong-cells@1'].reply_raw,raw);
});

test('a current state record in archive rejects the whole memory batch without moving it into cells',()=>{
 const e=seed(),before=structuredClone(business(e)),archive=form(e,'T_DYN_EVENTS',{title:'本来可归档的事件'})+'\n'+form(e,'T_DYN_ENTITY_GAUGES',{name:'余力',entity_id:'阿青',value:12}),raw=reply('',archive);
 acceptReply(e,raw,'wrong-archive');accept(e,'','','m2');accept(e,'','','m3');
 const batch=e.data.runtime.archive_queue[0];assert.equal(batch.status,'blocked');assert.equal(batch.error.code,'REPLY_FORM_OWNERSHIP');assert.equal(batch.error.details.expected,'cells');
 assert.deepEqual(business(e),before);assert.equal(e.data.runtime.sources['main/wrong-archive@1'].reply_raw,raw);
});

test('the presentation contract uses immediate forms for messages, blocks, items and media bindings',()=>{
 for(const [table,values]of [
  ['T_DYN_MESSAGE_CONTENT',{kind:'text',text:'渡口今天开放'}],
  ['T_DYN_EXTENSION_BLOCKS',{kind:'forum',title:'渡口公告',text:'本日开放'}],
  ['T_DYN_EXTENSION_ITEMS',{block_ref:'已有公告',text:'已收到',floor:1}],
  ['T_SYS_MEDIA_ASSETS',{kind:'图像',purpose:'已授权的中性示意图'}]
 ]){
  const e=fresh();if(table==='T_DYN_EXTENSION_ITEMS')e.newRecord('T_DYN_EXTENSION_BLOCKS',{kind:'forum',title:'已有公告'},'notice');
  const before=structuredClone(business(e)),text=form(e,table,values),raw=reply('',text);acceptReply(e,raw,'wrong');
  assert.equal(e.data.runtime.archive_queue[0].error.code,'REPLY_FORM_OWNERSHIP',table);assert.equal(e.data.runtime.archive_queue[0].error.details.table,table);assert.deepEqual(business(e),before);assert.equal(e.data.runtime.sources['main/wrong@1'].reply_raw,raw);
  const r=accept(e,text,'','correct');assert.equal(r.result.operations[0].status,'COMMITTED',JSON.stringify(r.result));assert.equal(rows(e,table).length,Object.keys(before[table]).length+1);
 }
});

for(const [parentTable,block,wrong]of [['T_DYN_EVENTS','archive','cells'],['T_DYN_ENTITY_GAUGES','cells','archive']])test('owned time detail follows its business parent: '+parentTable,()=>{
 const e=seed(),field=parentTable==='T_DYN_EVENTS'?'story_time':'effective_from';
 e.newRecord(parentTable,parentTable==='T_DYN_EVENTS'?{title:'已有事件'}:{name:'已有余力',entity_id:'a',field_key:'energy',value:10},'parent');
 e.newRecord('M_WORLD_TIME',{owner_table:parentTable,owner_row_uuid:'parent',owner_field:field,precision:'relative',original_text:'上午',value_state:'known'},'time');e.set([parentTable,'parent',field,[]],'time');
 const text=form(e,'M_WORLD_TIME',{original_text:'午后'},{recordId:'time'}),raw=reply(wrong==='cells'?text:'',wrong==='archive'?text:'');
 acceptReply(e,raw,'wrong');assert.equal(e.rows('M_WORLD_TIME').time.values.original_text,'上午');
 const problem=wrong==='cells'?e.data.runtime.sources['main/wrong@1'].settlement.operations[0].error:e.data.runtime.archive_queue[0].error;assert.equal(problem.code,'REPLY_FORM_OWNERSHIP');assert.equal(problem.details.expected,block);
 accept(e,block==='cells'?text:'',block==='archive'?text:'','correct');accept(e,'','','later1');accept(e,'','','later2');
 assert.equal(e.rows('M_WORLD_TIME').time.values.original_text,'午后',JSON.stringify({settlement:e.data.runtime.sources['main/correct@1'].settlement,queue:e.data.runtime.archive_queue}));assert.equal(e.data.runtime.sources['main/wrong@1'].reply_raw,raw);
});

test('nested M details inherit ownership through their parent, not their reference target',()=>{
 const e=seed();e.newRecord('T_DYN_ENTITY_GAUGES',{name:'余力',entity_id:'a',value:12},'g');e.newRecord('T_DYN_COGNITION',{name:'余力的判断',subject_ref:'a',understanding_scope:'condition'},'c');
 e.newRecord('M_CONDITIONS',{owner_table:'T_DYN_COGNITION',owner_row_uuid:'c',owner_field:'understanding_scope',lhs_ref:'reference',narrative:'依据观察'},'condition');
 e.newRecord('M_FIELD_REFERENCES',{owner_table:'M_CONDITIONS',owner_row_uuid:'condition',owner_field:'lhs_ref',target_table:'T_DYN_ENTITY_GAUGES',target_row_uuid:'g',target_field:'value',reference_kind:'record',resolution_status:'resolved',narrative:'原依据'},'reference');
 const text=form(e,'M_FIELD_REFERENCES',{narrative:'后来核对了观察'},{recordId:'reference'});const r=accept(e,text,'','bad');
 assert.equal(r.result.operations[0].error.code,'REPLY_FORM_OWNERSHIP');assert.equal(e.rows('M_FIELD_REFERENCES').reference.values.narrative,'原依据');
 accept(e,'',text,'good');accept(e,'','','later1');accept(e,'','','later2');assert.equal(e.rows('M_FIELD_REFERENCES').reference.values.narrative,'后来核对了观察');
});

test('standalone M definitions have a current entry point instead of a blanket archive exemption',()=>{
 const e=fresh();e.newRecord('T_STATIC_WORLDS',{name:'中性世界'},'world');const text=form(e,'M_UNITS',{label:'枚',scope_world_id:'中性世界',dimension:'count'});accept(e,'',text,'bad');assert.equal(e.data.runtime.archive_queue[0].error.code,'REPLY_FORM_OWNERSHIP');assert.equal(rows(e,'M_UNITS').length,0);
 const r=accept(e,text,'','good');assert.equal(r.result.operations[0].status,'COMMITTED');assert.equal(rows(e,'M_UNITS')[0].values.label,'枚');
});

test('current relation explanations and accepted task evidence stay on their original business records',()=>{
 const e=seed();e.newRecord('T_DYN_TASKS',{name:'送信',status:'接受',accept_evidence:'阿青明确答应送信',next_step:'领取信件'},'task');
 const text=form(e,'T_DYN_RELATIONS_PACTS',{name:'同行',subject_ref:'阿青',target_ref:'阿白',relation_explanation:'两人已约好同行',subject_expectation:'一起走到渡口'})+'\n'+form(e,'T_DYN_TASKS',{next_step:'走向渡口'},{recordId:'task'});
 const r=accept(e,text);assert.equal(r.result.operations[0].status,'COMMITTED',JSON.stringify(r.result));assert.equal(rows(e,'T_DYN_RELATIONS_PACTS')[0].values.subject_expectation,'一起走到渡口');assert.equal(e.rows('T_DYN_TASKS').task.values.next_step,'走向渡口');assert.equal(e.rows('T_DYN_TASKS').task.values.accept_evidence,'阿青明确答应送信');
 const before=structuredClone(business(e)),bad=form(e,'T_DYN_TASKS',{name:'未经接受的新任务',status:'接受'}),rejected=accept(e,bad,'','bad-task');
 assert.equal(rejected.result.operations[0].error.code,'REPLY_TASK_ACCEPTANCE');assert.deepEqual(business(e),before);
});

test('memory plans retain their two-reply dependency ordering for a later cognition record',()=>{
 const e=seed();accept(e,'',form(e,'T_DYN_EVENTS',{title:'门前见闻'}),'first');accept(e,'',form(e,'T_DYN_COGNITION',{name:'记得门前见闻',subject_ref:'阿青',event_ref:'门前见闻',epistemic_level:'K3'}),'second');
 assert.deepEqual(e.data.runtime.archive_queue[1].plan.dependencies,['main/first@1']);accept(e,'','','third');assert.equal(rows(e,'T_DYN_EVENTS').length,1);assert.equal(rows(e,'T_DYN_COGNITION').length,0);
 accept(e,'','','fourth');assert.equal(rows(e,'T_DYN_COGNITION').length,1);assert.equal(e.data.runtime.archive_queue[1].status,'formal');
});

test('a saved pre-partition archive plan keeps its old write set and guards after reload',()=>{
 const saved=structuredClone(legacyFixture.cases.gauge),state=initializeState(catalog,saved.runtime.scope);Object.assign(state.tables,saved.tables);state.runtime=saved.runtime;
 const reopened=new Runtime(state),source=reopened.data.runtime.sources['main/legacy-gauge@1'],raw=source.reply_raw,originalPlan=structuredClone(reopened.data.runtime.archive_queue[0].plan);
 assert.equal(originalPlan.ownership_version,undefined);assert.equal(reopened.data.runtime.archive_queue[0].status,'staged');assert.equal(rows(reopened,'T_DYN_ENTITY_GAUGES').length,0);
 accept(reopened,'','','second');assert.equal(rows(reopened,'T_DYN_ENTITY_GAUGES').length,0);assert.deepEqual(reopened.data.runtime.archive_queue[0].plan,originalPlan);
 accept(reopened,'','','third');assert.equal(rows(reopened,'T_DYN_ENTITY_GAUGES')[0].values.value,12);assert.equal(reopened.data.runtime.archive_queue[0].status,'formal');assert.equal(reopened.data.runtime.sources['main/legacy-gauge@1'].reply_raw,raw);
});

test('legacy delta remains readable while new empty blocks make no business changes',()=>{
 const e=seed();e.newRecord('T_DYN_EVENTS',{title:'旧事件'},'old-event');
 const raw='<reply><body>1 核对先前记录。</body><cells>T_DYN_EVENTS#old-event.title: =核对后的旧事件 | P1</cells><archive/></reply>',r=acceptReply(e,raw,'legacy-delta');
 assert.equal(r.result.operations[0].status,'COMMITTED');assert.equal(e.rows('T_DYN_EVENTS')['old-event'].values.title,'核对后的旧事件');
 const before=structuredClone(business(e));const empty=accept(e,'','','empty');assert.deepEqual(empty.result.operations,[]);assert.deepEqual(business(e),before);
});

test('form selection does not turn references to memory or current records into cross-group edit grants',()=>{
 const e=seed(),cells=replyFormTableIds(e.data,'cells',['T_CHAR_DOSSIER','T_DYN_ENTITY_GAUGES','T_DYN_EVENTS']),archive=replyFormTableIds(e.data,'archive',['T_DYN_EVENTS','T_DYN_COGNITION','T_SYS_ENTITIES']);
 assert(cells.includes('T_CHAR_DOSSIER'));assert(cells.includes('M_WORLD_TIME'));assert(!cells.includes('T_DYN_EVENTS'));
 assert(archive.includes('T_DYN_COGNITION'));assert(archive.includes('M_CONDITIONS'));assert(!archive.includes('T_SYS_ENTITIES'));assert(!archive.includes('T_DYN_ENTITY_GAUGES'));
});
