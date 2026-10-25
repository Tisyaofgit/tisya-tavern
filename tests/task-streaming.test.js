import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createHost} from '../config/host.js';
import {createTextTransport} from '../config/text-transport.js';
import {tableRegistry} from '../v3/host-runtime.mjs';

const encoder=new TextEncoder();
const event=value=>'data: '+(typeof value==='string'?value:JSON.stringify(value))+'\n\n';
const frame=(content,finish_reason=null)=>event({choices:[{index:0,delta:{content},finish_reason}]});
const response=wire=>new Response(wire,{headers:{'content-type':'text/event-stream'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const definition={phase:'definition',sourceCardRaw:{fields:{name:'测试卡',description:'定义来源'}},sourceBooks:[],registry:tableRegistry,currentRows:[]};
const opening={phase:'opening',confirmedTemplate:{kind:'confirmed-definition',name:'测试卡',rowIds:['known']},sourceCardRaw:{fields:{description:'定义来源'}},sourceBooks:[],selectedOpening:{id:'chat:0',kind:'chat',text:'开场'},sourceUser:{id:'persona',objectId:'new:opening-user',name:'旅人',description:'用户人设'},registry:tableRegistry,currentRows:[]};
const history={historyText:'已发生的原文',registry:tableRegistry,currentRows:[],label:'第 2 层'};
function fixture({source='openai',format,transport=null,mode='off'}={}){
 const data=emptyConfig(),context={chatId:'chat',characterId:0,characters:[{avatar:'card.png'}],chatMetadata:{},chat:[],extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'fixture-model',chat_completion_source:source,...(format?{custom_api_format:format}:{})},getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({}),substituteParams:s=>s};
 data.worlds[worldKey(context)]=defaultWorld();data.routes.global.transport=mode;data.routes.tasks.templateInit={transport:mode};
 const store=createStore({getContext:()=>context,persist:async()=>true});
 const host=createHost({getContext:()=>context,store,transport,getSource:()=>{throw Error('native preset must not be used');},createParameters:async(settings,model,type,messages)=>({generate_data:{model,messages,chat_completion_source:settings.chat_completion_source,...(settings.custom_api_format?{custom_api_format:settings.custom_api_format}:{})}})});
 return {host,context,store};
}

test('actual initialization, opening and history requests deliver visible chunks before completion',async()=>{
 const original=globalThis.fetch,requests=[];
 try{
  for(const [task,input]of [['templateInit',definition],['templateInit',opening],['historyImport',history]]){
   let wire,settled=false,first;const seen=new Promise(resolve=>first=resolve),events=[];
   globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/backends/chat-completions/generate');requests.push(JSON.parse(options.body));return new Response(new ReadableStream({start(controller){wire=controller;controller.enqueue(encoder.encode(event({choices:[{index:0,delta:{reasoning_content:'HIDDEN_INTERNAL'},finish_reason:null}]})));controller.enqueue(encoder.encode(frame('草稿🙂')));}}),{headers:{'content-type':'text/event-stream'}});};
   const {host}=fixture();
   const pending=host.request(task,input,{typedInput:input,onProgress:entry=>{events.push(entry);if(entry.stage==='receiving')first();}}).finally(()=>settled=true);
   await seen;assert.equal(settled,false);assert.equal(requests.at(-1).stream,true);assert.equal(events.at(-1).text,'草稿🙂');assert.equal(events.at(-1).characters,'草稿🙂'.length);
   assert.ok(events.some(e=>e.stage==='thinking'));assert.doesNotMatch(JSON.stringify(events),/HIDDEN_INTERNAL/);
   wire.enqueue(encoder.encode(frame('已完整', 'stop')));wire.close();
   assert.equal(await pending,'草稿🙂已完整');assert.equal(events.at(-1).stage,'received');
  }
  assert.equal(requests.length,3);
 }finally{globalThis.fetch=original;}
});

test('actual task cancellation during a stalled stream cancels its reader with no terminal success or retry',async()=>{
 const original=globalThis.fetch;let calls=0,cancels=0,first;const began=new Promise(resolve=>first=resolve),events=[],controller=new AbortController();
 globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.signal,controller.signal);return new Response(new ReadableStream({start(stream){stream.enqueue(encoder.encode(frame('部分草稿')));},cancel(){cancels++;}}),{headers:{'content-type':'text/event-stream'}});};
 try{
  const pending=fixture().host.request('templateInit',definition,{signal:controller.signal,onProgress:event=>{events.push(event);if(event.stage==='receiving')first();}});
  await began;controller.abort('用户停止');await assert.rejects(pending,error=>error.name==='AbortError');
  assert.equal(calls,1);assert.equal(cancels,1);assert.equal(events.some(e=>e.stage==='received'),false);
 }finally{globalThis.fetch=original;}
});

test('servers returning buffered JSON report buffering, and callback-free callers retain stream=false',async()=>{
 const original=globalThis.fetch,requests=[];
 globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:'完整草稿',reasoning_content:'HIDDEN'},finish_reason:'stop'}]});};
 try{
  const events=[],host=fixture().host;
  assert.equal(await host.request('templateInit',definition,{onProgress:e=>events.push(e)}),'完整草稿');
  assert.deepEqual(events.slice(-2).map(e=>e.stage),['buffered','received']);assert.equal(requests[0].stream,true);
  assert.equal(await host.request('templateInit',definition),'完整草稿');assert.equal(requests[1].stream,false);
 }finally{globalThis.fetch=original;}
});

const claudeStart={type:'message_start',message:{id:'msg',role:'assistant',content:[],stop_reason:null}};
const claude=body=>[
 claudeStart,
 {type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'HIDDEN_CLAUDE'}},
 {type:'content_block_stop',index:0},
 {type:'content_block_start',index:1,content_block:{type:'text',text:''}},
 {type:'content_block_delta',index:1,delta:{type:'text_delta',text:body}},
 {type:'content_block_stop',index:1},
 {type:'message_delta',delta:{stop_reason:'end_turn'}},
 {type:'message_stop'},
].map(event).join('');
const gemini=body=>event({candidates:[{content:{parts:[{thought:true,text:'HIDDEN_GEMINI'}]},finishReason:''}]})+event({candidates:[{content:{parts:[{text:body}]},finishReason:''}]})+event({candidates:[{content:{parts:[{}]},finishReason:'STOP'}]});
const cohere=body=>[
 {type:'message-start',delta:{message:{role:'assistant',content:[]}}},
 {type:'content-start',index:0,delta:{message:{content:{type:'text',text:''}}}},
 {type:'content-delta',index:0,delta:{message:{content:{text:body}}}},
 {type:'content-end',index:0},
 {type:'message-end',delta:{finish_reason:'COMPLETE'}},
].map(event).join('');

test('task stream follows the current host native Gemini, Claude and Cohere response dialects',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [source,format,wire]of [['makersuite',null,gemini],['custom','gemini_generate_content',gemini],['claude',null,claude],['custom','claude_messages',claude],['cohere',null,cohere]]){
   let count=0;globalThis.fetch=async()=>{count++;return response(wire('完整🙂'));};const events=[];
   const actual=await fixture({source,format}).host.request('templateInit',definition,{onProgress:e=>events.push(e)});
   assert.equal(actual,'完整🙂');assert.ok(events.some(e=>e.stage==='receiving'));assert.equal(events.at(-1).stage,'received');assert.doesNotMatch(JSON.stringify(events),/HIDDEN_/);assert.equal(count,1);
  }
 }finally{globalThis.fetch=original;}
});

test('selected universal transport remains authoritative and native task streams are not normalized twice',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [source,wire]of [['claude',claude],['cohere',cohere],['openai',text=>frame(text,'stop')+event('[DONE]')]]){
   let count=0;
   globalThis.fetch=async()=>{count++;return response(wire('完整🙂'));};
   const transport=createTextTransport({target:globalThis,isTauri:()=>true,origin:()=> 'http://tauri.localhost'});transport.install();
   try{
    const host=fixture({source,transport,mode:'universal'}).host,events=[];
    assert.equal(await host.request('templateInit',definition,{onProgress:e=>events.push(e)}),'完整🙂');
    assert.equal(count,1);assert.equal(transport.status().state,'complete');assert.equal(events.at(-1).stage,'received');
   }finally{transport.dispose();}
  }
 }finally{globalThis.fetch=original;}
});

test('native incomplete output and HTTP failure never become a completed task or trigger a retry',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [source,wire]of [['claude',claude('部分').replace(event({type:'message_stop'}),'')],['makersuite',gemini('部分').replace(/STOP/g,'MAX_TOKENS')],['makersuite',event({candidates:[{content:{parts:[{text:'部分'}]},finishReason:''}]})+event('[DONE]')],['cohere',cohere('部分').replace(/COMPLETE/g,'MAX_TOKENS')]]){
   let count=0;globalThis.fetch=async()=>{count++;return response(wire);};const events=[];
   await assert.rejects(fixture({source}).host.request('templateInit',definition,{onProgress:e=>events.push(e)}));
   assert.equal(events.some(e=>e.stage==='received'),false);assert.equal(count,1);
  }
  let count=0;globalThis.fetch=async()=>{count++;return Response.json({error:{message:'rate limited'}},{status:429});};
  await assert.rejects(fixture().host.request('templateInit',definition,{onProgress:()=>{}}),/429/);assert.equal(count,1);
 }finally{globalThis.fetch=original;}
});

test('native parser cancellation propagates upstream while waiting for later Claude content',async()=>{
 const original=globalThis.fetch,controller=new AbortController(),events=[];let canceled=0,first;
 const received=new Promise(resolve=>first=resolve);
 globalThis.fetch=async()=>new Response(new ReadableStream({start(stream){stream.enqueue(encoder.encode(event(claudeStart)+event({type:'content_block_start',index:0,content_block:{type:'text',text:'部分'}})));},cancel(){canceled++;}}),{headers:{'content-type':'text/event-stream'}});
 try{
  const pending=fixture({source:'claude'}).host.request('templateInit',definition,{signal:controller.signal,onProgress:e=>{events.push(e);if(e.stage==='receiving')first();}});
  await received;controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');await tick();
  assert.equal(canceled,1);assert.equal(events.some(e=>e.stage==='received'),false);
 }finally{globalThis.fetch=original;}
});
