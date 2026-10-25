import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness as fixture,sheet,xml} from './installer-harness.mjs';
import {parseSimpleSheet,formatSimpleSheet,projectRetained} from '../../../v3/host-runtime.mjs';

test('standalone forms archive the last assistant floor once without B, native chat output, or writer-only materials',async()=>{
 const f=await fixture({mvu:false,provider:({stage,messages})=>{
  assert.equal(stage,'a');const result=parseSimpleSheet(sheet(messages));
  for(const entry of result.archiveProposal)entry.proposal.changes.push({id:'new:handover',table:'events',expected:0,values:{名称:'工具箱交接',经过:'阿绫把工具箱交给林澈。'},access:{readers:['读者'],knowers:[]},evidence:[1]});
  return formatSimpleSheet(result);
 }});
 try{f.ctx.chat.pop();const raw=f.ctx.chat.map(m=>m.mes);f.api.setBeforeWriter(()=>assert.fail('forms do not need writer materials'));
  const result=await f.api.advance({requestId:'forms-one'});assert.equal(result.output,null);assert.equal(result.deliveryReceipt,null);assert.equal(f.requests.length,1);assert.deepEqual(f.ctx.chat.map(m=>m.mes),raw);
  const s=await f.api.getSession(),state=await s.storage.read(),view=projectRetained(state,s.getScope().activeSourceKeys);
  assert.equal(state.requests['forms-one'].execution,'forms');assert.equal(state.requests['forms-one'].status,'delivered');assert(view.rows.some(r=>r.values.名称==='工具箱交接'));assert.equal(view.commits.filter(c=>c.kind==='archive').length,1);
  const source=xml(f.requests[0].messages,'TISYA.DATA.SOURCE');assert.equal(source.archiveSources.length,1);
  const reused=await f.api.advance({requestId:'forms-one'});assert.equal(reused.reused,true);assert.equal(f.requests.length,1);assert.deepEqual(f.ctx.chat.map(m=>m.mes),raw);assert.equal(f.api.busy(),false);
 }finally{f.api.dispose();}
});

test('invalid standalone forms release busy without B or native chat mutation',async()=>{
 const f=await fixture({mvu:false,invalid:true});try{const raw=f.ctx.chat.map(m=>m.mes);await assert.rejects(f.api.advance());assert.equal(f.requests.length,1);assert.deepEqual(f.ctx.chat.map(m=>m.mes),raw);assert.equal(f.api.busy(),false);}finally{f.api.dispose();}
});

test('cancelling standalone forms discards a late A response',async()=>{
 let entered,release;const ready=new Promise(r=>entered=r),waiting=new Promise(r=>release=r);
 const f=await fixture({mvu:false,provider:async({stage,messages})=>{assert.equal(stage,'a');entered();await waiting;return sheet(messages);}});
 try{const raw=f.ctx.chat.map(m=>m.mes),job=f.api.advance();await ready;f.api.cancel();release();await assert.rejects(job,e=>e.code==='V3_CANCELLED');assert.equal(f.requests.length,1);assert.deepEqual(f.ctx.chat.map(m=>m.mes),raw);assert.equal(f.api.busy(),false);}finally{f.api.dispose();}
});

test('workspace advance merges internal ledger writes once per changed book and stays busy through physical completion',async()=>{
 let current=null,flushBusy=[];const f=await fixture({mvu:false,workspace:true,onWorkspaceFlush:()=>{if(current)flushBusy.push(current.api.busy());}});current=f;
 try{f.ctx.chat.pop();const raw=f.ctx.chat.map(m=>m.mes);f.workspaceWrites.length=0;
  const result=await f.api.advance({requestId:'workspace-forms'});assert.equal(result.output,null);assert.deepEqual(f.ctx.chat.map(m=>m.mes),raw);assert.equal(f.workspaceWrites.length,new Set(f.workspaceWrites).size);assert(f.workspaceWrites.length>0);assert(flushBusy.every(Boolean));assert.equal(f.api.busy(),false);assert.deepEqual(f.workspaceLayer.status().pendingBooks,[]);
  const state=await (await f.api.getSession()).storage.read();assert.equal(state.requests['workspace-forms'].status,'delivered');
 }finally{f.api.dispose();}
});
