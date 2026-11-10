import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountIdentityPage} from './legacy-fixtures/user-identity-page.js';
import {createIdentityService} from '../user-identity-service.js';
let serial=0;
function fixture(){
 const c={chatId:'identity-draft-'+(++serial),characterId:0,characters:[{avatar:'card'}],name1:'甲',chatMetadata:{},chat:[{name:'旧署名',mes:'原文'}],powerUserSettings:{personas:{a:'甲',b:'乙'},persona_description:'甲的心愿',persona_descriptions:{a:{description:'甲的心愿',unknown:false},b:{description:'乙的心愿',unknown:0}},default_persona:'a'}};
 let active='a',failSettings=false,failChat=false,settingsWrites=0,chatWrites=0,profiles=0,selections=0,resumes=0,closed=0;
 const service=createIdentityService({getContext:()=>c,getAvatar:()=>active,applyActive:(id,name)=>{active=id;c.name1=name;c.powerUserSettings.persona_description=c.powerUserSettings.persona_descriptions[id].description;},persistSettings:async()=>{settingsWrites++;if(failSettings)throw Error('保存中断');return true;},persistChat:async()=>{chatWrites++;return !failChat;}});
 const saveProfile=service.saveProfile,select=service.select,resume=service.resume;
 service.saveProfile=async input=>{profiles++;return saveProfile(input);};service.select=async input=>{selections++;return select(input);};service.resume=async()=>{resumes++;return resume();};
 const tables={state:()=>({busy:false,jobs:[],progress:null}),reportError:()=>{}};
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);let ui;
 const mount=()=>ui=mountIdentityPage(root,{service,tables,onClose:()=>{closed++;}});mount();
 const q=s=>root.querySelector(s),press=async action=>{q('[data-user-action="'+action+'"]').click();await ui.settled();},tab=id=>q('[data-user-tab="'+id+'"]').click();
 const input=(selector,value)=>{const n=q(selector);n.value=value;n.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const change=(selector,value)=>{const n=q(selector);if(n.type==='checkbox')n.checked=value;else n.value=value;n.dispatchEvent(new w.Event('change',{bubbles:true}));};
 return {c,service,w,root,q,press,tab,input,change,mount,get ui(){return ui;},active:()=>active,writes:()=>({settingsWrites,chatWrites,profiles,selections,resumes,closed}),failSettings:v=>failSettings=v,failChat:v=>failChat=v,async close(){await ui.discardDraft();ui.dispose();await w.happyDOM.abort();}};
}
test('legacy identity has one footer save and stages mixed profiles, scope, and selected identity across tabs',async()=>{
 const f=fixture();try{
  assert.deepEqual([...f.root.querySelectorAll('footer button')].map(n=>n.textContent),['取消修改','保存']);
  assert.equal([...f.root.querySelectorAll('button')].filter(n=>/保存|使用并绑定/.test(n.textContent)).length,2); // save and export only
  f.input('[data-field=name]','新甲');f.change('[data-user-select]','b');f.input('[data-field=description]','新乙心愿');f.tab('bindings');f.change('[data-scope=global]',true);f.tab('profile');
  assert.equal(f.q('[data-field=description]').value,'新乙心愿');assert.equal(f.active(),'a');assert.equal(f.writes().settingsWrites,0);
  await f.press('save');assert.equal(f.active(),'b');assert.equal(f.c.powerUserSettings.personas.a,'新甲');assert.equal(f.c.powerUserSettings.persona_descriptions.b.description,'新乙心愿');assert.equal(f.c.powerUserSettings.persona_descriptions.b.unknown,0);assert.equal(f.c.chatMetadata.persona,'b');assert.equal(f.c.powerUserSettings.default_persona,'b');assert.deepEqual(f.c.chat,[{name:'旧署名',mes:'原文'}]);assert.equal(f.ui.hasDraft(),false);assert.equal(f.writes().profiles,2);
  f.ui.dispose();f.mount();assert.equal(f.q('[data-field=description]').value,'新乙心愿');assert.equal(f.ui.requestLeave().allowed,true);
 }finally{await f.close();}
});
test('legacy cancel discards mixed staged edits without persistence and restores selection',async()=>{
 const f=fixture();try{f.input('[data-field=name]','待取消');f.change('[data-user-select]','b');f.tab('bindings');f.change('[data-scope=global]',true);await f.press('discard');f.tab('profile');assert.equal(f.q('[data-field=name]').value,'甲');assert.equal(f.active(),'a');assert.equal(f.writes().settingsWrites,0);assert.equal(f.ui.hasDraft(),false);}finally{await f.close();}
});
test('legacy leave prompt coalesces navigation and keeps failed save editable before retry',async()=>{
 const f=fixture();try{
  f.input('[data-field=description]','保留我');let result=f.ui.confirmLeave();assert.equal(await f.ui.confirmLeave(),false);assert.equal(f.root.querySelectorAll('[role=dialog]').length,1);[...f.root.querySelectorAll('.tisya-unsaved-prompt button')].find(n=>n.textContent==='继续编辑').click();assert.equal(await result,false);
  f.failSettings(true);result=f.ui.confirmLeave();[...f.root.querySelectorAll('.tisya-unsaved-prompt button')].find(n=>n.textContent==='保存并切换').click();await f.ui.settled();await new Promise(r=>setTimeout(r,0));assert.match(f.root.querySelector('.tisya-unsaved-prompt [role=alert]').textContent,/保存中断/);assert.equal(f.ui.hasDraft(),true);assert.equal(f.q('[data-field=description]').value,'保留我');
  f.failSettings(false);[...f.root.querySelectorAll('.tisya-unsaved-prompt button')].find(n=>n.textContent==='保存并切换').click();assert.equal(await result,true);assert.equal(f.c.powerUserSettings.persona_descriptions.a.description,'保留我');assert.equal(f.ui.requestLeave().allowed,true);
 }finally{await f.close();}
});
test('legacy retries only unfinished binding after profile persistence succeeds',async()=>{
 const f=fixture();try{f.change('[data-user-select]','b');f.input('[data-field=name]','新乙');f.failChat(true);await f.press('save');assert(f.service.hasPending());assert.equal(f.writes().profiles,1);assert.equal(f.writes().selections,1);assert.equal(f.ui.hasDraft(),true);f.failChat(false);await f.press('save');assert.equal(f.service.hasPending(),false);assert.equal(f.writes().profiles,1);assert.equal(f.writes().selections,1);assert.equal(f.writes().resumes,1);assert.equal(f.ui.hasDraft(),false);}finally{await f.close();}
});
test('legacy retains unsaved fields and scope on page recreation',async()=>{
 const f=fixture();try{f.input('[data-field=name]','稍后保存');f.tab('bindings');f.change('[data-scope=global]',true);f.ui.dispose();f.mount();assert.equal(f.q('[data-field=name]').value,'稍后保存');f.tab('bindings');assert.equal(f.q('[data-scope=global]').checked,true);assert.equal(f.writes().settingsWrites,0);await f.press('save');assert.equal(f.c.powerUserSettings.personas.a,'稍后保存');assert.equal(f.c.powerUserSettings.default_persona,'a');}finally{await f.close();}
});
test('legacy refuses external identity revisions and a changed chat before any write',async()=>{
 const f=fixture();try{f.input('[data-field=name]','旧页改名');f.c.powerUserSettings.personas.a='另处修改';await f.press('save');assert.equal(f.writes().settingsWrites,0);assert.match(f.root.textContent,/其他位置修改/);f.c.chatId='other';await f.press('save');assert.equal(f.writes().settingsWrites,0);assert.match(f.root.textContent,/会话已改变/);assert.equal(f.q('[data-field=name]').value,'旧页改名');}finally{await f.close();}
});

test('legacy recovery saves scope edits made after a failed earlier binding',async()=>{
 const f=fixture();try{
  f.change('[data-user-select]','b');f.failChat(true);await f.press('save');assert(f.service.hasPending());
  f.tab('bindings');f.change('[data-scope=global]',true);f.failChat(false);await f.press('save');
  assert.equal(f.c.powerUserSettings.default_persona,'b');assert.equal(f.writes().resumes,1);assert.equal(f.writes().selections,2);assert.equal(f.ui.hasDraft(),false);
 }finally{await f.close();}
});
