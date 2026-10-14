import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSwipeGestureControl} from '../swipe-gestures.js';

test('native gesture setting is the sole owner and explicit changes preserve all chat and other settings',async()=>{
 const context={powerUserSettings:{gestures:true,swipes:true,auto_swipe:false},chat:[{mes:'旧版本',swipes:['旧版本','新版本'],swipe_id:0}]};
 const original=structuredClone(context);let saves=0;
 const control=createSwipeGestureControl({getContext:()=>context,persist:async()=>{saves++;return true;}});
 assert.equal(control.snapshot().enabled,true);assert.equal(saves,0);
 await control.set(false,true);assert.equal(saves,1);assert.deepEqual(context,{...original,powerUserSettings:{...original.powerUserSettings,gestures:false}});
 await control.set(true,false);assert.deepEqual(context,original);
});

test('failed save restores the original native value and rejects instead of reporting success',async()=>{
 for(const fail of [async()=>false,async()=>{throw Error('network');}]){
  const context={powerUserSettings:{gestures:true}},control=createSwipeGestureControl({getContext:()=>context,persist:fail});
  await assert.rejects(control.set(false,true),/保存未完成/);assert.equal(context.powerUserSettings.gestures,true);assert.equal(control.snapshot().busy,false);
 }
});

test('unsupported, stale and concurrent changes do not overwrite another native edit',async()=>{
 const context={powerUserSettings:{gestures:true}};let resolve,saves=0;
 const control=createSwipeGestureControl({getContext:()=>context,persist:()=>{saves++;return new Promise(r=>resolve=r);}});
 await assert.rejects(control.set(false,false),/已变化/);assert.equal(saves,0);
 const pending=control.set(false,true);await assert.rejects(control.set(true,false),/正在保存/);
 context.powerUserSettings.gestures=true;resolve(true);await assert.rejects(pending,/保存期间发生变化/);assert.equal(context.powerUserSettings.gestures,true);
 delete context.powerUserSettings.gestures;assert.equal(control.snapshot().available,false);await assert.rejects(control.set(false,true),/未提供/);assert(!Object.hasOwn(context.powerUserSettings,'gestures'));
});
