import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createAtmosphere} from '../atmosphere-engine.js';
import {oceanMaterial} from '../ocean-material.js';
import {mountAtmosphere} from '../atmosphere-scene.js';
import {mountChatEffects} from '../message-ui.js';
import {CHAT_DEFAULTS} from '../chat-effects-core.js';
import {displayValues,withDisplayOverrides} from '../display-settings.js';
import {createWeather} from '../atmosphere-weather.js';
import {createBubbleAudio} from '../bubble-audio.js';
import {hairPose,HAIR_GROUPS} from '../home-hair-motion.js';

function setup(){
 const w=new Window(),d=w.document,frames=new Map(),errors=[];let ticket=0,now=0,hidden=false;
 d.body.innerHTML='<div id="sheld"><div id="chat"><p>正文</p><button>原按钮</button></div></div><div id="tisya-shell"></div>';
 const rect={left:0,top:0,right:390,bottom:720,width:390,height:720};w.HTMLElement.prototype.getBoundingClientRect=()=>rect;
 const media=new w.EventTarget();media.matches=false;w.matchMedia=()=>media;
 Object.defineProperty(d,'hidden',{get:()=>hidden});w.performance.now=()=>now;
 w.requestAnimationFrame=f=>{frames.set(++ticket,f);return ticket;};w.cancelAnimationFrame=id=>frames.delete(id);
 const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>{o[k]=v;return true;}});
 const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({})},{get:(o,k)=>o[k]??(()=>{})});
 w.HTMLCanvasElement.prototype.getContext=kind=>kind==='webgl'?gl:context;
 return {w,d,frames,errors,media,step(ms=16){now+=ms;const batch=[...frames.values()];frames.clear();for(const f of batch)f(now);},hide(value){hidden=value;d.dispatchEvent(new w.Event('visibilitychange'));},async close(){await w.happyDOM.abort();}};
}
test('one scene clock freezes on pause, hidden and reduced motion; disabled remains disabled after system changes',async()=>{
 const f=setup(),scene=mountAtmosphere(f.d,f.d.querySelector('#chat'));
 assert.equal(f.frames.size,1);for(let i=0;i<200;i++)f.step();const time=scene.report().time;
 scene.setPlaying(false);assert.equal(f.frames.size,0);f.step(8000);assert.equal(scene.report().time,time);
 f.media.matches=true;f.media.dispatchEvent(new f.w.Event('change'));f.media.matches=false;f.media.dispatchEvent(new f.w.Event('change'));assert.equal(f.frames.size,0);
 scene.setPlaying(true);f.hide(true);assert.equal(f.frames.size,0);f.step(50000);f.hide(false);f.step();assert.equal(scene.report().time,time);f.step();assert(scene.report().time-time<.1);
 f.media.matches=true;f.media.dispatchEvent(new f.w.Event('change'));assert.equal(f.frames.size,0);assert.equal(scene.tap(100,100),false);
 scene.dispose();assert.equal(f.frames.size,0);assert.equal(f.d.querySelectorAll('canvas').length,0);f.hide(false);assert.equal(f.frames.size,0);await f.close();
});
test('chat singleton survives message deletion and rejects controls, scrolls, long presses; sound is independent of motion',async()=>{
 const f=setup(),chat=f.d.querySelector('#chat');let motion=true,display={...CHAT_DEFAULTS,音效类型:'bubble'},starts=0,stops=0;
 f.w.AudioContext=class{state='running';currentTime=0;destination={};resume(){return Promise.resolve();}createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){starts++;},stop(){stops++;}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}close(){return Promise.resolve();}};
 const scene=mountChatEffects(f.d,{getMotion:()=>motion,getDisplay:()=>display,onError:e=>f.errors.push(e)});
 assert.throws(()=>mountChatEffects(f.d),/已挂载/);const canvas=f.d.querySelector('#tisya-chat-effects canvas');chat.querySelector('p').remove();assert.equal(f.d.querySelector('#tisya-chat-effects canvas'),canvas);
 const event=(target,type,x=100)=>target.dispatchEvent(new f.w.PointerEvent(type,{bubbles:true,composed:true,pointerId:1,button:0,isPrimary:true,clientX:x,clientY:100}));
 const tap=async target=>{event(target,'pointerdown');f.step(20);event(target,'pointerup');await Promise.resolve();f.step(110);};
 await tap(chat);assert.equal(starts,1);assert.equal(scene.report().tapBursts,1);
 await tap(chat.querySelector('button'));assert.equal(starts,1);
 event(chat,'pointerdown');chat.dispatchEvent(new f.w.Event('scroll'));event(chat,'pointerup');assert.equal(starts,1);
 event(chat,'pointerdown');f.step(500);event(chat,'pointerup');assert.equal(starts,1);
 motion=false;scene.refresh();await tap(chat);assert.equal(starts,2);assert.equal(scene.report().tapBursts,1);assert.equal(f.frames.size,0);
 display.点触音效=false;scene.refresh();await tap(chat);assert.equal(starts,2);assert(stops>=2);
 motion=true;scene.refresh();await tap(chat);assert.equal(scene.report().tapBursts,2);assert.equal(starts,2);
 f.d.querySelector('#tisya-shell').classList.add('tisya-page-open');scene.refresh();await tap(chat);assert.equal(scene.report().tapBursts,2);assert.equal(f.frames.size,0);
 scene.dispose();await tap(chat);assert.equal(f.d.querySelector('#tisya-chat-effects'),null);assert.deepEqual(f.errors,[]);await f.close();
});
test('new sound setting inherits without writing or resetting older appearance records',()=>{
 const old={动态效果:false,显示区块:{extensions:{斜雨:true,落雪:false,背景特效模式:'自选组合'}},其他:'保留'};
 const before=JSON.stringify(old);assert.equal(displayValues(old).点触音效,true);assert.equal(JSON.stringify(old),before);
 const next=withDisplayOverrides(old,{...old.显示区块.extensions,点触音效:false});assert.equal(next.动态效果,false);assert.equal(next.其他,'保留');assert.equal(displayValues(next).斜雨,true);assert.equal(displayValues(next).点触音效,false);
});
test('weather samples size and speed independently and wind changes continuously without resets on pause',()=>{
 const f=setup(),weather=createWeather(),ctx=f.w.document.createElement('canvas').getContext('2d');let previous=0,changed=false;const counts=new Set();
 for(let i=0;i<3000;i++){weather.draw(ctx,.016,i*.016,390,720,['rain','snow']);const sample=weather.report();counts.add(sample.rain.length+':'+sample.snow.length);const now=sample.wind;assert(Math.abs(now-previous)<.5);if(Math.abs(now)>2)changed=true;previous=now;}
 const report=weather.report();assert(changed);assert(counts.size>3);assert(report.rain.length>=28&&report.rain.length<=75);assert(report.snow.length>=14&&report.snow.length<=42);
 for(const [items,min,max]of [[report.rain,150,360],[report.snow,10,34]]){assert(new Set(items.map(p=>p.size)).size>10);assert(new Set(items.map(p=>p.speed)).size>10);assert(items.every(p=>p.speed>=min&&p.speed<=max));assert(items.some(p=>Math.abs(p.vx)>1));}
 weather.draw(ctx,0,47.984,390,720,['rain','snow']);assert.deepEqual(weather.report(),report);return f.close();
});
test('disabled or disposed audio cannot revive after a delayed unlock',async()=>{
 const f=setup();let unlock,starts=0;f.w.AudioContext=class{state='suspended';resume(){return new Promise(resolve=>{unlock=resolve;});}createOscillator(){starts++;throw Error('must not reach');}close(){return Promise.resolve();}};
 const sound=createBubbleAudio(f.d,{onError:e=>f.errors.push(e)}),pending=sound.play();sound.setEnabled(false);unlock();assert.equal(await pending,false);assert.equal(starts,0);sound.dispose();assert.equal(await sound.play(),false);assert.deepEqual(f.errors,[]);await f.close();
});
test('hair targets are smooth and bounded to a five CSS-mm total envelope across viewport sizes',()=>{
 for(const gender of ['female','male'])for(const width of [320,430,768]){assert.deepEqual(hairPose(0,gender,42,width),[0,0,0]);let previous=hairPose(0,gender,42,width);
  for(let t=.016;t<150;t+=.016){const pose=hairPose(t,gender,42,width);for(let i=0;i<pose.length;i++){const group=HAIR_GROUPS[gender][i],radius=Math.max(...group.points.map(([x,y])=>Math.hypot(x-group.pivot[0],y-group.pivot[1]))),scale=width/853;assert(Math.abs(pose[i])<=group.limit);assert(2*radius*Math.sin(Math.abs(pose[i])/2)*scale<=2.5*96/25.4+1e-8);assert(Math.abs(pose[i]-previous[i])*radius*scale<=12*.016);}previous=pose;}
  assert.notDeepEqual(hairPose(20,gender,42),hairPose(20,gender,43));assert.deepEqual(hairPose(20,gender,42),hairPose(20,gender,42));
 }
});

test('background off leaves a static frame with no RAF and a tap runs only until its concentric rings fade',async()=>{
 const f=setup(),scene=mountAtmosphere(f.d,f.d.querySelector('#chat'),{effects:{...CHAT_DEFAULTS,背景特效模式:'关闭'}});
 assert.equal(f.frames.size,0);assert.equal(scene.tap(100,100),true);assert.equal(f.frames.size,1);for(let i=0;i<120;i++)f.step();assert.equal(f.frames.size,0);
 scene.setEffects(CHAT_DEFAULTS);assert.equal(f.frames.size,1);scene.setEffects({...CHAT_DEFAULTS,背景特效模式:'关闭'});assert.equal(f.frames.size,0);scene.dispose();await f.close();
});

// Distinct chat/composer bounds reproduce the uncovered strip from Android.
test('chat backdrop covers the composer gutter and follows shell-only resizing without moving controls',async()=>{
 const f=setup(),sheld=f.d.querySelector('#sheld'),chat=f.d.querySelector('#chat');let shellHeight=900,resize;const observed=[];
 const form=f.d.createElement('form');form.id='send_form';form.style.cssText='margin-top:14px;position:relative';form.innerHTML='<textarea></textarea><button>发送</button>';sheld.append(form);const before=form.outerHTML;
 sheld.getBoundingClientRect=()=>({left:20,top:30,width:390,height:shellHeight});
 chat.getBoundingClientRect=()=>({left:28,top:50,width:374,height:600});
 f.w.ResizeObserver=class{constructor(cb){resize=cb;}observe(node){observed.push(node);}disconnect(){}};
 const scene=mountChatEffects(f.d,{getMotion:()=>false}),backdrop=f.d.querySelector('#tisya-chat-effects');
 assert.equal(backdrop.style.top,'20px');assert.equal(backdrop.style.left,'8px');assert.equal(backdrop.style.width,'374px');assert.equal(backdrop.style.height,'880px');
 assert.ok(observed.includes(chat));assert.ok(observed.includes(sheld));assert.equal(form.outerHTML,before);assert.equal(form.parentNode,sheld);
 shellHeight=700;resize();assert.equal(backdrop.style.height,'680px');
 shellHeight=500;resize();assert.equal(backdrop.style.height,'600px');
 scene.dispose();assert.equal(f.d.querySelector('#tisya-chat-effects'),null);assert.equal(form.outerHTML,before);await f.close();
});

test('emerald and bright water stay dynamic while the old picture remains an explicit static choice',async()=>{
 const f=setup(),node=f.d.querySelector('#chat'),scene=mountAtmosphere(f.d,node);const canvas=node.querySelector('canvas');
 assert.equal(CHAT_DEFAULTS.底图色调,'墨绿水域');assert.equal(canvas.style.opacity,'1');
 for(let i=0;i<30;i++)f.step();const first=scene.report().materialTime;for(let i=0;i<30;i++)f.step();assert(scene.report().materialTime>first);
 scene.setEffects({...CHAT_DEFAULTS,底图色调:'旧版墨绿'});assert.equal(canvas.style.opacity,'0');assert.match(canvas.parentElement.style.background,/quiet-water/);
 scene.setEffects({...CHAT_DEFAULTS,底图色调:'明潮'});assert.equal(canvas.style.opacity,'1');assert.equal(canvas.parentElement.style.background,'');
 scene.dispose();await f.close();
});

test('visible bubbles pop only on a hit and remain separate from blank tap rings',async()=>{
 const f=setup(),container=f.d.querySelector('#chat'),canvas=f.d.createElement('canvas'),particles=f.d.createElement('canvas');container.append(canvas,particles);
 const engine=createAtmosphere({container,canvas,particles,shaders:{current:oceanMaterial}});
 engine.demonstrateBurst();const before=engine.getStats();assert.equal(engine.popAt(390*.52,720*.46),true);const popped=engine.getStats();
 assert.equal(popped.bubbles,before.bubbles-1);assert.equal(popped.totalBursts,before.totalBursts+1);assert.equal(popped.tapRings,0);
 assert.equal(engine.popAt(-100,-100),false);assert.equal(engine.getStats().totalBursts,popped.totalBursts);
 assert.equal(engine.rippleAt(100,100),true);assert.equal(engine.getStats().tapRings,1);
 engine.setPaused(true);assert.equal(engine.popAt(100,100),false);engine.destroy();await f.close();
});
