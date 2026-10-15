import test from 'node:test';
import assert from 'node:assert/strict';
import {detectNativeProtocol,guardNativeProtocolStream} from '../config/native-protocol-guard.js';
import {guardCompletionStream} from '../vendor/vertex-transport/completion-integrity.mjs';
import {createTextTransport} from '../config/text-transport.js';
const evt=v=>'data: '+(typeof v==='string'?v:JSON.stringify(v))+'\n\n';
const start={type:'message_start',message:{id:'msg',role:'assistant',content:[],stop_reason:null,usage:{input_tokens:1}}};
const block={type:'content_block_start',index:0,content_block:{type:'text',text:''}};
const text={type:'content_block_delta',index:0,delta:{type:'text_delta',text:'完整🙂'}};
const close={type:'content_block_stop',index:0};
const delta=reason=>({type:'message_delta',delta:{stop_reason:reason},usage:{output_tokens:3}});
const stop={type:'message_stop'};
const good=[start,block,text,close,delta('end_turn'),stop];
const response=events=>new Response(events.map(evt).join(''),{headers:{'content-type':'text/event-stream'}});
const parse=raw=>raw.split('\n').filter(x=>x.startsWith('data: ')&&!x.includes('[DONE]')).map(x=>JSON.parse(x.slice(6)));
const run=(events,status={})=>guardNativeProtocolStream(response(events),status,{protocol:'claude'});

test('native dialect detection follows host formats including normalized Responses',()=>{
 for(const [p,want]of [[{chat_completion_source:'claude'},'claude'],[{chat_completion_source:'vertexai',model:'claude-sonnet-4'},'claude'],[{chat_completion_source:'vertexai',model:'gemini-alias'},'gemini'],[{chat_completion_source:'opencode',opencode_api_format:'gemini'},'gemini'],[{chat_completion_source:'opencode',opencode_api_format:'claude_messages'},'claude'],[{chat_completion_source:'custom',custom_api_format:'claude_messages'},'claude'],[{chat_completion_source:'custom',custom_api_format:'openai_responses'},'openai'],[{chat_completion_source:'cohere'},'cohere'],[{chat_completion_source:'aws_bedrock',model:'anything'},'unknown'],[{chat_completion_source:'aws_bedrock',model:'us.anthropic.claude-sonnet'},'claude'],[{chat_completion_source:'aws_bedrock',model:'anthropic.claude-sonnet',aws_bedrock_use_custom_template:true},'unknown']])assert.equal(detectNativeProtocol(p),want);
});
test('Claude native text projects exact body and preserves every original frame',async()=>{
 const values=parse(await run(good).text());assert.deepEqual(values.map(x=>x.tisyaNativeFrame),good);assert.equal(values.map(x=>x.choices[0].delta.content??'').join(''),'完整🙂');assert.equal(values.at(-1).choices[0].finish_reason,'stop');
 let integrity;await guardCompletionStream(run(good),v=>{integrity=v;}).text();assert.equal(integrity.outcome,'complete');assert.equal(integrity.streamDone,true);
});
test('Claude actual tool JSON and signatures remain in native sidecars with handoff projection',async()=>{
 const events=[start,{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'opaque'}},close,{type:'content_block_start',index:1,content_block:{type:'tool_use',id:'stable',name:'lookup',input:{}}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'{"q":"benign"}'}},{type:'content_block_stop',index:1},delta('tool_use'),stop];
 const values=parse(await run(events).text());assert.deepEqual(values.map(x=>x.tisyaNativeFrame),events);assert.equal(values.at(-1).choices[0].finish_reason,'tool_calls');const call=values.flatMap(x=>x.choices[0].delta.tool_calls??[])[0];assert.equal(call.id,'stable');assert.deepEqual(JSON.parse(call.function.arguments),{q:'benign'});
 let integrity;await guardCompletionStream(run(events),v=>{integrity=v;}).text();assert.equal(integrity.outcome,'tool_calls');
});
for(const reason of ['max_tokens','model_context_window_exceeded','refusal','pause_turn','unknown'])test('Claude rejects nonfinal stop '+reason,async()=>{await assert.rejects(run([start,block,text,close,delta(reason),stop]).text());});
test('Claude rejects missing, duplicate, out of order and postterminal frames',async()=>{
 const variants=[good.slice(0,-1),good.slice(1),[start,...good],[...good,stop],[...good,text],[...good,delta('end_turn')],[start,block,text,delta('end_turn'),stop],[start,block,{...text,index:2},close,delta('end_turn'),stop],[start,block,text,close,stop],[...good,'[DONE]',text],[start,{type:'error',error:{message:'bad'}}],[start,delta('tool_use'),stop]];
 for(const events of variants)await assert.rejects(run(events).text());
 await assert.rejects(guardNativeProtocolStream(new Response('data: {broken\n\n'),{},{protocol:'claude'}).text());
});
test('Claude malformed tool JSON is rejected before handoff',async()=>{await assert.rejects(run([start,{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'id',name:'lookup',input:{}}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{broken'}},close,delta('tool_use'),stop]).text());});
test('Claude server search blocks remain native and never become executable client calls',async()=>{
 const events=[start,{type:'content_block_start',index:0,content_block:{type:'server_tool_use',id:'srv',name:'web_search',input:{}}},{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"query":"benign"}'}},close,{type:'content_block_start',index:1,content_block:{type:'web_search_tool_result',tool_use_id:'srv',content:[{type:'web_search_result',url:'https://example.invalid/source',title:'Source'}]}},{type:'content_block_stop',index:1},{type:'content_block_start',index:2,content_block:{type:'text',text:'grounded'}},{type:'content_block_stop',index:2},delta('end_turn'),stop];
 const values=parse(await run(events).text());assert.deepEqual(values.map(v=>v.tisyaNativeFrame),events);assert.equal(values.flatMap(v=>v.choices[0].delta.tool_calls??[]).length,0);assert.equal(values.at(-1).choices[0].finish_reason,'stop');
});
test('Claude citation deltas stay native and do not duplicate body',async()=>{
 const citation={type:'web_search_result_location',url:'https://example.invalid/source',title:'Source',cited_text:'source text',encrypted_index:'opaque'};
 const events=[start,block,text,{type:'content_block_delta',index:0,delta:{type:'citations_delta',citation}},close,delta('end_turn'),stop];const values=parse(await run(events).text());assert.deepEqual(values.map(v=>v.tisyaNativeFrame),events);assert.equal(values.map(v=>v.choices[0].delta.content??'').join(''),'完整🙂');
});
test('Claude refuses unknown or malformed blocks and citations',async()=>{
 for(const bad of [{type:'unknown',text:'not silently lost'},{type:'redacted_thinking'},{type:'web_search_tool_result',content:[]},{type:'tool_use',id:'id',name:'x',input:[]}])await assert.rejects(run([start,{type:'content_block_start',index:0,content_block:bad},close,delta('end_turn'),stop]).text());
 await assert.rejects(run([start,block,{type:'content_block_delta',index:0,delta:{type:'citations_delta',citation:null}},close,delta('end_turn'),stop]).text());
 const status={};await assert.rejects(run([start,block,text,close,delta('pause_turn'),stop],status).text());assert.equal(status.incomplete,true);assert.equal(status.handoff,'pause-turn');
});

const coStart={type:'message-start',id:'cohere-id',delta:{message:{role:'assistant',content:[],tool_calls:[],citations:[]}}};
const coBlock={type:'content-start',index:0,delta:{message:{content:{type:'text',text:''}}}};
const coText={type:'content-delta',index:0,delta:{message:{content:{text:'Cohere正文🙂'}}}};
const coClose={type:'content-end',index:0};
const coEnd=reason=>({type:'message-end',delta:{finish_reason:reason,usage:{tokens:{input_tokens:2,output_tokens:3}}}});
const coRun=events=>guardNativeProtocolStream(response(events),{},{protocol:'cohere'});
test('Cohere v2 text and citations retain original frames and exact body',async()=>{
 const citation={start:0,end:6,text:'Cohere',sources:[{type:'document',id:'doc:1',document:{text:'source'}}]};
 const events=[coStart,coBlock,coText,{type:'citation-start',index:0,delta:{message:{citations:citation}}},{type:'citation-end',index:0},coClose,coEnd('COMPLETE')];
 const values=parse(await coRun(events).text());assert.deepEqual(values.map(v=>v.tisyaNativeFrame),events);assert.equal(values.map(v=>v.choices[0].delta.content??'').join(''),'Cohere正文🙂');let integrity;await guardCompletionStream(coRun(events),v=>{integrity=v;}).text();assert.equal(integrity.outcome,'complete');assert.equal(integrity.streamDone,true);
});
const coToolStart=(index,id)=>({type:'tool-call-start',index,delta:{message:{tool_calls:{id,type:'function',function:{name:'lookup',arguments:''}}}}});
const coToolDelta=(index,args)=>({type:'tool-call-delta',index,delta:{message:{tool_calls:{function:{arguments:args}}}}});
const coToolEnd=index=>({type:'tool-call-end',index});
test('Cohere v2 multiple real tools retain IDs and only project complete JSON',async()=>{
 const events=[coStart,{type:'tool-plan-delta',delta:{message:{tool_plan:'Checking'}}},coToolStart(0,'id0'),coToolDelta(0,'{"q":'),coToolDelta(0,'"one"}'),coToolEnd(0),coToolStart(1,'id1'),coToolDelta(1,'{"q":"two"}'),coToolEnd(1),coEnd('TOOL_CALL')];
 const values=parse(await coRun(events).text());assert.deepEqual(values.map(v=>v.tisyaNativeFrame),events);const calls=values.flatMap(v=>v.choices[0].delta.tool_calls??[]);assert.deepEqual(calls.map(c=>[c.id,JSON.parse(c.function.arguments)]),[['id0',{q:'one'}],['id1',{q:'two'}]]);let integrity;await guardCompletionStream(coRun(events),v=>{integrity=v;}).text();assert.equal(integrity.outcome,'tool_calls');
});
test('Cohere refuses truncated, missing, duplicate and postterminal messages',async()=>{
 const good=[coStart,coBlock,coText,coClose,coEnd('COMPLETE')];
 for(const events of [good.slice(0,-1),good.slice(1),[coStart,...good],[...good,coText],[...good,coEnd('COMPLETE')],[...good,'[DONE]',coText],[coStart,coBlock,coText,coEnd('COMPLETE')],[coStart,coText,coEnd('COMPLETE')],[coStart,coEnd('TOOL_CALL')]])await assert.rejects(coRun(events).text());
 for(const reason of ['MAX_TOKENS','ERROR','ERROR_LIMIT','TIMEOUT','UNKNOWN'])await assert.rejects(coRun([coStart,coBlock,coText,coClose,coEnd(reason)]).text());
});
test('Cohere refuses malformed calls and unclosed citations before handoff',async()=>{
 for(const events of [[coStart,coToolStart(0,'id'),coToolDelta(0,'{broken'),coToolEnd(0),coEnd('TOOL_CALL')],[coStart,coToolStart(0,'id'),coToolDelta(0,'{}'),coEnd('TOOL_CALL')],[coStart,coToolStart(0,'id'),coToolDelta(1,'{}'),coToolEnd(0),coEnd('TOOL_CALL')],[coStart,coToolStart(0,'id'),coToolDelta(0,'{}'),coToolEnd(0),coToolStart(1,'id'),coEnd('TOOL_CALL')],[coStart,coBlock,coText,{type:'citation-start',index:0,delta:{message:{citations:{start:0,end:1,text:'x',sources:[]}}}},coClose,coEnd('COMPLETE')]])await assert.rejects(coRun(events).text());
});
test('Cohere cancellation propagates upstream and unknown Bedrock dialect is blocked',async()=>{
 let cancelled=false;const r=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(evt(coStart)));},cancel(){cancelled=true;}}));const reader=guardNativeProtocolStream(r,{},{protocol:'cohere'}).body.getReader();await reader.read();await reader.cancel();for(let i=0;i<8;i++)await Promise.resolve();assert.equal(cancelled,true);assert.throws(()=>guardNativeProtocolStream(response([]),{},{protocol:'unknown'}),{code:'TISYA_TRANSPORT_NATIVE_UNSUPPORTED_PROTOCOL'});
});
test('production universal fetch returns original Claude and Cohere frames with completion gate',async()=>{
 for(const [source,events]of [['claude',good],['cohere',[coStart,coBlock,coText,coClose,coEnd('COMPLETE')]]]){
  let count=0;const target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async()=>{count++;return response(events);}};const t=createTextTransport({target});t.install();
  try{const p={chat_completion_source:source,model:'alias',stream:true,messages:[{role:'user',content:'benign'}]},r=t.prepare(p,'universal'),status=t.authorize(r.payload,r,{kind:'main'});assert.deepEqual(r.payload,p);const output=await target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(r.payload)});assert.deepEqual(parse(await output.text()),events);assert.equal(status.state,'complete');assert.equal(count,1);}finally{t.dispose();}
 }
});
test('production universal native truncation never completes or retries',async()=>{
 for(const [source,events]of [['claude',[start,block,text,close,delta('max_tokens'),stop]],['cohere',[coStart,coBlock,coText,coClose,coEnd('MAX_TOKENS')]]]){
  let count=0;const target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async()=>{count++;return response(events);}};const t=createTextTransport({target});t.install();
  try{const r=t.prepare({chat_completion_source:source,model:'alias',stream:true,messages:[{role:'user',content:'benign'}]},'universal'),status=t.authorize(r.payload,r,{kind:'main'});const output=await target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(r.payload)});const raw=await output.text();assert.match(raw,/error/);assert.equal(status.state,'error');assert.equal(count,1);}finally{t.dispose();}
 }
});
test('Claude cancellation cancels upstream without emitting successful finish',async()=>{
 let cancelled=false;const input=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(evt(start)));},cancel(){cancelled=true;}}));const reader=guardNativeProtocolStream(input,{},{protocol:'claude'}).body.getReader();const first=await reader.read();assert.ok(first.value);await reader.cancel('cancel');for(let i=0;i<8;i++)await Promise.resolve();assert.equal(cancelled,true);
});

test('buffered Claude native stop reason cannot be masked by normalized tool_calls',async()=>{
 for(const reason of ['max_tokens','model_context_window_exceeded','refusal','pause_turn']){
  let count=0;const value={choices:[{message:{role:'assistant',content:'partial',native:{claude:{stop_reason:reason}},tool_calls:[{id:'call',type:'function',function:{name:'lookup',arguments:'{}'}}]},finish_reason:'tool_calls'}]};
  const target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async()=>{count++;return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}};
  const t=createTextTransport({target});t.install();
  try{const r=t.prepare({chat_completion_source:'claude',model:'alias',stream:false,messages:[{role:'user',content:'benign'}]},'universal'),status=t.authorize(r.payload,r,{kind:'main'});await assert.rejects(target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(r.payload)}));assert.equal(status.state,'error');assert.equal(count,1);}finally{t.dispose();}
 }
});

async function bufferedCohere(value,check){
 let count=0;const target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async()=>{count++;return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}};const t=createTextTransport({target});t.install();
 try{const r=t.prepare({chat_completion_source:'cohere',model:'alias',stream:false,messages:[{role:'user',content:'benign'}]},'universal'),status=t.authorize(r.payload,r,{kind:'main'});await check(()=>target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(r.payload)}),status);assert.equal(count,1);}finally{t.dispose();}
}
test('buffered Cohere production fetch preserves raw body, citations and tool plan',async()=>{
 for(const finish_reason of ['COMPLETE','STOP_SEQUENCE']){
  const value={id:'cohere',message:{role:'assistant',content:[{type:'text',text:'完整🙂'}],tool_plan:'plan',citations:[{start:0,end:2,text:'完整',sources:[{id:'source',type:'document'}]}]},finish_reason,usage:{tokens:{input_tokens:1,output_tokens:2}}};
  await bufferedCohere(value,async(send,status)=>{assert.deepEqual(await(await send()).json(),value);assert.equal(status.state,'complete');assert.equal(status.delivery,'direct');assert.equal(status.nativeStopReason,finish_reason);});
 }
 const value={message:{role:'assistant',tool_plan:'visible plan'},finish_reason:'COMPLETE'};await bufferedCohere(value,async(send,status)=>{assert.deepEqual(await(await send()).json(),value);assert.equal(status.state,'complete');});
});
test('buffered Cohere real tools preserve original IDs and handoff only after JSON check',async()=>{
 const value={message:{role:'assistant',content:[],tool_calls:[{id:'stable-id',type:'function',function:{name:'lookup',arguments:'{"q":"benign"}'}}]},finish_reason:'TOOL_CALL',usage:{tokens:{output_tokens:3}}};
 await bufferedCohere(value,async(send,status)=>{assert.deepEqual(await(await send()).json(),value);assert.equal(status.state,'tool-handoff');assert.equal(status.toolTurn,true);});
});
test('buffered Cohere truncation, errors, bad tools and hidden text never complete or retry',async()=>{
 const message={role:'assistant',content:[{type:'text',text:'partial'}]};const tool={id:'id',type:'function',function:{name:'lookup',arguments:'{}'}};
 const cases=[...[undefined,'MAX_TOKENS','ERROR','ERROR_LIMIT','TIMEOUT','UNKNOWN'].map(finish_reason=>({message,finish_reason})),{message:{...message,tool_calls:[tool]},finish_reason:'MAX_TOKENS'},{message:{...message,tool_calls:[tool]},finish_reason:'COMPLETE'},{message,finish_reason:'TOOL_CALL'},{message:{role:'assistant',content:[{type:'text',text:''},{type:'text',text:'hidden later'}],tool_plan:'hidden plan'},finish_reason:'COMPLETE'},{message:{role:'assistant',content:[]},finish_reason:'COMPLETE'},...[['{broken'],['[]'],['{}','{}']].map(args=>({message:{role:'assistant',tool_calls:args.map(arguments_=>({...tool,function:{...tool.function,arguments:arguments_}}))},finish_reason:'TOOL_CALL'}))];
 for(const value of cases)await bufferedCohere(value,async(send,status)=>{await assert.rejects(send());assert.equal(status.state,'error');});
});
