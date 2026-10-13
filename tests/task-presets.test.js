import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {TABLE_MODES} from '../tables/modes.js';
import {TASK_PROFILES} from '../tables/task-profiles.js';
import {SLOT_NAMES,SLOT_TARGETS} from '../tables/slots.js';
import {cardAIMaterials,cardDefinitionSource,bookAIMaterials} from '../tables/card-source.js';
import {historyEvidence,prepareCommit} from '../tables/ledger.js';
import {defaultRegistry} from '../tables/schema.js';

const configuration={data:emptyConfig(),world:defaultWorld()};
const input={goal:'核对原始定义',sourceCardRaw:{fields:{name:'源卡',description:'原始定义 {{user}} <not-a-macro> 0 false null'},entries:[{id:7,content:'格式：<receipt>完整值</receipt>'}]},sourceHistory:[{floor:1,role:'user',text:'原始用户 {{user}}'},{floor:2,role:'assistant',text:'<body>实际事件</body><memory>旧摘要</memory>'}],sourceBooks:[],registry:defaultRegistry(),currentRows:[]};
function slot(messages,name){const text=messages.find(m=>m.content.startsWith('[TISYA.DATA.'+name.toUpperCase()+']\n'))?.content;assert(text,name);return JSON.parse(text.split('\n').slice(2,-1).join('\n'));}

test('all ten operations own distinct authorization, routing, procedure and norms in narrative preset order',()=>{
 assert.deepEqual(Object.keys(TABLE_MODES).sort(),Object.keys(TASK_PROFILES).sort());
 const authorizations=new Set(),routes=new Set(),workflows=new Set();
 for(const task of Object.keys(TABLE_MODES)){
  const p=pairedPreset({task,configuration}),messages=taskMessages({preset:p,task,input:{registry:{tables:[],types:[]},currentRows:[]}});
  authorizations.add(p.entries.tisya_user_relation);routes.add(p.entries.tisya_task_start);workflows.add(p.entries.tisya_inner_chain);
  assert.match(p.entries.tisya_user_relation,/\[MODE.AUTHORIZE\]/);assert.match(p.entries.tisya_task_start,/@DESTINATIONS/);assert.match(p.entries.tisya_registry,/@NORMS/);assert.match(p.entries.tisya_inner_chain,/\[FILL.1\]/);
  const content=messages.map(m=>m.content).join('\n');assert(content.indexOf('[MATERIALS]')<content.indexOf('[REGISTRY]'));assert(content.indexOf('[REGISTRY]')<content.indexOf('[INNER.LOGIN]'));assert.equal(messages.at(-1).role,'system');
  assert.equal(new Set(p.prompts.map(x=>x.identifier)).size,p.prompts.length);assert.equal(p.prompts.filter(x=>x.tisyaMaterialSlot).length,Object.keys(SLOT_NAMES).length);
 }
 assert.equal(authorizations.size,10);assert.equal(routes.size,10);assert.equal(workflows.size,10);assert.equal(new Set(Object.values(SLOT_TARGETS)).size,Object.keys(SLOT_TARGETS).length);
});

test('material values survive actual paired message assembly without source macro expansion',()=>{
 const before=structuredClone(input),p=pairedPreset({task:'templateInit',configuration});
 const messages=taskMessages({preset:p,task:'templateInit',input,substitute:s=>s.replaceAll('{{user}}','MUST_NOT_REPLACE_SOURCE')});
 assert.deepEqual(slot(messages,'card'),input.sourceCardRaw);assert.deepEqual(slot(messages,'history'),input.sourceHistory);assert.deepEqual(input,before);
 assert.throws(()=>taskMessages({preset:p,task:'historyImport',input}),/任务不匹配/);
 p.prompt_order[0].order.find(x=>x.identifier===SLOT_TARGETS.history).enabled=false;
 assert.throws(()=>taskMessages({preset:p,task:'templateInit',input}),/缺少来源资料槽/);
});

test('large source layers retain every record, Unicode and final sentinel without a summarizing substitute',()=>{
 const full=structuredClone(input);full.sourceHistory=Array.from({length:100},(_,i)=>({floor:i+1,role:i%2?'assistant':'user',text:`楼层${i+1}：`+'甲🙂𠮷\n'.repeat(1000)+`完整尾哨${i+1}`}));
 const messages=taskMessages({preset:pairedPreset({task:'templateInit',configuration}),task:'templateInit',input:full});
 assert.deepEqual(slot(messages,'history'),full.sourceHistory);assert(slot(messages,'history')[99].text.endsWith('完整尾哨100'));
});

test('AI notices retain complete rules and format examples while scripts remain only in the original card',()=>{
 const rule='必须输出 <trainee_opportunity>\n类别|名称|条件\n</trainee_opportunity>';
 const card={data:{name:'卡',description:'完整设定',system_prompt:'系统原文',mes_example:'仅作示例',first_mes:'备选开场',character_book:{entries:[{id:1,content:rule,enabled:true},{id:2,content:'关闭定义',enabled:false},{id:3,content:'@@preprocessing\n<% execute_code() %>动态内容',enabled:true}]},extensions:{tavern_helper:{scripts:[{type:'script',content:'RUNTIME_SCRIPT()'}]},regex_scripts:[{replaceString:'DISPLAY_IMPLEMENTATION'}]}}};
 const original=structuredClone(card),material=cardAIMaterials(card);
 assert.equal(material.entries[0].content,rule);assert.equal(material.fields.mes_example,'仅作示例');assert.equal(material.runtimeSources.length,1);
 assert.doesNotMatch(JSON.stringify(material),/RUNTIME_SCRIPT|DISPLAY_IMPLEMENTATION|execute_code|关闭定义/);
 assert.match(cardDefinitionSource(card),/系统原文/);assert.doesNotMatch(cardDefinitionSource(card),/仅作示例|备选开场/);assert.deepEqual(card,original);
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
