import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,wrap} from './installer-harness.mjs';

test('candidate deletion refuses existing pending intent before the native mutation',async t=>{
 const f=await createInstallerHarness({mvu:false});t.after(()=>f.api.dispose());f.ctx.chat.pop();const s=await f.api.getSession(),identity=await s.system.identities.resolve(2);
 await s.system.identities.recordInvalidation({reason:'swipe',identity,fromFloor:2});const before=structuredClone(f.ctx.chat);let deletions=0;f.script.deleteSwipe=async()=>{deletions++;};
 await assert.rejects(f.api.deleteCandidate({floor:2,swipeId:0}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});assert.equal(deletions,0);assert.deepEqual(structuredClone(f.ctx.chat),before);
});

test('candidate deletion uses one required payload save and metadata completion, without a duplicate full save',async t=>{
 const f=await createInstallerHarness({mvu:false});t.after(()=>f.api.dispose());f.ctx.chat.pop();const m=f.ctx.chat[2];m.swipes.push(wrap('1 保留下来的候选。'));m.swipe_info.push({extra:{}});await f.api.getSession();
 let full=0,metadata=0;const save=f.ctx.saveChat,saveMetadata=f.ctx.saveMetadata;f.ctx.saveChat=async()=>{full++;return save();};f.ctx.saveMetadata=async()=>{metadata++;return saveMetadata();};
 await f.api.deleteCandidate({floor:2,swipeId:1});assert.equal(m.swipes.length,1);assert.equal(full,1);assert(metadata>=1);assert(f.ctx.chatMetadata.tisya_w24.invalidations.every(event=>event.status==='applied'));
});
