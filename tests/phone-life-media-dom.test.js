import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {createPhoneService} from '../phone-core.mjs';
import {PHONE_TURN_KEY,phoneSource} from '../phone-turn-host.js';
import {currentPhoneHost,matrixMemoryStorage} from './fixtures/phone-host-current.mjs';
import {chatKey} from '../engine/controller.mjs';
import {bootPhone} from '../phone-app.mjs';
import {phoneProfile,currentCalendar} from './fixtures/phone-current.mjs';

const profile=()=>phoneProfile({worldId:'media-world',personId:'person',world:{name:'媒体测试世界',apps:['album','music']},character:{accounts:[{id:'main',name:'本人账号',handle:'main',owned:true}]},calendar:{...currentCalendar(),month:4,day:8,hour:15,minute:30}});
let fixtureSequence=0;

async function fixture({context=null,database=new IDBFactory(),matrixStore=matrixMemoryStorage(),initialize=true}={}){
  context??={chatId:`media-chat-${++fixtureSequence}`,characterId:3,groupId:null,chatMetadata:{},chat:[]};
  const key=chatKey(context),win=new Window({url:'http://localhost/phone.html?chat='+encodeURIComponent(key)+'&app=music'}),doc=win.document;
  doc.body.innerHTML='<div id="phone-root"></div>';
  Object.defineProperty(win,'indexedDB',{value:database,configurable:true});

  // Browser-only surfaces are simulated, not the application or persistence:
  // capture object URLs/download bytes; audio records play/pause without decoding.
  // fake-indexeddb clones Node Blobs, so this FileReader adapter bridges those
  // actual stored bytes into the same data URL format the browser would produce.
  const urls=new Map(),revoked=new Set();let urlSequence=0;
  const NativeURL=win.URL;
  Object.defineProperty(win,'URL',{value:class extends NativeURL {
    static createObjectURL(blob){const url=`blob:media-test-${++urlSequence}`;urls.set(url,blob);return url;}
    static revokeObjectURL(url){revoked.add(url);}
  },configurable:true});
  win.FileReader=class {
    readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();},error=>{this.error=error;this.onerror?.();});}
  };
  doc.addEventListener('click',event=>{if(event.target.closest('a[download]'))event.preventDefault();});

  let app,root,audio,serial=0,playCount=0,pauseCount=0;
  const matrix=await currentPhoneHost({context,storage:matrixStore,...(initialize?{profile:profile()}:{})});
  const service=createPhoneService({seed:{accounts:{me:{name:'我'}},documents:[]},contextKey:key,idFactory:()=>`media-service-${++serial}`,storage:matrix.phoneStorage,onChange:()=>app?.refresh()});
  await service.init();if(initialize)await service.initLife(profile());
  win.Tisya={phone:{contextKey:()=>key,selectionKey:()=> 'media-profile',service:async()=>service,openIdentity:()=>{}}};
  async function mount(){
    app?.dispose();app=await bootPhone({win,doc});root=app.getRoot();audio=root.querySelector('audio');
    audio.play=async()=>{playCount++;};audio.pause=()=>{pauseCount++;};
  }
  await mount();
  async function putAsset(id,bytes,type='audio/wav'){
    const db=await new Promise((resolve,reject)=>{const request=database.open('tisya-phone-host-media',1);request.onupgradeneeded=()=>request.result.createObjectStore('assets',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{
      const life=service.readLife();
      await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').add({id:JSON.stringify([life.mediaOriginContextKey??key,life.bindingKey,id]),blob:new Blob([bytes],{type})});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    }finally{db.close();}
  }
  return {context,database,matrix,matrixStore,win,doc,service,urls,revoked,putAsset,remount:mount,get app(){return app;},get root(){return root;},get audio(){return audio;},get playCount(){return playCount;},get pauseCount(){return pauseCount;},close(){app?.dispose();win.close();}};
}

async function addSong(f,{id='song',audioId='audio-before',operation='song-add'}={}){
  await f.app.dispatch({id:operation,type:'music.song.add',song:{id,title:'同一歌曲',artist:'角色录音',audioId}});
}

async function acceptFrame(f,requestId,{replay=false,variant='first'}={}){
  const key=chatKey(f.context),uid=`assistant-${requestId}`;
  await f.service.prepareTurn({chatKey:key,...(replay?{replayRequestId:requestId}:{requestId,anchorUid:`user-${requestId}`})});
  const acks=f.service.getState().requests[requestId].actionIds;
  const message={is_user:false,mes:`${variant}<extra><phone>${JSON.stringify({requestId,acks,blocks:[],markers:[],lifeUpdates:[]})}</phone></extra>`,extra:{tisya_engine:{uid}}};
  const source=phoneSource(message);await f.service.acceptTurn({chatKey:key,requestId,...source});
  if(!replay)f.context.chat.push({is_user:true,mes:'继续',extra:{tisya_engine:{uid:`user-${requestId}`},[PHONE_TURN_KEY]:{requests:[{requestId}]}}},message);
  return source;
}

test('actual hosted export includes both current and frozen historical audio originals after a source replacement',async t=>{
  const f=await fixture();t.after(()=>f.close());
  await f.putAsset('audio-before','the original recording');await f.putAsset('audio-after','the replacement recording');
  await addSong(f);const asset=Object.values((await f.matrix.snapshot()).state.tables.T_SYS_MEDIA_ASSETS)[0];assert.equal(asset.values.entity_ref,'person');assert.equal(f.service.readLife().state.media.songs[0].ownerId,'main');const cold=await currentPhoneHost({context:f.context,storage:f.matrixStore});assert.equal((await cold.read()).life.state.media.songs[0].ownerId,'main');const source=await acceptFrame(f,'media-history');
  await f.app.handle('player.play',{songId:'song'});const oldURL=f.audio.getAttribute('src'),paused=f.pauseCount;
  await f.app.dispatch({id:'replace-source',type:'music.source.attach',songId:'song',mediaId:'audio-after'});
  assert.equal(f.audio.getAttribute('src'),null);assert.ok(f.pauseCount>paused);assert.ok(f.revoked.has(oldURL));
  await f.app.handle('player.play',{songId:'song'});assert.notEqual(f.audio.getAttribute('src'),oldURL);
  await f.app.handle('backup.export');
  const download=[...f.urls.values()].find(blob=>blob.type==='application/json');assert.ok(download,'the real export handler created a JSON download');
  const backup=JSON.parse(await download.text()),archive=JSON.parse(backup.archive);
  assert.equal(archive.life.state.media.songs[0].audioId,'audio-after');assert.equal(archive.frames[source.sourceId].lifeAfter.life.state.media.songs[0].audioId,'audio-before');
  assert.deepEqual(Object.keys(backup.media).sort(),['audio-after','audio-before']);
  assert.equal(Buffer.from(backup.media['audio-before'].split(',')[1],'base64').toString(),'the original recording');
  assert.equal(Buffer.from(backup.media['audio-after'].split(',')[1],'base64').toString(),'the replacement recording');
});

test('verified native child branch reads the parent original from its immutable media origin',async t=>{
  const parent=await fixture();t.after(()=>parent.close());await parent.putAsset('audio-before','parent original bytes');await addSong(parent);await acceptFrame(parent,'native-media');
  const parentArchive=JSON.stringify(await parent.matrix.read());
  const childContext={...parent.context,chatId:parent.context.chatId+'-branch',chat:structuredClone(parent.context.chat),chatMetadata:{...structuredClone(parent.context.chatMetadata),main_chat:parent.context.chatId,integrity:'verified-native-child'}};
  const child=await fixture({context:childContext,database:parent.database,matrixStore:parent.matrixStore,initialize:false});t.after(()=>child.close());
  assert.equal(child.service.getState().contextKey,chatKey(childContext));assert.equal(child.service.readLife().mediaOriginContextKey,chatKey(parent.context));
  assert.equal(child.service.readLife().bindingKey,parent.service.readLife().bindingKey);assert.ok(child.app.helpers.mediaUrl('audio-before'));
  await child.app.handle('player.play',{songId:'song'});assert.equal(child.playCount,1);
  const actualBlob=child.urls.get(child.audio.getAttribute('src'));assert.equal(await actualBlob.text(),'parent original bytes');
  assert.equal(JSON.stringify(await parent.matrix.read()),parentArchive,'opening the child does not rewrite the parent database');
});

test('reroll removing later media stops old audio, revokes live URLs and closes the former photo view',async t=>{
  const f=await fixture();t.after(()=>f.close());await acceptFrame(f,'before-media');
  await f.putAsset('audio-later','later branch audio');await f.putAsset('photo-later','later private photo','image/png');
  await addSong(f,{audioId:'audio-later'});
  await f.app.dispatch({id:'photo-add',type:'media.photo.add',photo:{id:'photo-later',assetId:'photo-later',name:'分支相片',mime:'image/png',source:'file',ownerId:'main',visibility:'private'}});
  await f.remount();await f.app.handle('player.play',{songId:'song'});await f.app.handle('media.open',{photoId:'photo-later'});
  const audioURL=f.audio.getAttribute('src'),photoURL=f.app.helpers.mediaUrl('photo-later'),paused=f.pauseCount;assert.ok(f.root.querySelector('.photo-lightbox'));
  await acceptFrame(f,'before-media',{replay:true,variant:'rerolled'});
  assert.equal(f.service.readLife().state.media.songs.length,0);assert.equal(f.service.readLife().state.media.photos.length,0);
  assert.equal(f.audio.getAttribute('src'),null);assert.ok(f.pauseCount>paused);assert.equal(f.root.querySelector('.photo-lightbox'),null);
  assert.ok(f.revoked.has(audioURL));assert.ok(f.revoked.has(photoURL));assert.equal(f.app.helpers.mediaUrl('photo-later'),'');
});
