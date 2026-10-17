// Rigid, rooted hair groups only. No displacement filter, mesh warp or scaling
// touches the face, skull, ear or body. Coordinates belong to the approved art.
export const HAIR_GROUPS=Object.freeze({
 female:[
  {pivot:[174,48],limit:.005,points:[[0,0],[174,0],[174,48],[142,76],[107,114],[0,150]]},
  {pivot:[109,197],limit:.006,points:[[0,150],[75,173],[109,197],[94,215],[67,254],[0,278]]},
  {pivot:[351,277],limit:.009,points:[[351,277],[375,274],[391,320],[393,441],[350,441],[343,404],[345,377],[335,351],[340,313]]}
 ],
 male:[
  {pivot:[165,43],limit:.005,points:[[0,0],[165,0],[165,43],[134,70],[95,102],[0,136]]},
  {pivot:[102,176],limit:.006,points:[[0,137],[62,149],[102,176],[89,199],[57,234],[0,254]]},
  {pivot:[329,278],limit:.009,points:[[329,278],[351,278],[367,322],[368,386],[330,386],[316,349],[320,308]]}
 ]
});
const ease=x=>x*x*x*(x*(x*6-15)+10);
function sample(seed,key){let n=(seed^Math.imul(key+1,0x9e3779b1))>>>0;n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return ((n^(n>>>15))>>>0)/4294967296;}
export function hairPose(time,gender,seed){
 return HAIR_GROUPS[gender].map((group,i)=>{
  const duration=6+sample(seed,i)*5,t=Math.max(0,time)/duration,epoch=Math.floor(t),u=ease(t-epoch);
  const a=epoch===0?0:sample(seed,epoch*13+i+71)*2-1,b=sample(seed,(epoch+1)*13+i+71)*2-1;
  return (a+(b-a)*u)*group.limit;
 });
}
export function prepareHair(art,gender,makeCanvas,seed=Math.floor(Math.random()*4294967296)){
 const groups=HAIR_GROUPS[gender];if(!groups)throw Error('未知水相发束');
 const width=405,height=455,fixed=makeCanvas(width,height),base=fixed.getContext('2d');base.drawImage(art,0,0);
 const composed=makeCanvas(853,1844),paint=composed.getContext('2d');paint.drawImage(art,0,0);
 const path=(ctx,points)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
 const layers=groups.map(group=>{
  const x=Math.max(0,Math.floor(Math.min(...group.points.map(p=>p[0])))-2),y=Math.max(0,Math.floor(Math.min(...group.points.map(p=>p[1])))-2);
  const w=Math.ceil(Math.max(...group.points.map(p=>p[0])))-x+2,h=Math.ceil(Math.max(...group.points.map(p=>p[1])))-y+2;
  const canvas=makeCanvas(w,h),ctx=canvas.getContext('2d');ctx.translate(-x,-y);path(ctx,group.points);ctx.clip();ctx.drawImage(art,0,0);
  base.save();base.globalCompositeOperation='destination-out';path(base,group.points);base.fill();base.restore();
  return {canvas,x,y,...group};
 });
 return {draw(ctx,time){
  // Neutral/off is the original bitmap, not a resampled or recomposed portrait.
  if(time===0){ctx.drawImage(art,0,0,853,1844);return;}
  // Recombine complementary alpha masks on transparent pixels. Source-over
  // would darken the seam even at a near-zero rotation. Only the small hair
  // area needs this scratch canvas; the remaining portrait is drawn once.
  paint.clearRect(0,0,width,height);paint.drawImage(fixed,0,0);paint.save();paint.globalCompositeOperation='lighter';
  const angles=hairPose(time,gender,seed);
  layers.forEach((layer,i)=>{paint.save();paint.translate(...layer.pivot);paint.rotate(angles[i]);paint.translate(-layer.pivot[0],-layer.pivot[1]);paint.drawImage(layer.canvas,layer.x,layer.y);paint.restore();});paint.restore();
  // Scale the complete portrait once. Separate scaled rectangles would leave
  // a resampling seam through otherwise untouched body pixels.
  ctx.drawImage(composed,0,0,853,1844);
 },dispose(){fixed.width=fixed.height=composed.width=composed.height=1;for(const layer of layers)layer.canvas.width=layer.canvas.height=1;}};
}
