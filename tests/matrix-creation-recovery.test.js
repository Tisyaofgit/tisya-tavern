import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';
import {materials} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
const clone=structuredClone;
const raw='<reply><title>渡口旅人</title><body>1 这是作者资料。</body><cells>【人物原点档案／1】\n1 显示名称：渡口旅人\n20 公开身份：旅人</cells><vars/><archive/></reply>';
async function fixture(){
 const disk=new Map(),books=new Map([['世界源',[{uid:1,name:'世界资料',content:'河口有一位旅人。',enabled:true}]]]);
 const counts={intent:0,business:0,book:0,model:0};let failure=null;
 const ctx={chatId:'recovery-chat',characterId:0,characters:[{avatar:'world.png',data:{name:'河口',extensions:{world:'世界源'}}}],chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>{},loadWorldInfo:async name=>books.has(name)?({entries:Object.fromEntries(books.get(name).map(e=>[e.uid,{...clone(e),comment:e.name}]))}):undefined};
 const helper={getWorldbookNames:async()=>[...books.keys()],getWorldbook:async name=>clone(books.get(name)),createWorldbook:async(name,entries)=>{books.set(name,clone(entries));counts.book++;return true;},updateWorldbookWith:async(name,fn)=>{books.set(name,clone(fn(clone(books.get(name)))));counts.book++;if(failure==='book-ack')throw Error('书回包丢失');}};
 const sourceBooks=createBookGateway(()=>helper,()=>ctx),storage={get:async id=>clone(disk.get(id)),set:async(id,value)=>disk.set(id,clone(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,clone(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>{}});await host.ensureDatabase();
 const database={read:()=>host.readDatabase(),commit:async input=>{const kind=input.source?.kind==='creation-intent'?'intent':'business';if(failure===kind)throw Error(kind+' 未写入');const result=await host.commitDatabase(input);if(!result.receipt.replayed)counts[kind]++;if(failure===kind+'-ack')throw Error(kind+' 回包丢失');return result;}};
 const cold=()=>createMatrixCreator({database,getContext:()=>ctx,request:async()=>{counts.model++;return raw;},sourceBooks,readCharacterBindings:async()=>({primary:'世界源',additional:[]})});
 const creator=cold(),draft=await creator.draft('private-recovery-goal-only',{kind:'character',mode:'revise',source:await sourceBooks.readSource({book:'世界源',uid:1}),destination:{book:'世界源'}});
 return {creator,cold,draft,host,books,ctx,counts,set failure(value){failure=value;}};
}
test('confirmed creation intent survives a cold reopen and resumes one source archive and one business commit',async()=>{
 const f=await fixture();assert.deepEqual(f.counts,{intent:0,business:0,book:0,model:1});f.failure='business';
 await assert.rejects(f.creator.save(f.draft),e=>e.archiveReceipt?.confirmed===true);assert.deepEqual(f.counts,{intent:1,business:0,book:1,model:1});
 const cold=f.cold(),pending=await cold.pending();assert.equal(pending.operationId,f.draft.operationId);assert.deepEqual(pending.nativeSources,f.draft.nativeSources);assert(pending.archiveReceipt.confirmed);assert.equal(pending.expectedRevision,f.draft.expectedRevision);
 f.failure=null;await cold.save(pending);assert.equal(await cold.pending(),null);await cold.save(pending);assert.deepEqual(f.counts,{intent:1,business:1,book:1,model:1});
 assert.equal(f.books.get('世界源').filter(e=>readMatrixDefinition(e)).length,1);
 const slots=materials(new Runtime((await f.host.readDatabase()).state));assert(!JSON.stringify(slots).includes('private-recovery-goal-only'));
});
test('intent persistence failure cannot write a source book and the same draft retries after recovery',async()=>{
 const f=await fixture();f.failure='intent';await assert.rejects(f.creator.save(f.draft),e=>e.archiveReceipt?.confirmed===false&&!!e.draft);assert.deepEqual(f.counts,{intent:0,business:0,book:0,model:1});assert.equal(await f.cold().pending(),null);
 f.failure=null;await f.creator.save(f.draft);assert.deepEqual(f.counts,{intent:1,business:1,book:1,model:1});
});
test('lost intent acknowledgement resumes from confirmed stored input without repeating the intent',async()=>{
 const f=await fixture();f.failure='intent-ack';await assert.rejects(f.creator.save(f.draft),/回包丢失/);assert.deepEqual(f.counts,{intent:1,business:0,book:0,model:1});
 const cold=f.cold(),pending=await cold.pending();assert.equal(pending.operationId,f.draft.operationId);assert.equal(pending.archiveReceipt.confirmed,false);f.failure=null;await cold.save(pending);assert.deepEqual(f.counts,{intent:1,business:1,book:1,model:1});
});
test('lost archive acknowledgement is recovered read-only before the original database submission resumes',async()=>{
 const f=await fixture();f.failure='book-ack';await assert.rejects(f.creator.save(f.draft),e=>e.archiveReceipt?.confirmed===true);const before=clone(f.counts),cold=f.cold(),pending=await cold.pending();assert(pending.archiveReceipt.confirmed);assert.deepEqual(f.counts,before);
 f.failure=null;await cold.save(pending);assert.deepEqual(f.counts,{intent:1,business:1,book:1,model:1});
});
test('pending creation cannot be replaced or silently followed by a second new draft',async()=>{
 const f=await fixture();f.failure='business';await assert.rejects(f.creator.save(f.draft));f.failure=null;const cold=f.cold(),pending=await cold.pending(),changed=clone(pending);changed.goal='changed';
 await assert.rejects(cold.save(changed),/不能更换内容/);await assert.rejects(cold.draft('new',{kind:'character',mode:'revise'}),/未完成创作/);assert.deepEqual(f.counts,{intent:1,business:0,book:1,model:1});
});
test('pending creation is scoped to its original chat and preserves concurrent database changes',async()=>{
 const f=await fixture();f.failure='intent-ack';await assert.rejects(f.creator.save(f.draft));f.failure=null;const pending=await f.cold().pending(),snapshot=await f.host.readDatabase();
 await f.host.commitDatabase({operationId:'other',expectedRevision:snapshot.revision,contextKey:snapshot.contextKey,changes:[{tableId:'T_STATIC_WORLDS',recordId:'another',values:{name:'另外的世界'}}]});
 await assert.rejects(f.cold().save(pending),/另一页面/);assert.equal(f.counts.book,0);assert.equal((await f.host.readDatabase()).state.tables.T_STATIC_WORLDS.another.values.name,'另外的世界');
 f.ctx.chatId='another-chat';assert.equal(await f.cold().pending(),null);await assert.rejects(f.cold().save(pending),/另一聊天/);
});
