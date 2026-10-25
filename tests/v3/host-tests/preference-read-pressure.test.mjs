import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreferenceOverlayStorage,createInitialPreferenceBank} from '../../../v3/runtime-source/preferences/shared-store.mjs';
import {createInitialState,tableRegistry} from '../../../v3/host-runtime.mjs';

test('independent preference reads overlap, but a failed read keeps the queue until the other read settles',async()=>{
 let release,reads=0,bankReads=0;
 const pending=new Promise(resolve=>release=resolve),failure=Error('B read failed');
 const session=createInitialState({registry:tableRegistry,rows:[]}),bank=createInitialPreferenceBank({registry:tableRegistry});
 const storage=createPreferenceOverlayStorage({
  sessionStorage:{read:async()=>{if(++reads===1)throw failure;return structuredClone(session);}},
  preferenceStorage:{read:async()=>{if(++bankReads===1)await pending;return structuredClone(bank);}}
 });
 const first=storage.read(),failed=assert.rejects(first,error=>error===failure),second=storage.read();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(bankReads,1,'P starts independently even when B fails');
 assert.equal(reads,1,'the next operation waits for both reads');
 release();await failed;const value=await second;
 assert.equal(reads,2);assert.equal(bankReads,2);assert.deepEqual(value.preferenceRows,[]);assert.equal(value.preferenceBankReference.revision,0);
});
