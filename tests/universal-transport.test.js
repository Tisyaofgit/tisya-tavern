import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTextTransport,createTextTransport} from '../config/text-transport.js';

// Same offline fetch/SSE boundary as tool-text-mode.test.js; no provider calls.
const real={type:'function',function:{name:'lookup',parameters:{type:'object',properties:{q:{type:'string'}}}}};
const payload=(protocol='gemini',stream=false)=>({chat_completion_source:'custom',custom_api_format:protocol==='gemini'?'gemini_generate_content':'openai_compat',model:'alias',messages:[{role:'user',content:'Search and answer'}],tools:[real],stream,enable_web_search:false,custom_include_body:'',custom_exclude_body:''});
const evt=v=>'data: '+(typeof v==='string'?v:JSON.stringify(v))+'\n\n';
const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
const sse=v=>new Response(v,{headers:{'content-type':'text/event-stream'}});
const frames=raw=>raw.split('\n').filter(x=>x.startsWith('data: ')&&!x.includes('[DONE]')).map(x=>JSON.parse(x.slice(6)));
const grounding={webSearchQueries:['benign query'],groundingChunks:[{web:{uri:'https://example.invalid/source',title:'Source'}}]};
function setup(respond){
 let count=0;
 const target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async(_,init)=>{count++;const p=JSON.parse(init.body);return respond(p.tools?.at(-1)?.function?.name,p);}};
 const t=createTextTransport({target});t.install();
 async function run(p){const r=t.prepare(p,'universal'),status=t.authorize(r.payload,r,{kind:'main'});return {response:await target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(r.payload)}),status,r};}
 return {t,run,count:()=>count};
}

test('AT10 built-in search preserves the native request and still enables integrity protection',()=>{
 const p=payload();p.enable_web_search=true;p.custom_include_body=JSON.stringify({temperature:0.4,tools:[{googleSearch:{}}]});
 p.messages.push({role:'assistant',content:null,tool_calls:[{id:'real-id',type:'function',function:{name:'lookup',arguments:'{"q":"old"}'}}],native:{gemini:{content:{parts:[{functionCall:{name:'lookup',args:{q:'old'}},thoughtSignature:'history-signature'}]}}}},{role:'tool',tool_call_id:'real-id',content:'old result'});
 const original=structuredClone(p),r=prepareTextTransport(p,'universal');
 assert.deepEqual(p,original);assert.deepEqual(r.payload,original);
 assert.equal(r.plan.strategy,'native');assert.equal(r.plan.toolName,null);
 assert.equal(r.audit.protection,'native-completion');assert.equal(r.audit.searchRequested,true);assert.notEqual(r.audit.state,'bypassed');
});

test('AT10 search metadata and server calls survive synthetic native delivery without executable synthetic leaks',async()=>{
 for(const stream of [false,true]){
  let owned;
  const server=[{toolCall:{id:'server-1',toolType:'GOOGLE_SEARCH',args:{query:'benign query'}}},{toolResponse:{id:'server-1',toolType:'GOOGLE_SEARCH',response:{result:'source'}}}];
  const s=setup(name=>{owned=name;const c={index:0,content:{role:'model',parts:[...server,{functionCall:{name,args:{content:'完整正文🙂'}},thoughtSignature:'synthetic-signature'}]},groundingMetadata:grounding,finishReason:'STOP'};return stream?sse(evt({candidates:[c]})+evt('[DONE]')):json({candidates:[c]});});
  try{
   const a=await s.run(payload('gemini',stream));const value=stream?frames(await a.response.text()):[await a.response.json()];
   const serialized=JSON.stringify(value);assert.match(serialized,/webSearchQueries/);assert.match(serialized,/server-1/);assert.match(serialized,/toolResponse/);
   assert.doesNotMatch(serialized,new RegExp(owned));assert.doesNotMatch(serialized,/synthetic-signature/);
   const parts=value.flatMap(v=>[...(v.candidates??[]).flatMap(c=>c.content?.parts??[]),...(v.responseContent?.parts??[])]);
   const body=parts.filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
   assert.equal(body,'完整正文🙂');assert.equal(a.status.state,'complete');assert.equal(a.status.restored,true);assert.equal(s.count(),1);
  }finally{s.t.dispose();}
 }
});

test('AT10 real native tool handoff preserves grounding, signature and tool ID',async()=>{
 for(const stream of [false,true]){
  const c={index:0,content:{role:'model',parts:[{functionCall:{id:'real-id',name:'lookup',args:{q:'benign'}},thoughtSignature:'keep-signature'}]},groundingMetadata:grounding,finishReason:'STOP'};
  const s=setup(()=>stream?sse(evt({candidates:[c]})+evt('[DONE]')):json({candidates:[c]}));
  try{const a=await s.run(payload('gemini',stream));const text=await a.response.text();assert.match(text,/keep-signature/);assert.match(text,/real-id/);assert.match(text,/webSearchQueries/);assert.equal(a.status.state,'tool-handoff');assert.equal(s.count(),1);}finally{s.t.dispose();}
 }
});

test('AT10 synthetic buffered top content cannot shadow restored text',async()=>{
 const body='正文🙂\n尾';const s=setup(name=>json({content:[],choices:[{message:{role:'assistant',content:'',tool_calls:[{id:'owned',type:'function',function:{name,arguments:JSON.stringify({content:body})}}]},finish_reason:'tool_calls'}]}));
 try{const a=await s.run({...payload('openai'),enable_web_search:false});const value=await a.response.json();assert.equal(value.choices[0].message.content,body);assert.equal(value.content,undefined);assert.equal(value.choices[0].message.tool_calls,undefined);assert.equal(a.status.state,'complete');assert.equal(s.count(),1);}finally{s.t.dispose();}
});

test('AT10 universal accepts complete direct text without claiming wrapper restoration',async()=>{
 for(const protocol of ['gemini','openai'])for(const stream of [false,true]){
  const body='direct body';const s=setup(()=>protocol==='gemini'?(stream?sse(evt({candidates:[{content:{role:'model',parts:[{text:body}]},groundingMetadata:grounding,finishReason:'STOP'}]})+evt('[DONE]')):json({candidates:[{content:{role:'model',parts:[{text:body}]},groundingMetadata:grounding,finishReason:'STOP'}]})):(stream?sse(evt({choices:[{index:0,delta:{content:body}}]})+evt({choices:[{index:0,delta:{},finish_reason:'stop'}]})+evt('[DONE]')):json({choices:[{message:{role:'assistant',content:body},finish_reason:'stop'}]})));
  try{const a=await s.run(payload(protocol,stream));const text=await a.response.text();assert.match(text,/direct body/);assert.equal(a.status.state,'complete');assert.notEqual(a.status.restored,true);if(protocol==='gemini')assert.match(text,/webSearchQueries/);assert.equal(s.count(),1);}finally{s.t.dispose();}
 }
});

test('AT10 truncated universal responses never become complete and never retry',async()=>{
 for(const stream of [false,true])for(const reason of [null,'length','content_filter']){
  const s=setup(name=>{const message={role:'assistant',tool_calls:[{id:'owned',type:'function',function:{name,arguments:'{"content":"partial"}'}}]};return stream?sse(evt({choices:[{index:0,delta:message}]})+(reason?evt({choices:[{index:0,delta:{},finish_reason:reason}]}):'')+evt('[DONE]')):json({choices:[{message,finish_reason:reason}]});});
  try{let accepted=false;try{const a=await s.run({...payload('openai',stream),enable_web_search:false});await a.response.text();accepted=a.status.state==='complete';}catch{}assert.equal(accepted,false);assert.equal(s.count(),1);assert.equal(s.t.status().state,'error');}finally{s.t.dispose();}
 }
});

for(const where of ['independent','finish','after-finish'])test('AT10 streaming grounding survives '+where+' metadata frames',async()=>{
 let owned;const s=setup(name=>{owned=name;
  const first=evt({candidates:[{index:0,content:{role:'model',parts:[{functionCall:{name,args:{content:'grounded body'}}}]}}]});
  const meta=evt({candidates:[{index:0,groundingMetadata:grounding}]});
  const last=evt({candidates:[{index:0,finishReason:'STOP',...(where==='finish'?{groundingMetadata:grounding}:{})}]});
  return sse(first+(where==='independent'?meta:'')+last+(where==='after-finish'?meta:'')+evt('[DONE]'));
 });
 try{const a=await s.run(payload('gemini',true));const raw=await a.response.text();const values=frames(raw);assert.deepEqual(values.flatMap(v=>v.candidates??[]).find(c=>c.groundingMetadata)?.groundingMetadata,grounding);assert.doesNotMatch(raw,new RegExp(owned));assert.doesNotMatch(raw,/functionCall|synthetic-signature/);assert.equal(values.flatMap(v=>v.candidates??[]).flatMap(c=>c.content?.parts??[]).map(p=>p.text??'').join(''),'grounded body');assert.equal(a.status.state,'complete');assert.equal(s.count(),1);}finally{s.t.dispose();}
});

test('AT10 native partialArgs preserve Unicode, quotes and multiline body exactly',async()=>{
 const body='开始🙂\n"引号"\\尾', pieces=[body.slice(0,3),body.slice(3,4),body.slice(4)];let owned;
 const s=setup(name=>{owned=name;return sse(pieces.map((part,i)=>evt({candidates:[{index:0,content:{role:'model',parts:[{functionCall:{...(i===0?{name}:{}),partialArgs:[{jsonPath:'$.content',stringValue:part,...(i<2?{willContinue:true}:{})}],...(i<2?{willContinue:true}:{})}}]}}]})).join('')+evt({candidates:[{index:0,groundingMetadata:grounding,finishReason:'STOP'}]})+evt('[DONE]'));});
 try{const a=await s.run(payload('gemini',true));const raw=await a.response.text();const text=frames(raw).flatMap(v=>v.candidates??[]).flatMap(c=>c.content?.parts??[]).filter(p=>!p.thought).map(p=>p.text??'').join('');assert.equal(text,body);assert.doesNotMatch(raw,new RegExp(owned));assert.doesNotMatch(raw,/functionCall|partialArgs/);assert.equal(a.status.restored,true);assert.equal(a.status.state,'complete');assert.equal(s.count(),1);}finally{s.t.dispose();}
});

test('AT10 real streaming signature remains attached to the same native call part',async()=>{
 const signed={functionCall:{id:'signed-real-id',name:'lookup',args:{q:'benign',nested:{a:1}}},thoughtSignature:'opaque-real-signature'};
 const s=setup(()=>sse(evt({candidates:[{index:0,content:{role:'model',parts:[signed]}}]})+evt({candidates:[{index:0,groundingMetadata:grounding,finishReason:'STOP'}]})+evt('[DONE]')));
 try{const a=await s.run(payload('gemini',true));const values=frames(await a.response.text());const part=values.flatMap(v=>v.candidates??[]).flatMap(c=>c.content?.parts??[]).find(p=>p.functionCall);assert.deepEqual(part,signed);assert.equal(a.status.state,'tool-handoff');assert.notEqual(a.status.restored,true);assert.equal(s.count(),1);}finally{s.t.dispose();}
});

test('AT10 cancellation during buffered native tool stream cannot complete or retry',async()=>{
 let cancelled=false;const s=setup(name=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(evt({candidates:[{content:{role:'model',parts:[{functionCall:{name,partialArgs:[{jsonPath:'$.content',stringValue:'partial',willContinue:true}],willContinue:true}}]}}]})));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}}));
 try{const running=s.run(payload('gemini',true));for(let i=0;i<8;i++)await Promise.resolve();assert.equal(s.count(),1);s.t.invalidate('main','test cancellation');await assert.rejects(running);assert.equal(s.t.status().state,'cancelled');assert.equal(cancelled,true);assert.equal(s.count(),1);}finally{s.t.dispose();}
});

test('AT10 native media strategy preserves request_images, search and explicit native tools',()=>{
 const p=payload();p.enable_web_search=true;p.request_images=true;p.custom_include_body=JSON.stringify({tools:[{googleSearch:{}}],generationConfig:{responseModalities:['TEXT','IMAGE']}});const original=structuredClone(p),r=prepareTextTransport(p,'universal');assert.deepEqual(p,original);assert.deepEqual(r.payload,original);assert.equal(r.plan.strategy,'native');assert.equal(r.plan.toolName,null);assert.equal(r.plan.allowImages,true);assert.equal(r.audit.protection,'native-completion');assert.equal(r.audit.searchRequested,true);
});

test('AT10 nonempty host shadow text is rejected rather than silently overwritten',async()=>{
 const s=setup(name=>json({content:[{type:'text',text:'outside body'}],choices:[{message:{role:'assistant',tool_calls:[{id:'owned',type:'function',function:{name,arguments:'{"content":"inside body"}'}}]},finish_reason:'tool_calls'}]}));
 try{await assert.rejects(s.run({...payload('openai'),enable_web_search:false}));assert.equal(s.t.status().state,'error');assert.equal(s.count(),1);}finally{s.t.dispose();}
});

for(const stream of [false,true])test('AT10 builtin search direct answer and provenance survive '+(stream?'stream':'buffered'),async()=>{
 const parts=[{toolCall:{id:'search',toolType:'GOOGLE_SEARCH',args:{query:'fixture'}}},{toolResponse:{id:'search',toolType:'GOOGLE_SEARCH',response:{result:'fixture'}}},{text:'搜索正文'}];
 const s=setup(()=>{const v={candidates:[{content:{role:'model',parts},groundingMetadata:grounding,finishReason:'STOP'}]};return stream?sse(evt(v)+evt('[DONE]')):json(v);});
 try{const a=await s.run({...payload('gemini',stream),enable_web_search:true});const raw=await a.response.text();assert.match(raw,/搜索正文/);assert.match(raw,/webSearchQueries/);assert.match(raw,/toolResponse/);assert.equal(a.status.state,'complete');assert.notEqual(a.status.restored,true);assert.equal(a.status.delivery,'direct');assert.equal(s.count(),1);}finally{s.t.dispose();}
});
