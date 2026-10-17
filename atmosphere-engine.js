import {createWeather} from './atmosphere-weather.js';
import {selectedEffects,CHAT_DEFAULTS} from './chat-effects-core.js';
/* Shared theme atmosphere. No chat or reading DOM selectors; consumers own their UI. */

 'use strict';
 const vertex='attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
 const instances=new WeakMap();
 function create({container,canvas,particles,shaders,preset='current',playing=true,effects=CHAT_DEFAULTS,random=Math.random,onError=()=>{},onState=()=>{}}){
  if(instances.has(container))throw Error('Atmosphere already mounted on this surface');
  if(!shaders[preset])throw Error('Unknown atmosphere preset: '+preset);
  const doc=container.ownerDocument,win=doc.defaultView,media=win.matchMedia('(prefers-reduced-motion: reduce)');
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'}),ctx=particles.getContext('2d');
  if(!gl||!ctx)throw Error('当前环境未能启动水流绘制');
  let W=1,H=1,time=17,materialTime=17,last=0,raf=0,paused=!playing||media.matches,visible=true,dead=false,failed=false,spawn=0,frames=0,burstCount=0,tapBursts=0,flowChanges=0,rainEpisodes=0,rainImpacts=0;
  let requestedPause=!playing;
  let settings={...CHAT_DEFAULTS,...effects};const weather=createWeather(random);
  const bubbles=[],bursts=[],raindrops=[],programs=new Map(),compiled=[],rippleUniforms=new Float32Array(24);
  const rand=(a,b)=>a+random()*(b-a);
  const profile=()=>({vx:rand(-.023,.023),vy:rand(-.018,.018),shear:rand(-.10,.10),spin:rand(-.7,.7),cx:rand(-.18,.18),cy:rand(-.32,.32),reach:rand(.20,.52),pace:rand(.55,1.65),power:rand(.55,1.35)});
  let flowFrom=profile(),flowTo=profile(),flowNow={...flowFrom},flowAge=0,flowDuration=rand(5,13),driftX=0,driftY=0,nextRain=rand(5,10);
  function updateFlow(dt){
   flowAge+=dt;if(flowAge>=flowDuration){flowAge-=flowDuration;flowFrom=flowTo;flowTo=profile();flowDuration=rand(5,13);flowChanges++;}
   const u=Math.min(1,flowAge/flowDuration),ease=u*u*u*(u*(u*6-15)+10);
   for(const key of Object.keys(flowFrom))flowNow[key]=flowFrom[key]+(flowTo[key]-flowFrom[key])*ease;
   driftX+=flowNow.vx*dt;driftY+=flowNow.vy*dt;materialTime+=dt*flowNow.pace;
  }
  function rainEpisode(demo=false){
   const count=Math.min(6-raindrops.length,Math.floor(rand(demo?3:1,demo?6:5)));if(count<=0)return false;
   const cluster=random()<.6,cx=rand(W*.15,W*.85),cy=rand(H*.16,H*.8);
   for(let i=0;i<count;i++)raindrops.push({x:cluster?Math.max(18,Math.min(W-18,cx+rand(-55,55))):rand(18,W-18),y:cluster?Math.max(35,Math.min(H-35,cy+rand(-65,65))):rand(H*.12,H*.85),age:-rand(0,.65),fall:rand(.12,.21),duration:rand(2.2,3.6),radius:rand(26,63),hit:false,phase:rand(0,6.28)});
   rainEpisodes++;return true;
  }
  function updateRain(dt){
   if(dt>0){nextRain-=dt;if(nextRain<=0){rainEpisode();nextRain=rand(9,27);}}
   rippleUniforms.fill(0);let slot=0;
   for(let i=raindrops.length-1;i>=0;i--){const r=raindrops[i];r.age+=dt;if(r.age>r.fall+r.duration){raindrops.splice(i,1);continue;}if(r.age<r.fall)continue;if(!r.hit){r.hit=true;rainImpacts++;}const q=(r.age-r.fall)/r.duration,rad=r.radius*(.18+.82*(1-Math.exp(-q*3)));
    rippleUniforms[slot++]=r.x/W;rippleUniforms[slot++]=1-r.y/H;rippleUniforms[slot++]=rad/H;rippleUniforms[slot++]=Math.pow(1-q,1.6);
   }
  }
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  function compile(type,source){const s=gl.createShader(type);compiled.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Shader compilation failed');return s;}
  function programFor(name){if(programs.has(name))return programs.get(name);const p=gl.createProgram();try{gl.attachShader(p,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,shaders[name]));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)||'Shader linking failed');const item={program:p,a:gl.getAttribLocation(p,'a'),res:gl.getUniformLocation(p,'res'),t:gl.getUniformLocation(p,'t'),current:gl.getUniformLocation(p,'uCurrent'),eddy:gl.getUniformLocation(p,'uEddy'),ripples:gl.getUniformLocation(p,'uRipples[0]')};programs.set(name,item);return item;}catch(e){gl.deleteProgram(p);throw e;}}
  function stats(){return {preset,paused,visible,time,materialTime,frames,bubbles:bubbles.length,bursts:bursts.length,totalBursts:burstCount,tapBursts,rainDrops:raindrops.length,pendingDrops:raindrops.filter(r=>r.age<0).length,rainEpisodes,rainImpacts,nextRain,flowChanges,flow:{...flowNow},drift:[driftX,driftY],dead,failed,width:W,height:H,effects:selectedEffects(settings,time),weather:weather.report()};}
  function emit(){onState(stats());}
  function stop(){win.cancelAnimationFrame(raf);raf=0;last=0;}
  function fail(e){failed=true;stop();onError(e instanceof Error?e:Error(String(e)));emit();}
  function addBubble(initial=false,clusterX=null){const z=random(),r=z<.65?rand(.8,2.4):z<.91?rand(2.7,6.8):rand(8,16);bubbles.push({x:clusterX===null?rand(0,W):clusterX+rand(-16,16),y:initial?rand(25,H-15):H+rand(10,35),r,z,phase:rand(0,Math.PI*2),speed:rand(13,29)*(1+z*.75),alpha:rand(.23,.53),age:initial?rand(.5,2):0,life:initial?rand(4,18):rand(12,30)});}
  function breakBubble(b){if(bursts.length>=20)return;const count=Math.floor(rand(5,9));const pieces=Array.from({length:count},(_,i)=>({angle:i/count*Math.PI*2+rand(-.16,.16),span:rand(.18,.42),speed:rand(11,28),size:rand(.7,1.7)}));bursts.push({x:b.x,y:b.y,r:Math.max(4,b.r),age:0,duration:rand(.45,.75),pieces,phase:b.phase});burstCount++;}
  function flow(x,y){const dx=(x-W*.5)/H-flowNow.cx,dy=(H*.5-y)/H-flowNow.cy,weight=Math.exp(-(dx*dx+dy*dy)/(flowNow.reach*flowNow.reach));return {x:-flowNow.vx*H+dy*flowNow.spin*H*.18*weight,y:flowNow.power,lift:-flowNow.vy*H+dx*flowNow.spin*H*.12*weight};}
  function draw(dt){
   const active=selectedEffects(settings,time);
   if(active.includes('water'))updateFlow(dt);
   if(active.includes('ripples'))updateRain(dt);else {raindrops.length=0;rippleUniforms.fill(0);}
   if(!active.includes('water'))bubbles.length=0;
   const p=programFor(preset);gl.useProgram(p.program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(p.a);gl.vertexAttribPointer(p.a,2,gl.FLOAT,false,0,0);gl.uniform2f(p.res,canvas.width,canvas.height);gl.uniform1f(p.t,materialTime);gl.uniform4f(p.current,driftX,driftY,flowNow.shear,flowNow.power-.35);gl.uniform4f(p.eddy,flowNow.cx,flowNow.cy,flowNow.spin,flowNow.reach);gl.uniform4fv(p.ripples,rippleUniforms);gl.drawArrays(gl.TRIANGLES,0,6);ctx.clearRect(0,0,W,H);
   if(dt>0&&active.includes('water')){spawn-=dt;if(spawn<=0){spawn=rand(.12,.65);const clustered=random()<.13,x=rand(0,W),count=Math.min(clustered?5:1,95-bubbles.length);for(let i=0;i<count;i++)addBubble(false,clustered?x:null);}}
   for(let i=bubbles.length-1;i>=0;i--){const b=bubbles[i],f=flow(b.x,b.y);b.age+=dt;b.x+=(f.x+Math.sin(time*1.3+b.phase)*3)*dt;b.y-=Math.max(4,b.speed*f.y+f.lift)*dt;
    if(dt>0&&(b.age>=b.life||b.y<24)){if(b.x>0&&b.x<W&&b.y>0&&b.y<H)breakBubble(b);bubbles.splice(i,1);continue;}
    if(b.x< -40||b.x>W+40){bubbles.splice(i,1);continue;}
    const shrink=1-.23*Math.max(0,1-(b.life-b.age)/.15),a=b.alpha*Math.min(1,b.age/1.1)*Math.min(1,(H-b.y+40)/80),stretch=1+.09*Math.sin(time*1.8+b.phase);
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.sin(time*.6+b.phase)*.19);ctx.scale(shrink,stretch*shrink);ctx.globalAlpha=a;
    if(b.r<2){ctx.fillStyle='#b2e1dc';ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.fill();}else{const gradient=ctx.createRadialGradient(-b.r*.24,-b.r*.28,b.r*.12,0,0,b.r);gradient.addColorStop(0,'rgba(122,190,193,0)');gradient.addColorStop(.72,'rgba(90,177,183,.025)');gradient.addColorStop(.9,'rgba(164,224,218,.18)');gradient.addColorStop(1,'rgba(199,238,224,.56)');ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.fill();ctx.lineWidth=.7;ctx.strokeStyle='#d4efe3';ctx.beginPath();ctx.arc(0,0,b.r*.9,3.5,5.25);ctx.stroke();ctx.strokeStyle='#76b4bd';ctx.beginPath();ctx.arc(0,0,b.r*.88,.25,1.7);ctx.stroke();ctx.fillStyle='#e5ebd0';ctx.beginPath();ctx.ellipse(-b.r*.36,-b.r*.62,Math.max(.6,b.r*.13),Math.max(.4,b.r*.06),-.5,0,6.28);ctx.fill();}ctx.restore();
   }
   for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];b.age+=dt;const progress=b.age/b.duration;if(progress>=1){bursts.splice(i,1);continue;}const fade=Math.pow(1-progress,1.6),expand=b.r*(1+.8*Math.sin(progress*1.57)),f=flow(b.x,b.y);b.x+=f.x*dt*.65;b.y-=7*dt;
    ctx.save();ctx.translate(b.x,b.y);ctx.globalAlpha=fade*.65;ctx.lineWidth=.8;ctx.strokeStyle='#c8eee5';ctx.fillStyle='#c4e7df';
    for(const piece of b.pieces){const distance=expand+piece.speed*b.age;ctx.beginPath();ctx.arc(0,0,distance,piece.angle,piece.angle+piece.span*(1-progress));ctx.stroke();const x=Math.cos(piece.angle)*distance,y=Math.sin(piece.angle)*distance*.83+5*progress*progress;ctx.beginPath();ctx.ellipse(x,y,piece.size*(1-progress),piece.size*.5*(1-progress),piece.angle,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=fade*.12;ctx.lineWidth=.55;ctx.beginPath();ctx.ellipse(0,0,expand*1.5,expand*.72,Math.sin(b.phase)*.3,0,Math.PI*2);ctx.stroke();ctx.restore();
   }
   for(const r of raindrops){if(r.age<0)continue;ctx.save();ctx.translate(r.x,r.y);
    if(r.age<r.fall){const fall=r.age/r.fall,y=-20*(1-fall);ctx.globalAlpha=.28*fall;ctx.strokeStyle='#c5ece3';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-1,y-5);ctx.lineTo(0,y);ctx.stroke();ctx.fillStyle='#e1eee0';ctx.beginPath();ctx.ellipse(0,y,1.2,1.8,0,0,Math.PI*2);ctx.fill();}
    else{const q=(r.age-r.fall)/r.duration;for(let ring=0;ring<3;ring++){const v=q-ring*.12;if(v<0)continue;const radius=r.radius*(.18+.82*(1-Math.exp(-v*3))),fade=Math.pow(1-q,1.6)*(ring===0?.35:.18);ctx.globalAlpha=fade;ctx.lineWidth=ring===0?.75:.55;ctx.strokeStyle='#bce9df';ctx.beginPath();ctx.ellipse(0,0,radius,radius*.52,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=fade*.35;ctx.lineWidth=1.6;ctx.strokeStyle='#2e7b80';ctx.beginPath();ctx.ellipse(0,1,radius+1,(radius+1)*.52,0,0,Math.PI*2);ctx.stroke();}if(q<.12){ctx.globalAlpha=(1-q/.12)*.5;ctx.fillStyle='#d7ece0';ctx.beginPath();ctx.ellipse(0,-3*Math.sin(q/.12*Math.PI),1.6*(1-q/.12),1.1,0,0,Math.PI*2);ctx.fill();}}
    ctx.restore();}
   ctx.save();if(settings.背景特效模式==='自动轮换'){const phase=time%22;ctx.globalAlpha=Math.min(1,phase/2,(22-phase)/2);}
   weather.draw(ctx,dt,time,W,H,active);ctx.restore();
   if(paused)ctx.clearRect(0,0,W,H);
   frames++;
  }
  function animated(){return selectedEffects(settings,time).length>0||bursts.length>0;}
  function tick(now){raf=0;if(dead||failed)return;if(!container.isConnected){destroy();return;}if(!paused&&visible&&!doc.hidden){const dt=last?Math.min((now-last)/1000,.05):0;time+=dt;last=now;try{draw(dt);}catch(e){fail(e);return;}if(animated())raf=win.requestAnimationFrame(tick);else last=0;}else last=0;}
  function schedule(){if(!raf&&!dead&&!failed&&!paused&&visible&&!doc.hidden&&animated()){last=0;raf=win.requestAnimationFrame(tick);}}
  function resize(){if(dead||failed)return;const r=container.getBoundingClientRect();if(r.width<=0||r.height<=0)return;if(W===r.width&&H===r.height&&canvas.width>1)return;const oldW=W,oldH=H;W=r.width;H=r.height;const d=Math.min(win.devicePixelRatio||1,1.65);canvas.width=Math.round(W*.8);canvas.height=Math.round(H*.8);particles.width=Math.round(W*d);particles.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);gl.viewport(0,0,canvas.width,canvas.height);for(const b of [...bubbles,...bursts,...raindrops]){b.x*=W/oldW;b.y*=H/oldH;}try{draw(0);}catch(e){fail(e);}}
  function setPreset(name){if(dead||failed)throw Error('Atmosphere is not active');if(!shaders[name])throw Error('Unknown atmosphere preset: '+name);programFor(name);preset=name;draw(0);emit();}
  function setPaused(value){if(dead)return;requestedPause=Boolean(value);paused=requestedPause||media.matches;if(paused){stop();ctx.clearRect(0,0,W,H);}else schedule();emit();}
  function burstAt(x,y){if(dead||failed||paused||!visible||doc.hidden)return false;tapBursts++;let found=-1,best=44;for(let i=0;i<bubbles.length;i++){const d=Math.hypot(bubbles[i].x-x,bubbles[i].y-y);if(d<best){best=d;found=i;}}if(found<0){breakBubble({x,y,r:7,phase:rand(0,6.28)});schedule();emit();return true;}breakBubble(bubbles[found]);bubbles.splice(found,1);schedule();emit();return true;}
  function demonstrateBurst(){if(dead||failed||paused)return false;if(bubbles.length>=95)bubbles.shift();bubbles.push({x:W*.52,y:H*.46,r:15,z:1,phase:rand(0,6.28),speed:12,alpha:.8,age:1,life:1.75});return true;}
  function demonstrateRain(){if(dead||failed||paused)return false;return rainEpisode(true);}
  const onVisibility=()=>{if(doc.hidden)stop();else schedule();};
  const onMotion=()=>setPaused(requestedPause);
  const onContextLost=e=>{e.preventDefault();fail(Error('背景绘制已中断，请重新打开页面'));};
  const ro=win.ResizeObserver?new win.ResizeObserver(resize):null,io=win.IntersectionObserver?new win.IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)stop();else schedule();emit();}):null;
  // The shell owns disposal, never observe every message mutation.
  function destroy(){if(dead)return;dead=true;stop();ro?.disconnect();io?.disconnect();win.removeEventListener('resize',resize);doc.removeEventListener('visibilitychange',onVisibility);media.removeEventListener('change',onMotion);canvas.removeEventListener('webglcontextlost',onContextLost);for(const p of programs.values())gl.deleteProgram(p.program);for(const s of compiled)gl.deleteShader(s);gl.deleteBuffer(buffer);gl.getExtension('WEBGL_lose_context')?.loseContext?.();bubbles.length=0;bursts.length=0;raindrops.length=0;instances.delete(container);emit();}
  function setEffects(next){settings={...CHAT_DEFAULTS,...next};selectedEffects(settings,time);if(!dead&&!failed){draw(0);if(animated())schedule();else stop();}}
  const api={setPreset,setPaused,setEffects,resize,burstAt,demonstrateBurst,demonstrateRain,getStats:stats,destroy};instances.set(container,api);
  try{programFor(preset);resize();for(let i=0;i<48;i++)addBubble(true);draw(0);}catch(e){destroy();throw e;}
  ro?.observe(container);io?.observe(container);win.addEventListener('resize',resize);doc.addEventListener('visibilitychange',onVisibility);media.addEventListener('change',onMotion);canvas.addEventListener('webglcontextlost',onContextLost);emit();schedule();return api;
 }
export {create as createAtmosphere};
