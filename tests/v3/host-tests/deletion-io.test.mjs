import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloorIdentityManager} from '../../../v3/runtime-source/host/floor-identities.mjs';
import {createHostController} from '../../../v3/runtime-source/host/controller.mjs';

test('deletion reconciles tombstone and pending receipt in one durable save',async()=>{
 const ctx={chat:[{mes:'keep'},{mes:'delete'}],chatMetadata:{}};let disk={},saves=0,reads=0;
 const ids=createFloorIdentityManager({getContext:()=>ctx,getStableChatId:async()=>{reads++;return 'branch';},saveChat:async()=>{saves++;disk=structuredClone(ctx.chatMetadata);},readMetadata:async()=>structuredClone(disk)});
 await ids.sync();saves=reads=0;
 const controller=createHostController({identities:ids,run:()=>{},invalidate:async event=>{assert.equal(disk.tisya_w24.invalidations.at(-1).status,'pending');assert.ok(disk.tisya_w24.tombstones[event.identity.messageId]);return {activeSourceKeys:[],invalidatedSourceKeys:['old']};}});
 await controller.deleteFloor({floor:1,deleteNative:async()=>ctx.chat.pop()});
 assert.equal(saves,2);assert.equal(reads,5);assert.equal(disk.tisya_w24.invalidations.at(-1).status,'applied');assert.equal(ctx.chat.length,1);
 await assert.rejects(controller.deleteFloor({floor:0,deleteNative:async()=>{}}),{code:'DELETE_READBACK'});
 assert.equal(ctx.chat.length,1);assert.equal(saves,2);
});

test('metadata-only completion preserves durable pending intent and refuses failed readback',async()=>{
 const ctx={chat:[{mes:'keep'},{mes:'delete'}],chatMetadata:{unrelated:{value:0}}};let disk={},full=0,small=0,corrupt=false;
 const ids=createFloorIdentityManager({getContext:()=>ctx,getStableChatId:async()=>'b',saveChat:async()=>{full++;disk=structuredClone(ctx.chatMetadata);},saveCompletion:async()=>{small++;if(!corrupt)disk=structuredClone(ctx.chatMetadata);},readMetadata:async()=>structuredClone(disk)});
 await ids.sync();full=0;
 const controller=createHostController({identities:ids,run:()=>{},invalidate:async()=>{assert.equal(disk.tisya_w24.invalidations.at(-1).status,'pending');return {activeSourceKeys:[],invalidatedSourceKeys:['old']};}});
 corrupt=true;await assert.rejects(controller.deleteFloor({floor:1,deleteNative:async()=>ctx.chat.pop()}),{code:'IDENTITY_READBACK'});
 assert.equal(full,1);assert.equal(small,1);assert.equal(disk.tisya_w24.invalidations.at(-1).status,'pending');assert.equal(ctx.chatMetadata.tisya_w24.invalidations.at(-1).status,'pending');assert.deepEqual(disk.unrelated,{value:0});
 await assert.rejects(controller.deleteFloor({floor:0,deleteNative:async()=>ctx.chat.pop()}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});assert.equal(ctx.chat.length,1);
});
