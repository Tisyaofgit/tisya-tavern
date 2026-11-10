import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createHost} from '../config/host.js';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createFoundationService} from '../tables/foundation-service.js';
import {personaSnapshot} from '../tables/persona.js';
import {SLOT_TARGETS} from '../tables/slots.js';
import catalog from '../engine/catalog.json' with {type:'json'};
import master from '../presets/Tisya-Matrix.json' with {type:'json'};

const copy=value=>structuredClone(value);
const reply='<reply><task/><anchor phase="before"/><title>来源提炼</title><body>1 只记录来源明确支持的事实。</body><anchor phase="after"/><extra/><cells>【双层历史事件／1】\n2 事件标题：推开渡口木门</cells><vars/><archive/><actions/></reply>';
function slot(messages,name,{raw=false}={}){
 const start='[TISYA.DATA.'+name.toUpperCase()+']\n';
 const material=messages.filter(message=>message.content.startsWith(start));
 assert.equal(material.length,1,'one actual '+name+' material slot');
 const body=material[0].content.split('\n').slice(2,-1).join('\n');
 return raw?body:JSON.parse(body);
}
function fixture({omitPromptEnabled=false}={}){
 const data=emptyConfig(),source={identity:['native-preset','world.png','consumer-chat'],prompts:copy(master.prompts),order:copy(master.prompt_order.find(row=>row.character_id===100001).order)};
 if(omitPromptEnabled)for(const prompt of source.prompts)if(prompt.enabled!==false)delete prompt.enabled;
 for(const [identifier,content,enabled,ordered]of [
  ['consumer_native','NATIVE_ENABLED_SENTINEL',undefined,true],
  ['consumer_prompt_off','PROMPT_DISABLED_SENTINEL',false,true],
  ['consumer_order_off','ORDER_DISABLED_SENTINEL',true,false]
 ]){
  source.prompts.push({identifier,role:'system',content,...(enabled===undefined?{}:{enabled})});
  source.order.splice(source.order.findIndex(row=>row.identifier==='tisya_material_boundary_close'),0,{identifier,enabled:ordered});
 }
 const card={avatar:'world.png',data:{name:'CARD_NAME_SENTINEL',description:'完整原卡 {{literal}} CARD_TEXT_SENTINEL',mes_example:'CARD_EXAMPLE_SENTINEL',first_mes:'CARD_OPENING_SENTINEL',character_book:{entries:[{id:1,content:'CARD_ENABLED_ENTRY',enabled:true},{id:2,content:'CARD_DISABLED_ENTRY',enabled:false}]}}};
 const ctx={chatId:'consumer-chat',characterId:0,groupId:null,characters:[card],chatMetadata:{},userAvatar:'reader.png',name1:'CONTRACTOR_NAME_SENTINEL',powerUserSettings:{persona_description:'CONTRACTOR_WISH_SENTINEL {{literal}}',personas:{'reader.png':'CONTRACTOR_STORED_NAME'},persona_descriptions:{'reader.png':{description:'CONTRACTOR_STORED_DESCRIPTION',position:0}}},extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'native-test-model',chat_completion_source:'openai',prompts:source.prompts},chat:[{is_user:true,mes:'开门',extra:{tisya_engine:{uid:'u1'}}},{is_user:false,mes:'我推开渡口木门。',extra:{tisya_engine:{uid:'a1'}}},{is_user:true,mes:'看看屋内',extra:{tisya_engine:{uid:'u2'}}},{is_user:false,mes:'屋内没有人。',extra:{tisya_engine:{uid:'a2'}}}],getChatCompletionModel:settings=>settings.model,getRequestHeaders:()=>({}),substituteParams:text=>text.replaceAll('{{literal}}','MACRO_SHOULD_NOT_RUN_IN_SOURCE')};
 const key=worldKey(ctx),world=data.worlds[key]=defaultWorld();
 data.resources=[{id:'selected',kind:'extension',name:'已选补充',content:'SELECTED_RESOURCE_SENTINEL',tasks:['templateInit','historyImport','tableGenesis']},{id:'off',kind:'extension',name:'已关闭补充',content:'DISABLED_RESOURCE_SENTINEL',tasks:['templateInit','historyImport','tableGenesis']},{id:'unselected',kind:'extension',name:'未选择补充',content:'UNSELECTED_RESOURCE_SENTINEL',tasks:['templateInit','historyImport','tableGenesis']}];
 world.modes.narrative.selected=['selected','off'];world.overrides.off='off';
 const store=createStore({getContext:()=>ctx,persist:async()=>true}),parameterCalls=[],bookReads=[],commits=[];
 const host=createHost({getContext:()=>ctx,getSource:()=>source,store,createParameters:async(settings,model,type,messages,options)=>{parameterCalls.push({settings:copy(settings),model,type,messages:copy(messages),options:copy(options)});return {generate_data:{messages,model}};}});
 const sourceEntries=[{uid:1,name:'已启用定义',content:'BOOK_ENABLED_SENTINEL {{literal}}',entry:{uid:1,comment:'已启用定义',content:'BOOK_ENABLED_SENTINEL {{literal}}',enabled:true}},{uid:2,name:'已停用定义',content:'BOOK_DISABLED_SENTINEL',entry:{uid:2,comment:'已停用定义',content:'BOOK_DISABLED_SENTINEL',enabled:false}}];
 const books={cardBooks:async avatar=>{assert.equal(avatar,card.avatar);return ['BOUND_BOOK_SENTINEL'];},listSources:async({book,kind})=>{bookReads.push({book,kind});assert.equal(book,'BOUND_BOOK_SENTINEL');return {exists:true,entries:copy(sourceEntries)};}};
 let snapshot={contextKey:'matrix-consumer-chat',revision:0,state:new Runtime(initializeState(catalog)).data};
 const database={read:async()=>copy(snapshot),commit:async input=>{
  assert.equal(input.contextKey,snapshot.contextKey);assert.equal(input.expectedRevision,snapshot.revision);
  const runtime=new Runtime(snapshot.state),result=runtime.transaction(input.operationId,input,()=>{
   for(const change of input.changes){
    if(!runtime.rows(change.tableId)[change.recordId])runtime.newRecord(change.tableId,{},change.recordId);
    for(const [field,value]of Object.entries(change.values??{}))runtime.set([change.tableId,change.recordId,field,[]],value,change.states?.[field]??'known');
    if(change.metadata)Object.assign(runtime.record(change.tableId,change.recordId).metadata,copy(change.metadata));
   }
   return {source:copy(input.source)};
  });assert.notEqual(result.status,'FAILED',JSON.stringify(result.error));
  snapshot={...snapshot,state:runtime.data,revision:snapshot.revision+1};commits.push(copy(input));return copy(snapshot);
 }};
 const inputs=[],foundation=createFoundationService({run:fn=>fn(),books,database,getContext:()=>ctx,ensureDatabase:async()=>{},request:async(task,input,options)=>{inputs.push({task,input:JSON.parse(input)});return host.request(task,input,options);}}).matrixFoundation;
 return {ctx,source,store,host,foundation,inputs,parameterCalls,bookReads,commits,get snapshot(){return snapshot;}};
}
function captureNetwork(t){
 const sent=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'/api/backends/chat-completions/generate');sent.push(JSON.parse(options.body));return new Response(JSON.stringify({choices:[{message:{content:reply},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});});
 return sent;
}

test('actual native request accepts order-owned enabled state and retains explicit prompt/order exclusions',async t=>{
 const sent=captureNetwork(t),f=fixture({omitPromptEnabled:true}),before=copy(f.source);
 await f.host.request('tableGenesis',{formContract:'tisya.simple-form/1',forms:'【人物原点档案／序号】\n1 显示名称',source:{text:'CREATION_SOURCE_SENTINEL {{literal}}'}});
 assert.equal(sent.length,1);const wire=sent[0].messages.map(message=>message.content).join('\n');
 for(const marker of ['NATIVE_ENABLED_SENTINEL','CREATION_SOURCE_SENTINEL {{literal}}','SELECTED_RESOURCE_SENTINEL','<reply id="tisya-onepass-1">','<anchor phase="before">','<anchor phase="after">','<cells format="form">','<vars/>','<archive/>'])assert(wire.includes(marker),marker);
 assert.doesNotMatch(wire,/PROMPT_DISABLED_SENTINEL|ORDER_DISABLED_SENTINEL|DISABLED_RESOURCE_SENTINEL|UNSELECTED_RESOURCE_SENTINEL|MACRO_SHOULD_NOT_RUN_IN_SOURCE/);
 assert.deepEqual(f.source,before);assert.equal(f.parameterCalls[0].type,'quiet');assert.equal(f.parameterCalls[0].options.allowToolCalls,false);
 assert.deepEqual(f.host.preview().messages,sent[0].messages);
});

test('real foundation initialization snapshots contractor, card and bound books into the final native request',async t=>{
 const sent=captureNetwork(t),f=fixture(),before={card:copy(f.ctx.characters[0]),persona:personaSnapshot(f.ctx),source:copy(f.source)};
 const draft=await f.foundation.generate({kind:'initialization',sourceKind:'card'});
 assert.equal(draft.phase,'ready');assert.equal(sent.length,1);assert.equal(f.inputs[0].task,'templateInit');
 const messages=sent[0].messages,source=slot(messages,'source'),card=slot(messages,'card'),books=slot(messages,'books'),wire=messages.map(message=>message.content).join('\n');
 assert.deepEqual(f.inputs[0].input.contractor,before.persona);assert.deepEqual(source.contractor,before.persona);
 assert.deepEqual(card,before.card);assert.equal(books[0].content,'BOOK_ENABLED_SENTINEL {{literal}}');assert.equal(books[0].enabled,true);assert.equal(books[1].content,'BOOK_DISABLED_SENTINEL');assert.equal(books[1].enabled,false);
 assert.equal(books[0].book,'BOUND_BOOK_SENTINEL');assert(f.bookReads.length>0);assert(f.bookReads.every(read=>read.book==='BOUND_BOOK_SENTINEL'&&read.kind==='all'));
 for(const value of ['CONTRACTOR_WISH_SENTINEL {{literal}}','CARD_EXAMPLE_SENTINEL','CARD_OPENING_SENTINEL','CARD_DISABLED_ENTRY','SELECTED_RESOURCE_SENTINEL'])assert(wire.includes(value),value);
 assert.doesNotMatch(wire,/UNSELECTED_RESOURCE_SENTINEL|DISABLED_RESOURCE_SENTINEL|MACRO_SHOULD_NOT_RUN_IN_SOURCE/);
 assert.equal(f.commits.length,1);assert(f.commits[0].changes.every(change=>change.tableId==='T_SYS_CELL_REQUESTS'));
 assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,0);assert.deepEqual(f.ctx.characters[0],before.card);assert.deepEqual(personaSnapshot(f.ctx),before.persona);assert.deepEqual(f.source,before.source);
});

test('history final request retains supplied story time and the confirmed-source policy',async t=>{
 const sent=captureNetwork(t),f=fixture();
 await f.foundation.generate({kind:'history',sourceKind:'text',label:'旧记录',text:'我推开渡口木门。',worldTime:'STORY_TIME_SENTINEL'});
 assert.equal(slot(sent[0].messages,'source').worldTime,'STORY_TIME_SENTINEL');
 assert.equal(slot(sent[0].messages,'history',{raw:true}),'我推开渡口木门。');
 await f.foundation.generate({kind:'history',sourceKind:'chat',from:1,to:4});
 assert.equal(slot(sent[1].messages,'source').policy,f.inputs[1].input.policy);
 assert.match(slot(sent[1].messages,'source').policy,/只有所选已确认AI回复/);
 assert.deepEqual(slot(sent[1].messages,'history'),[{floor:1,role:'user',text:'开门'},{floor:2,role:'assistant',text:'我推开渡口木门。'},{floor:3,role:'user',text:'看看屋内'}]);
 assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,0);
});

for(const disabledBy of ['prompt','order'])test('actual source slot disabled by '+disabledBy+' refuses dispatch instead of silently dropping card evidence',async t=>{
 const sent=captureNetwork(t),f=fixture({omitPromptEnabled:true});
 if(disabledBy==='prompt')f.source.prompts.find(prompt=>prompt.identifier===SLOT_TARGETS.card).enabled=false;
 else f.source.order.find(order=>order.identifier===SLOT_TARGETS.card).enabled=false;
 await assert.rejects(f.foundation.generate({kind:'initialization',sourceKind:'card'}),error=>/缺少来源资料槽：card/.test(error.message)&&error.draft?.phase==='failed');
 assert.equal(sent.length,0);assert.equal(f.parameterCalls.length,0);assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,0);
});
