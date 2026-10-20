import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationOperations} from '../generation-operation.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));

test('stop releases a stuck host wait only after the real idle gate, without consuming a late result',async()=>{
 const host=deferred(),idle=deferred(),ops=createGenerationOperations({waitForIdle:()=>idle.promise});let consumed=false,finished=false;
 const first=ops.run(async task=>{await task.host(()=>host.promise);consumed=true;}).finally(()=>{finished=true;});
 const rejected=assert.rejects(first,e=>e.name==='AbortError'&&e.hostSettled===false);
 await tick();ops.stop();await tick();assert.equal(finished,false);assert.equal(ops.active(),1);
 idle.resolve();await rejected;assert.equal(ops.active(),0);
 const secondHost=deferred(),second=ops.run(task=>task.host(()=>secondHost.promise));await tick();assert.equal(ops.active(),1);
 host.resolve('late old answer');await tick();assert.equal(consumed,false);assert.equal(ops.active(),1);
 secondHost.resolve('new');assert.equal(await second,'new');assert.equal(ops.active(),0);
});

test('stop during read-only preparation cancels the continuation and cannot send after the read resolves',async()=>{
 const options=deferred(),ops=createGenerationOperations({waitForIdle:async()=>{}});let sent=0;
 const run=ops.run(async task=>{await task.wait(()=>options.promise);sent++;});const rejected=assert.rejects(run,{name:'AbortError'});
 await tick();ops.stop();await rejected;options.resolve({});await tick();assert.equal(sent,0);assert.equal(ops.active(),0);
});

test('late host rejection is observed and a settled cancellation remains identifiable',async()=>{
 const host=deferred(),ops=createGenerationOperations({waitForIdle:async()=>{}});
 const run=ops.run(task=>task.host(()=>host.promise));const rejected=assert.rejects(run,{name:'AbortError'});await tick();ops.stop();await rejected;host.reject(Error('late network failure'));await tick();assert.equal(ops.active(),0);
 let settled;
 await assert.rejects(ops.run(task=>task.host(async()=>{ops.stop();return 'partial';})),e=>{settled=e.hostSettled;return e.name==='AbortError';});assert.equal(settled,true);
});
