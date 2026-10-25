import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,wrap,newBody} from './installer-harness.mjs';

for(const type of ['normal','swipe'])test(`native status anchor appended during ${type} save survives output registration and readback`,async()=>{
 const f=await createInstallerHarness();
 if(type==='swipe')f.ctx.chat.pop();
 f.ctx.eventSource.on(f.ctx.eventTypes.MESSAGE_RECEIVED,()=>{f.ctx.chat.at(-1).mes+='\n\n<StatusPlaceHolderImpl/>';});
 try{
  await f.intercept(type);
  assert.equal(f.errors.length,0,f.errors[0]?.stack);
  assert.equal(f.ctx.chat.at(-1).mes,wrap(newBody)+'\n\n<StatusPlaceHolderImpl/>');
  const s=await f.api.getSession(),state=await s.storage.read();
  assert.equal(Object.values(state.requests).at(-1).status,'delivered');
  assert.equal(f.api.busy(),false);
 }finally{f.api.dispose();}
});
for(const suffix of ['\nother output','\n<StatusPlaceHolderImpl/>\n<UpdateVariable>changed</UpdateVariable>'])test('native status exception rejects foreign suffix '+suffix,async()=>{
 const f=await createInstallerHarness();
 f.ctx.eventSource.on(f.ctx.eventTypes.MESSAGE_RECEIVED,()=>{f.ctx.chat.at(-1).mes+=suffix;});
 try{await f.intercept('normal');assert.equal(f.errors[0]?.code,'V3_CHAT_MUTATED');assert.equal(f.api.busy(),false);}finally{f.api.dispose();}
});
