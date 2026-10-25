/** Reproducible simulated-I/O measurement of the production deletion chain.
 * No network, APK, real host storage, or model invocation occurs here.
 * TISYA_PERF_ROOT may point to a retained source baseline for comparison.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';

const root=path.resolve(process.env.TISYA_PERF_ROOT??fileURLToPath(new URL('..',import.meta.url)));
const fromRoot=relative=>import(pathToFileURL(path.join(root,relative)).href);
const [{createSourceChain},{createFloorIdentityManager},{createHostController},{createWorldbookOriginalAdapter},{createOriginalStore,sha256Utf16}]=await Promise.all([
 fromRoot('v3/host-sources.mjs'),fromRoot('v3/runtime-source/host/floor-identities.mjs'),fromRoot('v3/runtime-source/host/controller.mjs'),fromRoot('v3/runtime-source/host/worldbook-adapter.mjs'),fromRoot('v3/runtime-source/originals/original-store.mjs')
]);
const copy=structuredClone,delayMs=Number(process.env.TISYA_PERF_DELAY_MS??5),counts=()=>({worldRead:0,worldSave:0,stableId:0,chatSave:0,metadataRead:0});
const sizes=(process.env.TISYA_PERF_SIZES??'3,24').split(',').map(Number),results=[];
for(const assistantFloors of sizes){
 let measuring=false,counters=counts(),saved={},id=0,nativeRemovedAt=null;
 const docs=new Map(),context={chat:[{mes:'原卡开场',is_user:false}],chatMetadata:{}};
 for(let i=0;i<assistantFloors;i++)context.chat.push({mes:`用户第${i+1}条。`,is_user:true},{mes:`历史第${i+1}条：银钥已交还。`,is_user:false});
 async function io(kind){if(!measuring)return;counters[kind]++;if(delayMs>0)await new Promise(resolve=>setTimeout(resolve,delayMs));}
 const transport={
  async readFresh(name){await io('worldRead');return copy(docs.get(name)??null);},
  async save(name,data){await io('worldSave');docs.set(name,copy(data));},
  createEntry(_name,data){const uid=Math.max(-1,...Object.keys(data.entries).map(Number))+1;const wire={uid,extensions:{}};data.entries[uid]=wire;return wire;}
 };
 const saveChat=async()=>{await io('chatSave');saved=copy(context.chatMetadata);},readMetadata=async()=>{await io('metadataRead');return copy(saved);};
 const persist=async()=>{await saveChat();assert.deepEqual(await readMetadata(),context.chatMetadata);};
 const identities=createFloorIdentityManager({getContext:()=>context,getStableChatId:async()=>{await io('stableId');return 'branch';},saveChat,readMetadata,uuid:()=>String(++id)});
 const originals=createOriginalStore({adapter:createWorldbookOriginalAdapter({transport}),bookId:'originals'});
 await identities.sync();
 for(let floor=2;floor<context.chat.length;floor+=2){const identity=await identities.resolve(floor),content=context.chat[floor].mes;await originals.putHistory({identity,content,expectedVersion:0,operationId:'seed:'+floor,sourceRevision:'host:'+await sha256Utf16(content),displayFloor:floor});}
 const system={identities,originals};
 const chain=createSourceChain({getContext:()=>context,system,getNative:()=>null,configuration:()=>({}),guard:()=>{},persist});
 await chain.refresh();
 measuring=true;counters=counts();const refreshStart=performance.now();await chain.refresh();const refresh={elapsedMs:Math.round(performance.now()-refreshStart),...counters};
 counters=counts();const floor=context.chat.length-1,target=await identities.resolve(floor),entryId=await originals.entryIdFor(target);
 // The production host resolves its target inside controller.deleteFloor; the
 // previous target lookup is excluded from the measured deletion interval.
 counters=counts();const start=performance.now();
 const controller=createHostController({identities,run:async()=>{},invalidate:event=>chain.invalidate(event)});
 await controller.deleteFloor({floor,deleteNative:async()=>{context.chat.splice(floor,1);nativeRemovedAt=performance.now();await persist();}});
 await chain.refresh();
 const finished=performance.now(),deletion={elapsedMs:Math.round(finished-start),beforeNativeRemovalMs:Math.round(nativeRemovedAt-start),afterNativeRemovalMs:Math.round(finished-nativeRemovedAt),...counters};
 measuring=false;
 const deleted=await originals.metadata({entryId,scope:target,includeDeleted:true});assert.equal(deleted.deleted,true);
 assert.equal(context.chat.length,assistantFloors*2);assert(context.chatMetadata.tisya_w24.invalidations.every(event=>event.status==='applied'));
 assert.equal(chain.current().filter(row=>row.role==='assistant').length,assistantFloors-1);
 results.push({assistantFloors,refresh,deletion,verified:{deletedOriginalTombstone:true,invalidationApplied:true,retainedSources:true}});
}
console.log(JSON.stringify({schema:'tisya.delete-path-measurement/1',sourceRoot:root,simulatedIoDelayMs:delayMs,boundary:'Production source chain/controller/identity/original-store/adapter; simulated transport and chat persistence. No real device timings.',results},null,2));
