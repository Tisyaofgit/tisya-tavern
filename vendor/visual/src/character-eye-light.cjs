'use strict';
// Corneal catchlights and small gaze changes, driven by the existing clock.
const {selectLeaningFrames}=require('./character-frames.cjs');
const ATLAS=require('../assets/character-frames.json');
const PERIOD=12000;
// Fixed apertures in the approved 320x480 artwork. Eyelids never move here.
const EYES=Object.freeze({
 standing:{
  neutral:[{x:136.3,y:152.0,rx:7.7,ry:7.0,pupil:[1.6,6.2]},{x:200.5,y:156.0,rx:6.8,ry:6.6,pupil:[1.5,5.5]}],
  sulk:[{x:136.0,y:152.3,rx:6.4,ry:4.2,pupil:[2.3,3.0]},{x:199.8,y:156.2,rx:6.0,ry:3.5,pupil:[2.0,2.2]}]
 },
 leaning:{
  neutral:[{x:129.0,y:121.7,rx:6.1,ry:6.1,pupil:[2.9,2.9]},{x:178.7,y:133.5,rx:6.1,ry:6.1,pupil:[2.8,2.9]}],
  sulk:[{x:129.0,y:121.5,rx:5.5,ry:3.5,pupil:[2.7,2.1]},{x:179.0,y:133.5,rx:5.4,ry:3.0,pupil:[2.7,2.2]}]
 }
});
const GAZE=[[0,0,0],[1250,0,0],[2100,-.85,-.16],[3700,-.85,-.16],[4800,.12,.12],[5650,.12,.12],[6850,.9,-.07],[8100,.9,-.07],[9500,0,0],[PERIOD,0,0]];
const smooth=t=>t*t*t*(t*(t*6-15)+10);
function gazeAt(clock){
 const t=((clock%PERIOD)+PERIOD)%PERIOD;
 for(let i=1;i<GAZE.length;i++)if(t<=GAZE[i][0]){
  const a=GAZE[i-1],b=GAZE[i],f=smooth((t-a[0])/(b[0]-a[0]));
  return {x:a[1]+(b[1]-a[1])*f,y:a[2]+(b[2]-a[2])*f};
 }
 throw new Error('TISHA_EYE_CLOCK_INVALID');
}
function eyeLightState(kind,pose){
 const expression=kind==='standing'?(pose.expression||'neutral'):(pose.leaningExpression||pose.expression||'neutral');
 if(!['standing','head','front'].includes(kind)||expression==='blink'||pose.eyeClock==null)return null;
 if(!Number.isFinite(pose.eyeClock)||pose.eyeClock<0)throw new Error('TISHA_EYE_CLOCK_INVALID');
 const eyes=EYES[kind==='standing'?'standing':'leaning'][expression];
 if(!eyes)throw new Error('TISHA_EYE_EXPRESSION_INVALID');
 let angle,lift=0,px,py;
 if(kind==='standing'){angle=-(pose.standingAngle??pose.angle??0);px=166;py=206;}
 else {const frame=selectLeaningFrames(pose);angle=ATLAS.headMin+frame.head*ATLAS.headStep;lift=frame.lift+Math.abs(angle)*.45;[px,py]=ATLAS.headPivot;}
 const gaze=gazeAt(pose.eyeClock),reflected=gazeAt(Math.max(0,pose.eyeClock-190));
 const narrowed=expression==='sulk',gain=narrowed?.62:1;
 const pulses=eyes.map((eye,i)=>({
  ...eye,dx:gaze.x*gain,dy:gaze.y*gain,
  // Highlights lag the gaze slightly, as a rounded wet surface catches light.
  hx:-reflected.x*.38,hy:-reflected.y*.3,
  round:1+.035*Math.sin((pose.eyeClock-i*110)*2*Math.PI/4100),
  strength:.88+.04*Math.sin((pose.eyeClock-i*110)*2*Math.PI/5700),
  narrowed
 }));
 return {expression,pulses,angle,lift,px,py};
}
function eyeLightKey(kind,pose){return eyeLightState(kind,pose)?Math.floor(pose.eyeClock/(1000/60))+1:0;}
function oval(ctx,x,y,rx,ry,rotation=0){ctx.beginPath();ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);}
function paintEyeLight(ctx,kind,pose,texture){
 const state=eyeLightState(kind,pose);if(!state)return false;
 if(!texture?.image||!texture.width||!texture.height)throw new Error('TISHA_EYE_TEXTURE_MISSING');
 const a=state.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),{px,py,lift}=state;
 ctx.save();ctx.transform(c,s,-s,c,px-c*px+s*py,py-s*px-c*py+lift);
 for(const eye of state.pulses){
  const {x,y,rx,ry,pupil,dx,dy,hx,hy,round,strength,narrowed}=eye;
  ctx.save();oval(ctx,x,y,rx,ry);ctx.clip();
  // Translate the approved iris pixels as one rigid patch inside the aperture.
  // This replaces the old pupil, so there is never a second ghost pupil.
  const l=x-rx-2,t=y-ry-2,w=rx*2+4,h=ry*2+4;
  ctx.drawImage(texture.image,l*texture.width/320,t*texture.height/480,w*texture.width/320,h*texture.height/480,l+dx,t+dy,w,h);
  // All glazing leaves the gold pupil clear; its original round/slit shape stays.
  oval(ctx,x,y,rx,ry);ctx.moveTo(x+dx+pupil[0],y+dy);
  ctx.ellipse(x+dx,y+dy,pupil[0],pupil[1],0,0,Math.PI*2);ctx.clip('evenodd');
  const lower=ctx.createRadialGradient(x+dx,y+ry*.56,0,x+dx,y+ry*.56,rx*.88);
  lower.addColorStop(0,'rgba(154,233,204,.22)');lower.addColorStop(.58,'rgba(125,214,200,.08)');lower.addColorStop(1,'rgba(125,214,200,0)');
  ctx.fillStyle=lower;ctx.fillRect(x-rx,y-ry,rx*2,ry*2);
  ctx.beginPath();ctx.ellipse(x+dx*.35,y-ry*.03,rx*.80,ry*.85,0,Math.PI*.14,Math.PI*.84);
  ctx.lineWidth=narrowed?.32:.46;ctx.lineCap='round';ctx.strokeStyle='rgba(179,242,220,.37)';ctx.stroke();
  // Rounded pearly bean plus a tiny secondary reflection, not a travelling band.
  const gx=x-rx*.48+hx,gy=y-ry*.47+hy;
  const bright=ctx.createRadialGradient(gx-.25,gy-.25,.05,gx,gy,rx*.3);
  bright.addColorStop(0,`rgba(255,255,250,${strength})`);bright.addColorStop(.55,`rgba(241,255,249,${strength*.86})`);bright.addColorStop(1,'rgba(203,240,231,.10)');
  ctx.fillStyle=bright;oval(ctx,gx,gy,rx*.20/round,ry*.28*round,-.32);ctx.fill();
  ctx.fillStyle=`rgba(248,255,247,${strength*.8})`;
  oval(ctx,x+rx*.57+hx*.45,y+ry*.30+hy*.45,rx*.075,ry*.10*round,-.2);ctx.fill();
  ctx.restore();
 }
 ctx.restore();return true;
}
module.exports={paintEyeLight,eyeLightState,eyeLightKey,gazeAt,EYE_LIGHT_GEOMETRY:EYES,EYE_LIGHT_PERIOD:PERIOD};
