import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {replyFormDecoding,PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION} from '../engine/reply-form-ownership.mjs';
import {describeReviewForms} from '../engine/review-form-document.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {fixture} from './turn-review-host.test.js';
const fresh=()=>new Runtime(initializeState(catalog,{audience:'author',world_ref:'test-world'}));
const context=(e,operationId='identity')=>prepareMatrixSheets({state:e.data},{operationId,task:'main',mode:'revise'});
const form=(e,table,values,{number=1,heading}={})=>{const t=context(e).catalog.templates.find(t=>t.id===table);return '【'+(heading??t.label+'／'+number)+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');};
function compile(e,text,op='identity',flags={}){const a=acceptMatrixSheets(prepareMatrixSheets({state:e.data},{operationId:op,task:'main',mode:'revise',...flags}),{state:e.data},{blocks:{cells:text}}),copy=new Runtime(e.data);applyMatrixChanges(copy,a.proposal.matrix.changes);return {a,copy};}
const events=e=>Object.values(e.data.tables.T_DYN_EVENTS);
const relations=e=>Object.values(e.data.tables.T_DYN_RELATIONS_PACTS);
const reply=(cells,archive='')=>'<reply><body>1 甲向乙交付信物，乙接过并致谢。</body><cells format="form">'+cells+'</cells><archive format="form">'+archive+'</archive></reply>';
test('events receive sequential codes without titles; repeated titles do not identify an event',()=>{
 const e=fresh(),before=structuredClone(e.data),text=form(e,'T_DYN_EVENTS',{full_process:'甲抵达'})+'\n'+form(e,'T_DYN_EVENTS',{full_process:'乙抵达'},{number:2});
 const {a,copy}=compile(e,text);assert.deepEqual(e.data,before);assert.deepEqual(events(copy).map(r=>r.values.short_code),['01','02']);assert.deepEqual(a.proposal.matrix.changes,compile(e,text).a.proposal.matrix.changes);
 const next=compile(copy,form(copy,'T_DYN_EVENTS',{title:'同名旧标题',full_process:'新事件'}),'second').copy;
 const last=compile(next,form(next,'T_DYN_EVENTS',{title:'同名旧标题',full_process:'另一事件'}),'third').copy;assert.deepEqual(events(last).map(r=>r.values.short_code),['01','02','03','04']);
});
test('event code continues one identity, keeps untouched fields, rejects invented codes',()=>{
 let e=compile(fresh(),form(fresh(),'T_DYN_EVENTS',{full_process:'开始',cause:'旧缘由'})).copy;
 const id=Object.keys(e.rows('T_DYN_EVENTS'))[0];e=compile(e,form(e,'T_DYN_EVENTS',{short_code:'01',result:'落定'}),'patch').copy;
 assert.equal(events(e).length,1);assert.equal(e.rows('T_DYN_EVENTS')[id].values.cause,'旧缘由');assert.equal(e.rows('T_DYN_EVENTS')[id].values.result,'落定');
 assert.throws(()=>compile(e,form(e,'T_DYN_EVENTS',{short_code:'99',result:'错误'})),/编号不存在/);
 const ref=context(e).references.find(r=>r.tableId==='T_DYN_EVENTS');assert.equal(ref.name,'01');assert.equal(compile(e,form(e,'T_DYN_EVENTS',{impact:'延续'},{heading:ref.display})).copy.rows('T_DYN_EVENTS')[id].values.impact,'延续');
});
test('legacy events get read-only code projection and preserve old title aliases',()=>{
 const e=fresh();e.newRecord('T_DYN_EVENTS',{title:'旧经过'},'old');const before=structuredClone(e.data),c=context(e);assert.equal(c.references.find(r=>r.recordId==='old').name,'01');assert.deepEqual(e.data,before);
 const next=compile(e,form(e,'T_DYN_EVENTS',{short_code:'01',result:'已完成'})).copy;assert.equal(next.rows('T_DYN_EVENTS').old.values.title,'旧经过');assert.equal(events(next).length,1);assert.equal(next.rows('T_DYN_EVENTS').old.values.short_code,'01');
});
test('directed pair continues across abstract names and reverse direction stays distinct',()=>{
 const e=fresh(),first=compile(e,form(e,'T_DYN_RELATIONS_PACTS',{subject_ref:'甲',target_ref:'乙',attitude_tag:'戒备',evidence:'尚未交谈'})).copy,id=Object.keys(first.rows('T_DYN_RELATIONS_PACTS'))[0];
 const text=form(first,'T_DYN_RELATIONS_PACTS',{name:'抽象的新名称',subject_ref:'甲',target_ref:'乙',attitude_tag:'信任',effective_from:'次日'}),next=compile(first,text,'second').copy;
 assert.equal(relations(next).length,1);assert.equal(next.rows('T_DYN_RELATIONS_PACTS')[id].values.name,'甲 → 乙');assert.equal(next.rows('T_DYN_RELATIONS_PACTS')[id].values.attitude_tag,'信任');assert.equal(next.rows('T_DYN_RELATIONS_PACTS')[id].values.evidence,'尚未交谈');
 const view=describeReviewForms(first.data,{cells:text});assert.equal(view.cells.groups[0].recordId,id);assert.equal(view.cells.groups[0].rows.find(r=>r.key==='attitude_tag').previous,'戒备');assert(view.cells.groups[0].rows.find(r=>r.key==='name').hidden);
 const reverse=compile(next,form(next,'T_DYN_RELATIONS_PACTS',{subject_ref:'乙',target_ref:'甲',attitude_tag:'怀疑'}),'reverse').copy;assert.equal(relations(reverse).length,2);
});
test('pair ambiguity and endpoint edits require explicit choices; hidden worlds never coalesce',()=>{
 let e=compile(fresh(),form(fresh(),'T_DYN_RELATIONS_PACTS',{subject_ref:'甲',target_ref:'乙',attitude_tag:'戒备'})).copy;const row=relations(e)[0];e.newRecord('T_DYN_RELATIONS_PACTS',{name:'历史重复',subject_ref:row.values.subject_ref,target_ref:row.values.target_ref},'duplicate');
 assert.throws(()=>compile(e,form(e,'T_DYN_RELATIONS_PACTS',{subject_ref:'甲',target_ref:'乙',attitude_tag:'信任'})),/多条旧记录/);
 const ref=context(e).references.find(r=>r.recordId==='duplicate');assert.throws(()=>compile(e,form(e,'T_DYN_RELATIONS_PACTS',{subject_ref:'乙'},{heading:ref.display})),/不能改换/);
 e.data.runtime.scope.world_ref='different';const next=compile(e,form(e,'T_DYN_RELATIONS_PACTS',{subject_ref:'甲',target_ref:'乙',attitude_tag:'未识'}),'different').copy;assert.equal(relations(next).length,3);
});
test('anchors reuse owner and name, while same-named anchors of other owners remain distinct',()=>{
 const e=fresh(),first=compile(e,form(e,'T_CHAR_ANCHORS',{char_ref:'甲',name:'遇事先观察',speech:'先等等'})).copy;
 const next=compile(first,form(first,'T_CHAR_ANCHORS',{char_ref:'甲',name:'遇事先观察',speech:'现在可以行动'}),'next').copy;assert.equal(Object.keys(next.rows('T_CHAR_ANCHORS')).length,1);assert.equal(Object.values(next.rows('T_CHAR_ANCHORS'))[0].values.speech,'现在可以行动');
 const other=compile(next,form(next,'T_CHAR_ANCHORS',{char_ref:'乙',name:'遇事先观察',speech:'别急'}),'other').copy;assert.equal(Object.keys(other.rows('T_CHAR_ANCHORS')).length,2);
});
test('new forms omit generated names and old saved v4 replies keep the old decoder',()=>{
 const e=fresh(),c=context(e);assert(!c.formSections.find(x=>x.tableId==='T_DYN_EVENTS').text.includes('事件标题'));assert(!c.formSections.find(x=>x.tableId==='T_DYN_RELATIONS_PACTS').text.includes('关系名称'));
 assert.equal(replyFormDecoding(PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION).narrativeIdentity,false);assert.equal(replyFormDecoding(PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION).sceneNameReuse,true);
 e.newRecord('T_DYN_EVENTS',{title:'同标题'},'old');assert.throws(()=>compile(e,form(e,'T_DYN_EVENTS',{title:'同标题'}),'old',replyFormDecoding(PRE_NARRATIVE_IDENTITY_REPLY_FORM_VERSION)),/已有同名/);
});
test('production confirm, reload, historical preview and rewind retain per-node event and attitude states',async()=>{
 const f=await fixture(),e=new Runtime((await f.snapshot()).state);
 f.ctx.chat.push({mes:reply(form(e,'T_DYN_RELATIONS_PACTS',{subject_ref:'甲',target_ref:'乙',attitude_tag:'戒备'}),form(e,'T_DYN_EVENTS',{full_process:'交付开始'})+'\n'+form(e,'T_CHAR_ANCHORS',{char_ref:'甲',name:'先观察',speech:'等等'}))});await f.host.sync();await f.host.confirmTurn(await f.draft());
 const first=(await f.snapshot()).state;assert.equal(Object.keys(first.tables.T_SYS_ENTITIES).length,2);const id=Object.keys(first.tables.T_DYN_RELATIONS_PACTS)[0],eventId=Object.keys(first.tables.T_DYN_EVENTS)[0];
 f.ctx.chat.push({is_user:true,mes:'继续'},{mes:reply(form(e,'T_DYN_RELATIONS_PACTS',{subject_ref:'甲',target_ref:'乙',attitude_tag:'信任',effective_from:'当晚'}),form(e,'T_DYN_EVENTS',{short_code:'01',result:'交付完成'}))});await f.host.sync();await f.host.confirmTurn(await f.draft());
 let state=(await f.snapshot()).state;assert.equal(Object.keys(state.tables.T_DYN_EVENTS).length,1);assert.equal(state.tables.T_DYN_EVENTS[eventId].values.result,'交付完成');assert.equal(state.tables.T_DYN_RELATIONS_PACTS[id].values.attitude_tag,'信任');
 await createMatrixHost(f.options).sync();assert.equal((await f.snapshot()).state.tables.T_DYN_RELATIONS_PACTS[id].values.attitude_tag,'信任');
 const list=await f.host.listTurnReviews(),view=await f.host.describeTurnReview({...list.reviews[1],contextKey:list.contextKey,expectedRevision:list.revision});assert.equal(view.cells.groups[0].rows.find(r=>r.key==='attitude_tag').previous,'戒备');
 await f.host.rewindTurnReviews({uid:list.reviews[1].uid,contextKey:list.contextKey,expectedRevision:list.revision});state=(await f.snapshot()).state;assert.equal(state.tables.T_DYN_RELATIONS_PACTS[id].values.attitude_tag,'戒备');assert.equal(state.tables.T_DYN_EVENTS[eventId].values.result,undefined);assert.equal(state.tables.T_DYN_EVENTS[eventId].values.short_code,'01');
});

test('two-digit and larger event codes never collide with new form group counters',()=>{
 const e=fresh();for(let n=1;n<=10;n++)e.newRecord('T_DYN_EVENTS',{title:'旧'+n,short_code:String(n).padStart(2,'0')},'event-'+n);
 const text=Array.from({length:10},(_,i)=>form(e,'T_DYN_EVENTS',{full_process:'新'+i},{number:i+1})).join('\n'),next=compile(e,text,'ten-new').copy;
 assert.equal(events(next).length,20);assert.deepEqual(events(next).slice(10).map(r=>r.values.short_code),Array.from({length:10},(_,i)=>String(i+11)));
});

test('one batch can discover a subject through an object reference and then its anchor dossier',()=>{
 const e=fresh(),next=compile(e,form(e,'T_STATIC_ORGANIZATIONS',{name:'行会',leader_ref:'甲'})+'\n'+form(e,'T_CHAR_ANCHORS',{char_ref:'甲',name:'先观察',speech:'稍等'})).copy;
 assert.equal(Object.keys(next.rows('T_SYS_ENTITIES')).length,1);assert.equal(Object.keys(next.rows('T_CHAR_DOSSIER')).length,1);
});

test('ongoing narrative condition changes its description and duration in place across review and reopen',async()=>{
 const f=await fixture();
 const e=new Runtime((await f.snapshot()).state);
 const condition=(values)=>reply(form(e,'T_DYN_CONDITIONS',values));
 const first=condition({entity_ref:'巡夜人',name:'旧伤',observable_effect:'抬不起手',remaining_value:'3',validity:'有效'});
 f.ctx.chat.push({mes:first});await f.host.sync();await f.host.confirmTurn(await f.draft());
 const states=async()=>(await f.snapshot()).state.tables.T_DYN_CONDITIONS;
 const [id]=Object.keys(await states());
 const patch=condition({name:'旧伤',observable_effect:'能够抬手',remaining_value:'1'});
 f.ctx.chat.push({is_user:true,mes:'继续'},{mes:patch});await f.host.sync();
 const candidate=await f.draft(),preview=await f.host.describeTurnReview(candidate);
 assert.equal(preview.cells.groups[0].recordId,id);
 assert.equal(preview.cells.groups[0].rows.find(r=>r.key==='observable_effect').previous,'抬不起手');
 await f.host.confirmTurn(candidate);await createMatrixHost(f.options).sync();
 const updated=await states();assert.deepEqual(Object.keys(updated),[id]);
 assert.equal(updated[id].values.observable_effect,'能够抬手');assert.equal(updated[id].values.remaining_value,1);
 assert.equal(updated[id].values.validity,'有效');
 const list=await f.host.listTurnReviews(),historical=await f.host.describeTurnReview({...list.reviews[0],contextKey:list.contextKey,expectedRevision:list.revision});
 assert.equal(historical.cells.groups[0].rows.find(r=>r.key==='observable_effect').value,'抬不起手');
 await f.host.rewindTurnReviews({uid:candidate.uid,contextKey:list.contextKey,expectedRevision:list.revision});
 assert.equal((await states())[id].values.observable_effect,'抬不起手');assert.equal((await states())[id].values.remaining_value,3);
});

test('same condition on two actors stays separate and sparse gauge and posture edits retain their owner',()=>{
 const e=fresh();for(const [id,name] of [['a','东卫'],['b','西卫']])e.newRecord('T_SYS_ENTITIES',{kind:'character',name},id);
 const table='T_DYN_CONDITIONS',values={name:'乏力',validity:'有效',observable_effect:'步慢'};
 e.newRecord(table,{...values,entity_ref:'a'},'east');
 const other=compile(e,form(e,table,{...values,entity_ref:'西卫'}),'add-other').copy;
 assert.equal(Object.keys(other.rows(table)).length,2);
 const next=compile(other,form(other,table,{entity_ref:'东卫',name:'乏力',observable_effect:'步稳'}),'update-east').copy;
 assert.equal(next.rows(table).east.values.observable_effect,'步稳');
 assert.equal(Object.values(next.rows(table)).find(r=>r.values.entity_ref==='b').values.observable_effect,'步慢');
 assert.throws(()=>compile(next,form(next,table,{name:'乏力',observable_effect:'步稳'})),/多条同名状态/);
 assert.throws(()=>compile(e,form(e,table,{name:'乏力',observable_effect:'步稳'}),'v6',replyFormDecoding('tisya.reply-form-ownership/6')),/已有同名/);
 for(const [table,values,field] of [
  ['T_DYN_ENTITY_GAUGES',{entity_id:'a',field_key:'focus',name:'注意力',text_value:'分散'},'text_value'],
  ['T_DYN_ENTITY_STATE',{entity_id:'a',name:'执勤姿势',posture:'站立'},'posture'],
 ]){
  e.newRecord(table,values,'original');
  const next=compile(e,form(e,table,{name:values.name,[field]:'已改变'})).copy;
  assert.deepEqual(Object.keys(next.rows(table)),['original']);assert.equal(next.rows(table).original.values[field],'已改变');
 }
});

test('ongoing status respects lifecycle, independent effect sources and explicit bearer identity',()=>{
 const e=fresh(),table='T_DYN_CONDITIONS';
 for(const [id,name] of [['east','东卫'],['west','西卫']])e.newRecord('T_SYS_ENTITIES',{kind:'character',name},id);
 for(const [id,name] of [['charm','护符'],['seal','印记']])e.newRecord('T_STATIC_ITEMS_SKILLS',{name},id);
 const common={entity_ref:'east',name:'辉光',stacking_policy:'separate_instances',source_asset_ref:'charm'};
 e.newRecord(table,{...common,validity:'失效',observable_effect:'已暗淡'},'past');
 e.newRecord(table,{...common,validity:'有效',observable_effect:'微光'},'current');
 const patch={entity_ref:'东卫',name:'辉光',stacking_policy:'separate_instances',observable_effect:'更亮'};
 const revised=compile(e,form(e,table,patch),'refresh').copy;
 assert.deepEqual(Object.keys(revised.rows(table)),['past','current']);
 assert.equal(revised.rows(table).current.values.observable_effect,'更亮');
 assert.equal(revised.rows(table).past.values.observable_effect,'已暗淡');
 const another=compile(revised,form(revised,table,{...patch,source_asset_ref:'印记',validity:'有效'}),'distinct-source').copy;
 assert.equal(Object.keys(another.rows(table)).length,3);
 const last=compile(another,form(another,table,{...patch,source_asset_ref:'护符',validity:'失效'}),'expire').copy;
 assert.equal(last.rows(table).current.values.validity,'失效');
 assert.equal(Object.values(last.rows(table)).filter(r=>r.values.validity==='有效').length,1);
 const target=context(e).references.find(r=>r.recordId==='current').display;
 assert.throws(()=>compile(e,form(e,table,{entity_ref:'西卫',observable_effect:'更亮'},{heading:target})),/所属对象不符/);
 assert.throws(()=>compile(e,form(e,table,{...patch,entity_ref:'?'})),/所属对象和状态字段键须明确/);
 e.newRecord('T_DYN_GLOBAL_GAUGES',{name:'潮位',value:2},'tide');
 const tide=compile(e,form(e,'T_DYN_GLOBAL_GAUGES',{name:'潮位',value:'3'})).copy.rows('T_DYN_GLOBAL_GAUGES');
 assert.deepEqual(Object.keys(tide),['tide']);assert.equal(tide.tide.values.value,3);
});
