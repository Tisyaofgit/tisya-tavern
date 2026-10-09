import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';import {createCharacterReaction,createWaterMotion} from '../visual-core.js';
function setup(){
 const w=new Window(),d=w.document,host=d.createElement('aside');d.body.append(host);const root=host.attachShadow({mode:'open'});let now=0,focused=false,hidden=false;d.hasFocus=()=>focused;Object.defineProperty(d,'hidden',{get:()=>hidden});Object.defineProperty(d,'visibilityState',{get:()=>hidden?'hidden':'visible'});const media={matches:false,addEventListener(){},removeEventListener(){}};w.matchMedia=()=>media;
 const pending=new Map(),errors=[],frames=[];let ticket=0;const later=(f,ms=16)=>{pending.set(++ticket,{f,at:now+ms});return ticket;};
 const c=createCharacterReaction({container:root,assets:{reactionBlank:'blank',reactionPuzzled:'puzzled',reactionSulky:'sulky'},getAnchor:()=>({visible:true,moving:false,head:{x:240,y:440,width:80,height:60}}),getBounds:()=>({x:4,y:24,width:352,height:600}),clock:()=>now,schedule:later,cancel:id=>pending.delete(id),requestFrame:f=>later(f,16),cancelFrame:id=>pending.delete(id),setFrame:(frame,pose)=>frames.push({frame,...pose}),setIdle(){},onError:e=>errors.push(e)});
 const advance=ms=>{const end=now+ms;while(pending.size){const [id,row]=[...pending].sort((a,b)=>a[1].at-b[1].at)[0];if(row.at>end)break;now=row.at;pending.delete(id);row.f();}now=end;};
 return {w,d,c,root,pending,errors,frames,advance,focus(v){focused=v;},hide(v){hidden=v;d.dispatchEvent(new w.Event('visibilitychange'));},async dispose(){c.dispose();assert.equal(pending.size,0);await w.happyDOM.abort();}};
}
test('startup loss of focus recovers on focusin and real focus is checked again on a poke',async()=>{
 const f=setup();f.c.refresh();assert.equal(f.c.report().idle.phase,'paused');assert.equal(f.c.poke(),false);f.focus(true);assert.equal(f.c.poke(),true);f.advance(160);assert.equal(f.c.report().frame,1);f.advance(560);assert.equal(f.c.report().frame,8);assert.equal(f.c.report().visible,true);assert.deepEqual(f.errors,[]);await f.dispose();
});
test('idle resumes from document focus, background clocks stay paused, and repeated pokes sulk',async()=>{
 const f=setup();f.c.refresh();f.focus(true);f.d.dispatchEvent(new f.w.FocusEvent('focusin'));f.advance(1600);assert.ok(f.c.report().idle.elapsed>1500);f.c.poke();f.advance(700);f.c.poke();assert.equal(f.c.report().sulky,true);assert.equal(f.pending.size,1);
 f.hide(true);const elapsed=f.c.report().elapsed;f.advance(5000);assert.equal(f.c.report().elapsed,elapsed);assert.equal(f.c.poke(),false);f.hide(false);f.advance(160);assert.ok(f.c.report().elapsed>elapsed);assert.ok(f.c.report().elapsed<elapsed+200);await f.dispose();
});
test('water effects resume on document focus without needing a window focus event',async()=>{
 const w=new Window(),d=w.document,root=d.createElement('div');d.body.append(root);let focused=false;d.hasFocus=()=>focused;w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});const motion=createWaterMotion({root,assets:{},manifest:{},onError:e=>{throw e;}});await motion.ready;
 w.dispatchEvent(new w.Event('blur'));assert.equal(motion.report().paused,true);focused=true;d.dispatchEvent(new w.FocusEvent('focusin'));assert.equal(motion.report().paused,false);motion.pause(true);d.dispatchEvent(new w.FocusEvent('focusin'));assert.equal(motion.report().paused,true);motion.dispose();await w.happyDOM.abort();
});
