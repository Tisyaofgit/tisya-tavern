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
import {PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION} from '../engine/reply-form-ownership.mjs';

const clone=structuredClone,catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
const legacyFixture=JSON.parse(readFileSync(new URL('./fixtures/reply-form-legacy-staged.json',import.meta.url)));
function legacyState(kind){const saved=clone(legacyFixture.cases[kind]),state=initializeState(catalog,saved.runtime.scope);Object.assign(state.tables,saved.tables);state.runtime=saved.runtime;return state;}
const eventForm=n=>form(initializeState(catalog),'T_DYN_EVENTS',{title:'事件'+n,spine_digest:'本轮看见信'});
const reply=(n,archive=eventForm(n))=>`<reply><task/><anchor phase="before"/><title>门前${n}|雾历一日|门口|雾城</title><body>1 第${n}次推门，看见信上留下的线索。</body><anchor phase="after"/><extra/><cells/><vars/>${archive===null?'':archive?`<archive format="form">${archive}</archive>`:'<archive/>'}<actions/></reply>`;
async function fixture(state=null){
 const macros=new Map(),ctx={chatId:'memory-chain',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(k,f)=>macros.set(k,f)};
 const storage=indexedStorage(new IDBFactory()),source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(s,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'char':s));
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand};
 const host=createMatrixHost(options);host.register();await host.import({state:state??initializeState(catalog,{session_ref:ctx.chatId,branch_ref:'main'})});
 async function prepare(type='normal'){
  if(type==='normal')ctx.chat.push({is_user:true,mes:'继续'});
  await host.before(type);const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));
  const payload={messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};
  await host.payloadReady(payload);
  return payload;
 }
 async function accept(raw,type='normal'){
  await prepare(type);if(type==='normal')ctx.chat.push({mes:raw});else ctx.chat.at(-1).mes=raw;
  await host.event('GENERATION_ENDED');return host.export();
 }
 return {ctx,host,options,storage,prepare,accept,cold:()=>createMatrixHost(options)};
}

test('main request requires paragraph evidence per archive group and limits optional evidence to state cells',async()=>{
 const f=await fixture(),payload=await f.prepare();
 const lines=payload.messages.map(message=>message.content).join('\n').split('\n');
 assert.match(lines.find(line=>line.includes('分组简表：')), /每条记录写/);
 assert.doesNotMatch(lines.find(line=>line.includes('分组简表：')), /可加 \| Pn/);
 assert.deepEqual(lines.filter(line=>line.includes('可加 | Pn')).map(line=>line.match(/^<\w+/)?.[0]),['<cells']);
 assert.match(lines.find(line=>line.startsWith('每条业务记录（每个新增或修订分组）')), /至少.*字段行末.*19\{旅人把信交给船夫\} \| P3/);
 assert(lines.some(line=>line.includes('段号取自本轮最终 <body>')));
 assert(lines.some(line=>line.includes('引用本批新事件时，同一归档必须包含该事件分组')));
});

test('actual host accepts every source and commits semantic event memory only beyond its two retained replies',async()=>{
 const f=await fixture();let saved=await f.accept(reply(1));
 assert.equal(saved.state.runtime.archive_queue.length,1);assert.equal(saved.state.runtime.archive.length,0);
 assert.equal(Object.values(saved.state.tables.T_SYS_SOURCE_FRAGMENTS).length,1);
 saved=await f.accept(reply(2));assert.equal(saved.state.runtime.archive.length,0);
 saved=await f.accept(reply(3));
 const events=Object.values(saved.state.tables.T_DYN_EVENTS);assert.equal(events.length,1,'archive form must actually reach the canonical event table');
 assert.equal(events[0].values.short_code,'01');assert.equal(events[0].values.source_entry_id,f.ctx.chat[1].extra[NS].uid);
 assert.match(f.host.latest().materials.tisya_material_memory_archive,/01.*本轮看见信/);assert.doesNotMatch(f.host.latest().materials.tisya_material_memory_archive,/e2|e3/);
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
 ['事件','T_DYN_EVENTS',{title:'新事件',spine_digest:'推门后看见信'}],
 ['阶段摘要','T_DYN_STAGE_SUMMARIES',{name:'渡口阶段',summary_text:'推门后看见信，仍待辨认落款。'}],
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

test('character dossier, entity and live state resolve as one referent while true name is completed',()=>{
 const e=seed();e.newRecord('T_DYN_ENTITY_STATE',{entity_id:'a',posture:'站立'},'state-a');e.set(['T_CHAR_DOSSIER','d-a','true_name',[]],'青');
 const secret=form(e.data,'T_CHAR_SECRETS',{name:'渡口旧约',fact_proposition:'旧约仍然有效',related_object_refs:'关联：阿青'});
 const event=form(e.data,'T_DYN_EVENTS',{title:'渡口重逢',spine_digest:'两人在渡口重逢',knowers:'关联：阿青'});
 const dossier=form(e.data,'T_CHAR_DOSSIER',{true_name:'青禾'},'d-a');
 acceptReply(e,reply(1,[secret,event].join('\n')).replace('<cells/>','<cells format="form">'+dossier+'</cells>'),'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 assert.equal(e.data.runtime.archive_queue[0].status,'formal',JSON.stringify(e.data.runtime.archive_queue[0].error));
 assert.equal(e.rows('T_CHAR_DOSSIER')['d-a'].values.true_name,'青禾');assert.equal(e.rows('T_SYS_ENTITIES').a.values.origin_record_ref,'o-a');assert.equal(e.rows('M_FIELD_REFERENCES')['o-a'].values.target_row_uuid,'d-a');
 const links=Object.values(e.rows('M_LIST_VALUES')).filter(row=>['related_object_refs','knowers'].includes(row.values.owner_field));assert.equal(links.length,2);
 assert(links.every(row=>row.values.target_table==='T_SYS_ENTITIES'&&row.values.target_row_uuid==='a'));
});

test('two distinct same-name characters remain ambiguous after projection',()=>{
 const e=seed();e.newRecord('T_DYN_ENTITY_STATE',{entity_id:'a',posture:'站立'},'state-a');
 e.newRecord('T_CHAR_DOSSIER',{name:'阿青'},'d-c');e.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'c',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'d-c',reference_kind:'record',resolution_status:'resolved'},'o-c');e.newRecord('T_SYS_ENTITIES',{name:'阿青',kind:'character',origin_record_ref:'o-c'},'c');e.newRecord('T_DYN_ENTITY_STATE',{entity_id:'c',posture:'站立'},'state-c');
 const secret=form(e.data,'T_CHAR_SECRETS',{name:'不可猜测的秘密',fact_proposition:'不能猜测关联目标',related_object_refs:'关联：阿青'});acceptReply(e,reply(1,secret),'m1');
 assert.equal(e.data.runtime.archive_queue[0].status,'blocked');assert.match(e.data.runtime.archive_queue[0].error.message,/关联名称不存在、重名或表不匹配：阿青/);assert.equal(Object.keys(e.rows('T_CHAR_SECRETS')).length,0);
});

test('displayed e02 event identity resolves in ordinary cognition references to the canonical event',()=>{
 const e=seed();e.newRecord('T_DYN_EVENTS',{short_code:'02',title:'渡口交信',spine_digest:'阿青交付信件'},'event-02');
 const archive=form(e.data,'T_DYN_COGNITION',{name:'交信认知',subject_ref:'阿青',event_ref:'e02',epistemic_level:'K3',acquisition_channel:'亲眼看见',subjective_belief:'知道信件已经交付'});
 acceptReply(e,reply(1,archive),'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 assert.equal(e.data.runtime.archive_queue[0].status,'formal',JSON.stringify(e.data.runtime.archive_queue[0].error));
 const cognition=Object.values(e.rows('T_DYN_COGNITION')).find(row=>row.values.name==='交信认知');assert.equal(cognition.values.event_ref,'event-02');
});

test('pre-narrative replay resolves an explicitly supplied same-batch event code without assigning missing codes',()=>{
 const e=seed(),event=form(e.data,'T_DYN_EVENTS',{short_code:'e02',spine_digest:'旧回复明确提供的第二事件'});
 const cognition=form(e.data,'T_DYN_COGNITION',{name:'第一重旧认知',subject_ref:'阿青',event_ref:'e02',epistemic_level:'K3',acquisition_channel:'亲眼看见',subjective_belief:'知道第二件事已经发生'});
 const secondCognition=form(e.data,'T_DYN_COGNITION',{name:'第二重旧认知',subject_ref:'阿白',event_ref:'e02',epistemic_level:'K2',acquisition_channel:'他人转述',subjective_belief:'听说第二件事已经发生'}).replace('／1】','／2】');
 acceptReply(e,reply(1,[event,cognition,secondCognition].join('\n')),'m1',1,'main',{formOwnershipVersion:PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION});
 acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 assert.equal(e.data.runtime.archive_queue[0].status,'formal',JSON.stringify(e.data.runtime.archive_queue[0].error));
 const saved=Object.entries(e.rows('T_DYN_EVENTS')).find(([,row])=>row.values.spine_digest==='旧回复明确提供的第二事件');assert(saved);assert.equal(saved[1].values.short_code,'e02');assert.equal(saved[1].values.title,'事件02');
 const rows=Object.values(e.rows('T_DYN_COGNITION')).filter(row=>['第一重旧认知','第二重旧认知'].includes(row.values.name));assert.equal(rows.length,2);assert(rows.every(row=>row.values.event_ref===saved[0]));
 assert(!Object.values(e.rows('T_DYN_EVENTS')).some(row=>row.values.short_code==='01'),'legacy replay must not synthesize event codes');
});

test('pre-narrative replay keeps duplicate explicit event codes ambiguous',()=>{
 const e=seed();e.newRecord('T_DYN_EVENTS',{short_code:'02',title:'既有第二事件',spine_digest:'既有第二事件'},'event-02');
 const event=form(e.data,'T_DYN_EVENTS',{short_code:'e02',spine_digest:'同码的新事件'});
 const cognition=form(e.data,'T_DYN_COGNITION',{name:'歧义认知',subject_ref:'阿青',event_ref:'e02',epistemic_level:'K3',acquisition_channel:'亲眼看见',subjective_belief:'不应猜测目标'});
 acceptReply(e,reply(1,[event,cognition].join('\n')),'m1',1,'main',{formOwnershipVersion:PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION});
 assert.equal(e.data.runtime.archive_queue[0].status,'blocked');assert.match(e.data.runtime.archive_queue[0].error.message,/关联名称不存在、重名或表不匹配：e02/);assert.equal(e.rows('T_DYN_EVENTS')['event-02'].values.spine_digest,'既有第二事件');
});

test('new same-batch event code resolves in multiple cognition references',()=>{
 const e=seed(),first=form(e.data,'T_DYN_EVENTS',{title:'先发生',spine_digest:'第一件事'}),second=form(e.data,'T_DYN_EVENTS',{title:'后发生',spine_digest:'第二件事'}).replace('／1】','／2】');
 const cognition=form(e.data,'T_DYN_COGNITION',{name:'第一重认知',subject_ref:'阿青',event_ref:'e02',epistemic_level:'K3',acquisition_channel:'亲眼看见',subjective_belief:'知道第二件事已经发生'});
 const secondCognition=form(e.data,'T_DYN_COGNITION',{name:'第二重认知',subject_ref:'阿白',event_ref:'e02',epistemic_level:'K2',acquisition_channel:'他人转述',subjective_belief:'听说第二件事已经发生'}).replace('／1】','／2】');
 acceptReply(e,reply(1,[first,second,cognition,secondCognition].join('\n')),'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 assert.equal(e.data.runtime.archive_queue[0].status,'formal',JSON.stringify(e.data.runtime.archive_queue[0].error));
 const event=Object.entries(e.rows('T_DYN_EVENTS')).find(([,row])=>row.values.title==='后发生');assert.equal(event[1].values.short_code,'02');
 const rows=Object.values(e.rows('T_DYN_COGNITION')).filter(row=>['第一重认知','第二重认知'].includes(row.values.name));assert.equal(rows.length,2);assert(rows.every(row=>row.values.event_ref===event[0]));
});

test('new same-batch event codes resolve forward and cyclic event links',()=>{
 const e=seed(),first=form(e.data,'T_DYN_EVENTS',{title:'先发生',spine_digest:'第一件事'}),second=form(e.data,'T_DYN_EVENTS',{title:'后发生',spine_digest:'第二件事'}).replace('／1】','／2】');
 const forward=form(e.data,'T_DYN_EVENT_LINKS',{event_ref:'e01',target_event_ref:'e02',edge_kind:'明确因果',connection_evidence:'第一件事引起第二件事'});
 const reverse=form(e.data,'T_DYN_EVENT_LINKS',{event_ref:'e02',target_event_ref:'e01',edge_kind:'主题回响',connection_evidence:'第二件事回望第一件事'}).replace('／1】','／2】');
 acceptReply(e,reply(1,[first,second,forward,reverse].join('\n')),'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 assert.equal(e.data.runtime.archive_queue[0].status,'formal',JSON.stringify(e.data.runtime.archive_queue[0].error));
 const events=Object.entries(e.rows('T_DYN_EVENTS')).filter(([,row])=>['先发生','后发生'].includes(row.values.title));assert.equal(events.length,2);
 const byCode=new Map(events.map(([id,row])=>[row.values.short_code,id])),links=Object.values(e.rows('T_DYN_EVENT_LINKS'));assert.equal(links.length,2);
 assert(links.some(row=>row.values.event_ref===byCode.get('01')&&row.values.target_event_ref===byCode.get('02')));
 assert(links.some(row=>row.values.event_ref===byCode.get('02')&&row.values.target_event_ref===byCode.get('01')));
});

for(const [label,prepare]of [
 ['unknown code does not fall through to another table',e=>e.newRecord('T_SYS_ENTITIES',{name:'e99',kind:'character'},'not-an-event')],
 ['duplicate codes stay ambiguous',e=>{e.newRecord('T_DYN_EVENTS',{short_code:'99',title:'重复甲'},'duplicate-a');e.newRecord('T_DYN_EVENTS',{short_code:'99',title:'重复乙'},'duplicate-b');}]
])test('event code references retain strict validation: '+label,()=>{
 const e=seed();prepare(e);const code=label.startsWith('unknown')?'e99':'e99',archive=form(e.data,'T_DYN_COGNITION',{name:'无效关联',subject_ref:'阿青',event_ref:code,epistemic_level:'K3',acquisition_channel:'亲眼看见',subjective_belief:'不应写入'});
 acceptReply(e,reply(1,archive),'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 assert.equal(e.data.runtime.archive_queue[0].status,'blocked');assert.match(e.data.runtime.archive_queue[0].error.message,/关联名称不存在、重名或表不匹配/);if(label.startsWith('unknown'))assert.match(e.data.runtime.archive_queue[0].error.message,/若指本批新事件，请补上对应的【双层历史事件】分组/);assert.equal(Object.keys(e.rows('T_DYN_COGNITION')).length,0);
});

test('main archive grouped form uses the existing field contract and keeps explicit unknowns plus pending items',async()=>{
 const f=await fixture(),state=(await f.host.export()).state,body=form(state,'T_DYN_EVENTS',{title:'门后的信',spine_digest:'看到信件',cause:'?'});
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
 Object.assign(f.ctx,clone(parent));f.ctx.chat[1].mes=reply(10);await f.host.event('MESSAGE_EDITED',1);let state=(await f.host.export()).state;assert.deepEqual(Object.values(state.tables.T_DYN_EVENTS).map(r=>r.values.title),['事件10']);
 const kept=clone({chatId:f.ctx.chatId,chat:f.ctx.chat,chatMetadata:f.ctx.chatMetadata}),keptBundle=await f.host.export();f.ctx.chatId='memory-child';f.ctx.chat.splice(-2);await f.host.event('CHAT_CHANGED');state=(await f.host.export()).state;assert.equal(Object.keys(state.tables.T_DYN_EVENTS).length,0);
 Object.assign(f.ctx,kept);assert.deepEqual(await f.host.export(),keptBundle);await f.cold().sync();assert.equal(Object.values((await f.host.export()).state.tables.T_DYN_EVENTS)[0].values.title,'事件10');
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
 const e=seed(),archive=form(e.data,'T_DYN_EVENTS',{title:'门开了'})+'\n'+form(e.data,'T_DYN_EVENTS',{title:'窗边落雨'}).replace('／1】','／2】').replaceAll('P1','P2'),raw=reply(1,archive).replace('1 第1次推门，看见信上留下的线索。','1 门开了。\n\n2 窗边落雨。');
 acceptReply(e,raw,'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 for(const [code,p]of [['01','P1'],['02','P2']]){const row=Object.values(e.rows('T_DYN_EVENTS')).find(r=>r.values.short_code===code);assert(row,JSON.stringify(e.data.runtime.archive_queue[0].error));assert.equal(row.values.source_paragraphs,p);assert.deepEqual(row.metadata.archive_source.paragraphs,[p]);assert.equal(row.metadata.archive_source.fragment_ids.length,1);const fragment=e.rows('T_SYS_SOURCE_FRAGMENTS')[row.metadata.archive_source.fragment_ids[0]];assert.equal(fragment.values.paragraph_id,p);assert.equal(fragment.values.entry_hash,row.values.source_hash);}
});
