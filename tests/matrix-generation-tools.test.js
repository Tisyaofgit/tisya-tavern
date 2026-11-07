import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGeneration,assertGeneration} from '../engine/generation.mjs';
import {createConfiguration} from '../engine/config.mjs';

test('tool recursion limit changes the native execution limit and restores its actual previous value',()=>{
 const ctx={chatCompletionSettings:{tool_call_recurse_limit:8},ToolManager:{RECURSE_LIMIT:10}};
 const undo=applyGeneration(ctx,{tool_call_recurse_limit:2});
 assert.equal(ctx.chatCompletionSettings.tool_call_recurse_limit,2);
 assert.equal(ctx.ToolManager.RECURSE_LIMIT,2);
 undo();assert.equal(ctx.chatCompletionSettings.tool_call_recurse_limit,8);assert.equal(ctx.ToolManager.RECURSE_LIMIT,10);
});
test('tool runtime drift is rejected even when its saved settings value remains equal',()=>{
 const ctx={chatCompletionSettings:{tool_call_recurse_limit:2},ToolManager:{RECURSE_LIMIT:10}};
 assert.throws(()=>assertGeneration(ctx,{tool_call_recurse_limit:2}),error=>error.code==='GENERATION_OVERRIDDEN'&&error.details.changes.some(c=>c.target==='ToolManager.RECURSE_LIMIT'));
});
test('failed tool runtime confirmation restores configuration, native setting and execution limit',async()=>{
 const ctx={extensionSettings:{},chatCompletionSettings:{tool_call_recurse_limit:8},ToolManager:{RECURSE_LIMIT:10}};
 let saves=0;
 const store=createConfiguration({getContext:()=>ctx,persist:async()=>{if(++saves===1)ctx.ToolManager.RECURSE_LIMIT=99;return true;}});
 const next=store.read();next.generation={tool_call_recurse_limit:2};
 await assert.rejects(store.save(next),error=>error.code==='GENERATION_OVERRIDDEN');
 assert.equal(store.read().revision,0);assert.equal(ctx.chatCompletionSettings.tool_call_recurse_limit,8);assert.equal(ctx.ToolManager.RECURSE_LIMIT,10);assert.equal(saves,2);
});
test('missing native tool execution capability rejects before changing any generation setting',()=>{
 const ctx={chatCompletionSettings:{temp_openai:.7}};
 assert.throws(()=>applyGeneration(ctx,{temperature:.2,tool_call_recurse_limit:2}),error=>error.code==='GENERATION_TOOL_RUNTIME');
 assert.deepEqual(ctx.chatCompletionSettings,{temp_openai:.7});
});
