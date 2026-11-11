import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.TISYA_REPLAY_SOURCE??new URL('..',import.meta.url).pathname,load=file=>import(pathToFileURL(path.join(root,file)).href);
const {currentPhoneHost,matrixMemoryStorage}=await load('tests/fixtures/phone-host-current.mjs');
const {createPhoneService}=await load('phone-core.mjs');
const {createPhoneTurnHost,PHONE_TURN_KEY}=await load('phone-turn-host.js');
const {chatKey,NS}=await load('engine/controller.mjs');
const seed=JSON.parse(fs.readFileSync(path.join(root,'phone-seed.json'),'utf8'));

for(const damage of ['missing','changed-signature'])test(`rejected-source replay refuses ${damage} user binding before changing the saved request`,async()=>{
 const c={chatId:'replay-proof',characterId:1,chatMetadata:{},extensionSettings:{},chat:[{is_user:true,mes:'原输入'},{is_user:false,mes:'原正文'}],saveChat:async()=>true};let writes=0,id=0;
 const disk=matrixMemoryStorage({onWrite:async()=>{writes++;}}),db=await currentPhoneHost({context:c,storage:disk}),service=createPhoneService({seed,contextKey:chatKey(c),storage:db.phoneStorage,idFactory:()=>`proof-${++id}`});await service.init();
 const turn=createPhoneTurnHost({getContext:()=>c,phoneService:service});await service.dispatch({kind:'search',query:'已绑定的查询'});const request=await turn.begin();
 const user={is_user:true,mes:'下一条输入'};c.chat.push(user);await turn.directions();c.chat.push({is_user:false,mes:'<reply><body>保留正文</body><extra><phone>{bad}</phone></extra></reply>'});assert.equal((await turn.finished({accepted:true})).failed,true);
 const original=structuredClone(user.extra[PHONE_TURN_KEY]);if(damage==='missing')user.extra[PHONE_TURN_KEY].requests=[];else user.extra[PHONE_TURN_KEY].requests[0].promptSignature='0'.repeat(64);
 const owner=c.chatMetadata[NS].chat_uid,before=await disk.get(owner),count=writes;
 await assert.rejects(turn.begin('swipe'),e=>e.code==='PHONE_SOURCE_OWNERSHIP');assert.equal(writes,count);assert.deepEqual(await disk.get(owner),before);
 user.extra[PHONE_TURN_KEY]=original;const restored=await turn.begin('swipe');assert.equal(restored.requestId,request.requestId);assert.deepEqual(restored.messages,request.messages);await turn.stopped();
});
