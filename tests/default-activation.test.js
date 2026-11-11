import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller,NS,chatKey} from '../engine/controller.mjs';
import {createDefaultActivation} from '../default-activation.js';

const clone=value=>structuredClone(value);
const blank=()=>({format:'tisya.matrix-state.v1',schema:{ACTOR:{id:'ACTOR',fields:[{key:'name',type:'TEXT'}]}},tables:{ACTOR:{}},runtime:{scope:{session_ref:'a',branch_ref:'main'}}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const disk=new Map(),settings={},savedMetadata=[],savedChats=[];let serial=0,reads=0,writes=0,catalogs=0;
 const context=id=>({chatId:id,characterId:0,extensionSettings:settings,chatMetadata:{},chat:[{is_user:true,mes:'原始开场'},{mes:'既有回复，不重新结算'}],saveSettingsDebounced(){},async saveMetadata(){savedMetadata.push({key:chatKey(this),metadata:clone(this.chatMetadata)});},async saveChat(){savedChats.push({key:chatKey(this),chat:clone(this.chat)});}});
 let ctx=context('a');
 const storage={async get(id){reads++;return clone(disk.get(id));},async set(id,value){writes++;disk.set(id,clone(value));},async commit(id,revision,value){if((disk.get(id)?.local_revision??0)!==revision)return false;writes++;disk.set(id,clone(value));return true;}};
 const controller=new Controller({getContext:()=>ctx,storage,uid:()=>`uid-${++serial}`,request(){assert.fail('automatic binding must not settle history');}});
 const createState=async scope=>{catalogs++;const state=blank();state.runtime.scope=scope;return state;};
 return {disk,storage,settings,savedMetadata,savedChats,controller,createState,context,get ctx(){return ctx;},switch(next){ctx=typeof next==='string'?context(next):next;return ctx;},counts:()=>({reads,writes,catalogs})};
}

test('fresh chat binds once, enables, and retains exact existing history as a baseline',async()=>{
 const f=fixture(),text=f.ctx.chat.map(m=>m.mes);
 const result=await f.controller.ensureBound(f.createState);
 assert.equal(result.status,'created');assert.equal(f.ctx.chatMetadata[NS].enabled,true);assert.equal(f.ctx.chatMetadata[NS].binding_pending,undefined);
 const state=clone(f.disk.get(result.id));assert.deepEqual(f.ctx.chat.map(m=>m.mes),text);assert.equal(state.journal.entries.length,2);assert(state.journal.entries.every(e=>e.baseline&&e.settlement_status==='BASELINE'));
 assert.equal(Object.keys(state.state.tables.ACTOR).length,0);assert.equal(f.savedChats.length,1);
 await f.controller.ensureBound(f.createState);assert.deepEqual(f.disk.get(result.id),state);assert.equal(f.counts().writes,1);assert.equal(f.counts().catalogs,1);
});

test('existing bundle and story settings survive default activation unchanged',async()=>{
 const f=fixture();const first=await f.controller.ensureBound(f.createState),state=f.disk.get(first.id);state.state.tables.ACTOR.saved={values:{name:'保留角色'},states:{name:'known'}};state.local_revision=23;
 f.settings.tisya_matrix={story:{userBinding:{book:'原书',uid:7}}};const before=clone(state),settings=clone(f.settings);f.ctx.chatMetadata[NS].enabled=false;
 await f.controller.ensureBound(f.createState);assert.equal(f.ctx.chatMetadata[NS].enabled,true);assert.deepEqual(f.disk.get(first.id),before);assert.deepEqual(f.settings,settings);
});

test('empty home does not read or write engine storage',async()=>{
 const f=fixture();f.ctx.chatId=null;assert.deepEqual(await f.controller.ensureBound(f.createState),{status:'no-chat',key:null});assert.deepEqual(f.counts(),{reads:0,writes:0,catalogs:0});assert.deepEqual(f.ctx.chatMetadata,{});
});

test('existing binding with missing or corrupt storage is visible and never reset',async()=>{
 for(const invalid of [undefined,{state:null}]){
  const f=fixture();f.ctx.chatMetadata[NS]={chat_uid:'existing',owner_chat_key:chatKey(f.ctx),enabled:false};if(invalid)f.disk.set('existing',invalid);
  const before=clone(f.ctx.chatMetadata);
  await assert.rejects(f.controller.ensureBound(f.createState),e=>['ENGINE_STATE_MISSING','ENGINE_STATE_INVALID'].includes(e.code));assert.deepEqual(f.ctx.chatMetadata,before);assert.equal(f.counts().writes,0);assert.equal(f.counts().catalogs,0);
 }
});

test('storage read failure preserves the exact error and does not initialize',async()=>{
 const f=fixture();f.ctx.chatMetadata[NS]={chat_uid:'existing',owner_chat_key:chatKey(f.ctx),enabled:true};const error=Error('original IndexedDB read failure');f.storage.get=async()=>{throw error;};
 await assert.rejects(f.controller.ensureBound(f.createState),e=>e===error);assert.equal(f.counts().writes,0);assert.equal(f.counts().catalogs,0);
});

test('fork attaches a cloned owner while parent state and identity stay exact',async()=>{
 const f=fixture(),first=await f.controller.ensureBound(f.createState),parent=f.ctx,parentState=clone(f.disk.get(first.id));
 const branch=f.context('branch');branch.chat=clone(parent.chat);branch.chatMetadata=clone(parent.chatMetadata);f.switch(branch);
 const result=await f.controller.ensureBound(f.createState);assert.equal(result.status,'forked');assert.notEqual(result.id,first.id);assert.deepEqual(f.disk.get(first.id),parentState);assert.deepEqual(f.disk.get(result.id),parentState);assert.equal(parent.chatMetadata[NS].chat_uid,first.id);assert.equal(branch.chatMetadata[NS].owner_chat_key,chatKey(branch));
});

test('chat switch while loading catalog cancels before a metadata or state write',async()=>{
 const f=fixture(),a=f.ctx,gate=deferred();const pending=f.controller.ensureBound(async()=>{await gate.promise;return blank();});await new Promise(r=>setImmediate(r));const b=f.switch('b');gate.resolve();
 await assert.rejects(pending,e=>e.code==='CHAT_CHANGED');assert.deepEqual(a.chatMetadata,{});assert.deepEqual(b.chatMetadata,{});assert.equal(f.counts().writes,0);assert.equal(f.savedMetadata.length,0);
});

test('chat switch while reading an old bundle cannot enable the new or old chat',async()=>{
 const f=fixture(),first=await f.controller.ensureBound(f.createState);f.ctx.chatMetadata[NS].enabled=false;const a=f.ctx,gate=deferred(),get=f.storage.get;f.storage.get=async id=>{await gate.promise;return get(id);};
 const pending=f.controller.ensureBound(f.createState);await new Promise(r=>setImmediate(r));const b=f.switch('b');gate.resolve();
 await assert.rejects(pending,e=>e.code==='CHAT_CHANGED');assert.equal(a.chatMetadata[NS].enabled,false);assert.deepEqual(b.chatMetadata,{});assert.equal(f.counts().writes,1);
});

test('failed new-state commit leaves an explicit pending owner that resumes without reset',async()=>{
 const f=fixture(),commit=f.storage.commit;f.storage.commit=async()=>{throw Error('original commit failure');};
 await assert.rejects(f.controller.ensureBound(f.createState),/original commit failure/);const pending=clone(f.ctx.chatMetadata[NS]);assert.equal(pending.enabled,false);assert.equal(pending.binding_pending.kind,'initial');assert.equal(f.disk.size,0);
 f.storage.commit=commit;const result=await f.controller.ensureBound(f.createState);assert.equal(result.id,pending.chat_uid);assert.equal(f.ctx.chatMetadata[NS].enabled,true);assert.equal(f.disk.size,1);
});

test('failed final metadata save retains a recoverable marker and no success is reported',async()=>{
 const f=fixture(),save=f.ctx.saveMetadata;let calls=0;f.ctx.saveMetadata=async function(){if(++calls===2)throw Error('final metadata failure');return save.call(this);};
 await assert.rejects(f.controller.ensureBound(f.createState),/final metadata failure/);const pending=clone(f.ctx.chatMetadata[NS]),state=clone(f.disk.get(pending.chat_uid));assert.equal(pending.enabled,false);assert(pending.binding_pending);
 f.ctx.saveMetadata=save;await f.controller.ensureBound(f.createState);assert.deepEqual(f.disk.get(pending.chat_uid),state);assert.equal(f.counts().writes,1);assert.equal(f.ctx.chatMetadata[NS].enabled,true);
});

test('two simultaneous requests serialize and create one binding',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.controller.ensureBound(f.createState),f.controller.ensureBound(f.createState)]);assert.equal(a.id,b.id);assert.equal(f.counts().writes,1);assert.equal(f.counts().catalogs,1);
});

function activated(f,{createState=f.createState}={}){
 let selections=0;const activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>{selections++;return {active:true};},ensureBound:options=>f.controller.ensureBound(createState,options)});return {activation,selections:()=>selections};
}

test('startup selects once; repeated ready does not undo manual disable, reopening does',async()=>{
 const f=fixture(),a=f.ctx,{activation,selections}=activated(f);await activation.start();await activation.ready();assert.equal(selections(),1);
 a.chatMetadata[NS].enabled=false;await assert.rejects(activation.ready(),e=>e.code==='ENGINE_DISABLED');await activation.chatChanged();assert.equal(a.chatMetadata[NS].enabled,false);
 f.switch('b');await activation.chatChanged();f.switch(a);await activation.chatChanged();assert.equal(a.chatMetadata[NS].enabled,true);assert.equal(selections(),1);
});

test('a delayed first-chat failure does not poison later chat activation',async()=>{
 const f=fixture(),a=f.ctx,gate=deferred();let calls=0;const {activation}=activated(f,{createState:async scope=>{if(++calls===1)await gate.promise;return f.createState(scope);}});
 const first=activation.start();first.catch(()=>{});await new Promise(r=>setImmediate(r));const b=f.switch('b');const next=activation.chatChanged();gate.resolve();
 await assert.rejects(first,e=>e.code==='CHAT_CHANGED');await next;assert.deepEqual(a.chatMetadata,{});assert.equal(b.chatMetadata[NS].enabled,true);assert.equal(f.disk.size,1);
});

test('rapid A to B to A cancels the first A request and allows the new opening',async()=>{
 const f=fixture(),a=f.ctx,gate=deferred();let calls=0;const {activation}=activated(f,{createState:async scope=>{if(++calls===1)await gate.promise;return f.createState(scope);}});
 const first=activation.start();first.catch(()=>{});await new Promise(r=>setImmediate(r));f.switch('b');const second=activation.chatChanged();second.catch(()=>{});await new Promise(r=>setImmediate(r));f.switch(a);const third=activation.chatChanged();gate.resolve();
 await assert.rejects(first,e=>e.code==='CHAT_CHANGED');await second;await third;assert.equal(a.chatMetadata[NS].enabled,true);assert.equal(f.disk.size,2);
});

test('failed preset activation prevents all automatic chat writes',async()=>{
 const f=fixture(),activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>{throw Error('preset failure');},ensureBound:options=>f.controller.ensureBound(f.createState,options)});
 await assert.rejects(activation.start(),/preset failure/);assert.deepEqual(f.counts(),{reads:0,writes:0,catalogs:0});
});

test('explicit retry can recover a failed preset startup and binds only after success',async()=>{
 const f=fixture();let selects=0;const activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>{if(++selects===1)throw Error('first preset failure');return {active:true};},ensureBound:options=>f.controller.ensureBound(f.createState,options)});
 await assert.rejects(activation.start(),/first preset failure/);assert.equal(f.disk.size,0);await activation.retry();assert.equal(f.ctx.chatMetadata[NS].enabled,true);assert.equal(selects,2);
});

test('APP_READY with a selected but unloaded chat cannot create a binding or write metadata',async()=>{
 for(const groupId of [null,'group-a']){
  const f=fixture();f.ctx.groupId=groupId;
  const activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>({active:true}),ensureBound:options=>f.controller.ensureBound(f.createState,options),isChatReady:c=>typeof c.chatMetadata.integrity==='string'&&c.chatMetadata.integrity.length>0});
  assert.equal((await activation.start()).status,'chat-loading');
  await assert.rejects(activation.ready(),e=>e.code==='HOST_CHAT_LOADING');
  assert.deepEqual(f.counts(),{reads:0,writes:0,catalogs:0});assert.equal(f.savedMetadata.length,0);assert.deepEqual(f.ctx.chatMetadata,{});
  // The host may fill the same object, so readiness must not be cached merely
  // because its chat ID and metadata reference are unchanged.
  f.ctx.chatMetadata.integrity='loaded-host-identity';
  await activation.chatChanged();await activation.ready();
  assert.equal(f.ctx.chatMetadata[NS].enabled,true);assert.equal(f.counts().writes,1);
  assert.equal(f.ctx.chatMetadata.integrity,'loaded-host-identity');
 }
});

test('loading a different chat invalidates an in-flight opening before it can save to a placeholder',async()=>{
 const f=fixture(),gate=deferred();f.ctx.chatMetadata.integrity='chat-a';
 const activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>({active:true}),ensureBound:options=>f.controller.ensureBound(async scope=>{await gate.promise;return f.createState(scope);},options),isChatReady:c=>typeof c.chatMetadata.integrity==='string'&&c.chatMetadata.integrity.length>0});
 const pending=activation.start();pending.catch(()=>{});await new Promise(r=>setImmediate(r));const previous=f.ctx;f.switch('b');
 assert.equal((await activation.chatChanged()).status,'chat-loading');gate.resolve();await assert.rejects(pending,e=>e.code==='CHAT_CHANGED');
 assert.equal(f.savedMetadata.length,0);assert.equal(f.disk.size,0);assert.equal(previous.chatMetadata[NS],undefined);assert.deepEqual(f.ctx.chatMetadata,{});
});

test('actual Matrix host shares automatic and form initialization without resetting an existing owner',async()=>{
 const {readFileSync}=await import('node:fs');const {createMatrixHost}=await import('../engine/host.mjs');const {matrixPreset}=await import('../engine/config.mjs');
 const {PHONE_FORM_SCHEMAS}=await import('../engine/phone-form-contract.mjs');
 const f=fixture(),catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
 const host=createMatrixHost({getContext:()=>f.ctx,getSource:()=>matrixPreset(),loadCatalog:async()=>catalog,storage:f.storage,persistSettings:async()=>{},persistMetadata:async()=>{}});
 const first=await host.ensureBound();assert.equal(first.status,'created');const before=clone(f.disk.get(first.id));const database=await host.ensureDatabase();assert.equal(database.contextKey,chatKey(f.ctx));assert.deepEqual(Object.keys(database.state.schema).sort(),[...new Set([...catalog.tables,...PHONE_FORM_SCHEMAS].map(t=>t.id))].sort());assert.deepEqual(f.disk.get(first.id),before);
 f.disk.delete(first.id);await assert.rejects(host.ensureDatabase(),e=>e.code==='ENGINE_STATE_MISSING');assert.equal(f.disk.size,0);
});

test('an explicit retry refetches a failed catalog without creating or resetting data on failure',async()=>{
 const {createMatrixHost}=await import('../engine/host.mjs');const f=fixture();let loads=0;
 const host=createMatrixHost({getContext:()=>f.ctx,getSource:()=>({}),loadCatalog:async()=>{if(++loads===1)throw Error('catalog network failure');return {tables:[]};},storage:f.storage,persistSettings:async()=>{},persistMetadata:async()=>{}});
 const activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>({active:true}),ensureBound:options=>host.ensureBound(options)});
 await assert.rejects(activation.start(),/catalog network failure/);assert.equal(f.disk.size,0);assert.deepEqual(f.ctx.chatMetadata,{});await assert.rejects(activation.ready(),/catalog network failure/);assert.equal(loads,1);
 await activation.retry();assert.equal(loads,2);assert.equal(f.ctx.chatMetadata[NS].enabled,true);assert.equal(f.disk.size,1);
});
