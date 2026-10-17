import {mountAtmosphere} from './atmosphere-scene.js';
import {controller} from './home-water-renderer.js';

export const homeAsset = name => new URL(`./assets/home-v1/${name}`, import.meta.url).href;

// Only the selected form is decoded. The other form is neither downloaded nor
// held in canvas memory. Artwork failures are visible and never block navigation.
export function mountHomeArt(document, container, {gender, playing=true, effects, mountScene=mountAtmosphere, onError}={}) {
    const window=document.defaultView, canvas=document.createElement('canvas');
    canvas.className='tisya-home-water';canvas.setAttribute('aria-hidden','true');
    canvas.width=Math.min(853,Math.max(320,Math.round((container.clientWidth||430)*Math.min(window.devicePixelRatio||1,2))));
    canvas.height=Math.round(canvas.width*1844/853);
    container.append(canvas);
    let disposed=false, renderer=null,atmosphere=null;
    try{atmosphere=mountScene(document,container,{playing,effects,onError});}catch(error){onError?.(error);}
    const pending=new Set();
    const load=(name,width=853,height=1844)=>new Promise((resolve,reject)=>{
        const image=new window.Image();
        const entry={image,cancel:()=>finish(new Error('水相加载已取消'))};pending.add(entry);
        const timeout=window.setTimeout(()=>finish(new Error('水相素材读取超时，请刷新主页')),15000);
        function finish(error){window.clearTimeout(timeout);image.onload=null;image.onerror=null;pending.delete(entry);error?reject(error):resolve(image);}
        image.onload=()=>finish(image.naturalWidth!==width||image.naturalHeight!==height?new Error(`水相素材尺寸不匹配：${name}，请更新完整扩展`):null);image.onerror=()=>finish(new Error(`水相素材缺失：${name}，请更新完整扩展`));image.src=homeAsset(name);
    });
    const ready=Promise.all([load(`${gender}-water.webp`),load(`${gender}-blink.webp`,110,120)]).then(([water,blink])=>{
        if(disposed)return;
        renderer=controller(canvas,{[gender]:water,[gender+'Blink']:blink},{gender,backdrop:'transparent'});
        renderer.setPlaying(playing);
    }).catch(error=>{if(!disposed)onError?.(error);});
    return {ready,setPlaying(value){playing=!!value;renderer?.setPlaying(playing);atmosphere?.setPlaying(playing);},setEffects(value){atmosphere?.setEffects(value);},dispose(){
        if(disposed)return;disposed=true;atmosphere?.dispose();renderer?.destroy();renderer=null;
        for(const entry of [...pending]){entry.cancel();entry.image.src='';}
        canvas.remove();canvas.width=canvas.height=1;
    }};
}
