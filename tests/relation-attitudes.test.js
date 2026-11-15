import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {reconcile} from '../engine/journal.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {RELATION_AXES as A} from '../engine/relation-attitudes.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
function fixture(){
 const e=new Runtime(initializeState(catalog,{world_ref:'world-a',branch_ref:'main'}));
 e.data.runtime.calendar={mode:'MONTH_FIXED',year:1,month:1,day:1};
 e.newRecord('T_DYN_RELATIONS_PACTS',{name:'沈青对旅人',attitude_tag:'愿意靠近；仍有戒备'},'rel-private-id');
 for(const [id,family,value,delta]of [['trust','正向态度',60,4],['fear','负向态度',30,-2]])e.newRecord(A,{name:id==='trust'?'亲近':'戒备',relation_ref:'rel-private-id',axis_family:family,definition:id==='trust'?'愿意主动接近':'担心受到伤害',value,minimum:0,maximum:100,time_enabled:true,time_delta:delta,time_period_minutes:60},id);
 return e;
}
test('positive and negative attitudes coexist and evolve independently with story time',()=>{
 const e=fixture();const r=e.transaction('hour',{minutes:90},()=>e.tick(90));assert.equal(r.status,'COMMITTED');assert.equal(e.get([A,'trust','value',[]]),66);assert.equal(e.get([A,'fear','value',[]]),27);
 e.transaction('hour',{minutes:90},()=>e.tick(90));assert.equal(e.get([A,'trust','value',[]]),66);
 e.tick(10000);assert.equal(e.get([A,'trust','value',[]]),100);assert.equal(e.get([A,'fear','value',[]]),0);
});
test('unknown, disabled and foreign-world attitudes retain their original values',()=>{
 const e=fixture();e.set([A,'fear','value',[]],null,'unknown');e.set([A,'trust','time_enabled',[]],false);
 e.data.runtime.scope.world_ref='other';e.newRecord(A,{name:'异世界',value:7,minimum:0,maximum:100,time_enabled:true,time_delta:3,time_period_minutes:60},'other');e.data.runtime.scope.world_ref='world-a';e.tick(60);
 assert.equal(e.record(A,'fear').states.value,'unknown');assert.equal(e.get([A,'trust','value',[]]),60);assert.equal(e.get([A,'other','value',[]]),7);
});
test('invalid time rules roll the turn back, including the world clock',()=>{
 const e=fixture(),before=e.clock().ordinal();e.set([A,'fear','minimum',[]],110);const r=e.transaction('bad',{},()=>e.tick(60));
 assert.equal(r.status,'FAILED');assert.equal(e.clock().ordinal(),before);assert.equal(e.get([A,'trust','value',[]]),60);
});
test('reroll and floor rollback replay automatic time changes through the same journal',()=>{
 const e=fixture(),user={uid:'u',role:'user',text:'等待'},reply=n=>({uid:'a',role:'assistant',text:'<reply><body>1 等了一会儿。</body><cells>@TIME: tick(+'+n+'m)</cells><archive/></reply>'});
 let bundle=reconcile({state:e.data},[user,reply(60)]).bundle;assert.equal(bundle.state.tables[A].trust.values.value,64);
 bundle=reconcile(bundle,[user,reply(30)]).bundle;assert.equal(bundle.state.tables[A].trust.values.value,62);assert.equal(bundle.state.tables[A].fear.values.value,29);
 bundle=reconcile(bundle,[user]).bundle;assert.equal(bundle.state.tables[A].trust.values.value,60);
});
test('ordinary materials and forms use names, while machine fields are confined to registration',()=>{
 const e=fixture();e.set([A,'trust','axis_key',[]],'secret_machine_axis');e.set([A,'trust','native_ref',[]],'$.private.machine.path');
 const text=Object.values(materials(e,{world_ref:'world-a',branch_ref:'main',audience:'author'})).join('\n');
 assert.match(text,/亲近/);assert.match(text,/戒备/);assert.match(text,/沈青对旅人/);assert.match(text,/态度定义/);assert.match(text,/每周期变化量/);
 assert.doesNotMatch(text,/secret_machine_axis|private\.machine|rel-private-id|T_DYN_RELATION_AXES|row_uuid|维度键|原生引用/);
 const regular=prepareMatrixSheets({state:e.data},{operationId:'normal',tableIds:['register_parameter']});assert(!regular.formSections.some(s=>s.tableId==='register_parameter'));
 const registration=prepareMatrixSheets({state:e.data},{operationId:'register',task:'registration',tableIds:['register_parameter'],expandReferences:'children'});assert.match(registration.form,/绑定已有字段/);
});
