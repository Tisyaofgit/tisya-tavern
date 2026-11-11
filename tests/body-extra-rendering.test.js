import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {fixture} from './fixtures/journey-r4.cjs';
import {createNativeDisplayPipeline} from '../native-display.js';
import {mountMessageVisual} from '../message-ui.js';
import {preserveNativePanels} from '../native-panels.js';
import * as bodyParts from '../native-body.js';
import {formatProse} from '../prose.js';
import {presentationReferenceParameter} from '../extension-presentation.mjs';

const fence=html=>'```html\n'+html+'\n```';
const staticHTML='<!doctype html><html><head><style>.note{color:rgb(212,175,55);padding:12px}</style></head><body><details open><summary>旧信</summary><p class="note">正文中的静态卡片</p></details></body></html>';
function setup(){const w=new Window({url:'http://localhost/',settings:{disableIframePageLoading:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});w.IntersectionObserver=class{observe(){}disconnect(){}};const d=w.document;d.body.innerHTML='<div id="chat"><div class="mes_block"><div class="mes_text">PRIVATE_CANARY</div></div></div>';return {w,d,container:d.querySelector('.mes_block'),native:d.querySelector('.mes_text')};}
function pipeline(replace){let compilations=0;const rules=[{scriptName:'正文和扩展共用',findRegex:'/TOKEN/g',replaceString:replace,markdownOnly:true,placement:[2]}];const display=createNativeDisplayPipeline({enabled:()=>true,scripts:()=>rules,regexProvider:{get(pattern){compilations++;return new RegExp(pattern.slice(1,-2),'g');}}});return {project:(...args)=>display.project(...args),compilations:()=>compilations};}
const flush=()=>new Promise(r=>setImmediate(r));

test('regex marks render in body after the same pass that handles extra and refresh without rerunning rules',async()=>{
 const {w,d,container}=setup();let view;try{
  const source=fixture({body:'1\nTOKEN',extra:'<scene>TOKEN</scene>'}),original=source,p=pipeline('〔信笺：旧信〕字迹〔/信笺〕'),display=p.project(source);let enabled=true,prepared=0,unprepared=0;
  assert.equal(display.rules.length,1);assert.equal(display.rules[0].matches,2);assert.equal(p.compilations(),1);
  view=mountMessageVisual(d,container,{source,getNativeDisplay:()=>display,formatBody:text=>(unprepared++,text),formatPreparedBody:text=>(prepared++,text),getAppearance:()=>({标记美化:enabled}),getMotion:()=>false});
  const story=view.host.shadowRoot.querySelector('.story');assert.equal(story.querySelectorAll('[data-tisya-mark="信笺"]').length,1);assert.equal(story.querySelector('header').textContent,'旧信');assert.equal(unprepared,0);assert.equal(prepared,1);
  enabled=false;view.refresh();assert.equal(story.querySelector('[data-tisya-mark]'),null);assert.match(story.textContent,/〔信笺：旧信〕/);
  enabled=true;view.refresh();assert.equal(story.querySelectorAll('[data-tisya-mark="信笺"]').length,1);assert.equal(p.compilations(),1);assert.equal(source,original);assert.doesNotMatch(story.textContent,/PRIVATE_CANARY|<vars/);
 }finally{view?.dispose();await w.happyDOM.abort();}
});

test('opening extra consumes the prepared projection once and styles plain public marks',async()=>{
 const {w,d,container}=setup();let view,reveal;try{
  w.IntersectionObserver=class{constructor(callback){reveal=()=>callback([{isIntersecting:true}]);}observe(){}disconnect(){}};
  const source=fixture({body:'1\nTOKEN',extra:'<scene>TOKEN</scene>'}),p=pipeline('〔信笺〕AA〔/信笺〕');let prepared=0,unprepared=0;
  view=mountMessageVisual(d,container,{source,getNativeDisplay:()=>p.project(source),formatBody:text=>(unprepared++,text.replaceAll('AA','AAAA')),formatPreparedBody:text=>(prepared++,text),getMotion:()=>false});
  reveal();view.host.shadowRoot.querySelector('#world-extension-toggle').click();
  const frame=view.host.shadowRoot.querySelector('.extension-sheet iframe,.native-card-content iframe');assert(frame);assert.match(frame.srcdoc,/data-tisya-mark="信笺"/);assert.match(frame.srcdoc,/AA/);assert.doesNotMatch(frame.srcdoc,/AAAA/);assert.match(frame.srcdoc,/data-tisya-prose-root/);assert.equal(unprepared,0);assert.equal(prepared,2);assert.equal(p.compilations(),1);
  view.refresh();view.host.shadowRoot.querySelector('#world-extension-toggle').click();view.host.shadowRoot.querySelector('#world-extension-toggle').click();assert.equal(prepared,2);assert.equal(p.compilations(),1);
 }finally{view?.dispose();await w.happyDOM.abort();}
});

test('a complete authored body document without its own style still bypasses prose reformatting',async()=>{
 const {w,d,container}=setup();let view;try{
  const html='<!doctype html><html><body><p>〔信笺〕原卡自己负责这段文字〔/信笺〕</p></body></html>',source=fixture({body:'1\nTOKEN'}),p=pipeline(fence(html));let formatted=0;
  view=mountMessageVisual(d,container,{source,getNativeDisplay:()=>p.project(source),formatBody:x=>(formatted++,x),formatPreparedBody:x=>(formatted++,x),getMotion:()=>false});
  const frame=view.host.shadowRoot.querySelector('.story iframe');assert(frame);assert.match(frame.srcdoc,/<p>〔信笺〕原卡自己负责这段文字〔\/信笺〕<\/p>/);assert.doesNotMatch(frame.srcdoc,/data-tisya-mark=/);assert.equal(formatted,0);
 }finally{view?.dispose();await w.happyDOM.abort();}
});

test('record references and regex body formatting coexist after asynchronous historical lookup',async()=>{
 const {w,d,container}=setup();let view;try{
  const ref={tableId:'T_DYN_TRANSFERS',recordId:'t1',snapshotId:'@message'},mark='〔消息:'+presentationReferenceParameter({kind:'transfer',reference:ref})+'〕转账〔/消息〕',source=fixture({body:'1\nTOKEN\n\n2\n'+mark}),message={mes:source,extra:{tisya_engine:{uid:'test'}}},p=pipeline('〔信笺〕仍保留正则美化〔/信笺〕');let lookups=0;
  view=mountMessageVisual(d,container,{source,phoneMessage:message,phoneContextKey:'ctx',getNativeDisplay:()=>p.project(source),getPresentation:async()=>{lookups++;return {contextKey:'ctx',messageSnapshotId:'snap',projections:[{reference:{...ref,snapshotId:'snap'},contextKey:'ctx',kind:'transfer',allowed:true,value:{amount:25,currencyLabel:'银两',status:'已存'}}]};},formatBody:x=>x,formatPreparedBody:x=>x,getMotion:()=>false});
  await flush();const story=view.host.shadowRoot.querySelector('.story');assert(story.querySelector('[data-tisya-mark="信笺"]'));assert.match(story.textContent,/25 银两/);assert.doesNotMatch(story.textContent,/TOKEN/);assert.equal(lookups,1);assert.equal(p.compilations(),1);assert.equal(message.mes,source);
 }finally{view?.dispose();await w.happyDOM.abort();}
});

test('regex-authored static documents render between prose and keep their frame across appearance refresh and world folding',async()=>{
 const {w,d,container}=setup();let view;try{
  const source=fixture({body:'1\n前文\n\n2\nTOKEN\n\n3\n后文',extra:'<scene>世界扩展</scene>'}),p=pipeline(fence(staticHTML));let appearance={动画效果:true};
  view=mountMessageVisual(d,container,{source,getNativeDisplay:()=>p.project(source),formatBody:x=>x,formatPreparedBody:x=>x,getAppearance:()=>appearance,getMotion:()=>false});
  const story=view.host.shadowRoot.querySelector('.story'),frame=story.querySelector('iframe[data-tisya-body-document]');assert(frame);assert.match(frame.srcdoc,/\.note\{color:rgb\(212,175,55\)/);assert.equal(frame.getAttribute('sandbox'),'allow-same-origin');assert.equal(story.querySelector('script'),null);
  assert.deepEqual([...story.children].map(n=>n.className),['tisya-body-prose','tisya-body-document','tisya-body-prose']);assert.match(story.firstElementChild.textContent,/前文/);assert.match(story.lastElementChild.textContent,/后文/);
  appearance={动画效果:false,标记美化:false};view.refresh();assert.equal(story.querySelector('iframe'),frame);
  const toggle=view.host.shadowRoot.querySelector('#world-extension-toggle');toggle.click();toggle.click();assert.equal(story.querySelector('iframe'),frame);assert.equal(p.compilations(),1);
 }finally{view?.dispose();await w.happyDOM.abort();}
});

test('only complete regex-authored HTML fences become body documents; literal examples remain code',async()=>{
 const {w,d}=setup();try{
  const value=fence(staticHTML),literal={body:value,bodyRuns:[{text:value,ruleName:null}]};assert.equal(bodyParts.bodyDisplayParts(d,literal),null);
  const partial={body:value,bodyRuns:[{text:'```html\n',ruleName:null},{text:staticHTML,ruleName:'card'},{text:'\n```',ruleName:null}]};assert.equal(bodyParts.bodyDisplayParts(d,partial),null);
  const authored={body:value,bodyRuns:[{text:value,ruleName:'card'}]},parts=bodyParts.bodyDisplayParts(d,authored);assert.equal(parts.filter(p=>p.html).length,1);assert.equal(parts[0].nativeHosted,false);assert.equal(bodyParts.nativeBodyParts(d,authored),null);
  const unfinished={body:value.slice(0,-3),bodyRuns:[{text:value.slice(0,-3),ruleName:'card'}]};assert.equal(bodyParts.bodyDisplayParts(d,unfinished),null);
 }finally{await w.happyDOM.abort();}
});

test('mixed static and live body cards preserve original helper roots while the world orb only folds extra',async()=>{
 const {w,d,native}=setup();let keeper;try{
  const live='<html><body><button>保留按钮</button><script>window.nativeCount=1</script></body></html>',extra='<html><body><script>window.extraCount=1</script></body></html>';
  const makeRoot=(html,id)=>{const root=d.createElement('div');root.className='TH-render';const pre=d.createElement('pre'),code=d.createElement('code'),frame=d.createElement('iframe');code.textContent=html;pre.append(code);frame.id='TH-message--0--'+id;root.append(pre,frame);native.append(root);return {root,frame,realm:frame.contentWindow};};
  const a=makeRoot(live,'body'),e=makeRoot(extra,'extra'),body='前文\n'+fence(staticHTML)+'\n中间\n'+fence(live)+'\n后文',display={body,bodyRuns:[{text:body,ruleName:'card'}],extraPanels:[{id:'extra',html:extra,ruleName:'card'}]};
  keeper=preserveNativePanels(d,native,display,{formatBody:x=>x});assert.equal(keeper.display.nativeBody,true);assert.deepEqual(keeper.bodyStatus(),{expected:1,mounted:1});const staticFrame=native.querySelector('[data-tisya-body-document]');assert(staticFrame);assert.notEqual(staticFrame,a.frame);
  keeper.setExpanded(false);assert(!a.root.classList.contains('tisya-native-extra-collapsed'));assert(e.root.classList.contains('tisya-native-extra-collapsed'));keeper.setExpanded(true);keeper.refresh();assert.equal(native.querySelector('[data-tisya-body-document]'),staticFrame);assert.equal(a.frame.parentElement,a.root);assert.equal(a.frame.contentWindow,a.realm);assert.equal(e.frame.contentWindow,e.realm);assert.equal(native.querySelectorAll('iframe').length,3);assert.equal(w.nativeCount,undefined);
 }finally{keeper?.dispose();await w.happyDOM.abort();}
});

test('prose keeps Markdown code and HTML literal attributes out of mark decoration',async()=>{
 const {w,d}=setup();try{
  const literal='~~~html\n<div title="〔信笺〕">〔信笺〕代码〔/信笺〕</div>\n~~~',inline='`<b>〔内心〕示例〔/内心〕</b>`',source=literal+'\n\n'+inline+'\n\n〔信笺〕正文〔/信笺〕';let prepared;
  formatProse(d,source,text=>(prepared=text,text));assert(prepared.includes(literal));assert(prepared.includes(inline));const rendered=d.createElement('div');rendered.innerHTML=prepared;assert.equal(rendered.querySelectorAll('[data-tisya-mark="信笺"]').length,1);assert.equal(rendered.querySelectorAll('[data-tisya-mark="内心"]').length,0);
 }finally{await w.happyDOM.abort();}
});
