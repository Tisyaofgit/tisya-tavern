import test from 'node:test';
import assert from 'node:assert/strict';
import {decode} from '../engine/common.mjs';
import {Runtime} from '../engine/runtime.mjs';
test('the shared value codec distinguishes explicit empty text, omitted numeric, zero, false and registered boolean enums',()=>{
 assert.deepEqual(decode('',{type:'TEXT'}),['','known']);assert.deepEqual(decode('',{type:'LONG_TEXT'}),['','known']);assert.deepEqual(decode('',{type:'NUMBER'}),[null,'unset']);assert.deepEqual(decode(0,{type:'NUMBER'}),[0,'known']);
 assert.deepEqual(decode(false,{type:'BOOLEAN'}),[false,'known']);assert.deepEqual(decode(false,{type:'ENUM',enum:[true,false]}),[false,'known']);assert.throws(()=>decode('false',{type:'ENUM',enum:[true,false]}));
 const runtime=new Runtime();runtime.registerTable('test',[{key:'prose',type:'LONG_TEXT'},{key:'observed',type:'ENUM',enum:[true,false]}]);runtime.newRecord('test',{},'row');runtime.set(['test','row','prose',[]],'');runtime.set(['test','row','observed',[]],false);assert.equal(runtime.record('test','row').values.prose,'');assert.equal(runtime.record('test','row').states.prose,'known');assert.equal(runtime.record('test','row').values.observed,false);
});
