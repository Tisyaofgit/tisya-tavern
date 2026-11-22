import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {createChatMediaAtlas,createMediaAssetStore,projectMediaBundle,mediaTargets,createAtlasMediaProjection,MEDIA_TABLE,MEDIA_LOCATOR_PREFIX} from '../media-atlas.js';
import {dialogueBlocks} from '../prose-dialogue.js';
import {configureRenderingMedia,projectRendering,resolveBoundHeart,resolveRendering} from '../rendering-resources.js';

const record=values=>({values,metadata:{sourceDefinition:{book:'基点书',uid:7,definitionId:'object.root'}}});
const urlApi=()=>{let id=0;const live=new Set();return {createObjectURL(blob){assert(blob instanceof Blob);const url='blob:test/'+(++id);live.add(url);return url;},revokeObjectURL(url){live.delete(url);},live};};
const file=(text='image bytes',type='image/png')=>new Blob([text],{type});

function bundleFixture(){
 return {contextKey:'chat-a',revision:2,local_revision:3,state:{runtime:{scope:{world_ref:'world-a',session_ref:'chat-a',branch_ref:'main'}},tables:{
  T_CHAR_DOSSIER:{a:record({name:'守门人',aliases:['门官']}),b:record({name:'另一个人'}),item:record({name:'不是物品'})},
  T_STATIC_ITEMS_SKILLS:{lamp:record({name:'月灯'})},
  [MEDIA_TABLE]:{
   avatar:record({entity_ref:'a',kind:'图像',purpose:'头像',asset_locator:'tisya-media://default'}),
   happy:record({entity_ref:'a',kind:'图像',purpose:'表情',display_variant:'开心',asset_locator:'tisya-media://happy'}),
   portrait:record({entity_ref:'a',kind:'立绘',purpose:'立绘',asset_locator:'tisya-media://portrait'}),
   item:record({entity_ref:'lamp',kind:'图像',purpose:'头像',asset_locator:'https://example.test/lamp.png'})
  }
 }}};
}

test('canonical media rows drive exact mood, default avatar and portrait fallbacks without ambiguous borrowing',()=>{
 const bundle=bundleFixture(),resolve=locator=>locator.startsWith(MEDIA_LOCATOR_PREFIX)?'blob:'+locator.slice(MEDIA_LOCATOR_PREFIX.length):locator;
 const state=projectMediaBundle(bundle,resolve),registry=dialogueBlocks.characterRegistry(()=>state,resolve);
 assert.equal(registry.avatar('门官','开心').url,'blob:happy');
 assert.equal(registry.avatar('守门人','冷漠').url,'blob:default');
 assert.equal(registry.avatar('守门人','').url,'blob:default');
 assert.equal(registry.avatar('同名不存在','开心').status,'unresolved');
 const ambiguous=bundleFixture();ambiguous.state.tables.T_CHAR_DOSSIER.b.values.name='守门人';assert.equal(dialogueBlocks.characterRegistry(()=>projectMediaBundle(ambiguous,resolve),resolve).avatar('守门人').status,'unresolved');
 assert.equal(registry.avatar('守门人','开心').entity,'a');
 assert.equal(mediaTargets(bundle).find(x=>x.entity==='lamp').group,'物品');
 const noDefault=bundleFixture();delete noDefault.state.tables[MEDIA_TABLE].avatar;delete noDefault.state.tables[MEDIA_TABLE].happy;
 const fallback=dialogueBlocks.characterRegistry(()=>projectMediaBundle(noDefault,resolve),resolve);
 assert.equal(fallback.avatar('守门人','开心').url,'blob:portrait');
});

test('blob store deduplicates bytes and only exposes persistent locators after IndexedDB read',async()=>{
 const URL=urlApi(),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL,crypto:webcrypto});
 try{
  const first=await store.put(file()),again=await store.put(file());assert.equal(first.created,true);assert.equal(again.created,false);assert.equal(first.locator,again.locator);
  assert.equal(store.cached(first.locator),'');const url=await store.load(first.locator);assert.equal(url,'blob:test/1');assert.equal(store.cached(first.locator),url);
  await store.remove(first.locator);assert.equal(store.cached(first.locator),'');assert.equal(await store.load(first.locator),'');assert.equal(URL.live.size,0);
  await assert.rejects(()=>store.put(file('x','text/plain')),/仅支持/);
 }finally{store.dispose();}
});

function mutableBundle(initial){
 let bundle=initial;
 return {peek:async()=>bundle,mutate:async callback=>{
  const next=structuredClone(bundle),engine={data:next.state,newRecord(table,values,id){next.state.tables[table]??={};next.state.tables[table][id]={values:{...values,row_uuid:id}};}};
  callback(engine);next.local_revision++;bundle=next;
 },get:()=>bundle,set:value=>{bundle=value;}};
}

test('chat atlas imports bindings, refreshes object URLs and protects shared blobs on removal',async()=>{
 const base=bundleFixture();base.state.tables[MEDIA_TABLE]={};const db=mutableBundle(base),URL=urlApi(),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL,crypto:webcrypto});
 const atlas=createChatMediaAtlas({peek:db.peek,mutate:db.mutate,store});
 try{
  const target={entity:'a',group:'人物',label:'守门人'},first=await atlas.importImage({file:file(),target,use:'avatar',width:120,height:160});
  assert.equal(atlas.view().rows.length,1);assert.equal(atlas.view().rows[0].target.label,'守门人');assert.match(atlas.avatar('守门人').url,/^blob:test\//);
  const second=await atlas.importImage({file:file(),target,use:'expression',variant:'开心'});assert.notEqual(first,second);assert.equal(atlas.view().rows.length,2);
  const locator=db.get().state.tables[MEDIA_TABLE][first].values.asset_locator;assert.equal(db.get().state.tables[MEDIA_TABLE][second].values.asset_locator,locator);
  assert.match(atlas.avatar('守门人','开心').url,/^blob:test\//);
  await atlas.remove(first);assert.equal(atlas.view().rows.length,1);assert.match(await store.load(locator),/^blob:test\//);
  await atlas.remove(second);assert.equal(atlas.view().rows.length,0);assert.equal(await store.load(locator),'');
  await assert.rejects(()=>atlas.importImage({file:file('other'),target,use:'expression',variant:''}),/情绪名称/);
 }finally{atlas.dispose();}
});

test('failed binding save cleans only newly uploaded bytes and never deletes an existing shared asset',async()=>{
 const base=bundleFixture();base.state.tables[MEDIA_TABLE]={};const db=mutableBundle(base),URL=urlApi(),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL,crypto:webcrypto});
 const existing=await store.put(file());let fail=true;
 const atlas=createChatMediaAtlas({peek:db.peek,mutate:async callback=>{if(fail)throw Error('disk full');return db.mutate(callback);},store});
 try{
  await assert.rejects(()=>atlas.importImage({file:file(),target:{entity:'a'},use:'avatar'}),/disk full/);assert.match(await store.load(existing.locator),/^blob:test\//);
  fail=false;await atlas.importImage({file:file(),target:{entity:'a'},use:'avatar'});assert.equal(atlas.view().rows.length,1);
 }finally{atlas.dispose();}
});

test('hosts without IndexedDB keep external media usable and reject only local byte operations',async()=>{
 const store=createMediaAssetStore({indexedDB:null,URL:urlApi(),crypto:webcrypto});
 await store.ready;assert.equal(store.cached('https://example.test/a.png'),'https://example.test/a.png');assert.equal(await store.load('https://example.test/a.png'),'https://example.test/a.png');
 assert.equal(await store.load('tisya-media://sha256-missing'),'');await assert.rejects(()=>store.put(file()),/不支持本地图鉴数据库/);await assert.rejects(()=>store.remove('tisya-media://sha256-missing'),/不支持本地图鉴数据库/);store.dispose();
});

test('asset database upgrades from v1 without losing bytes and persists scoped metadata',async()=>{
 const indexedDB=new IDBFactory(),old=await new Promise((resolve,reject)=>{const request=indexedDB.open('tisya-media-atlas',1);request.onupgradeneeded=()=>request.result.createObjectStore('assets',{keyPath:'id'});request.onsuccess=()=>{const db=request.result,tx=db.transaction('assets','readwrite');tx.objectStore('assets').put({id:'sha256-old',blob:file('old bytes'),mime:'image/png'});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
 const URL=urlApi(),store=createMediaAssetStore({indexedDB,URL,crypto:webcrypto});assert.match(await store.load('tisya-media://sha256-old'),/^blob:test\//);
 await store.saveBinding({id:'global:old',scope:'global',target:{entity:'a',table:'T_CHAR_DOSSIER',label:'守门人'},asset_locator:'tisya-media://sha256-old'});store.dispose();
 const reopened=createMediaAssetStore({indexedDB,URL:urlApi(),crypto:webcrypto});assert.equal((await reopened.listBindings())[0].id,'global:old');reopened.dispose();
});

test('global and card bindings survive chat changes and chat overrides card which overrides global',async()=>{
 const base=bundleFixture();base.state.tables[MEDIA_TABLE]={};const db=mutableBundle(base),URL=urlApi(),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL,crypto:webcrypto});let cards=[{id:'card-a',name:'角色卡 A'}];
 const atlas=createChatMediaAtlas({peek:db.peek,mutate:db.mutate,store,cardContext:()=>cards}),target=mediaTargets(base).find(row=>row.entity==='a');
 try{
  const globalId=await atlas.importImage({file:file('global'),target,use:'avatar',scope:'global'}),cardId=await atlas.importImage({file:file('card'),target,use:'avatar',scope:'card',card:cards[0]}),chatId=await atlas.importImage({file:file('chat'),target,use:'avatar'});
  const saved=await store.listBindings();assert(saved.every(row=>row.target.archive_entry_ref===target.archive_entry_ref));assert.match(target.archive_entry_ref,/^dossier-/);
  assert.equal(atlas.avatar('守门人').url,'blob:test/3');assert.equal(Object.keys(db.get().state.tables[MEDIA_TABLE]).length,1);
  await atlas.remove(chatId);assert.equal(atlas.avatar('守门人').url,'blob:test/2');
  const next=bundleFixture();next.contextKey='chat-b';next.local_revision=9;next.state.runtime.scope.session_ref='chat-b';next.state.tables[MEDIA_TABLE]={};next.state.tables.T_CHAR_DOSSIER={a:record({name:'守门人',aliases:['门官']})};db.set(next);await atlas.refresh(true);
  assert.equal(atlas.avatar('守门人').url,'blob:test/2');assert.equal(atlas.view().targets[0].entity,'a');
  cards=[{id:'card-b',name:'角色卡 B'}];await atlas.refresh(true);assert.equal(atlas.avatar('守门人').url,'blob:test/1');
  await atlas.importImage({file:file('mood'),target:{...target,entity:'a'},use:'expression',variant:'开心',scope:'global'});assert.equal(atlas.avatar('守门人','开心').url,'blob:test/4');assert.equal(atlas.avatar('守门人','冷漠').url,'blob:test/1');
  const remaining=await store.listBindings();assert(remaining.some(row=>row.id===globalId));assert(remaining.some(row=>row.id===cardId));
  const reusedId=bundleFixture();reusedId.contextKey='chat-c';reusedId.state.runtime.scope.session_ref='chat-c';reusedId.state.tables[MEDIA_TABLE]={};reusedId.state.tables.T_CHAR_DOSSIER={a:record({name:'冒充者',aliases:[]})};reusedId.state.tables.T_CHAR_DOSSIER.a.metadata.sourceDefinition.uid=8;db.set(reusedId);await atlas.refresh(true);
  assert.equal(atlas.avatar('冒充者').status,'missing');assert.equal(atlas.view().rows.find(row=>row.id===globalId).applicable,false);
 }finally{atlas.dispose();}
});

test('foreign cards are rejected and shared bytes survive removal across binding scopes',async()=>{
 const base=bundleFixture();base.state.tables[MEDIA_TABLE]={};const db=mutableBundle(base),URL=urlApi(),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL,crypto:webcrypto}),atlas=createChatMediaAtlas({peek:db.peek,mutate:db.mutate,store,cardContext:()=>[{id:'card-a',name:'角色卡 A'}]}),target=mediaTargets(base).find(row=>row.entity==='a');
 try{
  await assert.rejects(()=>atlas.importImage({file:file('bad'),target,scope:'card',card:{id:'card-b'}}),/当前聊天中的角色卡/);
  const globalId=await atlas.importImage({file:file('shared'),target,scope:'global'}),chatId=await atlas.importImage({file:file('shared'),target}),locator=(await store.listBindings()).find(row=>row.id===globalId).asset_locator;
  await atlas.remove(globalId);assert.match(await store.load(locator),/^blob:test\//);assert.equal(atlas.avatar('守门人').status,'bound');
  await atlas.remove(chatId);assert.equal(await store.load(locator),'');
 }finally{atlas.dispose();}
});


test('archive media projection maps Matrix atlas IDs to exact entities without same-name or cross-table borrowing',()=>{
 const targets=[
  {entity:'a',table:'T_CHAR_DOSSIER',group:'人物',label:'守门人',archive_entry_ref:'origin-a'},
  {entity:'a',table:'T_STATIC_ITEMS_SKILLS',group:'物品',label:'守门人',archive_entry_ref:'origin-item-a'}
 ];
 const rows=[
  {id:'avatar',entity_ref:'a',archive_entry_ref:'origin-a',target:{archive_entry_ref:'origin-a'},url:'blob:avatar',purpose:'头像',display_variant:'',binding_scope_label:'全局',applicable:true},
  {id:'portrait',entity_ref:'a',archive_entry_ref:'origin-a',target:{archive_entry_ref:'origin-a'},url:'blob:portrait',purpose:'立绘',display_variant:'',binding_scope_label:'本聊天',applicable:true},
  {id:'happy',entity_ref:'a',archive_entry_ref:'origin-a',target:{archive_entry_ref:'origin-a'},url:'blob:happy',purpose:'表情',display_variant:'开心',binding_scope_label:'角色卡',applicable:true},
  {id:'item',entity_ref:'a',archive_entry_ref:'origin-item-a',target:{archive_entry_ref:'origin-item-a'},url:'blob:item',purpose:'头像',display_variant:'',binding_scope_label:'全局',applicable:true},
  {id:'stale',entity_ref:'a',archive_entry_ref:'other-origin',target:{archive_entry_ref:'other-origin'},url:'blob:stale',purpose:'头像',display_variant:'',binding_scope_label:'全局',applicable:false}
 ];
 const media=createAtlasMediaProjection({targets,rows}),character=media.for('T_CHAR_DOSSIER#a'),item=media.for('T_STATIC_ITEMS_SKILLS#a');
 assert.equal(character.cover.id,'avatar');assert.deepEqual(character.images.map(row=>row.id),['avatar','portrait','happy']);assert.equal(character.images[2].variant,'开心');
 assert.equal(item.cover.id,'item');assert.deepEqual(item.images.map(row=>row.id),['item']);assert.deepEqual(media.for('T_CHAR_DOSSIER#missing').images,[]);
});

function stableObjectFixture(){
 const bundle=bundleFixture();bundle.state.tables[MEDIA_TABLE]={};bundle.state.tables.T_CHAR_DOSSIER.a.values.life_stage='少年';
 bundle.state.tables.T_STATIC_PLACES={hall:record({name:'月灯大厅'})};
 bundle.state.tables.T_SYS_ENTITIES={
  'entity-a':record({kind:'character',name:'守门人',origin_record_ref:'origin-a'}),
  'entity-lamp':record({kind:'item',name:'月灯',origin_record_ref:'origin-lamp'}),
  'entity-hall':record({kind:'place',name:'月灯大厅',origin_record_ref:'origin-hall'})
 };
 bundle.state.tables.M_FIELD_REFERENCES={
  'origin-a':record({owner_table:'T_SYS_ENTITIES',owner_row_uuid:'entity-a',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'a',reference_kind:'record',resolution_status:'resolved'}),
  'origin-lamp':record({owner_table:'T_SYS_ENTITIES',owner_row_uuid:'entity-lamp',owner_field:'origin_record_ref',target_table:'T_STATIC_ITEMS_SKILLS',target_row_uuid:'lamp',reference_kind:'record',resolution_status:'resolved'}),
  'origin-hall':record({owner_table:'T_SYS_ENTITIES',owner_row_uuid:'entity-hall',owner_field:'origin_record_ref',target_table:'T_STATIC_PLACES',target_row_uuid:'hall',reference_kind:'record',resolution_status:'resolved'})
 };
 bundle.state.tables.M_CONDITIONS={cgCondition:record({owner_table:'T_SYS_SOURCE_ROUTES',owner_row_uuid:'gate',owner_field:'activation_condition',group_key:'cg',sequence:0})};
 return bundle;
}

test('stable entities expose every object kind once and stage portraits select exact variants without name borrowing',async()=>{
 const base=stableObjectFixture(),targets=mediaTargets(base);assert.equal(targets.filter(row=>row.table==='T_CHAR_DOSSIER'&&row.origin_record_id==='a').length,1);assert.equal(targets.find(row=>row.entity==='entity-hall').group,'地点');assert.equal(targets.find(row=>row.entity==='entity-lamp').entity,'entity-lamp');
 const db=mutableBundle(base),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL:urlApi(),crypto:webcrypto}),atlas=createChatMediaAtlas({peek:db.peek,mutate:db.mutate,store}),target=targets.find(row=>row.entity==='entity-a');
 try{
  await atlas.importImage({file:file('young'),target,use:'portrait',lifeStage:'少年',width:1200,height:1600});
  await atlas.importImage({file:file('young happy'),target,use:'portrait',lifeStage:'少年',variant:'开心'});
  await atlas.importImage({file:file('adult'),target,use:'portrait',lifeStage:'成年'});
  assert.equal(atlas.portrait('守门人','开心').url,'blob:test/2');assert.equal(atlas.portrait('守门人','冷漠').url,'blob:test/1');assert.equal(atlas.portrait('守门人').frame.ratio,'3:4');
  await db.mutate(engine=>{engine.data.tables.T_CHAR_DOSSIER.a.values.life_stage='成年';});await atlas.refresh(true);assert.equal(atlas.portrait('守门人','开心').url,'blob:test/3');
  assert.equal(atlas.portrait('月灯').status,'missing');assert.equal(atlas.portrait('月灯大厅').status,'missing');
  const ambiguous=stableObjectFixture();ambiguous.state.tables.T_STATIC_PLACES.hall.values.name='守门人';ambiguous.state.tables.T_SYS_ENTITIES['entity-hall'].values.name='守门人';db.set(ambiguous);await atlas.refresh(true);assert.equal(atlas.portrait('守门人').status,'unresolved');
 }finally{atlas.dispose();}
});

test('generic stickers and heart candidate lists work without a character target',async()=>{
 const base=stableObjectFixture(),db=mutableBundle(base),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL:urlApi(),crypto:webcrypto}),atlas=createChatMediaAtlas({peek:db.peek,mutate:db.mutate,store});
 try{
  await atlas.importImage({file:file('global sticker'),use:'sticker',scope:'global',variant:'开心'});await atlas.importImage({file:file('chat sticker'),use:'sticker',variant:'开心'});await atlas.importImage({file:file('calm sticker'),use:'sticker',variant:'平静'});
  assert.equal(atlas.sticker('开心').url,'blob:test/2');const heart=atlas.heart(['开心','平静','不存在']);assert.deepEqual(heart.items.map(row=>row.status),['bound','bound','missing']);assert.equal(heart.items[0].url,'blob:test/2');
  await assert.throws(()=>atlas.heart([]),/一个或多个/);
 }finally{atlas.dispose();}
});

test('CG selection consumes only the condition service result and requires its exact registered scene',async()=>{
 const base=stableObjectFixture(),db=mutableBundle(base),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL:urlApi(),crypto:webcrypto});let matched=false;
 const atlas=createChatMediaAtlas({peek:db.peek,mutate:db.mutate,store,evaluateConditions:async({recordIds})=>({results:recordIds.map(recordId=>({recordId,state:matched?'matched':'not_matched',reasonCode:'test'}))})}),target=mediaTargets(base).find(row=>row.entity==='entity-hall');
 try{
  await assert.rejects(()=>atlas.importImage({file:file('bad'),target,use:'cg',variant:'月下相遇',sceneDescription:'大厅',triggerCondition:'missing'}),/条件组不存在/);
  await atlas.importImage({file:file('cg'),target,use:'cg',variant:'月下相遇',sceneDescription:'月灯大厅的夜晚',triggerCondition:'cgCondition'});assert.equal(atlas.cg('月下相遇','月灯大厅的夜晚').status,'locked');
  matched=true;await atlas.refresh(true);assert.equal(atlas.cg('月下相遇','月灯大厅的夜晚').url,'blob:test/1');assert.equal(atlas.cg('月下相遇','编造场景').status,'mismatch');
  matched=false;await atlas.refresh(true);assert.equal(atlas.cg('月下相遇','月灯大厅的夜晚').status,'locked');
  await assert.rejects(()=>atlas.importImage({file:file('external'),target,use:'cg',scope:'global',variant:'外部',sceneDescription:'外部',triggerCondition:'cgCondition'}),/只保存在本聊天/);
 }finally{atlas.dispose();}
});

test('established rendering syntax consumes bound portraits, stickers, hearts and condition-gated CG',async()=>{
 const base=stableObjectFixture(),db=mutableBundle(base),store=createMediaAssetStore({indexedDB:new IDBFactory(),URL:urlApi(),crypto:webcrypto});let matched=false;
 const atlas=createChatMediaAtlas({peek:db.peek,mutate:db.mutate,store,evaluateConditions:async({recordIds})=>({results:recordIds.map(recordId=>({recordId,state:matched?'matched':'not_matched'}))})}),person=mediaTargets(base).find(row=>row.entity==='entity-a'),place=mediaTargets(base).find(row=>row.entity==='entity-hall');
 configureRenderingMedia(atlas);
 try{
  await atlas.importImage({file:file('portrait'),target:person,use:'portrait',lifeStage:'少年',variant:'开心',width:1200,height:1600});
  await atlas.importImage({file:file('sticker'),use:'sticker',variant:'开心'});
  await atlas.importImage({file:file('cg'),target:place,use:'cg',variant:'月下相遇',sceneDescription:'月灯大厅的夜晚',triggerCondition:'cgCondition',width:1600,height:900});
  assert.equal(atlas.rendering('守门人：开心','body').use,'portrait');assert.equal(atlas.rendering('通用表情：开心','body').use,'sticker');assert.equal(resolveBoundHeart('开心').use,'sticker');
  assert.match(projectRendering('@rendering{守门人：开心}','body'),/<figure class="tisya-bound-media"[^>]+--tisya-media-ratio:1200 \/ 1600/);
  assert.match(projectRendering('@rendering{通用表情：开心}','body'),/<span class="tisya-bound-media"/);
  assert.match(projectRendering('@rendering{月下相遇：月灯大厅的夜晚}','body'),/条件CG尚未通过规范条件/);
  matched=true;await atlas.refresh(true);assert.match(projectRendering('@rendering{月下相遇：月灯大厅的夜晚}','body'),/<figure class="tisya-bound-media"/);
  assert.match(projectRendering('@rendering{月下相遇：编造场景}','body'),/未绑定或场景描述不一致/);
  assert.equal(resolveRendering('@rendering{emotion.好奇}','anchor')[0].name,'好奇');
 }finally{configureRenderingMedia(null);atlas.dispose();}
});
