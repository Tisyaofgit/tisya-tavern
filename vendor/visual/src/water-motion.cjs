'use strict';
const {decodedResourceImage}=require('./resource-runtime.cjs');
const {EFFECTS,CHAT_DEFAULTS,selectedEffects}=require('./chat-effects-options.cjs');
// One clock owns viewport effects, flame and real drawn sprite frames.
function createWaterMotion({root,canvas,lampCanvas,assets,manifest,pauseOnBlur=true,onError}){
 const doc=root.ownerDocument,win=doc.defaultView,ctx=canvas?.getContext('2d'),flame=lampCanvas?.getContext('2d');
 if(canvas&&!ctx||lampCanvas&&!flame)throw Error('CANVAS_UNAVAILABLE');
 const reduced=win.matchMedia('(prefers-reduced-motion: reduce)'),actors=new Set(),ripples=[];
 let alive=true,ready=false,request=0,last=null,time=0,mode='auto',manualPause=false,blurred=false,width=0,height=0,dpr=1,paints=0,scene='fireflies',effects={...CHAT_DEFAULTS};
 const sheets={},listeners=[];const listen=(n,type,fn,opts)=>{n.addEventListener(type,fn,opts);listeners.push(()=>n.removeEventListener(type,fn,opts));};
 const particles=Array.from({length:55},(_,i)=>({x:((i*73+13)%101)/101,y:((i*47+7)%103)/103,s:.4+((i*13)%17)/17,p:i*2.39996}));
 function allowed(){return alive&&ready&&!manualPause&&!reduced.matches&&!doc.hidden&&!blurred;}
 function enabled(n){return !n.closest('[data-motion="false"]');}
 function dimensions(){width=canvas?root.getBoundingClientRect().width:win.innerWidth;height=canvas?root.getBoundingClientRect().height:win.innerHeight;dpr=Math.min(win.devicePixelRatio||1,1.5);if(!canvas)return;const w=Math.round(width*dpr),h=Math.round(height*dpr);if(canvas.width===w&&canvas.height===h)return;canvas.width=w;canvas.height=h;canvas.style.width=width+'px';canvas.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}
 function ripple(x,y){if(!canvas||!allowed()||!enabled(canvas))return;const r=root.getBoundingClientRect();if(x<r.left||x>r.right||y<r.top||y>r.bottom)return;if(ripples.length>=9)ripples.shift();ripples.push({x:x-r.left,y:y-r.top,t:time});root.dataset.interactionCount=String(Number(root.dataset.interactionCount??0)+1);}
 function ring(x,y,r,alpha){ctx.strokeStyle='rgba(176,216,199,'+alpha+')';ctx.lineWidth=.75;ctx.beginPath();ctx.ellipse(x,y,r,r*.32,-.14,0,Math.PI*2);ctx.stroke();}
 function environment(){
  if(!ctx)return;ctx.clearRect(0,0,width,height);const active=enabled(canvas)?selectedEffects(effects,time):[];canvas.dataset.effects=active.join(' ');if(!enabled(canvas))return;const b={left:0,top:0,right:width,bottom:height,width,height};const sceneTop=0;ctx.save();ctx.beginPath();ctx.rect(Math.max(0,b.left),Math.max(0,sceneTop),Math.min(width,b.width),Math.max(0,Math.min(height,b.bottom)-Math.max(0,sceneTop)));ctx.clip();
  // Slow concentric disturbances and large, translucent currents behind the text.
  if(active.includes('ripples'))for(let i=0;i<7;i++){const p=(time*.13+i*.163)%1,x=b.left+b.width*(.05+((i*31)%91)/100),y=((i*193)%Math.max(1,height))+.5*Math.sin(time*.4+i)*12;ring(x,y,12+p*100,(1-p)*.22);ring(x,y,7+p*85,(1-p)*.13);}
  if(active.includes('water'))for(let i=0;i<4;i++){ctx.beginPath();ctx.strokeStyle='rgba(105,187,165,.10)';ctx.lineWidth=1.4;const y=height*(i+.5)/4+Math.sin(time*.19+i)*40;ctx.moveTo(b.left,y);ctx.bezierCurveTo(b.left+b.width*.25,y+60*Math.sin(time*.2+i),b.right-b.width*.3,y-85,b.right,y+12);ctx.stroke();}
  scene=effects.背景特效模式==='自动轮换'?['fireflies','rain','snow','water'][Math.floor(time/22)%4]:active.join('+')||'off';
  const phase=time%22,fade=effects.背景特效模式==='自动轮换'?Math.min(1,phase/2,(22-phase)/2):1;ctx.globalAlpha=fade;
  for(let i=0;i<particles.length;i++){const p=particles[i];
   if(active.includes('rain')){const x=b.left+((p.x*b.width+time*(45+p.s*20))%(b.width+70))-35,y=(p.y*height+time*(150+p.s*140))%(height+80)-40;ctx.strokeStyle='rgba(185,208,200,'+(.12+p.s*.14)+')';ctx.lineWidth=.6+p.s*.35;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+7+p.s*6,y+18+p.s*17);ctx.stroke();}
   if(active.includes('snow')&&i<28){const x=b.left+p.x*b.width+Math.sin(time*.35+p.p)*19,y=(p.y*height+time*(13+p.s*21))%(height+30)-15;ctx.fillStyle='rgba(218,230,221,'+(.18+p.s*.24)+')';ctx.beginPath();ctx.arc(x,y,.65+p.s*1.4,0,Math.PI*2);ctx.fill();}
   if(active.includes('fireflies')&&i<15){const x=b.left+p.x*b.width+Math.sin(time*.33+p.p)*15,y=p.y*height+Math.sin(time*.24+p.p)*25,a=.22+.22*Math.sin(time*.9+p.p),r=3+p.s*4,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(246,219,138,'+a+')');g.addColorStop(1,'rgba(179,206,137,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.fillStyle='rgba(249,227,161,'+(a+.08)+')';ctx.beginPath();ctx.arc(x,y,.6+p.s*.4,0,Math.PI*2);ctx.fill();}
  }
  ctx.globalAlpha=1;for(let i=ripples.length-1;i>=0;i--){const p=ripples[i],age=time-p.t;if(age>2.1){ripples.splice(i,1);continue;}const y=p.y;ring(p.x,y,4+age*43,(1-age/2.1)*.55);if(age>.16)ring(p.x,y,2+(age-.16)*33,(1-age/2.1)*.3);}
  ctx.restore();root.dataset.weather=scene;
 }
 function drawFlame(t){
  const m=manifest.flame;if(!flame||!sheets.flame)return;
  if(lampCanvas.width!==m.cellWidth){lampCanvas.width=m.cellWidth;lampCanvas.height=m.cellHeight;}
  flame.clearRect(0,0,m.cellWidth,m.cellHeight);flame.globalCompositeOperation='lighter';
  const q=allowed()&&enabled(lampCanvas)?t:0,frame=q*10,index=Math.floor(frame)%m.frames,blend=frame-Math.floor(frame);
  for(const [i,alpha]of [[index,1-blend],[(index+1)%m.frames,blend]]){flame.globalAlpha=alpha;flame.drawImage(sheets.flame,(i%m.columns)*m.cellWidth,Math.floor(i/m.columns)*m.cellHeight,m.cellWidth,m.cellHeight,0,0,m.cellWidth,m.cellHeight);}
  flame.globalAlpha=1;flame.globalCompositeOperation='source-over';lampCanvas.closest('.scene-heading').style.setProperty('--glow',String(.62+.07*Math.sin(q*7.7)+.035*Math.sin(q*13.1)));lampCanvas.dataset.tick=String(Math.round(q*1000));
 }
 function pose(actor,t){
  const active=allowed()&&enabled(actor.node),elapsed=actor.start===null?null:t-actor.start;
  if(elapsed!==null&&elapsed>=2.7)actor.start=null;
  let x=0,y=0,rotation=0;
  if(active&&actor.start!==null){const p=Math.min(1,(t-actor.start)/2.7),a=Math.sin(Math.PI*p);x=(actor.kind==='tadpole'?1:-1)*a*38;y=-Math.sin(Math.PI*p)*18-Math.sin(p*2*Math.PI)*7;rotation=-Math.sin(p*2*Math.PI)*8;}
  actor.node.dataset.playing=String(active&&actor.start!==null);
  actor.canvas.style.transform='translate('+x+'px,'+y+'px) rotate('+(actor.kind==='tadpole'?-rotation:rotation)+'deg)'+(actor.kind==='tadpole'?' scaleX(-1)':'');
  const rate=actor.kind==='tadpole'?12:9;const index=active&&actor.start!==null?Math.floor((t-actor.start)*rate)%actor.meta.frames:actor.idleFrame;
  if(actor.frame!==index){const m=actor.meta;actor.ctx.clearRect(0,0,m.cellWidth,m.cellHeight);actor.ctx.drawImage(sheets[actor.kind],(index%m.columns)*m.cellWidth,Math.floor(index/m.columns)*m.cellHeight,m.cellWidth,m.cellHeight,0,0,m.cellWidth,m.cellHeight);actor.frame=index;actor.node.dataset.frame=String(index);}
 }
 function draw(){environment();drawFlame(time);for(const a of actors){const r=a.node.getBoundingClientRect();if(r.bottom>=0&&r.top<=height)pose(a,time);}paints++;}
 function tick(now){request=0;if(!allowed()){last=null;return;}if(last!==null)time+=Math.min(.05,(now-last)/1000);last=now;draw();request=win.requestAnimationFrame(tick);}
 function sync(){if(request)win.cancelAnimationFrame(request);request=0;last=null;if(ready){if(!allowed()){ctx?.clearRect(0,0,width,height);for(const a of actors)pose(a,time);drawFlame(time);}else request=win.requestAnimationFrame(tick);}root.dataset.motionPaused=String(!allowed());}
 function attach(node,kind){if(!manifest[kind])throw Error('SPRITE_KIND');const meta=manifest[kind],c=doc.createElement('canvas');c.width=meta.cellWidth;c.height=meta.cellHeight;c.setAttribute('aria-hidden','true');node.replaceChildren(c);const a={node,canvas:c,kind,meta,ctx:c.getContext('2d'),frame:-1,idleFrame:kind==='jelly'?3:2,start:null};if(!a.ctx)throw Error('SPRITE_CANVAS');actors.add(a);if(ready)pose(a,time);return {poke(){if(!allowed()||!enabled(node))return;a.start=time;const r=node.getBoundingClientRect();ripple(r.left+r.width*.5,r.top+r.height*.7);},dispose(){actors.delete(a);}};}
 listen(doc,'visibilitychange',()=>{if(!doc.hidden)blurred=false;sync();});listen(win,'blur',()=>{if(pauseOnBlur){blurred=!doc.hasFocus();sync();}});listen(win,'focus',()=>{blurred=false;sync();});listen(root,'pointerdown',()=>{if(blurred){blurred=false;sync();}},{passive:true});listen(win,'resize',()=>{dimensions();if(ready){if(allowed())draw();else sync();}});listen(reduced,'change',sync);
 let pointer=null;listen(root,'pointerdown',e=>{if(e.isPrimary&&e.button===0)pointer={id:e.pointerId,x:e.clientX,y:e.clientY};},{passive:true});listen(root,'pointercancel',()=>{pointer=null;});listen(root,'pointerup',e=>{if(pointer&&pointer.id===e.pointerId&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<9&&!e.target.closest('.hero,button,input,textarea,select,a,summary,dialog'))ripple(e.clientX,e.clientY);pointer=null;},{passive:true});
 dimensions();const loaded=Promise.all(Object.entries(manifest).map(async([kind,m])=>{const img=await decodedResourceImage({document:doc,url:assets[m.file],name:'sprite:'+m.file,width:m.cellWidth*m.columns,height:m.cellHeight*m.rows,isAlive:()=>alive});sheets[kind]=img;})).then(()=>{if(!alive)return;ready=true;draw();sync();}).catch(e=>{onError(e);throw e;});
 function setEffects(value){
  if(!['自动轮换','自选组合','关闭'].includes(value.背景特效模式)||Object.keys(EFFECTS).some(k=>typeof value[k]!=='boolean'))throw Error('TISYA_EFFECT_CONFIG');
  effects=Object.fromEntries(['背景特效模式',...Object.keys(EFFECTS)].map(k=>[k,value[k]]));mode=effects.背景特效模式==='自动轮换'?'auto':effects.背景特效模式==='关闭'?'off':'custom';
  if(ready&&allowed())environment();sync();
 }
 return {ready:loaded,resize:dimensions,tap:ripple,attach,refresh:sync,setEffects,setMode(value){if(!['auto','water','rain','snow','fireflies'].includes(value))throw Error('WEATHER_MODE');setEffects({...CHAT_DEFAULTS,背景特效模式:value==='auto'?'自动轮换':'自选组合',斜雨:value==='rain',落雪:value==='snow',萤火:value==='fireflies'});mode=value;},pause(value){if(manualPause!==value){manualPause=value;sync();}},report:()=>({time,mode,scene,effects:selectedEffects(effects,time),paints,paused:!allowed(),actors:actors.size,ripples:ripples.length,frames:[...actors].map(a=>a.frame)}),dispose(){alive=false;if(request)win.cancelAnimationFrame(request);listeners.splice(0).forEach(f=>f());actors.clear();ripples.length=0;ctx?.clearRect(0,0,width,height);}};
}
module.exports={createWaterMotion};
