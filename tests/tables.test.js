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
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{assert(saved.has(name));return structuredClone(saved.get(name));},createWorldbook:async(name,entries)=>{if(saved.has(name))return false;saved.set(name,entries.map(e=>({...structuredClone(e),uid:nextUid++})));return true;},updateWorldbookWith:async(name,fn)=>{await writeHook?.();const entries=fn(structuredClone(saved.get(name)));saved.set(name,entries);return structuredClone(entries);},getCharWorldbookNames:async n=>{assert.equal(n,'current');return structuredClone(binding);},rebindCharWorldbooks:async(n,b)=>{assert.equal(n,'current');Object.assign(binding,b);}};
 const books=createBookGateway(()=>helper,()=>c),calls=[],prompts=[];let responder=async()=>({changes:[],templates:[]});
 const makeService=(overrides={})=>createTableService({store,getContext:()=>c,books,nativeConfig,request:async(task,text,opts)=>{calls.push({task,input:JSON.parse(text),signal:opts.signal});return task==='ruleReview'?{issues:[]}:responder(task,JSON.parse(text));},setPrompt:(text,filter)=>prompts.push({text,filter}),...overrides});const service=makeService();
 const set=async fields=>{const snap=store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,...fields};await store.save(snap.data,snap.revision,snap.key);};
 return {c,d,store,helper,books,saved,binding,calls,prompts,service,makeService,set,responder:f=>responder=f,writeHook:f=>writeHook=f};
}
const ai=text=>({is_user:false,name:'甲',mes:text});const user=text=>({is_user:true,name:'用户',mes:text});
test('genesis accepts reordered JSON object keys without schema revisions but rejects real field changes',async()=>{
 const f=fixture();await f.service.initialize();const before=await f.service.inspect();
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
 let registry=reorder(before.registry);const response=()=>({blueprint:{name:'顺序验收',goal:'保持现有结构',decisions:[],unresolved:[]},checklist:[],artifacts:{registry,base:{templates:[],changes:[]},initial:{templates:[],changes:[]}},workflow:{id:'key-order',name:'顺序验收',version:1,steps:[]}});
 f.responder(response);const draft=await f.service.genesis('保持现有结构');await f.service.saveGenesis(draft);assert.deepEqual((await f.service.inspect()).registry,before.registry);
 registry=reorder(before.registry);registry.tables.find(t=>t.id==='state').fields.值.type='number';await assert.rejects(f.service.genesis('保持现有结构'),/已有字段不可改变/);
 registry=reorder(before.registry);registry.tables.find(t=>t.id==='state').fields.有效性.values.reverse();await assert.rejects(f.service.genesis('保持现有结构'),/已有字段不可改变/);
 registry=reorder(before.registry);registry.tables.find(t=>t.id==='state').fields.值.formula={op:'add',args:[1,2]};await assert.rejects(f.service.genesis('保持现有结构'),/已有字段不可改变/);
});
test('genesis compares an upgraded effective schema with the same upgraded stored baseline',async()=>{
 const f=fixture();await f.service.initialize();let before=await f.service.inspect();const legacy=structuredClone(before.registry);legacy.types.find(t=>t.id==='rule').fields.自定义条款={type:'text'};await f.service.saveTemplates(legacy,before.origin.revision);
 before=await f.service.inspect();assert.equal(before.origin.registry.types.find(t=>t.id==='rule').fields.自定义条款.capture,undefined);assert.equal(before.registry.types.find(t=>t.id==='rule').fields.自定义条款.capture,'identity');
 let registry=structuredClone(before.registry);f.responder(()=>({blueprint:{name:'升级基准验收',goal:'沿用既有模板',decisions:[],unresolved:[]},checklist:[],artifacts:{registry,base:{templates:[],changes:[]},initial:{templates:[],changes:[]}},workflow:{id:'schema-upgrade',name:'升级基准验收',version:1,steps:[]}}));
 const draft=await f.service.genesis('沿用既有模板');await f.service.saveGenesis(draft);const after=await f.service.inspect();assert.deepEqual(after.registry,before.registry);assert.deepEqual(after.rows,before.rows);
 const saved=JSON.stringify([...f.saved]);registry=structuredClone(before.registry);delete registry.types.find(t=>t.id==='rule').fields.自定义条款.capture;await assert.rejects(f.service.genesis('沿用既有模板'),/已有字段不可改变/);assert.equal(JSON.stringify([...f.saved]),saved);
 registry=structuredClone(before.registry);registry.types.find(t=>t.id==='rule').fields.自定义条款.type='number';await assert.rejects(f.service.genesis('沿用既有模板'),/已有字段不可改变/);assert.equal(JSON.stringify([...f.saved]),saved);
});
test('initialization retains disabled AI sources without making them operative, and rejects changed raw material',async()=>{
 const f=fixture();f.c.characters[0].character_book={entries:[{id:1,enabled:true,content:'生效卡规则'},{id:2,enabled:false,content:'关闭卡规则'}]};
 f.saved.set('角色原书',[{name:'启用书条',enabled:true,content:'生效书规则'},{name:'关闭书条',enabled:false,content:'关闭书规则'}]);f.saved.set('数据库资料',[]);
 f.responder(()=>({base:{changes:[]},initial:{changes:[]},notes:[]}));const draft=await f.service.cardTemplate();const input=f.calls.at(-1).input;
 assert.equal(input.sourceCardRaw.inactiveEntries[0].content,'关闭卡规则');assert.equal(input.sourceBooks.find(x=>x.enabled===false).content,'关闭书规则');
 assert.doesNotMatch(draft.basis,/关闭卡规则|关闭书规则/);assert.match(draft.basis,/生效卡规则/);assert.match(draft.basis,/生效书规则/);
 assert(!f.calls.find(x=>x.task==='ruleReview').input.ruleSources.sources.some(x=>/关闭/.test(x.text)));
 f.saved.get('角色原书')[1].content='修改了关闭书规则';await assert.rejects(f.service.saveCardTemplate(draft),/原卡或历史资料已改变/);
 assert.equal((await f.service.inspect()).rows.length,0);
});
test('task cancellation is scoped, same-chat notifications are harmless and actual switches cancel',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('城门开放'),user('继续'),ai('暂存')];let release;
 f.responder(()=>new Promise(r=>release=r));
 let pending=f.service.archive({range:{from:1,to:3,limit:1}});while(!release)await new Promise(r=>setTimeout(r,1));
 assert.equal(f.service.contextChanged(),false);f.service.clear({scope:'generation'});assert.equal(f.calls.at(-1).signal.aborted,false);release({changes:[]});await pending;assert.equal((await f.service.scan())[0].archived,true);
 f.c.chat[0].mes='新来源';release=null;pending=f.service.archive({scope:'generation',range:{from:1,to:3,limit:1}});while(!release)await new Promise(r=>setTimeout(r,1));f.service.clear({scope:'generation',reason:'主聊天停止'});release({changes:[]});await assert.rejects(pending,/主聊天停止/);assert.equal(f.service.state().busy,false);
 release=null;pending=f.service.archive({range:{from:1,to:3,limit:1}});while(!release)await new Promise(r=>setTimeout(r,1));f.c.chatId='another';assert.equal(f.service.contextChanged(),true);assert.equal(f.calls.at(-1).signal.aborted,true);release({changes:[]});await assert.rejects(pending,/会话已切换/);
 f.c.chatId='one';f.service.contextChanged();assert.equal((await f.service.scan())[0].archived,false);
});
test('external AbortError is actionable and initialization can be retried without duplicate books',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];f.c.characters[0].description='北门是一座石门。';
 f.responder(()=>{throw new DOMException('The operation was aborted.','AbortError');});await assert.rejects(f.service.autoInitialize(),/辅助请求被宿主或 API 中止/);assert.equal(f.saved.size,2);assert.equal(f.service.state().busy,false);assert.match(f.service.state().jobs.at(-1).detail,/检查连接后重试/);
 f.responder(()=>({registry:defaultRegistry(),base:{changes:[op('new:gate','objects',{名称:'北门',类型:'place',属性:{}},'北门是一座石门。')]},initial:{changes:[]},notes:[]}));await f.service.autoInitialize();assert.equal(f.saved.size,2);assert.equal((await f.service.inspect()).rows.filter(r=>r.values.名称==='北门').length,1);
});
test('initializer dropdown uses selected mode and previews stay protected until saved or discarded',async()=>{
 const {Window}=await import('happy-dom'),{mountTablePanel}=await import('../tables/panel.js');const w=new Window(),f=fixture();f.binding.primary='';f.binding.additional=[];
 const panel=mountTablePanel(w.document,w.document.body,{service:f.service,store:f.store});await panel.ready;const select=panel.root.querySelector('[aria-label="表单功能"]');select.value='history';await select.onchange();
 const click=async text=>{const button=[...panel.root.querySelectorAll('button')].find(n=>n.textContent===text);assert(button,text);await button.onclick();};
 const mode=panel.root.querySelector('[aria-label="初始化来源"]');mode.value='generic';mode.dispatchEvent(new w.Event('input'));assert.equal(panel.requestLeave().allowed,true);await click('按所选来源建立表单');assert.equal(f.calls.length,0);assert.equal(f.saved.size,2);
 const reused=panel.root.querySelector('[aria-label="初始化来源"]');reused.value='reuse';reused.dispatchEvent(new w.Event('input'));await click('读取并预览初始化模板');assert.equal(f.calls.length,0);assert.equal(panel.requestLeave().allowed,false);const previewBox=[...panel.root.querySelectorAll('fieldset')].find(node=>node.querySelector('legend')?.textContent==='初始化草稿'),beforeSave=JSON.stringify([...f.saved]);assert(previewBox);select.value='forms';await select.onchange();assert.equal(select.value,'forms');assert.equal(JSON.stringify([...f.saved]),beforeSave);assert.equal(panel.requestLeave().allowed,false);select.value='history';await select.onchange();assert.equal(select.value,'history');assert(panel.root.contains(previewBox));assert.equal(JSON.stringify([...f.saved]),beforeSave);
 await click('保存模板');assert.equal(panel.requestLeave().allowed,true);assert.equal(panel.root.querySelector('[role=alert]'),null);panel.dispose();await w.happyDOM.abort();
});

test('native branch mappings retain dynamic maps and enforce nested read-only/prototype keys',async()=>{
 const {nativeBranches,bridgePatch}=await import('../tables/native-bridge.js');
 const stat={player:{bag:{key:{count:1}},_derived:7},$internal:{temporary:true}},cells=nativeBranches(stat);
 assert.equal(cells.length,1);assert.equal(cells[0].path,'/player');
 const row={id:'p',table:'native_cells',rev:1,values:{路径:'/player',值:stat.player}};
 const make=value=>({changes:[{id:'p',table:'native_cells',expected:1,values:{值:value},evidence:'new item'}]});
 const after={bag:{map:{count:1}},_derived:7};assert.deepEqual(bridgePatch([row],make(after),{stat_data:stat},'new item').operations,[{op:'replace',path:'/player/bag',value:after.bag}]);
 for(const bad of [{...after,_derived:8},{bag:{}},JSON.parse('{"bag":{"__proto__":{}},"_derived":7}')])assert.throws(()=>bridgePatch([row],make(bad),{stat_data:stat},'new item'));
});

test('native callbacks stage only their own writes and restore runtime hooks after failure',async()=>{
 const {parseNativeTransaction}=await import('../tables/native-bridge.js');
 const listeners=new Map(),writes=[],bus={makeFirst:(k,f)=>listeners.set(k,f),removeListener:(k,f)=>{if(listeners.get(k)===f)listeners.delete(k);}};
 const original=async(v,o)=>writes.push({v,o});
 const runtime={events:{VARIABLE_UPDATE_STARTED:'start'},getMvuData(){},replaceMvuData:original,async parseMessage(_,old){const v=structuredClone(old);listeners.get('start')(v);v.stat_data.n++;await this.replaceMvuData(v.stat_data,{type:'message'});await this.replaceMvuData({unrelated:true},{type:'chat'});return v;}};
 const r=await parseNativeTransaction({runtime,eventSource:bus,index:3,before:{stat_data:{n:0}},block:'generated',guard(){}});
 assert.equal(r.after.stat_data.n,1);assert.equal(r.stagedWrites,1);assert.deepEqual(writes,[{v:{unrelated:true},o:{type:'chat'}}]);assert.equal(runtime.replaceMvuData,original);assert.equal(listeners.size,0);
 runtime.parseMessage=async()=>{throw Error('parser failed');};await assert.rejects(parseNativeTransaction({runtime,eventSource:bus,index:3,before:{stat_data:{n:0}},block:'generated',guard(){}}),/parser failed/);assert.equal(runtime.replaceMvuData,original);assert.equal(listeners.size,0);
});

test('native bridge resumes saved outcome after write failure without repeating model or callback',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10,derived:0}}]]);let parses=0,fail=true;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;before.stat_data.energy=8;before.stat_data.derived=31;return before;},replaceMvuData:async(data,{message_id})=>{if(fail){fail=false;throw Error('write interrupted');}values.set(message_id,structuredClone(data));}};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('体能下降到8。'),user('继续')];await f.service.enableNativeBridge();
 f.responder(async(_,input)=>{const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'体能下降到8'}]};});
 await assert.rejects(f.service.syncNative(),/write interrupted/);assert.equal(parses,1);await f.service.syncNative();assert.equal(parses,1);assert.equal(f.calls.length,1);assert.equal(values.get(0).stat_data.derived,31);assert.equal(values.get(1).stat_data.derived,31);
 const view=await f.service.inspect();assert.equal(view.rows.find(r=>r.table==='native_cells'&&r.values.路径==='/derived').values.值,31);assert.equal((await f.service.syncNative()).already,true);
 }finally{globalThis.Mvu=previous;}
});

test('large card initialization retains over 200 definitions without loosening per-turn limits',()=>{
 const changes=Array.from({length:218},(_,i)=>op('new:o'+i,'objects',{名称:'定义'+i,类型:'rule',属性:{}},'源'));
 assert.equal(prepareCommit(blank(),{changes},{source:null,kind:'init',evidence:'源',allowedTables:['objects']}).rows.length,218);
 assert.throws(()=>prepareCommit(blank(),{changes},{source:'turn',kind:'archive',evidence:'源',allowedTables:['objects']}),/200/);
});
test('shared forms retain zero false null and register new typed fields',()=>{
 const v=blank();assert.equal(v.registry.tables.length,16);
 const p=prepareCommit(v,{changes:[op('new:a','state',{名称:'全局旗标',对象:'new:b',字段:'次数',值:0}),op('new:b','objects',{名称:'城门',类型:'地点',属性:{特征:'石门'}})]},{source:'s',kind:'archive',evidence:'源',allowedTables:['state','objects']});
 assert.equal(p.rows[0].values.值,0);assert.notEqual(p.rows[0].values.对象,'new:b');assert.equal(p.commit.anchors.length,2);assert.equal(p.commit.anchors[0].worldTime,null);
 const extended=prepareCommit(v,{changes:[op('new:a','objects',{名称:'A',类型:'place',新增数据:1})]},{source:'s',evidence:'源',allowedTables:['objects']});assert.equal(extended.registry.tables.find(t=>t.id==='objects').fields.新增数据.type,'number');
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
 await f.service.prepare('swipe');const archiveCalls=f.calls.filter(c=>c.task==='tableArchive');assert.equal(archiveCalls.length,2);assert.equal(archiveCalls[0].input.archiveSource.text,'开场');assert(!JSON.stringify(f.calls).includes('被丢弃的名字'));assert(!f.service.preview().text.includes('引用：城门'));assert.deepEqual(f.service.preview().tags,[]);
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

test('body archives without memory and does not copy contradictory old summary',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false});f.c.chat=[ai('<title>场景：北门|2026-10-12 10:00|北门|世界</title><body>抵达门口，尚未进入。</body><memory>已经进入城中</memory>'),user('继续'),ai('暂存')];
 f.responder((task,input)=>{assert.equal(input.archiveSource.text,'抵达门口，尚未进入。');return {changes:[op('new:event','events',{名称:'抵达北门',经过:'抵达门口，尚未进入。'},'抵达门口，尚未进入。')]};});
 await f.service.prepare();const data=await f.service.inspect();assert.equal(data.rows.find(r=>r.table==='events').values.经过,'抵达门口，尚未进入。');assert.equal(data.anchors[0].worldTime,'2026-10-12 10:00');assert(!JSON.stringify(data.rows).includes('已经进入城中'));
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
 const panel=mountTablePanel(w.document,container,{service:f.service,store:f.store});await panel.ready;const click=async text=>{const button=[...panel.root.querySelectorAll('button')].find(x=>x.textContent===text);if(button)return button.onclick();const select=panel.root.querySelector('[aria-label="表单功能"]'),option=[...select.options].find(o=>o.textContent===text);assert(option,text);select.value=option.value;return select.onchange();};
 await click('创建／绑定世界书');assert.equal(f.saved.size,2);await click('初始化与历史');assert.match(panel.root.textContent,/待补录 1 条/);await click('开始／继续补录所选楼层');assert.equal(f.calls[0].task,'historyImport');assert.match(panel.root.textContent,/待补录 0 条/);assert.equal(panel.requestLeave().allowed,true);panel.dispose();await w.happyDOM.abort();
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
test('genesis saves explicitly established initial knowledge while rejecting invented historical events atomically',async()=>{
 const f=fixture();await f.service.initialize();const goal='林棠知道北门。';
 const response={blueprint:{name:'初始认知',goal,decisions:[],unresolved:[]},checklist:[],artifacts:{registry:defaultRegistry(),base:{templates:[],changes:[op('new:person','objects',{名称:'林棠',类型:'character'},'林棠'),op('new:gate','objects',{名称:'北门',类型:'place'},'北门')]},initial:{templates:[],changes:[{...op('new:knowledge','cognition',{名称:'北门认知',主体:'new:person',事实:['new:gate'],认识:goal,授权依据:goal},goal),access:{readers:['读者'],knowers:['new:person']}}]}},workflow:{id:'knowledge',name:'初始认知',version:1,steps:[]}};
 f.responder(()=>response);let draft=await f.service.genesis(goal);draft.proposal.artifacts.initial.changes.push(op('new:past','events',{名称:'过去事件',经过:goal},goal));const savedBefore=JSON.stringify([...f.saved]);await assert.rejects(f.service.saveGenesis(draft),/该辅助任务不能修改此表/);assert.equal(JSON.stringify([...f.saved]),savedBefore);
 draft=await f.service.genesis(goal);await f.service.saveGenesis(draft);const info=await f.service.inspect(),person=info.rows.find(r=>r.values.名称==='林棠'),gate=info.rows.find(r=>r.values.名称==='北门'),knowledge=info.rows.find(r=>r.table==='cognition');assert.equal(info.rows.length,3);assert.equal(knowledge.values.主体,person.id);assert.deepEqual(knowledge.values.事实,[gate.id]);assert.deepEqual(knowledge.access.knowers,[person.id]);assert.equal(info.rows.filter(r=>r.table==='events').length,0);
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

test('retry reuses origin left by an old current-only binding failure',async()=>{
 const f=fixture(),bind=f.helper.rebindCharWorldbooks;f.helper.rebindCharWorldbooks=async()=>{throw Error('目前不支持对非当前角色卡调用 bindCharWorldbooks');};await assert.rejects(f.service.initialize(),/非当前/);assert.equal(f.saved.size,1);const first=[...f.saved.keys()][0];f.helper.rebindCharWorldbooks=bind;await f.service.initialize();assert.equal(f.saved.size,2);assert.equal(f.store.read().world.tables.originBook,first);assert.equal(f.binding.primary,'角色原书');
});
test('current card switch during binding read prevents writing another card',async()=>{
 const f=fixture();let calls=0;f.helper.getCharWorldbookNames=async target=>{assert.equal(target,'current');f.c.characters[0].avatar='other.png';return structuredClone(f.binding);};f.helper.rebindCharWorldbooks=async()=>calls++;await assert.rejects(f.books.bindOrigin('a.png','origin'),/已切换/);assert.equal(calls,0);
});
test('history review reads real floors without creating books and labels unavailable archive status',async()=>{
 const f=fixture();f.c.chat=[{is_system:true,mes:'system'},ai('旧历史'),user('继续'),ai('最新')];let x=await f.service.review();assert.deepEqual(x.history.map(r=>r.floor),[2,3,4]);assert.equal(x.history[0].archived,null);assert.equal(x.storageReady,false);assert.equal(f.saved.size,0);await f.service.initialize();f.saved.delete(f.store.read().world.tables.sessionBook);x=await f.service.review();assert.equal(x.history.length,3);assert.equal(x.storageReady,false);assert(x.storageError);assert.equal(x.history[0].archived,null);
});
test('configuration assistant previews every change, never writes on ask, applies one guarded configuration save',async()=>{
 const f=fixture();const before=f.store.read().revision;f.responder(async(task,input)=>{assert.equal(task,'tableAssistant');assert(input.editablePaths.includes('/world/context/history'));assert.equal(input.storage.ready,false);return {answer:'缩小历史并关闭自动剧情设计',changes:[{path:'/world/context/history',value:15,reason:'用户要求保留15条'},{path:'/world/tables/plot',value:false,reason:'关闭剧情设计'}],backfill:null,genesisGoal:''};});
 const result=await f.service.assistant.ask('历史留15条，先关剧情设计');assert.equal(f.store.read().revision,before);assert.equal(f.saved.size,0);assert.equal(result.diff[0].before,50);assert.equal(await f.service.assistant.apply(result),2);assert.equal(f.store.read().world.context.history,15);assert.equal(f.store.read().world.tables.plot,false);assert.equal(f.saved.size,0);await assert.rejects(f.service.assistant.apply(result),/已变化/);
});
test('assistant rejects new unknown paths and invalid ranges, then retains pending Genesis handoff',async()=>{
 const f=fixture();f.responder(async()=>({answer:'新增',changes:[{path:'/world/unknown',value:true,reason:'新增'}],backfill:null,genesisGoal:''}));await assert.rejects(f.service.assistant.ask('新功能'),/交给创世/);f.responder(async()=>({answer:'交创世',changes:[],backfill:null,genesisGoal:'建立船舶模板及航线表'}));const draft=await f.service.assistant.ask('新建船舶表');assert.equal(draft.genesisGoal,'建立船舶模板及航线表');assert.equal(f.saved.size,0);f.c.chat.push(user('修改了消息'));assert.throws(()=>f.service.assistant.guard(draft),/已变化/);
});
test('assistant unrelated configuration edit retains old alias routing and secrets never enter input',async()=>{
 const f=fixture();f.c.extensionSettings.connectionManager={profiles:[{id:'secret',secret:'DO_NOT_SEND'}]};f.d.routes.tasks.memory={connection:'native',model:'LEGACY'};f.responder(async(_,input)=>{assert(!JSON.stringify(input).includes('DO_NOT_SEND'));return {answer:'已提出',changes:[{path:'/world/context/history',value:12,reason:'用户要求'}],backfill:null,genesisGoal:''};});const d=await f.service.assistant.ask('历史改12条');await f.service.assistant.apply(d);assert.equal(resolveRoute(f.store.read().data,f.store.read().world,'tableArchive').model,'LEGACY');
});
test('preview and assistant UI stay usable when worldbook helper is absent, no textarea type setter',async()=>{
 const {Window}=await import('happy-dom');const {mountTablePanel}=await import('../tables/panel.js');const w=new Window(),d=w.document;Object.defineProperty(w.HTMLTextAreaElement.prototype,'type',{get(){return 'textarea';},configurable:true});const f=fixture();delete f.helper.getWorldbook;f.c.chat=[ai('旧正文'),user('继续'),ai('最新')];const panel=mountTablePanel(d,d.body,{service:f.service,store:f.store});await panel.ready;
 const click=async text=>{const b=[...panel.root.querySelectorAll('button')].find(x=>x.textContent===text);if(b)return b.onclick();const select=panel.root.querySelector('[aria-label="表单功能"]'),option=[...select.options].find(o=>o.textContent===text);assert(option,text);select.value=option.value;return select.onchange();};await click('初始化与历史');assert.match(panel.root.textContent,/共 3 条/);assert.match(panel.root.textContent,/归档状态尚未核对/);await click('开始／继续补录所选楼层');assert.match(panel.root.textContent,/新版酒馆助手/);assert(panel.root.querySelector('[aria-label="历史原文或手写摘要"]'));await click('预设与表单全文');assert.match(panel.root.textContent,/历史事件记忆/);assert.match(panel.root.textContent,/tableArchive/);assert.match(panel.root.textContent,/Return one strict JSON object/);assert.equal(f.saved.size,0);
 await click('缇斯亚助手');f.responder(async()=>({answer:'把历史条数改为10',changes:[{path:'/world/context/history',value:10,reason:'用户要求'}],backfill:null,genesisGoal:''}));const q=panel.root.querySelector('[aria-label="想让缇斯亚帮你做什么"]');q.value='保留10条历史';q.dispatchEvent(new w.Event('input'));await click('让缇斯亚处理');assert.match(panel.root.textContent,/修改前/);await click('应用全部更改');assert.equal(f.store.read().world.context.history,10);assert.match(panel.root.textContent,/已保存 1 项/);panel.dispose();await w.happyDOM.abort();
});

test('assistant edits only requested fields without freezing inherited table or route defaults',async()=>{
 const f=fixture(),before=structuredClone(f.store.read().world);f.responder(async()=>({answer:'历史改为20条',changes:[{path:'/world/context/history',value:20,reason:'用户要求'}],backfill:null,genesisGoal:''}));const draft=await f.service.assistant.ask('20条');await f.service.assistant.apply(draft);before.context.history=20;assert.deepEqual(f.store.read().world,before);
});
test('interface and main configuration share one explicit assistant apply, with validation and stale guard',async()=>{
 const {interfaceSnapshot,validateInterfaceSettings}=await import('../tables/interface-config.js');const f=fixture();let display={联系人分组:{},未知旧字段:'保留'},saves=0;
 const service=createTableService({store:f.store,getContext:()=>f.c,books:f.books,request:async()=>({answer:'改历史条数、阅读心理和消息栏',changes:[{path:'/world/context/history',value:16,reason:'用户要求'},{path:'/interface/显示区块/extensions/显示角色心理',value:true,reason:'用户要求'},{path:'/interface/消息快捷栏',value:['next','more'],reason:'用户要求'}],backfill:null,genesisGoal:''}),interfaceConfig:{read:()=>interfaceSnapshot(display),save:async({data,revision,key,value,expected})=>{assert.equal(expected,JSON.stringify(display));validateInterfaceSettings(value);await f.store.save(data,revision,key);display=value;saves++;}}});
 const result=await service.assistant.ask('开启心理，精简消息栏，历史16条');assert.equal(saves,0);await service.assistant.apply(result);assert.equal(saves,1);assert.equal(display.显示区块.extensions.显示角色心理,true);assert.equal(display.未知旧字段,'保留');assert.deepEqual(display.消息快捷栏,['next','more']);assert.equal(f.store.read().world.context.history,16);assert.throws(()=>validateInterfaceSettings({...display,消息快捷栏:['next']}),/保留更多/);assert.throws(()=>service.assistant.guard(result),/已变化/);
});

test('card initialization saves reusable object and discovery context but isolates initial state',async()=>{
 const f=fixture();f.c.characters[0].data={description:'驿长顾青每日下午在白鹭驿站值班。初始位于驿站。'};for(const name of ['角色原书','数据库资料'])f.saved.set(name,[]);
 f.responder((task,input)=>{assert.equal(task,'templateInit');const r=input.registry;return {registry:r,notes:['依据角色卡初始化'],base:{changes:[op('new:station','objects',{名称:'白鹭驿站',类型:'place'},'白鹭驿站'),op('new:gu','objects',{名称:'顾青',类型:'character',属性:{身份:'驿长'},发现环境:{地点:['new:station'],时段:'每日下午',来源依据:'驿长顾青每日下午在白鹭驿站值班。'}},'驿长顾青每日下午在白鹭驿站值班。')]},initial:{changes:[op('new:place','state',{名称:'顾青位置',对象:'new:gu',字段:'当前位置',值:'白鹭驿站'},'初始位于驿站。')]}};});
 const draft=await f.service.cardTemplate();assert.equal((await f.service.inspect()).rows.length,0);await f.service.saveCardTemplate(draft);const first=await f.service.inspect();assert.equal(first.origin.bases.length,2);assert.equal(first.rows.filter(x=>x.table==='state').length,1);const gu=first.rows.find(x=>x.values.名称==='顾青');assert(!gu.values.发现环境.地点[0].startsWith('new:'));
 f.c.chatId='new-save';await f.service.initialize();assert.equal((await f.service.inspect()).rows.length,0);await f.service.pinOrigins(first.origin.bases.map(b=>b.id+'@'+b.rev));const second=await f.service.inspect();assert.equal(second.rows.length,2);assert(second.rows.every(x=>x.table==='objects'));assert(second.rows.find(x=>x.values.名称==='顾青').values.发现环境);
});
test('valid independent archive items persist while malformed items leave floor pending',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('收到信件。'),user('继续'),ai('最新')];f.responder(()=>({changes:[op('new:event','events',{名称:'收信',经过:'收到信件。'},'收到信件。'),op('new:bad','state',{名称:'错误引用',对象:'missing',字段:'伤势',值:'无'},'收到信件。')]}));const result=await f.service.archive({range:{from:1,to:1,limit:1}});const data=await f.service.inspect();assert.equal(data.rows.length,1);assert.equal(result.archived,0);assert(result.pending.length);assert.equal(f.calls.length,2);assert.equal((await f.service.scan())[0].archived,false);
});
test('archive object is reusable in origin while source removal removes current overlay',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('岚在北门。'),user('继续'),ai('最新')];f.responder(()=>({changes:[op('new:lan','objects',{名称:'岚',类型:'character'},'岚'),op('new:where','state',{名称:'岚位置',对象:'new:lan',字段:'当前位置',值:'北门'},'岚在北门。')]}));await f.service.archive({range:{from:1,to:1,limit:1}});let data=await f.service.inspect();assert.equal(data.origin.bases.length,1);assert.equal(data.rows.length,2);f.c.chat[0].mes='此段被重投替换';data=await f.service.inspect();assert.equal(data.rows.length,0);assert.equal(data.origin.bases.length,1);
});

test('assistant apply preserves guarded follow-up actions and UI backfill reaches actual archive',async()=>{
 const {Window}=await import('happy-dom'),{mountTablePanel}=await import('../tables/panel.js'),w=new Window(),f=fixture();
 f.c.chat=[ai('城门开放。'),user('继续'),ai('最新保留。')];let archiveCalls=0;
 f.responder(async(task,input)=>task==='tableAssistant'?{answer:'启用后补录，并保留创世需求。',changes:[{path:'/world/tables/enabled',value:true,reason:'用户要求'}],backfill:{from:1,to:1,limit:10},genesisGoal:'建立航线模板'}:(archiveCalls++,{changes:[op('new:event','events',{名称:'城门开放',经过:'城门开放。'},'城门开放。')]}));
 const panel=mountTablePanel(w.document,w.document.body,{service:f.service,store:f.store});await panel.ready;
 const click=async label=>{const b=[...panel.root.querySelectorAll('button')].find(x=>x.textContent===label);if(b)return b.onclick();const select=panel.root.querySelector('[aria-label="表单功能"]'),option=[...select.options].find(o=>o.textContent===label);assert(option,label);select.value=option.value;return select.onchange();};
 await click('缇斯亚助手');const q=panel.root.querySelector('textarea');q.value='启用并补录';q.dispatchEvent(new w.Event('input'));await click('让缇斯亚处理');assert.equal(f.saved.size,0);
 await click('应用全部更改');assert.match(panel.root.textContent,/按建议开始楼层补录/);assert.match(panel.root.textContent,/带着需求交给创世/);
 await click('按建议开始楼层补录');assert.equal(archiveCalls,1);assert.equal((await f.service.scan()).filter(r=>r.archived).length,1);assert.match(panel.root.textContent,/缇斯亚保留的创世需求/);panel.dispose();await w.happyDOM.abort();
});

test('assistant continuation refreshes only its own save and still rejects chat changes',async()=>{
 const f=fixture();f.responder(async()=>({answer:'修改',changes:[{path:'/world/context/history',value:15,reason:'用户要求'}],backfill:{from:1,to:1,limit:1},genesisGoal:''}));
 const draft=await f.service.assistant.ask('15条'),result=await f.service.assistant.applyAndContinue(draft);assert.equal(result.count,1);assert.deepEqual(result.next.changes,[]);f.service.assistant.guard(result.next);assert.throws(()=>f.service.assistant.guard(draft),/已变化/);f.c.chat.push(user('新消息'));assert.throws(()=>f.service.assistant.guard(result.next),/已变化/);
});

test('due checks compare explicit Chinese and ISO story dates but retain unknown eras and impossible dates',async()=>{
 const {dueChecks}=await import('../tables/ledger.js');const view={rows:[{id:'s',table:'scene',values:{当前时间:'2026年4月2日11:30'}},{id:'t',table:'timers',values:{名称:'期限',到期时间:'2026-04-01 17:00',状态:'等待'}}]};
 assert.equal(dueChecks(view,[])[0].due,true);view.rows[1].values.到期时间='2026年4月2日12:00';assert.equal(dueChecks(view,[])[0].due,false);view.rows[1].values.到期时间='2026年2月30日12:00';assert.equal(dueChecks(view,[])[0].due,null);view.rows[0].values.当前时间='霜月二日午时';assert.equal(dueChecks(view,[])[0].due,null);assert.equal(view.rows[1].values.状态,'等待');
});

test('participant tags do not force every past event into narrative context',async()=>{
 const {worldbookEntries}=await import('../tables/worldbook-context.js');const registry=defaultRegistry(),person={id:'person',table:'objects',values:{名称:'叶舟',类型:'character'},access},events=Array.from({length:12},(_,i)=>({id:'event-'+i,table:'events',values:{名称:'旧事'+i,经过:i===8?'铜铃归還':'别的往事',参与者:['person']},access})),view={registry,rows:[person,...events]};
 const found=retrieval(view,{tags:['引用：叶舟'],query:'铜铃',topK:1});assert.deepEqual(found.mandatory.map(r=>r.id),['person']);assert.deepEqual(found.optional.map(r=>r.id),['event-8']);
 const entries=worldbookEntries({rows:view.rows,registry,scope:'x',tags:['叶舟'],forcedIds:found.optional.map(r=>r.id)});assert.equal(entries.filter(e=>e.constant).length,2);assert(entries.filter(e=>e.tisyaTable.id.startsWith('event')).every(e=>!e.key.includes('叶舟')));
});

test('state validity migrates additively and expired values stay available without mandatory current injection',async()=>{
 const {upgradeRegistry}=await import('../tables/schema.js');const reg=defaultRegistry();delete reg.tables.find(t=>t.id==='state').fields.有效性;const upgraded=upgradeRegistry(reg);assert.deepEqual(upgraded.tables.find(t=>t.id==='state').fields.有效性.values,['有效','失效','待确认']);
 const view={registry:upgraded,rows:[{id:'p',table:'objects',values:{名称:'周宁',类型:'character'},access},{id:'old',table:'state',values:{名称:'旧位置',对象:'p',字段:'位置',值:'码头',有效性:'失效'},access}]};validateRow(upgraded,view.rows[1]);assert.equal(retrieval(view,{topK:0}).mandatory.length,0);assert.equal(view.rows[1].values.值,'码头');
});

test('native bridge defers latest candidate, fills after user continuation and carries native state to that input',async()=>{
 const f=fixture(),previous=globalThis.Mvu;const values=new Map([[0,{stat_data:{energy:10,bag:['钥匙']},display_data:{ready:true}}]]);let parses=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(text,before)=>{parses++;const patch=JSON.parse(text.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/)[1]);for(const op of patch){assert.equal(op.op,'replace');before.stat_data[op.path.slice(1)]=op.value;}return before;},replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('训练后体能下降到8。')];await f.service.enableNativeBridge();assert.equal((await f.service.syncNative()).deferred,true);assert.equal(f.calls.length,0);
 f.c.chat.push(user('去吃饭'));values.set(1,structuredClone(values.get(0)));
 f.responder(async(task,input)=>{assert.equal(task,'nativeFill');assert(!input.archiveSource.text.includes('去吃饭'));const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'体能下降到8'}],pending:[]};});
 const result=await f.service.syncNative();assert.equal(result.updated,1);assert.equal(parses,1);assert.equal(values.get(0).stat_data.energy,8);assert.equal(values.get(1).stat_data.energy,8);assert.deepEqual(values.get(1).stat_data.bag,['钥匙']);assert.equal((await f.service.syncNative()).already,true);assert.equal(parses,1);assert.equal(f.calls.length,1);
 }finally{globalThis.Mvu=previous;}
});

test('native bridge leaves independently changed input-floor variables intact',async()=>{
 const {carryNativeForward}=await import('../tables/native-bridge.js');const data=new Map([[1,{stat_data:{energy:9}}]]);await carryNativeForward({context:{chat:[ai('训练'),user('继续')]},runtime:{getMvuData:({message_id})=>data.get(message_id),replaceMvuData:async(d,{message_id})=>data.set(message_id,d)},index:0,before:{stat_data:{energy:10}},after:{stat_data:{energy:8}},guard(){}});assert.equal(data.get(1).stat_data.energy,9);
});

test('native bridge guards evidence and paths while native schema owns value types',async()=>{
 const {bridgePatch}=await import('../tables/native-bridge.js');const row={id:'cell',table:'native_cells',rev:1,values:{路径:'/energy',值:10}},base={stat_data:{energy:10}};
 const change={id:'cell',table:'native_cells',expected:1,values:{值:8},evidence:'体能下降'};
 assert.equal(bridgePatch([row],{changes:[change]},base,'体能下降').operations[0].value,8);
 assert.deepEqual(bridgePatch([row],{changes:[{...change,values:{值:'8'}}]},base,'体能下降').operations,[{op:'replace',path:'/energy',value:'8'}]);
 for(const op of [{...change,evidence:'未知'}, {...change,values:{值:8,路径:'/gold'}}])assert.throws(()=>bridgePatch([row],{changes:[op]},base,'体能下降'));
});

test('rollback and native branch preserve a chosen future blueprint without rearchiving the frozen prefix',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false});f.c.chat=[ai('10点已抵达城门'),user('继续'),ai('11点钟楼鸣响'),user('接着走'),ai('尚未确认')];
 f.responder(async(_,input)=>({changes:[op('new:event','events',{名称:input.archiveSource.text,经过:input.archiveSource.text},input.archiveSource.text)]}));await f.service.archive();assert.equal((await f.service.inspect()).archived,2);
 const staged=await f.service.stageFork(1,true);assert.equal(staged.nodes,1);f.c.chat=f.c.chat.slice(0,1);await f.service.activateFork({rollback:true});const info=await f.service.inspect();assert.equal(info.session.branchSeed.nodes.length,1);assert.equal(info.archived,1);assert.equal(info.rows.filter(r=>r.table==='events').length,1);assert.equal(info.session.retiredBranches.length,1);
 f.c.chat.push(user('新的路线'));const before=f.calls.length;await f.service.archive();assert.equal(f.calls.length,before);
 const cleared=await f.service.stageFork(1,false);assert.equal(cleared.nodes,0);f.c.chatId='new-branch';f.c.chat=f.c.chat.slice(0,1);await f.service.activateFork();const other=await f.service.inspect();assert.equal(other.session.branchSeed.nodes.length,0);assert.equal(other.archived,1);assert.notEqual(other.session.id,info.session.id);
});


test('recovery archive strips auxiliary poison inside body and preserves every consecutive user input',async()=>{
 const {archivalText,precedingUserSource}=await import('../tables/ledger.js');
 const text='<reply><title>旧标题</title><body>抵达门前。<memory>旧摘要污染</memory><task>引用：任务标签污染</task><vars>变量污染</vars></body><status>状态污染</status></reply>';
 assert.equal(archivalText(text),'抵达门前。');const f=fixture();await f.service.initialize();f.c.chat=[ai('序幕'),user('身份定义甲'),user('已确认设定乙'),ai(text),user('继续')];
 const chain=await sources(f.c.chat),prior=precedingUserSource(chain,chain[3]);assert.deepEqual(prior.sources.map(x=>x.floor),[2,3]);assert.equal(prior.text,'身份定义甲\n\n已确认设定乙'.replaceAll('\\n','\n'));
 f.responder((task,input)=>{assert.equal(task,'historyImport');assert.equal(input.archiveSource.floor,4);assert.equal(input.archiveSource.text,'抵达门前。');assert(!Object.hasOwn(input.archiveSource,'tags'));assert.deepEqual(input.userSource.sources.map(x=>x.floor),[2,3]);assert.equal(input.sourceHistory[0].text,text);assert(!JSON.stringify({archiveSource:input.archiveSource,userSource:input.userSource}).includes('污染'));return {changes:[]};});
 await f.service.archive({includeLatest:true,range:{from:4,to:4,limit:1}});assert.equal(f.calls.length,1);assert.equal((await f.service.scan())[3].archived,true);
});

test('recovery object discovery and history reference one uncommitted identity and save together',async()=>{
 const f=fixture();await f.service.initialize();await f.set({objectsSeparate:true});f.c.chat=[ai('新城门已开启。'),user('继续')];const before=JSON.stringify([...f.saved]);
 f.responder(async(task,input)=>{
  if(task==='objectArchive'){assert.equal(JSON.stringify([...f.saved]),before);return {changes:[op('new:gate','objects',{名称:'新城门',类型:'place'},'新城门')]};}
  assert.equal(task,'historyImport');assert.equal(JSON.stringify([...f.saved]),before);const gate=input.currentRows.find(row=>row.id==='new:gate');assert(gate&&!gate.referenceOnly);assert.equal(gate.values.名称,'新城门');
  return {changes:[op('new:open','state',{名称:'新城门开闭',对象:gate.id,字段:'开闭',值:'开启'},'新城门已开启。')]};
 });
 const result=await f.service.archive({includeLatest:true,range:{from:1,to:1,limit:1}}),info=await f.service.inspect();assert.equal(result.archived,1);assert.equal(info.session.commits.filter(x=>x.kind==='history').length,1);assert.equal(info.rows.length,2);assert.equal(info.rows.find(x=>x.table==='state').values.对象,info.rows.find(x=>x.table==='objects').id);assert.deepEqual(f.calls.map(x=>x.task),['objectArchive','historyImport']);
});

test('recovery discovery stays invisible when history remains invalid or is cancelled',async()=>{
 const f=fixture();await f.service.initialize();await f.set({objectsSeparate:true});f.c.chat=[ai('新城门已开启。'),user('继续')];
 f.responder(task=>task==='objectArchive'?{changes:[op('new:gate','objects',{名称:'新城门',类型:'place'},'新城门')]}:{changes:[op('new:bad','state',{名称:'错误对象',对象:'missing',字段:'开闭',值:'开启'},'新城门已开启。')]});
 const failed=await f.service.archive({includeLatest:true,range:{from:1,to:1,limit:1}}),info=await f.service.inspect();assert.equal(failed.archived,0);assert(failed.pending.length);assert.equal(info.rows.length,0);assert.equal(info.origin.bases.length,0);
 let release;f.responder(task=>task==='objectArchive'?{changes:[op('new:gate','objects',{名称:'新城门',类型:'place'},'新城门')]}:new Promise(resolve=>release=resolve));
 const job=f.service.archive({includeLatest:true,range:{from:1,to:1,limit:1}});while(!release)await new Promise(resolve=>setTimeout(resolve,1));f.service.clear();assert.equal(f.service.state().progress.stage,'stopped');release({changes:[]});await assert.rejects(job,/停止/);assert.equal((await f.service.inspect()).origin.bases.length,0);
});

test('recovery archive rereads a thin target before considering its modification',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];await f.service.initialize();f.c.characters[0].description='远方门规：旧规则。';f.responder(()=>({base:{changes:[op('new:rule','objects',{名称:'远方门规',类型:'rule',描述:'旧规则。'},'旧规则。')]},initial:{changes:[]},notes:[]}));await f.service.saveCardTemplate(await f.service.cardTemplate('card'));
 const row=(await f.service.inspect()).rows[0];f.calls.length=0;f.c.chat=[ai('告示现已修订。'),user('继续')];let attempt=0;
 f.responder((task,input)=>{assert.equal(task,'historyImport');const current=input.currentRows.find(x=>x.id===row.id);attempt++;if(attempt===1){assert.equal(current.referenceOnly,true);assert(!Object.hasOwn(current.values,'描述'));}else{assert.equal(current.referenceOnly,undefined);assert.equal(current.values.描述,'旧规则。');assert(input.readMore);}
 return {changes:[op(row.id,'objects',{描述:'告示现已修订。'},'告示现已修订。',row.rev)]};});
 const result=await f.service.archive({includeLatest:true,range:{from:1,to:1,limit:1}});assert.equal(result.archived,1);assert.equal(attempt,2);assert.equal((await f.service.inspect()).rows[0].values.描述,'告示现已修订。');
});

test('recovery historical preference candidates require review and exact active scope',async()=>{
 const {preferenceMatches}=await import('../tables/preferences.js');const f=fixture();await f.service.initialize();await f.set({enabled:true,archive:false,plot:false,preferences:true});f.c.chat=[user('仅这次开场用短句。'),ai('开场'),user('本会话后续都保持简练。'),ai('暂存')];
 f.responder((task,input)=>{assert.equal(task,'preferenceAnalysis');assert.equal(input.generationType,'history-analysis');assert.equal(input.preferenceContext.chatId,'one');return {changes:input.userInput.startsWith('仅')?[]:[op('new:prefer','preferences',{名称:'持续简练',内容:'本会话后续都保持简练。',性质:'明确要求',强度:'必须',启用:true,作用域:{会话:['one']}},'本会话后续都保持简练。')]};});
 const result=await f.service.analysePreferences({from:1,to:4,limit:10});assert.deepEqual(result,{processed:2,pending:1});assert.deepEqual(await f.service.analysePreferences({from:1,to:4,limit:10}),{processed:0,pending:1});let info=await f.service.inspect();assert.equal(info.rows.filter(x=>x.table==='preferences').length,0);const draft=info.preferenceDrafts.find(x=>x.status==='pending');await f.service.reviewPreference(draft.id,draft.proposal);const assembled=await f.service.prepare();assert.equal(assembled.slots.preferences.rows.length,1);assert.equal(f.calls.length,2);
 const scoped=assembled.slots.preferences.rows[0];assert(preferenceMatches(scoped,{context:f.c,world:f.store.read()}));assert(!preferenceMatches(scoped,{context:{...f.c,chatId:'someone'},world:f.store.read()}));scoped.values.作用域={用户角色:['persona-id'],角色卡:['a.png'],世界:[f.store.read().key],会话:['one']};assert(!preferenceMatches(scoped,{context:f.c,world:f.store.read(),persona:{id:'persona'}}));assert(preferenceMatches(scoped,{context:f.c,world:f.store.read(),persona:{id:'persona-id'}}));
});

test('recovery persona initialization preserves exact text once and binding resumes durable save',async()=>{
 const {createPersonaGateway}=await import('../tables/persona.js');const f=fixture();f.binding.primary='';f.binding.additional=[];f.c.userAvatar='user.png';f.c.name1='阿青';const original='原生定义\n代号：#00ffff\n空值：NaN'.replaceAll('\\n','\n');f.c.powerUserSettings={personas:{'user.png':'阿青'},persona_descriptions:{'user.png':{description:original}},persona_description:original};let persist=true;
 const persona=createPersonaGateway({getContext:()=>f.c,applyActive:(_,name)=>{f.c.name1=name;},persist:async()=>persist}),service=f.makeService({persona});await service.initialize();await f.set({enabled:true,archive:false,plot:false,continuity:'tables'});
 f.c.characters[0].description='新角色岚，负责值守。';f.responder((task,input)=>{assert.equal(task,'templateInit');assert.equal(input.sourceUser.description,original);return {base:{changes:[op('new:lan','objects',{名称:'岚',类型:'character',描述:'负责值守。'},'负责值守。')]},initial:{changes:[]},notes:[]};});
 await service.saveCardTemplate(await service.cardTemplate('card'));const info=await service.inspect(),nativeUser=info.rows.find(row=>row.values.名称==='阿青');assert.equal(nativeUser.values.描述,original);assert.equal(info.rows.filter(row=>row.values.名称==='阿青').length,1);assert.equal(info.session.personaBinding.objectId,nativeUser.id);assert.equal((await service.prepare()).text.split('空值：NaN').length-1,1);
 const draft=await service.previewUserBinding(info.rows.find(row=>row.values.名称==='岚').id);persist=false;await assert.rejects(service.saveUserBinding(draft),/持久保存/);assert.equal((await service.inspect()).session.personaBinding.state,'writing');persist=true;const fresh=f.makeService({persona});await fresh.resumeUserBinding();assert.equal(f.c.name1,'岚');assert.equal(f.c.powerUserSettings.persona_description,'负责值守。');assert.equal((await fresh.inspect()).session.personaBinding.state,'bound');assert.equal((await fresh.prepare()).text.split('负责值守。').length-1,1);
});

test('recovery incremental names use existing values and repair only editable conflicting names',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];await f.service.initialize();f.c.characters[0].description='内门规则。外门规则。更正内门规则。';f.responder(()=>({base:{changes:[op('new:inner','objects',{名称:'门规',类型:'rule',描述:'内门规则。'},'内门规则。')]},initial:{changes:[]},notes:[]}));await f.service.saveCardTemplate(await f.service.cardTemplate('card'));const row=(await f.service.inspect()).rows[0];let repairs=0;
 f.responder((task,input)=>{if(input.repair?.nameConflicts){repairs++;assert.deepEqual(input.repair.editableIds.sort(),[row.id,'new:outer'].sort());return {renames:[{id:'new:outer',name:'外门门规'}]};}return {base:{changes:[op(row.id,'objects',{描述:'更正内门规则。'},'更正内门规则。',row.rev),op('new:outer','objects',{名称:'门规',类型:'rule',描述:'外门规则。'},'外门规则。')]},initial:{changes:[]},notes:[]};});
 const draft=await f.service.cardTemplate('card');assert.equal(draft.proposal.base.changes[0].values.名称,undefined);await f.service.saveCardTemplate(draft);const rows=(await f.service.inspect()).rows;assert.equal(rows.find(x=>x.id===row.id).values.名称,'门规');assert(rows.some(x=>x.values.名称==='外门门规'));assert.equal(repairs,1);
});

test('recovery rejected native parse persists across service recreation with zero native writes',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10,derived:0}}]]);let parses=0,writes=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;before.stat_data.derived=9;return before;},replaceMvuData:async(data,{message_id})=>{writes++;values.set(message_id,structuredClone(data));}};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('体能降到八。'),user('继续')];await f.service.enableNativeBridge();f.responder((_,input)=>{const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'体能降到八'}]};});
 await assert.rejects(f.service.syncNative(),/原生规则拒绝/);const saved=await f.service.inspect();assert.equal(saved.session.nativeIntents[0].phase,'parsed');assert.equal(saved.session.nativeIntents[0].outcome.rejected[0].path,'/energy');assert.equal(writes,0);assert.equal(values.has(1),false);await assert.rejects(f.service.syncNative(),/原生规则拒绝/);await assert.rejects(f.makeService().syncNative(),/原生规则拒绝/);assert.equal(parses,1);assert.equal(f.calls.length,1);assert.equal(writes,0);
 }finally{globalThis.Mvu=previous;}
});

test('recovery adjusted native result survives a failed write and service recreation',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}]]);let parses=0,fail=true;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;before.stat_data.energy=7;return before;},replaceMvuData:async(data,{message_id})=>{if(fail){fail=false;throw Error('暂时不可写');}values.set(message_id,structuredClone(data));}};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('体能降到八。'),user('继续')];await f.service.enableNativeBridge();f.responder((_,input)=>{const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'体能降到八'}]};});
 await assert.rejects(f.service.syncNative(),/暂时不可写/);const fresh=f.makeService(),result=await fresh.syncNative();assert.equal(result.outcome.adjusted[0].path,'/energy');assert.equal(values.get(0).stat_data.energy,7);assert.equal(values.get(1).stat_data.energy,7);assert.equal(parses,1);assert.equal(f.calls.length,1);assert.equal((await f.makeService().syncNative()).already,true);assert.equal((await fresh.inspect()).session.commits.findLast(x=>x.nativeReceipt?.phase==='applied').nativeReceipt.outcome.adjusted.length,1);
 }finally{globalThis.Mvu=previous;}
});

test('recovery ISO time comparison preserves timezone and years zero through ninety-nine',async()=>{
 const {calendarTime}=await import('../tables/ledger.js');assert.equal(calendarTime('2026-10-13T20:00:00+08:00'),calendarTime('2026-10-13T12:00:00Z'));assert.equal(calendarTime('0099-01-02T03:04:05Z'),Date.parse('0099-01-02T03:04:05Z'));assert.equal(calendarTime('0000-02-29T00:00:00Z'),Date.parse('0000-02-29T00:00:00Z'));
 for(const text of ['2025-02-29T00:00:00Z','2026-04-31 00:00','2026-10-13T24:00:00Z','2026-10-13T00:00:00+24:00','0099-02-29T00:00:00Z'])assert.equal(calendarTime(text),null,text);
});

test('recovery failed plot clears previously assembled main context and strict MVU gate stays visible',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,archive:false,plot:false});await f.service.prepare();assert(f.service.preview());await f.set({plot:true});f.responder(()=>{throw Error('推进失败');});await assert.rejects(f.service.prepare(),/推进失败/);assert.equal(f.service.preview(),null);assert.equal(f.prompts.at(-1).text,'');
 await f.set({plot:false,continuity:'tables'});f.c.characters[0].data={extensions:{tavern_helper:{scripts:[{type:'script',id:'adapter',name:'native',enabled:true,content:'registerMvuSchema(schema);'}]}}};await assert.rejects(f.service.prepare(),/启用原生变量桥/);const snapshot=f.store.read();snapshot.data.worlds[snapshot.key].modes.narrative.nativeMvu='off';await f.store.save(snapshot.data,snapshot.revision,snapshot.key);assert(await f.service.prepare());
});

test('recovery task progress carries visible cumulative text and never completes malformed output',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('门已开启。'),user('继续')];let release;
 const service=f.makeService({request:async(task,input,{onProgress})=>{onProgress({stage:'thinking',text:'',characters:0,reasoning:'PRIVATE_REASONING'});onProgress({stage:'receiving',text:'{"changes":',characters:11});return new Promise(resolve=>release=resolve);}});
 const job=service.archive({includeLatest:true,range:{from:1,to:1,limit:1}});while(!release)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(service.state().progress.text,'{"changes":');assert.equal(service.state().progress.stage,'receiving');assert(!JSON.stringify(service.state()).includes('PRIVATE_REASONING'));release('{"changes":[]}');await job;assert.equal(service.state().progress.stage,'complete');assert.equal(service.state().progress.characters,14);
 f.c.chat[0].mes='门已关闭。';const broken=f.makeService({request:async(task,input,{onProgress})=>{onProgress({stage:'receiving',text:'broken'});return 'broken';}});const failed=await broken.archive({includeLatest:true,range:{from:1,to:1,limit:1}});assert.equal(failed.archived,0);assert.equal(broken.state().progress.stage,'error');assert(!JSON.stringify(broken.state().jobs).includes('PRIVATE_REASONING'));
});

test('recovery strict persona requires explicit initialization before table-only assembly',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,archive:false,continuity:'tables'});f.c.name1='阿青';f.c.userAvatar='a-user';f.c.powerUserSettings={persona_description:'未归档身份',personas:{'a-user':'阿青'},persona_descriptions:{'a-user':{description:'未归档身份'}}};await assert.rejects(f.service.prepare(),/用户身份尚未初始化或绑定/);assert.equal(f.service.preview(),null);assert.equal(f.prompts.at(-1).text,'');
});

test('recovery old task and memory blocks cannot recall an otherwise unrelated archive',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,archive:false,plot:false,continuity:'tables',topK:0});f.c.chat=[];await f.service.edit({changes:[op('new:door','objects',{名称:'旧任务暗号对象',类型:'place',描述:'不能靠旧标签召回'},'用户手动修改表单')]});f.c.chat=[ai('<body>窗边无人。</body><task>引用：旧任务暗号对象</task><memory>旧任务暗号对象</memory>'),user('看看窗外')];const result=await f.service.prepare();assert.deepEqual(result.tags,[]);assert(!result.text.includes('不能靠旧标签召回'));assert(!result.text.includes('旧任务暗号对象'));
});


test('dedicated initialization preserves AI notices and raw history through the service request',async()=>{
 const {cardAIMaterials}=await import('../tables/card-source.js');const f=fixture();f.binding.primary='';f.binding.additional=[];
 f.c.characters[0].data={name:'甲',description:'完整规则正文',mes_example:'完整格式范例',extensions:{tavern_helper:{scripts:[{type:'script',content:'DO_NOT_SEND_RUNTIME()'}]},regex_scripts:[{replaceString:'DO_NOT_SEND_DISPLAY'}]},character_book:{entries:[{id:9,enabled:true,content:'必须输出 <notice>名称|结果</notice>'}]}};
 f.c.chat=[user('原始用户定义'),ai('<reply><body>第一次抵达。</body><memory>原样保留的旧汇总</memory></reply>')];
 const original=structuredClone(f.c.characters[0]);f.responder((task,input)=>{assert.equal(task,'templateInit');assert.deepEqual(input.sourceCardRaw,cardAIMaterials(original));assert.deepEqual(input.sourceHistory.map(x=>x.text),f.c.chat.map(x=>x.mes));assert.doesNotMatch(JSON.stringify(input),/DO_NOT_SEND_RUNTIME|DO_NOT_SEND_DISPLAY/);return {base:{changes:[]},initial:{changes:[]},notes:[]};});
 const draft=await f.service.cardTemplate();assert.deepEqual(f.c.characters[0],original);await f.service.saveCardTemplate(draft);
 const next=await f.service.cardTemplate();f.c.characters[0].data.description+=' 新定义';await assert.rejects(f.service.saveCardTemplate(next),/角色卡或绑定定义已改变/);
});
test('manual import preserves raw multi-reply source but rejects auxiliary-only evidence before writing',async()=>{
 const f=fixture();await f.service.initialize();const raw='设定甲\n<reply><body>曾到过城门。</body><memory>假事件已经完成</memory></reply>\n设定乙\n<reply><body>随后归还钥匙。</body><vars>假变量命令</vars></reply>',before=JSON.stringify([...f.saved]);
 f.responder((task,input)=>{assert.equal(task,'historyImport');assert.equal(input.sourceHistory.text,raw);assert.match(input.historyText,/曾到过城门/);assert.match(input.historyText,/随后归还钥匙/);assert.match(input.historyText,/设定乙/);assert.doesNotMatch(input.historyText,/假事件|假变量/);return {changes:[op('new:bad','events',{名称:'假的完成',经过:'假事件已经完成'},'假事件已经完成')]};});
 await assert.rejects(f.service.saveHistory(await f.service.importHistory(raw)),/真实存在/);assert.equal(JSON.stringify([...f.saved]),before);
 f.responder(()=>({changes:[op('new:gate','events',{名称:'到达城门',经过:'曾到过城门。'},'曾到过城门。'),op('new:key','events',{名称:'归还钥匙',经过:'随后归还钥匙。'},'随后归还钥匙。')]}));await f.service.saveHistory(await f.service.importHistory(raw));const info=await f.service.inspect();assert.equal(info.rows.length,2);assert.equal(info.session.commits[0].importSource.text,raw);await assert.rejects(f.service.importHistory(raw),/已导入/);
});
test('preserved raw auxiliary text cannot acquire archival evidence authority',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('<body>门仍关闭。</body><memory>门已经打开。</memory>'),user('继续')];f.responder((task,input)=>{assert.equal(input.sourceHistory[0].text,f.c.chat[0].mes);return {changes:[op('new:bad','events',{名称:'开门',经过:'门已经打开。'},'门已经打开。')]};});
 const result=await f.service.archive({includeLatest:true,range:{from:1,to:1,limit:1}});assert(result.pending.length);assert.equal((await f.service.inspect()).rows.length,0);assert.equal((await f.service.scan())[0].archived,false);
});

test('reroll feedback remains pending across candidate changes and confirmation survives story branch selection',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,preferences:true,archive:false,plot:false});f.c.chat=[user('继续'),{...ai('旧候选'),swipe_id:0,swipes:['旧候选','新候选']}];
 f.responder(()=>({templates:[],changes:[op('new:short','preferences',{名称:'短句',内容:'以后多用短句',性质:'明确要求',强度:'喜爱',类别:'文风',作用域:{会话:['one']},启用:true},'以后多用短句')]}));
 const feedback={format:'tisya.revision/1',id:'feedback-1',chatId:'one',messageId:1,candidate:0,source:'旧候选',direction:'以后多用短句',mode:'whole',selected:[],remember:true,result:'accepted'};
 assert.deepEqual(await f.service.recordRevisionFeedback(feedback),{recorded:true,pending:1});let info=await f.service.inspect();assert.equal(info.rows.filter(r=>r.table==='preferences').length,0);assert.equal(info.preferenceDrafts[0].status,'pending');assert.equal(f.calls.at(-1).input.userInput,feedback.direction);assert.equal(f.calls.at(-1).input.rerollFeedback.source,feedback.source);
 f.c.chat[1].mes='新候选';f.c.chat[1].swipe_id=1;info=await f.service.inspect();assert.equal(info.preferenceDrafts.length,1);await f.service.reviewPreference(info.preferenceDrafts[0].id,info.preferenceDrafts[0].proposal);f.c.chat[1].mes='旧候选';f.c.chat[1].swipe_id=0;info=await f.service.inspect();assert.equal(info.rows.filter(r=>r.table==='preferences').length,1);assert.equal(info.session.commits.at(-1).depends,null);assert.equal(info.session.commits.at(-1).source,null);
 const calls=f.calls.length;await f.service.recordRevisionFeedback(feedback);assert.equal(f.calls.length,calls);await f.service.recordRevisionFeedback({...feedback,id:'feedback-2',remember:false,direction:'这次改短'});assert.equal(f.calls.length,calls);assert.equal((await f.service.inspect()).session.revisionFeedback.length,2);
});

test('reroll branch preserves candidate ledger instead of freezing the replaced candidate into seed',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false,preferences:false});f.c.chat=[ai('甲在北门'),user('继续'),{...ai('甲拿到蓝夹'),swipe_id:0,swipes:['甲拿到蓝夹','甲拿到红夹']},user('后文')];
 f.responder(async(_,input)=>({changes:[op('new:event','events',{名称:input.archiveSource.text,经过:input.archiveSource.text},input.archiveSource.text)]}));await f.service.archive({range:{from:1,to:3,limit:5}});const before=await f.service.inspect();assert.equal(before.archived,2);
 await f.service.stageFork(3,false,{preserveCandidates:true});f.c.chat=f.c.chat.slice(0,3);f.c.chatId='reroll-branch';await Promise.all([f.service.activateFork(),f.service.activateFork()]);let info=await f.service.inspect();assert.equal(info.archived,2);assert.equal(info.session.branchSeed,undefined);
 f.c.chat[2].mes='甲拿到红夹';f.c.chat[2].swipe_id=1;info=await f.service.inspect();assert.equal(info.archived,1);assert.equal(info.rows.filter(r=>r.table==='events').length,1);assert(!info.rows.some(r=>r.values.名称==='甲拿到蓝夹'));assert.equal(info.session.commits.length,before.session.commits.length);
 f.c.chat[2].mes='甲拿到蓝夹';f.c.chat[2].swipe_id=0;assert.equal((await f.service.inspect()).archived,2);
});
