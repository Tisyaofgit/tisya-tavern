import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blinkAmount,createBubbleField} from '../home-water-renderer.js';

test('each form blinks once roughly every ten seconds and opens fully between blinks',()=>{
 for(const gender of ['female','male']){
  let starts=[],was=false;
  for(let i=0;i<6600;i++){const time=i/100,amount=blinkAmount(time,gender);assert(amount>=0&&amount<=1);if(amount>0&&!was)starts.push(time);was=amount>0;}
  assert(starts.length>=6);assert(starts[0]>=9&&starts[0]<=11);
  for(let i=1;i<starts.length;i++)assert(starts[i]-starts[i-1]>=9&&starts[i]-starts[i-1]<=11);
  assert.equal(blinkAmount(0,gender),0);
 }
});
test('bubbles keep sampled shape along their path and redraw a paused frame exactly',()=>{
 const field=createBubbleField(12345),a=field.sample(20),still=field.sample(20);assert.deepEqual(a,still);assert(a.length>0);
 const later=new Map(field.sample(20.1).map(p=>[p.id,p]));
 for(const p of a){const q=later.get(p.id);if(!q)continue;assert(q.y<p.y);assert.equal(q.rx,p.rx);assert.equal(q.ry,p.ry);assert.equal(q.rotation,p.rotation);assert.equal(q.born,p.born);}
 assert.deepEqual(field.sample(20),a,'seeking back retains the same births');
});
test('birth positions, dimensions, shapes, and timing vary, without resetting all bubbles at batch boundaries',()=>{
 const f=createBubbleField(456),a=f.sample(44.99),b=f.sample(45.01);assert(a.some(p=>b.some(q=>q.id===p.id)));
 const later=f.sample(90);assert(!a.some(p=>later.some(q=>q.id===p.id)));
 assert(new Set([...a,...later].map(p=>p.rx)).size>5);assert(new Set([...a,...later].map(p=>p.rotation)).size>5);
 assert.notDeepEqual(f.sample(60),createBubbleField(457).sample(60));
 for(let t=0;t<600;t+=.5){const items=f.sample(t);assert(items.length<=45);for(const p of items){assert(Number.isFinite(p.x)&&Number.isFinite(p.y));assert(p.alpha>=0&&p.alpha<=.45);assert(p.rx>=1.1&&p.rx<=2.5);}}
});

test('lower-water liquify keeps both cropped image edges covered throughout random travel',async()=>{
 const {warpLowerWater}=await import('../lower-water-motion.js');
 const source={width:853,height:1844},width=390,height=843;
 let leftMoving=false,rightMoving=false;
 for(const time of [0,4,8,16,32,48,64,96,128,256]){
  const strips=[];const ctx={clearRect(){},drawImage(...args){strips.push(args);}};
  warpLowerWater(ctx,source,time,{width,height,millimeters:10});
  assert.deepEqual(strips[0].slice(1),[0,0,853,Math.floor(1844*.43),0,0,width,Math.floor(1844*.43)/1844*height]);
  const rows=new Map();for(const a of strips.slice(1)){const row=rows.get(a[6])||[];row.push(a);rows.set(a[6],row);}
  for(const row of rows.values()){
   row.sort((a,b)=>a[5]-b[5]);let edge=0,sourceEdge=0;
   for(const a of row){assert(Math.abs(a[5]-edge)<1e-9,'destination strips meet without a hole');assert(Math.abs(a[1]-sourceEdge)<1e-9,'source content is continuous');assert(a[7]>0);edge+=a[7];sourceEdge+=a[3];}
   assert.equal(row[0][5],0,'left edge stays anchored');assert(Math.abs(edge-width)<1e-9,'right edge stays anchored');assert(Math.abs(sourceEdge-source.width)<1e-9,'all source content remains represented');
   leftMoving||=row[0][7]<width*.35;rightMoving||=row[0][7]>width*.35;
  }
 }
 assert(leftMoving&&rightMoving,'interior water still moves in both directions');
});
