import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage,NS} from '../engine/controller.mjs';
import {initializeState} from '../engine/materials.mjs';
import {baseline} from '../engine/config.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {acceptReply} from '../engine/reply.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';

const clone=structuredClone,catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
const reply=(n,archive=`事件|e${n}[雾历一日]：推门->看见信->留下线索(原文:P1)`)=>`<reply><task/><anchor phase="before"/><title>门前${n}|雾历一日|门口|雾城</title><body>1 第${n}次推门，看见信上留下的线索。</body><anchor phase="after"/><extra/><cells/><vars/>${archive===null?'':`<archive format="pipes">${archive}</archive>`}<actions/></reply>`;
async function fixture(){
 const macros=new Map(),ctx={chatId:'memory-chain',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(k,f)=>macros.set(k,f)};
 const storage=indexedStorage(new IDBFactory()),source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(s,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'char':s));
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand};
 const host=createMatrixHost(options);host.register();await host.import({state:initializeState(catalog,{session_ref:ctx.chatId,branch_ref:'main'})});
 async function accept(raw,type='normal'){
  if(type==='normal')ctx.chat.push({is_user:true,mes:'继续'});
  await host.before(type);const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));
  await host.payloadReady({messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))});
  if(type==='normal')ctx.chat.push({mes:raw});else ctx.chat.at(-1).mes=raw;
  await host.event('GENERATION_ENDED');return host.export();
 }
 return {ctx,host,options,storage,accept,cold:()=>createMatrixHost(options)};
}

test('actual host accepts every source and commits semantic event memory only beyond its two retained replies',async()=>{
 const f=await fixture();let saved=await f.accept(reply(1));
 assert.equal(saved.state.runtime.archive_queue.length,1);assert.equal(saved.state.runtime.archive.length,0);
 assert.equal(Object.values(saved.state.tables.T_SYS_SOURCE_FRAGMENTS).length,1);
 saved=await f.accept(reply(2));assert.equal(saved.state.runtime.archive.length,0);
 saved=await f.accept(reply(3));
 const events=Object.values(saved.state.tables.T_DYN_EVENTS);assert.equal(events.length,1,'archive pipes must actually reach the canonical event table');
 assert.equal(events[0].values.short_code,'e1');assert.equal(events[0].values.source_entry_id,f.ctx.chat[1].extra[NS].uid);
 assert.match(f.host.latest().materials.tisya_material_memory_archive,/e1/);assert.doesNotMatch(f.host.latest().materials.tisya_material_memory_archive,/e2|e3/);
 const cold=f.cold();await cold.sync();const reopened=await cold.export();assert.deepEqual(reopened.state,saved.state);
 assert.equal(Object.values(reopened.state.tables.T_SYS_ARCHIVE_BATCHES).length,3);
});

function seed(){
 const e=new Runtime(initializeState(catalog,{session_ref:'semantic-test',branch_ref:'main'}));
 for(const [id,name]of [['a','阿青'],['b','阿白']]){e.newRecord('T_CHAR_DOSSIER',{name},'d-'+id);e.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:id,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'d-'+id,reference_kind:'record',resolution_status:'resolved'},'o-'+id);e.newRecord('T_SYS_ENTITIES',{name,kind:'character',origin_record_ref:'o-'+id},id);}
 e.newRecord('T_STATIC_FACTS',{name:'门已打开',proposition:'门已经打开'},'fact');e.newRecord('T_DYN_EVENTS',{short_code:'e0',title:'先前开门',spine_digest:'先前开门'},'event');
 return e;
}
const routes=[
 ['引用','引用|阿青、门已打开',null],
 ['事件','事件|e1[雾历一日]：推门->看信->发现字迹(原文:P1)','T_DYN_EVENTS'],
 ['状态与流转','状态与流转|阿青|当前姿态：站立|P1','T_DYN_ENTITY_STATE'],
 ['资产流转','状态与流转|阿青|流转：流转类型：赠送；流转原因：递交物品|P1','T_DYN_TRANSFERS'],
 ['认知','认知|阿青|门已打开|K3亲历核实：亲眼看见|知道门已经打开 P1','T_DYN_COGNITION'],
 ...[['character','T_CHAR_DOSSIER'],['item','T_STATIC_ITEMS_SKILLS'],['place','T_STATIC_PLACES'],['organization','T_STATIC_ORGANIZATIONS'],['rule','T_STATIC_WORLD_RULES']].map(([kind,table])=>['新建档案/'+kind,`新建档案|${kind}|新${kind}|本轮明确展示的概貌 P1`,table]),
 ['事实发现','事实与底稿|事实发现|新事实；对象：阿青|门后有字迹|亲历核实 P1','T_STATIC_FACTS'],
 ['世界设定','事实与底稿|世界设定|新法则|门在落日时关闭|已验证 P1','T_STATIC_WORLD_RULES'],
 ['人物前史','事实与底稿|人物前史|阿青的往事|曾在渡口送信|当事人自述 P1','T_DYN_EVENTS'],
 ['关系底稿','事实与底稿|关系底稿|同伴；主体：阿青；对象：阿白|两人在渡口相识|双方确认 P1','T_CHAR_RELATION_ORIGINS'],
 ['隐情','隐情|旧伤；主体：阿青|旧伤来自过去的冲突 P1|外显线索：手腕旧疤','T_CHAR_SECRETS'],
 ['习惯锚点','习惯锚点|a01|阿青|e0|缩手|触到门把|自我防护|怕被抛下|愿意握手|0.6|刚形成 P1','T_CHAR_ANCHORS'],
 ['伏笔','伏笔|埋下|门后字迹|墙面出现刻痕 P1|公开范围：全体公开','T_DYN_CLUES'],
 ['场外事务','场外与日程|activities|送信；主体：阿青|自主目标：送到渡口；状态：进行；进度百分比：20|推进证据：已经出门 P1','T_DYN_ACTIVITIES_LIFELINES'],
 ['任务待办','场外与日程|tasks|送信；主体：阿青|目标事项：送信；状态：接受；接受证据：阿青答应送信|任务来源：村长 P1','T_DYN_TASKS'],
 ['日程倒计时','场外与日程|timers|暮钟；主体：阿青|状态：等待|时间基准：有效用户回合数；到期轮次：5 P1','T_DYN_TIMERS'],
 ['待定','待定|开门条件|缺少钥匙归属|明确钥匙主人','T_SYS_CELL_REQUESTS']
];
for(const [name,archive,table]of routes)test('declared semantic route reaches its registered table: '+name,()=>{
 const e=seed(),before=table?Object.keys(e.rows(table)).length:0;
 acceptReply(e,reply(1,archive),'m1');acceptReply(e,reply(2,''),'m2');acceptReply(e,reply(3,''),'m3');
 const batch=e.data.runtime.archive_queue[0];assert.equal(batch.status,'formal',JSON.stringify(batch.error));
 if(table)assert.equal(Object.keys(e.rows(table)).length,before+1,name);else assert.equal(e.data.runtime.sources['main/m1@1'].archive_references.length,2);
 assert.equal(Object.values(e.rows('T_SYS_ARCHIVE_BATCHES')).find(r=>r.values.message_ref==='m1').values.commit_status,'完成');
});

for(const value of [null,'这不是合法归档行'])test('missing or malformed archive stays visible as pending without discarding its source: '+String(value),async()=>{
 const f=await fixture();await f.accept(reply(1,value));await f.accept(reply(2,''));const saved=await f.accept(reply(3,''));
 const first=Object.values(saved.state.runtime.sources).find(s=>s.entry_id===f.ctx.chat[1].extra[NS].uid);
 assert.equal(first.reply_raw,reply(1,value));assert.equal(Object.keys(saved.state.tables.T_DYN_EVENTS).length,0);
 assert(f.host.latest().result.warnings.some(w=>/^ARCHIVE_/.test(w.code)),'unread archive must not silently count as empty successful memory');
 const batch=saved.state.runtime.archive_queue.find(b=>b.source_key.endsWith(first.entry_id+'@1'));assert.notEqual(batch.status,'formal');assert(batch.error||batch.warnings?.length);
});
