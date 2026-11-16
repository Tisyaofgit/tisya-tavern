import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {acceptReply} from '../engine/reply.mjs';
import {reconcile,inversePatch} from '../engine/journal.mjs';
import {digest} from '../engine/common.mjs';
import {describeReviewForms,editReviewDocument} from '../engine/review-form-document.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {REPLY_FORM_OWNERSHIP_VERSION,PRE_TIME_TEXT_REPLY_FORM_VERSION,PRE_UNIT_REPLY_FORM_VERSION,LEGACY_REPLY_FORM_OWNERSHIP_VERSION,replyFormDecoding} from '../engine/reply-form-ownership.mjs';
import {fixture} from './turn-review-host.test.js';

const fresh=()=>new Runtime(initializeState(catalog));
const context=(e,options={})=>prepareMatrixSheets({state:e.data},{operationId:'time-text',task:'main',mode:'revise',...options});
function form(e,id,values,heading){const t=context(e).catalog.templates.find(t=>t.id===id);return '【'+(heading??t.label+'／1')+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');}
const cells=(e,value='当晚')=>form(e,'T_DYN_CONDITIONS',{name:'灯灼',time_basis:'故事时刻',start_time:value,due_time:'次日清晨'});
const reply=(cells,archive='')=>'<reply><body>1 旅人当晚被灯火灼伤，次日清晨仍有余痛。</body><cells format="form">'+cells+'</cells><archive format="form">'+archive+'</archive></reply>';
function compile(e,text,options={}){const c=context(e,options),a=acceptMatrixSheets(c,{state:e.data},{blocks:{cells:text}}),copy=new Runtime(e.data);applyMatrixChanges(copy,a.proposal.matrix.changes);return copy;}
const times=e=>Object.values(e.rows('M_WORLD_TIME')).map(r=>r.values);

test('plain condition timestamps preserve source text without inventing exact date components or writes during preview',()=>{
 const e=fresh(),before=structuredClone(e.data),copy=compile(e,cells(e));assert.deepEqual(e.data,before);
 assert.deepEqual(times(copy).map(v=>v.original_text),['当晚','次日清晨']);
 for(const v of times(copy)){assert.equal(v.precision,'unknown');assert.equal(v.owner_table,'T_DYN_CONDITIONS');assert.equal(v.value_state,'known');for(const k of ['calendar_ref','year','month','day','hour','minute','tick','relative_anchor_ref'])assert.equal(v[k],undefined,k);}
 const written=Object.values(copy.rows('T_DYN_CONDITIONS'))[0].values;assert.equal(written.time_basis,'故事时刻');assert.equal(copy.rows('M_WORLD_TIME')[written.start_time].values.original_text,'当晚');
});

test('explicit time prefix and ordinary dates use one child codec; invalid explicit selectors and empty text still reject',()=>{
 const e=fresh();for(const raw of ['当晚','原文：当晚','原文: 当晚','2026/11/17 19:30']){const copy=compile(e,form(e,'T_DYN_CONDITIONS',{name:'灯灼',start_time:raw}));assert.equal(times(copy)[0].original_text,raw.startsWith('原文')?'当晚':raw);}
 for(const raw of ['原文：','""','世界时间分量／已有：不存在〔1〕','世界时间分量／3','M_WORLD_TIME#missing','关联：不存在'])assert.throws(()=>compile(e,form(e,'T_DYN_CONDITIONS',{name:'灯灼',start_time:raw})),/时间|原文|名称/);
 assert.equal(Object.keys(e.rows('M_WORLD_TIME')).length,0);
});

test('updating narrative time reuses owned detail; exact precision and another record ownership stay protected',()=>{
 let e=compile(fresh(),cells(fresh()));const c=context(e),heading=c.references.find(r=>r.tableId==='T_DYN_CONDITIONS').display,condition=Object.values(e.rows('T_DYN_CONDITIONS'))[0].values,id=condition.start_time;
 e=compile(e,form(e,'T_DYN_CONDITIONS',{start_time:'第二天傍晚'},heading));assert.equal(Object.keys(e.rows('M_WORLD_TIME')).length,2);assert.equal(e.rows('M_WORLD_TIME')[id].values.original_text,'第二天傍晚');
 const ref=context(e).references.find(r=>r.tableId==='M_WORLD_TIME'&&r.recordId===id);const same=compile(e,form(e,'T_DYN_CONDITIONS',{start_time:ref.display},heading));assert.equal(times(same).length,2);
 assert.throws(()=>compile(e,form(e,'T_DYN_CONDITIONS',{name:'另一伤势',start_time:ref.display}),{operationId:'other-owner'}),/不能改挂/);
 e.set(['M_WORLD_TIME',id,'precision',[]],'hour');e.set(['M_WORLD_TIME',id,'hour',[]],19);const before=structuredClone(e.data);
 for(const raw of ['次日','原文：次日'])assert.throws(()=>compile(e,form(e,'T_DYN_CONDITIONS',{start_time:raw},heading)),/已有精确值/);
 assert.deepEqual(e.data,before);assert.equal(compile(e,form(e,'T_DYN_CONDITIONS',{start_time:ref.display},heading)).rows('M_WORLD_TIME')[id].values.hour,19);
});

test('unknown time states remain states and unsupported schema types do not acquire narrative storage',()=>{
 const e=fresh();for(const [raw,state]of [['?','unknown'],['∅','none'],['—','not_applicable']]){const copy=compile(e,form(e,'T_DYN_CONDITIONS',{name:'灯灼',start_time:raw})),r=Object.values(copy.rows('T_DYN_CONDITIONS'))[0];assert.equal(r.states.start_time,state);assert.equal(times(copy).length,0);}
 e.registerTable('TIME_TEST',[{key:'name',label:'名称',type:'TEXT'},{key:'time',label:'时间',type:'CHILD_REF',ref:'M_WORLD_TIME',source_type:'NUMBER'}],'无描述合同');assert.throws(()=>compile(e,form(e,'TIME_TEST',{name:'测试',time:'当晚'})),/描述型填写合同/);
});

test('time field help and raw span editing preserve evidence, other values, and model-facing instructions',()=>{
 const e=fresh(),text=cells(e),doc=describeReviewForms(e.data,{cells:text,archive:''}).cells,rows=doc.groups[0].rows,time=rows.find(r=>r.key==='start_time');assert.match(time.help,/直接填写时间原文/);assert.equal(time.value,'当晚');
 const edited=editReviewDocument(doc,{[time.start]:'昨夜'});assert.equal(edited,text.replace('当晚','昨夜'));assert.match(edited,/昨夜 \| P1/);assert.match(materials(e).tisya_material_cell_prompts,/生效点（时间原文或已有名称）/);assert.match(context(e).form,/时间可直接填/);
});

test('production review confirms cells and archive time text atomically, retains original reply and survives reload and reroll',async()=>{
 const f=await fixture(),e=new Runtime((await f.snapshot()).state),raw=reply(cells(e),form(e,'T_DYN_EVENTS',{title:'灯火灼伤',story_time:'当晚',spine_digest:'旅人被灯火灼伤'}));f.ctx.chat.push({mes:raw});await f.host.sync();assert.equal(times(new Runtime((await f.snapshot()).state)).length,0);
 await f.host.confirmTurn(await f.draft());let s=await f.snapshot();assert.equal(times(new Runtime(s.state)).length,3);assert.equal(f.ctx.chat[0].mes,raw);assert.equal(Object.values(s.state.tables.T_DYN_EVENTS).length,1);
 const saved=Object.values(s.state.tables.M_WORLD_TIME).find(r=>r.values.owner_field==='start_time');assert.equal(saved.metadata.original_text.source_pointer.paragraph_reference,'P1');
 const reopened=createMatrixHost(f.options);await reopened.sync();assert.equal(times(new Runtime((await reopened.export()).state)).length,3);
 f.ctx.chat[0].mes=raw.replaceAll('当晚','昨晚');await f.host.sync();assert(times(new Runtime((await f.snapshot()).state)).some(v=>v.original_text==='当晚'));await f.host.confirmTurn(await f.draft());s=await f.snapshot();assert.equal(times(new Runtime(s.state)).length,3);assert(times(new Runtime(s.state)).some(v=>v.original_text==='昨晚'));
});

test('invalid companion field and storage rejection leave the whole draft pending without partial records',async()=>{
 const f=await fixture(),e=new Runtime((await f.snapshot()).state),good=cells(e),bad=good+'\n'+context(e).catalog.templates.find(t=>t.id==='T_DYN_CONDITIONS').fields.find(f=>f.key==='validity').row+'：乱填';f.ctx.chat.push({mes:reply(bad)});await f.host.sync();
 const before=(await f.snapshot()).state;await assert.rejects(f.host.confirmTurn(await f.draft()),/不能保存/);assert.deepEqual((await f.snapshot()).state,before);
 const originalCommit=f.options.storage.commit;f.options.storage.commit=async()=>false;await assert.rejects(f.host.confirmTurn({...await f.draft(),cells:good}),/已更新存档/);assert.deepEqual((await f.snapshot()).state,before);f.options.storage.commit=originalCommit;
 await f.host.confirmTurn({...await f.draft(),cells:good});assert.equal(times(new Runtime((await f.snapshot()).state)).length,2);assert.equal(f.ctx.chat[0].mes,reply(bad));
});

test('v1, v2 and legacy keep their saved decoder; v2 common units remain exact and new candidates use v3',()=>{
 for(const version of [PRE_TIME_TEXT_REPLY_FORM_VERSION,PRE_UNIT_REPLY_FORM_VERSION,LEGACY_REPLY_FORM_OWNERSHIP_VERSION]){
  const e=fresh(),c=context(e),raw=reply(cells(e)),result=acceptReply(e,raw,'old',1,'main',{formOwnershipVersion:version});assert.equal(result.result.operations[0].status,'FAILED');assert.equal(times(e).length,0);
  assert.throws(()=>compile(fresh(),cells(fresh()),replyFormDecoding(version)),/原文/);
 }
 const e=fresh(),text=form(e,'T_DYN_CONDITIONS',{name:'旧灯灼',start_time:'原文：当晚'})+'\n'+form(e,'T_DYN_SCENE_SPACE',{name:'等待',turn_elapsed:'3分钟'});acceptReply(e,reply(text),'v2',1,'main',{formOwnershipVersion:PRE_TIME_TEXT_REPLY_FORM_VERSION});assert.equal(times(e)[0].original_text,'当晚');assert.equal(Object.values(e.rows('M_QUANTITIES'))[0].values.quantity_mode,'exact');
});

test('unchanged rejected v2 time does not silently become accepted when earlier history changes; edited source uses v3',()=>{
 const e=fresh(),before=structuredClone(e.data),text=reply(cells(e)),version=PRE_TIME_TEXT_REPLY_FORM_VERSION;acceptReply(e,text,'a',1,'main',{formOwnershipVersion:version});
 const messages=[{uid:'u',role:'user',text:'原输入'},{uid:'a',role:'assistant',text}],entries=messages.map(m=>({uid:m.uid,role:m.role,signature:digest(m),revision:1,warnings:[],pre_turn_snapshot:{format:'tisya.inverse-patch.v1',inverse_patch:m.role==='assistant'?inversePatch(before,e.data):[]},...(m.role==='assistant'?{reply_form_ownership_version:version}:{})}));
 const bundle={state:e.data,journal:{entries,revision_by_uid:{u:1,a:1}}};messages[0].text='修改前一层';let r=reconcile(bundle,messages);assert.equal(Object.keys(r.bundle.state.tables.M_WORLD_TIME).length,0);assert.equal(r.bundle.state.runtime.sources['main/a@2'].reply_form_ownership_version,version);
 messages[1].text=text.replaceAll('当晚','昨晚');r=reconcile(r.bundle,messages);assert.equal(Object.keys(r.bundle.state.tables.M_WORLD_TIME).length,2);assert.equal(r.bundle.state.runtime.sources['main/a@3'].reply_form_ownership_version,REPLY_FORM_OWNERSHIP_VERSION);
});
