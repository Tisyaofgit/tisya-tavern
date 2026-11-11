import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {chatKey,NS} from '../engine/controller.mjs';
import {createPhoneDatabaseStorage} from '../engine/phone-database.mjs';
import {createPhoneService} from '../phone-core.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const seed={accounts:{me:{name:'本人',role:'self'}},documents:[]};
function fixture(){
 const chat=[],disk=new Map();let current={chatId:null,chat,chatMetadata:{},extensionSettings:{}},readHook=null,writes=0;
 const storage={
  async get(id){const value=structuredClone(disk.get(id)),hook=readHook;readHook=null;if(hook)await hook();return value;},
  async set(id,value){writes++;disk.set(id,structuredClone(value));},
  async commit(id,revision,value){if((disk.get(id)?.local_revision??0)!==revision)return false;writes++;disk.set(id,structuredClone(value));return true;},
 };
 const host=createMatrixHost({getContext:()=>current,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistMetadata:async()=>true,persistSettings:async()=>true});
 // The native host keeps one array and replaces its contents when loading a
 // different chat. Serializing the fixture also replaces message/meta objects.
 function load(id,saved={messages:[{is_user:false,mes:'会话 '+id+' 的开场白'}],metadata:{integrity:'chat-'+id}}){
  chat.splice(0,chat.length,...structuredClone(saved.messages));
  current={chatId:id,characterId:1,chat,chatMetadata:structuredClone(saved.metadata),extensionSettings:{},saveChat:async()=>true};
 }
 const snapshot=()=>({messages:structuredClone(chat),metadata:structuredClone(current.chatMetadata)});
 const service=()=>{const key=chatKey(current);return createPhoneService({contextKey:key,seed,storage:createPhoneDatabaseStorage({contextKey:key,database:host.createPhoneDatabaseBridge()})});};
 const settled=async()=>{await host.ensureDatabase();await host.controller.event('CHAT_CHANGED');};
 async function initialize(id,query){load(id);await settled();const phone=service();await phone.init();if(query)await phone.dispatch({kind:'search',query});return {phone,saved:snapshot(),owner:current.chatMetadata[NS].chat_uid,state:phone.getState()};}
 return {host,disk,load,snapshot,service,settled,initialize,context:()=>current,writes:()=>writes,onRead:hook=>{readHook=hook;}};
}

test('a completed A to B switch reads B existing progress through warm and cold phone services',async()=>{
 const f=fixture(),a=await f.initialize('A','A 的已有搜索'),b=await f.initialize('B','B 的已有搜索');
 f.load('A',a.saved);await f.settled();const reopenedA=f.service();await reopenedA.init();assert.deepEqual(reopenedA.getState(),a.state);
 const storedA=structuredClone(f.disk.get(a.owner));
 f.load('B',b.saved);await f.settled();const before=f.writes(),storedB=structuredClone(f.disk.get(b.owner));
 await b.phone.init();const reopenedB=f.service();await reopenedB.init();
 assert.deepEqual(b.phone.getState(),b.state);assert.deepEqual(reopenedB.getState(),b.state);
 assert.notEqual(a.owner,b.owner);assert.deepEqual(f.context().chatMetadata[NS].origin_chat_keys,[]);
 assert.equal((await f.host.readDatabase()).phoneDetached,false);assert.equal(f.writes(),before);
 assert.deepEqual(f.disk.get(a.owner),storedA);assert.deepEqual(f.disk.get(b.owner),storedB);
});

test('a completed A to a new B switch initializes B independently and preserves A progress',async()=>{
 const f=fixture(),a=await f.initialize('A','只属于 A 的已有搜索'),storedA=structuredClone(f.disk.get(a.owner));
 f.load('B');await f.settled();const uninitialized=await f.host.readDatabase();
 assert.equal(uninitialized.state.tables.X_PHONE_BINDINGS?.['phone-current'],undefined);assert.equal(uninitialized.phoneDetached,false);
 const b=f.service();await b.init();assert.equal(b.getState().contextKey,chatKey(f.context()));assert.deepEqual(b.getState().actions,[]);
 assert.notEqual(f.context().chatMetadata[NS].chat_uid,a.owner);assert.deepEqual(f.context().chatMetadata[NS].origin_chat_keys,[]);
 assert.deepEqual(f.disk.get(a.owner),storedA);
 f.load('A',a.saved);await f.settled();const reopened=f.service();await reopened.init();assert.deepEqual(reopened.getState(),a.state);
});

test('a phone read pending in A rejects its old scope after native chat contents become B',async()=>{
 const f=fixture(),a=await f.initialize('A','A 的已有搜索'),b=await f.initialize('B','B 的已有搜索');
 f.load('A',a.saved);const old=f.service(),before=structuredClone([...f.disk]),writes=f.writes();
 f.onRead(()=>f.load('B',b.saved));
 await assert.rejects(old.init(),error=>error.code==='CHAT_CHANGED');
 assert.equal(f.writes(),writes);assert.deepEqual([...f.disk],before);
 // The rejected A read must not poison the fully loaded B service or its data.
 const current=f.service();await current.init();assert.deepEqual(current.getState(),b.state);
});

test('peek and message snapshot reads do not return an old owner after a chat switch',async t=>{
 for(const method of ['peekDatabase','readDatabaseSnapshot'])await t.test(method,async()=>{
  const f=fixture(),a=await f.initialize('A'),b=await f.initialize('B'),before=structuredClone([...f.disk]);
  f.load('A',a.saved);f.onRead(()=>f.load('B',b.saved));
  await assert.rejects(f.host[method]({uid:a.saved.messages[0].extra[NS].uid,raw:a.saved.messages[0].mes}),error=>error.code==='CHAT_CHANGED');
  assert.deepEqual([...f.disk],before);
 });
});

test('a same-chat native clear or reload cannot be projected as a detached branch during an awaited read',async t=>{
 for(const mutation of ['clear','reload'])await t.test(mutation,async()=>{
  const f=fixture(),a=await f.initialize('A','A 的已有搜索'),before=structuredClone([...f.disk]);
  f.onRead(()=>{const messages=mutation==='reload'?structuredClone(a.saved.messages):[];f.context().chat.splice(0,f.context().chat.length,...messages);});
  await assert.rejects(f.host.readDatabase(),error=>error.code==='CHAT_CHANGED');
  assert.deepEqual([...f.disk],before);
  f.load('A',a.saved);const restored=f.service();await restored.init();assert.deepEqual(restored.getState(),a.state);
 });
});

test('a real deleted initialization floor stays detached and does not reset the saved phone',async()=>{
 const f=fixture(),a=await f.initialize('A','不可重置的已有搜索');f.context().chat.splice(0,1);
 await f.host.controller.event('CHAT_CHANGED');const before=structuredClone([...f.disk]),writes=f.writes();
 assert.equal((await f.host.readDatabase()).phoneDetached,true);
 await assert.rejects(f.service().init(),error=>error.code==='PHONE_DATABASE_DETACHED');
 assert.equal(f.writes(),writes);assert.deepEqual([...f.disk],before);
 f.load('A',a.saved);await f.settled();const restored=f.service();await restored.init();assert.deepEqual(restored.getState(),a.state);
});
