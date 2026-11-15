import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {baseline} from '../engine/config.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
export async function fixture(){
 const disk=new Map(),ctx={chatId:'review-host',characterId:0,chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true,saveSettingsDebounced(){}};
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,v)=>disk.set(id,structuredClone(v)),commit:async(id,r,v)=>{if((disk.get(id)?.local_revision??0)!==r)return false;disk.set(id,structuredClone(v));return true;}};
 const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)};
 const options={manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true};
 const host=createMatrixHost(options),e=new Runtime(initializeState(catalog));e.registerTable('ACTOR',[{key:'name',label:'姓名',type:'TEXT'},{key:'hp',label:'体力',type:'NUMBER'}],'当前人物');e.newRecord('ACTOR',{name:'阿青',hp:10},'a');await host.import({state:e.data});
 const forms=prepareMatrixSheets({state:e.data},{operationId:'fixture',task:'main'}),event=forms.catalog.templates.find(t=>t.id==='T_DYN_EVENTS');
 const archive='【'+event.label+'／1】\n'+['title','spine_digest'].map(key=>{const f=event.fields.find(f=>f.key===key);return f.row+' '+f.label+'：'+(key==='title'?'渡口交信':'信已交给船夫')+' | P1';}).join('\n');
 const reply=(cost=3)=>'<reply><body>1 信已交给船夫。</body><cells>阿青.hp: -'+cost+' | P1</cells><archive format="form">'+archive+'</archive></reply>';
 const snapshot=()=>host.export(),hp=async()=>(await snapshot()).state.tables.ACTOR.a.values.hp;
 const draft=async()=>{const v=await host.listTurnReviews();return {...v.reviews.find(r=>r.status==='pending'),contextKey:v.contextKey,expectedRevision:v.revision};};
 return {host,ctx,options,disk,reply,snapshot,hp,draft};
}
test('production host defers all cells and archives until explicit confirmation; re-open is idempotent',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply()});await f.host.sync();assert.equal(await f.hp(),10);assert.equal(Object.keys((await f.host.readDatabase()).state.tables.T_DYN_EVENTS).length,0);
 await f.host.confirmTurn(await f.draft());assert.equal(await f.hp(),7);assert.equal(Object.keys((await f.snapshot()).state.tables.T_DYN_EVENTS).length,1);assert.equal((await f.host.listTurnReviews()).reviews[0].status,'confirmed');
 const receipts=Object.values((await f.snapshot()).state.tables.T_SYS_ARCHIVE_BATCHES);assert.equal(receipts[0].values.review_mode,'手动复核定轨');assert.equal(receipts[0].values.formal_boundary,'用户确认本轮后正式入档');
 await createMatrixHost(f.options).sync();assert.equal(await f.hp(),7);
});
test('edited draft is applied atomically, stale and invalid drafts cannot change the archive',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply()});await f.host.sync();const d=await f.draft(),before=await f.snapshot();
 await assert.rejects(f.host.confirmTurn({...d,cells:'不存在的对象.hp: -100'}),/不能保存/);assert.deepEqual((await f.snapshot()).state,before.state);
 await f.host.confirmTurn({...d,cells:'阿青.hp: -2 | P1'});assert.equal(await f.hp(),8);
 await assert.rejects(f.host.confirmTurn(d),/已更新/);
});
test('reroll preserves the previous confirmed version until approved and rollback restores floor state',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply()});await f.host.sync();await f.host.confirmTurn(await f.draft());f.ctx.chat[0].mes=f.reply(5);await f.host.sync();assert.equal(await f.hp(),7);assert((await f.draft()).previousConfirmed);
 await f.host.confirmTurn(await f.draft());assert.equal(await f.hp(),5);assert.equal(Object.keys((await f.snapshot()).state.tables.T_DYN_EVENTS).length,1);
 const v=await f.host.listTurnReviews();await f.host.rewindTurnReviews({uid:v.reviews[0].uid,contextKey:v.contextKey,expectedRevision:v.revision});assert.equal(await f.hp(),10);assert.equal(Object.keys((await f.snapshot()).state.tables.T_DYN_EVENTS).length,0);
});
test('confirming a changed earlier floor invalidates dependent later confirmations',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply(1)});await f.host.sync();await f.host.confirmTurn(await f.draft());f.ctx.chat.push({is_user:true,mes:'继续'},{mes:f.reply(2).replaceAll('渡口交信','入夜')});await f.host.sync();await f.host.confirmTurn(await f.draft());assert.equal(await f.hp(),7);
 f.ctx.chat[0].mes=f.reply(4);await f.host.sync();await f.host.confirmTurn(await f.draft());assert.equal(await f.hp(),6);assert.equal((await f.host.listTurnReviews()).reviews[1].status,'pending');
});
