import test from 'node:test';import assert from 'node:assert/strict';
import {createLocalRenderCache} from '../local-render-cache.js';
import {createDisplayCache} from '../display-cache.js';
// Async storage fixture exercises transaction completion, reopen and failure.
function storage(){let stored,fail=false;const db={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={objectStore:()=>({get(){const r={};queueMicrotask(()=>{r.result=structuredClone(stored);r.onsuccess();});return r;},put(v){queueMicrotask(()=>{if(fail){tx.error=Error('quota');tx.onerror();}else{stored=structuredClone(v);tx.oncomplete();}});},delete(){queueMicrotask(()=>{stored=undefined;tx.oncomplete();});}})};return tx;}};return {window:{setTimeout,clearTimeout,indexedDB:{open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess();});return r;}}},fail:()=>fail=true,stored:()=>stored};}
test('local derived cache reopens exact version, misses old renderer, clears without touching story',async()=>{
 const s=storage(),first=createDisplayCache();first.read('source/settings/revision',()=>({structured:false,body:{value:'正文'}}));const ui=createLocalRenderCache(s.window,{version:'v1',snapshot:()=>first.snapshot(),restore:v=>first.restore(v)});await ui.ready;await ui.flush();await ui.dispose();
 const next=createDisplayCache(),read=createLocalRenderCache(s.window,{version:'v1',snapshot:()=>next.snapshot(),restore:v=>next.restore(v)});await read.ready;assert.equal(next.read('source/settings/revision',()=>{throw Error('miss');}).body.value,'正文');await read.clear();assert.equal(s.stored(),undefined);next.clear();await read.dispose();
 const stale=createDisplayCache(),other=createLocalRenderCache(s.window,{version:'v2',snapshot:()=>[],restore:v=>stale.restore(v)});await other.ready;assert.equal(stale.report().entries,0);await other.dispose();
});
test('cache write failure is reported; unavailable database stays explicit and never writes elsewhere',async()=>{
 const s=storage(),errors=[],c=createLocalRenderCache(s.window,{version:'v1',snapshot:()=>[],restore(){},onError:e=>errors.push(e.message)});await c.ready;s.fail();await c.flush();assert.equal(c.report().state,'failed');assert.match(errors[0],/quota/);await c.dispose();const absent=createLocalRenderCache({setTimeout,clearTimeout},{version:'v1',snapshot:()=>{throw Error('unexpected');},restore(){}});await absent.ready;assert.equal(absent.report().state,'unsupported');await assert.rejects(absent.clear(),/不可用/);await absent.dispose();
});
