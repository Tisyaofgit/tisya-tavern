import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseSnapshotAtMessage} from '../engine/database-snapshot.mjs';
import {inversePatch} from '../engine/journal.mjs';
import {digest} from '../engine/common.mjs';
function bundle(){
 const before={schema:{},tables:{money:{account:{values:{balance:0}}}},runtime:{}},at=structuredClone(before);at.tables.money.account.values.balance=10;const later=structuredClone(at);later.tables.money.account.values.balance=30;
 return {state:later,journal:{entries:[{uid:'reply-a',role:'assistant',signature:digest({uid:'reply-a',role:'assistant',text:'first'}),revision:1,settlement_status:'COMMITTED',pre_turn_snapshot:{inverse_patch:inversePatch(before,at)}},{uid:'later',role:'manual',signature:'later',revision:1,pre_turn_snapshot:{inverse_patch:inversePatch(at,later)}}]}};
}
test('old message uses accepted historical fields, including zero values, without writing current state',()=>{
 const b=bundle(),raw=structuredClone(b),s=databaseSnapshotAtMessage(b,{uid:'reply-a',raw:'first',sourceId:'reply-a:candidate'},'chat-a');assert.equal(s.state.tables.money.account.values.balance,10);assert.equal(b.state.tables.money.account.values.balance,30);assert.deepEqual(b,raw);assert.match(s.snapshotId,/^matrix:reply-a:1:/);
});
test('edited or imported baseline messages have no invented historical fallback',()=>{
 const b=bundle();assert.throws(()=>databaseSnapshotAtMessage(b,{uid:'reply-a',raw:'changed'},'chat-a'),/原文/);b.journal.entries[0].baseline=true;assert.throws(()=>databaseSnapshotAtMessage(b,{uid:'reply-a',raw:'first'},'chat-a'),/原文/);
});
test('malformed later history and source mismatch preserve evidence and fail closed',()=>{
 const b=bundle();assert.throws(()=>databaseSnapshotAtMessage(b,{uid:'reply-a',raw:'first',sourceId:'other:x'},'chat-a'),/身份/);delete b.journal.entries[1].pre_turn_snapshot;assert.throws(()=>databaseSnapshotAtMessage(b,{uid:'reply-a',raw:'first'},'chat-a'),/恢复链/);
});
