import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createPhonePresentationMedia} from '../phone-life/presentation-media.mjs';
import {MEDIA_STORES,mediaDatabaseSchema} from '../engine/media-database.mjs';

const seed=async(indexedDB,name,schema,store,records)=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>schema(r.result);r.onerror=reject;r.onsuccess=()=>resolve(r.result);});
 await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');for(const record of records)tx.objectStore(store).put(record);tx.oncomplete=resolve;tx.onerror=reject;});db.close();
};
const fixture=()=>({snapshot:{life:{bindingKey:'b',mediaOriginContextKey:'c',state:{media:{photos:[{id:'photo',assetId:'actual-original',source:'file',name:'已登记图片'}],songs:[]}}}},key:JSON.stringify(['c','b','actual-original'])});

test('reader does not create a missing media database',async()=>{
 const indexedDB=new IDBFactory(),driver=createPhonePresentationMedia({indexedDB,URL:{createObjectURL(){throw Error('unexpected');},revokeObjectURL(){}},getContextKey:()=> 'c'}),snapshot={life:{bindingKey:'b',mediaOriginContextKey:'c',state:{media:{photos:[{id:'i',assetId:'missing-original',source:'file'}],songs:[]}}}};
 assert.deepEqual(await driver.readMedia({ids:['i'],snapshot,contextKey:'c'}),[]);assert.equal((await indexedDB.databases()).length,0);driver.dispose();
});
test('reader opens only registered scoped originals and releases object URLs',async()=>{
 const indexedDB=new IDBFactory(),{snapshot,key}=fixture();
 await seed(indexedDB,'tisya-media',mediaDatabaseSchema,MEDIA_STORES.phoneAssets,[{id:key,blob:new Blob(['image'],{type:'image/png'})}]);
 let allocated=0,released=0;const driver=createPhonePresentationMedia({indexedDB,URL:{createObjectURL(){allocated++;return 'blob:test';},revokeObjectURL(){released++;}},getContextKey:()=> 'c'}),request={ids:['photo','unregistered'],snapshot,contextKey:'c'};
 const a=await driver.readMedia(request),b=await driver.readMedia(request);assert.equal(a.length,1);assert.equal(a[0].id,'photo');assert.equal(allocated,1);driver.releaseMedia(request);assert.equal(released,0);driver.releaseMedia(request);assert.equal(released,1);assert.deepEqual(b,a);driver.dispose();
});
test('reader relocates a legacy phone media database once, verifies bytes and removes it',async()=>{
 const indexedDB=new IDBFactory(),{snapshot,key}=fixture(),bytes=new Blob(['legacy image'],{type:'image/png'});
 await seed(indexedDB,'tisya-phone-host-media',db=>db.createObjectStore('assets',{keyPath:'id'}),'assets',[{id:key,blob:bytes}]);
 const driver=createPhonePresentationMedia({indexedDB,URL:{createObjectURL(){return 'blob:relocated';},revokeObjectURL(){}},getContextKey:()=> 'c'});
 const a=await driver.readMedia({ids:['photo'],snapshot,contextKey:'c'});
 assert.equal(a.length,1);assert.equal(a[0].url,'blob:relocated');driver.dispose();
 const names=(await indexedDB.databases()).map(d=>d.name);
 assert.deepEqual(names,['tisya-media']);
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tisya-media',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
 const row=await new Promise((resolve,reject)=>{const r=db.transaction(MEDIA_STORES.phoneAssets,'readonly').objectStore(MEDIA_STORES.phoneAssets).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});db.close();
 assert.equal(await row.blob.text(),'legacy image');
});
