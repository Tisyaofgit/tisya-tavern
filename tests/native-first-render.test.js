import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {fixture} from './fixtures/journey-r4.cjs';
import {mountMessageAppearance} from '../message-ui.js';
import {inspectMessage} from '../reader.js';

test('async first render keeps message tools after all projected content before a native status frame mounts',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;
 w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><pre><code></code></pre></div><div class="tisya-actions"><button>重骰</button></div></div></div></div>';
 const mes=d.querySelector('.mes'),block=d.querySelector('.mes_block'),native=d.querySelector('.mes_text'),tools=d.querySelector('.tisya-actions');
 const html='<!doctype html><html><body><script>window.statusReady=true</script><p>原卡状态</p></body></html>',source=fixture({extra:'STATUS_CARD'}),message={mes:source};
 native.querySelector('code').textContent=html;let release;
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getCacheKey:()=>source,prepareMessage:()=>new Promise(resolve=>release=resolve),getNativeDisplay:()=>({body:'公开正文',extraPanels:[{id:'status',html,ruleName:'原卡状态'}]}),formatBody:s=>s,getMotion:()=>false});
 try{
  ui.sync(mes);assert.equal(block.lastElementChild,tools);
  release({inspection:inspectMessage(source)});await new Promise(resolve=>setTimeout(resolve,35));
  const tail=block.querySelector('.tisya-message-actions-tail');assert(tail?.shadowRoot.querySelector('.action-region'));
  assert.equal(block.lastElementChild,tools,'async projection must not append content after the message toolbar');
  assert.equal(native.querySelector('iframe'),null,'the projection must not create a second helper runtime');
  assert.equal(message.mes,source);
 }finally{ui.dispose();await w.happyDOM.abort();}
});
