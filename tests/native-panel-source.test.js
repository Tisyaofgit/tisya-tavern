import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {nativePanelContentProcessor,prepareNativePanelSource} from '../native-panel-source.js';
import {preserveNativePanels} from '../native-panels.js';
import {createNativeDisplayPipeline} from '../native-display.js';
import {fixture} from './fixtures/journey-r4.cjs';

const html='<!DOCTYPE html>\n<html><body><p id="value"></p><script>document.getElementById("value").textContent=getVariables().stat_data.count;</script></body></html>';
const display={extraPanels:[{id:'panel',ruleName:'原卡状态栏',html:'```\n'+html+'\n```'}]};
test('missing Markdown runtime source becomes one inert code block, then the original helper frame remains visible',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;
 const base='<p>原有正文与附件</p><img src="/image.png">';
 const result=prepareNativePanelSource(d,base,display),root=d.createElement('div');root.innerHTML=result;d.body.append(root);
 assert.equal(root.querySelectorAll('pre').length,1);assert.equal(root.querySelector('code').textContent.trim(),html);assert.equal(root.querySelector('script'),null);assert.equal(root.querySelector('iframe'),null);assert.ok(root.querySelector('img'));
 assert.equal(prepareNativePanelSource(d,result,display),result);
 const pre=root.querySelector('pre'),host=d.createElement('div');host.className='TH-render';pre.replaceWith(host);host.append(pre);
 const keeper=preserveNativePanels(d,root,display),frame=d.createElement('iframe');frame.id='TH-message--0--0';host.append(frame);keeper.refresh();
 assert.equal(keeper.status().mounted,1);assert.ok(root.classList.contains('tisya-native-panels'));assert.equal(frame.parentElement,host);
 keeper.dispose();await w.happyDOM.abort();
});
test('already hosted or unidentified executable sources are never duplicated, and unapproved/static output is untouched',async()=>{
 const w=new Window(),d=w.document;
 for(const base of ['<div class="TH-render"></div>','<iframe></iframe>','<pre><code>&lt;script&gt;unknown()&lt;/script&gt;</code></pre>'])assert.equal(prepareNativePanelSource(d,base,display),base);
 for(const view of [{extraPanels:[]},{extraPanels:[{html}]},{extraPanels:[{ruleName:'static',html:'<div>text</div>'}]}])assert.equal(prepareNativePanelSource(d,'<p>base</p>',view),'<p>base</p>');
 await w.happyDOM.abort();
});
test('the real display pipeline recovers terminal vars/CDATA marker without changing the update or exposing private fields',async()=>{
 const w=new Window(),d=w.document,ops=[{op:'replace',path:'/count',value:0}],source=fixture().replace('<vars/>','<vars format="xml"><![CDATA[<UpdateVariable><Analysis>PRIVATE</Analysis><JSONPatch>'+JSON.stringify(ops)+'</JSONPatch></UpdateVariable><StatusPlaceHolderImpl/>]]></vars>');
 const pipeline=createNativeDisplayPipeline({enabled:()=>true,scripts:()=>[{scriptName:'原卡状态栏',findRegex:'<StatusPlaceHolderImpl/>',replaceString:display.extraPanels[0].html,placement:[2],markdownOnly:true}],regexProvider:{get:s=>new RegExp(s,'g')}});
 const msg={mes:source},processor=nativePanelContentProcessor({document:d,project:s=>pipeline.project(s)});
 const output=await processor.prepare({message:msg,mesid:0},async()=>'<p>正文</p>');
 assert.equal(msg.mes,source);assert.doesNotMatch(output,/PRIVATE|JSONPatch|op.*replace/);assert.match(output,/<pre><code/);
 await w.happyDOM.abort();
});
test('aborted, replaced, user, and invalid messages preserve the base result and never resurrect a pending source',async()=>{
 const w=new Window(),d=w.document;let projects=0,resolve,errors=0;const msg={mes:'<StatusPlaceHolderImpl/>'};
 const processor=nativePanelContentProcessor({document:d,project(){projects++;return display;},onError(){errors++;}});
 const pending=processor.prepare({message:msg,mesid:0},()=>new Promise(r=>resolve=r));msg.mes='changed';resolve('base');assert.equal(await pending,'base');assert.equal(projects,0);
 for(const extra of [{is_user:true},{is_system:true}])assert.equal(await processor.prepare({message:{mes:'<StatusPlaceHolderImpl/>',...extra}},async()=>'base'),'base');
 const abort=new AbortController();abort.abort();assert.equal(await processor.prepare({message:msg,signal:abort.signal},async()=>'base'),'base');
 const invalid=nativePanelContentProcessor({document:d,project(){throw Error('invalid envelope');},onError(){errors++;}});assert.equal(await invalid.prepare({message:{mes:'<StatusPlaceHolderImpl/>'}},async()=>'base'),'base');assert.equal(errors,1);
 await w.happyDOM.abort();
});
