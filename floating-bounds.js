// Shared screen space for the pet and its notices. The composer owns its area.
export function floatingBounds(document){
 const w=document.defaultView,v=w.visualViewport,c=document.querySelector('#chat')?.getBoundingClientRect(),form=document.querySelector('#send_form')?.getBoundingClientRect();
 const left=Math.max(0,v?.offsetLeft??0,c?.width?c.left:0)+4,top=Math.max(v?.offsetTop??0,c?.height?c.top:0)+4;
 const right=Math.min(w.innerWidth,(v?.offsetLeft??0)+(v?.width??w.innerWidth),c?.width?c.right:w.innerWidth)-4;
 const bottom=Math.min(w.innerHeight,(v?.offsetTop??0)+(v?.height??w.innerHeight),c?.height?c.bottom:w.innerHeight,form?.height?form.top:w.innerHeight)-4;
 return {x:left,y:top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};
}
