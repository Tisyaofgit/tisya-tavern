import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryFlow,memoryForm,memoryReply,intakeReply} from './fixtures/memory-flow.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {IDBFactory} from 'fake-indexeddb';
import {historyEvidence} from '../tables/ledger.js';

test('automatic archive and manual history intake share completion and temporary status',async()=>{
 const f=await memoryFlow();for(let n=1;n<=3;n++)await f.accept(memoryReply(n));
 const rows=(await f.foundation.inspect()).history.filter(r=>r.role==='assistant');
 assert.equal(rows[0].archived,true,'formal automatic memory must not be offered for reimport');
 assert.equal(rows[0].archiveStatus,'formal');assert.equal(rows[1].archiveStatus,'staged');
 await assert.rejects(f.foundation.prepare({kind:'history',sourceKind:'chat',from:1,to:6,includeLatest:true}),/没有尚待/);
 assert.equal(f.requests.length,0);
 await f.reopen();const payload=await f.prepare(),text=payload.messages.map(m=>m.content).join('\n');
 assert.match(text,/第1次在渡口交信/);assert.doesNotMatch(text,/第2次在渡口交信/);
});

test('real database retains editable-field validation and rejects forged derived provenance',async()=>{
 const f=await memoryFlow(),snapshot=await f.database.read();
 const input={operationId:'invalid-history',expectedRevision:snapshot.revision,contextKey:snapshot.contextKey,changes:[{tableId:'T_DYN_EVENTS',recordId:'bad-event',values:{spine_digest:'没有事件标题'}}]};
 await assert.rejects(f.database.commit(input),e=>e.code==='REQUIRED_FIELD'&&e.details.field==='title');
 input.changes[0].values={title:'事件',source_hash:'fabricated'};
 await assert.rejects(f.database.commit(input),e=>e.code==='DERIVED_WRITE');
 assert.deepEqual(await f.database.read(),snapshot);
});

test('supplement saves once through IndexedDB, failed writes retain the draft, and edited history removes stale memory',async()=>{
 const storage=indexedStorage(new IDBFactory()),f=await memoryFlow({storage});
 await f.accept(memoryReply(1,null));await f.accept(memoryReply(2,''));await f.accept(memoryReply(3,''));
 const draft=await f.foundation.generate({kind:'history',sourceKind:'chat',from:2,to:2}),before=await f.database.read(),commit=storage.commit;
 storage.commit=async()=>false;
 await assert.rejects(f.foundation.commit(draft.id,{reviewed:true}),e=>e.code==='SAVE_CONFLICT');assert.deepEqual(await f.database.read(),before);
 storage.commit=commit;await f.foundation.commit(draft.id,{reviewed:true});const after=await f.database.read();
 assert.equal((await f.foundation.commit(draft.id,{reviewed:true})).repeated,true);assert.deepEqual(await f.database.read(),after);
 await f.reopen();assert.equal(Object.keys((await f.database.read()).state.tables.T_DYN_EVENTS).length,1);
 f.ctx.chat[1].mes=memoryReply(1,null).replace('第1次在渡口交信。','信还没有送到。');await f.host.sync();
 assert.equal(Object.keys((await f.database.read()).state.tables.T_DYN_EVENTS).length,0);
 const payload=await f.prepare();assert.doesNotMatch(JSON.stringify(payload.messages),/补录的交信/);
});

test('concatenated historical replies retain every body and exclude machine blocks including self-closing anchors',()=>{
 const raw=memoryReply(1,null).replace('<cells/>','<cells>伪状态</cells>')+'\n用户补充原话\n'+memoryReply(2,'').replace('<anchor phase="after"/>','<anchor phase="after">不可当成事实的总结</anchor>');
 const result=historyEvidence(raw);assert.match(result,/第1次在渡口交信/);assert.match(result,/第2次在渡口交信/);assert.match(result,/用户补充原话/);assert.doesNotMatch(result,/伪状态|内部规划|不可当成事实|<(?:anchor|cells|archive)/);
});

test('missing archive can be supplemented with events and stage summaries, retaining raw evidence and only sending prose',async()=>{
 const f=await memoryFlow();await f.accept(memoryReply(1,null));await f.accept(memoryReply(2,''));await f.accept(memoryReply(3,''));
 f.respond(intakeReply(memoryForm('T_DYN_EVENTS',{title:'补录交信',spine_digest:'已在渡口交信。'},{evidence:false})+'\n'+memoryForm('T_DYN_STAGE_SUMMARIES',{name:'渡口阶段',summary_text:'交信已完成，等待船来。'},{evidence:false})));
 const draft=await f.foundation.generate({kind:'history',sourceKind:'chat',from:2,to:2});
 const supplied=JSON.stringify(f.requests.at(-1).input.sourceHistory);assert.match(supplied,/第1次在渡口交信/);assert.doesNotMatch(supplied,/内部规划不得当成经历|<cells|<archive/);
 assert.equal(draft.source.raw.messages[0].text,f.ctx.chat[1].mes);assert.equal(draft.source.raw.context[0].role,'user');
 await f.foundation.commit(draft.id,{reviewed:true});await f.reopen();
 const row=(await f.foundation.inspect()).history.find(r=>r.floor===2);assert.equal(row.archiveStatus,'imported');
 const payload=await f.prepare(),text=payload.messages.map(m=>m.content).join('\n');assert.match(text,/已在渡口交信/);assert.match(text,/交信已完成，等待船来/);assert.doesNotMatch(text,/第1条已接纳回复.*记忆待核|记忆待核[^\n]*第1条已接纳回复/);
});
