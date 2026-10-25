import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness} from './installer-harness.mjs';

for(const mvu of [false,true])test('native delete saves prose once and metadata separately when no MVU message effects are pending: '+mvu,async t=>{
 const f=await createInstallerHarness({mvu});t.after(()=>f.api.dispose());await f.api.getSession();
 const texts=f.ctx.chat.slice(0,-1).map(m=>m.mes);let full=0,small=0;const save=f.ctx.saveChat,meta=f.ctx.saveMetadata;
 f.ctx.saveChat=async()=>{full++;await save();};f.ctx.saveMetadata=async()=>{small++;await meta();};
 await f.api.deleteFloor({floor:f.ctx.chat.length-1});
 assert.deepEqual(f.ctx.chat.map(m=>m.mes),texts);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'applied');assert.equal(f.api.busy(),false);
 assert.equal(full,1);assert.equal(small,1);
});

test('metadata save failure leaves deletion pending, never retries as a full chat save',async t=>{
 const f=await createInstallerHarness({mvu:false});t.after(()=>f.api.dispose());await f.api.getSession();let full=0;const save=f.ctx.saveChat;f.ctx.saveChat=async()=>{full++;await save();};
 f.ctx.saveMetadata=async()=>{throw Error('metadata disk failed');};
 await assert.rejects(f.api.deleteFloor({floor:3}),/metadata disk failed/);assert.equal(full,1);assert.equal(f.ctx.chat.length,3);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'pending');assert.equal(f.api.busy(),false);
 await assert.rejects(f.api.deleteFloor({floor:2}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});assert.equal(f.ctx.chat.length,3);
});

test('middle-floor MVU restoration is fully saved before metadata completion',async t=>{
 const f=await createInstallerHarness({mvu:true});t.after(()=>f.api.dispose());await f.api.getSession();const before=f.ctx.chat.map(m=>m.mes);let full=0,small=0;const save=f.ctx.saveChat,meta=f.ctx.saveMetadata,initialWrites=f.nativeMvu.counts().writes;
 f.ctx.saveChat=async()=>{full++;await save();};f.ctx.saveMetadata=async()=>{small++;assert(f.nativeMvu.counts().writes>initialWrites);assert.equal(full,2);await meta();};
 await f.api.deleteFloor({floor:1});assert.deepEqual(f.ctx.chat.map(m=>m.mes),before.filter((_,i)=>i!==1));assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'applied');assert.equal(full,2,'the native MVU effect is persisted in the second full save');assert.equal(small,2,'completion and the changed retained suffix metadata are saved separately');
});

test('batched completion verifies source metadata as well as identity and restores unsaved working fields',async t=>{
 const f=await createInstallerHarness({mvu:false});t.after(()=>f.api.dispose());await f.api.getSession();const before=structuredClone(f.ctx.chatMetadata.tisya_v3_host),meta=f.ctx.saveMetadata;
 f.ctx.saveMetadata=async()=>{const next=f.ctx.chatMetadata.tisya_v3_host;f.ctx.chatMetadata.tisya_v3_host=structuredClone(before);try{await meta();}finally{f.ctx.chatMetadata.tisya_v3_host=next;}};
 await assert.rejects(f.api.deleteFloor({floor:3}),{code:'V3_METADATA_READBACK'});assert.equal(f.ctx.chat.length,3);assert.deepEqual(f.ctx.chatMetadata.tisya_v3_host,before);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'pending');assert.equal(f.api.busy(),false);
});
