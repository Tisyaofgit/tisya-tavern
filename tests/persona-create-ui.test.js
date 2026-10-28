import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {mountIdentityPage} from '../user-identity-page.js';import {createIdentityService} from '../user-identity-service.js';
test('saving an AI character through actual UI buttons creates its own slot and keeps the old active identity',async()=>{
 const c={chatId:'one',characterId:0,characters:[{avatar:'world.png'}],chatMetadata:{},powerUserSettings:{personas:{old:'旧人物'},persona_descriptions:{old:{description:'旧设定'}},default_persona:'old'}},ref={book:'原点',originId:'o',id:'new-person',rev:1};let active='old',saved=0;
 const service=createIdentityService({getContext:()=>c,getAvatar:()=>active,applyActive:id=>active=id,persistSettings:async()=>true,persistChat:async()=>true,slotHost:{ensureAvatar:async id=>id,initialize:async(id,p)=>{c.powerUserSettings.personas[id]=p.name;c.powerUserSettings.persona_descriptions[id]={description:p.description};}},resolveOrigin:async()=>({name:'新旅人',description:'完整人物设定',reference:ref})});
 const tables={state:()=>({busy:false,jobs:[],progress:null}),createIdentityDraft:async()=>({proposal:{artifacts:{base:{changes:[{table:'objects',values:{名称:'新旅人',类型:'character',描述:'完整人物设定'}}]}}}}),saveIdentityDraft:async()=>{saved++;return [{...ref,name:'新旅人'}];},identityOrigins:async()=>[{...ref,name:'新旅人'}],reportError:()=>{}};
 const w=new Window(),container=w.document.createElement('div');w.document.body.append(container);const ui=mountIdentityPage(container,{service,tables,initialDesign:'idea',onClose:()=>{}});
 container.querySelector('[data-goal]').value='一位新旅人';container.querySelector('[data-user-action="generate"]').click();await ui.settled();container.querySelector('[data-reviewed]').checked=true;container.querySelector('[data-user-action="creation-save"]').click();await ui.settled();
 assert.equal(saved,1);assert.equal(Object.keys(c.powerUserSettings.personas).length,2);assert.equal(active,'old');assert.equal(c.powerUserSettings.persona_descriptions.old.description,'旧设定');assert.equal(c.powerUserSettings.default_persona,'old');assert.match(container.textContent,/新人物槽位已建立/);
 ui.dispose();await w.happyDOM.abort();
});
