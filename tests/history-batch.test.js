import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './matrix-foundation-intake.test.js';
import {prepareCreationSheets} from '../engine/creation.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {memoryImports} from '../engine/memory-status.mjs';
const reply=cells=>'<reply><task/><anchor phase="before"/><title>历史候选</title><body>1 原文提炼。</body><anchor phase="after"/><extra/><cells>'+cells+'</cells><vars/><archive/><actions/></reply>';
function form(f,tid,values){const t=prepareCreationSheets(f.snapshot,{operationId:'test-form',task:'historyImport',mode:'revise'}).catalog.templates.find(t=>t.id===tid);return '【'+t.label+'／1】\n'+Object.entries(values).map(([k,v])=>t.fields.find(x=>x.key===k).row+'：'+v).join('\n');}
function history(n=3){const f=fixture();f.ctx.chat=Array.from({length:n},(_,i)=>[{is_user:true,mes:'走到下一处',extra:{tisya_engine:{uid:'u'+i}}},{mes:'旅人经过第'+i+'座桥。',extra:{tisya_engine:{uid:'a'+i}}}]).flat();f.respond(async(_task,input)=>{const floor=input.sourceHistory.filter(r=>r.role==='assistant')[0].floor;return reply(form(f,'T_DYN_EVENTS',{title:'第'+floor+'层的过桥',location_ref:'青石桥',exact_dialogues:'阿青：「明早见。」〔第'+floor+'层 P1〕'}));});return f;}
test('batch reads all selected source floors, preserves partial final group, pins context and writes no facts before confirmation',async()=>{
 const f=history(5),p=await f.api.batch.create({batchSize:2,includeLatest:true});assert.deepEqual(p.batches.map(b=>b.uids.length),[2,2,1]);assert.deepEqual(p.batches.map(b=>[b.from,b.to]),[[2,4],[6,8],[10,10]]);assert.equal(p.sources.length,10);
 const done=await f.api.batch.run(p.id);assert.equal(done.status,'ready');assert.equal(f.calls.length,3);assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,0);
 const view=await f.api.batch.preview(p.id);await assert.rejects(f.api.batch.commit(view.token),/核对/);await f.api.batch.commit(view.token,{reviewed:true});assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,3);assert.equal(Object.keys(f.snapshot.state.tables.T_STATIC_PLACES).length,1);assert.equal(memoryImports(f.snapshot.state).length,3);assert.equal((await f.make().inspect()).history.filter(r=>r.archived).length,5);
 await assert.rejects(f.api.batch.create({batchSize:2,includeLatest:true}),/没有待处理/);await assert.rejects(f.api.preview(done.batches[0].draftId,reply('bad')),/已入档/);
});
test('pause finishes current candidate and resume after recreation never repeats ready batches',async()=>{
 const f=history(),p=await f.api.batch.create({batchSize:1,includeLatest:true});const original=f.calls;let paused=false;
 const first=await f.api.batch.run(p.id,{onProgress:p=>{if(!paused&&p.batches[0].status==='ready'){paused=true;f.api.batch.pause(p.id);}}});assert.equal(first.status,'paused');assert.equal(original.length,1);
 const reopened=f.make(),done=await reopened.batch.run(p.id);assert.equal(done.status,'ready');assert.equal(original.length,3);assert.equal((await reopened.batch.list()).length,1);assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,0);
});
test('failed raw response survives cold resume; only failed and pending batches request again',async()=>{
 const f=history(),p=await f.api.batch.create({batchSize:1,includeLatest:true});f.respond(async(_task,input)=>{const floor=input.sourceHistory.at(-1).floor;return floor===4?'not a reply':reply(form(f,'T_DYN_EVENTS',{title:'事件'+floor}));});
 await assert.rejects(f.api.batch.run(p.id),error=>{assert.equal(error.batch.batches[1].status,'failed');return true;});let saved=await f.make().batch.read(p.id);assert.equal((await f.make().read(saved.batches[1].draftId)).rawResponse,'not a reply');assert.equal(f.calls.length,2);
 f.respond(async(_task,input)=>reply(form(f,'T_DYN_EVENTS',{title:'事件'+input.sourceHistory.at(-1).floor})));const api=f.make();saved=await api.batch.run(p.id);assert.equal(saved.status,'ready');assert.equal(f.calls.length,4);assert((await f.make().read(saved.batches[1].draftId)).responses.some(r=>r.text==='not a reply'));const preview=await api.batch.preview(p.id);await api.batch.commit(preview.token,{reviewed:true});assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,3);
});
test('changed source, selected swipe, chat switch and stale preview each block a bulk write',async()=>{
 const f=history(1),p=await f.api.batch.create({includeLatest:true});await f.api.batch.run(p.id);const view=await f.api.batch.preview(p.id);f.ctx.chat[1].swipe_id=1;await assert.rejects(f.api.batch.commit(view.token,{reviewed:true}),/原文或候选/);f.ctx.chat[1].swipe_id=0;f.ctx.chatId='other';await assert.rejects(f.api.batch.preview(p.id),/聊天已切换/);f.ctx.chatId='chat-a';
 const s=f.snapshot;f.snapshot={...s,revision:s.revision+1};await assert.rejects(f.api.batch.commit(view.token,{reviewed:true}),/预览后/);assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,0);
});
test('summary candidates use stage summary forms and do not claim detailed history coverage',async()=>{
 const f=history(2);f.respond(async(_task,input)=>{assert(input.forms.includes('【阶段摘要／序号】'));assert(!input.forms.includes('【双层历史事件／序号】'));return reply(form(f,'T_DYN_STAGE_SUMMARIES',{name:'过桥阶段',summary_text:'旅人依次经过两座桥。〔第2—4层〕'}));});
 const p=await f.api.batch.create({mode:'summary',batchSize:10,includeLatest:true});await f.api.batch.run(p.id);const view=await f.api.batch.preview(p.id);await f.api.batch.commit(view.token,{reviewed:true});assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_STAGE_SUMMARIES).length,1);assert.equal(memoryImports(f.snapshot.state).length,0);assert.equal((await f.api.inspect()).history.filter(r=>r.canImport).length,2);
});
test('batch skips internal covered floors and tool messages without treating last covered floor as frontier',async()=>{
 const f=history(3);const d=await f.api.generate({kind:'history',sourceKind:'chat',from:4,to:4});await f.api.commit(d.id,{reviewed:true});f.ctx.chat.push({role:'tool',mes:'tool output'});const p=await f.api.batch.create({batchSize:1,includeLatest:true});assert.deepEqual(p.batches.map(b=>b.uids),[['a0'],['a2']]);assert.equal(p.skipped,1);
});
test('another intake confirming a planned floor invalidates bulk confirmation',async()=>{
 const f=history(1),p=await f.api.batch.create({includeLatest:true});const done=await f.api.batch.run(p.id);await f.api.commit(done.batches[0].draftId,{reviewed:true}).catch(async()=>{const d=await f.api.read(done.batches[0].draftId);await f.api.preview(d.id,d.rawResponse);await f.api.commit(d.id,{reviewed:true});});await assert.rejects(f.api.batch.preview(p.id),/有效候选|已归档/);assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,1);
});
test('worldbook initialization filters disabled text and executable templates while retaining complete raw sources',async()=>{
 const f=fixture();f.books.listSources=async()=>({exists:true,entries:[{uid:1,name:'有效设定',content:'桥通向东岸。',entry:{enabled:true}},{uid:2,name:'停用',content:'不可初始化',entry:{enabled:false}},{uid:3,name:'模板',content:'<% throw Error("do not execute") %>',entry:{enabled:true,content:'<% dangerous %>'}}]});
 const d=await f.api.generate({kind:'initialization',sourceKind:'card'});assert.equal(d.source.raw.books[0].entries.length,3);assert.equal(f.calls[0].input.sourceBooks.length,2);assert.equal(f.calls[0].input.sourceBooks[1].content,'');assert.equal(f.calls[0].input.sourceBooks[1].entry,undefined);f.books.listSources=async()=>({exists:true,entries:[]});await assert.rejects(f.api.commit(d.id,{reviewed:true}),/资料已变化/);
});
test('bulk save failure keeps candidates and a retry uses the same preview without regeneration',async()=>{
 const f=history(1),p=await f.api.batch.create({includeLatest:true});await f.api.batch.run(p.id);const view=await f.api.batch.preview(p.id),commit=f.database.commit;let fail=true;f.database.commit=async input=>{if(input.source?.kind==='matrix-foundation-batch'&&fail)throw Error('模拟保存失败');return commit(input);};await assert.rejects(f.api.batch.commit(view.token,{reviewed:true}),/模拟保存失败/);assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,0);assert.equal((await f.api.batch.read(p.id)).status,'ready');fail=false;await f.api.batch.commit(view.token,{reviewed:true});assert.equal(f.calls.length,1);assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,1);
});
test('an invalid edited candidate cannot be bypassed by stale ready progress',async()=>{
 const f=history(1),p=await f.api.batch.create({includeLatest:true});const done=await f.api.batch.run(p.id);await assert.rejects(f.api.preview(done.batches[0].draftId,'invalid'));await assert.rejects(f.api.batch.preview(p.id),/有效候选/);assert.equal(Object.keys(f.snapshot.state.tables.T_DYN_EVENTS).length,0);await f.api.batch.run(p.id);assert.equal(f.calls.length,2);assert.equal((await f.api.batch.read(p.id)).status,'ready');
});
test('empty and unaccepted assistant messages are excluded from the source plan',async()=>{
 const f=history(1);f.ctx.chat.push({mes:'  '},{mes:'<reply><body></body></reply>'},{mes:'候选还没采纳',extra:{tisya_engine:{pending_sha256:'pending'}}});const p=await f.api.batch.create({includeLatest:true});assert.deepEqual(p.batches[0].uids,['a0']);
});
test('full-history planning is independent of a fifty-message display window and uses the default ten-reply size',async()=>{const f=history(65),p=await f.api.batch.create({includeLatest:true});assert.equal(p.range.from,1);assert.equal(p.range.to,130);assert.deepEqual(p.batches.map(b=>b.uids.length),[10,10,10,10,10,10,5]);assert.equal(p.batches[0].from,2);assert.equal(p.batches.at(-1).to,130);assert.equal(f.calls.length,0);});
