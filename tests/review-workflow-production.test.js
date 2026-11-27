import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './turn-review-host.test.js';
import {prepareReviewHistory,applyReviewHistory,ensureReviewHistoryPayload} from '../engine/review-history.mjs';
import {backfillForm,backfillValuesFromReply} from '../engine/review-workflow.mjs';
import {captureMessages} from '../engine/controller.mjs';
const act=async(f,input)=>{const s=await f.host.listTurnReviews();return f.host.reviewAction({...input,contextKey:s.contextKey,expectedRevision:s.revision});};
test('custom fields and labels persist once; machine fields cannot become mandatory',async()=>{
 const f=await fixture(),settings={custom:[{table:'ACTOR',field:{key:'affinity',label:'好感度',type:'NUMBER',minimum:0,maximum:100}}],labels:{'ACTOR|hp':'体力余量'},policy:{ACTOR:{cells:['affinity'],archive:[]}}};
 await act(f,{action:'settings',settings});let s=await f.host.listTurnReviews();assert.equal(s.catalog.find(t=>t.id==='ACTOR').fields.filter(x=>x.key==='affinity').length,1);assert.equal(s.requirements[0].label,'好感度');await act(f,{action:'settings',settings});assert.equal((await f.host.readDatabase()).state.schema.ACTOR.fields.find(f=>f.key==='hp').label,'体力余量');
 const readonly=s.catalog.find(t=>t.program&&t.fields.length);await assert.rejects(act(f,{action:'settings',settings:{...settings,policy:{[readonly.id]:{cells:[readonly.fields[0].key]}}}}),/程序字段/);
});
test('mandatory unchanged and uninvolved fields require explicit response; changed fields are satisfied once',async()=>{
 const f=await fixture();await act(f,{action:'settings',settings:{policy:{ACTOR:{cells:['name','hp'],archive:['hp']}},custom:[],labels:{}}});f.ctx.chat.push({mes:f.reply()});await f.host.sync();const d=await f.draft();await assert.rejects(f.host.confirmTurn(d),/核对必填/);assert.equal(await f.hp(),10);
 await f.host.confirmTurn({...d,responses:{'cells|ACTOR|a|name':'沿用'}});assert.equal(await f.hp(),7);
});
test('backfill writes historical facts only after reviewed confirmation; rollback removes its facts',async()=>{
 const f=await fixture();f.ctx.chat.push({is_user:true,mes:'旧用户不补录'},{mes:f.reply()});await f.host.sync();
 await act(f,{action:'settings',settings:{policy:{ACTOR:{cells:['hp'],archive:[]}}}});await act(f,{action:'prepareBackfill',from:1,to:2});let s=await f.host.listTurnReviews(),b=s.backfill,floor=b.floors[0];assert.equal(b.floors.length,1);assert(!floor.body.includes('旧用户'));
 const values=[{...floor.selection[0],state:'known',recordId:'a',recordName:'阿青',value:3,response:'旧时数值，仅作历史记录',evidence:'信已交给船夫。'}];
 await act(f,{action:'fillBackfill',batchId:b.id,uid:floor.id,values,reviewed:false});assert.equal(await f.hp(),10);assert.equal(Object.keys((await f.snapshot()).state.tables.T_STATIC_FACTS).length,0);
 await assert.rejects(act(f,{action:'confirmBackfill',batchId:b.id,uid:floor.id}),/核对/);
 await act(f,{action:'fillBackfill',batchId:b.id,uid:floor.id,values,reviewed:true});await act(f,{action:'confirmBackfill',batchId:b.id,uid:floor.id});assert.equal(await f.hp(),10);
 const saved=await f.snapshot(),fact=Object.values(saved.state.tables.T_STATIC_FACTS)[0];assert.equal(fact.values.proposition,'3');assert(!Object.hasOwn(saved.turn_review.backfillReceipts[0],'value'));
 await assert.rejects(act(f,{action:'confirmBackfill',batchId:b.id,uid:floor.id}),/核对/);
 s=await f.host.listTurnReviews();await f.host.rewindTurnReviews({uid:floor.id,contextKey:s.contextKey,expectedRevision:s.revision});assert.equal(Object.keys((await f.snapshot()).state.tables.T_STATIC_FACTS).length,0);
});
test('stale backfill rejects and new branch cannot reuse receipts',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply()});await f.host.sync();await act(f,{action:'settings',settings:{policy:{ACTOR:{cells:['hp'],archive:[]}}}});await act(f,{action:'prepareBackfill',from:1,to:1});const b=(await f.host.listTurnReviews()).backfill,floor=b.floors[0];await act(f,{action:'fillBackfill',batchId:b.id,uid:floor.id,values:[{...floor.selection[0],state:'unknown',value:null,response:'无依据'}],reviewed:true});f.ctx.chat[0].mes=f.reply(5);await f.host.sync();await assert.rejects(act(f,{action:'confirmBackfill',batchId:b.id,uid:floor.id}),/变化/);
});
test('three layers exclude old users, isolate body and appear once in final payload',async()=>{
 const f=await fixture();f.ctx.chat.push({is_user:true,mes:'旧用户 A'},{mes:f.reply().replace('信已交给船夫。','早些时候。')},{is_user:true,mes:'上次用户 B'},{mes:f.reply()},{is_user:true,mes:'本轮用户 C'});await f.host.sync();const bundle=await f.snapshot(),s=await f.host.listTurnReviews(),p=prepareReviewHistory(bundle,captureMessages(f.ctx),s.contextKey,10);
 assert(!p.text.includes('旧用户 A'));assert(!p.text.includes('早些时候。'));assert.equal(p.layers.recentBody,'');assert(p.layers.recentSituation.includes('上次用户 B'));assert.match(p.layers.recentSituation,/上轮正文\n信已交给船夫。/);assert.doesNotMatch(p.layers.recentSituation,/<cells|<archive/);
 const native=f.ctx.chat.map((m,i)=>({...m,index:i}));applyReviewHistory(native,p);assert.equal(native.length,1);assert.equal(f.ctx.chat.length,5);
 const payload={messages:[{role:'system',content:'原预设'},...captureMessages(f.ctx).map(m=>({role:m.role,content:m.text}))]};ensureReviewHistoryPayload(payload,p);ensureReviewHistoryPayload(payload,p);assert.equal(payload.messages.filter(m=>m.content.includes('<recent_situation>\n')).length,1);assert.equal(payload.messages[0].content,'原预设');
});
test('drafts persist without accepting cells',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply()});await f.host.sync();const d=await f.draft();await act(f,{action:'draft',uid:d.uid,hash:d.sourceHash,cells:'阿青.hp: -1 | P1',archive:d.archive});assert.equal(await f.hp(),10);assert.equal((await f.host.listTurnReviews()).drafts[d.uid].cells,'阿青.hp: -1 | P1');
});
test('backfill model form uses labels; malformed response is retained for manual correction',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply()});await f.host.sync();await act(f,{action:'settings',settings:{policy:{ACTOR:{cells:['hp'],archive:[]}}}});await act(f,{action:'prepareBackfill',from:1,to:1});const b=(await f.host.listTurnReviews()).backfill,floor=b.floors[0],state=(await f.host.readDatabase()).state,form=backfillForm(state,floor),t=form.catalog.templates.find(t=>t.id==='ACTOR');assert(!form.form.includes('ACTOR'));const rows=['name','hp'].map(k=>{const field=t.fields.find(f=>f.key===k);return field.row+' '+field.label+'：'+(k==='name'?'阿青':'3')+' | P1';}).join('\n');const raw='<reply><body>1 信已交给船夫。</body><cells format="form">【'+form.references.find(r=>r.tableId==='ACTOR').display+'】\n'+rows+'</cells><archive/></reply>';
 const parsed=backfillValuesFromReply(state,b,floor.id,raw);assert.equal(parsed.floors[0].values[0].value,3);assert.equal(await f.hp(),10);
 await act(f,{action:'modelBackfill',batchId:b.id,uid:floor.id,raw:'错误格式但保留回复'});const saved=(await f.host.listTurnReviews()).backfill.floors[0];assert.equal(saved.raw,'错误格式但保留回复');assert(saved.error.includes('校验'));
});
test('accepted archive is injected once through the three-layer route and stale history stops payload',async()=>{
 const f=await fixture();f.ctx.chat.push({is_user:true,mes:'交信'},{mes:f.reply()});await f.host.sync();await f.host.confirmTurn(await f.draft());const p=await f.host.previewReviewHistory();assert(!p.layers.historyRecord.includes('渡口交信'));assert(p.layers.recentSituation.includes('信已交给船夫。'));assert(!p.layers.recentSituation.includes('渡口交信'));assert(p.audit.some(a=>a.layer==='recent_situation'));
 await f.host.before('normal');f.ctx.chat[0].mes='改写';await assert.rejects(f.host.payloadReady({messages:[]}),/历史|REGISTRY|合同/);f.host.clear();f.host.controller.generating.clear();
});
test('save candidate receipt can immediately confirm without an extra revision from refresh',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:f.reply()});await f.host.sync();await act(f,{action:'settings',settings:{policy:{ACTOR:{cells:['hp'],archive:[]}}}});await act(f,{action:'prepareBackfill',from:1,to:1});const s=await f.host.listTurnReviews(),b=s.backfill,floor=b.floors[0];const result=await f.host.reviewAction({action:'fillBackfill',batchId:b.id,uid:floor.id,values:[{...floor.selection[0],state:'unknown',value:null,response:'本层未给值'}],reviewed:true,contextKey:s.contextKey,expectedRevision:s.revision});assert.equal(result.revision,(await f.snapshot()).local_revision);await f.host.reviewAction({action:'confirmBackfill',batchId:b.id,uid:floor.id,contextKey:s.contextKey,expectedRevision:result.revision});assert.equal((await f.host.listTurnReviews()).backfill.floors[0].status,'confirmed');
});
test('cells and archive coverage reference one historical fact, and reference values render names',async()=>{
 const f=await fixture();await f.host.mutate(e=>e.declareField('ACTOR',{key:'friend',label:'朋友',type:'REF',ref:'ACTOR'}));f.ctx.chat.push({mes:f.reply()});await f.host.sync();await act(f,{action:'settings',settings:{policy:{ACTOR:{cells:['friend'],archive:['friend']}}}});await act(f,{action:'prepareBackfill',from:1,to:1});const b=(await f.host.listTurnReviews()).backfill,floor=b.floors[0],values=floor.selection.map(item=>({...item,recordId:'a',recordName:'阿青',state:'known',value:'a',response:'核对关系引用',evidence:floor.body}));await act(f,{action:'fillBackfill',batchId:b.id,uid:floor.id,values,reviewed:true});await act(f,{action:'confirmBackfill',batchId:b.id,uid:floor.id});const saved=await f.snapshot(),facts=Object.values(saved.state.tables.T_STATIC_FACTS);assert.equal(facts.length,1);assert(facts[0].values.proposition.includes('阿青'));assert.notEqual(facts[0].values.proposition,'a');assert.equal(new Set(saved.turn_review.backfillReceipts.map(r=>r.factRecordId)).size,1);assert.deepEqual(facts[0].metadata.history_field.channels,['cells','archive']);
});
