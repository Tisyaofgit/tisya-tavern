import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotProjection} from '../engine/projection-cache.mjs';

test('workspace projection reuses identical snapshots and isolates returned mutations',()=>{
 let calls=0;const project=snapshotProjection(input=>{calls++;return {rows:structuredClone(input.rows)};});
 const input={revision:4,rows:[{id:'a',value:2}]};const first=project(input);first.rows[0].value=99;
 assert.equal(project(structuredClone(input)).rows[0].value,2);assert.equal(calls,1);
 input.rows[0].value=3;assert.equal(project(input).rows[0].value,3);assert.equal(calls,2,'same revision with changed bytes is not stale');
 project.clear();project(input);assert.equal(calls,3);
});

test('scope, native swipe evidence and failures cannot reuse an unrelated projection',()=>{
 let calls=0;const project=snapshotProjection((bundle,scope,native)=>{calls++;if(native.fail)throw Error('raw failure');return {value:native.swipes[0],scope};});
 const native={swipes:['old']};project({},'a',native);project({},'b',native);native.swipes[0]='new';assert.equal(project({},'b',native).value,'new');
 assert.throws(()=>project({},'b',{fail:true}),/raw failure/);assert.throws(()=>project({},'b',{fail:true}),/raw failure/);assert.equal(calls,5);
});
