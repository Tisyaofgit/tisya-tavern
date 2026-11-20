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
test('the visual editor exposes both sides of an adjacent group heading and preserves the raw envelope',()=>{
 const e=new Runtime();e.registerTable('PEOPLE',[{key:'name',label:'姓名',type:'TEXT'},{key:'hp',label:'体力',type:'NUMBER'}],'人物');
 const raw='【人物／1】\n2{阿青}【人物／2】\n2{阿绿}\n3{6}',model=describeReviewForms(e.data,{cells:raw}).cells;
 assert.equal(model.groups.length,2);assert.equal(model.groups[0].rows[0].value,'阿青');assert.equal(model.groups[1].rows[1].value,'6');
 const row=model.groups[1].rows[1],edited=editReviewDocument(model,{[row.start]:'7'});assert.equal(edited,raw.replace('3{6}','3{7}'));
 const {copy}=compile(e,edited);assert.equal(Object.keys(copy.rows('PEOPLE')).length,2);
});

test('a pending floor with bare numbered values can be edited and confirmed without regenerating its reply',async()=>{
 const f=await fixture();
 const cells=[
  '【当前场景与时钟／1】','3 示例春宴','15 5分钟 | P1','20 旅人走到台阶边',
  '【在场站位与视听／3】','3 示例春宴','4 旅人','6 台阶边缘 | P2','8 2步 | P2','9 船夫',
  '【实时状态值／1】','3 旅人临时状态','4 旅人','5 袖口沾水 | P1','7 扶着栏杆 | P2'
 ].join('\n');
 const raw='<reply><body>1 旅人等了五分钟。\n\n2 旅人走到台阶边，距船夫两步。</body><cells format="form">'+cells+'</cells><archive/></reply>';
 f.ctx.chat.push({mes:raw});
 await f.host.sync();
 const draft=await f.draft(),model=(await f.host.describeTurnReview(draft)).cells;
 assert.deepEqual(model.groups.map(group=>group.rows.map(row=>row.key)),[
  ['name','turn_elapsed','stage'],
  ['scene_ref','entity_ref','position','distance_to_target','target_ref'],
  ['name','entity_id','live_appearance','posture']
 ]);
 const row=model.groups[1].rows[2];
 assert.equal(row.value,'台阶边缘');
 assert.equal(row.evidence,'P2');
 const edited=editReviewDocument(model,{[row.start]:'台阶内侧'});
 assert.equal(edited,cells.replace('6 台阶边缘 | P2','6 台阶内侧 | P2'));
 await f.host.confirmTurn({...draft,cells:edited});
 const {state}=await f.snapshot();
 const [scene]=Object.values(state.tables.T_DYN_SCENE_SPACE);
 const [presence]=Object.values(state.tables.T_DYN_SCENE_PARTICIPANTS);
 const [status]=Object.values(state.tables.T_DYN_ENTITY_STATE);
 assert.equal(state.tables.M_QUANTITIES[scene.values.turn_elapsed].values.value,5);
 assert.equal(presence.values.position,'台阶内侧');
 assert.equal(presence.metadata.position.source_pointer.paragraph_reference,'P2');
 assert.equal(status.values.posture,'扶着栏杆');
 assert.equal((await f.host.listTurnReviews()).reviews[0].status,'confirmed');
 assert.equal(f.ctx.chat[0].mes,raw);
});
test('archive evidence can be repaired in the visual editor without changing its value',()=>{
 const e=new Runtime(initializeState(catalog)),c=context(e),t=c.catalog.templates.find(t=>t.id==='T_DYN_EVENTS');
 const raw='【'+t.label+'／1】\n4 事件标题：渡口交信\n19 一行因果梗概：信已交给船夫',model=describeReviewForms(e.data,{archive:raw}).archive;
 const row=model.groups[0].rows.find(r=>r.key==='title');assert.equal(row.evidence,'');
 const edited=editReviewDocument(model,{['evidence:'+row.start]:'P1'});
 assert.match(edited,/4 事件标题：渡口交信 \| P1/);
 assert.match(edited,/19 一行因果梗概：信已交给船夫/);
});
test('the reported age spelling decodes as one exact quantity and the visible hint demonstrates valid syntax',()=>{
 const e=new Runtime(initializeState(catalog)),c=context(e),t=c.catalog.templates.find(t=>t.id==='T_CHAR_DOSSIER');
 const raw='【'+t.label+'／1】\n3{加茂述}\n4{加茂述}\n5{L1}\n13{数值：7 岁} | P5',{copy}=compile(e,raw),dossier=Object.values(copy.rows('T_CHAR_DOSSIER'))[0],quantity=copy.rows('M_QUANTITIES')[dossier.values.age_raw].values;
 assert.equal(quantity.quantity_mode,'exact');assert.equal(quantity.value,7);assert.equal(copy.rows('M_UNITS')[quantity.unit_ref].values.label,'岁');
 const hint=c.formSections.find(s=>s.tableId==='T_CHAR_DOSSIER').text.split('\n').find(line=>line.startsWith('13{'));
 assert.match(hint,/7岁/);assert.match(hint,/数值：7；单位：岁/);assert.doesNotMatch(hint,/年龄数值：N 单位/);
});

test('approximate age and period annotations preserve the complete narrative quantity',()=>{
 const e=new Runtime(initializeState(catalog)),c=context(e),t=c.catalog.templates.find(t=>t.id==='T_CHAR_DOSSIER');
 const value='50余岁（雪宴时期）',raw='【'+t.label+'／1】\n3{加茂述}\n4{加茂述}\n5{L1}\n13{'+value+'} | P5',{copy}=compile(e,raw),dossier=Object.values(copy.rows('T_CHAR_DOSSIER'))[0],quantity=copy.rows('M_QUANTITIES')[dossier.values.age_raw].values;
 assert.equal(quantity.quantity_mode,'narrative_only');assert.equal(quantity.narrative,value);assert.equal(quantity.value,undefined);assert.equal(quantity.unit_ref,undefined);
 const exact=compile(new Runtime(initializeState(catalog)),raw.replace(value,'50岁')).copy,exactQuantity=Object.values(exact.rows('M_QUANTITIES'))[0].values;
 assert.equal(exactQuantity.quantity_mode,'exact');assert.equal(exactQuantity.value,50);
 const hint=c.formSections.find(s=>s.tableId==='T_CHAR_DOSSIER').text.split('\n').find(line=>line.startsWith('13{'));
 assert.match(hint,/50余岁（雪宴时期）/);assert.throws(()=>compile(new Runtime(initializeState(catalog)),raw.replace(value,'很多')),/填写|请填/);
 const annotated=compile(new Runtime(initializeState(catalog)),raw.replace(value,'50岁（雪宴时期）')).copy,annotatedQuantity=Object.values(annotated.rows('M_QUANTITIES'))[0].values;
 assert.equal(annotatedQuantity.quantity_mode,'narrative_only');assert.equal(annotatedQuantity.narrative,'50岁（雪宴时期）');
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
