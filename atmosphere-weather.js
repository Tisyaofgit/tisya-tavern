// Weather shares the atmosphere clock. Birth samples are stable until recycling;
// smoothly changing wind accelerates each flake/drop according to its weight.
export function createWeather(random=Math.random) {
 const rand=(a,b)=>a+random()*(b-a), rain=[],snow=[],lights=[];
 let wind=0,from=0,target=rand(-32,32),age=0,duration=rand(4,10),densityAge=0,densityDuration=rand(8,18);
 const densities={rain:Math.round(rand(28,75)),snow:Math.round(rand(14,42))},birthCredit={rain:0,snow:0};
 function birth(kind,w,h,initial=false) {
  const depth=rand(.15,1),size=kind==='rain'?rand(.45,1.25):rand(.65,2.2);
  return {x:rand(-40,w+40),y:initial?rand(0,h):-rand(8,55),size,depth,
   speed:kind==='rain'?rand(150,360):rand(10,34),length:rand(10,30),vx:wind,
   phase:rand(0,Math.PI*2),flutter:rand(.3,.8),opacity:rand(.12,.32)};
 }
 function draw(ctx,dt,time,w,h,active) {
  if(dt>0){age+=dt;if(age>=duration){from=wind;target=rand(-38,38);age=0;duration=rand(4,10);}const u=age/duration;wind=from+(target-from)*u*u*(3-2*u);}
  if(dt>0){densityAge+=dt;if(densityAge>=densityDuration){densityAge=0;densityDuration=rand(8,18);densities.rain=Math.round(rand(28,75));densities.snow=Math.round(rand(14,42));}}
  for(const [kind,items] of [['rain',rain],['snow',snow]]) {
   if(!active.includes(kind)){items.length=0;birthCredit[kind]=0;continue;}
   if(!items.length)while(items.length<densities[kind])items.push(birth(kind,w,h,true));
   birthCredit[kind]=Math.min(1,birthCredit[kind]+dt*(kind==='rain'?10:3));
   if(items.length<densities[kind]&&birthCredit[kind]>=1){items.push(birth(kind,w,h));birthCredit[kind]-=1;}
   for(let i=0;i<items.length;i++){
    let p=items[i];const wanted=wind*(kind==='rain'?.7:1.15)*(1.2-p.depth*.4)+Math.sin(time*p.flutter+p.phase)*(kind==='rain'?2:9);
    p.vx+=(wanted-p.vx)*(1-Math.exp(-dt*(kind==='rain'?1.8:.7)));p.x+=p.vx*dt;p.y+=p.speed*dt;
    if(p.y>h+45||p.x< -70||p.x>w+70){if(items.length>densities[kind]){items.splice(i--,1);continue;}p=items[i]=birth(kind,w,h);}
    ctx.beginPath();ctx.lineWidth=p.size;
    if(kind==='rain'){ctx.strokeStyle=`rgba(185,218,215,${p.opacity})`;ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+p.vx/p.speed*p.length,p.y+p.length);ctx.stroke();}
    else {ctx.fillStyle=`rgba(222,237,228,${p.opacity+.06})`;ctx.ellipse(p.x,p.y,p.size,p.size*(.8+.15*Math.sin(time*.5+p.phase)),p.phase,0,Math.PI*2);ctx.fill();}
   }
  }
  if(active.includes('fireflies')){
   while(lights.length<15)lights.push({x:random(),y:random(),phase:rand(0,6.28),size:rand(3.5,7)});
   for(const p of lights){const x=p.x*w+Math.sin(time*.3+p.phase)*12,y=p.y*h+Math.sin(time*.22+p.phase)*20,a=.43+.23*Math.sin(time*.65+p.phase),g=ctx.createRadialGradient(x,y,0,x,y,p.size);g.addColorStop(0,`rgba(236,220,154,${a})`);g.addColorStop(.22,`rgba(236,220,154,${a*.56})`);g.addColorStop(1,'rgba(180,215,160,0)');ctx.fillStyle=g;ctx.fillRect(x-p.size,y-p.size,p.size*2,p.size*2);}
  }
 }
 return {draw,report:()=>({wind,target,densities:{...densities},rain:rain.map(p=>({...p})),snow:snow.map(p=>({...p}))})};
}
