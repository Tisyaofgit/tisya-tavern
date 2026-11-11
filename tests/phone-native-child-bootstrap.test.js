import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneDatabaseStorage} from '../engine/phone-database.mjs';
import {chatKey,NS} from '../engine/controller.mjs';

const seed=JSON.parse(readFileSync(new URL('../phone-seed.json',import.meta.url),'utf8'));
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const clone=structuredClone;
async function fixture(){
 const disk=new Map();let writes=0;
 const c={chatId:'native-parent',characterId:1,chatMetadata:{integrity:'explicit-native-branch-integrity'},extensionSettings:{},chat:[{is_user:true,mes:'保留用户前缀'},{is_user:false,mes:'原初始化候选',swipe_id:0,swipes:['原初始化候选','子分支新候选'],swipe_info:[{extra:{}},{extra:{}}]}],saveChat:async()=>true};
 const storage={get:async id=>clone(disk.get(id)),set:async(id,v)=>{writes++;disk.set(id,clone(v));},commit:async(id,revision,v)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;writes++;disk.set(id,clone(v));return true;}};
 const options={getContext:()=>c,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistMetadata:async()=>true,persistSettings:async()=>true};
 const parentHost=createMatrixHost(options);await parentHost.ensureDatabase();const parentKey=chatKey(c);
 const phone=createPhoneService({seed,contextKey:parentKey,storage:createPhoneDatabaseStorage({database:parentHost.createPhoneDatabaseBridge(),contextKey:parentKey})});await phone.init();
 const parentId=c.chatMetadata[NS].chat_uid,parent=clone(disk.get(parentId));
 c.chatId='native-parent-child';c.chatMetadata={...clone(c.chatMetadata),main_chat:'native-parent'};
 const host=createMatrixHost(options);await host.ensureDatabase();const childKey=chatKey(c),childId=c.chatMetadata[NS].chat_uid;
 assert.notEqual(childId,parentId);assert.ok(c.chatMetadata[NS].origin_chat_keys.includes(parentKey));assert.equal((await host.readDatabase()).phoneDetached,false);
 c.chat[1].mes=c.chat[1].swipes[1];c.chat[1].swipe_id=1;
 return {c,host,disk,parentId,parent,childKey,writes:()=>writes,open:()=>createPhoneService({seed,contextKey:childKey,storage:createPhoneDatabaseStorage({database:host.createPhoneDatabaseBridge(),contextKey:childKey})})};
}

test('a verified native child recovers only the inherited neutral bootstrap on the same UID candidate',async()=>{
 const f=await fixture(),before=clone([...f.disk]),writes=f.writes();
 assert.equal((await f.host.readDatabase()).phoneDetached,false);const phone=f.open();await phone.init();
 assert.equal(phone.getState().contextKey,f.childKey);assert.equal(f.writes(),writes);assert.deepEqual([...f.disk],before);assert.deepEqual(f.disk.get(f.parentId),f.parent);
});

for(const kind of ['wrong-parent','missing-integrity','cross-group-origin'])test(`inherited bootstrap refuses ${kind} without writing either archive`,async()=>{
 const f=await fixture();
 if(kind==='wrong-parent')f.c.chatMetadata.main_chat='unrelated-parent';
 if(kind==='missing-integrity')delete f.c.chatMetadata.integrity;
 if(kind==='cross-group-origin')f.c.chatMetadata[NS].origin_chat_keys=[JSON.stringify(['group','unrelated-group','native-parent'])];
 const before=clone([...f.disk]),writes=f.writes();assert.equal((await f.host.readDatabase()).phoneDetached,true);
 await assert.rejects(f.open().init(),e=>e.code==='PHONE_DATABASE_DETACHED');assert.equal(f.writes(),writes);assert.deepEqual([...f.disk],before);
});
