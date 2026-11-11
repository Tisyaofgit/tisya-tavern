import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller,NS,chatKey,captureMessages} from '../engine/controller.mjs';
const clone=structuredClone;
function fixture({stage,failAt,switchOnRetry=false}={}){
 const originalError=new Error('original-'+failAt),saved=[],requests=[],writes=[],updates=[];
 let serial=0,appended=false;
 const context=id=>({chatId:id,characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveMetadata:async()=>{},saveChat:async function(){if(failAt==='save')throw originalError;saved.push({chatId:this.chatId,chat:clone(this.chat)});append('save');}});
 const a=context('a'),b=context('b');
 for(const ctx of [a,b])ctx.chatMetadata[NS]={chat_uid:'owner-'+ctx.chatId,owner_chat_key:chatKey(ctx),enabled:true};
 b.chat=[{is_user:false,mes:'新聊天未初始化原文',extra:{}}];
 let current=a;
 const disk=new Map([['owner-a',{state:{schema:{},tables:{},sentinel:7},journal:{entries:[]},local_revision:1}],['owner-b',{state:{schema:{},tables:{},sentinel:77},journal:{entries:[]},local_revision:9}]]);
 function append(at){if(stage===at&&!appended){appended=true;a.chat.push({is_user:false,mes:'中性开场白',extra:{}});}}
 const storage={get:async id=>{if(failAt==='read')throw originalError;append('read');return clone(disk.get(id));},commit:async(id,n,value)=>{if(failAt==='commit')throw originalError;assert.equal(disk.get(id).local_revision,n);writes.push({id,value:clone(value)});disk.set(id,clone(value));append('commit');return true;}};
 const controller=new Controller({getContext:()=>current,storage,uid:()=>`new-${++serial}`,request:async(_p,input)=>{if(failAt==='request')throw originalError;requests.push(clone(input));append('request');return {bundle:clone(input.bundle),materials:{},packet:''};},onUpdate:result=>{updates.push(result);if(result.pending&&switchOnRetry)current=b;}});
 return {a,b,saved,requests,writes,disk,updates,controller,originalError};
}
test('retry stops when chat changes before the queued retry can start',async()=>{
 const f=fixture({stage:'request',switchOnRetry:true}),b=clone({chat:f.b.chat,metadata:f.b.chatMetadata}),storedB=clone(f.disk.get('owner-b'));
 await f.controller.run();
 assert.deepEqual({chat:f.b.chat,metadata:f.b.chatMetadata},b,'old retry must not seed or rewrite new chat');
 assert.deepEqual(f.disk.get('owner-b'),storedB,'old retry must not commit new owner');
 assert.equal(f.requests.length,1);assert.equal(f.writes.length,0);
});
test('invalid existing uid is a visible error with no state reset',async()=>{
 const f=fixture();f.a.chat.push({mes:'保留',extra:{[NS]:{uid:42}}});const before=clone([...f.disk]);
 await assert.rejects(f.controller.run(),e=>e.code==='MESSAGE_IDENTITY_INVALID');
 assert.deepEqual([...f.disk],before);assert.equal(f.writes.length,0);assert.equal(f.requests.length,0);
 assert.equal(f.a.chat[0].extra[NS].uid,42);
});
for(const failAt of ['read','request','commit','save'])test(`original ${failAt} error is not swallowed`,async()=>{
 const f=fixture({failAt});if(failAt==='save')f.a.chat.push({mes:'需要保存身份'});
 const before=clone([...f.disk]);await assert.rejects(f.controller.run(),e=>e===f.originalError);
 assert.deepEqual([...f.disk],before);assert.equal(f.writes.length,0);
});
test('greeting appended during save is assigned a persisted id before request',async()=>{
 const f=fixture({stage:'save'});f.a.chat.push({is_user:true,mes:'已有用户消息'});
 await f.controller.run();
 assert.equal(f.a.chat.length,2);assert.equal(f.saved.length,2);assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].messages.length,2);assert.deepEqual(f.saved.at(-1).chat,f.a.chat);
 assert.equal(f.disk.get('owner-a').state.sentinel,7);assert.equal(f.disk.get('owner-b').state.sentinel,77);
});
test('missing namespace capture does not write ids or discard pending source',()=>{
 const ctx={chat:[{mes:'保留',extra:{}}]},before=clone(ctx);
 assert.throws(()=>captureMessages(ctx),e=>e.code==='MESSAGE_IDENTITY_MISSING');assert.deepEqual(ctx,before);
});
