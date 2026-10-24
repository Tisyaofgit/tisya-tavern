import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness as fixture,wrap,newBody} from '../host-tests/installer-harness.mjs';
import {projectRetained} from '../../../v3/host-runtime.mjs';

test('observing a newly appended user floor refreshes the source chain without reading a missing old record',async()=>{
 const f=await fixture({mvu:false});try{
  await f.intercept('normal');f.ctx.chat.push({mes:'下一步先检查门锁。',is_user:true,extra:{}});
  await f.ctx.eventSource.emit(f.ctx.eventTypes.MESSAGE_UPDATED,5);
  assert.equal(f.errors.length,0,f.errors[0]?.stack);
  const s=await f.api.getSession();assert(s.getScope().activeSourceKeys.some(k=>k.startsWith('user:')));
  await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.ctx.chat.length,7);
 }finally{f.api.dispose();}
});

test('an awaited beforeWriter hook cannot overwrite a changed live user input',async()=>{
 const f=await fixture();try{
  f.api.setBeforeWriter(async()=>{await Promise.resolve();f.ctx.chat[3].mes='先停一下，换个计划。';});
  await f.intercept('normal');assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);
  assert(['V3_CHAT_MUTATED','V3_USER_CHANGED'].includes(f.errors[0]?.code));
  assert.equal(f.ctx.chat[3].mes,'先停一下，换个计划。');
 }finally{f.api.dispose();}
});

test('an awaited beforeWriter hook cannot narrate from an externally edited assistant source',async()=>{
 const f=await fixture();try{
  f.api.setBeforeWriter(async()=>{await Promise.resolve();f.ctx.chat[2].mes=wrap(newBody);});
  await f.intercept('normal');assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);
  assert.equal(f.errors[0]?.code,'V3_CHAT_MUTATED');
 }finally{f.api.dispose();}
});

test('external source edit restores the predecessor native snapshot and invalidates the old settlement projection',async()=>{
 const f=await fixture();try{
  await f.intercept('normal');const s=await f.api.getSession(),state=await s.storage.read();
  const before=projectRetained(state,s.getScope().activeSourceKeys);assert.equal(before.rows.find(r=>r.table==='native_cells').values.值.energy,3);
  const counts=f.nativeMvu.counts();f.ctx.chat[2].mes=f.ctx.chat[2].mes.replace('用一格电量打开门锁','用备用钥匙打开门锁');
  await f.ctx.eventSource.emit(f.ctx.eventTypes.MESSAGE_EDITED,2);
  assert.equal(f.errors.length,0,f.errors[0]?.stack);
  assert.equal(f.nativeMvu.runtime.getMvuData({type:'message',message_id:2}).stat_data.resources.energy,4);
  assert.equal(f.nativeMvu.counts().parses,counts.parses);
  const after=projectRetained(await s.storage.read(),s.getScope().activeSourceKeys);assert.equal(after.rows.find(r=>r.table==='native_cells').values.值.energy,4);
 }finally{f.api.dispose();}
});
