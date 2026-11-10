import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneState, queuePhoneAction, preparePhoneTurn, acceptPhoneTurn, phoneSnapshot, reconcilePhone, searchPhone, createPhoneService, exportPhone, importPhone } from '../phone-core.mjs';
import { getDoc } from '../social-suite-core.mjs';
import { communicationAccounts, communicationDocuments } from '../social-communication.mjs';
import { publicAccounts, publicDocuments } from '../social-public.mjs';
import { mediaAccounts, mediaDocuments } from '../social-media.mjs';

const seed = { accounts: { ...communicationAccounts, ...publicAccounts, ...mediaAccounts }, documents: [...communicationDocuments, ...publicDocuments, ...mediaDocuments] };
const CHAT = 'chat-a';
const AT = '2026-11-09T19:45:00+08:00';
const doc = (state, thread = 'forum-encore') => getDoc(state.suite, thread, 'me');
const floor = (state, n) => doc(state).items.find(row => row.floor === n);
const fresh = () => createPhoneState(seed, CHAT);
const action = (state, actionId, body) => queuePhoneAction(state, body, { actionId, at: AT });
const send = (state, actionId, text = '测试消息', threadId = 'forum-encore') => action(state, actionId, { kind: 'message', threadId, text });
const prepare = (state, requestId = 'r1') => preparePhoneTurn(state, { requestId, anchorUid: `anchor-${requestId}`, at: AT });
const raw = value => `正文 [[手机:m1]]<extra><summary>剧情照常保留</summary><phone>${JSON.stringify(value)}</phone></extra>`;
const reply = (requestId = 'r1', acks = ['a1'], text = '角色回复') => ({ requestId, acks, blocks: [{ type: 'forum', thread: 'forum-encore', items: [{ by: 'forum_night', text }] }], markers: [{ id: 'm1', thread: 'forum-encore', floor: 10 }] });
const accept = (state, value, sourceId = 's1', extra = {}) => acceptPhoneTurn(state, { sourceId, uid: `uid-${sourceId}`, candidate: 'candidate-1', raw: typeof value === 'string' ? value : raw(value), at: AT, ...extra });
const expectCode = (fn, code) => assert.throws(fn, error => error.code === code);

function memoryStorage() {
  let saved = null;
  let failSave = false;
  return {
    async load() { return saved === null ? null : structuredClone(saved); },
    async save(next, { expectedRevision }) {
      if (failSave) throw Object.assign(new Error('test storage refused'), { code: 'TEST_STORAGE' });
      assert.equal(saved?.revision ?? null, expectedRevision);
      saved = structuredClone(next);
    },
    setFail(value) { failSave = value; },
    value() { return structuredClone(saved); }
  };
}

test('actual 17-kind seed: send -> prepare -> valid ack -> frozen frame', () => {
  let state = fresh();
  assert.equal(Object.keys(state.suite.documents).length, 28);
  assert.equal(new Set(Object.values(state.suite.documents).map(row => row.kind)).size, 17);
  state = send(state, 'a1', '原始用户消息');
  assert.equal(floor(state, 9).text, '原始用户消息');
  assert.equal(state.actions[0].status, 'queued');
  const prepared = prepare(state);
  assert.equal(prepared.state.actions[0].status, 'sent');
  const request = JSON.parse(prepared.messages[1].content);
  assert.equal(request.actions[0].text, '原始用户消息');
  assert.deepEqual(request.protocol.shape.acks, ['a1']);
  const result = accept(prepared.state, reply());
  assert.equal(result.state.actions[0].status, 'received');
  assert.equal(floor(result.state, 10).text, '角色回复');
  assert.equal(result.state.notifications.length, 1);
  assert.equal(getDoc(result.snapshot.suite, 'forum-encore').items.at(-1).floor, 10);
});

test('partial acknowledgements leave unhandled actions queued', () => {
  let state = send(fresh(), 'a1');
  state = action(state, 'search1', { kind: 'search', query: '安可', scope: 'public' });
  state = prepare(state).state;
  const result = accept(state, reply('r1', ['a1'])).state;
  assert.equal(result.actions.find(row => row.id === 'a1').status, 'received');
  assert.equal(result.actions.find(row => row.id === 'search1').status, 'queued');
  assert.deepEqual(prepare(result, 'r2').state.requests.r2.actionIds, ['search1']);
});

test('invalid JSON, unknown acks and missing payload do not mutate input', () => {
  const state = prepare(send(fresh(), 'a1')).state;
  const before = exportPhone(state);
  expectCode(() => accept(state, '<extra><phone>{bad}</phone></extra>'), 'PHONE_PROTOCOL_JSON');
  expectCode(() => accept(state, reply('r1', ['not-in-request'])), 'PHONE_ACK_SCOPE');
  expectCode(() => accept(state, '正文正常完成，没有手机协议'), 'PHONE_REPLY_MISSING');
  expectCode(() => accept(state, reply('wrong', ['a1'])), 'PHONE_REQUEST_MISSING');
  assert.equal(exportPhone(state), before);
  assert.equal(state.actions[0].status, 'sent');
});

test('future messages and reactions do not rewrite the earlier snapshot', () => {
  let state = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  const before = JSON.stringify(getDoc(phoneSnapshot(state, 's1').suite, 'forum-encore'));
  state = send(state, 'a2', '未来楼层');
  state = action(state, 'like1', { kind: 'reaction', threadId: 'forum-encore', target: { floor: 5 }, value: 'like' });
  assert.equal(floor(state, 11).text, '未来楼层');
  assert.equal(floor(state, 5).counts.like, 18);
  assert.equal(JSON.stringify(getDoc(phoneSnapshot(state, 's1').suite, 'forum-encore')), before);
});

test('retry changes the attempt while preserving a single user message', async () => {
  const storage = memoryStorage(); let sequence = 0;
  const service = createPhoneService({ seed, storage, contextKey: CHAT, now: () => AT, idFactory: () => `a${++sequence}` });
  await service.init();
  const { actionId } = await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '只发一次' });
  await service.prepareTurn({ chatKey: CHAT, requestId: 'r1', anchorUid: 'anchor' });
  await service.failTurn({ requestId: 'r1', error: '模型返回空文本' });
  await service.retryAction(actionId);
  await service.prepareTurn({ chatKey: CHAT, requestId: 'r2', anchorUid: 'anchor2' });
  const state = service.getState();
  assert.equal(doc(state).items.filter(row => row.text === '只发一次').length, 1);
  assert.equal(state.actions.length, 1);
  assert.deepEqual(state.requests.r2.actionIds, [actionId]);
});

test('public search excludes private messages and local reader state', () => {
  let state = fresh();
  assert.equal(searchPhone(state, '内部集合时间', { scope: 'public' }).length, 0);
  assert.equal(searchPhone(state, '内部集合时间', { scope: 'mine' })[0].id, 'dm-team');
  state = action(state, 'sr', { kind: 'search', query: '安可' });
  assert.ok(searchPhone(state, '安可').length > 0);
  assert.equal(searchPhone(state, 'readerState').length, 0);
});

test('same source is idempotent and changed content conflicts', () => {
  const start = prepare(send(fresh(), 'a1')).state;
  const first = accept(start, reply()).state;
  const replay = accept(first, reply());
  assert.strictEqual(replay.state, first);
  assert.equal(replay.receipt.replayed, true);
  expectCode(() => accept(first, reply('r1', ['a1'], '改了内容')), 'PHONE_SOURCE_CONFLICT');
  assert.equal(first.notifications.length, 1);
});

test('reconcile also rejects changed content behind an unchanged source id', () => {
  const state = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  expectCode(() => reconcilePhone(state, [{ sourceId: 's1', uid: 'uid-s1', candidate: 'candidate-1', raw: raw(reply('r1', ['a1'], '同ID另一内容')) }], { at: AT }), 'PHONE_SOURCE_CONFLICT');
});

test('reroll forks from the original request and keeps the former frozen page', () => {
  const prepared = prepare(send(fresh(), 'a1')).state;
  const first = accept(prepared, reply()).state;
  const second = accept(first, reply('r1', ['a1'], '重骰回复'), 's1-reroll').state;
  assert.notEqual(second.suite.activeBranch, first.suite.activeBranch);
  assert.deepEqual(second.selectedSources, ['s1-reroll']);
  assert.equal(doc(second).items.filter(row => row.text === '角色回复').length, 0);
  assert.equal(doc(second).items.filter(row => row.text === '重骰回复').length, 1);
  assert.equal(getDoc(phoneSnapshot(second, 's1').suite, 'forum-encore').items.at(-1).text, '角色回复');
});

test('reroll deactivates notices from abandoned sources', () => {
  const first = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  const second = accept(first, reply('r1', ['a1'], '重骰回复'), 's1-reroll').state;
  assert.equal(second.notifications.find(row => row.sourceId === 's1').inactive, true);
  assert.notEqual(second.notifications.find(row => row.sourceId === 's1-reroll').inactive, true);
});

test('reconcile deleting a later source restores history and preserves its snapshot', () => {
  let state = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  state = prepare(send(state, 'a2', '第二轮用户消息'), 'r2').state;
  const secondReply = reply('r2', ['a2'], '第二轮回复'); secondReply.markers[0].floor = 12;
  state = accept(state, secondReply, 's2').state;
  const restored = reconcilePhone(state, [{ sourceId: 's1', uid: 'uid-s1', raw: raw(reply()) }], { at: AT });
  assert.deepEqual(restored.selectedSources, ['s1']);
  assert.equal(doc(restored).items.at(-1).text, '第二轮用户消息');
  assert.equal(restored.actions.find(row => row.id === 'a2').status, 'queued');
  assert.equal(restored.notifications.find(row => row.sourceId === 's2').inactive, true);
  assert.equal(getDoc(phoneSnapshot(restored, 's2').suite, 'forum-encore').items.at(-1).text, '第二轮回复');
});

test('like/down are mutually exclusive; unknown remains unknown and zero is real', () => {
  let state = fresh();
  state = action(state, 'like1', { kind: 'reaction', threadId: 'forum-encore', target: { floor: 5 }, value: 'like' });
  assert.deepEqual(floor(state, 5).counts, { like: 18, down: 1 });
  state = action(state, 'down1', { kind: 'reaction', threadId: 'forum-encore', target: { floor: 5 }, value: 'down' });
  assert.deepEqual(floor(state, 5).counts, { like: 17, down: 2 });
  state = action(state, 'down2', { kind: 'reaction', threadId: 'forum-encore', target: { floor: 5 }, value: 'down' });
  assert.deepEqual(floor(state, 5).counts, { like: 17, down: 1 });
  state = action(state, 'zero', { kind: 'reaction', threadId: 'forum-encore', target: { floor: 8 }, value: 'like' });
  assert.equal(floor(state, 8).counts.like, 1);
  assert.equal(Object.hasOwn(floor(state, 8).counts, 'down'), false);
  state = send(state, 'a1', '未知赞数');
  state = action(state, 'unknown', { kind: 'reaction', threadId: 'forum-encore', target: { floor: 9 }, value: 'like' });
  assert.equal(Object.hasOwn(floor(state, 9).counts, 'like'), false);
  assert.equal(doc(state).meta.readerState.me.reactions['floor:9'], 'like');
});

test('persistent write failure leaves in-memory state and saved state unchanged', async () => {
  const storage = memoryStorage();
  const service = createPhoneService({ seed, storage, contextKey: CHAT, now: () => AT, idFactory: () => 'one' });
  await service.init();
  const memoryBefore = service.export(), savedBefore = JSON.stringify(storage.value());
  storage.setFail(true);
  await assert.rejects(service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '保存失败' }), { code: 'TEST_STORAGE' });
  assert.equal(service.export(), memoryBefore);
  assert.equal(JSON.stringify(storage.value()), savedBefore);
});

test('host chat mismatch rejects prepare/accept/import without mutation', async () => {
  const storage = memoryStorage();
  const service = createPhoneService({ seed, storage, contextKey: CHAT, now: () => AT, idFactory: () => 'a1' });
  await service.init(); await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '归属固定' });
  const before = service.export();
  await assert.rejects(service.prepareTurn({ chatKey: 'chat-b', requestId: 'r1', anchorUid: 'a' }), { code: 'PHONE_CONTEXT_CHANGED' });
  await assert.rejects(service.acceptTurn({ chatKey: 'chat-b', sourceId: 's1', uid: 'u', raw: raw(reply()) }), { code: 'PHONE_CONTEXT_CHANGED' });
  expectCode(() => importPhone(exportPhone(fresh()), { contextKey: 'chat-b' }), 'PHONE_CONTEXT_CHANGED');
  assert.equal(service.export(), before);
});

test('model cannot change readerState/visibility or impersonate self in existing blocks', () => {
  const state = prepare(send(fresh(), 'a1')).state;
  for (const block of [
    { type: 'forum', thread: 'forum-encore', meta: { readerState: { me: { liked: true } } } },
    { type: 'forum', thread: 'forum-encore', visibility: 'private' },
    { type: 'forum', thread: 'forum-encore', meta: { coreThread: {} } }
  ]) expectCode(() => accept(state, { requestId: 'r1', acks: [], blocks: [block] }), 'PHONE_MODEL_SCOPE');
  for (const item of [{ by: 'me', text: '冒充我' }, { repeat: { text: '冒充我', ids: ['me'], n: 1 } }]) {
    expectCode(() => accept(state, { requestId: 'r1', acks: [], blocks: [{ type: 'forum', thread: 'forum-encore', items: [item] }] }), 'PHONE_MODEL_SELF');
  }
});

test('new documents cannot smuggle local reader state', () => {
  const state = prepare(send(fresh(), 'a1')).state;
  const value = { requestId: 'r1', acks: [], blocks: [], documents: [{ id: 'new-news', kind: 'news', title: '新页面', author: 'press-window', visibility: 'public', text: '正文', items: [], meta: { readerState: { me: { liked: true } } } }] };
  expectCode(() => accept(state, value), 'PHONE_MODEL_SCOPE');
});

test('new document items cannot impersonate the current user', () => {
  const state = prepare(send(fresh(), 'a1')).state;
  const value = { requestId: 'r1', acks: [], blocks: [], documents: [{ id: 'new-weibo', kind: 'weibo', title: '新页面', author: 'wb-lotis', visibility: 'public', text: '正文', items: [{ id: 'fake-me', kind: 'comment', by: 'me', text: '并没有说过' }] }] };
  expectCode(() => accept(state, value), 'PHONE_MODEL_SELF');
});

test('model cannot delete the just-queued user message', () => {
  const state = prepare(send(fresh(), 'a1')).state;
  const value = { requestId: 'r1', acks: [], blocks: [{ type: 'forum', thread: 'forum-encore', items: [{ delete: 9 }] }] };
  expectCode(() => accept(state, value), 'PHONE_MODEL_SELF');
});

test('missing response preserves pending actions and supports explicit failure/retry', async () => {
  const storage = memoryStorage();
  const service = createPhoneService({ seed, storage, contextKey: CHAT, now: () => AT, idFactory: () => 'a1' });
  await service.init(); await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '保留队列' });
  await service.prepareTurn({ chatKey: CHAT, requestId: 'r1', anchorUid: 'u1' });
  const before = service.export();
  await assert.rejects(service.acceptTurn({ chatKey: CHAT, sourceId: 's1', uid: 'u1', raw: '' }), { code: 'PHONE_REPLY_MISSING' });
  assert.equal(service.export(), before);
  await service.failTurn({ requestId: 'r1', error: '手机增量缺失' });
  assert.equal(service.getState().actions[0].status, 'failed');
  assert.equal(doc(service.getState()).items.at(-1).text, '保留队列');
});

test('a prepared request id cannot be overwritten by a different set of actions', () => {
  let state = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  state = send(state, 'a2', '第二条');
  expectCode(() => prepare(state, 'r1'), 'PHONE_REQUEST_CONFLICT');
});

test('valid identifier toString does not collide with object prototypes', () => {
  const state = prepare(send(fresh(), 'a1')).state;
  const result = accept(state, reply(), 'toString');
  assert.equal(result.receipt.sourceId, 'toString');
  assert.equal(result.state.selectedSources[0], 'toString');
});

test('reroll of an earlier turn detaches user actions from the abandoned continuation', () => {
  let state = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  state = prepare(send(state, 'a2', '已离开分支中的用户消息'), 'r2').state;
  const later = reply('r2', ['a2'], '已离开分支中的回复'); later.markers[0].floor = 12;
  state = accept(state, later, 's2').state;
  const rerolled = accept(state, reply('r1', ['a1'], '较早轮次重骰'), 's1-reroll').state;
  assert.deepEqual(rerolled.selectedSources, ['s1-reroll']);
  assert.equal(doc(rerolled).items.some(row => row.text === '已离开分支中的用户消息'), false);
  assert.equal(rerolled.actions.find(row => row.id === 'a2').status, 'detached');
  assert.equal(rerolled.notifications.find(row => row.sourceId === 's2').inactive, true);
});

test('saved archive restores frozen frames and current reader choices exactly', () => {
  let state = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  state = action(state, 'reaction', { kind: 'reaction', threadId: 'forum-encore', target: { floor: 5 }, value: 'down' });
  const serialized = exportPhone(state);
  const restored = importPhone(serialized, { contextKey: CHAT });
  assert.equal(exportPhone(restored), serialized);
  assert.deepEqual(getDoc(phoneSnapshot(restored, 's1').suite, 'forum-encore'), getDoc(phoneSnapshot(state, 's1').suite, 'forum-encore'));
  assert.equal(doc(restored).meta.readerState.me.reactions['floor:5'], 'down');
});

test('prepared turn blocks mutations but preserves editable drafts', async () => {
  const storage = memoryStorage(); let sequence = 0;
  const service = createPhoneService({ seed, storage, contextKey: CHAT, now: () => AT, idFactory: () => `a${++sequence}` });
  await service.init(); await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '第一条' });
  await service.prepareTurn({ chatKey: CHAT, requestId: 'r1', anchorUid: 'u1' });
  await assert.rejects(service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '还不能发' }), { code: 'PHONE_TURN_BUSY' });
  await assert.rejects(service.dispatch({ kind: 'reaction', threadId: 'forum-encore', target: { floor: 5 }, value: 'like' }), { code: 'PHONE_TURN_BUSY' });
  await assert.rejects(service.dispatch({ kind: 'search', query: '世界内搜索' }), { code: 'PHONE_TURN_BUSY' });
  await assert.rejects(service.applyLocal({ blocks: [{ type: 'forum', thread: 'forum-encore', title: '新标题' }] }), { code: 'PHONE_TURN_BUSY' });
  await assert.rejects(service.cancelAction('a1'), { code: 'PHONE_TURN_BUSY' });
  await service.setDraft('forum-encore', '尚未发出的草稿');
  assert.equal(service.getState().drafts['forum-encore'], '尚未发出的草稿');
  assert.equal(doc(service.getState()).items.at(-1).text, '第一条');
});

test('replay request locks writes until the new candidate is accepted', async () => {
  const storage = memoryStorage(); let sequence = 0;
  const service = createPhoneService({ seed, storage, contextKey: CHAT, now: () => AT, idFactory: () => `a${++sequence}` });
  await service.init(); await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '原消息' });
  await service.prepareTurn({ chatKey: CHAT, requestId: 'r1', anchorUid: 'u1' });
  await service.acceptTurn({ chatKey: CHAT, sourceId: 's1', uid: 'u1', raw: raw(reply()) });
  await service.prepareTurn({ chatKey: CHAT, replayRequestId: 'r1' });
  await assert.rejects(service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '锁定时不能发' }), { code: 'PHONE_TURN_BUSY' });
  await service.acceptTurn({ chatKey: CHAT, sourceId: 's1-reroll', uid: 'u1', raw: raw(reply('r1', ['a1'], '重骰')) });
  await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '已解除锁定' });
  assert.equal(doc(service.getState()).items.at(-1).text, '已解除锁定');
});

test('cancelled queued message is absent from the next factual thread context', async () => {
  const storage = memoryStorage(); let sequence = 0;
  const service = createPhoneService({ seed, storage, contextKey: CHAT, now: () => AT, idFactory: () => `a${++sequence}` });
  await service.init();
  const { actionId } = await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '取消的秘密文本' });
  await service.cancelAction(actionId);
  await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '真正要发的消息' });
  const result = await service.prepareTurn({ chatKey: CHAT, requestId: 'r1', anchorUid: 'u1' });
  assert.equal(result.messages[1].content.includes('取消的秘密文本'), false);
  assert.equal(result.messages[1].content.includes('真正要发的消息'), true);
  assert.deepEqual(JSON.parse(result.messages[1].content).actions.map(row => row.id), ['a2']);
});

test('archive rejects malformed action and request schemas before accepting the data', () => {
  const accepted = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  const cases = [
    value => { value.actions[0].reference = {}; },
    value => { delete value.actions[0].threadId; },
    value => { value.requests.r1.status = 'invented-state'; },
    value => { value.requests.r1.actionIds = ['a1', 'a1']; },
    value => { value.selectedSources = ['s1', 's1']; },
    value => { value.frames.s1.acks = ['unknown-action']; },
    value => { value.frames.s1.requestId = 'toString'; },
    value => { value.frames.s1.beforeBranchId = 'missing-branch'; },
    value => { value.frames.s1.beforeEventCount = 100000; }
  ];
  for (const [index, alter] of cases.entries()) {
    const value = JSON.parse(exportPhone(accepted)); alter(value);
    assert.throws(() => importPhone(value, { contextKey: CHAT }), error => error.code === 'PHONE_ARCHIVE_CORRUPT', `archive mutation ${index} must be rejected`);
  }
});

test('archive rejects a request or snapshot referencing a nonexistent branch', () => {
  const accepted = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  for (const kind of ['requests', 'frames']) {
    const value = JSON.parse(exportPhone(accepted));
    value[kind][kind === 'requests' ? 'r1' : 's1'].branchId = 'missing-branch';
    expectCode(() => importPhone(value, { contextKey: CHAT }), 'PHONE_ARCHIVE_CORRUPT');
  }
});

test('archive import is blocked while a prepared turn owns the state', async () => {
  const storage = memoryStorage();
  const service = createPhoneService({ seed, storage, contextKey: CHAT, now: () => AT, idFactory: () => 'a1' });
  await service.init(); await service.dispatch({ kind: 'message', threadId: 'forum-encore', text: '正在生成' });
  const previousArchive = service.export();
  await service.prepareTurn({ chatKey: CHAT, requestId: 'r1', anchorUid: 'u1' });
  await assert.rejects(service.import(previousArchive), { code: 'PHONE_TURN_BUSY' });
  assert.equal(service.getState().requests.r1.status, 'prepared');
});

test('replaying an older request cannot take ownership from a different prepared turn', () => {
  let state = accept(prepare(send(fresh(), 'a1')).state, reply()).state;
  state = prepare(send(state, 'a2', '第二轮用户消息'), 'r2').state;
  expectCode(() => preparePhoneTurn(state, { replayRequestId: 'r1', at: AT }), 'PHONE_TURN_BUSY');
  assert.equal(state.requests.r2.status, 'prepared');
  assert.equal(state.requests.r1.status, 'accepted');
});
