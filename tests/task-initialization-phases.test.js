import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createHost} from '../config/host.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {parseSimpleSheet,formatSimpleSheet} from '../tables/simple-sheet.js';
import {tableRegistry} from '../v3/host-runtime.mjs';
import {archiveSourceView,restoreArchiveSource} from '../tables/archive-source-view.js';

const configuration={data:emptyConfig(),world:defaultWorld()};
const literal='{{user}}🙂𠮷';
const definitions={phase:'definition',goal:'建立底档',sourceCard:'AGGREGATE_MUST_NOT_DUPLICATE',sourceCardRaw:{fields:{name:'源卡',description:'卡原句'+literal},entries:[{id:7,content:'卡内定义哨兵'}]},sourceBooks:[{book:'绑定书',entry:'规则',uid:3,content:'书原句哨兵'}],sourceSupplement:'补充原句'+literal,registry:tableRegistry,currentRows:[],constraints:{sourceKind:'native'}};
const opening={phase:'opening',confirmedTemplate:{kind:'confirmed-definition',name:'源卡',rowIds:['friend'],reference:'definition:1'},sourceCardRaw:{fields:{description:'开局原始定义哨兵'}},sourceBooks:[{book:'绑定书',entry:'初值',uid:3,content:'开局世界书哨兵'}],sourceSupplement:'初始化补充原句哨兵',sourceUser:{id:'persona-a',objectId:'new:opening-user',name:'旅人',description:'原生人设'+literal},selectedOpening:{id:'native:0',label:'当前开局',kind:'chat',text:'开局正文'+literal},userSetup:'开局补充哨兵',registry:tableRegistry,currentRows:[{id:'friend',table:'objects',rev:1,values:{名称:'同伴',类型:'character',描述:'已确认底档哨兵'},access:{readers:['读者'],knowers:[]}}]};
const slot=(messages,key)=>{
 const value=messages.find(m=>m.content.startsWith('[TISYA.DATA.'+key.toUpperCase()+']\n'))?.content;
 assert(value,key+' must be present');return parseSimpleSheet(value.split('\n').slice(2,-1).join('\n'));
};
const compile=(input)=>taskMessages({preset:pairedPreset({task:'templateInit',configuration,phase:input.phase}),task:'templateInit',input,substitute:s=>s.replaceAll('{{user}}','SOURCE_WAS_EXPANDED')});
const count=(text,needle)=>text.split(needle).length-1;

test('native definition request carries card, bound book and optional supplement once with definition-only authorization',()=>{
 const before=structuredClone(definitions),messages=compile(definitions),text=messages.map(m=>m.content).join('\n');
 assert.deepEqual(slot(messages,'card'),definitions.sourceCardRaw);
 assert.deepEqual(slot(messages,'books'),definitions.sourceBooks);
 assert.equal(slot(messages,'source').sourceSupplement,definitions.sourceSupplement);
 assert.equal(slot(messages,'state').phase,'definition');
 for(const marker of ['卡原句','卡内定义哨兵','书原句哨兵','补充原句'])assert.equal(count(text,marker),1,marker);
 assert.doesNotMatch(text,/AGGREGATE_MUST_NOT_DUPLICATE|SOURCE_WAS_EXPANDED|SOURCE.sourceUser→程序独占/);
 assert.match(text,/@PHASE definition/);assert.match(text,/Keep initial.changes empty/);assert.match(text,/typed optional fields and linked subtables/);assert.doesNotMatch(text,/templates and schemaChanges stay empty/);
 assert.doesNotMatch(text,/Schemas must not embed this save|整理完整原卡 AI 须知、绑定定义、用户人设和原始历史/);
 assert.deepEqual(definitions,before);
});

test('opening request carries one selected opening, native user, confirmed template and supplement without re-running definition extraction',()=>{
 const before=structuredClone(opening),messages=compile(opening),text=messages.map(m=>m.content).join('\n'),source=slot(messages,'source');
 assert.deepEqual(source.selectedOpening,opening.selectedOpening);assert.deepEqual(source.sourceUser,opening.sourceUser);assert.deepEqual(slot(messages,'state').confirmedTemplate,opening.confirmedTemplate);assert.deepEqual(slot(messages,'card'),opening.sourceCardRaw);assert.deepEqual(slot(messages,'books'),opening.sourceBooks);assert.equal(source.sourceSupplement,opening.sourceSupplement);assert.equal(source.userSetup,opening.userSetup);
 assert.deepEqual(slot(messages,'state').rows,opening.currentRows);
 for(const marker of ['开局正文','原生人设','已确认底档哨兵','开局补充哨兵','开局原始定义哨兵','开局世界书哨兵','初始化补充原句哨兵'])assert.equal(count(text,marker),1,marker);
 assert.match(text,/@PHASE opening/);assert.match(text,/never emit a change for it/);assert.match(text,/不覆盖已有进度/);
 assert.doesNotMatch(text,/SOURCE_WAS_EXPANDED|读取用户人设和聊天|Keep initial.changes empty|renames〈列表〉/);
 assert.equal(messages.some(m=>m.content.startsWith('[TISYA.DATA.HISTORY]')),false);
 assert.deepEqual(opening,before);
});

test('specialized preset cannot silently accept a different initialization phase; legacy phase-free calls retain original contract',()=>{
 const preset=pairedPreset({task:'templateInit',configuration,phase:'definition'});
 assert.throws(()=>taskMessages({preset,task:'templateInit',input:opening}),/阶段不匹配/);
 const legacy=pairedPreset({task:'templateInit',configuration});
 assert.match(legacy.entries.tisya_user_relation,/整理完整原卡 AI 须知、绑定定义、用户人设和原始历史/);
 for(const id of ['tisya_new_chat','main','tisya_identity_attestation'])assert.equal(preset.entries[id],legacy.entries[id]);
});

test('actual config host request compiles the input phase into the final transport messages',async()=>{
 const data=emptyConfig(),context={chatId:'chat',characterId:0,characters:[{avatar:'card.png'}],chatMetadata:{},chat:[],extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'fixture-model',chat_completion_source:'openai'},getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({}),substituteParams:s=>s.replaceAll('{{user}}','SOURCE_WAS_EXPANDED')};
 data.worlds[worldKey(context)]=defaultWorld();
 const store=createStore({getContext:()=>context,persist:async()=>true});
 const host=createHost({getContext:()=>context,store,getSource:()=>{throw Error('native preset must not be used');},createParameters:async(settings,model,type,messages)=>({generate_data:{model,messages}})});
 const originalFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/backends/chat-completions/generate');requests.push(JSON.parse(options.body));return new Response(JSON.stringify({choices:[{message:{content:formatSimpleSheet({schemaChanges:[],templates:[],notes:[],base:{templates:[],changes:[]},initial:{templates:[],changes:[]}}),role:'assistant'},finish_reason:'stop'}]}),{status:200,headers:{'content-type':'application/json'}});};
 try{
  for(const input of [definitions,opening])await host.request('templateInit','not a JSON snapshot',{typedInput:input});
  assert.equal(requests.length,2);
  const first=requests[0].messages,second=requests[1].messages;
  assert.match(first.find(m=>m.content.startsWith('[REGISTRY]')).content,/@PHASE definition/);
  assert.match(second.find(m=>m.content.startsWith('[REGISTRY]')).content,/@PHASE opening/);
  assert.equal(slot(first,'source').sourceSupplement,definitions.sourceSupplement);
  assert.equal(slot(second,'source').selectedOpening.text,opening.selectedOpening.text);
  assert.deepEqual(host.preview().messages,second);
 }finally{globalThis.fetch=originalFetch;}
});


test('native history task wire preserves exact source, adjacent user definitions, floor and verified or unknown story time',()=>{
 const prose='历史正文唯一哨兵：旅人把钥匙交给同伴。'+('桥下有水声。'.repeat(100))+literal;
 const raw='<reply><title>古桥 | 未知</title><body>'+prose+'</body><memory>旧摘要辅助哨兵</memory><vars>旧变量辅助哨兵</vars></reply>';
 const projection=archiveSourceView({key:'native-source',floor:7,role:'assistant',text:raw});
 const material={...projection,historyText:projection.archiveSource.text,userSource:{sources:[{key:'native-user',floor:6,role:'user',text:'用户定义唯一哨兵'}]},label:'所选楼层',worldTime:null,registry:tableRegistry,currentRows:[]};
 const messages=taskMessages({preset:pairedPreset({task:'historyImport',configuration}),task:'historyImport',input:material,substitute:s=>s.replaceAll('{{user}}','SOURCE_WAS_EXPANDED')}),text=messages.map(m=>m.content).join('\n');
 const source=slot(messages,'source'),history=slot(messages,'history');
 assert.equal(source.archiveSource.floor,7);assert.equal(source.userSource.sources[0].floor,6);assert.equal(restoreArchiveSource(history[0],source.archiveSource),raw);
 assert.deepEqual(slot(messages,'state').historySelection,{label:'所选楼层',worldTime:null});
 for(const marker of ['历史正文唯一哨兵','旧摘要辅助哨兵','旧变量辅助哨兵','用户定义唯一哨兵'])assert.equal(count(text,marker),1,marker);
 assert.match(text,/cannot as|不能作为独立事件证据/);assert.doesNotMatch(text,/SOURCE_WAS_EXPANDED|\[NATIVE\.ARCHIVE\]/);
 const known={...material,worldTime:'2026-10-25 01:00'};
 const dated=taskMessages({preset:pairedPreset({task:'historyImport',configuration}),task:'historyImport',input:known});
 assert.equal(slot(dated,'state').historySelection.worldTime,known.worldTime);
});
