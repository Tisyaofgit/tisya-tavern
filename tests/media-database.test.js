import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {MEDIA_DATABASE,MEDIA_STORES,mediaDatabaseSchema,openMediaDatabase,openExistingMediaDatabase,relocateLegacyMediaDatabases} from '../engine/media-database.mjs';

const names=async indexedDB=>(await indexedDB.databases()).map(d=>d.name).sort();
const seedLegacy=async(indexedDB,name,store,records)=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
 await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');for(const record of records)tx.objectStore(store).put(record);tx.oncomplete=resolve;tx.onerror=reject;});db.close();
};
const readAll=async(db,store)=>new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=reject;});

test('unified media database creates every domain store in one schema',async()=>{
 const indexedDB=new IDBFactory();
 const db=await openMediaDatabase({indexedDB});
 assert.deepEqual([...db.objectStoreNames].sort(),['atlas-assets','atlas-bindings','phone-assets','phone-preview-assets'].sort());
 db.close();assert.deepEqual(await names(indexedDB),[MEDIA_DATABASE]);
});

test('all three legacy media databases relocate into their domain stores with bytes verified',async()=>{
 const indexedDB=new IDBFactory();
 await seedLegacy(indexedDB,'tisya-media-atlas','assets',[{id:'sha256-a',blob:new Blob(['图鉴字节'],{type:'image/png'})}]);
 await seedLegacy(indexedDB,'tisya-phone-host-media','assets',[{id:JSON.stringify(['c','b','p']),blob:new Blob(['手机字节'],{type:'audio/wav'})}]);
 await seedLegacy(indexedDB,'tisya-phone-life-media','assets',[{id:'preview-1',blob:new Blob(['预览字节'],{type:'image/png'})}]);
 // 图鉴 v2 还有 bindings store，单独补种
 const atlas=await new Promise((resolve,reject)=>{const r=indexedDB.open('tisya-media-atlas',2);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('bindings'))r.result.createObjectStore('bindings',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
 await new Promise((resolve,reject)=>{const tx=atlas.transaction('bindings','readwrite');tx.objectStore('bindings').put({id:'global:1',scope:'global'});tx.oncomplete=resolve;tx.onerror=reject;});atlas.close();

 const results=await relocateLegacyMediaDatabases({indexedDB});
 assert.deepEqual(results.map(r=>[r.from,r.moved,r.deleted]),[['tisya-media-atlas',2,true],['tisya-phone-host-media',1,true],['tisya-phone-life-media',1,true]]);
 assert.deepEqual(await names(indexedDB),[MEDIA_DATABASE]);
 const db=await openMediaDatabase({indexedDB});
 assert.equal(await (await readAll(db,MEDIA_STORES.atlasAssets))[0].blob.text(),'图鉴字节');
 assert.equal((await readAll(db,MEDIA_STORES.atlasBindings))[0].id,'global:1');
 assert.equal(await (await readAll(db,MEDIA_STORES.phoneAssets))[0].blob.text(),'手机字节');
 assert.equal(await (await readAll(db,MEDIA_STORES.previewAssets))[0].blob.text(),'预览字节');
 db.close();
});

test('reader probe returns null when nothing exists and relocates only through the legacy path',async()=>{
 const indexedDB=new IDBFactory();
 assert.equal(await openExistingMediaDatabase({indexedDB,requireStores:[MEDIA_STORES.phoneAssets]}),null);
 assert.deepEqual(await names(indexedDB),[]);
 await seedLegacy(indexedDB,'tisya-phone-host-media','assets',[{id:'k',blob:new Blob(['x'],{type:'image/png'})}]);
 const db=await openExistingMediaDatabase({indexedDB,requireStores:[MEDIA_STORES.phoneAssets]});
 assert.ok(db);assert.equal((await readAll(db,MEDIA_STORES.phoneAssets)).length,1);db.close();
 assert.deepEqual(await names(indexedDB),[MEDIA_DATABASE]);
});

test('concurrent opens share one relocation flight and never duplicate records',async()=>{
 const indexedDB=new IDBFactory();
 await seedLegacy(indexedDB,'tisya-media-atlas','assets',[{id:'sha256-c',blob:new Blob(['c'],{type:'image/png'})}]);
 const [a,b]=await Promise.all([openMediaDatabase({indexedDB}),openMediaDatabase({indexedDB})]);
 assert.equal((await readAll(a,MEDIA_STORES.atlasAssets)).length,1);
 a.close();b.close();assert.deepEqual(await names(indexedDB),[MEDIA_DATABASE]);
});
