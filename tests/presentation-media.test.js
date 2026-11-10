import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createPhonePresentationMedia} from '../phone-life/presentation-media.mjs';
test('reader does not create a missing media database',async()=>{
 const indexedDB=new IDBFactory(),driver=createPhonePresentationMedia({indexedDB,URL:{createObjectURL(){throw Error('unexpected');},revokeObjectURL(){}},getContextKey:()=> 'c'}),snapshot={life:{bindingKey:'b',mediaOriginContextKey:'c',state:{media:{photos:[{id:'i',assetId:'missing-original',source:'file'}],songs:[]}}}};
 assert.deepEqual(await driver.readMedia({ids:['i'],snapshot,contextKey:'c'}),[]);assert.equal((await indexedDB.databases()).length,0);driver.dispose();
});
test('reader opens only registered scoped originals and releases object URLs',async()=>{
 const indexedDB=new IDBFactory(),db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tisya-phone-host-media',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets',{keyPath:'id'});r.onerror=reject;r.onsuccess=()=>resolve(r.result);});
 const key=JSON.stringify(['c','b','actual-original']);await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put({id:key,blob:new Blob(['image'],{type:'image/png'})});tx.oncomplete=resolve;tx.onerror=reject;});db.close();
 let allocated=0,released=0;const driver=createPhonePresentationMedia({indexedDB,URL:{createObjectURL(){allocated++;return 'blob:test';},revokeObjectURL(){released++;}},getContextKey:()=> 'c'}),snapshot={life:{bindingKey:'b',mediaOriginContextKey:'c',state:{media:{photos:[{id:'photo',assetId:'actual-original',source:'file',name:'已登记图片'}],songs:[]}}}},request={ids:['photo','unregistered'],snapshot,contextKey:'c'};
 const a=await driver.readMedia(request),b=await driver.readMedia(request);assert.equal(a.length,1);assert.equal(a[0].id,'photo');assert.equal(allocated,1);driver.releaseMedia(request);assert.equal(released,0);driver.releaseMedia(request);assert.equal(released,1);assert.deepEqual(b,a);driver.dispose();
});
