import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness} from './installer-harness.mjs';
test('lazy initialization and failed generation notify the UI when the host becomes idle',async()=>{
 const states=[],f=await createInstallerHarness({invalid:true,onBusyChanged:busy=>states.push(busy)});
 try{await f.api.getSession();assert.deepEqual(states,[true,false]);states.length=0;await f.intercept('normal');assert.equal(states[0],true);assert.equal(states.at(-1),false);assert.equal(f.api.busy(),false);}finally{f.api.dispose();}
});
