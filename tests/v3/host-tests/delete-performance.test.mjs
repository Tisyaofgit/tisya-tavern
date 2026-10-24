import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createSourceChain} from '../../../v3/host-sources.mjs';

test('deleting a trailing source has bounded host I/O as retained history grows',()=>{
 const text=execFileSync(process.execPath,[new URL('../../../tools/measure-delete-path.mjs',import.meta.url).pathname],{encoding:'utf8',env:{...process.env,TISYA_PERF_DELAY_MS:'0',TISYA_PERF_SIZES:'3,24'}});
 const {results}=JSON.parse(text),[short,long]=results;
 for(const result of results){
  assert.equal(result.refresh.worldRead,1,'a scan reads one whole original book');
  assert.equal(result.refresh.stableId,2,'a scan synchronizes identity once');
  assert.equal(result.refresh.chatSave,0,'an unchanged source index does not rewrite chat');
  assert.equal(result.refresh.metadataRead,0);
  assert(result.deletion.worldRead<=7,'deletion must not reread the original book per floor');
  assert(result.deletion.stableId<=20,'deletion must not capture identity per floor');
  assert(result.deletion.chatSave<=5,'deletion retains required durable receipts without an unchanged-index save');
  assert.deepEqual(result.verified,{deletedOriginalTombstone:true,invalidationApplied:true,retainedSources:true});
 }
 for(const metric of ['worldRead','worldSave','stableId','chatSave','metadataRead'])assert.equal(short.deletion[metric],long.deletion[metric],`${metric} must not grow with retained floors`);
});

test('scan rejects text, swipe, or message replacement while its original-book snapshot is pending',async()=>{
 for(const change of ['text','swipe','replace']){
  let entered,release;const enteredPromise=new Promise(resolve=>entered=resolve),pending=new Promise(resolve=>release=resolve);
  const context={chat:[{is_user:true,mes:'请继续。'},{is_user:false,mes:'旧回复',swipe_id:0}],chatMetadata:{}};
  const identities={sync:async()=>({chatId:'c',branchId:'b',order:['m0','m1']}),resolve:async()=>assert.fail('A batch scan must use its identity snapshot')};
  const originals={entryIdFor:async identity=>'original:'+identity.messageId,listMetadata:async()=>{entered();await pending;return [];},metadata:async()=>assert.fail('A batch scan must use its original metadata snapshot')};
  const chain=createSourceChain({getContext:()=>context,system:{identities,originals},getNative:()=>null,configuration:()=>({}),guard:()=>{},persist:async()=>assert.fail('An invalidated scan must not persist')});
  const scanning=chain.scan();await enteredPromise;
  if(change==='text')context.chat[1].mes='同时改写了回复';
  if(change==='swipe')context.chat[1].swipe_id=1;
  if(change==='replace')context.chat[1]={...context.chat[1]};
  release();await assert.rejects(scanning,{code:'SOURCE_CHANGED'},change);
 }
});
