import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {acceptReply} from '../engine/reply.mjs';
import {reconcile} from '../engine/journal.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import legacyFixture from './fixtures/reply-form-legacy-staged.json' with {type:'json'};
import {replyFormTableIds,assertReplyFormOwnership,REPLY_FORM_OWNERSHIP_VERSION,LEGACY_REPLY_FORM_OWNERSHIP_VERSION} from '../engine/reply-form-ownership.mjs';

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
 const raw='<reply><body>1 核对先前记录。</body><cells>T_DYN_EVENTS#old-event.title: =核对后的旧事件 | P1</cells><archive/></reply>',r=acceptReply(e,raw,'legacy-delta',1,'main',{formOwnershipVersion:LEGACY_REPLY_FORM_OWNERSHIP_VERSION});
 assert.equal(r.result.operations[0].status,'COMMITTED');assert.equal(e.rows('T_DYN_EVENTS')['old-event'].values.title,'核对后的旧事件');
 const before=structuredClone(business(e));const empty=accept(e,'','','empty');assert.deepEqual(empty.result.operations,[]);assert.deepEqual(business(e),before);
});

test('form selection does not turn references to memory or current records into cross-group edit grants',()=>{
 const e=seed(),cells=replyFormTableIds(e.data,'cells',['T_CHAR_DOSSIER','T_DYN_ENTITY_GAUGES','T_DYN_EVENTS']),archive=replyFormTableIds(e.data,'archive',['T_DYN_EVENTS','T_DYN_COGNITION','T_SYS_ENTITIES']);
 assert(cells.includes('T_CHAR_DOSSIER'));assert(cells.includes('M_WORLD_TIME'));assert(!cells.includes('T_DYN_EVENTS'));
 assert(archive.includes('T_DYN_COGNITION'));assert(archive.includes('M_CONDITIONS'));assert(!archive.includes('T_SYS_ENTITIES'));assert(!archive.includes('T_DYN_ENTITY_GAUGES'));
});

function legacyHistory(){
 const saved=structuredClone(legacyFixture.cases.history),state=initializeState(catalog,saved.runtime.scope);Object.assign(state.tables,saved.tables);state.runtime=saved.runtime;
 return {bundle:{state,journal:saved.journal},messages:saved.messages};
}

test('editing earlier context replays unchanged accepted legacy forms using their recorded provenance',()=>{
 const {bundle,messages}=legacyHistory(),branch='main';
 const original=messages[3].text;messages[0].text='先在门前停下，再查看木盒';let r=reconcile(bundle,messages);
 assert.equal(r.result.rewound,4);assert.deepEqual(r.result.warnings,[]);assert.equal(Object.keys(r.bundle.state.tables.T_DYN_EVENTS).length,1);assert.equal(Object.keys(r.bundle.state.tables.T_DYN_ENTITY_GAUGES).length,0);
 for(const id of ['a1','a2']){assert.equal(r.bundle.state.runtime.sources[branch+'/'+id+'@2'].reply_form_ownership_version,LEGACY_REPLY_FORM_OWNERSHIP_VERSION);assert.equal(r.bundle.journal.entries.find(e=>e.uid===id).reply_form_ownership_version,LEGACY_REPLY_FORM_OWNERSHIP_VERSION);}
 const staged=r.bundle.state.runtime.archive_queue[1];assert.equal(staged.status,'staged');assert.equal(staged.plan.ownership_version,LEGACY_REPLY_FORM_OWNERSHIP_VERSION);assert(staged.plan.guards.length);assert.equal(r.bundle.state.runtime.sources[branch+'/a2@2'].reply_raw,original);
 // A later replay uses the now explicit saved marker instead of classifying
 // the same historical text as new merely because it was replayed once.
 messages[2].text='再核对一次记录';r=reconcile(r.bundle,messages);assert.deepEqual(r.result.warnings,[]);assert.equal(r.bundle.state.runtime.archive_queue[1].status,'staged');
 messages.push({uid:'a3',role:'assistant',text:reply()},{uid:'a4',role:'assistant',text:reply()});r=reconcile(r.bundle,messages);
 assert.deepEqual(r.result.warnings,[]);assert.equal(Object.values(r.bundle.state.tables.T_DYN_ENTITY_GAUGES)[0].values.value,12);assert.equal(r.bundle.state.runtime.archive_queue[1].status,'formal');assert.equal(r.bundle.state.runtime.sources[branch+'/a3@1'].reply_form_ownership_version,REPLY_FORM_OWNERSHIP_VERSION);
});

test('editing a legacy reply itself is a current revision and cannot reuse an old message ID to bypass ownership',()=>{
 const {bundle,messages}=legacyHistory(),edited=messages[3].text.replace('为十二','为十三').replace('：12 | P1','：13 | P1');messages[3].text=edited;
 let r=reconcile(bundle,messages),source=r.bundle.state.runtime.sources['main/a2@2'];assert.equal(source.reply_form_ownership_version,REPLY_FORM_OWNERSHIP_VERSION);assert.equal(source.reply_raw,edited);assert.equal(r.bundle.state.runtime.archive_queue[1].error.code,'REPLY_FORM_OWNERSHIP');assert.equal(Object.keys(r.bundle.state.tables.T_DYN_ENTITY_GAUGES).length,0);assert.equal(Object.keys(r.bundle.state.tables.T_DYN_EVENTS).length,1);
 const e=new Runtime(bundle.state),cells=form(e,'T_DYN_ENTITY_GAUGES',{name:'当前余力',entity_id:'阿青',field_key:'energy',value:13});messages[3].text=reply(cells,'','1 阿青确认当前余力为十三。');r=reconcile(bundle,messages);
 assert.deepEqual(r.result.warnings,[]);assert.equal(Object.values(r.bundle.state.tables.T_DYN_ENTITY_GAUGES)[0].values.value,13);assert.equal(r.bundle.state.runtime.sources['main/a2@2'].reply_form_ownership_version,REPLY_FORM_OWNERSHIP_VERSION);
});

test('a new reply cannot select legacy ownership by copying historical form text or declaring an XML attribute',()=>{
 const {bundle,messages}=legacyHistory(),raw=messages[1].text.replace('<reply>','<reply reply_form_ownership_version="tisya.reply-form-ownership/legacy">').replace('旧版直接记下的见闻','新的同格式见闻');messages.push({uid:'new-reply',role:'assistant',text:raw});
 const r=reconcile(bundle,messages),source=r.bundle.state.runtime.sources['main/new-reply@1'];assert.equal(source.reply_form_ownership_version,REPLY_FORM_OWNERSHIP_VERSION);assert.equal(source.reply_raw,raw);assert.equal(source.settlement.operations[0].error.code,'REPLY_FORM_OWNERSHIP');assert.equal(Object.keys(r.bundle.state.tables.T_DYN_EVENTS).length,1);
});

test('current delta syntax cannot append or edit memory through cells, while an ordinary numeric line still settles',()=>{
 const e=seed();e.newRecord('T_DYN_EVENTS',{title:'已有事件'},'old');e.newRecord('T_DYN_ENTITY_GAUGES',{name:'余力',entity_id:'a',field_key:'energy',value:10},'g');
 const lines=[
  'T_DYN_ENTITY_GAUGES#g.value: +2 | P1',
  'T_DYN_EVENTS#old.title: =不该即时写入 | P1',
  '@EVENTS+: bypass[当天]：门前出现木盒(原文:P1)',
  '@ROW+: {"table_id":"T_DYN_COGNITION","record_id":"bypass-cognition","values":{"name":"不该即时写入的认知","subject_ref":"a","subjective_belief":"看见木盒"}} | P1'
 ],raw='<reply><body>1 阿青核对余力并回想门前见闻。</body><cells format="delta">'+lines.join('\n')+'</cells><archive/></reply>',r=acceptReply(e,raw,'delta-bypass');
 assert.equal(r.result.operations[0].status,'COMMITTED');assert.equal(e.rows('T_DYN_ENTITY_GAUGES').g.values.value,12);
 for(let i=1;i<lines.length;i++){assert.equal(r.result.operations[i].status,'FAILED');assert.equal(r.result.operations[i].error.code,'REPLY_FORM_OWNERSHIP');assert.equal(r.result.operations[i].original,lines[i]);}
 assert.equal(e.rows('T_DYN_EVENTS').old.values.title,'已有事件');assert.equal(rows(e,'T_DYN_EVENTS').length,1);assert.equal(rows(e,'T_DYN_COGNITION').length,0);assert.equal(e.data.runtime.sources['main/delta-bypass@1'].reply_raw,raw);
});

test('current delta validates complete action writes but excludes executor receipts and derived fields',()=>{
 const e=seed();e.registerTable('NEUTRAL_COUNTER',[{key:'name',type:'TEXT'},{key:'count',type:'NUMBER'}]);e.newRecord('NEUTRAL_COUNTER',{name:'计数',count:2},'counter');
 e.registerTable('NEUTRAL_RECEIPTS',[{key:'name',type:'TEXT'}]);e.data.schema.NEUTRAL_RECEIPTS.program_owned=true;
 e.declareField('T_DYN_EVENTS',{key:'count_projection',type:'NUMBER',read_only:true});e.newRecord('T_DYN_EVENTS',{title:'已有事件',count_projection:2},'event');
 e.operators.NEUTRAL=()=>{e.delta('NEUTRAL_COUNTER#counter.count',1);e.newRecord('NEUTRAL_RECEIPTS',{name:'执行回执'},'receipt');e.set(['T_DYN_EVENTS','event','count_projection',[]],3,'derived');return {done:true};};
 let raw='<reply><body>1 计数增加一。</body><cells>@ACT: {"action":"NEUTRAL","arguments":{}} | P1</cells><archive/></reply>',r=acceptReply(e,raw,'action-ok');assert.equal(r.result.operations[0].status,'COMMITTED',JSON.stringify(r.result));assert.equal(e.rows('NEUTRAL_COUNTER').counter.values.count,3);assert.equal(e.rows('T_DYN_EVENTS').event.values.count_projection,3);assert.equal(rows(e,'NEUTRAL_RECEIPTS').length,1);
 e.operators.BAD_MEMORY=()=>{e.delta('NEUTRAL_COUNTER#counter.count',1);e.set(['T_DYN_EVENTS','event','title',[]],'绕路改写');return {done:true};};
 raw='<reply><body>1 核对记录。</body><cells>@ACT: {"action":"BAD_MEMORY","arguments":{}} | P1</cells><archive/></reply>';r=acceptReply(e,raw,'action-wrong');assert.equal(r.result.operations[0].error.code,'REPLY_FORM_OWNERSHIP');assert.equal(e.rows('NEUTRAL_COUNTER').counter.values.count,3);assert.equal(e.rows('T_DYN_EVENTS').event.values.title,'已有事件');assert.equal(e.data.runtime.sources['main/action-wrong@1'].reply_raw,raw);
});

test('current delta cannot move a memory detail under a current parent to evade its original ownership',()=>{
 const e=seed();e.newRecord('T_DYN_EVENTS',{title:'已有事件'},'event');e.newRecord('T_DYN_ENTITY_GAUGES',{name:'余力',entity_id:'a',field_key:'energy',value:10},'g');e.newRecord('M_LIST_VALUES',{owner_table:'T_DYN_EVENTS',owner_row_uuid:'event',owner_field:'tags',text_value:'旧线索',item_type:'text',value_state:'known',sequence:1},'detail');
 const raw='<reply><body>1 核对线索。</body><cells>M_LIST_VALUES#detail.owner_table: =T_DYN_ENTITY_GAUGES | P1</cells><archive/></reply>',r=acceptReply(e,raw,'move-detail');assert.equal(r.result.operations[0].error.code,'REPLY_FORM_OWNER');assert.equal(e.rows('M_LIST_VALUES').detail.values.owner_table,'T_DYN_EVENTS');assert.equal(e.data.runtime.sources['main/move-detail@1'].reply_raw,raw);
});

test('current ownership rejects details rooted in a program-owned source record',()=>{
 const e=seed();e.newRecord('T_SYS_SOURCE_FRAGMENTS',{entry_id:'retained',chunk_text:'保留的中性原文'},'raw');
 const changes=[{tableId:'M_ACCESS_RULES',recordId:'source-acl',values:{owner_table:'T_SYS_SOURCE_FRAGMENTS',owner_row_uuid:'raw',owner_field:'chunk_text',audience_kind:'public',permission:'disclose',decision:'allow',value_state:'known'}}];
 assert.throws(()=>assertReplyFormOwnership(e.data,changes,'cells'),error=>error.code==='REPLY_FORM_OWNER'&&error.details.table==='T_SYS_SOURCE_FRAGMENTS');
 assert.equal(assertReplyFormOwnership(e.data,changes,'archive',{version:LEGACY_REPLY_FORM_OWNERSHIP_VERSION}),changes,'historical legacy interpretation is unchanged');
});

test('current delta cannot attach an ACL to retained source fragments by a guessed record ID',()=>{
 const e=seed();e.newRecord('T_SYS_SOURCE_FRAGMENTS',{entry_id:'retained',chunk_text:'保留的中性原文'},'raw');const sourceBefore=structuredClone(e.rows('T_SYS_SOURCE_FRAGMENTS').raw),before=structuredClone(business(e));
 const line='@ROW+: '+JSON.stringify({table_id:'M_ACCESS_RULES',record_id:'source-acl',values:{owner_table:'T_SYS_SOURCE_FRAGMENTS',owner_row_uuid:'raw',owner_field:'chunk_text',audience_kind:'public',permission:'disclose',decision:'allow',value_state:'known'}})+' | P1',raw='<reply><body>1 核对原文。</body><cells>'+line+'</cells><archive/></reply>',r=acceptReply(e,raw,'source-acl-attempt');
 assert.equal(r.result.operations[0].status,'FAILED');assert.equal(r.result.operations[0].error.code,'REPLY_FORM_OWNER');assert.equal(r.result.operations[0].original,line);assert.deepEqual(business(e),before);assert.deepEqual(e.rows('T_SYS_SOURCE_FRAGMENTS').raw,sourceBefore);assert.equal(e.data.runtime.sources['main/source-acl-attempt@1'].reply_raw,raw);
});
