import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createPresetUpdateController,mountPresetUpdateControl,showPresetUpdateError} from '../builtin-preset-controls.js';
import bundled from '../presets/Tisya.json' with {type:'json'};

test('one update action retries a failed initialization, deduplicates clicks and clears the stale error',async()=>{
 const w=new Window(),document=w.document,calls=[];let release,fail=true;
 const controller=createPresetUpdateController({getContext:()=>({}),document,isBusy:()=>false,install:async(c,d,options)=>{calls.push(options);if(fail)throw Error('native save failed');await new Promise(r=>release=r);return {name:'Tisya',active:true,status:'updated'};}});
 await assert.rejects(controller.update(),/native save failed/);
 const ui=mountPresetUpdateControl(document.body,controller),button=document.querySelector('button');assert.match(document.body.textContent,/native save failed/);
 fail=false;button.click();button.click();await Promise.resolve();assert.equal(calls.length,2);assert.equal(calls[1].force,true);assert(button.disabled);assert(controller.state().error);
 release();await w.happyDOM.whenAsyncComplete();assert.equal(controller.state().error,null);assert.equal(controller.state().busy,false);assert.match(document.body.textContent,/已就绪/);assert(!button.disabled);ui.dispose();await w.happyDOM.close();
});

test('persistent failure notice contains a real update button and reports retry failure until actual success',async()=>{
 const w=new Window(),document=w.document;let fail=true,calls=0,cleared=0;
 const toastr={error(message,title,options){assert.equal(options.timeOut,0);assert.equal(options.escapeHtml,true);const node=document.createElement('div'),text=document.createElement('p');text.className='toast-message';text.textContent=message;node.append(text);document.body.append(node);return {0:node};},clear(){cleared++;}};
 showPresetUpdateError(document,toastr,Error('first failure'),async()=>{calls++;if(fail)throw Error('retry failure');});
 document.querySelector('button').click();await w.happyDOM.whenAsyncComplete();assert.equal(calls,1);assert.match(document.body.textContent,/retry failure/);assert.equal(cleared,0);assert(!document.querySelector('button').disabled);
 fail=false;document.querySelector('button').click();await w.happyDOM.whenAsyncComplete();assert.equal(calls,2);assert.equal(cleared,1);assert.equal(document.body.children.length,0);await w.happyDOM.close();
});
test('native reselection clears only a proven saved-load failure, never an unacknowledged save failure',async()=>{
 for(const saved of [true,false]){
  const context={getPresetManager:()=>({getSelectedPresetName:()=> 'Tisya'}),chatCompletionSettings:{}},failure=Object.assign(Error('first failure'),{tisyaPresetSaved:saved});
  const controller=createPresetUpdateController({getContext:()=>context,document:{},install:async()=>{throw failure;}});await assert.rejects(controller.update());context.chatCompletionSettings=structuredClone(bundled);
  if(saved){assert.doesNotThrow(()=>controller.assertReady());assert.equal(controller.state().error,null);}else{assert.throws(()=>controller.assertReady(),/first failure/);assert.equal(controller.state().error,failure);}
 }
});
