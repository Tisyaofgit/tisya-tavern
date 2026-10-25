import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldbookWorkspace} from '../../../v3/worldbook-workspace.mjs';
const copy=structuredClone;
function fixture(){let disk={entries:{0:{uid:0,content:'原文'},1:{uid:1,content:'其他'}}},saved=null,owner='one',reads=0,writes=0,journalFailure=false,saveFailure=false;const transport={readFresh:async()=>{reads++;return copy(disk);},save:async(name,data)=>{writes++;disk=copy(data);if(saveFailure)throw Error('save outcome unknown');},createEntry(name,data){const uid=Object.keys(data.entries).length;return data.entries[uid]={uid};}},journal={read:async()=>copy(saved),write:async value=>{if(journalFailure)throw Error('journal failed');saved=copy(value);}},create=()=>createWorldbookWorkspace({transport,journal,getScope:()=>owner});return {create,transport,journal,get disk(){return disk;},get saved(){return saved;},counts:()=>({reads,writes}),owner:v=>owner=v,failJournal:v=>journalFailure=v,failSave:v=>saveFailure=v};}
test('working reads reuse hydrated books and a whole advance persists once',async()=>{const f=fixture(),w=f.create();await w.readWorking('book');await w.readWorking('book');assert.equal(f.counts().reads,1);await w.run(async()=>{for(const value of ['a','b','c']){const d=await w.readWorking('book');d.entries[0].content=value;await w.save('book',d);assert.equal(f.counts().writes,0);assert.equal(f.disk.entries[0].content,'原文');assert.equal(f.saved.books.book.changes.length,1);}});assert.equal(f.counts().writes,1);assert.equal(f.disk.entries[0].content,'c');assert.equal(f.saved,null);const n=f.counts().reads;await w.readWorking('book');assert.equal(f.counts().reads,n);});
test('merge preserves unrelated external entries while a same-entry edit blocks',async()=>{const f=fixture(),w=f.create();await w.run(async()=>{const d=await w.readWorking('book');d.entries[0].content='ours';await w.save('book',d);f.disk.entries[1].content='external';});assert.equal(f.disk.entries[0].content,'ours');assert.equal(f.disk.entries[1].content,'external');await assert.rejects(w.run(async()=>{const d=await w.readWorking('book');d.entries[0].content='second';await w.save('book',d);f.disk.entries[0].content='conflict';}),{code:'WORKSPACE_CONFLICT'});assert.equal(f.disk.entries[0].content,'conflict');assert(f.saved);assert(w.status().blocked);await assert.rejects(w.readWorking('book'),{code:'WORKSPACE_SYNC_REQUIRED'});});
test('failed physical completion survives recreation and refuses another scope',async()=>{const f=fixture(),w=f.create();f.failSave(true);await assert.rejects(w.run(async()=>{const d=await w.readWorking('book');d.entries[0].content='delivered';await w.save('book',d);}),/outcome unknown/);assert(f.saved);const recovered=f.create();f.owner('other');await assert.rejects(recovered.sync(),{code:'WORKSPACE_OWNER'});assert(f.saved);f.owner('one');f.failSave(false);await recovered.sync();assert.equal(f.saved,null);assert.equal(f.counts().writes,1,'already applied bytes are verified without duplicate save');});
test('journal failure publishes no staged success or changed cache',async()=>{const f=fixture(),w=f.create();const d=await w.readWorking('book');d.entries[0].content='unsaved';f.failJournal(true);await assert.rejects(w.save('book',d),/journal failed/);assert.equal((await w.readWorking('book')).entries[0].content,'原文');assert.equal(f.counts().writes,0);});
test('external save invalidates only the edited book and failed operation retains its delta',async()=>{const f=fixture(),w=f.create();await w.readWorking('a');await w.readWorking('b');const n=f.counts().reads;f.disk.entries[0].content='edited';w.invalidate('a');assert.equal((await w.readWorking('a')).entries[0].content,'edited');await w.readWorking('b');assert.equal(f.counts().reads,n+1);await assert.rejects(w.run(async()=>{const d=await w.readWorking('a');d.entries[0].content='pending';await w.save('a',d);throw Error('operation stopped');}),/operation stopped/);assert(f.saved);await w.sync();assert.equal(f.disk.entries[0].content,'pending');});
test('added and removed entries merge and reverting a staged edit clears its journal',async()=>{const f=fixture(),w=f.create();await w.run(async()=>{let d=await w.readWorking('book');d.entries[2]={uid:2,content:'new'};delete d.entries[1];await w.save('book',d);});assert.equal(f.disk.entries[2].content,'new');assert.equal(f.disk.entries[1],undefined);const count=f.counts().writes;await w.run(async()=>{let d=await w.readWorking('book');d.entries[0].content='temporary';await w.save('book',d);d=await w.readWorking('book');d.entries[0].content='原文';await w.save('book',d);});assert.equal(f.saved,null);assert.equal(f.counts().writes,count);});

test('coalesced readers both succeed but an external invalidation rejects an in-flight old document',async()=>{
 const f=fixture();let finish;f.transport.readFresh=()=>new Promise(resolve=>finish=resolve);const w=f.create(),a=w.readWorking('book'),b=w.readWorking('book');await new Promise(r=>setImmediate(r));finish(copy(f.disk));assert.deepEqual(await a,await b);
 w.invalidate('book');const stale=w.readWorking('book');await new Promise(r=>setImmediate(r));w.invalidate('book');finish(copy(f.disk));await assert.rejects(stale,{code:'WORKSPACE_CHANGED'});
});

import {IDBFactory} from 'fake-indexeddb';
import {createDurableWorkspace} from '../../../v3/durable-workspace.mjs';
test('settled working books survive recreation, reuse across operations and check external changes before send',async()=>{
 const f=fixture(),indexedDB=new IDBFactory();let cache=createDurableWorkspace({indexedDB});let card='a';const owner=()=>({account:'one',cardId:card,cardName:card});const make=()=>createWorldbookWorkspace({transport:f.transport,journal:f.journal,getScope:()=>card,durableCache:cache,getDurableOwner:owner});let w=make();await w.readWorking('book');const n=f.counts().reads;await w.run(async()=>{await w.readWorking('book');});assert.equal(f.counts().reads,n,'unchanged operation does not discard hydrated book');w.dispose();await cache.dispose();cache=createDurableWorkspace({indexedDB});w=make();assert.equal((await w.readWorking('book')).entries[0].content,'原文');assert.equal(f.counts().reads,n,'cold restore reads local durable copy');assert.equal(w.status().unverifiedBooks,1);await w.checkpoint();assert.equal(f.counts().reads,n+1);assert.equal(w.status().unverifiedBooks,0);f.disk.entries[0].content='outside';await assert.rejects(w.checkpoint(),{code:'WORKSPACE_CHANGED'});assert.equal((await w.readWorking('book')).entries[0].content,'outside');
 card='b';w.contextChanged();await w.readWorking('book');const after=f.counts().reads;card='a';w.contextChanged();assert.equal((await w.readWorking('book')).entries[0].content,'outside');assert.equal(f.counts().reads,after,'switching back keeps its earlier working book');assert.equal((await cache.list()).length,2);await cache.dispose();
});
test('external edit removes durable aliases, while pending journal cannot be cleared',async()=>{
 const f=fixture(),cache=createDurableWorkspace({indexedDB:new IDBFactory()}),w=createWorldbookWorkspace({transport:f.transport,journal:f.journal,getScope:()=> 'same',durableCache:cache,getDurableOwner:()=>({account:'a',cardId:'c',cardName:'card'})});await w.readWorking('book');f.disk.entries[0].content='new';w.invalidate('book');assert.equal((await w.readWorking('book')).entries[0].content,'new');await assert.rejects(w.run(async()=>{const d=await w.readWorking('book');d.entries[0].content='pending';await w.save('book',d);throw Error('stopped');}),/stopped/);assert.throws(()=>w.clearMemory(),{code:'WORKSPACE_BUSY'});assert(f.saved);await w.sync();assert.equal(f.disk.entries[0].content,'pending');await cache.dispose();
});

test('invalidated or switched consumed documents cannot pass the send checkpoint',async()=>{
 const f=fixture(),w=f.create();await w.readWorking('book');w.invalidate('book');await assert.rejects(w.checkpoint(),{code:'WORKSPACE_CHANGED'});await w.readWorking('book');w.contextChanged();await assert.rejects(w.checkpoint(),{code:'WORKSPACE_CHANGED'});
 await assert.rejects(w.run(async()=>{await w.readWorking('book');w.invalidate('book');await w.readWorking('book');}),{code:'WORKSPACE_CHANGED'});
});

test('a delayed local journal cannot publish one card data into another card cache',async()=>{
 const f=fixture();let card='A',release,entered;const enteredPromise=new Promise(r=>entered=r),base=f.journal.write;f.journal.write=async value=>{entered();await new Promise(r=>release=r);await base(value);};
 const w=createWorldbookWorkspace({transport:f.transport,journal:f.journal,getScope:()=>card,getDurableOwner:()=>({account:'account',cardId:card,cardName:card})});
 const job=w.run(async()=>{const d=await w.readWorking('book');d.entries[0].content='A edited';await w.save('book',d);});await enteredPromise;card='B';w.contextChanged();release();await assert.rejects(job,{code:'WORKSPACE_OWNER'});assert.equal(f.saved.owner,JSON.stringify('A'));
 card='A';w.contextChanged();f.journal.write=base;await w.sync();f.disk.entries[0].content='B actual';card='B';w.contextChanged();assert.equal((await w.readWorking('book')).entries[0].content,'B actual');
});
test('actual physical commit checkpoints its binding and does not clear pending on failure',async()=>{
 const f=fixture();let calls=0,reject=true;const w=createWorldbookWorkspace({transport:f.transport,journal:f.journal,getScope:()=> 'one',beforePersist:async()=>{calls++;if(reject)throw Error('binding changed');return {guard(){}};}});
 await assert.rejects(w.run(async()=>{const data=await w.readWorking('book');data.entries[0].content='change';await w.save('book',data);}),/binding changed/);assert.equal(calls,1);assert.equal(f.counts().writes,0);assert(f.saved);reject=false;await w.sync();assert.equal(f.counts().writes,1);assert.equal(f.saved,null);
});

function dependencyFixture(){
 const disk=new Map(),reads=[];let pending=null,card='card',account='account';const transport={readFresh:async name=>{reads.push(name);return copy(disk.get(name)??null);},save:async(name,data)=>disk.set(name,copy(data)),createEntry(){throw Error('unused');}},journal={read:async()=>copy(pending),write:async value=>{pending=copy(value);}},make=()=>createWorldbookWorkspace({transport,journal,getScope:()=>({account,card}),getDurableOwner:()=>({account,cardId:card,cardName:card})});
 for(let i=0;i<22;i++)disk.set('book-'+i,{entries:{0:{uid:0,content:'book-'+i},1:{uid:1,content:'other'}}});
 return {disk,reads,transport,make,get pending(){return pending;},setCard(value){card=value;},setAccount(value){account=value;}};
}

test('send checkpoint verifies explicit material and operation reads, not the full scanned cache',async()=>{
 const f=dependencyFixture(),w=f.make();for(const name of f.disk.keys())await w.readWorking(name,{consume:false});const material=await w.readWorking('book-0',{consume:false}),token=w.prepare(material);f.reads.length=0;
 await w.run(async()=>{await w.readWorking('book-1');for(const name of f.disk.keys())await w.readWorking(name,{consume:false});f.disk.get('book-21').entries[0].content='unrelated edit';assert.deepEqual(await w.checkpoint(),{verified:2});},{dependencies:[copy(token)]});
 assert.deepEqual(f.reads,['book-0','book-1']);
});

test('an old material token cannot be renewed by rereading its invalidated document',async()=>{
 const f=dependencyFixture(),w=f.make(),token=w.prepare(await w.readWorking('book-0'));w.invalidate('book-0');const current=await w.readWorking('book-0');let entered=false;
 await assert.rejects(w.run(async()=>{entered=true;},{dependencies:[token]}),{code:'WORKSPACE_CHANGED'});assert.equal(entered,false);
 await w.run(()=>w.checkpoint(),{dependencies:[w.prepare(current)]});
 assert.throws(()=>w.prepare(copy(current)),{code:'WORKSPACE_DEPENDENCY'});
});

test('a silent external mismatch keeps old material rejected after the cache has adopted current bytes',async()=>{
 const f=dependencyFixture(),w=f.make(),token=w.prepare(await w.readWorking('book-0'));f.disk.get('book-0').entries[0].content='outside';
 await assert.rejects(w.run(()=>w.checkpoint(),{dependencies:[token]}),{code:'WORKSPACE_CHANGED'});
 const current=await w.readWorking('book-0');assert.equal(current.entries[0].content,'outside');await assert.rejects(w.run(()=>w.checkpoint(),{dependencies:[token]}),{code:'WORKSPACE_CHANGED'});
 await w.run(()=>w.checkpoint(),{dependencies:[w.prepare(current)]});
});

test('fresh reads invalidate old material while ordinary local delta saves preserve its dependency',async()=>{
 const f=dependencyFixture(),w=f.make(),token=w.prepare(await w.readWorking('book-0'));
 await w.run(async()=>{const data=await w.readWorking('book-0');data.entries[1].content='local preference';await w.save('book-0',data);await w.checkpoint();},{dependencies:[token]});
 await w.run(()=>w.checkpoint(),{dependencies:[token]});
 f.disk.get('book-0').entries[0].content='outside';const current=await w.readFresh('book-0',{consume:false});await assert.rejects(w.run(()=>w.checkpoint(),{dependencies:[token]}),{code:'WORKSPACE_CHANGED'});await w.run(()=>w.checkpoint(),{dependencies:[w.prepare(current)]});
});

test('external changes merged by the physical flush also invalidate old material tokens',async()=>{
 const f=dependencyFixture(),w=f.make(),token=w.prepare(await w.readWorking('book-0'));
 await w.run(async()=>{const data=await w.readWorking('book-0');data.entries[1].content='local preference';await w.save('book-0',data);f.disk.get('book-0').entries[0].content='outside';},{dependencies:[token]});
 assert.equal(f.disk.get('book-0').entries[1].content,'local preference');assert.equal(f.pending,null);await assert.rejects(w.run(()=>w.checkpoint(),{dependencies:[token]}),{code:'WORKSPACE_CHANGED'});
});

test('mismatched sources preserve every pending book until explicit merge sync',async()=>{
 const f=dependencyFixture(),w=f.make(),tokens=[];for(const name of ['book-0','book-1'])tokens.push(w.prepare(await w.readWorking(name)));
 await assert.rejects(w.run(async()=>{for(const name of ['book-0','book-1']){const data=await w.readWorking(name);data.entries[0].content='local';await w.save(name,data);}f.disk.get('book-1').entries[1].content='outside';await w.checkpoint();},{dependencies:tokens}),{code:'WORKSPACE_CHANGED'});
 assert.deepEqual(Object.keys(f.pending.books),['book-0','book-1']);assert.equal(w.status().blocked,true);await w.sync();assert.equal(f.pending,null);assert.equal(f.disk.get('book-0').entries[0].content,'local');assert.equal(f.disk.get('book-1').entries[0].content,'local');assert.equal(f.disk.get('book-1').entries[1].content,'outside');
 await assert.rejects(w.run(()=>w.checkpoint(),{dependencies:tokens}),{code:'WORKSPACE_CHANGED'});
});

test('dependency tokens cannot cross a card, account, context epoch or workspace recreation',async()=>{
 const f=dependencyFixture(),w=f.make(),token=w.prepare(await w.readWorking('book-0'));f.setCard('other');assert.throws(()=>w.consume([token]),{code:'WORKSPACE_CHANGED'});f.setCard('card');f.setAccount('other');assert.throws(()=>w.consume([token]),{code:'WORKSPACE_CHANGED'});f.setAccount('account');w.contextChanged();assert.throws(()=>w.consume([token]),{code:'WORKSPACE_CHANGED'});assert.throws(()=>f.make().consume([token]),{code:'WORKSPACE_DEPENDENCY'});
});

test('same-scope context invalidation during a checkpoint cannot approve consumed data',async()=>{
 const f=dependencyFixture(),w=f.make(),token=w.prepare(await w.readWorking('book-0'));const original=f.transport.readFresh;f.transport.readFresh=async name=>{const data=await original(name);w.contextChanged();return data;};await assert.rejects(w.run(()=>w.checkpoint(),{dependencies:[token]}),{code:'WORKSPACE_CHANGED'});
});

test('an independent read scope clears the previous card and epoch while retaining explicit current sources',async()=>{
 const f=dependencyFixture(),w=f.make();await w.beginReads();await w.readWorking('book-0');f.setCard('other');w.contextChanged();const config=w.prepare(await w.readWorking('book-1',{consume:false}));await w.beginReads([config]);f.reads.length=0;assert.deepEqual(await w.checkpoint(),{verified:1});assert.deepEqual(f.reads,['book-1']);
 w.contextChanged();await w.readWorking('book-2',{consume:false});await w.beginReads();f.reads.length=0;assert.deepEqual(await w.checkpoint(),{verified:0});assert.deepEqual(f.reads,[]);
});

test('an independent helper inside an active run adds dependencies without erasing consumed or staged sources',async()=>{
 const f=dependencyFixture(),w=f.make(),config=w.prepare(await w.readWorking('book-0',{consume:false}));await w.run(async()=>{const data=await w.readWorking('book-1');data.entries[0].content='staged';await w.save('book-1',data);await w.beginReads([config]);await w.beginReads([]);assert.deepEqual(await w.checkpoint(),{verified:2});w.invalidate('book-0');await w.beginReads([]);await assert.rejects(w.checkpoint(),{code:'WORKSPACE_CHANGED'});});
});

test('independent read scope cannot clear an unfinished journal',async()=>{
 const f=dependencyFixture(),w=f.make();await assert.rejects(w.run(async()=>{const data=await w.readWorking('book-0');data.entries[0].content='pending';await w.save('book-0',data);throw Error('stop');}),/stop/);await assert.rejects(w.beginReads(),{code:'WORKSPACE_SYNC_REQUIRED'});assert(f.pending);await w.sync();await w.beginReads();assert.equal(f.pending,null);
});

test('physical flush refuses a same-book edit or context epoch change across either pre-write await',async()=>{
 for(const phase of ['read','binding'])for(const change of ['book','epoch']){
  const f=dependencyFixture();let w,arm=false,writes=0;const mutate=()=>{if(!arm)return;arm=false;if(change==='book'){f.disk.get('book-0').entries[1].content='external';w.invalidate('book-0');}else w.contextChanged();};const read=f.transport.readFresh,save=f.transport.save;f.transport.readFresh=async name=>{const data=await read(name);if(phase==='read')mutate();return data;};f.transport.save=async(...args)=>{writes++;return save(...args);};let pending=null;
  w=createWorldbookWorkspace({transport:f.transport,journal:{read:async()=>copy(pending),write:async value=>{pending=copy(value);}},getScope:()=> 'same',beforePersist:async()=>{if(phase==='binding')mutate();return {guard(){}};}});
  await assert.rejects(w.run(async()=>{const data=await w.readWorking('book-0');data.entries[0].content='ours';await w.save('book-0',data);arm=true;}),{code:'WORKSPACE_CHANGED'});assert.equal(writes,0,phase+':'+change);assert(pending?.books['book-0']);assert.equal(f.disk.get('book-0').entries[0].content,'book-0');await w.sync();assert.equal(f.disk.get('book-0').entries[0].content,'ours');if(change==='book')assert.equal(f.disk.get('book-0').entries[1].content,'external');assert.equal(pending,null);
 }
});

test('preflight rejection synchronizes only preparation and preserves the original failure',async()=>{
 const f=fixture(),w=f.create(),error=Object.assign(Error('SAFETY'),{code:'TISYA_RESPONSE_FILTERED',preflightRequestFailed:true});
 await assert.rejects(w.run(async()=>{const d=await w.readWorking('book');d.entries[0].content='preparation';await w.save('book',d);throw error;}),e=>e===error&&e.workspacePreparationSaved===true);
 assert.equal(f.disk.entries[0].content,'preparation');assert.equal(f.saved,null);assert.equal(w.status().blocked,false);await w.run(async()=>{});
});
test('preflight rejection never retries an uncertain physical save or discards its journal',async()=>{
 const f=fixture(),w=f.create(),error=Object.assign(Error('filtered'),{preflightRequestFailed:true});f.failSave(true);
 await assert.rejects(w.run(async()=>{const d=await w.readWorking('book');d.entries[0].content='preparation';await w.save('book',d);throw error;}),e=>e===error&&/outcome unknown/.test(e.workspaceSyncError.message));
 assert.equal(f.counts().writes,1);assert(f.saved);assert(w.status().blocked);assert.equal(error.workspacePreparationSaved,undefined);await assert.rejects(w.run(async()=>{}),{code:'WORKSPACE_SYNC_REQUIRED'});assert.equal(f.counts().writes,1);
});
test('a failed preflight in a changed owner never flushes another chat',async()=>{
 const f=fixture(),w=f.create(),error=Object.assign(Error('filtered'),{preflightRequestFailed:true});
 await assert.rejects(w.run(async()=>{const d=await w.readWorking('book');d.entries[0].content='preparation';await w.save('book',d);f.owner('other');throw error;}),e=>e===error);
 assert.equal(f.counts().writes,0);assert(f.saved);assert(w.status().blocked);assert.equal(error.workspacePreparationSaved,undefined);
});
