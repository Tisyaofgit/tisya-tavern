import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBookGateway,MATRIX_DEFINITION_FORMAT} from '../tables/books.js';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const schema=Object.fromEntries(catalog.tables.map(t=>[t.id,t]));
const copy=value=>structuredClone(value);
function fixture(){
 const saved=new Map([['任意来源书',[{uid:7,name:'【角色】旧人物',content:'出生于河口，惯常偏头。',enabled:true,custom:{preserve:true}},{uid:9,name:'无关资料',content:'原作者原文',enabled:true}]]]);let writes=0,afterWrite=null;
 const helper={getWorldbookNames:async()=>[...saved.keys()],getWorldbook:async name=>copy(saved.get(name)),createWorldbook:async(name,entries)=>{assert(!saved.has(name));saved.set(name,copy(entries));writes++;if(afterWrite)afterWrite();return true;},updateWorldbookWith:async(name,fn)=>{saved.set(name,copy(fn(copy(saved.get(name)))));writes++;if(afterWrite)afterWrite();}};
 const ctx={loadWorldInfo:async name=>({entries:Object.fromEntries(saved.get(name).map(e=>[e.uid,{...copy(e),comment:e.name}]))})};
 return {saved,books:createBookGateway(()=>helper,()=>ctx),get writes(){return writes;},failAfterWrite(fn){afterWrite=fn;}};
}
const character=(name='阿青')=>({kind:'character',name,summary:'河口旅人。',binding:{entityId:'entity-a',dossierId:'dossier-a'},changes:[{tableId:'T_CHAR_DOSSIER',recordId:'dossier-a',values:{name,public_identity:'河口旅人'}},{tableId:'T_SYS_ENTITIES',recordId:'entity-a',values:{kind:'character',origin_record_ref:'origin-a'}},{tableId:'M_FIELD_REFERENCES',recordId:'origin-a',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'entity-a',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'dossier-a',reference_kind:'record',resolution_status:'resolved'}}]});
test('arbitrary source books expose exact entries and revisions without requiring old origin/session data',async()=>{
 const f=fixture(),choices=await f.books.listSources({book:'任意来源书'});assert.deepEqual(choices.books,['任意来源书']);assert.equal(choices.entries[0].uid,7);assert.equal(choices.entries[0].definition,null);assert.deepEqual(choices.entries[0].entry.custom,{preserve:true});assert.equal(choices.unmarkedEntries.length,1);assert.equal((await f.books.readSource({book:'任意来源书',uid:7})).digest,choices.entries[0].digest);assert.equal(f.writes,0);
});
test('character archive preserves its source and unrelated entries; retries use one definition and original IDs',async()=>{
 const f=fixture(),source=await f.books.readSource({book:'任意来源书',uid:7}),args={...character(),operationId:'create-person',destination:{book:source.book,uid:source.uid},source,schema},plan=await f.books.prepareDefinitionArchive(args);assert.equal(f.writes,0);
 const receipt=await f.books.commitDefinitionArchive(plan);assert(receipt.confirmed);assert.equal(receipt.sourceArchive.uid,7);assert.equal(receipt.bookBefore.entries[0].content,source.content);assert.equal(receipt.bookAfter.entries[0].content,f.saved.get(source.book)[0].content);assert.equal(f.saved.get(source.book)[1].content,'原作者原文');
 const saved=await f.books.readSource(source);assert.equal(saved.definition.format,MATRIX_DEFINITION_FORMAT);assert.equal(saved.definition.source.entry.content,source.content);assert.equal(saved.definition.matrix.changes[0].recordId,'dossier-a');assert.equal(saved.entry.enabled,false);assert(!Object.hasOwn(saved.definition.matrix.changes[0].values,'manifest'));
 assert.equal((await f.books.commitDefinitionArchive(plan)).status,'replayed');const again=await f.books.prepareDefinitionArchive(args);assert.equal((await f.books.commitDefinitionArchive(again)).status,'replayed');assert.equal(f.writes,1);
});
test('new world creates a distinct worldbook with disabled initialization and readable material entries',async()=>{
 const f=fixture(),plan=await f.books.prepareDefinitionArchive({operationId:'world-one',kind:'world',name:'河口世界',summary:'三条河流汇合的渡口。',destination:{book:'河口世界书',newBook:true},changes:[{tableId:'T_STATIC_WORLDS',recordId:'world-a',values:{name:'河口世界',core_proposition:'三河交汇'}}],schema});
 const result=await f.books.commitDefinitionArchive(plan);assert(result.confirmed);assert.equal(f.saved.get('河口世界书').length,2);assert(f.saved.get('河口世界书').every(e=>e.enabled===false));assert.equal(f.saved.get('河口世界书')[1].content,'三条河流汇合的渡口。');assert.equal((await f.books.listSources({book:'河口世界书',kind:'world'})).entries.length,1);
 await assert.rejects(f.books.prepareDefinitionArchive({...character(),operationId:'no-destination',schema}),/请选择/);assert.equal(f.writes,1);
});
test('schema, required fields, unresolved reusable references, collisions and stale snapshots fail before write',async()=>{
 const f=fixture(),base={...character(),operationId:'bad',destination:{book:'任意来源书'},schema};
 const readonly=copy(base);readonly.changes[0].values.char_id='dossier-a';await assert.rejects(f.books.prepareDefinitionArchive(readonly),/程序维护/);
 const missing=copy(base);delete missing.changes[2].values.owner_table;await assert.rejects(f.books.prepareDefinitionArchive(missing),/必填/);
 const dangling=copy(base);dangling.changes[0].values.species_archetype_ref='missing-species';await assert.rejects(f.books.prepareDefinitionArchive(dangling),/引用尚未/);
 const plan=await f.books.prepareDefinitionArchive(base);f.saved.get('任意来源书')[1].content='作者新修订';await assert.rejects(f.books.commitDefinitionArchive(plan),error=>error.archiveReceipt.status==='not-written'&&/已变化/.test(error.message));assert.equal(f.writes,0);assert.equal(f.saved.get('任意来源书')[1].content,'作者新修订');
});
test('lost host acknowledgement exposes a recoverable confirmed receipt and retry does not duplicate',async()=>{
 const f=fixture(),plan=await f.books.prepareDefinitionArchive({...character(),operationId:'recover',destination:{book:'任意来源书'},schema});f.failAfterWrite(()=>{throw Error('宿主回应丢失');});
 await assert.rejects(f.books.commitDefinitionArchive(plan),error=>{assert.equal(error.archiveReceipt.confirmed,true);assert.equal(error.archiveReceipt.status,'written-before-error');assert.deepEqual(error.archivePlan,plan);assert.match(error.message,/宿主回应丢失/);return true;});f.failAfterWrite(null);await f.books.commitDefinitionArchive(plan);assert.equal(f.writes,1);assert.equal((await f.books.listSources({book:'任意来源书'})).entries.length,2);
});
