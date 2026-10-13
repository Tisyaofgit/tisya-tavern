import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgePatch,bridgeInput,parseNativeTransaction,auditNativeOutcome} from '../tables/native-bridge.js';

const replace=(path,value)=>({op:'replace',path,value});
function fixture(before,after,{path='/player',writePaths}={}){
 const stat={};const parts=path.slice(1).split('/').map(key=>key.replaceAll('~1','/').replaceAll('~0','~'));let parent=stat;
 for(const key of parts.slice(0,-1))parent=parent[key]={};parent[parts.at(-1)]=structuredClone(before);
 const row={id:'cell',table:'native_cells',rev:1,values:{路径:path,值:structuredClone(before)}};
 const change={id:'cell',table:'native_cells',expected:1,values:{值:structuredClone(after)},evidence:'source'};
 if(writePaths!==undefined)change.writePaths=writePaths;
 return {rows:[row],proposal:{changes:[change]},before:{stat_data:stat}};
}
const build=f=>bridgePatch(f.rows,f.proposal,f.before,'source');
function apply(stat,operations){
 const next=structuredClone(stat);
 for(const operation of operations){
  assert.equal(operation.op,'replace');const parts=operation.path.slice(1).split('/').map(key=>key.replaceAll('~1','/').replaceAll('~0','~'));let parent=next;
  for(const key of parts.slice(0,-1)){assert.ok(Object.hasOwn(parent,key));parent=parent[key];}
  assert.ok(Object.hasOwn(parent,parts.at(-1)),'replace must target an existing path');parent[parts.at(-1)]=structuredClone(operation.value);
 }
 return next;
}

test('same-key object changes emit absolute leaf writes with unchanged sibling values preserved',()=>{
 const before={energy:10,stats:{score:1,level:2},label:'unchanged'},after={energy:0,stats:{score:3,level:2},label:'unchanged'},f=fixture(before,after);
 const wire=build(f);assert.deepEqual(wire.operations,[replace('/player/energy',0),replace('/player/stats/score',3)]);
 assert.deepEqual(apply(f.before.stat_data,wire.operations),{player:after});
 assert.deepEqual(apply(apply(f.before.stat_data,wire.operations),wire.operations),{player:after});
 assert.deepEqual(JSON.parse(wire.block.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/)[1]),wire.operations);
});

test('member creation and deletion replace the minimum existing parent and retain its other members',()=>{
 for(const [before,after] of [
  [{bag:{kept:{count:2}},energy:8},{bag:{kept:{count:2},added:{count:1}},energy:8}],
  [{bag:{kept:{count:2},removed:{count:1}},energy:8},{bag:{kept:{count:2}},energy:8}],
 ]){
  const f=fixture(before,after),wire=build(f);assert.deepEqual(wire.operations,[replace('/player/bag',after.bag)]);
  assert.deepEqual(apply(f.before.stat_data,wire.operations),{player:after});
 }
});

test('arrays, nullable unions and type switches stay atomic at their own field',()=>{
 const f=fixture({items:['a','b','c'],nullable:null,item:1},{items:['b','c'],nullable:0,item:{count:2}}),wire=build(f);
 assert.deepEqual(wire.operations,[replace('/player/items',['b','c']),replace('/player/nullable',0),replace('/player/item',{count:2})]);
 assert.deepEqual(apply(f.before.stat_data,wire.operations),{player:{items:['b','c'],nullable:0,item:{count:2}}});
 assert.throws(()=>build(fixture({items:['a','b']},{items:['b']},{writePaths:['/player/items/0']})),/边界|原子/);
});

test('explicit parent boundaries may group covered leaves without expanding the returned API',()=>{
 const f=fixture({stats:{a:1,b:2},flag:false},{stats:{a:3,b:4},flag:true},{writePaths:['/player/stats','/player/flag']}),wire=build(f);
 assert.deepEqual(Object.keys(wire).sort(),['block','operations']);
 assert.deepEqual(wire.operations,[replace('/player/stats',{a:3,b:4}),replace('/player/flag',true)]);
});

test('explicit paths for new and deleted members use their minimum atomic parent without data loss',()=>{
 const before={category:{keep:{count:2},removed:{count:1}},other:{keep:5}},after={category:{keep:{count:2},added:{count:3}},other:{keep:5}};
 const f=fixture(before,after,{path:'/shop',writePaths:['/shop/category/removed','/shop/category/added']}),wire=build(f);
 assert.deepEqual(wire.operations,[replace('/shop/category',after.category)]);
 assert.deepEqual(apply(f.before.stat_data,wire.operations),{shop:after});
 const outcome=auditNativeOutcome(wire.operations,f.before.stat_data,{shop:after});
 assert.deepEqual(outcome.applied.map(item=>item.path),['/shop/category/removed','/shop/category/added']);assert.equal(outcome.rejected.length,0);
});

test('a new category selects its existing parent; nonexistent intermediate selectors are rejected',()=>{
 const before={existing:{keep:2}},after={existing:{keep:2},added:{item:{count:1}}};
 const f=fixture(before,after,{path:'/shop',writePaths:['/shop/added']}),wire=build(f);
 assert.deepEqual(wire.operations,[replace('/shop',after)]);assert.deepEqual(apply(f.before.stat_data,wire.operations),{shop:after});
 assert.throws(()=>build(fixture(before,after,{path:'/shop',writePaths:['/shop/added/item']})),/父容器|中间|边界/);
});

test('writePaths must cover every requested difference before any structural parent promotion',()=>{
 assert.throws(()=>build(fixture({a:1,b:2},{a:3,b:4},{writePaths:['/player/a']})),/完整覆盖/);
 assert.throws(()=>build(fixture({a:1},{a:2},{writePaths:[]})),/完整覆盖/);
 const before={category:{keep:{count:2}}},after={category:{keep:{count:3},added:{count:1}}};
 assert.throws(()=>build(fixture(before,after,{path:'/shop',writePaths:['/shop/category/added']})),/完整覆盖/);
 assert.deepEqual(build(fixture({a:1},{a:1},{writePaths:[]})).operations,[]);
});

test('writePaths reject missing, out-of-branch, overlapping, malformed and excessive boundaries',()=>{
 const before={a:1,b:2},after={a:3,b:4};
 for(const writePaths of [null,{},['/player/missing'],['/other'],['/player2/a'],['/player','/player/a'],['/player/a','/player/a'],['/player/~2bad'],Array.from({length:201},(_,i)=>'/player/a'+i)]){
  assert.throws(()=>build(fixture(before,after,{writePaths})),/边界|路径|JSON Pointer/);
 }
 const escaped=fixture({'a/b':{'~tag':1},other:2},{'a/b':{'~tag':2},other:2},{writePaths:['/player/a~1b/~0tag']});
 assert.deepEqual(build(escaped).operations,[replace('/player/a~1b/~0tag',2)]);
});

test('branch revision, full preimage and readonly guards survive granular expansion',()=>{
 const f=fixture({a:1,sibling:2},{a:3,sibling:2});f.before.stat_data.player.sibling=9;
 assert.throws(()=>build(f),/已变化/);
 const stale=fixture({a:1},{a:2});stale.proposal.changes[0].expected=2;assert.throws(()=>build(stale),/版本已变化/);
 assert.throws(()=>build(fixture({branch:{_locked:1,a:2}},{branch:{a:3}})),/只读/);
 assert.throws(()=>build(fixture({a:1,_locked:2},{a:3,_locked:2},{writePaths:['/player/_locked','/player/a']})),/只读/);
});

test('the 2000 operation cap rejects expansion without silently replacing the mapping root',()=>{
 const before=Object.fromEntries(Array.from({length:2000},(_,i)=>['k'+i,0])),after=Object.fromEntries(Object.keys(before).map(key=>[key,1]));
 assert.equal(build(fixture(before,after)).operations.length,2000);
 before.extra=0;after.extra=1;assert.throws(()=>build(fixture(before,after)),/2000/);
 assert.deepEqual(build(fixture(before,after,{writePaths:['/player']})).operations,[replace('/player',after)]);
});

test('bridgeInput rejects invalid and future floors before reading and skips metadata-only floors',()=>{
 const reads=[],context={chat:[{mes:'initial'},{is_system:true,mes:'system'},{role:'tool',mes:'tool'},{mes:'current'}]};
 const runtime={parseMessage(){},replaceMvuData(){},getMvuData({message_id}){reads.push(message_id);return message_id===0?{stat_data:{count:1}}:{};}};
 for(const index of [-1,4,100,0.5,NaN,'3',1,2])assert.throws(()=>bridgeInput(context,runtime,index),/完整 AI/);
 assert.deepEqual(reads,[]);assert.equal(bridgeInput(context,runtime,3).data.stat_data.count,1);assert.deepEqual(reads,[3,0]);
});

test('rejected parsed targets and thrown parsers never publish staged callback writes',async()=>{
 const listeners=new Map(),writes=[],eventSource={makeFirst:(name,fn)=>listeners.set(name,fn),removeListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 const original=async(data,options)=>writes.push({data,options});
 const runtime={events:{VARIABLE_UPDATE_STARTED:'start'},getMvuData(){},replaceMvuData:original,async parseMessage(_,data){listeners.get('start')(data);data.stat_data.derived=7;await this.replaceMvuData(data,{type:'message',message_id:0});return data;}};
 const before={stat_data:{count:1,derived:0}},operations=[replace('/count',2)];
 const parsed=await parseNativeTransaction({runtime,eventSource,index:0,before,block:'neutral fixture',guard(){}});
 assert.equal(parsed.stagedWrites,1);assert.equal(auditNativeOutcome(operations,before.stat_data,parsed.after.stat_data).rejected.length,1);assert.deepEqual(writes,[]);
 runtime.parseMessage=async function(_,data){listeners.get('start')(data);await this.replaceMvuData(data,{type:'message',message_id:0});throw Error('native parser rejected');};
 await assert.rejects(parseNativeTransaction({runtime,eventSource,index:0,before,block:'neutral fixture',guard(){}}),/native parser rejected/);
 assert.deepEqual(writes,[]);assert.equal(runtime.replaceMvuData,original);assert.equal(listeners.size,0);
});
