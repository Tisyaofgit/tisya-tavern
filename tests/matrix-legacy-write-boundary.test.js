import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createBookGateway} from '../tables/books.js';
import {createTableService} from '../tables/service.js';

function fixture(){
 const data=emptyConfig(),ctx={chatId:'boundary',characterId:0,characters:[{avatar:'world.png',name:'原世界'}],chat:[],extensionSettings:{[KEY]:data}};
 data.worlds[worldKey(ctx)]=defaultWorld();
 const saved=new Map(),counts={books:0,bindings:0,settings:0},binding={primary:'',additional:[]};
 let uid=1;
 const helper={getWorldbookNames:async()=>[...saved.keys()],getWorldbook:async name=>structuredClone(saved.get(name)),createWorldbook:async(name,entries)=>{counts.books++;saved.set(name,entries.map(entry=>({...structuredClone(entry),uid:uid++})));return true;},updateWorldbookWith:async(name,fn)=>{counts.books++;saved.set(name,structuredClone(fn(structuredClone(saved.get(name)))));},getCharWorldbookNames:async()=>structuredClone(binding),rebindCharWorldbooks:async(_avatar,value)=>{counts.bindings++;Object.assign(binding,structuredClone(value));}};
 const books=createBookGateway(()=>helper,()=>ctx),store=createStore({getContext:()=>ctx,persist:async()=>{counts.settings++;return true;}});
 const make=matrix=>createTableService({books,store,getContext:()=>ctx,request:async()=>{throw Error('unexpected model call');},...(matrix?{matrixDatabase:{read:async()=>null,commit:async()=>{throw Error('unexpected database write');}}}:{})});
 return {ctx,saved,counts,binding,books,store,make,snapshot:()=>structuredClone({books:[...saved],counts,binding,configuration:store.read().data})};
}

test('Matrix service rejects every legacy ledger initializer before creating books, bindings, or settings',async()=>{
 const f=fixture(),service=f.make(true),before=f.snapshot();
 for(const run of [()=>service.initialize(),()=>service.initialize({originBook:'外部原点',sessionBook:'外部存档'}),()=>service.ensureInitialized({force:true})])await assert.rejects(run,/旧账本.*退出/);
 assert.deepEqual(f.snapshot(),before);
 const s=f.store.read();s.data.worlds[s.key].tables={originBook:'丢失原点',sessionBook:'丢失存档'};await f.store.save(s.data,s.revision,s.key);
 const recovery=await service.storageRecovery(),missingBefore=f.snapshot();assert.equal(recovery.missing.length,2);
 await assert.rejects(service.recoverMissingStorage(recovery),/旧账本.*退出/);assert.deepEqual(f.snapshot(),missingBefore);
});

test('legacy source reads remain available while retired gateway writes cannot create a second ledger',async()=>{
 const f=fixture(),legacy=f.make(false),refs=await legacy.initialize(),source=await f.books.read(refs.originBook),service=f.make(true),before=f.snapshot();
 assert.equal((await service.books.read(refs.originBook)).data.kind,'origin');assert.deepEqual(await service.listCores(refs.originBook),[]);assert.deepEqual(await service.identityOrigins(),[]);
 const next=structuredClone(source.data);next.revision++;
 for(const run of [()=>service.books.create('origin','world.png','另一本原点'),()=>service.books.write(source,next),()=>service.books.bindOrigin('world.png','另一本原点')])await assert.rejects(run,/旧账本.*退出/);
 assert.deepEqual(f.snapshot(),before);
});

test('the explicit legacy service still reads and initializes its original ledger without Matrix ownership',async()=>{
 const f=fixture(),service=f.make(false),first=await service.initialize(),before=f.snapshot();
 assert.equal((await service.books.read(first.originBook)).data.kind,'origin');assert.equal((await service.books.read(first.sessionBook)).data.kind,'session');
 const second=await service.initialize();assert.deepEqual(second,first);assert.equal(f.saved.size,2);assert.equal(f.counts.books,before.counts.books);assert.equal(f.counts.settings,before.counts.settings);
});
