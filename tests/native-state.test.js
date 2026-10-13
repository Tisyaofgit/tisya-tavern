import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeReferences,nativeSnapshot} from '../tables/native-state.js';

const rows=paths=>paths.map(原生引用=>({values:{原生引用}}));
const context={chat:[{mes:'initial'},{is_user:true,mes:'continue'},{mes:'later'}]};

test('native references accept stat_data prefixes and relative escaped JSON Pointers',()=>{
 const paths=['stat_data.player.energy','$.stat_data.player.energy','player.energy','/player/energy','/a~1b/~0key','/player/items/0'];
 const data={stat_data:{player:{energy:0,items:[false]},'a/b':{'~key':''}}},reads=[];
 const result=nativeSnapshot(rows(paths),{context,messageIndex:1,runtime:{getMvuData(options){reads.push(options);return data;}}});
 assert.equal(result.readOnly,true);assert.equal(result.sourceFloor,2);assert.deepEqual(result.missing,[]);
 assert.deepEqual(result.values.map(row=>row.value),[0,0,0,0,'',false]);
 assert.deepEqual(reads,[{type:'message',message_id:1}]);
});

test('native reads never traverse wrapper metadata, prototypes or malformed pointers',()=>{
 const paths=['$.display_data.secret','display_data.secret','/display_data/secret','$.schema.secret','stat_data.constructor.secret','/player/__proto__/secret','/player/prototype/secret','/bad~2key','stat_data.player..energy','$','stat_data'];
 const data={stat_data:{player:{energy:1}},display_data:{secret:'wrapper only'},schema:{secret:'schema only'}};
 const result=nativeSnapshot(rows(paths),{context,messageIndex:0,runtime:{getMvuData:()=>data}});
 assert.deepEqual(result.values,[]);assert.deepEqual(result.missing,paths);
});

test('selected historical floor cannot read later values and missing paths do not backfill older values',()=>{
 const reads=[],states=new Map([[0,{stat_data:{player:{energy:1,olderOnly:7}}}],[1,{stat_data:{player:{energy:2}}}],[2,{stat_data:{player:{energy:999}}}]]);
 const runtime={getMvuData:({message_id})=>{reads.push(message_id);return states.get(message_id);}};
 const result=nativeSnapshot(rows(['/player/energy','/player/olderOnly']),{context,messageIndex:1,runtime});
 assert.deepEqual(reads,[1]);assert.equal(result.values[0].value,2);assert.deepEqual(result.missing,['/player/olderOnly']);
 states.delete(1);reads.length=0;
 const earlier=nativeSnapshot(rows(['/player/energy']),{context,messageIndex:1,runtime});
 assert.deepEqual(reads,[1,0]);assert.equal(earlier.sourceFloor,1);assert.equal(earlier.values[0].value,1);
});

test('invalid or future source indices do not invoke the native reader',()=>{
 let reads=0;const runtime={getMvuData(){reads++;throw Error('must not read');}};
 for(const messageIndex of [-1,3,100,0.5,NaN,'1',Infinity]){
  const result=nativeSnapshot(rows(['/player']),{context,messageIndex,runtime});
  assert.equal(result.available,false);assert.match(result.note,/来源楼层/);
 }
 assert.equal(reads,0);
});

test('native snapshots detach values, skip system floors and expose absence without fake values',()=>{
 const data={stat_data:{player:{items:['a']}}},reads=[];
 const result=nativeSnapshot(rows(['/player']),{context:{chat:[{mes:'initial'},{is_system:true,mes:'system'}]},runtime:{getMvuData:({message_id})=>{reads.push(message_id);return data;}}});
 assert.deepEqual(reads,[0]);assert.equal(result.sourceFloor,1);result.values[0].value.items.push('b');assert.deepEqual(data.stat_data.player.items,['a']);
 assert.equal(nativeSnapshot(rows(['/player']),{context,runtime:{}}).available,false);
 assert.equal(nativeSnapshot(rows(['/player']),{context,runtime:{getMvuData:()=>({})}}).available,false);
 assert.equal(nativeSnapshot([],{context,runtime:{getMvuData(){throw Error('no references');}}}),null);
 assert.deepEqual(nativeReferences([{values:{nested:{原生引用:'/player'},other:{原生引用:'/player'}}}]),['/player']);
});
