import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountParagraphActions,paragraphTargets} from '../paragraph-actions.js';
import {capture,validate} from '../model.js';
const wait=()=>new Promise(r=>setTimeout(r,20));
function fixture(shadow=false){
 const w=new Window(),d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div>';
 const node=d.querySelector('.mes'),host=d.querySelector('.mes_text');let root=host;
 if(shadow){root=d.createElement('article');root.className='story';host.attachShadow({mode:'open'}).append(root);}
 root.innerHTML='<p>第一段</p><p>第二段</p><p>第三段</p>';
 const c={chat:[{mes:'第一段\n\n第二段\n\n第三段',is_user:false}],getCurrentChatId:()=> 'chat'},errors=[],results=[];
 const ui=mountParagraphActions(d,{capture:()=>capture(c,0),validate:t=>validate(c,t,{tail:true}),assertIdle(){},onRevise:(t,ids)=>results.push({t,ids}),onEdit:()=>results.push('edit'),onError:e=>errors.push(e.message),holdMs:5});
 const press=async(n,type='pointerdown')=>{n.dispatchEvent(new w.PointerEvent(type,{bubbles:true,composed:true,button:0,pointerId:1,isPrimary:true,clientX:80,clientY:120}));await wait();};
 return {w,d,node,root,c,ui,press,results,errors};
}
test('long press opens own menu; multiple paragraphs stay red and checkmark passes sorted ids',async()=>{
 const f=fixture(true),{d,root,w}=f;await f.press(root.children[1]);assert.ok(d.querySelector('#tisya-paragraph-menu'));
 const native=new w.Event('contextmenu',{bubbles:true,composed:true,cancelable:true});root.children[1].dispatchEvent(native);assert.equal(native.defaultPrevented,true);
 [...d.querySelectorAll('#tisya-paragraph-menu button')].find(b=>b.textContent==='修改').click();await wait();
 assert.equal(root.children[1].classList.contains('tisya-paragraph-selected'),true);
 root.children[2].click();root.children[0].click();root.children[1].click();
 assert.equal(root.children[0].classList.contains('tisya-paragraph-selected'),true);assert.equal(root.children[1].classList.contains('tisya-paragraph-selected'),false);assert.match(d.querySelector('#tisya-paragraph-selection').textContent,/已选 2 段/);
 d.querySelector('[aria-label="完成选段，进入修改指令"]').click();assert.deepEqual(f.results[0].ids,[1,3]);assert.equal(d.querySelector('#tisya-paragraph-selection'),null);assert.equal(f.c.chat[0].mes,'第一段\n\n第二段\n\n第三段');assert.deepEqual(f.errors,[]);f.ui.dispose();await w.happyDOM.abort();
});
test('scroll gesture cancels hold; editors retain native selection; teardown removes handlers',async()=>{
 const f=fixture(),{w,d,root}=f;root.children[0].dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,isPrimary:true,clientX:0,clientY:0}));root.children[0].dispatchEvent(new w.PointerEvent('pointermove',{bubbles:true,pointerId:1,isPrimary:true,clientX:0,clientY:30}));await wait();assert.equal(d.querySelector('#tisya-paragraph-menu'),null);
 const input=d.createElement('textarea');root.append(input);const e=new w.Event('contextmenu',{bubbles:true,cancelable:true});input.dispatchEvent(e);assert.equal(e.defaultPrevented,false);
 f.ui.dispose();await f.press(root.children[0]);assert.equal(d.querySelector('#tisya-paragraph-menu'),null);await w.happyDOM.abort();
});
test('swipe/edit invalidates selected source and cannot submit stale paragraph references',async()=>{
 const f=fixture();await f.press(f.root.children[0]);[...f.d.querySelectorAll('#tisya-paragraph-menu button')].find(b=>b.textContent==='修改').click();await wait();f.c.chat[0].mes='新的候选';f.ui.check();assert.equal(f.d.querySelector('#tisya-paragraph-selection'),null);assert.equal(f.root.querySelectorAll('.tisya-paragraph-selected').length,0);assert.equal(f.results.length,0);assert.match(f.errors[0],/变化/);f.ui.dispose();await f.w.happyDOM.abort();
});
test('transformed or merged display does not guess paragraph numbers; duplicate paragraphs retain order',async()=>{
 const f=fixture();f.root.innerHTML='<p>改过的显示</p>';assert.deepEqual(paragraphTargets(f.d,f.root,f.c.chat[0].mes),[]);f.root.innerHTML='<p>重复</p><p>重复</p>';assert.deepEqual(paragraphTargets(f.d,f.root,'重复\n\n重复').map(r=>r.id),[1,2]);f.ui.dispose();await f.w.happyDOM.abort();
});
