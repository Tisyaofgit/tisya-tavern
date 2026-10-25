import test from 'node:test';
import assert from 'node:assert/strict';
import {createMessageWorkspace} from '../message-workspace.js';

test('one exact text record shares derived work without sharing visibility variants',async()=>{
 const w=createMessageWorkspace();let calls=0;
 const get=(source,kind)=>w.read(source,kind,()=>{calls++;return Promise.resolve(kind+':'+source);});
 const a=get('同一正文','digest');assert.equal(get('同一正文','digest'),a);await a;
 assert.equal(await get('同一正文','digest'),'digest:同一正文');assert.equal(calls,1);
 await get('同一正文','reader:public');await get('同一正文','reader:psychology');assert.equal(calls,3);assert.equal(w.report().entries,1);
 await get('同一正义','digest');assert.equal(calls,4);assert.equal(w.report().entries,2);
});
test('failed or cleared pending work cannot replace a later source record',async()=>{
 const w=createMessageWorkspace();let reject,finish;
 const failed=w.read('raw','hash',()=>new Promise((_,no)=>reject=no));reject(Error('failed'));await assert.rejects(failed);await Promise.resolve();assert.equal(w.read('raw','hash',()=>7),7);
 const old=w.read('raw','pending',()=>new Promise(ok=>finish=ok));w.clear();assert.equal(w.read('raw','pending',()=>8),8);finish(9);await old;await Promise.resolve();assert.equal(w.read('raw','pending',()=>10),8);
});
test('workspace limits retain recent records and never truncate source text',()=>{
 const w=createMessageWorkspace({entries:2,units:40,slots:2});w.read('alpha','a',()=>1);w.read('beta','a',()=>2);w.read('gamma','a',()=>3);assert.equal(w.report().entries,2);let called=0;assert.equal(w.read('alpha','a',()=>++called),1);assert.equal(called,1);
 const long='x'.repeat(100);assert.equal(w.read(long,'a',()=>long),long);assert(w.report().units<=40);
});

test('default workspace keeps old records beyond former limit and restores only completed derived values',async()=>{
 const w=createMessageWorkspace();for(let i=0;i<540;i++)w.read('source'+i,'x',()=>i);assert.equal(w.report().entries,540);assert.equal(w.read('source0','x',()=>{throw Error('evicted');}),0);
 let finish;const pending=w.read('source0','pending',()=>new Promise(resolve=>finish=resolve));assert.deepEqual(w.snapshot('source0'),[['x',0]]);finish({body:'whole'});await pending;await Promise.resolve();const fresh=createMessageWorkspace();fresh.restore('source0',w.snapshot('source0'));assert.deepEqual(fresh.read('source0','pending',()=>{throw Error('recomputed');}),{body:'whole'});
});
