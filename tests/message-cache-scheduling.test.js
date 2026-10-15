import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBDatabase} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {createMessageCache} from '../message-cache.js';

const identity={scope:'long-chat',owner:'message-1',source:'长篇原文',variant:'base'};
const spin=ms=>{const end=performance.now()+ms;while(performance.now()<end){}};

test('a main-thread loading task cannot turn a healthy IndexedDB read into a timeout',async()=>{
 const errors=[],w={indexedDB:new IDBFactory(),crypto:webcrypto};
 const c=createMessageCache(w,{version:'v1',timeout:40,onError:e=>errors.push(e.message)});
 await c.ready;
 const original=IDBDatabase.prototype.transaction;let once=true;
 IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(once){once=false;queueMicrotask(()=>spin(120));}return tx;};
 try{
  const packet=await c.prepare(identity,()=>({text:'fresh'}));await c.flush();
  assert.equal(c.report().state,'ready',errors.join('\n'));
  assert.deepEqual(errors,[]);assert.equal(packet.fromDisk,false);
  assert.equal((await c.prepare(identity,()=>{throw Error('must reuse persisted value');})).fromDisk,true);
 }finally{IDBDatabase.prototype.transaction=original;await c.dispose();}
});

// A request success and its later transaction completion are separate events.
function delayedDatabase({requestMs=25,commitMs=50,stall=false}={}){
 let aborted=0,transactions=0;
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(){
  transactions++;const timers=[],tx={objectStore:()=>({get:request,put:request,clear:request}),abort(){aborted++;for(const id of timers)clearTimeout(id);tx.onabort?.();}};
  function request(){const r=new EventTarget();r.result=undefined;
   if(!stall){timers.push(setTimeout(()=>{const e=new Event('success');r.dispatchEvent(e);r.onsuccess?.(e);},requestMs));timers.push(setTimeout(()=>tx.oncomplete?.(),commitMs));}
   return r;
  }
  return tx;
 }};
 return {window:{crypto:webcrypto,indexedDB:{open(){const r={result:db};queueMicrotask(()=>r.onsuccess?.());return r;}}},state:()=>({aborted,transactions})};
}

test('read/write request progress keeps a later commit alive without extending the no-progress budget',async()=>{
 const d=delayedDatabase(),errors=[],c=createMessageCache(d.window,{version:'v1',timeout:40,onError:e=>errors.push(e.message)});
 try{await c.ready;await c.prepare(identity,()=>({text:'fresh'}));await c.flush();assert.equal(c.report().state,'ready',errors.join('\n'));assert.deepEqual(errors,[]);assert.equal(d.state().aborted,0);}finally{await c.dispose();}
});

test('an idle event loop with a truly stalled read still aborts and reports once',async()=>{
 const d=delayedDatabase({stall:true}),errors=[],c=createMessageCache(d.window,{version:'v1',timeout:40,onError:e=>errors.push(e.message)});
 try{await c.ready;const started=performance.now();await c.prepare(identity,()=>({text:'fresh'}));assert(performance.now()-started<500);assert.equal(c.report().state,'failed');assert.equal(errors.length,1);assert.match(errors[0],/显示缓存事务超时/);assert.equal(d.state().aborted,1);await assert.rejects(c.clear(),/未清理/);}finally{await c.dispose();}
});

test('a delayed open callback after a loading task is not rejected as a broken database',async()=>{
 const w={indexedDB:new IDBFactory(),crypto:webcrypto},errors=[];
 const c=createMessageCache(w,{version:'v1',timeout:40,onError:e=>errors.push(e.message)});
 spin(120);
 try{await c.ready;assert.equal(c.report().state,'ready',errors.join('\n'));assert.deepEqual(errors,[]);}finally{await c.dispose();}
});

test('repeatedly throttled timers while hidden still bound a stalled transaction and disposal',async()=>{
 const d=delayedDatabase({stall:true});d.window.document={hidden:true};
 d.window.setTimeout=fn=>setTimeout(fn,60);d.window.clearTimeout=clearTimeout;
 const errors=[],c=createMessageCache(d.window,{version:'v1',timeout:40,onError:e=>errors.push(e.message)});
 try{
  await c.ready;const pending=c.clear();const rejected=assert.rejects(pending,/未清理/);
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(c.report().state,'ready');assert.equal(d.state().aborted,0);
  const watchdog=setTimeout(()=>assert.fail('disposal never settled'),1000);
  try{await c.dispose();await rejected;}finally{clearTimeout(watchdog);}
  assert.equal(errors.length,1);assert.equal(d.state().aborted,1);
  assert.equal(c.report().lastFailure.phase,'清空');assert(c.report().lastFailure.schedulingDelayMs>0);
 }finally{await c.dispose();}
});

test('a healthy background request and commit may finish before throttled timeout callbacks',async()=>{
 const d=delayedDatabase(),errors=[];d.window.document={hidden:true};
 d.window.setTimeout=fn=>setTimeout(fn,60);d.window.clearTimeout=clearTimeout;
 const c=createMessageCache(d.window,{version:'v1',timeout:40,onError:e=>errors.push(e.message)});
 try{await c.ready;await c.clear();assert.equal(c.report().state,'ready');assert.deepEqual(errors,[]);assert.equal(d.state().aborted,0);}finally{await c.dispose();}
});

test('a late final timeout tick yields once to a commit queued near the deadline',async()=>{
 const d=delayedDatabase({requestMs:1,commitMs:55}),errors=[];
 const c=createMessageCache(d.window,{version:'v1',timeout:40,onError:e=>errors.push(e.message)});
 try{
  await c.ready;const pending=c.clear();const blocking=setTimeout(()=>spin(120),32);
  try{await pending;}finally{clearTimeout(blocking);}
  assert.deepEqual(errors,[]);assert.equal(c.report().state,'ready');assert.equal(d.state().aborted,0);
 }finally{await c.dispose();}
});

test('progress followed by a stalled commit fails honestly; request success is not a committed write',async()=>{
 const d=delayedDatabase({commitMs:500}),errors=[],c=createMessageCache(d.window,{version:'v1',timeout:40,onError:e=>errors.push(e.message)});
 try{await c.ready;await assert.rejects(c.clear(),/未清理/);assert.equal(c.report().state,'failed');assert.equal(errors.length,1);assert.equal(c.report().lastFailure.phase,'清空');assert.equal(d.state().aborted,1);}finally{await c.dispose();}
});
