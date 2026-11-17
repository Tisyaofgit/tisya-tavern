import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {acceptReply} from '../engine/reply.mjs';
import {replyFormDecoding,PRE_SCENE_REUSE_REPLY_FORM_VERSION,REPLY_FORM_OWNERSHIP_VERSION} from '../engine/reply-form-ownership.mjs';
import {fixture} from './turn-review-host.test.js';
import {describeReviewForms} from '../engine/review-form-document.mjs';
const fresh=()=>new Runtime(initializeState(catalog,{audience:'author',world_ref:'test-world'}));
const context=e=>prepareMatrixSheets({state:e.data},{operationId:'first-mention',task:'main',mode:'revise'});
function form(e,id,values,{number=1,heading}={}){const t=context(e).catalog.templates.find(t=>t.id===id);return '【'+(heading??t.label+'／'+number)+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');}
const reply=(cells,archive='')=>'<reply><body>1 旅人到达客舍，遇见守门人。</body><cells format="form">'+cells+'</cells><archive format="form">'+archive+'</archive></reply>';
function compile(e,text){const a=acceptMatrixSheets(context(e),{state:e.data},{blocks:{cells:text}}),copy=new Runtime(e.data);applyMatrixChanges(copy,a.proposal.matrix.changes);return {a,copy};}
test('first typed place mention registers once without inventing optional facts; compilation is read only',()=>{
 const e=fresh(),before=structuredClone(e.data),text=form(e,'T_DYN_SCENE_SPACE',{name:'抵达客舍',place_ref:'青石镇客舍'}),{a,copy}=compile(e,text);
 assert.deepEqual(e.data,before);const places=Object.values(copy.rows('T_STATIC_PLACES'));assert.equal(places.length,1);assert.equal(places[0].values.name,'青石镇客舍');assert.equal(places[0].values.parent_place_ref,undefined);
 assert.equal(Object.values(copy.rows('T_DYN_SCENE_SPACE'))[0].values.place_ref,places[0].values.row_uuid);
 const second=compile(copy,form(copy,'T_DYN_SCENE_SPACE',{name:'次日离开',place_ref:'青石镇客舍'}));assert.equal(Object.keys(second.copy.rows('T_STATIC_PLACES')).length,1);
 assert.equal(a.proposal.matrix.changes.find(c=>c.tableId==='T_STATIC_PLACES').recordId,compile(e,text).a.proposal.matrix.changes.find(c=>c.tableId==='T_STATIC_PLACES').recordId);
});
test('typed missing people, organizations and items share canonical minimum identities',()=>{
 const e=fresh(),text=form(e,'T_STATIC_ORGANIZATIONS',{name:'渡口行会',leader_ref:'守门人',headquarters_ref:'青石镇客舍'})+'\n'+form(e,'T_CHAR_DOSSIER',{name:'旅人',organization_ref:'渡口行会',birth_place_ref:'青石镇客舍'});
 const {copy}=compile(e,text);assert.equal(Object.keys(copy.rows('T_SYS_ENTITIES')).length,2);assert.equal(Object.keys(copy.rows('T_STATIC_PLACES')).length,1);assert.equal(Object.keys(copy.rows('T_STATIC_ORGANIZATIONS')).length,1);
});
test('whole existing record can be addressed by table and name, omitted fields and explicit empty values remain distinct',()=>{
 const e=fresh();e.newRecord('T_STATIC_PLACES',{name:'青石镇客舍',visual_atmosphere:'临河的客舍',macro_region:'客舍'},'place');
 const {copy}=compile(e,form(e,'T_STATIC_PLACES',{visual_atmosphere:'新修屋顶'},{heading:'地点底档／青石镇客舍'}));assert.equal(copy.rows('T_STATIC_PLACES').place.values.macro_region,'客舍');assert.equal(copy.rows('T_STATIC_PLACES').place.values.visual_atmosphere,'新修屋顶');
});
test('same-table named identity patches reuse one row and merge complementary fields',()=>{
 const e=fresh();e.newRecord('T_STATIC_PLACES',{name:'青石镇客舍',visual_atmosphere:'临河'},'place');
 const {copy}=compile(e,form(e,'T_STATIC_PLACES',{name:'青石镇客舍',visual_atmosphere:'修缮'})+'\n'+form(e,'T_STATIC_PLACES',{name:'青石镇客舍',macro_region:'客舍'},{number:2}));
 assert.equal(Object.keys(copy.rows('T_STATIC_PLACES')).length,1);assert.equal(copy.rows('T_STATIC_PLACES').place.values.visual_atmosphere,'修缮');assert.equal(copy.rows('T_STATIC_PLACES').place.values.macro_region,'客舍');
 const view=describeReviewForms(e.data,{cells:form(e,'T_STATIC_PLACES',{name:'青石镇客舍',visual_atmosphere:'修缮'})});assert.equal(view.cells.groups[0].recordId,'place');assert.equal(view.cells.groups[0].rows[1].previous,'临河');
});
test('archive-only references can create minimum identities but cannot author unrelated state through archive',()=>{
 const e=fresh(),archive=form(e,'T_DYN_EVENTS',{title:'抵达客舍',location_ref:'青石镇客舍'});acceptReply(e,reply('',archive),'archive-first',1,'main',{manualConfirmed:true});
 assert.equal(Object.keys(e.rows('T_STATIC_PLACES')).length,1);assert.equal(Object.keys(e.rows('T_DYN_EVENTS')).length,1);
 const place=Object.values(e.rows('T_STATIC_PLACES'))[0];assert.deepEqual(place.metadata.name.source_pointer.paragraphs,['P1']);
});
test('production review confirms new identities atomically; reload reuses them and reroll removes obsolete first mentions',async()=>{
 const f=await fixture(),e=new Runtime((await f.snapshot()).state);f.ctx.chat.push({mes:reply(form(e,'T_DYN_SCENE_SPACE',{name:'抵达客舍',place_ref:'青石镇客舍'}))});await f.host.sync();
 assert.equal(Object.keys((await f.snapshot()).state.tables.T_STATIC_PLACES).length,0);await f.host.confirmTurn(await f.draft());let state=(await f.snapshot()).state;assert.equal(Object.keys(state.tables.T_STATIC_PLACES).length,1);assert.equal(Object.values(state.tables.T_STATIC_PLACES)[0].metadata.name.source_pointer.paragraph_reference,'P1');
 f.ctx.chat[0].mes=reply(form(e,'T_DYN_SCENE_SPACE',{name:'改走码头',place_ref:'码头'}));await f.host.sync();await f.host.confirmTurn(await f.draft());state=(await f.snapshot()).state;assert.deepEqual(Object.values(state.tables.T_STATIC_PLACES).map(r=>r.values.name),['码头']);
 const v=await f.host.listTurnReviews();await f.host.rewindTurnReviews({uid:v.reviews[0].uid,contextKey:v.contextKey,expectedRevision:v.revision});assert.equal(Object.keys((await f.snapshot()).state.tables.T_STATIC_PLACES).length,0);
});
test('explicit same-turn dossier wins over implicit registration and a later dossier enriches the existing subject',()=>{
 const e=fresh(),{copy}=compile(e,form(e,'T_STATIC_ORGANIZATIONS',{name:'行会',leader_ref:'阿青'})+'\n'+form(e,'T_CHAR_DOSSIER',{name:'阿青'}));assert.equal(Object.keys(copy.rows('T_SYS_ENTITIES')).length,1);assert.equal(Object.keys(copy.rows('T_CHAR_DOSSIER')).length,1);
 const first=compile(e,form(e,'T_STATIC_ORGANIZATIONS',{name:'行会',leader_ref:'阿青'})).copy,id=Object.keys(first.rows('T_SYS_ENTITIES'))[0];const next=compile(first,form(first,'T_CHAR_DOSSIER',{name:'阿青'})).copy;assert.equal(Object.keys(next.rows('T_SYS_ENTITIES')).length,1);assert.equal(next.rows('T_SYS_ENTITIES')[id].values.kind,'character');assert.equal(next.rows('T_SYS_ENTITIES')[id].values.name,'阿青');
});
test('ambiguity stays visible, typed same names stay separate, world scope does not merge hidden rows',()=>{
 const e=fresh();e.newRecord('T_STATIC_PLACES',{name:'客舍'},'p1');e.newRecord('T_STATIC_PLACES',{name:'客舍'},'p2');assert.throws(()=>compile(e,form(e,'T_DYN_SCENE_SPACE',{name:'入内',place_ref:'客舍'})),/重名/);
 const other=fresh();other.newRecord('T_STATIC_ORGANIZATIONS',{name:'客舍'},'org');const first=compile(other,form(other,'T_DYN_SCENE_SPACE',{name:'入内',place_ref:'客舍'})).copy;assert.equal(Object.keys(first.rows('T_STATIC_PLACES')).length,1);assert.equal(Object.keys(first.rows('T_STATIC_ORGANIZATIONS')).length,1);
 first.data.runtime.scope.world_ref='other-world';const second=compile(first,form(first,'T_DYN_SCENE_SPACE',{name:'另一个世界',place_ref:'客舍'})).copy;assert.equal(Object.keys(second.rows('T_STATIC_PLACES')).length,2);
});
test('conflicting same-record fields reject, source-only fields are retained, explicit none remains none',()=>{
 const e=fresh();e.newRecord('T_STATIC_PLACES',{name:'客舍',visual_atmosphere:'原描述'},'place');assert.throws(()=>compile(e,form(e,'T_STATIC_PLACES',{name:'客舍',visual_atmosphere:'甲'})+'\n'+form(e,'T_STATIC_PLACES',{name:'客舍',visual_atmosphere:'乙'},{number:2})),/冲突/);
 const {copy}=compile(e,form(e,'T_STATIC_PLACES',{visual_atmosphere:'∅'},{heading:'地点底档／客舍'}));assert.equal(copy.rows('T_STATIC_PLACES').place.states.visual_atmosphere,'none');assert.equal(copy.rows('T_STATIC_PLACES').place.values.name,'客舍');assert.equal(e.rows('T_STATIC_PLACES').place.values.visual_atmosphere,'原描述');
});
test('archive cannot use an authored cross-group record as an automatic identity grant',()=>{
 const e=fresh();acceptReply(e,reply('',form(e,'T_STATIC_PLACES',{name:'客舍',visual_atmosphere:'越过职责的写入'})),'bad',1,'main',{manualConfirmed:true});assert.equal(Object.keys(e.rows('T_STATIC_PLACES')).length,0);assert(e.data.runtime.warnings.some(w=>w.error?.code==='REPLY_FORM_OWNERSHIP'));
});


test('same visible scene name continues one row and review shows inherited values',()=>{
 const e=fresh();e.newRecord('T_DYN_SCENE_SPACE',{name:'春宴初遇',stage:'抵达',temporary_environment:'雨后'},'scene');
 const text=form(e,'T_DYN_SCENE_SPACE',{name:'春宴初遇',stage:'交谈',turn_elapsed:'3分钟'}),view=describeReviewForms(e.data,{cells:text});
 assert.equal(view.cells.groups[0].recordId,'scene');assert.equal(view.cells.groups[0].rows.find(r=>r.key==='stage').previous,'抵达');
 const {copy}=compile(e,text);assert.equal(Object.keys(copy.rows('T_DYN_SCENE_SPACE')).length,1);assert.equal(copy.rows('T_DYN_SCENE_SPACE').scene.values.stage,'交谈');assert.equal(copy.rows('T_DYN_SCENE_SPACE').scene.values.temporary_environment,'雨后');
});
test('ambiguous scenes still require explicit identity and old reply decoders retain original semantics',()=>{
 const e=fresh();for(const id of ['scene-a','scene-b'])e.newRecord('T_DYN_SCENE_SPACE',{name:'春宴初遇'},id);
 const text=form(e,'T_DYN_SCENE_SPACE',{name:'春宴初遇',stage:'交谈'});assert.throws(()=>compile(e,text),/重名/);
 const unique=fresh();unique.newRecord('T_DYN_SCENE_SPACE',{name:'春宴初遇'},'scene');
 const c={...context(unique),sceneNameReuse:false};assert.throws(()=>acceptMatrixSheets(c,{state:unique.data},{blocks:{cells:text}}),/已有同名记录/);
});

test('saved v3 scene decoder rejects the former collision while a newly reviewed v4 reply continues it',()=>{
 assert.equal(replyFormDecoding(PRE_SCENE_REUSE_REPLY_FORM_VERSION).sceneNameReuse,false);
 assert.equal(replyFormDecoding(PRE_SCENE_REUSE_REPLY_FORM_VERSION).plainTimeText,true);
 for(const version of [PRE_SCENE_REUSE_REPLY_FORM_VERSION,REPLY_FORM_OWNERSHIP_VERSION]){
  const e=fresh();e.newRecord('T_DYN_SCENE_SPACE',{name:'春宴初遇',stage:'抵达'},'scene');
  const text=reply(form(e,'T_DYN_SCENE_SPACE',{name:'春宴初遇',stage:'交谈'}));
  const result=acceptReply(e,text,'continued-scene',1,'main',{formOwnershipVersion:version,manualConfirmed:true});
  assert.equal(result.result.operations[0].status,version===REPLY_FORM_OWNERSHIP_VERSION?'COMMITTED':'FAILED');
  assert.equal(Object.keys(e.rows('T_DYN_SCENE_SPACE')).length,1);
  assert.equal(e.rows('T_DYN_SCENE_SPACE').scene.values.stage,version===REPLY_FORM_OWNERSHIP_VERSION?'交谈':'抵达');
 }
});
