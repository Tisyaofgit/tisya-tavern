import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhoneService,importPhone,phoneSnapshot,reconcilePhone} from '../phone-core.mjs';
import {PHONE_TURN_KEY,phoneSource} from '../phone-turn-host.js';
import {chatKey,NS} from '../engine/controller.mjs';
import {fundedPhoneProfile} from './fixtures/phone-current.mjs';
import {currentPhoneHost,matrixMemoryStorage} from './fixtures/phone-host-current.mjs';
import {readPhoneDatabaseProfile} from '../engine/phone-database.mjs';

const seed={accounts:{me:{name:'我',role:'self'},system:{name:'通知'}},documents:[{id:'inbox',kind:'inbox',title:'通知',visibility:'private',audience:['me'],author:'system',at:null,items:[]}]};
function profile(world={},character={}){return fundedPhoneProfile({worldId:'test-world',world:{name:'有来源的世界',...world},character:{accounts:[{id:'main',name:'主账号',handle:'main',owned:true},{id:'other',name:'对方',handle:'other',owned:false,personId:'person-b'}],...character}});}
async function setup(){let fail=false,i=0;const context={chatId:'life-chat',characterId:0,groupId:null,chat:[],chatMetadata:{},extensionSettings:{},saveChat:async()=>true},disk=matrixMemoryStorage({onWrite:async()=>{if(fail)throw Error('simulated disk failure');}}),database=await currentPhoneHost({context,storage:disk,profile:profile()}),service=createPhoneService({seed,contextKey:chatKey(context),now:()=> '2026-11-09T15:00:00Z',idFactory:()=>`service-${++i}`,storage:database.phoneStorage});await service.init();return {service,database,context,disk,saved:()=>database.snapshot(),setFail:v=>{fail=v;}};}
const dispatch=async(service,id,type,data={})=>{if(type==='order.checkout'&&!data.quoteId){const quote=await service.dispatchLife({id:id+':quote',type:'order.quote',...data},{expectedRevision:service.getState().revision,bindingKey:service.readLife()?.bindingKey});data={kind:data.kind,quoteId:quote.result.quoteId};}return service.dispatchLife({id,type,...data},{expectedRevision:service.getState().revision,bindingKey:service.readLife()?.bindingKey});};
const cash=s=>s.wallet.accounts[0].balance;
const frozenView=s=>({frame:s.frame,documents:s.suite.documents,accounts:s.suite.accounts,markers:s.markers,life:s.life,lifeBoundary:s.lifeBoundary});
async function prepare(service,id='r1'){return service.prepareTurn({chatKey:service.getState().contextKey,requestId:id,anchorUid:`user-${id}`});}
const raw=(requestId,acks,lifeUpdates=[],markers=[])=>`<extra><phone>${JSON.stringify({requestId,acks,blocks:[],lifeUpdates,markers})}</phone></extra>`;
async function accept(service,{requestId='r1',sourceId='uid-a:candidate-a',updates=[],markers=[]}={}){const request=service.getState().requests[requestId];const source={sourceId,uid:sourceId.split(':')[0],candidate:sourceId.split(':')[1],requestId,raw:raw(requestId,request.actionIds,updates,markers),chatKey:service.getState().contextKey};await service.acceptTurn(source);return source;}

test('current database keeps life uninitialized until an explicit normalized profile is applied',async()=>{
  const {service}=await setup();assert.equal(service.readLife(),null);assert.equal('life' in JSON.parse(service.export()),false);
  const domain=await service.initLife(profile());assert.equal(cash(domain.state),100000);assert.equal(domain.state.social.posts.length,0);
  assert.equal(domain.state.identity.name,'本人');assert.equal(importPhone(service.export()).life.bindingKey,domain.bindingKey);
});

test('current media origin follows verified native branches and cold reopen without metadata copies',async()=>{
    const parent={chatId:'life-parent',characterId:7,groupId:null,chatMetadata:{},chat:[]},key=chatKey(parent),disk=matrixMemoryStorage();
    const make=async c=>{const db=await currentPhoneHost({context:c,storage:disk,profile:profile()}),service=createPhoneService({seed,contextKey:chatKey(c),storage:db.phoneStorage});await service.init();return service;};
    const source=await make(parent);await source.initLife(profile());
    await source.dispatchLife({id:'media-song',type:'music.song.add',song:{id:'song',title:'录音',artist:'本人',audioId:'original-audio'}},{expectedRevision:source.getState().revision});
    await source.prepareTurn({chatKey:key,requestId:'media-r1',anchorUid:'media-user'});
    const message={is_user:false,mes:raw('media-r1',['media-song']),extra:{tisya_engine:{uid:'media-assistant'}}},origin=phoneSource(message);
    await source.acceptTurn({chatKey:key,requestId:'media-r1',...origin});
    parent.chat.push({is_user:true,mes:'继续',extra:{tisya_engine:{uid:'media-user'},[PHONE_TURN_KEY]:{requests:[{requestId:'media-r1'}]}}},message);
    const copied=structuredClone(parent.chatMetadata),parentBundle=await disk.get(parent.chatMetadata[NS].chat_uid);
    const child={...parent,chatId:'life-child',chat:structuredClone(parent.chat),chatMetadata:{...copied,main_chat:parent.chatId,integrity:'native-parent-verified'}};
    const adopted=await make(child);assert.equal(adopted.getState().contextKey,chatKey(child));assert.equal(adopted.readLife().mediaOriginContextKey,key);assert.equal(adopted.snapshot(origin.sourceId).life.mediaOriginContextKey,key);
    assert.equal(adopted.getState().requests['media-r1'].lifeSnapshot.life.mediaOriginContextKey,key);assert.equal(adopted.readLife().state.media.songs[0].audioId,'original-audio');
    const nested={...child,chatId:'life-grandchild',chatMetadata:{...structuredClone(child.chatMetadata),main_chat:child.chatId,integrity:'native-child-verified'}};const grandchild=await make(nested);assert.equal(grandchild.readLife().mediaOriginContextKey,key);
    const cold=await make(child);assert.equal(cold.readLife().mediaOriginContextKey,key);assert.equal(parent.chatMetadata['缇斯亚虚拟手机'],undefined);assert.deepEqual(await disk.get(parent.chatMetadata[NS].chat_uid),parentBundle);
});

test('ordinary archive import cannot borrow another chat media namespace',async()=>{
  const {service}=await setup();await service.initLife(profile());const before=service.export(),altered=JSON.parse(before);
  const change=value=>{if(!value||typeof value!=='object')return;if(value.format==='tisya.phone-life/1')value.mediaOriginContextKey='another-chat';for(const v of Object.values(value))change(v);};change(altered);
  assert.doesNotThrow(()=>importPhone(altered));
  await assert.rejects(service.import(altered),/媒体原件属于另一聊天来源/);assert.equal(service.export(),before);
  const empty=await setup();await assert.rejects(empty.service.import(altered),/媒体原件属于另一聊天来源/);assert.equal(empty.service.readLife(),null);
});

test('real payment is one serialized commit, exact-id replay is free, stale caller cannot overwrite it',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'cart-1','cart.add',{productId:'book'});
  const quote=await dispatch(service,'quote-1','order.quote',{kind:'shop',payment:'balance',placeId:'home'}),oldRevision=service.getState().revision,action={id:'pay-1',type:'order.checkout',kind:'shop',quoteId:quote.result.quoteId};
  const first=await service.dispatchLife(action,{expectedRevision:oldRevision});assert.equal(cash(first.state),99900);assert.equal(first.state.inventory.length,0);
  const replay=await service.dispatchLife(action,{expectedRevision:oldRevision});assert.equal(replay.result.replayed,true);assert.equal(replay.revision,first.revision);
  await assert.rejects(service.dispatchLife({id:'stale-1',type:'cart.add',productId:'book'},{expectedRevision:oldRevision}),/进度已变化/);
  assert.equal(cash(service.readLife().state),99900);assert.equal(service.getState().actions.filter(a=>a.kind==='life').length,3);
});

test('persistence failure keeps financial state, journal, pending list and original archive intact',async()=>{
  const f=await setup();await f.service.initLife(profile());await dispatch(f.service,'cart-f','cart.add',{productId:'book'});
  const before=f.service.export(),saved=JSON.stringify(await f.saved());f.setFail(true);
  await assert.rejects(dispatch(f.service,'pay-f','order.checkout',{kind:'shop',payment:'balance',placeId:'home'}),/disk failure/);
  assert.equal(f.service.export(),before);assert.equal(JSON.stringify(await f.saved()),saved);
});

test('role/world binding switch refuses reseeding; style and application changes preserve all transactions',async()=>{
  const {service,database}=await setup();await service.initLife(profile());await dispatch(service,'transfer-1','wallet.transfer',{to:'person-b',amount:50});
  const original=service.readLife(),before=await database.snapshot(),config=Object.entries(before.state.tables.X_PHONE_WORLD_CONFIG).find(([,row])=>row.values.world_ref==='test-world')[0];
  await database.host.commitDatabase({contextKey:before.contextKey,expectedRevision:before.revision,operationId:'phone-style-form-edit',changes:[{tableId:'T_STATIC_WORLDS',recordId:'test-world',values:{name:'世界新显示名'}},{tableId:'X_PHONE_WORLD_CONFIG',recordId:config,values:{theme_background:'#123456',theme_accent:'#abcdef',apps:['wallet','album'],appNames:{wallet:'新钱包名称'}}}]});await service.refresh();assert.equal(cash(service.readLife().state),99950);assert.equal(service.readLife().world.theme.background,'#123456');
  assert.deepEqual(service.readLife().initialization,original.initialization);
  assert.equal(service.readLife().world.name,'世界新显示名');assert.equal(service.readLife().bindingKey,original.bindingKey);assert.equal(service.readLife().state.config.appNames.wallet,'新钱包名称');
  const restored=importPhone(service.export());assert.equal(restored.life.world.name,'世界新显示名');assert.deepEqual(restored.life.initialization,original.initialization);
  const current=readPhoneDatabaseProfile((await database.snapshot()).state,{worldId:'test-world',entityId:'person-a'});await service.initLife(current);assert.equal(cash(service.readLife().state),99950);
  await assert.rejects(service.initLife({database:true,worldId:'other-world',entityId:'person-a'}),/所选表单世界或角色/);
  await assert.rejects(dispatch(service,'disabled','social.publish',{text:'不可发'}),/未开放/);
  const beforeSwitch=service.export();await assert.rejects(service.initLife({database:true,worldId:'test-world',entityId:'other-person'}),/所选表单世界或角色/);assert.equal(service.export(),beforeSwitch);
});

test('prepared native turn freezes life mutations and captures actual already-paid facts',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'transfer-2','wallet.transfer',{to:'person-b',amount:50});
  const turn=await prepare(service);const context=JSON.parse(turn.messages[1].content);
  assert.equal(context.actions[0].alreadyApplied,true);assert.equal(context.life.wallet.accounts[0].balance,99950);
  await assert.rejects(dispatch(service,'later','wallet.transfer',{to:'person-b',amount:50}),/正在收发/);
});

test('next-turn cannot pay or borrow for user, failed batch never consumes pending actions',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'cart-bad','cart.add',{productId:'book'});await prepare(service);
  const before=service.export();await assert.rejects(accept(service,{updates:[{type:'wallet.transfer',amount:10,to:'person-b'}]}),/不能代用户/);
  assert.equal(service.export(),before);assert.equal(service.getState().actions[0].status,'sent');
});

test('next-turn resolves invited person contacts without requiring a social account',async()=>{
  const {service}=await setup();await service.initLife(profile({}, {accounts:[{id:'main',name:'主账号',handle:'main',owned:true}]}));
  await dispatch(service,'calendar-contact','calendar.add',{title:'约见对方',day:10,minute:600,placeId:'home',participantId:'person-b'});
  const turn=await prepare(service),life=JSON.parse(turn.messages[1].content).life;
  assert.equal(life.calendar[0].participantId,'person-b');assert.deepEqual(life.contacts,[{id:'person-b',name:'对方'}]);
  assert.equal(life.social.accounts.some(a=>a.personId==='person-b'),false);
  assert.deepEqual(life.world,{id:'test-world',name:'有来源的世界',currency:{name:'银元',symbol:'¤',minorUnits:2}});assert.equal('catalog' in life.world,false);
});

test('delivery and story-time feedback freeze with original source; later changes cannot rewrite it',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'cart-del','cart.add',{productId:'book'});await dispatch(service,'pay-del','order.checkout',{kind:'shop',payment:'balance',placeId:'home'});
  const orderId=service.readLife().state.commerce.orders[0].id;await prepare(service);await accept(service,{updates:[{type:'order.advance',orderId},{type:'world.advance',minutes:60}]});
  const frozen=service.snapshot('uid-a:candidate-a');assert.equal(frozen.life.state.commerce.orders[0].status,'shipped');assert.equal(frozen.life.state.clock.totalMinutes,60);
  await dispatch(service,'after-transfer','wallet.transfer',{to:'person-b',amount:50});
  assert.equal(cash(service.readLife().state),99850);assert.equal(cash(service.snapshot('uid-a:candidate-a').life.state),99900);
  assert.deepEqual(service.snapshot('uid-a:candidate-a'),frozen);assert.equal(importPhone(service.export()).life.state.clock.totalMinutes,60);
});

test('reroll restores captured life boundary, detaches later local transactions, and keeps old frozen result',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'before-turn','wallet.transfer',{to:'person-b',amount:100});await prepare(service);await accept(service,{updates:[{type:'world.advance',minutes:60}]});
  const old=service.snapshot('uid-a:candidate-a');await dispatch(service,'abandoned-transfer','wallet.transfer',{to:'person-b',amount:500});
  await service.prepareTurn({chatKey:service.getState().contextKey,replayRequestId:'r1'});await accept(service,{sourceId:'uid-a:candidate-b',updates:[{type:'world.advance',minutes:120}]});
  assert.equal(cash(service.readLife().state),99900);assert.equal(service.readLife().state.clock.totalMinutes,120);
  assert.equal(service.getState().actions.find(a=>a.id==='abandoned-transfer').status,'detached');assert.deepEqual(frozenView(service.snapshot('uid-a:candidate-a')),frozenView(old));
  assert.equal(importPhone(service.export()).life.state.clock.totalMinutes,120);
});

test('native history truncation restores life before removed reply while preserving its snapshot',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'before-history','wallet.transfer',{to:'person-b',amount:100});await prepare(service);const first=await accept(service,{updates:[{type:'world.advance',minutes:60}]});
  await dispatch(service,'after-history','wallet.transfer',{to:'person-b',amount:500});await prepare(service,'r2');await accept(service,{requestId:'r2',sourceId:'uid-b:candidate-a',updates:[{type:'world.advance',minutes:120}]});
  const oldSecond=service.snapshot('uid-b:candidate-a');await service.reconcile({chatKey:service.getState().contextKey,sources:[first]});
  // The later local action precedes the removed assistant source and remains at
  // that user's captured boundary; model consequences from the removed reply do not.
  assert.equal(service.readLife().state.clock.totalMinutes,60);assert.equal(cash(service.readLife().state),99400);
  assert.deepEqual(frozenView(service.snapshot('uid-b:candidate-a')),frozenView(oldSecond));assert.equal(importPhone(service.export()).life.state.clock.totalMinutes,60);
});

test('living weibo has one editable entity and an explicitly read-only suite projection',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'post-user','social.publish',{text:'同一个帖子',visibility:'public'});
  const post=service.readLife().state.social.posts[0],document=Object.values(service.getState().suite.documents).find(d=>d.meta?.lifeProjection?.entityId===post.id);
  assert.ok(document);assert.equal(document.text,post.text);assert.equal(document.at,null);assert.deepEqual(document.meta.lifeStoryTime,post.createdAt);assert.equal(service.readLife().state.clock.year,2033);
  assert.deepEqual(service.lifeRouteForDocument(document.id),{appId:'weibo',detail:post.id,bindingKey:service.readLife().bindingKey});
  await assert.rejects(service.dispatch({kind:'message',threadId:document.id,text:'第二份编辑'}),/只读正文投影/);
  await assert.rejects(service.applyLocal({blocks:[{type:'weibo',thread:document.id,text:'另改'}]}),/只读正文投影/);
  assert.equal(service.readLife().state.social.posts.length,1);
});

test('accepted NPC replies populate the same social domain and its frozen projection; impersonation/private reads fail',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'own-public','social.publish',{text:'公开',visibility:'public'});const own=service.readLife().state.social.posts[0].id;await prepare(service);
  await accept(service,{updates:[{type:'social.npc.comment',postId:own,authorId:'other',text:'看到了。'},{type:'social.npc.post',postId:'npc-new',authorId:'other',text:'一条新消息'}]});
  assert.equal(service.readLife().state.social.comments.length,1);assert.equal(service.readLife().state.social.posts.length,2);
  assert.ok(Object.values(service.snapshot('uid-a:candidate-a').suite.documents).some(d=>d.meta?.lifeProjection?.entityId==='npc-new'));
  const privateResult=await dispatch(service,'own-private','social.publish',{text:'私密',visibility:'private'});const secret=service.readLife().state.social.posts[0].id;assert.equal(secret,privateResult.result.postId);assert.equal(service.readLife().state.social.posts[0].visibility,'private');await prepare(service,'r2');const before=service.export();
  await assert.rejects(accept(service,{requestId:'r2',sourceId:'uid-b:candidate-a',updates:[{type:'social.npc.comment',postId:secret,authorId:'other',text:'不该知道'}]}),/读取.*依据|权限|私密|不可|不能|无权/);assert.equal(service.export(),before);
});

test('archive import performs revision CAS after media staging and rejects life journal tampering',async()=>{
  const {service}=await setup();await service.initLife(profile());const oldArchive=service.export(),revision=service.getState().revision;
  await dispatch(service,'after-backup','wallet.transfer',{to:'person-b',amount:100});const before=service.export();
  await assert.rejects(service.import(oldArchive,{expectedRevision:revision}),/导入期间已有新操作/);assert.equal(service.export(),before);
  const tampered=JSON.parse(before);tampered.life.state.wallet.accounts[0].balance+=1;await assert.rejects(service.import(tampered),/不一致|守恒|无法读取/);assert.equal(service.export(),before);
});
