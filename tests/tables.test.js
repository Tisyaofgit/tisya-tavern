import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey,resolveRoute,registry} from '../config/core.js';
import {defaultRegistry,addTypes,registryIndex,formula,derive,validateRow} from '../tables/schema.js';
import {createBookGateway} from '../tables/books.js';
import {sources,project,prepareCommit,retrieval,taskTags} from '../tables/ledger.js';
import {createTableService} from '../tables/service.js';
import {createNativeVectors} from '../tables/vectors.js';
const access={readers:['读者'],knowers:[]};
const blank=()=>({registry:defaultRegistry(),rows:[],last:null});
const op=(id,table,values,evidence='源',expected=0)=>({id,table,expected,values,access,evidence});
function fixture(nativeConfig=null){
 const d=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a.png',name:'甲'}],chat:[{is_user:false,mes:'开场白'}],extensionSettings:{[KEY]:d},getRequestHeaders:()=>({csrf:'test'})};d.worlds[worldKey(c)]=defaultWorld();d.worlds[worldKey(c)].tables={injection:'direct'};
 const store=createStore({getContext:()=>c,persist:async()=>true}),saved=new Map(),binding={primary:'角色原书',additional:['数据库资料']};let nextUid=1,writeHook=null;
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{assert(saved.has(name));return structuredClone(saved.get(name));},createWorldbook:async(name,entries)=>{if(saved.has(name))return false;saved.set(name,entries.map(e=>({...structuredClone(e),uid:nextUid++})));return true;},updateWorldbookWith:async(name,fn)=>{await writeHook?.();const entries=fn(structuredClone(saved.get(name)));saved.set(name,entries);return structuredClone(entries);},getCharWorldbookNames:async()=>structuredClone(binding),rebindCharWorldbooks:async(_,b)=>{Object.assign(binding,b);}};
 const books=createBookGateway(()=>helper),calls=[],prompts=[];let responder=async()=>({changes:[],templates:[]});
 const service=createTableService({store,getContext:()=>c,books,nativeConfig,request:async(task,text,opts)=>{calls.push({task,input:JSON.parse(text),signal:opts.signal});return responder(task,JSON.parse(text));},setPrompt:(text,filter)=>prompts.push({text,filter})});
 const set=async fields=>{const snap=store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,...fields};await store.save(snap.data,snap.revision,snap.key);};
 return {c,d,store,helper,books,saved,binding,calls,prompts,service,set,responder:f=>responder=f,writeHook:f=>writeHook=f};
}
const ai=text=>({is_user:false,name:'甲',mes:text});const user=text=>({is_user:true,name:'用户',mes:text});
test('twelve shared forms keep typed zero, false and null; reject nonexistent fields',()=>{
 const v=blank();assert.equal(v.registry.tables.length,12);
 const p=prepareCommit(v,{changes:[op('new:a','state',{名称:'全局旗标',对象:'new:b',字段:'次数',值:0}),op('new:b','objects',{名称:'城门',类型:'地点',属性:{特征:'石门'}})]},{source:'s',kind:'archive',evidence:'源',allowedTables:['state','objects']});
 assert.equal(p.rows[0].values.值,0);assert.notEqual(p.rows[0].values.对象,'new:b');assert.equal(p.commit.anchors.length,2);assert.equal(p.commit.anchors[0].worldTime,null);
 assert.throws(()=>prepareCommit(v,{changes:[op('new:a','objects',{名称:'A',类型:'place',不存在:1})]},{source:'s',evidence:'源',allowedTables:['objects']}),/未知字段/);
 const r={id:'x',table:'state',values:{名称:'值',对象:'x',字段:'是否',值:false},access};assert.equal(validateRow(v.registry,r).values.值,false);r.values.值=null;assert.equal(validateRow(v.registry,r).values.值,null);
});
test('canonical type registry reuses aliases and rejects synonym and inheritance collisions',()=>{
 const r=defaultRegistry();assert.equal(registryIndex(r).types.get('npc').id,'character');
 assert.throws(()=>addTypes(r,[{id:'person2',name:'角色',aliases:[],parent:'character',version:1,fields:{特征:{type:'text'}}}]),/复用已有/);
 const n=addTypes(r,[{id:'ship',name:'船舶',aliases:['舰船'],parent:'item',version:1,fields:{吨位:{type:'number'}}}]);assert.equal(registryIndex(n).types.get('舰船').id,'ship');
 assert.throws(()=>addTypes(n,[{id:'ship2',name:'车辆',aliases:['舰船'],parent:'item',version:1,fields:{容量:{type:'number'}}}]),/同义名称/);
});
test('form formulas cannot execute arbitrary code or read a more restricted row',()=>{
 const r=defaultRegistry();r.tables.find(t=>t.id==='facts').fields.总数={type:'number',formula:{op:'count',args:[{op:'lookup',table:'facts',match:'验证状态',field:'名称',args:['确认']}]}};
 const rows=[{id:'a',table:'facts',values:{名称:'公开',验证状态:'确认'},access},{id:'b',table:'facts',values:{名称:'隐藏',验证状态:'确认'},access:{readers:[],knowers:[]}}];assert.equal(derive(rows,r)[0].values.总数,1);
 assert.throws(()=>formula({op:'eval',args:['globalThis.alert(1)']},rows[0],rows),/公式无效/);
});
test('worldbook binding preserves original and database books, persistence survives service recreation',async()=>{
 const f=fixture();await f.service.initialize();assert.equal(f.binding.primary,'角色原书');assert(f.binding.additional.includes('数据库资料'));assert.equal(f.binding.additional.length,2);assert.equal(f.saved.size,2);for(const entries of f.saved.values())assert.equal(entries[0].enabled,false);
 const first=f.store.read().world.tables.originBook;f.c.chatId='two';await f.service.initialize();assert.equal(f.store.read().world.tables.originBook,first);assert.equal(f.saved.size,3);assert.notEqual(f.store.read().world.tables.sessionBook,'');
});
test('book CAS rejects stale and unknown writes without replacing unrelated entries',async()=>{
 const f=fixture();const snap=await f.books.create('origin','a','book');f.saved.get('book').push({uid:99,name:'unrelated',content:'KEEP'});
 const next=structuredClone(snap.data);next.revision++;await f.books.write(snap,next);assert.equal(f.saved.get('book')[1].content,'KEEP');await assert.rejects(f.books.write(snap,next),/其他页面/);
});
test('disabled feature and memoryless greeting issue no auxiliary calls',async()=>{
 const f=fixture();assert.equal(await f.service.prepare(),null);assert.equal(f.calls.length,0);await f.service.initialize();await f.set({enabled:true,plot:false});const result=await f.service.prepare();assert.equal(f.calls.length,0);assert.match(result.text,/开场白/);
});
test('archive stays one assistant reply behind and retry discards candidate tags',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false});f.c.chat=[ai('开场'),user('去城门'),ai('<task>引用：城门</task><memory>抵达城门</memory>'),user('继续'),ai('<task>引用：被丢弃的名字</task><memory>最新候选</memory>')];
 await f.service.prepare('swipe');const archiveCalls=f.calls.filter(c=>c.task==='tableArchive');assert.equal(archiveCalls.length,1);assert.equal(archiveCalls[0].input.archiveSource.text,'开场');assert(!JSON.stringify(f.calls).includes('被丢弃的名字'));assert.match(f.service.preview().text,/引用：城门/);
 f.calls.length=0;await f.service.prepare('swipe');assert.equal(f.calls.length,0);
});
test('source fingerprints invalidate an edited prefix and dependent records',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false});f.c.chat=[ai('门是红色'),user('继续'),ai('最新')];f.responder(async(_,input)=>({templates:[],changes:[op('new:door','objects',{名称:'城门',类型:'place',描述:'红色'},input.archiveSource.text)]}));
 await f.service.prepare();assert.equal((await f.service.inspect()).rows.length,1);f.c.chat[0].mes='门是蓝色';assert.equal((await f.service.inspect()).rows.length,0);assert.equal((await f.service.inspect()).origin.bases.length,1);
});
test('old API completion after chat switch cannot write either worldbook',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false});f.c.chat=[ai('旧楼层'),user('继续'),ai('最新')];const before=JSON.stringify([...f.saved]);f.responder(async()=>{f.c.chatId='other';return {changes:[],templates:[]};});await assert.rejects(f.service.prepare(),/聊天、候选或配置已改变/);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(f.prompts.at(-1).text,'');
});
test('floor scanner, limited batches and repeat runs skip confirmed rows',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('第一层'),user('第二层'),ai('第三层'),user('第四层'),ai('最新层')];const scan=await f.service.scan();assert.deepEqual(scan.map(x=>x.floor),[1,2,3,4,5]);assert.equal(scan.at(-1).latest,true);
 await f.service.archive({range:{from:1,to:5,limit:1}});assert.equal(f.calls.length,1);assert.equal(f.calls[0].task,'historyImport');assert.equal(f.calls[0].input.archiveSource.floor,1);
 await f.service.archive({range:{from:1,to:5,limit:5}});assert.equal(f.calls.length,2);assert.equal(f.calls[1].input.archiveSource.floor,3);await f.service.archive({range:{from:1,to:5,limit:5}});assert.equal(f.calls.length,2);
});
test('handwritten import has review draft, original provenance, unknown time and duplicate guard',async()=>{
 const f=fixture();await f.service.initialize();f.responder(async()=>({templates:[],changes:[op('new:history','events',{名称:'旧事',经过:'曾到过城门'},'曾到过城门')]}));const before=JSON.stringify([...f.saved]);const draft=await f.service.importHistory('曾到过城门');assert.equal(JSON.stringify([...f.saved]),before);await f.service.saveHistory(draft);const data=await f.service.inspect();assert.equal(data.rows[0].table,'events');assert.equal(data.anchors[0].worldTime,null);assert.equal(data.session.commits[0].importSource.text,'曾到过城门');await assert.rejects(f.service.importHistory('曾到过城门'),/已导入/);
});
test('Genesis uses the same forms, retains base versions and pins only chosen session',async()=>{
 const f=fixture();await f.service.initialize();f.responder(async()=>({blueprint:{name:'北门',goal:'创建北门',decisions:['创建北门'],unresolved:[]},checklist:[],artifacts:{registry:defaultRegistry(),base:{templates:[],changes:[op('new:gate','objects',{名称:'北门',类型:'place'},'创建北门')]},initial:{templates:[],changes:[]}},workflow:{id:'gate',name:'城门',version:1,steps:[]}}));const draft=await f.service.genesis('创建北门');await f.service.saveGenesis(draft);const data=await f.service.inspect();assert.equal(data.rows[0].values.名称,'北门');assert.equal(data.origin.bases.length,1);f.c.chatId='other';await f.service.initialize();assert.equal((await f.service.inspect()).rows.length,0);await f.service.pinOrigins([data.origin.bases[0].id+'@1']);assert.equal((await f.service.inspect()).rows[0].values.名称,'北门');
});
test('plot API remains a proposal and explicit preference constraints reach context',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:true,hardRules:['禁止使用套话甲']});f.responder(async task=>task==='plotAdvance'?{goal:'到达门口',beats:[],pendingChoices:['是否进入'],constraints:['禁止使用套话甲']}:{changes:[],templates:[]});const result=await f.service.prepare();assert.match(result.text,/禁止使用套话甲/);assert.match(result.text,/是否进入/);assert.equal((await f.service.inspect()).rows.length,0);
});
test('preference task rejects unsupported evidence and inference promoted to hard rule',()=>{
 const v=blank();assert.throws(()=>prepareCommit(v,{changes:[op('new:p','preferences',{名称:'偏好',性质:'推测偏好',强度:'必须'},'源')]},{source:'u',kind:'preferences',evidence:'源',allowedTables:['preferences']}),/推测偏好/);assert.throws(()=>prepareCommit(v,{changes:[op('new:p','preferences',{名称:'偏好'},'没有说过')]},{source:'u',kind:'preferences',evidence:'源',allowedTables:['preferences']}),/连续原文/);
});
test('auxiliary routes inherit main connection and model without roleplay preset',()=>{
 const d=emptyConfig(),w=defaultWorld();w.context.owner='tisya';d.routes.tasks.main={connection:'target:main',model:'MODEL',preset:'ROLEPLAY'};const r=resolveRoute(d,w,'tableArchive');assert.equal(r.connection,'target:main');assert.equal(r.model,'MODEL');assert.equal(r.preset,'tisya:tableArchive');assert.equal(registry.tasks.get('historyImport').isolated,true);
});
test('keyword retrieval includes last-turn named constants independently of history count',()=>{
 const v=blank();v.rows=[{id:'a',table:'objects',values:{名称:'北门',类型:'place',别名:['旧城门']},access},{id:'e',table:'events',values:{名称:'抵达旧城门',经过:'守卫检查证件'},access}];const tags=taskTags('<task>引用：旧城门</task>');const result=retrieval(v,{tags,query:'去旧城门'});assert.equal(result.mandatory[0].id,'a');assert.equal(result.optional[0].id,'e');
});
test('vector index is isolated, removes stale sources and never trusts returned text',async()=>{
 const requests=[],c={extensionSettings:{vectors:{source:'openai',openai_model:'embed'}},getRequestHeaders:()=>({})};let hash;const vector=createNativeVectors({getContext:()=>c,fetcher:async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body});if(url.endsWith('/insert'))hash=body.items[0].hash;return {ok:true,json:async()=>url.endsWith('/list')?[123]:{hashes:[hash],metadata:[{text:'fake fact'}]}};}});const row={id:'a',table:'events',rev:1,values:{名称:'真事件'},access};const result=await vector.search({scope:'session1',rows:[row],query:'事件',topK:1});assert.equal(result[0],row);assert(requests.some(r=>r.url.endsWith('/delete')&&r.body.hashes[0]===123));assert(requests.every(r=>r.body.collectionId.startsWith('tisya-table-')));
 const broken=createNativeVectors({getContext:()=>c,fetcher:async()=>({ok:false,status:500})});await assert.rejects(broken.search({scope:'x',rows:[row],query:'事件',topK:1}),/未降级/);
});

test('source memory is archived verbatim even if filler changes no fields',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false});const summary='事件：北门|A|抵达门口';f.c.chat=[ai('<title>场景：北门|2026-10-12 10:00|北门|世界</title><memory>'+summary+'</memory>'),user('继续'),ai('暂存')];await f.service.prepare();const data=await f.service.inspect();assert.equal(data.rows.find(r=>r.table==='events').values.经过,summary);assert.equal(data.anchors[0].worldTime,'2026-10-12 10:00');
});
test('template editor adds safe columns and tables but cannot mutate an existing field type',async()=>{
 const f=fixture();await f.service.initialize();let data=await f.service.inspect(),next=structuredClone(data.registry);next.types[0].fields.习惯={type:'text'};await f.service.saveTemplates(next,data.origin.revision);data=await f.service.inspect();assert.equal(data.registry.types[0].version,2);next=structuredClone(data.registry);next.types[0].fields.身份={type:'number'};await assert.rejects(f.service.saveTemplates(next,data.origin.revision),/已有字段不可改变/);
});
test('pausing an API before it returns leaves source unarchived and retry succeeds',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('旧楼层'),user('继续'),ai('暂存')];let release;f.responder(async()=>new Promise(resolve=>release=resolve));const pending=f.service.archive({range:{from:1,to:3,limit:1}});while(!release)await new Promise(r=>setTimeout(r,5));f.service.clear();release({changes:[],templates:[]});await assert.rejects(pending);assert.equal((await f.service.scan())[0].archived,false);f.responder(async()=>({changes:[],templates:[]}));await f.service.archive({range:{from:1,to:3,limit:1}});assert.equal((await f.service.scan())[0].archived,true);
});
test('same-size backfill batches advance beyond already processed floors',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('一'),user('u'),ai('二'),user('u'),ai('三')];await f.service.archive({range:{from:1,to:5,limit:1}});await f.service.archive({range:{from:1,to:5,limit:1}});assert.deepEqual(f.calls.map(c=>c.input.archiveSource.floor),[1,3]);
});
test('manual correction guards only changed fields and does not swallow later unrelated changes',()=>{
 const view=blank();const first=prepareCommit(view,{changes:[op('new:a','objects',{名称:'城门',类型:'place',描述:'红门'},'源')]},{source:'s',kind:'manual',evidence:'源',allowedTables:['objects']});const row=first.rows[0];const v={...view,rows:first.rows};assert.throws(()=>prepareCommit(v,{changes:[op(row.id,'objects',{描述:'蓝门'},'源',row.rev)]},{source:'s2',kind:'archive',evidence:'源',allowedTables:['objects']}),/人工锁定/);assert.equal(prepareCommit(v,{changes:[op(row.id,'objects',{标签:['城防']},'源',row.rev)]},{source:'s2',kind:'archive',evidence:'源',allowedTables:['objects']}).rows[0].values.标签[0],'城防');
});

test('native-mode auxiliary default follows the actual native main connection',()=>{
 const d=emptyConfig(),w=defaultWorld();d.routes.tasks.main={connection:'target:unused',model:'INACTIVE'};const r=resolveRoute(d,w,'tableArchive');assert.equal(r.connection,'native');assert.equal(r.model,'');d.routes.tasks.tableArchive={connection:'target:chosen',model:'FILL'};assert.equal(resolveRoute(d,w,'tableArchive').model,'FILL');
});
test('configuration UI can bind books, scan floors and backfill without memory blocks',async()=>{
 const {Window}=await import('happy-dom');const {mountTablePanel}=await import('../tables/panel.js');const w=new Window(),container=w.document.createElement('div');w.document.body.append(container);const f=fixture();f.c.chat=[ai('旧正文'),user('继续'),ai('暂存')];
 const panel=mountTablePanel(w.document,container,{service:f.service,store:f.store});await panel.ready;const click=async text=>{const button=[...panel.root.querySelectorAll('button')].find(x=>x.textContent===text);assert(button,text);await button.onclick();};
 await click('创建／绑定世界书');assert.equal(f.saved.size,2);await click('历史补录');assert.match(panel.root.textContent,/待补录 1 条/);await click('开始／继续补录所选楼层');assert.equal(f.calls[0].task,'historyImport');assert.match(panel.root.textContent,/待补录 0 条/);assert.equal(panel.requestLeave().allowed,true);panel.dispose();await w.happyDOM.abort();
});
test('older floor cannot overwrite a field whose current source is later',()=>{
 const view=blank();view.rows=[{id:'x',table:'scene',rev:1,source:'later',values:{名称:'场面',地点:'北门'},access}];assert.throws(()=>prepareCommit(view,{changes:[op('x','scene',{地点:'南门'},'源',1)]},{source:'earlier',kind:'history',evidence:'源',sourceOrder:{later:20,earlier:2},allowedTables:['scene']}),/旧楼层不能覆盖/);
});

test('native blue/green projection keeps journals out, promotes previous names and uses native budget',async()=>{
 const {worldbookEntries,createWorldbookProjection}=await import('../tables/worldbook-context.js');
 const rows=[{id:'gate',table:'objects',values:{名称:'北门',别名:['北城门'],类型:'place'},access},{id:'south',table:'objects',values:{名称:'南门',类型:'place'},access},{id:'flag',table:'state',values:{名称:'开闭状态',对象:'gate',字段:'开闭',值:false},access},{id:'scene',table:'scene',values:{名称:'当前场景',地点:'北门'},access}];
 const entries=worldbookEntries({rows,registry:defaultRegistry(),scope:'session-one',tags:['北城门'],temporary:{text:'刚刚抵达门口'}});
 assert.equal(entries.length,5);assert.equal(entries.find(e=>e.comment==='南门').constant,false);assert.equal(entries.find(e=>e.comment==='北门').constant,true);assert.equal(entries.find(e=>e.comment==='开闭状态').constant,true);assert(entries.every(e=>e.ignoreBudget===false&&e.preventRecursion&&e.excludeRecursion));assert(!entries.some(e=>e.content.includes('commits')));
 let valid=true;const bridge=createWorldbookProjection({getContext:()=>({eventTypes:{WORLDINFO_ENTRIES_LOADED:'loaded',WORLD_INFO_ACTIVATED:'active'}})});bridge.install(entries,()=>{if(!valid)throw Error('changed');});assert.throws(()=>bridge.selectedText(),/未经过/);
 const database={world:'database',uid:1,content:'数据库'};const payload={chatLore:[database]};bridge.entriesLoaded(payload);bridge.entriesLoaded(payload);assert.equal(payload.chatLore.length,6);assert.equal(payload.chatLore[0],database);
 bridge.activated([database,entries[0],entries[1]]);assert.match(bridge.selectedText(),/北门/);assert(!bridge.selectedText().includes('数据库'));assert.equal(bridge.preview().active.length,2);assert.equal(bridge.preview().active[1].light,'绿');valid=false;assert.throws(()=>bridge.selectedText(),/changed/);bridge.entriesLoaded({chatLore:[]});bridge.clear();assert.equal(bridge.selectedText(),'');
});
test('worldbook service injects control once and puts archived rows through native activation',async()=>{
 const f=fixture();f.c.eventTypes={WORLDINFO_ENTRIES_LOADED:'loaded',WORLD_INFO_ACTIVATED:'active'};await f.service.initialize();await f.set({enabled:true,plot:false,injection:'worldbook'});
 await f.service.edit({changes:[op('new:gate','objects',{名称:'北门',类型:'place'},'用户手动修改表单')],templates:[]});
 const prepared=await f.service.prepare();assert(!prepared.text.includes('"values"'));const payload={chatLore:[]};f.service.worldbook.entriesLoaded(payload);assert(payload.chatLore.some(e=>e.comment==='北门'&&!e.constant));assert(payload.chatLore.some(e=>e.tisyaTable.id==='latest-temporary'));f.service.worldbook.activated(payload.chatLore.filter(e=>e.constant));assert(!f.service.worldbook.selectedText().includes('北门'));assert.match(f.service.worldbook.selectedText(),/开场白/);f.service.clear();assert.equal(f.service.worldbook.selectedText(),'');
});
test('worldbook mode has explicit compatibility error instead of silently changing injection',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false,injection:'worldbook'});await assert.rejects(f.service.prepare(),/缺少原生世界书扫描事件/);assert.equal(f.store.read().world.tables.injection,'worldbook');
});

test('preference analysis creates candidates; only explicit confirmation is injectable',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false,preferences:true,archive:false});f.c.chat=[ai('开场'),user('少用旁白解释'),ai('暂存')];f.responder(async()=>({templates:[],changes:[op('new:prefer','preferences',{名称:'旁白偏好',内容:'少用旁白解释',性质:'明确要求',强度:'必须',启用:true},'少用旁白解释')]}));
 let result=await f.service.prepare(),info=await f.service.inspect();assert.equal(result.slots.preferences.rows.length,0);assert.equal(info.rows.filter(r=>r.table==='preferences').length,0);assert.equal(info.preferenceDrafts.length,1);assert.equal(info.preferenceDrafts[0].status,'pending');await f.service.reviewPreference(info.preferenceDrafts[0].id,info.preferenceDrafts[0].proposal);result=await f.service.prepare();assert.equal(result.slots.preferences.rows.length,1);assert.equal(result.slots.preferences.rows[0].preferenceConfirmed,true);assert.equal(f.calls.length,1);await assert.rejects(f.service.reviewPreference(info.preferenceDrafts[0].id),/已处理/);
 f.c.chat[1].mes='保留适量旁白';result=await f.service.inspect();assert.equal(result.preferenceDrafts.length,0);assert.equal(result.rows.filter(r=>r.table==='preferences').length,0);
});
test('rejected preference is not retried or injected, and disabled preferences stay out',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false,preferences:true,archive:false});f.c.chat=[user('短句'),ai('暂存')];f.responder(async()=>({templates:[],changes:[op('new:p','preferences',{名称:'短句',性质:'推测偏好',强度:'偏好'},'短句')]}));await f.service.prepare();const info=await f.service.inspect();await f.service.reviewPreference(info.preferenceDrafts[0].id);const result=await f.service.prepare();assert.equal(f.calls.length,1);assert.equal(result.slots.preferences.rows.length,0);
});
test('Genesis validates the entire draft before writes and links base and initial-state time anchors',async()=>{
 const f=fixture();await f.service.initialize();const registry=defaultRegistry();registry.tables.push({id:'weather',name:'气象',aliases:[],version:1,owner:'archive',fields:{名称:{type:'text',required:true},天气:{type:'text'}}});const response={blueprint:{name:'城门',goal:'设计城门',decisions:['北门关闭，天空晴朗'],unresolved:[]},checklist:['核对门的状态'],artifacts:{registry,base:{templates:[],changes:[op('new:gate','objects',{名称:'北门',类型:'place'},'北门关闭')]},initial:{templates:[],changes:[op('new:gate-state','state',{名称:'门状态',对象:'new:gate',字段:'开闭',值:false},'北门关闭'),op('new:sky','weather',{名称:'气象',天气:'晴朗'},'天空晴朗')]}},workflow:{id:'gate',name:'城门推进',version:1,steps:[]}};
 f.responder(async()=>response);let draft=await f.service.genesis('设计城门');const before=JSON.stringify([...f.saved]);draft.proposal.artifacts.initial.changes[0].values.对象='missing';await assert.rejects(f.service.saveGenesis(draft),/关联对象不存在/);assert.equal(JSON.stringify([...f.saved]),before);draft=await f.service.genesis('设计城门');await f.service.saveGenesis(draft);const info=await f.service.inspect();assert.equal(info.rows.length,3);assert.equal(info.anchors.length,3);assert.equal(info.rows.find(r=>r.table==='state').values.对象,info.rows.find(r=>r.table==='objects').id);assert.equal(info.session.blueprint.workflow.id,'gate');assert(info.registry.tables.some(t=>t.id==='weather'));
});

test('explicit style rules remain available without enabled tables, books or auxiliary calls',async()=>{
 const f=fixture();await f.set({enabled:false,styleEnabled:false,hardRules:['保留短对白']});const context=f.service.rulesContext();assert.match(context.text,/保留短对白/);assert.doesNotMatch(context.text,/邪魅一笑/);assert.equal(f.saved.size,0);assert.equal(f.calls.length,0);assert.equal(await f.service.prepare(),null);
});

test('new custom table names participate in previous-turn tags and keyword retrieval',()=>{
 const view=blank();view.registry.tables.push({id:'weather',name:'气象',aliases:[],version:1,owner:'archive',fields:{名称:{type:'text',required:true},天气:{type:'text'}}});view.rows=[{id:'sky',table:'weather',values:{名称:'天空',天气:'晴朗'},access}];assert.equal(retrieval(view,{tags:['引用：天空']}).mandatory[0].id,'sky');assert.equal(retrieval(view,{query:'天空'}).optional[0].id,'sky');
});

test('first table use auto-creates card origin and independent session; repeated initialize is idempotent',async()=>{
 const f=fixture();await f.service.ensureInitialized();assert.equal(f.saved.size,0);await f.set({enabled:true,plot:false,archive:false});await f.service.ensureInitialized();assert.equal(f.saved.size,2);const before=f.store.read().revision,refs=f.store.read().world.tables;await f.service.initialize();await f.service.prepare();assert.equal(f.saved.size,2);assert.equal(f.store.read().revision,before);assert.equal(f.binding.primary,'角色原书');assert(f.binding.additional.includes('数据库资料'));assert.equal(f.store.read().world.tables.sessionBook,refs.sessionBook);
 // Lost settings can recover deterministic books without duplicating stored data.
 await f.set({originBook:'',sessionBook:''});await f.service.ensureInitialized();assert.equal(f.saved.size,2);assert.equal(f.store.read().world.tables.sessionBook,refs.sessionBook);
});
test('manual forms/history work before memory setup without enabling automatic table processing',async()=>{
 const f=fixture();const data=await f.service.inspect();assert.equal(data.rows.length,0);assert.equal(f.saved.size,2);assert.equal(f.store.read().world.tables.enabled,false);assert.equal(await f.service.prepare(),null);
});

test('Genesis native creation runs after confirmed tables, saves explicit scope targets and supports retry without refilling',async()=>{
 let called=0,fail=true,received;const nativeConfig={resolveTargets:spec=>({...spec,worldbooks:spec.worldbooks.map(x=>({...x,target:'原预设'}))}),apply:async spec=>{called++;received=spec;if(fail)throw Error('宿主暂不可用');return [{kind:'世界书',name:'规则',status:'已创建'}];}};const f=fixture(nativeConfig);f.responder(async()=>({blueprint:{name:'测试',goal:'创建规则',decisions:['创建规则'],unresolved:[]},checklist:[],artifacts:{registry:defaultRegistry(),base:{templates:[],changes:[]},initial:{templates:[],changes:[]},native:{presets:[],regexes:[],worldbooks:[{name:'规则',scope:'preset',entries:[]}]}},workflow:{id:'setup',name:'初始化',version:1,steps:[]}}));
 const draft=await f.service.genesis('创建规则');assert.equal(called,0);await assert.rejects(f.service.saveGenesis(draft),e=>e.blueprintSaved&&/宿主/.test(e.message));const saved=await f.service.inspect(),revision=saved.session.revision;assert.equal(saved.session.blueprint.native.worldbooks[0].target,'原预设');fail=false;await f.service.applyNative();assert.equal(called,2);assert.equal(received.worldbooks[0].target,'原预设');assert.equal((await f.service.inspect()).session.revision,revision);
});
