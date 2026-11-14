import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneDatabaseStorage} from '../engine/phone-database.mjs';
import {fundedPhoneProfile} from './fixtures/phone-current.mjs';
import {currentPhoneHost,matrixMemoryStorage} from './fixtures/phone-host-current.mjs';

const source=readFileSync(new URL('../index.js',import.meta.url),'utf8');
const begin=source.indexOf('async function initializeLifeForCurrentSelection(');
const end=source.indexOf('\nfunction phoneDesktop(',begin);
assert.ok(begin>=0&&end>begin);
const initializeSource=source.slice(begin,end);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const changed=e=>['PHONE_CONTEXT_CHANGED','PHONE_SELECTION_CHANGED'].includes(e?.code)||/选择已变化/.test(e?.message??'');
const seed={accounts:{me:{name:'合成测试本人',role:'self'}},documents:[]};

function entryFixture({pauseAt,existing=false,profile=null,error=null}={}){
 let selection='person-a',c={key:'story-a',chat:[],chatMetadata:{}},writes=0;
 const begun=deferred(),gate=deferred();
 const pause=async stage=>{if(pauseAt===stage){begun.resolve();await gate.promise;}};
 const life=existing?{id:'existing',balance:123}:null;
 const service={refresh:async()=>pause('refresh'),readLife:()=>life,initLife:async(_profile,{assertCurrent}={})=>{assertCurrent?.();writes++;return {id:'created'};}};
 const deps={context:()=>c,phoneChatKey:value=>value.key,phoneSelectionKey:()=>selection,phoneBindingSelection:()=>({character:{database:true,entityId:selection}}),storyRoles:()=>({phoneProfile:async()=>{await pause('profile');if(error)throw error;return profile??{database:true,worldId:'w',entityId:'person-a'};}}),matrixDatabase:{read:async()=>{await pause('read');return {state:{}};}},readPhoneDatabaseProfile:()=>existing?{life}:{database:true,worldId:'w',entityId:'person-a'}};
 const initialize=Function(...Object.keys(deps),initializeSource+'\nreturn initializeLifeForCurrentSelection;')(...Object.values(deps));
 return {run:()=>initialize(service),begun:begun.promise,release:()=>gate.resolve(),writes:()=>writes,life,change(kind){if(kind==='selection')selection='person-b';else if(kind==='reload')c={...c,chatMetadata:{}};else c={key:'story-b',chat:[],chatMetadata:{}};}};
}

test('unchanged selection initializes once through the current entry',async()=>{
 const f=entryFixture();assert.deepEqual(await f.run(),{id:'created'});assert.equal(f.writes(),1);
});

for(const stage of ['profile','refresh','read'])for(const change of ['selection','reload','chat']){
 test(`initialization rejects ${change} while awaiting ${stage} without writing`,async()=>{
  const f=entryFixture({pauseAt:stage}),pending=f.run();await f.begun;f.change(change);f.release();await assert.rejects(pending,changed);assert.equal(f.writes(),0);
 });
}

test('a late existing-life projection is not returned for the newly selected person',async()=>{
 const f=entryFixture({pauseAt:'read',existing:true}),pending=f.run();await f.begun;f.change('selection');f.release();await assert.rejects(pending,changed);assert.deepEqual(f.life,{id:'existing',balance:123});assert.equal(f.writes(),0);
});

test('profile transport failure retains its original error and makes no writes',async()=>{
 const error=Error('synthetic profile transport failure'),f=entryFixture({error});await assert.rejects(f.run(),e=>e===error);assert.equal(f.writes(),0);
});

async function serviceFixture(){
 const profile=fundedPhoneProfile(),context={chatId:'selection-fixture',characterId:0,chat:[],chatMetadata:{},extensionSettings:{},saveChat:async()=>true};
 let writes=0,hook=null,current=true;
 const disk=matrixMemoryStorage({onWrite:async()=>{writes++;}}),db=await currentPhoneHost({context,storage:disk,profile});
 const bridge=db.host.createPhoneDatabaseBridge();
 const storage=createPhoneDatabaseStorage({contextKey:(await db.snapshot()).contextKey,database:{...bridge,read:async()=>{const value=await bridge.read();const held=hook;hook=null;if(held){held.begun.resolve();await held.gate.promise;}return value;}}});
 // Use the actual native context-key contract, without recreating its format.
 const key=(await db.snapshot()).contextKey;
 const service=createPhoneService({seed,contextKey:key,storage});await service.init();
 return {service,profile,db,context,disk,storage,key,writes:()=>writes,assertCurrent(){if(!current)throw Object.assign(Error('synthetic selection changed'),{code:'PHONE_SELECTION_CHANGED'});},change:()=>{current=false;},pauseRead(){const held={begun:deferred(),gate:deferred()};hook=held;return {begun:held.begun.promise,release:()=>held.gate.resolve()};}};
}

test('a queued initialization rechecks selection after the previous phone job completes',async()=>{
 const f=await serviceFixture(),before=await f.db.snapshot(),writes=f.writes(),hold=f.pauseRead();
 const first=f.service.refresh();await hold.begun;
 const pending=f.service.initLife(f.profile,{assertCurrent:f.assertCurrent});f.change();hold.release();await first;await assert.rejects(pending,changed);
 assert.equal(f.writes(),writes);assert.deepEqual(await f.db.snapshot(),before);assert.equal(f.service.readLife(),null);
});

test('selection changes during the authoritative queue refresh cannot initialize the phone',async()=>{
 const f=await serviceFixture(),before=await f.db.snapshot(),writes=f.writes(),hold=f.pauseRead();
 const pending=f.service.initLife(f.profile,{assertCurrent:f.assertCurrent});await hold.begun;f.change();hold.release();await assert.rejects(pending,changed);
 assert.equal(f.writes(),writes);assert.deepEqual(await f.db.snapshot(),before);
});

test('the database save reread checks selection before submitting a transaction',async()=>{
 const f=await serviceFixture(),archive=JSON.parse(f.service.export()),before=await f.db.snapshot(),writes=f.writes(),hold=f.pauseRead();
 archive.revision++;
 const pending=f.storage.save(archive,{expectedRevision:archive.revision-1,assertCurrent:f.assertCurrent});await hold.begun;f.change();hold.release();await assert.rejects(pending,changed);
 assert.equal(f.writes(),writes);assert.deepEqual(await f.db.snapshot(),before);
});

test('the Matrix commit queue rejects an expired caller without changing the stored revision',async()=>{
 const f=await serviceFixture(),before=await f.db.snapshot(),writes=f.writes();f.change();
 await assert.rejects(f.db.host.createPhoneDatabaseBridge().commit({operationId:'expired-init',contextKey:f.key,expectedRevision:before.revision,changes:[]},{assertCurrent:f.assertCurrent}),changed);
 assert.equal(f.writes(),writes);assert.deepEqual(await f.db.snapshot(),before);
});

test('a caller expires while waiting behind another Matrix transaction',async()=>{
 const f=await serviceFixture(),before=await f.db.snapshot(),writes=f.writes(),begun=deferred(),gate=deferred(),commit=f.disk.commit;
 f.disk.commit=async(...args)=>{begun.resolve();await gate.promise;return commit(...args);};
 const input={operationId:'first-in-queue',contextKey:f.key,expectedRevision:before.revision,changes:[]};
 const first=f.db.host.commitDatabase(input);await begun.promise;
 const pending=f.db.host.createPhoneDatabaseBridge().commit({...input,operationId:'stale-in-queue',expectedRevision:before.revision+1},{assertCurrent:f.assertCurrent});
 f.change();gate.resolve();await first;await assert.rejects(pending,changed);
 const after=await f.db.snapshot();assert.equal(f.writes(),writes+1);assert.equal(after.revision,before.revision+1);assert.equal(after.state.runtime.receipts['stale-in-queue'],undefined);
});

test('a selection change during the Matrix source read stops the actual storage commit',async()=>{
 const f=await serviceFixture(),before=await f.db.snapshot(),writes=f.writes(),begun=deferred(),gate=deferred(),get=f.disk.get;let held=false;
 f.disk.get=async(...args)=>{const value=await get(...args);if(!held){held=true;begun.resolve();await gate.promise;}return value;};
 const pending=f.db.host.createPhoneDatabaseBridge().commit({operationId:'stale-during-read',contextKey:f.key,expectedRevision:before.revision,changes:[]},{assertCurrent:f.assertCurrent});
 await begun.promise;f.change();gate.resolve();await assert.rejects(pending,changed);
 assert.equal(f.writes(),writes);assert.deepEqual(await f.db.snapshot(),before);
});

test('a completed storage write remains recorded when its caller expires before the receipt',async()=>{
 const f=await serviceFixture(),before=await f.db.snapshot(),begun=deferred(),gate=deferred(),commit=f.disk.commit;
 f.disk.commit=async(...args)=>{const result=await commit(...args);begun.resolve();await gate.promise;return result;};
 const pending=f.db.host.createPhoneDatabaseBridge().commit({operationId:'accepted-before-switch',contextKey:f.key,expectedRevision:before.revision,changes:[]},{assertCurrent:f.assertCurrent});
 await begun.promise;f.change();gate.resolve();
 await assert.rejects(pending,e=>changed(e)&&e.databaseCommitReceipt?.operationId==='accepted-before-switch'&&e.databaseCommitReceipt?.revision===before.revision+1);
 const after=await f.db.snapshot();assert.equal(after.revision,before.revision+1);assert.ok(after.state.runtime.receipts['accepted-before-switch']);
});

test('existing life data survives rejected initialization and a cold host reopen',async()=>{
 const f=await serviceFixture();await f.service.initLife(f.profile);await f.service.dispatchLife({id:'saved-transfer',type:'wallet.transfer',to:'person-b',amount:50},{expectedRevision:f.service.getState().revision});
 const before=await f.db.snapshot(),writes=f.writes();f.change();await assert.rejects(f.service.initLife(f.profile,{assertCurrent:f.assertCurrent}),changed);
 const cold=await currentPhoneHost({context:f.context,storage:f.disk});const reopened=createPhoneService({seed,contextKey:f.key,storage:cold.phoneStorage});await reopened.init();
 assert.equal(reopened.readLife().state.wallet.accounts[0].balance,99950);assert.equal(f.writes(),writes);assert.deepEqual(await cold.snapshot(),before);
});
