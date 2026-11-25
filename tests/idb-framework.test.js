import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openDatabase,openExistingDatabase,transact,relocateLegacyDatabase} from '../engine/idb-framework.mjs';

const schema=db=>{if(!db.objectStoreNames.contains('rows'))db.createObjectStore('rows',{keyPath:'id'});};
const put=(db,store,record)=>transact(db,store,'readwrite',s=>{s.put(record);});
const get=(db,store,id)=>transact(db,store,'readonly',(s,set)=>{const r=s.get(id);r.onsuccess=()=>set(r.result);});
const names=async indexedDB=>(await indexedDB.databases()).map(d=>d.name).sort();

test('openDatabase creates schema stores and normalizes blocked and versionchange',async()=>{
 const indexedDB=new IDBFactory();
 const db=await openDatabase({indexedDB,name:'fw',version:1,schema,label:'测试库'});
 assert.ok(db.objectStoreNames.contains('rows'));
 await put(db,'rows',{id:'a',v:1});assert.equal((await get(db,'rows','a')).v,1);
 // 裸连接模拟不设 versionchange 收起的旧窗口：升级握手必须失败关闭。
 const holder=await new Promise((resolve,reject)=>{const r=indexedDB.open('fw');r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
 await assert.rejects(openDatabase({indexedDB,name:'fw',version:2,schema:d=>d.deleteObjectStore('rows'),label:'测试库'}),/旧页面/);
 holder.close();db.close();
 const upgraded=await openDatabase({indexedDB,name:'fw',version:2,schema:d=>{if(d.objectStoreNames.contains('rows'))d.deleteObjectStore('rows');},label:'测试库'});
 assert.ok(!upgraded.objectStoreNames.contains('rows'));upgraded.close();
});

test('openDatabase watch timeout rejects and a late success only closes the handle',async()=>{
 let timedOut=null;const watchFor=(phase,onTimeout)=>{queueMicrotask(onTimeout);return {progress(){},stop(){}};};
 await assert.rejects(openDatabase({indexedDB:{open(){const r={};queueMicrotask(()=>r.onsuccess?.());return r;}},name:'never',version:1,label:'看门狗',watchFor,messages:{timeout:()=>{timedOut=true;return Error('打开超时已降级');}}}),/打开超时已降级/);
 assert.equal(timedOut,true);
});

test('openExistingDatabase never creates a database and requires declared stores',async()=>{
 const indexedDB=new IDBFactory();
 assert.equal(await openExistingDatabase({indexedDB,name:'absent'}),null);
 assert.deepEqual(await names(indexedDB),[]);
 const db=await openDatabase({indexedDB,name:'present',version:1,schema});db.close();
 assert.equal(await openExistingDatabase({indexedDB,name:'present',requireStores:['missing']}),null);
 const again=await openExistingDatabase({indexedDB,name:'present',requireStores:['rows']});assert.ok(again);again.close();
});

test('transact reports errors, aborts and watchdog timeouts with the domain label',async()=>{
 const indexedDB=new IDBFactory(),db=await openDatabase({indexedDB,name:'tx',version:1,schema});
 await assert.rejects(transact(db,'rows','readwrite',s=>{s.put({id:'x'});throw Error('工作失败');}),/工作失败/);
 await put(db,'rows',{id:'dup',v:1});
 await assert.rejects(transact(db,'rows','readwrite',s=>{s.add({id:'dup',v:2});},{onError:()=>Error('包装失败')}),/包装失败/);
 db.close();
 const stalled={transaction(){const tx={objectStore:()=>({get:()=>({})}),abort(){tx.onabort?.();}};return tx;}};
 let rejected=null;const watchFor=(phase,onTimeout)=>{queueMicrotask(onTimeout);return {progress(){},stop(){}};};
 await transact(stalled,'rows','readonly',()=>{},{label:'显示缓存事务',phase:'读取',watchFor}).catch(e=>{rejected=e;});
 assert.match(rejected?.message,/显示缓存事务超时（读取）/);
});

test('transact passes progress to the watchdog and resolves the work value',async()=>{
 const indexedDB=new IDBFactory(),db=await openDatabase({indexedDB,name:'txp',version:1,schema});
 let progressed=0;const watchFor=()=>({progress(){progressed++;},stop(){}});
 const value=await transact(db,'rows','readonly',(s,set,progress)=>{const r=s.count();r.onsuccess=()=>{progress();set(r.result);};},{watchFor,phase:'读取'});
 assert.equal(value,0);assert.equal(progressed,1);db.close();
});

test('relocateLegacyDatabase copies, verifies and removes the legacy database',async()=>{
 const indexedDB=new IDBFactory();
 assert.deepEqual(await relocateLegacyDatabase({indexedDB,from:'legacy-none',stores:[{from:'a',to:'b'}],target:{name:'target-db',version:1,schema}}),{from:'legacy-none',relocated:false,moved:0,deleted:false});
 assert.deepEqual(await names(indexedDB),[],'旧库缺席时不得创建目标库');
 const legacy=await openDatabase({indexedDB,name:'legacy-full',version:1,schema:db=>{if(!db.objectStoreNames.contains('a'))db.createObjectStore('a',{keyPath:'id'});}});
 await put(legacy,'a',{id:'1',blob:new Blob(['原件'],{type:'image/png'})});await put(legacy,'a',{id:'2',v:2});legacy.close();
 const result=await relocateLegacyDatabase({indexedDB,from:'legacy-full',stores:[{from:'a',to:'rows'}],target:{name:'target-db',version:1,schema}});
 assert.deepEqual(result,{from:'legacy-full',relocated:true,moved:2,deleted:true});
 assert.deepEqual(await names(indexedDB),['target-db']);
 const db=await openExistingDatabase({indexedDB,name:'target-db'});
 assert.equal(await (await get(db,'rows','1')).blob.text(),'原件');assert.equal((await get(db,'rows','2')).v,2);db.close();
 const rerun=await relocateLegacyDatabase({indexedDB,from:'legacy-full',stores:[{from:'a',to:'rows'}],target:{name:'target-db',version:1,schema}});
 assert.equal(rerun.relocated,false);
});

test('relocation survives a blocked legacy deletion and keeps verified data',async()=>{
 const indexedDB=new IDBFactory();
 const legacy=await openDatabase({indexedDB,name:'legacy-held',version:1,schema:db=>{if(!db.objectStoreNames.contains('a'))db.createObjectStore('a',{keyPath:'id'});}});
 await put(legacy,'a',{id:'x',v:9});legacy.close();
 // 裸连接占位阻塞删除：搬迁仍须完成复制与核对，仅删除留待下次。
 const holder=await new Promise((resolve,reject)=>{const r=indexedDB.open('legacy-held');r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
 const result=await relocateLegacyDatabase({indexedDB,from:'legacy-held',stores:[{from:'a',to:'rows'}],target:{name:'target-held',version:1,schema}});
 assert.equal(result.relocated,true);assert.equal(result.moved,1);assert.equal(result.deleted,false);
 const db=await openExistingDatabase({indexedDB,name:'target-held'});assert.equal((await get(db,'rows','x')).v,9);db.close();
 holder.close();
 // 首次被阻塞的删除请求或随后重试，二者之一完成清理；不变量是旧库最终消失且数据仍在。
 await relocateLegacyDatabase({indexedDB,from:'legacy-held',stores:[{from:'a',to:'rows'}],target:{name:'target-held',version:1,schema}});
 assert.deepEqual(await names(indexedDB),['target-held']);
 const again=await openExistingDatabase({indexedDB,name:'target-held'});assert.equal((await get(again,'rows','x')).v,9);again.close();
});
