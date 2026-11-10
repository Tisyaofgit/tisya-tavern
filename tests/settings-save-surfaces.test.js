import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountThemeWorkbench} from '../theme-workbench.js';
import {createChatLoadingController,mountChatLoadingSettings} from '../chat-loading.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const button=(root,text)=>[...root.querySelectorAll('button')].find(node=>node.textContent===text);
function themeFixture(){
 const window=new Window(),document=window.document,slot=document.createElement('div');document.body.append(slot);
 let settings={},writes=0,fail=false;
 const view=mountThemeWorkbench(document,slot,{getSettings:()=>settings,saveAppearance:async(owner,value)=>{
  if(fail)throw Error('fixture appearance unavailable');
  writes++;settings={...settings,显示区块:{...settings.显示区块,[owner]:structuredClone(value)}};
 }});
 return {window,view,root:slot.firstElementChild.shadowRoot,settings:()=>settings,writes:()=>writes,fail:value=>{fail=value;},close:async()=>{view.dispose();await window.happyDOM.abort();}};
}

test('theme page uses one bottom action pair and prompts once before a dirty page switch',async()=>{
 const f=themeFixture();try{
  assert.deepEqual([...f.root.querySelectorAll('footer>button:not([hidden])')].map(n=>n.textContent),['取消修改','保存']);
  [...f.root.querySelectorAll('.theme-card')].find(n=>n.textContent.includes('明潮')).click();await f.view.settled();
  assert.equal(f.writes(),0);
  f.root.querySelector('[data-page=fonts]').click();await tick();
  assert.equal(f.root.querySelectorAll('[role=dialog]').length,1);
  f.root.querySelector('[data-page=effects]').click();await tick();
  assert.equal(f.root.querySelectorAll('[role=dialog]').length,1);assert.equal(f.writes(),0);
  button(f.root,'继续编辑').click();await tick();
  assert.equal(f.root.querySelector('[data-page=themes]').getAttribute('aria-current'),'true');
  assert.equal(f.view.state().dirty,true);
  button(f.root,'保存').click();await f.view.settled();
  assert.equal(f.writes(),1);assert.equal(f.settings().显示区块.extensions.底图色调,'明潮');
  f.root.querySelector('[data-page=fonts]').click();await tick();await f.view.settled();
  assert.equal(f.root.querySelector('[data-page=fonts]').getAttribute('aria-current'),'true');
  assert.equal(f.root.querySelector('[role=dialog]'),null);
 }finally{await f.close();}
});

test('theme save failure keeps its draft and original error in the same navigation prompt',async()=>{
 const f=themeFixture();try{
  [...f.root.querySelectorAll('.theme-card')].find(n=>n.textContent.includes('明潮')).click();await f.view.settled();
  f.fail(true);f.root.querySelector('[data-page=effects]').click();await tick();
  button(f.root,'保存并切换').click();await tick();await f.view.settled();await tick();
  assert.equal(f.root.querySelectorAll('[role=dialog]').length,1);assert.equal(f.view.state().dirty,true);
  assert.equal(f.root.querySelector('[data-page=themes]').getAttribute('aria-current'),'true');
  assert.match(f.root.querySelector('.tisya-unsaved-prompt [role=alert]').textContent,/fixture appearance unavailable/);
  assert.equal(f.writes(),0);
  f.fail(false);button(f.root,'保存并切换').click();await tick();await f.view.settled();await tick();
  assert.equal(f.writes(),1);assert.equal(f.view.requestLeave().allowed,true);
  assert.equal(f.root.querySelector('[data-page=effects]').getAttribute('aria-current'),'true');
 }finally{await f.close();}
});

test('cancelled block-owner navigation restores the selector and retains all field changes',async()=>{
 const f=themeFixture();try{
  f.root.querySelector('[data-page=blocks]').click();await tick();await f.view.settled();
  const spacing=f.root.querySelector('[aria-label=正文行距]');spacing.value='2.2';spacing.onchange();
  const owner=f.root.querySelector('[aria-label=选择区块]');owner.value='"title"';owner.onchange();await tick();
  assert.equal(owner.value,'"body"');button(f.root,'继续编辑').click();await tick();
  assert.equal(f.root.querySelector('[aria-label=选择区块]').value,'"body"');assert.equal(spacing.value,'2.2');
  button(f.root,'取消修改').click();await f.view.settled();assert.equal(f.view.state().dirty,false);assert.equal(f.writes(),0);
 }finally{await f.close();}
});

test('chat-loading footer and leave prompt preserve failed settings until a successful retry',async()=>{
 const window=new Window(),document=window.document,native={chat_truncation:100};let fail=true,writes=0;
 const controller=createChatLoadingController({powerUser:native,persist:async()=>{if(fail)throw Error('fixture disk unavailable');writes++;return true;},clearCache:async()=>{}});
 const view=mountChatLoadingSettings(document,document.body,{controller});
 try{
  assert.deepEqual([...view.root.querySelectorAll('footer>button')].map(n=>n.textContent),['取消修改','保存']);
  button(view.root,'设为 10 条').click();const leaving=view.confirmLeave();await tick();
  assert.equal(await view.confirmLeave(),false);button(view.root,'保存并切换').click();await view.settled();await tick();
  assert.equal(native.chat_truncation,100);assert.equal(view.root.querySelector('[aria-label=首批消息条数]').value,'10');
  assert.match(view.root.querySelector('.tisya-unsaved-prompt [role=alert]').textContent,/fixture disk unavailable/);
  fail=false;button(view.root,'保存并切换').click();assert.equal(await leaving,true);
  assert.equal(native.chat_truncation,10);assert.equal(writes,1);assert.equal(view.requestLeave().allowed,true);
 }finally{view.dispose();await window.happyDOM.abort();}
});

test('reopening advanced appearance preserves its draft for the shared bottom save',async()=>{
 const f=themeFixture();try{
  f.root.querySelector('[data-page=blocks]').click();await tick();await f.view.settled();
  const opener=button(f.root,'打开此区块的方案管理');opener.closest('details').open=true;
  opener.click();await f.view.settled();
  const child=f.root.querySelector('.tisya-appearance');
  const spacing=()=>[...child.querySelectorAll('fieldset')].find(node=>node.querySelector('legend')?.textContent==='正文行距');
  button(spacing(),'2.2').click();assert.equal(f.view.state().dirty,true);
  for(let i=0;i<2;i++){opener.click();await f.view.settled();}
  assert.equal(f.root.querySelector('.tisya-appearance'),child);
  assert.equal(button(spacing(),'2.2').getAttribute('aria-pressed'),'true');
  assert.equal(f.view.state().dirty,true);assert.equal(f.view.requestLeave().allowed,false);
  assert.equal(f.root.querySelectorAll('[role=dialog]').length,0);assert.equal(f.writes(),0);
  assert.deepEqual(f.settings(),{});
  button(f.root,'保存').click();await f.view.settled();
  assert.equal(f.writes(),1);assert.equal(f.settings().显示区块.body.正文行距,2.2);
  assert.equal(f.view.state().dirty,false);assert.equal(f.view.requestLeave().allowed,true);
 }finally{await f.close();}
});
