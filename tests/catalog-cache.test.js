import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatrixHost} from '../engine/host.mjs';
import {digest,stable} from '../engine/common.mjs';

function fixture({catalog,signature=digest(catalog),loadCatalog=null,storage=null,onError=()=>{}}={}){
 const disk=new Map(),context={chatId:'catalog-cache',characterId:0,chat:[],chatMetadata:{},extensionSettings:{}};
 const backend=storage??{get:async key=>structuredClone(disk.get(key)),set:async(key,value)=>disk.set(key,structuredClone(value)),commit:async()=>false};
 let loads=0;
 const host=createMatrixHost({getContext:()=>context,getSource:()=>({}),loadCatalog:async()=>{loads++;if(loadCatalog)return loadCatalog();return structuredClone(catalog);},catalogSignature:signature,storage:backend,persistSettings:async()=>true,persistMetadata:async()=>true,onError});
 return {host,disk,loads:()=>loads};
}

test('signed catalog cache reopens without a network read and concurrent first loads share one fetch',async()=>{
 const catalog={tables:[{id:'T_ONE',label:'一',fields:[]}]},f=fixture({catalog});
 const [first,second]=await Promise.all([f.host.catalog(),f.host.catalog()]);assert.deepEqual(first,second);assert.equal(f.loads(),1);
 const row=f.disk.get('derived:matrix-catalog');assert.equal(row.format,'tisya.matrix-catalog/3');assert.equal(typeof row.bytes,'string');assert.equal('value' in row,false);
 // The reopening fixture uses the same canonical backend through cloning wrappers.
 const storage={get:async key=>structuredClone(f.disk.get(key)),set:async(key,value)=>f.disk.set(key,structuredClone(value))};
 const cached=fixture({catalog,storage,loadCatalog:()=>{throw Error('network must not be read');}});
 assert.deepEqual(await cached.host.catalog(),first);assert.equal(cached.loads(),0);
});

test('stale or corrupted cached bytes never replace the signed official catalog',async()=>{
 const official={tables:[{id:'T_OFFICIAL',label:'正式',fields:[]}]},other={tables:[{id:'T_OLD',label:'旧版',fields:[]}]},f=fixture({catalog:official});
 await f.host.catalog();
 const storage={get:async key=>structuredClone(f.disk.get(key)),set:async(key,value)=>f.disk.set(key,structuredClone(value))};
 f.disk.get('derived:matrix-catalog').signature=digest(other);
 const stale=fixture({catalog:official,storage});assert.deepEqual(await stale.host.catalog(),await f.host.catalog());assert.equal(stale.loads(),1);
 f.disk.get('derived:matrix-catalog').signature=digest(official);f.disk.get('derived:matrix-catalog').bytes=stable(other);
 const corrupted=fixture({catalog:official,storage});assert.deepEqual(await corrupted.host.catalog(),await f.host.catalog());assert.equal(corrupted.loads(),1);
});

test('catalog signature mismatch fails closed and cache storage failures fall back to the official catalog',async()=>{
 const official={tables:[{id:'T_OFFICIAL',label:'正式',fields:[]}]},wrong={tables:[{id:'T_WRONG',label:'错误',fields:[]}]};
 const mismatch=fixture({catalog:official,loadCatalog:()=>wrong});await assert.rejects(mismatch.host.catalog(),error=>error.code==='CATALOG_SIGNATURE_MISMATCH');
 const warnings=[],storage={get:async()=>{throw Error('read unavailable');},set:async()=>{throw Error('write unavailable');}};
 const fallback=fixture({catalog:official,storage,onError:error=>warnings.push(error.message)});const value=await fallback.host.catalog();assert(value.tables.some(table=>table.id==='T_OFFICIAL'));assert.equal(fallback.loads(),1);assert.equal(warnings.length,2);
});
