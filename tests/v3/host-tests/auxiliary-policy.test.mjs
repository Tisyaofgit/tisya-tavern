import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,newBody,wrap,sheet,xml} from './installer-harness.mjs';
import {tableSettings} from '../../../tables/schema.js';

const copy=structuredClone;
test('automatic auxiliary defaults off for new and existing configurations without the independent key',()=>{
 assert.equal(tableSettings({}).auxiliaryEnabled,false);
 assert.equal(tableSettings({tables:{enabled:true,archive:true}}).auxiliaryEnabled,false);
 assert.equal(tableSettings({tables:{auxiliaryEnabled:true}}).auxiliaryEnabled,true);
});

test('disabled auxiliary sends only B, retains preceding conversation and leaves archival sources uncommitted',async t=>{
 const f=await createInstallerHarness({mvu:false,workspace:true,provider:({stage})=>{assert.equal(stage,'b');return wrap(newBody);}});t.after(()=>f.api.dispose());
 f.config.auxiliaryEnabled=false;const previous=copy(f.ctx.chat);
 await f.intercept('normal');assert.deepEqual(f.errors,[]);
 assert.equal(f.requests.length,1);assert(f.requests[0].messages.some(m=>m.role==='assistant'&&m.content===previous[2].mes));
 assert(f.requests[0].messages.some(m=>m.role==='user'&&m.content===previous[1].mes));
 const state=await (await f.api.getSession()).storage.read();
 assert.equal(state.commits.filter(c=>c.kind==='archive'&&!c.archiveSkipped).length,0);
 const record=Object.values(state.requests).find(r=>r.status==='delivered');
 assert.equal(record.result.snapshot.receipt.modelCalls,0);assert.equal(record.result.snapshot.receipt.preflightSkipped,'disabled');
 assert.equal(f.ctx.chat.length,previous.length+1);assert.equal(f.workspaceLayer.status().pendingBooks.length,0);
});

test('first turn skips A even when explicitly enabled; next user message archives accepted reply but never the new reply',async t=>{
 const seen=[];const f=await createInstallerHarness({mvu:false,workspace:true,provider:({stage,messages})=>{seen.push({stage,messages});return stage==='a'?sheet(messages):wrap(newBody);}});t.after(()=>f.api.dispose());
 f.ctx.chat.splice(1,2);assert.equal(f.ctx.chat.length,2);
 await f.intercept('normal');assert.deepEqual(f.errors,[]);assert.deepEqual(seen.map(x=>x.stage),['b']);
 const firstReply=f.ctx.chat.at(-1).mes;const firstState=await (await f.api.getSession()).storage.read();
 assert.equal(firstState.commits.filter(c=>c.kind==='archive').length,0);
 f.ctx.chat.push({is_user:true,mes:'满意，继续下一段。'});
 await f.intercept('normal');assert.deepEqual(f.errors,[]);assert.deepEqual(seen.map(x=>x.stage),['b','a','b']);
 const input=xml(seen[1].messages,'TISYA.DATA.SOURCE');assert.equal(input.archiveSources.length,1);
 assert(firstReply.includes(input.archiveSources[0].archiveSource.text));
 const state=await (await f.api.getSession()).storage.read();assert.equal(state.commits.filter(c=>c.kind==='archive'&&!c.archiveSkipped).length,1);
 assert.equal(f.ctx.chat.length,5);
});

test('SAFETY response stays failed, preparation flushes without B, and a new explicit send can proceed',async t=>{
 const f=await createInstallerHarness({mvu:false,workspace:true});t.after(()=>f.api.dispose());
 const original=f.native.fetch;let attempts=0;
 f.native.fetch=async(...args)=>{attempts++;if(attempts===1)return new Response(JSON.stringify({choices:[{message:{content:''},finish_reason:'SAFETY'}]}),{headers:{'content-type':'application/json'}});return original(...args);};
 await f.api.getSession();const before=copy(f.ctx.chat);await f.intercept('normal');
 assert.equal(f.errors.length,1);assert.match(f.errors[0].message,/SAFETY/);assert.equal(f.errors[0].workspacePreparationSaved,true);
 assert.equal(attempts,1);assert.deepEqual(f.ctx.chat,before);assert.deepEqual(f.workspaceLayer.status().pendingBooks,[]);assert.equal(f.workspaceLayer.status().blocked,false);
 const failed=Object.values(await (await f.api.getSession()).storage.read()).length;assert(failed>0);
 await f.intercept('normal');assert.equal(f.errors.length,1);assert.equal(attempts,3);assert.equal(f.ctx.chat.length,before.length+1);
});

test('manual forms remain explicitly callable with automatic auxiliary disabled',async t=>{
 const f=await createInstallerHarness({mvu:false,workspace:true});t.after(()=>f.api.dispose());f.config.auxiliaryEnabled=false;await f.api.getSession();const before=copy(f.ctx.chat);
 const result=await f.api.advance({requestId:'manual-with-auto-off'});assert.equal(result.output,null);assert.equal(f.requests.length,1);assert(xml(f.requests[0].messages,'TISYA.DATA.SOURCE'));assert.deepEqual(f.ctx.chat,before);
});
