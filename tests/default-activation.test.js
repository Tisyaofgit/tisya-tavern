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

test('fresh binding still rejects a read-back whose complete canonical content differs',async()=>{
 const f=fixture(),get=f.storage.get;let verificationReads=0;
 f.storage.get=async id=>{const saved=await get(id);if(saved&&f.ctx.chatMetadata[NS]?.binding_pending){verificationReads++;saved.journal.baseline_messages[0].text='合成篡改';}return saved;};
 await assert.rejects(f.controller.ensureBound(f.createState),e=>e.code==='ENGINE_SAVE_UNCONFIRMED');
 assert.equal(verificationReads,1);assert.equal(f.ctx.chatMetadata[NS].enabled,false);assert(f.ctx.chatMetadata[NS].binding_pending);
 assert.equal(f.disk.get(f.ctx.chatMetadata[NS].chat_uid).journal.baseline_messages[0].text,'原始开场');
});

test('chat switch during asynchronous read-back hashing fails closed before enabling',async()=>{
 const f=fixture(),a=f.ctx,entered=deferred(),gate=deferred(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),original=globalThis.crypto;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{async digest(algorithm,raw){entered.resolve();await gate.promise;return original.subtle.digest(algorithm,raw);}}}});
 try{
  const pending=f.controller.ensureBound(f.createState);pending.catch(()=>{});await entered.promise;const b=f.switch('b');gate.resolve();
  await assert.rejects(pending,e=>e.code==='CHAT_CHANGED');assert.equal(a.chatMetadata[NS].enabled,false);assert(a.chatMetadata[NS].binding_pending);assert.deepEqual(b.chatMetadata,{});
 }finally{gate.resolve();if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
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

test('generation after chat-only activation rejects manual disable before an archive upgrade reopens it',async()=>{
 const f=fixture(),calls=[],activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>({active:true}),ensureBound:options=>{calls.push(options.syncArchive);return f.controller.ensureBound(f.createState,options);}});
 await activation.chatChanged({syncArchive:false});f.ctx.chatMetadata[NS].enabled=false;const before={counts:f.counts(),metadata:f.savedMetadata.length};
 await assert.rejects(activation.ready(),e=>e.code==='ENGINE_DISABLED');assert.equal(f.ctx.chatMetadata[NS].enabled,false);assert.deepEqual(calls,[false]);assert.deepEqual(f.counts(),before.counts);assert.equal(f.savedMetadata.length,before.metadata);
});

test('a chat-only archive deferral cannot satisfy a later independent archive check',async()=>{
 const f=fixture(),calls=[],activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>({active:true}),ensureBound:options=>{calls.push(options.syncArchive);return f.controller.ensureBound(f.createState,options);}});
 await activation.chatChanged({syncArchive:false});assert.deepEqual(calls,[false]);await activation.ready();assert.deepEqual(calls,[false,true]);await activation.chatChanged({syncArchive:false});assert.deepEqual(calls,[false,true]);
});

test('a delayed first-chat failure does not poison later chat activation',async()=>{
 const f=fixture(),a=f.ctx,gate=deferred();let calls=0;const {activation}=activated(f,{createState:async scope=>{if(++calls===1)await gate.promise;return f.createState(scope);}});
 const first=activation.start();first.catch(()=>{});await new Promise(r=>setImmediate(r));const b=f.switch('b');const next=activation.chatChanged();gate.resolve();
 await assert.rejects(first,e=>e.code==='CHAT_CHANGED');await next;assert.deepEqual(a.chatMetadata,{});assert.equal(b.chatMetadata[NS].enabled,true);assert.equal(f.disk.size,1);
});

test('rapid A to B to A cancels the first A request and allows the new opening',async()=>{
 const f=fixture(),a=f.ctx,gate=deferred();let calls=0;const {activation}=activated(f,{createState:async scope=>{if(++calls===1)await gate.promise;return f.createState(scope);}});
 const first=activation.start();first.catch(()=>{});await new Promise(r=>setImmediate(r));f.switch('b');const second=activation.chatChanged();second.catch(()=>{});await new Promise(r=>setImmediate(r));f.switch(a);const third=activation.chatChanged();gate.resolve();
 await assert.rejects(first,e=>e.code==='CHAT_CHANGED');
 // B may finish before the rapid reopen or be fenced by it during asynchronous
 // verification; neither timing may poison the final opening of A.
 await second.catch(error=>assert.equal(error.code,'CHAT_CHANGED'));await third;assert.equal(a.chatMetadata[NS].enabled,true);assert.equal(f.disk.size,2);
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
 const {extendMatrixCatalog}=await import('../engine/materials.mjs');
 const f=fixture(),catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
 const host=createMatrixHost({getContext:()=>f.ctx,getSource:()=>matrixPreset(),loadCatalog:async()=>catalog,storage:f.storage,persistSettings:async()=>{},persistMetadata:async()=>{}});
 const first=await host.ensureBound();assert.equal(first.status,'created');const before=clone(f.disk.get(first.id));const database=await host.ensureDatabase();await host.flushProjectionCache();assert.equal(database.contextKey,chatKey(f.ctx));assert.deepEqual(Object.keys(database.state.schema).sort(),[...new Set([...extendMatrixCatalog(catalog).tables,...PHONE_FORM_SCHEMAS].map(t=>t.id))].sort());assert.deepEqual(f.disk.get(first.id),before);
 f.disk.delete(first.id);await assert.rejects(host.ensureDatabase(),e=>e.code==='ENGINE_STATE_MISSING');assert.equal(f.disk.has(first.id),false);assert([...f.disk.keys()].every(key=>key.startsWith('derived:')),'missing authoritative state must not be replaced by a derived cache');
});

test('an explicit retry refetches a failed catalog without creating or resetting data on failure',async()=>{
 const {createMatrixHost}=await import('../engine/host.mjs');const f=fixture();let loads=0;
 const host=createMatrixHost({getContext:()=>f.ctx,getSource:()=>({}),loadCatalog:async()=>{if(++loads===1)throw Error('catalog network failure');return {tables:[]};},storage:f.storage,persistSettings:async()=>{},persistMetadata:async()=>{}});
 const activation=createDefaultActivation({getContext:()=>f.ctx,activatePreset:async()=>({active:true}),ensureBound:options=>host.ensureBound(options)});
 await assert.rejects(activation.start(),/catalog network failure/);assert.equal(f.disk.size,0);assert.deepEqual(f.ctx.chatMetadata,{});await assert.rejects(activation.ready(),/catalog network failure/);assert.equal(loads,1);
 await activation.retry();assert.equal(loads,2);assert.equal(f.ctx.chatMetadata[NS].enabled,true);assert.equal(f.disk.size,1);
});

test('a renamed chat keeps its engine identity and bundle without any storage write',async()=>{
 const f=fixture();let serial=100;
 f.controller.constructor; // fixture controller has no chatExists; build one that sees the old name gone
 const controller=new Controller({getContext:()=>f.ctx,storage:f.storage,uid:()=>`uid-${++serial}`,chatExists:async()=>false,request(){assert.fail('rename must not settle');}});
 f.switch(f.ctx);
 const first=await controller.ensureBound(f.createState),state=clone(f.disk.get(first.id)),writesAfterBind=f.counts().writes;
 const renamed=f.context('b');renamed.chat=clone(f.ctx.chat);renamed.chatMetadata=clone(f.ctx.chatMetadata);f.switch(renamed);
 const result=await controller.ensureBound(f.createState);
 assert.equal(result.status,'existing');assert.equal(result.id,first.id);assert.equal(renamed.chatMetadata[NS].owner_chat_key,chatKey(renamed));assert.equal(renamed.chatMetadata[NS].enabled,true);
 assert.deepEqual(renamed.chatMetadata[NS].origin_chat_keys,[chatKey(f.context('a'))]);
 assert.equal(f.counts().writes,writesAfterBind,'rename must not rewrite the bundle');assert.deepEqual(f.disk.get(first.id),state);
});

test('a copied chat whose source survives still forks under a fresh identity',async()=>{
 const f=fixture();let serial=100;
 const controller=new Controller({getContext:()=>f.ctx,storage:f.storage,uid:()=>`uid-${++serial}`,chatExists:async()=>true,request(){assert.fail('fork must not settle');}});
 const first=await controller.ensureBound(f.createState),parentState=clone(f.disk.get(first.id));
 const copy=f.context('copy');copy.chat=clone(f.ctx.chat);copy.chatMetadata=clone(f.ctx.chatMetadata);f.switch(copy);
 const result=await controller.ensureBound(f.createState);
 assert.equal(result.status,'forked');assert.notEqual(result.id,first.id);assert.equal(copy.chatMetadata[NS].binding_pending,undefined);
 assert.deepEqual(f.disk.get(first.id),parentState);assert.deepEqual(f.disk.get(result.id),parentState);
});

test('a failed existence check falls back to the safe fork path',async()=>{
 const f=fixture();let serial=100;
 const controller=new Controller({getContext:()=>f.ctx,storage:f.storage,uid:()=>`uid-${++serial}`,chatExists:async()=>{throw Error('chat list offline');},request(){assert.fail('fork must not settle');}});
 const first=await controller.ensureBound(f.createState);
 const copy=f.context('copy');copy.chat=clone(f.ctx.chat);copy.chatMetadata=clone(f.ctx.chatMetadata);f.switch(copy);
 const result=await controller.ensureBound(f.createState);
 assert.equal(result.status,'forked');assert.notEqual(result.id,first.id);assert.deepEqual(f.disk.get(result.id),f.disk.get(first.id));
});

test('a pending fork under a renamed owner still pays for a real fork',async()=>{
 const f=fixture();let serial=100;
 const controller=new Controller({getContext:()=>f.ctx,storage:f.storage,uid:()=>`uid-${++serial}`,chatExists:async()=>false,request(){assert.fail('fork must not settle');}});
 const first=await controller.ensureBound(f.createState),parentState=clone(f.disk.get(first.id));
 const copy=f.context('copy');copy.chat=clone(f.ctx.chat);copy.chatMetadata=clone(f.ctx.chatMetadata);
 // Simulate an interrupted earlier fork: pending record present, bundle not yet committed for the fork identity.
 copy.chatMetadata[NS]={...copy.chatMetadata[NS],chat_uid:'uid-900',enabled:false,binding_pending:{version:1,kind:'fork',source_chat_uid:first.id}};
 f.switch(copy);
 const result=await controller.ensureBound(f.createState);
 assert.equal(result.status,'forked');assert.equal(result.id,'uid-900');assert.equal(copy.chatMetadata[NS].enabled,true);assert.deepEqual(f.disk.get('uid-900'),parentState);
});
