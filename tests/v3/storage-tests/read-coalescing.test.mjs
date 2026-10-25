import test from 'node:test';
import assert from 'node:assert/strict';
import {createTauriWorldbookTransport} from '../../../v3/runtime-source/host/worldbook-adapter.mjs';

test('overlapping reads share IO but not mutable documents; reads after a write are fresh',async()=>{
 let count=0,release;let disk={entries:{0:{uid:0,content:'before'}}};
 const gate=new Promise(r=>release=r);
 const transport=createTauriWorldbookTransport({worldInfo:{createWorldInfoEntry(){},discardWorldInfoDocument(){},async saveWorldInfo(_name,data){disk=structuredClone(data);}},fetch:async()=>{count++;const value=structuredClone(disk);if(count===1)await gate;return new Response(JSON.stringify(value));}});
 const first=transport.readFresh('book'),second=transport.readFresh('book');
 assert.equal(count,1);
 await transport.save('book',{entries:{0:{uid:0,content:'after'}}});
 const after=await transport.readFresh('book');assert.equal(count,2);assert.equal(after.entries[0].content,'after');
 release();const [a,b]=await Promise.all([first,second]);a.entries[0].content='local edit';assert.equal(b.entries[0].content,'before');
 assert.equal((await transport.readFresh('book')).entries[0].content,'after');assert.equal(count,3);
});
