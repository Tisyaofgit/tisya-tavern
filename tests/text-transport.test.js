import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {prepareTextTransport,createTextTransport} from '../config/text-transport.js';
import {readTaskResponse} from '../config/stream-response.js';
import {createHost,sealPayload} from '../config/host.js';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore,resolveRoute,validateConfig} from '../config/core.js';
import {mountConfiguration} from '../config/panel.js';

const event=v=>`data: ${typeof v==='string'?v:JSON.stringify(v)}\n\n`;
const google=c=>event({candidates:[c],modelVersion:'gemini-3.7-flash',responseId:'fixture'});
const call=fn=>google({content:{role:'model',parts:[{functionCall:fn}]}});
const end=(reason='STOP')=>google({finishReason:reason})+event('[DONE]');
const request=patch=>({chat_completion_source:'custom',custom_api_format:'gemini_generate_content',model:'gemini-3.7-flash',type:'normal',stream:true,messages:[{role:'user',content:'你好'}],custom_include_body:'',custom_exclude_body:'',...patch});
function setup(respond,options={}){
 const calls=[],target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async(input,init)=>{const body=typeof init?.body==='string'?JSON.parse(init.body):await input.clone().json();calls.push({body,init,input});const name=body.tools?.[0]?.function?.name??(body.custom_include_body?JSON.parse(body.custom_include_body).tools?.[0]?.functionDeclarations?.[0]?.name:null);return respond(name,body,init,calls);}};
 const transport=createTextTransport({target,...options});transport.install();
 function arm(p=request(),kind='auxiliary',guard=()=>{}){const result=transport.prepare(p,'tool-text'),wire=result.payload;sealPayload(wire);const status=transport.authorize(wire,result,{kind,guard});return {wire,result,status};}
 const send=(p,extra={})=>target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(p),...extra});
 return {calls,target,transport,arm,send};
}
const valid=(name,body)=>body.stream?new Response(call({name,args:{content:'完整🙂\n"引号"\\'}})+end(),{headers:{'content-type':'text/event-stream'}}):new Response(JSON.stringify({choices:[{index:0,message:{role:'assistant',tool_calls:[{type:'function',function:{name,arguments:JSON.stringify({content:'完整🙂\n"引号"\\'})}}]},finish_reason:'tool_calls'}]}),{headers:{'content-type':'application/json'}});
const readFrames=async response=>(await response.text()).split('\n').filter(x=>x.startsWith('data: ')&&!x.includes('[DONE]')).map(x=>JSON.parse(x.slice(6)));

const openai=patch=>request({chat_completion_source:'custom',custom_api_format:'openai_compat',model:'model-alias',...patch});
const jsonResponse=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const chatChunk=delta=>event({choices:[{index:0,delta}]});
const chatEnd=(reason='stop')=>event({choices:[{index:0,delta:{},finish_reason:reason}]})+event('[DONE]');

test('Vertex is retired without changing saved settings; supported protocols do not depend on model aliases',()=>{
 const old=request({chat_completion_source:'vertexai'});
 assert.equal(prepareTextTransport(old,'vertex-streaming').audit.reason,'retired');
 assert.equal(prepareTextTransport(old,'tool-text').audit.reason,'provider');
 for(const p of [openai(),openai({chat_completion_source:'openai'}),request({model:'provider-model-alias'})]){
  for(const stream of [false,true]){p.stream=stream;const r=prepareTextTransport(p,'tool-text');assert.ok(r.plan);assert.equal(r.payload.stream,stream);assert.equal(r.audit.upstreamStream,stream);assert.doesNotMatch(JSON.stringify(r.payload),/streamFunctionCallArguments/);}
 }
 for(const custom_api_format of ['openai_responses','gemini_interactions','claude_messages'])assert.equal(prepareTextTransport(request({custom_api_format}),'tool-text').audit.reason,'provider');
 for(const extra of [{tools:[]},{stream:false},{tool_choice:'none'},{generationConfig:{candidateCount:2}}])assert.equal(prepareTextTransport(request({custom_include_body:JSON.stringify(extra)}),'tool-text').audit.reason,'parameters');
 const p=openai(),copy=structuredClone(p),r=prepareTextTransport(p,'verify');assert.deepEqual(r.payload,copy);assert.equal(r.plan.toolName,null);assert.deepEqual(p,copy);
 const d=emptyConfig();d.routes.global.transport='vertex-streaming';assert.equal(validateConfig(d),d);assert.equal(d.routes.global.transport,'vertex-streaming');
});

test('OpenAI tool text restores JSON and incremental arguments through one original request',async()=>{
 for(const source of ['openai','custom'])for(const stream of [true,false])for(const kind of ['main','auxiliary']){
  const content='正文🙂\n"引号"\\尾',s=setup((name,body)=>{
   assert.equal(body.tools[0].function.name,name);assert.equal(body.tool_choice.function.name,name);assert.equal(body.parallel_tool_calls,false);
   const args=JSON.stringify({content});
   if(!body.stream)return jsonResponse({choices:[{index:0,message:{role:'assistant',tool_calls:[{id:'one',type:'function',function:{name,arguments:args}}]},finish_reason:'tool_calls'}]});
   return new Response(chatChunk({tool_calls:[{index:0,id:'one',type:'function',function:{name,arguments:''}}]})+[...args].map(x=>chatChunk({tool_calls:[{index:0,function:{arguments:x}}]})).join('')+chatEnd('tool_calls'),{headers:{'content-type':'text/event-stream'}});
  });
  const a=s.arm(openai({chat_completion_source:source,stream}),kind);assert.equal(await readTaskResponse(await s.send(a.wire)),content);assert.equal(s.calls.length,1);assert.equal(a.status.restored,true);assert.equal(a.status.state,'complete');assert.ok(a.status.receivedBytes>0);s.transport.dispose();
 }
});

test('check-only Gemini preserves native metadata and never accepts missing/length/error endings',async()=>{
 for(const mode of ['good','missing','length','error','after-done']){
  const original={candidates:[{index:0,content:{role:'model',parts:[{text:'原文',thoughtSignature:'keep-signature'}]}}]};
  const tail=mode==='good'?end():mode==='missing'?event('[DONE]'):mode==='length'?end('MAX_TOKENS'):mode==='after-done'?end()+event({usageMetadata:{totalTokenCount:2}}):event({error:{code:503,message:'cpu overloaded'}});
  const s=setup(()=>new Response(event(original)+tail,{headers:{'content-type':'text/event-stream'}}));
  const p=request(),r=s.transport.prepare(p,'verify');sealPayload(r.payload);const status=s.transport.authorize(r.payload,r,{kind:'main'}),text=await (await s.send(r.payload)).text();
  assert.match(text,/keep-signature/);assert.equal(s.calls.length,1);assert.equal(s.calls[0].body.custom_include_body,'');
  if(mode==='good'){assert.equal(status.state,'complete');assert.match(text,/STOP/);}else{assert.equal(status.state,'error');assert.match(text,/"error"/);assert.doesNotMatch(text,/"finishReason":"STOP"/);}
  s.transport.dispose();
 }
});

test('OpenAI check-only requires finish reason plus DONE and rejects corrupt late tails',async()=>{
 for(const ending of [chatEnd(),event('[DONE]'),chatEnd('length'),chatEnd()+'data: {bad\n\n',chatEnd()+chatChunk({content:'late'})]){
  const s=setup(()=>new Response(chatChunk({content:'部分'})+ending,{headers:{'content-type':'text/event-stream'}}));
  const r=s.transport.prepare(openai(),'verify');sealPayload(r.payload);const status=s.transport.authorize(r.payload,r,{kind:'main'});const text=await (await s.send(r.payload)).text();
  assert.equal(status.state,ending===chatEnd()?'complete':'error');if(status.state==='error')assert.doesNotMatch(text,/"finish_reason":"stop"/);assert.equal(s.calls.length,1);
  s.transport.dispose();
 }
});

test('Gemini raw buffered metadata and host projection remain distinguishable; synthetic native tools are removed',async()=>{
 for(const hostProjection of [false,true]){
  const s=setup(name=>{
   const parts=[{functionCall:{name,args:{content:'完整'}}}],native={gemini:{content:{role:'model',parts}}};
   return jsonResponse(hostProjection?{choices:[{message:{role:'assistant',content:'',native,tool_calls:[{function:{name,arguments:'{"content":"完整"}'}}]},finish_reason:'tool_calls'}],responseContent:{parts}}:{candidates:[{content:{role:'model',parts},finishReason:'STOP'}]});
  });
  const a=s.arm(request({stream:false}),'main'),body=await (await s.send(a.wire)).json();assert.equal(body.choices[0].message.content,'完整');assert.equal(body.choices[0].message.native,undefined);assert.equal(body.choices[0].message.tool_calls,undefined);assert.equal(body.responseContent.parts[0].text,'完整');assert.equal(a.status.completionEvidence,hostProjection?'host-normalized':'native');assert.equal(s.calls.length,1);s.transport.dispose();
 }
});

test('ignored tool declaration, HTTP 503, broken UTF8 and buffered cancellation cannot look successful',async()=>{
 for(const mode of ['ignored','503','utf8','cancel']){
  let cancelled=0;const s=setup(()=>mode==='503'?new Response('cpu overloaded',{status:503}):mode==='ignored'?jsonResponse({choices:[{message:{content:'普通文本'},finish_reason:'stop'}]}):new Response(new ReadableStream({start(c){if(mode==='utf8'){c.enqueue(new Uint8Array([0xff]));c.close();}},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}}));
  const a=s.arm(openai({stream:false})),controller=new AbortController(),job=s.send(a.wire,{signal:controller.signal});
  if(mode==='cancel')setTimeout(()=>controller.abort(),10);
  if(mode==='503'){assert.equal((await job).status,503);assert.equal(a.status.httpStatus,503);}else await assert.rejects(job);
  assert.notEqual(a.status.state,'complete');assert.equal(s.calls.length,1);if(mode==='cancel')assert.ok(cancelled>0);s.transport.dispose();
 }
});

test('production host visibly reports stream failure and guards same-provider endpoint/format changes',async()=>{
 const errors=[],f=fixture(e=>errors.push(e));
 // The normal fixture response is complete; invalidate the exact captured endpoint before dispatch.
 await f.host.before('normal');let p=request();await f.host.payloadReady(p);f.c.chatCompletionSettings.custom_url='https://changed.invalid';await assert.rejects(f.send(p),/连接已变化/);assert.equal(f.calls.length,0);assert.equal(f.host.generationAccepted(),false);
 assert.equal(errors.length,1);f.transport.dispose();
});

test('default-off and unsupported requests keep exact input; routes inherit with explicit off',()=>{
 const p=request();assert.equal(prepareTextTransport(p,'off').payload,p);
 for(const [patch,reason]of [[{chat_completion_source:'custom',custom_api_format:'openai_responses'},'provider'],[{reverse_proxy:'https://invalid.test'},'proxy'],[{tools:[{name:'read_archive'}]},'tools'],[{tool_choice:'none'},'tools'],[{messages:[{role:'tool',content:'资料'}]},'history'],[{json_schema:{type:'object'}},'schema'],[{n:2},'candidates'],[{enable_web_search:true},'search'],[{messages:[{role:'user',content:[{type:'unknown',value:'unsupported'}]}]},'media'],[{custom_include_body:'tools: []'},'parameters'],[{custom_include_body:'{"toolConfig":{}}'},'parameters'],[{custom_exclude_body:'tools'},'parameters']]){
  const body=request(patch),before=JSON.stringify(body),r=prepareTextTransport(body,'tool-text');assert.equal(r.audit.reason,reason);assert.equal(r.payload,body);assert.equal(JSON.stringify(body),before);
 }
 const d=emptyConfig(),w=defaultWorld();d.routes.global.transport='tool-text';w.modes.narrative.routes.summary={transport:'off'};
 assert.equal(resolveRoute(d,w,'main').transport,'tool-text');assert.equal(resolveRoute(d,w,'summary').transport,'off');d.routes.global.transport='bad';assert.throws(()=>validateConfig(d),/抗截断/);
});

test('native main, OpenAI auxiliary, and buffered replies preserve exact text with one upstream call',async()=>{
 for(const [kind,stream]of [['main',true],['auxiliary',true],['main',false],['auxiliary',false]]){
  const s=setup(valid),original=request({stream,type:'continue'}),copy=structuredClone(original),a=s.arm(original,kind);
  assert.deepEqual(original,copy);assert.equal(a.wire.stream,stream);assert.equal(a.result.audit.continuation,true);assert.match(a.wire.messages.at(-1).content,/only the new continuation text/);
  const response=await s.send(a.wire);
  if(kind==='main'&&stream){const frames=await readFrames(response);assert.equal(frames.flatMap(x=>x.candidates??[]).flatMap(c=>c.content?.parts??[]).map(p=>p.text??'').join(''),'完整🙂\n"引号"\\');assert.ok(frames.some(x=>x.candidates?.some(c=>c.finishReason==='STOP')));}
  else assert.equal(await readTaskResponse(response),'完整🙂\n"引号"\\');
  assert.equal(s.calls.length,1);assert.equal(a.status.state,'complete');assert.equal(a.status.restored,true);assert.equal(a.status.upstreamRequests,1);s.transport.dispose();
 }
});

test('first content arrives before upstream closes; terminal is withheld until upstream validation',async()=>{
 let upstream,opened;const ready=new Promise(r=>opened=r),s=setup(name=>{opened(name);return new Response(new ReadableStream({start(c){upstream=c;c.enqueue(new TextEncoder().encode(call({name,willContinue:true})+call({partialArgs:[{jsonPath:'$.content',stringValue:'首段',willContinue:true}],willContinue:true})));}}),{headers:{'content-type':'text/event-stream'}});});
 const a=s.arm(),response=await s.send(a.wire);await ready;const reader=response.body.getReader();let text='';
 while(!text.includes('首段'))text+=new TextDecoder().decode((await reader.read()).value);
 assert.equal(a.status.state,'receiving');assert.doesNotMatch(text,/finish_reason":"stop/);
 upstream.enqueue(new TextEncoder().encode(call({partialArgs:[{jsonPath:'$.content',stringValue:'末段',willContinue:false}],willContinue:false})+end()));upstream.close();
 for(;;){const r=await reader.read();if(r.done)break;text+=new TextDecoder().decode(r.value);}
 assert.match(text,/末段/);assert.match(text,/"finish_reason":"stop"/);assert.equal(a.status.state,'complete');assert.equal(s.calls.length,1);s.transport.dispose();
});

test('limits, malformed endings, native host error text and HTTP failure never retry or become accepted',async()=>{
 for(const stream of [true,false])for(const mode of ['length','broken','host-error','http']){
  const s=setup(name=>mode==='http'?new Response('{"error":"quota"}',{status:429}):new Response(mode==='host-error'?event({candidates:[{index:0,content:{parts:[{text:'[API Error] HTTP 401'}]}}]})+event('[DONE]'):call({name,args:{content:'不完整'}})+(mode==='length'?end('MAX_TOKENS'):event('[DONE]')),{headers:{'content-type':'text/event-stream'}}));
  const a=s.arm(request({stream}));let error;try{await readTaskResponse(await s.send(a.wire));}catch(e){error=e;}
  assert.ok(error,`${mode}/${stream} must fail`);assert.notEqual(a.status.state,'complete');assert.equal(s.calls.length,1);s.transport.dispose();
 }
});

test('cancel, context change, timeout, disposal stop the one original request and preserve failure',async()=>{
 for(const mode of ['cancel','context','timeout','dispose']){
  let cancelled=0,good=true;const s=setup(name=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(call({name,willContinue:true})+call({partialArgs:[{jsonPath:'$.content',stringValue:'前缀',willContinue:true}],willContinue:true})));},cancel(){cancelled++;}}),{headers:{'content-type':'text/event-stream'}}),{timeoutMs:mode==='timeout'?20:10000});
  const a=s.arm(request(),'auxiliary',()=>{if(!good)throw Error('world changed');}),controller=new AbortController();let started;const received=new Promise(r=>started=r);
  const job=readTaskResponse(await s.send(a.wire,{signal:controller.signal}),{signal:controller.signal,onProgress:p=>{if(p.stage==='receiving')started();}});
  await received;
  if(mode==='cancel')controller.abort();if(mode==='context'){good=false;s.transport.invalidate(null,'聊天切换');}if(mode==='dispose')s.transport.dispose();
  await assert.rejects(job);assert.notEqual(a.status.state,'complete');assert.equal(s.calls.length,1);await new Promise(r=>setTimeout(r,0));assert.ok(cancelled>0);s.transport.dispose();
 }
});

test('main rejects truncated and corrupt terminal streams even after content was emitted',async()=>{
 for(const mode of ['length','late-data','malformed']){
  let upstream;const s=setup(name=>new Response(new ReadableStream({start(c){upstream=c;c.enqueue(new TextEncoder().encode(call({name,args:{content:'已经显示的正文'}})));}}),{headers:{'content-type':'text/event-stream'}}));
  const a=s.arm(request(),'main'),reader=(await s.send(a.wire)).body.getReader();let text='';
  while(!text.includes('已经显示的正文'))text+=new TextDecoder().decode((await reader.read()).value);
  assert.equal(a.status.state,'receiving');upstream.enqueue(new TextEncoder().encode(mode==='length'?end('MAX_TOKENS'):end()+(mode==='late-data'?google({content:{parts:[{text:'迟到正文'}]}}):'data: {broken\n\n')));upstream.close();
  for(;;){const r=await reader.read();if(r.done)break;text+=new TextDecoder().decode(r.value);}
  assert.match(text,/"error"/);assert.doesNotMatch(text,/"finishReason":"STOP"/);assert.notEqual(a.status.state,'complete');assert.equal(s.calls.length,1);s.transport.dispose();
 }
});

test('post-seal mutation, serialized tampering, replay and conflicting wrappers fail before a second request',async()=>{
 const s=setup(valid),a=s.arm();a.wire.messages.push({role:'system',content:'late'});assert.throws(()=>JSON.stringify(a.wire),/其他扩展/);a.wire.messages.pop();
 const body=JSON.parse(JSON.stringify(a.wire));body.messages[0].content='tampered';await assert.rejects(s.target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)}),/变更/);assert.equal(s.calls.length,0);
 await readTaskResponse(await s.send(a.wire));await assert.rejects(s.send(a.wire),/已发送/);assert.equal(s.calls.length,1);
 s.target[Symbol.for('vertex-anti-truncation.fetch')]=true;assert.throws(()=>s.arm(),/社区抗截断/);delete s.target[Symbol.for('vertex-anti-truncation.fetch')];
 const wrapper=s.target.fetch;s.target.fetch=(...x)=>wrapper(...x);assert.throws(()=>s.arm(),/通道已变化/);s.transport.dispose();assert.notEqual(s.target.fetch,wrapper);
});

function fixture(onError=()=>{},respond=valid){
 const d=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a',name:'甲'}],extensionSettings:{[KEY]:d},chatCompletionSettings:{chat_completion_source:'custom',custom_api_format:'gemini_generate_content',model:'gemini-3.7-flash'},chat:[],getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({}),getTokenCountAsync:async text=>text.length,getPresetManager:()=>({getAllPresets:()=>[]}),substituteParams:x=>x,stopGeneration(){}};
 const key=worldKey(c);d.worlds[key]=defaultWorld();d.routes.global.transport='tool-text';const store=createStore({getContext:()=>c,persist:async()=>true});
 const s=setup(respond),host=createHost({onError,getContext:()=>c,getSource:()=>({prompts:[]}),store,transport:s.transport,createParameters:async(settings,model,type,messages)=>({generate_data:request({model,type,messages})})});return {...s,d,c,key,w:d.worlds[key],store,host};
}
test('production host audits added instructions and tools, budgets after wrapping, gates archive and guards changed connection',async()=>{
 const f=fixture();await f.host.before('normal');let p=request();await f.host.payloadReady(p);assert.equal(f.host.preview().messages.length,2);assert.ok(f.host.preview().transport.nativeTools.length);assert.equal(f.host.generationAccepted(),false);
 await (await f.send(p)).text();assert.equal(f.host.generationAccepted(),true);assert.equal(f.host.preview().transport.state,'complete');
 f.host.clear();f.w.context.maxInputTokens=10;await f.host.before('normal');p=request();await assert.rejects(f.host.payloadReady(p),/预算/);assert.throws(()=>JSON.stringify(p),/预算/);assert.equal(f.calls.length,1);
 f.w.context.maxInputTokens=0;await f.host.before('normal');p=request();await f.host.payloadReady(p);f.c.chatCompletionSettings.model='changed';await assert.rejects(f.send(p),/连接已变化/);assert.equal(f.calls.length,1);assert.equal(f.host.generationAccepted(),false);f.transport.dispose();
});

test('production auxiliary task consumes restored streaming and buffered responses without changing saved configuration',async()=>{
 const f=fixture(),original=globalThis.fetch;globalThis.fetch=f.target.fetch;const before=JSON.stringify(f.d);
 try{for(const onProgress of [undefined,()=>{}]){assert.equal(await f.host.request('summary','摘要',{onProgress}),'完整🙂\n"引号"\\');assert.equal(f.host.preview().transport.state,'complete');assert.equal(f.host.preview().messages.at(-1).role,'user');}assert.equal(f.calls.length,2);assert.equal(JSON.stringify(f.d),before);}finally{globalThis.fetch=original;f.transport.dispose();}
});

test('configuration UI exposes route-specific choice and preserves explicit off without enabling other tasks',async()=>{
 const f=fixture(),window=new Window(),container=window.document.createElement('div');window.document.body.append(container);
 const ui=mountConfiguration(window.document,container,{store:f.store,host:f.host,initialTab:'api'});await ui.ready;
 const dom=ui.root.shadowRoot,selects=[...dom.querySelectorAll('select')].filter(s=>[...s.options].some(o=>o.value==='"tool-text"'));
 assert.ok(selects.length>0);assert.ok(selects.every(s=>[...s.options].some(o=>o.value==='"off"')));
 const main=selects.find(s=>s.getAttribute('aria-label')==='任务 · 正文生成 抗截断传输')??selects.find(s=>s.getAttribute('aria-label').startsWith('任务 · '));
 main.value='"off"';main.dispatchEvent(new window.Event('change'));
 await [...dom.querySelectorAll('button')].find(b=>b.textContent==='保存配置').onclick();
 assert.equal(f.store.read().data.routes.global.transport,'tool-text');assert.ok(Object.values(f.store.read().data.routes.tasks).some(r=>r.transport==='off'));assert.equal(f.calls.length,0);ui.dispose();f.transport.dispose();window.happyDOM.abort();
});


test('main errors notify the production host even if native reader swallows error events',async()=>{
 const errors=[],f=fixture(e=>errors.push(e),()=>new Response(google({content:{parts:[{text:'半段'}]}})+event('[DONE]'),{headers:{'content-type':'text/event-stream'}}));
 f.d.routes.global.transport='verify';await f.host.before('normal');const p=request();await f.host.payloadReady(p);const text=await(await f.send(p)).text();
 assert.match(text,/error/);assert.equal(errors.length,1);assert.match(errors[0].message,/缺少完整完成信息/);assert.equal(f.host.generationAccepted(),false);assert.equal(f.host.preview().transport.state,'error');assert.ok(f.host.preview().transport.receivedBytes>0);f.transport.dispose();
});

test('host-wrapped CPU 503 stays an error even if the host appends STOP',async()=>{
 const errors=[],f=fixture(e=>errors.push(e),()=>new Response(google({content:{parts:[{text:'[API Error] Google Gemini endpoint failed with status 503: system cpu overloaded (current: 99.8%, threshold: 90%)'}]}})+end(),{headers:{'content-type':'text/event-stream'}}));
 f.d.routes.global.transport='verify';await f.host.before('normal');const p=request();await f.host.payloadReady(p);await(await f.send(p)).text();
 assert.equal(f.host.generationAccepted(),false);assert.equal(errors.length,1);assert.match(errors[0].message,/503/);assert.equal(f.host.preview().transport.upstreamStatus,503);assert.equal(f.calls.length,1);f.transport.dispose();
});

test('old Vertex is absent from every option, displays off, and never silently enables a replacement',async()=>{
 const f=fixture();f.d.routes.global.transport='vertex-streaming';const before=JSON.stringify(f.d),window=new Window(),container=window.document.createElement('div');window.document.body.append(container);
 const ui=mountConfiguration(window.document,container,{store:f.store,host:f.host,initialTab:'api'});await ui.ready;const dom=ui.root.shadowRoot;
 assert.match(dom.textContent,/旧传输设置已停用/);assert.equal(JSON.stringify(f.d),before);assert.equal(f.calls.length,0);
 assert.equal([...dom.querySelectorAll('option')].some(o=>/vertex/i.test(o.value+' '+o.textContent)),false);
 assert.ok([...dom.querySelectorAll('option')].some(o=>o.value==='"tool-text"'));assert.ok([...dom.querySelectorAll('option')].some(o=>o.value==='"verify"'));
 const global=[...dom.querySelectorAll('select')].find(s=>s.getAttribute('aria-label')==='通用 抗截断传输');
 assert.ok(global);assert.equal(global.value,'"off"');assert.match([...global.options].find(o=>o.value==='"tool-text"').textContent,/含完整性检查/);
 await [...dom.querySelectorAll('button')].find(b=>b.textContent==='保存配置').onclick();assert.equal(f.store.read().data.routes.global.transport,'vertex-streaming');assert.equal(f.calls.length,0);
 ui.dispose();f.transport.dispose();window.happyDOM.abort();
});

test('tool/search check is explicit, retains requests and history, never adds a synthetic tool',()=>{
 const tool={type:'function',function:{name:'weather',parameters:{type:'object'}}};
 for(const make of [openai,request]){
  const p=make({tools:[tool],tool_choice:'auto',enable_web_search:true,messages:[{role:'assistant',content:null,tool_calls:[{id:'real-1',type:'function',function:{name:'weather',arguments:'{}'}}],native:{gemini:{content:{parts:[{functionCall:{name:'weather',args:{}},thoughtSignature:'preserve'}]}}}},{role:'tool',tool_call_id:'real-1',content:'晴天'},{role:'user',content:'总结'}],custom_include_body:JSON.stringify({toolConfig:{includeServerSideToolInvocations:true}})});
  const before=structuredClone(p),r=prepareTextTransport(p,'verify-tools');assert.ok(r.plan);assert.deepEqual(r.payload,before);assert.deepEqual(p,before);assert.equal(r.plan.toolName,null);assert.equal(r.audit.protection,'integrity-only');assert.equal(r.audit.searchRequested,true);assert.equal(r.audit.toolsRequested,true);
  assert.equal(prepareTextTransport(p,'tool-text').audit.state,'bypassed');
 }
 const config=emptyConfig();config.routes.global.transport='verify-tools';assert.equal(validateConfig(config),config);
});

test('tool/search main buffered check preserves complete envelope, signatures, citations and real calls',async()=>{
 const real={id:'call-1',type:'function',function:{name:'weather',arguments:'{"city":"上海"}'}};
 for(const make of [openai,request])for(const native of [false,true])for(const toolTurn of [false,true]){
  if(make===openai&&native)continue;
  const parts=toolTurn?[{functionCall:{name:'weather',id:'call-1',args:{city:'上海'}},thoughtSignature:'signature'}]:[{text:'晴天',thoughtSignature:'signature'}];
  const original=native?{candidates:[{content:{role:'model',parts},finishReason:'STOP',groundingMetadata:{groundingChunks:[{web:{uri:'https://example.test',title:'天气'}}]}}],usageMetadata:{totalTokenCount:3}}:{choices:[{message:{role:'assistant',content:toolTurn?null:'晴天',...(toolTurn?{tool_calls:[real]}:{}),native:{gemini:{content:{role:'model',parts}}},annotations:[{type:'url_citation',url_citation:{url:'https://example.test'}}]},finish_reason:toolTurn?'tool_calls':'stop'}],usage:{total_tokens:3},extraProviderField:'keep'};
  const s=setup(()=>jsonResponse(original)),p=make({stream:false,enable_web_search:true,tools:[{type:'function',function:{name:'weather'}}]}),r=s.transport.prepare(p,'verify-tools');
  const status=s.transport.authorize(r.payload,r,{kind:'main'}),body=await(await s.send(r.payload)).json();
  assert.deepEqual(body,original);assert.deepEqual(s.calls[0].body,p);assert.equal(s.calls.length,1);assert.equal(status.state,toolTurn?'tool-handoff':'complete');assert.equal(status.toolTurn,toolTurn);assert.notEqual(status.restored,true);s.transport.dispose();
 }
});

test('tool/search streaming checks preserve native real calls and grounding; tool handoff is not final text',async()=>{
 for(const make of [openai,request])for(const toolTurn of [false,true]){
  const native=make===request;
  const part=toolTurn?{functionCall:{id:'call-1',name:'weather',args:{city:'上海'}},thoughtSignature:'keep-signature'}:{text:'晴天',thoughtSignature:'keep-signature'};
  const nativeFrame={candidates:[{content:{role:'model',parts:[part]},groundingMetadata:{groundingChunks:[{web:{uri:'https://example.test'}}]}}]};
  const delta=toolTurn?{tool_calls:[{index:0,id:'call-1',type:'function',function:{name:'weather',arguments:'{"city":"上海"}'}}]}:{content:'晴天',annotations:[{type:'url_citation',url_citation:{url:'https://example.test'}}]};
  const raw=native?event(nativeFrame)+end():chatChunk(delta)+chatEnd(toolTurn?'tool_calls':'stop');
  const s=setup(()=>new Response(raw,{headers:{'content-type':'text/event-stream'}})),r=s.transport.prepare(make({enable_web_search:true,tools:[{type:'function',function:{name:'weather'}}]}),'verify-tools');
  const status=s.transport.authorize(r.payload,r,{kind:'main'}),out=await readFrames(await s.send(r.payload));
  if(native)assert.deepEqual(out[0],nativeFrame);else assert.deepEqual(out[0].choices[0].delta,delta);
  assert.equal(status.state,toolTurn?'tool-handoff':'complete');assert.equal(status.toolTurn,toolTurn);assert.notEqual(status.restored,true);assert.equal(s.calls.length,1);s.transport.dispose();
 }
});

test('tool/search compatibility still rejects truncated tools, invalid args, length and 503 without retries',async()=>{
 for(const native of [false,true])for(const failure of ['missing','bad-args','length','503']){
  const raw=native?call({name:'weather',args:failure==='bad-args'?'bad':{city:'上海'}})+(failure==='missing'?'':end(failure==='length'?'MAX_TOKENS':'STOP')):chatChunk({tool_calls:[{index:0,function:{name:'weather',arguments:failure==='bad-args'?'broken':'{"city":"上海"}'}}]})+(failure==='missing'?'':chatEnd(failure==='length'?'length':'tool_calls'));
  const s=setup(()=>failure==='503'?new Response('overloaded',{status:503}):new Response(raw,{headers:{'content-type':'text/event-stream'}})),r=s.transport.prepare((native?request:openai)({enable_web_search:true}),'verify-tools');
  const status=s.transport.authorize(r.payload,r,{kind:'main'}),response=await s.send(r.payload),text=await response.text();
  assert.equal(status.state,'error');assert.equal(s.calls.length,1);if(failure!=='503'){assert.match(text,/"error"/);assert.doesNotMatch(text,/"finishReason":"STOP"|"finish_reason":"tool_calls"/);}s.transport.dispose();
 }
});

test('auxiliary tools are not executed or misreported as a complete text answer',async()=>{
 for(const stream of [true,false]){
  const s=setup(()=>stream?new Response(chatChunk({tool_calls:[{index:0,function:{name:'weather',arguments:'{}'}}]})+chatEnd('tool_calls'),{headers:{'content-type':'text/event-stream'}}):jsonResponse({choices:[{message:{tool_calls:[{function:{name:'weather',arguments:'{}'}}]},finish_reason:'tool_calls'}]})),r=s.transport.prepare(openai({stream}),'verify-tools'),status=s.transport.authorize(r.payload,r,{kind:'auxiliary'});
  if(stream)assert.match(await(await s.send(r.payload)).text(),/"error"/);else await assert.rejects(s.send(r.payload));
  assert.equal(status.state,'error');assert.equal(s.calls.length,1);s.transport.dispose();
 }
});

test('production archive gate waits through a real tool handoff and accepts only the final text turn',async()=>{
 let toolTurn=true;
 const f=fixture(()=>{},()=>new Response((toolTurn?call({name:'weather',args:{city:'上海'}}):google({content:{parts:[{text:'最终回答'}]}}))+end(),{headers:{'content-type':'text/event-stream'}}));
 f.d.routes.global.transport='verify-tools';
 try{
  await f.host.before('normal');let p=request({enable_web_search:true});await f.host.payloadReady(p);await(await f.send(p)).text();
  assert.equal(f.host.preview().transport.state,'tool-handoff');assert.equal(f.host.generationAccepted(),false);
  f.host.clear();toolTurn=false;await f.host.before('normal');p=request({enable_web_search:true});await f.host.payloadReady(p);await(await f.send(p)).text();
  assert.equal(f.host.preview().transport.state,'complete');assert.equal(f.host.generationAccepted(),true);assert.equal(f.calls.length,2);
 }finally{f.transport.dispose();}
});


const mediaInputs=[
 {type:'image_url',image_url:{url:'data:image/png;base64,aW1hZ2U=',detail:'low'},providerExtra:'keep'},
 {type:'audio_url',audio_url:{url:'data:audio/wav;base64,YXVkaW8='}},
 {type:'video_url',video_url:{url:'data:video/mp4;base64,dmlkZW8=',detail:'low'}},
 {type:'input_audio',input_audio:{data:'YXVkaW8=',format:'wav'}},
];
const imageOutput={type:'image_url',image_url:{url:'data:image/png;base64,aW1hZ2U='}};
const nativeImage={inlineData:{mimeType:'image/png',data:'aW1hZ2U='},thoughtSignature:'image-signature'};
test('AT07 input media and inline toggle preserve complete original messages in every text-output mode',async()=>{
 for(const make of [request,openai])for(const mode of ['tool-text','verify','verify-tools'])for(const stream of [true,false]){
  const s=setup((name,body)=>mode==='tool-text'?(make===openai&&body.stream?new Response(chatChunk({tool_calls:[{index:0,function:{name,arguments:JSON.stringify({content:'文字答复'})}}]})+chatEnd('tool_calls'),{headers:{'content-type':'text/event-stream'}}):valid(name,body)):body.stream?new Response(make===request?google({content:{parts:[{text:'文字答复'}]}})+end():chatChunk({content:'文字答复'})+chatEnd(),{headers:{'content-type':'text/event-stream'}}):jsonResponse({choices:[{message:{content:'文字答复'},finish_reason:'stop'}]}));
  const p=make({stream,request_images:mode==='verify-tools',media_inlining:true,messages:[{role:'user',content:[{type:'text',text:'请描述附件'},...structuredClone(mediaInputs)]}]}),before=structuredClone(p),r=s.transport.prepare(p,mode);
  assert.ok(r.plan);assert.deepEqual(p,before);assert.deepEqual(r.payload.messages.slice(0,1),p.messages);assert.deepEqual(r.audit.inputMedia,{image:1,audio:2,video:1});
  const status=s.transport.authorize(r.payload,r,{kind:'main'});await(await s.send(r.payload)).text();assert.equal(status.state,'complete',`${mode}/${stream}/${make===request?'gemini':'openai'}/${status.errorCode}`);assert.equal(s.calls.length,1);assert.deepEqual(s.calls[0].body.messages[0],p.messages[0]);s.transport.dispose();
 }
 for(const mode of ['tool-text','verify','verify-tools'])assert.ok(prepareTextTransport(request({media_inlining:true}),mode).plan);
});
test('AT07 image output is explicit compatibility, reports precise bypass and never changes settings',()=>{
 for(const mode of ['tool-text','verify']){
  const p=request({request_images:true}),r=prepareTextTransport(p,mode);assert.equal(r.payload,p);assert.equal(r.audit.reason,'media_output');assert.equal(r.audit.requestImages,true);assert.match(r.audit.label,/图片/);
 }
 const p=request({request_images:true,enable_web_search:true}),before=structuredClone(p),r=prepareTextTransport(p,'verify-tools');assert.ok(r.plan);assert.deepEqual(r.payload,before);assert.deepEqual(p,before);
 for(const content of [[{type:'unknown',url:'secret'}],[{type:'image_url',image_url:{}}],[null]]){const r=prepareTextTransport(request({messages:[{role:'user',content}]}),'verify-tools');assert.equal(r.audit.reason,'media');assert.equal(r.audit.unsupportedContentParts,1);assert.doesNotMatch(JSON.stringify(r.audit),/secret/);}
 for(const custom_include_body of [{generationConfig:{responseModalities:['TEXT','IMAGE']}},{modalities:['text','image']}])assert.ok(prepareTextTransport(request({custom_include_body}),'verify-tools').plan);
 assert.equal(prepareTextTransport(request({custom_include_body:{modalities:['audio']}}),'verify-tools').audit.reason,'media_output');
});
test('AT07 image and mixed output preserve exact envelopes, signatures and bytes in streaming and buffered checks',async()=>{
 for(const make of [request,openai])for(const stream of [true,false])for(const mixed of [false,true])for(const imageToggle of [false,true]){
  const text=mixed?'图片说明':'',message={role:'assistant',content:text,images:[imageOutput]},native={candidates:[{content:{role:'model',parts:[...(text?[{text}]:[]),nativeImage]},finishReason:'STOP'}],usageMetadata:{totalTokenCount:5}};
  const body=make===request?native:{choices:[{message,finish_reason:'stop'}],extra:'preserve'};
  const frames=make===request?[{candidates:[{content:native.candidates[0].content}]},{candidates:[{finishReason:'STOP'}]}]:[{choices:[{index:0,delta:message}]},{choices:[{index:0,delta:{},finish_reason:'stop'}]}];
  const raw=frames.map(event).join('')+event('[DONE]'),s=setup(()=>stream?new Response(raw,{headers:{'content-type':'text/event-stream'}}):jsonResponse(body));
  const p=make({stream,request_images:imageToggle}),r=s.transport.prepare(p,'verify-tools'),status=s.transport.authorize(r.payload,r,{kind:'main'}),response=await s.send(r.payload);
  if(stream)assert.deepEqual(await readFrames(response),frames);else assert.deepEqual(await response.json(),body);
  assert.equal(status.state,mixed?'complete':'media-complete');assert.equal(status.hasImages,true);assert.equal(!!status.hasText,mixed);assert.equal(s.calls.length,1);assert.deepEqual(s.calls[0].body,p);s.transport.dispose();
 }
});
test('AT07 image responses still reject missing or failed endings and malformed images without retries',async()=>{
 for(const native of [false,true])for(const stream of [true,false])for(const failure of ['missing','length','bad-image','late-image','503']){
  if(!stream&&failure==='late-image')continue;
  const part=failure==='bad-image'?{inlineData:{mimeType:'image/png',data:''}}:nativeImage,img=failure==='bad-image'?{type:'image_url',image_url:{}}:imageOutput;
  const text=native?google({content:{parts:[{text:'说明'},part]}}):chatChunk({content:'说明',images:[img]});
  const tail=failure==='missing'?event('[DONE]'):native?end(failure==='length'?'MAX_TOKENS':'STOP'):chatEnd(failure==='length'?'length':'stop');
  const body=native?{candidates:[{content:{parts:[{text:'说明'},part]},...(failure==='missing'?{}:{finishReason:failure==='length'?'MAX_TOKENS':'STOP'})}]}:{choices:[{message:{content:'说明',images:[img]},...(failure==='missing'?{}:{finish_reason:failure==='length'?'length':'stop'})}]};
  const s=setup(()=>failure==='503'?new Response('busy',{status:503}):stream?new Response(text+tail+(failure==='late-image'?text:''),{headers:{'content-type':'text/event-stream'}}):jsonResponse(body)),r=s.transport.prepare((native?request:openai)({stream,request_images:true}),'verify-tools'),status=s.transport.authorize(r.payload,r,{kind:'main'});
  try{await(await s.send(r.payload)).text();}catch{}
  assert.equal(status.state,'error',`${native}/${stream}/${failure}`);assert.equal(s.calls.length,1);s.transport.dispose();
 }
});
test('AT07 production native snapshot exports image flag; image-only response does not authorize narrative archive',async()=>{
 for(const stream of [true,false]){
  const f=fixture(()=>{},()=>stream?new Response(google({content:{parts:[nativeImage]}})+end(),{headers:{'content-type':'text/event-stream'}}):jsonResponse({candidates:[{content:{parts:[nativeImage]},finishReason:'STOP'}]}));
  f.d.routes.global.transport='verify-tools';f.w.context.owner='native';await f.host.before('normal');const p=request({stream,request_images:true,media_inlining:true});await f.host.payloadReady(p);await(await f.send(p)).text();
  assert.equal(f.host.preview().transport.requestImages,true);assert.equal(f.host.preview().transport.state,'media-complete');assert.equal(f.host.generationAccepted(),false);assert.equal(f.calls.length,1);f.transport.dispose();
 }
});


test('AT07 host-normalized Gemini image response is validated without modifying the native envelope',async()=>{
 const original={choices:[{message:{role:'assistant',content:'',native:{gemini:{content:{role:'model',parts:[nativeImage]}}}},finish_reason:'stop'}],responseContent:{role:'model',parts:[nativeImage]}};
 const s=setup(()=>jsonResponse(original)),r=s.transport.prepare(request({stream:false,request_images:true}),'verify-tools'),status=s.transport.authorize(r.payload,r,{kind:'main'});
 assert.deepEqual(await(await s.send(r.payload)).json(),original);assert.equal(status.state,'media-complete');assert.equal(status.completionEvidence,'host-normalized');s.transport.dispose();
});
test('AT07 image plus real tool handoff is not a final answer; auxiliary image-only replies fail',async()=>{
 const tool={functionCall:{name:'lookup',args:{key:'a'}}};
 for(const stream of [true,false]){
  const original={candidates:[{content:{parts:[nativeImage,tool]},finishReason:'STOP'}]},s=setup(()=>stream?new Response(google({content:{parts:[nativeImage,tool]}})+end(),{headers:{'content-type':'text/event-stream'}}):jsonResponse(original)),r=s.transport.prepare(request({stream,request_images:true}),'verify-tools'),status=s.transport.authorize(r.payload,r,{kind:'main'});
  await(await s.send(r.payload)).text();assert.equal(status.state,'tool-handoff');assert.equal(status.hasImages,true);s.transport.dispose();
  const a=setup(()=>stream?new Response(google({content:{parts:[nativeImage]}})+end(),{headers:{'content-type':'text/event-stream'}}):jsonResponse({candidates:[{content:{parts:[nativeImage]},finishReason:'STOP'}]})),q=a.transport.prepare(request({stream,request_images:true}),'verify-tools'),state=a.transport.authorize(q.payload,q,{kind:'auxiliary'});
  try{await(await a.send(q.payload)).text();}catch{}assert.equal(state.state,'error');assert.equal(a.calls.length,1);a.transport.dispose();
 }
});
