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
