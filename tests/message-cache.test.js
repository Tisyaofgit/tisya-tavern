import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {createMessageCache,messageCacheOwner} from '../message-cache.js';
const env=()=>({indexedDB:new IDBFactory(),crypto:webcrypto});
const message=(id,mes='原文'+id)=>({send_date:id,name:'甲',mes,swipes:[mes]});
const identity=(m,scope='chat-a')=>({scope,owner:messageCacheOwner(m),source:m.mes,variant:'base'});
const cache=(window,options={})=>createMessageCache(window,{version:'v1',...options});
const read=(c,m,scope)=>c.prepare(identity(m,scope),()=>({text:m.mes}));
async function rows(w){const d=await new Promise((resolve,reject)=>{const r=w.indexedDB.open('tisya-render-cache',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=d.transaction('messages').objectStore('messages').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{d.close();}}
test('disk retains more than hot LRU capacity and reopens by exact source, scope and candidate',async()=>{
 const w=env(),messages=Array.from({length:90},(_,i)=>message(i));let c=cache(w);await c.reconcile('chat-a',messages);
 for(const m of messages)await read(c,m);await c.flush();assert.equal((await rows(w)).length,90);await c.dispose();c=cache(w);
 assert.equal((await read(c,messages[0])).fromDisk,true);assert.equal((await read(c,messages[89])).fromDisk,true);
 assert.equal((await read(c,message(0,'等长改文'))).fromDisk,false);assert.equal((await read(c,messages[0],'chat-b')).fromDisk,false);await c.dispose();
});
test('delete and edit prune only removed sources; position shifts and retained candidates survive',async()=>{
 const w=env(),a=message(1),b=message(2),c=cache(w);b.swipes.push('候选二');await c.reconcile('chat-a',[a,b]);await read(c,a);await read(c,b);await c.prepare({...identity(b),source:'候选二'},()=>({text:'候选二'}));await read(c,a,'other');await c.flush();
 await c.reconcile('chat-a',[b]);assert.equal((await rows(w)).length,3);assert.equal((await read(c,b)).fromDisk,true);
 b.mes='候选二';b.swipes=['候选二'];await c.reconcile('chat-a',[b]);assert.equal((await rows(w)).filter(r=>r.scope==='chat-a').length,1);
 b.mes='编辑后';b.swipes=['编辑后'];await c.reconcile('chat-a',[b]);assert.equal((await rows(w)).filter(r=>r.scope==='chat-a').length,0);assert.equal((await rows(w)).filter(r=>r.scope==='other').length,1);await c.dispose();
});
test('cold or incomplete host records are not deletions; complete hydrated inventory can prune',async()=>{
 const w=env(),m=message(1),c=cache(w);m.swipes.push('未加载的旧候选');await c.reconcile('chat-a',[m]);await c.prepare({...identity(m),source:m.swipes[1]},()=>({text:'旧'}));await c.flush();
 await c.reconcile('chat-a',[{...m,swipes:[m.mes],tt_swipe_cold:{count:2}}]);assert.equal((await rows(w)).length,1);
 await c.reconcile('chat-a',[null]);assert.equal((await rows(w)).length,1);
 await c.reconcile('chat-a',[{...m,swipes:[m.mes]}]);assert.equal((await rows(w)).length,0);await c.dispose();
});
test('delete during asynchronous hashing cannot resurrect a disk row',async()=>{
 const w=env(),m=message(1);let release;const c=cache(w,{digest:()=>new Promise(r=>release=r)});await c.reconcile('chat-a',[m]);const pending=read(c,m);while(!release)await new Promise(r=>setImmediate(r));await c.reconcile('chat-a',[]);release('key');await pending;await c.flush();assert.deepEqual(await rows(w),[]);await c.dispose();
});
test('clear invalidates pending work and reports unsupported storage honestly',async()=>{
 const w=env(),m=message(1);let release;const c=cache(w,{digest:()=>new Promise(r=>release=r)});await c.ready;const pending=read(c,m);while(!release)await new Promise(r=>setImmediate(r));await c.clear();release('key');await pending;await c.flush();assert.deepEqual(await rows(w),[]);await c.dispose();
 const errors=[],absent=cache({},{onError:e=>errors.push(e.message)});await absent.ready;assert.equal((await read(absent,m)).value.text,m.mes);await assert.rejects(absent.clear(),/未清理/);assert.equal(errors.length,1);await absent.dispose();
});
test('view state survives reopen and concurrent projection writes without storing runtime objects',async()=>{
 const w=env(),m=message(1),state={folds:{journey:true},journey:{tab:'people',positions:{people:32}}};let c=cache(w);await c.reconcile('chat-a',[m]);await Promise.all([read(c,m),c.saveView(identity(m),state),c.prepare({...identity(m),variant:'psych'},()=>({text:'内心'}))]);await c.flush();await c.dispose();c=cache(w);await c.reconcile('chat-a',[m]);assert.deepEqual((await read(c,m)).view,state);assert.equal((await c.prepare({...identity(m),variant:'psych'},()=>{throw Error('cache miss');})).fromDisk,true);await c.dispose();
});
test('ambiguous message identities may share parsing but never another occurrence’s reading state',async()=>{
 const w=env(),m=message(1),c=cache(w);await c.reconcile('chat-a',[m]);await read(c,m);await c.saveView(identity(m),{folds:{journey:true}});await c.reconcile('chat-a',[m,{...m}]);assert.equal((await read(c,m)).view,null);await c.saveView(identity(m),{folds:{journey:false}});await c.dispose();
});
test('blocked upgrade and stalled opening yield promptly with visible errors and fresh parsing',async()=>{
 const w=env(),old=await new Promise(resolve=>{const r=w.indexedDB.open('tisya-render-cache',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);}),errors=[];
 const c=cache(w,{onError:e=>errors.push(e.message)});await c.ready;assert.equal(c.report().state,'failed');assert.match(errors[0],/旧窗口/);assert.equal((await read(c,message(1))).fromDisk,false);old.close();await c.dispose();
 const stalled=cache({indexedDB:{open:()=>({})}},{timeout:20,onError:e=>errors.push(e.message)});await stalled.ready;assert.match(stalled.report().error,/超时/);await stalled.dispose();
});
test('renderer upgrade discards obsolete derived entries but leaves the caller’s chat intact',async()=>{
 const w=env(),m=message(1),snapshot=JSON.stringify(m);let c=cache(w);await read(c,m);await c.dispose();c=cache(w,{version:'v2'});await c.reconcile('chat-a',[m]);assert.deepEqual(await rows(w),[]);assert.equal((await read(c,m)).fromDisk,false);assert.equal(JSON.stringify(m),snapshot);await c.dispose();
});
test('quickly visiting many chats releases old inventories without deleting saved disk data',async()=>{
 const w=env(),m=message(1),c=cache(w);for(let i=0;i<8;i++){await c.reconcile('chat-'+i,[m]);await read(c,m,'chat-'+i);await c.flush();}assert.equal((await rows(w)).length,8);
 await Promise.all(Array.from({length:8},(_,i)=>c.reconcile('chat-'+i,[m])));assert.equal((await rows(w)).length,8);await c.reconcile('chat-0',[m]);assert.equal((await read(c,m,'chat-0')).fromDisk,true);await c.dispose();
});

test('progressing history cleanup does not time out merely because the whole scan exceeds one timeout',async()=>{
 const {IDBIndex}=await import('fake-indexeddb');const w=env(),messages=Array.from({length:100},(_,i)=>message(i)),original=IDBIndex.prototype.openCursor;let scans=0;
 let c=cache(w);for(const m of messages)await read(c,m);await c.flush();await c.dispose();
 // Real fake-indexeddb transactions/cursors, with 3 ms of per-row main-thread work.
 IDBIndex.prototype.openCursor=function(...args){scans++;const request=original.apply(this,args);let callback;Object.defineProperty(request,'onsuccess',{configurable:true,get:()=>callback,set(fn){callback=function(e){const end=performance.now()+3;while(performance.now()<end){}return fn.call(this,e);};}});return request;};
 const errors=[];c=cache(w,{timeout:200,onError:e=>errors.push(e.message)});
 try{const start=performance.now();await c.reconcile('chat-a',messages);assert(performance.now()-start>200);assert.equal(c.report().state,'ready',errors.join('\n'));assert.deepEqual(errors,[]);const cached=await read(c,messages[0]);assert.equal(cached.fromDisk,true,JSON.stringify({report:c.report(),errors}));assert.equal((await rows(w)).length,100);
 const before=scans;await Promise.all(Array.from({length:8},()=>c.reconcile('chat-a',messages)));assert.equal(scans,before,'unchanged inventories must not trigger repeat full scans');}
 finally{IDBIndex.prototype.openCursor=original;await c.dispose();}
});

test('a genuinely stalled transaction still reports the failure and never reports a successful clear',async()=>{
 let aborts=0;const db={objectStoreNames:{contains:()=>true},close(){},transaction(){return {objectStore:()=>({get:()=>({}),clear:()=>({})}),abort(){aborts++;this.onabort?.();}};}};
 const errors=[],w={crypto:webcrypto,indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}}};const c=cache(w,{timeout:15,onError:e=>errors.push(e.message)});
 await c.ready;const result=await read(c,message(1));assert.equal(result.fromDisk,false);assert.equal(c.report().state,'failed');assert.match(errors[0],/显示缓存事务超时/);assert.equal(aborts,1);await assert.rejects(c.clear(),/未清理/);await c.dispose();
});

test('a changed inventory arriving during paged cleanup is applied without reviving deleted candidates',async()=>{
 const w=env(),messages=Array.from({length:80},(_,i)=>message(i)),c=cache(w);for(const m of messages)await read(c,m);await c.flush();
 const first=c.reconcile('chat-a',messages);const final=c.reconcile('chat-a',messages.slice(60));await Promise.all([first,final]);const stored=await rows(w);assert.equal(stored.length,20);assert(stored.every(r=>messages.slice(60).some(m=>messageCacheOwner(m)===r.owner)));await c.dispose();
});
