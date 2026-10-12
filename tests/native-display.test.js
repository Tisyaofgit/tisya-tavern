import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {fixture,SECRET} from './fixtures/journey-r4.cjs';
import {createNativeDisplayPipeline} from '../native-display.js';
import {createDisplayCache} from '../display-cache.js';
import {inspectMessage,messageCacheReport} from '../reader.js';
import {mountMessageAppearance,mountMessageVisual} from '../message-ui.js';
import {mountWorldExtra} from '../world-extra.js';
function setup(){let calls=0,active=true,depth=0;const scripts=[{scriptName:'状态',findRegex:'/\\[Overview\\|(\\d+)\\^(\\d+)\\]/g',replaceString:'<div class="status"><h2>星光</h2><strong>$1</strong><small>$2</small></div>',placement:[2],markdownOnly:true,trimStrings:[],substituteRegex:0}];const pipeline=createNativeDisplayPipeline({scripts:()=>scripts,enabled:()=>active,depth:()=>depth,regexProvider:{get(s){calls++;const m=/^\/(.*)\/([a-z]*)$/.exec(s);return m?new RegExp(m[1],m[2]):new RegExp(s);}}});return {pipeline,scripts,calls:()=>calls,enable:v=>active=v,depth:v=>depth=v};}
const source=fixture({extra:'<starchat_app>[Overview|270000^1350]</starchat_app>'});
test('native ordered display rules render card status once on the complete envelope and cache exact input',()=>{
 const f=setup();f.scripts.push({...f.scripts[0],findRegex:'/<strong>(\\d+)<\\/strong>/g',replaceString:'<b>关注 $1</b>'});f.pipeline.refresh();
 const a=f.pipeline.project(source);assert.match(a.extraPanels[0].html,/<b>关注 270000<\/b>/);assert.equal(a.extraPanels.length,1);
 for(let i=0;i<100;i++){f.pipeline.refresh();assert.equal(f.pipeline.project(source),a);}assert.equal(f.calls(),2);assert.equal(f.pipeline.report().hits,100);
 const sameSize=source.replace('270000','270001');assert.match(f.pipeline.project(sameSize).extra,/270001/);assert.equal(f.calls(),4);
 f.scripts[1].replaceString='<b>订阅 $1</b>';f.pipeline.refresh();assert.match(f.pipeline.project(source).extra,/订阅/);assert.equal(f.calls(),6);
 f.enable(false);f.pipeline.refresh();assert.match(f.pipeline.project(source).extra,/\[Overview/);assert.equal(f.calls(),6);
});
test('native display depth changes invalidate only bounded rules and rules cannot reveal restricted extra',()=>{
 const f=setup();f.scripts[0].maxDepth=0;f.pipeline.refresh();assert.match(f.pipeline.project(source).extra,/<strong>/);f.depth(1);assert.doesNotMatch(f.pipeline.project(source).extra,/<strong>/);
 const hidden=fixture({extra:'<starchat_app>[Overview|270000^1350]</starchat_app>',memory:'权限：extra|[starchat_app,Overview]|'+JSON.stringify(SECRET)});assert.deepEqual(f.pipeline.project(hidden).extraPanels,[]);
});
test('complete-key LRU retains failures, evicts old entries, and never aliases equal-length suffix edits',()=>{
 const c=createDisplayCache({entries:2,units:500});let calls=0;const read=k=>c.read(k,()=>{calls++;if(k==='bad')throw Error('failed');return k;});
 assert.throws(()=>read('bad'));assert.throws(()=>read('bad'));assert.equal(calls,1);read('aaa');read('aab');assert.equal(c.report().entries,2);assert.equal(read('aab'),'aab');assert.equal(calls,3);assert.throws(()=>read('bad'));assert.equal(calls,4);
});
test('unchanged message DOM updates skip inspection and keep body/card documents; explicit input changes refresh',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div>';const node=d.querySelector('.mes'),msg={mes:source+'\n<!--cache-test-->',name:'测试'};const f=setup();let formats=0;
 const view=mountMessageAppearance(d,{getMessage:()=>msg,formatBody:s=>{formats++;return s;},getNativeDisplay:(...a)=>f.pipeline.project(...a),getRenderKey:(...a)=>f.pipeline.key(...a),getMotion:()=>false});view.sync(node);const host=node.querySelector('.tisya-message-visual'),before=messageCacheReport(),formatted=formats;
 for(let i=0;i<100;i++)view.sync(node);assert.equal(messageCacheReport().misses,before.misses);assert.equal(formats,formatted);assert.equal(node.querySelector('.tisya-message-visual'),host);
 msg.mes=msg.mes.replace('270000','270001');view.sync(node);assert.notEqual(node.querySelector('.tisya-message-visual'),host);view.dispose();await w.happyDOM.abort();
});
test('world documents mount on first visible tab, preserve mounted frames and do not eagerly create all history iframes',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,root=d.createElement('div');d.body.append(root);const value=fixture({extra:'<one><div>一</div></one><two><div>二</div></two>'});const view=mountWorldExtra(d,root,{source:value,structured:true,lazy:true,formatBody:s=>s});assert.equal(root.querySelectorAll('iframe').length,0);view.refresh(false,false);assert.equal(root.querySelectorAll('iframe').length,0);view.refresh(false,true);const frame=root.querySelector('iframe');assert.ok(frame);for(let i=0;i<30;i++)view.refresh(true,false);view.refresh(false,true);assert.equal(root.querySelector('iframe'),frame);root.querySelectorAll('button')[1].click();assert.equal(root.querySelectorAll('iframe').length,2);view.dispose();await w.happyDOM.abort();
});
test('native regex cards expand without the moon-tide scroll or paging shell and retain their own documents',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};
 const root=d.createElement('div');d.body.append(root);const f=setup(),s=fixture({extra:'<raw>[Count|1]</raw><starchat_app>[Overview|270000^1350]</starchat_app>'});
 f.scripts[0].replaceString='<button class="original-orb" style="width:55px;height:55px">球</button>';f.pipeline.refresh();
 const view=mountMessageVisual(d,root,{source:s,formatBody:s=>s,getMotion:()=>false,getNativeDisplay:()=>f.pipeline.project(s)}),shadow=view.host.shadowRoot;
 const world=shadow.querySelector('.world-extension');assert.equal(world.dataset.presentation,'native');
 assert.equal(world.querySelector('.scroll-skin,.crystal-scroll,.extension-heading,.extra-tabs'),null);
 const raw=world.querySelector('.native-unformatted');assert.equal(raw.open,false);assert.match(raw.textContent,/Count/);
 assert.equal(world.querySelectorAll('.extra-page[hidden]').length,0);assert.ok(world.querySelector('.native-card-stack'));
 view.dispose();await w.happyDOM.abort();
});
test('unused legacy annotations are explained in More while independent public memory remains readable',async()=>{
 const w=new Window(),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};const root=d.createElement('div');d.body.append(root);const s=fixture({memory:'权限：status|[/无此路径]|A\n事件：玩家|~|公开记忆保留'}),result=inspectMessage(s);assert.equal(result.journey.value.memories.length,1);assert.equal(result.journey.value.diagnostics,undefined);assert.equal(result.journey.value.compatibility.length,1);const view=mountMessageVisual(d,root,{source:s,formatBody:s=>s,getMotion:()=>false});assert.equal(view.host.shadowRoot.querySelector('.record-notice'),null);assert.match(view.host.shadowRoot.querySelector('.journey-reader').textContent,/公开记忆保留/);view.host.shadowRoot.querySelector('[data-jr-tab=more]').click();assert.match(view.host.shadowRoot.querySelector('.record-compatibility').textContent,/没有对应的变量写入/);view.dispose();await w.happyDOM.abort();
});

test('bad capture numbers and lookaround captures cannot insert hidden source context into a public panel; failures are cached',()=>{
 const f=setup();f.scripts[0].findRegex='/Overview/g';f.scripts[0].replaceString='$2';f.pipeline.refresh();assert.throws(()=>f.pipeline.project(source),/CAPTURE_RANGE/);const count=f.calls();assert.throws(()=>f.pipeline.project(source),/CAPTURE_RANGE/);assert.equal(f.calls(),count);
 f.scripts[0].findRegex='/(?<=(<starchat_app>))\\[Overview\\|/g';f.scripts[0].replaceString='$1';f.pipeline.refresh();assert.throws(()=>f.pipeline.project(source),/CAPTURE_BOUNDARY/);
});
