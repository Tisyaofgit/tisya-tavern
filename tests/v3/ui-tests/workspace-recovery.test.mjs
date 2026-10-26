import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {EventEmitter} from 'node:events';
import {mountWorkbench} from '../../../v3/workbench.mjs';
import {createCapabilities} from '../../../v3/capabilities.mjs';
import {createNativeBookHost,GLOBAL_BOOK_KEY} from '../../../v3/book-host.mjs';
import {recoverWorkspace} from '../../../v3/workspace-recovery.mjs';
import {hostFixture} from '../storage-tests/native-host-fixture.mjs';

async function fixture(t){
 const f=hostFixture(),events=new EventEmitter();Object.assign(f.getContext(),{eventSource:events,eventTypes:{WORLDINFO_UPDATED:'world-update'}});
 let pending=null;const journal={read:async()=>structuredClone(pending),write:async value=>{pending=structuredClone(value);}};
 const host=await createNativeBookHost({target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,enableWorkspace:true,workspaceJournal:journal,getHost:()=>({assertIdle(){}})});
 const core=await host.manager.create({kind:'core',name:'保留的原基点',operationId:'create-core'});await host.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'select-core'});
 const original=structuredClone(f.worlds.get(core.physicalName)),pointer=structuredClone(f.settings.extension_settings[GLOBAL_BOOK_KEY]);
 await assert.rejects(host.manager.runWorkspace(async()=>{const data=await host.callbacks.transport.readWorking(core.physicalName);data.recoveryProof='retained';await host.callbacks.transport.save(core.physicalName,data);throw Error('interrupted operation');}),/interrupted/);
 t.after(()=>host.dispose());return {f,host,core,original,pointer,get pending(){return pending;}};
}
test('blocked workspace inspection exposes the saved core without writing, clearing pending, or accessing model endpoints',async t=>{
 const x=await fixture(t),journal=structuredClone(x.pending),calls=x.f.calls.length;
 await assert.rejects(x.host.manager.globalBinding(),{code:'WORKSPACE_SYNC_REQUIRED'});
 const recovery=await x.host.manager.inspectWorkspaceRecovery();assert.equal(recovery.global.core.id,x.core.id);assert.equal(recovery.readOnly,true);assert.equal(recovery.pendingContext.chat,'f1');assert.deepEqual(x.pending,journal);assert.deepEqual(x.f.worlds.get(x.core.physicalName),x.original);assert.deepEqual(x.f.settings.extension_settings[GLOBAL_BOOK_KEY],x.pointer);
 assert(x.f.calls.slice(calls).every(c=>c[0]==='fetch'&&['/api/settings/get','/api/worldinfo/get'].includes(c[1])));
});
test('actual recovery button reloads the core and books page after local synchronization; no new book or model request',async t=>{
 const x=await fixture(t),win=new Window({url:'http://localhost/'});let hydrated=false;
 const configurationBook={read:()=>({ready:hydrated}),hydrate:async()=>{assert.equal(x.pending,null);hydrated=true;}};
 const books={...x.host.manager,syncWorkspace:()=>recoverWorkspace({books:x.host.manager,configurationBook})};
 const caps=createCapabilities({books,routes:{'configuration.status':()=>({ready:hydrated,domains:{},versions:[]})}}),view=mountWorkbench(win.document,win.document.body,{capabilities:caps,initialPage:'books',stylesheetURL:'http://localhost/workbench.css'});
 t.after(()=>{view.dispose();caps.dispose();win.happyDOM.abort();});await view.ready;
 assert.match(view.shadow.textContent,/保留的原基点/);assert.doesNotMatch(view.shadow.textContent,/尚未选择/);assert.equal([...view.shadow.querySelectorAll('button')].some(b=>b.textContent==='选择或建立全局基点'),false);
 const count=x.f.worlds.size;[...view.shadow.querySelectorAll('button')].find(b=>b.textContent==='同步保留的工作区').click();await view.settled();
 assert.equal(x.pending,null);assert.equal(hydrated,true);assert.equal(x.f.worlds.size,count);assert.equal(x.f.worlds.get(x.core.physicalName).recoveryProof,'retained');assert.match(view.shadow.textContent,/保留的原基点/);assert.doesNotMatch(view.shadow.textContent,/世界书有未完成同步|绑定读取受阻/);assert([...view.shadow.querySelectorAll('button')].some(b=>b.textContent==='切换全局基点'));assert.deepEqual(x.f.settings.extension_settings[GLOBAL_BOOK_KEY],x.pointer);
});
test('foreign chat recovery refuses writes and retains the owner and saved global core',async t=>{
 const x=await fixture(t),pending=structuredClone(x.pending);x.f.open('f2');const result=await x.host.manager.inspectWorkspaceRecovery();assert.equal(result.pendingContext.chat,'f1');assert.equal(result.global.core.id,x.core.id);
 await assert.rejects(recoverWorkspace({books:x.host.manager}),e=>e.code==='WORKSPACE_OWNER'&&e.message.includes('[WORKSPACE_OWNER]'));assert.deepEqual(x.pending,pending);assert.deepEqual(x.f.worlds.get(x.core.physicalName),x.original);
});
test('completed physical sync and a failed configuration reload have separate receipts',async()=>{
 let synced=false;const result=await recoverWorkspace({books:{workspaceState:()=>({pendingBooks:['core']}),syncWorkspace:async()=>{synced=true;return {saved:1};}},configurationBook:{read:()=>({ready:false}),hydrate:async()=>{throw Object.assign(Error('configuration read failed'),{code:'CONFIGURATION_READ'});}}});
 assert(synced);assert.equal(result.workspaceSynced,true);assert.equal(result.saved,1);assert.equal(result.configuration.error.code,'CONFIGURATION_READ');
});
test('saved workspace retains a configuration draft and never hydrates over it',async()=>{
 const draft={operationId:'original-intent'},state={ready:false,draft};let calls=0;
 const result=await recoverWorkspace({books:{syncWorkspace:async()=>({saved:1})},configurationBook:{read:()=>state,hydrate:async()=>{calls++;throw Error('must not replace draft');}}});assert.equal(calls,0);assert.equal(state.draft,draft);assert.equal(result.configuration.draftPending,true);assert.equal(result.workspaceSynced,true);
});
