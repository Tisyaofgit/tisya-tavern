import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {initializeState} from '../engine/materials.mjs';
import {baseline} from '../engine/config.mjs';

const clone=structuredClone;
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));

async function fixture({manualReview=false,nativeSources=null}={}){
 const disk=new Map(),macros=new Map();
 const ctx={chatId:'registration-next-turn',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(key,fn)=>macros.set(key,fn)};
 const storage={get:async key=>clone(disk.get(key)),set:async(key,value)=>disk.set(key,clone(value)),commit:async(key,revision,value)=>{if((disk.get(key)?.local_revision??0)!==revision)return false;disk.set(key,clone(value));return true;}};
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
 return {host,ctx,options,start};
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
 const coldHost=createMatrixHost(f.options);coldHost.register();
 const cold=await f.start(coldHost);
 assert.deepEqual(hot,cold);assert(coldHost.projectionCacheReport().diskHits>0,'cold reopen must reuse the verified final projection');
 const text=hot.messages.map(message=>message.content).join('\n');
 assert.match(text,/阿青/);
 assert.match(text,/河口旅人/);
});


test('the first complete request after confirmTurn matches cold reopen and passes native readiness',async()=>{
 const calls=[],nativeSources={begin:()=>calls.push('begin'),end:()=>calls.push('end'),entriesLoaded:()=>calls.push('entriesLoaded'),activated:()=>calls.push('activated'),afterCombine:()=>calls.push('afterCombine'),assertReady:()=>calls.push('assertReady'),audit:()=>({status:'fixture-only',liveHost:false})};
 const f=await fixture({manualReview:true,nativeSources});
 f.ctx.chat.push({is_user:false,mes:'<reply><body>1 已完成本轮。</body><cells/><archive/></reply>'});await f.host.sync();
 const view=await f.host.listTurnReviews(),draft=view.reviews.find(row=>row.status==='pending');await f.host.confirmTurn({...draft,contextKey:view.contextKey,expectedRevision:view.revision});
 f.ctx.chat.push({is_user:true,mes:'继续'});const hot=await f.start(f.host);assert.equal(f.host.accepted(),true);await f.host.flushProjectionCache();
 const coldHost=createMatrixHost(f.options);coldHost.register();const cold=await f.start(coldHost);assert.equal(coldHost.accepted(),true);assert.deepEqual(hot,cold);assert.equal(calls.filter(call=>call==='assertReady').length,2);
});
