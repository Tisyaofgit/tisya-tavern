import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Window} from 'happy-dom';
import {mountGenerationIdleGuard} from '../generation-idle-guard.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const w=new Window(),d=w.document;d.body.innerHTML='<textarea id="send_textarea">草稿</textarea><button id="send_but">发送</button>';
 const events=new EventEmitter(),errors=[],gates=[];let sends=0,generating=false;
 d.querySelector('#send_but').onclick=()=>sends++;
 const guard=mountGenerationIdleGuard(d,{events,eventTypes:{GENERATION_STARTED:'started'},waitForIdle:()=>new Promise(resolve=>gates.push(resolve)),isGenerating:()=>generating,onError:e=>errors.push(e),defer:tick});
 return {w,d,events,errors,gates,guard,get sends(){return sends;},set generating(v){generating=v;},click(){d.querySelector('#send_but').click();}};
}
test('visible composer during native finalization reports the blocked click and preserves draft until the real idle gate',async()=>{
 const f=fixture();f.events.emit('started','normal',{},false);await tick();assert.throws(f.guard.assertIdle,/正在完成保存/);
 f.click();assert.equal(f.sends,0);assert.equal(f.errors[0].code,'GENERATION_FINALIZING');assert.equal(f.d.querySelector('textarea').value,'草稿');
 f.gates[0]();await tick();await tick();f.guard.assertIdle();f.click();assert.equal(f.sends,1);f.guard.dispose();await f.w.happyDOM.abort();
});
test('active generation retains native guidance behavior; dry runs never own the composer lock',async()=>{
 const f=fixture();f.events.emit('started','normal',{},true);f.click();assert.equal(f.sends,1);assert.equal(f.guard.pending(),false);
 f.events.emit('started','normal',{dryRun:true});assert.equal(f.guard.pending(),false);
 f.events.emit('started','normal',{},false);await tick();f.generating=true;f.click();assert.equal(f.sends,2);assert.equal(f.errors.length,0);f.gates[0]();await tick();await tick();f.guard.dispose();await f.w.happyDOM.abort();
});
test('an older idle completion cannot unlock a later generation, and disposal leaves native controls intact',async()=>{
 const f=fixture();f.events.emit('started','normal');await tick();f.events.emit('started','normal');await tick();f.gates[0]();await tick();await tick();assert.equal(f.guard.pending(),true);
 f.click();assert.equal(f.sends,0);f.guard.dispose();f.click();assert.equal(f.sends,1);assert.equal(f.events.listenerCount('started'),0);f.gates[1]();await tick();await tick();assert.equal(f.guard.pending(),false);await f.w.happyDOM.abort();
});
