// Phone transport is data inside one <extra>; it never executes model text.
const TOP_KEYS = new Set(['requestId', 'acks', 'blocks', 'accounts', 'documents', 'markers']);
const MARKER_KEYS = new Set(['id', 'thread', 'floor', 'itemId']);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MARKER_ID = /^[\p{Script=Han}A-Za-z0-9_-]+$/u;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function fail(suffix, message, path = '') {
  const error = new Error(message);
  error.code = `PHONE_PROTOCOL_${suffix}`;
  if (path) error.path = path;
  throw error;
}

function inputText(value) {
  if (typeof value !== 'string') fail('INPUT', '手机协议原文必须是字符串');
  return value;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Common Markdown fences and equal-length backtick spans. Positions are JS UTF-16
// offsets, the same offsets returned by RegExp and String.slice.
function codeMask(text, includeInline = true) {
  const mask = new Uint8Array(text.length);
  const fences = [];
  let active = null;
  for (let start = 0; start < text.length;) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline + 1;
    const line = text.slice(start, newline < 0 ? end : newline).replace(/\r$/, '');
    if (active) {
      const close = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
      if (close && close[1][0] === active.char && close[1].length >= active.length) {
        fences.push([active.start, end]);
        active = null;
      }
    } else {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
        active = { start, char: open[1][0], length: open[1].length };
      }
    }
    start = end;
  }
  if (active) fences.push([active.start, text.length]);
  for (const [start, end] of fences) mask.fill(1, start, end);
  if (!includeInline) return mask;

  // Pair backtick runs with the next equally long run, without repeatedly
  // searching the remainder for unmatched opening delimiters.
  const segments = [];
  let cursor = 0;
  for (const [start, end] of fences) {
    if (cursor < start) segments.push([cursor, start]);
    cursor = end;
  }
  if (cursor < text.length) segments.push([cursor, text.length]);
  for (const [start, end] of segments) {
    const runs = [];
    for (let i = start; i < end;) {
      if (text[i] !== '`') { i += 1; continue; }
      const runStart = i;
      while (i < end && text[i] === '`') i += 1;
      runs.push({ start: runStart, end: i, length: i - runStart, next: -1 });
    }
    const nextByLength = new Map();
    for (let i = runs.length - 1; i >= 0; i -= 1) {
      const run = runs[i];
      run.next = nextByLength.has(run.length) ? nextByLength.get(run.length) : -1;
      nextByLength.set(run.length, i);
    }
    for (let i = 0; i < runs.length;) {
      const run = runs[i];
      if (run.next < 0) { i += 1; continue; }
      mask.fill(1, run.start, runs[run.next].end);
      i = run.next + 1;
    }
  }
  return mask;
}

function rejectDangerousKeys(value) {
  const queue = [{ value, path: '$' }];
  while (queue.length) {
    const row = queue.pop();
    if (row.value === null || typeof row.value !== 'object') continue;
    for (const key of Object.keys(row.value)) {
      const path = `${row.path}.${key}`;
      if (DANGEROUS_KEYS.has(key)) fail('UNSAFE_KEY', '手机协议含危险属性名', path);
      queue.push({ value: row.value[key], path });
    }
  }
}

function validatePayload(payload) {
  if (!object(payload)) fail('OBJECT', '手机协议顶层必须是对象');
  rejectDangerousKeys(payload);
  for (const key of Object.keys(payload)) {
    if (!TOP_KEYS.has(key)) fail('KEY', `手机协议不接受字段 ${key}`, `$.${key}`);
  }
  if (!nonempty(payload.requestId)) fail('REQUEST_ID', 'requestId 必须是非空字符串', '$.requestId');
  if (own(payload, 'acks')) {
    if (!Array.isArray(payload.acks) || payload.acks.some(value => !nonempty(value)) || new Set(payload.acks).size !== payload.acks.length) {
      fail('ACKS', 'acks 必须是无重复的非空字符串数组', '$.acks');
    }
  }
  for (const key of ['blocks', 'documents', 'markers']) {
    if (own(payload, key) && !Array.isArray(payload[key])) fail('SHAPE', `${key} 必须是数组`, `$.${key}`);
  }
  if (own(payload, 'accounts') && !object(payload.accounts)) fail('SHAPE', 'accounts 必须是账号对象', '$.accounts');
  const seen = new Set();
  for (const [index, marker] of (payload.markers || []).entries()) {
    const path = `$.markers[${index}]`;
    if (!object(marker)) fail('MARKERS', '微页面标记必须是对象', path);
    if (Object.keys(marker).some(key => !MARKER_KEYS.has(key))) fail('MARKERS', '微页面标记含未知字段', path);
    if (typeof marker.id !== 'string' || !MARKER_ID.test(marker.id) || seen.has(marker.id)) {
      fail('MARKERS', '标记 id 必须唯一，且仅含汉字、ASCII 字母数字、下划线或连字符', `${path}.id`);
    }
    seen.add(marker.id);
    if (!nonempty(marker.thread)) fail('MARKERS', '标记 thread 必须是非空字符串', `${path}.thread`);
    if (own(marker, 'floor') && (!Number.isSafeInteger(marker.floor) || marker.floor < 1)) {
      fail('MARKERS', '标记 floor 必须是正安全整数', `${path}.floor`);
    }
    if (own(marker, 'itemId') && !nonempty(marker.itemId)) fail('MARKERS', '标记 itemId 必须是非空字符串', `${path}.itemId`);
    if (own(marker, 'floor') && own(marker, 'itemId')) fail('MARKERS', '标记不能同时指定 floor 和 itemId', path);
  }
  return payload;
}

function parseJson(source) {
  let payload;
  try { payload = JSON.parse(source); }
  catch { fail('JSON', '手机协议 JSON 无效'); }
  return validatePayload(payload);
}

// Scan JSON before looking for closing HTML-like tags. A quoted </phone> or
// </extra> is ordinary data, including when a quote is escaped.
function balancedJsonEnd(text, start) {
  if (text[start] !== '{') fail('JSON', '<phone> 内必须是 JSON 对象');
  const stack = [];
  let quoted = false;
  let escaped = false;
  let stringStart = -1;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char !== '"') continue;
      quoted = false;
      let next = i + 1;
      while (/\s/.test(text[next] || '') && next < text.length) next += 1;
      if (text[next] === ':') {
        let key;
        try { key = JSON.parse(text.slice(stringStart, i + 1)); }
        catch { fail('JSON', '手机协议 JSON 字符串无效'); }
        if (DANGEROUS_KEYS.has(key)) fail('UNSAFE_KEY', '手机协议含危险属性名');
      }
      continue;
    }
    if (char === '"') { quoted = true; stringStart = i; continue; }
    if (char === '{' || char === '[') { stack.push(char); continue; }
    if (char === '}' || char === ']') {
      if (stack.pop() !== (char === '}' ? '{' : '[')) fail('JSON', '手机协议 JSON 括号不匹配');
      if (!stack.length) return i + 1;
    }
  }
  fail('JSON', '手机协议 JSON 未完整闭合');
}

function locatePayload(raw, allowStandalone = false) {
  const text = inputText(raw);
  const trimmed = text.trim();
  if (allowStandalone && trimmed.startsWith('{')) {
    const offset = text.indexOf('{');
    const end = balancedJsonEnd(text, offset);
    if (text.slice(end).trim()) fail('JSON', '预览导入只接受一个完整 JSON 对象');
    return { payload: parseJson(text.slice(offset, end)), standalone: true, start: offset, end };
  }
  const mask = codeMask(text, false);
  const extras = [];
  const stack = [];
  const phones = [];
  let unmatchedExtra = false;
  let unmatchedPhone = false;
  const tagPattern = /<(\/?)(extra|phone)\s*>/iy;
  const closePattern = /<\/phone\s*>/iy;
  for (let i = 0; i < text.length;) {
    if (mask[i] || text[i] !== '<') { i += 1; continue; }
    tagPattern.lastIndex = i;
    const tag = tagPattern.exec(text);
    if (!tag) { i += 1; continue; }
    const closing = Boolean(tag[1]);
    const name = tag[2].toLowerCase();
    const tagEnd = i + tag[0].length;
    if (name === 'extra') {
      if (closing) {
        const extra = stack.pop();
        if (!extra) unmatchedExtra = true;
        else { extra.closeStart = i; extra.end = tagEnd; }
      } else {
        const extra = { start: i, openEnd: tagEnd, closeStart: -1, end: -1 };
        extras.push(extra);
        stack.push(extra);
      }
      i = tagEnd;
      continue;
    }
    if (closing) { unmatchedPhone = true; i = tagEnd; continue; }
    let jsonStart = tagEnd;
    while (jsonStart < text.length && /\s/.test(text[jsonStart])) jsonStart += 1;
    const jsonEnd = balancedJsonEnd(text, jsonStart);
    const payload = parseJson(text.slice(jsonStart, jsonEnd));
    let closeStart = jsonEnd;
    while (closeStart < text.length && /\s/.test(text[closeStart])) closeStart += 1;
    closePattern.lastIndex = closeStart;
    const close = closePattern.exec(text);
    if (!close) fail('PHONE_CLOSE', '手机协议缺少紧随 JSON 的 </phone>');
    const end = closeStart + close[0].length;
    phones.push({ payload, start: i, end, owner: stack.length === 1 ? stack[0] : null });
    i = end;
  }
  if (!phones.length) {
    if (unmatchedPhone) fail('PHONE_CLOSE', '出现了没有起始标签的 </phone>');
    return null;
  }
  if (phones.length !== 1 || unmatchedPhone) fail('DUPLICATE_PHONE', '每轮只允许一个手机协议块');
  if (extras.length !== 1 || unmatchedExtra || stack.length || extras[0].end < 0) {
    fail('EXTRA', '手机协议必须位于唯一且完整闭合的 <extra> 内');
  }
  const phone = phones[0];
  if (phone.owner !== extras[0] || phone.start < extras[0].openEnd || phone.end > extras[0].closeStart) {
    fail('LOCATION', '<phone> 必须位于 <extra> 内');
  }
  return phone;
}

export function extractPhonePayload(raw, { allowStandalone = false } = {}) {
  if (typeof allowStandalone !== 'boolean') fail('OPTIONS', 'allowStandalone 必须是布尔值');
  return locatePayload(raw, allowStandalone)?.payload ?? null;
}

export function findPhoneMarkers(body) {
  const text = inputText(body);
  const mask = codeMask(text);
  const result = [];
  const pattern = /\[\[手机:([^\]\r\n]+)\]\]/g;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!MARKER_ID.test(match[1])) continue;
    let code = false;
    for (let i = start; i < end; i += 1) { if (mask[i]) { code = true; break; } }
    if (!code) result.push({ id: match[1], start, end });
  }
  return result;
}

export function stripPhonePayload(raw) {
  const found = locatePayload(raw);
  return found ? raw.slice(0, found.start) + raw.slice(found.end) : raw;
}
