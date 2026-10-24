import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness} from './installer-harness.mjs';

test('concurrent session readers wait for the same initialization persistence before allowing another mutation',async()=>{
 const f=await createInstallerHarness({mvu:false});let entered,release,settled=false;
 const waiting=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve),save=f.ctx.saveChat;
 f.ctx.saveChat=async()=>{if(f.ctx.chatMetadata.tisya_v3_host?.active?.length){entered();await blocked;}return save();};
 let first,second;
 try{
  first=f.api.initialize();await waiting;
  second=f.api.getSession().then(result=>{settled=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(settled,false,'a second UI reader must not expose a session before its first durable source-index save');
  assert.equal(f.api.busy(),true);assert.equal(f.api.inspect().busy,true,'observable state must include initialization');
  assert.throws(()=>f.api.assertIdle(),{code:'V3_BUSY'});
  release();await first;await second;assert.equal(f.api.busy(),false);assert.equal(f.api.inspect().busy,false);assert.doesNotThrow(()=>f.api.assertIdle());
 }finally{release();await Promise.allSettled([first,second].filter(Boolean));f.api.dispose();}
});

test('initialization failure reaches every waiting reader, releases busy, and a retry durably restores the source index',async()=>{
 const f=await createInstallerHarness({mvu:false});let entered,release,firstSave=true;
 const waiting=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve),save=f.ctx.saveChat;
 f.ctx.saveChat=async()=>{if(firstSave&&f.ctx.chatMetadata.tisya_v3_host?.active?.length){firstSave=false;entered();await blocked;throw Error('initial source save failed');}return save();};
 let first,second;
 try{
  first=f.api.initialize();await waiting;second=f.api.getSession();const outcomes=Promise.allSettled([first,second]);release();
  for(const result of await outcomes){assert.equal(result.status,'rejected');assert.match(result.reason.message,/initial source save failed/);}
  assert.equal(f.api.busy(),false);assert.doesNotThrow(()=>f.api.assertIdle());
  await f.api.getSession();assert.equal(f.api.busy(),false);
  const saved=await f.target.__TAURITAVERN__.api.chat.current.handle().metadata.get();
  assert.deepEqual(saved.tisya_v3_host?.active,f.ctx.chatMetadata.tisya_v3_host.active,'retry must not mistake an unsaved in-memory source index for a durable one');
 }finally{release();await Promise.allSettled([first,second].filter(Boolean));f.api.dispose();}
});
