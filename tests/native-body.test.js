import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {fixture} from './fixtures/journey-r4.cjs';
import {createNativeDisplayPipeline} from '../native-display.js';
import {nativeBodyParts} from '../native-body.js';
import {preserveNativePanels,captureNativePanelSources} from '../native-panels.js';
import {nativePanelContentProcessor} from '../native-panel-source.js';
import {mountMessageAppearance} from '../message-ui.js';
import {inspectMessage} from '../reader.js';
import {preferNativeBeauty} from '../native-beauty.js';
import {DISPLAY_DEFAULTS} from '../display-settings.js';
import {mountParagraphActions} from '../paragraph-actions.js';
const html=id=>'<!doctype html><html><body><button id="'+id+'">原卡</button><script>window.cardInitCount=(window.cardInitCount||0)+1;document.querySelector("button").onclick=function(){window.cardClickCount=(window.cardClickCount||0)+1;this.textContent=String(window.cardClickCount);};</script></body></html>';
const fence=id=>'```html\n'+html(id)+'\n```';
const rule=id=>({scriptName:'native-'+id,findRegex:'CARD_'+id,replaceString:fence(id),markdownOnly:true,placement:[2]});
const pipeline=(ids=['A'])=>createNativeDisplayPipeline({enabled:()=>true,scripts:()=>ids.map(rule),regexProvider:{get:s=>new RegExp(s,'g')}});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const format=s=>s.replace(/```html\n([\s\S]*?)\n```/g,(_,code)=>'<pre><code>'+escape(code)+'</code></pre>');
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
function setup(){const w=new Window({url:'http://localhost/',settings:{enableJavaScriptEvaluation:true,disableIframePageLoading:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};d.head.innerHTML='<style>body.tisya-active .tisya-source-concealed{display:none!important}</style>';d.body.className='tisya-active';d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><p class="private">PRIVATE_NATIVE</p></div></div></div></div>';return {w,d,native:d.querySelector('.mes_text'),mes:d.querySelector('.mes')};}
function host(d,native,id,{frame=true}={}){const root=d.createElement('div'),pre=d.createElement('pre'),code=d.createElement('code');root.className='TH-render';code.textContent=html(id);pre.append(code);root.append(pre);let iframe=null;if(frame){iframe=d.createElement('iframe');iframe.id='TH-message--0--'+id;iframe.srcdoc=html(id);root.append(iframe);}native.append(root);if(iframe)assert(iframe.contentWindow?.document);return {root,pre,code,frame:iframe,realm:iframe?.contentWindow};}
const prose=native=>[...native.querySelectorAll('.tisya-native-body-prose')].map(n=>n.shadowRoot.textContent).join('');

test('same-pass body provenance stays aligned after numbering and CDATA; literal examples remain text',async()=>{
 const {w,d}=setup(),p=pipeline();
 for(const body of ['1\n前文\n\n2\nCARD_A\n\n3\n后文','<![CDATA[1\n前文\n\n2\nCARD_A\n\n3\n后文]]>']){const display=p.project(fixture({body}));assert.equal(display.bodyRuns.map(r=>r.text).join(''),display.body);const parts=nativeBodyParts(d,display);assert.equal(parts.filter(x=>x.html).length,1);assert.match(parts[0].text,/前文/);assert.match(parts.at(-1).text,/后文/);}
 const example='正文示例\n'+fence('A'),display={body:example,bodyRuns:[{text:example,ruleName:null}]};assert.equal(nativeBodyParts(d,display),null);
 const mixed={body:example+'\n'+fence('B'),bodyRuns:[{text:example+'\n',ruleName:null},{text:fence('B'),ruleName:'B'}]};const parts=nativeBodyParts(d,mixed);assert.equal(parts.filter(x=>x.html).length,1);assert.equal(parts.find(x=>x.html).source,html('B'));assert.match(parts[0].text,/```html/);await w.happyDOM.abort();
});

test('body cards keep exact live frames and prose order, while extra folds independently and private source stays hidden',async()=>{
 const {w,d,native}=setup(),a=host(d,native,'A'),b=host(d,native,'B'),extra=host(d,native,'E');
 const source=fixture({body:'1\n前文\n\n2\nCARD_A\n\n3\n中段\n\n4\nCARD_B\n\n5\n后文',extra:'CARD_E'}),display=pipeline(['A','B','E']).project(source);
 const keeper=preserveNativePanels(d,native,display,{formatBody:format});native.classList.add('tisya-source-concealed');
 assert.equal(keeper.display.nativeBody,true);assert.equal(keeper.display.body,'');assert.deepEqual(keeper.bodyStatus(),{expected:2,mounted:2});assert.deepEqual(keeper.status(),{expected:1,mounted:1});
 assert.notEqual(w.getComputedStyle(native).display,'none');assert(native.querySelector('.private').classList.contains('tisya-native-pruned'));
 assert.match(prose(native),/前文/);assert.match(prose(native),/中段/);assert.match(prose(native),/后文/);assert.doesNotMatch(prose(native),/cardInitCount|PRIVATE_NATIVE/);
 const order=[...native.children].filter(n=>n.classList.contains('tisya-native-body-prose')||n.classList.contains('TH-render')).map(n=>n.classList.contains('TH-render')?n.querySelector('iframe').id:n.shadowRoot.querySelector('div').textContent.trim());assert.deepEqual(order,['前文','TH-message--0--A','中段','TH-message--0--B','后文','TH-message--0--E']);
 keeper.setExpanded(false);assert(!a.root.classList.contains('tisya-native-extra-collapsed'));assert(extra.root.classList.contains('tisya-native-extra-collapsed'));assert.notEqual(w.getComputedStyle(native).display,'none');
 for(const row of [a,b,extra]){assert.equal(row.frame.parentElement,row.root);assert.equal(row.frame.contentWindow,row.realm);assert(row.frame.isConnected);}assert.equal(native.querySelectorAll('iframe').length,3);
 keeper.dispose();assert.equal(native.querySelector('.tisya-native-body-prose'),null);assert(!native.querySelector('.private').classList.contains('tisya-native-pruned'));await w.happyDOM.abort();
});

test('async reader completion cannot replace the body card with a static code block; refresh settles without DOM churn',async()=>{
 const {w,d,native,mes}=setup(),a=host(d,native,'A'),source=fixture({body:'1\n前文\n\n2\nCARD_A\n\n3\n后文'}),msg={mes:source,name:'中性卡'},p=pipeline(),errors=[];let release;
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,getCacheKey:()=>source,prepareMessage:()=>new Promise(r=>release=r),getNativeDisplay:(...x)=>p.project(...x),preferNative:(message,native,inspection)=>preferNativeBeauty({message,native,structured:inspection.structured,...p.state()}),formatBody:format,formatPreparedBody:format,getMotion:()=>false,getDisplay:()=>({...DISPLAY_DEFAULTS,世界扩展默认状态:'展开'}),onError:e=>errors.push(e.message)});
 ui.sync(mes);assert.equal(native.classList.contains('tisya-source-concealed'),false);const button=a.realm.document.querySelector('button');assert.equal(a.realm.cardInitCount,1);button.click();assert.equal(a.realm.cardClickCount,1);release({inspection:inspectMessage(source)});await pause();
 const visual=mes.querySelector('.tisya-message-visual'),tail=mes.querySelector('.tisya-message-actions-tail');assert(visual);assert(tail?.shadowRoot.querySelector('.world-extension'));assert.equal(visual.shadowRoot.querySelector('.story pre'),null);assert.equal(visual.shadowRoot.querySelector('iframe'),null);assert.notEqual(w.getComputedStyle(native).display,'none');assert.equal(a.frame.contentWindow,a.realm);assert.equal(a.realm.document.querySelector("button"),button);button.click();assert.equal(a.realm.cardClickCount,2);assert.equal(a.realm.cardInitCount,1);assert.equal(msg.mes,source);
 let changes=0;const observer=new w.MutationObserver(records=>{changes+=records.filter(r=>r.type==='childList').length;});observer.observe(native,{childList:true,subtree:true});for(let i=0;i<8;i++)ui.sync(mes);await pause();assert.equal(changes,0);observer.disconnect();assert.deepEqual(errors,[]);ui.dispose();await w.happyDOM.abort();
});

test('missing or replaced helper roots keep safe prose plus a waiting state and never reveal source',async()=>{
 const {w,d,native}=setup(),display=pipeline().project(fixture({body:'1\n前文\n\n2\nCARD_A\n\n3\n后文'})),keeper=preserveNativePanels(d,native,display,{formatBody:format});native.classList.add('tisya-source-concealed');
 assert.deepEqual(keeper.bodyStatus(),{expected:1,mounted:0});assert.match(prose(native),/前文/);assert.match(prose(native),/后文/);assert.equal(native.querySelector('.tisya-native-body-wait').hidden,false);assert.equal(native.querySelector('iframe'),null);
 const a=host(d,native,'A',{frame:false});keeper.refresh();const frame=d.createElement('iframe');frame.id='TH-message--0--A';a.root.append(frame);keeper.refresh();assert.equal(keeper.bodyStatus().mounted,1);assert.equal(native.querySelector('.tisya-native-body-wait').hidden,true);
 a.pre.remove();keeper.refresh();assert.equal(keeper.bodyStatus().mounted,1);
 const unknown=d.createElement('div');unknown.className='TH-render';const second=d.createElement('iframe');second.id='TH-message--0--unknown';unknown.append(second);a.root.replaceWith(unknown);keeper.refresh();assert.equal(keeper.bodyStatus().mounted,0);assert(unknown.classList.contains('tisya-native-pruned'));assert.match(prose(native),/前文/);assert.equal(native.querySelector('.tisya-native-body-wait').hidden,false);
 keeper.dispose();await w.happyDOM.abort();
});

test('ambiguous repeated documents and mixed private source wrappers stay concealed instead of guessing ownership',async()=>{
 for(const mixed of [false,true]){const {w,d,native}=setup(),a=host(d,native,'A');if(mixed){const privateNode=d.createElement('p');privateNode.textContent='PRIVATE_INSIDE_ROOT';a.root.append(privateNode);}else host(d,native,'A');
 const keeper=preserveNativePanels(d,native,pipeline().project(fixture({body:'1\n前文\n\n2\nCARD_A\n\n3\n后文'})),{formatBody:format});assert.equal(keeper.bodyStatus().mounted,0);assert(a.root.classList.contains('tisya-native-pruned'));assert.match(prose(native),/前文/);keeper.dispose();await w.happyDOM.abort();}
 const {w,d,native}=setup(),a=host(d,native,'A'),keeper=preserveNativePanels(d,native,pipeline().project(fixture({body:'1\nCARD_A',extra:'CARD_A'})),{formatBody:format});assert.equal(keeper.bodyStatus().mounted,0);assert.equal(keeper.status().mounted,0);assert(a.root.classList.contains('tisya-native-pruned'));keeper.dispose();await w.happyDOM.abort();
});

test('body-only structured regex receives an inert host source, while ordinary openings are untouched',async()=>{
 const {w,d}=setup(),p=pipeline(),source=fixture({body:'1\nCARD_A'}),message={mes:source};let projects=0;
 const processor=nativePanelContentProcessor({document:d,project:s=>{projects++;return p.project(s);}}),result=await processor.prepare({message,mesid:0},async()=>'<p>base</p>');const parsed=d.createElement('div');parsed.innerHTML=result;assert.equal(parsed.querySelector('code').textContent.trim(),html('A'));assert.equal(parsed.querySelector('script'),null);assert.equal(parsed.querySelector('iframe'),null);assert.equal(message.mes,source);
 assert.equal(await processor.prepare({message:{mes:'<start></start>'},mesid:0},async()=>'ordinary'),'ordinary');assert.equal(projects,1);await w.happyDOM.abort();
});

test('source revision changes discard removed-pre identity and code toolbar text cannot change source identity',async()=>{
 const {w,d,native}=setup(),a=host(d,native,'A');const toolbar=d.createElement('button');toolbar.textContent='Copy code';a.pre.append(toolbar);captureNativePanelSources(native,'first');a.pre.remove();assert.equal(captureNativePanelSources(native).get(a.root).source,html('A'));captureNativePanelSources(native,'second');assert.equal(captureNativePanelSources(native).has(a.root),false);await w.happyDOM.abort();
});

test('body prose keeps the original long-press menu through its shadow event path without guessing paragraph IDs',async()=>{
 const {w,d,native,mes}=setup(),a=host(d,native,'A'),source=fixture({body:'1\n前文\n\n2\nCARD_A\n\n3\n后文'}),message={mes:source},token={message,text:source},errors=[],revisions=[],copies=[];
 const keeper=preserveNativePanels(d,native,pipeline().project(source),{formatBody:s=>'<p>'+s+'</p>'});native.classList.add('tisya-source-concealed');w.navigator.clipboard.writeText=async text=>copies.push(text);
 const actions=mountParagraphActions(d,{capture:n=>{assert.equal(n,mes);return token;},validate:t=>assert.equal(t,token),assertIdle(){},format:s=>'<p>'+s+'</p>',onRevise:(t,ids)=>revisions.push({same:t===token,ids}),onEdit(){},onRead(){},onMessage(){},onAction(){},onError:e=>errors.push(e.message),holdMs:1});
 const story=native.querySelector('.tisya-native-body-prose').shadowRoot.querySelector('.story');assert(story);
 const open=async()=>{story.querySelector('p').dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true,composed:true,pointerId:1,isPrimary:true,button:0,clientX:30,clientY:30}));await pause();assert(d.querySelector('#tisya-paragraph-menu'));};
 try{await open();d.querySelector('[aria-label="更多"]').click();await pause();d.querySelector('[aria-label="复制正文"]').click();await pause();assert.deepEqual(copies,['前文\n\nCARD_A\n\n后文']);
  await open();d.querySelector('[aria-label="更多"]').click();await pause();d.querySelector('[aria-label="高级重骰"]').click();await pause();assert.deepEqual(revisions,[{same:true,ids:undefined}]);
  await open();d.querySelector('[aria-label="选段修改"]').click();await pause();assert.deepEqual(errors,['此处排版无法对应原段落，请从“高级重骰”选择']);assert.equal(d.querySelector('#tisya-paragraph-menu'),null);
  const button=a.realm.document.querySelector('button');button.dispatchEvent(new a.realm.PointerEvent('pointerdown',{bubbles:true,composed:true,pointerId:2,isPrimary:true,button:0,clientX:20,clientY:20}));await pause();assert.equal(d.querySelector('#tisya-paragraph-menu'),null);button.click();assert.equal(a.realm.cardClickCount,1);assert.equal(a.realm.cardInitCount,1);assert.equal(a.frame.contentWindow,a.realm);assert.equal(message.mes,source);
 }finally{actions.dispose();keeper.dispose();await w.happyDOM.abort();}
});

test('only verified helper and host control element types can share a public runtime root',async()=>{
 for(const [tag,className,allowed]of [['div','TH-collapse-code-block-button',true],['button','tt-runtime-placeholder',true],['div','tt-runtime-ghost',true],['div','code-toggle',false],['span','TH-collapse-code-block-button',false]]){
  const {w,d,native}=setup(),a=host(d,native,'A'),control=d.createElement(tag);control.className=className;a.root.prepend(control);const keeper=preserveNativePanels(d,native,pipeline().project(fixture({body:'1\nCARD_A'})),{formatBody:format});
  assert.equal(keeper.bodyStatus().mounted,allowed?1:0,className+'/'+tag);assert.equal(a.root.classList.contains('tisya-native-pruned'),!allowed);assert.equal(a.frame.contentWindow,a.realm);keeper.dispose();await w.happyDOM.abort();
 }
});
