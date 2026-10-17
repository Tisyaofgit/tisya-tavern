import {createAtmosphere} from './atmosphere-engine.js';
import {oceanMaterial} from './ocean-material.js';
import {CHAT_DEFAULTS} from './chat-effects-core.js';

// Both the conversation directory and chat shell own one scene each. Neither
// message creation nor scrolling owns or re-parents these canvases.
export function mountAtmosphere(document,container,{playing=true,effects=CHAT_DEFAULTS,onError=()=>{}}={}) {
 const surface=document.createElement('div'),canvas=document.createElement('canvas'),particles=document.createElement('canvas');
 surface.className='tisya-atmosphere';surface.setAttribute('aria-hidden','true');
 Object.assign(surface.style,{position:'absolute',inset:'0',overflow:'hidden',pointerEvents:'none'});
 for(const c of [canvas,particles])Object.assign(c.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
 surface.append(canvas,particles);container.prepend(surface);
 let engine;
 try{engine=createAtmosphere({container:surface,canvas,particles,shaders:{current:oceanMaterial},playing,effects,onError});}
 catch(error){surface.remove();throw error;}
 return {setPlaying:value=>engine.setPaused(!value),setEffects:value=>engine.setEffects(value),resize:()=>engine.resize(),
  tap(x,y){const r=surface.getBoundingClientRect();if(x<r.left||x>r.right||y<r.top||y>r.bottom)return false;return engine.burstAt(x-r.left,y-r.top);},
  report:()=>engine.getStats(),dispose(){engine.destroy();surface.remove();}};
}
