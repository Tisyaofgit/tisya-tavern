import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {formatProse,proseCSS} from '../prose.js';import {mountMessageReader} from '../reader.js';import {mountMessageVisual} from '../message-ui.js';import {fixture} from './fixtures/journey-r4.cjs';
function setup(){const w=new Window(),d=w.document;const parse=html=>{const root=d.createElement('div');root.innerHTML=html;return root;};return {w,d,parse};}
test('original paragraph, indent, dialogue and punctuation rules reach sanitized host prose',async()=>{
 const {w,d,parse}=setup();const source='潮声传来。\n\n“我们回家。”';const root=parse(formatProse(d,source,()=>'<p>潮声传来。</p><p><q>“我们<strong>回家</strong>。”</q></p>'));
 assert.equal(root.querySelectorAll('[data-tisya-prose="paragraph"]').length,2);assert.equal(root.querySelectorAll('q').length,0);assert.equal(root.querySelectorAll('[data-tisya-prose="dialogue"]').length,3);assert.equal(root.querySelector('[data-tisya-prose="punctuation"]').textContent,'。');assert.match(proseCSS,/text-indent:2em;line-height:1.8;margin:0 0 0.8em/);await w.happyDOM.abort();
});
test('multiline and nested marks are built before Markdown separates their boundaries',async()=>{
 const {w,d,parse}=setup();let calls=0,input;const source='〔信笺:潮声〕第一行。\n\n第二行。〔内心〕他会回来。〔/内心〕〔/信笺〕';const root=parse(formatProse(d,source,text=>{calls++;input=text;return text;}));
 assert.equal(calls,1);assert.ok(!input.includes('〔信笺'));assert.equal(root.querySelector('[data-tisya-mark="信笺"] header').textContent,'潮声');assert.match(root.querySelector('[data-tisya-mark="信笺"]').textContent,/第二行/);assert.equal(root.querySelectorAll('[data-tisya-mark="内心"]').length,1);await w.happyDOM.abort();
});
test('authored cards, code and link targets survive formatting without inner decoration',async()=>{
 const {w,d,parse}=setup();const html='<section class="authored"><p>“卡片。”〔内心〕保持原样〔/内心〕</p></section><pre><code>〔系统〕代码〔/系统〕</code></pre><p><a href="https://example.test/?q=〔内心〕">链接</a></p>';
 const root=parse(formatProse(d,html,text=>text));assert.equal(root.querySelector('.authored').outerHTML,parse(html).querySelector('.authored').outerHTML);assert.equal(root.querySelectorAll('[data-tisya-mark]').length,0);assert.match(root.querySelector('code').textContent,/〔系统〕/);assert.equal(root.querySelector('a').getAttribute('href'),'https://example.test/?q=〔内心〕');await w.happyDOM.abort();
});
test('unavailable references remain labels, invalid mark boundaries stop explicitly',async()=>{
 const {w,d,parse}=setup();const root=parse(formatProse(d,'〔引用:record〕公开标签〔/引用〕',text=>text));assert.equal(root.textContent,'公开标签');assert.equal(root.querySelector('button'),null);assert.throws(()=>formatProse(d,'〔信笺〕未结束',x=>x),/TISYA_MARK_UNCLOSED/);await w.happyDOM.abort();
});
test('message and reader both mount original prose styles and keep private blocks outside formatter',async()=>{
 const {w,d}=setup();d.body.innerHTML='<div id="chat"><div class="mes_block"></div></div><div id="reader"></div>';w.IntersectionObserver=class{observe(){}disconnect(){}};const source=fixture({body:'1\n“门开了。”\n\n2\n〔内心〕风很轻。〔/内心〕',taskExtra:'PRIVATE_CANARY'}),seen=[];
 const hostFormat=text=>{seen.push(text);return text;};const view=mountMessageVisual(d,d.querySelector('.mes_block'),{source,formatBody:hostFormat,onChooseAction(){},getMotion:()=>false});const reader=mountMessageReader(d,d.querySelector('#reader'),{source,formatBody:hostFormat,onChooseAction(){}});
 for(const root of [view.host.shadowRoot,d.querySelector('#reader')]){assert.ok(root.querySelector('[data-tisya-prose="dialogue"]'));assert.ok(root.querySelector('[data-tisya-mark="内心"]'));assert.match(root.querySelector('style').textContent,/text-indent:2em/);assert.ok(!root.textContent.includes('PRIVATE_CANARY'));}
 assert.ok(seen.every(text=>!text.includes('PRIVATE_CANARY')&&!text.includes('<task')));assert.equal(source,fixture({body:'1\n“门开了。”\n\n2\n〔内心〕风很轻。〔/内心〕',taskExtra:'PRIVATE_CANARY'}));reader.dispose();view.dispose();await w.happyDOM.abort();
});
test('broken prose formatting has an explicit local notice without exposing the original envelope',async()=>{
 const {w,d}=setup();d.body.innerHTML='<div id="chat"><div class="mes_block"></div></div>';w.IntersectionObserver=class{observe(){}disconnect(){}};const errors=[],source=fixture({body:'〔信笺〕未闭合',taskExtra:'PRIVATE_CANARY'}),view=mountMessageVisual(d,d.querySelector('.mes_block'),{source,formatBody:x=>x,onChooseAction(){},getMotion:()=>false,onError:e=>errors.push(e.code)});
 assert.match(view.host.shadowRoot.querySelector('.story [role=status]').textContent,/TISYA_MARK_UNCLOSED/);assert.ok(!view.host.shadowRoot.textContent.includes('PRIVATE_CANARY'));assert.deepEqual(errors,['TISYA_MARK_UNCLOSED']);view.dispose();await w.happyDOM.abort();
});
