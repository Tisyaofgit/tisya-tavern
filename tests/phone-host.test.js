import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {Window} from 'happy-dom';
function parseHTML(html){const window=new Window({url:'https://host.test/',settings:{disableIframePageLoading:true}});window.document.write(html);return {window,document:window.document};}
import {createPhoneService} from '../phone-core.mjs';
import {getDoc} from '../social-suite-core.mjs';
import {chatKey} from '../engine/controller.mjs';
import {configureTags} from '../engine/tags.mjs';
import {
 PHONE_STATE_KEY,PHONE_TURN_KEY,PHONE_SOURCE_KEY,phoneSource,
 createPhoneMetadataStorage,createPhoneTurnHost,mountPhoneMarkers,
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
 let current=context(),nativeBusy=false,seq=0,metadataSaves=0,messageSaves=0;
 const errors=[];current.saveChat=async()=>{messageSaves++;return true;};
 const storage=createPhoneMetadataStorage({getContext:()=>current,persistMetadata:async()=>{metadataSaves++;return true;}},current);
 const service=createPhoneService({seed:seed(),contextKey:chatKey(current),storage,now:()=>at,idFactory:()=>`id-${++seq}`});await service.init();
 const host=createPhoneTurnHost({getContext:()=>current,phoneService:service,isGenerating:()=>nativeBusy,onError:e=>errors.push(e)});
 return {get c(){return current;},setContext:c=>current=c,setBusy:v=>nativeBusy=v,service,host,storage,errors,counters:()=>({metadataSaves,messageSaves})};
}
async function start(f){const action=await f.service.dispatch({kind:'message',threadId:'forum',text:'用户主动留言'});const request=await f.host.begin('normal');f.c.chat.push(user('user-2','下一条原生剧情'));const directions=await f.host.directions();return {...action,...request,directions};}
async function finish(f,r,{uid='assistant-2',text='网友的新回复'}={}){const m=assistant(uid,raw(r.requestId,[r.actionId],text));f.c.chat.push(m);const result=await f.host.finished({accepted:true});return {m,result,source:phoneSource(m)};}

test('元数据是单一真源，首次空值才初始化；不产生 localStorage 镜像',async()=>{
 const f=await fixture();assert.equal(f.c[PHONE_STATE_KEY],undefined);assert.equal(f.c.chatMetadata[PHONE_STATE_KEY].revision,0);
 assert.equal(f.c.chatMetadata[PHONE_STATE_KEY].contextKey,chatKey(f.c));assert.equal(f.counters().metadataSaves,1);
 const before=clone(f.c.chatMetadata);await f.service.init();assert.deepEqual(f.c.chatMetadata,before);
});

test('损坏存档拒绝，不拿空种子覆盖原始值',async()=>{
 const c=context();c.chatMetadata[PHONE_STATE_KEY]='坏存档';let saves=0;
 const storage=createPhoneMetadataStorage({getContext:()=>c,persistMetadata:async()=>saves++},c);
 await assert.rejects(storage.load(),code('PHONE_STORAGE_INVALID'));assert.equal(c.chatMetadata[PHONE_STATE_KEY],'坏存档');assert.equal(saves,0);
});

test('同 revision 的外部修改也构成冲突，较新原值保留',async()=>{
 const c=context();c.chatMetadata[PHONE_STATE_KEY]={revision:4,value:'原始'};
 const storage=createPhoneMetadataStorage({getContext:()=>c,persistMetadata:async()=>true},c);await storage.load();
 c.chatMetadata[PHONE_STATE_KEY]={revision:4,value:'另一个窗口'};
 await assert.rejects(storage.save({revision:5,value:'本窗口'},{expectedRevision:4}),code('PHONE_SAVE_CONFLICT'));
 assert.equal(c.chatMetadata[PHONE_STATE_KEY].value,'另一个窗口');
});

test('原生持久保存失败恢复当前内存原值，不声称原子CAS',async()=>{
 const c=context();c.chatMetadata[PHONE_STATE_KEY]={revision:2,value:'原值'};let writes=0;
 const storage=createPhoneMetadataStorage({getContext:()=>c,persistMetadata:async()=>{writes++;throw Error('模拟磁盘拒绝');}},c);await storage.load();
 await assert.rejects(storage.save({revision:3,value:'新值'},{expectedRevision:2}),/模拟磁盘拒绝/);
 assert.deepEqual(c.chatMetadata[PHONE_STATE_KEY],{revision:2,value:'原值'});
 await assert.rejects(storage.save({revision:3,value:'不得再次盲写'},{expectedRevision:2}),code('PHONE_STORAGE_UNCERTAIN'));
 await assert.rejects(storage.load(),code('PHONE_STORAGE_UNCERTAIN'));assert.equal(writes,1);
});

test('切换聊天后旧 storage 拒绝写入；新聊天没有收到旧值',async()=>{
 let c=context();const old=c;const storage=createPhoneMetadataStorage({getContext:()=>c,persistMetadata:async()=>true},c);await storage.load();c=context('chat-b');
 await assert.rejects(storage.save({revision:0,value:'旧会话'}),code('PHONE_CONTEXT_CHANGED'));assert.equal(c.chatMetadata[PHONE_STATE_KEY],undefined);assert.equal(old.chatMetadata[PHONE_STATE_KEY],undefined);
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

test('prepare 后历史变化阻止本次注入；停止保留待发内容',async()=>{
 const f=await fixture();await f.service.dispatch({kind:'message',threadId:'forum',text:'不能丢的消息'});await f.host.begin();f.c.chat[0].mes='前情已编辑';f.c.chat.push(user('user-2'));
 await assert.rejects(f.host.directions(),code('PHONE_HISTORY_CHANGED'));await f.host.stopped();assert.equal(f.service.getState().actions[0].status,'failed');assert.equal(getDoc(f.service.getState().suite,'forum').items.at(-1).text,'不能丢的消息');
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

test('候选接线包含实际双预设hook与延后候选归档、显式恢复、聊天iframe门禁',async()=>{
 const source=await readFile(new URL('../index.js',import.meta.url),'utf8');
 assert.equal((source.match(/getContractorMessages:turnDirections/g)??[]).length,2);
 assert.ok(source.includes('if(!delegated)await phoneTurn.finished({accepted})'));
 assert.ok(source.includes('await phoneTurn.finished({accepted:true});return result;'));
 assert.ok(source.includes('recoverPending:options=>phoneTurn.recoverPending(options)'));
 assert.ok(source.includes("url.searchParams.set('chat',phoneChatKey(context()))"));
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
  const rejected=f.service.getState().rejectedSources[source.sourceId];assert.equal(rejected.requestId,r.requestId);assert.ok(rejected.error.message);assert.equal(m.mes,original);
  assert.equal(f.service.getState().actions[0].status,'failed');assert.throws(()=>f.service.snapshot(source.sourceId),code('PHONE_SOURCE_REJECTED'));
  let seq=100;const fresh=createPhoneService({seed:seed(),contextKey:chatKey(f.c),storage:createPhoneMetadataStorage({getContext:()=>f.c,persistMetadata:async()=>true},f.c),now:()=>at,idFactory:()=>`retry-${++seq}`});await fresh.init();
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
 const f=await fixture(),r=await start(f),done=await finish(f,r),parentState=clone(f.c.chatMetadata[PHONE_STATE_KEY]),parentChat=clone(f.c.chat),parentKey=chatKey(f.c);
 let branch={...f.c,chatId:'chat-a - Branch #1',chat:clone(f.c.chat.slice(0,-1)),chatMetadata:{...clone(f.c.chatMetadata),main_chat:f.c.chatId,integrity:'native-branch-integrity'}};
 let saves=0;const storage=createPhoneMetadataStorage({getContext:()=>branch,persistMetadata:async()=>{saves++;return true;},allowNativeBranch:true},branch);
 const service=createPhoneService({seed:seed(),contextKey:chatKey(branch),storage,now:()=>at,idFactory:()=>`branch-next`});await service.init();
 assert.equal(saves,1);assert.equal(service.getState().contextKey,chatKey(branch));assert.equal(branch.chatMetadata[PHONE_STATE_KEY].contextKey,chatKey(branch));assert.notEqual(chatKey(branch),parentKey);
 assert.equal(getDoc(service.getState().suite,'forum').items.length,2);assert.deepEqual(service.getState().selectedSources,[]);assert.ok(service.snapshot(done.source.sourceId));
 assert.deepEqual(f.c.chatMetadata[PHONE_STATE_KEY],parentState);assert.deepEqual(f.c.chat,parentChat);
 const cold=createPhoneService({seed:seed(),contextKey:chatKey(branch),storage:createPhoneMetadataStorage({getContext:()=>branch,persistMetadata:async()=>{saves++;return true;},allowNativeBranch:true},branch)});await cold.init();assert.equal(saves,1);assert.deepEqual(cold.getState(),service.getState());
 const host=createPhoneTurnHost({getContext:()=>branch,phoneService:cold});assert.ok((await host.begin('normal')).requestId);await host.stopped();assert.deepEqual(f.c.chatMetadata[PHONE_STATE_KEY],parentState);
});

test('普通复制、错父会话、跨角色及未知在途分支不自动改归属',async()=>{
 const f=await fixture(),original=clone(f.c.chatMetadata[PHONE_STATE_KEY]);
 for(const change of [{},{main_chat:'另一聊天',integrity:'new'},{main_chat:f.c.chatId},{main_chat:f.c.chatId,integrity:'new',otherCharacter:true}]){
  const c={...f.c,characterId:change.otherCharacter?4:f.c.characterId,chatId:'new-chat',chatMetadata:{...clone(f.c.chatMetadata),...change}};
  const storage=createPhoneMetadataStorage({getContext:()=>c,persistMetadata:async()=>{throw Error('不可写');},allowNativeBranch:true},c);
  await assert.rejects(storage.load(),code('PHONE_CONTEXT_CHANGED'));assert.deepEqual(c.chatMetadata[PHONE_STATE_KEY],original);
 }
 await f.host.begin('normal');const pending=clone(f.c.chatMetadata[PHONE_STATE_KEY]),c={...f.c,chatId:'pending-branch',chatMetadata:{...clone(f.c.chatMetadata),main_chat:f.c.chatId,integrity:'new'}};
 const storage=createPhoneMetadataStorage({getContext:()=>c,persistMetadata:async()=>{throw Error('不可写');},allowNativeBranch:true},c);await assert.rejects(storage.load(),code('PHONE_BRANCH_PENDING'));assert.deepEqual(c.chatMetadata[PHONE_STATE_KEY],pending);
});

test('真实保存失败不误记为坏回复；存储恢复后仍接纳原来源',async()=>{
 const f=await fixture(),r=await start(f),m=assistant('save-failure',raw(r.requestId,[r.actionId]));f.c.chat.push(m);const save=f.storage.save;
 f.storage.save=async()=>{throw Error('模拟宿主持久化失败');};const result=await f.host.finished({accepted:true});assert.equal(result.failed,true);
 assert.deepEqual(f.service.getState().rejectedSources,{});assert.equal(f.service.getState().requests[r.requestId].status,'prepared');assert.equal(m.mes,raw(r.requestId,[r.actionId]));
 f.storage.save=save;await f.host.recoverPending({confirmedEnded:true});assert.equal(f.service.getState().actions[0].status,'received');assert.ok(f.service.snapshot(phoneSource(m).sourceId));
});

test('群聊嵌套分支按直接父名称接续，不借用同名其他组的手机',async()=>{
 let current={...context('group-parent'),characterId:null,groupId:'group-7'},saves=0;
 const create=()=>createPhoneService({seed:seed(),contextKey:chatKey(current),storage:createPhoneMetadataStorage({getContext:()=>current,persistMetadata:async()=>{saves++;return true;},allowNativeBranch:true},current)});
 const parent=create();await parent.init();const parentState=clone(current.chatMetadata[PHONE_STATE_KEY]);
 current={...current,chatId:'group-branch-1',chatMetadata:{...clone(current.chatMetadata),main_chat:'group-parent',integrity:'one'}};await create().init();
 current={...current,chatId:'group-branch-2',chatMetadata:{...clone(current.chatMetadata),main_chat:'group-branch-1',integrity:'two'}};const second=create();await second.init();
 assert.equal(saves,3);assert.equal(second.getState().contextKey,chatKey(current));assert.equal(parent.getState().contextKey,parentState.contextKey);
 current={...current,groupId:'group-8',chatId:'other-group-branch',chatMetadata:{...clone(current.chatMetadata),main_chat:'group-branch-2',integrity:'three'}};await assert.rejects(create().init(),code('PHONE_CONTEXT_CHANGED'));assert.equal(saves,3);
});
