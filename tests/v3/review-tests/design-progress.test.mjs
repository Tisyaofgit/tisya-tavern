import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesignProgress} from '../../../v3/design-progress.mjs';
import {createCapabilities} from '../../../v3/capabilities.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('design status starts synchronously, reports received output without percent, and retains only a complete review draft',async()=>{
 let now=1000,report;const wait=deferred(),events=[],p=createDesignProgress({clock:()=>now});p.subscribe(e=>events.push(e));
 const run=p.run({kind:'extract'},emit=>{report=emit;return wait.promise;});
 assert.equal(p.snapshot().status,'running');assert.equal(p.snapshot().phase,'sources');assert.equal(p.state().draft,null);
 now=2000;report({stage:'receiving',characters:2400,text:'文'.repeat(2400),reasoning:'never accept'});
 assert.equal(p.snapshot().characters,2400);assert.equal(p.snapshot().updatedAt,2000);assert.equal(p.state().previewText.length,2000);
 assert.equal('text' in p.snapshot(),false);assert.equal('reasoning' in p.snapshot(),false);assert.equal('percent' in p.snapshot(),false);
 const draft={id:'draft',mode:'extract',changes:[{id:'new:one'}]};wait.resolve(draft);assert.deepEqual(await run,draft);
 assert.equal(p.snapshot().status,'awaiting-review');assert.deepEqual(p.state().draft,draft);
 report({stage:'receiving',characters:9999,text:'late'});assert.equal(p.snapshot().characters,2400);
 assert.equal(events.at(-1).progress.status,'awaiting-review');p.discard();assert.deepEqual(p.state(),{progress:null,draft:null,previewText:''});
});

test('task state rejects concurrent work, preserves failed save draft, and clears it only after saved receipt',async()=>{
 const p=createDesignProgress(),wait=deferred(),draft={id:'draft',mode:'opening',changes:[{id:'user'}]};
 const first=p.run({kind:'opening'},()=>wait.promise);await assert.rejects(p.run({kind:'history'},async()=>null),/正在处理/);
 assert.throws(()=>p.discard(),/先停止/);wait.resolve(draft);await first;
 await assert.rejects(p.run({kind:'opening',operation:'save',reviewDraft:draft},async()=>{throw Error('save receipt lost');}),/receipt lost/);
 assert.equal(p.snapshot().status,'failed');assert.deepEqual(p.state().draft,draft);assert.equal(p.snapshot().cancellable,false);
 await p.run({kind:'opening',operation:'save',reviewDraft:draft},async()=>({status:'saved'}));
 assert.equal(p.snapshot().status,'saved');assert.equal(p.state().draft,null);
});

test('cancel, changed binding and disposed callbacks never publish a stale draft to a new owner',async()=>{
 let binding={chatId:'one',activeSourceKeys:[],currentSourceKey:null},report;const p=createDesignProgress({getBinding:()=>binding}),wait=deferred();
 const pending=p.run({kind:'history'},emit=>{report=emit;return wait.promise;});binding={chatId:'one',activeSourceKeys:['u1'],currentSourceKey:'u1'};assert.equal(p.snapshot().status,'running');
 binding={chatId:'two'};report({stage:'receiving',text:'private',characters:7});assert.deepEqual(p.state(),{progress:null,draft:null,previewText:''});
 binding={chatId:'one'};wait.reject(new DOMException('Stopped','AbortError'));await assert.rejects(pending,{name:'AbortError'});assert.equal(p.snapshot().status,'cancelled');
 const late=deferred(),events=[];p.subscribe(e=>events.push(e));const second=p.run({kind:'extract'},emit=>{report=emit;return late.promise;});p.dispose();const count=events.length;
 report({stage:'receiving',characters:500,text:'late'});late.resolve({id:'late-draft'});await second;assert.equal(events.length,count);assert.equal(p.state().draft,null);
});

test('design stream notifications never reread worldbooks or archive state per chunk',async()=>{
 const p=createDesignProgress(),wait=deferred();let report,reads=0;const caps=createCapabilities({designProgress:p,archives:{designState:()=>p.state(),discardDesign:()=>p.discard()},books:{binding:async()=>{reads++;return null;}}}),events=[];
 caps.subscribe(e=>events.push(e));await caps.getSnapshot();await Promise.resolve();const before=reads;
 const pending=p.run({kind:'genesis'},emit=>{report=emit;return wait.promise;});for(let i=1;i<=20;i++)report({stage:'receiving',characters:i,text:'x'.repeat(i)});
 assert.equal(reads,before);assert.equal(events.filter(e=>e.type==='design-progress').length,21);assert.equal(events.at(-1).previewText,'x'.repeat(20));
 const state=await caps.action('design.state');assert.equal(state.progress.characters,20);assert.equal(reads,before);
 wait.resolve({id:'draft',mode:'genesis',changes:[]});await pending;caps.dispose();p.dispose();
});
