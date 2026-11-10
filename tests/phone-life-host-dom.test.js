import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {indexedDB} from 'fake-indexeddb';
import {createPhoneService} from '../phone-core.mjs';
import {currentPhoneHost,matrixMemoryStorage} from './fixtures/phone-host-current.mjs';
import {phoneProfile,currentCalendar} from './fixtures/phone-current.mjs';
import {chatKey} from '../engine/controller.mjs';
import {bootPhone} from '../phone-app.mjs';
import {validatePhoneLife} from '../phone-life-config.mjs';

const baseWorld={name:'青鸟之城',apps:['weibo','wallet','shop','food','album','music','map','calendar'],appNames:{wallet:'青鸟银行',weibo:'鸟鸣'},theme:{background:'#edf5ef',panel:'#fff',text:'#234',accent:'#328f78',radius:16},currency:{name:'云币',symbol:'¤',minorUnits:2},economy:{loan:{annualRateBps:400,terms:[2,4],periodDays:45,periodsPerYear:8,minAmount:10000,maxAmount:1000000},investments:[{id:'fund-1',name:'城市储蓄',annualRateBps:120,apr:0.012,description:'故事内计划'}],deliveryFees:{shop:137,food:211}},travel:{speeds:{walk:5}},places:[{id:'house',name:'青鸟公寓',x:0,y:0,known:true},{id:'garden',name:'天空花园',x:15,y:0,known:true}],catalog:[{id:'novel',name:'云间手札',price:2300,stock:3,kind:'physical',placeId:'house',tags:[]},{id:'noodle',name:'热汤面',price:1600,stock:9,kind:'food',placeId:'house',tags:[]}]};
const baseCharacter={name:'阿青',accounts:[{id:'main',name:'青鸟',handle:'bluebird',owned:true},{id:'friend',name:'朋友',handle:'friend',owned:false,personId:'person-2'}],wallet:{accounts:[{id:'cash',name:'零钱',balance:100000},{id:'savings',name:'青鸟银行卡',balance:900000}],defaultAccountId:'cash',fundingAccountId:'savings'},contacts:[{id:'person-2',name:'朋友'}],posts:[{id:'post-1',authorId:'friend',text:'今天在天空花园。',visibility:'public',mediaIds:[],createdAt:{year:2033,month:4,day:8,minute:840,totalMinutes:-90}}],position:'house'};
const profile=(w={},c={})=>{const {calendar={...currentCalendar(),month:4,day:8,hour:15,minute:30},...world}=w;return phoneProfile({worldId:'world-1',personId:'person-1',world:{...baseWorld,...world},character:{...baseCharacter,...c},calendar});};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture({world={},character={},appId='home',initialize=true,slow=false}={}){
 let context={chatId:'life-dom',characterId:0,groupId:null,chatMetadata:{},chat:[]},selection='profile-1',app,saves=0,serial=0;
 const original=context,key=chatKey(context),win=new Window({url:'http://localhost/phone.html?chat='+encodeURIComponent(key)+'&app='+appId,settings:{disableIframePageLoading:true}}),doc=win.document;
 doc.body.innerHTML='<div id="phone-root" style="height:800px"></div>';Object.defineProperty(win,'indexedDB',{value:indexedDB,configurable:true});
 const matrix=await currentPhoneHost({context,getContext:()=>context,profile:profile(world,character),storage:matrixMemoryStorage({onWrite:async()=>{saves++;if(slow)await wait(25);}})}),storage=matrix.phoneStorage;
 const service=createPhoneService({seed:{accounts:{me:{name:'我'}},documents:[]},contextKey:key,storage,idFactory:()=>`life-dom-${++serial}`,onChange:()=>app?.refresh()});await service.init();if(initialize)await service.initLife(profile(world,character));
 const host={contextKey:()=>chatKey(context),selectionKey:()=>selection,service:async()=>service,open:()=>{},openIdentity:()=>{}};win.Tisya={phone:host};
 app=await bootPhone({win,doc});const root=app.getRoot?.();
 const settle=async()=>{await wait(5);await app.settled?.();await wait(5);};
 const click=async selector=>{const target=root.querySelector(selector);assert.ok(target,selector);target.click();await settle();};
 const input=(selector,value)=>{const target=root.querySelector(selector);assert.ok(target,selector);target.value=value;target.dispatchEvent(new win.Event('input',{bubbles:true}));return target;};
 const submit=async selector=>{root.querySelector(selector).dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await settle();};
 return {win,doc,root,app,service,original,host,matrix,settle,click,input,submit,get saves(){return saves;},setSelection:value=>{selection=value;},switchChat:()=>{context={...context,chatId:'other',chatMetadata:{}};},close:()=>{app.dispose();win.close();}};
}

test('real phone boot mounts configured life apps and no preview identities',async()=>{
 const f=await fixture({world:{apps:['wallet','album'],appNames:{wallet:'青鸟银行'}}});
 assert.equal(f.root.querySelectorAll('.home-apps button').length,2);assert.match(f.root.querySelector('.home-apps').textContent,/青鸟银行/);assert.doesNotMatch(f.root.textContent,/余舟|林间|青禾/);assert.equal(f.root.querySelector('.phone').style.getPropertyValue('--accent'),'#328f78');
 assert.throws(()=>f.app.navigate({app:'shop'}),/没有启用/);assert.equal(f.win.localStorage.length,0);f.close();
});
test('host transfer form writes once into the current database and survives service reload',async()=>{
 const f=await fixture({appId:'wallet'});await f.app.handle('nav',{app:'wallet',tab:'transfer'});
 assert.match(f.root.querySelector('[name="to"]').textContent,/朋友/);assert.doesNotMatch(f.root.textContent,/演示联系人|余舟/);
 f.input('[name="amount"]','12.34');f.input('[name="to"]','person-2');await f.submit('[data-action="wallet.transfer"]');
 assert.equal(f.service.readLife().state.wallet.accounts.find(a=>a.id==='cash').balance,98766);assert.equal((await f.matrix.read()).life.state.wallet.ledger.length,1);assert.ok(f.saves>=3);
 const restored=createPhoneService({seed:{accounts:{me:{name:'我'}},documents:[]},contextKey:chatKey(f.original),storage:(await currentPhoneHost({context:f.original,storage:f.matrix.storage})).phoneStorage});await restored.init();assert.equal(restored.readLife().state.wallet.accounts[0].balance,98766);f.close();
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
 const f=await fixture({character:{accounts:[],posts:[],wallet:{accounts:[{id:'unknown',name:'待确认',balance:null}]}},world:{calendar:null,economy:{},travel:{speeds:{}}},appId:'wallet'});
 assert.match(f.root.textContent,/未配置/);assert.doesNotMatch(f.root.querySelector('.u-hero-amount').textContent,/0\.00/);await f.app.handle('nav',{app:'album'});assert.match(f.root.textContent,/相册/);await f.app.handle('nav',{app:'music'});assert.match(f.root.textContent,/音乐/);await f.app.handle('nav',{app:'calendar'});assert.match(f.root.textContent,/尚未提供日历起点/);assert.equal(f.service.readLife().state.social.activeAccountId,null);f.close();
});
test('draft autosave retains newer input arriving during an older database save',async()=>{
 const f=await fixture({appId:'weibo',slow:true});await f.app.handle('nav',{app:'weibo',tab:'compose'});const field=f.input('[name="text"]','第一句');assert.equal(f.app.requestLeave().allowed,false);await wait(455);field.value='第一句，第二句';field.dispatchEvent(new f.win.Event('input',{bubbles:true}));await wait(650);await f.settle();
 assert.equal(f.service.readLife().state.social.drafts.main.text,'第一句，第二句');assert.equal(f.root.querySelector('[name="text"]'),field);assert.equal(field.value,'第一句，第二句');assert.equal(f.app.requestLeave().allowed,true);f.close();
});
test('old frame rejects changed selection and changed chat without overwriting either archive',async()=>{
 const f=await fixture({appId:'wallet'}),before=JSON.stringify(await f.matrix.read());f.setSelection('new-person');await assert.rejects(()=>f.app.dispatch({type:'wallet.transfer',from:'cash',to:'person-2',amount:1}),/已切换/);assert.equal(JSON.stringify(await f.matrix.read()),before);
 f.setSelection('profile-1');f.switchChat();await assert.rejects(()=>f.app.dispatch({type:'wallet.transfer',from:'cash',to:'person-2',amount:1}),/已切换/);const originalReader=await currentPhoneHost({context:f.original,storage:f.matrix.storage});assert.equal(JSON.stringify(await originalReader.read()),before);f.close();
});
test('archive validates visual tokens even when world and state config are tampered together',async()=>{
 const f=await fixture(),life=f.service.readLife();life.world.theme.background='url(https://bad.invalid/track)';life.state.config.theme.background=life.world.theme.background;assert.throws(()=>validatePhoneLife(life),/安全颜色/);f.close();
});

test('sparse account UI uses stable identity and saves only edited facts while unknown cash stays unknown',async t=>{
 const f=await fixture({world:{places:[],catalog:[]},character:{position:null,accounts:[{id:'sparse-main',owned:true,name:null,handle:null},{id:'sparse-alt',owned:true,name:null,handle:null}],posts:[],wallet:{accounts:[{id:'unconfirmed',name:null,balance:null}]},photos:[{id:'private-image',name:'旅途原件',source:'file',visibility:'private'}]},appId:'weibo'});t.after(()=>f.close());
 const initial=f.service.readLife(),main=structuredClone(initial.state.social.accounts.find(row=>row.id==='sparse-main'));
 await f.app.handle('nav',{app:'weibo',tab:'profile',detail:'sparse-main'});assert.match(f.root.querySelector('.social-profile').textContent,/未填网名/);assert.equal([...f.root.querySelectorAll('.social-profile p')].some(row=>row.textContent.trim()==='@'),false);assert.deepEqual(f.service.readLife().state.social.accounts.find(row=>row.id==='sparse-main'),main);
 await f.app.handle('nav',{app:'settings'});const switcher=[...f.root.querySelectorAll('[data-action="social.account"]')].find(node=>JSON.parse(node.dataset.payload).accountId==='sparse-alt');assert(switcher);switcher.click();await f.settle();assert.equal(f.service.readLife().state.social.activeAccountId,'sparse-alt');
 await f.app.handle('nav',{app:'weibo',tab:'profile-edit'});assert.equal(f.root.querySelector('[name="name"]').value,'');assert.equal(f.root.querySelector('[name="handle"]').value,'');f.input('[name="name"]','渡口小号');await f.submit('[data-action="social.profile.edit"]');
 const edited=f.service.readLife().state.social.accounts.find(row=>row.id==='sparse-alt');assert.equal(edited.name,'渡口小号');assert.equal(edited.handle,null);assert.equal(f.service.readLife().state.social.accounts.find(row=>row.id==='sparse-main').name,null);
 await f.app.handle('nav',{app:'wallet'});assert.match(f.root.querySelector('.u-hero-amount').textContent,/未配置/);assert.doesNotMatch(f.root.querySelector('.u-hero-amount').textContent,/0\.00/);assert.match(f.root.querySelector('#screen').textContent,/未命名账户/);assert.doesNotMatch(f.root.querySelector('#screen').textContent,/null|undefined/);
 await f.app.handle('nav',{app:'album'});assert.match(f.root.textContent,/旅途原件/);assert.equal(f.service.readLife().state.map.position,null);
 const restored=createPhoneService({seed:{accounts:{me:{name:'我'}},documents:[]},contextKey:chatKey(f.original),storage:(await currentPhoneHost({context:f.original,storage:f.matrix.storage})).phoneStorage});await restored.init();const after=restored.readLife();assert.equal(after.state.social.activeAccountId,'sparse-alt');assert.equal(after.state.social.accounts.find(row=>row.id==='sparse-alt').name,'渡口小号');assert.equal(after.state.social.accounts.find(row=>row.id==='sparse-alt').handle,null);assert.equal(after.state.wallet.accounts[0].balance,null);restored.dispose();
});

test('ordinary sparse calendar forms show known titles before timing and enter the schedule only after a later form fill',async t=>{
 const f=await fixture({world:{places:[],catalog:[]},character:{position:null,accounts:[],posts:[]},appId:'calendar'});t.after(()=>f.close());
 const commit=async(values,operationId)=>{const current=await f.matrix.snapshot();await f.matrix.host.commitDatabase({contextKey:current.contextKey,expectedRevision:current.revision,operationId,changes:[{tableId:'X_CALENDAR_EVENTS',recordId:'later-event',values}]});await f.service.refresh();f.app.refresh();await f.settle();};
 await commit({id:'later-event',world_ref:'world-1',owner_ref:'person-1',title:'渡口碰面'},'ui-sparse-calendar');assert.match(f.root.querySelector('.phone-pending-calendar').textContent,/时间待定的安排.*渡口碰面/);assert.equal(f.service.readLife().state.calendar.events.length,0);const before=await f.matrix.snapshot();await f.app.handle('nav',{app:'album'});await f.app.handle('nav',{app:'calendar'});assert.deepEqual(await f.matrix.snapshot(),before);
 await commit({at:60},'ui-fill-calendar-time');assert.equal(f.root.querySelector('.phone-pending-calendar'),null);assert.match(f.root.querySelector('.u-agenda-card').textContent,/渡口碰面/);assert.equal(f.service.readLife().state.calendar.events.length,1);assert.equal(f.service.readLife().state.calendar.events[0].id,'later-event');assert.equal(f.service.readLife().state.calendar.events[0].at,60);
 const persisted=(await f.matrix.snapshot()).state.tables.X_CALENDAR_EVENTS['later-event'];assert.equal(persisted.values.title,'渡口碰面');assert.equal(persisted.values.at,60);
});
