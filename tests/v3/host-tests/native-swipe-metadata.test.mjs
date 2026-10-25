import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,wrap,newBody} from './installer-harness.mjs';

async function fixture(t){
 const f=await createInstallerHarness({mvu:false});t.after(()=>f.api.dispose());const message=f.ctx.chat[2];message.swipes.push(wrap(newBody));message.swipe_info.push({extra:{}});await f.api.getSession();return f;
}

test('selected swipe persists the native change with pending intent, then metadata completions',async t=>{
 const f=await fixture(t),s=await f.api.getSession(),identity=await s.system.identities.resolve(2),before=f.ctx.chat.map(m=>m.mes);let full=0,small=0;const save=f.ctx.saveChat,meta=f.ctx.saveMetadata;
 f.ctx.saveChat=async()=>{full++;assert.equal(f.ctx.chat[2].swipe_id,1);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'pending');await save();};f.ctx.saveMetadata=async()=>{small++;assert.equal(full,1);await meta();};
 await f.api.selectSwipe({floor:2,swipeId:1});assert.equal(full,1);assert.equal(small,2);assert.equal(f.ctx.chat[2].mes,wrap(newBody));assert.deepEqual(f.ctx.chat.filter((_,i)=>i!==2).map(m=>m.mes),before.filter((_,i)=>i!==2));assert.deepEqual(await s.system.identities.resolve(2),identity);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'applied');assert.equal(f.api.busy(),false);
});
test('failed selected-swipe completion stays pending and blocks another selection',async t=>{
 const f=await fixture(t);let full=0;const save=f.ctx.saveChat;f.ctx.saveChat=async()=>{full++;await save();};f.ctx.saveMetadata=async()=>{throw Error('metadata failed');};
 await assert.rejects(f.api.selectSwipe({floor:2,swipeId:1}),/metadata failed/);assert.equal(full,1);assert.equal(f.ctx.chat[2].swipe_id,1);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'pending');assert.equal(f.api.busy(),false);
 await assert.rejects(f.api.selectSwipe({floor:2,swipeId:0}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});assert.equal(f.ctx.chat[2].swipe_id,1);
});
test('selected-swipe completion checks source namespace with the identity readback',async t=>{
 const f=await fixture(t),before=structuredClone(f.ctx.chatMetadata.tisya_v3_host),meta=f.ctx.saveMetadata;
 f.ctx.saveMetadata=async()=>{const next=f.ctx.chatMetadata.tisya_v3_host;f.ctx.chatMetadata.tisya_v3_host=structuredClone(before);try{await meta();}finally{f.ctx.chatMetadata.tisya_v3_host=next;}};
 await assert.rejects(f.api.selectSwipe({floor:2,swipeId:1}),{code:'V3_METADATA_READBACK'});assert.deepEqual(f.ctx.chatMetadata.tisya_v3_host,before);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'pending');assert.equal(f.api.busy(),false);
});
