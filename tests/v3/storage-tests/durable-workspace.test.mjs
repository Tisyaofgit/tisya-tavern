import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {createDurableWorkspace} from '../../../v3/durable-workspace.mjs';

const owner=(cardId='card-a',chatId='chat-a',account='local')=>({account,cardId,cardName:'卡 '+cardId,...chatId?{chatId,chatName:'存档 '+chatId}:{}});
const message=(id,options={})=>({kind:'message',owner:owner(),data:{id,mes:'完整正文 '+id,swipes:['完整正文 '+id,'候选正文'],swipe_id:0,extra:{mvu:{stat_data:{背包:[]}}}},sourceRevision:id,...options});
const create=(indexedDB,options={})=>createDurableWorkspace({indexedDB,...options});
async function persisted(indexedDB){const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('tisya-durable-workspace-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});try{return await new Promise((resolve,reject)=>{const request=db.transaction('records').objectStore('records').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}}

test('individual full messages and separate cards survive reopen without an eviction limit',async()=>{
 const indexedDB=new IDBFactory();let store=create(indexedDB);await store.ready;
 const inputs=Array.from({length:530},(_,id)=>message(id));for(const row of inputs)await store.put('message/'+row.data.id,row);
 const card={kind:'card',owner:owner('card-a',null),data:{name:'角色',data:{description:'完整卡定义',extensions:{world:'配套世界书'},first_mes:'开场'}}};await store.put('card/card-a',card);await store.dispose();
 store=create(indexedDB);await store.ready;assert.equal((await store.list()).length,531);assert.deepEqual((await store.get('message/0')).data,inputs[0].data);assert.deepEqual((await store.get('message/529')).data,inputs[529].data);assert.deepEqual((await store.get('card/card-a')).data,card.data);
 const result=await store.get('message/0');result.data.mes='外部修改';assert.equal((await store.get('message/0')).data.mes,inputs[0].data.mes);await store.dispose();
});

test('unchanged records never rewrite, while changed messages update independently',async()=>{
 const indexedDB=new IDBFactory(),store=create(indexedDB);await store.ready;const original=IDBObjectStore.prototype.put;let writes=0;
 IDBObjectStore.prototype.put=function(...args){writes++;return original.apply(this,args);};
 try{await store.put('a',message(1));await store.put('b',message(2));const before=await persisted(indexedDB);await store.put('a',message(1));assert.equal(writes,2);await store.put('a',message(1,{data:{mes:'改后的完整正文'}}));assert.equal(writes,3);const after=await persisted(indexedDB);assert.deepEqual(after.find(row=>row.key==='b'),before.find(row=>row.key==='b'));assert.equal(after.find(row=>row.key==='a').data.mes,'改后的完整正文');}
 finally{IDBObjectStore.prototype.put=original;await store.dispose();}
});

test('scoped cleanup uses stable account/card/save identities and never aliases equal names',async()=>{
 const indexedDB=new IDBFactory(),store=create(indexedDB);await store.ready;
 await store.put('a',message(1));await store.put('other-chat',message(2,{owner:owner('card-a','chat-b')}));await store.put('other-card',message(3,{owner:{...owner('card-b','chat-a'),cardName:'卡 card-a'}}));await store.put('other-account',message(4,{owner:owner('card-a','chat-a','account-b')}));await store.put('card',message(5,{kind:'card',owner:owner('card-a',null)}));
 assert.throws(()=>store.clear({}),/全部清理/);await assert.rejects(store.put('a',message(6,{owner:owner('card-b')})),/另一账号/);
 assert.deepEqual((await store.clear({cardId:'card-a',chatId:'chat-a'})).keys,['a']);assert.equal((await store.list()).length,4);
 assert.equal((await store.clear({cardId:'card-a'})).removed,2);assert.equal((await store.list()).length,2);assert.equal((await store.clearAll()).removed,2);assert.deepEqual(await persisted(indexedDB),[]);await store.dispose();
});

test('put/remove and put/clear races settle in invocation order without reviving records',async()=>{
 const indexedDB=new IDBFactory(),store=create(indexedDB);await store.ready;
 await Promise.all([store.put('a',message(1)),store.remove('a')]);assert.equal(await store.get('a'),null);assert.deepEqual(await persisted(indexedDB),[]);
 await Promise.all([store.put('a',message(1)),store.put('b',message(2)),store.clear({cardId:'card-a'})]);assert.deepEqual(await persisted(indexedDB),[]);await store.flush();assert.deepEqual(await persisted(indexedDB),[]);await store.dispose();
});

test('failed writes visibly retain complete dirty payload and flush retries the same record',async()=>{
 const indexedDB=new IDBFactory(),errors=[],store=create(indexedDB,{onError:error=>errors.push(error)});await store.ready;const original=IDBObjectStore.prototype.put;let reject=true;
 IDBObjectStore.prototype.put=function(...args){if(reject)throw new DOMException('quota exhausted','QuotaExceededError');return original.apply(this,args);};
 try{await assert.rejects(store.put('a',message(1)),/quota exhausted/);assert.equal((await store.get('a')).state,'error');assert.deepEqual((await store.get('a')).data,message(1).data);assert.equal((await store.list())[0].error,'quota exhausted');assert.deepEqual(await persisted(indexedDB),[]);reject=false;assert.deepEqual(await store.flush(),{saved:1,removed:0});assert.equal((await store.get('a')).state,'saved');assert.deepEqual((await persisted(indexedDB))[0].data,message(1).data);assert.equal(errors.length,1);}
 finally{IDBObjectStore.prototype.put=original;await store.dispose();}
});

test('a second window cannot overwrite or resurrect a row cleared after its snapshot',async()=>{
 const indexedDB=new IDBFactory(),first=create(indexedDB);await first.put('a',message(1));const second=create(indexedDB);await second.ready;await first.remove('a');
 await assert.rejects(second.put('a',message(2)),error=>error.code==='WORKSPACE_CONFLICT');assert.equal((await second.get('a')).state,'error');assert.deepEqual(await persisted(indexedDB),[]);await second.clearAll();await second.dispose();await first.dispose();
});

test('same-payload no-op detects a remote deletion and explicit reload never silently discards dirty data',async()=>{
 const indexedDB=new IDBFactory(),first=create(indexedDB);await first.put('a',message(1));const second=create(indexedDB);await second.ready;await first.remove('a');
 await assert.rejects(second.put('a',message(1)),error=>error.code==='WORKSPACE_CONFLICT');assert.equal((await second.get('a')).state,'error');await assert.rejects(second.reload('a'),error=>error.code==='WORKSPACE_DIRTY');assert.deepEqual((await second.get('a')).data,message(1).data);
 assert.equal(await second.reload('a',{discardDirty:true}),null);await second.put('a',message(2));assert.equal((await first.reload('a')).data.id,2);await second.put('b',message(3));assert.equal((await first.reload()).length,2);await first.dispose();await second.dispose();
});

test('list exposes ownership and sizes but never payloads; missing storage is an explicit failure',async()=>{
 const indexedDB=new IDBFactory(),store=create(indexedDB,{now:()=>12345});await store.put('a',message(1));const listed=await store.list();assert.equal(listed[0].updatedAt,12345);assert.equal(listed[0].owner.cardName,'卡 card-a');assert(listed[0].bytes>0);assert(!Object.hasOwn(listed[0],'data'));assert.equal(listed[0].state,'saved');await store.dispose();
 const errors=[],absent=create(undefined,{onError:error=>errors.push(error)});await assert.rejects(absent.ready,error=>error.code==='WORKSPACE_UNAVAILABLE');await assert.rejects(absent.put('a',message(1)),error=>error.code==='WORKSPACE_UNAVAILABLE');assert.equal(errors.length,1);
});

test('complete serializable values retain undefined, empty values, type and number differences',async()=>{
 const indexedDB=new IDBFactory(),store=create(indexedDB);const input=message(1,{data:{zero:0,no:false,empty:'',nothing:null,undefined:undefined,negativeZero:-0,list:[,undefined,''],date:new Date(0)}});await store.put('a',input);await store.dispose();const reopened=create(indexedDB);assert.deepEqual((await reopened.get('a')).data,input.data);await reopened.dispose();
});

test('array fields retained by structured clone participate in change detection',async()=>{
 const indexedDB=new IDBFactory(),store=create(indexedDB),data=['one'];data.note='before';await store.put('a',message(1,{data}));data.note='after';await store.put('a',message(1,{data}));await store.dispose();const reopened=create(indexedDB);assert.equal((await reopened.get('a')).data.note,'after');await reopened.dispose();
});

test('null identities are rejected and delimiter characters cannot alias separate owners',async()=>{
 const indexedDB=new IDBFactory(),store=create(indexedDB);await store.ready;
 assert.throws(()=>store.put('a',message(1,{owner:owner(null)})),/卡身份/);assert.throws(()=>store.put('a',message(1,{owner:{...owner(),chatId:null}})),/存档身份/);assert.throws(()=>store.put('a',message(1,{owner:owner('a','b',null)})),/账号/);
 await store.put('a',message(1,{owner:owner('x\u0000y','z','a')}));await assert.rejects(store.put('a',message(1,{owner:owner('y','z','a\u0000x')})),/另一账号/);await store.dispose();
});

test('a malformed cache reports failure, keeps its disk bytes, and closes the failed connection',async()=>{
 const indexedDB=new IDBFactory(),seed=create(indexedDB);await seed.put('a',message(1));await seed.dispose();const db=await new Promise(resolve=>{const request=indexedDB.open('tisya-durable-workspace-v1',1);request.onsuccess=()=>resolve(request.result);});await new Promise(resolve=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put({key:'broken',schema:'unknown'});tx.oncomplete=resolve;});db.close();
 const errors=[],broken=create(indexedDB,{onError:error=>errors.push(error)});await assert.rejects(broken.ready,error=>error.code==='WORKSPACE_FORMAT');await broken.dispose();assert.equal((await persisted(indexedDB)).length,2);assert.equal(errors.length,1);
 await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase('tisya-durable-workspace-v1');request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('failed connection leaked'));});
});
