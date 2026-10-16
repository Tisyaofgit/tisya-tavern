import test from 'node:test';
import assert from 'node:assert/strict';
import {auditNativeOutcome,bridgePatch,parseNativeTransaction} from '../tables/native-bridge.js';

const present=value=>({exists:true,value});
const absent={exists:false,value:null};
const replace=(path,value)=>({op:'replace',path,value});
function patchValue(before,value,path='/player',stat={player:before}){
 const row={id:'cell',table:'native_cells',rev:1,values:{路径:path,值:before}};
 const proposal={changes:[{id:'cell',table:'native_cells',expected:1,values:{值:value},evidence:'本轮依据'}]};
 return bridgePatch([row],proposal,{stat_data:stat},'本轮依据');
}
const paths=rows=>rows.map(row=>row.path);

test('native bridge leaves nested number/object and nullable unions to the native schema',()=>{
 const before={bag:{cup:1},next:null,optional:{count:2},flags:[true]},requested={bag:{cup:{count:2}},next:0,optional:3,flags:false};
 const original=structuredClone(before),wire=patchValue(before,requested);
 assert.deepEqual(wire.operations,[replace('/player/bag/cup',requested.bag.cup),replace('/player/next',0),replace('/player/optional',3),replace('/player/flags',false)]);
 assert.deepEqual(before,original);
 const outcome=auditNativeOutcome(wire.operations,{player:before},{player:requested});
 assert.deepEqual(paths(outcome.applied),['/player/bag/cup','/player/next','/player/optional','/player/flags']);
 assert.equal(outcome.adjusted.length,0);assert.equal(outcome.rejected.length,0);
 assert.deepEqual(outcome.applied[1].before,present(null));
 assert.deepEqual(outcome.applied[1].actual,present(0));
});

test('protected descendants cannot be removed by changing an ancestor type or deleting a normal branch',()=>{
 for(const before of [
  {_derived:1,value:2},
  {nested:{deeper:{$internal:{seed:7}},value:2}},
  {items:[{nested:{_locked:true}},3]},
 ]){
  for(const value of [null,0,'replacement',false,[],{}])assert.throws(()=>patchValue(before,value),/只读变量/);
 }
 const before={branch:{child:{$locked:1},value:2},ordinary:3};
 for(const value of [{ordinary:4},{branch:{value:4},ordinary:3},{branch:[],ordinary:3}])assert.throws(()=>patchValue(before,value),/只读变量/);
 const arrayBefore=[{value:1,_locked:2}];
 assert.throws(()=>patchValue(arrayBefore,[]),/只读变量/);
 assert.throws(()=>patchValue(arrayBefore,[{value:1,_locked:3}]),/只读变量/);
});

test('unchanged protected subtrees survive ordinary union updates and object key reordering',()=>{
 const before={_derived:{a:1,b:2},nested:{item:2,$source:{id:0}}};
 const requested={nested:{$source:{id:0},item:{count:3}},_derived:{b:2,a:1}};
 assert.deepEqual(patchValue(before,requested).operations,[replace('/player/nested/item',{count:3})]);
 assert.deepEqual(patchValue(before,{nested:before.nested,_derived:{b:2,a:1}}).operations,[]);
 for(const value of [
  {...requested,_created:0},
  {...requested,nested:{...requested.nested,item:{$new:1}}},
  {...requested,_derived:{a:1,b:3}},
 ])assert.throws(()=>patchValue(before,value),/只读变量|保留变量键/);
});

test('path syntax, prototype keys and direct readonly paths remain blocked after unlocking value types',()=>{
 for(const key of ['__proto__','prototype','constructor']){
  const value=JSON.parse('{"nested":{"'+key+'":1}}');
  assert.throws(()=>patchValue(1,value),/保留变量键|保留键/);
  assert.throws(()=>auditNativeOutcome([replace('/'+key,2)],{},{}),/保留键/);
 }
 for(const path of ['player','','/player~2bad'])assert.throws(()=>patchValue(1,2,path),/JSON Pointer/);
 for(const key of ['_locked','$derived']){
  const stat={player:{[key]:1}};
  assert.throws(()=>patchValue(1,2,'/player/'+key,stat),/只读变量/);
 }
});

test('silent native drop is rejected even when parse succeeds and callback changes unrelated fields',async()=>{
 const before={stat_data:{player:{ability:{vocal:10},_derived:0},clock:1}};
 const requested={ability:{vocal:11},_derived:0},wire=patchValue(before.stat_data.player,requested);
 const runtime={getMvuData(){},replaceMvuData(){throw Error('audit must not write');},async parseMessage(_,old){old.stat_data.player._derived=9;old.stat_data.clock=2;return old;}};
 const {after}=await parseNativeTransaction({runtime,index:0,before,block:wire.block,guard(){}});
 const parsed=structuredClone(after),outcome=auditNativeOutcome(wire.operations,before.stat_data,after.stat_data);
 assert.equal(outcome.applied.length,0);assert.equal(outcome.adjusted.length,0);
 assert.deepEqual(outcome.rejected,[{op:'replace',operationPath:'/player/ability/vocal',path:'/player/ability/vocal',before:present(10),requested:present(11),actual:present(10)}]);
 assert.deepEqual(after,parsed);assert.equal(before.stat_data.player._derived,0);
});

test('stripped new fields distinguish missing from null and cannot inherit unrelated callback success',()=>{
 const before={player:{known:3}},requested={known:3,newField:17,newNull:null};
 const after={player:{known:4,_callback:true},clock:8};
 const outcome=auditNativeOutcome([replace('/player',requested)],before,after);
 assert.equal(outcome.applied.length,0);assert.equal(outcome.adjusted.length,0);
 assert.deepEqual(paths(outcome.rejected),['/player/newField','/player/newNull']);
 assert.deepEqual(outcome.rejected[0].before,absent);assert.deepEqual(outcome.rejected[0].requested,present(17));assert.deepEqual(outcome.rejected[0].actual,absent);
 assert.deepEqual(outcome.rejected[1].requested,present(null));
});

test('one accepted leaf does not hide another dropped leaf in the same replace operation',()=>{
 const outcome=auditNativeOutcome([replace('/player',{a:2,b:2})],{player:{a:1,b:1}},{player:{a:2,b:1,$callback:3,newDefault:4}});
 assert.deepEqual(paths(outcome.applied),['/player/a']);assert.deepEqual(paths(outcome.rejected),['/player/b']);assert.deepEqual(outcome.adjusted,[]);
});

test('native clamps are recorded as adjusted without overwriting the native result',()=>{
 const before={player:{energy:10,nested:{score:1}}},requested={energy:100,nested:{score:8}},after={player:{energy:20,nested:{score:8},_computed:40}};
 const original=structuredClone({before,requested,after});
 const outcome=auditNativeOutcome([replace('/player',requested)],before,after);
 assert.deepEqual(paths(outcome.applied),['/player/nested/score']);assert.deepEqual(outcome.rejected,[]);
 assert.deepEqual(outcome.adjusted,[{op:'replace',operationPath:'/player',path:'/player/energy',before:present(10),requested:present(100),actual:present(20)}]);
 assert.deepEqual({before,requested,after},original);
});

test('deletion audits preserve existence and report retained or transformed values',()=>{
 const before={player:{remove:1,retained:2,transformed:3,empty:{},keep:false}},requested={keep:false};
 const after={player:{retained:2,transformed:null,keep:false}};
 const outcome=auditNativeOutcome([replace('/player',requested)],before,after);
 assert.deepEqual(paths(outcome.applied),['/player/remove','/player/empty']);
 assert.deepEqual(paths(outcome.rejected),['/player/retained']);
 assert.deepEqual(paths(outcome.adjusted),['/player/transformed']);
 assert.deepEqual(outcome.applied[0].requested,absent);assert.deepEqual(outcome.applied[0].actual,absent);
 assert.deepEqual(outcome.adjusted[0].requested,absent);assert.deepEqual(outcome.adjusted[0].actual,present(null));
});

test('arrays are audited atomically so insertions and removals do not create shifted-index successes',()=>{
 const before={player:{items:['a','b','c']}},requested={items:['b','c']};
 const applied=auditNativeOutcome([replace('/player',requested)],before,{player:requested});
 assert.deepEqual(paths(applied.applied),['/player/items']);assert.deepEqual(applied.applied[0].actual,present(['b','c']));
 const rejected=auditNativeOutcome([replace('/player',requested)],before,before);
 assert.deepEqual(paths(rejected.rejected),['/player/items']);
 const adjusted=auditNativeOutcome([replace('/player',requested)],before,{player:{items:['b']}});
 assert.deepEqual(paths(adjusted.adjusted),['/player/items']);
});

test('new and deleted object containers retain their own existence in audit records',()=>{
 const before={player:{gone:{nested:1}}},requested={added:{nested:2},empty:{}};
 const outcome=auditNativeOutcome([replace('/player',requested)],before,{player:{gone:{},added:{nested:2},empty:{}}});
 assert.deepEqual(paths(outcome.applied),['/player/added','/player/empty']);assert.deepEqual(paths(outcome.adjusted),['/player/gone']);
 assert.deepEqual(outcome.adjusted[0].requested,absent);assert.deepEqual(outcome.adjusted[0].actual,present({}));
 assert.deepEqual(outcome.applied[0].before,absent);
});

test('JSON Pointer escaping is retained for both branch mappings and nested outcome paths',()=>{
 const before={'a/b':{'~tag':{'':1}}},requested={'~tag':{'':2}},path='/a~1b';
 const wire=patchValue(before['a/b'],requested,path,before);
 const outcome=auditNativeOutcome(wire.operations,before,{'a/b':requested});
 assert.deepEqual(paths(outcome.applied),['/a~1b/~0tag/']);
 assert.equal(outcome.applied[0].operationPath,'/a~1b/~0tag/');assert.deepEqual(outcome.applied[0].actual,present(2));
});

test('audits use JSON value equality, preserve zero/false/empty values and return detached snapshots',()=>{
 const before={player:{value:0,flag:false,text:'',items:[{a:1,b:2}]}},requested={value:1,flag:false,text:'',items:[{a:2,b:3}]};
 const operations=[replace('/player',requested)],after={player:{items:[{b:3,a:2}],text:'',flag:false,value:1}};
 const outcome=auditNativeOutcome(operations,before,after);
 assert.deepEqual(paths(outcome.applied),['/player/value','/player/items']);assert.deepEqual(outcome.adjusted,[]);assert.deepEqual(outcome.rejected,[]);
 outcome.applied[1].requested.value[0].a=999;outcome.applied[1].actual.value[0].a=777;outcome.applied[1].before.value[0].a=555;
 assert.equal(requested.items[0].a,2);assert.equal(after.player.items[0].a,2);assert.equal(before.player.items[0].a,1);
 assert.deepEqual(auditNativeOutcome([replace('/player',before.player)],before,{player:{...before.player,$generated:1}}),{applied:[],adjusted:[],rejected:[]});
});
