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
