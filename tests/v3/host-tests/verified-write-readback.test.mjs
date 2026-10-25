import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldbookTableStorage} from '../../../v3/runtime-source/host/table-storage.mjs';
import {createInitialPreferenceBank,createPreferenceOverlayStorage} from '../../../v3/runtime-source/preferences/shared-store.mjs';
import {createInitialState,createPreflightRunner} from '../../../v3/runtime-source/runner/preflight-runner.mjs';
import {tableRegistry} from '../../../v3/host-runtime.mjs';
const copy=structuredClone,initial=()=>createInitialState({registry:tableRegistry,rows:[]});

test('table storage returns detached actual readback only after exact validation',async()=>{
 let data={entries:{}},reads=0,corrupt=false;
 const storage=createWorldbookTableStorage({bookId:'B',owner:{chatId:'chat',branchId:'branch'},initialState:initial(),transport:{readFresh:async()=>{reads++;return copy(data);},createEntry:(_book,doc)=>{const entry={uid:0};doc.entries[0]=entry;return entry;},save:async(_book,next)=>{data=copy(next);if(corrupt){const wire=data.entries[0],state=JSON.parse(wire.content);state.requests.wrong={};wire.content=JSON.stringify(state);}}}});
 const before=await storage.read(),next={...before,revision:1};reads=0;const receipt=await storage.compareAndWrite(0,next);assert.equal(storage.capabilities.verifiedWriteReadback,true);assert.equal(reads,2);assert.deepEqual(receipt.state,next);receipt.state.requests.local={};assert.deepEqual((await storage.read()).requests,{});
 corrupt=true;await assert.rejects(storage.compareAndWrite(1,{...next,revision:2}),{code:'LEDGER_READBACK'});
});

async function overlay({trusted=true,bad=false,changeP=false}={}){
 let state=initial(),bank=createInitialPreferenceBank({registry:tableRegistry}),bReads=0,pReads=0;
 const b={capabilities:{verifiedWriteReadback:trusted},read:async()=>{bReads++;return copy(state);},compareAndWrite:async(rev,next)=>{assert.equal(rev,state.revision);state=copy(next);if(changeP)bank.revision++;return {revision:next.revision,state:bad?{...copy(next),requests:{wrong:{}}}:copy(next)};}};
 const storage=createPreferenceOverlayStorage({sessionStorage:b,preferenceStorage:{read:async()=>{pReads++;return copy(bank);}}});const current=await storage.read();bReads=pReads=0;return {storage,next:{...current,revision:1},counts:()=>({bReads,pReads})};
}
test('overlay reuses trusted B readback while retaining both P checks',async()=>{
 const f=await overlay(),receipt=await f.storage.compareAndWrite(0,f.next);assert.deepEqual(f.counts(),{bReads:1,pReads:2});assert.deepEqual(receipt.state,f.next);assert.equal(receipt.revision,1);assert.equal(f.storage.capabilities.verifiedWriteReadback,true);
 const legacy=await overlay({trusted:false,bad:true});assert.deepEqual((await legacy.storage.compareAndWrite(0,legacy.next)).state,legacy.next);assert.deepEqual(legacy.counts(),{bReads:2,pReads:2});
});
test('overlay rejects corrupted trusted receipt and a concurrently changed P bank',async()=>{
 const bad=await overlay({bad:true});await assert.rejects(bad.storage.compareAndWrite(0,bad.next),/readback did not match/);
 const changed=await overlay({changeP:true});await assert.rejects(changed.storage.compareAndWrite(0,changed.next),/Preference bank changed during/);
});

async function runUntilModel({trusted=true,badReceipt=false,badDisk=false}={}){
 let state=initial(),reads=0,calls=0;const stop=Error('model boundary');
 const storage={capabilities:{verifiedWriteReadback:trusted},read:async()=>{reads++;return copy(state);},compareAndWrite:async(rev,next)=>{assert.equal(state.revision,rev);state=copy(next);if(badDisk)state.requests.wrong={};return {revision:next.revision,state:badReceipt?{...copy(next),requests:{wrong:{}}}:copy(next)};}};
 const runner=createPreflightRunner({storage,requestA:async()=>{calls++;throw stop;}});let error;try{await runner.run({requestKey:'request',generationType:'normal',archiveSources:[],activeSourceKeys:[]});}catch(e){error=e;}
 return {reads,calls,error,stop};
}
test('runner consumes an explicit verified state and legacy storage still gets a fresh read',async()=>{
 const trusted=await runUntilModel();assert.equal(trusted.error,trusted.stop);assert.equal(trusted.reads,1);assert.equal(trusted.calls,1);
 const legacy=await runUntilModel({trusted:false});assert.equal(legacy.error,legacy.stop);assert.equal(legacy.reads,2);
});
test('runner rejects bad verified receipts before model send and ignores untrusted save receipts',async()=>{
 const bad=await runUntilModel({badReceipt:true});assert.match(bad.error.message,/Store write was not confirmed/);assert.equal(bad.calls,0);
 const legacy=await runUntilModel({trusted:false,badDisk:true});assert.match(legacy.error.message,/Store write was not confirmed/);assert.equal(legacy.calls,0);assert.equal(legacy.reads,2);
});
