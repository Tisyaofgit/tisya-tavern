import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {fixture} from './fixtures/journey-r4.cjs';import {inspectMessage,startReaderCache,prepareReaderMessage,reconcileReaderCache,clearReaderCache,readerCacheState} from '../reader.js';import {messageCacheOwner} from '../message-cache.js';import {mountMessageAppearance} from '../message-ui.js';import {IDBFactory} from 'fake-indexeddb';import {webcrypto} from 'node:crypto';
const settle=()=>new Promise(r=>setTimeout(r,30));
function setup(options={}){const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};d.body.innerHTML='<button id="native-button">宿主按钮</button><div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div>';const node=d.querySelector('.mes');let msg={mes:fixture(),name:'甲',send_date:'1'},scope='A';const ui=mountMessageAppearance(d,{getMessage:()=>msg,getCacheKey:()=>scope+msg.mes,formatBody:x=>x,getMotion:()=>false,...options});return {w,d,node,ui,get msg(){return msg;},set message(v){msg=v;},set scope(v){scope=v;},async close(){ui.dispose();await w.happyDOM.abort();}};}
test('pending cache reads never block native buttons, duplicate reads or leak into another chat',async()=>{
 const jobs=[];const f=setup({prepareMessage:msg=>new Promise(resolve=>jobs.push({source:msg.mes,resolve}))});f.ui.sync(f.node);for(let i=0;i<20;i++)f.ui.sync(f.node);assert.equal(jobs.length,1);
 let clicked=0;f.d.querySelector('button').onclick=()=>clicked++;await new Promise(r=>setTimeout(()=>{f.d.querySelector('button').click();r();},0));assert.equal(clicked,1);
 f.scope='B';f.message={...f.msg,mes:fixture().replace('门开了','另一段')};f.ui.sync(f.node);assert.equal(jobs.length,2);
 jobs[0].resolve({inspection:inspectMessage(jobs[0].source)});await settle();assert.equal(f.ui.size(),0);
 jobs[1].resolve({inspection:inspectMessage(jobs[1].source)});await settle();assert.equal(f.ui.size(),1);assert.match(f.node.querySelector('.tisya-message-visual').shadowRoot.querySelector('.story').textContent,/另一段/);await f.close();
});
test('editing or removing a message while disk read is pending cannot mount stale contents',async()=>{
 let finish;const f=setup({prepareMessage:msg=>new Promise(resolve=>finish=()=>resolve({inspection:inspectMessage(msg.mes)}))});f.ui.sync(f.node);f.node.classList.add('editing');finish();await settle();assert.equal(f.ui.size(),0);f.node.classList.remove('editing');f.ui.sync(f.node);await settle();assert.equal(f.ui.size(),1);await f.close();
 let late;const g=setup({prepareMessage:msg=>new Promise(resolve=>late=()=>resolve({inspection:inspectMessage(msg.mes)}))});g.ui.sync(g.node);g.node.remove();late();await settle();assert.equal(g.ui.size(),0);await g.close();
});
test('cache failure reports once and still renders current validated source',async()=>{
 const errors=[];let calls=0;const f=setup({prepareMessage:()=>{calls++;return Promise.reject(Error('disk error'));},onError:e=>errors.push(e.message)});f.ui.sync(f.node);await settle();for(let i=0;i<30;i++)f.ui.sync(f.node);assert.equal(f.ui.size(),1);assert.equal(calls,1);assert.deepEqual(errors,['disk error']);await f.close();
});
test('reading tab is restored after remount and pagehide flushes state against its original message',async()=>{
 const saves=[];const f=setup({prepareMessage:msg=>Promise.resolve({inspection:inspectMessage(msg.mes),viewState:{journey:{tab:'more'},folds:{journey:true}},save:state=>saves.push(state)})});f.ui.sync(f.node);await settle();const root=f.node.querySelector('.tisya-message-visual').shadowRoot;assert.equal(root.querySelector('[data-jr-tab=more]').getAttribute('aria-current'),'page');f.w.dispatchEvent(new f.w.Event('pagehide'));assert.equal(saves.length,1);assert.equal(saves[0].journey.tab,'more');await f.close();assert.equal(saves.length,2);
});
test('reader integration reuses hot projections and clearing disables callbacks from pre-clear views',async()=>{
 const w={indexedDB:new IDBFactory(),crypto:webcrypto},errors=[],cache=startReaderCache(w,e=>errors.push(e.message)),m={mes:fixture(),send_date:'same',name:'甲'},id={scope:'integration',owner:messageCacheOwner(m),source:m.mes};await reconcileReaderCache(id.scope,[m]);const packet=await prepareReaderMessage(id);await cache.flush();const before=readerCacheState().hotHits;const second=await prepareReaderMessage(id);assert.equal(second.inspection.structured,true);assert(readerCacheState().hotHits>before);await packet.save({journey:{tab:'more'}});assert.equal((await prepareReaderMessage(id)).viewState.journey.tab,'more');await clearReaderCache();await packet.save({journey:{tab:'more'}});assert.equal((await prepareReaderMessage(id)).viewState,null);assert.deepEqual(errors,[]);await cache.dispose();
});

test('a host-reused message object cannot carry another chat’s in-memory reading state',async()=>{
 const f=setup({prepareMessage:msg=>Promise.resolve({inspection:inspectMessage(msg.mes),viewState:{journey:{tab:'memories'}},save:()=>{}})});try{f.ui.sync(f.node);await settle();let root=f.node.querySelector('.tisya-message-visual').shadowRoot;root.querySelector('[data-jr-tab=more]').click();assert.equal(root.querySelector('[data-jr-tab=more]').getAttribute('aria-current'),'page');f.scope='another-chat';f.ui.sync(f.node);await settle();root=f.node.querySelector('.tisya-message-visual').shadowRoot;assert.notEqual(root.querySelector('[data-jr-tab=more]').getAttribute('aria-current'),'page');}finally{await f.close();}
});

test('far floors release their live view and remount from cache on approach',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,ios=[];
 w.IntersectionObserver=class{constructor(cb){this.cb=cb;this.nodes=new Set();ios.push(this);}observe(n){this.nodes.add(n);}unobserve(n){this.nodes.delete(n);}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div>';const node=d.querySelector('.mes'),chat=d.querySelector('#chat');
 const msg={mes:fixture(),name:'甲',send_date:'1'},saves=[];
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,getCacheKey:()=>'A'+msg.mes,formatBody:x=>x,getMotion:()=>false,prepareMessage:m=>Promise.resolve({inspection:inspectMessage(m.mes),viewState:{journey:{tab:'more'}},save:state=>saves.push(state)})});
 ui.sync(node);await settle();assert.equal(ui.size(),1);
 const rect=(top,bottom)=>({top,bottom,height:bottom-top,bottom,left:0,right:100,width:100,x:0,y:top});
 chat.getBoundingClientRect=()=>rect(0,1000);node.getBoundingClientRect=()=>rect(-6000,-5000);
 chat.dispatchEvent(new w.Event('scroll'));await new Promise(r=>setTimeout(r,650));
 assert.equal(ui.size(),0,'far floor must release its mounted view');assert(node.classList.contains('tisya-history-deferred'),'released floor returns to the deferred native form');assert.equal(node.querySelector('.tisya-message-visual'),null);assert(saves.length>=1,'release persists the reading state first');
 node.getBoundingClientRect=()=>rect(100,200);
 for(const io of ios)if(io.nodes.has(node))io.cb([{target:node,isIntersecting:true}]);
 await settle();assert.equal(ui.size(),1,'approaching remounts from the derived cache');assert(node.querySelector('.tisya-message-visual'));await new Promise(r=>setTimeout(r,650));assert.equal(ui.size(),1,'near floor is never released');
 ui.dispose();await w.happyDOM.abort();
});

test('mount margin is a live preference: widening it mounts further floors without a chat reload',async()=>{
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,ios=[];
 w.IntersectionObserver=class{constructor(cb){this.cb=cb;this.nodes=new Set();ios.push(this);}observe(n){this.nodes.add(n);}unobserve(n){this.nodes.delete(n);}disconnect(){}};
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_text"></div></div></div>';const node=d.querySelector('.mes'),chat=d.querySelector('#chat');
 const msg={mes:fixture(),name:'甲',send_date:'1'};let margin=800;
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,getCacheKey:()=>'A'+msg.mes,getMountMargin:()=>margin,formatBody:x=>x,getMotion:()=>false,prepareMessage:m=>Promise.resolve({inspection:inspectMessage(m.mes)})});
 const rect=(top,bottom)=>({top,bottom,height:bottom-top,left:0,right:100,width:100,x:0,y:top});
 chat.getBoundingClientRect=()=>rect(0,1000);node.getBoundingClientRect=()=>rect(2200,2400);
 ui.sync(node);assert.equal(ui.size(),0,'1200px beyond the viewport exceeds the default 800px margin');assert(node.classList.contains('tisya-history-deferred'));
 margin=2000;ui.refresh();
 const observer=ios.at(-1);assert(observer.nodes.has(node),'margin change rebuilds the observer over deferred floors');
 observer.cb([{target:node,isIntersecting:true}]);await settle();
 assert.equal(ui.size(),1,'widened margin mounts the floor from cache');assert(!node.classList.contains('tisya-history-deferred'));
 margin=800;ui.refresh();chat.dispatchEvent(new w.Event('scroll'));await new Promise(r=>setTimeout(r,650));
 assert.equal(ui.size(),1,'1200px beyond stays mounted inside the 3x release hysteresis');
 node.getBoundingClientRect=()=>rect(4200,4400);chat.dispatchEvent(new w.Event('scroll'));await new Promise(r=>setTimeout(r,650));
 assert.equal(ui.size(),0,'3200px beyond releases the floor again');
 ui.dispose();await w.happyDOM.abort();
});
