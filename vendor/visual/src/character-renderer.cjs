'use strict';

// Preserve the accepted standing/tail paths. Leaning uses authored sprites.
const {leaningTailPoint}=require('./character-leaning.cjs');
const {paintLeaningFrames}=require('./character-frames.cjs');
const {paintEyeLight}=require('./character-eye-light.cjs');
const smooth=n=>{n=Math.max(0,Math.min(1,n));return n*n*(3-2*n);};
const RIGS={
  standing:[{cx:124,cy:235,rx:25,ry:34,px:117,py:211,sign:1},{cx:208,cy:236,rx:24,ry:33,px:213,py:211,sign:-1}],
  leaning:[{cx:104,cy:155,rx:25,ry:29,px:93,py:178,sign:1},{cx:237,cy:216,rx:23,ry:34,px:230,py:191,sign:-1}]
};
function turn(x,y,px,py,r){const c=Math.cos(r),s=Math.sin(r);return {x:px+(x-px)*c-(y-py)*s,y:py+(x-px)*s+(y-py)*c};}
function snakePoint(rig,x,y,phase,gain=1){
  const distance=Math.max(Math.abs((x-rig.cx)/rig.rx),Math.abs((y-rig.cy)/rig.ry));
  // Entire skull moves rigidly; only the surrounding neck attachment blends.
  const weight=1-smooth((distance-.64)/.36);
  const a=rig.sign*(Math.sin(phase)+.12*Math.sin(2*phase))*3.2*Math.PI/180*gain;
  const p=turn(x,y,rig.px,rig.py,a);
  return {x:x+(p.x-x)*weight,y:y+(p.y-y)*weight};
}
function headPoint(kind,x,y,angle){
  const standing=kind==='standing',px=standing?166:156,py=standing?206:168,head=standing?202:145,cut=standing?246:174;
  return turn(x,y,px,py,(standing?-1:1)*angle*Math.PI/180*smooth((cut-y)/(cut-head)));
}
const tailPoint=leaningTailPoint;
function drawRect(ctx,texture,x,y,w,h,unitHeight=480){
  ctx.drawImage(texture.image,x*texture.width/320,y*texture.height/unitHeight,w*texture.width/320,h*texture.height/unitHeight,x,y,w,h);
}
function triangle(ctx,texture,a,b,c,p,q,r,unitHeight,padding=1.25){
  const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-a.x,vy=c.y-a.y,d=ux*vy-uy*vx;
  const du=q.x-p.x,dv=r.x-p.x,eu=q.y-p.y,ev=r.y-p.y;
  const aa=(du*vy-dv*uy)/d,cc=(dv*ux-du*vx)/d,bb=(eu*vy-ev*uy)/d,dd=(ev*ux-eu*vx)/d;
  ctx.save();ctx.beginPath();
  const center={x:(p.x+q.x+r.x)/3,y:(p.y+q.y+r.y)/3};
  [p,q,r].forEach((v,i)=>{const dx=v.x-center.x,dy=v.y-center.y,len=Math.hypot(dx,dy)||1;const x=v.x+dx/len*padding,y=v.y+dy/len*padding;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.closePath();ctx.clip();ctx.transform(aa,bb,cc,dd,p.x-aa*a.x-cc*a.y,p.y-bb*a.x-dd*a.y);
  const x=Math.min(a.x,b.x,c.x),y=Math.min(a.y,b.y,c.y),w=Math.max(a.x,b.x,c.x)-x,h=Math.max(a.y,b.y,c.y)-y;
  const pad=padding===1.25?2:padding+1;
  const left=Math.max(0,x-pad),top=Math.max(0,y-pad),right=Math.min(320,x+w+pad),bottom=Math.min(unitHeight,y+h+pad);
  drawRect(ctx,texture,left,top,right-left,bottom-top,unitHeight);ctx.restore();
}
function patch(ctx,texture,box,nx,ny,map,unitHeight=480,scale={x:1,y:1}){
  // Integer device-pixel clip edges prevent hairline gaps after clear/draw.
  const x=Math.floor(box.x*scale.x)/scale.x,y=Math.floor(box.y*scale.y)/scale.y;
  const w=Math.ceil((box.x+box.width)*scale.x-1e-7)/scale.x-x,h=Math.ceil((box.y+box.height)*scale.y-1e-7)/scale.y-y;
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.clearRect(x,y,w,h);
  for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
    const a={x:x+w*ix/nx,y:y+h*iy/ny},b={x:x+w*(ix+1)/nx,y:a.y},c={x:a.x,y:y+h*(iy+1)/ny},d={x:b.x,y:c.y};
    const p=map(a.x,a.y),q=map(b.x,b.y),r=map(c.x,c.y),s=map(d.x,d.y);
    triangle(ctx,texture,a,b,c,p,q,r,unitHeight);triangle(ctx,texture,b,d,c,q,s,r,unitHeight);
  }
  ctx.restore();
}
function renderCharacter(ctx,textures,kind,pose,width,height){
  if(!ctx||typeof ctx.drawImage!=='function')throw new Error('TISHA_CHARACTER_CANVAS_UNAVAILABLE');
  const tail=kind.startsWith('tail'),unitHeight=kind==='tailExpanded'?296:480,scale={x:width/320,y:height/(kind==='tailExpanded'?296:480)};
  const texture=textures[tail?'neutral':kind!=='standing'&&pose.leaningExpression?pose.leaningExpression:pose.expression||'neutral'];
  if(!texture||!texture.image||!texture.width||!texture.height)throw new Error('TISHA_CHARACTER_TEXTURE_MISSING');
  if(texture.image._tisyaPending||textures.neutral?.image?._tisyaPending||texture.image.complete===false||textures.neutral?.image?.complete===false)return false;
  ctx.setTransform(width/320,0,0,height/unitHeight,0,0);ctx.clearRect(0,0,320,unitHeight);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  if(kind==='head'||kind==='front'){
    const ready=paintLeaningFrames(ctx,textures,kind,pose);if(ready)paintEyeLight(ctx,kind,pose,texture);return ready;
  }
  drawRect(ctx,textures.neutral,0,0,320,unitHeight,unitHeight);
  if(tail){
    const start=kind==='tailExpanded'?38:326,gain=pose.tailGain??1;
    if(gain&&Number.isFinite(pose.tailPhase)&&Math.abs(Math.sin(pose.tailPhase))>1e-5)patch(ctx,texture,{x:0,y:start,width:320,height:unitHeight-start},10,12,(x,y)=>tailPoint(kind,x,y,pose.tailPhase,gain),unitHeight,scale);
  }else{
    const angle=pose.standingAngle??pose.angle??0,cut=Math.floor(246*scale.y)/scale.y;
    if(angle)patch(ctx,texture,{x:0,y:0,width:320,height:cut},8,8,(x,y)=>headPoint(kind,x,y,angle),480,scale);
    else {
      if(texture!==textures.neutral)drawRect(ctx,texture,106,136,124,40);
      if((pose.snakeGain??1)&&Math.abs(Math.sin(pose.snakePhase||0))>1e-5){
        for(const rig of RIGS.standing)patch(ctx,textures.neutral,{x:rig.cx-rig.rx,y:rig.cy-rig.ry,width:rig.rx*2,height:rig.ry*2},6,8,(x,y)=>snakePoint(rig,x,y,pose.snakePhase,pose.snakeGain??1),480,scale);
      }
    }

  }
  if(!tail)paintEyeLight(ctx,kind,pose,texture);
  return true;
}
module.exports={renderCharacter,headPoint,snakePoint,tailPoint,CHARACTER_RIGS:RIGS};
