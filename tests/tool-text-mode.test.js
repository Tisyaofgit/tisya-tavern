import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTextTransport,createTextTransport,TRANSPORT_MODES} from '../config/text-transport.js';
import {readTaskResponse} from '../config/stream-response.js';
import {transportSummary} from '../config/context-export.js';
import {emptyConfig,validateConfig} from '../config/core.js';
const mode='tool-text-tools',real={type:'function',function:{name:'lookup',description:'Read only',parameters:{type:'object',properties:{q:{type:'string'}},required:['q']}}};
const payload=(protocol='openai',stream=false)=>({chat_completion_source:'custom',custom_api_format:protocol==='gemini'?'gemini_generate_content':'openai_compat',model:'alias',messages:[{role:'user',content:'Give a short answer'}],tools:[real],stream,custom_include_body:'',custom_exclude_body:''});
const evt=v=>'data: '+(typeof v==='string'?v:JSON.stringify(v))+'\n\n';
const chunk=d=>evt({choices:[{index:0,delta:d}]});
const end=(reason='stop')=>evt({choices:[{index:0,delta:{},finish_reason:reason}]})+evt('[DONE]');
const native=(parts,finishReason)=>evt({candidates:[{index:0,content:{role:'model',parts},...(finishReason?{finishReason}:{})}]});
const tool=(name,args={q:'benign'})=>({id:'stable-id',type:'function',function:{name,arguments:JSON.stringify(args)}});
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
const sse=v=>new Response(v,{headers:{'content-type':'text/event-stream'}});
function setup(respond){
 let count=0;const target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async(_,init)=>{count++;const p=JSON.parse(init.body);return respond(p.tools.at(-1).function.name,p);}};
 const t=createTextTransport({target});t.install();
 async function run(p,kind='main',signal){const r=t.prepare(p,mode),status=t.authorize(r.payload,r,{kind});return {response:await target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(r.payload),signal}),status,r};}
 return {t,run,count:()=>count};
}

test('AT09 explicit mode adds one final-delivery function without losing real declarations/history/inputs',()=>{
 const history=[{role:'assistant',content:null,tool_calls:[tool('lookup')],native:{gemini:{content:{parts:[{functionCall:{name:'lookup',args:{q:'benign'}},thoughtSignature:'sig'}]}}}},{role:'tool',tool_call_id:'stable-id',content:'result'}];
 for(const protocol of ['openai','gemini']){
  const p=payload(protocol,true);p.messages.push(...history);p.parallel_tool_calls=true;p.custom_include_body='{"temperature":0.4}';const before=structuredClone(p),r=prepareTextTransport(p,mode);
  assert.deepEqual(p,before);assert.deepEqual(r.payload.messages.slice(0,-1),before.messages);assert.deepEqual(r.payload.tools.slice(0,-1),before.tools);assert.equal(r.payload.parallel_tool_calls,true);assert.equal(r.payload.tool_choice,'required');assert.equal(r.payload.custom_include_body,p.custom_include_body);assert.equal(r.payload.stream,true);assert.equal(r.plan.id,r.plan.toolName);assert.equal(r.audit.protection,mode);assert.equal(r.payload.max_tokens,undefined);assert.equal(r.payload.max_completion_tokens,undefined);
 }
 const d=emptyConfig();d.routes.global.transport=mode;assert.equal(validateConfig(d),d);assert.ok(TRANSPORT_MODES.some(([id])=>id==='universal'));
});

test('AT09 explicit conflicts fail without mutation or silent bypass',()=>{
 for(const patch of [{enable_web_search:true},{request_images:true},{tool_choice:'none'},{tools:[{googleSearch:{}}]},{functions:[{}]},{custom_include_body:'{"tools":[]}'},{response_format:{type:'json_object'}},{custom_api_format:'openai_responses'},{custom_exclude_body:'tools'},{n:2}]){
  const p={...payload(),...patch},before=structuredClone(p);assert.throws(()=>prepareTextTransport(p,mode),/正文工具包装/);assert.deepEqual(p,before);
 }
 const p=payload();p.tool_choice={type:'function',function:{name:'lookup'}};assert.deepEqual(prepareTextTransport(p,mode).payload.tool_choice,p.tool_choice);
 const only=payload();only.tools=[];only.type='continue';const r=prepareTextTransport(only,mode);assert.equal(r.payload.tool_choice.function.name,r.plan.toolName);assert.match(r.payload.messages.at(-1).content,/only the new continuation text/);
});

test('AT09 buffered real rounds preserve complete envelopes and final rounds restore exact body',async()=>{
 for(const protocol of ['openai','gemini']){
  let original;
  const s=setup((name,p)=>{
   if(!p.messages.some(m=>m.role==='tool')){original={choices:[{index:0,message:{role:'assistant',content:'',tool_calls:[tool('lookup')],native:{gemini:{content:{parts:[{functionCall:{name:'lookup',args:{q:'benign'}},thoughtSignature:'keep'}]}}}},finish_reason:'stop'}],responseContent:{role:'model',parts:[{functionCall:{name:'lookup',args:{q:'benign'}},thoughtSignature:'keep'}]},usage:{total_tokens:5}};return json(original);}
   return json({content:[],choices:[{message:{role:'assistant',content:null,tool_calls:[tool(name,{content:'<reply>完整🙂\n"引号"\\</reply>'})],native:{gemini:{content:{parts:[{functionCall:{name,args:{content:'not persist'}}}]}}}},finish_reason:'tool_calls'}]});
  });
  const p=payload(protocol);const a=await s.run(p);assert.deepEqual(await a.response.json(),original);assert.equal(a.status.state,'tool-handoff');assert.match(transportSummary(a.status),/最终正文仍须/);
  p.messages.push(original.choices[0].message,{role:'tool',tool_call_id:'stable-id',content:'answer source'});
  const b=await s.run(p),v=await b.response.json();assert.equal(v.choices[0].message.content,'<reply>完整🙂\n"引号"\\</reply>');assert.equal(v.choices[0].message.tool_calls,undefined);assert.equal(v.choices[0].message.native,undefined);assert.equal(v.content,undefined);assert.equal(b.status.restored,true);assert.equal(b.status.state,'complete');assert.match(transportSummary(b.status),/正文抗截断已生效/);assert.equal(s.count(),2);s.t.dispose();
 }
});

test('AT09 native buffered synthetic body is restored and real signed calls stay native',async()=>{
 for(const selected of ['real','synthetic']){
  let original;const s=setup(name=>json(original={candidates:[{content:{role:'model',parts:[{functionCall:{id:'native-id',name:selected==='real'?'lookup':name,args:selected==='real'?{q:'ok'}:{content:'native body'}},thoughtSignature:'native-signature'}]},finishReason:'STOP'}],usageMetadata:{totalTokenCount:8}}));
  const a=await s.run(payload('gemini'));const value=await a.response.json();if(selected==='real'){assert.deepEqual(value,original);assert.equal(a.status.state,'tool-handoff');}else{assert.equal(value.choices[0].message.content,'native body');assert.deepEqual(value.responseContent.parts,[{text:'native body'}]);assert.equal(a.status.restored,true);}s.t.dispose();
 }
});

test('AT09 streaming final bodies restore OpenAI split arguments and native full/partial arguments',async()=>{
 for(const protocol of ['openai','gemini'])for(const partial of [false,true]){
  const body='完整🙂\n"引号"\\尾';const s=setup(name=>{
   if(protocol==='openai'){
    const args=JSON.stringify({content:body});return sse(chunk({tool_calls:[{index:0,id:'synthetic',type:'function',function:{name,arguments:partial?'':args}}]})+(partial?[...args].map(c=>chunk({tool_calls:[{index:0,function:{arguments:c}}]})).join(''):'')+chunk({native:{opaque:'synthetic-copy'}})+end('tool_calls'));
   }
   return sse(partial?native([{functionCall:{name,partialArgs:[{jsonPath:'$.content',stringValue:body.slice(0,4),willContinue:true}],willContinue:true}}])+native([{functionCall:{partialArgs:[{jsonPath:'$.content',stringValue:body.slice(4)}]}}],'STOP')+evt('[DONE]'):native([{functionCall:{name,args:{content:body}},thoughtSignature:'synthetic-signature'}],'STOP')+evt('[DONE]'));
  });
  const a=await s.run(payload(protocol,true));const raw=await a.response.text();assert.doesNotMatch(raw,/functionCall|tool_calls|synthetic-copy|synthetic-signature/);const parsed=protocol==='gemini'?raw.split('\n').filter(x=>x.startsWith('data: ')&&!x.includes('[DONE]')).flatMap(x=>JSON.parse(x.slice(6)).candidates??[]).flatMap(c=>c.content?.parts??[]).filter(p=>!p.thought).map(p=>p.text??'').join(''):await readTaskResponse(sse(raw));assert.equal(parsed,body);assert.equal(a.status.state,'complete');assert.equal(a.status.restored,true);assert.equal(a.status.bufferedToolStream,true);assert.equal(s.count(),1);s.t.dispose();
 }
});

test('AT09 streaming real calls retain native signatures and stable OpenAI IDs',async()=>{
 for(const protocol of ['openai','gemini']){
  const wire=protocol==='gemini'?native([{functionCall:{name:'lookup',id:'stable-id',args:{q:'benign'}},thoughtSignature:'keep'}],'STOP')+evt({choices:[{delta:{native:{gemini:{opaque:'keep-tail'}}}}]})+evt('[DONE]'):chunk({tool_calls:[{index:0,...tool('lookup')}]})+end('tool_calls');
  const s=setup(()=>sse(wire)),a=await s.run(payload(protocol,true));const raw=await a.response.text();assert.match(raw,/stable-id/);if(protocol==='gemini'){assert.match(raw,/thoughtSignature/);assert.match(raw,/keep-tail/);}assert.equal(a.status.state,'tool-handoff');assert.notEqual(a.status.restored,true);assert.equal(s.count(),1);s.t.dispose();
 }
});

test('AT09 refuses unwrapped, mixed, unknown, malformed and truncated final responses',async()=>{
 for(const stream of [false,true])for(const kind of ['plain','mixed','unknown','bad-json','length','missing','outside']){
  const s=setup(name=>{
   const calls=kind==='plain'?[]:kind==='mixed'?[tool(name,{content:'body'}),tool('lookup')]:[tool(kind==='unknown'?'unregistered':name,{content:'body'})];
   if(kind==='bad-json')calls[0].function.arguments='{"content":"broken';
   const content=kind==='plain'||kind==='outside'?'outside':'';const finish=kind==='length'?'length':kind==='missing'?null:calls.length?'tool_calls':'stop';
   return stream?sse(chunk({content,tool_calls:calls.map((c,index)=>({...c,index}))})+(finish?end(finish):evt('[DONE]'))):json({choices:[{message:{role:'assistant',content,...(calls.length?{tool_calls:calls}:{})},finish_reason:finish}]});
  });
  let error=false;try{const a=await s.run(payload('openai',stream));const text=await a.response.text();error=a.status.state==='error';assert.match(text,/error/);}catch{error=true;}
  assert.equal(error,true,kind+' stream='+stream);assert.equal(s.t.status().state,'error');assert.equal(s.count(),1);s.t.dispose();
 }
});

test('AT09 true tool responses remain forbidden to auxiliary text consumers',async()=>{
 const s=setup(()=>json({choices:[{message:{role:'assistant',tool_calls:[tool('lookup')]},finish_reason:'tool_calls'}]}));await assert.rejects(s.run(payload(),'auxiliary'));assert.equal(s.t.status().state,'error');s.t.dispose();
});

test('AT09 buffered stream collection remains cancellable with no retry',async()=>{
 const s=setup(()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(chunk({reasoning_content:'wait'})));}}),{headers:{'content-type':'text/event-stream'}}));const c=new AbortController(),pending=s.run(payload('openai',true),'main',c.signal);setTimeout(()=>c.abort(new DOMException('cancelled','AbortError')),10);await assert.rejects(pending);assert.equal(s.count(),1);assert.equal(s.t.status().state,'cancelled');s.t.dispose();
});

test('AT09 sandbox rejects public text in shadow fields before restoring synthetic output',async()=>{
 for(const protocol of ['openai','gemini'])for(const carrier of ['content','text','choice','native']){
  const s=setup(name=>{const v={choices:[{index:0,message:{role:'assistant',content:'',tool_calls:[tool(name,{content:'inside'})]},finish_reason:'tool_calls'}]};
   if(carrier==='content')v.content=[{type:'text',text:'outside'}];
   if(carrier==='text')v.text='outside';
   if(carrier==='choice')v.choices[0].text='outside';
   if(carrier==='native')v.responseContent={parts:[{functionCall:{name,args:{content:'inside'}}},{text:'outside'}]};
   return json(v);
  });
  await assert.rejects(s.run(payload(protocol)),/正文传输失败/);assert.equal(s.t.status().state,'error');assert.equal(s.count(),1);s.t.dispose();
 }
});

test('AT09 sandbox rejects streaming text arrays beside synthetic arguments',async()=>{
 const s=setup(name=>sse(chunk({content:[{type:'text',text:'outside'}],tool_calls:[{index:0,...tool(name,{content:'inside'})}]})+end('tool_calls')));
 await assert.rejects(s.run(payload('openai',true)),/正文同时出现在工具内外/);assert.equal(s.t.status().state,'error');assert.equal(s.count(),1);s.t.dispose();
});

test('AT09 sandbox checks the native calls the host actually executes including arguments and IDs',async()=>{
 for(const protocol of ['openai','gemini'])for(const mismatch of ['unknown','args','empty','id']){
  const s=setup(()=>json({choices:[{index:0,message:{role:'assistant',content:'',tool_calls:[tool('lookup',{q:'safe'})]},finish_reason:'tool_calls'}],responseContent:{parts:mismatch==='empty'?[]:[{functionCall:{name:mismatch==='unknown'?'undeclared_tool':'lookup',id:mismatch==='id'?'different':'stable-id',args:{q:mismatch==='args'?'different':'safe'}}}]}}));
  await assert.rejects(s.run(payload(protocol)));assert.equal(s.t.status().state,'error');assert.equal(s.count(),1);s.t.dispose();
 }
});

test('AT09 sandbox accepts equivalent native argument objects without changing signed history',async()=>{
 let original;const s=setup(()=>json(original={choices:[{index:0,message:{role:'assistant',content:'',tool_calls:[tool('lookup',{q:'safe',options:{a:1,b:2}})]},finish_reason:'tool_calls'}],responseContent:{parts:[{functionCall:{name:'lookup',args:{options:{b:2,a:1},q:'safe'}},thoughtSignature:'preserve'}]}}));
 const a=await s.run(payload('gemini'));assert.deepEqual(await a.response.json(),original);assert.equal(a.status.state,'tool-handoff');assert.equal(s.count(),1);s.t.dispose();
});

test('AT09 sandbox rejects media in shadow carriers rather than dropping it',async()=>{
 for(const carrier of ['content','native']){
  const s=setup(name=>json({choices:[{index:0,message:{content:'',tool_calls:[tool(name,{content:'inside'})]},finish_reason:'tool_calls'}],...(carrier==='content'?{content:[{type:'image_url',image_url:{url:'data:image/png;base64,aA=='}}]}:{responseContent:{parts:[{functionCall:{name,args:{content:'inside'}}},{inlineData:{mimeType:'image/png',data:'aA=='}}]}})}));
  await assert.rejects(s.run(payload('gemini')),/非文字输出/);assert.equal(s.t.status().state,'error');s.t.dispose();
 }
});
