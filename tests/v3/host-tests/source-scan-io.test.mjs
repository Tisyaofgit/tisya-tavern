import {createMessageWorkspace} from '../../../message-workspace.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceChain} from '../../../v3/host-sources.mjs';

function fixture(workspace){
 const context={chat:Array.from({length:108},(_,i)=>({is_user:i%2===1,mes:i?'第 '+i+' 楼原文':'开场'})),chatMetadata:{}};
 let active=context,syncs=0,resolves=0,reads=0;
 const system={identities:{sync:async()=>{syncs++;return {chatId:'c',branchId:'b',order:context.chat.map((_,i)=>'m'+i)};},resolve:async()=>{resolves++;throw Error('per-floor identity read');}},originals:{listMetadata:async()=>{reads++;return [];},entryIdFor:async id=>'original:'+id.messageId}};
 const chain=createSourceChain({getContext:()=>active,system,getNative:()=>null,configuration:()=>({}),guard:()=>{},persist:async()=>{},workspace});
 return {context,chain,system,switch:()=>active={chat:[],chatMetadata:{}},active:()=>active,counts:()=>({syncs,resolves,reads})};
}
test('long-chat change detection uses one identity snapshot and keeps exact changed floor',async()=>{
 const f=fixture();await f.chain.refresh();f.context.chat[56].mes='修改后的正文';const changed=await f.chain.detectChange();
 assert.equal(changed.fromFloor,56);assert.equal(changed.changed.length,1);assert.equal(changed.identity.messageId,'m56');
 assert.deepEqual(f.counts(),{syncs:2,resolves:0,reads:2});
});
test('read-only parallel scan rejects a switched chat without creating foreign metadata',async()=>{
 const f=fixture();f.system.originals.entryIdFor=async id=>{f.switch();return 'original:'+id.messageId;};
 await assert.rejects(f.chain.scan(),{code:'SOURCE_CHANGED'});assert.deepEqual(f.active().chatMetadata,{});
});

test('warm source workspace reuses unchanged text while changed text and live identities still update',async()=>{
 const workspace=createMessageWorkspace(),f=fixture(workspace);const first=await f.chain.scan();const cold=workspace.report().misses;
 assert(cold>50);assert.deepEqual(await f.chain.scan(),first);assert.equal(workspace.report().misses,cold);
 f.context.chat[56].mes='第56楼发生新的变化。';const edited=await f.chain.scan();assert.equal(workspace.report().misses,cold+1);assert.notEqual(edited.find(x=>x.floor===56).fullHash,first.find(x=>x.floor===56).fullHash);
 f.system.identities.sync=async()=>({chatId:'other-user-chat',branchId:'other-branch',order:f.context.chat.map((_,i)=>'new'+i)});
 const switched=await f.chain.scan();assert.equal(workspace.report().misses,cold+1);assert(switched.every(row=>row.identity.chatId==='other-user-chat'));assert(switched.every(row=>row.identity.messageId.startsWith('new')));assert.notEqual(switched[0].key,edited[0].key);
 f.context.chat.splice(10,1);assert.equal((await f.chain.scan()).length,first.length-1);
});
