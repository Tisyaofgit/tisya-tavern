import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloorIdentityManager} from '../../../v3/runtime-source/host/floor-identities.mjs';
import {createHostController} from '../../../v3/runtime-source/host/controller.mjs';

test('swipe reuses settled identity before mutation but verifies the native owner afterwards',async()=>{
 const ctx={chat:[{mes:'candidate A'}],chatMetadata:{}};let disk={},branch='branch',reads=0,invalidations=0;
 const ids=createFloorIdentityManager({getContext:()=>ctx,getStableChatId:async()=>{reads++;return branch;},saveChat:async()=>{disk=structuredClone(ctx.chatMetadata);},readMetadata:async()=>structuredClone(disk)});
 await ids.sync();reads=0;
 const controller=createHostController({identities:ids,run:()=>{},invalidate:async()=>{invalidations++;return {activeSourceKeys:[],invalidatedSourceKeys:[]};}});
 await assert.rejects(controller.switchSwipe({floor:0,swipeId:1,switchNative:async()=>{assert.equal(reads,1);ctx.chat[0].mes='candidate B';branch='other';}}),{code:'FLOOR_CHANGED'});
 assert.ok(reads>1);assert.equal(invalidations,0);
});

test('swipe rejects missing floors before invoking the native mutation',async()=>{
 const ctx={chat:[{mes:'candidate A'}],chatMetadata:{}};let disk={},mutations=0;
 const ids=createFloorIdentityManager({getContext:()=>ctx,getStableChatId:async()=>'branch',saveChat:async()=>{disk=structuredClone(ctx.chatMetadata);},readMetadata:async()=>structuredClone(disk)});
 await ids.sync();
 const controller=createHostController({identities:ids,run:()=>{},invalidate:async()=>{throw Error('must not invalidate')}});
 await assert.rejects(controller.switchSwipe({floor:3,swipeId:1,switchNative:async()=>mutations++}),{code:'FLOOR_NOT_FOUND'});
 assert.equal(mutations,0);
});
