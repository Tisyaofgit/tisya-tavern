// Isolated preview only. All operations are synchronous and in memory.
// applyBatch returns a new state; a thrown error leaves its input untouched.
export class SocialError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = 'SocialError';
    this.code = code;
    this.path = path;
  }
}

const FORMAT = 'tisya.social-preview.v1';
const COUNT_KEYS = new Set(['like', 'down', 'repost', 'reply', 'views']);
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.hasOwn(value, key);
const fail = (code, path, message) => { throw new SocialError(code, path, message); };
const copy = value => structuredClone(value);
const object = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('OBJECT_REQUIRED', path, `${path} 必须是对象`);
  }
  return value;
};
const string = (value, path) => {
  if (typeof value !== 'string' || !value.trim()) fail('TEXT_REQUIRED', path, `${path} 需要非空文字`);
  return value;
};
const id = (value, path) => {
  string(value, path);
  if (UNSAFE_KEYS.has(value)) fail('INVALID_ID', path, `${path} 不是可用的标识`);
  return value;
};
const integer = (value, path, min = 0) => {
  if (!Number.isSafeInteger(value) || value < min) fail('INTEGER_REQUIRED', path, `${path} 需要不小于 ${min} 的安全整数`);
  return value;
};
const keys = (value, allowed, path) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) {
    fail('UNKNOWN_FIELD', `${path}.${key}`, `未识别字段：${path}.${key}`);
  }
};

function jsonValue(value, path = '$', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') fail('JSON_VALUE_REQUIRED', path, `${path} 必须是可保存的 JSON 值`);
  if (seen.has(value)) fail('CYCLIC_VALUE', path, `${path} 不能循环引用`);
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map((v, i) => jsonValue(v, `${path}[${i}]`, seen));
  else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail('PLAIN_OBJECT_REQUIRED', path, `${path} 需要普通对象`);
    result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      if (UNSAFE_KEYS.has(key)) fail('INVALID_KEY', `${path}.${key}`, `不可用字段：${key}`);
      if (value[key] !== undefined) result[key] = jsonValue(value[key], `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
  return result;
}

function timestamp(value, path) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail('TIME_REQUIRED', path, `${path} 需要带时区的 ISO 故事时间`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail('INVALID_TIME', path, `${path} 不是有效时间`);
  return new Date(time).toISOString();
}

function registerAccounts(state, additions, path) {
  object(additions, path);
  for (const [accountId, raw] of Object.entries(additions)) {
    id(accountId, `${path}.${accountId}`);
    const account = typeof raw === 'string' ? { name: raw } : object(raw, `${path}.${accountId}`);
    keys(account, ['name', 'avatar', 'role', 'personId', 'platform'], `${path}.${accountId}`);
    string(account.name, `${path}.${accountId}.name`);
    for (const key of ['avatar', 'role', 'personId', 'platform']) {
      if (own(account, key) && typeof account[key] !== 'string') {
        fail('TEXT_REQUIRED', `${path}.${accountId}.${key}`, `${key} 必须是文字`);
      }
    }
    if (account.platform && account.platform !== state.thread.platform) {
      fail('ACCOUNT_PLATFORM', `${path}.${accountId}.platform`, `账号 ${accountId} 不属于本话题的平台`);
    }
    const normalized = { ...account, platform: state.thread.platform };
    if (own(state.accounts, accountId)) {
      if (JSON.stringify(jsonValue(state.accounts[accountId])) !== JSON.stringify(jsonValue(normalized))) {
        fail('ACCOUNT_CONFLICT', `${path}.${accountId}`, `账号 ${accountId} 已登记且资料不同`);
      }
    } else state.accounts[accountId] = copy(normalized);
  }
}

export function createState(config) {
  const c = jsonValue(config, 'config');
  object(c, 'config');
  keys(c, ['id', 'platform', 'title', 'baseTime', 'nextFloor', 'stepSeconds', 'accounts'], 'config');
  const nextFloor = integer(c.nextFloor ?? 1, 'config.nextFloor', 1);
  const state = {
    format: FORMAT,
    thread: {
      id: id(c.id, 'config.id'),
      platform: id(c.platform, 'config.platform'),
      title: c.title ?? '',
      baseTime: timestamp(c.baseTime, 'config.baseTime'),
      stepSeconds: integer(c.stepSeconds ?? 30, 'config.stepSeconds'),
      nextFloor,
      lastTime: null
    },
    accounts: {},
    messages: {},
    gaps: nextFloor > 1 ? [{ from: 1, to: nextFloor - 1, kind: 'unshown' }] : [],
    receipts: {}
  };
  if (typeof state.thread.title !== 'string') fail('TEXT_REQUIRED', 'config.title', '标题必须是文字');
  registerAccounts(state, c.accounts ?? {}, 'config.accounts');
  return state;
}

function assertState(state) {
  if (state?.format !== FORMAT) fail('STATE_FORMAT', 'state', '不是本预览的数据状态');
  object(state.thread, 'state.thread');
  object(state.messages, 'state.messages');
  object(state.accounts, 'state.accounts');
  object(state.receipts, 'state.receipts');
}

function requireMessage(state, floor, path) {
  integer(floor, path, 1);
  const message = state.messages[String(floor)];
  if (!message) {
    const gap = state.gaps.some(g => floor >= g.from && floor <= g.to);
    fail(gap ? 'FLOOR_UNSHOWN' : 'FLOOR_NOT_FOUND', path,
      gap ? `第 ${floor} 楼只在节选范围中，没有可读取内容` : `第 ${floor} 楼尚未建立`);
  }
  return message;
}

function updateCounts(message, changes, path) {
  object(changes, path);
  for (const [key, operation] of Object.entries(changes)) {
    if (!COUNT_KEYS.has(key)) fail('COUNT_KEY', `${path}.${key}`, `未识别的计数：${key}`);
    object(operation, `${path}.${key}`);
    const ops = Object.keys(operation);
    if (ops.length !== 1 || !['set', 'add'].includes(ops[0])) {
      fail('COUNT_OPERATION', `${path}.${key}`, '每个计数只能给一个 set 或 add');
    }
    let value;
    if (ops[0] === 'set') value = integer(operation.set, `${path}.${key}.set`);
    else {
      if (!Number.isSafeInteger(operation.add)) fail('INTEGER_REQUIRED', `${path}.${key}.add`, '计数增量需要安全整数');
      if (!own(message.counts, key)) fail('COUNT_BASE_UNKNOWN', `${path}.${key}`, `${key} 尚无已知数值，请先用 set 给出基值`);
      value = message.counts[key] + operation.add;
      if (!Number.isSafeInteger(value) || value < 0) fail('COUNT_RANGE', `${path}.${key}`, `${key} 变化后的数值不可为负或超出安全范围`);
    }
    message.counts[key] = value;
  }
}

function nextTime(state, item, path) {
  if (own(item, 'at') && own(item, 'afterSeconds')) fail('TIME_CONFLICT', path, 'at 与 afterSeconds 只能给一个');
  const anchor = state.thread.lastTime ?? state.thread.baseTime;
  let at;
  if (own(item, 'at')) at = timestamp(item.at, `${path}.at`);
  else {
    const seconds = own(item, 'afterSeconds')
      ? integer(item.afterSeconds, `${path}.afterSeconds`)
      : state.thread.lastTime === null ? 0 : state.thread.stepSeconds;
    const value = Date.parse(anchor) + seconds * 1000;
    if (!Number.isSafeInteger(value) || Math.abs(value) > 8.64e15) fail('TIME_RANGE', path, '时间变化超出可表示范围');
    at = new Date(value).toISOString();
  }
  if (Date.parse(at) < Date.parse(anchor)) fail('TIME_BACKWARDS', `${path}.at`, '新消息时间不能早于本话题已经成立的末尾时间');
  return at;
}

function appendMessage(state, item, batchId, itemIndex, expansionIndex, path) {
  const author = id(item.by, `${path}.by`);
  if (!own(state.accounts, author)) fail('ACCOUNT_NOT_FOUND', `${path}.by`, `账号 ${author} 尚未登记`);
  string(item.text, `${path}.text`);
  const floor = own(item, 'floor') ? integer(item.floor, `${path}.floor`, 1) : state.thread.nextFloor;
  if (floor < state.thread.nextFloor || own(state.messages, String(floor))) {
    fail('FLOOR_NOT_AVAILABLE', `${path}.floor`, `新楼号应不小于 ${state.thread.nextFloor}；既有楼号与省略范围不回收`);
  }
  if (!Number.isSafeInteger(floor + 1)) fail('FLOOR_RANGE', `${path}.floor`, '楼号超出安全范围');
  const quote = own(item, 'quote') ? requireMessage(state, item.quote, `${path}.quote`) : null;
  const at = nextTime(state, item, path);
  const message = {
    id: [state.thread.platform, state.thread.id, batchId, itemIndex, expansionIndex].map(x => encodeURIComponent(String(x))).join('/'),
    floor, by: author, text: item.text, at,
    quote: quote?.floor ?? null,
    quoteId: quote?.id ?? null,
    counts: {},
    deleted: false
  };
  if (own(item, 'counts')) updateCounts(message, item.counts, `${path}.counts`);
  if (floor > state.thread.nextFloor) state.gaps.push({ from: state.thread.nextFloor, to: floor - 1, kind: 'unshown' });
  state.messages[String(floor)] = message;
  state.thread.nextFloor = floor + 1;
  state.thread.lastTime = at;
  return message.id;
}

export function applyBatch(state, input) {
  assertState(state);
  const batch = jsonValue(input, 'batch');
  object(batch, 'batch');
  keys(batch, ['id', 'thread', 'accounts', 'items'], 'batch');
  const batchId = id(batch.id, 'batch.id');
  if (own(batch, 'thread') && batch.thread !== state.thread.id) fail('THREAD_MISMATCH', 'batch.thread', '批次不属于当前话题');
  if (!Array.isArray(batch.items)) fail('ITEMS_REQUIRED', 'batch.items', 'items 必须是按执行顺序排列的数组');
  const signature = JSON.stringify(batch);
  if (own(state.receipts, batchId)) {
    if (state.receipts[batchId].signature !== signature) fail('BATCH_CONFLICT', 'batch.id', '同一个批次 ID 已用于另一份内容');
    return state;
  }
  const next = copy(state), createdIds = [];
  if (own(batch, 'accounts')) registerAccounts(next, batch.accounts, 'batch.accounts');
  batch.items.forEach((item, itemIndex) => {
    const path = `batch.items[${itemIndex}]`;
    object(item, path);
    if (own(item, 'repeat')) {
      keys(item, ['repeat', 'floor', 'quote', 'at', 'afterSeconds', 'counts'], path);
      const repeat = object(item.repeat, `${path}.repeat`);
      keys(repeat, ['sourceFloor', 'text', 'ids', 'n'], `${path}.repeat`);
      if (!Array.isArray(repeat.ids)) fail('REPEAT_IDS', `${path}.repeat.ids`, '复读需要明确的账号 ID 列表');
      if (own(repeat, 'n') && integer(repeat.n, `${path}.repeat.n`) !== repeat.ids.length) {
        fail('REPEAT_COUNT', `${path}.repeat.n`, 'n 必须等于 ids 的长度');
      }
      if (own(repeat, 'sourceFloor') === own(repeat, 'text')) fail('REPEAT_CONTENT', `${path}.repeat`, '复读应只给 text 或 sourceFloor 其中一个');
      let text;
      if (own(repeat, 'sourceFloor')) {
        const source = requireMessage(next, repeat.sourceFloor, `${path}.repeat.sourceFloor`);
        if (source.deleted) fail('REPEAT_SOURCE_DELETED', `${path}.repeat.sourceFloor`, '已删除楼层不能被重新复读出原文');
        text = source.text;
      } else text = string(repeat.text, `${path}.repeat.text`);
      repeat.ids.forEach((author, expansionIndex) => {
        const row = { by: author, text };
        if (own(item, 'quote')) row.quote = item.quote;
        if (own(item, 'counts')) row.counts = item.counts;
        if (own(item, 'afterSeconds')) row.afterSeconds = item.afterSeconds;
        if (expansionIndex === 0) {
          if (own(item, 'floor')) row.floor = item.floor;
          if (own(item, 'at')) row.at = item.at;
        }
        createdIds.push(appendMessage(next, row, batchId, itemIndex, expansionIndex, `${path}.repeat.ids[${expansionIndex}]`));
      });
    } else if (own(item, 'delete')) {
      keys(item, ['delete'], path);
      requireMessage(next, item.delete, `${path}.delete`).deleted = true;
    } else if (own(item, 'target')) {
      keys(item, ['target', 'counts'], path);
      const message = requireMessage(next, item.target, `${path}.target`);
      if (!own(item, 'counts')) fail('COUNTS_REQUIRED', `${path}.counts`, 'target 操作需要 counts');
      updateCounts(message, item.counts, `${path}.counts`);
    } else {
      keys(item, ['by', 'text', 'quote', 'floor', 'afterSeconds', 'at', 'counts'], path);
      createdIds.push(appendMessage(next, item, batchId, itemIndex, 0, path));
    }
  });
  next.receipts[batchId] = { signature, createdIds, itemCount: batch.items.length };
  return next;
}

const publicMessage = message => {
  const result = copy(message);
  if (result.deleted) result.text = '';
  return result;
};

export function getMessages(state) {
  assertState(state);
  return Object.values(state.messages).sort((a, b) => a.floor - b.floor).map(publicMessage);
}

export function getMessage(state, floor) {
  assertState(state);
  integer(floor, 'floor', 1);
  const message = state.messages[String(floor)];
  return message ? publicMessage(message) : null;
}

export function snapshot(state) {
  assertState(state);
  return copy(state);
}
