import {prepareHair} from './home-hair-motion.js';
/* Quiet water: rooted hair groups rotate subtly; face/body remain rigid.
   The shared atmosphere owns the background; eyelids keep their own masks.
   Coordinate space is the actual 853 x 1844 artwork. */
const W=853,H=1844,TAU=Math.PI*2;
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
// Kept for the existing independent material-inspection interface.
const shift=()=>0,shiftY=()=>0;
const FORMS=['female','male'];
export function blinkAmount(time,gender='female'){
    // One gentle blink about every ten seconds, without a blink on initial mount.
    const period=gender==='male'?10.6:10;
    if(time<period)return 0;
    const d=time%period;
    return d>=.36?0:d<.095?smooth(d/.095):d<.14?1:1-smooth((d-.14)/.22);
}
const fields=new WeakMap();
export function createBubbleField(seed=Math.floor(Math.random()*4294967296)){
    // Sample each birth once. Randomness must never be sampled on every frame:
    // that would flicker instead of moving through water. Keep at most 3 batches.
    const cache=new Map(),span=45;
    function batch(epoch){
        if(cache.has(epoch))return cache.get(epoch);
        let state=(seed^Math.imul(epoch+1,0x9e3779b1))>>>0;
        const random=()=>{state=(state+0x6d2b79f5)>>>0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
        const particles=Array.from({length:15},(_,i)=>{
            const radius=1.1+random()*1.4;
            return {id:epoch+':'+i,born:epoch*span+random()*span,life:26+random()*22,
                x:28+random()*(W-56),bottom:H+8+random()*48,radius,
                aspect:.72+random()*.6,rotation:random()*Math.PI,
                drift:2+random()*11,frequency:.12+random()*.15,phase:random()*TAU,
                opacity:.23+random()*.22,arc:.96+random()*.04};
        });
        cache.set(epoch,particles);return particles;
    }
    return {sample(time){
        const epoch=Math.floor(time/span),live=[];
        for(let e=epoch-2;e<=epoch;e++)for(const p of batch(e)){
            const age=time-p.born;if(age<0||age>=p.life)continue;
            const phase=age/p.life;
            live.push({...p,x:p.x+Math.sin(age*p.frequency+p.phase)*p.drift,
                y:p.bottom-phase*(p.bottom+18),rx:p.radius,ry:p.radius*p.aspect,
                alpha:p.opacity*Math.min(1,phase*8,(1-phase)*8)});
        }
        for(const e of cache.keys())if(e<epoch-2||e>epoch)cache.delete(e);
        return live;
    }};
}
function bubbles(ctx,time,field){
    for(const p of field.sample(time)){
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);
        ctx.beginPath();ctx.ellipse(0,0,p.rx,p.ry,0,0,TAU*p.arc);ctx.lineWidth=.8;
        ctx.strokeStyle=`rgba(191,221,204,${p.alpha})`;ctx.stroke();
        ctx.beginPath();ctx.ellipse(-p.rx*.26,-p.ry*.3,.35,.5,0,0,TAU);
        ctx.fillStyle=`rgba(225,238,211,${p.alpha*.85})`;ctx.fill();ctx.restore();
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
        if(!options.bubbleField&&!fields.has(ctx))fields.set(ctx,createBubbleField(options.seed));
        bubbles(ctx,time,options.bubbleField||fields.get(ctx));
    }else if(backdrop!=='transparent'){ctx.fillStyle=backdrop;ctx.fillRect(0,0,W,H);}
    const art=assets[gender];ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(options.hair)options.hair.draw(ctx,options.hairEnabled===false?0:time);else ctx.drawImage(art,0,0,W,H);
    if(options.blink!==false&&assets[gender+'Blink']){const amount=blinkAmount(time,gender);if(amount>0){ctx.save();ctx.globalAlpha=amount;ctx.drawImage(assets[gender+'Blink'],240,110,110,120);ctx.restore();}}
    if(options.layout&&assets.layout)ctx.drawImage(assets.layout,0,0,W,H);
    if(options.footer!==false)ctx.drawImage(assets.footer,245,1600,585,210);
    ctx.restore();
}
function controller(canvas,assets,options={}){
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('Canvas 2D is unavailable.');
    const document=canvas.ownerDocument,window=document.defaultView,media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
    const hair=prepareHair(assets[options.gender||'female'],options.gender||'female',makeCanvas,options.seed);
    const requestAnimationFrame=window.requestAnimationFrame.bind(window),cancelAnimationFrame=window.cancelAnimationFrame.bind(window);
    let config={gender:'female',layout:false,backdrop:'transparent',footer:false,bubbleField:createBubbleField(options.seed),hair,...options};
    let enabled=true,destroyed=false,frame=0,elapsed=0,last=null,lastDraw=0;
    function paint(){draw(ctx,assets,elapsed,{...config,blink:enabled&&!media.matches,hairEnabled:enabled&&!media.matches});}
    function tick(now){if(destroyed)return;if(!enabled||document.hidden||media.matches){frame=0;last=null;paint();return;}if(last!==null)elapsed+=(now-last)/1000;last=now;if(now-lastDraw>=1000/30){paint();lastDraw=now;}frame=requestAnimationFrame(tick);}
    function sync(){cancelAnimationFrame(frame);last=null;if(enabled&&!document.hidden&&!media.matches)frame=requestAnimationFrame(tick);else paint();}
    const blur=()=>sync(),focus=()=>sync();
    document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);window.addEventListener('blur',blur);window.addEventListener('focus',focus);
    paint();sync();
    return {update(next){if(destroyed)throw Error('Renderer destroyed');if(next.gender&&!FORMS.includes(next.gender))throw Error('Unknown water form');config={...config,...next};paint();},setPlaying(value){if(destroyed)throw Error('Renderer destroyed');enabled=!!value;sync();},isPlaying(){return !destroyed&&enabled&&!document.hidden&&!media.matches;},seek(seconds){if(destroyed)throw Error('Renderer destroyed');if(!Number.isFinite(seconds)||seconds<0)throw Error('Invalid time');elapsed=seconds;last=null;paint();},destroy(){if(destroyed)return;destroyed=true;hair.dispose();cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);ctx.clearRect(0,0,canvas.width,canvas.height);}};
}
export {draw,shift,shiftY,controller};
