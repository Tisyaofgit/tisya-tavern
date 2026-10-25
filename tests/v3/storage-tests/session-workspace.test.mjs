import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {createDurableWorkspace} from '../../../v3/durable-workspace.mjs';
import {createSessionWorkspace,sessionWorkspaceKey,SESSION_WORKSPACE_CODE} from '../../../v3/session-workspace.mjs';

const copy=structuredClone;
const makeMessage=(id,mes='1 正文 '+id)=>({mes,name:'角色',send_date:'date-'+id,is_user:false,swipes:[mes,'1 另一候选 '+id],swipe_id:0,swipe_info:[{extra:{variables:{背包:['纸']}}}],extra:{variables:{stat_data:{体力:0}}},tisya_w24_floor:{branchId:'chat-a',id}});
function computations(){
 const map=new Map(),restores=[];
 return {map,restores,snapshot:source=>copy([...(map.get(source)??new Map())]),restore(source,slots){restores.push({source,slots:copy(slots)});map.set(source,new Map(copy(slots)));},clear(){map.clear();}};
}
function fixture(options={}){
 const db=options.indexedDB??new IDBFactory(),errors=[],cache=createDurableWorkspace({indexedDB:db}),workspace=computations();
 let owner={account:'local',cardId:'card-a',cardName:'角色卡',chatId:'chat-a',chatName:'存档甲'},busy=false,configuration={ready:true,domains:{configuration:{mode:'故事',empty:[],enabled:false}},revision:'one'};
 let ctx={characterId:0,characters:[{name:'角色卡',avatar:'card-a',data:{description:'完整描述',extensions:{world:'世界书'},first_mes:'原始开场'}}],chat:[makeMessage('one'),makeMessage('two')],chatMetadata:{tisya_w24:{chatId:'world-a',branchId:'chat-a'},pending:null}};
 const service=createSessionWorkspace({cache,getContext:()=>ctx,getOwner:()=>owner,getConfiguration:()=>configuration,workspace,onError:e=>errors.push(e),isBusy:()=>busy,...options.dependencies});
 return {db,cache,workspace,service,errors,get ctx(){return ctx;},set ctx(value){ctx=value;},get owner(){return owner;},set owner(value){owner=value;},busy(value){busy=value;},configuration(value){configuration=value;},async dispose(){await service.dispose();await cache.dispose();}};
}

test('full snapshots persist complete card/config and messages separately without mutating native data',async()=>{
 const f=fixture(),original=copy(f.ctx);const first=f.ctx.chat[0].mes;f.workspace.map.set(first,new Map([['host:body-v1',first],['sha256:utf16','known']]));
 const result=await f.service.capture({full:true});assert.equal(result.capturedMessages,2);assert.deepEqual(f.ctx,original);
 const rows=await f.cache.list();assert.equal(rows.length,5);assert.equal(rows.filter(row=>row.kind==='message').length,2);assert.equal(rows.find(row=>row.kind==='card').owner.chatId,undefined);
 const card=await f.cache.get(sessionWorkspaceKey(f.owner,'card'));assert.deepEqual(card.data.card,original.characters[0]);assert.equal(card.data.sourceStatus,'observed-settled-host');
 const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));assert.deepEqual(manifest.data.metadata,original.chatMetadata);const message=await f.cache.get(manifest.data.order[0]);assert.deepEqual(message.data.message,original.chat[0]);assert.equal(message.data.codeVersion,SESSION_WORKSPACE_CODE);assert.deepEqual(message.data.derived[0].slots,[['host:body-v1',first],['sha256:utf16','known']]);await f.dispose();
});

test('exactly unchanged full capture writes nothing and editing one floor rewrites only that message',async()=>{
 const f=fixture(),original=IDBObjectStore.prototype.put;let writes=[];
 IDBObjectStore.prototype.put=function(record,...rest){writes.push(record.key);return original.call(this,record,...rest);};
 try{await f.service.capture({full:true});writes=[];await f.service.capture({full:true});assert.deepEqual(writes,[]);f.ctx.chat[0].extra.variables.stat_data.体力=3;await f.service.capture({floor:0});assert.equal(writes.length,1);const changed=await f.cache.get(writes[0]);assert.equal(changed.kind,'message');assert.equal(changed.data.message.extra.variables.stat_data.体力,3);}
 finally{IDBObjectStore.prototype.put=original;await f.dispose();}
});

test('reopened cache restores pure computations only for complete exact live messages',async()=>{
 const f=fixture(),source=f.ctx.chat[0].mes,body='body exact';f.workspace.map.set(source,new Map([['host:body-v1',body],['reader:public',{body}]]));f.workspace.map.set(body,new Map([['sha256:utf16','body-hash']]));await f.service.capture({full:true});
 const savedContext=copy(f.ctx),owner=copy(f.owner);await f.dispose();const cache=createDurableWorkspace({indexedDB:f.db}),workspace=computations(),service=createSessionWorkspace({cache,getContext:()=>savedContext,getOwner:()=>owner,workspace});
 const result=await service.hydrate();assert.equal(result.restoredMessages,2);assert.deepEqual(workspace.map.get(source).get('reader:public'),{body});assert.equal(workspace.map.get(body).get('sha256:utf16'),'body-hash');assert.equal(result.card.data.description,'完整描述');assert.equal(result.configuration.domains.configuration.enabled,false);
 workspace.restores.length=0;savedContext.chat[0].swipes[1]='改了未选中的候选';const changed=await service.hydrate();assert.equal(changed.restoredMessages,1);assert(!workspace.restores.some(row=>row.source===source));await service.dispose();await cache.dispose();
});

test('another save may read the same card/config but never restores old message requests or metadata',async()=>{
 const f=fixture();f.ctx.chatMetadata.requests={old:{status:'delivered'}};await f.service.capture({full:true});f.owner={...f.owner,chatId:'chat-new',chatName:'新档'};f.ctx={...f.ctx,chat:[makeMessage('new')],chatMetadata:{}};f.workspace.restores.length=0;
 const result=await f.service.hydrate();assert(result.card);assert(result.configuration);assert.equal(result.restoredMessages,0);assert.equal(result.metadata,undefined);assert.deepEqual(f.ctx.chatMetadata,{});assert.equal(f.workspace.restores.length,0);await f.dispose();
});

test('full deletion removes only missing messages from the same account/card/save manifest',async()=>{
 const f=fixture();await f.service.capture({full:true});const own=f.owner,manifest=(await f.cache.get(sessionWorkspaceKey(own,'chat'))).data,deleted=manifest.order[0];f.owner={...own,chatId:'other'};await f.service.capture({full:true});const otherRows=(await f.cache.list()).filter(row=>row.owner.chatId==='other').map(row=>row.key);
 f.owner=own;f.ctx.chat.shift();await f.service.capture({full:true});assert.equal(await f.cache.get(deleted),null);for(const key of otherRows)assert(await f.cache.get(key));assert(await f.cache.get(sessionWorkspaceKey(own,'card')));const live=(await f.cache.get(sessionWorkspaceKey(own,'chat'))).data;assert.equal(live.messageCount,1);assert.equal((await f.cache.get(live.order[0])).data.floor,0);await f.dispose();
});

test('capture freezes its old owner and bytes before awaiting storage across a context switch',async()=>{
 const f=fixture();await f.cache.ready;const get=f.cache.get.bind(f.cache);let release;const gate=new Promise(resolve=>release=resolve),old=copy(f.owner),before=copy(f.ctx.chat[0]);
 const cache={...f.cache,get:async key=>{await gate;return get(key);}},service=createSessionWorkspace({cache,getContext:()=>f.ctx,getOwner:()=>f.owner,getConfiguration:()=>({ready:false}),workspace:f.workspace});
 const pending=service.capture({floor:0});f.ctx.chat[0].mes='later mutation';f.owner={...f.owner,chatId:'new'};f.ctx={...f.ctx,chat:[makeMessage('new')],chatMetadata:{native:'new'}};release();await pending;
 const manifest=await f.cache.get(sessionWorkspaceKey(old,'chat'));assert(manifest);assert.deepEqual((await f.cache.get(manifest.data.order[0])).data.message,before);assert.equal(await f.cache.get(sessionWorkspaceKey(f.owner,'chat')),null);assert.deepEqual(f.ctx.chatMetadata,{native:'new'});await service.dispose();await f.dispose();
});

test('busy work is deferred, explicit capture refuses unsettled bytes, and a changed deferred owner is not substituted',async()=>{
 const f=fixture();f.busy(true);await assert.rejects(f.service.capture({full:true}),{code:'SESSION_WORKSPACE_BUSY'});f.service.schedule({full:true});assert.deepEqual(await f.cache.list(),[]);f.busy(false);await f.service.flush();assert.equal((await f.cache.list()).length,5);
 f.busy(true);f.service.schedule({full:true});f.owner={...f.owner,chatId:'new'};f.ctx={...f.ctx,chat:[makeMessage('new')],chatMetadata:{}};f.busy(false);await f.service.flush();assert.equal(await f.cache.get(sessionWorkspaceKey(f.owner,'chat')),null);await f.dispose();
});

test('debounced floor updates merge and deleting memory cancels queued snapshots without resurrection',async()=>{
 const f=fixture();await f.service.capture({full:true});f.ctx.chat[0].mes='1 第一次修改';f.service.schedule({floor:0});f.ctx.chat[1].mes='1 第二次修改';f.service.schedule({floor:1});await f.service.flush();const order=(await f.cache.get(sessionWorkspaceKey(f.owner,'chat'))).data.order;assert.equal((await f.cache.get(order[0])).data.message.mes,'1 第一次修改');assert.equal((await f.cache.get(order[1])).data.message.mes,'1 第二次修改');
 f.ctx.chat[0].mes='1 清理前排队';f.service.schedule({floor:0});f.service.clearMemory();await f.cache.clear({account:'local',cardId:'card-a',chatId:'chat-a'});await f.service.flush();assert.equal(await f.cache.get(sessionWorkspaceKey(f.owner,'chat')),null);await f.dispose();
});

test('a failed incremental write retains its frozen snapshot and explicit flush completes the manifest',async()=>{
 const f=fixture(),put=f.cache.put.bind(f.cache);let reject=true;const service=createSessionWorkspace({cache:{...f.cache,put:(key,value)=>{if(value.kind==='message'&&reject){reject=false;return Promise.reject(Error('cache write failed'));}return put(key,value);}},getContext:()=>f.ctx,getOwner:()=>f.owner,getConfiguration:()=>({ready:false}),workspace:f.workspace,onError:e=>f.errors.push(e)});
 await assert.rejects(service.capture({full:true}),/cache write failed/);assert.equal(await f.cache.get(sessionWorkspaceKey(f.owner,'chat')),null);f.ctx.chat[0].mes='后续尚未结算的内容';await service.flush();const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));assert.equal((await f.cache.get(manifest.data.order[0])).data.message.mes,'1 正文 one');assert.equal(f.errors.length,1);await service.dispose();await f.dispose();
});

test('late hydration cannot restore old computations into a newly opened save',async()=>{
 const f=fixture();f.workspace.map.set(f.ctx.chat[0].mes,new Map([['reader','cached']]));await f.service.capture({full:true});const get=f.cache.get.bind(f.cache);let release;const gate=new Promise(resolve=>release=resolve),workspace=computations(),service=createSessionWorkspace({cache:{...f.cache,get:async key=>{await gate;return get(key);}},getContext:()=>f.ctx,getOwner:()=>f.owner,workspace});
 const pending=service.hydrate();f.owner={...f.owner,chatId:'new'};f.ctx={...f.ctx,chat:[makeMessage('new')],chatMetadata:{}};release();const result=await pending;assert.equal(result.stale,true);assert.equal(result.restoredMessages,0);assert.equal(workspace.restores.length,0);await service.dispose();await f.dispose();
});

test('unready/draft config is not saved and duplicate stable message identities never overwrite data',async()=>{
 const f=fixture();f.configuration({ready:true,draft:{changed:true},domains:{secret:'draft'}});await f.service.capture({full:true});assert.equal(await f.cache.get(sessionWorkspaceKey(f.owner,'configuration')),null);f.ctx.chat[1].tisya_w24_floor.id='one';await assert.rejects(f.service.capture({full:true}),{code:'SESSION_WORKSPACE_MESSAGE_ID'});await f.dispose();
});

test('native messages without markers retain complete sources under distinct fallback keys',async()=>{
 const f=fixture();delete f.ctx.chat[0].tisya_w24_floor;delete f.ctx.chat[1].tisya_w24_floor;f.ctx.chat[1].send_date=f.ctx.chat[0].send_date;await f.service.capture({full:true});const manifest=(await f.cache.get(sessionWorkspaceKey(f.owner,'chat'))).data;assert.equal(new Set(manifest.order).size,2);for(let i=0;i<2;i++)assert.deepEqual((await f.cache.get(manifest.order[i])).data.message,f.ctx.chat[i]);await f.dispose();
});


test('unchanged capture does not call cache.put or perform a per-message revision read',async()=>{
 const f=fixture(),put=f.cache.put.bind(f.cache),calls=[];
 const service=createSessionWorkspace({cache:{...f.cache,put:(key,value)=>{calls.push(key);return put(key,value);}},getContext:()=>f.ctx,getOwner:()=>f.owner,getConfiguration:()=>({ready:true,domains:{configuration:{a:1}}}),workspace:f.workspace});
 await service.capture({full:true});calls.length=0;await service.capture({full:true});assert.deepEqual(calls,[]);f.ctx.chat[0].mes='1 changed';await service.capture({floor:0});assert.equal(calls.length,1);assert.equal((await f.cache.get(calls[0])).kind,'message');await service.dispose();await f.dispose();
});

test('a direct newer capture absorbs an older queued snapshot instead of rolling back the cache',async()=>{
 const f=fixture();await f.service.capture({full:true});f.ctx.chat[0].mes='1 old queued';f.ctx.chatMetadata.revision='old';f.service.schedule({floor:0});f.ctx.chat[0].mes='1 latest';f.ctx.chatMetadata.revision='new';await f.service.capture({floor:0});await f.service.flush();
 const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));assert.equal(manifest.data.metadata.revision,'new');assert.equal((await f.cache.get(manifest.data.order[0])).data.message.mes,'1 latest');await f.dispose();
});

test('queued snapshots of another save cannot overwrite a newer card-level configuration',async()=>{
 const f=fixture();f.configuration({ready:true,domains:{configuration:{value:'old'}}});f.service.schedule({full:true});const old=f.owner;f.owner={...old,chatId:'second'};f.configuration({ready:true,domains:{configuration:{value:'new'}}});f.ctx={...f.ctx,chat:[makeMessage('other')],chatMetadata:{}};await f.service.capture({full:true});await f.service.flush();
 assert.equal((await f.cache.get(sessionWorkspaceKey(old,'configuration'))).data.configuration.domains.configuration.value,'new');assert(await f.cache.get(sessionWorkspaceKey(old,'chat')));await f.dispose();
});

test('a draining batch enters the serial queue before a newer direct capture can overtake it',async()=>{
 const f=fixture(),put=f.cache.put.bind(f.cache);let release,entered;const enteredPromise=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let blocked=false;
 const service=createSessionWorkspace({cache:{...f.cache,put:async(key,value)=>{if(!blocked){blocked=true;entered();await gate;}return put(key,value);}},getContext:()=>f.ctx,getOwner:()=>f.owner,workspace:f.workspace});
 service.schedule({full:true});f.owner={...f.owner,chatId:'second'};f.ctx={...f.ctx,chat:[makeMessage('other','1 old')],chatMetadata:{revision:'old'}};service.schedule({full:true});const flushing=service.flush();await enteredPromise;f.ctx.chat[0].mes='1 new';f.ctx.chatMetadata.revision='new';const latest=service.capture({floor:0});release();await Promise.all([flushing,latest]);const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));assert.equal(manifest.data.metadata.revision,'new');assert.equal((await f.cache.get(manifest.data.order[0])).data.message.mes,'1 new');await service.dispose();await f.dispose();
});

test('clearing memory forgets failed derived snapshots and dispose reports incomplete persistence',async()=>{
 const f=fixture(),put=f.cache.put.bind(f.cache);let reject=true;const service=createSessionWorkspace({cache:{...f.cache,put:(key,value)=>reject?Promise.reject(Error('still unavailable')):put(key,value)},getContext:()=>f.ctx,getOwner:()=>f.owner,workspace:f.workspace});
 await assert.rejects(service.capture({full:true}),/still unavailable/);await assert.rejects(service.dispose(),{code:'SESSION_WORKSPACE_UNSAVED'});service.clearMemory();reject=false;assert.deepEqual(await service.flush(),{pending:0});assert.deepEqual(await f.cache.list(),[]);await service.dispose();await f.dispose();
});

test('clearing during the no-op memory read cannot enqueue a late put that revives deleted cache',async()=>{
 const f=fixture(),get=f.cache.get.bind(f.cache),cardKey=sessionWorkspaceKey(f.owner,'card');let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const service=createSessionWorkspace({cache:{...f.cache,get:async key=>{if(key===cardKey){entered();await gate;}return get(key);}},getContext:()=>f.ctx,getOwner:()=>f.owner,workspace:f.workspace});
 const capturing=service.capture({full:true});await started;service.clearMemory();await f.cache.clear({account:'local',cardId:'card-a'});release();await capturing;await service.flush();assert.deepEqual(await f.cache.list(),[]);await service.dispose();await f.dispose();
});

test('clearing during an old deletion read cannot delete a newer cache generation',async()=>{
 const f=fixture();await f.service.capture({full:true});const deleted=(await f.cache.get(sessionWorkspaceKey(f.owner,'chat'))).data.order[0],get=f.cache.get.bind(f.cache);let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const service=createSessionWorkspace({cache:{...f.cache,get:async key=>{const value=await get(key);if(key===deleted){entered();await gate;}return value;}},getContext:()=>f.ctx,getOwner:()=>f.owner,workspace:f.workspace});
 f.ctx.chat.shift();const deleting=service.capture({full:true});await started;service.clearMemory();await f.cache.remove(deleted);await f.cache.put(deleted,{kind:'message',owner:f.owner,data:{newGeneration:true}});release();await deleting;assert.equal((await f.cache.get(deleted)).data.newGeneration,true);await service.dispose();await f.dispose();
});

test('quota failure can be cleared without first persisting derived data and native sources remain intact',async()=>{
 const f=fixture();await f.service.capture({full:true});f.ctx.chat[0].mes='1 用户已经编辑的完整正文';const native=copy(f.ctx),original=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(){throw new DOMException('quota exhausted','QuotaExceededError');};
 try{
  await assert.rejects(f.service.capture({floor:0}),{name:'QuotaExceededError'});assert((await f.cache.list()).some(row=>row.state==='error'));
  f.service.clearMemory();await f.cache.clear({account:f.owner.account,cardId:f.owner.cardId,chatId:f.owner.chatId});
  assert.deepEqual(await f.service.flush(),{pending:0});assert(!(await f.cache.list()).some(row=>row.owner.chatId===f.owner.chatId));assert.deepEqual(f.ctx,native,'clearing derived cache never rolls back or deletes the live source, swipes or metadata');assert(await f.cache.get(sessionWorkspaceKey(f.owner,'card')));
 }finally{IDBObjectStore.prototype.put=original;await f.dispose();}
});

test('new branch selected while busy is fully captured by the next default schedule',async()=>{
 const f=fixture();await f.service.capture();f.busy(true);f.service.schedule();
 f.owner={...f.owner,chatId:'branch-12',chatName:'Branch #12'};f.ctx={...f.ctx,chat:Array.from({length:7},(_,i)=>makeMessage('branch-'+i)),chatMetadata:{branchId:'branch-12'}};
 const original=copy(f.ctx);f.service.schedule();f.busy(false);f.service.schedule();await f.service.flush();
 const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));assert.equal(manifest.data.order.length,7);
 for(let i=0;i<7;i++)assert.deepEqual((await f.cache.get(manifest.data.order[i])).data.message,f.ctx.chat[i]);
 assert.deepEqual(f.ctx,original);f.ctx.chat[2].extra.changed=true;assert.equal((await f.service.capture({floor:2})).capturedMessages,1);await f.dispose();
});

test('new message keys added together and stable marker replacement never leave manifest holes',async()=>{
 const f=fixture();for(const message of f.ctx.chat)delete message.tisya_w24_floor;await f.service.capture();
 const oldOrder=(await f.cache.get(sessionWorkspaceKey(f.owner,'chat'))).data.order;
 for(let i=0;i<f.ctx.chat.length;i++)f.ctx.chat[i].tisya_w24_floor={branchId:f.owner.chatId,id:'stable-'+i};
 assert.equal((await f.service.capture()).capturedMessages,2);for(const key of oldOrder)assert.equal(await f.cache.get(key),null);
 f.ctx.chat.push(makeMessage('new-user'),makeMessage('new-assistant'));assert.equal((await f.service.capture()).capturedMessages,2);
 const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));for(let i=0;i<f.ctx.chat.length;i++)assert.deepEqual((await f.cache.get(manifest.data.order[i])).data.message,f.ctx.chat[i]);await f.dispose();
});

test('failed first coverage stays incomplete and clearMemory makes the next capture complete again',async()=>{
 const f=fixture(),put=f.cache.put.bind(f.cache);let reject=true;
 const service=createSessionWorkspace({cache:{...f.cache,put:(key,value)=>{if(value.kind==='message'&&reject){reject=false;throw Error('initial snapshot failed');}return put(key,value);}},getContext:()=>f.ctx,getOwner:()=>f.owner,workspace:f.workspace});
 await assert.rejects(service.capture(),/initial snapshot failed/);f.ctx.chat[0].mes='latest settled first message';
 assert.equal((await service.capture()).capturedMessages,2);let manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));assert.equal((await f.cache.get(manifest.data.order[0])).data.message.mes,f.ctx.chat[0].mes);
 service.clearMemory();await f.cache.clear({account:f.owner.account,cardId:f.owner.cardId,chatId:f.owner.chatId});assert.equal((await service.capture()).capturedMessages,2);
 manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));for(let i=0;i<f.ctx.chat.length;i++)assert.deepEqual((await f.cache.get(manifest.data.order[i])).data.message,f.ctx.chat[i]);await service.dispose();await f.dispose();
});

test('only complete matching hydration establishes incremental coverage',async()=>{
 const f=fixture();await f.service.capture();const service=createSessionWorkspace({cache:f.cache,getContext:()=>f.ctx,getOwner:()=>f.owner,workspace:f.workspace});
 assert.equal((await service.hydrate()).restoredMessages,2);assert.equal((await service.capture({floor:1})).capturedMessages,1);
 const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));await f.cache.remove(manifest.data.order[0]);assert.equal((await service.hydrate()).restoredMessages,1);assert.equal((await service.capture()).capturedMessages,2);
 await service.dispose();await f.dispose();
});

test('older persistence cannot restore coverage while a queued full snapshot deletes a restored message',async()=>{
 const f=fixture();await f.service.capture();const original=copy(f.ctx.chat),put=f.cache.put.bind(f.cache),remove=f.cache.remove.bind(f.cache);
 let releaseFirst,enteredFirst,releaseDelete,enteredDelete,blockFirst=true;
 const firstGate=new Promise(resolve=>releaseFirst=resolve),firstStarted=new Promise(resolve=>enteredFirst=resolve),deleteGate=new Promise(resolve=>releaseDelete=resolve),deleteStarted=new Promise(resolve=>enteredDelete=resolve);
 const service=createSessionWorkspace({cache:{...f.cache,put:async(key,value)=>{if(value.kind==='chat'&&blockFirst){blockFirst=false;enteredFirst();await firstGate;}return put(key,value);},remove:async key=>{enteredDelete();await deleteGate;return remove(key);}},getContext:()=>f.ctx,getOwner:()=>f.owner,workspace:f.workspace});
 await service.hydrate();f.ctx.chatMetadata.phase='before-delete';const first=service.capture({full:true});await firstStarted;
 f.ctx.chat=[copy(original[0])];f.ctx.chatMetadata.phase='delete';const deleting=service.capture({full:true});
 releaseFirst();await first;await deleteStarted;
 f.ctx.chat=copy(original);f.ctx.chatMetadata.phase='restored';const restoring=service.capture({floor:0});releaseDelete();await Promise.all([deleting,restoring]);
 const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));assert.equal(manifest.data.order.length,2);for(let i=0;i<2;i++)assert.deepEqual((await f.cache.get(manifest.data.order[i])).data.message,original[i]);
 assert.equal((await service.capture({floor:0})).capturedMessages,1);await service.dispose();await f.dispose();
});

test('hydration cannot cover messages that an older debounced full snapshot will delete',async()=>{
 const f=fixture();await f.service.capture();const original=copy(f.ctx.chat),remove=f.cache.remove.bind(f.cache);let entered,release;
 const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 const service=createSessionWorkspace({cache:{...f.cache,remove:async key=>{entered();await gate;return remove(key);}},getContext:()=>f.ctx,getOwner:()=>f.owner,workspace:f.workspace});
 await service.hydrate();f.ctx.chat=[copy(original[0])];service.schedule({full:true});f.ctx.chat=copy(original);assert.equal((await service.hydrate()).restoredMessages,2);
 const draining=service.flush();await started;const restore=service.capture({floor:0});release();await Promise.all([draining,restore]);
 const manifest=await f.cache.get(sessionWorkspaceKey(f.owner,'chat'));for(let i=0;i<2;i++)assert.deepEqual((await f.cache.get(manifest.data.order[i])).data.message,original[i]);
 assert.equal((await service.capture({floor:0})).capturedMessages,1);await service.dispose();await f.dispose();
});
