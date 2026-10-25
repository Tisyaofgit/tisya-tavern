import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFlow,sourceText,change,extraction,proposal} from './w34-flow-harness.mjs';
import {mountProgressBubble} from '../../../v3/bubble.mjs';
import {mountWorkbench} from '../../../v3/workbench.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pet={getAnchor:()=>({visible:true,moving:false,head:{x:40,y:180,width:45,height:55}})};
async function until(fn,label){for(let i=0;i<100;i++){if(fn())return;await wait(5);}assert.fail('Timed out waiting for '+label);}
async function promptly(value,label){let timer;try{return await Promise.race([Promise.resolve(value),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' waited for the model')),250);})]);}finally{clearTimeout(timer);}}
function modelQueue(){
 const calls=[];
 const request=(task,input,{options})=>new Promise((resolve,reject)=>{
  assert.equal(typeof options.onProgress,'function','The actual application must forward the streaming observer');
  const call={task,input,options,resolve,reject};calls.push(call);
  options.onProgress({stage:'waiting'});
  const stop=()=>reject(options.signal.reason??new DOMException('Stopped','AbortError'));
  if(options.signal.aborted)stop();else options.signal.addEventListener('abort',stop,{once:true});
 });
 return {calls,request};
}
const initialized=()=>extraction([change('new:shopkeeper','objects',{名称:'阿绫',类型:'character',描述:sourceText.card},sourceText.card)]);
async function beginInitialization(f){await f.click('初始化／从资料提炼');await f.click('读取角色卡和绑定世界书');}
function bubbleFor(t,f){const routes=[],bubble=mountProgressBubble(f.view.root.ownerDocument,{pet,progress:f.app.progress,capabilities:f.app.capabilities,onOpen:route=>routes.push(route),isPanelOpen:()=>false});t.after(()=>bubble.dispose());return {bubble,routes};}
const state=f=>f.app.capabilities.action('design.state',{});

test('actual application streams task state before completion and keeps one initialization alive while the workbench is suspended',async t=>{
 const model=modelQueue(),f=await setupFlow(t,{request:model.request});await beginInitialization(f);
 const {bubble,routes}=bubbleFor(t,f),generate=f.button('生成初始化草案');generate.click();
 assert.equal(generate.disabled,true,'The pressed control must acknowledge the click immediately');
 assert.match(generate.textContent,/生成|处理/);assert.notEqual(generate.textContent,'生成初始化草案');
 await until(()=>model.calls.length===1,'initial model request');
 const call=model.calls[0],session=await f.app.getSession(),before=await session.storage.read();
 assert.equal(f.view.requestSuspend().allowed,true,'Reading native chat must not await the model');
 assert.equal(f.view.requestLeave().allowed,false,'Destructive context changes remain guarded');
 await promptly(f.view.resume(),'Reopening the same workbench');
 await promptly(f.view.navigate('extract'),'Returning to the same active initialization');
 assert.equal(model.calls.length,1,'Resume must not restart a paid request');
 assert.ok(f.shadow.querySelector('.design-progress'),'Workbench must show current task before result');
 assert.equal(f.shadow.querySelector('.design-progress progress').hasAttribute('value'),false,'Unknown model length has no fabricated percentage');
 const streamed='当前可见输出 '+ '原'.repeat(2200)+' <img src=x onerror=bad()> 流式末尾';
 call.options.onProgress({stage:'receiving',characters:streamed.length,text:streamed});
 await until(()=>bubble.root.shadowRoot.textContent.includes(String(streamed.length)),'live pet character count');
 assert.equal(bubble.root.hidden,false);assert.match(bubble.root.shadowRoot.textContent,/初始化/);
 bubble.root.shadowRoot.querySelector('button').click();assert.deepEqual(routes,['extract']);
 const live=await state(f);assert.equal(live.progress.status,'running');assert.equal(live.progress.characters,streamed.length);assert.equal(live.draft,null);
 assert.equal(live.previewText.length,2000);assert.ok(live.previewText.endsWith('流式末尾'));
 const details=f.shadow.querySelector('[data-design-stream]');assert.ok(details);details.open=true;details.dispatchEvent(new f.view.root.ownerDocument.defaultView.Event('toggle'));
 await until(()=>details.querySelector('pre').textContent.endsWith('流式末尾'),'live visible output preview');
 assert.equal(details.querySelector('img'),null,'Stream content is rendered as text, never executable markup');
 call.options.onProgress({stage:'receiving',characters:streamed.length+4,text:streamed+'继续输出'});
 await until(()=>details.querySelector('pre').textContent.endsWith('继续输出'),'subsequent streamed output without polling');
 const snapshot=await f.app.capabilities.getSnapshot();assert.equal('previewText' in snapshot,false);assert.equal('text' in snapshot.designProgress,false);
 assert.deepEqual(await session.storage.read(),before,'Partial streaming never writes an archive');
 call.resolve(initialized());await f.view.settled();
 const done=await state(f);assert.equal(done.progress.status,'awaiting-review');assert.ok(done.draft?.changes.length);
 assert.ok(f.button('保存已选设定'),'The full result returns to the existing review controls');
 await until(()=>/确认|校对|完成/.test(bubble.root.shadowRoot.textContent),'ready state on pet');
 assert.deepEqual(await session.storage.read(),before,'Complete generation still waits for user confirmation');
 assert.equal(model.calls.length,1);
});

test('a new workbench attached to the still-running application observes and recovers the same completed draft',async t=>{
 const model=modelQueue(),f=await setupFlow(t,{request:model.request});await beginInitialization(f);
 f.button('生成初始化草案').click();await until(()=>model.calls.length===1,'in-flight task');
 const document=f.view.root.ownerDocument;f.view.dispose();
 const replacement=mountWorkbench(document,document.body,{capabilities:f.app.capabilities,stylesheetURL:'http://localhost/workbench.css'});t.after(()=>replacement.dispose());
 await replacement.ready;await replacement.navigate('extract');
 assert.equal(model.calls.length,1);assert.equal(replacement.shadow.querySelector('[data-design-generate]').disabled,true,'A new view must observe the already running job');
 assert.equal(replacement.requestSuspend().allowed,true,'Recovered task can be minimized');assert.equal(replacement.requestLeave().allowed,false,'Recovered running task still guards destructive context changes');
 assert.equal([...replacement.shadow.querySelectorAll('button')].find(b=>b.textContent==='停止请求').hidden,false,'Recovered task can be cancelled from the new workbench');
 model.calls[0].options.onProgress({stage:'receiving',characters:12,text:'新视图仍收到同一份草案'});
 assert.match(replacement.shadow.textContent,/12/);
 model.calls[0].resolve(initialized());
 await until(()=>[...replacement.shadow.querySelectorAll('button')].some(b=>b.textContent==='保存已选设定'),'completed draft in replacement view');
 assert.equal(model.calls.length,1);assert.ok((await state(f)).draft);
});

test('pet cancellation aborts the real service signal, keeps typed inputs, and ignores late streamed fragments',async t=>{
 const model=modelQueue(),f=await setupFlow(t,{request:model.request});await beginInitialization(f);
 f.fill('这次想得到什么','保留修理铺设定');f.fill('待整理的资料','额外补充草稿');
 const {bubble}=bubbleFor(t,f);f.button('生成初始化草案').click();await until(()=>model.calls.length===1,'model request');
 const call=model.calls[0];call.options.onProgress({stage:'receiving',characters:8,text:'还没有完成的输出'});
 await until(()=>bubble.root.shadowRoot.querySelector('.stop')&&!bubble.root.shadowRoot.querySelector('.stop').hidden,'pet cancel control');
 bubble.root.shadowRoot.querySelector('.stop').click();await f.view.settled();
 assert.equal(call.options.signal.aborted,true);assert.equal((await state(f)).progress.status,'cancelled');
 const stopped=await state(f);call.options.onProgress({stage:'receiving',characters:999,text:'迟到内容不得复活'});
 assert.deepEqual(await state(f),stopped);
 assert.equal(f.shadow.querySelector('[aria-label="这次想得到什么"]').value,'保留修理铺设定');
 assert.equal(f.shadow.querySelector('[aria-label="待整理的资料"]').value,'额外补充草稿');
 assert.ok(f.button('生成初始化草案'));assert.equal(f.button('生成初始化草案').disabled,false);
 assert.equal(stopped.draft,null);assert.match(f.shadow.textContent,/停止/);
 assert.equal((await (await f.app.getSession()).storage.read()).commits.length,0);
});

test('stream failure stays visible in the workbench and pet without saving or losing the form',async t=>{
 const model=modelQueue(),f=await setupFlow(t,{request:model.request});await beginInitialization(f);
 f.fill('这次想得到什么','失败后仍保留');const {bubble}=bubbleFor(t,f);
 f.button('生成初始化草案').click();await until(()=>model.calls.length===1,'failed model request');
 model.calls[0].options.onProgress({stage:'receiving',characters:3,text:'半份稿'});model.calls[0].reject(Error('上游连接已断开，请重试'));
 await f.view.settled();assert.match(f.shadow.querySelector('[role="alert"]').textContent,/连接已断开/);
 await until(()=>bubble.root.shadowRoot.textContent.includes('连接已断开'),'persistent pet failure');
 assert.equal(f.shadow.querySelector('[aria-label="这次想得到什么"]').value,'失败后仍保留');
 assert.equal((await state(f)).progress.status,'failed');assert.equal((await state(f)).draft,null);
 assert.equal((await (await f.app.getSession()).storage.read()).commits.length,0);
});

test('native history progress counts only real assistant floors and advances after each actual result',async t=>{
 const model=modelQueue(),f=await setupFlow(t,{request:model.request});await f.click('历史补录');await f.click('读取当前聊天历史');
 f.fill('从第几楼',2);f.fill('到第几楼',5);const {bubble}=bubbleFor(t,f);
 f.button('生成历史补录草案').click();await until(()=>model.calls.length===1,'first historical floor');
 let p=(await state(f)).progress;assert.equal(p.total,2);assert.equal(p.completed,0);assert.equal(p.floor,3);
 assert.equal(model.calls[0].input.archiveSource.floor,2);
 model.calls[0].resolve(proposal([change('new:event','events',{名称:'旧钥匙交接',经过:sourceText.history},sourceText.history)]));
 await until(()=>model.calls.length===2,'second historical floor');p=(await state(f)).progress;
 assert.equal(p.total,2);assert.equal(p.completed,1);assert.equal(p.floor,5);
 await until(()=>bubble.root.shadowRoot.querySelector('progress')?.value===1,'pet floor progress');
 assert.equal(bubble.root.shadowRoot.querySelector('progress').max,2);
 assert.equal(model.calls[1].input.archiveSource.floor,4);assert.equal((await state(f)).draft,null);
 model.calls[1].resolve(proposal([change('new:event','events',{名称:'收好钥匙',经过:sourceText.later},sourceText.later)]));await f.view.settled();
 p=(await state(f)).progress;assert.equal(p.completed,2);assert.equal(p.total,2);assert.equal(p.status,'awaiting-review');
 assert.equal((await state(f)).draft.changes.length,2);assert.equal(model.calls.length,2);
 assert.equal((await (await f.app.getSession()).storage.read()).commits.length,0,'History review is not an automatic save');
});
