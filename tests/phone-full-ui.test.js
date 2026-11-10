import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneDatabaseStorage} from '../engine/phone-database.mjs';
import {initializeState} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {readFileSync} from 'node:fs';
import {chatKey} from '../engine/controller.mjs';
import {bootPhone} from '../phone-app.mjs';
import {PHONE_WORLD_FORMAT,PHONE_CHARACTER_FORMAT} from '../phone-life-config.mjs';
import {phoneArchiveMediaIds} from '../phone-life/media-archive.mjs';
import {photoEditPixels,normalizePhotoEdit} from '../phone-life/photo-editor.mjs';
import {phoneLyrics,songPlayAccess} from '../phone-life/media-ui.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const profile=()=>({database:true,calendar:{mode:'MONTH_TABLE',month_lengths:[31,28,31,30,31,30,31,31,30,31,30,31],leap_rule:'GREGORIAN',year:2033,month:1,day:1,hour:9,minute:0,day_hours:24,hour_minutes:60},binding:{world:{database:true,worldId:'w'},character:{database:true,entityId:'person',dossierId:'person'}},world:{format:PHONE_WORLD_FORMAT,id:'w',name:'独立测试世界',apps:['album','music','weibo'],appNames:{},theme:{},phoneEpoch:null,settlementOwner:'tables',currency:{name:'银元',symbol:'¤',minorUnits:2},economy:{deliveryFees:{shop:0,food:0},loan:null,investments:[]},travel:{speeds:{}},places:[],catalog:[]},character:{format:PHONE_CHARACTER_FORMAT,id:'person',name:'本人',position:null,activeAccountId:'main',wallet:{accounts:[],defaultAccountId:null,fundingAccountId:null,card:{enabled:false,id:null,name:'',limit:null,used:0,refundBalance:0,billDay:null,dueDay:null,charges:[],statements:[]},loans:[],investments:[]},contacts:[],accounts:[{id:'main',name:'主账号',handle:'main',personId:'person',owned:true,following:[]},{id:'alt',name:'小号',handle:'alt',personId:'person',owned:true,following:[]}],posts:[],photos:[],songs:[],playlists:[],calendar:[]}});
let sequence=0;
async function fixture({initialize=true}={}){
 const context={chatId:'full-ui-'+(++sequence),characterId:0,groupId:null,chatMetadata:{},chat:[]},key=chatKey(context),db=new IDBFactory(),win=new Window({url:'http://localhost/phone.html?chat='+encodeURIComponent(key)+'&app=home'}),doc=win.document;
 doc.body.innerHTML='<main id="phone-root"></main>';Object.defineProperty(win,'indexedDB',{value:db});
 const urls=new Map(),revoked=new Set();let urlSeq=0;
 const NativeURL=win.URL;win.URL=class extends NativeURL{static createObjectURL(blob){const url='blob:full-ui-'+(++urlSeq);urls.set(url,blob);return url;}static revokeObjectURL(url){revoked.add(url);}};
 win.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result=`data:${blob.type};base64,${Buffer.from(data).toString('base64')}`;this.onload?.();},error=>{this.error=error;this.onerror?.();});}};
 doc.addEventListener('click',event=>{if(event.target.closest('a[download]'))event.preventDefault();});
 let app,serial=0,saves=0,fail=false,plays=0,pauses=0,identityOpens=0;
 let data=initializeState(catalog),revision=0;const initial=new Runtime(data);initial.newRecord('T_STATIC_WORLDS',{name:'独立测试世界'},'w');initial.newRecord('X_WORLD_CLOCKS',{world_ref:'w',...profile().calendar},'clock');data=initial.data;
 const database={read:async()=>({state:structuredClone(data),revision,contextKey:key}),async commit({expectedRevision,operationId,changes,schema,source}){saves++;if(fail)throw Error('fixture save rejected');assert.equal(expectedRevision,revision);const runtime=new Runtime(data);for(const table of schema??[]){if(!runtime.data.schema[table.id]){runtime.data.schema[table.id]=table;runtime.data.tables[table.id]={};}else for(const field of table.fields)if(!runtime.data.schema[table.id].fields.some(f=>f.key===field.key))runtime.declareField(table.id,field);}const receipt=runtime.transaction(operationId,{changes,source},()=>{for(const change of changes){if(change.remove){delete runtime.data.tables[change.tableId][change.recordId];continue;}if(!runtime.rows(change.tableId)[change.recordId])runtime.newRecord(change.tableId,{},change.recordId);for(const [k,v] of Object.entries(change.values))runtime.set([change.tableId,change.recordId,k,[]],v);if(change.metadata)runtime.record(change.tableId,change.recordId).metadata=change.metadata;}});if(receipt.status==='FAILED')throw Error(receipt.error.message);data=runtime.data;revision++;return {state:structuredClone(data),revision,contextKey:key,receipt};}};
 const service=createPhoneService({seed:{accounts:{me:{name:'我'}},documents:[]},contextKey:key,idFactory:()=>`full-${++serial}`,storage:createPhoneDatabaseStorage({database,contextKey:key}),onChange:()=>app?.refresh()});
 await service.init();if(initialize)await service.initLife(profile());
 const host={service:async()=>service,contextKey:()=>key,selectionKey:()=>key,initializeLife:()=>service.initLife(profile()),openIdentity:()=>{identityOpens++;},open:()=>{},close:()=>{}};win.Tisya={phone:host};
 async function mount(){app?.dispose();app=await bootPhone({win,doc});const audio=app.getRoot().querySelector('audio');if(audio){let paused=true;Object.defineProperty(audio,'paused',{get:()=>paused,configurable:true});Object.defineProperty(audio,'duration',{get:()=>120,configurable:true});audio.play=async()=>{plays++;paused=false;audio.dispatchEvent(new win.Event('play'));};audio.pause=()=>{pauses++;const was=paused;paused=true;if(!was)audio.dispatchEvent(new win.Event('pause'));};audio.dispatchEvent(new win.Event('loadedmetadata'));}}
 await mount();
 async function settle(){await sleep(5);await app.settled?.();await sleep(5);}
 async function put(id,bytes,type='image/png'){
  const conn=await new Promise((resolve,reject)=>{const q=db.open('tisya-phone-host-media',1);q.onupgradeneeded=()=>q.result.createObjectStore('assets',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  try{const life=service.readLife();await new Promise((resolve,reject)=>{const tx=conn.transaction('assets','readwrite');tx.objectStore('assets').add({id:JSON.stringify([life.mediaOriginContextKey??key,life.bindingKey,id]),blob:new Blob([bytes],{type})});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{conn.close();}
 }
 async function addPhoto(id='photo',extra={}){await put(extra.assetId??id,'original '+id,extra.mime??'image/png');await app.dispatch({type:'media.photo.add',photo:{id,assetId:id,name:'图片 '+id,source:'file',mime:'image/png',ownerId:'main',visibility:'private',savedAt:'2026-11-10T12:00:00.000Z',...extra}});await mount();}
 async function addSong(id='song',extra={}){await put('audio-'+id,'audio '+id,'audio/wav');await app.dispatch({type:'music.song.add',song:{id,title:'作品 '+id,artist:'本人',audioId:'audio-'+id,...extra}});}
 async function submit(selector,values){const form=app.getRoot().querySelector(selector);assert(form,selector);for(const [key,value]of Object.entries(values))form.elements.namedItem(key).value=String(value);form.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await settle();}
 return {win,doc,context,service,host,urls,revoked,put,addPhoto,addSong,submit,settle,mount,get app(){return app;},get root(){return app.getRoot();},get audio(){return app.getRoot().querySelector('audio');},get plays(){return plays;},get pauses(){return pauses;},get saves(){return saves;},get identityOpens(){return identityOpens;},failSaves(){fail=true;},close(){app?.dispose();win.close();}};
}
test('uninitialized phone offers explicit initialization and identity navigation without seeding on open',async t=>{
 const f=await fixture({initialize:false});t.after(()=>f.close());assert.equal(f.service.readLife(),null);assert.match(f.root.textContent,/尚未初始化/);const before=f.saves;
 f.root.querySelector('[data-initialize]').click();await f.settle();assert.equal(f.identityOpens,1);assert.equal(f.saves,before);
 f.root.querySelector('[data-initialize-phone]').click();await sleep(30);await f.service.settled();assert(f.service.readLife());assert.equal(f.win.localStorage.length,0);
});
test('actual album UI creates, assigns, trashes, restores and keeps referenced bytes',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.addPhoto();await f.app.handle('nav',{app:'album',tab:'albums'});await f.submit('form[data-action="media.album.create"]',{name:'旅途'});
 const album=f.service.readLife().state.media.albums[0];assert.equal(album.name,'旅途');await f.app.handle('ui',{tab:'all',detail:'photo'});await f.submit('form[data-action="media.photo.assign"]',{albumId:album.id});assert.equal(f.service.readLife().state.media.photos[0].albumId,album.id);
 await f.app.handle('media.confirm.trash',{photoId:'photo'});const confirm=f.root.querySelector('[data-action="media.confirm.apply"]');assert(confirm);confirm.click();await f.settle();assert(f.service.readLife().state.media.photos[0].deletedAt);assert.equal(f.root.querySelector('.album-photo-tile'),null);
 await f.app.handle('ui',{tab:'trash',detail:'photo'});await f.app.handle('media.photo.restore',{photoId:'photo'});assert.equal(f.service.readLife().state.media.photos[0].deletedAt,undefined);
 await f.app.dispatch({type:'media.photo.trash',photoId:'photo'});await f.app.handle('media.confirm.purge',{photoId:'photo'});f.root.querySelector('[data-action="media.confirm.apply"]').click();await f.settle();assert.equal(f.service.readLife().state.media.photos[0].purged,true);assert(phoneArchiveMediaIds(JSON.parse(f.service.export())).includes('photo'));assert.equal(await [...f.urls.values()].find(b=>b.type==='image/png').text(),'original photo');
});
test('theme uses actual owned media, survives reopen and cannot publish a private background',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.addPhoto();await f.app.handle('nav',{app:'settings'});await f.app.handle('theme.preset',{preset:'night'});await f.submit('form[data-action="theme.save"]',{backgroundId:'photo',fit:'contain',overlay:35});
 let s=f.service.readLife().state;assert.equal(s.media.theme.preset,'night');assert.equal(s.media.photos[0].visibility,'private');assert.match(f.root.querySelector('.phone').style.getPropertyValue('--phone-wallpaper'),/blob:full-ui/);
 await f.mount();assert.equal(f.root.querySelector('.phone').dataset.phoneTheme,'night');assert.equal(f.service.readLife().state.media.theme.overlay,35);
 await f.app.handle('social.account',{accountId:'alt'});assert.equal(f.root.querySelector('.phone').style.getPropertyValue('--phone-wallpaper'),'none');
});
test('crop preview and actual save handler create a derived file without changing the original',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.addPhoto();const calls=[];f.win.createImageBitmap=async()=>({width:200,height:100,close(){}});
 const original=f.doc.createElement.bind(f.doc);f.doc.createElement=(name,...args)=>name==='canvas'?{width:0,height:0,getContext:()=>({drawImage(...a){calls.push(a.slice(1));}}),toBlob(fn){fn(new Blob(['cropped real canvas adapter bytes'],{type:'image/png'}));}}:original(name,...args);
 await f.app.handle('media.edit',{photoId:'photo'});await f.submit('form[data-action="media.edit.apply"]',{kind:'crop',x:25,y:10,width:50,height:80});
 const photos=f.service.readLife().state.media.photos;assert.equal(photos.length,2);assert.equal(photos[1].derivedFrom,'photo');assert.equal(photos[1].visibility,'private');assert.equal(photos[0].name,'图片 photo');assert.deepEqual(calls[0],[50,10,100,80,0,0,100,80]);assert.equal(await f.urls.get(f.app.helpers.mediaUrl('photo')).text(),'original photo');assert.equal(photos[1].edit.kind,'crop');
});
test('actual audio progress, volume, mode and queue reopen paused with the saved position',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.addSong();await f.addSong('two');await f.app.handle('player.play',{songId:'song'});assert.equal(f.plays,1);f.audio.currentTime=37.5;f.audio.dispatchEvent(new f.win.Event('timeupdate'));await f.settle();await f.app.handle('player.mode',{mode:'repeat-one'});await f.app.handle('player.pause');const value=f.service.readLife().state.media.playback;assert.equal(value.position,37.5);assert.equal(value.mode,'repeat-one');assert.deepEqual(value.history,['song']);
 const count=f.plays;await f.mount();assert.equal(f.plays,count,'reopening does not autoplay');assert.equal(f.audio.currentTime,37.5);assert.match(f.audio.getAttribute('src'),/^blob:/);await f.app.handle('player.enqueue',{songId:'two'});await f.app.handle('player.queue.move',{songId:'two',step:-1});assert.deepEqual(f.service.readLife().state.media.playback.queue,['two','song']);
});
test('private songs stop when switching account and remain absent from its music views',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.addSong();await f.app.handle('player.play',{songId:'song'});const before=f.pauses;await f.app.handle('social.account',{accountId:'alt'});assert(f.pauses>before);assert.equal(f.audio.getAttribute('src'),null);await f.app.handle('nav',{app:'music'});assert.doesNotMatch(f.root.querySelector('#screen').textContent,/作品 song/);await assert.rejects(f.app.handle('player.play',{songId:'song'}),/不存在|权限/);
});
test('lyrics and comments use actual forms and only real time tags synchronize',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.addSong();await f.app.handle('nav',{app:'music',detail:'song'});await f.app.handle('music.lyrics.edit',{songId:'song'});await f.submit('form[data-action="music.lyrics.save"]',{lyrics:'[00:01.00]第一句\n[00:05.50]第二句'});await f.submit('form[data-action="music.comment"]',{text:'记住这句。'});const song=f.service.readLife().state.media.songs[0];assert.equal(song.comments[0].text,'记住这句。');assert.equal(phoneLyrics(song.lyrics,6).active,1);assert.equal(phoneLyrics('没有时间的原文',100).timed,false);
});
test('missing and unauthorized paid audio never call play',async t=>{
 const f=await fixture();t.after(()=>f.close());await f.app.dispatch({type:'music.song.add',song:{id:'missing',title:'仅有资料',artist:'本人',audioId:null}});await assert.rejects(f.app.handle('player.play',{songId:'missing'}),/音源/);assert.equal(f.plays,0);
 const s=f.service.readLife().state,p={id:'paid',title:'收费作品',ownerId:'main',visibility:'private',entitlementProductId:'album-product'};assert.equal(songPlayAccess(s,p).allowed,false);s.commerce.entitlements=[{id:'ent',productId:'album-product',ownerId:'person',status:'active',expiresAt:null}];assert.equal(songPlayAccess(s,p).allowed,true);
});
test('ownership error boot retains data and exposes real retry, identity and close controls',async()=>{
 const win=new Window({url:'http://localhost/phone.html?chat='+encodeURIComponent('["character","0","chat"]')}),doc=win.document;doc.body.innerHTML='<div id="phone-root"></div>';let attempts=0,identity=0,closed=0;
 win.Tisya={phone:{contextKey:()=>'["character","0","chat"]',service:async()=>{attempts++;throw Object.assign(Error('手机归属与当前聊天不一致，且没有可核对的原生父分支，未覆盖存档。'),{code:'PHONE_CONTEXT_CHANGED'});},openIdentity:()=>{identity++;},close:()=>{closed++;}}};win.console.error=()=>{};
 await assert.rejects(bootPhone({win,doc}),e=>e.code==='PHONE_CONTEXT_CHANGED');doc.querySelector('[data-phone-error-identity]').click();doc.querySelector('[data-phone-error-close]').click();doc.querySelector('[data-phone-error-retry]').click();await sleep(10);assert.equal(identity,1);assert.equal(closed,1);assert.equal(attempts,2);assert.match(doc.body.textContent,/不会改归属/);win.close();
});
test('crop bounds reject invalid regions before decoding or producing derivatives',()=>{assert.throws(()=>normalizePhotoEdit({x:80,width:30}),/图片内/);assert.throws(()=>normalizePhotoEdit({kind:'annotate',text:''}),/标注/);assert.deepEqual(photoEditPixels({x:20,y:10,width:50,height:60},200,100),{kind:'crop',x:40,y:10,width:100,height:60,color:'#ffffff'});});
