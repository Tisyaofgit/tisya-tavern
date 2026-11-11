import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {collectNativeRuntimeDiagnostic, nativeRuntimeDiagnosticSummary} from '../native-runtime-diagnostic.js';

function fixture(id = 0) {
 const w = new Window({settings: {disableIframePageLoading: true, disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true}});
 const d = w.document;
 d.body.innerHTML = `<div class="mes" mesid="${id}"><div class="mes_text"><div class="TH-render"><pre>PRIVATE_SOURCE</pre><button class="TH-collapse-code-block-button">显示前端代码块</button></div></div></div>`;
 const node = d.querySelector('.mes');
 const context = {chat: [{is_system: false}, {is_system: false}, {is_system: false}], extensionSettings: {tavern_helper: {render: {enabled: true, allow_streaming: false, use_blob_url: false, depth: 0, depth_ignore_hidden: false, collapse_code_block: 'frontend_only'}}}};
 const admission = {mode: 'managed', maxActive: 8, active: 0, pending: 0, scheduled: false, suspended: false, candidates: [], fault: null};
 const snapshot = {runtime: admission, fault: null, chatId: 'PRIVATE_CHAT', mounted: [{mountKey: 'PRIVATE_MOUNT'}]};
 const forbidden = () => { throw new Error('MUTATION_WAS_CALLED'); };
 const controller = {ownsMessageElement: element => element === node, getMessageElement: messageId => messageId === id ? node : null, snapshot: () => snapshot,
  refresh: forbidden, redisplay: forbidden, setRuntimeDemand: forbidden, mount: forbidden};
 return {w, d, node, context, admission, snapshot, controller, loadRuntime: async () => ({getInstalledChatSurfaceController: () => controller})};
}
async function collect(f, options = {}) {
 return collectNativeRuntimeDiagnostic(f.d, f.node, {context: f.context, loadRuntime: f.loadRuntime, ...options});
}
const claim = (messageId, state) => ({messageId, participantId: 'js-slash-runner/message-runtime', state, id: 'PRIVATE_ID', mountKey: 'PRIVATE_MOUNT'});

test('code-only, no claim and out-of-depth are independent observations; collector never mutates', async () => {
 const f = fixture(); const before = f.node.outerHTML, observer = new f.w.MutationObserver(() => {});
 observer.observe(f.node, {subtree: true, childList: true, attributes: true, characterData: true});
 f.context.extensionSettings.tavern_helper.render.depth = 1;
 try {
  const result = await collect(f);
  assert.equal(result.runtime.status, 'available'); assert.deepEqual(result.runtime.candidates, []);
  assert.equal(result.runtime.ownsCurrentElement, true); assert.equal(result.runtime.elementMatchesMessageId, true);
  assert.equal(result.eligibility.eligible, false); assert.equal(result.eligibility.reason, 'outside-depth');
  assert.deepEqual(result.settings.use_blob_url, {state: 'known', value: false});
  assert.match(nativeRuntimeDiagnosticSummary(result).join('\n'), /没有助手运行时授权候选/);
  assert.match(nativeRuntimeDiagnosticSummary(result).join('\n'), /超出助手渲染深度/);
  assert.equal(f.node.outerHTML, before); assert.equal(observer.takeRecords().length, 0);
  assert.equal(f.d.querySelectorAll('iframe').length, 0);
 } finally { observer.disconnect(); await f.w.happyDOM.abort(); }
});

test('pending and active preserve exact message filtering without inferring iframe success', async () => {
 const f = fixture();
 try {
  f.admission.candidates = [claim(0, 'pending'), claim(1, 'active')]; f.admission.pending = 1; f.admission.active = 1; f.admission.scheduled = true;
  const pending = await collect(f);
  assert.deepEqual(pending.runtime.candidates, [{participant: 'tavern-helper', state: 'pending'}]);
  assert.equal(pending.runtime.aggregate.active, 1); assert.equal(pending.eligibility.eligible, true);
  assert.match(nativeRuntimeDiagnosticSummary(pending).join('\n'), /不能区分尚未首次激活与先前已撤离/);
  f.admission.candidates[0].state = 'active';
  const active = await collect(f);
  assert.equal(active.runtime.candidates[0].state, 'active');
  assert.match(nativeRuntimeDiagnosticSummary(active).join('\n'), /不等于 iframe 已创建/);
  assert.equal(f.d.querySelectorAll('iframe').length, 0);
 } finally { await f.w.happyDOM.abort(); }
});

test('missing and invalid settings stay unknown; absent chat and unmatched index are distinct', async () => {
 const f = fixture();
 try {
  f.context.extensionSettings.tavern_helper.render = {enabled: 'true', depth: '0'};
  const unknown = await collect(f);
  assert.equal(unknown.settings.enabled.state, 'invalid'); assert.equal(unknown.settings.depth.value, null);
  assert.equal(unknown.settings.depth_ignore_hidden.state, 'missing'); assert.equal(unknown.eligibility.eligible, null);
  assert.deepEqual(unknown.settings.use_blob_url, {state: 'missing', value: null});
  f.context.extensionSettings.tavern_helper.render = {enabled: true, allow_streaming: false, depth: 0, depth_ignore_hidden: false};
  delete f.context.chat;
  const missingChat = await collect(f); assert.equal(missingChat.eligibility.reason, 'chat-unavailable'); assert.equal(missingChat.eligibility.chatArray, null);
  f.context.chat = [];
  const missingMessage = await collect(f); assert.equal(missingMessage.eligibility.reason, 'message-unmatched'); assert.equal(missingMessage.eligibility.messageMatch, 'missing');
 } finally { await f.w.happyDOM.abort(); }
});

test('depth skips system messages exactly and depth zero still rejects an ignored system target', async () => {
 const f = fixture();
 try {
  f.context.chat = [{is_system: false}, {is_system: true}, {is_system: true}];
  Object.assign(f.context.extensionSettings.tavern_helper.render, {depth: 1, depth_ignore_hidden: true});
  assert.equal((await collect(f)).eligibility.eligible, true);
  f.context.chat[0].is_system = true; f.context.extensionSettings.tavern_helper.render.depth = 0;
  assert.equal((await collect(f)).eligibility.reason, 'hidden-message');
 } finally { await f.w.happyDOM.abort(); }
});

test('optional internal import rejection, timeout and missing capability return explicit unavailable states', async () => {
 const f = fixture();
 try {
  const rejected = await collect(f, {loadRuntime: async path => { assert.equal(path, '/tauri/main/services/chat-surface/runtime.js'); throw new TypeError('PRIVATE_IMPORT'); }});
  assert.equal(rejected.runtime.reason, 'runtime-import-rejected'); assert.equal(rejected.runtime.errorType, 'TypeError');
  const timedOut = await collect(f, {loadRuntime: () => new Promise(() => {}), timeoutMs: 8});
  assert.equal(timedOut.runtime.reason, 'runtime-import-timeout');
  const missing = await collect(f, {loadRuntime: async () => ({})});
  assert.equal(missing.runtime.reason, 'controller-export-unavailable');
  const contextTimeout = await collectNativeRuntimeDiagnostic(f.d, f.node, {getContext: () => new Promise(() => {}), loadRuntime: f.loadRuntime, timeoutMs: 8});
  assert.equal(contextTimeout.context.reason, 'context-timeout'); assert.equal(contextTimeout.runtime.status, 'available');
  assert.doesNotMatch(JSON.stringify([rejected, timedOut, missing, contextTimeout]), /PRIVATE_/);
 } finally { await f.w.happyDOM.abort(); }
});

test('faults, arbitrary participant strings, accessors and source contents cannot leak into output', async () => {
 const f = fixture(); let getterCalls = 0;
 try {
  const error = new TypeError('PRIVATE_ERROR'); error.stack = 'PRIVATE_STACK'; error.cause = {source: 'PRIVATE_CAUSE'};
  f.snapshot.fault = error;
  f.admission.fault = Object.defineProperty({}, 'name', {get() { getterCalls++; throw new Error('PRIVATE_GETTER'); }});
  f.admission.candidates = [claim(0, 'active'), {messageId: 0, participantId: 'PRIVATE_PARTICIPANT', state: 'PRIVATE_STATE', srcdoc: 'PRIVATE_DOCUMENT'}, claim(2, 'pending')];
  Object.defineProperty(f.context.extensionSettings.tavern_helper.render, 'depth', {get() { getterCalls++; throw new Error('PRIVATE_SETTING'); }});
  const result = await collect(f);
  assert.deepEqual(result.runtime.faults.controller, {present: true, type: 'TypeError'});
  assert.deepEqual(result.runtime.candidates[1], {participant: 'other', state: 'unknown'});
  assert.equal(result.settings.depth.state, 'unreadable'); assert.equal(getterCalls, 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|srcdoc|mountKey|stack|cause/);
  f.controller.snapshot = () => { throw error; };
  const failed = await collect(f); assert.equal(failed.runtime.reason, 'snapshot-read-failed'); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_/);
 } finally { await f.w.happyDOM.abort(); }
});

test('stale element ownership and malformed candidate snapshots remain explicit, never zero claims', async () => {
 const f = fixture();
 try {
  f.admission.candidates = [claim(0, 'active')]; f.admission.active = 1;
  for (const [owns, matches] of [[false, true], [true, false]]) {
   f.controller.ownsMessageElement = () => owns; f.controller.getMessageElement = () => matches ? f.node : f.d.createElement('div');
   const mismatch = await collect(f);
   assert.equal(mismatch.runtime.ownsCurrentElement, owns); assert.equal(mismatch.runtime.elementMatchesMessageId, matches);
   assert.equal(mismatch.runtime.reason, 'current-element-unconfirmed'); assert.equal(mismatch.runtime.status, 'unavailable');
   assert.equal(mismatch.runtime.candidates, null); assert.equal(mismatch.runtime.aggregate.active, 1);
   assert.match(nativeRuntimeDiagnosticSummary(mismatch).join('\n'), /对应关系未确认/);
   assert.doesNotMatch(nativeRuntimeDiagnosticSummary(mismatch).join('\n'), /已激活|没有助手运行时授权候选/);
  }
  f.controller.ownsMessageElement = () => true; f.controller.getMessageElement = () => f.node;
  f.admission.candidates = [{state: 'pending'}];
  const malformed = await collect(f); assert.equal(malformed.runtime.status, 'unavailable'); assert.equal(malformed.runtime.candidates, null);
  assert.equal(malformed.runtime.reason, 'candidate-shape-unavailable');
 } finally { await f.w.happyDOM.abort(); }
});

test('unreadable proxy data ends in an explicit unavailable result instead of rejecting the collector', async () => {
 const f = fixture();
 try {
  const chat = Proxy.revocable([], {}); chat.revoke(); f.context.chat = chat.proxy;
  const brokenChat = await collect(f);
  assert.equal(brokenChat.eligibility.reason, 'eligibility-read-failed'); assert.equal(brokenChat.eligibility.eligible, null);
  const candidates = Proxy.revocable([], {}); candidates.revoke(); f.admission.candidates = candidates.proxy;
  const brokenSnapshot = await collect(f);
  assert.equal(brokenSnapshot.runtime.status, 'unavailable'); assert.equal(brokenSnapshot.runtime.reason, 'snapshot-read-failed');
 } finally { await f.w.happyDOM.abort(); }
});
