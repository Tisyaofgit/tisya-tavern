import test from 'node:test';
import assert from 'node:assert/strict';
import {createUiOperations,messageActionExclusive} from '../ui-operation.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('a pending clipboard or reader cannot lock history or hide the true write owner',async()=>{
 let now=0;const gate=createUiOperations({now:()=>now}),clipboard=deferred(),selection=deferred();
 const read=gate.run(()=>clipboard.promise,{exclusive:messageActionExclusive('msg-copy'),label:'复制正文'});
 assert.equal(gate.busy(),false);
 const write=gate.run(()=>selection.promise,{label:'打开所选会话'});now=5100;
 assert.deepEqual(gate.state(),{label:'打开所选会话',elapsedSeconds:5});
 await assert.rejects(gate.run(()=>assert.fail('must not write'),{label:'改写'}),/打开所选会话（已等待 5 秒）/);
 for(const action of ['more','msg-read','msg-copy','msg-info','candidate-picker']){
  assert.equal(messageActionExclusive(action),false);
  assert.equal(await gate.run(()=>action,{exclusive:messageActionExclusive(action)}),action);
 }
 clipboard.resolve();await read;assert.equal(gate.busy(),true);
 selection.resolve();await write;assert.equal(gate.state(),null);
});
test('failure releases only its own lock, while all history changes stay exclusive',async()=>{
 const gate=createUiOperations();
 for(const action of ['regen','next','msg-edit','msg-delete','msg-rollback','candidate-prev','candidate-next'])assert.equal(messageActionExclusive(action),true);
 await assert.rejects(gate.run(()=>{throw Error('native failure');}),/native failure/);
 assert.equal(gate.busy(),false);assert.equal(await gate.run(()=>42),42);
});
