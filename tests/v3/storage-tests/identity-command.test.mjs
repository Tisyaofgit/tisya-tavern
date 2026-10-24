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
