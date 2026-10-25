import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness, newBody, sheet, wrap} from './installer-harness.mjs';

const copy=structuredClone, ID='tisya_w24', HOST='tisya_v3_host';
const control=(metadata,key)=>metadata[HOST]?.requests?.[key];
const invalidation=metadata=>metadata[ID]?.invalidations?.at(-1);
const output=(metadata,key)=>Object.values(metadata[HOST]?.outputs??{}).some(row=>row.requestKey===key);

// The harness runs the extracted native saveReply and actual host installer. Its
// save APIs have a real, separate metadata readback. This observer also models
// the message payload boundary: saveMetadata never updates durableMessages.
async function observeSaves(f){
 const events=[],attempts=[],writes=[];
 const handle=f.target.__TAURITAVERN__.api.chat.current.handle();
 let durableMessages=copy(f.ctx.chat),durableMetadata=await handle.metadata.get();
 const hooks={beforeSave:null};
 for(const [name,kind] of [['saveChat','chat'],['saveMetadata','metadata']]){
  const original=f.ctx[name];
  f.ctx[name]=async()=>{
   const attempt={kind,chat:copy(f.ctx.chat),metadata:copy(f.ctx.chatMetadata)};
   attempts.push(attempt);
   await hooks.beforeSave?.(attempt);
   await original();
   durableMetadata=await handle.metadata.get();
   if(kind==='chat')durableMessages=copy(f.ctx.chat);
   const committed={kind,chat:copy(durableMessages),metadata:copy(durableMetadata)};
   writes.push(committed);events.push({type:'save',...committed});
  };
 }
 return {events,attempts,writes,hooks,
  model(stage){events.push({type:'model',stage,chat:copy(durableMessages),metadata:copy(durableMetadata)});},
  get durableMessages(){return copy(durableMessages);},
  get durableMetadata(){return copy(durableMetadata);}
 };
}

async function fixture(t,{warmOutput=false,forms=false}={}){
 let trace=null,writers=0;
 const f=await createInstallerHarness({mvu:false,provider:({stage,messages})=>{
  trace?.model(stage);
  if(stage==='a')return sheet(messages);
  assert.equal(stage,'b');writers++;
  return wrap(writers===1?newBody:newBody.replace('一小时','两小时'));
 }});
 t.after(()=>f.api.dispose());
 if(forms)f.ctx.chat.pop();
 await f.api.getSession();
 if(warmOutput){await f.intercept('normal');assert.deepEqual(f.errors,[]);}
 trace=await observeSaves(f);
 return {...f,trace};
}

test('warm advanced reroll commits pending with controls, completion, then body plus output and active index once',async t=>{
 const f=await fixture(t,{warmOutput:true}),{trace}=f;
 const requestId='batched-advanced',floor=f.ctx.chat.length-1;
 const before=copy(f.ctx.chat),initialRequests=f.requests.length;
 const result=await f.api.advancedReroll({floor,instruction:'这一条改成两小时。',requestId});
 assert.equal(result.reused,false);assert.equal(f.requests.length-initialRequests,2);
 assert.deepEqual(trace.events.map(row=>row.type==='save'?row.kind:row.stage),['metadata','metadata','a','b','chat']);
 const [pending,completed,body]=trace.writes;
 assert.equal(invalidation(pending.metadata).status,'pending');
 assert.equal(invalidation(pending.metadata).feedbackId,pending.metadata[ID].feedback[requestId].id);
 assert.equal(control(pending.metadata,requestId).type,'advanced-reroll');
 assert.equal(control(pending.metadata,requestId).instruction,'这一条改成两小时。');
 assert.equal(invalidation(completed.metadata).status,'applied');
 assert.deepEqual(completed.metadata[ID].feedback,pending.metadata[ID].feedback);
 assert.deepEqual(control(completed.metadata,requestId),control(pending.metadata,requestId));
 for(const row of trace.events.filter(row=>row.type==='model')){
  assert.equal(invalidation(row.metadata).status,'applied','A and B may only run after completion readback');
  assert.equal(control(row.metadata,requestId).type,'advanced-reroll');
  assert.deepEqual(row.chat,before,'preparation and completion do not claim to save replacement prose');
 }
 assert.equal(body.kind,'chat');assert(output(body.metadata,requestId));
 assert(body.metadata[HOST].active.includes('request:'+requestId));
 assert.equal(body.chat.length,before.length);assert.deepEqual(body.chat.slice(0,floor),before.slice(0,floor));
 assert.equal(body.chat[floor].swipes.length,before[floor].swipes.length+1);
 assert.equal(body.chat[floor].swipe_id,body.chat[floor].swipes.length-1);
 assert.equal(body.chat[floor].mes,body.chat[floor].swipes.at(-1));
 assert.match(body.chat[floor].mes,/两小时/);assert.deepEqual(body.chat,copy(f.ctx.chat));
 assert.deepEqual(trace.durableMetadata,f.ctx.chatMetadata);
 const writes=trace.writes.length,requests=f.requests.length;
 const reused=await f.api.advancedReroll({floor,instruction:'这一条改成两小时。',requestId});
 assert.equal(reused.reused,true);assert.equal(f.requests.length,requests);assert.equal(trace.writes.length,writes);
 assert.deepEqual(trace.durableMessages,copy(f.ctx.chat));assert.equal(f.api.busy(),false);
});

test('normal generation saves its control before A and commits the new message with registered active output',async t=>{
 const f=await fixture(t),{trace}=f,before=copy(f.ctx.chat);
 await f.intercept('normal');assert.deepEqual(f.errors,[]);
 assert.deepEqual(trace.events.filter(row=>row.type==='model').map(row=>row.stage),['a','b']);
 const session=await f.api.getSession(),state=await session.storage.read();
 const [requestId,request]=Object.entries(state.requests).find(([,row])=>row.status==='delivered');
 assert(requestId);assert.notEqual(request.execution,'forms');
 const first=trace.events[0];assert.equal(first.type,'save');assert.equal(first.kind,'metadata');
 assert.equal(control(first.metadata,requestId).type,'normal');
 for(const row of trace.events.filter(row=>row.type==='model'))assert.deepEqual(control(row.metadata,requestId),control(first.metadata,requestId));
 const delivered=trace.writes.filter(row=>output(row.metadata,requestId));
 assert.equal(delivered.length,1,'the registered output has one native commit, with no following duplicate full save');
 assert.equal(delivered[0].kind,'chat');assert(delivered[0].metadata[HOST].active.includes('request:'+requestId));
 // Native saveReply initializes the preceding message's reasoning field before
 // appending (extracted script.js:8029); require precisely that native change.
 const expectedHistory=copy(before);expectedHistory.at(-1).extra={...expectedHistory.at(-1).extra,reasoning:''};
 assert.deepEqual(delivered[0].chat,copy(f.ctx.chat));assert.deepEqual(copy(f.ctx.chat.slice(0,before.length)),expectedHistory);
 assert.equal(f.ctx.chat.length,before.length+1);assert.deepEqual(trace.durableMessages,copy(f.ctx.chat));
 assert.deepEqual(trace.durableMetadata,f.ctx.chatMetadata);
 const saves=trace.writes.length,requests=f.requests.length;
 const recovered=await session.system.runner.recoverWriterOutput({requestKey:requestId,receipt:request.result.deliveryReceipt});
 assert.equal(recovered.reused,true);assert.equal(trace.writes.length,saves);assert.equal(f.requests.length,requests);
});

test('standalone forms save only their metadata control, keep native messages, and reuse the delivered request',async t=>{
 const f=await fixture(t,{forms:true}),{trace}=f,before=copy(f.ctx.chat),requestId='batched-forms';
 const result=await f.api.advance({requestId});
 assert.equal(result.output,null);assert.equal(result.deliveryReceipt,null);
 assert.deepEqual(trace.events.map(row=>row.type==='save'?row.kind:row.stage),['metadata','a']);
 assert.equal(control(trace.writes[0].metadata,requestId).type,'forms');
 assert.equal(control(trace.events.find(row=>row.type==='model').metadata,requestId).type,'forms');
 assert.deepEqual(copy(f.ctx.chat),before);assert.deepEqual(trace.durableMessages,before);
 const state=await (await f.api.getSession()).storage.read();
 assert.equal(state.requests[requestId].execution,'forms');assert.equal(state.requests[requestId].status,'delivered');
 const reused=await f.api.advance({requestId});
 assert.equal(reused.reused,true);assert.equal(f.requests.length,1);assert.equal(trace.writes.length,1);
 assert.equal(f.api.busy(),false);
});

for(const failure of ['save','host readback'])test('advanced preparation '+failure+' failure rolls back dirty controls and sends neither A nor B',async t=>{
 const f=await fixture(t,{warmOutput:true}),{trace}=f,requestId='prepare-failed-'+failure;
 const before=copy(f.ctx.chat),beforeId=copy(f.ctx.chatMetadata[ID]),requests=f.requests.length;
 const originalMetadataSave=f.ctx.saveMetadata;
 if(failure==='save')trace.hooks.beforeSave=()=>{throw Error('preparation store refused');};
 else f.ctx.saveMetadata=async()=>{
  const expected=f.ctx.chatMetadata[HOST],corrupt=copy(expected);delete corrupt.requests[requestId];
  f.ctx.chatMetadata[HOST]=corrupt;
  try{await originalMetadataSave();}finally{f.ctx.chatMetadata[HOST]=expected;}
 };
 await assert.rejects(f.api.advancedReroll({floor:before.length-1,instruction:'保存失败不能发送。',requestId}),
  failure==='save'?/preparation store refused/:{code:'V3_METADATA_READBACK'});
 assert.equal(f.requests.length,requests);assert.equal(trace.events.filter(row=>row.type==='model').length,0);
 assert.equal(control(f.ctx.chatMetadata,requestId),undefined);assert.deepEqual(f.ctx.chatMetadata[ID],beforeId);
 assert.deepEqual(copy(f.ctx.chat),before);assert.equal(f.api.busy(),false);
 assert.equal(trace.attempts.length,1);assert.equal(trace.attempts[0].kind,'metadata');
 if(failure==='host readback')assert.equal(invalidation(trace.durableMetadata).status,'pending','a mismatched receipt is not evidence that disk rolled back');
 const attempts=trace.attempts.length;
 await assert.rejects(f.api.advancedReroll({floor:before.length-1,instruction:'不应自动重试未知保存。',requestId:'blocked-after-'+failure}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});
 assert.equal(f.requests.length,requests);assert.equal(trace.attempts.length,attempts);
 assert.equal(control(f.ctx.chatMetadata,'blocked-after-'+failure),undefined);
});

test('failed completion preserves already confirmed pending intent and controls while withholding A and B',async t=>{
 const f=await fixture(t,{warmOutput:true}),{trace}=f,requestId='completion-failed';
 const before=copy(f.ctx.chat),requests=f.requests.length;
 trace.hooks.beforeSave=attempt=>{if(invalidation(attempt.metadata)?.status==='applied')throw Error('completion store refused');};
 await assert.rejects(f.api.advancedReroll({floor:before.length-1,instruction:'保留已确认待处理状态。',requestId}),/completion store refused/);
 assert.deepEqual(trace.attempts.map(row=>row.kind),['metadata','metadata']);assert.equal(trace.writes.length,1);
 assert.equal(invalidation(trace.durableMetadata).status,'pending');assert.equal(invalidation(f.ctx.chatMetadata).status,'pending');
 assert.equal(control(f.ctx.chatMetadata,requestId).type,'advanced-reroll');
 assert.deepEqual(control(f.ctx.chatMetadata,requestId),control(trace.durableMetadata,requestId));
 assert.equal(f.ctx.chatMetadata[ID].feedback[requestId].id,trace.durableMetadata[ID].feedback[requestId].id);
 assert.equal(f.requests.length,requests);assert.deepEqual(copy(f.ctx.chat),before);assert.equal(f.api.busy(),false);
 await assert.rejects(f.api.advancedReroll({floor:before.length-1,instruction:'稍后另一请求。',requestId:'after-completion-failure'}),{code:'INVALIDATION_OUTCOME_UNKNOWN'});
 assert.equal(f.requests.length,requests);assert.equal(control(f.ctx.chatMetadata,'after-completion-failure'),undefined);
 assert.deepEqual(control(f.ctx.chatMetadata,requestId),control(trace.durableMetadata,requestId));
});

for(const kind of ['normal','forms'])test(kind+' control save failure never sends A and removes the unconfirmed control',async t=>{
 const f=await fixture(t,{forms:kind==='forms'}),{trace}=f,before=copy(f.ctx.chat),controls=copy(f.ctx.chatMetadata[HOST].requests??{});
 trace.hooks.beforeSave=()=>{throw Error('control store refused');};
 if(kind==='forms')await assert.rejects(f.api.advance({requestId:'forms-control-failed'}),/control store refused/);
 else{await f.intercept('normal');assert.equal(f.errors.length,1);assert.match(f.errors[0].message,/control store refused/);}
 assert.equal(f.requests.length,0);assert.equal(trace.writes.length,0);assert.equal(trace.attempts.length,1);
 assert.equal(trace.attempts[0].kind,'metadata');assert.deepEqual(f.ctx.chatMetadata[HOST].requests,controls);
 assert.deepEqual(copy(f.ctx.chat),before);assert.equal(f.api.busy(),false);
});
