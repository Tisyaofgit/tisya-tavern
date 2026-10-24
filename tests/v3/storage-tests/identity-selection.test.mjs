import test from 'node:test';
import assert from 'node:assert/strict';
import {selectArchiveIdentity} from '../../../v3/identity-selection.mjs';
import {createIdentityService} from '../../../user-identity-service.js';

test('native create-and-bind saves and switches the bound archive before changing card connections',async()=>{
 const calls=[],ctx={chatId:'chat',characterId:0,characters:[{avatar:'card.png'}],chatMetadata:{persona:'old'},powerUserSettings:{personas:{old:'旧身份'},persona_descriptions:{old:{connections:[{type:'character',id:'card.png'}]}},default_persona:'old'}};
 let avatar='old',binding={pointer:{archiveId:'archive',bindingRevision:4},binding:{player:{id:'old'}}};
 const books={binding:async()=>structuredClone(binding),select:async request=>{
  assert.equal(avatar,'old');assert.equal(ctx.chatMetadata.persona,'old');
  assert.deepEqual(ctx.powerUserSettings.persona_descriptions.old.connections,[{type:'character',id:'card.png'}]);
  assert.equal(request.expectedBindingRevision,4);assert.deepEqual(request.preferenceOwner,{kind:'player',id:'new'});
  calls.push('archive');avatar=request.player.id;ctx.chatMetadata.persona=avatar;
  binding={pointer:{archiveId:'archive',bindingRevision:5},binding:{player:request.player}};return {status:'complete'};
 }};
 const api=createIdentityService({getContext:()=>ctx,getAvatar:()=>avatar,applyActive:id=>{calls.push('native');avatar=id;},persistSettings:async()=>true,persistChat:async()=>true,
  prepareArchiveSelection:id=>selectArchiveIdentity(books,ctx.powerUserSettings.personas,id),
  afterSelect:async id=>assert.equal(binding.binding.player.id,id),
  nativePersona:{available:()=>true,read:()=>null,create:async()=>{ctx.powerUserSettings.personas.new='新身份';ctx.powerUserSettings.persona_descriptions.new={description:'新设定'};return {id:'new'};}}
 });
 await api.create({revision:api.read().revision,name:'新身份',description:'新设定'});
 assert.deepEqual(calls,['archive','native']);assert.equal(api.hasPending(),false);
 assert.equal(ctx.powerUserSettings.default_persona,'old');assert.equal(ctx.chatMetadata.persona,'new');
 assert.deepEqual(ctx.powerUserSettings.persona_descriptions.new.connections,[{type:'character',id:'card.png'}]);
 assert.equal(binding.pointer.archiveId,'archive');
});

test('archive failure stops native persona and connection writes',async()=>{
 const ctx={chatId:'chat',characterId:0,characters:[{avatar:'card.png'}],chatMetadata:{persona:'old'},powerUserSettings:{personas:{old:'旧',next:'新'},persona_descriptions:{}}};let writes=0;
 const api=createIdentityService({getContext:()=>ctx,getAvatar:()=> 'old',applyActive:()=>writes++,persistSettings:async()=>{writes++;return true;},persistChat:async()=>{writes++;return true;},prepareArchiveSelection:()=>{throw Error('archive pending');}});
 await assert.rejects(api.select({id:'next',revision:api.read().revision,chat:true,character:true}),/archive pending/);
 assert.equal(writes,0);assert.deepEqual(ctx.powerUserSettings.persona_descriptions,{});assert.equal(ctx.chatMetadata.persona,'old');
});

test('archive identity selection rejects wrong readback and never creates a new archive',async()=>{
 let reads=0,request;const books={binding:async()=>++reads===1?{pointer:{archiveId:'a',bindingRevision:2},binding:{player:{id:'old'}}}:{pointer:{archiveId:'other'},binding:{player:{id:'new'}}},select:async x=>{request=x;return {status:'complete'};}};
 await assert.rejects(selectArchiveIdentity(books,{new:'新'},'new'),/读回/);
 assert.equal(request.archiveId,undefined);assert.equal(request.core,undefined);assert.equal(request.origin,undefined);
});


import {setup} from './fixture.mjs';
test('real book manager preserves archive identity and uses its save-before-activate transition',async()=>{
 const x=await setup(),before=await x.f.manager.binding(),start=x.f.calls.length;
 await selectArchiveIdentity(x.f.manager,{'player-2':'第二身份'},'player-2');
 const after=await x.f.manager.binding();assert.equal(after.pointer.archiveId,before.pointer.archiveId);assert.equal(after.binding.player.id,'player-2');assert.deepEqual(after.binding.preference.owner,{kind:'player',id:'player-2'});
 const calls=x.f.calls.slice(start).map(c=>c[0]);assert.ok(calls.indexOf('saveCurrentBranch')>=0);assert.ok(calls.indexOf('saveCurrentBranch')<calls.indexOf('activateUser'));
 assert.deepEqual(after.binding.origin,before.binding.origin);assert.deepEqual(after.binding.core,before.binding.core);
});
