import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {prepareVertexTransport,createVertexTransport} from '../config/vertex-transport.js';
import {readTaskResponse} from '../config/stream-response.js';
import {createHost,sealPayload} from '../config/host.js';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore,resolveRoute,validateConfig} from '../config/core.js';
import {mountConfiguration} from '../config/panel.js';

const event=v=>`data: ${typeof v==='string'?v:JSON.stringify(v)}\n\n`;
const google=c=>event({candidates:[c],modelVersion:'gemini-3.7-flash',responseId:'fixture'});
const call=fn=>google({content:{role:'model',parts:[{functionCall:fn}]}});
const end=(reason='STOP')=>google({finishReason:reason})+event('[DONE]');
const request=patch=>({chat_completion_source:'vertexai',model:'gemini-3.7-flash',type:'normal',stream:true,messages:[{role:'user',content:'你好'}],custom_include_body:'',custom_exclude_body:'',...patch});
function setup(respond,options={}){
 const calls=[],target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async(input,init)=>{const body=typeof init?.body==='string'?JSON.parse(init.body):await input.clone().json();calls.push({body,init,input});const name=body.custom_include_body?JSON.parse(body.custom_include_body).tools?.[0]?.functionDeclarations?.[0]?.name:null;return respond(name,body,init,calls);}};
 const transport=createVertexTransport({target,...options});transport.install();
 function arm(p=request(),kind='auxiliary',guard=()=>{}){const result=transport.prepare(p,'vertex-streaming'),wire=result.payload;sealPayload(wire);const status=transport.authorize(wire,result,{kind,guard});return {wire,result,status};}
 const send=(p,extra={})=>target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(p),...extra});
 return {calls,target,transport,arm,send};
}
const valid=name=>new Response(call({name,args:{content:'完整🙂\n"引号"\\'}})+end(),{headers:{'content-type':'text/event-stream'}});
const readFrames=async response=>(await response.text()).split('\n').filter(x=>x.startsWith('data: ')&&!x.includes('[DONE]')).map(x=>JSON.parse(x.slice(6)));

test('default-off and unsupported requests keep exact input; routes inherit with explicit off',()=>{
 const p=request();assert.equal(prepareVertexTransport(p,'off').payload,p);
 for(const [patch,reason]of [[{chat_completion_source:'custom'},'provider'],[{reverse_proxy:'https://invalid.test'},'proxy'],[{model:'gemini-2.5-pro'},'model'],[{model:'gemini-3.1-flash-lite'},'model'],[{tools:[{name:'read_archive'}]},'tools'],[{tool_choice:'none'},'tools'],[{messages:[{role:'tool',content:'资料'}]},'history'],[{json_schema:{type:'object'}},'schema'],[{n:2},'candidates'],[{enable_web_search:true},'search'],[{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AA'}}]}]},'media'],[{custom_include_body:'tools: []'},'parameters'],[{custom_include_body:'{"toolConfig":{}}'},'parameters'],[{custom_exclude_body:'tools'},'parameters']]){
  const body=request(patch),before=JSON.stringify(body),r=prepareVertexTransport(body,'vertex-streaming');assert.equal(r.audit.reason,reason);assert.equal(r.payload,body);assert.equal(JSON.stringify(body),before);
 }
 const d=emptyConfig(),w=defaultWorld();d.routes.global.transport='vertex-streaming';w.modes.narrative.routes.summary={transport:'off'};
 assert.equal(resolveRoute(d,w,'main').transport,'vertex-streaming');assert.equal(resolveRoute(d,w,'summary').transport,'off');d.routes.global.transport='bad';assert.throws(()=>validateConfig(d),/抗截断/);
});

test('native main, OpenAI auxiliary, and buffered replies preserve exact text with one upstream call',async()=>{
 for(const [kind,stream]of [['main',true],['auxiliary',true],['main',false],['auxiliary',false]]){
  const s=setup(valid),original=request({stream,type:'continue'}),copy=structuredClone(original),a=s.arm(original,kind);
  assert.deepEqual(original,copy);assert.equal(a.wire.stream,true);assert.equal(a.result.audit.continuation,true);assert.match(a.wire.messages.at(-1).content,/only the new continuation text/);
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

function fixture(){
 const d=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a',name:'甲'}],extensionSettings:{[KEY]:d},chatCompletionSettings:{chat_completion_source:'vertexai',model:'gemini-3.7-flash'},chat:[],getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({}),getTokenCountAsync:async text=>text.length,getPresetManager:()=>({getAllPresets:()=>[]}),substituteParams:x=>x,stopGeneration(){}};
 const key=worldKey(c);d.worlds[key]=defaultWorld();d.routes.global.transport='vertex-streaming';const store=createStore({getContext:()=>c,persist:async()=>true});
 const s=setup(valid),host=createHost({getContext:()=>c,getSource:()=>({prompts:[]}),store,transport:s.transport,createParameters:async(settings,model,type,messages)=>({generate_data:request({model,type,messages})})});return {...s,d,c,key,w:d.worlds[key],store,host};
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
 const dom=ui.root.shadowRoot,selects=[...dom.querySelectorAll('select')].filter(s=>[...s.options].some(o=>o.value==='"vertex-streaming"'));
 assert.ok(selects.length>0);assert.ok(selects.every(s=>[...s.options].some(o=>o.value==='"off"')));
 const main=selects.find(s=>s.getAttribute('aria-label')==='任务 · 正文生成 抗截断传输')??selects.find(s=>s.getAttribute('aria-label').startsWith('任务 · '));
 main.value='"off"';main.dispatchEvent(new window.Event('change'));
 await [...dom.querySelectorAll('button')].find(b=>b.textContent==='保存配置').onclick();
 assert.equal(f.store.read().data.routes.global.transport,'vertex-streaming');assert.ok(Object.values(f.store.read().data.routes.tasks).some(r=>r.transport==='off'));assert.equal(f.calls.length,0);ui.dispose();f.transport.dispose();window.happyDOM.abort();
});
