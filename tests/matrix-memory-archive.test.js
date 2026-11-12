import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage,NS} from '../engine/controller.mjs';
import {initializeState} from '../engine/materials.mjs';
import {baseline} from '../engine/config.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {acceptReply} from '../engine/reply.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';

const clone=structuredClone,catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
const legacyFixture=JSON.parse(readFileSync(new URL('./fixtures/reply-form-legacy-staged.json',import.meta.url)));
function legacyState(kind){const saved=clone(legacyFixture.cases[kind]),state=initializeState(catalog,saved.runtime.scope);Object.assign(state.tables,saved.tables);state.runtime=saved.runtime;return state;}
const eventForm=n=>form(initializeState(catalog),'T_DYN_EVENTS',{short_code:'e'+n,title:'事件'+n,spine_digest:'本轮看见信'});
const reply=(n,archive=eventForm(n))=>`<reply><task/><anchor phase="before"/><title>门前${n}|雾历一日|门口|雾城</title><body>1 第${n}次推门，看见信上留下的线索。</body><anchor phase="after"/><extra/><cells/><vars/>${archive===null?'':archive?`<archive format="form">${archive}</archive>`:'<archive/>'}<actions/></reply>`;
async function fixture(state=null){
 const macros=new Map(),ctx={chatId:'memory-chain',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(k,f)=>macros.set(k,f)};
 const storage=indexedStorage(new IDBFactory()),source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(s,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'char':s));
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand};
 const host=createMatrixHost(options);host.register();await host.import({state:state??initializeState(catalog,{session_ref:ctx.chatId,branch_ref:'main'})});
 async function prepare(type='normal'){
  if(type==='normal')ctx.chat.push({is_user:true,mes:'继续'});
  await host.before(type);const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));
  await host.payloadReady({messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))});
 }
 async function accept(raw,type='normal'){
  await prepare(type);if(type==='normal')ctx.chat.push({mes:raw});else ctx.chat.at(-1).mes=raw;
  await host.event('GENERATION_ENDED');return host.export();
 }
 return {ctx,host,options,storage,prepare,accept,cold:()=>createMatrixHost(options)};
}

test('actual host accepts every source and commits semantic event memory only beyond its two retained replies',async()=>{
 const f=await fixture();let saved=await f.accept(reply(1));
 assert.equal(saved.state.runtime.archive_queue.length,1);assert.equal(saved.state.runtime.archive.length,0);
 assert.equal(Object.values(saved.state.tables.T_SYS_SOURCE_FRAGMENTS).length,1);
 saved=await f.accept(reply(2));assert.equal(saved.state.runtime.archive.length,0);
 saved=await f.accept(reply(3));
 const events=Object.values(saved.state.tables.T_DYN_EVENTS);assert.equal(events.length,1,'archive form must actually reach the canonical event table');
 assert.equal(events[0].values.short_code,'e1');assert.equal(events[0].values.source_entry_id,f.ctx.chat[1].extra[NS].uid);
 assert.match(f.host.latest().materials.tisya_material_memory_archive,/e1/);assert.doesNotMatch(f.host.latest().materials.tisya_material_memory_archive,/e2|e3/);
 const cold=f.cold();await cold.sync();const reopened=await cold.export();assert.deepEqual(reopened.state,saved.state);
 assert.equal(Object.values(reopened.state.tables.T_SYS_ARCHIVE_BATCHES).length,3);
});

function seed(){
 const e=new Runtime(initializeState(catalog,{session_ref:'semantic-test',branch_ref:'main'}));
 for(const [id,name]of [['a','阿青'],['b','阿白']]){e.newRecord('T_CHAR_DOSSIER',{name},'d-'+id);e.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:id,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'d-'+id,reference_kind:'record',resolution_status:'resolved'},'o-'+id);e.newRecord('T_SYS_ENTITIES',{name,kind:'character',origin_record_ref:'o-'+id},id);}
 e.newRecord('T_STATIC_ITEMS_SKILLS',{name:'木盒',material:'木材'},'asset-box');e.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'box',owner_field:'origin_record_ref',target_table:'T_STATIC_ITEMS_SKILLS',target_row_uuid:'asset-box',reference_kind:'record',resolution_status:'resolved'},'o-box');e.newRecord('T_SYS_ENTITIES',{name:'木盒',kind:'item',origin_record_ref:'o-box'},'box');
 e.newRecord('T_STATIC_FACTS',{name:'门已打开',proposition:'门已经打开'},'fact');e.newRecord('T_DYN_EVENTS',{short_code:'e0',title:'先前开门',spine_digest:'先前开门'},'event');
 return e;
}
const routes=[
 ['事件','T_DYN_EVENTS',{short_code:'e1',title:'新事件',spine_digest:'推门后看见信'}],
 ['状态','T_DYN_ENTITY_STATE',{entity_id:'阿青',posture:'站立'},'cells'],
 ['指标','T_DYN_ENTITY_GAUGES',{name:'紧张',entity_id:'阿青',field_key:'nervous',text_value:'稍紧张'},'cells'],
 ['资产流转','T_DYN_TRANSFERS',{instance_ref:'木盒',from_owner_ref:'阿青',to_owner_ref:'阿白',direction:'赠送',reason:'当面递交木盒'},'cells'],
 ['认知','T_DYN_COGNITION',{name:'开门见闻',subject_ref:'阿青',target_fact_ref:'门已打开',epistemic_level:'K3',acquisition_channel:'亲眼看见',subjective_belief:'知道门已经打开'}],
 ['人物档案','T_CHAR_DOSSIER',{name:'阿紫',overall_physique:'身形瘦高'},'cells'],
 ['物品档案','T_STATIC_ITEMS_SKILLS',{name:'铜钥匙',material:'铜'},'cells'],
 ['地点档案','T_STATIC_PLACES',{name:'渡口',visual_atmosphere:'水边雾气很浓'},'cells'],
 ['组织档案','T_STATIC_ORGANIZATIONS',{name:'送信社',duty:'递送信件'},'cells'],
 ['世界底稿','T_STATIC_WORLD_RULES',{name:'落日关门',proposition:'有人说门在落日时关闭',truth_status:'未知'},'cells'],
 ['事实候选','T_STATIC_FACTS',{name:'门后字迹',proposition:'门后似乎有字迹',validation_status:'待核',object_ref:'阿青'}],
 ['关系底稿','T_CHAR_RELATION_ORIGINS',{subject_ref:'阿青',target_ref:'阿白',formation_process:'两人在渡口相识'}],
 ['隐情','T_CHAR_SECRETS',{name:'旧伤',char_ref:'阿青',fact_proposition:'旧伤来自过去的冲突'}],
 ['习惯锚点','T_CHAR_ANCHORS',{name:'缩手',char_ref:'阿青',origin_event_ref:'先前开门',actions:'碰到门把时缩手',certainty:'单次观察'}],
 ['伏笔','T_DYN_CLUES',{name:'门后字迹',shown_content:'墙面出现刻痕',stage:'已埋下',visibility:'全体公开'}],
 ['场外事务','T_DYN_ACTIVITIES_LIFELINES',{name:'送信',subject_ref:'阿青',goal:'送到渡口',status:'进行'},'cells'],
 ['已接受任务','T_DYN_TASKS',{name:'送信',goal:'把信送到渡口',responsible_ref:'阿青',status:'接受',accept_evidence:'阿青明确答应送信'},'cells'],
 ['日程','T_DYN_TIMERS',{name:'暮钟',time_basis:'有效用户回合数',due_turn:5,subject_ref:'阿青',status:'等待'},'cells']
];
for(const [name,table,values,block='archive']of routes)test('current '+block+' form reaches its registered table: '+name,()=>{
 const e=seed(),before=Object.keys(e.rows(table)).length,text=form(e.data,table,values),raw=block==='archive'?reply(1,text):reply(1,'').replace('<cells/>','<cells format="form">'+text+'</cells>');
 const first=acceptReply(e,raw,'m1');assert.equal(Object.keys(e.rows(table)).length,before+(block==='cells'?1:0),block+' timing: '+JSON.stringify(first.result));
 if(block==='cells')assert.equal(first.result.operations[0].status,'COMMITTED');
 acceptReply(e,reply(2,''),'m2');assert.equal(Object.keys(e.rows(table)).length,before+(block==='cells'?1:0));acceptReply(e,reply(3,''),'m3');
 const batch=e.data.runtime.archive_queue[0];assert.equal(batch.status,'formal',JSON.stringify(batch.error));
 assert.equal(Object.keys(e.rows(table)).length,before+1,name);
 assert.equal(Object.values(e.rows('T_SYS_ARCHIVE_BATCHES')).find(r=>r.values.message_ref==='m1').values.commit_status,'完成');
});

for(const value of [null,'这不是合法归档行'])test('missing or malformed archive stays visible as pending without discarding its source: '+String(value),async()=>{
 const f=await fixture();await f.accept(reply(1,value));await f.accept(reply(2,''));const saved=await f.accept(reply(3,''));
 const first=Object.values(saved.state.runtime.sources).find(s=>s.entry_id===f.ctx.chat[1].extra[NS].uid);
 assert.equal(first.reply_raw,reply(1,value));assert.equal(Object.keys(saved.state.tables.T_DYN_EVENTS).length,0);
 assert(f.host.latest().result.warnings.some(w=>/^ARCHIVE_/.test(w.code)),'unread archive must not silently count as empty successful memory');
 const batch=saved.state.runtime.archive_queue.find(b=>b.source_key.endsWith(first.entry_id+'@1'));assert.notEqual(batch.status,'formal');assert(batch.error||batch.warnings?.length);
});

function form(state,tableId,values,recordId=null){
 const context=prepareMatrixSheets({state},{kind:'rows',task:'main',mode:'revise',operationId:'test-form'}),t=context.catalog.templates.find(t=>t.id===tableId),heading=recordId?context.references.find(r=>r.tableId===tableId&&r.recordId===recordId).display:t.label+'／1';
 return '【'+heading+'】\n'+Object.entries(values).map(([key,value])=>{const n=t.fields.findIndex(f=>f.key===key);assert(n>=0,key);return (n+1)+' '+t.fields[n].label+'：'+value+' | P1';}).join('\n');
}
const formReply=(n,text)=>reply(n,text);

test('main archive grouped form uses the existing field contract and keeps explicit unknowns plus pending items',async()=>{
 const f=await fixture(),state=(await f.host.export()).state,body=form(state,'T_DYN_EVENTS',{short_code:'form-event',title:'门后的信',spine_digest:'看到信件',cause:'?'});
 await f.accept(formReply(1,body));await f.accept(reply(2,''));const saved=await f.accept(reply(3,''));const row=Object.values(saved.state.tables.T_DYN_EVENTS)[0];
 assert.equal(row.values.title,'门后的信');assert.equal(row.states.cause,'unknown');assert.equal(row.values.cause,null);
 assert.equal(Object.values(saved.state.tables.T_SYS_CELL_REQUESTS)[0].values.result_status,'待填写');assert(f.host.latest().result.warnings.some(w=>w.code==='ARCHIVE_DECLARED_PENDING'));
 assert.match(f.host.latest().materials.tisya_material_offstage_state,/记忆待核/);
});

test('saved legacy staged definitions remain referenceable and commit their original dependency and canonical identities',async()=>{
 const initial=legacyState('dossier'),originalPlan=clone(initial.runtime.archive_queue[0].plan),f=await fixture(initial);
 assert.equal(originalPlan.ownership_version,undefined);assert.equal(Object.keys((await f.host.export()).state.tables.T_CHAR_DOSSIER).length,0);
 assert.match(f.host.latest().materials.tisya_material_cell_prompts,/近期回复中的关联名称.*阿紫/);
 await f.accept(reply(2,form(initializeState(catalog),'T_DYN_COGNITION',{name:'来到门前',subject_ref:'阿紫',epistemic_level:'K3',acquisition_channel:'本人自述',subjective_belief:'知道自己已经来到门前'})));
 assert.deepEqual((await f.host.export()).state.runtime.archive_queue[0].plan,originalPlan);
 let saved=await f.accept(reply(3,''));assert.equal(Object.keys(saved.state.tables.T_CHAR_DOSSIER).length,1);assert.equal(Object.keys(saved.state.tables.T_DYN_COGNITION).length,0);
 saved=await f.accept(reply(4,''));const entity=Object.entries(saved.state.tables.T_SYS_ENTITIES).find(([,r])=>r.values.name==='阿紫'),cognition=Object.values(saved.state.tables.T_DYN_COGNITION)[0];
 assert(cognition,JSON.stringify(saved.state.runtime.archive_queue.map(b=>b.error)));assert.equal(cognition.values.subject_ref,entity[0]);
 const references=Object.values(saved.state.runtime.sources).find(s=>s.title.startsWith('门前2')).archive_references;assert(references.some(ref=>ref.tableId==='T_SYS_ENTITIES'&&ref.recordId===entity[0]));
});

test('a later manual edit conflicts with delayed archive as a whole and retains the original reply and user field',async()=>{
 const initial=seed().data,f=await fixture(initial),before=(await f.host.export()).state,archive=form(before,'T_STATIC_FACTS',{proposition:'模型本轮建议的改动'},'fact');
 await f.accept(formReply(1,archive));const db=await f.host.readDatabase();await f.host.commitDatabase({operationId:'manual-protect',contextKey:db.contextKey,expectedRevision:db.revision,changes:[{tableId:'T_STATIC_FACTS',recordId:'fact',values:{proposition:'用户人工校正'}}],source:{kind:'manual-test'}});
 await f.accept(reply(2,''));const saved=await f.accept(reply(3,''));assert.equal(saved.state.tables.T_STATIC_FACTS.fact.values.proposition,'用户人工校正');
 const batch=saved.state.runtime.archive_queue[0];assert.equal(batch.status,'blocked');assert.equal(batch.error.code,'ARCHIVE_CONFLICT');assert.equal(saved.state.runtime.receipts['archive:'+batch.source_key],undefined);assert.match(Object.values(saved.state.runtime.sources)[0].reply_raw,/模型本轮建议/);
});

test('failed native state commit retains the previous database and a retry settles archive once',async()=>{
 const f=await fixture();await f.accept(reply(1));await f.accept(reply(2));const before=await f.host.export(),commit=f.storage.commit;f.storage.commit=async()=>false;
 await assert.rejects(f.accept(reply(3)),/另一窗口|状态/);assert.deepEqual(await f.host.export(),before);
 f.storage.commit=commit;await f.host.sync();const saved=await f.host.export();assert.equal(Object.keys(saved.state.tables.T_DYN_EVENTS).length,1);assert.equal(saved.state.runtime.archive.length,1);
 await f.cold().sync();assert.equal(Object.keys((await f.host.export()).state.tables.T_DYN_EVENTS).length,1);
});

test('stopped reroll, accepted edit, deletion and child branch preserve only their selected semantic memories',async()=>{
 const f=await fixture();await f.accept(reply(1));await f.accept(reply(2));await f.accept(reply(3));const parent=clone({chatId:f.ctx.chatId,chat:f.ctx.chat,chatMetadata:f.ctx.chatMetadata}),before=await f.host.export();
 await f.prepare('swipe');f.ctx.chat.at(-1).mes=reply(99);await f.host.event('GENERATION_STOPPED');await f.cold().sync();assert.deepEqual((await f.host.export()).state,before.state);
 Object.assign(f.ctx,clone(parent));f.ctx.chat[1].mes=reply(10);await f.host.event('MESSAGE_EDITED',1);let state=(await f.host.export()).state;assert.deepEqual(Object.values(state.tables.T_DYN_EVENTS).map(r=>r.values.short_code),['e10']);
 const kept=clone({chatId:f.ctx.chatId,chat:f.ctx.chat,chatMetadata:f.ctx.chatMetadata}),keptBundle=await f.host.export();f.ctx.chatId='memory-child';f.ctx.chat.splice(-2);await f.host.event('CHAT_CHANGED');state=(await f.host.export()).state;assert.equal(Object.keys(state.tables.T_DYN_EVENTS).length,0);
 Object.assign(f.ctx,kept);assert.deepEqual(await f.host.export(),keptBundle);await f.cold().sync();assert.equal(Object.values((await f.host.export()).state.tables.T_DYN_EVENTS)[0].values.short_code,'e10');
});

for(const [label,make,block='archive']of [
 ['out-of-range evidence',e=>form(e.data,'T_DYN_EVENTS',{title:'越界事件'}).replaceAll('P1','P99')],
 ['unknown group',()=> '【未知类别／1】\n1 名称：门开了 | P1'],
 ['mixed valid and invalid batch',e=>form(e.data,'T_DYN_EVENTS',{title:'事件'})+'\n【未知类别／1】\n1 名称：不能静默漏掉 | P1'],
 ['unaccepted obligation',e=>form(e.data,'T_DYN_TASKS',{name:'送信',goal:'旁人也许希望阿青送信'}),'cells'],
 ['accepted task without evidence',e=>form(e.data,'T_DYN_TASKS',{name:'送信',status:'接受'}),'cells']
])test('unproved current form remains pending with zero semantic writes: '+label,()=>{
 const e=seed(),text=make(e),before=clone(e.data.tables),raw=block==='archive'?reply(1,text):reply(1,'').replace('<cells/>','<cells format="form">'+text+'</cells>');const first=acceptReply(e,raw,'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 if(block==='archive'){const batch=e.data.runtime.archive_queue[0];assert.equal(batch.status,'blocked');assert(batch.error);}else{assert.equal(first.result.operations[0].status,'FAILED');assert.equal(first.result.operations[0].error.code,'REPLY_TASK_ACCEPTANCE');}
 for(const [id,rows]of Object.entries(before))if(!['T_SYS_SOURCE_FRAGMENTS','T_SYS_ARCHIVE_BATCHES','X_RECORD_META'].includes(id))assert.deepEqual(e.data.tables[id],rows,id);
 assert.equal(e.data.runtime.sources['main/m1@1'].reply_raw,raw);
});

for(const [label,archive]of [['legacy payload','事件|e1[夜]：门开了(原文:P1)'],['legacy empty','']])test('obsolete archive format is rejected and its raw reply retained: '+label,()=>{
 const e=seed(),before=clone(e.data.tables),raw=reply(1,'placeholder').replace('<archive format="form">placeholder</archive>',`<archive format="pipes">${archive}</archive>`);
 const result=acceptReply(e,raw,'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 assert.equal(e.data.runtime.archive_queue[0].status,'blocked');assert.equal(e.data.runtime.archive_queue[0].error.code,'ARCHIVE_FORMAT');assert(e.data.runtime.sources['main/m1@1'].settlement.warnings.some(w=>w.code==='ARCHIVE_FORMAT'));
 assert.equal(e.data.runtime.sources['main/m1@1'].reply_raw,raw);for(const [id,rows]of Object.entries(before))if(!['T_SYS_SOURCE_FRAGMENTS','T_SYS_ARCHIVE_BATCHES','X_RECORD_META'].includes(id))assert.deepEqual(e.data.tables[id],rows,id);
});

test('an already accepted task can record a later field delta without inventing or recopying acceptance',()=>{
 const e=seed();e.newRecord('T_DYN_TASKS',{name:'送信',status:'接受',accept_evidence:'阿青明确答应送信',goal:'送到渡口'},'accepted-task');
 const cells=form(e.data,'T_DYN_TASKS',{next_step:'走向渡口'},'accepted-task'),first=acceptReply(e,reply(1,'').replace('<cells/>','<cells format="form">'+cells+'</cells>'),'m1');assert.equal(first.result.operations[0].status,'COMMITTED');assert.equal(e.rows('T_DYN_TASKS')['accepted-task'].values.next_step,'走向渡口');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 assert.equal(e.data.runtime.archive_queue[0].status,'formal',JSON.stringify(e.data.runtime.archive_queue[0].error));assert.equal(e.rows('T_DYN_TASKS')['accepted-task'].values.next_step,'走向渡口');assert.equal(e.rows('T_DYN_TASKS')['accepted-task'].values.accept_evidence,'阿青明确答应送信');
});

test('each event binds only its own retained source fragments and never borrows another event paragraph',()=>{
 const e=seed(),archive=form(e.data,'T_DYN_EVENTS',{short_code:'e1',title:'门开了'})+'\n'+form(e.data,'T_DYN_EVENTS',{short_code:'e2',title:'窗边落雨'}).replace('／1】','／2】').replaceAll('P1','P2'),raw=reply(1,archive).replace('1 第1次推门，看见信上留下的线索。','1 门开了。\n\n2 窗边落雨。');
 acceptReply(e,raw,'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 for(const [code,p]of [['e1','P1'],['e2','P2']]){const row=Object.values(e.rows('T_DYN_EVENTS')).find(r=>r.values.short_code===code);assert(row,JSON.stringify(e.data.runtime.archive_queue[0].error));assert.equal(row.values.source_paragraphs,p);assert.deepEqual(row.metadata.archive_source.paragraphs,[p]);assert.equal(row.metadata.archive_source.fragment_ids.length,1);const fragment=e.rows('T_SYS_SOURCE_FRAGMENTS')[row.metadata.archive_source.fragment_ids[0]];assert.equal(fragment.values.paragraph_id,p);assert.equal(fragment.values.entry_hash,row.values.source_hash);}
});
