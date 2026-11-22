import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {mountPet} from '../pet.js';import {mountTurnReview} from '../engine/turn-review-ui.mjs';import {visualAssets,phoneResources} from '../visual-assets.js';import {reviewFixture} from './fixtures/pet-review.mjs';
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function setup(){
 const w=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}}),d=w.document;d.body.innerHTML='<div id="chat"></div><form id="send_form"><textarea></textarea><button>发送</button></form>';
 Object.defineProperty(w,'innerWidth',{value:360,writable:true});Object.defineProperty(w,'innerHeight',{value:760,writable:true});let formTop=620;
 const rect=(x,y,width,height)=>({x,y,left:x,top:y,right:x+width,bottom:y+height,width,height});d.querySelector('#chat').getBoundingClientRect=()=>rect(0,20,w.innerWidth,formTop-20);d.querySelector('#send_form').getBoundingClientRect=()=>rect(0,formTop,w.innerWidth,140);
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});const dims=new Map(Object.entries(phoneResources).map(([k,r])=>[visualAssets[k],r]));w.Image=class{set src(url){const r=dims.get(url)??{width:1,height:1};this.width=this.naturalWidth=r.width;this.height=this.naturalHeight=r.height;}decode(){return Promise.resolve();}};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{})});
 const fixture=reviewFixture(),errors=[],ui=mountTurnReview(d,{service:fixture.service,onError:e=>errors.push(e.message)}),pet=mountPet(d,{getMotion:()=>false,onError:e=>errors.push(e.message)});ui.attachPet(pet);
 return {w,d,pet,ui,fixture,errors,formTop:value=>{formTop=value;w.dispatchEvent(new w.Event('resize'));},close:async()=>{ui.dispose();pet.dispose();await w.happyDOM.abort();}};
}
test('one notice follows pet visibility and geometry without opening on a new candidate',async()=>{const f=setup();try{await f.ui.ready;await flush();const notice=f.ui.root.querySelector('.review-notice'),panel=f.ui.root.querySelector('[role=dialog]');assert.equal(notice.dataset.placement,'foot');assert.equal(panel.hidden,true);f.pet.setVisible(false);assert.equal(notice.dataset.placement,'drawer');assert.equal(f.d.querySelectorAll('.review-notice').length,1);assert.ok(parseFloat(notice.style.top)+64<620);f.pet.setVisible(true);assert.equal(notice.dataset.placement,'foot');const top=parseFloat(f.d.querySelector('#tisya-pet').style.top),height=parseFloat(f.d.querySelector('#tisya-pet').style.height);assert.ok(parseFloat(notice.style.top)>=top+height);f.pet.setMode('expanded');await flush();assert.ok(parseFloat(notice.style.top)>=parseFloat(f.d.querySelector('#tisya-pet').style.top)+parseFloat(f.d.querySelector('#tisya-pet').style.height));f.fixture.addPending();await flush();assert.equal(panel.hidden,true);assert.deepEqual(f.errors,[]);}finally{await f.close();}});
test('compact no-pet drawer drags vertically, snaps to either side and restores its position',async()=>{
 const f=setup();let restored=null;try{
  await f.ui.ready;f.pet.setVisible(false);const notice=f.ui.root.querySelector('.review-notice'),panel=f.ui.root.querySelector('[role=dialog]');assert.equal(notice.dataset.placement,'drawer');assert.equal(notice.dataset.side,'right');
  const before=parseFloat(notice.style.top),point=(type,x,y)=>notice.dispatchEvent(new f.w.PointerEvent(type,{bubbles:true,pointerId:7,button:0,clientX:x,clientY:y}));point('pointerdown',340,before+20);point('pointermove',22,before+150);point('pointerup',22,before+150);notice.click();
  assert.equal(notice.dataset.side,'left');assert.equal(parseFloat(notice.style.left),0);assert(parseFloat(notice.style.top)>before+80);assert.equal(panel.hidden,true,'dragging must not also open the review');
  const saved=JSON.parse(f.w.localStorage.getItem('tisya.turn-review.drawer-position.v1'));assert.equal(saved.side,'left');assert(saved.ratio>.7);
  f.ui.dispose();restored=mountTurnReview(f.d,{service:f.fixture.service,onError:e=>f.errors.push(e.message)});await restored.ready;const next=restored.root.querySelector('.review-notice');assert.equal(next.dataset.side,'left');assert.equal(parseFloat(next.style.left),0);assert(Math.abs(parseFloat(next.style.top)-parseFloat(notice.style.top))<1);
  next.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true}));assert.equal(next.dataset.side,'right');assert.deepEqual(f.errors,[]);
 }finally{restored?.dispose();await f.close();}
});

test('closing and reopening preserves the same dirty editor; confirmation changes the same notice',async()=>{const f=setup();try{await f.ui.ready;const notice=f.ui.root.querySelector('.review-notice');notice.click();await flush();const editor=f.ui.root.querySelector('textarea[aria-label="本轮表单"]');editor.value='旅人.体力：6';editor.dispatchEvent(new f.w.Event('input'));[...f.ui.root.querySelectorAll('button')].find(b=>b.textContent==='展开修改后的字段').click();await flush();f.ui.root.querySelector('header button').click();assert.equal(notice.hidden,false);notice.click();await flush();assert.equal(f.ui.root.querySelector('textarea[aria-label="本轮表单"]'),editor);assert.equal(editor.value,'旅人.体力：6');f.ui.root.querySelector('.confirm').click();await flush();assert.equal(f.fixture.state.reviews[0].status,'confirmed');assert.equal(f.fixture.state.reviews[0].cells,'旅人.体力：6');assert.equal(editor.value,'旅人.体力：6');f.ui.root.querySelector('header button').click();assert.match(notice.getAttribute('aria-label'),/已确认/);assert.equal(notice.dataset.pending,'false');assert.deepEqual(f.errors,[]);}finally{await f.close();}});
test('confirmation rejection stays visible after a clean editor refresh',async()=>{
 const f=setup();
 try{
  await f.ui.ready;
  const message='本轮表单尚不能保存：填写校验失败';
  f.fixture.service.confirmTurn=async()=>{throw Error(message);};
  f.ui.root.querySelector('.review-notice').click();
  await flush();
  f.ui.root.querySelector('.confirm').click();
  await flush();
  assert.equal(f.ui.root.querySelector('[role="status"]').textContent,message);
  assert.equal(f.ui.root.querySelector('.confirm').disabled,false);
  assert.equal(f.fixture.state.reviews[0].status,'pending');
  assert.deepEqual(f.errors,[message]);
 }finally{await f.close();}
});
test('check-all shows every issue with field navigation and permits a corrected second check',async()=>{
 const f=setup();
 try{
  await f.ui.ready;f.ui.root.querySelector('.review-notice').click();await flush();let confirmed=false,checks=0;
  f.fixture.service.confirmTurn=async()=>{confirmed=true;};
  f.fixture.service.checkTurnReview=async()=>{checks++;return checks===1?{status:'invalid',issues:[{channel:'cells',recordId:'actor',field:'hp',label:'体力',message:'体力：请填写有效数字'},{channel:'cells',recordId:'actor',field:'name',label:'姓名',message:'姓名：需要明确值'}]}:{status:'valid',issues:[],archiveIssue:null};};
  [...f.ui.root.querySelectorAll('footer button')].find(b=>b.textContent==='检查全部字段').click();await flush();
  const box=f.ui.root.querySelector('.review-issues');assert.equal(box.hidden,false);assert.equal(box.querySelectorAll('li').length,2);assert.match(box.textContent,/不会保存/);assert.equal(confirmed,false);assert.equal(f.ui.root.querySelectorAll('.has-review-issue').length,1);
  box.querySelector('li button').click();assert.equal(f.d.activeElement.getAttribute('aria-label'),'本轮状态更新 · 体力');
  [...f.ui.root.querySelectorAll('footer button')].find(b=>b.textContent==='检查全部字段').click();await flush();assert.equal(box.hidden,true);assert.match(f.ui.root.querySelector('[role="status"]').textContent,/可以确认保存/);assert.equal(confirmed,false);
 }finally{await f.close();}
});

test('composer height changes bound both forms and trigger; disable and dispose release them',async()=>{const f=setup();try{await f.ui.ready;const notice=f.ui.root.querySelector('.review-notice'),panel=f.ui.root.querySelector('[role=dialog]');f.pet.setVisible(false);notice.click();f.formTop(280);assert.ok(parseFloat(panel.style.top)+parseFloat(panel.style.maxHeight)<280);f.ui.root.querySelector('header button').click();assert.ok(parseFloat(notice.style.top)+64<280);f.ui.setActive(false);assert.equal(f.ui.root.hidden,true);f.ui.setActive(true);assert.equal(f.ui.root.hidden,false);f.fixture.setAvailable(false);await flush();assert.equal(f.ui.root.hidden,true);f.ui.dispose();assert.equal(f.fixture.listenerCount(),0);f.pet.setVisible(true);assert.equal(f.d.querySelector('.review-notice'),null);}finally{await f.close();}});

test('pending review prewarms in the background and revalidates the exact edited bytes without confirming',async()=>{
 const f=setup();try{
  const inputs=[];let confirmations=0;
  f.fixture.service.checkTurnReview=async input=>{inputs.push(structuredClone(input));return {status:'valid',issues:[],archiveIssue:null};};
  f.fixture.service.confirmTurn=async input=>{confirmations++;return {status:'confirmed'};};
  await f.ui.ready;await new Promise(resolve=>f.w.setTimeout(resolve,220));
  assert.equal(inputs.length,1);assert.equal(confirmations,0);
  const editor=f.ui.root.querySelector('textarea[aria-label="本轮表单"]');editor.value='旅人.hp: -4 | P1';editor.dispatchEvent(new f.w.Event('input'));
  [...f.ui.root.querySelectorAll('button')].find(button=>button.textContent==='展开修改后的字段').click();
  await new Promise(resolve=>f.w.setTimeout(resolve,220));assert.equal(inputs.length,2);assert.equal(inputs.at(-1).cells,'旅人.hp: -4 | P1');assert.equal(confirmations,0);assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
});

test('background prevalidation errors stay silent until the user explicitly checks or confirms',async()=>{
 const f=setup();try{
  f.fixture.service.checkTurnReview=async()=>{throw Error('background stale');};await f.ui.ready;
  await new Promise(resolve=>f.w.setTimeout(resolve,220));assert.deepEqual(f.errors,[]);assert.equal(f.fixture.state.reviews[0].status,'pending');
 }finally{await f.close();}
});
