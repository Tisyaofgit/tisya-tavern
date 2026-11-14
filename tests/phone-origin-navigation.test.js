import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {revealPhoneOrigin} from '../phone-origin-navigation.mjs';

function fixture(){
 const w=new Window(),document=w.document;document.body.innerHTML='<div id="chat"><div class="mes" mesid="5"></div></div>';
 let owned=true,scrolled=0;const c={chat:Array.from({length:8},(_,i)=>({extra:{tisya_engine:{uid:'m'+i}}}))};
 const mount=()=>{const node=document.createElement('div');node.className='mes';node.setAttribute('mesid','0');node.scrollIntoView=()=>{scrolled++;};document.querySelector('#chat').prepend(node);};
 return {w,document,c,mount,scrolled:()=>scrolled,change:()=>owned=false,args:{document,context:()=>c,ownsCurrent:()=>owned,messageUid:'m0'}};
}
test('unmounted origin is materialized using the bounded native surface',async()=>{
 const f=fixture(),calls=[];
 assert.equal(await revealPhoneOrigin({...f.args,native:{isBoundedChatSurfaceView:()=>true,jumpBoundedChatSurfaceToMessage:async id=>{calls.push(id);f.mount();}}}),true);
 assert.deepEqual(calls,[0]);assert.equal(f.scrolled(),1);await f.w.happyDOM.abort();
});
test('classic native history loads through the requested origin, then scrolls',async()=>{
 const f=fixture(),calls=[];
 await revealPhoneOrigin({...f.args,native:{isBoundedChatSurfaceView:()=>false,showMoreMessages:async count=>{calls.push(count);f.mount();}}});
 assert.deepEqual(calls,[5]);assert.equal(f.scrolled(),1);await f.w.happyDOM.abort();
});
test('mounted origin scrolls without reloading any history',async()=>{
 const f=fixture();f.mount();await revealPhoneOrigin({...f.args,native:{}});assert.equal(f.scrolled(),1);await f.w.happyDOM.abort();
});
test('native navigation finishing after a chat switch does not scroll the other chat',async()=>{
 const f=fixture();const result=await revealPhoneOrigin({...f.args,native:{isBoundedChatSurfaceView:()=>true,jumpBoundedChatSurfaceToMessage:async()=>{f.change();f.mount();}}});
 assert.equal(result,false);assert.equal(f.scrolled(),0);await f.w.happyDOM.abort();
});
test('native errors and missing history remain visible failures',async()=>{
 const f=fixture(),error=Error('native load failed');
 await assert.rejects(revealPhoneOrigin({...f.args,native:{isBoundedChatSurfaceView:()=>true,jumpBoundedChatSurfaceToMessage:async()=>{throw error;}}}),e=>e===error);
 f.c.chat.shift();await assert.rejects(revealPhoneOrigin({...f.args,native:{}}),/已不在当前聊天/);assert.equal(f.scrolled(),0);await f.w.happyDOM.abort();
});
