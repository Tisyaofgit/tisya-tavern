import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {indexedDB} from 'fake-indexeddb';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneMetadataStorage,PHONE_STATE_KEY} from '../phone-turn-host.js';
import {chatKey} from '../engine/controller.mjs';
import {bootPhone} from '../phone-app.mjs';
import {parsePhoneWorld,parsePhoneCharacter,validatePhoneLife} from '../phone-life-config.mjs';

const wrap=(tag,value)=>`<${tag}>${JSON.stringify(value)}</${tag}>`;
const rawWorld={格式:'缇斯亚手机世界/1',世界编号:'world-1',名称:'青鸟之城',应用:['weibo','wallet','shop','food','album','music','map','calendar'],应用名称:{wallet:'青鸟银行',weibo:'鸟鸣'},画风:{背景:'#edf5ef',面板:'#fff',文字:'#234',强调:'#328f78',圆角:16},时间:{起点:'2033-04-08T15:30:00+08:00'},结算归属:'手机账本',货币:{名称:'云币',符号:'¤'},金融:{贷款:{年利率基点:400,期数:[2,4],每期天数:45,每年计息期数:8,最低本金:10000,最高本金:1000000},理财:[{编号:'fund-1',名称:'城市储蓄',年利率基点:120,说明:'故事内计划'}],商城配送费:137,外卖配送费:211},交通:{步行速度:5},地点:[{编号:'house',名称:'青鸟公寓',横坐标:0,纵坐标:0,已知:true},{编号:'garden',名称:'天空花园',横坐标:15,纵坐标:0,已知:true}],商品:[{编号:'novel',名称:'云间手札',单价:2300,库存:3,类别:'实物',地点编号:'house'},{编号:'noodle',名称:'热汤面',单价:1600,库存:9,类别:'食品',地点编号:'house'}]};
const rawCharacter={格式:'缇斯亚手机角色/1',角色编号:'person-1',姓名:'阿青',账号:[{编号:'main',名称:'青鸟',用户名:'bluebird',本人:true},{编号:'friend',名称:'朋友',用户名:'friend',本人:false,人物编号:'person-2'}],钱包:{账户:[{编号:'cash',名称:'零钱',余额:100000},{编号:'savings',名称:'青鸟银行卡',余额:900000}],默认付款账户:'cash',默认收支账户:'savings'},联系人:[{编号:'person-2',名称:'朋友'}],微博:[{编号:'post-1',作者:'friend',正文:'今天在天空花园。',可见范围:'公开',时间:'2033-04-08T14:00:00+08:00'}],当前位置:'house'};
const profile=(w={},c={})=>({world:parsePhoneWorld(wrap('手机世界',{...rawWorld,...w})),character:parsePhoneCharacter(wrap('手机初态',{...rawCharacter,...c})),binding:{world:{book:'青鸟世界',uid:1},character:{book:'基点书',uid:2},carrier:{kind:'character',id:'avatar.png'},persona:'user.png'}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture({world={},character={},appId='home',initialize=true,slow=false}={}){
 let context={chatId:'life-dom',characterId:0,groupId:null,chatMetadata:{},chat:[]},selection='profile-1',app,saves=0,serial=0;
 const original=context,key=chatKey(context),win=new Window({url:'http://localhost/phone.html?chat='+encodeURIComponent(key)+'&app='+appId,settings:{disableIframePageLoading:true}}),doc=win.document;
 doc.body.innerHTML='<div id="phone-root" style="height:800px"></div>';Object.defineProperty(win,'indexedDB',{value:indexedDB,configurable:true});
 const storage=createPhoneMetadataStorage({getContext:()=>context,persistMetadata:async()=>{saves++;if(slow)await wait(25);return true;}},context);
 const service=createPhoneService({seed:{accounts:{me:{name:'我'}},documents:[]},contextKey:key,storage,idFactory:()=>`life-dom-${++serial}`,onChange:()=>app?.refresh()});await service.init();if(initialize)await service.initLife(profile(world,character));
 const host={contextKey:()=>chatKey(context),selectionKey:()=>selection,service:async()=>service,open:()=>{},openIdentity:()=>{}};win.Tisya={phone:host};
 app=await bootPhone({win,doc});const root=app.getRoot?.();
 const settle=async()=>{await wait(5);await app.settled?.();await wait(5);};
 const click=async selector=>{const target=root.querySelector(selector);assert.ok(target,selector);target.click();await settle();};
 const input=(selector,value)=>{const target=root.querySelector(selector);assert.ok(target,selector);target.value=value;target.dispatchEvent(new win.Event('input',{bubbles:true}));return target;};
 const submit=async selector=>{root.querySelector(selector).dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await settle();};
 return {win,doc,root,app,service,original,host,settle,click,input,submit,get saves(){return saves;},setSelection:value=>{selection=value;},switchChat:()=>{context={...context,chatId:'other',chatMetadata:{}};},close:()=>{app.dispose();win.close();}};
}

test('real phone boot mounts configured life apps and no preview identities',async()=>{
 const f=await fixture({world:{应用:['wallet','album'],应用名称:{wallet:'青鸟银行'}}});
 assert.equal(f.root.querySelectorAll('.home-apps button').length,2);assert.match(f.root.querySelector('.home-apps').textContent,/青鸟银行/);assert.doesNotMatch(f.root.textContent,/余舟|林间|青禾/);assert.equal(f.root.querySelector('.phone').style.getPropertyValue('--accent'),'#328f78');
 assert.throws(()=>f.app.navigate({app:'shop'}),/没有启用/);assert.equal(f.win.localStorage.length,0);f.close();
});
test('host transfer form writes once into actual chat metadata and survives service reload',async()=>{
 const f=await fixture({appId:'wallet'});await f.app.handle('nav',{app:'wallet',tab:'transfer'});
 assert.match(f.root.querySelector('[name="to"]').textContent,/朋友/);assert.doesNotMatch(f.root.textContent,/演示联系人|余舟/);
 f.input('[name="amount"]','12.34');f.input('[name="to"]','person-2');await f.submit('[data-action="wallet.transfer"]');
 assert.equal(f.service.readLife().state.wallet.accounts.find(a=>a.id==='cash').balance,98766);assert.equal(f.original.chatMetadata[PHONE_STATE_KEY].life.state.wallet.ledger.length,1);assert.ok(f.saves>=3);
 const restored=createPhoneService({seed:{accounts:{me:{name:'我'}},documents:[]},contextKey:chatKey(f.original),storage:{load:async()=>f.original.chatMetadata[PHONE_STATE_KEY],save:async()=>true}});await restored.init();assert.equal(restored.readLife().state.wallet.accounts[0].balance,98766);f.close();
});
test('commerce checkout uses configured fee and hides model-owned logistics controls',async()=>{
 const f=await fixture({appId:'shop'});await f.app.handle('cart.add',{productId:'novel',qty:1});await f.app.handle('nav',{app:'shop',tab:'cart'});
 assert.match(f.root.querySelector('#screen').textContent,/1\.37/);assert.match(f.root.querySelector('#screen').textContent,/云币|¤/);await f.submit('[data-action="order.quote"]');assert.equal(f.service.readLife().state.commerce.orders.length,0);assert.equal(f.service.readLife().state.wallet.accounts[0].balance,100000);await f.click('[data-action="order.checkout"]');
 const o=f.service.readLife().state.commerce.orders[0];assert.equal(o.total,2437);assert.equal(o.deliveryFee,137);assert.equal(f.service.readLife().state.wallet.accounts[0].balance,97563);
 await f.app.handle('nav',{app:'shop',tab:'order',detail:o.id});assert.equal(f.root.querySelector('[data-action="order.advance"]'),null);assert.match(f.root.textContent,/下一轮剧情/);await assert.rejects(()=>f.app.dispatch({type:'order.advance',orderId:o.id}),/实际回执/);f.close();
});
test('loan quote and consent use world APR, terms and selected funding account',async()=>{
 const f=await fixture({appId:'wallet'});await f.app.handle('nav',{app:'wallet',tab:'loan'});assert.match(f.root.textContent,/4%/);assert.equal(f.root.querySelector('[name="loanMonths"]').options.length,2);
 f.input('[name="loanAmount"]','200');f.input('[name="loanMonths"]','2');await f.submit('form[data-action="ui"]');assert.equal(f.service.readLife().state.wallet.loans.length,0);assert.match(f.root.textContent,/45 个故事日/);
 await f.click('[data-action="wallet.loan.borrow"]');assert.equal(f.service.readLife().state.wallet.loans.length,1);assert.equal(f.service.readLife().state.wallet.accounts.find(a=>a.id==='savings').balance,920000);f.close();
});
test('unconfigured values stay unknown and accountless personal media remains usable',async()=>{
 const f=await fixture({character:{账号:[],微博:[],钱包:{账户:[{编号:'unknown',名称:'待确认',余额:null}]}},world:{时间:{起点:null},货币:null,金融:{},交通:null},appId:'wallet'});
 assert.match(f.root.textContent,/未配置/);assert.doesNotMatch(f.root.querySelector('.u-hero-amount').textContent,/0\.00/);await f.app.handle('nav',{app:'album'});assert.match(f.root.textContent,/相册/);await f.app.handle('nav',{app:'music'});assert.match(f.root.textContent,/音乐/);await f.app.handle('nav',{app:'calendar'});assert.match(f.root.textContent,/尚未提供日历起点/);assert.equal(f.service.readLife().state.social.activeAccountId,null);f.close();
});
test('draft autosave retains newer input arriving during an older metadata save',async()=>{
 const f=await fixture({appId:'weibo',slow:true});await f.app.handle('nav',{app:'weibo',tab:'compose'});const field=f.input('[name="text"]','第一句');assert.equal(f.app.requestLeave().allowed,false);await wait(455);field.value='第一句，第二句';field.dispatchEvent(new f.win.Event('input',{bubbles:true}));await wait(650);await f.settle();
 assert.equal(f.service.readLife().state.social.drafts.main.text,'第一句，第二句');assert.equal(f.root.querySelector('[name="text"]'),field);assert.equal(field.value,'第一句，第二句');assert.equal(f.app.requestLeave().allowed,true);f.close();
});
test('old frame rejects changed selection and changed chat without overwriting either archive',async()=>{
 const f=await fixture({appId:'wallet'}),before=JSON.stringify(f.original.chatMetadata[PHONE_STATE_KEY]);f.setSelection('new-person');await assert.rejects(()=>f.app.dispatch({type:'wallet.transfer',from:'cash',to:'person-2',amount:1}),/已切换/);assert.equal(JSON.stringify(f.original.chatMetadata[PHONE_STATE_KEY]),before);
 f.setSelection('profile-1');f.switchChat();await assert.rejects(()=>f.app.dispatch({type:'wallet.transfer',from:'cash',to:'person-2',amount:1}),/已切换/);assert.equal(JSON.stringify(f.original.chatMetadata[PHONE_STATE_KEY]),before);f.close();
});
test('archive validates visual tokens even when world and state config are tampered together',async()=>{
 const f=await fixture(),life=f.service.readLife();life.world.theme.background='url(https://bad.invalid/track)';life.state.config.theme.background=life.world.theme.background;assert.throws(()=>validatePhoneLife(life),/安全颜色/);f.close();
});
