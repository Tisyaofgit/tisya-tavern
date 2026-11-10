import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneApp,phoneSeed,renderPhoneFrozen} from '../phone-app.mjs';

async function fixture({delayedStorage=false}={}){
  const win=new Window({url:'http://localhost/phone.html'}),doc=win.document;
  doc.body.innerHTML='<div id="phone-root"></div>';const root=doc.getElementById('phone-root');
  let app,saved=null,serial=0;
  const service=createPhoneService({seed:phoneSeed,contextKey:'dom-test',idFactory:()=>`dom-${++serial}`,storage:{async load(){return saved},async save(value){if(delayedStorage)await new Promise(r=>setTimeout(r,3));saved=structuredClone(value);return {revision:value.revision}}},onChange:()=>app?.refresh()});
  await service.init();app=await createPhoneApp({root,service,doc,win});
  const settle=async()=>{await app.settled();await new Promise(r=>setTimeout(r,0));await app.settled();};
  const click=async selector=>{const target=root.querySelector(selector);assert.ok(target,selector);target.click();await settle();};
  const input=(selector,value,caret=null)=>{const target=root.querySelector(selector);assert.ok(target,selector);target.focus();target.value=value;if(caret!==null)target.setSelectionRange(caret,caret);target.dispatchEvent(new win.Event('input',{bubbles:true}));return target;};
  const submit=async selector=>{const form=root.querySelector(selector);assert.ok(form,selector);form.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await settle();};
  const close=()=>{app.dispose();win.close();};
  return {win,doc,root,service,app,settle,click,input,submit,close};
}

test('DOM forum reactions hit the selected floor, toggle once, and scalar reply submits',async()=>{
  const f=await fixture();f.app.open('forum-encore');assert.equal(f.root.querySelectorAll('form[data-phone-send]').length,1);assert.equal(f.root.querySelectorAll('form[data-compose]').length,0);
  await f.click('[data-phone-react-floor="5"][data-phone-react-value="like"]');let d=f.service.getState().suite.documents['forum-encore'];assert.equal(d.meta.readerState.me.reactions['floor:5'],'like');assert.equal(d.items[4].counts.like,18);assert.equal(f.root.querySelector('[data-phone-react-floor="5"][data-phone-react-value="like"]').getAttribute('aria-pressed'),'true');assert.match(f.root.querySelector('[data-phone-react-floor="5"][data-phone-react-value="like"]').textContent,/18/);
  await f.click('[data-phone-react-floor="5"][data-phone-react-value="down"]');d=f.service.getState().suite.documents['forum-encore'];assert.equal(d.items[4].counts.like,17);assert.equal(d.items[4].counts.down,2);assert.equal(f.root.querySelector('[data-phone-react-floor="5"][data-phone-react-value="like"]').getAttribute('aria-pressed'),'false');
  await f.click('[data-reply-floor="8"]');f.input('[name="text"]','DOM 提交回复');await f.submit('[data-phone-send]');d=f.service.getState().suite.documents['forum-encore'];assert.equal(d.items.at(-1).floor,9);assert.equal(d.items.at(-1).quote,8);assert.equal(d.items.at(-1).text,'DOM 提交回复');assert.equal(f.root.querySelector('[name="text"]').value,'');f.close();
});

test('DOM weibo and video added item buttons target exact comment IDs and show reader delta',async()=>{
  const f=await fixture();f.app.open('wb-encore');let d=f.service.getState().suite.documents['wb-encore'];const item=d.items.find(i=>i.kind==='comment'&&Number.isFinite(i.metrics?.like));assert.ok(item);const before=item.metrics.like;
  await f.click(`[data-phone-react-item="${item.id}"][data-phone-react-value="like"]`);d=f.service.getState().suite.documents['wb-encore'];assert.equal(d.items.find(i=>i.id===item.id).metrics.like,before);assert.equal(d.meta.readerState.me.reactions[`item:${item.id}`],'like');assert.match(f.root.querySelector(`[data-phone-react-item="${item.id}"][data-phone-react-value="like"]`).textContent,new RegExp(String(before+1)));
  await f.click(`[data-phone-reply-item="${item.id}"]`);f.input('[name="text"]','微博楼中楼');await f.submit('[data-phone-send]');assert.equal(f.service.getState().suite.documents['wb-encore'].items.at(-1).parentId,item.id);
  f.app.open('video-encore');d=f.service.getState().suite.documents['video-encore'];const videoItem=d.items[0];await f.click(`[data-phone-react-item="${videoItem.id}"][data-phone-react-value="down"]`);assert.equal(f.service.getState().suite.documents['video-encore'].meta.readerState.me.reactions[`item:${videoItem.id}`],'down');f.input('[name="text"]','视频 self');await f.submit('[data-phone-send]');const ownComment=[...f.root.querySelectorAll('.sm-video-comment')].find(el=>el.textContent.includes('视频 self'));assert.ok(ownComment);assert.equal(ownComment.querySelector('.sm-comment-author strong').textContent,'我');f.close();
});

test('DOM rapid draft input retains latest text and focus/caret after asynchronous old saves',async()=>{
  const f=await fixture({delayedStorage:true});f.app.open('group-watch');f.input('[name="text"]','A',1);f.input('[name="text"]','AB',2);f.input('[name="text"]','ABC🙂',3);await f.settle();const field=f.root.querySelector('[name="text"]');assert.equal(field.value,'ABC🙂');assert.equal(f.service.getState().drafts['group-watch'],'ABC🙂');assert.equal(f.doc.activeElement,field);assert.equal(field.selectionStart,3);assert.equal(field.selectionEnd,3);f.app.navigate('home');f.app.open('group-watch');assert.equal(f.root.querySelector('[name="text"]').value,'ABC🙂');f.close();
});

test('DOM search form is local first and queues only with continue-search button',async()=>{
  const f=await fixture();f.app.navigate('search');f.input('[name="query"]','刚开始，给你发完整机位。');f.root.querySelector('[name="scope"]').value='public';await f.submit('[data-phone-search]');assert.equal(f.root.querySelectorAll('.phone-search-result').length,0);assert.equal(f.service.getState().actions.length,0);f.root.querySelector('[name="scope"]').value='mine';await f.submit('[data-phone-search]');assert.equal(f.root.querySelectorAll('.phone-search-result').length,1);await f.click('[data-phone-search-more]');assert.equal(f.service.getState().actions.at(-1).kind,'search');assert.equal(f.service.getState().actions.at(-1).scope,'mine');f.close();
});

test('DOM copy and receive dialogs keep request identity and apply actual protocol values',async()=>{
  const f=await fixture();let copied='';Object.defineProperty(f.win.navigator,'clipboard',{value:{async writeText(text){copied=text}},configurable:true});f.app.open('forum-encore');f.input('[name="text"]','联动请求');await f.submit('[data-phone-send]');f.app.navigate('settings');await f.click('[data-phone-copy-prompt]');assert.ok(f.root.querySelector('[role="dialog"]'));await f.click('[data-phone-modal-copy]');assert.match(copied,/tisya.phone-turn-input/);const request=Object.values(f.service.getState().requests).at(-1);assert.ok(copied.includes(request.requestId));await f.click('[data-phone-modal-close]');await f.click('[data-phone-sync]');assert.equal(f.root.querySelector('[name="phoneRequestId"]').value,request.requestId);
  const payload={requestId:request.requestId,acks:request.actionIds,blocks:[{type:'forum',thread:'forum-encore',items:[{by:'forum_momo_a',text:'DOM 接收回帖'}]}],markers:[{id:'m1',thread:'forum-encore',floor:10}]};f.input('[name="phoneModalValue"]',`正文 [[手机:m1]]<extra><phone>${JSON.stringify(payload)}</phone></extra>`);await f.click('[data-phone-modal-apply]');assert.equal(f.root.querySelector('[role="dialog"]'),null);assert.equal(f.service.getState().suite.documents['forum-encore'].items.at(-1).text,'DOM 接收回帖');assert.equal(f.service.getState().notifications.length,1);assert.match(f.root.textContent,/本轮已处理/);f.close();
});

test('DOM prepared round disables send but keeps drafts, and explicit recovery restores edits',async()=>{
  const f=await fixture();f.win.confirm=()=>true;f.app.open('forum-encore');f.input('[name="text"]','先发送');await f.submit('[data-phone-send]');f.app.navigate('settings');await f.click('[data-phone-copy-prompt]');await f.click('[data-phone-modal-close]');f.app.open('forum-encore');assert.equal(f.root.querySelector('[data-phone-send] button[type="submit"]').disabled,true);f.input('[name="text"]','等待中草稿');await f.settle();assert.equal(f.root.querySelector('[name="text"]').value,'等待中草稿');f.app.navigate('settings');await f.click('[data-phone-fail-preview]');assert.ok(Object.values(f.service.getState().requests).every(r=>r.status!=='prepared'));f.app.open('forum-encore');assert.equal(f.root.querySelector('[data-phone-send] button[type="submit"]').disabled,false);assert.equal(f.root.querySelector('[name="text"]').value,'等待中草稿');assert.equal(f.service.getState().suite.documents['forum-encore'].items.filter(i=>i.text==='先发送').length,1);f.close();
});

test('DOM frozen frame receives onChange, opens full phone, and is inert after dispose',async()=>{
  const f=await fixture();f.app.open('forum-encore');await f.app.send('冻结原消息');const prepared=await f.app.prepare(),request=f.service.getState().requests[prepared.requestId];await f.app.receive(JSON.stringify({requestId:prepared.requestId,acks:request.actionIds,blocks:[],markers:[{id:'m1',thread:'forum-encore',floor:9}]}),prepared.requestId);const frame=f.service.snapshot(`preview-reply:${prepared.requestId}`);
  const win=new Window({url:'http://localhost/phone.html?chat=frozen'}),root=win.document.createElement('div');win.document.body.appendChild(root);let ready=false,opened=null,reads=0;const host={contextKey:()=> 'frozen',snapshot:async source=>{assert.equal(source,'source-fixed');reads++;return ready?frame:null},open(value){opened=value}};
  const frozen=await renderPhoneFrozen({root,host,win,sourceId:'source-fixed',markerId:'m1',expectedContextKey:'frozen'});assert.match(root.textContent,/尚在接收/);ready=true;win.dispatchEvent(new win.Event('tisya:phone-change'));await new Promise(r=>setTimeout(r,0));assert.match(root.textContent,/冻结原消息/);assert.ok(root.querySelector('.phone-snapshot-body').hasAttribute('inert'));assert.equal(root.querySelectorAll('[data-phone-send]').length,0);root.querySelector('[data-phone-open]').click();assert.equal(opened.docId,'forum-encore');const before=reads;frozen.dispose();win.dispatchEvent(new win.Event('tisya:phone-change'));await new Promise(r=>setTimeout(r,0));assert.equal(reads,before);win.close();f.close();
});
