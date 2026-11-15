import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createChatArchiveStorage,createNativeChatArchiveBooks} from '../engine/chat-archive-book.mjs';
import {Controller,NS,chatKey} from '../engine/controller.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {baseline} from '../engine/config.mjs';
import {createDefaultActivation} from '../default-activation.js';
const copy=structuredClone,tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const disk=new Map(),files=new Map(),writes=[],settings={};let n=0;
 const context=chatId=>({chatId,characterId:0,chatMetadata:{world_info:'已有剧情书'},chat:[],extensionSettings:settings,saveMetadata:async()=>true,saveChat:async()=>true,saveSettingsDebounced(){}});let c=context('甲');
 const base={get:async id=>copy(disk.get(id)),set:async(id,v)=>disk.set(id,copy(v)),commit:async(id,r,v)=>{if((disk.get(id)?.local_revision??0)!==r)return false;disk.set(id,copy(v));return true;}};
 const books={listBooks:async()=>[...files.keys()],readBook:async name=>copy(files.get(name)),writeBook:async(name,data)=>{writes.push(name);files.set(name,copy(data));}};
 const archive=createChatArchiveStorage({storage:base,books,getContext:()=>c});
 const controller=new Controller({getContext:()=>c,storage:archive.storage,request:async()=>{throw Error('must not settle');},uid:()=>`id-${++n}`});
 const state=()=>({schema:{ACTOR:{fields:[]}},tables:{ACTOR:{}},runtime:{scope:{}}});
 const open=async()=>{const r=await controller.ensureBound(state);await archive.sync();return r;};
 const content=()=>JSON.parse(files.get(c.chatMetadata[NS].archive_book.name).entries[0].content);
 return {disk,files,writes,books,base,archive,controller,state,open,content,context,get c(){return c;},switch(value){c=typeof value==='string'?context(value):value;}};
}
test('opening creates one disabled complete archive and repeat/cold open reuse it',async()=>{
 const f=fixture();await Promise.all([f.open(),f.open()]);const id=f.c.chatMetadata[NS].chat_uid;
 assert.equal(f.files.size,1);assert.equal(f.writes.length,1);assert.equal(f.c.chatMetadata.world_info,'已有剧情书');assert.deepEqual(f.content().bundle,f.disk.get(id));assert.equal([...f.files.values()][0].entries[0].disable,true);
 const fresh=createChatArchiveStorage({storage:f.base,books:f.books,getContext:()=>f.c});await fresh.sync();assert.equal(f.writes.length,1);assert.equal(fresh.status().status,'saved');
});
test('old chat state is checkpointed without reset or replay',async()=>{
 const f=fixture();f.c.chatMetadata[NS]={chat_uid:'old',owner_chat_key:chatKey(f.c),enabled:true};const old={state:f.state(),local_revision:12,manual_edits:[{keep:'原修改'}]};f.disk.set('old',copy(old));await f.open();assert.deepEqual(f.content().bundle,old);assert.deepEqual(f.disk.get('old'),old);
});
test('independent chats and copied forks receive separate books, parent stays exact',async()=>{
 const f=fixture();await f.open();const a=f.c,book=a.chatMetadata[NS].archive_book.name,before=copy(f.files.get(book));f.switch('乙');await f.open();assert.equal(f.files.size,2);
 const branch=f.context('甲分支');branch.chatMetadata=copy(a.chatMetadata);f.switch(branch);await f.open();assert.equal(f.files.size,3);assert.notEqual(branch.chatMetadata[NS].archive_book.name,book);assert.deepEqual(f.files.get(book),before);
 f.switch(a);await f.open();assert.equal(f.files.size,3);
});
test('concurrent commits checkpoint latest revision without stale overwrite',async()=>{
 const f=fixture();await f.open();const id=f.c.chatMetadata[NS].chat_uid,b=copy(f.disk.get(id));await Promise.all([f.archive.storage.commit(id,1,{...b,local_revision:2,n:2}),f.archive.storage.commit(id,2,{...b,local_revision:3,n:3})]);assert.equal(f.content().revision,3);assert.equal(f.content().bundle.n,3);
});
test('book write failure keeps the committed state and retry only syncs',async()=>{
 const f=fixture();await f.open();const id=f.c.chatMetadata[NS].chat_uid,write=f.books.writeBook;f.books.writeBook=async()=>{throw Error('disk full');};const next={...f.disk.get(id),local_revision:2,kept:123};
 await assert.rejects(f.archive.storage.commit(id,1,next),e=>e.code==='ARCHIVE_SAVE_FAILED'&&e.databaseCommitReceipt.revision===2);assert.deepEqual(f.disk.get(id),next);assert.equal(f.archive.status().status,'error');assert.equal(f.content().revision,1);
 f.books.writeBook=write;await f.archive.sync();assert.equal(f.content().revision,2);assert.deepEqual(f.content().bundle,next);
});
test('creation saved then acknowledgement failed reuses same book on retry',async()=>{
 const f=fixture(),write=f.books.writeBook;let first=true;f.books.writeBook=async(...args)=>{await write(...args);if(first){first=false;throw Error('response lost');}};
 await assert.rejects(f.open(),/response lost/);await f.open();assert.equal(f.files.size,1);assert.equal(f.writes.length,1);assert.equal(f.archive.status().status,'saved');
});
test('failed metadata binding makes no worldbook and can be retried',async()=>{
 const f=fixture();f.c.saveMetadata=async()=>{if(f.c.chatMetadata[NS]?.archive_book)throw Error('metadata failure');return true;};await assert.rejects(f.open(),/metadata failure/);assert.equal(f.files.size,0);assert.equal(f.c.chatMetadata[NS].archive_book,undefined);f.c.saveMetadata=async()=>true;await f.open();assert.equal(f.files.size,1);
});
test('switch during book save completes only the captured owner',async()=>{
 const f=fixture();await f.open();const a=f.c,id=a.chatMetadata[NS].chat_uid,write=f.books.writeBook;let release;f.books.writeBook=async(...args)=>{await new Promise(r=>release=r);await write(...args);};
 const saving=f.archive.storage.commit(id,1,{...f.disk.get(id),local_revision:2});while(!release)await tick();f.switch('乙');release();await saving;assert.equal(f.c.chatMetadata[NS],undefined);assert.equal(f.archive.status(),null);f.switch(a);assert.equal(f.content().revision,2);
});
test('user entries survive updates; corruption, enabled entry and newer archive are rejected',async()=>{
 for(const type of ['extra','corrupt','enabled','newer']){
  const f=fixture();await f.open();const id=f.c.chatMetadata[NS].chat_uid,book=f.files.get(f.c.chatMetadata[NS].archive_book.name),row=book.entries[0];
  if(type==='extra'){book.custom={kept:true};book.entries[7]={uid:7,content:'用户附记',disable:false};await f.archive.storage.commit(id,1,{...f.disk.get(id),local_revision:2});assert.deepEqual(f.files.get(f.c.chatMetadata[NS].archive_book.name).entries[7],book.entries[7]);continue;}
  if(type==='corrupt')row.content='broken';if(type==='enabled')row.disable=false;
  if(type==='newer'){const v=f.content();f.disk.get(id).local_revision=0;assert.equal(v.revision,1);}
  const before=copy(book);await assert.rejects(f.archive.sync(),e=>e.code==='ARCHIVE_SAVE_FAILED');assert.deepEqual(f.files.get(f.c.chatMetadata[NS].archive_book.name),before);
 }
});
test('native adapter flushes, saves immediately, and reads server bytes with no cache',async()=>{
 const calls=[],native={world_names:['存档'],async flushWorldInfoSaves(){calls.push('flush');},async updateWorldInfoList(){calls.push('list');},async saveWorldInfo(name,data,immediate){calls.push(['save',name,immediate]);}};
 const books=createNativeChatArchiveBooks({native,getContext:()=>({getRequestHeaders:()=>({'x-test':'test'})}),fetchImpl:async(url,options)=>{assert.equal(url,'/api/worldinfo/get');assert.equal(options.cache,'no-store');assert.equal(JSON.parse(options.body).name,'存档');return {ok:true,json:async()=>({entries:{}})};}});
 assert.deepEqual(await books.listBooks(),['存档']);await books.writeBook('存档',{entries:{}});await books.readBook('存档');assert(calls.some(c=>Array.isArray(c)&&c[2]===true));
});
test('production host saves initial state, manual changes and confirmation through one archive boundary',async()=>{
 const f=fixture(),catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url))),source={prompts:copy(baseline.prompts),order:copy(baseline.prompt_order[1].order)};
 const host=createMatrixHost({manualReview:true,getContext:()=>f.c,getSource:()=>source,loadCatalog:async()=>catalog,storage:f.base,archiveBooks:f.books,persistSettings:async()=>true,persistMetadata:async()=>true});
 await host.ensureBound();await host.mutate(e=>{e.registerTable('TEST_ACTOR',[{key:'name',type:'TEXT'},{key:'hp',type:'NUMBER'}]);e.newRecord('TEST_ACTOR',{name:'旅人',hp:10},'actor');});
 f.c.chat.push({mes:'<reply><body>1 推门受伤。</body><cells>旅人.hp: -3 | P1</cells><archive/></reply>'});await host.sync();assert.equal(f.content().bundle.state.tables.TEST_ACTOR.actor.values.hp,10);
 const view=await host.listTurnReviews();await host.confirmTurn({...view.reviews[0],contextKey:view.contextKey,expectedRevision:view.revision});assert.equal(f.content().bundle.state.tables.TEST_ACTOR.actor.values.hp,7);assert.deepEqual(f.content().bundle,JSON.parse(JSON.stringify(await host.export())));assert.equal(host.archiveStatus().status,'saved');
});
test('explicit archive retry completes a failed first activation without a chat switch',async()=>{
 const f=fixture(),catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url))),source={prompts:copy(baseline.prompts),order:copy(baseline.prompt_order[1].order)};
 const host=createMatrixHost({getContext:()=>f.c,getSource:()=>source,loadCatalog:async()=>catalog,storage:f.base,archiveBooks:f.books,persistSettings:async()=>true,persistMetadata:async()=>true,retryBinding:()=>activation.retry()});
 const activation=createDefaultActivation({getContext:()=>f.c,activatePreset:async()=>({active:true}),ensureBound:options=>host.ensureBound(options)}),write=f.books.writeBook;
 f.books.writeBook=async()=>{throw Error('first save failed');};await assert.rejects(activation.start(),/first save failed/);assert.equal(f.c.chatMetadata[NS].enabled,false);const before=copy([...f.disk.values()][0]);
 f.books.writeBook=write;await host.syncArchive();await activation.ready();assert.equal(f.c.chatMetadata[NS].enabled,true);assert.deepEqual(f.content().bundle,before);assert.equal(f.files.size,1);
});
