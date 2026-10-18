import {createAtmosphere} from './atmosphere-engine.js';
import {oceanMaterial} from './ocean-material.js';
import {CHAT_DEFAULTS} from './chat-effects-core.js';

// Both the conversation directory and chat shell own one scene each. Neither
// message creation nor scrolling owns or re-parents these canvases.
export function mountAtmosphere(document,container,{playing=true,effects=CHAT_DEFAULTS,homeDepth=false,onError=()=>{}}={}) {
 const surface=document.createElement('div'),canvas=document.createElement('canvas'),particles=document.createElement('canvas');
 surface.className='tisya-atmosphere';surface.setAttribute('aria-hidden','true');
 Object.assign(surface.style,{position:'absolute',inset:'0',overflow:'hidden',pointerEvents:'none'});
 for(const c of [canvas,particles])Object.assign(c.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
 surface.append(canvas,particles);container.prepend(surface);
 const palette=value=>{const old=value?.底图色调==='旧版墨绿';surface.style.background=old?'#001a12 url("'+new URL('./assets/home-v1/quiet-water.webp',import.meta.url).href+'") center / cover':'';canvas.style.opacity=old?'0':'1';canvas.style.filter=homeDepth&&!old&&value?.底图色调!=='明潮'?'brightness(.60) saturate(1.08)':'';};palette(effects);
 let engine;
 try{engine=createAtmosphere({container:surface,canvas,particles,shaders:{current:oceanMaterial},playing,effects,onError});}
 catch(error){surface.remove();throw error;}
 return {setPlaying:value=>engine.setPaused(!value),setEffects:value=>{palette(value);engine.setEffects(value);},resize:()=>engine.resize(),
  tap(x,y,{ripple=true}={}){const r=surface.getBoundingClientRect();if(x<r.left||x>r.right||y<r.top||y>r.bottom)return false;const popped=engine.popAt(x-r.left,y-r.top);const ring=ripple&&engine.rippleAt(x-r.left,y-r.top);return popped||ring;},
  report:()=>engine.getStats(),dispose(){engine.destroy();surface.remove();}};
}
