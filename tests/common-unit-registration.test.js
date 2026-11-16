import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {fixture} from './turn-review-host.test.js';
const fresh=()=>new Runtime(initializeState(catalog));
const context=(e,operationId='units')=>prepareMatrixSheets({state:e.data},{operationId,task:'main',mode:'revise'});
function form(e,id,values,n=1){const t=context(e).catalog.templates.find(t=>t.id===id);return '【'+t.label+'／'+n+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');}
function compile(e,text,operationId){const a=acceptMatrixSheets(context(e,operationId),{state:e.data},{blocks:{cells:text}}),copy=new Runtime(e.data);applyMatrixChanges(copy,a.proposal.matrix.changes);return {a,copy};}
const age=(e,unit='岁',n=1)=>form(e,'T_CHAR_DOSSIER',{name:'旅人'+n,age_raw:'数值：18；单位：'+unit},n);
const reply=cells=>'<reply><body>1 旅人十八岁，在门口等了两小时。</body><cells format="form">'+cells+'</cells><archive/></reply>';
test('common age, time, length and aliases register without a world; preview is read only',()=>{
 const e=fresh(),before=structuredClone(e.data),text=age(e)+'\n'+form(e,'T_DYN_SCENE_SPACE',{name:'等待',turn_elapsed:'2小时'})+'\n'+form(e,'M_UNITS',{label:'尺寸专用',dimension:'length'})+'\n'+form(e,'T_DYN_SCENE_PARTICIPANTS',{distance_to_target:'3米'});
 const {a,copy}=compile(e,text);assert.deepEqual(e.data,before);const units=Object.values(copy.rows('M_UNITS')).map(r=>r.values);for(const name of ['岁','小时','米']){const u=units.find(u=>u.label===name);assert(u);assert.equal(u.scope_world_id,'GLOBAL');assert.equal(u.calendar_ref,undefined);}
 assert.equal(Object.keys(copy.rows('M_UNIT_RATIOS')).length,0);assert.equal(Object.values(copy.rows('M_QUANTITIES'))[0].values.value,18);assert.equal(a.generatedIdentities.filter(c=>c.tableId==='M_UNITS').length,3);
 const next=compile(copy,form(copy,'T_DYN_SCENE_PARTICIPANTS',{distance_to_target:'4公尺'}),'later').copy;assert.equal(Object.values(next.rows('M_UNITS')).filter(r=>r.values.dimension==='length').length,2);
});
test('short quantities support common and explicitly defined custom units in either order',()=>{
 const e=fresh(),cells=form(e,'T_CHAR_DOSSIER',{name:'旅人',age_raw:'18岁'})+'\n'+form(e,'T_DYN_SCENE_SPACE',{name:'等待',turn_elapsed:'3灵息'})+'\n'+form(e,'M_UNITS',{label:'灵息',dimension:'custom',custom_dimension:'灵力计量',narrative:'以一次灵力吐纳计量'});
 const {copy}=compile(e,cells),q=Object.values(copy.rows('M_QUANTITIES')).map(r=>r.values);assert.equal(q[0].value,18);assert.equal(copy.rows('M_UNITS')[q[1].unit_ref].values.label,'灵息');assert.equal(copy.rows('M_UNITS')[q[1].unit_ref].values.scope_world_id,'GLOBAL');assert.equal(Object.keys(copy.rows('M_UNIT_RATIOS')).length,0);
});
test('explicit definitions take priority; unknown bare names give actionable registration error',()=>{
 const e=fresh(),text=age(e,'米')+'\n'+form(e,'M_UNITS',{label:'米',dimension:'custom',custom_dimension:'此世界的筹码'}),{copy}=compile(e,text);assert.equal(Object.values(copy.rows('M_UNITS'))[0].values.dimension,'custom');assert.throws(()=>compile(e,age(e,'灵息')),/自定义单位.*单位定义/);assert.equal(Object.keys(e.rows('M_UNITS')).length,0);
});
test('global marker is allowed only on declared global references; ambiguous units stay rejected',()=>{
 const e=fresh();compile(e,form(e,'M_UNITS',{label:'筹码',dimension:'count',scope_world_id:'GLOBAL'}));assert.throws(()=>compile(e,form(e,'M_UNITS',{label:'月',dimension:'time',calendar_ref:'GLOBAL'})),/引用|关联|GLOBAL/);
 for(const id of ['u1','u2'])e.newRecord('M_UNITS',{label:'岁',dimension:'time',scope_world_id:'GLOBAL'},id);assert.throws(()=>compile(e,age(e)),/重名/);
});
test('same scoped aliases reuse definitions and another world does not consume hidden units',()=>{
 const e=fresh();for(const id of ['w1','w2'])e.newRecord('T_STATIC_WORLDS',{name:id},id);e.data.runtime.scope.world_ref='w1';const one=compile(e,age(e,'m')).copy;one.data.runtime.scope.world_ref='w2';const two=compile(one,age(one,'公尺'),'w2').copy;assert.deepEqual(new Set(Object.values(two.rows('M_UNITS')).map(r=>r.values.scope_world_id)),new Set(['w1','w2']));
});
test('main model materials expose unit registration fields and no synthetic units are seeded on read',()=>{
 const e=fresh(),before=structuredClone(e.data),c=context(e);assert.match(c.form,/自定义单位/);assert(c.formSections.some(s=>s.tableId==='M_UNITS'));const text=JSON.stringify(materials(e));assert.match(text,/单位定义／序号/);assert.equal(Object.keys(e.rows('M_UNITS')).length,0);assert.deepEqual(e.data.tables.M_UNITS,before.tables.M_UNITS);
});
test('production review saves generated and model-defined units atomically; reload and reroll retain one definition',async()=>{
 const f=await fixture(),e=new Runtime((await f.snapshot()).state),cells=age(e)+'\n'+form(e,'T_DYN_SCENE_SPACE',{name:'等待',turn_elapsed:'2小时'});f.ctx.chat.push({mes:reply(cells)});await f.host.sync();assert.equal(Object.keys((await f.snapshot()).state.tables.M_UNITS).length,0);await f.host.confirmTurn(await f.draft());let state=(await f.snapshot()).state;assert.equal(Object.keys(state.tables.M_UNITS).length,2);assert.equal(Object.values(state.tables.M_UNITS)[0].metadata.label.source_pointer.paragraph_reference,'P1');
 await f.host.sync();assert.equal(Object.keys((await f.snapshot()).state.tables.M_UNITS).length,2);f.ctx.chat[0].mes=reply(age(e,'灵息')+'\n'+form(e,'M_UNITS',{label:'灵息',dimension:'custom',custom_dimension:'生命计数'}));await f.host.sync();await f.host.confirmTurn(await f.draft());state=(await f.snapshot()).state;assert.deepEqual(Object.values(state.tables.M_UNITS).map(r=>r.values.label),['灵息']);
});
test('an explicit world unit overrides its global namesake without changing either definition',()=>{
 const e=fresh();e.newRecord('T_STATIC_WORLDS',{name:'雾城'},'w');e.data.runtime.scope.world_ref='w';e.newRecord('M_UNITS',{label:'岁',dimension:'time',scope_world_id:'GLOBAL'},'global');e.newRecord('M_UNITS',{label:'岁',dimension:'time',scope_world_id:'w',narrative:'按雾城历法记龄'},'local');const {copy}=compile(e,age(e));assert.equal(Object.values(copy.rows('M_QUANTITIES'))[0].values.unit_ref,'local');assert.equal(Object.keys(copy.rows('M_UNITS')).length,2);
});
test('same-batch alias honors an explicitly named world definition, even when it follows the quantity',()=>{
 const e=fresh();e.newRecord('T_STATIC_WORLDS',{name:'雾城'},'w');e.data.runtime.scope.world_ref='w';const {copy}=compile(e,form(e,'T_DYN_SCENE_PARTICIPANTS',{distance_to_target:'3m'})+'\n'+form(e,'M_UNITS',{scope_world_id:'雾城',label:'米',dimension:'length',narrative:'本世界米制'}));assert.equal(Object.keys(copy.rows('M_UNITS')).length,1);assert.equal(Object.values(copy.rows('M_UNITS'))[0].values.narrative,'本世界米制');
});
test('incomplete model registration rejects atomically, original draft can then be corrected',async()=>{
 const f=await fixture(),e=new Runtime((await f.snapshot()).state),bad=age(e,'灵息')+'\n'+form(e,'M_UNITS',{label:'灵息'});f.ctx.chat.push({mes:reply(bad)});await f.host.sync();await assert.rejects(f.host.confirmTurn(await f.draft()),/必填/);assert.equal(Object.keys((await f.snapshot()).state.tables.M_UNITS).length,0);f.ctx.chat[0].mes=reply(age(e,'灵息')+'\n'+form(e,'M_UNITS',{label:'灵息',dimension:'time'}));await f.host.sync();await f.host.confirmTurn(await f.draft());assert.equal(Object.keys((await f.snapshot()).state.tables.M_UNITS).length,1);
});
test('accepted v1 minutes retain their original decoder after an earlier message changes; edited candidate uses v2',async()=>{
 const {acceptReply}=await import('../engine/reply.mjs'),{reconcile,inversePatch}=await import('../engine/journal.mjs'),{digest}=await import('../engine/common.mjs'),{PRE_UNIT_REPLY_FORM_VERSION,REPLY_FORM_OWNERSHIP_VERSION}=await import('../engine/reply-form-ownership.mjs');
 const e=fresh(),before=structuredClone(e.data),text=reply(form(e,'T_DYN_SCENE_SPACE',{name:'旧等待',turn_elapsed:'3分钟'}));acceptReply(e,text,'a',1,'main',{formOwnershipVersion:PRE_UNIT_REPLY_FORM_VERSION});assert.equal(Object.keys(e.rows('M_UNITS')).length,0);assert.equal(Object.values(e.rows('M_QUANTITIES'))[0].values.quantity_mode,'narrative_only');
 const messages=[{uid:'u',role:'user',text:'原输入'},{uid:'a',role:'assistant',text}],entries=messages.map(m=>({uid:m.uid,role:m.role,signature:digest(m),revision:1,warnings:[],pre_turn_snapshot:{format:'tisya.inverse-patch.v1',inverse_patch:m.role==='assistant'?inversePatch(before,e.data):[]},...(m.role==='assistant'?{reply_form_ownership_version:PRE_UNIT_REPLY_FORM_VERSION}:{})}));
 const bundle={state:e.data,journal:{entries,revision_by_uid:{u:1,a:1}}};messages[0].text='修订早先的输入';let r=reconcile(bundle,messages);assert.equal(Object.keys(r.bundle.state.tables.M_UNITS).length,0);assert.equal(Object.values(r.bundle.state.tables.M_QUANTITIES)[0].values.narrative,'3分钟');assert.equal(r.bundle.state.runtime.sources['main/a@2'].reply_form_ownership_version,PRE_UNIT_REPLY_FORM_VERSION);
 messages[1].text=text.replace('3分钟','4分钟');r=reconcile(r.bundle,messages);assert.equal(Object.values(r.bundle.state.tables.M_QUANTITIES)[0].values.quantity_mode,'exact');assert.equal(Object.values(r.bundle.state.tables.M_QUANTITIES)[0].values.value,4);assert.equal(Object.keys(r.bundle.state.tables.M_UNITS).length,1);assert.equal(r.bundle.state.runtime.sources['main/a@3'].reply_form_ownership_version,REPLY_FORM_OWNERSHIP_VERSION);
});
test('every common-unit alias registers through canonical quantity forms without duplicate definitions or conversions',async()=>{
 const {COMMON_UNITS}=await import('../tables/foundation/common-units.js'),e=fresh();e.registerTable('UNIT_MEASURE',[{key:'name',label:'样本名称',type:'TEXT'},{key:'amount',label:'数量',type:'CHILD_REF',ref:'M_QUANTITIES'}],'单位样本');
 const c=context(e),t=c.catalog.templates.find(t=>t.id==='UNIT_MEASURE'),samples=COMMON_UNITS.flatMap(u=>u.aliases.map(alias=>({unit:u,alias}))),nameRow=t.fields.find(f=>f.key==='name').row,amountRow=t.fields.find(f=>f.key==='amount').row;
 const cells=samples.map(({alias},i)=>'【单位样本／'+(i+1)+'】\n'+nameRow+'：样本'+i+'\n'+amountRow+'：数值：'+(i+1)+'；单位：'+alias).join('\n'),before=structuredClone(e.data),accepted=acceptMatrixSheets(c,{state:e.data},{blocks:{cells}}),copy=new Runtime(e.data);applyMatrixChanges(copy,accepted.proposal.matrix.changes);assert.deepEqual(e.data,before);
 assert.equal(Object.keys(copy.rows('M_UNITS')).length,COMMON_UNITS.length);assert.equal(Object.keys(copy.rows('M_UNIT_RATIOS')).length,0);
 for(const row of Object.values(copy.rows('UNIT_MEASURE'))){const i=Number(row.values.name.slice(2)),q=copy.rows('M_QUANTITIES')[row.values.amount].values,u=copy.rows('M_UNITS')[q.unit_ref].values;assert.equal(q.value,i+1);assert.equal(u.label,samples[i].unit.label,samples[i].alias);assert.equal(u.dimension,samples[i].unit.dimension);assert.equal(u.calendar_ref,undefined);assert.equal(u.time_component,undefined);}
});
test('centimeter, minute, month, season and quarter shorthand save distinct exact quantities without fixed durations',()=>{
 const e=fresh(),cases=[['3厘米','厘米'],['4cm','厘米'],['5分钟','分钟'],['6min','分钟'],['7个月','月'],['8月','月'],['9季','季'],['10季度','季度']];e.registerTable('UNIT_MEASURE',[{key:'amount',label:'数量',type:'CHILD_REF',ref:'M_QUANTITIES'}],'单位样本');const c=context(e),t=c.catalog.templates.find(t=>t.id==='UNIT_MEASURE'),cells=cases.map(([value],i)=>'【单位样本／'+(i+1)+'】\n'+t.fields[0].row+'：'+value).join('\n');const {copy}=compile(e,cells);assert.equal(Object.keys(copy.rows('M_UNITS')).length,5);assert.equal(Object.keys(copy.rows('M_UNIT_RATIOS')).length,0);Object.values(copy.rows('M_QUANTITIES')).forEach((r,i)=>{assert.equal(r.values.value,i+3);assert.equal(copy.rows('M_UNITS')[r.values.unit_ref].values.label,cases[i][1]);});
});
test('calendar seasons, unqualified quarters and age-counting labels are not silently equated',async()=>{
 const {commonUnit}=await import('../tables/foundation/common-units.js');assert.equal(commonUnit('季').component,'season');assert.equal(commonUnit('季度').component,undefined);assert.notEqual(commonUnit('周岁').label,commonUnit('虚岁').label);assert.notEqual(commonUnit('元').label,commonUnit('CNY').label);assert.notEqual(commonUnit('oz').dimension,commonUnit('fl oz').dimension);assert.equal(commonUnit('$'),undefined);assert.equal(commonUnit('¥'),undefined);
 const e=fresh();e.newRecord('T_STATIC_WORLDS',{name:'历法世界',calendar_id:'cal'},'w');e.newRecord('M_CALENDAR_RULES',{world_ref:'w',year_numbering:e.data.schema.M_CALENDAR_RULES.fields.find(f=>f.key==='year_numbering').enum[0],mode:'FIXED',value_state:'known'},'cal');e.data.runtime.scope.world_ref='w';const {copy}=compile(e,form(e,'T_DYN_SCENE_SPACE',{name:'一季',turn_elapsed:'1季'})+'\n'+form(e,'T_DYN_SCENE_SPACE',{name:'一季度',turn_elapsed:'1季度'},2));const units=Object.values(copy.rows('M_UNITS')).map(r=>r.values);assert.equal(units.find(u=>u.label==='季').calendar_ref,'cal');assert.equal(units.find(u=>u.label==='季度').calendar_ref,undefined);assert.equal(Object.keys(copy.rows('M_UNIT_RATIOS')).length,0);
});
