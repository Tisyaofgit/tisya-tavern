import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhoneService,importPhone,phoneSnapshot,reconcilePhone} from '../phone-core.mjs';
import {parsePhoneWorld,parsePhoneCharacter} from '../phone-life-config.mjs';

const wrap=(tag,value)=>`<${tag}>${JSON.stringify(value)}</${tag}>`;
const seed={accounts:{me:{name:'我',role:'self'},system:{name:'通知'}},documents:[{id:'inbox',kind:'inbox',title:'通知',visibility:'private',audience:['me'],author:'system',at:null,items:[]}]};
function profile(w={},c={}){return {
  binding:{world:{book:'世界资料',uid:1},character:{book:'人物资料',uid:2},persona:'avatar-a'},
  world:parsePhoneWorld(wrap('手机世界',{格式:'缇斯亚手机世界/1',世界编号:'test-world',名称:'有来源的世界',应用:['微博','钱包','商城','外卖','相册','音乐','地图','日历'],时间:{起点:'2033-02-09T23:30:00+08:00'},结算归属:'手机账本',货币:{名称:'银元',符号:'¤'},金融:{商城配送费:0,外卖配送费:0},地点:[{编号:'home',名称:'家',横坐标:0,纵坐标:0,已知:true}],商品:[{编号:'book',名称:'纸书',单价:100,库存:20,类别:'实物',地点编号:'home'}],...w})),
  character:parsePhoneCharacter(wrap('手机初态',{格式:'缇斯亚手机角色/1',角色编号:'person-a',姓名:'本人',当前位置:'home',钱包:{账户:[{编号:'cash',名称:'零钱',余额:100000}],默认付款账户:'cash',默认收支账户:'cash'},联系人:[{编号:'person-b',名称:'对方'}],账号:[{编号:'main',名称:'主账号',用户名:'main',本人:true},{编号:'other',名称:'对方',用户名:'other',本人:false,人物编号:'person-b'}],...c})),
};}
async function setup(){let saved=null,fail=false,i=0;const service=createPhoneService({seed,contextKey:'life-chat',now:()=> '2026-11-09T15:00:00Z',idFactory:()=>`service-${++i}`,storage:{load:async()=>saved,save:async s=>{if(fail)throw Error('simulated disk failure');saved=structuredClone(s);}}});await service.init();return {service,saved:()=>saved,setFail:v=>{fail=v;}};}
const dispatch=(service,id,type,data={})=>service.dispatchLife({id,type,...data},{expectedRevision:service.getState().revision,bindingKey:service.readLife()?.bindingKey});
const cash=s=>s.wallet.accounts[0].balance;
async function prepare(service,id='r1'){return service.prepareTurn({chatKey:'life-chat',requestId:id,anchorUid:`user-${id}`});}
const raw=(requestId,acks,lifeUpdates=[],markers=[])=>`<extra><phone>${JSON.stringify({requestId,acks,blocks:[],lifeUpdates,markers})}</phone></extra>`;
async function accept(service,{requestId='r1',sourceId='uid-a:candidate-a',updates=[],markers=[]}={}){const request=service.getState().requests[requestId];const source={sourceId,uid:sourceId.split(':')[0],candidate:sourceId.split(':')[1],requestId,raw:raw(requestId,request.actionIds,updates,markers),chatKey:'life-chat'};await service.acceptTurn(source);return source;}

test('old phone archive stays without life until explicit profile initialization',async()=>{
  const {service}=await setup();assert.equal(service.readLife(),null);assert.equal('life' in JSON.parse(service.export()),false);
  const domain=await service.initLife(profile());assert.equal(cash(domain.state),100000);assert.equal(domain.state.social.posts.length,0);
  assert.equal(domain.state.identity.name,'本人');assert.equal(importPhone(service.export()).life.bindingKey,domain.bindingKey);
});

test('real payment is one serialized commit, exact-id replay is free, stale caller cannot overwrite it',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'cart-1','cart.add',{productId:'book'});
  const oldRevision=service.getState().revision,action={id:'pay-1',type:'order.checkout',kind:'shop',payment:'balance',placeId:'home'};
  const first=await service.dispatchLife(action,{expectedRevision:oldRevision});assert.equal(cash(first.state),99900);assert.equal(first.state.inventory.length,0);
  const replay=await service.dispatchLife(action,{expectedRevision:oldRevision});assert.equal(replay.result.replayed,true);assert.equal(replay.revision,first.revision);
  await assert.rejects(service.dispatchLife({id:'stale-1',type:'cart.add',productId:'book'},{expectedRevision:oldRevision}),/进度已变化/);
  assert.equal(cash(service.readLife().state),99900);assert.equal(service.getState().actions.filter(a=>a.kind==='life').length,2);
});

test('persistence failure keeps financial state, journal, pending list and original archive intact',async()=>{
  const f=await setup();await f.service.initLife(profile());await dispatch(f.service,'cart-f','cart.add',{productId:'book'});
  const before=f.service.export(),saved=JSON.stringify(f.saved());f.setFail(true);
  await assert.rejects(dispatch(f.service,'pay-f','order.checkout',{kind:'shop',payment:'balance',placeId:'home'}),/disk failure/);
  assert.equal(f.service.export(),before);assert.equal(JSON.stringify(f.saved()),saved);
});

test('role/world binding switch refuses reseeding; style and application changes preserve all transactions',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'transfer-1','wallet.transfer',{to:'person-b',amount:50});
  const original=service.readLife(),changed=profile({画风:{背景:'#123456',强调:'#abcdef'},应用:['钱包','相册']});
  await service.initLife(changed);assert.equal(cash(service.readLife().state),99950);assert.equal(service.readLife().world.theme.background,'#123456');
  assert.deepEqual(service.readLife().initialization,original.initialization);
  await assert.rejects(dispatch(service,'disabled','social.publish',{text:'不可发'}),/未开放/);
  const other=profile();other.binding.persona='avatar-b';const before=service.export();await assert.rejects(service.initLife(other),/切回原世界/);assert.equal(service.export(),before);
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
  await service.prepareTurn({chatKey:'life-chat',replayRequestId:'r1'});await accept(service,{sourceId:'uid-a:candidate-b',updates:[{type:'world.advance',minutes:120}]});
  assert.equal(cash(service.readLife().state),99900);assert.equal(service.readLife().state.clock.totalMinutes,120);
  assert.equal(service.getState().actions.find(a=>a.id==='abandoned-transfer').status,'detached');assert.deepEqual(service.snapshot('uid-a:candidate-a'),old);
  assert.equal(importPhone(service.export()).life.state.clock.totalMinutes,120);
});

test('native history truncation restores life before removed reply while preserving its snapshot',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'before-history','wallet.transfer',{to:'person-b',amount:100});await prepare(service);const first=await accept(service,{updates:[{type:'world.advance',minutes:60}]});
  await dispatch(service,'after-history','wallet.transfer',{to:'person-b',amount:500});await prepare(service,'r2');await accept(service,{requestId:'r2',sourceId:'uid-b:candidate-a',updates:[{type:'world.advance',minutes:120}]});
  const oldSecond=service.snapshot('uid-b:candidate-a');await service.reconcile({chatKey:'life-chat',sources:[first]});
  // The later local action precedes the removed assistant source and remains at
  // that user's captured boundary; model consequences from the removed reply do not.
  assert.equal(service.readLife().state.clock.totalMinutes,60);assert.equal(cash(service.readLife().state),99400);
  assert.deepEqual(service.snapshot('uid-b:candidate-a'),oldSecond);assert.equal(importPhone(service.export()).life.state.clock.totalMinutes,60);
});

test('living weibo has one editable entity and an explicitly read-only suite projection',async()=>{
  const {service}=await setup();await service.initLife(profile());await dispatch(service,'post-user','social.publish',{text:'同一个帖子',visibility:'public'});
  const post=service.readLife().state.social.posts[0],document=Object.values(service.getState().suite.documents).find(d=>d.meta?.lifeProjection?.entityId===post.id);
  assert.ok(document);assert.equal(document.text,post.text);assert.equal(document.at,'2033-02-09T15:30:00.000Z');
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
  await dispatch(service,'own-private','social.publish',{text:'私密',visibility:'private'});const secret=service.readLife().state.social.posts[0].id;await prepare(service,'r2');const before=service.export();
  await assert.rejects(accept(service,{requestId:'r2',sourceId:'uid-b:candidate-a',updates:[{type:'social.npc.comment',postId:secret,authorId:'other',text:'不该知道'}]}),/权限|私密|不可|不能|无权/);assert.equal(service.export(),before);
});

test('archive import performs revision CAS after media staging and rejects life journal tampering',async()=>{
  const {service}=await setup();await service.initLife(profile());const oldArchive=service.export(),revision=service.getState().revision;
  await dispatch(service,'after-backup','wallet.transfer',{to:'person-b',amount:100});const before=service.export();
  await assert.rejects(service.import(oldArchive,{expectedRevision:revision}),/导入期间已有新操作/);assert.equal(service.export(),before);
  const tampered=JSON.parse(before);tampered.life.state.wallet.accounts[0].balance+=1;await assert.rejects(service.import(tampered),/不一致|守恒|无法读取/);assert.equal(service.export(),before);
});
