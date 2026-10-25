import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFlow,sourceText,change,extraction} from './w34-flow-harness.mjs';
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const response=()=>extraction([change('new:shopkeeper','objects',{名称:'阿绫',类型:'character',描述:sourceText.card},sourceText.card)]);

test('actual application forwards streaming events, retains review result, and reports successful save to every consumer',async t=>{
 const entered=deferred(),finish=deferred();let options;const f=await setupFlow(t,{request:(task,input,ctx)=>{options=ctx.options;entered.resolve();return finish.promise;}}),packets=[];
 f.app.capabilities.subscribe(e=>{if(e.type==='design-progress')packets.push(e);});const source=await f.app.capabilities.action('design.sources'),session=await f.app.getSession(),before=await session.storage.read();
 const pending=f.app.capabilities.action('design.generate',{mode:'extract',sourceToken:source.token});
 assert.equal(f.app.designProgress.snapshot().status,'running');await entered.promise;assert.equal(typeof options.onProgress,'function');
 options.onProgress({stage:'waiting'});options.onProgress({stage:'receiving',characters:2505,text:'文'.repeat(2505)});
 const active=await f.app.capabilities.action('design.state');assert.equal(active.progress.phase,'receiving');assert.equal(active.progress.characters,2505);assert.equal(active.previewText.length,2000);assert.equal(active.draft,null);
 assert.equal(packets.at(-1).previewText.length,2000);assert.equal('previewText' in (await f.app.capabilities.getSnapshot()).designProgress,false);assert.deepEqual(await session.storage.read(),before);
 finish.resolve(response());const draft=await pending,state=await f.app.capabilities.action('design.state');assert.equal(state.progress.status,'awaiting-review');assert.equal(state.draft.id,draft.id);assert.deepEqual(await session.storage.read(),before);
 await f.app.capabilities.action('design.save',{draft});assert.equal(f.app.designProgress.snapshot().status,'saved');assert.equal((await f.app.capabilities.action('design.state')).draft,null);
 assert.ok(packets.some(e=>e.designProgress?.phase==='validating'));
});

test('actual application cancellation aborts its model signal and never exposes streamed text as a usable draft',async t=>{
 const entered=deferred();let options;const f=await setupFlow(t,{request:(task,input,ctx)=>{options=ctx.options;entered.resolve();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));}});
 const source=await f.app.capabilities.action('design.sources'),session=await f.app.getSession(),before=await session.storage.read(),pending=f.app.capabilities.action('design.generate',{mode:'extract',sourceToken:source.token});const rejected=assert.rejects(pending,{name:'AbortError'});
 await entered.promise;options.onProgress({stage:'receiving',characters:6,text:'未完成的文本'});await f.app.capabilities.action('design.cancel');await rejected;
 assert.equal(options.signal.aborted,true);const state=await f.app.capabilities.action('design.state');assert.equal(state.progress.status,'cancelled');assert.equal(state.draft,null);assert.deepEqual(await session.storage.read(),before);
});
