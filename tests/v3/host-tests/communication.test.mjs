import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness} from './installer-harness.mjs';
import {createCommunication} from '../../../communication.js';
test('existing communication talk delegates to the single companion service, without the old request callback or second history',async()=>{
 const f=await createInstallerHarness({provider:({stage})=>{assert.equal(stage,'companion');return '我听见了。';}});f.ctx.chatId='chat';f.ctx.characterId=0;f.ctx.characters=[{avatar:'card'}];const companion=f.api.createCompanion({readMode:()=> 'independent',writeMode:async()=>{}});let oldCalls=0;
 const communication=createCommunication({getContext:()=>f.ctx,persist:async c=>c.saveChat(),request:async()=>{oldCalls++;throw Error('old API path');}});communication.setCompanion(companion);
 try{communication.setDraft('小缇，听得到吗？');assert.equal(await communication.talk(),'我听见了。');assert.equal(oldCalls,0);assert.equal(f.requests.length,1);assert.equal(communication.view().draft,'');assert.equal(communication.view().turns[0].assistant,'我听见了。');assert.equal(Object.values(f.ctx.chatMetadata.缇斯亚场外交流.scopes)[0].turns.length,0);assert.equal((await companion.getChatState()).messages.length,1);}finally{communication.dispose();f.api.dispose();}
});
