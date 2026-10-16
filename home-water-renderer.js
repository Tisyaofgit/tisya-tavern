/* Quiet water: the approved portrait is rigid. Only the small eyelid masks
   move; deep-water drift and sparse bubbles are drawn BEHIND the portrait.
   Coordinate space is the actual 853 x 1844 artwork. */
const W=853,H=1844,TAU=Math.PI*2;
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
// Kept for the existing independent material-inspection interface.
const shift=()=>0,shiftY=()=>0;
const FORMS=['female','male'];
export function blinkAmount(time,gender='female'){
    // A quiet first blink shortly after entry; later unequal intervals avoid a metronome.
    const cycle=gender==='female'?43:47,t=((time%cycle)+cycle)%cycle;
    const moments=gender==='female'?[2.4,20.8,36.4]:[3.3,25.1,39.8];
    for(const start of moments){const d=t-start;if(d>=0&&d<.36)return d<.095?smooth(d/.095):d<.14?1:1-smooth((d-.14)/.22);}
    return 0;
}
function bubbles(ctx,time,gender){
    for(let i=0;i<13;i++){
        const period=24+(i*7%19),phase=((time/period+i*.137+(gender==='male'?.23:0))%1+1)%1;
        const x=90+(i*173%740)+Math.sin(time*.23+i*2.3)*3.5;
        const y=H+14-phase*(H+55),radius=1.5+(i*11%9)/10;
        const alpha=.38*Math.min(1,phase*9,(1-phase)*9);
        ctx.beginPath();ctx.arc(x,y,radius,0,TAU);ctx.lineWidth=.9;ctx.strokeStyle=`rgba(191,221,204,${alpha})`;ctx.stroke();
        ctx.beginPath();ctx.arc(x-radius*.25,y-radius*.3,.45,0,TAU);ctx.fillStyle=`rgba(225,238,211,${alpha*.8})`;ctx.fill();
    }
}
function draw(ctx,assets,time=0,options={}){
    const gender=options.gender||'female',w=ctx.canvas.width,h=ctx.canvas.height;
    ctx.save();ctx.setTransform(w/W,0,0,h/H,0,0);ctx.clearRect(0,0,W,H);
    const backdrop=options.backdrop||'water';
    if(backdrop==='water'){
        const dx=8*Math.sin(TAU*time/33),dy=11*Math.sin(TAU*time/47);
        ctx.drawImage(assets.background,-12+dx,-15+dy,W+24,H+30);
        ctx.fillStyle='rgba(0,12,9,.16)';ctx.fillRect(0,0,W,H);
        bubbles(ctx,time,gender);
    }else if(backdrop!=='transparent'){ctx.fillStyle=backdrop;ctx.fillRect(0,0,W,H);}
    const art=assets[gender];ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(art,0,0,W,H);
    if(options.blink!==false&&assets[gender+'Blink']){const amount=blinkAmount(time,gender);if(amount>0){ctx.save();ctx.globalAlpha=amount;ctx.drawImage(assets[gender+'Blink'],240,110,110,120);ctx.restore();}}
    if(options.layout&&assets.layout)ctx.drawImage(assets.layout,0,0,W,H);
    if(options.footer!==false)ctx.drawImage(assets.footer,245,1600,585,210);
    ctx.restore();
}
function controller(canvas,assets,options={}){
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('Canvas 2D is unavailable.');
    const document=canvas.ownerDocument,window=document.defaultView,media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const requestAnimationFrame=window.requestAnimationFrame.bind(window),cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
    let config={gender:'female',layout:false,backdrop:'transparent',footer:false,...options};
    let enabled=true,destroyed=false,frame=0,elapsed=0,last=null,lastDraw=0;
    function paint(){draw(ctx,assets,elapsed,{...config,blink:enabled&&!media.matches});}
    function tick(now){if(destroyed)return;if(!enabled||document.hidden||media.matches){frame=0;last=null;paint();return;}if(last!==null)elapsed+=(now-last)/1000;last=now;if(now-lastDraw>=1000/30){paint();lastDraw=now;}frame=requestAnimationFrame(tick);}
    function sync(){cancelAnimationFrame(frame);last=null;if(enabled&&!document.hidden&&!media.matches)frame=requestAnimationFrame(tick);else paint();}
    const blur=()=>sync(),focus=()=>sync();
    document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);window.addEventListener('blur',blur);window.addEventListener('focus',focus);
    paint();sync();
    return {update(next){if(destroyed)throw Error('Renderer destroyed');if(next.gender&&!FORMS.includes(next.gender))throw Error('Unknown water form');config={...config,...next};paint();},setPlaying(value){if(destroyed)throw Error('Renderer destroyed');enabled=!!value;sync();},isPlaying(){return !destroyed&&enabled&&!document.hidden&&!media.matches;},seek(seconds){if(destroyed)throw Error('Renderer destroyed');if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid time');elapsed=seconds;last=null;paint();},destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);ctx.clearRect(0,0,canvas.width,canvas.height);}};
}
export {draw,shift,shiftY,controller};
