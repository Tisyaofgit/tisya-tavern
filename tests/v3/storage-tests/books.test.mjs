import test from 'node:test';
import assert from 'node:assert/strict';
import {createBookManager} from '../../../v3/books.mjs';
import {createWorldbookOriginalAdapter} from '../../../v3/runtime-source/host/worldbook-adapter.mjs';
import {createWorldbookTableStorage} from '../../../v3/runtime-source/host/table-storage.mjs';
import {createOriginalStore} from '../../../v3/runtime-source/originals/original-store.mjs';

const copy=v=>structuredClone(v),code=wanted=>error=>error.code===wanted;
const owner={chatId:'chat-1',branchId:'branch-1'},player={id:'player-1'},preferenceOwner={kind:'player',id:'player-1'};
/** In-memory host fixture, not an Android or Tauri persistence claim. */
function fixture(overrides={}) {
 const docs=new Map(),pointers=new Map(),calls=[],fail={};let globalPointer=null;let id=0,ctx={owner:copy(owner),playerId:player.id,epoch:1},native={locator:'native-1'};
 const key=()=>JSON.stringify(ctx.owner);
 const transport={
  async readFresh(name){calls.push(['read',name]);return docs.has(name)?copy(docs.get(name)):null;},
  async save(name,data){calls.push(['save',name]);if(fail.save)throw Error('save failed');docs.set(name,copy(data));if(fail.corruptReadback)docs.get(name).corrupt=true;},
  createEntry(name,data){const uid=Object.keys(data.entries).map(Number).reduce((max,x)=>Math.max(max,x),-1)+1;const wire={uid,extensions:{},hostDefault:'kept'};data.entries[uid]=wire;return wire;},
 };
 const opts={transport,listNames:async()=>[...docs.keys()],getContext:()=>copy(ctx),assertIdle:()=>{if(fail.busy)throw Error('generation is running');return true;},
  readGlobalMetadata:async()=>copy(globalPointer),saveGlobalMetadata:async(value,{expected})=>{assert.deepEqual(globalPointer,expected);globalPointer=copy(value);},
  readMetadata:async()=>copy(pointers.get(key())??null),saveMetadata:async(pointer,{expected})=>{assert.deepEqual(pointers.get(key())??null,expected);if(fail.pointerBefore)throw Error('pointer failed');pointers.set(key(),copy(pointer));if(fail.pointerAfter)throw Error('ack lost');},
  saveCurrentBranch:async args=>{calls.push(['saveCurrentBranch',copy(args)]);if(fail.draft)return {saved:true,draftSaved:false};return {saved:true,draftSaved:true,nativeCheckpoint:copy(native)};},
  activateChat:async({owner})=>{calls.push(['activateChat',copy(owner)]);if(fail.chat)throw Error('chat failed');ctx.owner=copy(owner);ctx.epoch++;},
  activateUser:async({player})=>{calls.push(['activateUser',copy(player)]);if(fail.user)throw Error('persona failed');ctx.playerId=player.id;},
  restoreNative:async({checkpoint})=>{calls.push(['restoreNative',copy(checkpoint)]);if(fail.native)throw Error('native failed');native=copy(checkpoint);},
  readNative:async()=>copy(native),invalidate:async args=>calls.push(['invalidate',args]),projectLedger:async({state})=>({rows:state.baseView?.rows??[]}),uuid:()=>`test-${++id}`,now:()=> '2026-10-24T06:00:00Z',...overrides};
 const manager=createBookManager(opts);
 return {manager,docs,pointers,transport,opts,calls,fail,get ctx(){return ctx;},set ctx(value){ctx=value;},get native(){return native;},set native(value){native=value;}};
}
async function setup(f=fixture()) {
 const origin=await f.manager.create({kind:'origin',name:'世界初稿',operationId:'origin-create'});
 const core=await f.manager.create({kind:'core',name:'核心',operationId:'core-create'});await f.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'global-initial'});
 const archive=await f.manager.create({kind:'archive',name:'存档甲',origin:{bookId:origin.id},core:{bookId:core.id},player,preferenceOwner,operationId:'archive-create'});
 await f.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'select-initial'});
 return {...f,f,origin,core,archive,runtime:await f.manager.readRuntime()};
}
function ledgerWire(rt,view,content={revision:1}) {
 const wire=rt.transport.createEntry(rt.books.tables,view);
 Object.assign(wire,{content:JSON.stringify(content),disable:true,constant:false,key:[],keysecondary:[],probability:0});
 wire.extensions.tisyaTableLedger={schema:'tisya.ledger-storage/1',owner:copy(owner),revision:content.revision};return wire;
}
function originalWire(rt,view,id='source-1') {
 const wire=rt.transport.createEntry(rt.books.originals,view);
 Object.assign(wire,{content:'1 正文。',disable:true,constant:false,key:[],keysecondary:[],probability:0});wire.extensions.tisyaOriginal={bookId:rt.books.originals,id,version:1};return wire;
}

test('explicit three-book create leaves binding unset; initial selection has distinct A/B routes in one archive',async()=>{
 const f=fixture(),origin=await f.manager.create({kind:'origin',name:'世界',operationId:'o'}),core=await f.manager.create({kind:'core',name:'核心',operationId:'c'});
 assert.equal((await f.manager.binding()).pointer,null);await assert.rejects(f.manager.readRuntime(),code('UNBOUND'));
 const archive=await f.manager.create({kind:'archive',name:'存档',origin:{bookId:origin.id},core:{bookId:core.id},player,preferenceOwner,operationId:'a'});
 assert.equal((await f.manager.binding()).pointer,null);
 await f.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'global'});await f.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'s'});const rt=await f.manager.readRuntime();
 assert.equal(new Set(Object.values(rt.books)).size,3);assert.equal(f.docs.size,3);assert.deepEqual(rt.initialRows,[]);assert.equal(rt.preferenceBookId,core.id);
});
test('new archives require explicit selections and never migrate arbitrary legacy books',async()=>{
 const f=fixture();f.docs.set('legacy',{entries:{0:{uid:0,content:'old-format'}}});
 assert.deepEqual(await f.manager.list(),[]);
 await assert.rejects(f.manager.create({kind:'archive',name:'缺少绑定',operationId:'bad'}),code('BINDING_REFERENCE'));
 assert.equal(f.docs.size,1);
});
test('A/B concurrent saves preserve each namespace, unrelated entries, manifest, and root metadata',async()=>{
 const s=await setup(),{runtime:rt,f,archive}=s;
 const physical=f.docs.get(archive.physicalName);physical.settings={native:'preserve'};physical.entries[99]={uid:99,content:'unrelated',extensions:{outside:true}};
 const [a,b]=await Promise.all([rt.transport.readFresh(rt.books.originals),rt.transport.readFresh(rt.books.tables)]);
 originalWire(rt,a);ledgerWire(rt,b);await Promise.all([rt.transport.save(rt.books.originals,a),rt.transport.save(rt.books.tables,b)]);
 const saved=f.docs.get(archive.physicalName);assert.deepEqual(saved.settings,{native:'preserve'});assert.equal(saved.entries[99].content,'unrelated');
 assert.equal(Object.values(saved.entries).filter(x=>x.extensions?.tisyaOriginal).length,1);assert.equal(Object.values(saved.entries).filter(x=>x.extensions?.tisyaTableLedger).length,1);assert.equal(Object.values(saved.entries).filter(x=>x.extensions?.tisyaBook).length,1);
 assert.ok(Object.values(saved.entries).filter(x=>x.extensions?.tisyaNamespace).every(x=>x.hostDefault==='kept'));
});
test('stale same-namespace whole views are rejected even after a newer view was read',async()=>{
 const {runtime:rt}=await setup();const first=await rt.transport.readFresh(rt.books.originals),stale=await rt.transport.readFresh(rt.books.originals);originalWire(rt,first,'one');originalWire(rt,stale,'two');
 await rt.transport.save(rt.books.originals,first);await rt.transport.readFresh(rt.books.originals);
 await assert.rejects(rt.transport.save(rt.books.originals,stale),code('NAMESPACE_CONFLICT'));assert.equal(Object.keys((await rt.transport.readFresh(rt.books.originals)).entries).length,1);
});
test('foreign namespace and activation attempts fail before persistence',async()=>{
 const {runtime:rt}=await setup();const a=await rt.transport.readFresh(rt.books.originals);const wire=originalWire(rt,a);wire.disable=false;await assert.rejects(rt.transport.save(rt.books.originals,a),code('NAMESPACE_ACTIVATION'));
 wire.disable=true;wire.extensions.tisyaNamespace.logicalId=rt.books.tables;await assert.rejects(rt.transport.save(rt.books.originals,a),code('NAMESPACE_ESCAPE'));
});
test('real W24 original store and ledger adapter persist together, rename keeps original ID and references',async()=>{
 const {runtime:rt,f,archive}=await setup();
 const originals=createOriginalStore({adapter:createWorldbookOriginalAdapter({transport:rt.transport}),bookId:rt.books.originals});
 const ledger=createWorldbookTableStorage({transport:rt.transport,bookId:rt.books.tables,owner,initialState:{revision:0,events:[]}});
 const identity={...owner,messageId:'floor-stable'},body='1 第一段。\n\n2 第二段。';
 const [saved,before]=await Promise.all([originals.put({identity,content:body,sourceRevision:'generation-1',operationId:'raw-1',expectedVersion:0}),ledger.read()]);
 await ledger.compareAndWrite(before.revision,{revision:1,events:[{id:'event-1'}]});const reference=await originals.reference({entryId:saved.entryId,scope:owner,paragraphs:[2]});
 const current=(await f.manager.list('archive'))[0];await f.manager.rename({id:archive.id,name:'改名后的存档',expectedRevision:current.revision,operationId:'rename'});
 const rt2=await f.manager.readRuntime();assert.deepEqual(rt2.books,rt.books);assert.equal(rt2.archive.physicalName,archive.physicalName);assert.equal(rt2.archive.displayName,'改名后的存档');
 const resolved=await originals.resolveReference({reference,scope:owner,purpose:'tool-read'});assert.ok(JSON.stringify(resolved).includes('第二段。'));assert.deepEqual(await ledger.read(),{revision:1,events:[{id:'event-1'}]});
 const reroll=await originals.put({identity,content:'1 换成新段落。',sourceRevision:'generation-2',operationId:'raw-2',expectedVersion:saved.version});assert.equal(reroll.entryId,saved.entryId);await assert.rejects(originals.resolveReference({reference,scope:owner,purpose:'tool-read'}),code('STALE_REFERENCE'));
});
test('rename is revision-checked and operation-idempotent',async()=>{
 const {f,archive}=await setup();const req={id:archive.id,name:'新名字',expectedRevision:0,operationId:'rename-once'};const once=await f.manager.rename(req);const again=await f.manager.rename(req);assert.equal(once.revision,again.revision);
 await assert.rejects(f.manager.rename({...req,name:'另一个名字'}),code('OPERATION_CONFLICT'));
 await assert.rejects(f.manager.rename({...req,operationId:'stale'}),code('BOOK_CONFLICT'));
});
test('changed core does not move the fixed preference bank; old runtime cannot write',async()=>{
 const {f,core,runtime:rt}=await setup();const core2=await f.manager.create({kind:'core',name:'另一基点',operationId:'core-2'});const view=await rt.transport.readFresh(rt.books.originals);originalWire(rt,view);
 await f.manager.select({core:{bookId:core2.id},expectedBindingRevision:0,operationId:'switch-core'});const next=await f.manager.readRuntime();assert.equal(next.core.id,core2.id);assert.equal(next.preferenceBookId,core.id);assert.equal(next.books.preferences,rt.books.preferences);
 await assert.rejects(rt.transport.save(rt.books.originals,view),code('RUNTIME_BINDING_CHANGED'));
});
test('player change requires explicit matching preference owner and isolates P',async()=>{
 const {f,runtime:rt}=await setup();await assert.rejects(f.manager.select({player:{id:'player-2'},expectedBindingRevision:0,operationId:'bad-player'}),code('PREFERENCE_OWNER_REQUIRED'));
 await assert.rejects(f.manager.select({player:{id:'player-2'},preferenceOwner,expectedBindingRevision:0,operationId:'bad-owner'}),code('PREFERENCE_PLAYER'));
 await f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'player-switch'});const next=await f.manager.readRuntime();assert.notEqual(next.books.preferences,rt.books.preferences);assert.equal(f.ctx.playerId,'player-2');
});
test('same account preference owner is explicitly shareable across players',async()=>{
 const {f}=await setup();const account={kind:'account',id:'account-1'};
 await f.manager.select({preferenceOwner:account,expectedBindingRevision:0,operationId:'account'});const first=await f.manager.readRuntime();
 await f.manager.select({player:{id:'player-2'},preferenceOwner:account,expectedBindingRevision:1,operationId:'account-player'});const second=await f.manager.readRuntime();assert.equal(first.books.preferences,second.books.preferences);
});
test('foreign archive switch saves current branch, activates actual chat/user and restores native before pointer',async()=>{
 const {f,origin,core,archive}=await setup();const foreign={chatId:'chat-2',branchId:'branch-2'},checkpoint={locator:'native-2',revision:'r2'};
 const target=await f.manager.create({kind:'archive',name:'存档乙',owner:foreign,origin:{bookId:origin.id},core:{bookId:core.id},player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},nativeCheckpoint:checkpoint,operationId:'archive-2'});
 f.calls.length=0;await f.manager.select({archiveId:target.id,expectedBindingRevision:0,operationId:'switch-archive'});
 assert.deepEqual(f.ctx.owner,foreign);assert.equal(f.ctx.playerId,'player-2');assert.deepEqual(f.native,checkpoint);assert.equal((await f.manager.binding()).pointer.archiveId,target.id);
 const relevant=f.calls.filter(x=>['saveCurrentBranch','activateChat','activateUser','restoreNative'].includes(x[0]));assert.deepEqual(relevant.map(x=>x[0]),['saveCurrentBranch','activateChat','activateUser','restoreNative']);
 assert.equal(f.pointers.get(JSON.stringify(owner)).archiveId,archive.id);
});
test('missing external host capability fails explicitly without committing a pointer',async()=>{
 const f=fixture({activateUser:undefined}),s=await setup(f),before=await f.manager.binding();
 await assert.rejects(f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'no-persona'}),code('CAPABILITY_UNAVAILABLE'));
 assert.deepEqual((await f.manager.binding()).pointer,before.pointer);assert.equal((await f.manager.pending()).length,0);
});
test('draft save failure keeps pointer and binding; intent retries after draft is preserved',async()=>{
 const {f}=await setup();f.ctx={...f.ctx,draft:{text:'unfinished user input'}};f.fail.draft=true;const req={player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'draft-switch'};
 await assert.rejects(f.manager.select(req),code('DRAFT_UNSAVED'));assert.equal((await f.manager.binding()).binding.player.id,'player-1');assert.equal(f.ctx.draft.text,'unfinished user input');assert.equal((await f.manager.pending())[0].phase,'prepared');
 f.fail.draft=false;await f.manager.resume('draft-switch');assert.equal((await f.manager.binding()).binding.player.id,'player-2');assert.equal(f.ctx.draft.text,'unfinished user input');
});
test('failed foreign activation leaves original pointer and durable retry intent',async()=>{
 const {f,origin,core,archive}=await setup();const target=await f.manager.create({kind:'archive',name:'B',owner:{chatId:'chat-2',branchId:'b2'},origin:{bookId:origin.id},core:{bookId:core.id},player,preferenceOwner,nativeCheckpoint:{locator:'2'},operationId:'target'});
 f.fail.chat=true;await assert.rejects(f.manager.select({archiveId:target.id,expectedBindingRevision:0,operationId:'foreign-fail'}),/chat failed/);assert.equal((await f.manager.binding()).pointer.archiveId,archive.id);assert.equal((await f.manager.pending())[0].phase,'saved');
 f.fail.chat=false;await f.manager.resume('foreign-fail');assert.equal((await f.manager.binding()).pointer.archiveId,target.id);
});
test('pointer acknowledgement loss is resolved by direct readback, not a second commit',async()=>{
 const {f}=await setup();f.fail.pointerAfter=true;const result=await f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'ack-lost'});assert.equal(result.status,'complete');assert.equal((await f.manager.pending()).length,0);
});
test('pointer write failure exposes recoverable incomplete binding without default reset',async()=>{
 const {f}=await setup();f.fail.pointerBefore=true;await assert.rejects(f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'pointer-fail'}),/pointer failed/);
 await assert.rejects(f.manager.readRuntime(),code('BINDING_INCOMPLETE'));assert.equal((await f.manager.pending())[0].phase,'binding');f.fail.pointerBefore=false;await f.manager.resume('pointer-fail');assert.equal((await f.manager.readRuntime()).player.id,'player-2');
});
test('concurrent binding requests serialize; stale expected revision cannot overwrite selection',async()=>{
 const {f}=await setup();const requests=[2,3].map(n=>f.manager.select({player:{id:`player-${n}`},preferenceOwner:{kind:'player',id:`player-${n}`},expectedBindingRevision:0,operationId:`concurrent-${n}`}));
 const results=await Promise.allSettled(requests);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.code,'BINDING_CONFLICT');assert.equal((await f.manager.binding()).binding.player.id,'player-2');
});
test('selected immutable definition versions yield initialRows and reject conflicting IDs',async()=>{
 const f=fixture(),row={id:'actor-1',table:'objects',rev:1,values:{名称:'甲',类型:'character'},access:{readers:[],knowers:[]},source:null,lockedFields:[],updatedAt:'2026-10-24T06:00:00Z'},origin=await f.manager.create({kind:'origin',name:'O',definitions:[{id:'world',revision:1,rows:[row]}],operationId:'o'}),core=await f.manager.create({kind:'core',name:'C',definitions:[{id:'character',revision:2,rows:[row]}],operationId:'c'});
 const archive=await f.manager.create({kind:'archive',name:'A',origin:{bookId:origin.id,definitionId:'world',revision:1},core:{bookId:core.id,definitionId:'character',revision:2},player:{id:player.id,objectId:row.id},preferenceOwner,operationId:'a'});await f.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'global'});await f.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'s'});assert.deepEqual((await f.manager.readRuntime()).initialRows,[row]);
 await assert.rejects(f.manager.select({origin:{bookId:origin.id,definitionId:'world',revision:999},expectedBindingRevision:0,operationId:'missing-definition'}),code('DEFINITION_MISSING'));
});
test('creation retry is idempotent and physical rename is never performed',async()=>{
 const f=fixture(),request={kind:'origin',name:'Origin',operationId:'once'},first=await f.manager.create(request),again=await f.manager.create(request);assert.equal(first.id,again.id);assert.equal(f.docs.size,1);assert.equal(f.manager.capabilities.renamePhysicalFiles,false);
 await assert.rejects(f.manager.create({...request,name:'changed'}),code('OPERATION_CONFLICT'));
});
test('real direct readback detects a corrupted physical write',async()=>{
 const {f,archive}=await setup();f.fail.corruptReadback=true;const rt=await f.manager.readRuntime(),view=await rt.transport.readFresh(rt.books.originals);originalWire(rt,view);await assert.rejects(rt.transport.save(rt.books.originals,view),code('NAMESPACE_READBACK'));
 assert.ok(f.docs.get(archive.physicalName).corrupt);
});
test('fork binds a fresh archive after a real host branch transition without copying raw text or native values',async()=>{
 const {f,runtime:rt,archive}=await setup();const view=await rt.transport.readFresh(rt.books.originals);originalWire(rt,view);await rt.transport.save(rt.books.originals,view);
 const sourcePointer=copy((await f.manager.binding()).pointer),targetOwner={chatId:owner.chatId,branchId:'branch-fork'};
 f.ctx={...f.ctx,owner:targetOwner,epoch:2};f.pointers.set(JSON.stringify(targetOwner),sourcePointer);
 const request={source:{archiveId:archive.id,bindingRevision:0},targetOwner,operationId:'fork-1'},next=await f.manager.fork(request);
 assert.notEqual(next.archive.id,archive.id);assert.deepEqual(next.owner,targetOwner);assert.equal(next.books.preferences,rt.books.preferences);assert.deepEqual((await next.transport.readFresh(next.books.originals)).entries,{});assert.deepEqual((await next.transport.readFresh(next.books.tables)).entries,{});assert.deepEqual(f.native,{locator:'native-1'});
 assert.equal((await f.manager.fork(request)).archive.id,next.archive.id);assert.equal((await f.manager.list('archive')).length,2);assert.equal(f.pointers.get(JSON.stringify(owner)).archiveId,archive.id);
});
test('fork rejects an unactivated target and cannot overwrite another archive pointer',async()=>{
 const {f,archive}=await setup();await assert.rejects(f.manager.fork({source:{archiveId:archive.id,bindingRevision:0},targetOwner:{chatId:'new',branchId:'new'},operationId:'not-active'}),code('FORK_OWNER'));
});
test('two managers sharing one physical transport use the same book FIFO without dropping A/B writes',async()=>{
 const {f,runtime:a}=await setup();const second=createBookManager(f.opts),b=await second.readRuntime();const av=await a.transport.readFresh(a.books.originals),bv=await b.transport.readFresh(b.books.tables);originalWire(a,av);ledgerWire(b,bv);
 await Promise.all([a.transport.save(a.books.originals,av),b.transport.save(b.books.tables,bv)]);
 assert.equal(Object.keys((await a.transport.readFresh(a.books.originals)).entries).length,1);assert.equal(Object.keys((await b.transport.readFresh(b.books.tables)).entries).length,1);
});
test('definition selection returns field conflicts without changing the pointer and accepts exact keep-current reviews',async()=>{
 const {f,runtime:rt}=await setup();const known={id:'object-1',table:'objects',rev:1,values:{名称:'新名',类型:'character'},access:{readers:[],knowers:[]},source:null,lockedFields:[],updatedAt:'2026-10-24T06:00:00Z'},defined={...known,values:{名称:'旧名',类型:'character'}};
 const ledger=createWorldbookTableStorage({transport:rt.transport,bookId:rt.books.tables,owner,initialState:{revision:0,baseView:{rows:[known]}}});await ledger.read();await ledger.compareAndWrite(0,{revision:1,baseView:{rows:[known]}});
 const origin=await f.manager.create({kind:'origin',name:'另一个世界',definitions:[{id:'definition',revision:1,rows:[defined]}],operationId:'definition-book'}),request={origin:{bookId:origin.id,definitionId:'definition',revision:1},expectedBindingRevision:0,operationId:'choose-definition'};
 const report=await f.manager.select(request);assert.equal(report.status,'needs-review');assert.equal(report.definitionConflicts.length,1);assert.deepEqual(report.definitionConflicts[0].path,['values','名称']);assert.equal((await f.manager.binding()).pointer.bindingRevision,0);assert.equal((await f.manager.pending()).length,0);
 const conflict=report.definitionConflicts[0];await f.manager.select({...request,definitionResolutions:[{id:conflict.id,fingerprint:conflict.fingerprint,resolution:'retain-current'}]});const result=await f.manager.readRuntime();assert.equal(result.selectedDefinitionRows[0].values.名称,'旧名');assert.equal(result.definitionConflicts[0].currentValue,'新名');const freshLedger=createWorldbookTableStorage({transport:result.transport,bookId:result.books.tables,owner,initialState:{revision:0}});assert.equal((await freshLedger.read()).baseView.rows[0].values.名称,'新名');
});
test('binding intents keep only a draft fingerprint, and new competing switches are blocked',async()=>{
 const {f}=await setup();f.ctx={...f.ctx,draft:'PRIVATE UNSENT INPUT'};f.fail.draft=true;
 await assert.rejects(f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'pending-draft'}),code('DRAFT_UNSAVED'));
 const pending=(await f.manager.pending())[0];assert.equal(JSON.stringify(pending).includes('PRIVATE UNSENT INPUT'),false);assert.equal(pending.sourceDraftFingerprint.length,64);
 await assert.rejects(f.manager.select({player:{id:'player-3'},preferenceOwner:{kind:'player',id:'player-3'},expectedBindingRevision:0,operationId:'competing'}),code('BINDING_PENDING'));
});
test('versioned definition saves validate closure, preserve old revisions, and never move active selection',async()=>{
 const {f,origin}=await setup();const row={id:'object:one',table:'objects',rev:1,values:{名称:'甲',类型:'character'},access:{readers:[],knowers:[]},source:null,lockedFields:[],updatedAt:'2026-10-24T06:00:00Z'},pointer=(await f.manager.binding()).pointer;
 const firstRequest={bookId:origin.id,expectedBookRevision:0,name:'人物版一',rows:[row],operationId:'definition-v1'},first=await f.manager.saveDefinition(firstRequest);
 assert.equal(first.revision,1);assert.equal((await f.manager.saveDefinition(firstRequest)).bookRevision,first.bookRevision);assert.deepEqual((await f.manager.binding()).pointer,pointer);
 const revised={...row,rev:2,values:{...row.values,描述:'新的定义'}};const second=await f.manager.saveDefinition({bookId:origin.id,definitionId:first.definitionId,expectedBookRevision:first.bookRevision,expectedDefinitionRevision:1,name:'人物版二',rows:[revised],operationId:'definition-v2'});
 assert.equal(second.revision,2);assert.deepEqual((await f.manager.readDefinition({bookId:origin.id,definitionId:first.definitionId,revision:1})).rows,[row]);assert.deepEqual((await f.manager.readDefinition({bookId:origin.id,definitionId:first.definitionId,revision:2})).rows,[revised]);
 await assert.rejects(f.manager.saveDefinition({bookId:origin.id,definitionId:first.definitionId,expectedBookRevision:second.bookRevision,expectedDefinitionRevision:1,name:'过期',rows:[row],operationId:'definition-stale'}),code('DEFINITION_CONFLICT'));
 await assert.rejects(f.manager.saveDefinition({bookId:origin.id,expectedBookRevision:second.bookRevision,name:'断链',rows:[{...row,values:{...row.values,关联:['missing']}}],operationId:'definition-open'}),/关联对象不存在/);
 await assert.rejects(f.manager.saveDefinition({bookId:origin.id,expectedBookRevision:second.bookRevision,name:'非法',rows:[{...row,table:'native_cells'}],operationId:'definition-native'}),code('DEFINITION_AUTHORITY'));
});
test('two player preference namespaces in the same core retain separate actual ledgers',async()=>{
 const {f,runtime:first}=await setup();const prefOwner={chatId:'tisya-preferences',branchId:'global'};
 const firstStore=createWorldbookTableStorage({transport:first.transport,bookId:first.books.preferences,owner:prefOwner,initialState:{revision:0,score:0}});await firstStore.read();await firstStore.compareAndWrite(0,{revision:1,score:5});
 await f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'second-player'});const second=await f.manager.readRuntime(),secondStore=createWorldbookTableStorage({transport:second.transport,bookId:second.books.preferences,owner:prefOwner,initialState:{revision:0,score:0}});assert.equal((await secondStore.read()).score,0);await secondStore.compareAndWrite(0,{revision:1,score:-2});
 await f.manager.select({player,preferenceOwner,expectedBindingRevision:1,operationId:'back-player'});const back=await f.manager.readRuntime(),backStore=createWorldbookTableStorage({transport:back.transport,bookId:back.books.preferences,owner:prefOwner,initialState:{revision:0,score:0}});assert.equal((await backStore.read()).score,5);
});
