import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityCommand} from '../../../v3/identity-command.mjs';
import {createIdentityService} from '../../../user-identity-service.js';
test('explicit identity command uses real selection and chat/archive ordering; ordinary roleplay cannot trigger it',async()=>{
 let active='one';const calls=[],ctx={chatId:'chat',characters:[{avatar:'card'}],characterId:0,chatMetadata:{},powerUserSettings:{personas:{one:'阿一',two:'阿二'},persona_descriptions:{one:{},two:{}}}};
 const service=createIdentityService({getContext:()=>ctx,getAvatar:()=>active,applyActive:id=>{calls.push('activate');active=id;},persistSettings:async()=>true,persistChat:async()=>true,prepareArchiveSelection:async id=>{calls.push('archive');assert.equal(active,'one');assert.equal(id,'two');}}),command=createIdentityCommand(service);
 for(const text of ['他想切换用户身份为阿二。','能不能介绍用户身份？','阿二说：“切换用户身份为阿一”。'])assert.equal(await command(text),null);
 const result=await command('请切换当前用户身份为“阿二”。');assert.equal(result.personaId,'two');assert.equal(ctx.chatMetadata.persona,'two');assert.deepEqual(calls,['archive','activate']);assert.deepEqual(ctx.powerUserSettings.persona_descriptions.two,{});
});
test('duplicate names demand stable id; unknown and failed archive switch cannot activate another persona',async()=>{
 let writes=0;const state={revision:'r',scope:{chatId:'c'},personas:[{id:'a',name:'同名'},{id:'b',name:'同名'}]},service={read:()=>state,select:async()=>{writes++;throw Error('archive unavailable');}},command=createIdentityCommand(service);
 await assert.rejects(command('切换用户身份为同名'),/重名/);await assert.rejects(command('切换用户身份为不存在'),/没有找到/);assert.equal(writes,0);await assert.rejects(command('切换用户身份为b'),/archive unavailable/);assert.equal(writes,1);
});

test('identity command excludes a second send and story capture until the new identity record is saved',async()=>{
 const {createCompanionService}=await import('../../../v3/host-companion.mjs');let active='one',release,entered,calls=0;const started=new Promise(r=>entered=r),blocked=new Promise(r=>release=r),ctx={chat:[],chatMetadata:{}};
 const chat=createCompanionService({getContext:()=>ctx,getScope:async()=>({chat:'c',player:active}),persist:async()=>{},readMode:()=> 'independent',writeMode:async()=>{},request:async()=>{calls++;return 'API answer';},executeCommand:async text=>{if(text!=='切换用户身份为阿二')return null;entered();await blocked;active='two';chat.contextChanged();return {answer:'已切换为阿二'};}});
 try{const pending=chat.sendMessage('切换用户身份为阿二');await started;assert.equal(chat.busy(),true);await assert.rejects(chat.sendMessage('第二条'),{code:'COMPANION_BUSY'});await assert.rejects(chat.queueWithStory('插队'),{code:'COMPANION_BUSY'});await assert.rejects(chat.captureStory({requestKey:'race',generationType:'normal'}),{code:'COMPANION_BUSY'});release();assert.equal((await pending).source,'command');const state=await chat.getChatState();assert.equal(state.scope.player,'two');assert.equal(state.messages.length,1);assert.equal(state.messages[0].source,'command');assert.equal(calls,0);assert.equal(chat.busy(),false);await chat.sendMessage('继续聊');assert.equal(calls,1);}finally{release?.();chat.dispose();}
});
test('failed identity command releases its dispatch lock without inventing a successful reply',async()=>{
 const {createCompanionService}=await import('../../../v3/host-companion.mjs'),ctx={chat:[],chatMetadata:{}};let failed=true;
 const chat=createCompanionService({getContext:()=>ctx,getScope:async()=>({chat:'c'}),persist:async()=>{},readMode:()=> 'independent',writeMode:async()=>{},request:async()=> '正常回复',executeCommand:async()=>{if(failed)throw Error('archive failed');return null;}});
 try{await assert.rejects(chat.sendMessage('切换用户身份为阿二'),/archive failed/);assert.equal(chat.busy(),false);assert.equal((await chat.getChatState()).messages.length,0);failed=false;assert.equal((await chat.sendMessage('继续聊')).answer,'正常回复');}finally{chat.dispose();}
});
