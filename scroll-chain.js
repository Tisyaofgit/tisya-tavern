// Android WebView can latch a gesture to a nested scroller even at its edge.
// Hand off only vertical edge movement; ordinary inner scrolling stays native.
export function mountScrollChain(viewport,parent){
 if(!parent)return ()=>{};let point=null;
 const start=e=>{point=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;};
 const reset=()=>{point=null;};
 const move=e=>{
  if(!point||e.touches.length!==1)return reset();const next=e.touches[0],dy=point.y-next.clientY,dx=point.x-next.clientX;point={x:next.clientX,y:next.clientY};
  if(Math.abs(dy)<2||Math.abs(dx)>Math.abs(dy)||!e.cancelable||viewport.ownerDocument.getSelection()?.toString())return;
  if(e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
  const max=Math.max(0,viewport.scrollHeight-viewport.clientHeight),edge=max<=2||dy<0&&viewport.scrollTop<=2||dy>0&&viewport.scrollTop>=max-2;
  if(!edge)return;const before=parent.scrollTop;parent.scrollTop=Math.max(0,Math.min(parent.scrollHeight-parent.clientHeight,before+dy));
  if(parent.scrollTop!==before)e.preventDefault();
 };
 viewport.addEventListener('touchstart',start,{passive:true});viewport.addEventListener('touchmove',move,{passive:false});viewport.addEventListener('touchend',reset,{passive:true});viewport.addEventListener('touchcancel',reset,{passive:true});
 return ()=>{reset();viewport.removeEventListener('touchstart',start);viewport.removeEventListener('touchmove',move);viewport.removeEventListener('touchend',reset);viewport.removeEventListener('touchcancel',reset);};
}
