// Lower water only. 5–10 CSS mm is the total travel envelope, not each side.
// Stable sampled targets + quintic interpolation: no per-frame random jitter.
export function waterOffset(time, y, width, millimeters=7.5, seed=91027) {
  if(!Number.isFinite(time)||time<0||!Number.isFinite(width)||width<=0||!Number.isFinite(y)||!Number.isFinite(millimeters)||millimeters<0||millimeters>10)throw Error('水流参数无效');
  if(y<=.43||time===0||millimeters===0)return 0;
  const phase=time/7.7,epoch=Math.floor(phase),u=phase-epoch,s=u*u*u*(u*(u*6-15)+10);
  const rand=n=>{let v=(Math.imul(n+7,0x45d9f3b)^seed)>>>0;v=Math.imul(v^(v>>>16),0x45d9f3b);return ((v^(v>>>16))>>>0)/4294967296*2-1;};
  const target=(rand(epoch)*(1-s)+rand(epoch+1)*s)*.7+Math.sin(time*.38+y*7)*.3;
  const q=Math.max(0,Math.min(1,(y-.43)/.28)),anchor=q*q*(3-2*q);
  const fadeIn=Math.min(1,time/4);return target*anchor*millimeters*96/25.4/2*fadeIn;
}
export function warpLowerWater(ctx,source,time,{width,height,millimeters=7.5,seed=91027,referenceWidth=width}={}) {
  const sw=source.width,sh=source.height;ctx.clearRect(0,0,width,height);
  const seam=Math.floor(sh*.43);ctx.drawImage(source,0,0,sw,seam,0,0,width,seam/sh*height);
  // Anchor both image edges. Stretch the two halves around a moving interior
  // pivot instead of translating the whole row and exposing a transparent gap.
  const start=seam/sh*height;
  for(let dy=start;dy<height;dy+=1){
    const h=Math.min(1,height-dy),sy=dy/height*sh,offset=waterOffset(time,dy/height,width,millimeters,seed)*width/referenceWidth;
    const pivot=width*.35,middle=Math.max(1,Math.min(width-1,pivot+offset)),sourcePivot=sw*.35;
    ctx.drawImage(source,0,sy,sourcePivot,h/height*sh,0,dy,middle,h+.12);
    ctx.drawImage(source,sourcePivot,sy,sw-sourcePivot,h/height*sh,middle,dy,width-middle,h+.12);
  }
}
