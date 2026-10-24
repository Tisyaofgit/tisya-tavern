import test from 'node:test';
import assert from 'node:assert/strict';
import {createTauriWorldbookTransport} from '../v3/runtime-source/host/worldbook-adapter.mjs';
import {createBookManager} from '../v3/books.mjs';
import {createConfigurationBook} from '../v3/configuration-book.mjs';
import {createStore,worldKey} from '../config/core.js';
import {GLOBAL_WORLD} from '../v3/configuration-scope.mjs';
import {createNativeBookHost,GLOBAL_BOOK_KEY} from '../v3/book-host.mjs';
import {mountWorkbench} from '../v3/workbench.mjs';
import {Window} from 'happy-dom';
const copy=structuredClone;

function fixture(){
 const disk=new Map(),writes=[];let pointer=null,globalPointer=null,fail=false,lostAck=false;
 let ctx={chatId:'one',characterId:0,characters:[{avatar:'card.png'}],chatMetadata:{},extensionSettings:{},playerId:'alpha',owner:{chatId:'story',branchId:'one'},epoch:0};
 const transport=createTauriWorldbookTransport({
  fetch:async(url,options)=>{if(url==='/api/settings/get')return new Response(JSON.stringify({world_names:[...disk.keys()]}));const {name}=JSON.parse(options.body);return new Response(JSON.stringify(disk.get(name)??{entries:{}}));},
  worldInfo:{saveWorldInfo:async(name,data)=>{if(fail)throw Error('disk unavailable');disk.set(name,copy(data));writes.push(name);if(lostAck){lostAck=false;throw Error('ack lost');}},discardWorldInfoDocument(){},createWorldInfoEntry(name,data){let uid=0;while(data.entries[uid])uid++;return data.entries[uid]={uid};}}
 });
 const callbacks={transport,listNames:async()=>[...disk.keys()],getContext:()=>ctx,assertIdle:()=>true,readMetadata:async()=>copy(pointer),saveMetadata:async(p,{expected})=>{assert.deepEqual(pointer,expected);pointer=copy(p);ctx.chatMetadata.tisya_v3_books=copy(p);},readGlobalMetadata:async()=>copy(globalPointer),saveGlobalMetadata:async(p,{expected})=>{assert.deepEqual(globalPointer,expected);globalPointer=copy(p);ctx.extensionSettings.tisya_v3_global=copy(p);},activateUser:async({player})=>{ctx.playerId=player.id;},invalidate:async()=>{},saveCurrentBranch:async()=>({saved:true,draftSaved:true}),readNative:async()=>({native:'unchanged'}),projectLedger:()=>[]};
 const books=createBookManager(callbacks);
 const store=createStore({getContext:()=>ctx,persist:async()=>true});
 const configuration=createConfigurationBook({books,store,getContext:()=>ctx,getPlayerId:()=>ctx.playerId});
 async function core(name='Base'){const b=await books.create({kind:'core',name,operationId:'core:'+name});const state=await books.globalBinding();await books.selectGlobalCore({coreId:b.id,expectedRevision:state.pointer?.revision??null,operationId:'global:'+b.id});return b;}
 async function archive(core,name='Archive'){const origin=await books.create({kind:'origin',name:'Origin',operationId:'origin:'+name});const b=await books.create({kind:'archive',name,operationId:'archive:'+name,core:{bookId:core.id},origin:{bookId:origin.id},player:{id:ctx.playerId,name:ctx.playerId},preferenceOwner:{kind:'player',id:ctx.playerId}});await books.select({archiveId:b.id,expectedBindingRevision:pointer?.bindingRevision??null,operationId:'select:'+b.id});return b;}
 return {disk,writes,transport,callbacks,books,store,configuration,core,archive,get ctx(){return ctx;},switch(id,player='alpha'){ctx={...ctx,chatId:id,chatMetadata:{},owner:{chatId:id,branchId:id},playerId:player,epoch:ctx.epoch+1};pointer=null;},noChat(){ctx={...ctx,chatId:null,owner:null,chatMetadata:{}};pointer=null;},set fail(v){fail=v;},set lostAck(v){lostAck=v;}};
}

test('TT missing 200 empty document is absent; a genuinely empty book is preserved',async()=>{
 const f=fixture();assert.equal(await f.transport.readFresh('missing'),null);
 f.disk.set('empty',{entries:{}});assert.deepEqual(await f.transport.readFresh('empty'),{entries:{}});
 const b=await f.core();assert.equal((await f.books.list('core')).length,1);assert(f.disk.has(b.physicalName));
 assert.deepEqual(f.disk.get('empty'),{entries:{}});
});
test('UUID collision with an existing empty physical book is rejected without overwriting it',async()=>{
 const f=fixture();f.disk.set('Tisya-core-fixed',{entries:{}});const manager=createBookManager({...f.callbacks,uuid:()=> 'fixed'});
 await assert.rejects(manager.create({kind:'core',name:'Collision',operationId:'collision'}),e=>e.code==='BOOK_EXISTS');assert.deepEqual(f.disk.get('Tisya-core-fixed'),{entries:{}});assert.equal(f.writes.length,0);
});
test('inventory failure cannot be interpreted as missing, and non-empty documents are not reclassified',async()=>{
 let empty=true;const t=createTauriWorldbookTransport({fetch:async url=>url==='/api/settings/get'?new Response('failure',{status:500}):new Response(JSON.stringify({entries:empty?{}:{0:{uid:0,content:'keep'}}})),worldInfo:{saveWorldInfo(){throw Error('must not save');},createWorldInfoEntry(){},discardWorldInfoDocument(){}}});
 await assert.rejects(t.readFresh('unknown'),e=>e.code==='WORLD_INVENTORY_FAILED');empty=false;assert.equal((await t.readFresh('known')).entries[0].content,'keep');
});
test('create retry after lost acknowledgement reuses the same durable identity',async()=>{
 const f=fixture(),request={kind:'core',name:'Retry',operationId:'stable-create'};f.lostAck=true;
 await assert.rejects(f.books.create(request),/ack lost/);const b=await f.books.create(request);assert.equal(f.writes.length,1);assert.equal((await f.books.list()).length,1);assert.equal(b.id,(await f.books.list())[0].id);
});
test('global core and configuration can initialize and rename without any chat or player',async()=>{
 const f=fixture();f.noChat();const base=await f.core();await f.configuration.hydrate({initializeIfMissing:true});assert.equal(f.configuration.read().owner.kind,'global');
 await f.books.rename({id:base.id,name:'My global base',expectedRevision:0,operationId:'rename'});assert.equal((await f.books.globalBinding()).core.displayName,'My global base');
 assert.equal(f.store.read().key,GLOBAL_WORLD);
});
test('all users, chats, branches and cold sessions read the same configuration revision',async()=>{
 const f=fixture(),base=await f.core();await f.configuration.hydrate({initializeIfMissing:true});const a=await f.archive(base);
 await f.configuration.hydrate();let view=f.store.read();view.world.modes.narrative.缇斯亚聊天模式='with-story';view.world.style='style-example';view.world.tables={focusObjects:['one-person']};await f.store.save(view.data,view.revision,view.key);
 const version=f.configuration.read().revision;f.switch('second','beta');await f.configuration.hydrate();
 view=f.store.read();assert.equal(view.world.style,'style-example');assert.equal(view.world.modes.narrative.缇斯亚聊天模式,'with-story');assert.deepEqual(view.world.tables?.focusObjects??[],[]);assert.equal(f.configuration.read().revision,version,'opening a chat must not create a configuration copy');
 const b=await f.archive(base,'Second');assert.notEqual(a.id,b.id);await f.configuration.hydrate();view=f.store.read();view.world.style='another-style';await f.store.save(view.data,view.revision,view.key);
 const persisted=await f.books.readConfiguration();assert.equal(persisted.owner.kind,'global');assert.deepEqual(Object.keys(persisted.domains.configuration.worlds),[GLOBAL_WORLD]);assert.deepEqual(persisted.worldBindings,[]);
 const marker=[...f.disk.values()].flatMap(d=>Object.values(d.entries)).filter(e=>e.extensions?.tisyaConfiguration);assert.equal(marker.length,1);
 // Cold cache: reconstruct from books and the global pointer only.
 f.ctx.extensionSettings={};const store=createStore({getContext:()=>f.ctx,persist:async()=>true}),config=createConfigurationBook({books:f.books,store,getContext:()=>f.ctx});await config.hydrate();assert.equal(store.read().world.style,'another-style');assert.equal(config.read().revision,persisted.revision);
});
test('global interface edits do not create per-user records; configuration restore preserves story references',async()=>{
 const f=fixture(),base=await f.core();let ui={font:'one'};
 const store=createStore({getContext:()=>f.ctx,persist:async()=>true}),configuration=createConfigurationBook({books:f.books,store,getContext:()=>f.ctx,readInterface:()=>ui,applyInterface:v=>{ui=v;},validateInterface:v=>assert.equal(typeof v.font,'string')});
 await configuration.hydrate({initializeIfMissing:true});await f.archive(base);await configuration.hydrate();
 let view=store.read();view.world.style='first';view.world.tables={focusObjects:['person:A']};await store.save(view.data,view.revision,view.key);const old=configuration.read().revision;
 view=store.read();view.world.style='second';view.world.tables.focusObjects=['person:B'];await store.save(view.data,view.revision,view.key);
 await configuration.saveDomain('interface',{font:'two'},configuration.read());const preview=await configuration.previewRestore({revision:old,expected:configuration.read(),domains:['configuration']});await configuration.restore({token:preview.token});
 assert.equal(store.read().world.style,'first');assert.deepEqual(store.read().world.tables.focusObjects,['person:B']);assert.equal(ui.font,'two');f.switch('other','beta');await configuration.hydrate();assert.equal(ui.font,'two');
});
test('identity preferences are distinct children of one core, and persist across chats',async()=>{
 const f=fixture(),base=await f.core();await f.archive(base,'First');const one=await f.books.readRuntime();
 f.switch('second');await f.archive(base,'Second');const same=await f.books.readRuntime();assert.equal(one.books.preferences,same.books.preferences);
 f.switch('third','beta');await f.archive(base,'Third');const other=await f.books.readRuntime();assert.notEqual(one.books.preferences,other.books.preferences);
 const manifest=Object.values(f.disk.get(base.physicalName).entries).find(e=>e.extensions?.tisyaBook);const content=JSON.parse(manifest.content);assert.deepEqual(content.playerIds,['alpha','beta']);assert.equal(content.preferenceOwners.length,2);
});
test('configuration failures retain drafts; retry is idempotent and stale revisions reject',async()=>{
 const f=fixture();await f.core();await f.configuration.hydrate({initializeIfMissing:true});const before=f.configuration.read();let view=f.store.read();view.world.style='retry-style';f.fail=true;
 await assert.rejects(f.store.save(view.data,view.revision,view.key),/disk unavailable/);assert(f.configuration.read().draft);f.fail=false;await f.configuration.retryDraft();assert.equal(f.store.read().world.style,'retry-style');const saved=f.configuration.read();
 await assert.rejects(f.configuration.saveDomain('configuration',saved.domains.configuration,before),e=>e.code==='CONFIGURATION_CONFLICT');assert.equal((await f.books.readConfiguration()).revision,saved.revision);
});
test('existing identity configuration and custom tags are retained when establishing the global record',async()=>{
 const f=fixture(),base=await f.core();await f.configuration.hydrate({initializeIfMissing:true});
 const data=f.disk.get(base.physicalName),wire=Object.values(data.entries).find(e=>e.extensions?.tisyaConfiguration),value=JSON.parse(wire.content),key=worldKey(f.ctx),configuration=copy(f.store.cacheSnapshot());
 delete configuration.worlds[GLOBAL_WORLD];delete configuration.storyBindings;configuration.worlds[key].style='keep-style';
 value.owner={kind:'player',id:'alpha'};wire.extensions.tisyaConfiguration.owner=copy(value.owner);
 value.versions[0].domains={configuration,tagTemplates:{custom:['keep-tag']}};value.versions[0].binding={archiveId:'old',playerId:'alpha'};value.versions[0].worldBindings=[{archiveId:'old',chatId:'story',branchId:'one',playerId:'alpha',key}];wire.content=JSON.stringify(value);const original=copy(wire);
 const store=createStore({getContext:()=>f.ctx,persist:async()=>true}),service=createConfigurationBook({books:f.books,store,getContext:()=>f.ctx,domainValidators:{tagTemplates:value=>assert(Array.isArray(value.custom))}});
 await service.hydrate({initializeIfMissing:true});assert.equal(store.read().world.style,'keep-style');assert.deepEqual(service.read().domains.tagTemplates.custom,['keep-tag']);assert.equal(service.read().owner.kind,'global');assert.deepEqual(f.disk.get(base.physicalName).entries[wire.uid],original);
});
test('switching global core invalidates old runtime writers and keeps existing books intact',async()=>{
 const f=fixture(),first=await f.core();await f.archive(first);const runtime=await f.books.readRuntime();const prior=copy(f.disk.get(first.physicalName));await f.core('Other');
 await assert.rejects(runtime.transport.readFresh(runtime.books.preferences),e=>e.code==='GLOBAL_CHANGED');assert.deepEqual(f.disk.get(first.physicalName),prior);
});

test('native global pointer persists through settings without a chat; new host reads it back',async()=>{
 const disk=new Map();let saved={extension_settings:{}},saveCalls=0;
 const context={extensionSettings:{},getRequestHeaders:()=>({'Content-Type':'application/json'})};
 const native={worldInfo:{saveWorldInfo:async(name,data)=>disk.set(name,copy(data)),createWorldInfoEntry(name,data){let uid=0;while(data.entries[uid])uid++;return data.entries[uid]={uid};}},persistence:{discardWorldInfoDocument(){}},script:{isGenerating:()=>false,saveSettings:async()=>{saveCalls++;saved={extension_settings:copy(context.extensionSettings)};return true;}}};
 const target={__TAURITAVERN__:{api:{chat:{current:{handle(){throw Error('no chat required');}},open(){throw Error('no chat required');}}}},fetch:async(url,options)=>new Response(JSON.stringify(url==='/api/settings/get'?{settings:JSON.stringify(saved),world_names:[...disk.keys()]}:disk.get(JSON.parse(options.body).name)??{entries:{}}))};
 const args={target,getContext:()=>context,getPlayerId:()=>undefined,assertIdle:()=>true,native};
 const host=await createNativeBookHost(args);const core=await host.manager.create({kind:'core',name:'Global',operationId:'create'});await host.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'select'});
 assert.equal(saveCalls,1);assert.equal(saved.extension_settings[GLOBAL_BOOK_KEY].coreId,core.id);context.extensionSettings={};const cold=await createNativeBookHost(args);assert.equal((await cold.manager.globalBinding()).core.id,core.id);
});

test('production workbench shows global parent, persists partial setup and retries without creating a second origin',async()=>{
 const f=fixture(),window=new Window({url:'https://fixture.test'}),document=window.document;let originId,failArchive=true;
 const capabilities={async getSnapshot(){return {binding:null,books:await f.books.binding(),assistant:{},review:{items:[]},capabilities:[]};},async action(id,args={}){
   if(id==='books.global')return f.books.globalBinding();if(id==='books.list')return f.books.list(args.kind);if(id==='configuration.status')return f.configuration.read();
   if(id==='books.options')return {owner:f.ctx.owner,currentPlayer:{id:'alpha',name:'甲'},players:[{id:'alpha',name:'甲'}]};
   if(id==='books.create'){if(args.kind==='archive'&&failArchive){failArchive=false;throw Error('archive failed');}const b=await f.books.create(args);if(args.kind==='origin')originId=b.id;return b;}
   if(id==='books.selectGlobal'){const result=await f.books.selectGlobalCore(args);await f.configuration.hydrate({initializeIfMissing:true});return result;}
   if(id==='books.select')return f.books.select(args);throw Error('Unhandled '+id);
 }};
 const view=mountWorkbench(document,document.body,{capabilities,initialPage:'books',stylesheetURL:'https://fixture.test/style.css'});await view.ready;const root=view.shadow;
 const click=async text=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent===text);assert(b,'button '+text);b.click();await view.settled();};
 const input=(label,value)=>{const el=root.querySelector(`[aria-label="${label}"]`);assert(el,label);el.value=value;el.dispatchEvent(new window.Event('input'));};
 await click('选择或建立全局基点');input('新基点名称','共用基点');await click('建立全局基点');assert(root.textContent.includes('全局配置'));assert(root.textContent.includes('用户身份与偏好'));
 await click('建立本故事存档');assert(!root.querySelector('[aria-label="偏好归属"]'));assert(!root.querySelector('[aria-label="新基点名称"]'));
 input('新原点名称','世界');input('新存档名称','开端');await click('建立并接续');assert(root.textContent.includes('archive failed'));assert(originId);assert.equal((await f.books.list('origin')).length,1);
 await click('建立并接续');assert.equal((await f.books.list('origin')).length,1);assert.equal((await f.books.list('core')).length,1);assert.equal((await f.books.list('archive')).length,1);assert((await f.books.binding()).pointer);
 view.dispose();await window.happyDOM.close();
});
