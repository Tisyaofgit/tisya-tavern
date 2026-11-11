// Optional compatibility probe for fixed TauriTavern internals, NOT a public ABI.
// This module only observes: it never registers claims, changes demand, refreshes,
// mounts, reads guest documents, or evaluates message/guest code.
const RUNTIME_PATH = '/tauri/main/services/chat-surface/runtime.js';
const HELPER_PARTICIPANT = 'js-slash-runner/message-runtime';
const defaultLoader = path => import(path);
const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const bool = value => typeof value === 'boolean' ? value : null;

// Do not invoke arbitrary getters while inspecting settings, faults or snapshots.
function read(value, key) {
 if (!object(value)) return {state: 'missing', value: undefined};
 try {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return {state: 'missing', value: undefined};
  if (!('value' in descriptor)) return {state: 'unreadable', value: undefined};
  return {state: 'known', value: descriptor.value};
 } catch { return {state: 'unreadable', value: undefined}; }
}
const value = (source, key) => read(source, key).value;
function field(source, key, accepts) {
 const item = read(source, key);
 return item.state !== 'known' ? {state: item.state, value: null}
  : accepts(item.value) ? {state: 'known', value: item.value} : {state: 'invalid', value: null};
}
function safeErrorType(error) {
 const name = read(error, 'name');
 const names = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError', 'AbortError', 'TimeoutError'];
 if (name.state === 'known') return names.includes(name.value) ? name.value : 'OtherError';
 try {
  if (error instanceof TypeError) return 'TypeError';
  if (error instanceof RangeError) return 'RangeError';
  if (error instanceof Error) return 'Error';
 } catch { return 'UnreadableError'; }
 return 'OtherError';
}
function fault(item) {
 if (item.state !== 'known') return {present: null, type: null};
 return item.value == null ? {present: false, type: null} : {present: true, type: safeErrorType(item.value)};
}
async function bounded(task, timeoutMs) {
 let timer;
 const operation = Promise.resolve().then(task).then(result => ({status: 'available', result}), error => ({status: 'unavailable', reason: 'rejected', errorType: safeErrorType(error)}));
 try {
  return await Promise.race([operation, new Promise(resolve => { timer = setTimeout(() => resolve({status: 'unavailable', reason: 'timeout', errorType: null}), timeoutMs); })]);
 } finally { clearTimeout(timer); }
}

function inspectSettings(context) {
 const extension = read(context, 'extensionSettings'), helper = read(extension.value, 'tavern_helper'), render = read(helper.value, 'render');
 const raw = render.value;
 return {
  source: 'extensionSettings.tavern_helper.render', effectiveSettingsVerified: false,
  status: [extension, helper, render].some(item => item.state === 'unreadable') ? 'unreadable'
   : object(raw) ? 'available' : 'unavailable',
  legacySettingsPresent: extension.state === 'known' && object(extension.value) ? read(extension.value, 'TavernHelper').state === 'known' : null,
  enabled: field(raw, 'enabled', item => typeof item === 'boolean'),
  allow_streaming: field(raw, 'allow_streaming', item => typeof item === 'boolean'),
  use_blob_url: field(raw, 'use_blob_url', item => typeof item === 'boolean'),
  depth: field(raw, 'depth', item => typeof item === 'number' && Number.isFinite(item)),
  depth_ignore_hidden: field(raw, 'depth_ignore_hidden', item => typeof item === 'boolean'),
  collapse_code_block: field(raw, 'collapse_code_block', item => ['none', 'frontend_only', 'all'].includes(item)),
 };
}

function inspectEligibility(context, settings, messageId) {
 const chatRead = read(context, 'chat'), chat = chatRead.value;
 const chatArray = chatRead.state === 'known' ? Array.isArray(chat) : null;
 const target = chatArray && messageId !== null ? read(chat, String(messageId)) : {state: 'missing'};
 const messageMatch = !chatArray || messageId === null ? 'unknown' : target.state === 'unreadable' ? 'unknown'
  : target.state === 'known' && object(target.value) ? 'indexed-entry' : 'missing';
 const result = {basis: 'raw-settings-simulation', chatArray, messageMatch, depthEligible: null, eligible: null, reason: 'settings-unknown'};
 const {enabled, allow_streaming, depth, depth_ignore_hidden: ignore} = settings;
 if (enabled.value === false) return {...result, eligible: false, reason: 'disabled'};
 if (enabled.value === true && allow_streaming.value === true) return {...result, eligible: false, reason: 'streaming-unsupported'};
 if (depth.state !== 'known' || ignore.state !== 'known') return result;
 if (chatArray !== true) return {...result, reason: 'chat-unavailable'};
 if (messageMatch !== 'indexed-entry') return {...result, reason: 'message-unmatched'};
 const hidden = item => {
  const entry = read(item, 'is_system');
  return entry.state === 'unreadable' ? null : !!entry.value;
 };
 let depthEligible, reason;
 const currentHidden = ignore.value ? hidden(target.value) : false;
 if (currentHidden === null) return {...result, reason: 'hidden-state-unreadable'};
 if (currentHidden) { depthEligible = false; reason = 'hidden-message'; }
 else if (depth.value === 0) { depthEligible = true; reason = 'within-depth'; }
 else {
  // Same decrement/skip/zero order as the pinned helper; negative and fractional
  // numeric values are not silently normalized into a different setting.
  let remaining = depth.value, visited = 0;
  const length = read(chat, 'length');
  if (length.state !== 'known' || integer(length.value) === null) return {...result, reason: 'chat-unavailable'};
  depthEligible = false; reason = 'outside-depth';
  for (let index = length.value - 1; index >= 0; index--) {
   if (++visited > 100000) return {...result, reason: 'scan-limit'};
   if (ignore.value) {
    const entry = read(chat, String(index));
    if (entry.state === 'unreadable') return {...result, reason: 'hidden-state-unreadable'};
    const skipped = hidden(entry.value);
    if (skipped === null) return {...result, reason: 'hidden-state-unreadable'};
    if (skipped) continue;
   }
   if (index === messageId) { depthEligible = remaining > 0; break; }
   remaining--;
   if (remaining === 0) break;
  }
  if (depthEligible) reason = 'within-depth';
 }
 if (!depthEligible) return {...result, depthEligible, eligible: false, reason};
 return {...result, depthEligible, eligible: enabled.value === true && allow_streaming.value === false ? true : null,
  reason: enabled.value === true && allow_streaming.value === false ? reason : 'settings-unknown'};
}

function inspectRuntime(module, message, messageId) {
 const result = {status: 'unavailable', reason: null, errorType: null, controllerInstalled: null,
  ownsCurrentElement: null, elementMatchesMessageId: null, candidates: null, aggregate: null,
  faults: {controller: {present: null, type: null}, admission: {present: null, type: null}}};
 const getController = value(module, 'getInstalledChatSurfaceController');
 if (typeof getController !== 'function') return {...result, reason: 'controller-export-unavailable'};
 let controller;
 try { controller = getController(); }
 catch (error) { return {...result, reason: 'controller-read-failed', errorType: safeErrorType(error)}; }
 result.controllerInstalled = controller != null;
 if (!object(controller)) return {...result, reason: 'controller-not-installed'};
 const owns = value(controller, 'ownsMessageElement'), getElement = value(controller, 'getMessageElement'), snapshot = value(controller, 'snapshot');
 if (typeof owns !== 'function' || typeof getElement !== 'function' || typeof snapshot !== 'function') return {...result, reason: 'controller-capabilities-unavailable'};
 let state;
 try {
  result.ownsCurrentElement = bool(owns.call(controller, message));
  result.elementMatchesMessageId = getElement.call(controller, messageId) === message;
  state = snapshot.call(controller);
 } catch (error) { return {...result, reason: 'snapshot-read-failed', errorType: safeErrorType(error)}; }
 const runtime = value(state, 'runtime'), candidates = value(runtime, 'candidates');
 result.faults = {controller: fault(read(state, 'fault')), admission: fault(read(runtime, 'fault'))};
 if (!object(runtime) || !Array.isArray(candidates)) return {...result, reason: 'snapshot-shape-unavailable'};
 result.aggregate = {
  mode: ['eager', 'managed'].includes(value(runtime, 'mode')) ? value(runtime, 'mode') : null,
  maxActive: integer(value(runtime, 'maxActive')), active: integer(value(runtime, 'active')), pending: integer(value(runtime, 'pending')),
  scheduled: bool(value(runtime, 'scheduled')), suspended: bool(value(runtime, 'suspended')),
 };
 // A reused numeric mesid is not evidence that this controller owns this DOM.
 // Keep global evidence, but never attribute another residency's claims here.
 if (result.ownsCurrentElement !== true || result.elementMatchesMessageId !== true) return {...result, reason: 'current-element-unconfirmed'};
 const selected = [];
 for (let index = 0; index < candidates.length; index++) {
  if (index >= 100000) return {...result, reason: 'candidate-scan-limit'};
  const candidate = read(candidates, String(index)), id = read(candidate.value, 'messageId');
  if (candidate.state !== 'known' || id.state !== 'known' || integer(id.value) === null) return {...result, reason: 'candidate-shape-unavailable'};
  if (id.value !== messageId) continue;
  const participant = value(candidate.value, 'participantId'), candidateState = value(candidate.value, 'state');
  if (typeof participant !== 'string') return {...result, reason: 'candidate-shape-unavailable'};
  selected.push({participant: participant === HELPER_PARTICIPANT ? 'tavern-helper' : 'other',
   state: ['active', 'pending'].includes(candidateState) ? candidateState : 'unknown'});
 }
 return {...result, status: 'available', candidates: selected};
}

/**
 * context is a current plain SillyTavern context, or getContext supplies one.
 * loadRuntime(path) is injectable; its default imports an OPTIONAL INTERNAL host
 * module, not a supported public ABI. timeoutMs is bounded to 1..5000 ms.
 * Callers must discard stale replies after navigation/chat changes. Settings are
 * raw persisted evidence: helper migration/schema recovery may differ in memory.
 */
export async function collectNativeRuntimeDiagnostic(document, node, {context, getContext, loadRuntime = defaultLoader, timeoutMs = 1500} = {}) {
 const timeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(5000, timeoutMs)) : 1500;
 const report = {schema: 'tisya.native-runtime-diagnostic/1',
  compatibility: {publicAbi: false, hostRevision: '85dc99089e3fcc9d3a0aafc085564bd642895261', helperRevision: '91a706cfcc884baae3c9da47e5d672901a5d65a6'},
  message: {id: null, located: false, connected: null}, context: {status: 'unavailable', reason: 'context-unavailable', errorType: null},
  settings: inspectSettings(null), eligibility: null, runtime: {status: 'unavailable', reason: 'message-unavailable'}, timeoutMs: timeout};
 let message;
 try {
  message = node?.matches?.('.mes') ? node : node?.closest?.('.mes');
  if (message?.ownerDocument !== document) message = null;
  const rawId = message?.getAttribute('mesid');
  report.message = {id: typeof rawId === 'string' && /^\d+$/.test(rawId) ? integer(Number(rawId)) : null, located: !!message, connected: message ? !!message.isConnected : null};
 } catch (error) { report.runtime = {status: 'unavailable', reason: 'message-read-failed', errorType: safeErrorType(error)}; return report; }
 if (!message || report.message.id === null) { report.eligibility = inspectEligibility(null, report.settings, null); return report; }
 const [contextResult, moduleResult] = await Promise.all([
  bounded(() => context !== undefined ? context : typeof getContext === 'function' ? getContext() : undefined, timeout),
  bounded(() => loadRuntime(RUNTIME_PATH), timeout),
 ]);
 if (contextResult.status === 'available' && object(contextResult.result)) {
  report.context = {status: 'available', reason: null, errorType: null};
  report.settings = inspectSettings(contextResult.result);
 } else report.context = {status: 'unavailable', reason: contextResult.reason ? 'context-' + contextResult.reason : 'context-unavailable', errorType: contextResult.errorType ?? null};
 try { report.eligibility = inspectEligibility(contextResult.status === 'available' ? contextResult.result : null, report.settings, report.message.id); }
 catch (error) { report.eligibility = {basis: 'raw-settings-simulation', chatArray: null, messageMatch: 'unknown', depthEligible: null, eligible: null, reason: 'eligibility-read-failed', errorType: safeErrorType(error)}; }
 try {
  report.runtime = moduleResult.status === 'available' ? inspectRuntime(moduleResult.result, message, report.message.id)
   : {status: 'unavailable', reason: 'runtime-import-' + moduleResult.reason, errorType: moduleResult.errorType};
 } catch (error) { report.runtime = {status: 'unavailable', reason: 'snapshot-read-failed', errorType: safeErrorType(error)}; }
 return report;
}

export function nativeRuntimeDiagnosticSummary(report) {
 const lines = [], runtime = report?.runtime, eligibility = report?.eligibility;
 if (runtime?.status !== 'available') {
  lines.push(runtime?.reason === 'current-element-unconfirmed' ? '宿主未确认持有当前消息元素；本条授权与页面对应关系未确认，候选状态未知。'
   : runtime?.reason === 'runtime-import-timeout' ? '宿主运行时读取超时，当前授权状态未知。'
   : '宿主运行时状态不可读，当前授权状态未知。');
 } else {
  if (runtime.ownsCurrentElement !== true || runtime.elementMatchesMessageId !== true) lines.push('宿主快照未确认持有当前这条消息元素；本条授权与页面对应关系未确认。');
  const claims = runtime.candidates.filter(item => item.participant === 'tavern-helper');
  const active = claims.filter(item => item.state === 'active').length, pending = claims.filter(item => item.state === 'pending').length;
  const unknown = claims.length - active - pending;
  if (!claims.length) lines.push('当前消息没有助手运行时授权候选；代码开关本身不会创建页面。');
  else lines.push(`当前消息助手候选：已激活 ${active}，待调度 ${pending}${unknown ? `，状态未知 ${unknown}` : ''}。`);
  if (pending) lines.push('待调度快照不能区分尚未首次激活与先前已撤离；也不直接提供等待原因。');
  if (active) lines.push('宿主已记录激活；这不等于 iframe 已创建、页面已加载或交互已成功。');
  if (runtime.faults.controller.present || runtime.faults.admission.present) lines.push('宿主记录了运行时故障；这里只显示故障存在与安全类型，不读取错误正文。');
 }
 const explanations = {
  disabled: '原始助手设置为关闭渲染。', 'streaming-unsupported': '原始设置同时启用渲染与流式渲染；固定版助手的受管路径会拒绝该组合。',
  'hidden-message': '按原始设置模拟，本条是被忽略的隐藏消息。', 'outside-depth': '按原始设置模拟，本条超出助手渲染深度。',
  'within-depth': '按原始设置模拟，本条通过启用与深度资格；这还不能证明内容匹配、参与者注册或调度成功。',
  'chat-unavailable': '聊天数组不可读，无法判断本条深度资格。', 'message-unmatched': '聊天数组未确认当前消息索引，无法判断深度资格。',
  'hidden-state-unreadable': '隐藏消息标记不可读，无法判断深度资格。', 'scan-limit': '聊天长度超过诊断读取上限，深度资格未知。',
  'settings-unknown': '助手原始设置缺失、类型不符或不可读；未代入默认设置，渲染资格未知。',
 };
 lines.push(explanations[eligibility?.reason] ?? '本条渲染资格不可读。');
 lines.push('设置判断来自原始存储值，未验证助手当前内存中的有效设置；运行时读取使用可选内部接口。');
 return lines;
}
