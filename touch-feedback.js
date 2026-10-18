import {createTouchAudio} from './touch-audio.js';
export function mountTouchFeedback(document,container,{getDisplay,getMotion=()=>true,onTap,onError=()=>{}}){
 const win=document.defaultView,sound=createTouchAudio(document,{onError});let pointer=null;
 const controls='button,input,textarea,select,a,summary,dialog,[role=button],[contenteditable=true],audio,video';
 const blocked=e=>e.composedPath().some(n=>n.matches?.(controls));
 const cancel=()=>{pointer=null;};
 const down=e=>{if(e.button===0&&e.isPrimary!==false&&!blocked(e))pointer={id:e.pointerId,x:e.clientX,y:e.clientY,time:win.performance.now()};};
 const up=e=>{const ok=pointer?.id===e.pointerId&&win.performance.now()-pointer.time<450&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<9&&!blocked(e)&&!document.hidden&&!document.getSelection()?.toString();cancel();if(!ok)return;const v=getDisplay();if(getMotion())onTap(e.clientX,e.clientY,{ripple:v.点触涟漪!==false});if(v.点触音效!==false)void sound.play(v.音效类型??'drop',(v.音效音量??55)/100);};
 container.addEventListener('pointerdown',down,{passive:true});container.addEventListener('pointerup',up,{passive:true});container.addEventListener('pointercancel',cancel);container.addEventListener('scroll',cancel,{passive:true,capture:true});
 return {refresh(){sound.setEnabled(getDisplay().点触音效!==false);},dispose(){sound.dispose();container.removeEventListener('pointerdown',down);container.removeEventListener('pointerup',up);container.removeEventListener('pointercancel',cancel);container.removeEventListener('scroll',cancel,true);}};
}
