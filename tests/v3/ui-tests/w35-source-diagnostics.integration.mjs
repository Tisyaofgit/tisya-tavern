import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFlow} from './w34-flow-harness.mjs';
test('local historical parsing diagnostics remain visible without becoming a global blocker and open history review',async t=>{
 const f=await setupFlow(t),diagnostic={floor:2,messageId:'old-message',sourceKey:'original:old:1',fullHash:'fixture-hash',code:'HISTORY_CONTROL_BLOCK',status:'pending',message:'第 3 条旧聊天暂未归档：控制标签不完整。原文保留；可在历史补录中核对，本轮聊天继续。'};
 f.h.ctx.chatMetadata.tisya_v3_host={...f.h.ctx.chatMetadata.tisya_v3_host,sourceDiagnostics:[structuredClone(diagnostic)]};
 await f.view.refresh();const snapshot=await f.app.capabilities.getSnapshot();assert.equal(snapshot.issue,undefined);assert.deepEqual(snapshot.sourceDiagnostics,[diagnostic]);const box=f.shadow.querySelector('[data-source-diagnostics]');assert.ok(box);assert.equal(box.getAttribute('role'),'status');assert.match(box.textContent,/第 3 条消息/);assert.match(box.textContent,/HISTORY_CONTROL_BLOCK/);assert.match(box.textContent,/尚未归档/);assert.match(box.textContent,/继续聊天/);
 assert.equal(f.button('世界档案').disabled,false);await f.click('核对未归档历史');assert.ok(f.button('读取当前聊天历史'));assert.equal(f.actionErrors.length,0);
 await f.view.navigate('home');f.h.ctx.chatMetadata.tisya_v3_host.sourceDiagnostics=[];await f.view.refresh();assert.equal(f.shadow.querySelector('[data-source-diagnostics]'),null);
});
