'use strict';
// Retained fin path; face and snake motion are authored frame assets.
const smooth=n=>{n=Math.max(0,Math.min(1,n));return n*n*(3-2*n);};
function leaningTailPoint(kind,x,y,phase,gain=1){
 const expanded=kind==='tailExpanded',h=expanded?296:480,start=expanded?38:326;
 const w=smooth((y-start)/(h-start-10)),cycle=Math.floor(phase/(Math.PI*2))%3;
 // Broad swish, a paired beat and a slower curl. Same root and original fin.
 const wave=(Math.sin(phase)+(cycle===1?.24*Math.sin(2*phase)*Math.sin(phase)**2:cycle===2?.16*Math.sin(3*phase)*Math.sin(phase)**2:0))*gain;
 const curl=Math.abs(wave),cx=expanded?163:221;
 return {x:x+w*(30*wave+(cx-x)*.28*curl),y:y+w*(-(y-start)*.105*curl+5*Math.sin(2*phase)*gain)};
}
module.exports={leaningTailPoint};
