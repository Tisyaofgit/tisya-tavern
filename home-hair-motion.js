// Rooted hair clumps only. Shared attachment vertices preserve continuity.
// No displacement filter or animated scaling touches the face, ear or body. Coordinates belong to the approved art.
export const HAIR_GROUPS=Object.freeze({
 female:[
  {pivot:[174,48],limit:.125,points:[[0,0],[174,0],[174,48],[142,76],[107,114],[0,150]]},
  {pivot:[109,197],limit:.195,points:[[0,150],[75,173],[109,197],[94,215],[67,254],[0,278]]},
  {pivot:[351,277],limit:.135,points:[[351,277],[375,274],[391,320],[393,441],[350,441],[343,404],[345,377],[335,351],[340,313]]}
 ],
 male:[
  {pivot:[165,43],limit:.125,points:[[0,0],[165,0],[165,43],[134,70],[95,102],[0,136]]},
  {pivot:[102,176],limit:.195,points:[[0,137],[62,149],[102,176],[89,199],[57,234],[0,254]]},
  {pivot:[329,278],limit:.135,points:[[329,278],[351,278],[367,322],[368,386],[330,386],[316,349],[320,308]]}
 ]
});
const ease=x=>x*x*x*(x*(x*6-15)+10);
function sample(seed,key){let n=(seed^Math.imul(key+1,0x9e3779b1))>>>0;n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return ((n^(n>>>15))>>>0)/4294967296;}
function target(seed,epoch,i){const n=sample(seed,epoch*13+i+71);return (n<.5?-1:1)*(.65+.35*sample(seed,epoch*19+i+193));}
export function hairPose(time,gender,seed,displayWidth=430){
 return HAIR_GROUPS[gender].map((group,i)=>{
  const duration=3.8+sample(seed,i)*2.8,t=Math.max(0,time)/duration,epoch=Math.floor(t),u=ease(t-epoch);
  const a=epoch===0?0:target(seed,epoch,i),b=target(seed,epoch+1,i);
  const radius=Math.max(...group.points.map(([x,y])=>Math.hypot(x-group.pivot[0],y-group.pivot[1])));
  const cap=2*Math.asin(Math.min(1,(2.5*96/25.4)*853/(Math.max(320,displayWidth)*2*radius)));
  return (a+(b-a)*u)*Math.min(group.limit,cap);
 });
}
// A small skeletal mesh bends each rooted clump toward one random angle.
// Shared vertices keep the original connected hair continuous. This is not a
// time-varying noise/displacement filter; the face and body are never animated.
function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function distance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
const ramp=x=>ease(Math.max(0,Math.min(1,x)));
function influence(x,y,group,index){
 if(index<2){
  if(!inside(x,y,group.points))return 0;
  let d=Infinity;
  group.points.forEach((a,i)=>{const b=group.points[(i+1)%group.points.length];if(a[0]===0&&b[0]===0||a[1]===0&&b[1]===0)return;d=Math.min(d,distance(x,y,a,b));});
  return ramp(d/35);
 }
 // A transparent collar around the free lock allows its silhouette to move.
 // The attached root and nearby face/torso remain exactly in place.
 if(x<312||y<274||y>455)return 0;
 const d=Math.min(...group.points.map((a,i)=>distance(x,y,a,group.points[(i+1)%group.points.length])));
 const edge=inside(x,y,group.points)?1:1-ramp(d/24);
 return edge*ramp((y-group.pivot[1])/55)*ramp((455-y)/18);
}
export function prepareHair(art,gender,makeCanvas,seed=Math.floor(Math.random()*4294967296),displayWidth=430){
 const groups=HAIR_GROUPS[gender];if(!groups)throw Error('未知水相发束');
 const width=432,height=456,step=24,cols=width/step,rows=height/step;
 const fixed=makeCanvas(width,height),base=fixed.getContext('2d');base.drawImage(art,0,0);
 const composed=makeCanvas(853,1844),paint=composed.getContext('2d');paint.drawImage(art,0,0);
 const vertices=[];for(let iy=0;iy<=rows;iy++)for(let ix=0;ix<=cols;ix++){
  const x=ix*step,y=iy*step;
  vertices.push({x,y,weights:groups.map((g,i)=>influence(x,y,g,i))});
 }
 const cells=[];for(let iy=0;iy<rows;iy++)for(let ix=0;ix<cols;ix++){
  const a=iy*(cols+1)+ix,b=a+1,c=a+cols+1,d=c+1;
  if([a,b,c,d].some(n=>vertices[n].weights.some(w=>w>0))){cells.push([a,b,c,d]);base.clearRect(ix*step,iy*step,step,step);}
 }
 const triangle=(ids,positions)=>{
  const [a,b,c]=ids.map(i=>vertices[i]),[p,q,r]=ids.map(i=>positions[i]);
  const det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
  const aa=((q.x-p.x)*(c.y-a.y)-(r.x-p.x)*(b.y-a.y))/det;
  const bb=((q.y-p.y)*(c.y-a.y)-(r.y-p.y)*(b.y-a.y))/det;
  const cc=((r.x-p.x)*(b.x-a.x)-(q.x-p.x)*(c.x-a.x))/det;
  const dd=((r.y-p.y)*(b.x-a.x)-(q.y-p.y)*(c.x-a.x))/det;
  paint.save();paint.beginPath();paint.moveTo(p.x,p.y);paint.lineTo(q.x,q.y);paint.lineTo(r.x,r.y);paint.closePath();paint.clip();
  paint.transform(aa,bb,cc,dd,p.x-aa*a.x-cc*a.y,p.y-bb*a.x-dd*a.y);paint.drawImage(art,0,0);paint.restore();
 };
 return {draw(ctx,time){
  if(time===0){ctx.drawImage(art,0,0,853,1844);return;}
  const angles=hairPose(time,gender,seed,displayWidth);
  const positions=vertices.map(v=>{let x=v.x,y=v.y;groups.forEach((g,i)=>{
   const angle=angles[i]*v.weights[i];if(!angle)return;
   const dx=v.x-g.pivot[0],dy=v.y-g.pivot[1];x+=dx*(Math.cos(angle)-1)-dy*Math.sin(angle);y+=dx*Math.sin(angle)+dy*(Math.cos(angle)-1);
  });if(v.x===0)x=0;if(v.y===0)y=0;return {x,y};});
  paint.clearRect(0,0,width,height);paint.drawImage(fixed,0,0);paint.save();paint.globalCompositeOperation='lighter';
  for(const [a,b,c,d]of cells){triangle([a,b,d],positions);triangle([a,d,c],positions);}paint.restore();
  // Complete untransformed face/neck protection, including the far eye.
  paint.clearRect(180,274,140,62);paint.drawImage(art,180,274,140,62,180,274,140,62);
  paint.clearRect(180,90,175,184);paint.drawImage(art,180,90,175,184,180,90,175,184);
  ctx.drawImage(composed,0,0,853,1844);
 },setDisplayWidth(value){if(Number.isFinite(value)&&value>0)displayWidth=value;},dispose(){fixed.width=fixed.height=composed.width=composed.height=1;}};
}
