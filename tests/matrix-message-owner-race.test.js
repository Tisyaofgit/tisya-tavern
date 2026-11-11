import test from 'node:test';
import assert from 'node:assert/strict';
import {Controller,NS,chatKey} from '../engine/controller.mjs';
const clone=structuredClone;
function fixture(stage){
 let replaced=false,serial=0;
 const writes=[],requests=[],updates=[],saved=[];
 const ctx={chatId:'same-chat',characterId:0,extensionSettings:{},chatMetadata:{},chat:[{mes:'原owner正文',extra:stage==='save'?{}:{[NS]:{uid:'original-uid'}}}],saveMetadata:async()=>{},saveChat:async()=>{saved.push(clone(ctx.chat));replace('save');}};
 ctx.chatMetadata[NS]={chat_uid:'original-owner',owner_chat_key:chatKey(ctx),enabled:true};
 const bundles=new Map([['original-owner',{state:{schema:{},tables:{},sentinel:7},journal:{entries:[]},local_revision:1}],['replacement-owner',{state:{schema:{},tables:{},sentinel:77},journal:{entries:[]},local_revision:9}]]);
 const replacementChat=[{mes:'换绑后的原文',extra:{[NS]:{uid:'replacement-uid'}}}];
 function replace(at){if(stage!==at||replaced)return;replaced=true;ctx.chatMetadata[NS]={chat_uid:'replacement-owner',owner_chat_key:chatKey(ctx),enabled:true};ctx.chat=clone(replacementChat);}
 const storage={get:async id=>{replace('read');return clone(bundles.get(id));},commit:async(id,n,value)=>{assert.equal(bundles.get(id).local_revision,n);writes.push({id,value:clone(value)});bundles.set(id,clone(value));replace('commit');return true;}};
 const controller=new Controller({getContext:()=>ctx,storage,uid:()=>`id-${++serial}`,onUpdate:x=>updates.push(x),request:async(_p,input)=>{requests.push(clone(input));replace('request');return {bundle:clone(input.bundle),materials:{oldOwner:true},packet:'old-owner-packet'};}});
 return {controller,ctx,writes,requests,updates,saved,bundles,replacementChat,replace};
}
for(const stage of ['queued','save','read'])test(`same chat key rebound during ${stage} cannot send new content under old owner`,async()=>{
 const f=fixture(stage);let release;
 if(stage==='queued')f.controller.owners.set('original-owner',new Promise(r=>release=r));
 const running=f.controller.run();
 if(stage==='queued'){await Promise.resolve();f.replace('queued');release();}
 const response=await running;
 assert.equal(response,null);assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);
 assert.equal(f.bundles.get('original-owner').local_revision,1);assert.equal(f.bundles.get('replacement-owner').local_revision,9);
 assert.deepEqual(f.ctx.chat,f.replacementChat);assert.equal(f.updates.length,0);
});
for(const stage of ['request','commit'])test(`same chat key rebound during ${stage} preserves captured owner settlement without projecting it`,async()=>{
 const f=fixture(stage),response=await f.controller.run();
 assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].messages,[{uid:'original-uid',role:'assistant',text:'原owner正文'}]);
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].id,'original-owner');assert.equal(response.bundle.local_revision,2);
 assert.equal(f.bundles.get('replacement-owner').local_revision,9);assert.equal(f.bundles.get('replacement-owner').state.sentinel,77);
 assert.deepEqual(f.ctx.chat,f.replacementChat);assert.equal(f.updates.length,0);
 assert.equal(f.controller.materials.has('replacement-owner'),false);assert.equal(f.controller.packets.has('replacement-owner'),false);
});
