import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createFloorIdentityManager} from '../../../v3/runtime-source/host/floor-identities.mjs';
import {sameJsonValue} from '../../../v3/runtime-source/host/json-value.mjs';
import {createInstallerHarness, wrap, newBody} from './installer-harness.mjs';

// Tauri metadata.get returns a native JSON value, not the live JavaScript object.
// serde_json's default object map sorts string keys; arrays keep their order.
const nativeJson = value => Array.isArray(value) ? value.map(nativeJson)
 : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, nativeJson(value[key])])) : value;

function identityFixture({read = nativeJson} = {}) {
 const ctx = {chat: [{mes: '开场', is_user: false}, {mes: '继续', is_user: true}], chatMetadata: {unrelated: {enabled: false, count: 0}}};
 let disk = {}, sequence = 0, saves = 0;
 const manager = createFloorIdentityManager({getContext: () => ctx, getStableChatId: async () => 'branch-one',
  saveChat: async () => {disk = structuredClone(ctx.chatMetadata); saves++;}, readMetadata: async () => read(structuredClone(disk)), uuid: () => String(++sequence)});
 return {ctx, manager, disk: () => structuredClone(disk), saves: () => saves};
}

test('floor identity save accepts native JSON object key reordering without rewriting chat or unrelated metadata', async () => {
 const f = identityFixture(), before = f.ctx.chat.map(message => message.mes);
 const state = await f.manager.sync();
 assert.equal(state.order.length, 2);
 assert.deepEqual(f.ctx.chat.map(message => message.mes), before);
 assert.deepEqual(f.disk().unrelated, {enabled: false, count: 0});
 assert.equal(f.saves(), 1);
 await f.manager.sync();
 assert.equal(f.saves(), 1);
 // Reopening from the native JSON representation also must not manufacture a
 // metadata change solely because capture reconstructs each row's key order.
 f.ctx.chatMetadata = nativeJson(f.disk());
 await f.manager.sync();
 assert.equal(f.saves(), 1);
});

for (const [name, corrupt] of [
 ['missing field', state => {delete state.branchId;}],
 ['changed field type', state => {state.rows[state.order[0]].floor = '0';}],
 ['changed array order', state => {state.order.reverse();}],
 ['unknown field', state => {state.unexpected = true;}],
]) test('floor identity readback still rejects '+name, async () => {
 const f = identityFixture({read: value => {const read = nativeJson(value); corrupt(read.tisya_w24); return read;}});
 await assert.rejects(f.manager.sync(), {code: 'IDENTITY_READBACK'});
 assert.deepEqual(f.ctx.chatMetadata, {unrelated: {enabled: false, count: 0}});
 assert.equal(f.saves(), 1);
});

async function withNativeReadback(t, change = value => value) {
 const f = await createInstallerHarness({mvu: false});
 t.after(() => f.api.dispose());
 // A prior successful binding already owns the floor identities. A fresh host
 // source ledger is saved while opening, matching the reported error stage.
 await f.api.getSession();
 delete f.ctx.chatMetadata.tisya_v3_host;
 const previous = f.target.__TAURITAVERN__.api.chat.current.handle;
 f.target.__TAURITAVERN__.api.chat.current.handle = () => {
  const handle = previous();
  return {...handle, metadata: {...handle.metadata, get: async () => change(nativeJson(await handle.metadata.get()))}};
 };
 f.api.configurationChanged();
 return f;
}

test('opening the workbench accepts native metadata key order and does not call a model or archive old messages', async t => {
 const f = await withNativeReadback(t), texts = f.ctx.chat.map(message => message.mes);
 const session = await f.api.getSession();
 assert.deepEqual(await session.system.originals.listMetadata({scope: session.scope}), []);
 assert.deepEqual(f.ctx.chat.map(message => message.mes), texts);
 assert.equal(f.requests.length, 0);
});

test('opening the workbench still reports genuinely changed identity metadata', async t => {
 const f = await withNativeReadback(t, value => {value.tisya_w24.chatId = 'other-chat'; return value;});
 await assert.rejects(f.api.getSession(), {code: 'V3_METADATA_READBACK', message: '聊天元数据回读不一致：tisya_w24'});
 assert.equal(f.requests.length, 0);
});

test('metadata comparison accepts cross-realm JSON while retaining zero, false, null and array order', () => {
 const foreign = vm.runInNewContext('({z:[0,false,null,{b:2,a:1}],a:""})');
 assert.equal(sameJsonValue(foreign, {a: '', z: [0, false, null, {a: 1, b: 2}]}), true);
 for (const invalid of [{a: '', z: [false, 0, null, {a: 1, b: 2}]}, {a: '', z: [0, false, null]}, {a: '', z: [0, false, null, {a: 1, b: '2'}]}]) {
  assert.equal(sameJsonValue(foreign, invalid), false);
 }
});

test('metadata comparison does not invoke accessors or toJSON and does not drop unsupported fields', () => {
 let executions = 0;
 const accessor = Object.defineProperty({}, 'id', {enumerable: true, get() {executions++; return 'x';}});
 const serializable = {toJSON() {executions++; return {id: 'x'};}};
 assert.equal(sameJsonValue(accessor, {id: 'x'}), false);
 assert.equal(sameJsonValue(serializable, {id: 'x'}), false);
 assert.equal(sameJsonValue({id: 'x', missing: undefined}, {id: 'x'}), false);
 assert.equal(sameJsonValue({id: 'x', [Symbol('hidden')]: true}, {id: 'x'}), false);
 assert.equal(sameJsonValue([, 'x'], [null, 'x']), false);
 assert.equal(sameJsonValue({value: NaN}, {value: null}), false);
 assert.equal(executions, 0);
});

test('a fresh installed host opens with native JSON ordering from its first identity save', async t => {
 const f = await createInstallerHarness({mvu: false});
 t.after(() => f.api.dispose());
 const previous = f.target.__TAURITAVERN__.api.chat.current.handle;
 f.target.__TAURITAVERN__.api.chat.current.handle = () => {
  const handle = previous();
  return {...handle, metadata: {...handle.metadata, get: async () => nativeJson(await handle.metadata.get())}};
 };
 const session = await f.api.getSession();
 assert.equal(session.scope.branchId, 'branch-one');
 assert.deepEqual(await session.system.originals.listMetadata({scope: session.scope}), []);
 assert.equal(f.requests.length, 0);
});

test('normal Send completes A and B, native saveReply and chat persistence when every native metadata read reorders JSON keys', async t => {
 const f = await createInstallerHarness();
 t.after(() => f.api.dispose());
 const previousHandle = f.target.__TAURITAVERN__.api.chat.current.handle;
 let reads = 0, chatSaves = 0, replies = 0;
 f.target.__TAURITAVERN__.api.chat.current.handle = () => {
  const handle = previousHandle();
  return {...handle, metadata: {...handle.metadata, get: async () => {reads++; return nativeJson(await handle.metadata.get());}}};
 };
 const saveChat = f.ctx.saveChat, saveReply = f.script.saveReply;
 f.ctx.saveChat = async (...args) => {chatSaves++; return saveChat(...args);};
 f.script.saveReply = async (...args) => {replies++; return saveReply(...args);};
 const originalText = f.ctx.chat.map(message => message.mes);
 assert.equal(await f.intercept('normal'), true, 'actual manifest interceptor retains sole ownership of generation');
 assert.equal(f.errors.length, 0, f.errors[0]?.stack);
 assert.equal(f.requests.length, 2, 'one deterministic A and one deterministic B request');
 assert.equal(replies, 1, 'real extracted native saveReply runs once');
 assert.equal(f.ctx.chat.length, originalText.length + 1);
 assert.deepEqual(f.ctx.chat.slice(0, -1).map(message => message.mes), originalText);
 assert.equal(f.ctx.chat.at(-1).mes, wrap(newBody));
 assert.ok(chatSaves > 0);
 assert.ok(reads > 1, 'sorted native readback applies across initialization and send');
 const saved = await f.target.__TAURITAVERN__.api.chat.current.handle().metadata.get();
 assert.equal(sameJsonValue(saved.tisya_w24, f.ctx.chatMetadata.tisya_w24), true);
 assert.equal(sameJsonValue(saved.tisya_v3_host, f.ctx.chatMetadata.tisya_v3_host), true);
 const session = await f.api.getSession(), state = await session.storage.read();
 assert.equal(Object.values(state.requests).length, 1);
 assert.equal(Object.values(state.requests)[0].status, 'delivered');
 assert.ok((await session.system.originals.listMetadata({scope: session.scope})).length >= 2);
 assert.equal(f.nativeMvu.runtime.getMvuData({type: 'message', message_id: 2}).stat_data.resources.energy, 3);
});

test('normal Send still stops before A, B and saveReply when persisted identity values genuinely differ', async t => {
 const f = await createInstallerHarness();
 t.after(() => f.api.dispose());
 const previousHandle = f.target.__TAURITAVERN__.api.chat.current.handle;
 let corrupt = false, replies = 0;
 f.target.__TAURITAVERN__.api.chat.current.handle = () => {
  const handle = previousHandle();
  return {...handle, metadata: {...handle.metadata, get: async () => {
   const read = nativeJson(await handle.metadata.get());
   if (corrupt && read.tisya_w24) read.tisya_w24.chatId = 'unexpected-native-chat';
   return read;
  }}};
 };
 const saveReply = f.script.saveReply;
 f.script.saveReply = async (...args) => {replies++; return saveReply(...args);};
 await f.api.getSession();
 const originalText = f.ctx.chat.map(message => message.mes);
 corrupt = true;
 assert.equal(await f.intercept('normal'), true);
 assert.equal(f.errors.length, 1);
 assert.equal(f.errors[0].code, 'V3_METADATA_READBACK');
 assert.equal(f.errors[0].message, '聊天元数据回读不一致：tisya_w24');
 assert.equal(f.requests.length, 0);
 assert.equal(replies, 0);
 assert.deepEqual(f.ctx.chat.map(message => message.mes), originalText);
 assert.equal(f.ctx.chatMetadata.tisya_w24.chatId, 'branch-one');
});
