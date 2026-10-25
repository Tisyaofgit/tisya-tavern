import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey,registry} from '../config/core.js';
import {createHost} from '../config/host.js';
import {tableRegistry} from '../v3/host-runtime.mjs';
import {formatSimpleSheet} from '../tables/simple-sheet.js';

const definition={phase:'definition',sourceCardRaw:{fields:{name:'测试卡',description:'定义来源'}},sourceBooks:[],registry:tableRegistry,currentRows:[]};
function fixture(options={}){
 const data=emptyConfig(),context={chatId:'chat',characterId:0,characters:[{avatar:'card.png'}],chatMetadata:{},chat:[],extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'fixture-model',chat_completion_source:'openai'},getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({}),substituteParams:s=>s,loadWorldInfo:async()=>{throw Error('workspace reader was bypassed');}};
 const key=worldKey(context),world=data.worlds[key]=defaultWorld(),store=createStore({getContext:()=>context,persist:async()=>true});
 const host=createHost({...options,getContext:()=>context,store,getSource:()=>{throw Error('native preset must not be used');},createParameters:async(settings,model,type,messages,options)=>({generate_data:{model,messages,...options?.toolData}})});
 return {host,data,context,world,key,store};
}

test('material assembly shares the workspace read across archives, selected entries and resource origins',async()=>{
 let reads=0,description='初版';const f=fixture({readWorldbook:async(name,options)=>{assert.equal(name,'材料');assert.deepEqual(options,{fresh:false});reads++;return {entries:{1:{uid:1,comment:'茶社',content:JSON.stringify({name:'茶社',type:'组织',description})},2:{uid:2,content:'指定文风'}}};}});
 f.world.context.books=['材料'];f.world.context.entries=[{book:'材料',uid:2}];f.world.controller='book:'+JSON.stringify(['材料',1]);
 f.data.resources=[{id:'style',kind:'style',name:'风格',content:'指定文风',source:{book:'材料',uid:2}}];f.world.style='style';
 const initial=await f.host.resolveMaterials(f.data,f.world);assert.equal(reads,1);assert.match(initial.text,/初版/);assert.equal(initial.text.split('指定文风').length-1,1);
 description='第二版';const next=await f.host.resolveMaterials(f.data,f.world);assert.equal(reads,2);assert.match(next.text,/第二版/);assert.doesNotMatch(next.text,/初版/);
});

test('workspace material reader failures remain visible and never bypass to the native reader',async()=>{
 let nativeReads=0;const f=fixture({readWorldbook:async()=>{throw Error('工作区存档读取失败');}});f.context.loadWorldInfo=async()=>{nativeReads++;return {entries:{}};};f.world.context.books=['材料'];
 await assert.rejects(f.host.resolveMaterials(f.data,f.world),/工作区存档读取失败/);assert.equal(nativeReads,0);
});

test('each independent network send awaits workspace freshness after assembly',async()=>{
 const original=globalThis.fetch,order=[];const f=fixture({beforeSend:async scope=>{assert.deepEqual(scope,{task:'templateInit',world:f.key});order.push('checked');}});
 globalThis.fetch=async()=>{order.push('sent');return Response.json({choices:[{message:{content:'草稿'},finish_reason:'stop'}]});};
 try{assert.equal(await f.host.request('templateInit',definition),'草稿');assert.equal(await f.host.request('templateInit',definition),'草稿');assert.deepEqual(order,['checked','sent','checked','sent']);}finally{globalThis.fetch=original;}
});

test('captured source verification runs after request refresh and prevents stale input from reaching the network',async()=>{
 const original=globalThis.fetch,order=[];let sends=0;const f=fixture({beforeRequest:async()=>order.push('reset-reads'),beforeSend:async()=>order.push('workspace-check')});globalThis.fetch=async()=>{sends++;return Response.json({choices:[{message:{content:'ok'},finish_reason:'stop'}]});};
 try{
  await assert.rejects(f.host.request('templateInit',definition,{verifySources:async()=>{order.push('original-sources');throw Error('原始来源已变化');}}),/原始来源已变化/);assert.equal(sends,0);assert.deepEqual(order,['reset-reads','original-sources']);
  order.length=0;await f.host.request('templateInit',definition,{verifySources:async()=>order.push('original-sources')});assert.equal(sends,1);assert.deepEqual(order,['reset-reads','original-sources','workspace-check']);
 }finally{globalThis.fetch=original;}
});

test('independent requests refresh workspace sources before reading configuration or compiling and sending',async()=>{
 const original=globalThis.fetch,order=[],controller=new AbortController();const f=fixture({beforeRequest:async({task,signal})=>{assert.equal(task,'templateInit');assert.equal(signal,controller.signal);order.push('refresh');await Promise.resolve();f.data.revision++;},beforeSend:async scope=>{assert.equal(scope.world,worldKey(f.context));order.push('checked');}});
 const read=f.store.read;f.store.read=(...args)=>{order.push('read');return read(...args);};globalThis.fetch=async()=>{order.push('sent');return Response.json({choices:[{message:{content:'新资料草稿'},finish_reason:'stop'}]});};
 try{assert.equal(await f.host.request('templateInit',definition,{signal:controller.signal}),'新资料草稿');assert.equal(order[0],'refresh');assert.equal(order[1],'read');assert.deepEqual(order.slice(-3),['checked','read','sent']);}finally{globalThis.fetch=original;}
});

test('failed or cancelled refresh stops before configuration assembly and request dispatch',async()=>{
 for(const scenario of ['failure','cancelled','already-cancelled']){
  const controller=new AbortController();let calls=0;const f=fixture({beforeRequest:async()=>{calls++;if(scenario==='failure')throw Error('来源刷新失败');controller.abort();}});f.store.read=()=>{throw Error('must not assemble before refresh succeeds');};if(scenario==='already-cancelled')controller.abort();
  await assert.rejects(f.host.request('templateInit',definition,{signal:controller.signal}),scenario==='failure'?/来源刷新失败/:{name:'AbortError'});assert.equal(calls,scenario==='already-cancelled'?0:1);
 }
});

test('workspace refresh cannot carry an existing input into another chat or replaced chat state',async()=>{
 for(const change of [f=>{f.context.chatId='other';},f=>{f.context.chat=[];},f=>{f.context.chatMetadata={};}]){
  const f=fixture({beforeRequest:async()=>{await Promise.resolve();change(f);}});f.store.read=()=>{throw Error('must not compile old input in changed chat');};
  await assert.rejects(f.host.request('templateInit',definition,{typedInput:definition}),/刷新资料期间世界或聊天已变化/);
 }
});

test('a stale workspace, scope switch or cancellation during the checkpoint blocks the network send',async()=>{
 const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;throw Error('unexpected network send');};
 try{
  const stale=fixture({beforeSend:async()=>{throw Error('世界书已在外部改变');}});await assert.rejects(stale.host.request('templateInit',definition),/世界书已在外部改变/);
  const switched=fixture({beforeSend:async()=>{switched.context.chatId='other';}});await assert.rejects(switched.host.request('templateInit',definition),/世界或配置已变化/);
  const controller=new AbortController(),cancelled=fixture({beforeSend:async()=>controller.abort()});await assert.rejects(cancelled.host.request('templateInit',definition,{signal:controller.signal}),{name:'AbortError'});
  assert.equal(sends,0);
 }finally{globalThis.fetch=original;}
});

test('custom executors also stop before receiving stale workspace material',async()=>{
 const prior=registry.executors.get('templateInit');let runs=0;registry.executors.set('templateInit',{run:async()=>{runs++;}});
 try{const f=fixture({beforeSend:async()=>{throw Error('世界书已在外部改变');}});await assert.rejects(f.host.request('templateInit',definition),/世界书已在外部改变/);assert.equal(runs,0);}finally{if(prior)registry.executors.set('templateInit',prior);else registry.executors.delete('templateInit');}
});

test('each tool round checkpoints the workspace and an external edit prevents the next network request',async()=>{
 const original=globalThis.fetch;
 try{for(const changeAfterFirst of [false,true]){
  const order=[];let externalChange=false,disposed=false;
  const f=fixture({beforeSend:async()=>{order.push('checked');if(externalChange)throw Error('工具轮次间世界书已改变');},openArchiveQuery:async()=>({assertFresh:async()=>{},search_archive:async()=>({items:[],total:0,has_more:false}),dispose(){disposed=true;}})});
  f.context.chatCompletionSettings.function_calling=true;f.context.isToolCallingSupported=()=>true;
  let sends=0;globalThis.fetch=async()=>{order.push('sent');sends++;if(sends===1){externalChange=changeAfterFirst;return Response.json({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'query1',type:'function',function:{name:'tisya_search_archive',arguments:JSON.stringify({sheet:formatSimpleSheet({query:'旧约定'})})}}]}}]});}return Response.json({choices:[{finish_reason:'stop',message:{content:'查询结束'}}]});};
  let sourceChecks=0;const pending=f.host.request('tableAssistant',{storage:{ready:true},registry:tableRegistry,currentRows:[],question:'查询旧约定'},{verifySources:async()=>{sourceChecks++;}});
  if(changeAfterFirst){await assert.rejects(pending,/工具轮次间世界书已改变/);assert.equal(sends,1);assert.deepEqual(order,['checked','sent','checked']);}
  else{assert.equal(await pending,'查询结束');assert.equal(sends,2);assert.deepEqual(order,['checked','sent','checked','sent']);}
  assert.equal(disposed,true);
  assert.equal(sourceChecks,2);
 }}finally{globalThis.fetch=original;}
});
