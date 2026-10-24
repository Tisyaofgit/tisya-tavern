import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimePreset} from '../../../v3/preset-template.mjs';
import {createInstallerHarness} from './installer-harness.mjs';
test('actual manifest interceptor sends editable Tisya with current card/persona and embedded A',async()=>{
 const p=createRuntimePreset('writer');p.prompts.find(x=>x.identifier==='main').content='SELECTED_CUSTOM_MAIN';p.prompts.find(x=>x.identifier==='main').role='user';
 const f=await createInstallerHarness({mvu:false,getRuntimePreset:s=>s==='writer'?p:createRuntimePreset(s)});
 try{f.ctx.characters=[{data:{name:'CARD_NAME',description:'CARD_DESCRIPTION'}}];f.ctx.characterId=0;f.ctx.powerUserSettings={persona_description:'USER_PERSONA_DATA'};f.ctx.name1='用户';await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.requests.length,2);const writer=f.requests[1].messages;assert(writer.some(m=>m.role==='user'&&m.content==='SELECTED_CUSTOM_MAIN'));for(const text of ['CARD_DESCRIPTION','USER_PERSONA_DATA'])assert.equal(JSON.stringify(writer).split(text).length-1,1);assert(!JSON.stringify(writer).includes('{{tisya_v3:'));}finally{f.api.dispose();}
});
