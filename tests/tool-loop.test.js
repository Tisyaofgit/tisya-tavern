import test from 'node:test';
import assert from 'node:assert/strict';
import {readTaskResponse,readToolResponse} from '../config/stream-response.js';
import {runArchiveToolLoop} from '../config/tool-loop.js';
const call=(id,name='tisya_list_archive',args='{}')=>({id,type:'function',function:{name,arguments:args}});
const json=(content,calls=null)=>Response.json({choices:[{index:0,message:{role:'assistant',content,...(calls?{tool_calls:calls}:{})},finish_reason:calls?'tool_calls':'stop'}]});
const frame=(delta,finish_reason=null)=>'data: '+JSON.stringify({choices:[{index:0,delta,finish_reason}]})+'\n\n';
const stream=(text,size=1)=>new Response(new ReadableStream({start(c){const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=size)c.enqueue(bytes.slice(i,i+size));c.close();}}),{headers:{'content-type':'text/event-stream'}});
test('nullable stream type fragments retain the function call and reject unsupported concrete types',async()=>{
 const first=frame({tool_calls:[{index:0,id:'relay-call',type:'function',function:{name:'tisya_list_archive',arguments:''},extra_content:{google:{thought_signature:'opaque'}}}]});
 const tail=type=>frame({tool_calls:[{index:0,type,function:{arguments:'{"depth":1,"path":"/"}'}}]},'tool_calls')+'data: [DONE]\n\n';
 for(const size of [1,3,1024]){const parsed=await readToolResponse(stream(first+tail(null),size));assert.deepEqual(parsed.toolCalls,[{...call('relay-call','tisya_list_archive','{"depth":1,"path":"/"}'),extra_content:{google:{thought_signature:'opaque'}}}]);}
 for(const type of ['','custom','computer',false,0,{}])await assert.rejects(readToolResponse(stream(first+tail(type))),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
 await assert.rejects(readToolResponse(json('',[{...call('invalid'),type:null}])),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
 await assert.rejects(readToolResponse(stream(frame({tool_calls:[{index:0,type:null,function:{arguments:'{}'}}]},'tool_calls'))),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
});
function fixture(){const executed=[];let valid=true;const session={assertFresh:async()=>{if(!valid){const e=Error('expired');e.code='SNAPSHOT_EXPIRED';throw e;}},list_archive:async input=>(executed.push(input),{status:'ok',items:[{id:'r1'}],has_more:false}),describe_fields:async()=>({status:'ok',items:[]}),search_archive:async()=>({status:'ok',items:[]}),read_archive:async()=>({status:'ok',items:[]})};return {session,executed,invalidate:()=>{valid=false;}};}

test('opt-in parser preserves complete tool arguments/signatures and the ordinary reader still rejects tool finishes',async()=>{
 const c={...call('a'),extra_content:{google:{thought_signature:'signed'}}},r=await readToolResponse(json('查一下',[c]));assert.deepEqual(r.toolCalls,[c]);assert.equal(r.assistant.content,'查一下');
 await assert.rejects(readTaskResponse(json('',[c])),{code:'TISYA_RESPONSE_FINISH'});
 const g=await readToolResponse(Response.json({candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'tisya_list_archive',args:{}},thoughtSignature:'g'}]}}]}));assert.equal(g.toolCalls[0].extra_content.google.thought_signature,'g');
 await assert.rejects(readToolResponse(Response.json({stop_reason:'tool_use',content:[{type:'thinking',thinking:'hidden'},{type:'tool_use',id:'a',name:'tisya_list_archive',input:{}}]})),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
});

test('streamed multi-call fragments form one complete batch without exposing reasoning as progress',async()=>{
 const wire=frame({reasoning_content:'HIDDEN',tool_calls:[{index:0,id:'a',function:{name:'tisya_search_',arguments:'{"query":"中'}}]})+frame({tool_calls:[{index:0,function:{name:'archive',arguments:'文🙂"}'}},{index:1,id:'b',function:{name:'tisya_list_archive',arguments:'{}'}}]},'tool_calls')+'data: [DONE]\n\n';
 for(const size of [1,3,100]){const updates=[],r=await readToolResponse(stream(wire,size),{onProgress:u=>updates.push(u)});assert.equal(r.toolCalls.length,2);assert.equal(JSON.parse(r.toolCalls[0].function.arguments).query,'中文🙂');assert.doesNotMatch(JSON.stringify(updates),/HIDDEN/);}
 for(const wire of [frame({tool_calls:[{index:0,id:'a',function:{name:'tisya_list_archive',arguments:'{}'}}]})+'data: [DONE]\n\n',frame({tool_calls:[{index:1,id:'a',function:{name:'tisya_list_archive',arguments:'{}'}}]},'tool_calls')])await assert.rejects(readToolResponse(stream(wire)),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
});

test('controlled loop returns results in the next request with matching IDs and never calls a native registry',async()=>{
 const f=fixture(),sent=[],rounds=[];let n=0;
 const result=await runArchiveToolLoop({messages:[{role:'user',content:'找档案'}],session:f.session,guard:async()=>{},onRound:r=>rounds.push(r),send:async(messages,tools)=>{sent.push({messages,tools});return n++===0?json('',[call('one'),call('two','tisya_describe_fields')]):json('{"answer":"已核对"}');}});
 assert.equal(result,'{"answer":"已核对"}');assert.equal(sent.length,2);assert.equal(sent[0].tools.tools.length,4);assert.equal(sent[1].messages[1].role,'assistant');assert.deepEqual(sent[1].messages.slice(2).map(x=>x.tool_call_id),['one','two']);assert.equal(rounds[1].totalCalls,2);assert.equal(f.executed.length,1);
});
test('independent reads overlap but all results are backfilled once in call order',async()=>{
 const f=fixture(),started=[],release=[];let sends=0;
 f.session.list_archive=async input=>{started.push(input.tag);await new Promise(r=>release.push(r));return {status:'ok',tag:input.tag};};
 const pending=runArchiveToolLoop({messages:[],session:f.session,guard:()=>{},send:async m=>{sends++;if(sends===1)return json('',[call('a','tisya_list_archive','{"tag":"first"}'),call('b','tisya_list_archive','{"tag":"second"}')]);assert.deepEqual(m.filter(x=>x.role==='tool').map(x=>[x.tool_call_id,JSON.parse(x.content).tag]),[['a','first'],['b','second']]);return json('done');}});
 await new Promise(r=>setImmediate(r));assert.deepEqual(started,['first','second']);assert.equal(sends,1);release[1]();await new Promise(r=>setImmediate(r));assert.equal(sends,1);release[0]();assert.equal(await pending,'done');assert.equal(sends,2);
});
test('a terminal parallel read failure never backfills partial success or starts another request',async()=>{
 const f=fixture();let sends=0,completed=0;f.session.list_archive=async()=>{throw Object.assign(Error('budget'),{code:'BUDGET_EXCEEDED'});};f.session.read_archive=async()=>{await new Promise(r=>setImmediate(r));completed++;return {status:'ok'};};
 await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,guard:()=>{},send:async()=>{sends++;return json('',[call('a'),call('b','tisya_read_archive')]);}}),{code:'BUDGET_EXCEEDED'});assert.equal(completed,1);assert.equal(sends,1);
});

test('unknown names, duplicate IDs and malformed argument batches perform zero calls',async()=>{
 for(const batch of [[call('a'),call('b','external_delete')],[call('a'),call('a')],[call('a'),call('b','tisya_list_archive','{')],[call('a'),call('b','tisya_list_archive','[]')]]){
  const f=fixture();await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,guard:async()=>{},send:async()=>json('',batch)}));assert.equal(f.executed.length,0);
 }
});

test('reused IDs across rounds stop instead of executing again; the final budget round advertises no tools',async()=>{
 const f=fixture();let n=0;await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,guard:async()=>{},send:async()=>{n++;return json('',[call('same')]);}}),{code:'TISYA_TOOL_DUPLICATE'});assert.equal(f.executed.length,1);assert.equal(n,2);
 const g=fixture(),requests=[];const r=await runArchiveToolLoop({messages:[],session:g.session,guard:async()=>{},maxRounds:1,send:async(m,t)=>{requests.push(t);return requests.length===1?json('',[call('a')]):json('完成');}});assert.equal(r,'完成');assert.deepEqual(requests[1],{tools:[],tool_choice:'none'});
 const h=fixture();await assert.rejects(runArchiveToolLoop({messages:[],session:h.session,guard:async()=>{},maxRounds:1,send:async()=>json('',[call(crypto.randomUUID())])}),{code:'TISYA_TOOL_LIMIT'});assert.equal(h.executed.length,1);
});

test('repairable query errors are explicit tool results; stale state aborts without another model request',async()=>{
 const f=fixture();f.session.read_archive=async()=>{const e=Error('字段不存在');e.code='INVALID_FIELD';throw e;};let n=0;
 await runArchiveToolLoop({messages:[],session:f.session,guard:async()=>{},send:async(m)=>{if(n++===0)return json('',[call('a','tisya_read_archive','{"id":"r"}')]);assert.equal(JSON.parse(m.at(-1).content).status,'error');return json('无法读取该字段');}});assert.equal(n,2);
 const g=fixture();n=0;await assert.rejects(runArchiveToolLoop({messages:[],session:g.session,guard:async()=>{},send:async()=>{n++;g.invalidate();return json('',[call('a')]);}}),{code:'SNAPSHOT_EXPIRED'});assert.equal(n,1);assert.equal(g.executed.length,0);
});

test('cancellation after accepted transport and after a tool result never launches another request',async()=>{
 for(const during of ['request','tool']){const f=fixture(),controller=new AbortController();let n=0;
 if(during==='tool')f.session.list_archive=async()=>{controller.abort(Error('cancelled'));return {status:'ok'};};
 await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,signal:controller.signal,guard:async()=>{},send:async()=>{n++;if(during==='request')controller.abort(Error('cancelled'));return json('',[call('a')]);}}),/cancelled/);assert.equal(n,1);}
});
test('an oversized query can be narrowed by the model but exhausted budgets never trigger another request',async()=>{
 const f=fixture();let queries=0,sends=0;
 f.session.read_archive=async input=>{queries++;if(!input.select)throw Object.assign(Error('缩小字段'),{code:'QUERY_TOO_LARGE'});return {status:'ok',items:[{path:['名称'],value:'岚'}]};};
 const result=await runArchiveToolLoop({messages:[],session:f.session,guard:()=>{},send:async m=>{sends++;if(sends===1)return json('',[call('large','tisya_read_archive','{"id":"a"}')]);if(sends===2){assert.equal(JSON.parse(m.at(-1).content).code,'QUERY_TOO_LARGE');return json('',[call('small','tisya_read_archive','{"id":"a","select":["名称"]}')]);}assert.equal(JSON.parse(m.at(-1).content).items[0].value,'岚');return json('完成');}});
 assert.equal(result,'完成');assert.equal(queries,2);assert.equal(sends,3);
 const g=fixture();sends=0;g.session.read_archive=async()=>{throw Object.assign(Error('总预算不足'),{code:'BUDGET_EXCEEDED'});};
 await assert.rejects(runArchiveToolLoop({messages:[],session:g.session,guard:()=>{},send:async()=>{sends++;return json('',[call('terminal','tisya_read_archive')]);}}),{code:'BUDGET_EXCEEDED'});assert.equal(sends,1);
});

test('loop timeout aborts its transport signal and stale responses release their unread body',async()=>{
 const f=fixture();let sends=0,aborted=false;
 await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,guard:async()=>{},timeoutMs:15,send:async(_,__,___,{signal})=>{sends++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));}}),{code:'TISYA_TOOL_TIMEOUT'});assert.equal(sends,1);assert.equal(aborted,true);
 const g=fixture();let canceled=false;await assert.rejects(runArchiveToolLoop({messages:[],session:g.session,guard:async()=>{},send:async()=>{g.invalidate();return new Response(new ReadableStream({cancel(){canceled=true;}}));}}),{code:'SNAPSHOT_EXPIRED'});assert.equal(canceled,true);
});

test('native Gemini streaming returns signed tool calls and final text across byte boundaries',async()=>{
 const event=x=>'data: '+JSON.stringify(x)+'\n\n';
 const wire=event({candidates:[{content:{parts:[{thought:true,text:'HIDDEN_GEMINI'}]}}]})+event({candidates:[{content:{parts:[{functionCall:{name:'tisya_list_archive',args:{}},thoughtSignature:'signature1'},{functionCall:{id:'explicit',name:'tisya_read_archive',args:{id:'旧约定'}}}]},finishReason:'STOP'}]});
 const updates=[],r=await readToolResponse(stream(wire,1),{onProgress:x=>updates.push(x)});assert.equal(r.toolCalls.length,2);assert.equal(r.toolCalls[0].signature,'signature1');assert.equal(r.toolCalls[1].id,'explicit');assert.equal(JSON.parse(r.toolCalls[1].function.arguments).id,'旧约定');assert.doesNotMatch(JSON.stringify(updates),/HIDDEN_GEMINI/);
 const final=await readToolResponse(stream(event({candidates:[{content:{parts:[{text:'{"answer":"已核对"}'}]},finishReason:'STOP'}]})));assert.equal(final.content,'{"answer":"已核对"}');assert.equal(final.toolCalls.length,0);
 await assert.rejects(readToolResponse(stream(event({candidates:[{content:{parts:[{functionCall:{name:'tisya_list_archive',args:{}}}]},finishReason:'MAX_TOKENS'}]}))),{code:'TISYA_RESPONSE_TRUNCATED'});
 const wrapper=await readToolResponse(Response.json({choices:[{index:0,finish_reason:'stop',message:{content:''}}],responseContent:{parts:[{functionCall:{name:'tisya_list_archive',args:{}},thoughtSignature:'wrapper-sig'}]}}));assert.equal(wrapper.toolCalls[0].signature,'wrapper-sig');
});

test('provider metadata is retained when supported and unknown reasoning envelopes stop explicitly',async()=>{
 for(const field of [{native:{content:[{type:'thinking',thinking:'opaque'}]}},{reasoning_details:[{type:'reasoning.encrypted',data:'opaque'}]}]){
  const payload={choices:[{index:0,finish_reason:'tool_calls',message:{content:null,tool_calls:[call('a')],...field}}]};await assert.rejects(readToolResponse(Response.json(payload)),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
  await assert.rejects(readToolResponse(stream(frame({...field,tool_calls:[{index:0,...call('a')}]},'tool_calls'))),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
 }
 const r=await readToolResponse(Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'查阅',thoughtSignature:'turn-signed'},{functionCall:{id:'no-args',name:'tisya_list_archive'}}]}}]}));assert.equal(r.assistant.signature,'turn-signed');assert.equal(r.toolCalls[0].function.arguments,'{}');
 const f=fixture();let round=0;await runArchiveToolLoop({messages:[],session:f.session,guard:async()=>{},send:async m=>{if(round++===0)return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[call('a')],signature:'signed-turn'}}]});assert.equal(m.at(-2).signature,'signed-turn');return json('完成');}});
 await assert.rejects(readToolResponse(stream(frame({content:'x'.repeat(262145)},'stop'),1024)),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
});

test('timeout releases a stalled host read and late resolution cannot send another request',async()=>{
 const f=fixture();let release,sends=0;f.session.assertFresh=()=>new Promise(resolve=>{release=resolve;});
 await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,guard:async()=>{},timeoutMs:15,send:async()=>{sends++;return json('unexpected');}}),{code:'TISYA_TOOL_TIMEOUT'});assert.equal(sends,0);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(sends,0);
 const g=fixture();let toolRelease;g.session.list_archive=()=>new Promise(resolve=>{toolRelease=resolve;});
 await assert.rejects(runArchiveToolLoop({messages:[],session:g.session,guard:async()=>{},timeoutMs:50,send:async()=>{sends++;return json('',[call('first')]);}}),{code:'TISYA_TOOL_TIMEOUT'});assert.equal(sends,1);toolRelease({status:'ok',items:[]});await new Promise(resolve=>setImmediate(resolve));assert.equal(sends,1);
});

test('proposal capability requires its separate task mode and never expands the default read catalogue',async()=>{
 const f=fixture();let proposed=0;f.session.context={task:'tableArchive'};f.session.propose_archive_change=async()=>{proposed++;return {state:'draft',written:false};};
 await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,guard:()=>{},send:async(_m,t)=>{assert.equal(t.tools.length,4);return json('',[call('a','tisya_propose_archive_change')]);}}),{code:'TISYA_TOOL_NOT_ALLOWED'});assert.equal(proposed,0);
 let count=0;await runArchiveToolLoop({messages:[],session:f.session,mode:'archive-proposal',guard:()=>{},send:async(m,t)=>{assert.equal(t.tools.length,5);if(count++===0)return json('',[call('a','tisya_propose_archive_change')]);assert.equal(JSON.parse(m.at(-1).content).written,false);return json('done');}});assert.equal(proposed,1);
 f.session.context.task='tableAssistant';await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,mode:'archive-proposal',guard:()=>{},send:async()=>{throw Error('must not send');}}),{code:'TISYA_TOOL_POLICY'});
});
test('a forbidden save tool prevents a whole batch including a valid draft proposal',async()=>{
 const f=fixture();let proposals=0;f.session.context={task:'tableArchive'};f.session.propose_archive_change=async()=>proposals++;
 await assert.rejects(runArchiveToolLoop({messages:[],session:f.session,mode:'archive-proposal',guard:()=>{},send:async()=>json('',[call('draft','tisya_propose_archive_change'),call('save','saveArchiveProposal')])}),{code:'TISYA_TOOL_NOT_ALLOWED'});assert.equal(proposals,0);
});


test('native Gemini empty intermediate finish and terminal padding require a real STOP',async()=>{
 const frame=x=>'data: '+JSON.stringify(x)+'\n\n';
 const call=frame({candidates:[{content:{role:'model',parts:[{functionCall:{id:'native-empty',name:'tisya_list_archive',args:{path:'/'}},thoughtSignature:'unchanged-signature'}]},finishReason:''}]});
 const end=frame({candidates:[{content:{role:'model',parts:[{}]},finishReason:'STOP'}]});
 const response=raw=>new Response(raw,{headers:{'content-type':'text/event-stream'}});
 const result=await readToolResponse(response(call+end));
 assert.equal(result.toolCalls.length,1);assert.equal(result.toolCalls[0].id,'native-empty');assert.equal(result.toolCalls[0].signature,'unchanged-signature');
 await assert.rejects(readToolResponse(response(call)),{code:'TISYA_RESPONSE_TRUNCATED'});
 await assert.rejects(readToolResponse(response(call+end.replace('STOP','MAX_TOKENS'))),{code:'TISYA_RESPONSE_TRUNCATED'});
 await assert.rejects(readToolResponse(Response.json({candidates:[{content:{parts:[{functionCall:{id:'x',name:'tisya_list_archive',args:{}}}]},finishReason:''}]})),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
});


test('native signature length is independent of its JSON metadata envelope',async()=>{
 const native=sig=>({candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{id:'signed-boundary',name:'tisya_list_archive',args:{}},thoughtSignature:sig}]}}]});
 const signature='s'.repeat(262144);
 const result=await readToolResponse(Response.json(native(signature)));
 assert.equal(result.toolCalls[0].signature,signature);assert.equal(result.toolCalls[0].extra_content.google.thought_signature,signature);
 await assert.rejects(readToolResponse(Response.json(native(signature+'s'))),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
 await assert.rejects(readToolResponse(Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'large-envelope',type:'function',function:{name:'tisya_list_archive',arguments:'{}'},extra_content:{other:'x'.repeat(528384)}}]}}]})),{code:'TISYA_RESPONSE_TOOL_PROTOCOL'});
});
