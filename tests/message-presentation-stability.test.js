import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountMessageAppearance} from '../message-ui.js';
import {inspectMessage} from '../reader.js';
import {fixture} from './fixtures/journey-r4.cjs';
import {createMessagePreparation} from '../message-preparation.js';
import {createNativeDisplayPipeline} from '../native-display.js';

const settle=()=>new Promise(resolve=>setTimeout(resolve,25));
function setup(){
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text">原生文本</div></div></div>';
 const node=d.querySelector('.mes'),native=d.querySelector('.mes_text'),message={mes:fixture(),name:'甲'},jobs=[];
 let revision=0,scope='A',pending=false;
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getPending:()=>pending,getCacheKey:()=>scope+revision+message.mes,getStateKey:()=>scope+message.mes,
  prepareMessage:()=>new Promise(resolve=>jobs.push(resolve)),formatBody:x=>x,getMotion:()=>false});
 return {w,d,node,native,message,jobs,ui,revise(){revision++;},scope(v){scope=v;},pending(v){pending=v;},
  async ready(){jobs.at(-1)({inspection:inspectMessage(message.mes)});await settle();},async close(){ui.dispose();for(const job of jobs)job(null);await w.happyDOM.abort();}};
}

test('refreshing a cache for the same message keeps its visible presentation until the replacement is ready',async()=>{
 const f=setup();try{
  f.ui.sync(f.node);await f.ready();const host=f.node.querySelector('.tisya-message-visual');
  const toggle=host.shadowRoot.querySelector('#world-extension-toggle');toggle.click();const expanded=toggle.getAttribute('aria-expanded');
  f.revise();f.ui.sync(f.node);
  assert(f.node.querySelector('.tisya-message-visual')===host,'a cache read must not expose the raw source between frames');
  assert(f.native.classList.contains('tisya-source-concealed'));
  for(let i=0;i<20;i++)f.ui.sync(f.node);assert.equal(f.jobs.length,2);
  await f.ready();const next=f.node.querySelector('.tisya-message-visual');assert(next);
  assert.equal(next.shadowRoot.querySelector('#world-extension-toggle').getAttribute('aria-expanded'),expanded);
  assert.equal(f.node.querySelectorAll('.tisya-message-visual').length,1);
 }finally{await f.close();}
});

test('a genuinely changed source or chat does not retain the old presentation while reading',async()=>{
 for(const changed of ['source','scope']){const f=setup();try{
  f.ui.sync(f.node);await f.ready();const host=f.node.querySelector('.tisya-message-visual');
  if(changed==='source')f.message.mes=fixture({body:'1\n新的正文。'});else f.scope('B');
  f.ui.sync(f.node);assert.equal(host.isConnected,false);assert.equal(f.node.querySelector('.tisya-message-visual'),null);
  await f.ready();assert(f.node.querySelector('.tisya-message-visual'));
 }finally{await f.close();}}
});

test('completed streaming text remains visible while the final reader is being prepared',async()=>{
 const f=setup();try{
  f.pending(true);f.ui.sync(f.node);const stream=f.node.querySelector('.tisya-message-visual');assert(stream);
  f.pending(false);f.ui.sync(f.node);
  assert(f.node.querySelector('.tisya-message-visual')===stream,'final cache preparation must not reveal raw protocol text');
  assert(f.native.classList.contains('tisya-source-concealed'));
  await f.ready();assert(f.node.querySelector('.tisya-message-visual'));assert.equal(f.node.querySelectorAll('.tisya-message-visual').length,1);
 }finally{await f.close();}
});

test('generation of another reply keeps completed history mounted and does not reread its cache',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text">原文</div></div></div>';
 const node=d.querySelector('.mes'),message={mes:fixture(),name:'甲'};let reads=0,scope='A',generation=0,showPsychology=false;
 const hooks=createMessagePreparation({getScope:()=>scope,getDisplay:()=>({显示角色心理:showPsychology}),getPlayerName:()=>null,getGeneration:()=>generation,
  prepare:async identity=>{reads++;return {inspection:inspectMessage(identity.source)};}});
 const ui=mountMessageAppearance(d,{getMessage:()=>message,...hooks,getPending:()=>false,formatBody:x=>x,getMotion:()=>false});
 try{
  ui.sync(node);await settle();const host=node.querySelector('.tisya-message-visual');assert(host);
  // The host emits generation, archive and render notifications for other rows.
  for(let i=0;i<20;i++){ui.sync(node);ui.refresh();}await settle();
  assert.equal(reads,1);assert(node.querySelector('.tisya-message-visual')===host);
  showPsychology=true;ui.sync(node);await settle();assert.equal(reads,2);
  generation++;ui.sync(node);await settle();assert.equal(reads,3);
  scope='B';ui.sync(node);await settle();assert.equal(reads,4);
 }finally{ui.dispose();await w.happyDOM.abort();}
});

test('unrelated variable refreshes preserve a rendered card; changed macro output replaces it once',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text">原文</div></div></div>';
 const node=d.querySelector('.mes'),message={mes:fixture({body:'1\nTOKEN'}),name:'甲'};let revision=0,label='旧内容';
 const pipeline=createNativeDisplayPipeline({enabled:()=>true,contextKey:()=>revision,scripts:()=>[{scriptName:'标题',findRegex:'TOKEN',replaceString:'<b>{{label}}</b>',markdownOnly:true,placement:[2]}],regexProvider:{get:s=>new RegExp(s,'g')},substitute:s=>s.replaceAll('{{label}}',label)});
 let formatted=0;const ui=mountMessageAppearance(d,{getMessage:()=>message,getNativeDisplay:(...args)=>pipeline.project(...args),getRenderKey:(...args)=>pipeline.key(...args),formatBody:x=>{formatted++;return x;},getMotion:()=>false});
 try{
  ui.sync(node);const host=node.querySelector('.tisya-message-visual');assert(host);const before=formatted;
  for(let i=0;i<4;i++){revision++;pipeline.refresh();ui.sync(node);assert(node.querySelector('.tisya-message-visual')===host,'unchanged display output must not remount the card');}
  assert.equal(formatted,before);
  label='新的内容';revision++;pipeline.refresh();ui.sync(node);const changed=node.querySelector('.tisya-message-visual');
  assert(changed!==host);assert.match(changed.shadowRoot.querySelector('.story').textContent,/新的内容/);
  for(let i=0;i<10;i++)ui.sync(node);assert(node.querySelector('.tisya-message-visual')===changed);
 }finally{ui.dispose();await w.happyDOM.abort();}
});
