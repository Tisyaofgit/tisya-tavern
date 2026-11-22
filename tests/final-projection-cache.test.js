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

test('persistent entries can contain derived materials only while cold restore reattaches the authoritative projection',async()=>{
 const disk=new Map(),storage={get:async key=>structuredClone(disk.get(key)),set:async(key,value)=>disk.set(key,structuredClone(value))};let computes=0,restores=0;
 const options={storage,persist:value=>({materials:value.materials}),restore:(derived,input)=>{restores++;return {bundle:input.bundle,materials:derived.materials};}};
 const first=createFinalProjectionCache(options),input={bundle:{revision:4,rows:[{id:'a'}]},messages:[{uid:'m',text:'正文'}]};
 assert.deepEqual(await first.project('chat',input,()=>{computes++;return {bundle:input.bundle,materials:{name:'阿青'},unpersisted:true};}),{bundle:input.bundle,materials:{name:'阿青'},unpersisted:true});await first.flush();
 const persisted=disk.get('derived:final-projection:chat');assert.deepEqual(persisted.value,{materials:{name:'阿青'}});
 const cold=createFinalProjectionCache(options);assert.deepEqual(await cold.project('chat',input,()=>{computes++;return {materials:{name:'错误'}};}),{bundle:input.bundle,materials:{name:'阿青'}});assert.equal(computes,1);assert.equal(restores,1);
 // Reordered object keys take the canonical path but still reuse the same value.
 assert.equal((await cold.project('chat',{messages:input.messages,bundle:input.bundle},()=>{computes++;})).materials.name,'阿青');assert.equal(computes,1);
});

test('identical in-flight projections share native hashing, storage and computation but return independent values',async()=>{
 const disk=new Map(),storage={get:async key=>structuredClone(disk.get(key)),set:async(key,value)=>disk.set(key,structuredClone(value))};let release,calls=0;
 const gate=new Promise(resolve=>release=resolve),cache=createFinalProjectionCache({storage}),input={bundle:{revision:8},messages:[{uid:'m',text:'正文'}]};
 const compute=()=>{calls++;return gate;},first=cache.project('chat',input,compute),second=cache.project('chat',structuredClone(input),compute),third=cache.project('chat',input,compute);
 assert.equal(cache.report().inflight,1);assert.equal(cache.report().coalesced,2);release({materials:{name:'阿青'}});const [a,b,c]=await Promise.all([first,second,third]);
 assert.equal(calls,1);assert.deepEqual(a,b);a.materials.name='调用方改动';assert.equal(b.materials.name,'阿青');assert.equal(c.materials.name,'阿青');assert.equal(cache.report().inflight,0);assert.equal(cache.report().misses,1);
});

test('a rejected shared projection does not poison the next authoritative attempt',async()=>{
 const storage={get:async()=>null,set:async()=>{}},cache=createFinalProjectionCache({storage});let calls=0;
 const input={revision:1},fail=()=>{calls++;throw Error('transient');};await Promise.all([assert.rejects(cache.project('chat',input,fail),/transient/),assert.rejects(cache.project('chat',input,fail),/transient/)]);
 assert.equal(calls,1);assert.equal(cache.report().inflight,0);assert.deepEqual(await cache.project('chat',input,()=>({value:'recovered'})),{value:'recovered'});
});

test('cache read and write failures degrade to authoritative recomputation without changing the result',async()=>{
 const errors=[],storage={get:async()=>{throw Error('read unavailable');},set:async()=>{throw Error('write unavailable');}};const cache=createFinalProjectionCache({storage,onError:error=>errors.push(error.message)});
 assert.deepEqual(await cache.project('chat',{revision:1},()=>({value:7})),{value:7});await cache.flush();assert.equal(errors.length,1);assert.match(errors[0],/实时计算/);
});

test('cold restore failures also recompute from the authoritative input',async()=>{
 const disk=new Map(),storage={get:async key=>structuredClone(disk.get(key)),set:async(key,value)=>disk.set(key,structuredClone(value))},errors=[];let computes=0;
 const first=createFinalProjectionCache({storage,persist:value=>value});await first.project('chat',{revision:1},()=>({value:'派生'}));await first.flush();
 const cold=createFinalProjectionCache({storage,restore:()=>{throw Error('restore unavailable');},onError:error=>errors.push(error.message)});assert.deepEqual(await cold.project('chat',{revision:1},()=>{computes++;return {value:'权威'};}),{value:'权威'});assert.equal(computes,1);assert.match(errors[0],/实时计算/);
});

test('message, branch, phone proof, player binding and review mode each invalidate cold projections',async()=>{
 const disk=new Map(),storage={get:async key=>structuredClone(disk.get(key)),set:async(key,value)=>disk.set(key,structuredClone(value))};let computes=0;
 const input={bundle:{revision:1},messages:[{uid:'m',text:'原文'}],scope:{branch:'main'},proof:{nativeMessages:[{mes:'原文'}],allowedOriginContextKeys:[]},playerBinding:{id:'主角'},manualReview:false};
 const variants=[input,{...input,messages:[{uid:'m',text:'改文'}]},{...input,scope:{branch:'other'}},{...input,proof:{...input.proof,nativeMessages:[{mes:'手机新快照'}]}},{...input,playerBinding:{id:'另一主角'}},{...input,manualReview:true}];
 for(const [index,value] of variants.entries()){const cache=createFinalProjectionCache({storage});assert.deepEqual(await cache.project('chat',value,()=>{computes++;return {index};}),{index});await cache.flush();}assert.equal(computes,variants.length);
});
