import test from 'node:test';
import assert from 'node:assert/strict';
import {selectChatReady,notifySelectedChatContent} from '../chat-selection.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){const listeners=new Set(),late=[],c={characterId:0,chatId:'old',eventTypes:{CHAT_CHANGED:'chat'},eventSource:{on:(e,f)=>listeners.add(f),removeListener:(e,f)=>listeners.delete(f)}};return {c,listeners,late,change(id,file){c.characterId=id;c.chatId=file;for(const f of [...listeners])f();},open:()=>selectChatReady({getContext:()=>c,id:1,file:'target',onLateError:e=>late.push(e.message)})};}
test('rendered matching chat releases navigation without awaiting host housekeeping; late rejection stays visible',async()=>{const f=fixture(),host=deferred();f.c.selectCharacterById=()=>host.promise;const p=f.open();await Promise.resolve();f.change(1,'target');await p;assert.equal(f.listeners.size,0);host.reject(Error('metadata failed'));await new Promise(r=>setImmediate(r));assert.match(f.late[0],/metadata failed/);});
test('context assignment alone is not a handoff; wrong chat never releases navigation',async()=>{const f=fixture(),host=deferred();let done=false;f.c.selectCharacterById=()=>host.promise;const p=f.open().then(()=>{done=true;});await Promise.resolve();f.c.characterId=1;f.c.chatId='target';await Promise.resolve();assert.equal(done,false);f.change(2,'other');await Promise.resolve();assert.equal(done,false);f.change(1,'target');await p;host.resolve();});
test('host refusal and early error release subscriptions and never claim selected chat',async()=>{for(const fn of [async()=>{},async()=>{throw Error('load failed');}]){const f=fixture();f.c.selectCharacterById=fn;await assert.rejects(f.open());assert.equal(f.listeners.size,0);assert.deepEqual(f.late,[]);}});

test('returning to the already selected chat never starts another native reload',async()=>{const f=fixture();f.change(1,'target');f.c.selectCharacterById=()=>assert.fail('must not reload the active chat');await f.open();assert.equal(f.listeners.size,0);});


test('managed handoff rejects aborted, detached, wrong-tail and foreign-chat commits',async()=>{
 const f=fixture(),host=deferred();f.c.chat=[{mes:'one'},{mes:'two'}];f.c.selectCharacterById=()=>host.promise;let done=false;
 const p=f.open().then(()=>done=true);await Promise.resolve();
 const element={isConnected:true,contains:n=>n===content,closest:()=>true},content={isConnected:true};
 const commit=extra=>notifySelectedChatContent({element,content,mesid:1,signal:{aborted:false},...extra});
 commit();await Promise.resolve();assert.equal(done,false);f.c.characterId=1;f.c.chatId='target';
 for(const bad of [{mesid:0},{signal:{aborted:true}},{content:{isConnected:false}},{element:{...element,isConnected:false}}]){commit(bad);await Promise.resolve();assert.equal(done,false);}
 commit();await p;host.resolve();
});


test('actual loaded payload finishes selection without any event, while early identity and empty loading metadata do not',async()=>{
 const f=fixture(),host=deferred(),frames=new Map();let seq=0,done=false;
 f.c.chatMetadata={integrity:'old'};f.c.chat=[{mes:'old'}];f.c.selectCharacterById=()=>host.promise;
 const p=selectChatReady({getContext:()=>f.c,id:1,file:'target',schedule:fn=>{frames.set(++seq,fn);return seq;},cancel:id=>frames.delete(id)}).then(()=>done=true);
 const frame=async()=>{const pair=[...frames][0];frames.delete(pair[0]);pair[1]();await new Promise(r=>setImmediate(r));};
 await Promise.resolve();f.c.characterId=1;f.c.chatId='target';f.c.chatMetadata={};await frame();assert.equal(done,false);
 f.c.chatMetadata={integrity:'loaded'};await frame();assert.equal(done,false,'old message array cannot certify new data');
 f.c.chat=[{mes:'target payload'}];await frame();await p;assert.equal(done,true);assert.equal(frames.size,0);assert.equal(f.listeners.size,0);host.resolve();
});
