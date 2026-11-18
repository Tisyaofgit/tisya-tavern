import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {describeReviewForms,editReviewDocument} from '../engine/review-form-document.mjs';
import {acceptReply} from '../engine/reply.mjs';
import {fixture} from './turn-review-host.test.js';
const context=e=>prepareMatrixSheets({state:e.data},{operationId:'unit-test',task:'main',mode:'revise'});
function section(c,id,values){const t=c.catalog.templates.find(t=>t.id===id);return '【'+t.label+'／1】\n'+Object.entries(values).map(([key,value])=>t.fields.find(f=>f.key===key).row+'：'+value).join('\n');}
function compile(e,text){const a=acceptMatrixSheets(context(e),{state:e.data},{blocks:{cells:text}});const copy=new Runtime(e.data);applyMatrixChanges(copy,a.proposal.matrix.changes);return {a,copy};}
test('compact coordinates keep canonical fields and per-field source; visual edits preserve original envelope',()=>{
 const e=new Runtime();e.registerTable('PEOPLE',[{key:'name',label:'姓名',type:'TEXT'},{key:'hp',label:'体力',type:'NUMBER'}],'人物');
 const raw='【人物／1】\r\n2：阿青 | P1\r\n3: 3 | P2',model=describeReviewForms(e.data,{cells:raw}).cells;
 assert.deepEqual(model.groups[0].rows.map(r=>r.label),['姓名','体力']);const edited=editReviewDocument(model,{[model.groups[0].rows[1].start]:'5'});assert.equal(edited,raw.replace('3: 3','3: 5'));
 const result=acceptReply(e,'<reply><body>1 抵达。\n\n2 休息。</body><cells format="form">'+edited+'</cells></reply>','compact');assert.equal(result.result.operations[0].status,'COMMITTED');const r=Object.values(e.rows('PEOPLE'))[0];assert.equal(r.values.hp,5);assert.equal(r.metadata.hp.source_pointer.paragraph_reference,'P2');
 assert.throws(()=>compile(e,'【人物／1】\n999：错位'),/未开放/);
});
test('archive evidence can be repaired in the visual editor without changing its value',()=>{
 const e=new Runtime(initializeState(catalog)),c=context(e),t=c.catalog.templates.find(t=>t.id==='T_DYN_EVENTS');
 const raw='【'+t.label+'／1】\n4 事件标题：渡口交信\n19 一行因果梗概：信已交给船夫',model=describeReviewForms(e.data,{archive:raw}).archive;
 const row=model.groups[0].rows.find(r=>r.key==='title');assert.equal(row.evidence,'');
 const edited=editReviewDocument(model,{['evidence:'+row.start]:'P1'});
 assert.match(edited,/4 事件标题：渡口交信 \| P1/);
 assert.match(edited,/19 一行因果梗概：信已交给船夫/);
});
test('missing calendar registers a named minute without inventing calendar rules or conversion',()=>{
 const e=new Runtime(initializeState(catalog)),text=section(context(e),'T_DYN_SCENE_SPACE',{name:'测试渡口',turn_elapsed:'3分钟'}),{copy}=compile(e,text),q=Object.values(copy.rows('M_QUANTITIES'))[0].values;
 assert.equal(q.quantity_mode,'exact');assert.equal(q.value,3);assert.equal(copy.rows('M_UNITS')[q.unit_ref].values.label,'分钟');assert.equal(copy.rows('M_UNITS')[q.unit_ref].values.calendar_ref,undefined);assert.equal(Object.keys(copy.rows('M_UNIT_RATIOS')).length,0);assert.equal(Object.keys(e.rows('T_DYN_SCENE_SPACE')).length,0);
});
test('bound calendar gets deterministic unit link; alias reuses it and unknown units still fail',()=>{
 const e=new Runtime(initializeState(catalog));e.newRecord('T_STATIC_WORLDS',{name:'测试世界',calendar_id:'calendar'},'world');e.newRecord('M_CALENDAR_RULES',{world_ref:'world',year_numbering:e.data.schema.M_CALENDAR_RULES.fields.find(f=>f.key==='year_numbering').enum[0],mode:'FIXED',value_state:'known'},'calendar');e.data.runtime.scope.world_ref='world';
 let {a,copy}=compile(e,section(context(e),'T_DYN_SCENE_SPACE',{name:'渡口',turn_elapsed:'数值：3；单位：分钟'}));const q=Object.values(copy.rows('M_QUANTITIES'))[0].values,u=copy.rows('M_UNITS')[q.unit_ref].values;assert.equal(q.value,3);assert.equal(u.calendar_ref,'calendar');assert.equal(u.time_component,'minute');assert.equal(Object.keys(copy.rows('M_UNIT_RATIOS')).length,0);
 const again=compile(e,section(context(e),'T_DYN_SCENE_SPACE',{name:'渡口',turn_elapsed:'3分钟'}));assert.equal(again.a.proposal.matrix.changes.find(r=>r.tableId==='M_UNITS').recordId,a.proposal.matrix.changes.find(r=>r.tableId==='M_UNITS').recordId);
 const alias=compile(copy,section(context(copy),'T_DYN_SCENE_SPACE',{name:'岸边',turn_elapsed:'2分'}));assert.equal(Object.keys(alias.copy.rows('M_UNITS')).length,1);assert.throws(()=>compile(e,section(context(e),'T_DYN_SCENE_SPACE',{name:'渡口',turn_elapsed:'数值：3；单位：不存在单位'})),/关联名称/);
});
test('visual preview is read-only and reroll compares against pre-turn values',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply()});await f.host.sync();let d=await f.draft(),before=await f.snapshot(),v=await f.host.describeTurnReview(d);assert.equal(v.cells.groups[0].rows[0].previous,10);assert.equal(v.cells.groups[0].rows[0].proposed,7);assert.deepEqual(await f.snapshot(),before);
 await f.host.confirmTurn(d);f.ctx.chat[0].mes=f.reply(5);await f.host.sync();d=await f.draft();v=await f.host.describeTurnReview(d);assert.equal(v.cells.groups[0].rows[0].previous,10);assert.equal(v.cells.groups[0].rows[0].proposed,5);assert.equal(await f.hp(),7);await assert.rejects(f.host.describeTurnReview({...d,sourceHash:'stale'}),/变化|更新|不匹配/);
});
test('named plans survive host reload and cannot select program fields',async()=>{
 const f=await fixture();const s=await f.host.listTurnReviews(),settings={custom:[],labels:{},policy:{ACTOR:{cells:['name','hp']}},plans:[{name:'人物',policy:{ACTOR:{cells:['name','hp']}}}]};await f.host.reviewAction({action:'settings',settings,contextKey:s.contextKey,expectedRevision:s.revision});assert.deepEqual((await f.host.listTurnReviews()).settings.plans,settings.plans);
 const next=await f.host.listTurnReviews(),machine=next.catalog.find(t=>t.program&&t.fields.length);await assert.rejects(f.host.reviewAction({action:'settings',settings:{...settings,plans:[{name:'不允许',policy:{[machine.id]:{cells:[machine.fields[0].key]}}}]},contextKey:next.contextKey,expectedRevision:next.revision}),/程序字段/);
});
