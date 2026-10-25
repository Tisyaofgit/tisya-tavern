import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness} from './installer-harness.mjs';

test('branch population uses one child-owned workspace and one child-book flush',async t=>{
 const entries=[];let inPopulation=false,populationWrites=0;
 const f=await createInstallerHarness({mvu:false,workspace:true,onWorkspaceRun:entry=>{entries.push(entry);inPopulation=true;},onWorkspaceFlush:()=>{if(inPopulation)populationWrites++;}});t.after(()=>f.api.dispose());
 const parent=await f.api.getSession(),parentName=parent.binding.archive.physicalName,before=structuredClone(f.host.disk.get(parentName)),texts=f.ctx.chat.map(m=>m.mes);
 const result=await f.api.branch({floor:f.ctx.chat.length-1});
 assert.equal(entries.length,1);assert.deepEqual(entries[0].owner,{chatId:'branch-one',branchId:'branch-two'});assert.equal(entries[0].status.active,false);assert.equal(populationWrites,1);
 assert.equal(result.owner.branchId,'branch-two');assert.deepEqual(f.host.disk.get(parentName),before);assert.deepEqual(f.ctx.chat.map(m=>m.mes),texts);
 const child=await f.api.getSession();assert.notEqual(child.binding.archive.physicalName,parentName);assert.equal((await child.system.originals.listMetadata({scope:child.scope})).length,1);assert.equal((await child.storage.read()).revision,1);assert.deepEqual(f.workspaceLayer.status().pendingBooks,[]);assert.equal(f.api.busy(),false);
});

test('failed child workspace flush rejects branch success, preserves parent, and retains recoverable child journal',async t=>{
 let inPopulation=false;const entries=[];
 const f=await createInstallerHarness({mvu:false,workspace:true,onWorkspaceRun:entry=>{entries.push(entry);inPopulation=true;},onWorkspaceFlush:()=>{if(inPopulation)throw Error('child flush failed');}});t.after(()=>f.api.dispose());
 const parent=await f.api.getSession(),name=parent.binding.archive.physicalName,before=structuredClone(f.host.disk.get(name));
 await assert.rejects(f.api.branch({floor:f.ctx.chat.length-1}),/child flush failed/);
 assert.equal(entries.length,1);assert.equal(entries[0].owner.branchId,'branch-two');assert.deepEqual(f.host.disk.get(name),before);assert.equal(f.owner().branchId,'branch-two');assert.equal(f.api.busy(),false);
 const status=f.workspaceLayer.status();assert.equal(status.blocked,true);assert.equal(status.active,false);assert.equal(status.pendingBooks.length,1);assert.equal(JSON.parse(status.owner).branchId,'branch-two');
});
