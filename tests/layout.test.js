import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { drawerEntries, mountLayout, installComposer, chatPreview, chatTitle } from '../layout.js';

function fixture() {
    const w=new Window({url:'http://localhost'}), d=w.document;
    d.body.innerHTML=`<div id="top-bar" style="display:block!important"></div><div id="top-settings-holder" style="height:33px;background:red!important"><div id="sys-settings-button" class="drawer"><div class="drawer-toggle"></div></div><div id="rightNavHolder" class="drawer"><div class="drawer-toggle"></div></div><div class="drawer"><i class="drawer-icon" title="Third party"></i></div></div><div id="sheld"><div id="chat"></div><div id="form_sheld"><div id="nonQRFormItems"><div id="leftSendForm"><div id="options_button" class="interactable"></div></div><textarea id="send_textarea"></textarea><div id="rightSendForm"><div id="send_but" class="displayNone"></div><div id="mes_stop" style="display:none"></div><div id="stscript_stop" style="display:none"></div><div id="mes_continue" class="displayNone"></div></div></div></div></div>`;
    return {w,d};
}

test('native and anonymous drawers keep their identities after DOM reorder',()=>{
    const {w,d}=fixture(),original=drawerEntries(d), holder=d.querySelector('#top-settings-holder');
    holder.prepend(original[2].element);holder.append(original[0].element);
    const reordered=drawerEntries(d);
    assert.equal(reordered.find(x=>x.key===original[2].key).element,original[2].element);
    assert.equal(reordered.find(x=>x.key==='sys-settings-button').label,'模型连接');
    assert.equal(reordered.find(x=>x.key==='rightNavHolder').label,'角色卡与群聊');
    w.happyDOM.abort();
});

test('mounting uses native shells and teardown restores decorated surfaces without losing nodes',()=>{
    const {w,d}=fixture(),native=d.querySelector('#rightNavHolder');
    const ui=mountLayout(d,'<button>菜单</button>');
    assert.equal(ui.top.parentElement.id,'leftSendForm');
    assert.equal(d.body.style.getPropertyValue('--topBarBlockSize'),'0px');
    assert.equal(ui.controls.hidden,true);
    assert.equal(ui.root.parentElement.id,'sheld');
    assert.equal(d.querySelector('#top-bar').style.display,'none');
    assert.equal(ui.overlay.getAttribute('data-tt-mobile-surface'),'none');
    ui.dispose();
    assert.equal(d.querySelector('#rightNavHolder'),native);
    assert.equal(d.querySelector('#top-bar').style.display,'block');
    assert.equal(d.querySelector('#top-bar').style.getPropertyPriority('display'),'important');
    assert.equal(d.querySelector('#top-settings-holder').style.height,'33px');
    assert.equal(d.querySelector('#top-settings-holder').style.background,'red');
    assert.equal(d.body.style.getPropertyValue('--topBarBlockSize'),'');
    w.happyDOM.abort();
});

test('teardown does not replace a newer host style mutation',()=>{
    const {w,d}=fixture(),ui=mountLayout(d,'');
    d.querySelector('#top-bar').style.setProperty('display','flex','important');
    ui.dispose();assert.equal(d.querySelector('#top-bar').style.display,'flex');w.happyDOM.abort();
});

test('tools stay in original parents with live handlers, visibility and keyboard controls',async()=>{
    const {w,d}=fixture(),native=d.querySelector('#options_button'),parent=native.parentElement;
    let clicks=0;native.addEventListener('click',()=>clicks++);
    const stop=installComposer(d);
    assert.equal(native.parentElement,parent);
    d.querySelector('#tisya-input-more').click();assert.equal(d.querySelector('#tisya-input-more').getAttribute('aria-expanded'),'true');
    native.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(clicks,1);
    assert.equal(d.querySelector('#mes_stop').style.display,'none');
    assert.equal(d.querySelector('#send_but').classList.contains('displayNone'),true);
    const late=d.createElement('div');late.title='Later extension';late.className='interactable';parent.append(late);
    await w.happyDOM.whenAsyncComplete();assert.equal(late.getAttribute('data-tisya-tool-label'),'Later extension');
    stop();assert.equal(native.parentElement,parent);native.click();assert.equal(clicks,2);
    assert.equal(d.querySelector('#tisya-input-more'),null);assert.equal(native.getAttribute('role'),null);
    assert.equal(late.parentElement,parent);assert.equal(late.getAttribute('data-tisya-tool-label'),null);
    w.happyDOM.abort();
});

test('chat previews hide internal markup, constrain long summaries and preserve original data',()=>{
    const raw='<reply><task>内部任务</task><audit>内部审计</audit><p>河岸的灯亮了。</p></reply>';
    assert.equal(chatPreview(raw),'河岸的灯亮了。');
    assert.equal(chatPreview('<task>尚未闭合'),'打开会话');
    assert.equal(chatPreview('长'.repeat(200)).length,120);
    assert.equal(raw.includes('<audit>'),true);
    assert.equal(chatTitle('月潮 - 2026-10-08@04h39m32s.jsonl','月潮'),'2026/10/08 04:39');
});
