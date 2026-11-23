import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {initializeState} from '../engine/materials.mjs';
import {baseline} from '../engine/config.mjs';

const clone=structuredClone;
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));

async function fixture({manualReview=false,nativeSources=null}={}){
 const disk=new Map(),heads=new Map(),macros=new Map();let token=0;
 const ctx={chatId:'registration-next-turn',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(key,fn)=>macros.set(key,fn)};
 const saveHead=(key,value)=>{if(value?.state?.schema&&value?.state?.tables)heads.set(key,{format:'tisya.workspace-head/1',owner:key,revision:value.local_revision??0,token:'head-'+(++token)});};
 const storage={get:async key=>clone(disk.get(key)),stat:async key=>clone(heads.get(key)),set:async(key,value)=>{disk.set(key,clone(value));saveHead(key,value);},commit:async(key,revision,value)=>{const current=disk.get(key);if((current?.local_revision??0)!==revision)return false;if((value.local_revision??0)===revision){if(JSON.stringify(current)!==JSON.stringify(value))return false;if(!heads.has(key))saveHead(key,value);}else{disk.set(key,clone(value));saveHead(key,value);}return true;}};
 const source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)};
 const expand=text=>text.replace(/\{\{([^{}]+)\}\}/g,(match,key)=>macros.get(key)?.()??(key==='user'?'user':key==='char'?'char':match));
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand,manualReview,nativeSources};
 const host=createMatrixHost(options);host.register();
 await host.import({state:initializeState(catalog,{session_ref:ctx.chatId,branch_ref:'main'})});
 async function start(target){
  await target.before('normal');
  if(nativeSources){await target.entriesLoaded({globalLore:[],characterLore:[],chatLore:[],personaLore:[]});target.activated([]);await target.afterCombine({dryRun:false});}
  if(manualReview)await target.historyInput(ctx.chat.map((message,index)=>({...structuredClone(message),index})),'normal');
  const enabled=new Set(source.order.filter(prompt=>prompt.enabled).map(prompt=>prompt.identifier));
  const payload={messages:source.prompts.filter(prompt=>!prompt.marker&&enabled.has(prompt.identifier)&&expand(prompt.content).trim()).map(prompt=>({role:prompt.role,content:expand(prompt.content)}))};
  await target.payloadReady(payload);
  return payload;
 }
 return {host,ctx,options,start,disk};
}

test('the first request after a database registration matches a cold reopen and contains the new record',async()=>{
 const f=await fixture();
 f.ctx.chat.push({is_user:true,mes:'登记阿青'},{is_user:false,mes:'已登记。'});
 await f.host.sync();
 const database=await f.host.readDatabase();
 await f.host.commitDatabase({operationId:'register-aqing',contextKey:database.contextKey,expectedRevision:database.revision,changes:[
  {tableId:'T_CHAR_DOSSIER',recordId:'aqing-dossier',values:{name:'阿青',public_identity:'河口旅人'}}
 ],source:{kind:'identity-form'}});
 f.ctx.chat.push({is_user:true,mes:'继续'});
 const hot=await f.start(f.host);await f.host.flushProjectionCache();
 const derived=[...f.disk.entries()].find(([key])=>key.startsWith('derived:final-projection:'))?.[1];assert(derived);assert.equal(derived.format,'tisya.final-projection/2');assert(derived.value.bundle,'cold reopen requires the complete derived bundle, not a reconcile-only fragment');assert(derived.value.materials);
 const coldHost=createMatrixHost(f.options);coldHost.register();
 const cold=await f.start(coldHost);
 assert.deepEqual(hot,cold);assert(coldHost.projectionCacheReport().diskHits>0,'cold reopen must reuse the verified final projection');
 const text=hot.messages.map(message=>message.content).join('\n');
 assert.match(text,/阿青/);
 assert.match(text,/河口旅人/);
});

test('a cold read-only database and archive opening reuse the persisted final projection',async()=>{
 const f=await fixture();f.ctx.chat.push({is_user:true,mes:'登记阿青'},{is_user:false,mes:'已登记。'});await f.host.sync();await f.host.flushProjectionCache();
 const coldHost=createMatrixHost(f.options),actual=await coldHost.readDatabase(),expected=await f.host.readDatabase();
 assert.deepEqual(actual,expected);assert.equal(coldHost.projectionCacheReport().diskHits,1);assert.equal(coldHost.projectionCacheReport().misses,0);
});

test('an unchanged cold reopen does not hash and persist the same final projection twice',async()=>{
 const f=await fixture();f.ctx.chat.push({is_user:true,mes:'登记阿青'},{is_user:false,mes:'已登记。'});await f.host.sync();await f.host.flushProjectionCache();
 const coldHost=createMatrixHost(f.options),writes=[],set=f.options.storage.set,get=f.options.storage.get,commit=f.options.storage.commit,id=f.ctx.chatMetadata.tisya_engine.chat_uid;let authoritativeReads=0,commits=0;
 f.options.storage.set=async(key,value)=>{if(key.startsWith('derived:final-projection:'))writes.push(key);return set(key,value);};f.options.storage.get=async key=>{if(key===id)authoritativeReads++;return get(key);};f.options.storage.commit=async(...args)=>{commits++;return commit(...args);};
 await coldHost.event('CHAT_CHANGED');await coldHost.flushProjectionCache();assert.equal(coldHost.latest().unchanged,true);assert.equal(coldHost.latest().workspaceRestored,true);assert.equal(coldHost.projectionCacheReport().diskHits,1);assert.equal(coldHost.projectionCacheReport().workspaceHits,1);assert.equal(authoritativeReads,0);assert.equal(commits,0);assert.equal(writes.length,0);
 f.ctx.chat[1].mes+='真实变化';await coldHost.event('MESSAGE_EDITED',1);await coldHost.flushProjectionCache();assert(writes.length>0,'a real change must persist its newly committed projection');assert.notEqual(coldHost.latest().unchanged,true);assert.notEqual(coldHost.latest().workspaceRestored,true);
});

test('a direct database transaction also adopts its committed projection for the first cold read',async()=>{
 const f=await fixture();f.ctx.chat.push({is_user:true,mes:'登记阿青'},{is_user:false,mes:'已登记。'});await f.host.sync();const database=await f.host.readDatabase();
 await f.host.commitDatabase({operationId:'adopt-committed-projection',contextKey:database.contextKey,expectedRevision:database.revision,changes:[{tableId:'T_CHAR_DOSSIER',recordId:'committed-person',values:{name:'阿青'}}],source:{kind:'identity-form'}});await f.host.flushProjectionCache();
 const coldHost=createMatrixHost(f.options),actual=await coldHost.readDatabase(),expected=await f.host.readDatabase();
 assert.deepEqual(actual,expected);assert.equal(actual.state.tables.T_CHAR_DOSSIER['committed-person'].values.name,'阿青');assert.equal(coldHost.projectionCacheReport().diskHits,1);assert.equal(coldHost.projectionCacheReport().misses,0);
});


test('the first complete request after confirmTurn matches cold reopen and passes native readiness',async()=>{
 const calls=[],nativeSources={begin:()=>calls.push('begin'),end:()=>calls.push('end'),entriesLoaded:()=>calls.push('entriesLoaded'),activated:()=>calls.push('activated'),afterCombine:()=>calls.push('afterCombine'),assertReady:()=>calls.push('assertReady'),audit:()=>({status:'fixture-only',liveHost:false})};
 const f=await fixture({manualReview:true,nativeSources});
 f.ctx.chat.push({is_user:false,mes:'<reply><body>1 已完成本轮。</body><cells/><archive/></reply>'});await f.host.sync();
 const view=await f.host.listTurnReviews(),draft=view.reviews.find(row=>row.status==='pending');await f.host.confirmTurn({...draft,contextKey:view.contextKey,expectedRevision:view.revision});
 f.ctx.chat.push({is_user:true,mes:'继续'});const hot=await f.start(f.host);assert.equal(f.host.accepted(),true);await f.host.flushProjectionCache();
 const coldHost=createMatrixHost(f.options);coldHost.register();const cold=await f.start(coldHost);assert.equal(coldHost.accepted(),true);assert.deepEqual(hot,cold);assert.equal(calls.filter(call=>call==='assertReady').length,2);
});
