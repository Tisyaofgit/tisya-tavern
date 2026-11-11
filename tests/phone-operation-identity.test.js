import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {chatKey} from '../engine/controller.mjs';
import {createPhoneDatabaseStorage} from '../engine/phone-database.mjs';
import {createPhoneService} from '../phone-core.mjs';
import {digest} from '../engine/common.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
async function fixture({chat=[]}={}){
 const disk=new Map(),ctx={chatId:'operation-replay-neutral',characterId:1,chat,extensionSettings:{},chatMetadata:{},saveChat:async()=>true};
 let writes=0;
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,value)=>{writes++;disk.set(id,structuredClone(value));},commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;writes++;disk.set(id,structuredClone(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistMetadata:async()=>true,persistSettings:async()=>true});
 await host.ensureDatabase();return {host,ctx,disk,key:chatKey(ctx),writes:()=>writes};
}
test('semantically identical concurrent initialization replays despite object key insertion order',async()=>{
 const f=await fixture(),requests=[];let release;
 const barrier=new Promise(r=>{release=r;});
 const bridge={read:()=>f.host.readDatabase(),commit:async request=>{requests.push(structuredClone(request));if(requests.length===2)release();await barrier;return f.host.commitDatabase(request);}};
 const a=createPhoneService({contextKey:f.key,seed:{accounts:{me:{name:'本人',role:'self'},other:{name:'同伴',role:'npc'}},documents:[]},storage:createPhoneDatabaseStorage({database:bridge,contextKey:f.key})});
 const b=createPhoneService({contextKey:f.key,seed:{accounts:{other:{role:'npc',name:'同伴'},me:{role:'self',name:'本人'}},documents:[]},storage:createPhoneDatabaseStorage({database:bridge,contextKey:f.key})});
 const results=await Promise.allSettled([a.init(),b.init()]);
 const trace={sameOperationId:requests[0].operationId===requests[1].operationId,sameRequestPayload:digest(requests[0])===digest(requests[1]),results:results.map(x=>x.status==='fulfilled'?{status:x.status}:{status:x.status,code:x.reason.code,message:x.reason.message}),committedOperations:Object.keys((await f.host.controller.current()).database_operations??{}).length};
 console.log(JSON.stringify(trace));
 assert.deepEqual(results.map(x=>x.status),['fulfilled','fulfilled']);
 assert.equal(requests[0].operationId,requests[1].operationId);
 assert.equal(digest(requests[0]),digest(requests[1]));
 assert.equal(trace.committedOperations,1);
});


test('phone transaction identity covers the exact encoded schema and lifecycle payload',async()=>{
 const f=await fixture(),base=(await f.host.readDatabase()).state,requests=[];
 const {createPhoneState,exportPhone}=await import('../phone-core.mjs');
 const archive=JSON.parse(exportPhone(createPhoneState({accounts:{me:{name:'本人',role:'self'}},documents:[]},f.key)));
 for(const label of ['旧定义','新定义']){
  const state=structuredClone(base);state.schema.X_PHONE_SESSION={id:'X_PHONE_SESSION',fields:[{key:'row_uuid',type:'ID'},{key:'format',type:'TEXT',label}]};state.tables.X_PHONE_SESSION={};
  const adapter=createPhoneDatabaseStorage({contextKey:f.key,database:{read:async()=>({state,revision:1,contextKey:f.key}),commit:async request=>{requests.push(request);return {state,revision:2,contextKey:f.key};}}});
  assert.equal(await adapter.load(),null);await adapter.save(archive,{expectedRevision:null});
 }
 const payload=r=>({contextKey:r.contextKey,changes:r.changes,schema:r.schema,source:r.source});
 assert.notEqual(digest(payload(requests[0])),digest(payload(requests[1])));
 assert.notEqual(requests[0].operationId,requests[1].operationId,'different encoded requests must not reuse the same operation ID');
});

test('detached initialization remains protected after history sync and schema metadata edits',async()=>{
 const f=await fixture({chat:[{is_user:false,mes:'中性开场白'}]}),seed={accounts:{me:{name:'本人',role:'self'}},documents:[]};
 const make=()=>createPhoneService({contextKey:f.key,seed,storage:createPhoneDatabaseStorage({contextKey:f.key,database:f.host.createPhoneDatabaseBridge()})});
 await make().init();const original=await f.host.controller.current();
 f.ctx.chat[0].mes='中性开场白修改';assert.equal((await f.host.readDatabase()).phoneDetached,true);
 await f.host.sync();await f.host.mutate(e=>{e.data.schema.X_PHONE_SESSION.fields.find(f=>f.key==='format').label='Schema label now authored';});
 assert.equal((await f.host.readDatabase()).phoneDetached,true,'sync must not turn a detached phone into an uninitialized phone');
 const before=await f.host.controller.current(),writes=f.writes();
 await assert.rejects(make().init(),e=>e.code==='PHONE_DATABASE_DETACHED');
 assert.equal(f.writes(),writes);assert.deepEqual(await f.host.controller.current(),before);
 assert.deepEqual(before.database_operations,original.database_operations);
 f.ctx.chat[0].mes='中性开场白';await f.host.sync();assert.equal((await f.host.readDatabase()).phoneDetached,false);
 const restored=make();await restored.init();assert.equal(restored.getState().revision,0);assert.equal(Object.keys((await f.host.controller.current()).database_operations).length,1);
});

test('fresh legacy bundle without phone patches remains eligible for first initialization',async()=>{
 const f=await fixture();assert.equal((await f.host.readDatabase()).phoneDetached,false);
 const service=createPhoneService({contextKey:f.key,seed:{accounts:{me:{name:'本人',role:'self'}},documents:[]},storage:createPhoneDatabaseStorage({contextKey:f.key,database:f.host.createPhoneDatabaseBridge()})});
 await service.init();const before=f.writes();await createPhoneService({contextKey:f.key,seed:{accounts:{me:{name:'本人',role:'self'}},documents:[]},storage:createPhoneDatabaseStorage({contextKey:f.key,database:f.host.createPhoneDatabaseBridge()})}).init();assert.equal(f.writes(),before);
});
