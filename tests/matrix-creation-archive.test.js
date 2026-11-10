import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';
import {digest} from '../engine/common.mjs';
const clone=structuredClone;
const raw='<reply><title>玄素</title><body>1 在河口谋生的记账人。</body><cells>【人物原点档案／1】\n1 显示名称：玄素\n20 公开身份：渡口记账人\n24 整体体貌：颀长</cells><vars/><archive/></reply>';
async function fixture(){
 const disk=new Map(),books=new Map([['世界源',[{uid:1,name:'世界资料',content:'雾城里有一处渡口。玄素是渡口记账人，身形颀长。',enabled:true}]]]);let bookWrites=0,databaseWrites=0,intentWrites=0,failDatabase=false,afterBook=null;
 const ctx={chatId:'archive-chat',characterId:0,characters:[{avatar:'world.png',data:{name:'雾城',description:'河口世界。',extensions:{world:'世界源'}}}],chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>{},loadWorldInfo:async name=>({entries:Object.fromEntries(books.get(name).map(e=>[e.uid,{...clone(e),comment:e.name}]))})};
 const helper={getWorldbookNames:async()=>[...books.keys()],getWorldbook:async name=>clone(books.get(name)),createWorldbook:async(name,entries)=>{books.set(name,clone(entries));bookWrites++;afterBook?.();return true;},updateWorldbookWith:async(name,fn)=>{books.set(name,clone(fn(clone(books.get(name)))));bookWrites++;afterBook?.();}};
 const sourceBooks=createBookGateway(()=>helper,()=>ctx),storage={get:async id=>clone(disk.get(id)),set:async(id,value)=>disk.set(id,clone(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,clone(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>{}});await host.ensureDatabase();
 const creator=createMatrixCreator({database:{read:()=>host.readDatabase(),commit:async input=>{if(failDatabase&&input.source?.kind!=='creation-intent')throw Error('数据库暂时未确认');const result=await host.commitDatabase(input);if(!result.receipt.replayed){if(input.source?.kind==='creation-intent')intentWrites++;else databaseWrites++;}return result;}},getContext:()=>ctx,request:async()=>raw,sourceBooks,readCharacterBindings:async()=>({primary:'世界源',additional:[]})});
 return {creator,books,sourceBooks,host,ctx,set failDatabase(value){failDatabase=value;},set afterBook(fn){afterBook=fn;},get intentWrites(){return intentWrites;},get bookWrites(){return bookWrites;},get databaseWrites(){return databaseWrites;}};
}
test('worldbook receipt bridges a database failure and same-operation retries without mistaking its own source write for drift',async()=>{
 const f=await fixture(),draft=await f.creator.draft('创建玄素',{kind:'character',mode:'revise',source:await f.sourceBooks.readSource({book:'世界源',uid:1}),destination:{book:'世界源'}}),original=clone(draft.nativeSources);f.failDatabase=true;
 await assert.rejects(f.creator.save(draft),error=>error.archiveReceipt?.confirmed===true&&/数据库暂时未确认/.test(error.message));assert.equal(f.bookWrites,1);assert.equal(f.databaseWrites,0);assert.equal(digest(draft.nativeSources),digest(original));assert(draft.archiveInputDigest);
 f.failDatabase=false;const saved=await f.creator.save(draft);assert.equal(f.bookWrites,1);assert.equal(f.databaseWrites,1);assert(saved.sourceArchive);assert.equal(saved.receipt.result.source.sourceArchive.book,'世界源');assert.equal(f.books.get('世界源')[0].content,'雾城里有一处渡口。玄素是渡口记账人，身形颀长。');assert.equal(f.books.get('世界源').filter(e=>readMatrixDefinition(e)).length,1);
 const again=await f.creator.save(draft);assert(again.receipt.replayed);assert.equal(f.bookWrites,1);assert.equal(f.databaseWrites,1);assert.equal(f.intentWrites,1);
});
test('after an archive receipt, unrelated book edits and changed candidate data are still blocked',async()=>{
 for(const change of ['book','candidate']){const f=await fixture(),draft=await f.creator.draft('创建玄素',{kind:'character',mode:'revise',source:await f.sourceBooks.readSource({book:'世界源',uid:1}),destination:{book:'世界源'}});f.failDatabase=true;await assert.rejects(f.creator.save(draft));f.failDatabase=false;
  if(change==='book')f.books.get('世界源')[0].content='外部作者刚修改的世界';else draft.proposal.matrix.changes.find(c=>c.tableId==='T_CHAR_DOSSIER').values.public_identity='另一个职业';
  await assert.rejects(f.creator.save(draft),change==='book'?/已经变化|回读不一致|保存期间改变/:/不能更换内容/);assert.equal(f.bookWrites,1);assert.equal(f.databaseWrites,0);
 }
});
test('stale database revision is rejected before a reusable source book is written',async()=>{
 const f=await fixture(),draft=await f.creator.draft('创建玄素',{kind:'character',mode:'revise',source:await f.sourceBooks.readSource({book:'世界源',uid:1}),destination:{book:'世界源'}}),snapshot=await f.host.readDatabase();await f.host.commitDatabase({operationId:'other-page',contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,changes:[{tableId:'T_STATIC_WORLDS',recordId:'another',values:{name:'另一记录'}}]});
 await assert.rejects(f.creator.save(draft),/另一页面/);assert.equal(f.bookWrites,0);assert.equal(f.databaseWrites,0);
});
test('a host acknowledgement lost after the source write preserves the confirmed plan and can finish the same operation',async()=>{
 const f=await fixture(),draft=await f.creator.draft('创建玄素',{kind:'character',mode:'revise',source:await f.sourceBooks.readSource({book:'世界源',uid:1}),destination:{book:'世界源'}});f.afterBook=()=>{throw Error('书保存回包丢失');};
 await assert.rejects(f.creator.save(draft),error=>error.archiveReceipt?.confirmed&&error.archivePlan&&/回包丢失/.test(error.message));assert(draft.archiveReceipt.confirmed);assert(draft.archiveInputDigest);assert.equal(f.databaseWrites,0);f.afterBook=null;await f.creator.save(draft);assert.equal(f.bookWrites,1);assert.equal(f.databaseWrites,1);assert.equal(f.intentWrites,1);
});
