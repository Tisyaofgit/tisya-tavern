import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloorIdentityManager} from '../../../v3/runtime-source/host/floor-identities.mjs';

async function fixture({corrupt=false,changeBranch=false}={}){
 const ctx={chat:[{mes:'keep'},{mes:'delete'}],chatMetadata:{other:{active:['old']}}};let disk={},branch='branch',metadataReads=0,stableReads=0,completion=false,validated=0;
 const ids=createFloorIdentityManager({getContext:()=>ctx,getStableChatId:async()=>{stableReads++;return branch;},saveChat:async()=>{disk=structuredClone(ctx.chatMetadata);},saveCompletion:async()=>{completion=true;disk=structuredClone(ctx.chatMetadata);if(corrupt)disk.other={active:['wrong']};if(changeBranch)branch='foreign';return {untrusted:'this is not a readback'};},readMetadata:async()=>{metadataReads++;return structuredClone(disk);},captureCompletionReadback:()=>{const expected=structuredClone(ctx.chatMetadata.other);return actual=>{validated++;assert.deepEqual(actual.other,expected);};}});
 await ids.sync();const identity=await ids.resolve(1);ctx.chat.pop();const event=await ids.recordInvalidation({reason:'delete',identity,fromFloor:1});ctx.chatMetadata.other={active:[]};metadataReads=stableReads=0;
 return {ctx,ids,event,counts:()=>({metadataReads,stableReads,completion,validated}),disk:()=>disk};
}

test('completion uses one fresh metadata read for identity and additional namespaces',async()=>{
 const f=await fixture();await f.ids.completeInvalidation({id:f.event.id,receipt:{activeSourceKeys:[],invalidatedSourceKeys:['old']}});
 assert.deepEqual(f.counts(),{metadataReads:1,stableReads:2,completion:true,validated:1});assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'applied');
});
test('additional namespace corruption rolls completion back to pending',async()=>{
 const f=await fixture({corrupt:true});await assert.rejects(f.ids.completeInvalidation({id:f.event.id,receipt:{activeSourceKeys:[],invalidatedSourceKeys:['old']}}));
 assert.equal(f.counts().metadataReads,1);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'pending');
});
test('completion still rechecks stable branch after the save',async()=>{
 const f=await fixture({changeBranch:true});await assert.rejects(f.ids.completeInvalidation({id:f.event.id,receipt:{activeSourceKeys:[],invalidatedSourceKeys:['old']}}),{code:'CHAT_CHANGED'});
 assert.equal(f.counts().stableReads,2);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'pending');
});
