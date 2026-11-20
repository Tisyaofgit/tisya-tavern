import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinalProjectionCache} from '../engine/final-projection-cache.mjs';

test('final projections survive a cold cache instance only for identical authoritative input',async()=>{
 const disk=new Map(),storage={get:async key=>structuredClone(disk.get(key)),set:async(key,value)=>disk.set(key,structuredClone(value))};let calls=0;
 const input={bundle:{revision:4,rows:[{id:'a'}]},messages:[{uid:'m',text:'正文'}],scope:{branch:'main'}};
 const first=createFinalProjectionCache({storage});const value=await first.project('chat',input,()=>{calls++;return {materials:{name:'阿青'},bundle:{revision:4}};});value.materials.name='改动';await first.flush();
 const cold=createFinalProjectionCache({storage});const restored=await cold.project('chat',structuredClone(input),()=>{calls++;return {materials:{name:'错误'}};});assert.equal(restored.materials.name,'阿青');assert.equal(calls,1);restored.materials.name='再次改动';assert.equal((await cold.project('chat',input,()=>{})).materials.name,'阿青');
 await cold.project('chat',{...input,messages:[{uid:'m',text:'新正文'}]},()=>{calls++;return {materials:{name:'新值'}};});assert.equal(calls,2);
 await cold.clear('chat');await createFinalProjectionCache({storage}).project('chat',input,()=>{calls++;return {materials:{name:'重算'}};});assert.equal(calls,3);
});

test('cache read and write failures degrade to authoritative recomputation without changing the result',async()=>{
 const errors=[],storage={get:async()=>{throw Error('read unavailable');},set:async()=>{throw Error('write unavailable');}};const cache=createFinalProjectionCache({storage,onError:error=>errors.push(error.message)});
 assert.deepEqual(await cache.project('chat',{revision:1},()=>({value:7})),{value:7});await cache.flush();assert.equal(errors.length,1);assert.match(errors[0],/实时计算/);
});
