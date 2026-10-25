import test from 'node:test';
import assert from 'node:assert/strict';
import {createFloorIdentityManager, MESSAGE_MARKER} from '../../../v3/runtime-source/host/floor-identities.mjs';
import {createHostController} from '../../../v3/runtime-source/host/controller.mjs';

const copy=structuredClone;
const request={floor:2,requestId:'reroll-one',userRequest:'Only revise this response.',candidateRevision:1};
const receipt={activeSourceKeys:['kept'],invalidatedSourceKeys:['replaced']};

async function fixture({initialize=true,captureSaveReadback=null}={}){
 const ctx={chat:[{mes:'opening'},{mes:'continue',is_user:true},{mes:'candidate',extra:{preserved:true}}],chatMetadata:{host:{controls:{}}}};
 let current=ctx,branch='branch',disk={},savedMessages=[],sequence=0;
 const calls={save:0,read:0,stable:0},writes=[],hooks={};
 const ids=createFloorIdentityManager({getContext:()=>current,getStableChatId:async()=>{calls.stable++;await hooks.stable?.();return branch;},
  saveChat:async saved=>{calls.save++;await hooks.beforeSave?.(saved);disk=copy(saved.chatMetadata);savedMessages=copy(saved.chat);writes.push(copy(disk));await hooks.afterSave?.(saved);return {metadata:copy(disk),untrusted:true};},
  readMetadata:async()=>{calls.read++;const actual=copy(disk);return hooks.read?hooks.read(actual):actual;},captureSaveReadback,uuid:()=>String(++sequence)});
 if(initialize)await ids.sync();
 const reset=()=>{calls.save=calls.read=calls.stable=0;writes.length=0;};reset();
 return {ctx,ids,calls,writes,hooks,reset,disk:()=>copy(disk),savedMessages:()=>copy(savedMessages),setContext:value=>{current=value;},setBranch:value=>{branch=value;}};
}

test('advanced reroll saves feedback and pending intent once before invalidating, then saves completion',async()=>{
 const f=await fixture(),texts=f.ctx.chat.map(m=>m.mes),sequence=[];
 const controller=createHostController({identities:{...f.ids,recordFeedback:()=>assert.fail('legacy feedback save'),recordInvalidation:()=>assert.fail('second pending save')},
  invalidate:async event=>{sequence.push('invalidate');const saved=f.disk().tisya_w24;assert.equal(saved.feedback[request.requestId].id,event.feedbackId);assert.equal(saved.invalidations.at(-1).status,'pending');assert.deepEqual(f.savedMessages(),f.ctx.chat);return receipt;},
  run:async input=>{sequence.push('run');assert.equal(f.disk().tisya_w24.invalidations.at(-1).status,'applied');assert.equal(input.advancedReroll.instruction,request.userRequest);return {ok:true};}});
 assert.deepEqual(await controller.advancedReroll(request),{ok:true});
 assert.deepEqual(sequence,['invalidate','run']);assert.deepEqual(f.calls,{save:2,read:2,stable:4});
 assert.equal(f.writes[0].tisya_w24.invalidations[0].status,'pending');assert.equal(Object.keys(f.writes[0].tisya_w24.feedback).length,1);
 assert.deepEqual(f.ctx.chat.map(m=>m.mes),texts);
});

test('an uninitialized chat reconciles every marker in the same preparation save',async()=>{
 const f=await fixture({initialize:false}),result=await f.ids.prepareAdvancedReroll(request);
 assert.deepEqual(f.calls,{save:1,read:1,stable:2});assert.equal(f.disk().tisya_w24.order.length,3);
 assert.equal(f.savedMessages()[2][MESSAGE_MARKER].id,result.identity.messageId);
 assert.equal(f.disk().tisya_w24.invalidations[0].feedbackId,result.advancedReroll.id);
});

test('an applied request reuses its receipt without repeating invalidation or saving unchanged identities',async()=>{
 const f=await fixture();let invalidations=0,runs=0;
 const controller=createHostController({identities:f.ids,invalidate:async()=>{invalidations++;return receipt;},run:async()=>{runs++;return {ok:true};}});
 await controller.advancedReroll(request);const before=f.disk();f.reset();
 await controller.advancedReroll(request);
 assert.equal(invalidations,1);assert.equal(runs,2);assert.equal(f.calls.save,0);assert.equal(f.calls.read,0);assert.equal(f.calls.stable,1);assert.deepEqual(f.disk(),before);
});

for(const [name,change] of [['instruction',{userRequest:'Different instruction.'}],['revision',{candidateRevision:2}],['logical target',{floor:0}]])test('a reused request rejects changed '+name+' before any write',async()=>{
 const f=await fixture(),prepared=await f.ids.prepareAdvancedReroll(request);await f.ids.completeInvalidation({id:prepared.event.id,receipt});f.reset();const before=copy(f.ctx);
 await assert.rejects(f.ids.prepareAdvancedReroll({...request,...change}),{code:'FEEDBACK_ID_REUSE'});
 assert.equal(f.calls.save,0);assert.deepEqual(f.ctx,before);
});

test('an applied replay still persists unrelated inserted markers in one verified save',async()=>{
 const f=await fixture(),first=await f.ids.prepareAdvancedReroll(request);await f.ids.completeInvalidation({id:first.event.id,receipt});f.reset();
 f.ctx.chat.push({mes:'new user turn',is_user:true});const again=await f.ids.prepareAdvancedReroll(request);
 assert.equal(again.event.id,first.event.id);assert.equal(again.event.status,'applied');assert.equal(f.calls.save,1);assert.equal(f.calls.read,1);
 assert.equal(f.disk().tisya_w24.order.length,4);assert.equal(f.savedMessages()[3][MESSAGE_MARKER].branchId,'branch');
});

test('an unresolved invalidation blocks new feedback and rolls back temporary marker repair',async()=>{
 const f=await fixture();await f.ids.prepareAdvancedReroll(request);f.ctx.chat.push({mes:'later',is_user:true});const before=copy(f.ctx);f.reset();
 await assert.rejects(f.ids.prepareAdvancedReroll({...request,requestId:'second'}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});
 assert.equal(f.calls.save,0);assert.deepEqual(f.ctx,before);assert.equal(Object.keys(f.disk().tisya_w24.feedback).length,1);
});

test('invalid preparation target leaves an uninitialized chat and markers unchanged',async()=>{
 const f=await fixture({initialize:false}),before=copy(f.ctx);
 await assert.rejects(f.ids.prepareAdvancedReroll({...request,floor:1}),{code:'REROLL_TARGET'});
 assert.equal(f.calls.save,0);assert.deepEqual(f.ctx,before);
});

for(const mode of ['save failure','readback corruption','stable owner change','context replacement'])test('preparation '+mode+' never reaches invalidation or the runner',async()=>{
 const f=await fixture(),before=copy(f.ctx);let invalidations=0,runs=0;const foreign={chat:[{mes:'foreign'}],chatMetadata:{foreign:true}};
 if(mode==='save failure')f.hooks.beforeSave=()=>{throw Error('disk refused');};
 if(mode==='readback corruption')f.hooks.read=actual=>{actual.tisya_w24.feedback[request.requestId].instruction='corrupt';return actual;};
 if(mode==='stable owner change')f.hooks.afterSave=()=>f.setBranch('foreign');
 if(mode==='context replacement')f.hooks.afterSave=()=>f.setContext(foreign);
 const controller=createHostController({identities:f.ids,invalidate:async()=>{invalidations++;return receipt;},run:async()=>{runs++;}});
 await assert.rejects(controller.advancedReroll(request));assert.equal(invalidations,0);assert.equal(runs,0);assert.deepEqual(foreign,{chat:[{mes:'foreign'}],chatMetadata:{foreign:true}});
 if(mode!=='context replacement')assert.deepEqual(f.ctx,before);
 if(mode==='save failure')assert.equal(f.disk().tisya_w24.invalidations.length,0);else assert.equal(f.disk().tisya_w24.invalidations[0].status,'pending','readback failure must not be described as a disk rollback');
});

for(const mode of ['throw','overlapping receipt','completion readback'])test('failed '+mode+' preserves pending intent and never runs generation',async()=>{
 const f=await fixture();let runs=0;
 const controller=createHostController({identities:f.ids,invalidate:async()=>{if(mode==='throw')throw Error('effect failed');if(mode==='overlapping receipt')return {activeSourceKeys:['x'],invalidatedSourceKeys:['x']};f.hooks.read=actual=>{actual.tisya_w24.invalidations[0].status='pending';return actual;};return receipt;},run:async()=>{runs++;}});
 await assert.rejects(controller.advancedReroll(request));assert.equal(runs,0);assert.equal(f.ctx.chatMetadata.tisya_w24.invalidations[0].status,'pending');
 await assert.rejects(f.ids.prepareAdvancedReroll({...request,requestId:'another'}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});
});

test('one actual metadata readback validates both identities and a staged host control namespace',async()=>{
 let captured=0,validated=0;
 const f=await fixture({captureSaveReadback:ctx=>{captured++;const expected=copy(ctx.chatMetadata.host);return actual=>{validated++;assert.deepEqual(actual.host,expected);};}});
 captured=validated=0;f.ctx.chatMetadata.host.controls[request.requestId]={target:'last',instruction:request.userRequest};
 await f.ids.prepareAdvancedReroll(request);
 assert.equal(captured,1);assert.equal(validated,1);assert.equal(f.calls.read,1);assert.deepEqual(f.disk().host,f.ctx.chatMetadata.host);
});

test('a staged host namespace readback mismatch rejects preparation before invalidation',async()=>{
 const f=await fixture({captureSaveReadback:ctx=>{const expected=copy(ctx.chatMetadata.host);return actual=>assert.deepEqual(actual.host,expected);}});
 f.ctx.chatMetadata.host.controls[request.requestId]={instruction:request.userRequest};f.hooks.read=actual=>{actual.host.controls={};return actual;};let invalidated=false;
 const controller=createHostController({identities:f.ids,invalidate:async()=>{invalidated=true;return receipt;},run:()=>assert.fail('unverified preparation reached generation')});
 await assert.rejects(controller.advancedReroll(request));assert.equal(invalidated,false);assert.equal(f.calls.read,1);
});

test('controllers without the optional preparation API retain the explicit legacy sequence',async()=>{
 const seen=[],identity={chatId:'c',branchId:'b',messageId:'m'},feedback={id:'f'},event={id:'e',status:'pending'};
 const controller=createHostController({identities:{recordFeedback:async()=>{seen.push('feedback');return {identity,advancedReroll:feedback};},recordInvalidation:async change=>{seen.push('pending');assert.equal(change.feedbackId,'f');return event;},completeInvalidation:async()=>{seen.push('complete');return receipt;}},invalidate:async()=>{seen.push('invalidate');return receipt;},run:async()=>{seen.push('run');return {ok:true};}});
 await controller.advancedReroll(request);assert.deepEqual(seen,['feedback','pending','invalidate','complete','run']);
});

async function typedPreparationFixture(){
 const ctx={chat:[{mes:'opening'},{mes:'continue',is_user:true},{mes:'candidate'}],chatMetadata:{}};
 let disk={},messages=[],full=0,metadata=0,corrupt=false,refuse=false;
 const kinds=[];
 const dependencies={getContext:()=>ctx,getStableChatId:async()=>'branch',saveChat:async saved=>{full++;disk=copy(saved.chatMetadata);messages=copy(saved.chat);},
  savePreparation:async(saved,{nativeMessagesChanged})=>{kinds.push(nativeMessagesChanged);if(refuse)throw Error('metadata store unavailable');if(nativeMessagesChanged)return dependencies.saveChat(saved);metadata++;disk=copy(saved.chatMetadata);},
  readMetadata:async()=>{const actual=copy(disk);if(corrupt&&actual.tisya_w24)actual.tisya_w24.feedback={};return actual;}};
 const ids=createFloorIdentityManager(dependencies);await ids.sync();full=metadata=0;
 return {ctx,ids,kinds,dependencies,disk:()=>copy(disk),messages:()=>copy(messages),counts:()=>({full,metadata}),corrupt:value=>{corrupt=value;},refuse:value=>{refuse=value;}};
}

test('stable preparation may save only metadata through the explicit dependency',async()=>{
 const f=await typedPreparationFixture(),beforeMessages=f.messages();await f.ids.prepareAdvancedReroll(request);
 assert.deepEqual(f.kinds,[false]);assert.deepEqual(f.counts(),{full:0,metadata:1});assert.deepEqual(f.messages(),beforeMessages);
 assert.equal(f.disk().tisya_w24.invalidations[0].status,'pending');assert.equal(Object.keys(f.disk().tisya_w24.feedback).length,1);
});

for(const mode of ['missing marker','inserted native floor with existing marker','changed native role'])test('preparation requires the full payload for '+mode,async()=>{
 const f=await typedPreparationFixture();
 if(mode==='missing marker')delete f.ctx.chat[0][MESSAGE_MARKER];
 if(mode==='inserted native floor with existing marker')f.ctx.chat.push({mes:'new native message',is_user:true,[MESSAGE_MARKER]:{branchId:'branch',id:'external-floor'}});
 if(mode==='changed native role')f.ctx.chat[0].is_system=true;
 await f.ids.prepareAdvancedReroll(request);assert.deepEqual(f.kinds,[true]);assert.deepEqual(f.counts(),{full:1,metadata:0});assert.deepEqual(f.messages(),f.ctx.chat);
});

test('ordinary native invalidations never use the preparation metadata-only callback',async()=>{
 const f=await typedPreparationFixture(),identity=await f.ids.resolve(2);f.ctx.chat[2].mes='selected native candidate';
 await f.ids.recordInvalidation({reason:'swipe',identity,fromFloor:2,swipeId:1});
 assert.deepEqual(f.kinds,[]);assert.deepEqual(f.counts(),{full:1,metadata:0});assert.deepEqual(f.messages(),f.ctx.chat);
});

for(const mode of ['save rejection','readback mismatch'])test('metadata preparation '+mode+' requires explicit disk reload before any later identity operation',async()=>{
 const f=await typedPreparationFixture();if(mode==='save rejection')f.refuse(true);else f.corrupt(true);
 await assert.rejects(f.ids.prepareAdvancedReroll(request),error=>{assert.equal(error.recovery,'reload-required');assert.equal(error.details.recovery,'reload-required');if(mode==='save rejection')assert.match(error.message,/metadata store unavailable/);else assert.equal(error.code,'IDENTITY_READBACK');return true;});
 f.refuse(false);f.corrupt(false);const beforeCounts=f.counts();
 for(const action of [()=>f.ids.sync(),()=>f.ids.resolve(2),()=>f.ids.recordFeedback({...request,requestId:'next'}),()=>f.ids.recordInvalidation({reason:'edit',fromFloor:2}),()=>f.ids.bindReplacement({identity:{chatId:'branch',branchId:'branch',messageId:'unused'},floor:2})]){
  await assert.rejects(action(),error=>error.code==='INVALIDATION_OUTCOME_UNKNOWN'&&error.recovery==='reload-required'&&error.details.recovery==='reload-required');
 }
 const blocked=createHostController({identities:f.ids,invalidate:()=>assert.fail('blocked preparation invalidated'),run:()=>assert.fail('blocked preparation generated')});
 await assert.rejects(blocked.generate({}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});assert.deepEqual(f.counts(),beforeCounts);
  const sameWorkingCopy=createFloorIdentityManager(f.dependencies);
  await assert.rejects(sameWorkingCopy.sync(),error=>error.code==='INVALIDATION_OUTCOME_UNKNOWN'&&error.recovery==='reload-required');
 // A cache refresh cannot clear the latch. A new manager is safe only after
 // the caller explicitly reloads the native metadata; any real pending intent
 // on disk remains pending and blocks generation through the usual check.
 f.ctx.chatMetadata=f.disk();const reopened=createFloorIdentityManager(f.dependencies),state=await reopened.sync();
 assert.equal(state.invalidations.length,mode==='save rejection'?0:1);
 if(mode==='readback mismatch'){
  assert.equal(state.invalidations[0].status,'pending');
  const controller=createHostController({identities:reopened,invalidate:()=>{},run:()=>assert.fail('disk pending generated')});
  await assert.rejects(controller.generate({}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});
 }
});

test('a validator capture failure before invoking the save does not latch an unknown disk result',async()=>{
 let reject=false;
 const f=await fixture({captureSaveReadback:()=>{if(reject)throw Error('capture refused before save');return null;}});reject=true;
 await assert.rejects(f.ids.prepareAdvancedReroll(request),/capture refused before save/);assert.equal(f.calls.save,0);
 reject=false;await f.ids.prepareAdvancedReroll(request);assert.equal(f.calls.save,1);
});
