import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {Window} from 'happy-dom';
function parseHTML(html){const window=new Window({url:'https://host.test/',settings:{disableIframePageLoading:true}});window.document.write(html);return {window,document:window.document};}
import {createPhoneService} from '../phone-core.mjs';
import {getDoc} from '../social-suite-core.mjs';
import {chatKey,NS} from '../engine/controller.mjs';
import {currentPhoneHost,matrixMemoryStorage} from './fixtures/phone-host-current.mjs';
import {configureTags} from '../engine/tags.mjs';
import {
 PHONE_TURN_KEY,PHONE_SOURCE_KEY,phoneSource,
 createPhoneTurnHost,mountPhoneMarkers,
} from '../phone-turn-host.js';

globalThis.crypto??=webcrypto;
const at='2026-11-09T11:00:00Z';
const clone=value=>structuredClone(value);
const code=expected=>error=>error?.code===expected;
const user=(uid='user-1',mes='原生用户剧情')=>({is_user:true,is_system:false,mes,extra:{tisya_engine:{uid}}});
const assistant=(uid='assistant-1',mes='原生角色正文')=>({is_user:false,is_system:false,mes,extra:{tisya_engine:{uid}}});
const seed=()=>({accounts:{me:{name:'我'},a:{name:'网友',platform:'douban'}},documents:[{id:'forum',kind:'forum',title:'测试楼',at,visibility:'public',meta:{coreThread:{platform:'douban',baseTime:at,stepSeconds:30}},items:[{by:'a',text:'首楼',counts:{like:{set:0},down:{set:0}}}]}]});
const context=(id='chat-a')=>({chatId:id,characterId:0,groupId:null,chatMetadata:{},chat:[user(),assistant()],saveChat:async()=>true});
const raw=(requestId,acks=[],text='网友的新回复',floor=3)=>`<reply><body>看到手机。[[手机:m1]]</body><extra><phone>${JSON.stringify({requestId,acks,blocks:[{type:'forum',thread:'forum',items:[{by:'a',text}]}],markers:[{id:'m1',thread:'forum',floor}]})}</phone></extra></reply>`;
async function fixture(){
 let current=context(),nativeBusy=false,seq=0,metadataSaves=0,messageSaves=0,diskWrites=0,diskFail=false;
 const errors=[];current.saveChat=async()=>{messageSaves++;return true;};
 const engineStorage=matrixMemoryStorage({onWrite:async()=>{if(diskFail)throw Error('模拟磁盘拒绝');diskWrites++;}}),database=await currentPhoneHost({context:current,getContext:()=>current,storage:engineStorage,persistMetadata:async()=>{metadataSaves++;return true;}}),storage=database.phoneStorage;
 const service=createPhoneService({seed:seed(),contextKey:chatKey(current),storage,now:()=>at,idFactory:()=>`id-${++seq}`});await service.init();
 const host=createPhoneTurnHost({getContext:()=>current,phoneService:service,isGenerating:()=>nativeBusy,onError:e=>errors.push(e)});
 return {get c(){return current;},setContext:c=>current=c,setBusy:v=>nativeBusy=v,setDiskFail:v=>diskFail=v,service,host,storage,database,engineStorage,errors,counters:()=>({metadataSaves,messageSaves,diskWrites})};
}
async function start(f){const action=await f.service.dispatch({kind:'message',threadId:'forum',text:'用户主动留言'});const request=await f.host.begin('normal');f.c.chat.push(user('user-2','下一条原生剧情'));const directions=await f.host.directions();return {...action,...request,directions};}
async function finish(f,r,{uid='assistant-2',text='网友的新回复'}={}){const m=assistant(uid,raw(r.requestId,[r.actionId],text));f.c.chat.push(m);const result=await f.host.finished({accepted:true});return {m,result,source:phoneSource(m)};}

test('真实Matrix表单是手机唯一真源；重复初始化不另写metadata手机档',async()=>{
 const f=await fixture(),snapshot=await f.database.snapshot();assert.equal(f.c.chatMetadata['缇斯亚虚拟手机'],undefined);assert(snapshot.state.tables.X_PHONE_BINDINGS['phone-current']);
 assert.equal((await f.storage.load()).contextKey,chatKey(f.c));const before=clone(f.c.chatMetadata),writes=f.counters().diskWrites;await f.service.init();assert.deepEqual(f.c.chatMetadata,before);assert.equal(f.counters().diskWrites,writes);
});

test('损坏数据库绑定拒绝，不拿空种子覆盖原始值',async()=>{
 const f=await fixture(),id=f.c.chatMetadata[NS].chat_uid,bundle=await f.engineStorage.get(id);bundle.state.tables.X_PHONE_BINDINGS['phone-current'].values.layout={damaged:true};await f.engineStorage.set(id,bundle);const writes=f.counters().diskWrites;
 await assert.rejects(f.storage.load());assert.deepEqual((await f.engineStorage.get(id)).state.tables.X_PHONE_BINDINGS['phone-current'].values.layout,{damaged:true});assert.equal(f.counters().diskWrites,writes);
});

test('同聊天两个真实host共享CAS，旧手机版本不能覆盖另一窗口的新操作',async()=>{
 const f=await fixture(),loaded=await f.storage.load(),cold=await currentPhoneHost({context:f.c,storage:f.engineStorage}),service=createPhoneService({seed:seed(),contextKey:chatKey(f.c),storage:cold.phoneStorage,idFactory:()=> 'other-action'});await service.init();await service.dispatch({kind:'search',query:'另一个窗口'});
 await assert.rejects(f.storage.save({...loaded,revision:loaded.revision+1},{expectedRevision:loaded.revision}),code('PHONE_DATABASE_STALE'));assert.equal((await cold.phoneStorage.load()).actions[0].query,'另一个窗口');
});

test('数据库持久保存失败保留真源，重新回读恢复后才重试',async()=>{
 const f=await fixture(),before=await f.database.snapshot(),writes=f.counters().diskWrites;f.setDiskFail(true);await assert.rejects(f.service.dispatch({kind:'search',query:'保存失败的操作'}),/模拟磁盘拒绝/);
 assert.deepEqual(await f.database.snapshot(),before);assert.equal(f.counters().diskWrites,writes);assert.equal(f.service.getState().actions.length,0);
 f.setDiskFail(false);await f.service.refresh();await f.service.dispatch({kind:'search',query:'恢复后的操作'});assert.equal((await f.storage.load()).actions[0].query,'恢复后的操作');
});

test('切换聊天后旧 storage 拒绝写入；新聊天没有收到旧值',async()=>{
 const f=await fixture(),old=f.c,loaded=await f.storage.load(),before=await f.engineStorage.get(old.chatMetadata[NS].chat_uid),next=context('chat-b');f.setContext(next);const newDb=await currentPhoneHost({context:next,storage:f.engineStorage});
 await assert.rejects(f.storage.save({...loaded,revision:loaded.revision+1},{expectedRevision:loaded.revision}),code('PHONE_CONTEXT_CHANGED'));assert.equal(await newDb.phoneStorage.load(),null);assert.deepEqual(await f.engineStorage.get(old.chatMetadata[NS].chat_uid),before);assert.equal(next.chatMetadata['缇斯亚虚拟手机'],undefined);
});

test('下一轮原生请求追加冻结提示词；本轮绑定幂等，正文与草稿不被代发',async()=>{
 const f=await fixture(),oldBody=f.c.chat[1].mes,r=await start(f),saved=f.counters().messageSaves;
 assert.equal(r.directions.length,2);assert.deepEqual(await f.host.directions({prepare:true}),r.directions);assert.deepEqual(await f.host.directions(),r.directions);
 assert.equal(f.counters().messageSaves,saved);assert.equal(f.c.chat[1].mes,oldBody);assert.equal(f.c.chat.at(-1).mes,'下一条原生剧情');
 assert.deepEqual(f.c.chat.at(-1).extra[PHONE_TURN_KEY].requests.map(x=>x.requestId),[r.requestId]);
 assert.equal(JSON.parse(r.directions[1].content).actions[0].text,'用户主动留言');
});

test('完成后只接纳当前稳定来源一次；再次重渲染/对账不重复楼层与确认',async()=>{
 const f=await fixture(),r=await start(f),done=await finish(f,r);assert.ok(done.result.snapshot);
 const s=f.service.getState();assert.equal(s.actions[0].status,'received');assert.equal(getDoc(s.suite,'forum').items.length,3);
 assert.equal(done.m.extra[PHONE_SOURCE_KEY].sourceId,done.source.sourceId);const revision=s.revision;
 await f.host.reconcile();await f.host.reconcile();assert.equal(f.service.getState().revision,revision);assert.equal(getDoc(f.service.getState().suite,'forum').items.length,3);
 assert.equal(f.c.chat.at(-1).mes,raw(r.requestId,[r.actionId]));
});

test('同 UID 换候选按 raw SHA 分支；旧定格持续读取旧状态',async()=>{
 const f=await fixture(),r=await start(f),first=await finish(f,r);
 const prepared=await f.host.begin('swipe');assert.equal(prepared.requestId,r.requestId);assert.deepEqual(prepared.messages,r.messages);await f.host.directions();
 first.m.mes=raw(r.requestId,[r.actionId],'另一个候选的回复');const second=phoneSource(first.m);await f.host.finished({accepted:true});
 assert.notEqual(second.sourceId,first.source.sourceId);assert.equal(getDoc(f.service.snapshot(first.source.sourceId).suite,'forum').items.at(-1).text,'网友的新回复');
 assert.equal(getDoc(f.service.snapshot(second.sourceId).suite,'forum').items.at(-1).text,'另一个候选的回复');assert.equal(getDoc(f.service.getState().suite,'forum').items.length,3);
 first.m.mes=first.source.raw;await f.host.reconcile();assert.equal(getDoc(f.service.getState().suite,'forum').items.at(-1).text,'网友的新回复');
});

test('pending_previous 只对账已经采纳的原生候选；明确采纳后才显示新状态',async()=>{
 const f=await fixture(),r=await start(f),first=await finish(f,r);const old=first.source.raw;
 first.m.mes=raw(r.requestId,[r.actionId],'待采纳候选');first.m.extra.tisya_engine.pending_sha256='pending';first.m.extra.tisya_engine.pending_previous={uid:first.source.uid,role:'assistant',text:old};
 await f.host.reconcile();assert.equal(getDoc(f.service.getState().suite,'forum').items.at(-1).text,'网友的新回复');
 delete first.m.extra.tisya_engine.pending_sha256;delete first.m.extra.tisya_engine.pending_previous;await f.host.reconcile();
 assert.equal(getDoc(f.service.getState().suite,'forum').items.at(-1).text,'待采纳候选');
});

test('删除原生源回退手机投影，旧快照保留且不按当前值补',async()=>{
 const f=await fixture(),r=await start(f),first=await finish(f,r);f.c.chat.pop();await f.host.reconcile();
 assert.equal(getDoc(f.service.getState().suite,'forum').items.length,2);assert.equal(f.service.getState().actions[0].status,'queued');assert.ok(f.service.snapshot(first.source.sourceId));assert.equal(f.service.snapshot('missing-source'),null);
});

test('prepare后离开初始化以前的历史会拒写；恢复原历史后待发内容仍可恢复',async()=>{
 const f=await fixture();await f.service.dispatch({kind:'message',threadId:'forum',text:'不能丢的消息'});await f.host.begin();const old=f.c.chat[0].mes,saved=await f.engineStorage.get(f.c.chatMetadata[NS].chat_uid);f.c.chat[0].mes='前情已编辑';f.c.chat.push(user('user-2'));
 await assert.rejects(f.host.directions(),code('PHONE_HISTORY_CHANGED'));await assert.rejects(f.host.stopped(),code('PHONE_DATABASE_DETACHED'));assert.deepEqual(await f.engineStorage.get(f.c.chatMetadata[NS].chat_uid),saved);
 f.c.chat[0].mes=old;await f.host.recoverPending({confirmedEnded:true});assert.equal(f.service.getState().actions[0].status,'failed');assert.equal(getDoc(f.service.getState().suite,'forum').items.at(-1).text,'不能丢的消息');
});

test('缺少手机扩展不消费操作，原生正文保留且状态可恢复',async()=>{
 const f=await fixture(),r=await start(f);f.c.chat.push(assistant('assistant-2','只有原生正文，没有手机数据'));await f.host.finished({accepted:true});
 assert.equal(f.service.getState().requests[r.requestId].status,'failed');assert.equal(f.service.getState().actions[0].status,'failed');assert.equal(f.c.chat.at(-1).mes,'只有原生正文，没有手机数据');
});

test('来源缺少前一原生用户回合绑定时明确拒绝，不越权接纳',async()=>{
 const f=await fixture(),r=await start(f);f.c.chat.at(-1).extra[PHONE_TURN_KEY].requests=[];f.c.chat.push(assistant('assistant-2',raw(r.requestId,[r.actionId])));
 const before=f.service.getState();await assert.rejects(f.host.reconcile(),code('PHONE_SOURCE_OWNERSHIP'));assert.deepEqual(f.service.getState(),before);
});

test('自定义 reply/extra 标签规范化只供协议解析，来源仍使用原文SHA',async()=>{
 const f=await fixture(),r=await start(f);configureTags({reply:'scene',body:'prose',extra:'appendix'});
 try{
  const source=raw(r.requestId,[r.actionId]).replaceAll('reply>','scene>').replaceAll('body>','prose>').replaceAll('extra>','appendix>');
  const m=assistant('assistant-2',source);f.c.chat.push(m);const expected=phoneSource(m);await f.host.finished({accepted:true});
  assert.ok(f.service.snapshot(expected.sourceId));assert.equal(m.mes,source);assert.equal(f.service.getState().actions[0].status,'received');
 }finally{configureTags();}
});

test('自定义标签的错误ack保留精确原文及原文SHA，冷重开不改写失败证据',async()=>{
 const f=await fixture(),r=await start(f);configureTags({reply:'scene',body:'prose',extra:'appendix'});
 try{
  const original=raw(r.requestId,['不属于本轮的操作']).replaceAll('reply>','scene>').replaceAll('body>','prose>').replaceAll('extra>','appendix>'),m=assistant('custom-rejected',original);f.c.chat.push(m);const source=phoneSource(m),result=await f.host.finished({accepted:true});assert.equal(result.failed,true);
  const rejected=f.service.getState().rejectedSources[source.sourceId];assert.equal(rejected.error.code,'PHONE_ACK_SCOPE');assert.equal(rejected.raw,original);assert.equal(phoneSource(m,rejected.raw).sourceId,source.sourceId);assert.equal(m.mes,original);
  const reopened=await currentPhoneHost({context:f.c,storage:f.engineStorage}),cold=createPhoneService({seed:seed(),contextKey:chatKey(f.c),storage:reopened.phoneStorage});await cold.init();assert.deepEqual(cold.getState().rejectedSources[source.sourceId],rejected);assert.equal(phoneSource(m,cold.getState().rejectedSources[source.sourceId].raw).candidate,source.candidate);
 }finally{configureTags();}
});

test('stop 与 prepare 持久提交交错也回收已知请求，不留下新prepared锁',async()=>{
 const f=await fixture();const base=f.service.prepareTurn;let release,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 f.service.prepareTurn=async options=>{const result=await base(options);entered();await gate;return result;};
 const begin=f.host.begin();await waiting;await f.host.stopped();release();await assert.rejects(begin,code('PHONE_CONTEXT_CHANGED'));
 assert.ok(Object.values(f.service.getState().requests).every(r=>r.status==='failed'));assert.equal(f.host.state().active,false);
});

test('切聊天不擅自宣布旧请求结束；明确恢复先核原生空闲并保留旧源',async()=>{
 const f=await fixture();await f.service.dispatch({kind:'search',query:'测试'});const r=await f.host.begin();f.host.contextChanged();
 assert.equal(f.service.getState().requests[r.requestId].status,'prepared');await assert.rejects(f.host.recoverPending(),code('PHONE_RECOVERY_CONFIRM'));
 f.setBusy(true);await assert.rejects(f.host.recoverPending({confirmedEnded:true}),code('PHONE_RECOVERY_BUSY'));f.setBusy(false);
 const result=await f.host.recoverPending({confirmedEnded:true});assert.equal(result.recovered,1);assert.equal(f.service.getState().requests[r.requestId].status,'failed');assert.equal(f.c.chat.length,2);
});

test('冷启先对账已完成原生输出，恢复按钮不会把已完成请求判失败',async()=>{
 const f=await fixture(),r=await start(f);f.c.chat.push(assistant('assistant-2',raw(r.requestId,[r.actionId])));f.host.contextChanged();
 const result=await f.host.recoverPending({confirmedEnded:true});assert.equal(result.recovered,0);assert.equal(f.service.getState().requests[r.requestId].status,'accepted');assert.equal(f.service.getState().actions[0].status,'received');
});

test('正文marker仅挂载同源只读冻结页，保留code中的字面量与会话归属',()=>{
 const {document,window}=parseHTML('<html><head><base href="https://host.test/"></head><body><main>正文[[手机:m1]]后文 <code>[[手机:code]]</code><pre>[[手机:pre]]</pre><p>[[手机:定格二]]</p></main></body></html>');
 window.NodeFilter={SHOW_TEXT:4};const body=document.querySelector('main'),m=assistant('uid-test',raw('req'));
 const result=mountPhoneMarkers(document,body,m,{phoneUrl:'https://host.test/extensions/tisya/phone.html',contextKey:'chat-key'});
 assert.equal(body.querySelectorAll('iframe').length,2);assert.equal(body.querySelector('code').textContent,'[[手机:code]]');
 const url=new URL(body.querySelector('iframe').src);assert.equal(url.searchParams.get('chat'),'chat-key');assert.equal(url.searchParams.get('frozen'),phoneSource(m).sourceId);assert.equal(url.searchParams.get('marker'),'m1');
 assert.equal(body.querySelector('iframe').getAttribute('sandbox'),'allow-scripts allow-same-origin');result.dispose();assert.equal(body.querySelectorAll('iframe').length,0);
});

test('正文marker拒绝跨源页面，不允许以当前状态替代未找到的冻结来源',()=>{
 const {document,window}=parseHTML('<html><head><base href="https://host.test/"></head><body>[[手机:m1]]</body></html>');window.NodeFilter={SHOW_TEXT:4};
 assert.throws(()=>mountPhoneMarkers(document,document.body,assistant(),{phoneUrl:'https://elsewhere.test/phone.html',contextKey:'chat-key'}),code('PHONE_FRAME_ORIGIN'));
});

test('候选接线包含实际双预设hook与延后候选归档、显式恢复',async()=>{
 const source=await readFile(new URL('../index.js',import.meta.url),'utf8');
 assert.equal((source.match(/getContractorMessages:turnDirections/g)??[]).length,2);
 assert.ok(source.includes('if(!delegated)await phoneTurn.finished({accepted})'));
 assert.ok(source.includes('await phoneTurn.finished({accepted:true});return result;'));
 assert.ok(source.includes('recoverPending:options=>phoneTurn.recoverPending(options)'));
 // Captured iframe ownership across navigation is executed in phone-entry-switch.test.js.
});

test('被拒的坏JSON、错ack、错request与坏引用保留证据，冷重开后下一轮仍可成功',async t=>{
 const cases={
  json:r=>'<reply><body>失败原文仍保留</body><extra><phone>{broken json}</phone></extra></reply>',
  ack:r=>raw(r.requestId,['不属于本轮的操作']),
  request:r=>raw('不属于本轮的请求',[r.actionId]),
  marker:r=>raw(r.requestId,[r.actionId],'坏引用',999),
 };
 for(const [name,makeRaw]of Object.entries(cases))await t.test(name,async()=>{
  const f=await fixture(),r=await start(f),original=makeRaw(r),m=assistant('bad-source',original);f.c.chat.push(m);
  const result=await f.host.finished({accepted:true}),source=phoneSource(m);assert.equal(result.failed,true);
  const rejected=f.service.getState().rejectedSources[source.sourceId];assert.equal(rejected.requestId,r.requestId);assert.ok(rejected.error.message);assert.equal(rejected.raw,original);assert.equal(m.mes,original);
  assert.equal(f.service.getState().actions[0].status,'failed');assert.throws(()=>f.service.snapshot(source.sourceId),code('PHONE_SOURCE_REJECTED'));
  let seq=100;const cold=await currentPhoneHost({context:f.c,storage:f.engineStorage}),fresh=createPhoneService({seed:seed(),contextKey:chatKey(f.c),storage:cold.phoneStorage,now:()=>at,idFactory:()=>`retry-${++seq}`});await fresh.init();
  const host=createPhoneTurnHost({getContext:()=>f.c,phoneService:fresh,onError:e=>{throw e;}});
  const next=await host.begin('normal');f.c.chat.push(user('next-user','下一轮正常继续'));await host.directions();f.c.chat.push(assistant('next-assistant',raw(next.requestId,[r.actionId])));
  await host.finished({accepted:true});assert.equal(fresh.getState().actions[0].status,'received');assert.equal(getDoc(fresh.getState().suite,'forum').items.length,3);
  assert.equal(m.mes,original);assert.ok(fresh.getState().rejectedSources[source.sourceId]);assert.equal(fresh.getState().requests[r.requestId].status,'failed');
 });
});

test('被拒候选重骰复用原请求；修正源文本可重新接纳，不把旧失败当新结果',async()=>{
 const f=await fixture(),r=await start(f),m=assistant('bad-reroll','<reply><body>正文</body><extra><phone>{bad}</phone></extra></reply>');f.c.chat.push(m);
 await f.host.finished({accepted:true});const old=phoneSource(m);
 const replay=await f.host.begin('swipe');assert.equal(replay.requestId,r.requestId);await f.host.directions();m.mes=raw(r.requestId,[r.actionId]);await f.host.finished({accepted:true});
 assert.equal(f.service.getState().actions[0].status,'received');assert.ok(f.service.snapshot(phoneSource(m).sourceId));assert.ok(f.service.getState().rejectedSources[old.sourceId]);
});

test('有精确原生父分支元数据才接管复制存档，切点回退与冷重开均保留母分支',async()=>{
 const f=await fixture(),r=await start(f),done=await finish(f,r),parentState=await f.database.snapshot(),parentChat=clone(f.c.chat),parentKey=chatKey(f.c);
 let branch={...f.c,chatId:'chat-a - Branch #1',chat:clone(f.c.chat.slice(0,-1)),chatMetadata:{...clone(f.c.chatMetadata),main_chat:f.c.chatId,integrity:'native-branch-integrity'}};
 const childDb=await currentPhoneHost({context:branch,storage:f.engineStorage}),service=createPhoneService({seed:seed(),contextKey:chatKey(branch),storage:childDb.phoneStorage,now:()=>at,idFactory:()=>`branch-next`});await service.init();
 assert.equal(service.getState().contextKey,chatKey(branch));assert.equal(branch.chatMetadata['缇斯亚虚拟手机'],undefined);assert.notEqual(chatKey(branch),parentKey);
 assert.equal(getDoc(service.getState().suite,'forum').items.length,2);assert.deepEqual(service.getState().selectedSources,[]);assert.ok(service.snapshot(done.source.sourceId));
 assert.deepEqual(await f.database.snapshot(),parentState);assert.deepEqual(f.c.chat,parentChat);
 const reopened=await currentPhoneHost({context:branch,storage:f.engineStorage}),cold=createPhoneService({seed:seed(),contextKey:chatKey(branch),storage:reopened.phoneStorage});await cold.init();assert.deepEqual(cold.getState(),service.getState());
 const host=createPhoneTurnHost({getContext:()=>branch,phoneService:cold});assert.ok((await host.begin('normal')).requestId);await host.stopped();assert.deepEqual(await f.database.snapshot(),parentState);
});

test('普通复制、错父会话和跨角色不能借用手机真源；已验证在途分支保留待确认状态',async()=>{
 const f=await fixture(),original=await f.database.snapshot();
 for(const change of [{},{main_chat:'另一聊天',integrity:'new'},{main_chat:f.c.chatId},{main_chat:f.c.chatId,integrity:'new',otherCharacter:true}]){
  const c={...f.c,characterId:change.otherCharacter?4:f.c.characterId,chatId:'new-chat',chatMetadata:{...clone(f.c.chatMetadata),...change}};
  const child=await currentPhoneHost({context:c,storage:f.engineStorage});await assert.rejects(child.phoneStorage.load(),code('PHONE_DATABASE_SCOPE'));assert.deepEqual(await f.database.snapshot(),original);
 }
 const request=await f.host.begin('normal'),pending=await f.database.snapshot(),c={...f.c,chat:clone(f.c.chat),chatId:'pending-branch',chatMetadata:{...clone(f.c.chatMetadata),main_chat:f.c.chatId,integrity:'new'}},child=await currentPhoneHost({context:c,storage:f.engineStorage}),service=createPhoneService({seed:seed(),contextKey:chatKey(c),storage:child.phoneStorage});await service.init();
 assert.equal(service.getState().requests[request.requestId].status,'prepared');const host=createPhoneTurnHost({getContext:()=>c,phoneService:service,isGenerating:()=>false});await assert.rejects(host.recoverPending(),code('PHONE_RECOVERY_CONFIRM'));assert.deepEqual(await f.database.snapshot(),pending);
});

test('真实保存失败不误记为坏回复；存储恢复后仍接纳原来源',async()=>{
 const f=await fixture(),r=await start(f),m=assistant('save-failure',raw(r.requestId,[r.actionId]));f.c.chat.push(m);const save=f.storage.save;
 f.storage.save=async()=>{throw Error('模拟宿主持久化失败');};const result=await f.host.finished({accepted:true});assert.equal(result.failed,true);
 assert.deepEqual(f.service.getState().rejectedSources,{});assert.equal(f.service.getState().requests[r.requestId].status,'prepared');assert.equal(m.mes,raw(r.requestId,[r.actionId]));
 f.storage.save=save;await f.host.recoverPending({confirmedEnded:true});assert.equal(f.service.getState().actions[0].status,'received');assert.ok(f.service.snapshot(phoneSource(m).sourceId));
});

test('群聊嵌套分支按直接父名称接续，不借用同名其他组的手机',async()=>{
 let current={...context('group-parent'),characterId:null,groupId:'group-7'};const disk=matrixMemoryStorage(),create=async()=>{const db=await currentPhoneHost({context:current,storage:disk});const service=createPhoneService({seed:seed(),contextKey:chatKey(current),storage:db.phoneStorage});await service.init();return service;};
 const parent=await create(),parentState=clone(parent.getState());
 current={...current,chatId:'group-branch-1',chatMetadata:{...clone(current.chatMetadata),main_chat:'group-parent',integrity:'one'}};await create();
 current={...current,chatId:'group-branch-2',chatMetadata:{...clone(current.chatMetadata),main_chat:'group-branch-1',integrity:'two'}};const second=await create();
 assert.equal(second.getState().contextKey,chatKey(current));assert.equal(parent.getState().contextKey,parentState.contextKey);
 current={...current,groupId:'group-8',chatId:'other-group-branch',chatMetadata:{...clone(current.chatMetadata),main_chat:'group-branch-2',integrity:'three'}};await assert.rejects(create(),code('PHONE_DATABASE_SCOPE'));assert.deepEqual(parent.getState(),parentState);
});
