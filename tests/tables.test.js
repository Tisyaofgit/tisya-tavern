import {parseSimpleSheet,formatSimpleSheet} from '../tables/simple-sheet.js';
import {createPersonaGateway,personaProjection} from '../tables/persona.js';
import {assembleArchiveBook} from '../tables/archive-book.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey,resolveRoute,registry} from '../config/core.js';
import {defaultRegistry,addTypes,registryIndex,formula,derive,validateRow,upgradeRegistry} from '../tables/schema.js';
import {createBookGateway} from '../tables/books.js';
import {sources,project,prepareCommit,retrieval,taskTags} from '../tables/ledger.js';
import {createTableService} from '../tables/service.js';
import {createNativeVectors} from '../tables/vectors.js';
import {buildMessages} from '../config/host.js';
import {SLOT_TARGETS} from '../tables/slots.js';
const access={readers:['读者'],knowers:[]};
const blank=()=>({registry:defaultRegistry(),rows:[],last:null});
const op=(id,table,values,evidence='源',expected=0)=>({id,table,expected,values,access,evidence});
function fixture(nativeConfig=null){
 const d=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a.png',name:'甲'}],chat:[{is_user:false,mes:'开场白'}],extensionSettings:{[KEY]:d},getRequestHeaders:()=>({csrf:'test'})};d.worlds[worldKey(c)]=defaultWorld();d.worlds[worldKey(c)].tables={injection:'direct'};
 const store=createStore({getContext:()=>c,persist:async()=>true}),saved=new Map(),binding={primary:'角色原书',additional:['数据库资料']};let nextUid=1,writeHook=null;
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{assert(saved.has(name));return structuredClone(saved.get(name));},createWorldbook:async(name,entries)=>{if(saved.has(name))return false;saved.set(name,entries.map(e=>({...structuredClone(e),uid:nextUid++})));return true;},updateWorldbookWith:async(name,fn)=>{await writeHook?.();const entries=fn(structuredClone(saved.get(name)));saved.set(name,entries);return structuredClone(entries);},getCharWorldbookNames:async n=>{assert.equal(n,'current');return structuredClone(binding);},rebindCharWorldbooks:async(n,b)=>{assert.equal(n,'current');Object.assign(binding,b);}};
 const books=createBookGateway(()=>helper,()=>c),calls=[],prompts=[];let responder=async()=>({changes:[],templates:[]});
 const makeService=(overrides={})=>createTableService({store,getContext:()=>c,books,nativeConfig,request:async(task,text,opts)=>{calls.push({task,input:parseSimpleSheet(text),signal:opts.signal});if(task==='ruleReview')return {issues:[]};const answer=await responder(task,parseSimpleSheet(text));return typeof answer==='string'?answer:formatSimpleSheet(answer);},setPrompt:(text,filter)=>prompts.push({text,filter}),...overrides});const service=makeService();
 const set=async fields=>{const snap=store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,...fields};await store.save(snap.data,snap.revision,snap.key);};
 return {c,d,store,helper,books,saved,binding,calls,prompts,service,makeService,set,responder:f=>responder=f,writeHook:f=>writeHook=f};
}
test('service sends sheet material plus isolated typed input and persists only validated sheet replies without automatic repair',async()=>{
 const f=fixture();await f.service.initialize();const source='城门已经开启。',reply={changes:[op('new:opened','events',{名称:'城门开启',经过:source},source)]};let count=0;
 const service=f.makeService({request:async(task,text,options)=>{count++;assert.equal(task,'historyImport');assert.match(text,/^【结果】/);assert.deepEqual(parseSimpleSheet(text),options.typedInput);assert.equal(options.typedInput.historyText,source);return formatSimpleSheet(reply);}});
 const before=JSON.stringify([...f.saved]),draft=await service.importHistory(source);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(count,1);await service.saveHistory(draft);assert.equal((await service.inspect()).rows.find(row=>row.table==='events').values.经过,source);
 for(const response of [JSON.stringify(reply),'【结果】\n1 changes：〈列表〉缺失表']){let calls=0;const bad=f.makeService({request:async()=>{calls++;return response;}}),saved=JSON.stringify([...f.saved]);await assert.rejects(bad.importHistory('另一份已发生历史。'),/简表/);assert.equal(calls,1);assert.equal(JSON.stringify([...f.saved]),saved);assert.equal(bad.state().progress.stage,'error');}
});
async function externalBookWrite(f,snapshot,next){if(next.kind==='session'&&next.origin)next.archiveView=assembleArchiveBook(await f.books.read(next.origin),next,await sources(f.c.chat));return f.books.write(snapshot,next);}
async function initializeBase(f,changes){const draft=await f.service.cardTemplate('generic');draft.basis='用户手动修改表单';draft.proposal.base.changes=changes;return f.service.saveCardTemplate(draft);}
const ai=text=>({is_user:false,name:'甲',mes:text});const user=text=>({is_user:true,name:'用户',mes:text});
test('archive and review exclude intermediate tool owners while final prose keeps its original source key',async()=>{
 const f=fixture();f.c.chat=[user('去城门'),{...ai('OPERATION_NOT_STORY'),tool_calls:[{id:'a',name:'lookup',parameters:'{}'}]},{role:'tool',is_system:true,tool_call_id:'a',mes:'TOOL_RESULT_NOT_STORY'},ai('他推开城门。'),user('继续')];
 const before=structuredClone(f.c.chat),raw=await sources(f.c.chat),projectToolTurns=chat=>[{type:'message',sourceIndex:0,message:chat[0]},{type:'tool-turn',sourceIndices:[1,2]},...chat.slice(3).map((message,index)=>({type:'message',sourceIndex:index+3,message}))];
 const service=f.makeService({projectToolTurns});await service.initialize();await service.archive();
 const calls=f.calls.filter(x=>['tableArchive','objectArchive'].includes(x.task));assert(calls.length);assert(calls.every(c=>c.input.archiveSource.key===raw[2].key));assert(calls.every(c=>c.input.userSource.text==='去城门'));assert.doesNotMatch(JSON.stringify(calls),/OPERATION_NOT_STORY|TOOL_RESULT_NOT_STORY/);
 const review=await service.review();assert.deepEqual(review.history.map(x=>x.floor),[1,4,5]);assert.equal(review.history.find(x=>x.floor===4).archived,true);assert.deepEqual(f.c.chat,before);
});
test('tool metadata mutation while archival request is pending prevents a stale write',async()=>{
 const f=fixture();f.c.chat=[user('去城门'),{...ai('查询'),tool_calls:[{id:'a',name:'lookup',parameters:'{}'}]},{role:'tool',is_system:true,tool_call_id:'a',mes:'资料'},ai('他推开城门。'),user('继续')];
 const projectToolTurns=chat=>[{type:'message',sourceIndex:0,message:chat[0]},{type:'tool-turn',sourceIndices:[1,2]},...chat.slice(3).map((message,index)=>({type:'message',sourceIndex:index+3,message}))];
 const service=f.makeService({projectToolTurns});await service.initialize();const before=JSON.stringify([...f.saved]);
 f.responder(()=>{f.c.chat[1].tool_calls[0].parameters='changed';return {changes:[]};});
 await assert.rejects(service.archive(),/聊天、候选或配置已改变/);assert.equal(JSON.stringify([...f.saved]),before);
});
test('old tool-derived ledger entries stop read/write projections without silently dropping existing facts',async()=>{
 const f=fixture();f.c.chat=[user('去城门'),{...ai('查询'),tool_calls:[{id:'a',name:'lookup',parameters:'{}'}]},{role:'tool',is_system:true,tool_call_id:'a',mes:'资料'},ai('他推开城门。')];
 const projectToolTurns=chat=>[{type:'message',sourceIndex:0,message:chat[0]},{type:'tool-turn',sourceIndices:[1,2]},{type:'message',sourceIndex:3,message:chat[3]}];
 const service=f.makeService({projectToolTurns});await service.initialize();const raw=await sources(f.c.chat),settings=f.store.read().world.tables,book=await f.books.read(settings.sessionBook),next=structuredClone(book.data);
 next.revision++;next.commits.push({id:'legacy-tool-commit',kind:'archive',source:raw[1].key,at:new Date().toISOString(),changes:[],anchors:[]});await externalBookWrite(f,book,next);
 const before=JSON.stringify([...f.saved]);const review=await service.review();assert.equal(review.storageReady,false);assert.match(review.storageError,/需先核对来源迁移/);
 await assert.rejects(service.archive(),/需先核对来源迁移/);await assert.rejects(service.inspect(),/需先核对来源迁移/);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(f.calls.length,0);
});
test('opening user definitions initialize separate companions, relations and knowledge before narrative replay',async()=>{
 const {createPersonaGateway}=await import('../tables/persona.js');const f=fixture();f.binding.primary='';f.binding.additional=[];
 const original='阿青来自南城。';f.c.userAvatar='user.png';f.c.name1='阿青';f.c.powerUserSettings={personas:{'user.png':'阿青'},persona_descriptions:{'user.png':{description:original}},persona_description:original};
 f.c.chat=[ai('【系统启动】'),user('开局设定：岚是守门人。阿青与岚原本是同门。岚开局知道阿青来自南城。'),ai('后来岚收到了银钥匙。')];
 const sourceChat=structuredClone(f.c.chat),persona=createPersonaGateway({getContext:()=>f.c,persist:async()=>true}),service=f.makeService({persona});let mode='valid';
 f.responder((task,input)=>{assert.equal(task,'templateInit');assert.deepEqual(input.sourceHistory.map(x=>x.text),sourceChat.map(x=>x.mes));const player=input.sourceUser.objectId;
  if(mode==='late-ai')return {base:{changes:[op('new:key','objects',{名称:'银钥匙',类型:'item'},'后来岚收到了银钥匙。')]},initial:{changes:[]},notes:[]};
  return {base:{changes:[op('new:lan','objects',{名称:'岚',类型:'character',描述:'守门人。'},'岚是守门人。')]},initial:{changes:[op('new:relation','relations',{名称:'开局同门',主体:player,对象:'new:lan',证据:'阿青与岚原本是同门。'},'阿青与岚原本是同门。'),{...op('new:known','cognition',{名称:'岚开局所知',主体:'new:lan',认识:'阿青来自南城。',获知途径:'开局设定',确认程度:'确认'},'岚开局知道阿青来自南城。'),access:{readers:['读者'],knowers:['new:lan']}}]},notes:[]};});
 const draft=await service.cardTemplate();assert.equal((await service.inspect()).rows.length,0);await service.saveCardTemplate(draft);
 const after=await f.makeService({persona}).inspect(),player=after.rows.find(r=>r.values.名称==='阿青'),lan=after.rows.find(r=>r.values.名称==='岚'),relation=after.rows.find(r=>r.table==='relations'),known=after.rows.find(r=>r.table==='cognition');
 assert.equal(player.values.描述,original);assert.equal(after.rows.filter(r=>r.table==='objects').length,2);assert.equal(relation.values.主体,player.id);assert.equal(relation.values.对象,lan.id);assert.equal(known.values.主体,lan.id);assert.deepEqual(known.access.knowers,[lan.id]);assert.equal(after.rows.some(r=>r.table==='events'),false);assert.deepEqual(f.c.chat,sourceChat);
 mode='late-ai';const late=await service.cardTemplate(),before=JSON.stringify([...f.saved]);await assert.rejects(service.saveCardTemplate(late),/连续原文证据/);assert.equal(JSON.stringify([...f.saved]),before);
});
test('initialization blockers leave all proposed origin and session writes unsaved',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];f.c.characters[0].description='岚是守门人。';f.responder(()=>({base:{changes:[op('new:lan','objects',{名称:'岚',类型:'character'},'岚是守门人。')]},initial:{changes:[],pending:['必需定义有冲突']},notes:[]}));
 const draft=await f.service.cardTemplate(),before=JSON.stringify([...f.saved]);await assert.rejects(f.service.saveCardTemplate(draft),/初始化仍有阻塞项/);assert.equal(JSON.stringify([...f.saved]),before);assert.equal((await f.service.inspect()).rows.length,0);
});
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
 const reused=panel.root.querySelector('[aria-label="初始化来源"]');reused.value='reuse';reused.dispatchEvent(new w.Event('input'));await click('读取并预览初始化模板');assert.equal(f.calls.length,0);assert.equal(panel.requestLeave().allowed,false);const previewBox=[...panel.root.querySelectorAll('fieldset')].find(node=>node.querySelector('legend')?.textContent==='初始化草稿'),beforeSave=JSON.stringify([...f.saved]);assert(previewBox);select.value='forms';await select.onchange();assert.equal(select.value,'atlas');assert.equal(JSON.stringify([...f.saved]),beforeSave);assert.equal(panel.requestLeave().allowed,false);select.value='history';await select.onchange();assert.equal(select.value,'history');assert(panel.root.contains(previewBox));assert.equal(JSON.stringify([...f.saved]),beforeSave);
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
 await f.service.prepare();assert.equal((await f.service.inspect()).rows.length,1);f.c.chat[0].mes='门是蓝色';assert.equal((await f.service.inspect()).rows.length,0);assert.equal((await f.service.inspect()).origin.bases.length,0);
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
test('historical anchors do not inherit a later genesis pin or its initial relationship',async()=>{
 const f=fixture();await f.service.initialize();
 await f.service.edit({changes:[op('new:old','objects',{名称:'先到的岚',类型:'character'},'用户手动修改表单')]});
 const early=await f.service.inspect(),cut=early.session.commits.at(-1).id,old=early.rows.find(r=>r.values.名称==='先到的岚');
 f.responder(()=>({blueprint:{name:'后到者',goal:'新增后到的澄',decisions:[],unresolved:[]},checklist:[],artifacts:{registry:early.registry,base:{changes:[op('new:late','objects',{名称:'后到的澄',类型:'character'},'新增后到的澄')]},initial:{changes:[op('new:rel','relations',{名称:'后来相识',主体:old.id,对象:'new:late',证据:'新增后到的澄'},'新增后到的澄')]}},workflow:{id:'late',name:'后到者',version:1,steps:[]}}));
 await f.service.saveGenesis(await f.service.genesis('新增后到的澄'));
 const before=await f.service.inspect();assert(before.session.pins.some(p=>p.startsWith(before.rows.find(r=>r.values.名称==='后到的澄').id+'@')));
 const anchor=await f.service.saveAnchor({name:'澄到来以前',cut,nodes:[]});
 assert.deepEqual(anchor.rows.map(r=>r.id),[old.id]);assert.equal(anchor.rows.some(r=>r.table==='relations'),false);
 f.c.chatId='anchor-before-genesis';await f.service.initialize();await f.service.useAnchor(anchor.id);
 const after=await f.service.inspect();assert.deepEqual(after.rows.map(r=>r.id),[old.id]);assert.equal(after.rows.find(r=>r.id===old.id).values.名称,'先到的岚');
});
test('historical anchors restore earlier object values and knowledge, leaving source history intact',async()=>{
 const f=fixture();await f.service.initialize();await f.service.edit({changes:[op('new:person','objects',{名称:'岚',类型:'character',描述:'尚未承担守门职责'},'用户手动修改表单')]});
 const early=await f.service.inspect(),cut=early.session.commits.at(-1).id,person=early.rows[0];
 await f.service.edit({changes:[op(person.id,'objects',{描述:'多年后成为守门人'},'用户手动修改表单',person.rev),{...op('new:knowledge','cognition',{名称:'后来秘密',主体:person.id,认识:'地下室有暗门',确认程度:'确认'},'用户手动修改表单'),access:{readers:['读者'],knowers:[person.id]}}]});
 const current=await f.service.inspect(),anchor=await f.service.saveAnchor({name:'当年',cut,nodes:[]});assert.equal(anchor.rows.find(r=>r.id===person.id).values.描述,'尚未承担守门职责');assert.equal(anchor.rows.some(r=>r.table==='cognition'),false);assert.equal(anchor.worldTime,null);
 const after=await f.service.inspect();assert.deepEqual(after.rows,current.rows);assert.deepEqual(after.session.commits,current.session.commits);assert.equal(after.rows.find(r=>r.id===person.id).values.描述,'多年后成为守门人');
});
test('historical anchors keep the selected origin version at that time and omit later imported assets',async()=>{
 const f=fixture();await f.service.initialize();await initializeBase(f,[op('new:one','objects',{名称:'外来者',类型:'character',描述:'第一版'},'用户手动修改表单'),op('new:two','objects',{名称:'后来选择的钟',类型:'item'},'用户手动修改表单')]);
 let data=await f.service.inspect();const person=data.rows.find(r=>r.values.名称==='外来者'),item=data.rows.find(r=>r.values.类型==='item');await initializeBase(f,[op(person.id,'objects',{描述:'第二版'},'用户手动修改表单',person.rev)]);
 f.c.chatId='pin-history';await f.service.initialize();await f.service.pinOrigins([person.id+'@1']);data=await f.service.inspect();const cut=data.session.commits.at(-1).id;
 await f.service.pinOrigins([person.id+'@2',item.id+'@1']);assert.equal((await f.service.inspect()).rows.find(r=>r.id===person.id).values.描述,'第二版');
 const anchor=await f.service.saveAnchor({name:'只选第一版时',cut,nodes:[]});assert.equal(anchor.rows.find(r=>r.id===person.id).values.描述,'第一版');assert.equal(anchor.rows.some(r=>r.id===item.id),false);
 const start=await f.service.saveAnchor({name:'导入前',cut:'start',nodes:[]});assert.deepEqual(start.rows,[]);
});
test('forking an early floor excludes later source-less genesis commits',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true});f.c.chat=[ai('第一次抵达'),user('次日'),ai('后来相遇')];
 f.responder(()=>({changes:[op('new:arrival','events',{名称:'第一次抵达',经过:'第一次抵达'},'第一次抵达')]}));await f.service.archive({range:{from:1,to:1,limit:1}});
 const early=await f.service.inspect();f.responder(()=>({blueprint:{name:'后来人物',goal:'创建后来人物',decisions:[],unresolved:[]},checklist:[],artifacts:{registry:early.registry,base:{changes:[op('new:later','objects',{名称:'后来人物',类型:'character'},'创建后来人物')]},initial:{changes:[]}},workflow:{id:'later',name:'后来人物',version:1,steps:[]}}));await f.service.saveGenesis(await f.service.genesis('创建后来人物'));
 await f.service.stageFork(1,false);f.c.chat=f.c.chat.slice(0,1);await f.service.activateFork({rollback:true});const after=await f.service.inspect();assert.equal(after.rows.some(r=>r.values.名称==='后来人物'),false);assert.equal(after.rows.filter(r=>r.table==='events').length,1);
});
test('new genesis initial references remain valid after explicit origin selections',async()=>{
 const f=fixture();await f.service.initialize();await f.service.pinOrigins([]);const data=await f.service.inspect();
 f.responder(()=>({blueprint:{name:'岚与钟',goal:'创建岚和钟',decisions:[],unresolved:[]},checklist:[],artifacts:{registry:data.registry,base:{changes:[op('new:person','objects',{名称:'岚',类型:'character'},'创建岚和钟'),op('new:item','objects',{名称:'钟',类型:'item'},'创建岚和钟')]},initial:{changes:[op('new:holding','holdings',{名称:'岚持钟',保管者:['new:person'],物品:'new:item',数量:1},'创建岚和钟')]}},workflow:{id:'pair',name:'岚与钟',version:1,steps:[]}}));await f.service.saveGenesis(await f.service.genesis('创建岚和钟'));const after=await f.service.inspect();assert.equal(after.rows.filter(r=>r.table==='objects').length,2);assert.equal(after.rows.filter(r=>r.table==='holdings').length,1);
});
test('single core service preserves multiline evidence through natural material and validates it again before saving',async()=>{
 const f=fixture();await f.service.initialize();const raw='第一行“原话”\r\n第二行 \\ 原路径';await initializeBase(f,[op('new:item','objects',{名称:'旧物',类型:'item',描述:raw},'用户手动修改表单')]);const row=(await f.service.inspect()).rows.find(r=>r.values.名称==='旧物');
 f.responder((task,input)=>{assert.equal(task,'assetAdapt');assert.equal(input.sourceCard[0].values.描述,raw);return {core:{name:'旧物意义',traits:[{name:'用途',value:'原文支持的意义',evidence:raw}],growth:[]},notes:[]};});
 const draft=await f.service.coreDraft(row.id),bad=structuredClone(draft),before=JSON.stringify([...f.saved]);bad.core.traits[0].evidence='描述';await assert.rejects(f.service.saveCore(bad),/原文依据/);assert.equal(JSON.stringify([...f.saved]),before);const saved=await f.service.saveCore(draft);assert.equal(saved.traits[0].evidence,raw);
});
test('equipment baselines retain source type and bind only the adapted item, never incidental characters',async()=>{
 const f=fixture();await f.service.initialize();await f.service.edit({changes:[op('new:key','objects',{名称:'无齿铜钥匙',类型:'item',属性:{用途:'不能开锁，只在掌心留住熟悉重量；是师徒相处的纪念。'}},'用户手动修改表单')]});const before=await f.service.inspect(),item=before.rows[0];
 f.responder((task,input)=>{assert.equal(task,'assetAdapt');assert.match(JSON.stringify(input.sourceCard),/无齿铜钥匙/);return formatSimpleSheet({core:{name:'掌心的旧物',traits:[{name:'用途与叙事意义',value:'没有实用开锁能力的掌心旧物，熟悉重量承载师徒纪念。',evidence:'不能开锁，只在掌心留住熟悉重量；是师徒相处的纪念。'}],growth:[]},notes:[]});});
 const draft=await f.service.coreDraft(item.id),core=await f.service.saveCore(draft);assert.equal(core.kind,'item');assert.equal(core.sourceType,'item');assert.deepEqual(core.growth,[]);const originBook=before.settings.originBook;
 f.c.chatId='other-world';f.c.characters[0].description='高科技港城，物品采用本地技术表达。';await f.service.initialize();let ambiguous=false;
 f.responder((task,input)=>{assert.equal(task,'tableGenesis');assert.match(input.goal,/叙事意义/);return {blueprint:{name:'适配旧物',goal:'当前世界表达',decisions:['建立纪念物和路人'],unresolved:[]},checklist:[],artifacts:{registry:input.registry,base:{changes:[op('new:item1','objects',{名称:'掌心旧构件',类型:'item',属性:{用途:'没有功能，只保留熟悉重量和师徒纪念。'}},'建立纪念物和路人'),op('new:extra','objects',{名称:ambiguous?'第二件旧物':'路过工匠',类型:ambiguous?'item':'character'},'建立纪念物和路人')]},initial:{changes:[]}},workflow:{id:'adapt-item',name:'适配旧物',version:1,steps:[]}};});
 const adapted=await f.service.adaptCore(originBook,core.id);const changes=adapted.proposal.artifacts.base.changes;assert.match(changes[0].values.核心引用,new RegExp(core.id));assert.equal(changes[1].values.核心引用,undefined);const unchanged=JSON.stringify([...f.saved]);ambiguous=true;await assert.rejects(f.service.adaptCore(originBook,core.id),/明确的基点主体映射/);assert.equal(JSON.stringify([...f.saved]),unchanged);
});
test('plot API remains a proposal and explicit preference constraints reach context',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:true,hardRules:['禁止使用套话甲']});f.responder(async task=>task==='plotAdvance'?{goal:'到达门口',beats:[],pendingChoices:['是否进入'],due:[],clues:[],constraints:['禁止使用套话甲']}:{changes:[],templates:[]});const result=await f.service.prepare();assert.match(result.text,/禁止使用套话甲/);assert.match(result.text,/是否进入/);assert.equal((await f.service.inspect()).rows.length,0);
});
test('plan sheet due and clues reach legacy and English final messages once without becoming stored facts',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,archive:false,plot:true});f.c.chat.push({is_user:true,mes:'查看门口的情况'});
 const proposal={goal:'PLAN_GOAL',beats:[{proposal:'PLAN_BEAT',basis:['PLAN_BASIS'],condition:'PLAN_CONDITION'}],pendingChoices:['PLAN_CHOICE'],due:['PLAN_DUE\n核实期限及触发条件'],clues:['PLAN_CLUE\n先核实人物能否知情'],constraints:['PLAN_LIMIT']};
 const saved=JSON.stringify([...f.saved]),copy=structuredClone(proposal);f.responder(async(task,input)=>{assert.equal(task,'plotAdvance');assert.equal(input.phase,'plan');return formatSimpleSheet(proposal);});
 const result=await f.service.prepare(),source={prompts:[{identifier:'tisya_english_v1',content:''},...Object.keys(result.slots).map(key=>({identifier:SLOT_TARGETS[key],content:'{{tisya_slot_'+key+'}}'})),{identifier:'chatHistory',marker:true}].map(p=>({...p,enabled:true,role:'system'}))};
 const text=buildMessages({source,context:f.c,world:f.store.read().world,materials:'',slots:result.slots,substitute:s=>s}).map(m=>m.content).join('\n');
 for(const payload of [result.text,text])for(const value of ['PLAN_GOAL','PLAN_BEAT','PLAN_BASIS','PLAN_CONDITION','PLAN_CHOICE','PLAN_DUE','PLAN_CLUE','PLAN_LIMIT'])assert.equal(payload.split(value).length-1,1,value);
 assert.match(text,/<NarrativeAgenda>[\s\S]*PLAN_DUE[\s\S]*PLAN_CLUE[\s\S]*<\/NarrativeAgenda>/);assert.doesNotMatch(text,/<当前叙事待办>/);
 assert.match(text,/尚未发生的候选，不作为历史事实/);assert.match(text,/不代表已经触发或人物已经知情/);assert(text.includes(proposal.due[0]));assert(text.includes(proposal.clues[0]));
 assert.equal(JSON.stringify([...f.saved]),saved);assert.equal((await f.service.inspect()).rows.length,0);assert.deepEqual(proposal,copy);assert.equal(f.calls.filter(call=>call.task==='plotAdvance').length,1);
});
test('incomplete or incorrectly typed plan lists fail visibly without retaining a stale plan or writing facts',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,archive:false,plot:true});
 const valid={goal:'VALID_PLAN',beats:[],pendingChoices:[],due:[],clues:[],constraints:[]};let proposal=valid;f.responder(async()=>formatSimpleSheet(proposal));
 await f.service.prepare();assert(f.service.preview());const saved=JSON.stringify([...f.saved]);
 for(const field of ['due','clues'])for(const value of [undefined,null,0,false,'不是列表',{},[0],[false],[null],[undefined]]){
  proposal={...valid,[field]:value};if(value===undefined)delete proposal[field];
  await assert.rejects(f.service.prepare(),new RegExp(field+' 须为文本列表'));
  assert.equal(f.service.preview(),null);assert.equal(f.prompts.at(-1).text,'');assert.equal(f.service.state().progress.stage,'error');assert.equal(JSON.stringify([...f.saved]),saved);
 }
 proposal={...valid,changes:[]};await assert.rejects(f.service.prepare(),/不得产生事实写入/);assert.equal(JSON.stringify([...f.saved]),saved);
 proposal=valid;const retried=await f.service.prepare();assert.match(retried.text,/VALID_PLAN/);assert.equal((await f.service.inspect()).rows.length,0);
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
 const click=async text=>{const b=[...panel.root.querySelectorAll('button')].find(x=>x.textContent===text);if(b)return b.onclick();const select=panel.root.querySelector('[aria-label="表单功能"]'),option=[...select.options].find(o=>o.textContent===text);assert(option,text);select.value=option.value;return select.onchange();};await click('初始化与历史');assert.match(panel.root.textContent,/共 3 条/);assert.match(panel.root.textContent,/归档状态尚未核对/);await click('开始／继续补录所选楼层');assert.match(panel.root.textContent,/新版酒馆助手/);assert(panel.root.querySelector('[aria-label="历史原文或手写摘要"]'));await click('预设与表单全文');assert.match(panel.root.textContent,/历史事件记忆/);assert.match(panel.root.textContent,/tableArchive/);assert.match(panel.root.textContent,/完整.*简表/);assert.equal(f.saved.size,0);
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

test('card initialization reuses pinned initial state and discovery context in independent saves',async()=>{
 const f=fixture();f.c.characters[0].data={description:'驿长顾青每日下午在白鹭驿站值班。初始位于驿站。'};for(const name of ['角色原书','数据库资料'])f.saved.set(name,[]);
 f.responder((task,input)=>{assert.equal(task,'templateInit');const r=input.registry;return {registry:r,notes:['依据角色卡初始化'],base:{changes:[op('new:station','objects',{名称:'白鹭驿站',类型:'place'},'白鹭驿站'),op('new:gu','objects',{名称:'顾青',类型:'character',属性:{身份:'驿长'},发现环境:{地点:['new:station'],时段:'每日下午',来源依据:'驿长顾青每日下午在白鹭驿站值班。'}},'驿长顾青每日下午在白鹭驿站值班。')]},initial:{changes:[op('new:place','state',{名称:'顾青位置',对象:'new:gu',字段:'当前位置',值:'白鹭驿站'},'初始位于驿站。')]}};});
 const draft=await f.service.cardTemplate();assert.equal((await f.service.inspect()).rows.length,0);await f.service.saveCardTemplate(draft);const first=await f.service.inspect();assert.equal(first.origin.bases.length,2);assert.equal(first.rows.filter(x=>x.table==='state').length,1);const gu=first.rows.find(x=>x.values.名称==='顾青');assert(!gu.values.发现环境.地点[0].startsWith('new:'));
 f.c.chatId='new-save';await f.service.initialize();const second=await f.service.inspect();assert.equal(second.rows.length,3);assert.equal(second.rows.find(x=>x.table==='state').values.值,'白鹭驿站');assert.notEqual(second.session.id,first.session.id);assert(second.rows.find(x=>x.values.名称==='顾青').values.发现环境);
});
test('valid independent archive items persist while malformed items leave floor pending',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('收到信件。'),user('继续'),ai('最新')];f.responder(()=>({changes:[op('new:event','events',{名称:'收信',经过:'收到信件。'},'收到信件。'),op('new:bad','state',{名称:'错误引用',对象:'missing',字段:'伤势',值:'无'},'收到信件。')]}));const result=await f.service.archive({range:{from:1,to:1,limit:1}});const data=await f.service.inspect();assert.equal(data.rows.length,1);assert.equal(result.archived,0);assert(result.pending.length);assert.equal(f.calls.length,2);assert.equal((await f.service.scan())[0].archived,false);
});
test('plot object remains a session overlay and source removal never pollutes origin',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('岚在北门。'),user('继续'),ai('最新')];f.responder(()=>({changes:[op('new:lan','objects',{名称:'岚',类型:'character'},'岚'),op('new:where','state',{名称:'岚位置',对象:'new:lan',字段:'当前位置',值:'北门'},'岚在北门。')]}));await f.service.archive({range:{from:1,to:1,limit:1}});let data=await f.service.inspect();assert.equal(data.origin.bases.length,0);assert.equal(data.rows.length,2);f.c.chat[0].mes='此段被重投替换';data=await f.service.inspect();assert.equal(data.rows.length,0);assert.equal(data.origin.bases.length,0);
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
 f.responder(async(task,input)=>{assert.equal(task,'tableArchive');assert(!input.archiveSource.text.includes('去吃饭'));const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'体能下降到8'}],pending:[]};});
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
test('reroll branch keeps candidate commits switchable rather than freezing discarded facts into its baseline',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,plot:false});f.c.chat=[{...ai('旧候选事实'),swipes:['旧候选事实','另一候选事实'],swipe_id:0},user('继续'),ai('后文事实')];
 f.responder(async(_,input)=>({changes:[op('new:event','events',{名称:input.archiveSource.text,经过:input.archiveSource.text},input.archiveSource.text)]}));await f.service.archive({range:{from:1,to:3,limit:3}});const original=(await f.service.inspect()).session.id;
 f.c.chat[0].mes='另一候选事实';f.c.chat[0].swipe_id=1;await f.service.archive({range:{from:1,to:1,limit:1}});await f.service.stageFork(1,false,{preserveCandidates:true});f.c.chatId='reroll-branch';f.c.chat=f.c.chat.slice(0,1);await Promise.all([f.service.activateFork(),f.service.activateFork()]);
 const branched=await f.service.inspect();assert.notEqual(branched.session.id,original);assert.equal(branched.session.branchSeed,undefined);assert.deepEqual(branched.rows.filter(r=>r.table==='events').map(r=>r.values.名称),['另一候选事实']);
 f.c.chat[0].mes='旧候选事实';f.c.chat[0].swipe_id=0;assert.deepEqual((await f.service.inspect()).rows.filter(r=>r.table==='events').map(r=>r.values.名称),['旧候选事实']);
 f.c.chat[0].swipes.push('新生成未归档');f.c.chat[0].mes='新生成未归档';f.c.chat[0].swipe_id=2;assert.deepEqual((await f.service.inspect()).rows.filter(r=>r.table==='events'),[]);
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
 const f=fixture();await f.service.initialize();f.c.chat=[ai('门已开启。'),user('继续')];let release;const wire=formatSimpleSheet({changes:[]}),partial=wire.slice(0,16);
 const service=f.makeService({request:async(task,input,{onProgress})=>{onProgress({stage:'thinking',text:'',characters:0,reasoning:'PRIVATE_REASONING'});onProgress({stage:'receiving',text:partial,characters:partial.length});return new Promise(resolve=>release=resolve);}});
 const job=service.archive({includeLatest:true,range:{from:1,to:1,limit:1}});while(!release)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(service.state().progress.text,partial);assert.equal(service.state().progress.stage,'receiving');assert(!JSON.stringify(service.state()).includes('PRIVATE_REASONING'));release(wire);await job;assert.equal(service.state().progress.stage,'complete');assert.equal(service.state().progress.characters,wire.length);
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

test('global preferences require confirmation, survive reload and reach new origin design while local preferences stay scoped',async()=>{
 const f=fixture();await f.service.initialize();await f.set({enabled:true,preferences:true,archive:false,plot:false});
 const source='以后所有故事的新角色都偏稳重。本会话用短句。';f.c.chat=[user(source),ai('暂存')];
 f.responder(()=>({changes:[op('new:global','preferences',{名称:'稳重角色',内容:'以后所有故事的新角色都偏稳重。',性质:'明确要求',强度:'喜爱',类别:'SFW角色表现',作用域:{全局:true},启用:true},'以后所有故事的新角色都偏稳重。'),op('new:local','preferences',{名称:'短句',内容:'本会话用短句。',性质:'明确要求',强度:'喜爱',类别:'文风',作用域:{会话:['one']},启用:true},'本会话用短句。')]}));
 assert.deepEqual(await f.service.analysePreferences(),{processed:1,pending:2});let info=await f.service.inspect();assert.equal(info.rows.filter(r=>r.table==='preferences').length,0);assert.equal(f.store.read().data.全局偏好,undefined);
 const globalDraft=info.preferenceDrafts.find(d=>d.proposal.changes[0].values.作用域.全局===true),localDraft=info.preferenceDrafts.find(d=>d.id!==globalDraft.id),sessionBefore=JSON.stringify(info.session);
 await f.service.reviewPreference(globalDraft.id,globalDraft.proposal);info=await f.makeService().inspect();assert.equal(JSON.stringify(info.session),sessionBefore);assert.equal(info.preferenceDrafts.find(d=>d.id===globalDraft.id).status,'accepted');assert.equal(info.preferenceDrafts.find(d=>d.id===localDraft.id).status,'pending');assert.equal(f.store.read().data.全局偏好.记录.length,1);
 await f.service.reviewPreference(localDraft.id,localDraft.proposal);assert.equal((await f.service.inspect()).rows.filter(r=>r.table==='preferences').length,2);
 f.c.chatId='two';f.c.chat=[user('设计两个不同的新同伴。')];await f.service.initialize();await f.set({preferences:false});
 const blueprint=(task,input)=>{assert.equal(task,'tableGenesis');return {blueprint:{name:'新同伴',goal:input.goal,decisions:[],unresolved:[]},checklist:[],artifacts:{registry:input.registry,base:{changes:[]},initial:{changes:[]}},workflow:{id:'new-cast',name:'新同伴',version:1,steps:[]}};};f.responder(blueprint);
 await f.makeService().genesis('设计两个不同的新同伴。');let input=f.calls.at(-1).input;assert.deepEqual(input.preferences.map(r=>r.values.名称),['稳重角色']);assert.equal(input.preferences[0].source,null);
 const {taskSlots}=await import('../tables/slots.js');assert.deepEqual(taskSlots('tableGenesis',input).preferences.rows,input.preferences);
 const row=(await f.service.inspect()).rows.find(r=>r.table==='preferences');await f.service.edit({changes:[op(row.id,'preferences',{启用:false},'用户手动修改表单',row.rev)]});
 await f.makeService().genesis('设计两个不同的新同伴。');assert.deepEqual(f.calls.at(-1).input.preferences,[]);assert.equal(f.store.read().data.全局偏好.历史.length,2);
});

test('failed global preference persistence keeps the candidate pending without writing a session or applying preferences',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[user('所有故事都避免空泛夸赞。'),ai('暂存')];f.responder(()=>({changes:[op('new:global','preferences',{名称:'避免空泛夸赞',内容:'所有故事都避免空泛夸赞。',性质:'明确要求',强度:'禁止',作用域:{全局:true},启用:true},'所有故事都避免空泛夸赞。')]}));await f.service.analysePreferences();
 const draft=(await f.service.inspect()).preferenceDrafts[0],before=JSON.stringify([...f.saved]);let succeeds=false;
 const failingStore=createStore({getContext:()=>f.c,persist:async()=>succeeds}),service=f.makeService({store:failingStore});
 await assert.rejects(service.reviewPreference(draft.id,draft.proposal),/宿主未确认保存/);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(f.store.read().data.全局偏好,undefined);assert.equal((await f.service.inspect()).preferenceDrafts[0].status,'pending');
 succeeds=true;await service.reviewPreference(draft.id,draft.proposal);await assert.rejects(service.reviewPreference(draft.id,draft.proposal),/已处理/);assert.equal(f.store.read().data.全局偏好.记录.length,1);assert.equal(JSON.stringify([...f.saved]),before);
});

test('new object archive receives consecutive user definitions and saves a user-only dossier without requiring AI repetition',async()=>{
 const f=fixture();await f.service.initialize();await f.set({objectsSeparate:true,offstage:false});f.c.chat=[user('新人物设定：秋是信使。'),user('秋习惯先观察。'),ai('有人推开门。'),user('继续'),ai('暂存')];
 f.responder((task,input)=>{if(task==='objectArchive'){assert.deepEqual(input.userSource.sources.map(s=>s.text),['新人物设定：秋是信使。','秋习惯先观察。']);assert.equal(input.archiveSource.text,'有人推开门。');return {changes:[op('new:qiu','objects',{名称:'秋',类型:'character',属性:{身份:'信使',性格:'习惯先观察'}},'秋是信使。')]};}assert.equal(task,'historyImport');return {changes:[]};});
 await f.service.archive({range:{from:3,to:3,limit:1}});const info=await f.makeService().inspect();assert.equal(info.rows.find(r=>r.values.名称==='秋').values.属性.身份,'信使');assert.equal(info.rows.filter(r=>r.table==='events').length,0);
});

test('bundle selection previews closure without importing unselected objects, links or growth',async()=>{
 const f=fixture();await f.service.initialize();await f.service.edit({changes:[op('new:p','objects',{名称:'守铃人',类型:'character',描述:'以耐心教导代替直接给答案。'},'用户手动修改表单'),op('new:i','objects',{名称:'静铃',类型:'item',描述:'无声的普通铜铃，握持的重量帮助思考。'},'用户手动修改表单'),op('new:holding','holdings',{名称:'守铃人保管静铃',保管者:['new:p'],物品:'new:i',数量:1},'用户手动修改表单')]});
 const before=await f.service.inspect(),person=before.rows.find(r=>r.values.名称==='守铃人'),item=before.rows.find(r=>r.values.名称==='静铃'),link=before.rows.find(r=>r.table==='holdings'),saved=JSON.stringify([...f.saved]);
 const preview=await f.service.previewCoreBundle([person.id]);assert.deepEqual(preview.objects.map(x=>x.id),[person.id]);assert.deepEqual(preview.related.map(x=>x.id),[item.id]);assert.equal(preview.links[0].complete,false);assert.equal(JSON.stringify([...f.saved]),saved);
 await assert.rejects(f.service.coreBundleDraft([person.id],{linkIds:[link.id]}),/未选对象/);assert.equal(f.calls.length,0);assert.equal(JSON.stringify([...f.saved]),saved);
 const full=await f.service.previewCoreBundle([person.id,item.id],{linkIds:[link.id]});assert.equal(full.source.links.length,1);assert.equal(full.source.objects.every(x=>!x.growth.length),true);
});

test('bundle extract/edit/save/adapt validates each meaning and preserves source worlds on fresh reload',async()=>{
 const f=fixture();await f.service.initialize();await f.service.edit({changes:[op('new:p','objects',{名称:'守铃人',类型:'character',描述:'以耐心教导代替直接给答案。'},'用户手动修改表单'),op('new:i','objects',{名称:'静铃',类型:'item',描述:'无声的普通铜铃，握持的重量帮助思考。'},'用户手动修改表单'),op('new:holding','holdings',{名称:'守铃人保管静铃',保管者:['new:p'],物品:'new:i',数量:1},'用户手动修改表单')]});
 const before=await f.service.inspect(),objects=before.rows.filter(x=>x.table==='objects'),link=before.rows.find(x=>x.table==='holdings'),book=before.settings.originBook;let leak=false;
 f.responder((task,input)=>{assert.equal(task,'assetAdapt');const source=input.sourceCard;assert.equal(source.format,'tisya.core-selection/1');return formatSimpleSheet({bundle:{name:'守铃人与静铃',members:source.objects.map(({row})=>({sourceObject:row.id,name:row.values.名称,traits:[{name:'核心意义',value:row.values.描述,evidence:leak&&row.id===objects[0].id?objects[1].values.描述:row.values.描述}],growth:[]})),links:source.links.map(x=>({sourceRow:x.row.id,members:x.members,name:'物件保管的职责',value:'人物承担照管物件的职责，但新世界开局持有另定。',evidence:x.row.values.名称}))},notes:[]});});
 const draft=await f.service.coreBundleDraft(objects.map(x=>x.id),{linkIds:[link.id]});assert.equal((await f.service.listCores()).length,0);draft.bundle.members[0].traits[0].value='耐心地引导对方独立思考。';
 const tampered=structuredClone(draft);tampered.source.objects[0].row.values.描述='伪造来源';await assert.rejects(f.service.saveCoreBundle(tampered),/来源或选择已改变/);
 const bundle=await f.service.saveCoreBundle(draft);assert.equal(bundle.members.length,2);assert.deepEqual(bundle.members.map(x=>x.kind),['character','item']);assert.deepEqual((await f.makeService().inspect()).rows,before.rows);assert.deepEqual((await f.service.inspect()).session,before.session);
 const sourceBook=JSON.stringify(f.saved.get(book));leak=true;await assert.rejects(f.service.coreBundleDraft(objects.map(x=>x.id)),/本对象/);
 f.c.chatId='bundle-target';f.binding.primary='';f.binding.additional=[];f.c.characters[0]={avatar:'b.png',name:'山院',description:'以竹木和手工技艺为主的古代山院。'};await f.service.initialize();let invalid=false;
 f.responder((task,input)=>{assert.equal(task,'tableGenesis');assert.match(input.goal,/tisya.core-bundle\/1/);const defs=bundle.members.map((member,i)=>({id:'new:m'+i,table:'objects',expected:0,values:{名称:i?'竹节坠':'问竹师',类型:member.kind,描述:i?'一件不鸣响的普通竹节坠，手中重量为思考提供触觉支点。问竹师的职责包括照管此物，开局保管者另定。':'山院的讲习者以耐心追问引导学徒独立思考。',核心引用:book+' / '+bundle.id+'@1/'+member.sourceObject},access,evidence:'创建问竹师与竹节坠并保留各自的核心意义。'}));return {blueprint:{name:'山院适配',goal:input.goal,decisions:['创建问竹师与竹节坠并保留各自的核心意义。'],unresolved:[]},checklist:[],artifacts:{registry:input.registry,base:{changes:defs},initial:{changes:[]}},workflow:{id:'adapt-bundle',name:'整组适配',version:1,steps:[]},coreMapping:{members:bundle.members.map((member,i)=>({member:member.sourceObject,object:'new:m'+i,items:invalid?[]:member.traits.map(x=>({item:x.id,path:['描述'],expression:defs[i].values.描述}))})),links:bundle.links.map(x=>({link:x.id,targets:[{object:'new:m1',path:['描述'],expression:'问竹师的职责包括照管此物，开局保管者另定。'}]}))}};});
 invalid=true;const bad=await f.service.adaptCoreBundle(book,bundle.id);assert(bad.mappingErrors.length);const state=JSON.stringify([...f.saved]);await assert.rejects(f.service.saveGenesis(bad),/适配映射遗漏/);assert.equal(JSON.stringify([...f.saved]),state);
 invalid=false;const adapted=await f.service.adaptCoreBundle(book,bundle.id);assert.deepEqual(adapted.mappingErrors,[]);const edited=structuredClone(adapted);edited.proposal.artifacts.base.changes[0].values.描述='删掉映射所引用的表达';await assert.rejects(f.service.saveGenesis(edited),/逐字存在/);assert.equal(JSON.stringify([...f.saved]),state);
 const merged=structuredClone(adapted);merged.proposal.coreMapping.members[1].object=merged.proposal.coreMapping.members[0].object;await assert.rejects(f.service.saveGenesis(merged),/不能混作/);
 const inherited=structuredClone(adapted);inherited.proposal.artifacts.initial.changes=[op('new:ownership','holdings',{名称:'旧持有直接继承',保管者:['new:m0'],物品:'new:m1',数量:1},'旧持有直接继承')];await assert.rejects(f.service.saveGenesis(inherited),/另行确认开局/);assert.equal(JSON.stringify([...f.saved]),state);
 const leaked=structuredClone(adapted);leaked.proposal.artifacts.base.changes[0].access.knowers=[objects[0].id];await assert.rejects(f.service.saveGenesis(leaked),/不自动授予/);assert.equal(JSON.stringify([...f.saved]),state);
 await f.service.saveGenesis(adapted);const after=await f.makeService().inspect();assert.equal(after.rows.length,2);assert(after.rows.every(x=>x.table==='objects'));assert.equal(after.origin.coreAdaptations.length,1);const mapping=after.origin.coreAdaptations[0];assert(mapping.members.every(x=>after.origin.bases.some(b=>b.id+'@'+b.rev===x.object)));assert(mapping.links.every(x=>x.targets.every(t=>after.origin.bases.some(b=>b.id+'@'+b.rev===t.object))));assert.equal(JSON.stringify(f.saved.get(book)),sourceBook);assert.deepEqual((await f.service.listCores(book))[0],bundle);
});

test('canon service freezes exact chat and ledger versions, reads without writes and keeps unarchived boundaries',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('第一楼原文'),user('继续'),{...ai('尚未归档的末楼'),swipe_id:0,swipes:['尚未归档的末楼','废弃候选']}];
 f.responder(()=>({changes:[op('new:event','events',{名称:'第一楼',经过:'第一楼原文'},'第一楼原文')]}));await f.service.archive({range:{from:1,to:1,limit:1}});
 const before=await f.service.inspect(),chat=structuredClone(f.c.chat),callCount=f.calls.length,anchor=await f.service.freezeCanon({name:'三楼原著'}),saved=JSON.stringify([...f.saved]);
 const reloaded=await f.makeService().readCanon(anchor.id);assert.equal(JSON.stringify([...f.saved]),saved);assert.equal(f.calls.length,callCount);assert.deepEqual(reloaded.anchor.canon.snapshot.chat,chat);assert.deepEqual(reloaded.anchor.canon.snapshot.session,before.session);assert.equal(reloaded.receipt.unarchivedSources[0].floor,3);assert.deepEqual((await f.service.inspect()).session,before.session);
 f.c.chat[2].mes='源聊天后来变化';assert.deepEqual((await f.service.readCanon(anchor.id)).anchor.canon.snapshot.chat,chat);
 f.c.chatId='canon-new';f.c.chat=[];await f.service.initialize();await f.service.useAnchor(anchor.id);const branch=await f.service.inspect();assert.equal(branch.rows.filter(r=>r.table==='events').length,1);assert(!JSON.stringify(branch.session.branchSeed).includes('尚未归档'));assert.equal(branch.archived,0);
});
test('canon refuses absent stores and an in-flight raw candidate change without creating a frozen record',async()=>{
 const f=fixture();const initial=JSON.stringify([...f.saved]);await assert.rejects(f.service.freezeCanon({name:'不存在'}),/先建立/);assert.equal(JSON.stringify([...f.saved]),initial);
 await f.service.initialize();f.c.chat=[{...ai('当前候选'),swipe_id:0,swipes:['当前候选','备用候选']}];const before=JSON.stringify([...f.saved]);f.writeHook(()=>{f.c.chat[0].swipes[1]='保存中改写的备用候选';});await assert.rejects(f.service.freezeCanon({name:'冲突'}),/聊天原文或候选已改变/);assert.equal(JSON.stringify([...f.saved]),before);
});
test('canon panel freezes from its actual control and shows the unarchived source count',async()=>{
 const {Window}=await import('happy-dom'),{mountTablePanel}=await import('../tables/panel.js');const f=fixture();await f.service.initialize();const w=new Window(),panel=mountTablePanel(w.document,w.document.body,{service:f.service,store:f.store});await panel.ready;
 const select=panel.root.querySelector('[aria-label="表单功能"]');select.value='parallel';await select.onchange();const name=panel.root.querySelector('[aria-label="时间锚名称"]');assert(name);name.value='界面冻结';name.dispatchEvent(new w.Event('input'));
 const button=[...panel.root.querySelectorAll('button')].find(b=>b.textContent==='冻结存档并保存所选起点');assert(button);await button.onclick();assert.equal(panel.root.querySelector('[role=alert]'),null);
 const info=await f.service.inspect(),anchor=info.origin.timelineAnchors[0];assert.equal(anchor.name,'界面冻结');assert.equal(anchor.canon.coverage.unarchivedSources.length,1);assert.match(panel.root.textContent,/1 条 AI 来源未归档/);assert.equal(f.calls.length,0);panel.dispose();await w.happyDOM.abort();
});
test('archive query service requires a trusted policy, never initializes and invalidates after book or chat changes',async()=>{
 const f=fixture(),initial=JSON.stringify([...f.saved]);await assert.rejects(f.service.openArchiveQuery(),/宿主读取授权/);assert.equal(JSON.stringify([...f.saved]),initial);
 let taskActive=true;const archiveQueryPolicy=()=>({task:'authorized-test-archive',guard:()=>{assert(taskActive,'任务授权已结束');},authorizeRow:r=>r.values.名称!=='隐藏对象',authorizeField:()=>true});const service=f.makeService({archiveQueryPolicy});await assert.rejects(service.openArchiveQuery(),/尚未绑定/);assert.equal(JSON.stringify([...f.saved]),initial);
 await f.service.initialize();await f.service.edit({changes:[op('new:shown','objects',{名称:'可读对象',类型:'character'},'用户手动修改表单'),op('new:hidden','objects',{名称:'隐藏对象',类型:'character'},'用户手动修改表单')]});
 const query=await service.openArchiveQuery(),saved=JSON.stringify([...f.saved]),found=await query.search_archive();assert.equal(found.total,1);assert.equal(found.items[0].fields[0].value,'可读对象');assert.equal(found.scope.branch,(await f.service.inspect()).session.id);assert.equal(JSON.stringify([...f.saved]),saved);assert.equal(f.calls.length,0);
 const info=await f.service.inspect(),shown=info.rows.find(r=>r.values.名称==='可读对象');await f.service.edit({changes:[op(shown.id,'objects',{描述:'新修订'},'用户手动修改表单',shown.rev)]});await assert.rejects(query.search_archive(),/快照已过期/);
 const expired=await service.openArchiveQuery();taskActive=false;await assert.rejects(expired.search_archive(),/任务授权已结束/);taskActive=true;const next=await service.openArchiveQuery();f.c.chat[0].mes='聊天来源改变';await assert.rejects(next.read_archive({id:shown.id}),/聊天、候选或配置已改变/);
});

test('assistant query is bound to the exact reviewed snapshot, does not initialize, and rejects changed books',async()=>{
 const f=fixture();await assert.rejects(f.service.openAssistantArchiveQuery({storage:{ready:false},currentRows:[],registry:defaultRegistry()}),/既有存档/);assert.equal(f.saved.size,0);
 await f.service.initialize();await f.service.edit({changes:[op('new:event','events',{名称:'旧约定',经过:'在门前等待'},'用户手动修改表单')]});const state=await f.service.review(),input={storage:{ready:true},currentRows:state.rows,registry:state.registry};
 const prior=JSON.stringify([...f.saved]);const query=await f.service.openAssistantArchiveQuery(input);assert.equal((await query.search_archive({query:'旧约定'})).total,1);assert.equal(JSON.stringify([...f.saved]),prior);
 const bad=structuredClone(input);bad.currentRows[0].values.名称='改变';await assert.rejects(f.service.openAssistantArchiveQuery(bad),/依据已改变/);
 await f.service.edit({changes:[op('new:event2','events',{名称:'新约定',经过:'桥前等待'},'用户手动修改表单')]});await assert.rejects(query.assertFresh(),/快照已改变/);query.dispose();
});

test('production assistant and controlled host query archives then return a draft without writing or globally registering tools',async()=>{
 const {createHost}=await import('../config/host.js'),f=fixture();await f.service.initialize();await f.service.edit({changes:[op('new:event','events',{名称:'旧约定',经过:'EXACT_ARCHIVE_SENTINEL'},'用户手动修改表单')]});
 Object.assign(f.c,{chatCompletionSettings:{function_calling:true,model:'test-model',chat_completion_source:'custom',custom_api_format:'gemini_generate_content'},getChatCompletionModel:s=>s.model,isToolCallingSupported:()=>true,substituteParams:s=>s,getPresetManager:()=>({getAllPresets:()=>[],getSelectedPresetName:()=>''})});
 let service;const host=createHost({store:f.store,getContext:()=>f.c,getSource:()=>({prompts:[]}),openArchiveQuery:(task,input,options)=>{assert.equal(task,'tableAssistant');return service.openAssistantArchiveQuery(input,options);},createParameters:async(settings,model,type,messages,options)=>({generate_data:{messages,model,chat_completion_source:settings.chat_completion_source,custom_api_format:settings.custom_api_format,...options.toolData}})});
 service=f.makeService({request:(...args)=>host.request(...args)});const oldFetch=globalThis.fetch,requests=[],before=JSON.stringify([...f.saved]),config=JSON.stringify(f.c.extensionSettings);let calls=0;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/backends/chat-completions/generate');const p=JSON.parse(options.body);requests.push(p);assert.equal(p.tools.length,4);assert(p.tools.every(x=>x.function.name.startsWith('tisya_')));
 if(calls++===0){assert.doesNotMatch(JSON.stringify(p.messages),/EXACT_ARCHIVE_SENTINEL/);assert.match(p.messages.at(-1).content,/^\[PREPARE_STEP\]/);assert.equal(p.messages.filter(m=>m.content.includes('本轮档案按需查询')).length,1);assert(p.messages.findIndex(m=>m.content.includes('本轮档案按需查询'))<p.messages.findIndex(m=>m.content==='[/MATERIALS]'));return Response.json({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'query1',type:'function',function:{name:'tisya_search_archive',arguments:JSON.stringify({sheet:formatSimpleSheet({query:'旧约定'})})}}]}}]});}
 assert.equal(p.messages.at(-1).role,'tool');if(calls===2){assert.equal(p.messages.at(-1).tool_call_id,'query1');const found=parseSimpleSheet(p.messages.at(-1).content);assert.equal(found.total,1);assert.doesNotMatch(p.messages.at(-1).content,/EXACT_ARCHIVE_SENTINEL/);return Response.json({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'read1',type:'function',function:{name:'tisya_read_archive',arguments:JSON.stringify({sheet:formatSimpleSheet({id:found.items[0].id,select:['经过']})})}}]}}]});}assert.equal(p.messages.at(-1).tool_call_id,'read1');assert.match(p.messages.at(-1).content,/EXACT_ARCHIVE_SENTINEL/);return Response.json({choices:[{finish_reason:'stop',message:{content:formatSimpleSheet({answer:'已查询旧约定，未修改配置。',changes:[],backfill:null,genesisGoal:''})}}]});};
 try{const draft=await service.assistant.ask('查一下旧约定');assert.equal(draft.changes.length,0);assert.equal(requests.length,3);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(JSON.stringify(f.c.extensionSettings),config);assert.equal(host.snapshots()[0].response.status,'tools');assert.equal(host.preview().response.status,'complete');assert.equal(host.preview().response.totalCalls,2);}finally{globalThis.fetch=oldFetch;}
});

test('controlled assistant refuses a foreign requested tool and preset changes in flight without another request',async()=>{
 const {createHost}=await import('../config/host.js');
 for(const scenario of ['foreign','changed']){const f=fixture();await f.service.initialize();Object.assign(f.c,{chatCompletionSettings:{function_calling:true,model:'model',chat_completion_source:'custom'},getChatCompletionModel:s=>s.model,isToolCallingSupported:()=>true,substituteParams:s=>s,getPresetManager:()=>({getAllPresets:()=>[]})});let service;const host=createHost({store:f.store,getContext:()=>f.c,getSource:()=>({prompts:[]}),openArchiveQuery:(_,input,o)=>service.openAssistantArchiveQuery(input,o),createParameters:async(s,model,type,messages,o)=>({generate_data:{messages,model,...o.toolData}})});service=f.makeService({request:(...args)=>host.request(...args)});const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;if(scenario==='changed')f.c.chatCompletionSettings.model='new-model';return Response.json({choices:[{finish_reason:'tool_calls',message:{content:null,tool_calls:[{id:'x',function:{name:'external_write',arguments:'{}'}}]}}]});};try{await assert.rejects(service.assistant.ask('查询'),scenario==='foreign'?/未授权/:/预设或配置/);assert.equal(calls,1);}finally{globalThis.fetch=old;}}
});

test('controlled assistant rejects a preset change while opening its archive session before sending stale settings',async()=>{
 const {createHost}=await import('../config/host.js'),f=fixture();await f.service.initialize();
 Object.assign(f.c,{chatCompletionSettings:{function_calling:true,model:'old-model',chat_completion_source:'custom'},getChatCompletionModel:s=>s.model,isToolCallingSupported:()=>true,substituteParams:s=>s,getPresetManager:()=>({getAllPresets:()=>[]})});
 let service,disposed=false;const host=createHost({store:f.store,getContext:()=>f.c,getSource:()=>({prompts:[]}),openArchiveQuery:async(_,input,o)=>{const query=await service.openAssistantArchiveQuery(input,o);f.c.chatCompletionSettings.model='changed-model';return {...query,dispose(){disposed=true;query.dispose();}};},createParameters:async()=>{throw Error('must not construct stale request');}});
 service=f.makeService({request:(...args)=>host.request(...args)});const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not send stale settings');};try{await assert.rejects(service.assistant.ask('查询'),/预设或配置/);assert.equal(calls,0);assert.equal(disposed,true);}finally{globalThis.fetch=old;}
});

async function proposalFixture({latest=false}={}){const f=fixture();f.c.chat=[ai('岚在城门。'),...latest?[]:[user('继续')]];await f.service.initialize();f.source=(await sources(f.c.chat))[0].key;f.payload={requestId:'archive-request-1',changes:[{intent:'create',...op('new:lan','objects',{名称:'岚',类型:'character'},'岚在城门。')}]};return f;}
test('archive proposal service stages without writes, commits once and durably replays after service restart',async()=>{
 const f=await proposalFixture(),before=JSON.stringify([...f.saved]),handle=await f.service.openArchiveProposal({sourceKey:f.source});
 assert.equal((await handle.propose_archive_change(f.payload)).state,'draft');assert.equal(JSON.stringify([...f.saved]),before);assert.equal(f.calls.length,0);
 const one=await f.service.saveArchiveProposal(handle,f.payload.requestId),saved=JSON.stringify([...f.saved]);assert.equal(one.active,true);assert.equal(one.replayed,false);
 const two=await f.service.saveArchiveProposal(handle,f.payload.requestId);assert.equal(two.commitId,one.commitId);assert.equal(two.replayed,true);assert.equal(JSON.stringify([...f.saved]),saved);
 const service=f.makeService(),next=await service.openArchiveProposal({sourceKey:f.source});assert.equal((await next.propose_archive_change(f.payload)).state,'recorded');assert.equal((await service.saveArchiveProposal(next,f.payload.requestId)).commitId,one.commitId);assert.equal(JSON.stringify([...f.saved]),saved);
 const inspected=await service.inspect();assert.equal(inspected.rows.length,1);assert.equal(inspected.archived,0);assert.equal(inspected.session.commits.filter(x=>x.archiveProposal).length,1);
 const other=await service.openArchiveProposal({sourceKey:f.source});await assert.rejects(other.propose_archive_change({...f.payload,changes:[{...f.payload.changes[0],values:{名称:'另一个人',类型:'character'}}]}),/相同草案请求编号/);
});
test('archive proposal saves legal open data without persisting a schema extension',async()=>{
 const f=await proposalFixture(),settings=f.store.read().world.tables,origin=await f.books.read(settings.originBook),next=structuredClone(origin.data),rawObjects=next.registry.tables.find(t=>t.id==='objects');rawObjects.aliases.push('对象档');rawObjects.fields.扩展档案={type:'object',additionalProperties:true,fields:{已知:{type:'number',required:true}}};next.registry=upgradeRegistry(next.registry);next.revision++;await f.books.write(origin,next);const session=await f.books.read(settings.sessionBook),nextSession=structuredClone(session.data);if(nextSession.schemaPinned){nextSession.revision++;nextSession.registry=structuredClone(next.registry);await externalBookWrite(f,session,nextSession);}
 const service=f.makeService(),before=(await service.inspect()).origin.registry,payload={...f.payload,requestId:'archive-open-object',changes:[{...f.payload.changes[0],table:'对象档',values:{名称:'岚',类型:'character',扩展档案:{已知:0,自由键:{深层:true}}}}]},handle=await service.openArchiveProposal({sourceKey:f.source});assert.equal((await handle.propose_archive_change(payload)).state,'draft');await service.saveArchiveProposal(handle,payload.requestId);
 const saved=await service.inspect();assert.deepEqual(saved.origin.registry,before);assert.equal(saved.origin.registry.tables.find(t=>t.id==='objects').fields.扩展档案.fields.自由键,undefined);assert.deepEqual(saved.rows[0].values.扩展档案,{已知:0,自由键:{深层:true}});
});
test('archive proposal does not initialize missing storage or accept a user source',async()=>{
 const f=fixture();await assert.rejects(f.service.openArchiveProposal({sourceKey:'none'}),/尚未绑定/);assert.equal(f.saved.size,0);
 const ready=await proposalFixture(),before=JSON.stringify([...ready.saved]),key=(await sources(ready.c.chat))[1].key;await assert.rejects(ready.service.openArchiveProposal({sourceKey:key}),/不是当前候选正文/);assert.equal(JSON.stringify([...ready.saved]),before);
});
test('unconfirmed latest candidate remains a draft unless host explicitly authorizes its archive',async()=>{
 const f=await proposalFixture({latest:true}),handle=await f.service.openArchiveProposal({sourceKey:f.source});await handle.propose_archive_change(f.payload);const before=JSON.stringify([...f.saved]);
 await assert.rejects(f.service.saveArchiveProposal(handle,f.payload.requestId),/当前候选尚未确认/);assert.equal(JSON.stringify([...f.saved]),before);
 const explicit=await f.service.openArchiveProposal({sourceKey:f.source,includeLatest:true});await explicit.propose_archive_change(f.payload);assert.equal((await f.service.saveArchiveProposal(explicit,f.payload.requestId)).active,true);
});
test('swiping archived source withdraws its projection and replay reports inactive without reapplying',async()=>{
 const f=await proposalFixture(),handle=await f.service.openArchiveProposal({sourceKey:f.source});await handle.propose_archive_change(f.payload);await f.service.saveArchiveProposal(handle,f.payload.requestId);
 f.c.chat[0].mes='另一个候选。';f.c.chat[0].swipe_id=1;const before=JSON.stringify([...f.saved]);assert.equal((await f.service.inspect()).rows.length,0);const receipt=await f.service.saveArchiveProposal(handle,f.payload.requestId);assert.equal(receipt.replayed,true);assert.equal(receipt.active,false);assert.equal(JSON.stringify([...f.saved]),before);
});
test('chat, configuration and external book revision changes each block proposal writes',async()=>{
 for(const kind of ['chat','config','book']){const f=await proposalFixture(),handle=await f.service.openArchiveProposal({sourceKey:f.source});await handle.propose_archive_change(f.payload);
  if(kind==='chat')f.c.chat[0].mes='替换正文';if(kind==='config')await f.set({hardRules:['新规则']});if(kind==='book'){const snapshot=await f.books.read(f.store.read().world.tables.sessionBook),next=structuredClone(snapshot.data);next.revision++;await externalBookWrite(f,snapshot,next);}
  const before=JSON.stringify([...f.saved]);await assert.rejects(f.service.saveArchiveProposal(handle,f.payload.requestId),/已改变/);assert.equal(JSON.stringify([...f.saved]),before);
 }
});
test('independent archive single-book failure leaves neither rows nor schema nor origin candidates',async()=>{
 const f=await proposalFixture(),handle=await f.service.openArchiveProposal({sourceKey:f.source});await handle.propose_archive_change(f.payload);const before=JSON.stringify([...f.saved]);let count=0;f.writeHook(()=>{count++;throw Error('simulated session failure');});
 await assert.rejects(f.service.saveArchiveProposal(handle,f.payload.requestId),/simulated session failure/);const inspected=await f.service.inspect();assert.equal(inspected.rows.length,0);assert.equal(inspected.origin.bases.length,0);assert.equal(inspected.session.commits.length,0);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(count,1);
});
test('archive proposal batch conflict and hidden alias collision produce zero writes',async()=>{
 const f=await proposalFixture();await f.service.edit({changes:[op('new:hidden','objects',{名称:'秘密身份',别名:['岚'],类型:'character'},'用户手动修改表单')]});const handle=await f.service.openArchiveProposal({sourceKey:f.source}),before=JSON.stringify([...f.saved]);
 await assert.rejects(handle.propose_archive_change(f.payload),e=>e.code==='IDENTITY_REVIEW_REQUIRED'&&!e.message.includes('秘密身份'));assert.equal(JSON.stringify([...f.saved]),before);assert.equal(f.calls.length,0);
});
test('disposed, foreign and aborted proposal handles cannot commit',async()=>{
 const f=await proposalFixture(),controller=new AbortController(),handle=await f.service.openArchiveProposal({sourceKey:f.source,signal:controller.signal});await handle.propose_archive_change(f.payload);const before=JSON.stringify([...f.saved]);
 await assert.rejects(f.makeService().saveArchiveProposal(handle,f.payload.requestId),/会话不存在/);controller.abort(Error('cancelled'));await assert.rejects(f.service.saveArchiveProposal(handle,f.payload.requestId),/cancelled/);handle.dispose();await assert.rejects(f.service.saveArchiveProposal(handle,f.payload.requestId),/会话不存在/);assert.equal(JSON.stringify([...f.saved]),before);
});
test('external abort at the single session write prevents schema and active proposal facts',async()=>{
 const f=await proposalFixture(),controller=new AbortController(),handle=await f.service.openArchiveProposal({sourceKey:f.source,signal:controller.signal});await handle.propose_archive_change(f.payload);let count=0;f.writeHook(()=>{if(++count===1)controller.abort(Error('cancel at session write'));});
 await assert.rejects(f.service.saveArchiveProposal(handle,f.payload.requestId),/cancel at session write/);const result=await f.service.inspect();assert.equal(result.rows.length,0);assert.equal(result.session.commits.length,0);assert.equal(result.origin.bases.length,0);assert.equal(count,1);
});

async function archiveReviewHost(f,provider='openai'){
 const {createHost}=await import('../config/host.js');Object.assign(f.c,{chatCompletionSettings:{function_calling:true,model:'fixture-model',chat_completion_source:'custom',custom_api_format:provider==='gemini'?'gemini_generate_content':'openai_compat'},getChatCompletionModel:s=>s.model,isToolCallingSupported:()=>true,substituteParams:s=>s,getPresetManager:()=>({getAllPresets:()=>[]})});let seed;
 const host=createHost({store:f.store,getContext:()=>f.c,getSource:()=>({prompts:[]}),createParameters:async(s,model,type,messages,o)=>({generate_data:{messages,model,...o.toolData}})}),service=f.makeService({request:(task,input,options)=>{seed=parseSimpleSheet(input);assert.equal(task,'tableArchive');assert(options.archiveToolSession);assert.equal(options.archiveToolSession.saveArchiveProposal,undefined);return host.request(task,input,options);}});
 return {service,host,seed:()=>seed};
}
function archiveToolReply(provider,name,args,id='call'){
 return provider==='gemini'?Response.json({candidates:[{content:{role:'model',parts:[{functionCall:{name,args:{sheet:formatSimpleSheet(args)}},thoughtSignature:'kept-signature'}]},finishReason:'STOP'}]}):Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify({sheet:formatSimpleSheet(args)})}}]}}]});
}
const archiveFinalReply=(provider,body)=>provider==='gemini'?Response.json({candidates:[{content:{role:'model',parts:[{text:formatSimpleSheet(body)}]},finishReason:'STOP'}]}):Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:formatSimpleSheet(body)}}]});
test('archive host honors configured recursion above five and reserves the final no-tools response',async()=>{
 const f=await proposalFixture(),h=await archiveReviewHost(f),old=globalThis.fetch;f.c.ToolManager={RECURSE_LIMIT:6};let count=0;
 globalThis.fetch=async(_url,options)=>{count++;const p=JSON.parse(options.body);assert.equal(p.tools.length,count<=6?5:0);if(count>1)assert.equal(p.messages.slice(-5).filter(m=>m.role==='tool'&&parseSimpleSheet(m.content).status==='ok').length,5);if(count<=6)return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:Array.from({length:5},(_,i)=>({id:'round-'+count+'-'+i,type:'function',function:{name:'tisya_list_archive',arguments:JSON.stringify({sheet:formatSimpleSheet({})})}}))}}]});assert.equal(p.tool_choice,'none');return archiveFinalReply('openai',{changes:[],archiveRequestId:null,notes:['本例验证超过24次工具调用及配置续轮上限']});};
 try{const before=JSON.stringify([...f.saved]);await h.service.previewArchiveChanges({sourceKey:f.source});assert.equal(count,7);assert.equal(JSON.stringify([...f.saved]),before);}finally{globalThis.fetch=old;}
});
test('production archive review roundtrip uses five bounded tools and waits for separate confirmation before writes',async()=>{
 for(const provider of ['openai','gemini']){const f=await proposalFixture(),h=await archiveReviewHost(f,provider),oldFetch=globalThis.fetch,before=JSON.stringify([...f.saved]);let count=0;
  globalThis.fetch=async(_url,options)=>{const payload=JSON.parse(options.body);assert.equal(payload.tools.length,5);assert.equal(payload.tools.some(t=>/save|write/.test(t.function.name)),false);count++;
   if(count===1){const wire=JSON.stringify(payload.messages);assert(wire.includes(h.seed().archiveRequestId));assert.equal(wire.split(h.seed().archiveRequestId).length-1,1);assert.match(payload.messages.at(-1).content,/^\[PREPARE_STEP\]/);assert(payload.messages.findIndex(m=>m.content.includes('本轮是归档草案审核流程'))<payload.messages.findIndex(m=>m.content==='[/MATERIALS]'));return archiveToolReply(provider,'tisya_list_archive',{},'list');}
   if(count===2){assert.equal(parseSimpleSheet(payload.messages.at(-1).content).status,'ok');return archiveToolReply(provider,'tisya_propose_archive_change',{...f.payload,requestId:h.seed().archiveRequestId},'draft');}
   assert.equal(count,3);const receipt=parseSimpleSheet(payload.messages.at(-1).content);assert.equal(receipt.written,false);assert.deepEqual(receipt.completion,{changes:[],archiveRequestId:h.seed().archiveRequestId,notes:[]});if(provider==='gemini')assert.equal(payload.messages.at(-2).tool_calls[0].extra_content.google.thought_signature,'kept-signature');return archiveFinalReply(provider,{...receipt.completion,notes:['核对来源']});
  };
  try{const review=await h.service.previewArchiveChanges({sourceKey:f.source});assert.equal(count,3);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(review.changes.length,1);assert.equal(review.changes[0].before,null);assert.equal(review.source.text,'岚在城门。');assert.equal(h.seed().currentRows.length,0);
   const saved=await h.service.acceptArchiveReview(review.id);assert(saved.active);assert.equal((await h.service.inspect()).rows.length,1);assert((await h.service.acceptArchiveReview(review.id)).replayed);h.service.discardArchiveReview(review.id);await assert.rejects(h.service.acceptArchiveReview(review.id),/不存在或已关闭/);
  }finally{globalThis.fetch=oldFetch;}
 }
});
test('inline changes, invented receipt IDs and hidden accepted drafts cannot bypass review validation',async()=>{
 for(const mode of ['inline','invented','hidden']){const f=await proposalFixture(),h=await archiveReviewHost(f),old=globalThis.fetch,before=JSON.stringify([...f.saved]);let count=0;globalThis.fetch=async()=>{count++;if(mode==='hidden'&&count===1)return archiveToolReply('openai','tisya_propose_archive_change',{...f.payload,requestId:h.seed().archiveRequestId});return archiveFinalReply('openai',{changes:mode==='inline'?f.payload.changes:[],archiveRequestId:mode==='hidden'?null:'invented',notes:[]});};
  try{await assert.rejects(h.service.previewArchiveChanges({sourceKey:f.source}),/绕过校验|没有引用|不能在最终结果中隐去/);assert.equal(JSON.stringify([...f.saved]),before);}finally{globalThis.fetch=old;}
 }
});
test('archive draft request requires explicit function support and cannot be granted to configuration assistant',async()=>{
 const f=await proposalFixture(),h=await archiveReviewHost(f),old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not send');};f.c.chatCompletionSettings.function_calling=false;
 try{await assert.rejects(h.service.previewArchiveChanges({sourceKey:f.source}),/启用函数调用/);assert.equal(calls,0);await assert.rejects(h.host.request('tableAssistant','{}',{archiveToolSession:{}}),/只能用于独立记忆归档/);assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
test('review without changes writes nothing and a staged review rejects chat mutation or discard',async()=>{
 const f=await proposalFixture();let mode='empty';const service=f.makeService({request:async(_task,input,options)=>{const seed=parseSimpleSheet(input);if(mode==='empty')return {changes:[],archiveRequestId:null,notes:['无新事实']};await options.archiveToolSession.propose_archive_change({...f.payload,requestId:seed.archiveRequestId});return {changes:[],archiveRequestId:seed.archiveRequestId,notes:[]};}});
 const before=JSON.stringify([...f.saved]);assert.equal((await service.previewArchiveChanges({sourceKey:f.source})).id,null);mode='draft';const review=await service.previewArchiveChanges({sourceKey:f.source});f.c.chat[0].mes='改了';await assert.rejects(service.acceptArchiveReview(review.id),/已改变/);service.discardArchiveReview(review.id);await assert.rejects(service.acceptArchiveReview(review.id),/不存在或已关闭/);assert.equal(JSON.stringify([...f.saved]),before);
});
test('stopping review generation after staging a proposal prevents any review handle or write',async()=>{
 const f=await proposalFixture();let entered,release;const staged=new Promise(r=>entered=r);const service=f.makeService({request:async(_task,input,options)=>{const seed=parseSimpleSheet(input);await options.archiveToolSession.propose_archive_change({...f.payload,requestId:seed.archiveRequestId});entered();await new Promise(r=>release=r);return {changes:[],archiveRequestId:seed.archiveRequestId,notes:[]};}}),before=JSON.stringify([...f.saved]),running=service.previewArchiveChanges({sourceKey:f.source});await staged;service.clear({scope:'archive-review',reason:'cancel review'});release();await assert.rejects(running,/cancel review/);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(service.state().busy,false);
});

async function archiveReviewPanel(f,{request,wrap}={}){
 const {Window}=await import('happy-dom'),{mountTablePanel}=await import('../tables/panel.js');let review;
 const base=f.makeService({request:request??(async(_task,input,options)=>{const seed=parseSimpleSheet(input);await options.archiveToolSession.propose_archive_change({...f.payload,requestId:seed.archiveRequestId});return {changes:[],archiveRequestId:seed.archiveRequestId,notes:['界面核对']};})});
 const service={...base,previewArchiveChanges:async options=>{review=await base.previewArchiveChanges(options);return review;},...wrap?.(base)};
 const w=new Window(),panel=mountTablePanel(w.document,w.document.body,{service,store:f.store});await panel.ready;const select=panel.root.querySelector('[aria-label="表单功能"]');const page=async name=>{select.value=name;await select.onchange();};await page('history');
 const click=async text=>{const button=[...panel.root.querySelectorAll('button')].find(n=>n.textContent===text);assert(button,text);await button.onclick();};return {w,panel,service,base,click,page,review:()=>review,close:async()=>{panel.dispose();await w.happyDOM.abort();}};
}
test('archive review UI preserves draft across pages, blocks competing history actions, and saves only after confirmation',async()=>{
 const f=await proposalFixture(),p=await archiveReviewPanel(f),before=JSON.stringify([...f.saved]);try{
  await p.click('生成所选楼层草案');assert.equal(p.panel.root.querySelector('[role=alert]'),null);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(p.panel.requestLeave().allowed,false);
  const box=[...p.panel.root.querySelectorAll('fieldset')].find(x=>x.querySelector('legend')?.textContent.startsWith('待审修改'));assert(box);assert.match(box.textContent,/岚在城门。/);assert.match(box.textContent,/拟写入/);assert.equal(box.querySelectorAll('input,textarea,select').length,0);
  await p.click('开始／继续补录所选楼层');assert.match(p.panel.root.querySelector('[role=alert]').textContent,/先保存或放弃/);assert.equal(JSON.stringify([...f.saved]),before);
  await p.page('forms');await p.page('history');assert(p.panel.root.contains(box));await p.click('确认保存这批草案');assert.equal(p.panel.root.querySelector('[role=alert]'),null);assert.equal((await p.base.inspect()).rows.length,1);assert.equal((await p.base.inspect()).archived,0);assert.equal(p.panel.requestLeave().allowed,true);
 }finally{await p.close();}
});
test('archive review UI requires latest-source confirmation and closes drafts without writes',async()=>{
 const f=await proposalFixture({latest:true}),p=await archiveReviewPanel(f),before=JSON.stringify([...f.saved]);try{
  await p.click('生成所选楼层草案');assert.match(p.panel.root.querySelector('[role=alert]').textContent,/确认保留/);assert.equal(p.review(),undefined);
  const check=p.panel.root.querySelector('[aria-label="确认保留所选最新回复"]');check.checked=true;check.dispatchEvent(new p.w.Event('input'));await p.click('生成所选楼层草案');const id=p.review().id;await p.click('放弃这批草案');assert.equal(p.panel.requestLeave().allowed,true);await assert.rejects(p.base.acceptArchiveReview(id),/不存在或已关闭/);assert.equal(JSON.stringify([...f.saved]),before);
 }finally{await p.close();}
});
test('archive review UI disposal cancels staged and in-flight reviews without writes',async()=>{
 for(const inFlight of [false,true]){const f=await proposalFixture();let entered,release;const started=new Promise(r=>entered=r);const p=await archiveReviewPanel(f,{request:async(_task,input,options)=>{const seed=parseSimpleSheet(input);await options.archiveToolSession.propose_archive_change({...f.payload,requestId:seed.archiveRequestId});entered();if(inFlight)await new Promise(r=>release=r);return {changes:[],archiveRequestId:seed.archiveRequestId,notes:[]};}}),before=JSON.stringify([...f.saved]);
  const running=p.click('生成所选楼层草案');await started;if(!inFlight)await running;p.panel.dispose();if(inFlight){release();await running;}else await assert.rejects(p.base.acceptArchiveReview(p.review().id),/不存在或已关闭/);assert.equal(JSON.stringify([...f.saved]),before);assert.equal(p.base.state().busy,false);await p.w.happyDOM.abort();
 }
});
test('archive review UI closes a returned handle after world changes and reports an unconfirmed save honestly',async()=>{
 const f=await proposalFixture();let returnedId;const p=await archiveReviewPanel(f,{wrap:base=>({previewArchiveChanges:async options=>{const value=await base.previewArchiveChanges(options);returnedId=value.id;f.c.chatId='changed-before-ui';return value;}})}),before=JSON.stringify([...f.saved]);try{await p.click('生成所选楼层草案');assert.match(p.panel.root.querySelector('[role=alert]').textContent,/会话已切换/);f.c.chatId='one';await assert.rejects(p.base.acceptArchiveReview(returnedId),/不存在或已关闭/);assert.equal(JSON.stringify([...f.saved]),before);}finally{await p.close();}
 const f2=await proposalFixture(),p2=await archiveReviewPanel(f2);try{await p2.click('生成所选楼层草案');let writes=0;f2.writeHook(()=>{if(++writes===1)throw Error('session failed');});await p2.click('确认保存这批草案');assert.match(p2.panel.root.querySelector('[role=alert]').textContent,/表单保存未完成/);await p2.click('放弃这批草案');assert.match(p2.panel.root.textContent,/先前保存结果请在存档中核对/);assert.doesNotMatch(p2.panel.root.textContent,/没有新增档案写入/);assert.equal((await p2.base.inspect()).rows.length,0);}finally{await p2.close();}
});

function structurePayload(f){return {...f.payload,templates:[{id:'gate-keeper',name:'城门守卫',aliases:[],version:1,parent:'character',fields:{执勤门:{type:'text'}},evidence:'岚在城门。'}],schemaChanges:[{kind:'table',id:'objects',fields:{出现记录:{type:'array',items:{type:'object',fields:{地点:{type:'text'},在场:{type:'boolean'}}}}},evidence:'岚在城门。'},{kind:'table',definition:{id:'gate-log',name:'城门记录',aliases:[],version:1,owner:'archive',fields:{名称:{type:'text',required:true},人员:{type:'ref'},地点:{type:'text'}}},evidence:'岚在城门。'}],changes:[{...f.payload.changes[0],values:{名称:'岚',类型:'gate-keeper',属性:{执勤门:'城门'},出现记录:[{地点:'城门',在场:true}]}},{intent:'create',...op('new:log','gate-log',{名称:'岚在城门',人员:'new:lan',地点:'城门'},'岚在城门。')}]};}

test('explicit schema and rows save in one session commit, reload and withdraw together while origin stays unchanged',async()=>{
 const f=await proposalFixture(),payload=structurePayload(f),before=JSON.stringify([...f.saved]),originBefore=JSON.stringify((await f.service.inspect()).origin),handle=await f.service.openArchiveProposal({sourceKey:f.source});
 await handle.propose_archive_change(payload);assert.equal(JSON.stringify([...f.saved]),before);let writes=0;f.writeHook(()=>writes++);const receipt=await f.service.saveArchiveProposal(handle,payload.requestId);assert.equal(writes,1);assert(receipt.active);
 // Roundtrip the actual gateway records, then instantiate a fresh service.
 const disk=JSON.parse(JSON.stringify([...f.saved]));f.saved.clear();for(const [k,v]of disk)f.saved.set(k,v);const service=f.makeService(),inspected=await service.inspect();assert.equal(JSON.stringify(inspected.origin),originBefore);assert.equal(inspected.rows.length,2);assert(inspected.registry.types.some(t=>t.id==='gate-keeper'));assert(inspected.registry.tables.find(t=>t.id==='objects').fields.出现记录);assert(inspected.registry.tables.some(t=>t.id==='gate-log'));const [person,log]=inspected.rows;assert.equal(log.values.人员,person.id);assert.equal(person.values.出现记录[0].在场,true);
 assert.equal(inspected.session.commits[0].archiveProposal.schemaEvidence.length,3);assert(!JSON.stringify(inspected.session.commits[0].registry).includes('岚在城门。'));
 const replay=await service.openArchiveProposal({sourceKey:f.source});assert.equal((await replay.propose_archive_change(payload)).state,'recorded');assert((await service.saveArchiveProposal(replay,payload.requestId)).replayed);assert.equal(writes,1);
 f.c.chat[0].mes='另一条回复。';f.c.chat[0].swipe_id=1;const changed=await service.inspect();assert.equal(changed.rows.length,0);assert(!changed.registry.types.some(t=>t.id==='gate-keeper'));assert(!changed.registry.tables.some(t=>t.id==='gate-log'));assert.equal(changed.registry.tables.find(t=>t.id==='objects').fields.出现记录,undefined);assert.equal(writes,1);
});

test('schema-bearing preview exposes full definitions and evidence and only confirmation performs the one write',async()=>{
 const f=await proposalFixture(),payload=structurePayload(f),before=JSON.stringify([...f.saved]);const service=f.makeService({request:async(_task,text,options)=>{const input=parseSimpleSheet(text);await options.archiveToolSession.propose_archive_change({...payload,requestId:input.archiveRequestId});return {changes:[],archiveRequestId:input.archiveRequestId,notes:[]};}});
 const review=await service.previewArchiveChanges({sourceKey:f.source});assert.equal(JSON.stringify([...f.saved]),before);assert(review.extensions.includes('gate-keeper'));assert(review.extensions.includes('gate-log'));assert(review.extensions.includes('objects.出现记录'));assert.equal(review.structure.evidence.length,3);assert.equal(review.structure.templates[0].fields.执勤门.type,'text');review.structure.templates[0].fields.执勤门.type='number';
 let writes=0;f.writeHook(()=>writes++);await service.acceptArchiveReview(review.id);assert.equal(writes,1);assert.equal((await service.inspect()).registry.types.find(t=>t.id==='gate-keeper').fields.执勤门.type,'text');
});

test('structure failure and unauthorized reserved tables never leave a partial registry',async()=>{
 for(const kind of ['wrong-type','no-evidence','reserved','failed-write']){const f=await proposalFixture(),payload=structurePayload(f),before=JSON.stringify([...f.saved]),handle=await f.service.openArchiveProposal({sourceKey:f.source});
  if(kind==='wrong-type')payload.schemaChanges[0].fields={名称:{type:'number'}};if(kind==='no-evidence')payload.templates[0].evidence='未出现在原文';if(kind==='reserved')payload.schemaChanges[1].definition.owner='preferences';
  if(kind==='failed-write'){await handle.propose_archive_change(payload);let writes=0;f.writeHook(()=>{writes++;throw Error('session unavailable');});await assert.rejects(f.service.saveArchiveProposal(handle,payload.requestId),/session unavailable/);assert.equal(writes,1);}else await assert.rejects(handle.propose_archive_change(payload));assert.equal(JSON.stringify([...f.saved]),before);assert.equal((await f.service.inspect()).registry.tables.some(t=>t.id==='gate-log'),false);
 }
});

test('schema commit with a lost acknowledgement is recovered by receipt without another write',async()=>{
 const f=await proposalFixture(),payload=structurePayload(f);let writes=0;const service=f.makeService({books:{...f.books,write:async(...args)=>{writes++;await f.books.write(...args);throw Error('acknowledgement lost');}}}),handle=await service.openArchiveProposal({sourceKey:f.source});await handle.propose_archive_change(payload);
 await assert.rejects(service.saveArchiveProposal(handle,payload.requestId),/acknowledgement lost/);assert.equal(writes,1);assert.equal((await service.inspect()).rows.length,2);const replay=await service.saveArchiveProposal(handle,payload.requestId);assert(replay.replayed);assert.equal(writes,1);
});

test('archive UI shows the complete proposed schema with evidence before confirmation',async()=>{
 const f=await proposalFixture();f.payload=structurePayload(f);const p=await archiveReviewPanel(f);try{const before=JSON.stringify([...f.saved]);await p.click('生成所选楼层草案');const details=[...p.panel.root.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='核对结构定义与原文依据');assert(details);assert.match(details.textContent,/执勤门/);assert.match(details.textContent,/gate-log/);assert.match(details.textContent,/岚在城门。/);assert.equal(JSON.stringify([...f.saved]),before);await p.click('确认保存这批草案');assert.equal(p.panel.root.querySelector('[role=alert]'),null);assert.equal((await p.base.inspect()).rows.length,2);}finally{await p.close();}
});

test('card opening binds exact user and reuses only initial rows in a new independent save',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];
 f.c.name1='旅人';f.c.userAvatar='user.png';f.c.powerUserSettings={persona_description:'来自山外，尚不认识船匠。',personas:{'user.png':'旅人'},persona_descriptions:{'user.png':{description:'来自山外，尚不认识船匠。'}}};
 f.c.characters[0].description='甲是船匠。';
 f.responder((task,input)=>{assert.equal(task,'templateInit');return {registry:input.registry,base:{changes:[op('new:char','objects',{名称:'甲',类型:'character',描述:'甲是船匠。'},'甲是船匠。')]},initial:{changes:[]},notes:[]};});
 const before=await f.service.lifecycle();assert.equal(before.storageReady,false);assert.equal(f.saved.size,0,'read-only lifecycle cannot initialize');
 await f.service.autoInitialize('card');const first=await f.service.inspect(),oldName=f.store.read().world.tables.sessionBook,originName=f.store.read().world.tables.originBook;
 assert(first.session.openingBinding);assert.equal(first.origin.openings.length,1);assert.equal(first.rows.find(r=>r.id===first.session.personaBinding.objectId).values.描述,f.c.powerUserSettings.persona_description);
 const actor=first.rows.find(r=>r.values.名称==='甲');await f.service.edit({changes:[op(actor.id,'objects',{描述:'本局离开渡口'},'用户手动修改表单',actor.rev)]});
 const oldAfter=(await f.books.read(oldName)).raw,requests=f.calls.length;f.c.chatId='second';f.c.chat=[ai('另一局开场')];await f.service.initialize();
 const second=await f.service.inspect();assert.equal(f.calls.length,requests);assert.equal(f.store.read().world.tables.originBook,originName);assert.notEqual(second.session.id,first.session.id);assert.equal(second.rows.find(r=>r.id===actor.id).values.描述,'甲是船匠。');assert.equal(second.archived,0);assert.equal(second.session.personaBinding.objectId,first.session.personaBinding.objectId);assert.equal((await f.books.read(oldName)).raw,oldAfter);
 const revived=f.makeService();assert.equal((await revived.lifecycle()).opening.id,second.session.openingBinding.id);
 await f.service.stageFork(1,false);f.c.chatId='fork-from-second';await f.service.activateFork();const forked=await f.service.inspect();assert.equal(forked.rows.length,second.rows.length);assert.notEqual(forked.session.id,second.session.id);assert.equal(forked.rows.find(r=>r.id===actor.id).values.描述,'甲是船匠。');
 f.c.chatId='third';f.c.userAvatar='different.png';f.c.name1='另一人';f.c.powerUserSettings.persona_description='全新设定';await f.service.initialize();const third=await f.service.inspect();assert.equal(third.rows.length,0);assert.equal(third.session.personaBinding,undefined,'a different user cannot inherit old identity');
});

test('opening revisions preserve all initial objects, reject changed cards and permit explicit restore only before progression',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];f.c.characters[0].description='甲是船匠。有一只木箱。';let step=0;
 f.responder((task,input)=>({registry:input.registry,base:{changes:step++===0?[op('new:person','objects',{名称:'甲',类型:'character',描述:'甲是船匠。'},'甲是船匠。')]:[op('new:box','objects',{名称:'木箱',类型:'item'},'有一只木箱。')]},initial:{changes:[]},notes:[]}));
 await f.service.autoInitialize('card');await f.service.saveCardTemplate(await f.service.cardTemplate());let current=await f.service.inspect();assert.equal(current.origin.openings.length,2);assert.equal(current.rows.length,2);const person=current.rows.find(r=>r.values.名称==='甲');
 await f.service.edit({changes:[op(person.id,'objects',{描述:'本局后来离开渡口'},'用户手动修改表单',person.rev)]});const pack=await f.service.exportArchive({name:'已推进的存档'}),anchor=await f.service.saveAnchor({name:'已推进时间锚',nodes:[]});
 f.c.chatId='restore-opening';f.c.chat=[];await f.service.initialize();current=await f.service.inspect();assert.equal(current.rows.length,2);assert.equal(current.rows.find(r=>r.id===person.id).values.描述,'甲是船匠。');
 const preview=await f.service.previewArchiveRestore(pack);assert.equal(preview.replacesOpening,true);await f.service.restoreArchive(preview.token);current=await f.service.inspect();assert.equal(current.rows.find(r=>r.id===person.id).values.描述,'本局后来离开渡口');assert.equal(current.session.openingBinding,undefined);assert.equal(current.session.commits.length,0);
 f.c.chatId='anchor-opening';await f.service.initialize();await f.service.useAnchor(anchor.id);assert.equal((await f.service.inspect()).rows.find(r=>r.id===person.id).values.描述,'本局后来离开渡口');
 f.c.chatId='edited-opening';await f.service.initialize();const row=(await f.service.inspect()).rows.find(r=>r.id===person.id);await f.service.edit({changes:[op(row.id,'objects',{描述:'刚刚修改'},'用户手动修改表单',row.rev)]});await assert.rejects(f.service.previewArchiveRestore(pack),/不覆盖已有进度/);
 f.c.characters[0].description='甲现在是医师。';f.c.chatId='changed-card';await f.service.initialize();assert.equal((await f.service.inspect()).rows.length,0);assert.equal((await f.service.lifecycle()).opening,null);
});

function identityFixture(){const f=fixture();let avatar='user.png',persist=true;f.c.name1='用户';f.c.powerUserSettings={personas:{'user.png':'用户'},persona_descriptions:{'user.png':{description:'旧设定',depth:0,custom:false}},persona_description:'旧设定'};const persona=createPersonaGateway({getContext:()=>f.c,getAvatar:()=>avatar,applyActive:(id,name)=>{avatar=id;f.c.name1=name},persist:async()=>persist});return {...f,identity:f.makeService({persona}),persona,failSave:value=>persist=!value};}
test('identity origin binding stores a fixed reference, resumes partial save and avoids duplicate projection',async()=>{const f=identityFixture();await initializeBase(f,[op('new:person','objects',{名称:'原点人物',类型:'character',描述:'完整原点',属性:{身份:'守门人'}},'用户手动修改表单')]);const info=await f.service.inspect(),row=info.origin.bases.find(r=>r.table==='objects'),ref={book:info.settings.originBook,id:row.id,rev:row.rev};const draft=await f.identity.previewIdentityOrigin(ref);f.failSave(true);await assert.rejects(f.identity.saveIdentityOrigin(draft),/未确认|尚未确认/);assert.equal((await f.identity.review()).personaBinding.state,'writing');f.failSave(false);await f.identity.resumeUserBinding();const review=await f.identity.review();assert.equal(review.personaBinding.state,'bound');assert.equal(f.c.powerUserSettings.persona_descriptions['user.png'].custom,false);assert.equal(f.persona.read().descriptor.tisyaOrigin.rev,row.rev);const projection=personaProjection(review.rows,review.personaBinding,f.persona.read());assert.equal(projection.find(r=>r.id===row.id).values.描述,undefined);assert.equal((await f.service.inspect()).origin.revision,info.origin.revision);});
test('fixed origin preview refuses altered source bytes without writing native persona',async()=>{const f=identityFixture();await initializeBase(f,[op('new:person','objects',{名称:'原点人物',类型:'character',描述:'原文'},'用户手动修改表单')]);const info=await f.service.inspect(),row=info.origin.bases[0],draft=await f.identity.previewIdentityOrigin({book:info.settings.originBook,id:row.id,rev:row.rev});const book=await f.books.read(info.settings.originBook),next=structuredClone(book.data);next.revision++;await f.books.write(book,next);await assert.rejects(f.identity.saveIdentityOrigin(draft),/版本已改变/);assert.equal(f.persona.read().name,'用户');});
test('idea creation produces an immutable new origin while leaving session progress unchanged',async()=>{const f=identityFixture();await f.service.initialize();const info=await f.service.inspect();f.responder(()=>({blueprint:{name:'新人物',goal:'设计',decisions:['新设计：守灯人'],unresolved:[]},checklist:[],artifacts:{registry:info.registry,base:{changes:[op('new:light','objects',{名称:'守灯人',类型:'character',描述:'新设计：守灯人',属性:{身份:'守灯人',外貌:'灰衣',性格:'谨慎',背景:'生于海边'}},'新设计：守灯人')]},initial:{changes:[]}},workflow:{id:'identity',name:'身份设计',version:1,steps:[]}}));const before=await f.books.read(info.settings.sessionBook),draft=await f.identity.createIdentityDraft({goal:'设计守灯人'});assert.equal(draft.format,'tisya.identity-creation/1');const rows=await f.identity.saveIdentityDraft(draft);assert.equal(rows.length,1);assert.deepEqual((await f.books.read(info.settings.sessionBook)).data,before.data);assert.equal(f.persona.read().name,'用户');await assert.rejects(f.identity.saveIdentityDraft(draft),/依据已变化/);});

test('selecting an origin persona updates the same session binding idempotently without resetting progress',async()=>{const f=identityFixture();await initializeBase(f,[op('new:person','objects',{名称:'原点人物',类型:'character',描述:'原文'},'用户手动修改表单')]);let info=await f.service.inspect();const row=info.origin.bases[0];f.c.powerUserSettings.persona_descriptions['user.png'].tisyaOrigin={book:info.settings.originBook,originId:info.origin.id,id:row.id,rev:row.rev};const before=await f.identity.inspect();await f.identity.bindIdentitySelection('user.png');const after=await f.identity.inspect();assert.equal(after.session.personaBinding.objectId,row.id);assert.deepEqual(after.session.branchSeed,before.session.branchSeed);assert.deepEqual(after.origin,before.origin);const revision=after.session.revision;await f.identity.bindIdentitySelection('user.png');assert.equal((await f.identity.inspect()).session.revision,revision);});

test('deleted origin recovery creates an independent pair and preserves the surviving archive',async()=>{const f=fixture();f.binding.primary='';f.binding.additional=[];await f.service.initialize();const prior=f.store.read().world.tables,oldSession=JSON.stringify(f.saved.get(prior.sessionBook));await f.set({originPins:['old@1'],playerObjects:['old'],focusObjects:['old'],nativeBridge:true});f.saved.delete(prior.originBook);const {createBookGateway:realGateway}=await import('../tables/books.js'),service=f.makeService({books:realGateway(()=>f.helper,()=>f.c)}),preview=await service.storageRecovery();assert.deepEqual(preview.missing,[prior.originBook]);const before=JSON.stringify([...f.saved]);await assert.rejects(service.inspect());assert.equal(JSON.stringify([...f.saved]),before);const result=await service.recoverMissingStorage(preview);assert.notEqual(result.originBook,prior.originBook);assert.notEqual(result.sessionBook,prior.sessionBook);assert.equal(JSON.stringify(f.saved.get(prior.sessionBook)),oldSession);assert(!f.saved.has(prior.originBook));assert(!f.binding.additional.includes(prior.originBook));assert(f.binding.additional.includes(result.originBook));const next=await service.inspect();assert.equal(next.rows.length,0);assert.equal(next.session.commits.length,0);assert.deepEqual(next.settings.originPins,[]);assert.deepEqual(next.settings.playerObjects,[]);assert.deepEqual(next.settings.focusObjects,[]);assert.equal(next.settings.nativeBridge,false);const saved=JSON.stringify([...f.saved]);await assert.rejects(service.recoverMissingStorage(preview),/缺失状态已变化/);assert.equal(JSON.stringify([...f.saved]),saved);});
test('restored book or changed configuration invalidates a recovery preview without writes',async()=>{const f=fixture();f.binding.primary='';f.binding.additional=[];await f.service.initialize();const prior=f.store.read().world.tables,original=f.saved.get(prior.originBook);f.saved.delete(prior.originBook);const preview=await f.service.storageRecovery();f.saved.set(prior.originBook,original);const before=JSON.stringify([...f.saved]);await assert.rejects(f.service.recoverMissingStorage(preview),/缺失状态已变化/);assert.equal(JSON.stringify([...f.saved]),before);f.saved.delete(prior.originBook);const preview2=await f.service.storageRecovery();await f.set({plot:true});await assert.rejects(f.service.recoverMissingStorage(preview2),/缺失状态已变化/);});

test('missing-storage settings entry remains usable and rebuilds from its reviewed snapshot',async()=>{const {Window}=await import('happy-dom'),{mountTablePanel}=await import('../tables/panel.js');const w=new Window(),f=fixture();try{f.binding.primary='';f.binding.additional=[];await f.service.initialize();const old=f.store.read().world.tables;f.saved.delete(old.originBook);const panel=mountTablePanel(w.document,w.document.body,{service:f.service,store:f.store});await panel.ready;assert.equal(panel.root.querySelector('[role=alert]'),null);const recovery=[...panel.root.querySelectorAll('button')].find(b=>b.textContent==='另建原点与新档（保留旧书）');assert(recovery);await recovery.onclick();assert.equal(panel.root.querySelector('[role=alert]'),null);assert.match(panel.root.textContent,/已另建原点与独立新档/);assert(f.saved.has(old.sessionBook));assert.notEqual(f.store.read().world.tables.sessionBook,old.sessionBook);panel.dispose();}finally{await w.happyDOM.abort();w.close();}});

test('unified archive settles native and business in one request and records the actual adjusted value',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10,flag:false,optional:null}}]]);let parses=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;before.stat_data.energy=7;return before;},replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('训练使体能下降。'),user('继续')];const original=structuredClone(f.c.chat);await f.service.enableNativeBridge();
 f.responder((task,input)=>{assert.equal(task,'tableArchive');assert.equal(input.nativeBridge.writer,'native-mvu');assert.equal(input.nativeState.stat_data,undefined);assert.equal(input.nativeState.valuesFrom,'currentRows.native_cells');const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'训练使体能下降'},op('new:training','events',{名称:'训练',内容:'训练使体能下降。'},'训练使体能下降')]};});
 const result=await f.service.syncNative(),view=await f.service.inspect(),commit=view.session.commits.find(x=>x.kind==='archive');assert.equal(result.updated,1);assert.equal(result.outcome.adjusted.length,1);assert.equal(parses,1);assert.equal(f.calls.length,1);assert(commit.nativeReceipt.unifiedArchive);assert.equal(commit.complete,true);assert.equal(view.rows.find(r=>r.values.路径==='/energy').values.值,7);assert.equal(view.rows.find(r=>r.values.路径==='/flag').values.值,false);assert.equal(view.rows.find(r=>r.values.路径==='/optional').values.值,null);assert.equal(view.rows.filter(r=>r.table==='events').length,1);assert.deepEqual(f.c.chat,original);await f.service.archive();assert.equal(f.calls.length,1);
 }finally{globalThis.Mvu=previous;}
});

test('unified archive commit interruption resumes journal without another model or native callback',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}]]);let parses=0,fail=true;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;before.stat_data.energy=8;return before;},replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('训练后体能下降。'),user('继续')];await f.service.enableNativeBridge();f.responder((task,input)=>{const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'训练后体能下降'},op('new:event','events',{名称:'训练',内容:'体能下降。'},'训练后体能下降')]};});
 f.writeHook(()=>{if(fail&&values.get(0).stat_data.energy===8){fail=false;throw Error('archive disk interrupted');}});
 await assert.rejects(f.service.syncNative(),/archive disk interrupted/);const failed=await f.service.inspect();assert.equal(failed.session.nativeIntents[0].phase,'parsed');assert.equal(failed.session.commits.some(x=>x.kind==='archive'),false);assert.equal(failed.rows.some(x=>x.table==='events'),false);assert.equal(failed.rows.find(x=>x.values.路径==='/energy').values.值,10);
 const fresh=f.makeService();await fresh.syncNative();assert.equal(parses,1);assert.equal(f.calls.length,1);assert.equal((await fresh.inspect()).rows.filter(x=>x.table==='events').length,1);assert.equal((await fresh.syncNative()).already,true);
 }finally{globalThis.Mvu=previous;}
});

test('unified archive validates business evidence before any native callback or write',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}]]);let parses=0,writes=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;return before;},replaceMvuData:async()=>{writes++;}};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('训练后体能下降。'),user('继续')];await f.service.enableNativeBridge();f.responder((task,input)=>{const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'训练后体能下降'},op('new:event','events',{名称:'臆造',内容:'外人进入。'},'无来源的证据')]};});
 await assert.rejects(f.service.syncNative(),/连续原文证据/);assert.equal(parses,0);assert.equal(writes,0);assert.equal((await f.service.inspect()).session.commits.some(x=>x.kind==='archive'),false);
 }finally{globalThis.Mvu=previous;}
});

test('unified archive honors archive gate after reload without changing settings or calling model',async()=>{
 const f=fixture();await f.service.initialize();await f.set({nativeBridge:true,archive:false});const before=JSON.stringify([...f.saved]),settings=structuredClone(f.store.read().world.tables);await assert.rejects(f.makeService().syncNative(),/请先启用自动归档历史/);await assert.rejects(f.makeService().archive(),/请先启用自动归档历史/);assert.equal(f.calls.length,0);assert.equal(JSON.stringify([...f.saved]),before);assert.deepEqual(f.store.read().world.tables,settings);
});

test('unified archive processes confirmed floors in order without reading a future snapshot',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}],[4,{stat_data:{energy:999}}]]);let parses=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(text,before)=>{parses++;const operations=JSON.parse(text.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/)[1]);before.stat_data.energy=operations[0].value;return before;},replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('第一次训练。'),user('继续'),ai('第二次训练。'),user('继续'),ai('未确认候选。')];await f.service.initialize();await f.set({nativeBridge:true});
 const floors=[];f.responder((task,input)=>{floors.push(input.archiveSource.floor);const row=input.currentRows.find(r=>r.values.路径==='/energy');assert.equal(row.values.值,input.archiveSource.floor===1?10:9);assert(input.nativeBridge.snapshotFloor<=input.nativeBridge.sourceFloor);return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:row.values.值-1},evidence:input.archiveSource.text}]};});
 await f.service.syncNative();assert.deepEqual(floors,[1,3]);assert.equal(parses,2);assert.equal(values.get(0).stat_data.energy,9);assert.equal(values.get(2).stat_data.energy,8);assert.equal(values.get(4).stat_data.energy,999);await f.service.archive({includeLatest:true});assert.equal(f.calls.length,2);
 }finally{globalThis.Mvu=previous;}
});

test('unified archive upgrades an already archived floor with only its missing native settlement',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}]]);let parses=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;before.stat_data.energy=8;return before;},replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('训练后体能下降。'),user('继续')];await f.service.initialize();f.responder(()=>({changes:[op('new:event','events',{名称:'训练',内容:'体能下降。'},'训练后体能下降')]}));await f.service.archive();await f.service.enableNativeBridge();
 f.responder((task,input)=>{assert(input.nativeBridge.archiveAlready);const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'训练后体能下降'}]};});await f.service.syncNative();const view=await f.service.inspect();assert.equal(parses,1);assert.equal(view.rows.filter(x=>x.table==='events').length,1);assert.equal(view.session.commits.filter(x=>x.kind==='archive').length,1);assert.equal(view.session.commits.findLast(x=>x.nativeReceipt?.phase==='applied').kind,'native-fill');
 }finally{globalThis.Mvu=previous;}
});

test('unified archive rejects a stale preceding native snapshot before parsing',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}]]);let parses=0,writes=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;return before;},replaceMvuData:async()=>{writes++;}};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[user('开场'),ai('体能下降。'),user('继续')];await f.service.initialize();await f.set({nativeBridge:true});f.responder((task,input)=>{assert.equal(input.nativeBridge.snapshotFloor,1);const row=input.currentRows.find(r=>r.values.路径==='/energy');values.set(0,{stat_data:{energy:9}});return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'体能下降'}]};});
 await assert.rejects(f.service.syncNative(),/原生来源快照已改变/);assert.equal(parses,0);assert.equal(writes,0);assert.equal(values.has(1),false);
 }finally{globalThis.Mvu=previous;}
});

test('unified archive rechecks preceding native snapshot after callback before first target write',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}]]);let parses=0,writes=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;before.stat_data.energy=8;values.set(0,{stat_data:{energy:9}});return before;},replaceMvuData:async()=>{writes++;}};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[user('开场'),ai('体能下降。'),user('继续')];await f.service.initialize();await f.set({nativeBridge:true});f.responder((task,input)=>{const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'体能下降'}]};});
 await assert.rejects(f.service.syncNative(),/原生来源快照已改变/);assert.equal(parses,1);assert.equal(writes,0);await assert.rejects(f.makeService().syncNative(),/原生来源快照已改变/);assert.equal(parses,1);assert.equal(f.calls.length,1);
 }finally{globalThis.Mvu=previous;}
});

test('unified archive refuses older pending history after a later native receipt instead of rolling mirrors back',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}],[2,{stat_data:{energy:8}}]]);
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>before,replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('早期训练。'),user('继续'),ai('后期训练。'),user('继续')];await f.service.initialize();await f.set({nativeBridge:true});f.responder(()=>({changes:[]}));await f.service.archive({range:{from:3,to:3,limit:1}});const before=await f.service.inspect();assert.equal(before.rows.find(x=>x.values.路径==='/energy').values.值,8);const calls=f.calls.length;
 await assert.rejects(f.service.syncNative(),/后续楼层已有原生结算/);const after=await f.service.inspect();assert.equal(after.rows.find(x=>x.values.路径==='/energy').values.值,8);assert.equal(f.calls.length,calls);
 }finally{globalThis.Mvu=previous;}
});

test('unified archive keeps legacy nonempty native updates owned by the original runtime',async()=>{
 const {hasNativeUpdate}=await import('../tables/native-bridge.js');assert.equal(hasNativeUpdate('<UpdateVariable><Analysis>无变化</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable>'),false);assert.equal(hasNativeUpdate('<UpdateVariable>_.set("energy", 8);</UpdateVariable>'),true);
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:8}}]]);let parses=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{parses++;return before;},replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('训练。<UpdateVariable>_.set("energy", 8);</UpdateVariable>'),user('继续')];await f.service.enableNativeBridge();f.responder((task,input)=>{assert(input.nativeBridge.nativeOwned);return {changes:[op('new:event','events',{名称:'训练',内容:'训练。'},'训练')]};});await f.service.syncNative();assert.equal(parses,0);assert.equal(f.calls.length,1);const view=await f.service.inspect();assert.equal(view.rows.filter(x=>x.table==='events').length,1);assert.equal(view.session.commits.findLast(x=>x.nativeReceipt?.phase==='applied').nativeReceipt.legacyNative,true);
 }finally{globalThis.Mvu=previous;}
});

test('unified archive keeps callback-created native roots distinct from business temporary IDs',async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}]]);
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>{before.stat_data.energy=8;before.stat_data.derived=42;return before;},replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
 try{f.binding.primary='';f.binding.additional=[];f.c.chat=[ai('训练后体能下降。'),user('继续')];await f.service.enableNativeBridge();f.responder((task,input)=>{const row=input.currentRows.find(r=>r.values.路径==='/energy');return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:8},evidence:'训练后体能下降'},op('new:native-1','events',{名称:'训练',内容:'体能下降。'},'训练后体能下降')]};});
 await f.service.syncNative();const view=await f.service.inspect(),event=view.rows.find(x=>x.table==='events'),derived=view.rows.find(x=>x.values.路径==='/derived');assert.equal(event.values.名称,'训练');assert.equal(derived.values.值,42);assert.notEqual(event.id,derived.id);
 }finally{globalThis.Mvu=previous;}
});

for(const completed of [true,false])test('unified archive candidate switch '+(completed?'accepts a completed old journal without inheriting its settlement':'blocks a truly pending old journal without touching the new snapshot'),async()=>{
 const f=fixture(),previous=globalThis.Mvu,values=new Map([[0,{stat_data:{energy:10}}]]);let parses=0,writes=0;
 globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(text,before)=>{parses++;const operations=JSON.parse(text.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/)[1]);before.stat_data.energy=operations[0].value;return before;},replaceMvuData:async(data,{message_id})=>{writes++;if(!completed)throw Error('first candidate write interrupted');values.set(message_id,structuredClone(data));}};
 try{f.binding.primary='';f.binding.additional=[];const alternatives=['训练后体能下降。','另一候选训练后体能下降。'];f.c.chat=[{...ai(alternatives[0]),swipes:alternatives,swipe_id:0},user('继续')];await f.service.enableNativeBridge();
 f.responder((task,input)=>{assert.equal(task,'tableArchive');assert.equal(input.nativeBridge.nativeOwned,false);const row=input.currentRows.find(r=>r.values.路径==='/energy');assert.equal(row.values.值,parses===0?10:20);return {changes:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:row.values.值-2},evidence:'训练后体能下降'}]};});
 if(completed)await f.service.syncNative();else await assert.rejects(f.service.syncNative(),/first candidate write interrupted/);
 const old=await f.service.inspect(),oldSource=old.session.nativeIntents[0].source;assert.equal(old.session.commits.some(x=>x.source===oldSource&&x.nativeReceipt?.phase==='applied'),completed);
 f.c.chat[0].mes=alternatives[1];f.c.chat[0].swipe_id=1;values.set(0,{stat_data:{energy:20}});values.delete(1);const fresh=f.makeService(),beforeWrites=writes;
 if(completed){const result=await fresh.syncNative();assert.equal(result.updated,1);assert.equal(result.already,undefined);assert.equal(parses,2);assert.equal(f.calls.length,2);assert.equal(values.get(0).stat_data.energy,18);const current=await fresh.inspect();assert.equal(current.archived,1);assert.equal(current.rows.find(x=>x.values.路径==='/energy').values.值,18);assert.equal(current.session.commits.filter(x=>x.nativeReceipt?.phase==='applied').length,2);}
 else{await assert.rejects(fresh.syncNative(),/正文已改变且存在未完成的原生结算/);assert.equal(parses,1);assert.equal(f.calls.length,1);assert.equal(writes,beforeWrites);assert.equal(values.get(0).stat_data.energy,20);assert.equal(values.has(1),false);}
 }finally{globalThis.Mvu=previous;}
});

test('same-source archive view reaches normal, numbered, separate-object and native requests without changing raw history',async()=>{
 const {restoreArchiveSource}=await import('../tables/archive-source-view.js'),{pairedPreset,taskMessages}=await import('../tables/paired-preset.js');
 const prose='城门仍然关闭。'+('守门人在檐下等待，雨落在青石路上。'.repeat(100))+'归档正文唯一尾哨。';
 const raw='<reply><title>场景：城门 | 2026-10-22 12:00 | 雨</title><body>'+prose+'</body><memory>假门已开。</memory><extra>独有面板哨兵</extra><unknown>保留未知块。</unknown></reply>';
 const previous=globalThis.Mvu;
 try{for(const native of [false,true])for(const numbered of [false,true])for(const objectsSeparate of [false,true]){
  const f=fixture(),values=new Map([[0,{stat_data:{energy:10}}]]);globalThis.Mvu={getMvuData:({message_id})=>structuredClone(values.get(message_id)),parseMessage:async(_,before)=>before,replaceMvuData:async(data,{message_id})=>values.set(message_id,structuredClone(data))};
  f.binding.primary='';f.binding.additional=[];f.c.chat=[{...ai(raw),swipe_id:2},user('继续')];const original=structuredClone(f.c.chat),chain=await sources(f.c.chat);
  await f.service.initialize();await f.set({nativeBridge:native,objectsSeparate});let observed=0;
  f.responder((task,input)=>{
   observed++;assert.equal(task,objectsSeparate&&observed===1?'objectArchive':numbered?'historyImport':'tableArchive');
   const history=input.sourceHistory[0];assert.equal(history.projection,'source-reference');assert.equal(history.key,chain[0].key);assert.equal(history.parent,chain[0].parent);assert.equal(history.candidate,2);assert.equal(input.archiveSource.text,prose);assert.equal(input.archiveSource.time,'2026-10-22 12:00');assert.equal(restoreArchiveSource(history,input.archiveSource),raw);
   const configuration=f.store.read(),messages=taskMessages({preset:pairedPreset({task,configuration,nativeBridge:input.nativeBridge}),task,input}),sent=messages.map(m=>m.content).join('\n');
   assert.equal(sent.split('归档正文唯一尾哨。').length-1,1);assert.equal(sent.split('独有面板哨兵').length-1,1);assert.equal(sent.split('保留未知块。').length-1,1);
   return {changes:task==='objectArchive'?[]:[op('new:closed','events',{名称:'城门关闭',经过:'城门仍然关闭。'},'城门仍然关闭。')]};
  });
  const result=await f.service.archive(numbered?{range:{from:1,to:1,limit:1}}:{});assert.equal(result.archived,1);assert.equal(observed,objectsSeparate?2:1);assert.deepEqual(f.c.chat,original);assert.deepEqual(await sources(f.c.chat),chain);assert.equal((await f.service.inspect()).rows.filter(r=>r.table==='events').length,1);
 }}finally{globalThis.Mvu=previous;}
});

test('same-source repair keeps the exact view and rejects auxiliary-only evidence before completing the floor',async()=>{
 const {restoreArchiveSource}=await import('../tables/archive-source-view.js'),f=fixture();await f.service.initialize();
 const prose='门仍然关闭。'+('守卫保持原来的站位。'.repeat(100)),raw='<body>'+prose+'</body><memory>门已经打开。</memory>';f.c.chat=[ai(raw),user('继续')];let attempts=0,first;
 f.responder((task,input)=>{attempts++;assert.equal(task,'tableArchive');assert.equal(input.sourceHistory[0].projection,'source-reference');assert.equal(restoreArchiveSource(input.sourceHistory[0],input.archiveSource),raw);
  if(!first)first=structuredClone({archiveSource:input.archiveSource,sourceHistory:input.sourceHistory});else assert.deepEqual({archiveSource:input.archiveSource,sourceHistory:input.sourceHistory},first);
  return {changes:[op('new:event','events',{名称:'错误事件',经过:'门已经打开。'},'门已经打开。')]};
 });
 const result=await f.service.archive();assert.equal(attempts,2);assert(result.pending.length);assert.equal(result.archived,0);assert.equal((await f.service.inspect()).rows.length,0);assert.equal(f.c.chat[0].mes,raw);
});
