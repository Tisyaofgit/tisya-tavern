import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBackfill,fillBackfillFloor,confirmBackfillFloor} from '../engine/history-backfill.mjs';
import {Model as M} from '../preview/turn-review/model.mjs';
const catalog=[{id:'T',label:'测试表',fields:[{key:'score',label:'好感度',type:'NUMBER',min:-100,max:100},{key:'name',label:'姓名',type:'TEXT'},{key:'source',label:'来源',type:'TEXT',readonly:true}]}],world={custom:[],labels:{}},policy={T:{cells:['score'],archive:['name']}},scope='s';
const messages=[{id:'u1',floor:1,role:'user',scope,text:'旧用户',revision:1},{id:'a1',floor:2,role:'assistant',scope,text:'<reply><body>1 沈青来到渡口。</body></reply>',revision:1},{id:'a2',floor:4,role:'assistant',scope,text:'<reply><body>1 沈青留下信。</body></reply>',revision:1}];
const make=(extra={})=>prepareBackfill({messages,scope,catalog,world,policy,...extra});
const values=[{channel:'cells',table:'T',key:'score',state:'unknown',value:null,response:'本层仍未知'},{channel:'archive',table:'T',key:'name',recordId:'shen',recordName:'沈青',state:'known',value:'沈青',evidence:'沈青',response:'原文有据'}];
const commit=(batch,extra={})=>confirmBackfillFloor({batch,id:'a1',messages,receipts:[],catalog,world,validateValue:M.parse,...extra});
test('all eligible floors are planned in order and partial field coverage skips only matching fields',()=>{const p=make();assert.deepEqual(p.floors.map(x=>x.floor),[2,4]);let b=fillBackfillFloor(p,'a1',values);b.floors[0].reviewed=true;const saved=commit(b);assert.equal(saved.currentStateWrites,0);const next=make({receipts:saved.receipts});assert.equal(next.floors[0].status,'skipped');assert.equal(next.floors[1].status,'pending');const added=make({receipts:saved.receipts,policy:{T:{cells:['score','name'],archive:['name']}}});assert.deepEqual(added.floors[0].selection.map(x=>x.key),['name']);});
test('generating/editing never commits and explicit review is required',()=>{const p=make(),b=fillBackfillFloor(p,'a1',values);assert.equal(p.floors[0].values.length,0);assert.equal(b.floors[0].status,'ready');assert.throws(()=>commit(b),/核对/);b.floors[0].reviewed=true;const r=commit(b);assert.equal(r.receipts.length,2);assert.equal(b.floors[0].status,'ready');assert.equal(r.batch.floors[0].status,'confirmed');assert.throws(()=>commit(r.batch),/核对/);});
test('known values require source evidence and all selected fields must have an answer',()=>{const p=make();assert.throws(()=>fillBackfillFloor(p,'a1',values.slice(0,1)),/覆盖/);const b=fillBackfillFloor(p,'a1',values);b.floors[0].reviewed=true;b.floors[0].values[1].evidence='凭空出现的人';assert.throws(()=>commit(b),/依据/);b.floors[0].values[1].evidence='沈青';b.floors[0].values[0].response='';assert.throws(()=>commit(b),/回应/);});
test('readonly, source edits, history deletion and stale revisions reject rather than duplicate',()=>{assert.throws(()=>make({policy:{T:{cells:['source'],archive:[]}}}),/系统字段/);const b=fillBackfillFloor(make(),'a1',values);b.floors[0].reviewed=true;assert.throws(()=>commit(b,{messages:messages.map(m=>m.id==='a2'?{...m,text:'重骰'}:m)}),/变化/);assert.throws(()=>commit(b,{messages:messages.slice(1)}),/变化/);const r=commit(b);assert.throws(()=>commit(b,{receipts:r.receipts}),/重复/);assert.throws(()=>make({receipts:r.receipts,messages:messages.map(m=>m.id==='a1'?{...m,revision:2}:m)}),/来源发生变化/);});
test('unknown is not zero and range validation precedes all writes',()=>{const b=fillBackfillFloor(make(),'a1',values);b.floors[0].reviewed=true;assert.equal(commit(b).receipts[0].value,null);Object.assign(b.floors[0].values[0],{state:'known',recordId:'shen',recordName:'沈青',value:101,evidence:'沈青'});assert.throws(()=>commit(b),/范围/);b.floors[0].values[0].value=0;assert.equal(commit(b).receipts[0].value,0);});
test('one selected field can contain multiple distinct records without losing coverage',()=>{const p=make();const b=fillBackfillFloor(p,'a1',[...values,{...values[1],recordId:'other',recordName:'另一条待核记录'}]);b.floors[0].reviewed=true;const r=commit(b);assert.equal(r.receipts.length,3);assert.equal(make({receipts:r.receipts}).floors[0].status,'skipped');});
test('bad body is blocked and all raw source bytes remain available',()=>{const p=make({messages:[{...messages[1],text:'旧回复无body <extra>不是正文</extra>'}]});assert.equal(p.floors[0].status,'blocked');assert.equal(p.floors[0].source.text,'旧回复无body <extra>不是正文</extra>');});
test('edited source copies cannot authenticate fabricated evidence and permission changes invalidate review',()=>{
 const b=fillBackfillFloor(make(),'a1',values);b.floors[0].reviewed=true;
 b.floors[0].body+='凭空出现的人';b.floors[0].values[1].evidence='凭空出现的人';
 assert.throws(()=>commit(b),/来源副本/);
 const clean=fillBackfillFloor(make(),'a1',values);clean.floors[0].reviewed=true;
 assert.throws(()=>commit(clean,{catalog:[{...catalog[0],program:true}]}),/系统字段/);
});
test('an old candidate cannot bypass completed field coverage by changing its record identity',()=>{
 const b=fillBackfillFloor(make(),'a1',values);b.floors[0].reviewed=true;
 const saved=commit(b);const old=structuredClone(b);for(const v of old.floors[0].values)v.recordId='different';
 assert.throws(()=>commit(old,{receipts:saved.receipts}),/重复/);
});
