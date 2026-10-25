import test from 'node:test';
import assert from 'node:assert/strict';
import {createOriginalStore,sha256Utf16} from '../../../v3/host-runtime.mjs';
import {createMemoryAdapter} from '../../../v3/runtime-source/originals/memory-adapter.mjs';

const scope={chatId:'chat',branchId:'branch'};
async function fixture(count=25){
 const adapter=createMemoryAdapter();let active=0,peak=0,calls=0,measure=false;
 const digest=async value=>{if(!measure)return sha256Utf16(value);active++;calls++;peak=Math.max(peak,active);try{await new Promise(resolve=>setImmediate(resolve));return await sha256Utf16(value);}finally{active--;}};
 const store=createOriginalStore({adapter,bookId:'raw',digest}),ids=[];
 for(let i=0;i<count;i++)ids.push(await store.putHistory({identity:{...scope,messageId:'m'+i},content:'第'+i+'条完整原文。',sourceRevision:'source:'+i,operationId:'put:'+i,expectedVersion:0}));
 return {store:createOriginalStore({adapter,bookId:'raw',digest}),adapter,ids,start:()=>{measure=true;peak=0;calls=0;},counts:()=>({active,peak,calls})};
}
test('fresh original listing overlaps bounded hash checks and preserves all records in adapter order',async()=>{
 const f=await fixture();f.start();const listed=await f.store.listMetadata({scope});
 assert.deepEqual(listed.map(x=>x.identity.messageId),Array.from({length:25},(_,i)=>'m'+i));
 assert(f.counts().peak>1);assert(f.counts().peak<=16);assert.equal(f.counts().active,0);
});
test('every listing revalidates content; a later corrupted record rejects the whole result',async()=>{
 const f=await fixture();await f.store.listMetadata({scope});
 f.adapter.unsafeMutateForTest({bookId:'raw',id:f.ids[20].entryId},entry=>entry.content+='外部改动');
 f.start();await assert.rejects(f.store.listMetadata({scope}),{code:'CONTENT_HASH_MISMATCH'});assert.equal(f.counts().active,0);
});
test('batch failures drain concurrent hashes and keep identity, paragraph and activation checks',async()=>{
 for(const [mutate,code]of [
  [entry=>entry.id='wrong','IDENTITY_MISMATCH'],
  [entry=>entry.original.paragraphs[0].contentEnd--,'PARAGRAPH_INDEX_MISMATCH'],
  [entry=>entry.disable=false,'AUTOINJECTION_ENABLED'],
 ]){
  const f=await fixture(6);f.adapter.unsafeMutateForTest({bookId:'raw',id:f.ids[0].entryId},mutate);f.start();
  await assert.rejects(f.store.listMetadata({scope}),{code});assert.equal(f.counts().active,0);
 }
});
test('batched listing preserves scope and tombstone filtering',async()=>{
 const f=await fixture(3);await f.store.remove({entryId:f.ids[1].entryId,scope,expectedVersion:1,operationId:'delete:1'});
 await f.store.putHistory({identity:{...scope,branchId:'other',messageId:'other'},content:'其他分支。',sourceRevision:'other',operationId:'other',expectedVersion:0});
 assert.deepEqual((await f.store.listMetadata({scope})).map(x=>x.identity.messageId),['m0','m2']);
 assert.deepEqual((await f.store.listMetadata({scope,includeDeleted:true})).map(x=>[x.identity.messageId,x.deleted]),[['m0',false],['m1',true],['m2',false]]);
});

test('unchanged fresh records reuse verified text but changed metadata and failed checks never reuse it',async()=>{
 const f=await fixture(25);f.start();await f.store.listMetadata({scope});assert(f.counts().calls>=25);
 f.start();await f.store.listMetadata({scope});assert.equal(f.counts().calls,0);
 f.adapter.unsafeMutateForTest({bookId:'raw',id:f.ids[2].entryId},entry=>entry.original.paragraphs[0].contentEnd--);
 await assert.rejects(f.store.listMetadata({scope}),{code:'PARAGRAPH_INDEX_MISMATCH'});
 await assert.rejects(f.store.listMetadata({scope}),{code:'PARAGRAPH_INDEX_MISMATCH'});
 f.adapter.unsafeMutateForTest({bookId:'raw',id:f.ids[2].entryId},entry=>entry.original.paragraphs[0].contentEnd++);
 f.start();assert.equal((await f.store.listMetadata({scope})).length,25);assert.equal(f.counts().calls,1);
 await assert.rejects(f.store.metadata({entryId:f.ids[2].entryId,scope:{...scope,branchId:'other'}}),{code:'SCOPE_MISMATCH'});
});
