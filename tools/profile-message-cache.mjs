// Synthetic cache-only diagnostic. fake-indexeddb is not browser/Android evidence.
// node tools/profile-message-cache.mjs [source-directory] [blocking-ms]
import {IDBFactory,IDBDatabase} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]??'.'),blockMs=Number(process.argv[3]??0);
if(!Number.isFinite(blockMs)||blockMs<0||blockMs>30000)throw Error('blocking-ms must be 0..30000');
const {createMessageCache,messageCacheOwner}=await import(pathToFileURL(resolve(root,'message-cache.js')));
const messages=Array.from({length:500},(_,id)=>({send_date:String(id),name:'Synthetic',mes:('长篇记录'+id+'。').repeat(1800)}));
const window={indexedDB:new IDBFactory(),crypto:webcrypto},errors=[],timings={};
const identity=m=>({scope:'synthetic',owner:messageCacheOwner(m),source:m.mes,variant:'plain'});
let cache=createMessageCache(window,{version:'synthetic-v1',onError:e=>errors.push(e.message)});
let at=performance.now();await cache.reconcile('synthetic',messages);
for(const message of messages)await cache.prepare(identity(message),()=>({text:message.mes}));
await cache.flush();timings.populateMs=Math.round(performance.now()-at);await cache.dispose();
cache=createMessageCache(window,{version:'synthetic-v1',onError:e=>errors.push(e.message)});await cache.ready;
const original=IDBDatabase.prototype.transaction;let blocked=false;
if(blockMs)IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(!blocked){blocked=true;queueMicrotask(()=>{const end=performance.now()+blockMs;while(performance.now()<end){}});}return tx;};
try{
 at=performance.now();const cleanup=cache.reconcile('synthetic',messages);let cleanupDone=false;cleanup.then(()=>{cleanupDone=true;});
 const packet=await cache.prepare(identity(messages.at(-1)),()=>({text:'fresh recompute'}));
 timings.lastMessageMs=Math.round(performance.now()-at);const cleanupFinishedBeforeRead=cleanupDone;
 await cleanup;timings.reconcileMs=Math.round(performance.now()-at);
 const warm=await cache.prepare(identity(messages[0]),()=>({text:'fresh recompute'}));await cache.flush();
 const report=cache.report();await cache.dispose();
 console.log(JSON.stringify({scope:'synthetic fake-indexeddb, no host UI, network, browser or Android',records:messages.length,sourceCharacters:messages.reduce((n,m)=>n+m.mes.length,0),blockingMs:blockMs,timeoutMs:2500,timings,cleanupFinishedBeforeRead,lastFromDisk:packet.fromDisk,firstFromDisk:warm.fromDisk,report,errors},null,2));
}finally{IDBDatabase.prototype.transaction=original;await cache.dispose();}
