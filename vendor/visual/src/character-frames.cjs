'use strict';
// Finished sprite playback. No face/body mesh, image morph or cross-fade.
const ATLAS=require('../assets/character-frames.json');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function selectLeaningFrames(pose){
 const angle=clamp(pose.leaningAngle??pose.angle??0,-7,7);
 const head=Math.round((angle-ATLAS.headMin)/ATLAS.headStep);
 const gain=pose.leaningGain??pose.snakeGain??0;
 const clock=pose.snakeClock??(pose.snakePhase||0)*6400/(2*Math.PI);
 const snakes=[0,1.65].map(offset=>{
  const phase=clock*2*Math.PI/6400+offset;
  const reach=clamp((.5+.5*Math.sin(phase))*gain+(pose.snakeReach||0),0,1);
  const local=((clock+offset*700)%5600+5600)%5600;
  const pulse=(start,duration)=>{const t=(local-start)/duration;return t>0&&t<1?Math.sin(Math.PI*t):0;};
  return {step:Math.round(reach*32),tongue:Math.round(Math.max(pulse(850,230),pulse(1210,300))*clamp(gain+(pose.snakeReach||0),0,1)*16)};
 });
 return {head,lift:Math.round((pose.leaningLift||0)*2)/2,expression:pose.leaningExpression||pose.expression||'neutral',snakes};
}
function paintLeaningFrames(ctx,textures,kind,pose){
 const frames=textures.frames;
 if(!frames)throw new Error('TISHA_CHARACTER_FRAMES_MISSING');
 for(const name of ATLAS.resources){
  if(!frames[name]?.image)throw new Error('TISHA_CHARACTER_FRAMES_MISSING');
  if(frames[name].image._tisyaPending||frames[name].image.complete===false)return false;
 }
 const p=selectLeaningFrames(pose),base=frames['leanFrameBase'+(kind==='head'?'Head':'Front')];
 ctx.clearRect(0,0,320,480);ctx.drawImage(base.image,0,0,base.width,base.height,0,0,320,480);
 function draw(name,index,dx=0,dy=0){
  const group=ATLAS.groups[name],cell=group.cells[index];
  if(!cell)throw new Error('TISHA_CHARACTER_FRAME_INVALID');
  const [x,y,w,h]=group.box;ctx.drawImage(frames[name].image,...cell,x+dx,y+dy,w,h);
 }
 draw('leanFrameHead',p.head,0,p.lift);
 if(p.expression!=='neutral')draw('leanFrameEyes'+p.expression[0].toUpperCase()+p.expression.slice(1),p.head,0,p.lift);
 draw('leanFrameSleeves'+(kind==='head'?'Head':'Front'),0);
 for(const [i,side]of ['Left','Right'].entries()){
  const s=p.snakes[i],group=ATLAS.groups['leanFrameSnake'+side];
  draw('leanFrameSnake'+side,s.step);
  if(s.tongue)draw('leanFrameTongue'+side,s.tongue,group.delta[0]*s.step/32,group.delta[1]*s.step/32);
 }
 return true;
}
module.exports={paintLeaningFrames,selectLeaningFrames,LEANING_FRAME_RESOURCES:ATLAS.resources};
