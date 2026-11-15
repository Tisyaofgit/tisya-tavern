import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {formatProse} from '../prose.js';
import {mountMessageVisual} from '../message-ui.js';
import {mountMessageReader} from '../reader.js';
import {fixture} from './fixtures/journey-r4.cjs';

async function scenario(fn){const w=new Window(),d=w.document;try{await fn(d,w);}finally{await w.happyDOM.abort();}}
function render(d,html,options={}){const root=d.createElement('div');root.innerHTML=formatProse(d,html,x=>x,options);return root;}
test('translation and thought preserve text, inline emphasis and surrounding paragraphs',()=>scenario(d=>{
 const root=render(d,'<p>雨落下。“I will <em>wait</em>.”◆我会<strong>等你</strong>。◆她笑了。</p><p>■我本来想问，</p><p>她还会不会回来。■</p><p>明天见。</p>');
 assert.equal(root.querySelector('[data-tisya-aside=translation] .tisya-aside-content').textContent,'我会等你。');
 assert.equal(root.querySelector('[data-tisya-aside=translation] strong').textContent,'等你');
 assert.equal(root.querySelector('[data-tisya-aside=thought] .tisya-aside-content').textContent,'我本来想问，她还会不会回来。');
 assert.ok(root.textContent.includes('她笑了。'));assert.ok(root.textContent.includes('明天见。'));assert.doesNotMatch(root.textContent,/[◆■]/);
 assert.equal(root.querySelectorAll('[data-tisya-aside]').length,2);
}));
test('adjacent and mixed nested blocks retain order without leftover delimiters',()=>scenario(d=>{
 const root=render(d,'开头◆第一译文◆◆第二译文◆■我听见“Stay.”◆留下。◆却没回答。■结尾');
 assert.deepEqual([...root.querySelectorAll('[data-tisya-aside=translation] .tisya-aside-content')].map(x=>x.textContent),['第一译文','第二译文','留下。']);
 assert.match(root.textContent,/开头.*第一译文.*第二译文.*我听见.*留下。.*却没回答。.*结尾/s);assert.doesNotMatch(root.textContent,/[◆■]/);
}));
test('literal code, authored cards, attributes, links and controls keep ownership',()=>scenario(d=>{
 const protectedHTML='<pre><code>◆字面◆ ■字面■</code></pre><section class="card"><p>■卡片■</p></section><a href="https://example.test/?q=◆字面◆">◆链接◆</a><button data-value="■载荷■">■按钮■</button>';
 const root=render(d,protectedHTML+'<p>◆正文◆</p>');
 const expected=d.createElement('div');expected.innerHTML=protectedHTML;
 for(const tag of ['pre','.card','a','button'])assert.equal(root.querySelector(tag).outerHTML,expected.querySelector(tag).outerHTML);
 assert.equal(root.querySelectorAll('[data-tisya-aside]').length,1);
}));
test('partial stream remains visible and a complete revision can render; no crossing protected boundaries',()=>scenario(d=>{
 for(const html of ['■未结束','◆未结束','◆◆','■前半<code>代码</code>后半■']){const root=render(d,html);assert.equal(root.querySelectorAll('[data-tisya-aside]').length,0);assert.ok(root.textContent.includes(html[0]));}
 assert.equal(render(d,'■现已结束■').querySelectorAll('[data-tisya-aside]').length,1);
}));
test('existing marker switches disable projections and repeated rendering is idempotent',()=>scenario(d=>{
 const source='◆译文◆■心声内容■';assert.equal(render(d,source,{标记美化:false}).textContent,source);
 const thoughtOff=render(d,source,{标记内心:false});assert.equal(thoughtOff.querySelectorAll('[data-tisya-aside]').length,1);assert.match(thoughtOff.textContent,/■心声内容■/);
 const first=render(d,source),second=render(d,first.innerHTML);assert.equal(second.querySelectorAll('[data-tisya-aside]').length,2);
}));
test('message and reader consumers share aside projection while source and private task stay untouched',()=>scenario((d,w)=>{
 d.body.innerHTML='<div id="chat"><div class="mes_block"></div></div><div id="reader"></div>';w.IntersectionObserver=class{observe(){}disconnect(){}};
 const source=fixture({body:'1\n“Stay.”◆留下。◆\n\n2\n■我只是希望她留下。■'}).replace('任务：推门|','任务：PRIVATE_CANARY|'),formatBody=x=>x;
 const message=mountMessageVisual(d,d.querySelector('.mes_block'),{source,formatBody,onChooseAction(){},getMotion:()=>false});
 const reader=mountMessageReader(d,d.querySelector('#reader'),{source,formatBody,onChooseAction(){}});
 for(const root of [message.host.shadowRoot,d.querySelector('#reader')]){assert.equal(root.querySelectorAll('[data-tisya-aside]').length,2);assert.ok(!root.textContent.includes('PRIVATE_CANARY'));}
 assert.ok(source.includes('◆留下。◆'));assert.ok(source.includes('■我只是希望她留下。■'));reader.dispose();message.dispose();
}));
