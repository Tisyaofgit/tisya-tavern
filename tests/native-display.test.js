import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {fixture,SECRET} from './fixtures/journey-r4.cjs';
import {createNativeDisplayPipeline} from '../native-display.js';
import {createDisplayCache} from '../display-cache.js';
import {inspectMessage,messageCacheReport} from '../reader.js';
import {mountMessageAppearance,mountMessageVisual} from '../message-ui.js';
import {mountWorldExtra} from '../world-extra.js';
import {preserveNativePanels} from '../native-panels.js';

test('structured projection preserves only matching public native frames without reload or duplication',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;d.body.innerHTML='<div class="mes_block"><div class="mes_text">PRIVATE_RAW<div class="host"><pre><code></code></pre><iframe id="TH-message--0-0"></iframe></div><div class="secret"><pre><code>private source</code></pre><iframe id="TH-message--0-1"></iframe></div></div></div>';
 const native=d.querySelector('.mes_text'),html='<script>getVariables()</script><button>open</button>',code=native.querySelector('code');code.textContent=html;
 const frame=native.querySelector('iframe'),parent=frame.parentElement,originalWindow=frame.contentWindow;
 const keeper=preserveNativePanels(d,native,{extraPanels:[{id:'public',html,ruleName:'card'}]});
 for(let round=0;round<10;round++){keeper.refresh();assert.equal(frame.parentElement,parent);assert.equal(frame.contentWindow,originalWindow);assert.equal(native.querySelectorAll('iframe').length,2);assert.equal(parent.classList.contains('tisya-native-pruned'),false);assert.equal(native.querySelector('.secret').classList.contains('tisya-native-pruned'),true);}
 assert.equal(keeper.display.extraPanels[0].nativeHosted,true);keeper.dispose();assert.equal(native.textContent.startsWith('PRIVATE_RAW'),true);assert.equal(native.querySelectorAll('.tisya-native-pruned').length,0);assert.equal(frame.parentElement,parent);await w.happyDOM.abort();
});

test('late helper mounting reveals the matching original frame and never treats private code as public',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,native=d.createElement('div');d.body.append(native);native.innerHTML='<div><pre><code></code></pre></div>';const html='<script type="module">Mvu.getMvuData()</script>';native.querySelector('code').textContent=html;
 const keeper=preserveNativePanels(d,native,{extraPanels:[{id:'p',ruleName:'card',html}]});assert.equal(native.classList.contains('tisya-native-panels'),false);const f=d.createElement('iframe');f.id='TH-message--1-0';native.firstElementChild.append(f);keeper.refresh();assert.equal(native.classList.contains('tisya-native-panels'),true);keeper.dispose();await w.happyDOM.abort();
});
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


test('world native bridge survives helper source removal, opens and closes without replacing frame',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;d.body.innerHTML='<div class="mes_block"><div class="mes_text"><div class="frame-host"><pre><code></code></pre><iframe id="TH-message--0-0"></iframe></div></div></div>';
 const native=d.querySelector('.mes_text'),html='<script>getVariables()</script>';native.querySelector('code').textContent=html;const frame=native.querySelector('iframe'),parent=frame.parentElement,content=frame.contentWindow;
 const keeper=preserveNativePanels(d,native,{extraPanels:[{id:'p',html,ruleName:'card'}]});native.querySelector('pre').remove();keeper.refresh();assert.equal(keeper.hasMounted(),true);assert(native.classList.contains('tisya-native-panels'));keeper.setExpanded(false);assert(native.classList.contains('tisya-native-collapsed'));keeper.setExpanded(true);assert(!native.classList.contains('tisya-native-collapsed'));assert.equal(frame.parentElement,parent);assert.equal(frame.contentWindow,content);keeper.dispose();assert(!native.classList.contains('tisya-native-collapsed'));await w.happyDOM.abort();
});
test('native-hosted content counts as present and actions sit after original panel above message toolbar',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><div><pre><code></code></pre><iframe id="TH-message--0-0"></iframe></div></div><div class="tisya-actions"></div></div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),frame=d.querySelector('iframe'),parent=frame.parentElement,html='<script>getVariables()</script>';native.querySelector('code').textContent=html;const msg={mes:source};
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,formatBody:x=>x,getNativeDisplay:()=>({body:'第一段',extraPanels:[{id:'p',html,ruleName:'card'}]}),getMotion:()=>false});ui.sync(node);
 const visual=node.querySelector('.tisya-message-visual'),r=visual.shadowRoot,tail=node.querySelector('.tisya-message-actions-tail');assert(tail.shadowRoot.querySelector('.action-region'));assert.equal(r.querySelector('.action-region'),null);const toggle=r.querySelector('#world-extension-toggle');if(toggle.getAttribute('aria-expanded')==='true')toggle.click();assert(native.classList.contains('tisya-native-collapsed'));toggle.click();assert(!native.classList.contains('tisya-native-collapsed'));toggle.click();assert(native.classList.contains('tisya-native-collapsed'));assert.equal(frame.parentElement,parent);ui.dispose();assert.equal(node.querySelector('.tisya-message-actions-tail'),null);await w.happyDOM.abort();
});
test('far history is deferred before parsing and mounts when approaching the viewport',async()=>{
 const w=new Window(),d=w.document,observers=[];w.IntersectionObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}unobserve(){}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div>';const chat=d.querySelector('#chat'),node=d.querySelector('.mes'),msg={mes:source};chat.getBoundingClientRect=()=>({top:0,bottom:800,height:800});node.getBoundingClientRect=()=>({top:3000,bottom:3500,height:500});let calls=0;
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,formatBody:x=>{calls++;return x;},getMotion:()=>false});ui.sync(node);assert.equal(calls,0);assert.equal(ui.report().deferred,1);assert(node.classList.contains('tisya-presentation-pending'));observers[0].callback([{target:node,isIntersecting:true}]);assert(calls>0);assert.equal(ui.report().mounted,1);assert.equal(ui.report().deferred,0);assert(!node.classList.contains('tisya-presentation-pending'));const before=calls;ui.sync(node);assert.equal(calls,before);ui.dispose();assert(!node.classList.contains('tisya-presentation-pending'));await w.happyDOM.abort();
});


test('bounded derived cache snapshot restores exact keys without overwriting newly computed values',()=>{const cache=createDisplayCache({entries:2,units:500});cache.read('source-a',()=>({text:'old'}));const snapshot=cache.snapshot(),fresh=createDisplayCache({entries:2,units:500});fresh.read('source-a',()=>({text:'new'}));fresh.restore(snapshot);assert.equal(fresh.read('source-a',()=>{throw Error('should hit');}).text,'new');fresh.restore([{key:'source-b',value:{text:'b'}},{key:'source-c',value:{text:'c'}}]);assert.equal(fresh.report().entries,2);assert.throws(()=>fresh.restore([{key:1}]),/条目无效/);});

test('offscreen deferral settles its MutationObserver and yields to input timers',async()=>{
 const w=new Window(),d=w.document,NativeObserver=w.MutationObserver;let deliveries=0,storm=false;
 // Bound the failing version so the regression itself cannot starve the runner.
 w.MutationObserver=class extends NativeObserver{constructor(callback){super((records,observer)=>{deliveries++;if(deliveries>40){storm=true;observer.disconnect();return;}callback(records,observer);});}};
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text">original</div></div></div>';
 const chat=d.querySelector('#chat'),node=d.querySelector('.mes');chat.getBoundingClientRect=()=>({top:0,bottom:800,height:800});node.getBoundingClientRect=()=>({top:3000,bottom:3500,height:500});
 const ui=mountMessageAppearance(d,{getMessage:()=>({mes:source}),formatBody:x=>x,getMotion:()=>false});
 try{ui.sync(node);await new Promise(resolve=>setTimeout(resolve,80));assert.equal(storm,false,'offscreen marker repeatedly retriggered its own observer');assert.ok(deliveries<=3,`unexpected observer deliveries: ${deliveries}`);assert.equal(ui.report().deferred,1);assert.equal(node.querySelector('.mes_text').textContent,'original');}
 finally{ui.dispose();await w.happyDOM.abort();}
});

test('helper source identity is captured before slow cache preparation and survives replacement before first paint',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">PRIVATE<div class="TH-render"><pre><code></code></pre></div><div class="private"><iframe id="TH-message--0--1"></iframe></div></div></div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),root=d.querySelector('.TH-render'),html='<!doctype html><html><body><script>getVariables()</script><p>public</p></body></html>',msg={mes:source};root.querySelector('code').textContent=html;let release;
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,formatBody:x=>x,getCacheKey:()=>source,prepareMessage:()=>new Promise(r=>release=r),getNativeDisplay:()=>({body:'第一段',extraPanels:[{id:'p',html,ruleName:'card'}]}),getMotion:()=>false});
 try{ui.sync(node);const frame=d.createElement('iframe');frame.id='TH-message--0--0';root.replaceChildren(frame);const realm=frame.contentWindow;release({inspection:inspectMessage(source)});await new Promise(r=>setTimeout(r,40));
 assert(native.classList.contains('tisya-native-panels'),'first view must associate the helper frame even after its code source is removed');assert(native.querySelector('.private').classList.contains('tisya-native-pruned'));assert.equal(frame.parentElement,root);assert.equal(frame.contentWindow,realm);assert.equal(root.querySelectorAll('iframe').length,1);
 }finally{ui.dispose();await w.happyDOM.abort();}
});

test('a claimed helper container remains identifiable while its iframe is pending or temporarily suspended',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;d.body.innerHTML='<div class="mes_block"><div class="mes_text"><div class="TH-render"><pre><code></code></pre></div><p>PRIVATE</p></div></div>';
 const native=d.querySelector('.mes_text'),root=d.querySelector('.TH-render'),html='<!doctype html><html><body><script>getVariables()</script></body></html>';root.querySelector('code').textContent=html;
 const keeper=preserveNativePanels(d,native,{extraPanels:[{id:'p',html,ruleName:'card'}]});
 try{assert(native.classList.contains('tisya-native-panels'),'pending helper must not be hidden by our presentation');const frame=d.createElement('iframe');frame.id='TH-message--0--0';root.append(frame);keeper.refresh();assert(keeper.hasMounted());frame.remove();keeper.refresh();assert(native.classList.contains('tisya-native-panels'));assert(!keeper.hasMounted());root.querySelector('code').textContent='<script>PRIVATE()</script>';keeper.refresh();assert(!native.classList.contains('tisya-native-panels'),'reused wrapper cannot retain previous public identity');}
 finally{keeper.dispose();await w.happyDOM.abort();}
});

test('plain DOM scripts in regex cards stay helper-owned and never get a second isolated runtime',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><div class="TH-render"><pre><code></code></pre></div></div></div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),root=d.querySelector('.TH-render'),html='<!doctype html><html><body><button onclick="document.body.dataset.clicked=1">open</button><script>document.body.dataset.started=1</script></body></html>',msg={mes:source};root.querySelector('code').textContent=html;
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,formatBody:x=>x,getNativeDisplay:()=>({body:'第一段',extraPanels:[{id:'p',html,ruleName:'card'}]}),getMotion:()=>false});
 try{ui.sync(node);const visual=node.querySelector('.tisya-message-visual'),notice=visual.shadowRoot.querySelector('.native-host-note');assert(notice&&!notice.hidden);assert.equal(visual.shadowRoot.querySelector('iframe'),null);assert.equal(d.body.dataset.started,undefined);
 const frame=d.createElement('iframe');frame.id='TH-message--0--0';root.append(frame);await new Promise(r=>setTimeout(r,40));assert(notice.hidden);assert.equal(native.querySelectorAll('iframe').length,1);assert.equal(frame.parentElement,root);}
 finally{ui.dispose();assert(!root.classList.contains('tisya-native-panel-root'));await w.happyDOM.abort();}
});

test('native content replacement is scheduled once, preserves folds, and cannot resurrect after disposal',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">old</div></div></div></div>';
 const node=d.querySelector('.mes'),msg={mes:source},ui=mountMessageAppearance(d,{getMessage:()=>msg,formatBody:x=>x,getMotion:()=>false});ui.sync(node);
 const old=node.querySelector('.tisya-message-visual'),toggle=old.shadowRoot.querySelector('#world-extension-toggle');toggle.click();const expanded=toggle.getAttribute('aria-expanded');const native=d.createElement('div');native.className='mes_text';native.textContent='new host render';node.querySelector('.mes_text').replaceWith(native);
 await new Promise(r=>setTimeout(r,40));const next=node.querySelector('.tisya-message-visual');assert.notEqual(old,next);assert.equal(node.querySelectorAll('.tisya-message-visual').length,1);assert.equal(next.shadowRoot.querySelector('#world-extension-toggle').getAttribute('aria-expanded'),expanded);assert(native.classList.contains('tisya-source-concealed'));
 native.append(d.createElement('span'));ui.dispose();await new Promise(r=>setTimeout(r,30));assert.equal(node.querySelector('.tisya-message-visual'),null);assert(!native.classList.contains('tisya-source-concealed'));await w.happyDOM.abort();
});

test('mixed regex output preserves static parts while only script documents belong to the helper',async()=>{
 const w=new Window(),d=w.document,native=d.createElement('div');d.body.append(native);const html='说明文字\n```html\n<html><body><script>document.body.dataset.ok=1</script></body></html>\n```\n尾部说明';
 const keeper=preserveNativePanels(d,native,{extraPanels:[{id:'mixed',html,ruleName:'card'}]});assert.equal(keeper.display.extraPanels.length,3);assert.deepEqual(keeper.display.extraPanels.map(p=>p.nativeHosted),[false,true,false]);assert.equal(keeper.status().expected,1);assert.match(keeper.display.extraPanels[0].html,/说明文字/);assert.match(keeper.display.extraPanels[2].html,/尾部说明/);keeper.dispose();await w.happyDOM.abort();
});
