import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller,NS,chatKey,captureMessages} from '../engine/controller.mjs';
const clone=structuredClone;
function fixture(stage){
 let sequence=0,changed=false,current,requestCount=0,commits=0;
 const saved=[],requests=[],updates=[];
 const ctx={chatId:'new-chat',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveMetadata:async()=>{},saveChat:async()=>{saved.push(clone(ctx.chat));}};
 current=ctx;ctx.chatMetadata[NS]={chat_uid:'engine-a',owner_chat_key:chatKey(ctx),enabled:true};
 let bundle={state:{schema:{},tables:{}},journal:{entries:[]},local_revision:1};
 function append(at){if(stage===at&&!changed){changed=true;ctx.chat.push({is_user:false,mes:'中性开场白',extra:{}});}}
 const storage={get:async()=>{append('read');return clone(bundle);},commit:async(_id,revision,value)=>{assert.equal(bundle.local_revision,revision);commits++;bundle=clone(value);append('commit');return true;}};
 const request=async(_path,input)=>{requestCount++;requests.push(clone(input.messages));append('request');if(stage==='switch'&&!changed){changed=true;current={chatId:'other-chat',characterId:0,chatMetadata:{},chat:[{is_user:false,mes:'另一会话原文',extra:{}}]};}return {bundle:clone(input.bundle),materials:{},packet:''};};
 const controller=new Controller({getContext:()=>current,storage,request,uid:()=>`uid-${++sequence}`,onUpdate:value=>updates.push(value)});
 return {ctx,controller,saved,requests,updates,get current(){return current;},get commits(){return commits;},get requestCount(){return requestCount;},get bundle(){return bundle;}};
}
for(const stage of ['read','request','commit'])test(`new greeting appended during ${stage} receives a persisted UID before retry`,async()=>{
 const f=fixture(stage);await f.controller.run();
 assert.equal(f.ctx.chat.length,1);assert.equal(f.ctx.chat[0].mes,'中性开场白');
 const uid=f.ctx.chat[0].extra[NS].uid;assert.equal(uid,'uid-1');
 assert.equal(f.saved.length,1);assert.equal(f.saved[0][0].extra[NS].uid,uid);
 assert.deepEqual(f.requests.at(-1),[{uid,role:'assistant',text:'中性开场白'}]);
 assert.equal(f.commits,stage==='commit'?2:1);
 assert.equal(f.requestCount,stage==='read'?1:2);
 assert.ok(f.updates.some(value=>value.pending===true));
});
test('a real chat switch retains old-owner settlement without seeding the new chat',async()=>{
 const f=fixture('switch'),response=await f.controller.run();
 assert.equal(response.bundle.local_revision,2);assert.equal(f.commits,1);assert.equal(f.saved.length,0);
 assert.deepEqual(f.current.chat,[{is_user:false,mes:'另一会话原文',extra:{}}]);
});
test('unseeded capture is explicit and read-only rather than silently accepting a source',()=>{
 const ctx={chat:[{is_user:false,mes:'中性开场白',extra:{}}]},before=clone(ctx);
 assert.throws(()=>captureMessages(ctx),error=>error.code==='MESSAGE_IDENTITY_MISSING');assert.deepEqual(ctx,before);
});
test('pending accepted source and existing UID remain unchanged',()=>{
 const accepted={uid:'accepted-uid',role:'assistant',text:'已经采纳的中性正文'};
 const ctx={chat:[{mes:'尚未采纳的新正文',extra:{[NS]:{uid:accepted.uid,pending_sha256:'draft-hash',pending_previous:accepted}}}]},before=clone(ctx);
 assert.deepEqual(captureMessages(ctx),[accepted]);assert.deepEqual(ctx,before);
});
