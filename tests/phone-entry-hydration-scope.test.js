import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Execute the production entry. The native hydration transport and phone
// storage here are explicit fakes; cross-version official hydration is tested
// separately. These portable tests lock the await ownership guards.
const entry=readFileSync(new URL('../index.js',import.meta.url),'utf8');
const start=entry.indexOf('const phoneServices=new Map();'),end=entry.indexOf('\nconst phoneTurn=',start);
assert.ok(start>=0&&end>start);
const source=entry.slice(start,end).replaceAll('import.meta.url',JSON.stringify(new URL('../index.js',import.meta.url).href));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(hydrate){
 let c={key:'A',chatMetadata:{},chat:[{extra:{tisya_engine:{uid:'a1'}},tt_swipe_cold:true}]},reads=0,hydrated=false,writes=0;
 const service={init:async()=>{reads++;if(!hydrated)throw Object.assign(Error('explicit synthetic cold evidence'),{code:'PHONE_DATABASE_DETACHED',details:{hydrateSwipes:[{index:0,uid:'a1'}]}});},refresh:async()=>service.init()};
 const deps={context:()=>c,phoneChatKey:v=>v.key,matrixDatabase:{peek:async()=>({state:{}})},nativeGenerationOpen:false,isGenerating:()=>false,revisionController:{active:()=>false},fetch:async()=>({ok:true,json:async()=>({})}),ensureMatrixDatabase:async()=>{writes++;},createPhoneDatabaseStorage:()=>({}),matrixHost:{createPhoneDatabaseBridge:()=>({})},createPhoneService:()=>service,hydrateChatMessageSwipes:async index=>{assert.equal(index,0);const result=await hydrate();hydrated=!!result;return result;},window:{dispatchEvent(){}},CustomEvent:class{},appearance:null,pet:null};
 const get=Function(...Object.keys(deps),source+'\nreturn getPhoneService;')(...Object.values(deps));
 return {get,reads:()=>reads,writes:()=>writes,change:()=>{c={key:'B',chatMetadata:{},chat:[{mes:'untouched B'}]};},context:()=>c};
}

test('entry hydrates only requested evidence and rereads once in its original scope',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return true;});await f.get();assert.equal(calls,1);assert.equal(f.reads(),2);assert.equal(f.writes(),0);
});

test('entry preserves the exact native hydration failure and performs no retry write',async()=>{
 const error=Error('explicit native hydration failure'),f=fixture(async()=>{throw error;});await assert.rejects(f.get(),e=>e===error);assert.equal(f.reads(),1);assert.equal(f.writes(),0);
});

test('entry refuses its old service when native hydration finishes after switching to B',async()=>{
 const begun=deferred(),gate=deferred(),f=fixture(async()=>{begun.resolve();await gate.promise;return true;}),pending=f.get();
 await begun.promise;f.change();gate.resolve();await assert.rejects(pending,e=>e.code==='PHONE_CONTEXT_CHANGED');
 assert.equal(f.reads(),1);assert.equal(f.writes(),0);assert.deepEqual(f.context().chat,[{mes:'untouched B'}]);assert.deepEqual(f.context().chatMetadata,{});
});
