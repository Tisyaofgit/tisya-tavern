import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {chatKey} from '../engine/controller.mjs';
import {createPhoneService} from '../phone-core.mjs';
import {PHONE_DATABASE_SCHEMAS,readPhoneDatabaseProfile,createPhoneDatabaseStorage} from '../engine/phone-database.mjs';
import {createInitialPhoneLife} from '../phone-life-config.mjs';

const catalog=JSON.parse(fs.readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const seed={accounts:{reader:{name:'阅读者',role:'self'}},documents:[]};
const row=(tableId,recordId,values,states)=>({tableId,recordId,values,...(states?{states}:{})});
async function fixture(){
 const disk=new Map(),ctx={chatId:'progressive-forms',characterId:1,chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>{}};
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,value)=>disk.set(id,structuredClone(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,structuredClone(value));return true;}};
 const options={getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>{},persistMetadata:async()=>{},assertIdle:()=>{}};
 const host=createMatrixHost(options);await host.ensureDatabase();
 const put=async(id,changes)=>{const current=await host.readDatabase();try{return await host.commitDatabase({contextKey:current.contextKey,expectedRevision:current.revision,operationId:id,changes,schema:PHONE_DATABASE_SCHEMAS});}catch(error){error.message+=` [${id}: ${JSON.stringify(error.details??{})}]`;throw error;}};
 await put('minimal-identity',[
  row('T_STATIC_WORLDS','w',{name:'中性世界'}),row('T_CHAR_DOSSIER','p',{name:'旅人'}),
  row('T_SYS_ENTITIES','p',{kind:'character',origin_record_ref:'origin-p'}),
  row('M_FIELD_REFERENCES','origin-p',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'p',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'p',reference_kind:'record',resolution_status:'resolved'}),
  row('X_PHONE_WORLD_CONFIG','settings',{world_ref:'w',apps:['weibo','wallet','album','calendar','map']})
 ]);
 const profile=async()=>readPhoneDatabaseProfile((await host.readDatabase()).state,{worldId:'w',entityId:'p'});
 const open=async()=>{const service=createPhoneService({seed,contextKey:chatKey(ctx),storage:createPhoneDatabaseStorage({database:host.createPhoneDatabaseBridge(),contextKey:chatKey(ctx)})});await service.init();if(!service.readLife())await service.initLife(await profile());return service;};
 return {host,put,profile,open,disk,ctx,options};
}
const action=async(service,id,type,values={})=>{await service.refresh();return service.dispatchLife({id,type,...values},{expectedRevision:service.getState().revision});};
const field=(db,t,r,k)=>db.state.tables[t]?.[r]?.values?.[k];
async function worldFeedback(service,requestId,lifeUpdates){
 const key=service.getState().contextKey;await service.prepareTurn({chatKey:key,requestId,anchorUid:'user-'+requestId});
 const request=service.getState().requests[requestId],source={chatKey:key,requestId,sourceId:'assistant-'+requestId+':candidate',uid:'assistant-'+requestId,candidate:'candidate',raw:'<extra><phone>'+JSON.stringify({requestId,acks:request.actionIds,blocks:[],lifeUpdates})+'</phone></extra>'};
 await service.acceptTurn(source);return source;
}

test('identity-only initialization keeps unknown address, clock, currency and account facts unfilled',async()=>{
 const f=await fixture(),before=await f.host.readDatabase(),service=await f.open(),life=service.readLife();
 assert.equal(life.state.identity.name,'旅人');assert.equal(life.state.map.position,null);assert.equal(life.world.currency,null);assert.deepEqual(life.state.social.accounts,[]);
 assert.equal(life.state.clock.year,null);assert.equal(life.state.clock.minute,null);assert.equal(life.state.config.calendar,undefined);
 const saved=await f.host.readDatabase();assert.equal(Object.keys(saved.state.tables.T_DYN_CURRENCY_BALANCES).length,0);assert.equal(field(saved,'X_PHONE_WORLD_CONFIG','settings','currency_ref'),undefined);
 assert.equal(Object.keys(saved.state.tables.T_DYN_ENTITY_STATE).length,0);assert.equal(field(saved,'T_SYS_ENTITIES','p','runtime_state_ref'),undefined);
 const dbBeforeAction=await f.host.readDatabase();await assert.rejects(action(service,'no-clock','world.advance',{minutes:1}));assert.deepEqual(await f.host.readDatabase(),dbBeforeAction);
 assert.equal(field(saved,'T_CHAR_DOSSIER','p','name'),field(before,'T_CHAR_DOSSIER','p','name'));
});

test('sparse location facts stay absent while ordinary coordinate completion becomes visible',async()=>{
 const f=await fixture();await f.put('sparse-map',[
  row('T_STATIC_PLACES','dock',{name:'渡口'}),row('X_PLACE_MAP_POINTS','dock-map',{id:'dock',place_ref:'dock',world_ref:'w',owner_ref:'p'}),
  row('X_SOCIAL_ACCOUNTS','mine',{id:'mine',world_ref:'w',owner_ref:'p',personId:'p',owned:true})
 ]);
 const service=await f.open();assert.equal(service.readLife().state.map.places[0].x,null);assert.equal(service.readLife().state.map.places[0].known,false);
 await action(service,'map-unrelated-edit','social.profile.edit',{bio:'只补简介'});
 const saved=await f.host.readDatabase(),point=saved.state.tables.X_PLACE_MAP_POINTS['dock-map'];
 for(const key of ['x','y','description','kind','known'])assert.equal(Object.hasOwn(point.values,key),false,key);
 await f.put('map-coordinate-completion',[row('X_PLACE_MAP_POINTS','dock-map',{x:0,y:0,known:true})]);await service.refresh();assert.equal(service.readLife().state.map.places[0].x,0);assert.equal(service.readLife().state.map.places[0].known,true);
 const cold=await f.open();assert.equal(cold.readLife().state.map.places[0].id,'dock');assert.equal(cold.readLife().state.map.places[0].y,0);
});

test('normal form additions hydrate without collection coordinates; sparse profile edits preserve missing cells and cold receipts',async()=>{
 const f=await fixture(),service=await f.open();
 await f.put('later-account',[row('X_SOCIAL_ACCOUNTS','author-account',{id:'a',world_ref:'w',owner_ref:'p',personId:'p',owned:true})]);
 await service.refresh();let account=service.readLife().state.social.accounts[0];assert.equal(account.id,'a');assert.equal(account.name,null);assert.equal(account.handle,null);
 await action(service,'fill-bio','social.profile.edit',{bio:'后来才知道的简介'});
 let saved=await f.host.readDatabase(),record=saved.state.tables.X_SOCIAL_ACCOUNTS['author-account'];
 assert.equal(record.values.bio,'后来才知道的简介');assert.equal(Object.hasOwn(record.values,'name'),false);assert.equal(Object.hasOwn(record.values,'handle'),false);
 await f.put('ordinary-name',[row('X_SOCIAL_ACCOUNTS','author-account',{name:'雨声',handle:'rain'})]);await service.refresh();
 account=service.readLife().state.social.accounts[0];assert.equal(account.name,'雨声');assert.equal(account.handle,'rain');assert.equal(account.bio,'后来才知道的简介');
 await action(service,'clear-name','social.profile.edit',{name:''});const cold=await f.open(),coldAccount=cold.readLife().state.social.accounts[0];
 assert.equal(coldAccount.name,'');assert.equal(coldAccount.handle,'rain');assert.equal(coldAccount.bio,'后来才知道的简介');
 const beforeRetry=await f.host.readDatabase(),retry=await action(cold,'fill-bio','social.profile.edit',{bio:'后来才知道的简介'});assert.equal(retry.result.replayed,true);assert.deepEqual(await f.host.readDatabase(),beforeRetry);
 assert.equal(Object.keys(beforeRetry.state.tables.X_SOCIAL_ACCOUNTS).length,1);assert.equal(cold.readLife().state.receipts['clear-name'].result.message,'账号资料已保存。');
});

test('unknown retained account text is not shown or promoted by an unrelated saved action',async()=>{
 const f=await fixture();await f.put('unknown-account',[row('X_SOCIAL_ACCOUNTS','author-account',{id:'a',world_ref:'w',owner_ref:'p',personId:'p',owned:true,name:'旧猜测',handle:''},{name:'unknown'})]);
 const service=await f.open();assert.equal(service.readLife().state.social.accounts[0].name,null);
 await action(service,'profile-bio','social.profile.edit',{bio:'已确认的部分'});
 const saved=await f.host.readDatabase(),record=saved.state.tables.X_SOCIAL_ACCOUNTS['author-account'];assert.equal(record.values.name,'旧猜测');assert.equal(record.states.name,'unknown');assert.equal(record.values.handle,'');
 const cold=await f.open();assert.equal(cold.readLife().state.social.accounts[0].name,null);assert.equal(cold.readLife().state.social.accounts[0].bio,'已确认的部分');
});

test('missing, unknown and explicit false ownership stay distinct while all deny account control',async()=>{
 const f=await fixture();await f.put('sparse-ownership',[
  row('X_SOCIAL_ACCOUNTS','mine',{id:'mine',world_ref:'w',owner_ref:'p',personId:'p',owned:true}),
  row('X_SOCIAL_ACCOUNTS','missing',{id:'missing',world_ref:'w',owner_ref:'p',personId:'p'}),
  row('X_SOCIAL_ACCOUNTS','unknown',{id:'unknown',world_ref:'w',owner_ref:'p',personId:'p',owned:true},{owned:'unknown'}),
  row('X_SOCIAL_ACCOUNTS','explicit-false',{id:'explicit-false',world_ref:'w',owner_ref:'p',personId:'p',owned:false}),
  row('T_CHAR_DOSSIER','other',{name:'同行人'}),row('T_SYS_ENTITIES','other',{kind:'character',origin_record_ref:'origin-other'}),
  row('M_FIELD_REFERENCES','origin-other',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'other',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'other',reference_kind:'record',resolution_status:'resolved'}),
  row('X_SOCIAL_ACCOUNTS','their-account',{id:'their-account',world_ref:'w',owner_ref:'other',personId:'other',owned:true})
 ]);
 const service=await f.open();assert.deepEqual(service.readLife().state.social.ownedAccountIds,['mine']);
 await action(service,'owned-profile-edit','social.profile.edit',{bio:'本人资料'});
 const db=await f.host.readDatabase(),rows=db.state.tables.X_SOCIAL_ACCOUNTS;
 assert.equal(Object.hasOwn(rows.missing.values,'owned'),false);assert.equal(rows.unknown.values.owned,true);assert.equal(rows.unknown.states.owned,'unknown');assert.equal(rows['explicit-false'].values.owned,false);assert.equal(rows['explicit-false'].states.owned,'known');
 assert.equal(rows['their-account'].values.owned,true);assert.equal(rows['their-account'].values.owner_ref,'other');
 const cold=await f.open();assert.deepEqual(cold.readLife().state.social.ownedAccountIds,['mine']);
});

test('undated calendar entries stay visible as pending and become schedulable only after ordinary time fields arrive',async()=>{
 const f=await fixture();await f.put('unfinished-calendar',[row('X_WORLD_CLOCKS','clock',{world_ref:'w',year:7}),row('X_CALENDAR_EVENTS','appointment',{id:'appointment',world_ref:'w',owner_ref:'p',title:'再访渡口'})]);
 const profile=await f.profile(),preview=createInitialPhoneLife(profile);assert.equal(preview.formReadiness.pendingCalendar[0].title,'再访渡口');assert.equal(preview.state.calendar.events.length,0);
 const service=await f.open();assert.equal(service.readLife().formReadiness.pendingCalendar.length,1);assert.equal(service.readLife().state.calendar.events.length,0);
 const frozen=await f.host.readDatabase();await service.refresh();assert.deepEqual(await f.host.readDatabase(),frozen);assert.equal(field(frozen,'X_CALENDAR_EVENTS','appointment','at'),undefined);
 await f.put('later-calendar-time',[
  row('M_CALENDAR_RULES','calendar',{calendar_id:'calendar',world_ref:'w',mode:'FIXED',year_numbering:'astronomical',value_state:'known',months_per_year:12,days_per_month:30,hours_per_day:24,minutes_per_hour:60}),
  row('X_WORLD_CLOCKS','clock',{month:3,day:5,hour:10,minute:0}),row('X_CALENDAR_EVENTS','appointment',{at:30})
 ]);
 await service.refresh();let life=service.readLife();assert.deepEqual(life.formReadiness.pendingCalendar,[]);assert.equal(life.state.calendar.events[0].at,30);assert.equal(life.state.calendar.events[0].title,'再访渡口');assert.equal(life.state.calendar.events[0].notified,false);
 const source=await worldFeedback(service,'advance-to-appointment',[{type:'world.advance',minutes:30}]);const cold=await f.open();life=cold.readLife();assert.equal(life.state.calendar.events[0].notified,true);assert.equal(life.state.clock.totalMinutes,30);assert.equal(life.state.audit.filter(x=>x.type==='calendar.due').length,1);
 await cold.acceptTurn(source);assert.equal(cold.readLife().state.audit.filter(x=>x.type==='calendar.due').length,1);
});

test('making a saved appointment untimed does not let an unrelated action delete its authored row',async()=>{
 const f=await fixture();await f.put('configured-calendar',[
  row('M_CALENDAR_RULES','calendar',{calendar_id:'calendar',world_ref:'w',mode:'FIXED',year_numbering:'astronomical',value_state:'known',months_per_year:12,days_per_month:30,hours_per_day:24,minutes_per_hour:60}),
  row('X_WORLD_CLOCKS','clock',{world_ref:'w',year:7,month:3,day:5,hour:10,minute:0}),row('X_CALENDAR_EVENTS','appointment',{id:'appointment',world_ref:'w',owner_ref:'p',title:'等消息后再定',at:30}),
  row('X_SOCIAL_ACCOUNTS','author-account',{id:'a',world_ref:'w',owner_ref:'p',personId:'p',owned:true})
 ]);
 const service=await f.open();assert.equal(service.readLife().state.calendar.events.length,1);
 await f.put('withdraw-time',[row('X_CALENDAR_EVENTS','appointment',{at:30},{at:'unknown'})]);await service.refresh();assert.equal(service.readLife().formReadiness.pendingCalendar.length,1);
 const pending=(await f.host.readDatabase()).state.tables.X_CALENDAR_EVENTS.appointment;
 await action(service,'unrelated-bio','social.profile.edit',{bio:'与预约无关'});
 assert.deepEqual((await f.host.readDatabase()).state.tables.X_CALENDAR_EVENTS.appointment,pending);
 const cold=await f.open();assert.equal(cold.readLife().state.calendar.events.length,0);assert.equal(cold.readLife().formReadiness.pendingCalendar[0].id,'appointment');
 await f.put('reconfirm-time',[row('X_CALENDAR_EVENTS','appointment',{at:60},{at:'known'})]);await cold.refresh();assert.equal(cold.readLife().state.calendar.events[0].id,'appointment');assert.equal(cold.readLife().state.calendar.events[0].at,60);
});

test('unknown money remains null, confirmed zero remains zero, then same canonical balance supports an idempotent transfer',async()=>{
 const f=await fixture();await f.put('wallet-rows',[
  row('T_STATIC_ITEMS_SKILLS','coin',{name:'中性币',category:'currency'}),row('X_PHONE_WORLD_CONFIG','settings',{currency_ref:'coin'}),
  row('T_DYN_CURRENCY_BALANCES','bank',{owner_ref:'p',currency_ref:'coin',balance:500},{balance:'unknown'}),
  row('T_DYN_CURRENCY_BALANCES','cash',{owner_ref:'p',currency_ref:'coin',balance:0}),
  row('X_FIN_ACCOUNTS','bank-row',{id:'bank',world_ref:'w',owner_ref:'p',balance_ref:'bank'}),row('X_FIN_ACCOUNTS','cash-row',{id:'cash',world_ref:'w',owner_ref:'p',balance_ref:'cash'})
 ]);
 const service=await f.open(),balances=()=>Object.fromEntries(service.readLife().state.wallet.accounts.map(x=>[x.id,x.balance]));assert.deepEqual(balances(),{bank:null,cash:0});
 const before=await f.host.readDatabase();await assert.rejects(action(service,'unknown-transfer','wallet.transfer',{from:'bank',to:'cash',amount:100}),error=>error.code==='UNCONFIGURED_BALANCE'&&error.message.includes('bank余额未配置'));assert.deepEqual(await f.host.readDatabase(),before);
 assert.equal(field(before,'T_DYN_CURRENCY_BALANCES','bank','balance'),500);assert.equal(before.state.tables.T_DYN_CURRENCY_BALANCES.bank.states.balance,'unknown');
 await f.put('confirm-funds',[row('T_DYN_CURRENCY_BALANCES','bank',{balance:10},{balance:'known'})]);await action(service,'known-transfer','wallet.transfer',{from:'bank',to:'cash',amount:125});
 const after=await f.host.readDatabase();assert.equal(field(after,'T_DYN_CURRENCY_BALANCES','bank','balance'),8.75);assert.equal(field(after,'T_DYN_CURRENCY_BALANCES','cash','balance'),1.25);assert.equal(Object.keys(after.state.tables.T_DYN_CURRENCY_BALANCES).length,2);
 assert(service.readLife().state.wallet.ledger.some(entry=>entry.type==='transfer.in'&&entry.description==='从bank转入'));
 const cold=await f.open();const replay=await action(cold,'known-transfer','wallet.transfer',{from:'bank',to:'cash',amount:125});assert.equal(replay.result.replayed,true);assert.deepEqual(await f.host.readDatabase(),after);
});

test('malformed, duplicate and foreign references still fail atomically with sparse mode enabled',async()=>{
 const f=await fixture(),service=await f.open();await f.put('same-world-account',[row('X_SOCIAL_ACCOUNTS','author-account',{id:'a',world_ref:'w',owner_ref:'p',personId:'p',owned:true})]);
 const before=await f.host.readDatabase();
 for(const [id,changes]of [
  ['invalid-time',[row('X_CALENDAR_EVENTS','bad-time',{id:'bad-time',world_ref:'w',owner_ref:'p',at:-1})]],
  ['broken-person',[row('X_SOCIAL_ACCOUNTS','bad-account',{id:'b',world_ref:'w',owner_ref:'p',personId:'absent',owned:true})]],
  ['duplicate-account',[row('X_SOCIAL_ACCOUNTS','duplicate',{id:'a',world_ref:'w',owner_ref:'p',personId:'p',owned:true})]],
  ['bad-name-type',[row('X_SOCIAL_ACCOUNTS','author-account',{name:12})]]
 ]){await assert.rejects(f.put(id,changes),undefined,id);assert.deepEqual(await f.host.readDatabase(),before);}
 await f.put('foreign-world-account',[row('T_STATIC_WORLDS','other',{name:'另一世界'}),row('X_SOCIAL_ACCOUNTS','other-account',{id:'foreign',world_ref:'other',owner_ref:'p',personId:'p',owned:true})]);await service.refresh();assert.deepEqual(service.readLife().state.social.accounts.map(x=>x.id),['a']);
});
