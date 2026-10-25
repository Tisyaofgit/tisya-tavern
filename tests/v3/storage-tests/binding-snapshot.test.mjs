import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createNativeBookHost,BOOK_POINTER_KEY,GLOBAL_BOOK_KEY} from '../../../v3/book-host.mjs';
import {hostFixture} from './native-host-fixture.mjs';
import {createWorldbookTableStorage,createInitialState,tableRegistry} from '../../../v3/host-runtime.mjs';

async function fixture({durableOwner,workspace=false,getWorkspaceDependencies,refreshWorkspaceSources}={}){
 const f=hostFixture(),events=new EventEmitter(),hooks={world:null,settings:null};
 const eventTypes=Object.fromEntries(['CHAT_CHANGED','PERSONA_CHANGED','SETTINGS_UPDATED','CHARACTER_EDITED','WORLDINFO_UPDATED'].map(name=>[name,name]));
 Object.assign(f.getContext(),{eventSource:events,eventTypes});
 const originalFetch=f.target.fetch;f.target.fetch=async(url,options)=>{if(url==='/api/worldinfo/get'&&hooks.world)await hooks.world();if(url==='/api/settings/get'&&hooks.settings)await hooks.settings();return originalFetch(url,options);};
 let metadataReads=0;const originalHandle=f.target.__TAURITAVERN__.api.chat.current.handle;
 f.target.__TAURITAVERN__.api.chat.current.handle=()=>{const handle=originalHandle();return {...handle,metadata:{get:async()=>{metadataReads++;return handle.metadata.get();}}};};
 let pending=null;const journal={read:async()=>structuredClone(pending),write:async value=>{pending=structuredClone(value);}};
 const h=await createNativeBookHost({getWorkspaceDependencies,refreshWorkspaceSources,enableWorkspace:workspace,workspaceJournal:journal,target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,durableOwner,getHost:()=>({assertIdle(){},configurationChanged(){}})});
 const origin=await h.manager.create({kind:'origin',name:'Origin',operationId:'o'}),core=await h.manager.create({kind:'core',name:'Core',operationId:'c'});
 await h.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'g'});
 const archive=await h.manager.create({kind:'archive',name:'Archive',origin:{bookId:origin.id},core:{bookId:core.id},player:{id:'p1'},preferenceOwner:{kind:'player',id:'p1'},operationId:'a'});
 await h.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'s'});
 const runtime=await h.manager.readRuntime();
 const counts=()=>({settings:f.calls.filter(c=>c[0]==='fetch'&&c[1]==='/api/settings/get').length,metadata:metadataReads,writes:f.calls.filter(c=>c[0]==='saveWorldInfo').length});
 return {f,h,runtime,events,eventTypes,hooks,counts};
}
function entry(runtime,view){
 const wire=runtime.transport.createEntry(runtime.books.tables,view);
 Object.assign(wire,{content:'{}',disable:true,constant:false,key:[],keysecondary:[],probability:0});
 wire.extensions.tisyaTableLedger={schema:'tisya.ledger-storage/1',owner:structuredClone(runtime.owner),revision:1};return wire;
}
const delta=(after,before)=>Object.fromEntries(Object.keys(after).map(key=>[key,after[key]-before[key]]));

test('guarded native working reads reuse binding IO; one write renews once and later reads reuse that fresh receipt',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());const {runtime}=x;
 await runtime.transport.readFresh(runtime.books.tables);const before=x.counts();
 await runtime.transport.readFresh(runtime.books.originals);const view=await runtime.transport.readFresh(runtime.books.tables);
 assert.deepEqual(delta(x.counts(),before),{settings:0,metadata:0,writes:0});entry(runtime,view);
 await runtime.transport.save(runtime.books.tables,view);assert.deepEqual(delta(x.counts(),before),{settings:1,metadata:1,writes:1});
 const saved=x.counts();await runtime.transport.readFresh(runtime.books.tables);assert.deepEqual(x.counts(),saved);
});

test('a silent persisted pointer change is rejected at the write boundary before any worldbook write',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());const {runtime}=x;
 const view=await runtime.transport.readFresh(runtime.books.tables);entry(runtime,view);const before=x.counts();
 x.f.chatFiles.get('f1').metadata[BOOK_POINTER_KEY].bindingRevision++;
 await assert.rejects(runtime.transport.save(runtime.books.tables,view),{code:'RUNTIME_BINDING_CHANGED'});
 assert.equal(x.counts().writes,before.writes);assert.equal(x.counts().metadata,before.metadata+1);
});

test('each explicit checkpoint is fresh even when prior work reads reused a snapshot',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());await x.runtime.transport.readFresh(x.runtime.books.tables);const before=x.counts();
 await x.h.manager.checkpointWorkspace(x.runtime);await x.h.manager.checkpointWorkspace(x.runtime);
 assert.deepEqual(delta(x.counts(),before),{settings:2,metadata:2,writes:0});
 x.f.settings.extension_settings[GLOBAL_BOOK_KEY].revision++;
 await assert.rejects(x.h.manager.checkpointWorkspace(x.runtime),{code:'GLOBAL_CHANGED'});
});

test('settings events invalidate working snapshots; silent in-memory mutations also cannot reuse them',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());await x.runtime.transport.readFresh(x.runtime.books.tables);const before=x.counts();
 x.events.emit(x.eventTypes.SETTINGS_UPDATED);await x.runtime.transport.readFresh(x.runtime.books.tables);
 assert.equal(x.counts().settings,before.settings+1);
 const pointer=x.f.getContext().chatMetadata[BOOK_POINTER_KEY];pointer.bindingRevision++;
 await assert.rejects(x.runtime.transport.readFresh(x.runtime.books.tables),{code:'BINDING_SNAPSHOT_CHANGED'});
});

test('local binding change during asynchronous document read is refused by the captured final guard',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());await x.runtime.transport.readFresh(x.runtime.books.tables);
 let entered,release;const ready=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);x.hooks.world=async()=>{entered();await blocked;};
 const pending=x.runtime.transport.readFresh(x.runtime.books.tables);await ready;
 x.f.getContext().chatMetadata[BOOK_POINTER_KEY].bindingRevision++;release();
 await assert.rejects(pending,{code:'BINDING_SNAPSHOT_CHANGED'});
});

test('saved owner corruption and native chat switches cannot turn a prior snapshot into authority',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());await x.runtime.transport.readFresh(x.runtime.books.tables);
 x.f.chatFiles.get('f1').metadata.tisya_w24.branchId='foreign';
 await assert.rejects(x.h.manager.checkpointWorkspace(x.runtime),{code:'BINDING_SNAPSHOT_OWNER'});
 x.f.open('f2');await assert.rejects(x.runtime.transport.readFresh(x.runtime.books.tables),error=>['CONTEXT_CHANGED','HOST_OWNER'].includes(error.code));
});

test('card edits observed while a read is pending prevent returning the earlier snapshot',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());await x.runtime.transport.readFresh(x.runtime.books.tables);
 let entered,release;const ready=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);x.hooks.world=async()=>{entered();await blocked;};
 const pending=x.runtime.transport.readFresh(x.runtime.books.tables);await ready;x.events.emit(x.eventTypes.CHARACTER_EDITED);release();
 await assert.rejects(pending,{code:'BINDING_SNAPSHOT_CHANGED'});
});

test('unscoped workspace checkpoint follows a newly opened chat, while an old runtime remains rejected',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());await x.runtime.transport.readFresh(x.runtime.books.tables);
 x.f.open('f2');await x.h.prepare();assert.deepEqual(await x.h.manager.checkpointWorkspace(),{verified:true});
 await assert.rejects(x.h.manager.checkpointWorkspace(x.runtime),{code:'CONTEXT_CHANGED'});
});

test('account change rejects a cached runtime even when every native chat object and filename is unchanged',async t=>{
 let account='first';const x=await fixture({durableOwner:()=>({account})});t.after(()=>x.h.dispose());
 await x.runtime.transport.readFresh(x.runtime.books.tables);account='second';
 await assert.rejects(x.runtime.transport.readFresh(x.runtime.books.tables),{code:'CONTEXT_CHANGED'});
 await assert.rejects(x.h.manager.checkpointWorkspace(x.runtime),{code:'CONTEXT_CHANGED'});
});

for(const updateMemory of [false,true])test('physical workspace flush refuses a pointer change after staging and retains the pending journal; memory changed='+updateMemory,async t=>{
 const x=await fixture({workspace:true});t.after(()=>x.h.dispose());const {runtime}=x;
 const before=x.counts();await assert.rejects(x.h.manager.runWorkspace(async()=>{
  const view=await runtime.transport.readFresh(runtime.books.tables);entry(runtime,view);await runtime.transport.save(runtime.books.tables,view);
  x.f.chatFiles.get('f1').metadata[BOOK_POINTER_KEY].bindingRevision++;
  if(updateMemory)x.f.getContext().chatMetadata[BOOK_POINTER_KEY].bindingRevision++;
 }),error=>['WORKSPACE_OWNER','BINDING_SNAPSHOT_CHANGED'].includes(error.code));
 assert.equal(x.counts().writes,before.writes);assert.equal(x.h.manager.workspaceState().blocked,true);assert(x.h.manager.workspaceState().pendingBooks.length>0);
});

test('native workspace completes normal revision writes and a later legitimate binding switch',async t=>{
 const x=await fixture({workspace:true});t.after(()=>x.h.dispose());const {runtime}=x;
 const storage=createWorldbookTableStorage({transport:runtime.transport,bookId:runtime.books.tables,owner:runtime.owner,initialState:createInitialState({registry:tableRegistry})});
 await x.h.manager.runWorkspace(async()=>{const state=await storage.read();await storage.compareAndWrite(state.revision,{...state,revision:state.revision+1});});
 assert.deepEqual(x.h.manager.workspaceState().pendingBooks,[]);
 await x.h.manager.select({player:{id:'p2'},preferenceOwner:{kind:'player',id:'p2'},expectedBindingRevision:0,operationId:'switch'});
 const current=await x.h.manager.readRuntime();assert.equal(current.player.id,'p2');await x.h.manager.checkpointWorkspace(current);
 assert.deepEqual(x.h.manager.workspaceState().pendingBooks,[]);x.h.manager.clearWorkspaceMemory();assert.equal(x.h.manager.workspaceState().cachedBooks,0);
});

test('configuration hydrate may legitimately write after selecting a different global core',async t=>{
 const x=await fixture({workspace:true});t.after(()=>x.h.dispose());
 const [{createConfigurationBook},{createStore}]=await Promise.all([import('../../../v3/configuration-book.mjs'),import('../../../config/core.js')]);
 const store=createStore({getContext:x.f.getContext,persist:async()=>{throw Error('configuration must stay in worldbooks');}});
 const service=createConfigurationBook({books:x.h.manager,store,getContext:x.f.getContext,getPlayerId:x.f.getPlayerId});
 const first=await service.hydrate({initializeIfMissing:true}),next=await x.h.manager.create({kind:'core',name:'Other core',operationId:'other-core'}),binding=await x.h.manager.globalBinding();
 await x.h.manager.selectGlobalCore({coreId:next.id,expectedRevision:binding.pointer.revision,operationId:'global-next'});
 const second=await service.hydrate({initializeIfMissing:true});assert.notEqual(first.bookId,second.bookId);assert.equal(second.bookId,next.id);assert.equal(second.ready,true);assert.deepEqual(x.h.manager.workspaceState().pendingBooks,[]);
});

test('a completed child binding starts its own workspace and never changes the parent archive',async t=>{
 const x=await fixture({workspace:true});t.after(()=>x.h.dispose());const parent=x.runtime,parentData=structuredClone(x.f.worlds.get(parent.archive.physicalName));
 const source=x.f.chatFiles.get('f1'),child=x.f.chatFiles.get('f2');child.metadata=structuredClone(source.metadata);child.chat=structuredClone(source.chat);x.f.open('f2');const owner=await x.h.prepare();
 const runtime=await x.h.manager.fork({source:{archiveId:parent.archive.id,bindingRevision:parent.bindingRevision},targetOwner:owner,operationId:'child'});
 assert.notEqual(runtime.archive.id,parent.archive.id);const storage=createWorldbookTableStorage({transport:runtime.transport,bookId:runtime.books.tables,owner:runtime.owner,initialState:createInitialState({registry:tableRegistry})});
 await x.h.manager.runWorkspace(async()=>{const state=await storage.read();await storage.compareAndWrite(state.revision,{...state,revision:state.revision+1});});
 assert.deepEqual(x.f.worlds.get(parent.archive.physicalName),parentData);assert.deepEqual(x.h.manager.workspaceState().pendingBooks,[]);
});


test('two late settings notifications renew only the fresh binding reads while every scope field stays exact',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());let attempts=0;const before=x.counts();
 x.hooks.settings=async()=>{if(++attempts<=2)x.events.emit(x.eventTypes.SETTINGS_UPDATED);};
 await x.h.manager.checkpointWorkspace(x.runtime);
 assert.equal(attempts,3);assert.deepEqual(delta(x.counts(),before),{settings:3,metadata:3,writes:0});
 const settled=x.counts();await x.runtime.transport.readFresh(x.runtime.books.tables);assert.deepEqual(x.counts(),settled);
});

for(const changeMemory of [false,true])test('a real global pointer change is refused despite a coincident settings notice; memory changed='+changeMemory,async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());let attempts=0;const before=x.counts();
 x.hooks.settings=async()=>{if(++attempts===1){x.f.settings.extension_settings[GLOBAL_BOOK_KEY].revision++;if(changeMemory)x.f.getContext().extensionSettings[GLOBAL_BOOK_KEY].revision++;x.events.emit(x.eventTypes.SETTINGS_UPDATED);}};
 await assert.rejects(x.h.manager.checkpointWorkspace(x.runtime),error=>['GLOBAL_CHANGED','BINDING_SNAPSHOT_CHANGED'].includes(error.code));
 assert.equal(attempts,changeMemory?1:2);assert.equal(x.counts().writes,before.writes);
});

test('a hard context notification cannot be renewed even if its final local values match the earlier scope',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());let attempts=0;
 x.hooks.settings=async()=>{attempts++;x.events.emit(x.eventTypes.CHAT_CHANGED);};
 await assert.rejects(x.h.manager.checkpointWorkspace(x.runtime),{code:'BINDING_SNAPSHOT_CHANGED'});assert.equal(attempts,1);
});

test('continuous settings notifications stop at three read batches without retrying a write',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());let attempts=0;const before=x.counts();
 x.hooks.settings=async()=>{attempts++;x.events.emit(x.eventTypes.SETTINGS_UPDATED);};
 await assert.rejects(x.h.manager.checkpointWorkspace(x.runtime),error=>error.code==='BINDING_SNAPSHOT_CHANGED'&&error.details.changed.includes('event'));
 assert.equal(attempts,3);assert.deepEqual(delta(x.counts(),before),{settings:3,metadata:3,writes:0});
});

test('an already returned binding token still rejects a later settings notice',async t=>{
 const x=await fixture();t.after(()=>x.h.dispose());const snapshot=await x.h.callbacks.readBindingSnapshot({fresh:true});
 x.events.emit(x.eventTypes.SETTINGS_UPDATED);assert.throws(()=>snapshot.guard(),{code:'BINDING_SNAPSHOT_CHANGED'});
});


test('stale materialized source tokens reload before a new operation, without refreshing unrelated cached books',async t=>{
 let reloads=0;const x=await fixture({workspace:true,refreshWorkspaceSources:async()=>{reloads++;await x.h.manager.readRuntime();}});t.after(()=>x.h.dispose());
 assert.equal(await x.h.manager.refreshWorkspaceSources(x.runtime),false);
 x.events.emit(x.eventTypes.WORLDINFO_UPDATED,'unrelated-book');assert.equal(await x.h.manager.refreshWorkspaceSources(x.runtime),false);
 x.events.emit(x.eventTypes.WORLDINFO_UPDATED,x.runtime.origin.physicalName);assert.equal(await x.h.manager.refreshWorkspaceSources(x.runtime),true);assert.equal(reloads,1);
 const fresh=await x.h.manager.readRuntime();assert.equal(await x.h.manager.refreshWorkspaceSources(fresh),false);
});

test('silent external edits discovered at send remain stale until an explicit next-operation reload',async t=>{
 let reloads=0;const x=await fixture({workspace:true,refreshWorkspaceSources:async()=>{reloads++;await x.h.manager.readRuntime();}});t.after(()=>x.h.dispose());
 x.f.worlds.get(x.runtime.origin.physicalName).externalNote='edited elsewhere';
 await assert.rejects(x.h.manager.runWorkspace(()=>x.h.manager.checkpointWorkspace(x.runtime),{dependencies:x.runtime.workspaceDependencies}),{code:'WORKSPACE_CHANGED'});
 assert.equal(reloads,0);assert.equal(await x.h.manager.refreshWorkspaceSources(x.runtime),true);assert.equal(reloads,1);
 const fresh=await x.h.manager.readRuntime();await x.h.manager.runWorkspace(()=>x.h.manager.checkpointWorkspace(fresh),{dependencies:fresh.workspaceDependencies});
});

test('stale dependencies never rehydrate over an unfinished local journal',async t=>{
 let reloads=0;const x=await fixture({workspace:true,refreshWorkspaceSources:async()=>{reloads++;}});t.after(()=>x.h.dispose());
 await assert.rejects(x.h.manager.runWorkspace(async()=>{const view=await x.runtime.transport.readFresh(x.runtime.books.tables);entry(x.runtime,view);await x.runtime.transport.save(x.runtime.books.tables,view);throw Error('stop after staging');},{dependencies:x.runtime.workspaceDependencies}),/stop after staging/);
 x.events.emit(x.eventTypes.WORLDINFO_UPDATED,x.runtime.origin.physicalName);
 await assert.rejects(x.h.manager.refreshWorkspaceSources(x.runtime),{code:'WORKSPACE_SYNC_REQUIRED'});assert.equal(reloads,0);assert(x.h.manager.workspaceState().pendingBooks.length);
});
