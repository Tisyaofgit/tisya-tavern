import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';
import {createIdentityService} from '../user-identity-service.js';
import {createConfiguration} from '../engine/config.mjs';

async function setup({initialOrigin=null,resumeError=null,origins=[]}={}){
 const window=new Window(),root=window.document.createElement('main');window.document.body.append(root);
 const ctx={chatId:'a',characterId:0,characters:[{avatar:'a.png'}],chatMetadata:{},name1:'原身份',extensionSettings:{},powerUserSettings:{personas:{old:'原身份'},persona_descriptions:{old:{description:'原心愿'}},persona_description:'原心愿'}};
 const config=createConfiguration({getContext:()=>ctx,persist:async()=>true});
 const calls={previews:[],saves:[],resumes:0,slots:[],avatars:[]};let failSlot=false;
 const identity=createIdentityService({getContext:()=>ctx,getAvatar:()=> 'old',applyActive:()=>{},persistSettings:async()=>true,persistChat:async()=>true,resolveOrigin:async reference=>{const row=origins.find(row=>row.book===reference.book&&row.originId===reference.originId&&row.id===reference.id&&row.rev===reference.rev);assert(row,'exact fixed source');return {name:row.name,description:row.description,reference:structuredClone(reference)};},slotHost:{ensureAvatar:async id=>{calls.avatars.push(id);if(failSlot)throw Error('原点头像上传中断');return id;},initialize:async(id,profile)=>{calls.slots.push(id);ctx.powerUserSettings.personas[id]=profile.name;ctx.powerUserSettings.persona_descriptions[id]={description:profile.description};}}});
 const legacyOrigins={list:async()=>structuredClone(origins),preview:async ref=>{calls.previews.push(structuredClone(ref));return {name:'固定第三版',description:'旧原点的完整原文',personaId:'old',reference:structuredClone(ref)};},save:async draft=>{calls.saves.push(structuredClone(draft));ctx.powerUserSettings.personas.old=draft.name;ctx.powerUserSettings.persona_descriptions.old.description=draft.description;ctx.powerUserSettings.persona_description=draft.description;},resume:async()=>{calls.resumes++;if(resumeError)throw Error(resumeError);}};
 const roles={database:true,ensureBook:async()=>{},list:async()=>({entries:[],schema:[]})};
 const mount=()=>mountMatrixIdentity(window.document,root,{identity,config,roles,legacyOrigins,initialOrigin});let view=mount();await view.ready;
 const button=label=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);
 return {window,root,get view(){return view;},ctx,calls,button,failSlot(value){failSlot=value;},async reopen(){view.dispose();view=mount();await view.ready;},async close(){view.dispose();await window.happyDOM.abort();}};
}

test('an explicit legacy origin is reviewed and saved inside the unified identity form with no old page',async()=>{
 const ref={book:'旧原点书',originId:'origin',id:'person',rev:3};const f=await setup({initialOrigin:ref});try{
  assert.deepEqual(f.calls.previews,[ref]);assert.equal(f.root.querySelector('.tisya-user'),null);assert(f.root.querySelector('[data-legacy-origins]'));assert.match(f.root.textContent,/旧原点的完整原文/);
  assert.equal(await f.view.saveDraft(),false);assert.equal(f.calls.saves.length,0);
  const checkbox=f.root.querySelector('[data-origin-reviewed]');checkbox.checked=true;checkbox.dispatchEvent(new f.window.Event('change'));
  assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.calls.saves.length,1);assert.deepEqual(f.calls.saves[0].reference,ref);assert.equal(f.ctx.powerUserSettings.personas.old,'固定第三版');assert.equal(f.view.state().dirty,false);
  assert.equal(await f.view.saveDraft(),true);assert.equal(f.calls.saves.length,1);
 }finally{await f.close();}
});

test('legacy recovery is a draft until shared save and a failed recovery remains visible',async()=>{
 const f=await setup({resumeError:'没有已绑定的旧存档，未建立新账本'});try{
  await f.button('核对未完成的原点绑定').onclick();await f.view.settled();assert.equal(f.calls.resumes,0);assert.equal(f.view.state().dirty,true);
  assert.equal(await f.view.saveDraft(),false);assert.equal(f.calls.resumes,1);assert.match(f.root.textContent,/未建立新账本/);assert.equal(f.view.state().dirty,true);
  await f.view.discardDraft();assert.equal(f.view.state().dirty,false);assert.equal(f.ctx.powerUserSettings.personas.old,'原身份');
 }finally{await f.close();}
});

test('a reviewed fixed legacy origin creates one independent slot through unified save',async()=>{
 const row={book:'旧原点书',originId:'origin',id:'person',rev:3,name:'固定人物',description:'保留完整原文'},f=await setup({origins:[row]});try{
  await f.button('读取已有原点档案').onclick();await f.button('为此人物另建身份槽位').onclick();
  assert.equal(f.calls.slots.length,0);assert.equal(await f.view.saveDraft(),false);assert.equal(f.calls.slots.length,0);
  const reviewed=f.root.querySelector('[data-origin-create-reviewed]');reviewed.checked=true;reviewed.dispatchEvent(new f.window.Event('change'));
  assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.calls.slots.length,1);const id=f.calls.slots[0];assert.equal(f.ctx.powerUserSettings.personas[id],'固定人物');assert.deepEqual(f.ctx.powerUserSettings.persona_descriptions[id].tisyaOrigin,{book:'旧原点书',originId:'origin',id:'person',rev:3});assert.equal(f.ctx.powerUserSettings.personas.old,'原身份');assert.equal(f.ctx.powerUserSettings.persona_description,'原心愿');assert.equal(f.calls.saves.length,0);assert.equal(f.view.state().dirty,false);
  assert.equal(await f.view.saveDraft(),true);assert.equal(f.calls.slots.length,1);
 }finally{await f.close();}
});

test('a failed legacy origin slot resumes its durable identity after reopening the unified page',async()=>{
 const row={book:'旧原点书',originId:'origin',id:'person',rev:3,name:'固定人物',description:'保留完整原文'},f=await setup({origins:[row]});try{
  await f.button('读取已有原点档案').onclick();await f.button('为此人物另建身份槽位').onclick();const reviewed=f.root.querySelector('[data-origin-create-reviewed]');reviewed.checked=true;reviewed.dispatchEvent(new f.window.Event('change'));f.failSlot(true);
  assert.equal(await f.view.saveDraft(),false);const id=f.ctx.powerUserSettings.tisya_identity_creation_pending.id;assert.match(f.root.textContent,/头像上传中断/);assert.equal(f.calls.slots.length,0);
  await f.reopen();assert(f.root.querySelector('[data-identity-creation-pending]'));f.failSlot(false);assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.deepEqual(f.calls.slots,[id]);assert.equal(f.ctx.powerUserSettings.tisya_identity_creation_pending,undefined);assert.equal(f.ctx.powerUserSettings.personas.old,'原身份');assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});
