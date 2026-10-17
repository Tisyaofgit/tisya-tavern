import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {TABLE_MODES,SIMPLE_TABLE_TASKS,compileTaskMode} from '../tables/modes.js';
import {AUX_TASKS} from '../tables/prompts.js';
import {prepareCompactFill} from '../tables/compact-fill.js';
import {TASK_PROFILES} from '../tables/task-profiles.js';
import {SLOT_NAMES,SLOT_TARGETS} from '../tables/slots.js';
import {cardAIMaterials,cardDefinitionSource,bookAIMaterials} from '../tables/card-source.js';
import {historyEvidence,prepareCommit} from '../tables/ledger.js';
import {defaultRegistry} from '../tables/schema.js';

const configuration={data:emptyConfig(),world:defaultWorld()};
const input={goal:'核对原始定义',sourceCardRaw:{fields:{name:'源卡',description:'原始定义 {{user}} <not-a-macro> 0 false null'},entries:[{id:7,content:'格式：<receipt>完整值</receipt>'}]},sourceHistory:[{floor:1,role:'user',text:'原始用户 {{user}}'},{floor:2,role:'assistant',text:'<body>实际事件</body><memory>旧摘要</memory>'}],sourceBooks:[],registry:defaultRegistry(),currentRows:[]};
function compact(task,value){const plan=prepareCompactFill(task,value);return {...value,compactFill:{contract:plan.contract,modelInput:plan.modelInput,modelState:plan.modelState}};}
function slot(messages,name){const text=messages.find(m=>m.content.startsWith('[TISYA.DATA.'+name.toUpperCase()+']\n'))?.content;assert(text,name);return JSON.parse(text.split('\n').slice(2,-1).join('\n'));}

test('remaining legacy operations retain their own authorization and material routing',()=>{
 assert.deepEqual(Object.keys(TABLE_MODES).sort(),[...Object.keys(TASK_PROFILES),...SIMPLE_TABLE_TASKS].sort());
 const tasks=Object.keys(TABLE_MODES).filter(task=>!SIMPLE_TABLE_TASKS.includes(task)),authorizations=new Set();
 for(const task of tasks){
  const p=pairedPreset({task,configuration}),messages=taskMessages({preset:p,task,input:{registry:{tables:[],types:[]},currentRows:[]}});
  authorizations.add(p.entries.tisya_user_relation);
  assert.match(p.entries.tisya_user_relation,/\[MODE.AUTHORIZE\]/);assert.match(p.entries.tisya_registry,/@NORMS/);assert.match(p.entries.tisya_inner_chain,/\[FILL.1\]/);
  const content=messages.map(m=>m.content).join('\n');assert(content.indexOf('[MATERIALS]')<content.indexOf('[REGISTRY]'));assert(content.indexOf('[REGISTRY]')<content.indexOf('[INNER.LOGIN]'));
  assert.equal(new Set(p.prompts.map(x=>x.identifier)).size,p.prompts.length);assert.equal(p.prompts.filter(x=>x.tisyaMaterialSlot).length,Object.keys(SLOT_NAMES).length);
 }
 assert.equal(authorizations.size,tasks.length);assert.equal(new Set(Object.values(SLOT_TARGETS)).size,Object.keys(SLOT_TARGETS).length);
});

test('six migrated modes contain business instructions only and retain task supplements',()=>{
 for(const task of SIMPLE_TABLE_TASKS){
  const cfg=structuredClone(configuration);cfg.world.tables={taskInstructions:{[task]:'用户补充：保留海岛称谓。'}};
  const built=pairedPreset({task,configuration:cfg});
  const compiled=compileTaskMode({compiledBase:{rest:{entries:{main:'旧正文',tisya_inner_chain:'旧流程',tisya_registry:'旧结构'}}},configuration:cfg},task,AUX_TASKS[task].instructions);
  for(const content of [Object.values(built.entries).join('\n'),Object.values(compiled.rest.entries).join('\n')]){
   assert.match(content,/保留海岛称谓/);assert.match(content,/表格/);
   assert.doesNotMatch(content,/strict JSON|schemaChanges|templates:|artifacts|new:|expected:|FILL\.1|MODE\.ANALYZE|旧流程|旧结构/);
  }
  assert.throws(()=>taskMessages({preset:built,task,input}),/需要.*准备.*表格/);
 }
});

test('material values survive prepared fill messages without source macro expansion',()=>{
 const before=structuredClone(input),p=pairedPreset({task:'templateInit',configuration});
 const messages=taskMessages({preset:p,task:'templateInit',input:compact('templateInit',input),substitute:s=>s.replaceAll('{{user}}','MUST_NOT_REPLACE_SOURCE')}),text=messages.map(m=>m.content).join('\n');
 for(const value of [input.sourceCardRaw.fields.description,...input.sourceHistory.map(x=>x.text)])assert(text.includes(value));
 assert.deepEqual(input,before);assert.doesNotMatch(text,/MUST_NOT_REPLACE_SOURCE|\[REGISTRY\]|FILL\.1/);
 assert.throws(()=>taskMessages({preset:p,task:'historyImport',input}),/任务不匹配/);
});

test('large source layers retain every record, Unicode and final sentinel without a summarizing substitute',()=>{
 const full=structuredClone(input);full.sourceHistory=Array.from({length:100},(_,i)=>({floor:i+1,role:i%2?'assistant':'user',text:`楼层${i+1}：`+'甲🙂𠮷\n'.repeat(1000)+`完整尾哨${i+1}`}));
 const messages=taskMessages({preset:pairedPreset({task:'templateInit',configuration}),task:'templateInit',input:compact('templateInit',full)}),text=messages.map(m=>m.content).join('\n');
 for(const record of full.sourceHistory)assert(text.includes(record.text));assert(text.includes('完整尾哨100'));
});

test('AI notices retain complete rules and format examples while scripts remain only in the original card',()=>{
 const rule='必须输出 <trainee_opportunity>\n类别|名称|条件\n</trainee_opportunity>';
 const card={data:{name:'卡',description:'完整设定',system_prompt:'系统原文',mes_example:'仅作示例',first_mes:'备选开场',character_book:{entries:[{id:1,content:rule,enabled:true},{id:2,content:'关闭定义',enabled:false},{id:3,content:'@@preprocessing\n<% execute_code() %>动态内容',enabled:true}]},extensions:{tavern_helper:{scripts:[{type:'script',content:'RUNTIME_SCRIPT()'}]},regex_scripts:[{replaceString:'DISPLAY_IMPLEMENTATION'}]}}};
 const original=structuredClone(card),material=cardAIMaterials(card);
 assert.equal(material.entries[0].content,rule);assert.equal(material.fields.mes_example,'仅作示例');assert.equal(material.runtimeSources.length,1);
 assert.doesNotMatch(JSON.stringify(material),/RUNTIME_SCRIPT|DISPLAY_IMPLEMENTATION|execute_code/);
 assert.equal(material.inactiveEntries[0].content,'关闭定义');assert.equal(material.inactiveEntries[0].enabled,false);assert.doesNotMatch(cardDefinitionSource(card),/关闭定义/); assert.match(cardDefinitionSource(card),/系统原文/);assert.doesNotMatch(cardDefinitionSource(card),/仅作示例|备选开场/);assert.deepEqual(card,original);
 const books=bookAIMaterials([{book:'书',entry:'普通',content:rule},{book:'书',entry:'动态',content:'<% TEMPLATE_CODE() %>'}]);assert.equal(books[0].content,rule);assert.equal(books[1].content,'');assert(books[1].runtimeSource);
});

test('manual multi-reply history keeps every body and interleaved user definition, excludes auxiliary evidence',()=>{
 const raw='用户设定甲\n<reply><body>第一件事。<memory>不可信旧摘要</memory></body><status>不可信旧状态</status></reply>\n用户设定乙\n<reply><body>第二件事。</body><vars>不可信命令</vars></reply>';
 const text=historyEvidence(raw);for(const part of ['用户设定甲','第一件事。','用户设定乙','第二件事。'])assert(text.includes(part));assert.doesNotMatch(text,/不可信|<body>|<reply>/);
});

test('manual old or undated history cannot overwrite current sourced state, later evidenced time can',()=>{
 const registry=defaultRegistry(),access={readers:['读者'],knowers:[]},view={registry,rows:[{id:'scene',table:'scene',rev:1,values:{名称:'当前',当前时间:'2026-10-12 12:00',场景:'城内'},access,source:'known'}],anchors:[{row:'scene',worldTime:'2026-10-12 12:00'}],last:null};
 const proposal={changes:[{id:'scene',table:'scene',expected:1,values:{场景:'城外'},access,evidence:'抵达城外'}]};
 for(const worldTime of [null,'未知','2026-10-12 11:59'])assert.throws(()=>prepareCommit(view,proposal,{source:null,kind:'import',evidence:'抵达城外',worldTime,allowedTables:['scene']}),/不能覆盖已有当前状态/);
 assert.equal(prepareCommit(view,proposal,{source:null,kind:'import',evidence:'2026-10-12 12:01 抵达城外',worldTime:'2026-10-12 12:01',allowedTables:['scene']}).rows[0].values.场景,'城外');
});


test('prepared archive messages preserve source boundaries and put missing requirements in pending',()=>{
 const material={archiveSource:{text:'客人说稍后回来。'},userSource:{text:'旧余额为NaN；绝对钟点未知。'},registry:defaultRegistry(),currentRows:[]};
 for(const task of ['objectArchive','historyImport','tableArchive']){
  const messages=taskMessages({preset:pairedPreset({task,configuration}),task,input:compact(task,material)}),text=messages.map(m=>m.content).join('\n');
  assert(text.includes(material.archiveSource.text));assert(text.includes(material.userSource.text));
  assert.match(messages[0].content,/必要内容写入待处理/);assert.match(messages[0].content,/未知留空/);assert.match(messages[0].content,/推测、转述与客观事实分开/);
  assert.doesNotMatch(text,/schemaChanges|new:|expected:|FILL\.1/);
 }
});


test('ordinary and review forms retain knowledge boundaries without altering source bytes',()=>{
 const material={archiveSource:{text:'乙感到屋内更暖。甲背着乙把暖气旋钮调到三档。'},userSource:{text:'乙知道暖气变热，但没看见旋钮。'},registry:defaultRegistry(),currentRows:[]},before=structuredClone(material);
 for(const [task,archiveProposal]of [['objectArchive',false],['historyImport',false],['tableArchive',false],['tableArchive',true]]){
  const messages=taskMessages({preset:pairedPreset({task,configuration,archiveProposal}),task,input:compact(task,material)}),norms=messages[0].content;
  assert.match(norms,/读者可见与人物知情分别核对/);assert.match(norms,/混合秘密与公开内容时拆开记录/);assert.match(norms,/感受到结果不等于知道隐蔽原因/);
  const text=messages.map(m=>m.content).join('\n');assert(text.includes(material.archiveSource.text));assert(text.includes(material.userSource.text));assert.deepEqual(material,before);
 }
});


test('prepared creation forms preserve source bytes and append only their own supplement once',()=>{
 for(const task of ['tableGenesis','assetAdapt']){
  const cfg=structuredClone(configuration);cfg.world.tables={taskInstructions:{[task]:'本任务补充 {{user}}',tableArchive:'OTHER_TASK_ONLY'}};
  const messages=[{role:'system',content:'填写给定的表格。'},{role:'user',content:'原始资料 {{user}}\n完整尾哨。'}],before=structuredClone(messages);
  const result=taskMessages({preset:pairedPreset({task,configuration:cfg}),task,input:{simpleForm:{messages}},selected:'选用说明 {{user}}',substitute:s=>s.replaceAll('{{user}}','测试用户')});
  assert.deepEqual(result.slice(0,messages.length),messages);assert.deepEqual(messages,before);const text=result.map(m=>m.content).join('\n');
  assert.equal(text.split('本任务补充 测试用户').length-1,1);assert.equal(text.split('选用说明 测试用户').length-1,1);assert.doesNotMatch(text,/OTHER_TASK_ONLY|schemaChanges|FILL\.1|strict JSON/);
 }
});
