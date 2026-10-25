import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeRequests} from '../../../v3/host-network.mjs';
function fixture(beforeSend){
 const calls=[],state={active:true},guard=()=>{if(!state.active)throw Object.assign(Error('scope changed'),{code:'SCOPE_CHANGED'});};
 const request=createNativeRequests({getContext:()=>({getRequestHeaders:()=>({})}),guard,signal:()=>undefined,beforeSend:async args=>{calls.push('checkpoint:'+args.stage);await beforeSend?.(state,args);},resolveConnection:async()=>({settings:{},model:'test'}),native:{openai:{createGenerationParameters:async(_settings,_model,_type,messages)=>{calls.push('parameters');return {generate_data:{messages}};}},fetch:async()=>{calls.push('fetch');return new Response(JSON.stringify({choices:[{message:{content:'answer'},finish_reason:'stop'}]}),{headers:{'Content-Type':'application/json'}});}}});
 return {calls,state,request};
}
const messages=[{role:'user',content:'hello'}];
test('each A and B send checkpoints after parameter building and before the actual network request',async()=>{
 const f=fixture();await f.request('preflight',messages,'one');await f.request('writer',messages,'one');
 assert.deepEqual(f.calls,['parameters','checkpoint:preflight','fetch','parameters','checkpoint:writer','fetch']);
});
test('a failed fresh workspace checkpoint sends no request',async()=>{
 const f=fixture(()=>{throw Object.assign(Error('worldbook changed'),{code:'WORKSPACE_CHANGED'});});
 await assert.rejects(f.request('writer',messages,'one'),{code:'WORKSPACE_CHANGED'});assert.equal(f.calls.includes('fetch'),false);
});
test('scope change while the fresh checkpoint awaits sends no request',async()=>{
 const f=fixture(async state=>{await Promise.resolve();state.active=false;});
 await assert.rejects(f.request('preflight',messages,'one'),{code:'SCOPE_CHANGED'});assert.equal(f.calls.includes('fetch'),false);
});

test('installed host checks A and B independently and refuses B after a newly failed checkpoint',async t=>{
 const {createInstallerHarness}=await import('./installer-harness.mjs');let checkpoints=0;
 const f=await createInstallerHarness({mvu:false,onSendCheckpoint:async runtime=>{assert.equal(typeof runtime.checkpointBinding,'function');if(++checkpoints===2)throw Object.assign(Error('binding changed before B'),{code:'CHECKPOINT_FAILED'});}});t.after(()=>f.api.dispose());
 const original=f.ctx.chat.map(message=>message.mes);await f.intercept('normal');
 assert.equal(checkpoints,2);assert.equal(f.requests.length,1);assert.deepEqual(f.ctx.chat.map(message=>message.mes),original);assert(f.errors.some(error=>error.code==='CHECKPOINT_FAILED'));assert.equal(f.api.busy(),false);
});
