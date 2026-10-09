'use strict';
const {characterIdlePose}=require('./character-idle.cjs');

// Local presentation only. No entry service, message, model or variable access.
const REACTION_TIMING=Object.freeze({blinkStart:100,blinkEnd:220,tiltEnd:640,readEnd:2700,fadeEnd:3300,returnEnd:3720});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const REST_POSE=Object.freeze({frame:0,angle:0,expression:'neutral',floatY:0,tailFrame:0,snakePhase:0,tailPhase:0,snakeGain:0,tailGain:0});
function characterPose(elapsed,sulky=false,reduced=false,variant=0){
  const t=Math.max(0,elapsed),T=REACTION_TIMING,end=reduced?2840:T.returnEnd;
  if(t>=end)return {...REST_POSE,done:true,bubble:null,opacity:0};
  let angle=t<T.blinkEnd?0:t<T.tiltEnd?7*ease((t-T.blinkEnd)/(T.tiltEnd-T.blinkEnd)):7;
  if(t>=T.fadeEnd)angle=7*(1-ease((t-T.fadeEnd)/(T.returnEnd-T.fadeEnd)));
  angle=clamp(angle,0,7);
  const step=Math.ceil(angle),frame=reduced?0:t>=T.blinkStart&&t<T.blinkEnd?1:step?(sulky?16-step:1+step):0;
  const bubble=t<100&&!reduced?null:sulky?'sulky':t<T.tiltEnd?'blank':'puzzled';
  const opacity=reduced?clamp((2840-t)/140,0,1):Math.min(clamp((t-100)/160,0,1),clamp((T.fadeEnd-t)/600,0,1));
  const direction=[-1,1,-.5,.65][variant%4],nod=[1,0,4,0][variant%4],amount=reduced?0:angle/7;
  const leaningExpression=variant%4===2&&t>=1000&&t<1220&&!reduced?'blink':null;
  return {standingAngle:reduced?0:angle*(variant%2===0?1:-1),leaningExpression,leaningAngle:reduced?0:angle*direction,leaningLift:nod*amount,snakeReach:amount*.4,variant,done:false,frame,bubble,opacity,angle:reduced?0:angle,expression:frame===1?'blink':sulky&&angle&&!reduced?'sulk':'neutral'};
}
const overlaps=(a,b,gap=4)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
function placeCharacterReaction({bounds,head,obstacles=[]}){
  for(const r of [bounds,head,...obstacles])if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k]))||r.width<=0||r.height<=0)throw new Error('TISHA_REACTION_GEOMETRY_INVALID');
  const width=clamp(head.width*.36,32,44),height=width*350/320;
  const candidates=[
    {x:head.x+head.width+6,y:head.y+8},{x:head.x-width-6,y:head.y+8},
    {x:head.x+head.width*.7,y:head.y-height-6},{x:head.x-width*.2,y:head.y-height-6}
  ];
  // Edge positions may have no free side. Search the upper character band,
  // keeping the nearest free place and never covering a reading thought.
  for(let y=bounds.y;y<=Math.min(bounds.y+bounds.height-height,head.y+head.height);y+=8)
    for(let x=bounds.x;x<=bounds.x+bounds.width-width;x+=8)candidates.push({x,y});
  const valid=candidates.map(p=>({...p,width,height})).filter(r=>r.x>=bounds.x&&r.y>=bounds.y&&r.x+r.width<=bounds.x+bounds.width&&r.y+r.height<=bounds.y+bounds.height&&![head,...obstacles].some(o=>overlaps(r,o)));
  if(!valid.length)throw new Error('TISHA_REACTION_NO_ROOM');
  const distance=r=>Math.hypot(r.x+r.width/2-(head.x+head.width/2),r.y+r.height/2-(head.y+head.height/3));
  valid.sort((a,b)=>distance(a)-distance(b));return valid[0];
}

function createCharacterReaction({container,assets,getAnchor,getBounds,getObstacles=()=>[],setFrame,setIdle,onError,clock=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,requestFrame,cancelFrame}){
  if(!container?.ownerDocument||typeof getAnchor!=='function'||typeof getBounds!=='function'||typeof setFrame!=='function'||typeof onError!=='function')throw new Error('TISHA_REACTION_ARGUMENTS_INVALID');
  const doc=container.ownerDocument,win=doc.defaultView,root=doc.createElement('div');
  requestFrame=requestFrame||win?.requestAnimationFrame?.bind(win);cancelFrame=cancelFrame||win?.cancelAnimationFrame?.bind(win);
  if(typeof requestFrame!=='function'||typeof cancelFrame!=='function')throw new Error('TISHA_ANIMATION_FRAME_UNAVAILABLE');
  root.className='tisha-character-reaction';root.hidden=true;root.setAttribute('aria-hidden','true');container.append(root);
  const off=[],images={};let alive=true,active=false,stopped=false,timer=null,elapsed=0,last=clock(),wasPlaying=false,sulky=false,taps=0,lastTap=-Infinity,frame=0,phase='idle',error=null,box=null;
  const media=win?.matchMedia?.('(prefers-reduced-motion: reduce)');let reduced=Boolean(media?.matches),focused=typeof doc.hasFocus==='function'?doc.hasFocus():true,geometryKey=null;
  const idleEnabled=typeof setIdle==='function';let idleElapsed=0,idleWasPlaying=false,idlePhase='idle',pageHidden=false,timerEpoch=0,frameTask=null;
  let eyeElapsed=0,eyeWasPlaying=false;
  let idleRamp=-240,lastIdlePose=REST_POSE,heldIdlePose=REST_POSE,visibleAt=-Infinity,ancestorVisible=false,lastPaintAt=-Infinity,paintTicks=0,variant=0,nextVariant=0;
  function on(target,name,fn){target?.addEventListener?.(name,fn);off.push(()=>target?.removeEventListener?.(name,fn));}
  function clearTimer(){timerEpoch++;if(timer!==null)cancel(timer);if(frameTask!==null)cancelFrame(frameTask);timer=null;frameTask=null;}
  function tickIn(ms){
    const ticket=++timerEpoch;
    const next=()=>{if(ticket!==timerEpoch||!alive)return;frameTask=null;timer=null;
      if(!ms&&clock()-lastPaintAt<1000/60-1){frameTask=requestFrame(next);return;}refresh(true);};
    if(ms)timer=schedule(next,ms);else frameTask=requestFrame(next);
  }
  function applyFrame(value,pose=REST_POSE){frame=value;setFrame(value,pose);}
  function rest(){applyFrame(0);if(idleEnabled)setIdle(REST_POSE);}
  function fail(reason){if(!alive||stopped)return;stopped=true;active=false;phase='failed';idlePhase='failed';error=reason?.message||'TISHA_REACTION_FAILED';clearTimer();root.hidden=true;try{rest();}catch(_){}onError(Object.assign(new Error(error),{code:error}));}
  for(const name of ['blank','puzzled','sulky']){
    const source=assets?.['reaction'+name[0].toUpperCase()+name.slice(1)];
    if(typeof source!=='string'||!source){root.remove();throw new Error('TISHA_REACTION_ASSET_MISSING');}
    const im=doc.createElement('img');im.alt='';im.draggable=false;im.src=source;im.hidden=true;im.dataset.reaction=name;
    on(im,'error',()=>fail(new Error('TISHA_REACTION_ASSET_FAILED')));root.append(im);images[name]=im;
  }
  function connected(){
    let n=container.nodeType===11?container.host:container;
    if(!n?.isConnected)return false;
    while(n&&n.nodeType===1){
      if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;
      const css=win?.getComputedStyle?.(n);
      if(css&&(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'))return false;
      n=n.assignedSlot||n.parentElement||n.getRootNode?.()?.host;
    }
    return true;
  }
  function foreground(a,force=false){
    if(pageHidden||!a?.visible||a.moving||doc.visibilityState==='hidden'||doc.hidden===true||!focused)return false;
    if(force||clock()-visibleAt>=200){ancestorVisible=connected();visibleAt=clock();}
    return ancestorVisible;
  }
  function refresh(fromFrame=false){
    if(!alive||stopped)return;clearTimer();
    try{
      const now=clock(),a=getAnchor(),front=foreground(a,!fromFrame),playing=active&&front,idlePlaying=idleEnabled&&!active&&front&&!reduced;
      lastPaintAt=now;paintTicks++;
      const eyePlaying=front&&!reduced&&(active||idleEnabled);
      if(eyeWasPlaying&&eyePlaying)eyeElapsed+=Math.max(0,now-last);
      eyeWasPlaying=eyePlaying;
      if(wasPlaying&&playing)elapsed+=Math.max(0,now-last);
      if(idleWasPlaying&&idlePlaying)idleElapsed+=Math.max(0,now-last);
      last=now;wasPlaying=playing;idleWasPlaying=idlePlaying;
      if(!active){
        if(!idleEnabled){applyFrame(0);return;}
        const pose=characterIdlePose(idleElapsed,reduced),gain=reduced?0:ease((idleElapsed-idleRamp)/240);
        pose.eyeClock=reduced?null:eyeElapsed;pose.floatY*=gain;pose.leaningGain=pose.snakeGain=pose.tailGain=gain;lastIdlePose=pose;applyFrame(pose.frame,pose);setIdle(pose);
        idlePhase=reduced?'reduced':idlePlaying?'playing':'paused';
        if(!reduced&&!pageHidden)tickIn(idlePlaying?0:250);
        return;
      }
      idlePhase='reaction';const gain=reduced?0:1-ease(elapsed/180);
      const held={...heldIdlePose,floatY:gain?heldIdlePose.floatY*gain:0,snakeGain:heldIdlePose.snakeGain*gain,tailGain:heldIdlePose.tailGain*gain};
      if(idleEnabled)setIdle(held);
      const pose={...held,...characterPose(elapsed,sulky,reduced,variant),eyeClock:reduced?null:eyeElapsed,snakeClock:(heldIdlePose.snakeClock||0)+elapsed,leaningGain:reduced?0:1-ease((elapsed-REACTION_TIMING.fadeEnd)/(REACTION_TIMING.returnEnd-REACTION_TIMING.fadeEnd))};applyFrame(pose.frame,pose);
      if(pose.done){dismiss('complete');if(idleEnabled)refresh();return;}
      phase=playing?'playing':'paused';root.hidden=!playing||!pose.bubble||pose.opacity<=0;
      if(playing){
        const geometry={bounds:getBounds(),head:a.head,obstacles:getObstacles()},key=JSON.stringify(geometry);
        if(!box||key!==geometryKey){box=placeCharacterReaction(geometry);geometryKey=key;}
        Object.assign(root.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px',opacity:String(pose.opacity)});
      }
      for(const [name,im]of Object.entries(images))im.hidden=name!==pose.bubble;
      root.dataset.mood=pose.bubble||'';root.dataset.phase=phase;root.dataset.frame=String(pose.frame);
      tickIn(playing?0:250);
    }catch(e){fail(e);}
  }
  function poke(){
    if(!alive||stopped)return false;
    const a=getAnchor();if(!foreground(a,true))return false;
    const now=clock();
    if(active&&now-lastTap<900){sulky=true;taps=Math.min(3,taps+1);elapsed=Math.min(elapsed,REACTION_TIMING.readEnd-1200);}
    else {variant=nextVariant++%4;elapsed=0;sulky=false;taps=1;if(!active)heldIdlePose=lastIdlePose;}
    lastTap=now;last=now;active=true;wasPlaying=true;idleWasPlaying=false;refresh();return true;
  }
  function dismiss(reason='dismissed'){
    if(!alive)return;active=false;wasPlaying=false;idleWasPlaying=false;elapsed=0;clearTimer();root.hidden=true;phase=reason==='complete'?'idle':reason;box=null;
    if(reason!=='complete'){eyeElapsed=0;eyeWasPlaying=false;idleElapsed=0;idleRamp=-240;lastIdlePose=heldIdlePose=REST_POSE;nextVariant=0;}else idleRamp=idleElapsed;
    idlePhase='paused';rest();
  }
  on(doc,'visibilitychange',()=>{if(!doc.hidden)focused=typeof doc.hasFocus==='function'?doc.hasFocus():focused;refresh();});
  on(win,'blur',()=>{focused=false;refresh();});on(win,'focus',()=>{focused=true;refresh();});
  on(win,'pagehide',()=>{pageHidden=true;dismiss('pagehide');});on(win,'pageshow',()=>{pageHidden=false;refresh();});
  const change=()=>{reduced=Boolean(media.matches);refresh();};on(media,'change',change);
  return Object.freeze({poke,refresh,dismiss,report:()=>({component:'tisha-character-reaction',state:stopped?'failed':alive?'active':'disposed',phase,active,taps,sulky,variant,frame,elapsed,visible:!root.hidden,box:box&&{...box},error,reducedMotion:reduced,idle:{enabled:idleEnabled,phase:idlePhase,elapsed:idleElapsed},eyeLight:{elapsed:eyeElapsed,enabled:!reduced},scheduler:'requestAnimationFrame',targetFPS:60,paintTicks,modelCalls:0}),dispose(){if(!alive)return;dismiss('disposed');alive=false;for(const f of off.splice(0))f();root.remove();}});
}
module.exports={REACTION_TIMING,characterPose,placeCharacterReaction,createCharacterReaction};
