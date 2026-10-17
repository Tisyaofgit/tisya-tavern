import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createHost} from '../config/host.js';
import {createBookGateway} from '../tables/books.js';
import {createTableService} from '../tables/service.js';

// Author-review permissions only: this is not a character-knowledge permission test.
const op=(id,table,values,evidence,expected=0)=>({id,table,expected,values,access:{readers:['读者'],knowers:[]},evidence});
function fixture(){
 const data=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a.png',name:'甲'}],chat:[{is_user:false,mes:'开场白'}],extensionSettings:{[KEY]:data},getRequestHeaders:()=>({csrf:'test'})};
 data.worlds[worldKey(c)]=defaultWorld();data.worlds[worldKey(c)].tables={injection:'direct'};
 const store=createStore({getContext:()=>c,persist:async()=>true}),saved=new Map(),binding={primary:'角色原书',additional:['数据库资料']};let nextUid=1;
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{assert(saved.has(name));return structuredClone(saved.get(name));},createWorldbook:async(name,entries)=>{if(saved.has(name))return false;saved.set(name,entries.map(entry=>({...structuredClone(entry),uid:nextUid++})));return true;},updateWorldbookWith:async(name,fn)=>{const entries=fn(structuredClone(saved.get(name)));saved.set(name,entries);return structuredClone(entries);},getCharWorldbookNames:async name=>{assert.equal(name,'current');return structuredClone(binding);},rebindCharWorldbooks:async(name,value)=>{assert.equal(name,'current');Object.assign(binding,value);}};
 const books=createBookGateway(()=>helper,()=>c),calls=[];let responder=async()=>({changes:[],templates:[]});
 const makeService=(overrides={})=>createTableService({store,getContext:()=>c,books,request:async(task,text)=>{calls.push({task});return task==='ruleReview'?{issues:[]}:responder(task,JSON.parse(text));},...overrides});
 const set=async fields=>{const snapshot=store.read();snapshot.data.worlds[snapshot.key].tables={...snapshot.world.tables,...fields};await store.save(snapshot.data,snapshot.revision,snapshot.key);};
 return {c,store,saved,calls,service:makeService(),makeService,set,responder:value=>responder=value};
}

// Independent candidate: reuses the existing recovery test's exact small fixture.
// This exercises component integration only; not a substitute for actual raw-data readback.
test('two-phase archive reload is discoverable through all four controlled assistant tools without writes',async()=>{
 const f=fixture();await f.service.initialize();await f.set({objectsSeparate:true});
 f.c.chat=[{is_user:false,name:'甲',mes:'新城门已开启。'},{is_user:true,name:'用户',mes:'继续'}];
 f.responder((task,input)=>task==='objectArchive'?{changes:[op('new:gate','objects',{名称:'新城门',类型:'place'},'新城门')]}:{changes:[op('new:open','state',{名称:'新城门开闭',对象:input.currentRows.find(r=>r.id==='new:gate').id,字段:'开闭',值:'开启'},'新城门已开启。')]});
 const result=await f.service.archive({includeLatest:true,range:{from:1,to:1,limit:1}});
 assert.equal(result.archived,1);assert.deepEqual(f.calls.map(x=>x.task),['objectArchive','historyImport']);
 const restored=f.makeService(),info=await restored.inspect(),gate=info.rows.find(r=>r.table==='objects'),state=info.rows.find(r=>r.table==='state');
 assert.equal(info.session.commits.filter(x=>x.kind==='history').length,1);assert.equal(state.values.对象,gate.id);
 Object.assign(f.c,{chatCompletionSettings:{function_calling:true,model:'fixture-model',chat_completion_source:'custom',custom_api_format:'openai_compat'},getChatCompletionModel:s=>s.model,isToolCallingSupported:()=>true,substituteParams:s=>s,getPresetManager:()=>({getAllPresets:()=>[]})});
 let service;
 const host=createHost({store:f.store,getContext:()=>f.c,getSource:()=>({prompts:[]}),openArchiveQuery:(task,input,options)=>{assert.equal(task,'tableAssistant');return service.openAssistantArchiveQuery(input,options);},createParameters:async(settings,model,type,messages,options)=>({generate_data:{messages,model,...options.toolData}})});
 service=f.makeService({request:(...args)=>host.request(...args)});
 const prior=JSON.stringify([...f.saved]),oldFetch=globalThis.fetch;let requests=0;
 const names=['tisya_list_archive','tisya_describe_fields','tisya_search_archive','tisya_read_archive'];
 const args=[{path:'/'},{path:'/tables/state'},{path:'/tables/objects',query:'新城门',select:['名称']},{id:state.id,select:['对象','值']}];
 globalThis.fetch=async(_url,options)=>{
  const payload=JSON.parse(options.body);assert.deepEqual(payload.tools.map(t=>t.function.name),names);requests++;
  if(requests===1)return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:names.map((name,i)=>({id:'batch-'+i,type:'function',function:{name,arguments:JSON.stringify(args[i])}}))}}]});
  assert.equal(requests,2);const receipts=payload.messages.slice(-4);assert.deepEqual(receipts.map(r=>r.tool_call_id),names.map((_,i)=>'batch-'+i));
  const [directory,fields,search,read]=receipts.map(r=>JSON.parse(r.content));
  for(const r of [directory,fields,search,read]){assert.equal(r.status,'ok');assert.equal(r.scope.task,'tableAssistant-review');}
  assert(directory.items.some(r=>r.path==='/tables/objects'));assert(fields.items.some(r=>r.path.join('.')==='值'));
  assert.equal(search.items[0].id,gate.id);assert(read.items.some(r=>r.path.join('.')==='值'&&r.value==='开启'));assert(read.items.some(r=>r.path.join('.')==='对象'&&r.value===gate.id));
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'已查询存档。',changes:[],backfill:null,genesisGoal:''})}}]});
 };
 try{const draft=await service.assistant.ask('查阅刚归档的新城门及开闭状态');assert.equal(draft.changes.length,0);assert.equal(requests,2);assert.equal(host.preview().response.totalCalls,4);assert.equal(JSON.stringify([...f.saved]),prior);assert.equal((await f.makeService().inspect()).rows.find(r=>r.table==='state').values.对象,gate.id);}
 finally{globalThis.fetch=oldFetch;}
});
