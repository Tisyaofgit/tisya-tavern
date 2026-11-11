import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {fixture} from './fixtures/journey-r4.cjs';
import {createNativeDisplayPipeline} from '../native-display.js';
import {bodyDisplayParts,nativeBodyParts} from '../native-body.js';
import {prepareNativePanelSource} from '../native-panel-source.js';
import {mountBodyContent} from '../body-content.js';

const html='<!doctype html><html><body><button>Neutral</button><script>window.neutralLeakProbe=(window.neutralLeakProbe||0)+1;</script></body></html>';
const fence=(info='html')=>'```'+info+'\n'+html+'\n```';
const plain=text=>({text,ruleName:null}),authored=(text,ruleName='neutral-template')=>({text,ruleName});
const display=runs=>({body:runs.map(run=>run.text).join(''),bodyRuns:runs,extraPanels:[]});
const marker='<bgm>当前bgm: Neutral - Artist</bgm>';
const sourceFor=body=>'<reply id="tisya-onepass-1">\n<task format="pipes">信号|明确要求|中性测试|显示</task>\n<anchor phase="before">构想|保留结构</anchor>\n<title format="pipes">中性测试|某日|测试地|测试世界</title>\n<body min="1" max="5000" unit="字">\n'+body+'\n</body>\n<anchor phase="after">立住了|边界</anchor>\n<extra><cells format="delta"></cells><vars/></extra>\n<archive format="form"/>\n<actions min="0" max="0"/>\n</reply>';
const pipeline=(info='html',findRegex='<bgm>当前bgm:.*?<\\/bgm>')=>createNativeDisplayPipeline({enabled:()=>true,scripts:()=>[{scriptName:'neutral-template',findRegex,replaceString:fence(info),placement:[2],markdownOnly:true}],regexProvider:{get:source=>new RegExp(source,'g')}});
const createWindow=()=>new Window({settings:{enableJavaScriptEvaluation:false,disableIframePageLoading:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
const documents=(d,value)=>(bodyDisplayParts(d,value)??[]).filter(part=>part.html);
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

for(const info of ['', 'html'])test('one literal tick pair around one approved '+(info||'unlabelled')+' fence preserves the exact document and keeps JS out of prose',async()=>{
 const w=createWindow(),d=w.document,source=sourceFor('1 前文。\n2 `'+marker+'`\n3 后文。'),message={mes:source};let view;
 try{
  const projected=pipeline(info).project(source),before=structuredClone(projected),parts=nativeBodyParts(d,projected);
  assert.equal(parts?.filter(part=>part.html).length,1);
  assert.equal(parts.find(part=>part.html).source,html);
  assert.match(parts[0].text,/前文/);assert.match(parts.at(-1).text,/后文/);
  const base='<p>HOST_BASE</p>',prepared=prepareNativePanelSource(d,base,projected),holder=d.createElement('div');holder.innerHTML=prepared;
  assert.equal(holder.querySelectorAll('pre code').length,1);assert.equal(holder.querySelector('pre code').textContent.trim(),html);
  assert.equal(holder.querySelector('script,iframe'),null);assert.equal(prepareNativePanelSource(d,prepared,projected),prepared);
  const container=d.createElement('div'),calls=[];d.body.append(container);
  view=mountBodyContent(d,container,{display:projected,formatBody:text=>{calls.push(text);return '<p>'+escape(text)+'</p>';}});
  assert.equal(container.querySelectorAll('.tisya-body-document').length,1);
  assert(calls.length>0);assert(calls.every(text=>!text.includes('neutralLeakProbe')));
  assert.equal(container.querySelector('script,iframe'),null);assert.equal(w.neutralLeakProbe,undefined);
  assert.deepEqual(projected,before);assert.equal(message.mes,source);
 }finally{view?.dispose();await w.happyDOM.abort();}
});

test('separate tick-wrapped replacements keep public prose and document order',async()=>{
 const w=createWindow(),d=w.document,source=sourceFor('1 前文。\n2 `'+marker+'`\n3 中段。\n4 `'+marker+'`\n5 后文。');
 try{const projected=pipeline().project(source),before=structuredClone(projected),parts=bodyDisplayParts(d,projected);assert.equal(parts?.filter(part=>part.html).length,2);assert.deepEqual(parts.filter(part=>part.html).map(part=>part.source),[html,html]);assert.match(parts.filter(part=>part.text).map(part=>part.text).join(''),/前文[\s\S]*中段[\s\S]*后文/);assert.deepEqual(projected,before);}
 finally{await w.happyDOM.abort();}
});

test('literal documents and mixed-source wrappers never become public runtime candidates',async()=>{
 const w=createWindow(),d=w.document,scriptAt=html.indexOf('window.neutralLeakProbe'),scriptEnd=html.indexOf('</script>');
 const cases=[
  ['literal complete fence',[plain('`'+fence()+'`')]],
  ['literal HTML inside generated fences',[plain('`'),authored('```html\n'),plain(html),authored('\n```'),plain('`')]],
  ['literal JS inside generated HTML',[plain('`'),authored('```html\n'+html.slice(0,scriptAt)),plain(html.slice(scriptAt,scriptEnd)),authored(html.slice(scriptEnd)+'\n```'),plain('`')]],
  ['plain whitespace splits the replacement',[plain('`'),authored('```html\n'),plain('\n'),authored(html+'\n```'),plain('`')]],
  ['different rules supply the inner fence',[plain('`'),authored('```html\n'+html,'first'),authored('\n```','second'),plain('`')]],
  ['separate runs share a name',[plain('`'),authored('```html\n'+html),authored('\n```'),plain('`')]],
  ['original prose crosses the document',[plain('`'),authored('```html\n<html><body>'),plain('ORIGINAL_PROSE'),authored('<script>window.neutralLeakProbe=1;</script></body></html>\n```'),plain('`')]],
  ['original paragraph boundary crosses the document',[plain('`'),authored('```html\n<html><body>'),plain('\n\n'),authored('<script>window.neutralLeakProbe=1;</script></body></html>\n```'),plain('`')]],
 ];
 try{for(const [name,runs]of cases){const projected=display(runs),before=structuredClone(projected);assert.equal(bodyDisplayParts(d,projected),null,name);assert.equal(nativeBodyParts(d,projected),null,name);assert.equal(prepareNativePanelSource(d,'<p>UNCHANGED</p>',projected),'<p>UNCHANGED</p>',name);assert.deepEqual(projected,before,name);}}
 finally{await w.happyDOM.abort();}
});

test('unpaired, multiple, detached or incomplete fence wrappers remain unclaimed',async()=>{
 const w=createWindow(),d=w.document;
 const cases=[
  ['opening literal tick only',[plain('`'),authored(fence())]],
  ['closing literal tick only',[authored(fence()),plain('`')]],
  ['two literal ticks per side',[plain('``'),authored(fence()),plain('``')]],
  ['unequal outer tick count',[plain('`'),authored(fence()),plain('``')]],
  ['four generated ticks plus a literal pair',[plain('`'),authored('````html\n'+html+'\n````'),plain('`')]],
  ['space separates the ticks',[plain('` '),authored(fence()),plain(' `')]],
  ['indent precedes the literal tick',[plain(' `'),authored(fence()),plain('`')]],
  ['literal closing tick lies after a space',[plain('`'),authored(fence()),plain(' `')]],
  ['closing outer tick was generated',[plain('`'),authored(fence()+'`')]],
  ['opening outer tick was generated',[authored('`'+fence()),plain('`')]],
  ['missing closing fence',[plain('`'),authored('```html\n'+html),plain('`')]],
  ['incomplete HTML document',[plain('`'),authored('```html\n<html><body><script>window.neutralLeakProbe=1;</script>\n```'),plain('`')]],
 ];
 try{for(const [name,runs]of cases){const projected=display(runs);assert.equal(bodyDisplayParts(d,projected),null,name);assert.equal(prepareNativePanelSource(d,'<p>UNCHANGED</p>',projected),'<p>UNCHANGED</p>',name);}}
 finally{await w.happyDOM.abort();}
});

test('private matches and matches crossing protocol ownership cannot enter body compatibility',async()=>{
 const w=createWindow(),d=w.document;
 const privateSource=fixture({body:'1\nPUBLIC_PROSE',taskExtra:'待定：`PRIVATE_CARD_TOKEN`',nextExtra:'待办：剧情待处理任务|门口|`PRIVATE_CARD_TOKEN`'});
 const crossSource=fixture({body:'1\nBRIDGE_OPEN',nextExtra:'待办：剧情待处理任务|门口|BRIDGE_CLOSE'});
 try{
  const message={mes:privateSource},projected=pipeline('html','PRIVATE_CARD_TOKEN').project(message.mes);
  assert.equal(documents(d,projected).length,0);assert.equal(prepareNativePanelSource(d,'<p>UNCHANGED</p>',projected),'<p>UNCHANGED</p>');assert(!projected.body.includes('neutralLeakProbe'));assert.equal(message.mes,privateSource);
  const crossMessage={mes:crossSource};assert.throws(()=>pipeline('html','BRIDGE_OPEN[\\s\\S]*?BRIDGE_CLOSE').project(crossMessage.mes),{code:'CROSS_REGION_MATCH'});assert.equal(crossMessage.mes,crossSource);
 }
 finally{await w.happyDOM.abort();}
});

test('ordinary authored fences and literal code examples keep their previous boundaries',async()=>{
 const w=createWindow(),d=w.document;
 try{
  assert.equal(documents(d,display([authored(fence())])).length,1);
  assert.equal(documents(d,display([authored('````html\n'+html+'\n````')])).length,1);
  assert.equal(documents(d,display([plain('```html\n'+html+'\n```')])).length,0);
  const example=pipeline().project(sourceFor('1 Example: `'+marker+'`'));
  assert.equal(documents(d,example).length,0);
  const staticHTML='<html><body><p>Neutral static document</p></body></html>',staticDisplay=display([plain('`'),authored('```html\n'+staticHTML+'\n```'),plain('`')]);
  assert.equal(documents(d,staticDisplay).length,1);assert.equal(nativeBodyParts(d,staticDisplay),null);
 }finally{await w.happyDOM.abort();}
});
