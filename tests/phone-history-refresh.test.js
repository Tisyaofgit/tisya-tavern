import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {chatKey} from '../engine/controller.mjs';
import {createPhoneDatabaseStorage,readPhoneDatabaseProfile,PHONE_DATABASE_SCHEMAS} from '../engine/phone-database.mjs';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneTurnHost} from '../phone-turn-host.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const entry=fs.readFileSync(process.env.TISYA_HISTORY_TEST_INDEX??new URL('../index.js',import.meta.url),'utf8');
function historyHandler(deps){
 let code;
 if(entry.includes('async function reconcilePhoneHistory(){')){
  code=entry.slice(entry.indexOf('async function reconcilePhoneHistory(){'),entry.indexOf('\nconst turnDirections=',entry.indexOf('async function reconcilePhoneHistory(){')))+'\nreturn reconcilePhoneHistory;';
 }else{
  // Execute the retained production event callback for before/after evidence.
  const match=entry.match(/context\(\)\.eventSource\.on\(ev,(\(\)=>\{if\(!isGenerating\(\)&&!revisionController\.active\(\)&&context\(\)\.chatId&&context\(\)\.chatMetadata\?\.\['缇斯亚虚拟手机'\][^\n]+?\})\);/);
  assert.ok(match,'production history handler must exist');code='return '+match[1]+';';
 }
 return Function(...Object.keys(deps),code)(...Object.values(deps));
}
async function fixture({initialize=true}={}){
 const disk=new Map();let writes=0;const ctx={chatId:'history',characterId:0,chat:[{is_user:true,mes:'起点'}],chatMetadata:{},extensionSettings:{},saveChat:async()=>true};
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,v)=>{writes++;disk.set(id,structuredClone(v));},commit:async(id,revision,v)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;writes++;disk.set(id,structuredClone(v));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});
 let service=null;
 const phoneTurn=createPhoneTurnHost({getContext:()=>ctx,phoneService:()=>service});
 const deps={context:()=>ctx,phoneChatKey:chatKey,matrixDatabase:{peek:()=>host.peekDatabase()},phoneTurn,isGenerating:()=>false,revisionController:{active:()=>false,navigating:()=>false},error:e=>{throw e;}};
 if(initialize){
  await host.ensureDatabase();const db=await host.readDatabase();
  await host.commitDatabase({contextKey:db.contextKey,expectedRevision:db.revision,operationId:'initial-forms',schema:PHONE_DATABASE_SCHEMAS,changes:[
   {tableId:'T_STATIC_WORLDS',recordId:'world',values:{name:'测试世界'}},
   {tableId:'T_CHAR_DOSSIER',recordId:'person',values:{name:'测试人物'}},
   {tableId:'T_SYS_ENTITIES',recordId:'person',values:{kind:'character',origin_record_ref:'origin-person'}},
   {tableId:'M_FIELD_REFERENCES',recordId:'origin-person',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'person',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'person',reference_kind:'record',resolution_status:'resolved'}},
   {tableId:'T_STATIC_ITEMS_SKILLS',recordId:'coin',values:{name:'星币',category:'currency'}},
   {tableId:'T_DYN_CURRENCY_BALANCES',recordId:'cash',values:{owner_ref:'person',currency_ref:'coin',balance:123.45}},
   {tableId:'X_PHONE_WORLD_CONFIG',recordId:'phone-world',values:{world_ref:'world',apps:['wallet'],currency_ref:'coin'}}
  ]});
  service=createPhoneService({seed:{accounts:{me:{name:'本人',role:'self'}},documents:[]},contextKey:chatKey(ctx),storage:createPhoneDatabaseStorage({database:host.createPhoneDatabaseBridge(),contextKey:chatKey(ctx)})});await service.init();
  await service.initLife(readPhoneDatabaseProfile((await host.readDatabase()).state,{worldId:'world',entityId:'person'}));
 }
 return {ctx,host,service,phoneTurn,deps,writes:()=>writes,run:()=>historyHandler(deps)()};
}

test('production history gate refreshes the canonical phone after deleting an anchored balance edit',async()=>{
 const f=await fixture();assert.equal(f.ctx.chatMetadata['缇斯亚虚拟手机'],undefined);
 assert.equal(f.service.readLife().state.wallet.accounts[0].balance,12345);
 f.ctx.chat.push({is_user:true,mes:'稍后'});const db=await f.host.readDatabase();
 await f.host.commitDatabase({contextKey:db.contextKey,expectedRevision:db.revision,operationId:'later-balance',changes:[{tableId:'T_DYN_CURRENCY_BALANCES',recordId:'cash',values:{balance:100}}]});
 await f.service.refresh();assert.equal(f.service.readLife().state.wallet.accounts[0].balance,10000);
 f.ctx.chat.pop();await f.run();
 assert.equal(f.service.readLife().state.wallet.accounts[0].balance,12345);
 assert.equal((await f.host.readDatabase()).state.tables.T_DYN_CURRENCY_BALANCES.cash.values.balance,123.45);
 assert.equal(f.ctx.chatMetadata['缇斯亚虚拟手机'],undefined);
});

test('production history gate leaves a chat without phone state uninitialized',async()=>{
 const f=await fixture({initialize:false});const before=f.writes();await f.run();
 assert.equal(await f.host.peekDatabase(),null);assert.equal(f.writes(),before);assert.deepEqual(f.ctx.chatMetadata,{});
});

test('production history gate rechecks context after its asynchronous database read',async()=>{
 const f=await fixture();let resolve,started=0,reconciles=0;const peek=f.deps.matrixDatabase.peek;
 f.deps.matrixDatabase.peek=async()=>{const snapshot=await peek();started++;await new Promise(r=>{resolve=r;});return snapshot;};
 const original=f.phoneTurn.reconcile;f.phoneTurn.reconcile=(...args)=>{reconciles++;return original(...args);};
 const run=f.run();for(let i=0;i<100&&!started;i++)await new Promise(r=>setTimeout(r,1));
 assert.equal(started,1);f.ctx.chatId='another';f.ctx.chatMetadata={};resolve();await run;
 assert.equal(reconciles,0);assert.equal(await f.host.peekDatabase(),null);assert.deepEqual(f.ctx.chatMetadata,{});
});
