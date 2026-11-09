import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountWorldExtra,readWorldExtra} from '../world-extra.js';
import {mountMessageAppearance} from '../message-ui.js';
import {appendContractorMessages,contractorMessages} from '../communication.js';
import {fixture} from './fixtures/journey-r4.cjs';
import {phoneSource} from '../phone-turn-host.js';

const key='["character","0","phone-dom"]';
const payload={requestId:'request-canary-private-json',acks:[],blocks:[],markers:[{id:'m1',thread:'forum',floor:9}]};
const source=()=>fixture({body:'1\n你低头看了一眼。[[手机:m1]]\n\n2\n屏幕又暗下去。',extra:'<phone>'+JSON.stringify(payload)+'</phone>'});
const matrix=()=>'<reply><task/><anchor phase="before"/><title>门前|夜间|屋内|验证</title><body>1 你看见手机。[[手机:m1]]</body><anchor phase="after"/><extra><phone>'+JSON.stringify(payload)+'</phone></extra><cells/><vars/><archive/><actions>观察|我听一听。|等待。</actions></reply>';
function dom(){const w=new Window({url:'file:///host/index.html',settings:{disableIframePageLoading:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});const d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">原生内容</div></div></div></div>';return {w,d,node:d.querySelector('.mes')};}

test('真实world-extra对旧格式和Matrix格式都识别phone行；JSON不作为网页显示',async()=>{
 for(const raw of [source(),matrix()]){
  const {w,d}=dom(),root=d.createElement('section');d.body.append(root);const errors=[];
  const rows=readWorldExtra(raw);assert.equal(rows.length,1);assert.equal(rows[0].tag,'phone');
  const view=mountWorldExtra(d,root,{source:raw,structured:true,formatBody:x=>x,phoneContextKey:key,onError:e=>errors.push(e)});
  assert.equal(root.querySelectorAll('iframe').length,1);assert.equal(root.textContent.includes(payload.requestId),false);assert.equal(root.querySelector('script'),null);
  const url=new URL(root.querySelector('iframe').src);assert.equal(url.searchParams.get('chat'),key);assert.equal(url.searchParams.has('frozen'),false);assert.ok(url.pathname.endsWith('/phone.html'));
  assert.deepEqual(errors,[]);view.dispose();await w.happyDOM.abort();
 }
});

test('真实message-ui初次门面尚未出现也按传入context挂正文定格；展开后有独立完整手机',async()=>{
 const {w,d,node}=dom(),observed=[],errors=[];
 w.IntersectionObserver=class{constructor(callback){this.callback=callback;}observe(target){observed.push({target,callback:this.callback});}unobserve(){}disconnect(){}};
 const msg={is_user:false,is_system:false,name:'角色',mes:source(),extra:{tisya_engine:{uid:'message-uid'}}};
 assert.equal(w.Tisya,undefined);
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,getScope:()=>key,getPhoneContext:()=>key,getMotion:()=>false,formatBody:x=>x,onError:e=>errors.push(e)});
 ui.sync(node);const host=node.querySelector('.tisya-message-visual');assert.ok(host);const shadow=host.shadowRoot;
 const frozen=shadow.querySelector('.story iframe');assert.ok(frozen,JSON.stringify({body:shadow.querySelector('.story')?.innerHTML,errors:errors.map(e=>({code:e.code,message:e.message}))}));let u=new URL(frozen.src);assert.equal(u.searchParams.get('chat'),key);assert.equal(u.searchParams.get('frozen'),phoneSource(msg).sourceId);assert.equal(u.searchParams.get('marker'),'m1');
 const observer=observed.find(x=>x.target===host);assert.ok(observer);observer.callback([{isIntersecting:true}]);
 const button=[...shadow.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')?.includes('世界扩展'))??shadow.querySelector('[data-pendant="world-extension"]');
 if(button)button.click();ui.refresh();
 const frozenCount=shadow.querySelectorAll('.story iframe').length;
 let full=shadow.querySelector('.world-extension iframe');
 if(!full){const tab=shadow.querySelector('.world-extension .extra-tabs button');tab?.click();full=shadow.querySelector('.world-extension iframe');}
 assert.equal(frozenCount,1);assert.ok(full,'展开的原生世界扩展应有完整手机iframe');u=new URL(full.src);assert.equal(u.searchParams.get('chat'),key);assert.equal(u.searchParams.has('frozen'),false);assert.equal(shadow.textContent.includes(payload.requestId),false);
 assert.equal(errors.some(e=>e.code?.startsWith('PHONE_')||/手机.*归属/.test(e.message)),false);
 ui.dispose();await w.happyDOM.abort();
});

test('真实communication追加器不会因已存在场外要求而漏掉手机消息对',()=>{
 const directions=contractorMessages('场外方向'),phone=[{role:'system',content:'手机协议'},{role:'user',content:'{"format":"tisya.phone-turn-input/1"}'}];
 const messages=[{role:'user',content:'角色正文'},...directions];appendContractorMessages(messages,[...directions,...phone]);appendContractorMessages(messages,[...directions,...phone]);
 assert.equal(messages.length,5);assert.deepEqual(messages.slice(-2),phone);assert.equal(messages[0].content,'角色正文');
});
