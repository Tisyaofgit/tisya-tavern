
import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createNativeDisplayPipeline} from '../native-display.js';
import {bodyDisplayParts} from '../native-body.js';
import {prepareNativePanelSource} from '../native-panel-source.js';
import {preserveNativePanels} from '../native-panels.js';
import {mountBodyContent} from '../body-content.js';

const html='<html><body><button>状态</button><script>window.inlineCardStarts=(window.inlineCardStarts||0)+1;</script></body></html>';
const fence='\x60\x60\x60html\n'+html+'\n\x60\x60\x60';
const source=body=>'<reply><anchor phase="before"/><title>中性测试</title><body>'+body+'</body><anchor phase="after"/><extra><cells/><vars/></extra><archive/><actions/></reply>';
const project=body=>createNativeDisplayPipeline({enabled:()=>true,scripts:()=>[{scriptName:'原卡',findRegex:'CARD',replaceString:fence,markdownOnly:true,placement:[2]}],regexProvider:{get:p=>new RegExp(p,'g')}}).project(source(body));
const setup=()=>new Window({settings:{disableIframePageLoading:true,enableJavaScriptEvaluation:false}});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

for(const body of ['1 前文CARD','1 CARD后文','1 前文CARD后文','1 前文CARD中段CARD后文'])test('complete rule document keeps its boundary when adjacent to prose: '+body,async()=>{
 const w=setup(),d=w.document,display=project(body),before=structuredClone(display);let view;
 try{
  const parts=bodyDisplayParts(d,display),count=body.split('CARD').length-1;
  assert.equal(parts?.filter(p=>p.html).length,count);
  assert(parts.filter(p=>p.html).every(p=>p.html.trim()===html&&p.nativeHosted));
  assert.equal(parts.filter(p=>p.text).map(p=>p.text).join('').replace(/^1 /,''),body.replace(/^1 /,'').replaceAll('CARD',''));
  const box=d.createElement('div');d.body.append(box);const formatted=[];
  view=mountBodyContent(d,box,{display,formatBody:s=>{formatted.push(s);return '<p>'+escape(s)+'</p>';}});
  assert(formatted.every(s=>!s.includes('inlineCardStarts')));
  assert.deepEqual(display,before);assert.equal(w.inlineCardStarts,undefined);
 }finally{view?.dispose();await w.happyDOM.abort();}
});

test('inline document enters the existing helper once and preserves the live root across refresh and folding',async()=>{
 const w=setup(),d=w.document,display=project('1 前文CARD后文');let keeper;
 try{
  const base='<p>原生正文</p>',prepared=prepareNativePanelSource(d,base,display),native=d.createElement('div');native.innerHTML=prepared;d.body.append(native);
  assert.equal(native.querySelectorAll('pre code').length,1);assert.equal(native.querySelector('code').textContent.trim(),html);
  assert.equal(prepareNativePanelSource(d,prepared,display),prepared);assert.equal(native.querySelector('script,iframe'),null);
  const pre=native.querySelector('pre'),root=d.createElement('div'),frame=d.createElement('iframe');root.className='TH-render';frame.id='TH-message--0--0';pre.replaceWith(root);root.append(pre,frame);const realm=frame.contentWindow;
  keeper=preserveNativePanels(d,native,display,{formatBody:s=>'<p>'+escape(s)+'</p>'});
  assert.deepEqual(keeper.bodyStatus(),{expected:1,mounted:1});
  keeper.setExpanded(false);keeper.setExpanded(true);keeper.refresh();
  assert.equal(frame.parentElement,root);assert.equal(frame.contentWindow,realm);assert.equal(native.querySelectorAll('iframe').length,1);
  assert(root.classList.contains('tisya-native-panel-root'));assert(!root.classList.contains('tisya-native-extra-collapsed'));
 }finally{keeper?.dispose();await w.happyDOM.abort();}
});

test('literal Markdown examples around rule tokens never gain an executable document',async()=>{
 const w=setup(),d=w.document;
 try{
  for(const [prefix,suffix] of [['Example: \x60','\x60'],['\x60\x60\x60text\n','\n\x60\x60\x60'],['Example: \x60\n','\n\x60'],['    example ','']]){
   const runs=[{text:prefix,ruleName:null},{text:fence,ruleName:'原卡'},{text:suffix,ruleName:null}],display={body:runs.map(r=>r.text).join(''),bodyRuns:runs,extraPanels:[]};
   const parts=bodyDisplayParts(d,display);assert.equal(parts?.filter(p=>p.html).length??0,0,prefix);
  }
 }finally{await w.happyDOM.abort();}
});

test('completed literal code earlier in the body does not disable a later inline card, and literal HTML stays literal',async()=>{
 const w=setup(),d=w.document;
 try{
  const runs=[{text:'\x60example\x60\n\n正文',ruleName:null},{text:fence,ruleName:'原卡'},{text:'后文',ruleName:null}],display={body:runs.map(r=>r.text).join(''),bodyRuns:runs};
  assert.equal(bodyDisplayParts(d,display)?.filter(p=>p.html).length,1);
  const text='正文'+fence+'后文';assert.equal(bodyDisplayParts(d,{body:text,bodyRuns:[{text,ruleName:null}]}),null);
  for(const texts of [[fence.slice(0,20),fence.slice(20)],[fence.slice(0,-3),'']]){
   const rows=texts.map(text=>({text,ruleName:'同名但独立'})),bad={body:'前文'+texts.join('')+'后文',bodyRuns:[{text:'前文',ruleName:null},...rows,{text:'后文',ruleName:null}]};assert.equal(bodyDisplayParts(d,bad),null);
  }
 }finally{await w.happyDOM.abort();}
});
