import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness} from './installer-harness.mjs';

for(const [name,text] of [
 ['old reply with an unmatched control tag','</think><body>她走进房间。</body>'],
 ['ordinary old reply','她走进房间。'],
 ['incomplete V3 reply','<reply><think phase="before">未完成'],
])test('opening a session does not import '+name,async()=>{
 const h=await createInstallerHarness({mvu:false});h.ctx.chat[2].mes=text;
 try{
  const before=structuredClone(h.ctx.chat.map(m=>m.mes)),s=await h.api.getSession();
  assert.deepEqual(await s.system.originals.listMetadata({scope:s.scope}),[]);
  await s.sourceGuard(s.getScope());
  assert.deepEqual(await s.system.originals.listMetadata({scope:s.scope}),[]);
  assert.deepEqual(h.ctx.chat.map(m=>m.mes),before);assert.equal(h.requests.length,0);
 }finally{h.api.dispose();}
});
test('an empty bound chat opens without originals or model calls',async()=>{
 const h=await createInstallerHarness({mvu:false});h.ctx.chat.splice(0);
 try{const s=await h.api.getSession();assert.deepEqual(await s.system.originals.listMetadata({scope:s.scope}),[]);assert.equal(h.requests.length,0);}finally{h.api.dispose();}
});
test('switching an unstructured opening candidate does not import character setup',async()=>{
 const h=await createInstallerHarness({mvu:false}),m=h.ctx.chat[0];
 Object.assign(m,{swipes:['原卡开场','另一开场'],swipe_info:[{extra:{}},{extra:{}}],swipe_id:0});
 try{await h.api.selectSwipe({floor:0,swipeId:1});const s=await h.api.getSession();assert.equal(m.mes,'另一开场');assert.deepEqual(await s.system.originals.listMetadata({scope:s.scope}),[]);assert.equal(h.requests.length,0);}finally{h.api.dispose();}
});
test('ordinary generation retains an incomplete historical source as a local pending diagnostic',async()=>{
 const h=await createInstallerHarness({mvu:false});h.ctx.chat[2].mes='</think><body>她走进房间。</body>';
 try{await h.api.getSession();await h.intercept('normal');assert.equal(h.requests.length,2);assert.equal(h.errors.length,0);const diagnostic=h.ctx.chatMetadata.tisya_v3_host.sourceDiagnostics[0];assert.equal(diagnostic.code,'HISTORY_CONTROL_BLOCK');assert.match(diagnostic.message,/第 3 条/);assert.equal(diagnostic.floor,2);assert.equal(diagnostic.status,'pending');assert.equal(h.ctx.chat[2].mes,'</think><body>她走进房间。</body>');}finally{h.api.dispose();}
});
