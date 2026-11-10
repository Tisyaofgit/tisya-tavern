import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountIdentityPage} from './legacy-fixtures/user-identity-page.js';
import {createIdentityService} from '../user-identity-service.js';

// The actual UI and identity service run against in-memory native/worldbook
// boundaries. Draft generation below is deterministic; no model is invoked.
let serial=0;
function fixture({initialOrigin=null,initialDesign=null}={}){
 const chatId='origin-recovery-'+(++serial);
 const ctx={chatId,characterId:0,characters:[{avatar:'card'}],name1:'甲',chatMetadata:{},powerUserSettings:{
  personas:{a:'甲'},persona_description:'原设定',persona_descriptions:{a:{description:'原设定'}}
 }};
 const reference={book:'固定原点书',originId:'origin-a',id:'person-a',rev:1};
 let active='a',settingsWrites=0,slotInitializations=0;
 const service=createIdentityService({
  getContext:()=>ctx,getAvatar:()=>active,
  applyActive:(id,name)=>{active=id;ctx.name1=name;ctx.powerUserSettings.persona_description=ctx.powerUserSettings.persona_descriptions[id].description;},
  persistSettings:async()=>{settingsWrites++;return true;},persistChat:async()=>true,
  resolveOrigin:async input=>({name:'新人物',description:'完整新人物设定',reference:structuredClone(input)}),
  slotHost:{
   ensureAvatar:async id=>id,
   initialize:async(id,profile)=>{slotInitializations++;ctx.powerUserSettings.personas[id]=profile.name;ctx.powerUserSettings.persona_descriptions[id]={description:profile.description};}
  }
 });
 const creates=[],createFromOrigin=service.createFromOrigin;
 service.createFromOrigin=async input=>{creates.push({chatId:ctx.chatId,input:structuredClone(input)});return createFromOrigin(input);};
 const preview={format:'tisya.origin-persona/1',personaId:'a',name:'固定原点姓名',description:'固定原点的完整设定',reference,world:'world-a',chat:chatId,before:{id:'a',name:'甲',description:'原设定'},originStamp:'origin-stamp'};
 const errors=[];
 const tables={state:()=>({busy:false,jobs:[],progress:null}),reportError:(_task,error)=>errors.push(error.message),previewIdentityOrigin:async()=>structuredClone(preview)};
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);
 const ui=mountIdentityPage(root,{service,tables,initialOrigin:initialOrigin?reference:null,initialDesign,onClose(){}});
 const q=selector=>root.querySelector(selector);
 const press=async action=>{const button=q('[data-user-action="'+action+'"]');assert(button,action);button.click();await ui.settled();};
 const input=(selector,value)=>{const node=q(selector);assert(node,selector);node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const check=selector=>{const node=q(selector);assert(node,selector);node.checked=true;node.dispatchEvent(new w.Event('change',{bubbles:true}));};
 return {ctx,chatId,reference,preview,service,tables,w,root,ui,q,press,input,check,creates,errors,active:()=>active,settingsWrites:()=>settingsWrites,slotInitializations:()=>slotInitializations,
  async close(){await ui.discardDraft();ui.dispose();await w.happyDOM.abort();}};
}

test('legacy origin recovery resumes the reviewed partial binding without repeating its stale preview write',async()=>{
 const f=fixture({initialOrigin:true});let originWrites=0,resumes=0,pending=null;
 try{
  f.tables.saveIdentityOrigin=async input=>{
   originWrites++;
   assert.equal(pending,null,'the old preview must not be written again while its original binding is pending');
   pending=structuredClone(input);
   const actual=f.service.read();
   await f.service.saveProfile({id:input.personaId,revision:actual.revision,name:input.name,description:input.description});
   throw Error('原生 user 已更新，但档案绑定未完成；模拟世界书确认中断');
  };
  f.tables.resumeUserBinding=async expected=>{
   resumes++;
   assert(pending,'the first write must have a recoverable binding');
   assert(expected,'the UI must retain the reviewed target while recovering its partial binding');
   assert.equal(expected.personaId,pending.personaId);
   assert.deepEqual(expected.reference,pending.reference);
   assert.equal(expected.world,pending.world);assert.equal(expected.chat,pending.chat);
   pending=null;return {state:'bound',personaId:expected.personaId,origin:expected.reference};
  };
  await f.ui.ready;f.check('[data-origin-reviewed]');
  assert.equal(await f.ui.saveDraft(),false);
  assert.equal(originWrites,1);assert.equal(resumes,0);assert(pending);
  assert.equal(f.ctx.powerUserSettings.personas.a,'固定原点姓名');
  assert.equal(f.ui.hasDraft(),true);
  f.q('[data-user-tab="manage"]').click();await f.press('origin-resume');
  assert.equal(await f.ui.saveDraft(),true,'explicit recovery must work even though the first stage changed the native identity revision');
  assert.equal(originWrites,1);assert.equal(resumes,1);assert.equal(pending,null);
  assert.equal(f.ui.hasDraft(),false);assert.equal(f.ui.requestLeave().allowed,true);
  assert.equal(f.ctx.powerUserSettings.persona_descriptions.a.description,'固定原点的完整设定');
  assert.equal(f.active(),'a');assert.equal(f.creates.length,0);
 }finally{await f.close();}
});

test('legacy creation checks the original chat after draft persistence before creating a persona slot and retries only that slot',async()=>{
 const f=fixture({initialDesign:'idea'});let originSaves=0;
 try{
  f.tables.createIdentityDraft=async()=>({format:'tisya.identity-creation/1',raw:'模拟模型原答',proposal:{artifacts:{base:{changes:[]}}}});
  f.tables.saveIdentityDraft=async()=>{originSaves++;f.ctx.chatId='different-chat';return [{...f.reference,name:'新人物'}];};
  f.input('[data-goal]','在原会话创建人物');await f.press('generate');f.check('[data-reviewed]');
  assert.equal(await f.ui.saveDraft(),false);
  assert.equal(originSaves,1,'the origin has already been saved and must remain available for a retry');
  assert.equal(f.creates.length,0,'a changed chat must block the next dependent write before createFromOrigin runs');
  assert.equal(f.slotInitializations(),0);assert.equal(f.settingsWrites(),0);
  assert.deepEqual(f.ctx.powerUserSettings.personas,{a:'甲'});assert.equal(f.ui.hasDraft(),true);
  assert.match(f.root.textContent,/会话已改变/);
  f.ctx.chatId=f.chatId;
  assert.equal(await f.ui.saveDraft(),true);
  assert.equal(originSaves,1,'retry must reuse the saved origin instead of creating a duplicate');
  assert.equal(f.creates.length,1);assert.equal(f.creates[0].chatId,f.chatId);assert.equal(f.slotInitializations(),1);
  assert.equal(Object.keys(f.ctx.powerUserSettings.personas).length,2);assert.equal(f.active(),'a');
  assert.equal(f.ui.hasDraft(),false);assert.equal(f.ui.requestLeave().allowed,true);
 }finally{await f.close();}
});
