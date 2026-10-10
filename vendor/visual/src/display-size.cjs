'use strict';
// Self-contained so the same sizing contract can run inside an opaque card
// document. It reports geometry only; no parent or business API access.
function observeDisplaySize(doc,report,onError){
 const win=doc.defaultView;let alive=true,frame=0,last=-1;
 function measure(){
  frame=0;if(!alive||!doc.body||!doc.documentElement.clientWidth)return;
  try{
   const body=doc.body,box=body.getBoundingClientRect(),style=win.getComputedStyle(body);
   const height=Math.ceil(Math.max(box.height,body.scrollHeight)+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0));
   if(!Number.isFinite(height)||height<0||height>200000)throw Error('TISYA_CARD_FRAME_SIZE');
   if(height!==last){last=height;report(Math.max(1,height));}
  }catch(error){onError(error);}
 }
 function schedule(){if(alive&&!frame)frame=win.requestAnimationFrame(measure);}
 // A full-page card's 100vh body must not use yesterday's iframe height as
 // today's content minimum. The authored inner panel/styles remain intact.
 const sizeStyle=doc.createElement('style');sizeStyle.dataset.tisyaIntrinsicSize='';
 sizeStyle.textContent='html,body{height:auto!important;min-height:0!important}';doc.head.append(sizeStyle);
 const observer=new win.ResizeObserver(schedule);observer.observe(doc.body);
 const changes=new win.MutationObserver(schedule);changes.observe(doc.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style','class','open','hidden','src','width','height']});
 doc.addEventListener('load',schedule,true);doc.addEventListener('toggle',schedule,true);win.addEventListener('resize',schedule);
 doc.fonts?.addEventListener('loadingdone',schedule);doc.fonts?.ready.then(schedule);
 measure();
 return {refresh:schedule,dispose(){alive=false;win.cancelAnimationFrame(frame);observer.disconnect();changes.disconnect();doc.removeEventListener('load',schedule,true);doc.removeEventListener('toggle',schedule,true);win.removeEventListener('resize',schedule);doc.fonts?.removeEventListener('loadingdone',schedule);sizeStyle.remove();}};
}
module.exports={observeDisplaySize};
