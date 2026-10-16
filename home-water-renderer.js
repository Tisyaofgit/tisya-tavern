/* Tisya water material renderer v1. Native Canvas 2D, no dependencies/network.
   Coordinate space: 853 x 1844. Same source is used by offline frame validation.
   The entire face/neck band y=80..420 is geometrically invariant. */

  'use strict';
  const W=853,H=1844,TAU=Math.PI*2;
  const smooth=(a,b,x)=>{const q=Math.min(1,Math.max(0,(x-a)/(b-a)));return q*q*(3-2*q);};
  function shift(y,time,gender){
    const period=gender==='female'?12:16;
    const t=((time%period)+period)%period;
    const phase=TAU*t/period;
    const direction=gender==='female'?1:-1;
    const top=1-smooth(40,80,y);
    const stream=smooth(420,650,y);
    const wave=direction*y/380;
    return (top*5+stream*(gender==='female'?9:7))*(Math.sin(phase+wave)-Math.sin(wave));
  }
  function shiftY(y,time,gender){const p=gender==='female'?12:16;const t=((time%p)+p)%p;const weight=(1-smooth(40,80,y))*1.1+smooth(420,650,y)*2.2;return (gender==='female'?1:-1)*weight*(1-Math.cos(TAU*t/p));}
  function draw(ctx,assets,time=0,options={}){
    const gender=options.gender||'female',w=ctx.canvas.width,h=ctx.canvas.height;
    ctx.save();ctx.setTransform(w/W,0,0,h/H,0,0);ctx.clearRect(0,0,W,H);
    const backdrop=options.backdrop||'water';
    if(backdrop==='water'){
      ctx.drawImage(assets.background,0,0,W,H);
      // A very slight illumination breath; the background geometry does not sway.
      ctx.fillStyle=`rgba(0,14,10,${.08+.012*(1-Math.cos(TAU*time/(gender==='female'?12:16)))})`;ctx.fillRect(0,0,W,H);
    }else if(backdrop!=='transparent') {ctx.fillStyle=backdrop;ctx.fillRect(0,0,W,H);}
    const art=assets[gender];
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    // Exact horizontal bands preserve facial pixels; fractional horizontal offsets
    // form a low-amplitude traveling wave only in the top hair and lower water.
    for(let y=0;y<H;y+=2){const sh=Math.min(2,H-y);ctx.drawImage(art,0,Math.max(0,Math.min(H-sh,y+shiftY(y,time,gender))),W,sh,shift(y,time,gender),y,W,sh);}
    if(options.glint!==false && assets[gender+'Glint']){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.20*(1-Math.cos(TAU*time/(gender==='female'?12:16)));ctx.drawImage(assets[gender+'Glint'],0,0,W,H);ctx.restore();}
    if(options.layout && assets.layout)ctx.drawImage(assets.layout,0,0,W,H);
    if(options.footer!==false)ctx.drawImage(assets.footer,245,1600,585,210);
    ctx.restore();
  }
  function controller(canvas,assets,options={}){
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)throw new Error('Canvas 2D is unavailable.');
    const document=canvas.ownerDocument,window=document.defaultView;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const requestAnimationFrame=window.requestAnimationFrame.bind(window),cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
    let config={gender:'female',layout:false,backdrop:'transparent',footer:false,...options};
    let enabled=true,destroyed=false,frame=0,elapsed=0,last=null,lastDraw=0;
    function paint(){draw(ctx,assets,elapsed,config);}
    function tick(now){
      if(destroyed)return;
      if(last!==null)elapsed+=(now-last)/1000;
      last=now;
      if(now-lastDraw>=1000/24){paint();lastDraw=now;}
      frame=requestAnimationFrame(tick);
    }
    function sync(){cancelAnimationFrame(frame);last=null;if(enabled&&!document.hidden&&!media.matches)frame=requestAnimationFrame(tick);else paint();}
    // Android can blur a WebView for drawers/keyboards without a matching focus.
    // Page visibility and explicit reduced-motion still stop all frames.
    const blur=()=>sync(),focus=()=>sync();
    document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);
    window.addEventListener('blur',blur);window.addEventListener('focus',focus);
    paint();sync();
    return {
      update(next){if(destroyed)throw new Error('Renderer destroyed');if(next.gender&&!['female','male'].includes(next.gender))throw new Error('Unknown water form');config={...config,...next};paint();},
      setPlaying(value){if(destroyed)throw new Error('Renderer destroyed');enabled=!!value;sync();},
      isPlaying(){return !destroyed&&enabled&&!document.hidden&&!media.matches;},
      seek(seconds){if(destroyed)throw new Error('Renderer destroyed');if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid time');elapsed=seconds;last=null;paint();},
      destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);ctx.clearRect(0,0,canvas.width,canvas.height);}
    };
  }
export {draw,shift,shiftY,controller};
