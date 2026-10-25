import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness} from './installer-harness.mjs';

test('native send owns only its pre-compilation source refresh even while host generation is marked active',async t=>{
 let f,refreshes=0;
 f=await createInstallerHarness({mvu:false,onRefreshWorkspaceSources:async()=>{refreshes++;f.api.assertSourceRefreshIdle();assert.throws(()=>f.api.assertIdle(),{code:'V3_NATIVE_BUSY'});f.api.configurationChanged();return true;}});t.after(()=>f.api.dispose());
 await f.api.getSession();f.script.isGenerating=()=>true;
 await f.intercept('normal');assert.equal(refreshes,1);assert.equal(f.requests.length,2);assert.deepEqual(f.errors,[]);
 assert.throws(()=>f.api.assertSourceRefreshIdle(),{code:'V3_NATIVE_BUSY'});
});

test('native preparation refresh still refuses a changed chat before publishing new configuration',async t=>{
 let f;
 f=await createInstallerHarness({mvu:false,onRefreshWorkspaceSources:async()=>{f.ctx.chat=[...f.ctx.chat];f.api.assertSourceRefreshIdle();return true;}});t.after(()=>f.api.dispose());
 await f.api.getSession();f.script.isGenerating=()=>true;await f.intercept('normal');
 assert.equal(f.requests.length,0);assert(f.errors.some(e=>e.code==='V3_BUSY'));assert.equal(f.api.busy(),false);
 assert.throws(()=>f.api.assertSourceRefreshIdle(),{code:'V3_NATIVE_BUSY'});
});

test('manual forms do not borrow the native send preparation permission',async t=>{
 let refreshes=0;const f=await createInstallerHarness({mvu:false,onRefreshWorkspaceSources:async()=>{refreshes++;return true;}});t.after(()=>f.api.dispose());
 f.script.isGenerating=()=>true;assert.throws(()=>f.api.advance(),{code:'V3_NATIVE_BUSY'});assert.equal(refreshes,0);assert.equal(f.requests.length,0);
});
