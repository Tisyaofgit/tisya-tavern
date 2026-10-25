import {GLOBAL_WORLD} from '../../../v3/configuration-scope.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixture.mjs';
import {createBookManager} from '../../../v3/books.mjs';
import {createConfigurationBook} from '../../../v3/configuration-book.mjs';
import {createStore,KEY,emptyConfig,worldKey,defaultWorld,validateConfig} from '../../../config/core.js';
import {validateWorldbookPreferences} from '../../../config/worldbook-preferences.js';
import {createWorldbookStore} from '../../../worldbook-store.js';
import {definitions,originalMap} from '../../../tests/fixtures/worldbook-native-definitions.js';
import {isPrivateTisyaEntry} from '../../../config/private-materials.js';
const copy=v=>structuredClone(v),code=v=>e=>e.code===v;
const tagValidator=value=>{assert.equal(value.format,'tisya.tag-templates/1');assert.ok(Array.isArray(value.templates));};
async function serviceFixture(){
 const s=await setup(),ctx={chatId:'native-file',characterId:0,characters:[{avatar:'card.png',name:'世界'}],extensionSettings:{},chatMetadata:{}},ui={value:{联系人分组:{},动态效果:false}},events=[];
 const configuration=emptyConfig();configuration.worlds[worldKey(ctx)]=defaultWorld();configuration.worlds[worldKey(ctx)].switches.difficulty='细致';ctx.extensionSettings[KEY]=configuration;ctx.extensionSettings.缇斯亚世界书={bookOrder:['Alpha','Beta'],tags:{prefix:['角色'],suffix:[]},auto:false};
 const sync=()=>{const p=s.f.pointers.get(JSON.stringify(s.f.ctx.owner));ctx.chatMetadata={tisya_v3_books:copy(p),tisya_w24:copy(s.f.ctx.owner)};};sync();
 const make=(manager=s.f.manager)=>{const store=createStore({getContext:()=>ctx,persist:async()=>{throw Error('Cache cannot be independent authority');}});const service=createConfigurationBook({books:manager,store,getContext:()=>ctx,getPlayerId:()=>s.f.ctx.playerId,readInterface:()=>{if(ui.corrupt)throw Error('corrupt UI cache');return ui.value;},applyInterface:async value=>{if(ui.fail)throw Error('UI failed');ui.value=copy(value);ui.corrupt=false;if(ui.onApply)await ui.onApply();},validateInterface:value=>{assert.ok(value.联系人分组);},domainValidators:{tagTemplates:tagValidator,worldbookInterface:validateWorldbookPreferences},domainCaches:{worldbookInterface:{read:()=>ctx.extensionSettings.缇斯亚世界书??{},apply:value=>{ctx.extensionSettings.缇斯亚世界书=copy(value);},defaultValue:{}}},onApplied:()=>events.push('applied')});return {store,service};};
 return {...s,ctx,ui,events,sync,make,...make()};
}

test('core configuration is private, versioned, separate from manifest and P, preserving unmanaged entries',async()=>{
 const x=await serviceFixture(),doc=x.f.docs.get(x.core.physicalName);doc.native={keep:1};doc.entries[99]={uid:99,content:'ordinary lore'};
 const state=await x.service.hydrate({initializeIfMissing:true});assert.equal(state.revision,1);assert.equal(x.store.read().world.switches.difficulty,'细致');
 const saved=x.f.docs.get(x.core.physicalName),wire=Object.values(saved.entries).find(e=>e.extensions?.tisyaConfiguration);assert.ok(wire);assert.ok(isPrivateTisyaEntry(wire));assert.equal(wire.disable,true);assert.equal(wire.constant,false);assert.equal(wire.probability,0);assert.equal(saved.entries[99].content,'ordinary lore');assert.deepEqual(saved.native,{keep:1});
 const r=x.store.read();r.data.worlds[r.key].modes.narrative.缇斯亚聊天模式='with-story';await x.store.save(r.data,r.revision,r.key);assert.equal(x.service.read().revision,2);assert.equal((await x.f.manager.readConfiguration()).domains.configuration.worlds[GLOBAL_WORLD].modes.narrative.缇斯亚聊天模式,'with-story');
 assert.equal(Object.values(saved.entries).filter(e=>e.extensions?.tisyaTableLedger).length,0);
});

test('only published configuration retains workspace dependencies, without persisting runtime tokens in its snapshot',async()=>{
 const x=await serviceFixture();let sequence=0;const decorate=async value=>({...await value,workspaceDependencies:[{format:'test-source',sequence:++sequence}]}),books={...x.f.manager,readConfiguration:(...args)=>decorate(x.f.manager.readConfiguration(...args)),saveConfiguration:(...args)=>decorate(x.f.manager.saveConfiguration(...args))};const {service}=x.make(books);
 await service.hydrate({initializeIfMissing:true});assert.equal(service.read().workspaceDependencies,undefined);await service.saveDomain('interface',{联系人分组:{new:'friend'}},service.read());const published=service.getWorkspaceDependencies();assert.equal(published.length,1);published[0].sequence=-1;assert.notEqual(service.getWorkspaceDependencies()[0].sequence,-1);
 const before=service.getWorkspaceDependencies();await books.readConfiguration();await service.previewRestore({revision:1,expected:service.read()});assert.deepEqual(service.getWorkspaceDependencies(),before,'inspection and restore preview do not re-sign the active configuration');
 await service.hydrate();assert.notDeepEqual(service.getWorkspaceDependencies(),before);x.ui.fail=true;await assert.rejects(service.hydrate(),/UI failed/);assert.deepEqual(service.getWorkspaceDependencies(),[],'failed publication exposes no ready dependency set');
});

test('cold boot restores world, tags and UI after all extension settings disappear, from native metadata and inventory alone',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const tags={format:'tisya.tag-templates/1',templates:[{id:'human-flaw',label:'小心思'}]};await x.service.saveDomain('tagTemplates',tags,x.service.read());
 await x.service.saveDomain('interface',{联系人分组:{user:'家'},动态效果:true},x.service.read());x.ctx.extensionSettings={};x.ui.value={联系人分组:{}};
 const newManager=createBookManager(x.f.opts),fresh=x.make(newManager);await assert.rejects(async()=>fresh.store.read(),code('CONFIGURATION_NOT_READY'));await fresh.service.hydrate();assert.equal(fresh.store.read().world.switches.difficulty,'细致');assert.deepEqual(fresh.service.read().domains.tagTemplates,tags);assert.equal(x.ui.value.动态效果,true);assert.equal(x.ui.value.联系人分组.user,'家');
});

test('direct host cache edits are detected instead of becoming a second authority',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});x.ctx.extensionSettings[KEY].worlds[worldKey(x.ctx)].switches.difficulty='偷偷覆盖';assert.throws(()=>x.store.read(),code('CONFIGURATION_CACHE'));await x.service.hydrate();assert.equal(x.store.read().world.switches.difficulty,'细致');
});

test('a failed book write retains draft and old runtime, retry writes exactly once',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});x.f.fail.save=true;
 await assert.rejects(x.service.saveDomain('interface',{联系人分组:{z:'草稿'}},x.service.read(),{operationId:'retry'}),/save failed/);assert.equal(x.service.read().revision,1);assert.equal(x.ui.value.联系人分组.z,undefined);assert.equal(x.service.read().draft.operationId,'retry');
 x.f.fail.save=false;await x.service.retryDraft({expected:x.service.read()});assert.equal(x.service.read().revision,2);assert.equal(x.ui.value.联系人分组.z,'草稿');assert.equal(x.service.read().draft,null);
});

test('concurrent domain edits use one revision guard and retain losing draft without overwriting successful tags',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const expected=x.service.read(),tags={format:'tisya.tag-templates/1',templates:[]};const outcomes=await Promise.allSettled([x.service.saveDomain('tagTemplates',tags,expected),x.service.saveDomain('interface',{联系人分组:{a:'新'}},expected)]);assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.equal(outcomes[1].reason.code,'CONFIGURATION_CONFLICT');assert.deepEqual((await x.f.manager.readConfiguration()).domains.tagTemplates,tags);
});

test('restoring old revision needs a current preview and appends history instead of deleting later versions',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});await x.service.saveDomain('interface',{联系人分组:{a:'新'}},x.service.read());const preview=await x.service.previewRestore({revision:1,expected:x.service.read()});assert.ok(preview.changes.some(c=>c.domain==='interface'));assert.equal(x.ui.value.联系人分组.a,'新');await x.service.restore({token:preview.token});assert.equal(x.service.read().revision,3);assert.equal(x.ui.value.联系人分组.a,undefined);assert.deepEqual(x.service.read().versions.map(v=>v.revision),[1,2,3]);
 await assert.rejects(x.service.restore({token:preview.token}),code('CONFIGURATION_PREVIEW'));
});

test('story core changes preserve global configuration; changing the global core invalidates old saves',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const old=x.service.read(),core2=await x.f.manager.create({kind:'core',name:'另一基点',operationId:'new-core'});await x.f.manager.select({core:{bookId:core2.id},expectedBindingRevision:0,operationId:'switch-core'});x.sync();
 await x.service.saveDomain('interface',{联系人分组:{}},old);await x.service.hydrate();assert.equal(x.service.read().bookId,x.core.id);assert.equal(x.service.read().binding.revision,1);assert.equal(x.store.read().world.switches.difficulty,'细致');const beforeGlobalSwitch=x.service.read();await x.f.manager.selectGlobalCore({coreId:core2.id,expectedRevision:1,operationId:'global-switch'});await assert.rejects(x.service.saveDomain('interface',{联系人分组:{}},beforeGlobalSwitch),code('CONFIGURATION_BINDING'));
});

test('switching player retains shared configuration and interface while preference banks remain player-owned',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});await x.f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'player'});x.sync();await x.service.hydrate({initializeIfMissing:true});assert.equal(x.service.read().owner.id,'tisya');assert.equal(x.store.read().world.switches.difficulty,'细致');assert.equal(x.ui.value.动态效果,false);assert.equal((await x.f.manager.binding()).binding.preference.owner.id,'player-2');
});

test('native secrets and invalid chat modes are rejected before durable mutation',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const bad=copy(x.service.read().domains.configuration);bad.apiKey='secret';await assert.rejects(x.service.saveDomain('configuration',bad,x.service.read()),code('CONFIGURATION_CREDENTIAL'));
 const m=x.store.read();m.data.worlds[m.key].modes.narrative.缇斯亚聊天模式='guess';assert.throws(()=>validateConfig(m.data),/聊天模式/);assert.equal((await x.f.manager.readConfiguration()).revision,1);
});

test('chat filename changes restore by stable archive identity and update key on next edit',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const oldKey=worldKey(x.ctx);x.ctx.chatId='renamed-file';await x.service.hydrate();const r=x.store.read();assert.notEqual(r.key,oldKey);assert.equal(r.world.switches.difficulty,'细致');await x.service.saveDomain('interface',{联系人分组:{renamed:'yes'}},x.service.read());const saved=await x.f.manager.readConfiguration();assert.deepEqual(saved.worldBindings,[]);assert.ok(saved.domains.configuration.worlds[GLOBAL_WORLD]);assert.equal(saved.domains.configuration.worlds[oldKey],undefined);
});

test('combined assistant configuration and interface save create one durable version',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const r=x.store.read();r.data.worlds[r.key].context.history=4;await x.service.saveCombined({configuration:r.data,interface:{联系人分组:{u:'友人'}},configurationRevision:r.revision,key:r.key},x.service.read());assert.equal(x.service.read().revision,2);assert.equal(x.store.read().world.context.history,4);assert.equal(x.ui.value.联系人分组.u,'友人');
});

test('native forks share global settings without creating another configuration authority',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const original=x.service.read();const targetOwner={chatId:x.f.ctx.owner.chatId,branchId:'branch-child'};x.f.ctx={...x.f.ctx,owner:targetOwner,epoch:x.f.ctx.epoch+1};x.ctx.chatId='branch-file';
 const forked=await x.f.manager.fork({source:{archiveId:x.archive.id,bindingRevision:0},targetOwner,operationId:'branch'});x.sync();await x.service.hydrate();assert.equal(x.store.read().world.switches.difficulty,'细致');assert.equal(x.service.read().revision,1);
 const child=x.store.read();child.data.worlds[child.key].switches.difficulty='独立';await x.store.save(child.data,child.revision,child.key);const saved=await x.f.manager.readConfiguration();assert.deepEqual(saved.worldBindings,[]);assert.notEqual(forked.archive.id,x.archive.id);assert.equal(saved.domains.configuration.worlds[GLOBAL_WORLD].switches.difficulty,'独立');assert.equal(original.owner.id,saved.owner.id);
});

test('account preference ownership does not change the global configuration owner',async()=>{
 const x=await serviceFixture();await x.f.manager.select({preferenceOwner:{kind:'account',id:'account-1'},expectedBindingRevision:0,operationId:'account'});x.sync();await x.service.hydrate({initializeIfMissing:true});await x.f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'account',id:'account-1'},expectedBindingRevision:1,operationId:'account-player'});x.sync();await x.service.hydrate();assert.equal(x.store.read().world.switches.difficulty,'细致');assert.equal(x.service.read().worldBindings.length,0);assert.equal(x.service.read().owner.kind,'global');assert.equal((await x.f.manager.binding()).binding.preference.owner.kind,'account');
});

test('cold restart after player selection restores the one global configuration from its book',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});await x.f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'player2'});x.sync();const fresh=x.make(createBookManager(x.f.opts));await fresh.service.hydrate({initializeIfMissing:true});assert.equal(fresh.store.read().world.switches.difficulty,'细致');assert.equal(x.ui.value.动态效果,false);assert.equal(fresh.service.read().owner.id,'tisya');
});

test('reload cannot discard an unsaved draft and committed-but-unpublished save can be retried without duplication',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});x.ui.fail=true;await assert.rejects(x.service.saveDomain('interface',{联系人分组:{a:'已保存'}},x.service.read(),{operationId:'publish-retry'}),/UI failed/);assert.equal((await x.f.manager.readConfiguration()).revision,2);assert.equal(x.service.read().ready,false);assert.ok(x.service.read().draft);
 await assert.rejects(x.service.hydrate(),code('CONFIGURATION_DRAFT_PENDING'));x.ui.fail=false;await x.service.retryDraft();assert.equal(x.service.read().revision,2);assert.equal(x.ui.value.联系人分组.a,'已保存');assert.equal((await x.f.manager.readConfiguration()).versions.length,2);
});

test('configuration writes and P namespace writes share one physical document writer without loss',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const rt=await x.f.manager.readRuntime(),p=await rt.transport.readFresh(rt.books.preferences),wire=rt.transport.createEntry(rt.books.preferences,p);Object.assign(wire,{content:'{"revision":1}',disable:true,constant:false,key:[],keysecondary:[],probability:0});wire.extensions.tisyaTableLedger={schema:'tisya.ledger-storage/1',owner:{chatId:'tisya-preferences',branchId:'global'},revision:1};
 await Promise.all([x.service.saveDomain('interface',{联系人分组:{x:'保留'}},x.service.read()),rt.transport.save(rt.books.preferences,p)]);const doc=x.f.docs.get(x.core.physicalName);assert.equal(Object.values(doc.entries).filter(e=>e.extensions?.tisyaTableLedger).length,1);assert.equal(Object.values(doc.entries).filter(e=>e.extensions?.tisyaConfiguration).length,1);assert.equal((await x.f.manager.readConfiguration()).revision,2);
});

test('valid book restoration repairs a corrupt UI cache instead of requiring it to parse first',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});x.ui.corrupt=true;x.ctx.extensionSettings[KEY]={broken:true};await x.service.hydrate();assert.equal(x.store.read().world.switches.difficulty,'细致');assert.equal(x.ui.corrupt,false);assert.equal(x.ui.value.动态效果,false);
});

test('switching during cache publication cannot mark old configuration ready in the new chat',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});x.ui.onApply=()=>{x.ctx.chatId='unexpected-chat';x.ui.onApply=null;};await assert.rejects(x.service.saveDomain('interface',{联系人分组:{a:'记录'}},x.service.read()),code('CONFIGURATION_SCOPE'));assert.equal(x.service.read().ready,false);assert.ok(x.service.read().draft);assert.throws(()=>x.store.read(),code('CONFIGURATION_NOT_READY'));
 x.ctx.chatId='native-file';await x.service.retryDraft();assert.equal(x.service.read().ready,true);assert.equal(x.service.read().revision,2);
});

test('undefined/non-JSON values cannot silently disappear from durable configuration',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});await assert.rejects(x.service.saveDomain('interface',{联系人分组:{a:undefined}},x.service.read()),code('CONFIGURATION_VALUE'));assert.equal((await x.f.manager.readConfiguration()).revision,1);assert.ok(x.service.read().draft);x.service.discardDraft();await assert.rejects(x.service.saveDomain('interface',{联系人分组:{},value:Infinity},x.service.read()),code('CONFIGURATION_VALUE'));
});

test('restoring settings preserves later custom tags; explicitly selecting the tag domain previews its removal',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const tags={format:'tisya.tag-templates/1',templates:[{id:'later',label:'新增'}]};await x.service.saveDomain('tagTemplates',tags,x.service.read());
 const p=await x.service.previewRestore({revision:1,expected:x.service.read()});assert.ok(p.preservedDomains.includes('tagTemplates'));assert.ok(!p.restoredDomains.includes('tagTemplates'));await x.service.restore({token:p.token});assert.deepEqual(x.service.read().domains.tagTemplates,tags);
 const tagOnly=await x.service.previewRestore({revision:1,expected:x.service.read(),domains:['tagTemplates']});assert.deepEqual(tagOnly.restoredDomains,['tagTemplates']);assert.ok(tagOnly.changes.some(c=>c.domain==='tagTemplates'&&c.after===undefined));await x.service.restore({token:tagOnly.token});assert.equal(x.service.read().domains.tagTemplates,undefined);
});

test('worldbook UI preferences survive losing host settings and switching player without resetting',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});assert.equal(x.service.read().domains.worldbookInterface.auto,false);x.ctx.extensionSettings={};await x.service.hydrate();assert.deepEqual(x.ctx.extensionSettings.缇斯亚世界书.tags.prefix,['角色']);
 await x.f.manager.select({player:{id:'player-2'},preferenceOwner:{kind:'player',id:'player-2'},expectedBindingRevision:0,operationId:'worldbook-player'});x.sync();await x.service.hydrate({initializeIfMissing:true});assert.deepEqual(x.ctx.extensionSettings.缇斯亚世界书,{bookOrder:['Alpha','Beta'],tags:{prefix:['角色'],suffix:[]},auto:false});
});

function nativeWorldbookFixture(x){
 const database={Alpha:{vendor:{keep:1},entries:{0:{uid:0,comment:'甲',content:'原文',key:[],disable:false,constant:false,probability:100,order:100,position:0,extensions:{custom:1}}}},Beta:{entries:{0:{uid:0,comment:'乙',content:'保留',key:[],disable:false,order:80}}}};
 const globals={world_info_depth:2,world_info_budget:25,world_info_budget_cap:0,world_info_min_activations:0,world_info_max_recursion_steps:0,world_info_recursive:true},control={persist:true,count:0};
 const native={newWorldInfoEntryDefinition:definitions,originalWIDataKeyMap:originalMap,selected_world_info:['Alpha'],getWorldInfoSettings:()=>({...globals,world_info:{}}),flushWorldInfoSaves:async()=>{},flushPendingWorldInfoSettings(){},updateWorldInfoList:async()=>{},updateWorldInfoSettings(s,a){Object.assign(globals,s);this.selected_world_info=a;},createWorldInfoEntry(_name,d){let uid=0;while(d.entries[uid])uid++;return d.entries[uid]={uid,...Object.fromEntries(Object.entries(definitions).filter(([,d])=>!d.excludeFromTemplate).map(([k,d])=>[k,copy(d.default)]))};},setWIOriginalDataValue(){},deleteWIOriginalDataValue(){},async saveWorldInfo(name,data){database[name]=copy(data);}};
 const store=createWorldbookStore({native,configurationBook:x.service,getContext:()=>x.ctx,readFresh:async name=>copy(database[name]),listNames:async()=>Object.keys(database),sanitizeName:async name=>name,persistSettings:async()=>{control.count++;return control.persist;}});return {store,database,native,control};
}

test('production worldbook store writes only plugin ordering/tags through configuration authority',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const w=nativeWorldbookFixture(x),state=await w.store.load(),original=JSON.stringify(w.database);state.tags.prefix.push('新标签');state.books.reverse();state.globalSettings.pin=true;await w.store.save(state);
 assert.equal(JSON.stringify(w.database),original);assert.deepEqual(x.service.read().domains.worldbookInterface.bookOrder,['Beta','Alpha']);assert.deepEqual(x.ctx.extensionSettings.缇斯亚世界书.tags.prefix,['角色','新标签']);assert.equal(x.service.read().domains.worldbookInterface.pin,true);assert.equal(x.service.read().domains.worldbookInterface.world_info_budget,undefined);
});

test('worldbook native-save failure keeps its draft; retry commits native settings then the private configuration domain once',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const w=nativeWorldbookFixture(x),state=await w.store.load();state.globalSettings.world_info_depth=7;state.tags.suffix.push('尾');w.control.persist=false;await assert.rejects(w.store.save(state),/尚未确认/);assert.equal(w.store.hasUnconfirmedSettings(),true);assert.equal(x.service.read().revision,1);assert.deepEqual(x.ctx.extensionSettings.缇斯亚世界书.tags.suffix,[]);
 w.control.persist=true;await w.store.save(state);assert.equal(x.service.read().revision,2);assert.equal(w.control.count,2);assert.equal(w.store.hasUnconfirmedSettings(),false);assert.equal(w.native.getWorldInfoSettings().world_info_depth,7);assert.deepEqual(x.ctx.extensionSettings.缇斯亚世界书.tags.suffix,['尾']);
});

test('worldbook domain-write failure never publishes new cache and load can complete the original operation',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});const w=nativeWorldbookFixture(x),state=await w.store.load();state.tags.suffix.push('未完成');x.f.fail.save=true;await assert.rejects(w.store.save(state),/save failed/);assert.equal(w.store.hasUnconfirmedSettings(),true);assert.deepEqual(x.ctx.extensionSettings.缇斯亚世界书.tags.suffix,[]);x.f.fail.save=false;const restored=await w.store.load();assert.deepEqual(restored.tags.suffix,['未完成']);assert.equal(x.service.read().revision,2);assert.equal(w.control.count,1);
});


test('manual configuration profiles remain stable through automatic edits and update only by explicit save',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});
 for(let i=0;i<21;i++)await x.service.saveDomain('interface',{联系人分组:{},动态效果:i%2===0},x.service.read());
 assert.equal(x.service.read().domains.configurationProfiles,undefined);
 const previousVersions=x.service.read().versions.length,reference=x.service.read().revision;
 await x.service.saveProfile({name:'慢节奏',expected:x.service.read(),operationId:'profile-slow'});
 let bank=x.service.read().domains.configurationProfiles;assert.equal(bank.profiles.length,1);const id=bank.profiles[0].id;assert.equal(bank.profiles[0].revision,reference);
 const r=x.store.read();r.data.worlds[r.key].context.history=3;await x.store.save(r.data,r.revision,r.key);
 assert.equal(x.service.read().domains.configurationProfiles.profiles.length,1);assert.equal(x.service.read().domains.configurationProfiles.profiles[0].revision,reference);
 await x.service.saveProfile({name:'快节奏',expected:x.service.read(),operationId:'profile-fast'});
 await x.service.saveProfile({id,name:'慢节奏修订',expected:x.service.read(),operationId:'profile-update'});
 bank=x.service.read().domains.configurationProfiles;assert.equal(bank.profiles.length,2);assert.equal(bank.profiles.find(p=>p.id===id).name,'慢节奏修订');
 const preview=await x.service.previewRestore({revision:reference,expected:x.service.read()});await x.service.restore({token:preview.token});
 assert.equal(x.service.read().domains.configurationProfiles.profiles.length,2);assert.ok(x.service.read().versions.length>previousVersions);assert.notEqual(x.store.read().world.context.history,3);
 const fresh=x.make(createBookManager(x.f.opts));await fresh.service.hydrate();assert.deepEqual(fresh.service.read().domains.configurationProfiles,bank);
});

test('failed manual profile save keeps original profile and retries the same draft once',async()=>{
 const x=await serviceFixture();await x.service.hydrate({initializeIfMissing:true});await x.service.saveProfile({name:'原方案',expected:x.service.read(),operationId:'original-profile'});const before=x.service.read(),id=before.domains.configurationProfiles.profiles[0].id;
 x.f.fail.save=true;await assert.rejects(x.service.saveProfile({id,name:'修订方案',expected:before,operationId:'failed-profile'}),/save failed/);
 assert.equal(x.service.read().domains.configurationProfiles.profiles[0].name,'原方案');assert.equal(x.service.read().draft.operationId,'failed-profile');
 x.f.fail.save=false;await x.service.retryDraft();assert.equal(x.service.read().domains.configurationProfiles.profiles.length,1);assert.equal(x.service.read().domains.configurationProfiles.profiles[0].name,'修订方案');assert.equal(x.service.read().revision,before.revision+1);
});
