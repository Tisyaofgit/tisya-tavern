/**
 * Shared model-facing simple sheets. This extends compact-v2's group/row/field
 * style with explicit scalar types and child tables; it is not JSON in a cell.
 * Storage and domain validation stay separate from this lossless wire codec.
 */
const DEFAULT_LIMITS = Object.freeze({ maxDepth: 64, maxNodes: 20000, maxChars: 2000000, maxGroups: 10000 });
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
export class SimpleSheetError extends Error {
  constructor(message) { super(`简表格式错误：${message}`); this.name = 'SimpleSheetError'; this.code = 'SIMPLE_SHEET_INVALID'; }
}
function fail(message) { throw new SimpleSheetError(message); }
function limits(options = {}) {
  const result = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(result)) {
    if (options[key] === undefined) continue;
    if (!Number.isSafeInteger(options[key]) || options[key] < 1) fail(`${key} 必须为正整数`);
    result[key] = options[key];
  }
  return result;
}
function checkKey(key) { if (FORBIDDEN_KEYS.has(key)) fail(`禁止原型字段 ${key}`); }
function escapeText(value, key = false) {
  return value.replace(key ? /[\\：\x00-\x1f\x7f]/g : /[\\\x00-\x1f\x7f]/g, char => {
    if (char === '\\') return '\\\\';
    if (char === '：') return '\\：';
    if (char === '\n') return '\\n';
    if (char === '\r') return '\\r';
    if (char === '\t') return '\\t';
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}
function unescapeText(value, key = false) {
  let result = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== '\\') { result += char; continue; }
    const next = value[++i];
    if (next === '\\') result += '\\';
    else if (next === 'n') result += '\n';
    else if (next === 'r') result += '\r';
    else if (next === 't') result += '\t';
    else if (next === '：' && key) result += '：';
    else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(value.slice(i + 1, i + 5))) {
      result += String.fromCharCode(parseInt(value.slice(i + 1, i + 5), 16)); i += 4;
    } else fail('不支持或未完成的反斜线转义');
  }
  return result;
}
function splitField(text) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text[i] === '：') return [unescapeText(text.slice(0, i), true), text.slice(i + 1)];
  }
  fail('字段缺少全角冒号');
}
function scalar(value) {
  if (value === undefined) return '〈缺失〉';
  if (value === null) return '〈空值〉';
  if (typeof value === 'boolean') return `〈布尔〉${value}`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('数值必须有限');
    return `〈数值〉${Object.is(value, -0) ? '-0' : value}`;
  }
  if (typeof value !== 'string') fail(`不支持 ${typeof value} 值`);
  if (/[\x00-\x09\x0b-\x1f\x7f]/.test(value)) return `〈转义文本〉${escapeText(value)}`;
  if (value.includes('\n')) return `〈多行〉\n${value.split('\n').map(line => `  ${line}`).join('\n')}`;
  return value.startsWith('〈') ? `〈文本〉${value}` : value;
}
function entries(value) {
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail('仅支持普通对象和列表');
  if (Object.getOwnPropertySymbols(value).length) fail('不支持 Symbol 字段');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (array) {
    for (let i = 0; i < value.length; i += 1) if (!Object.hasOwn(descriptors, String(i))) fail('列表不能有空洞；请显式填缺失');
    if (Object.keys(descriptors).some(key => key !== 'length' && (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) fail('列表不能附加命名字段');
  }
  const keys = array ? Array.from({ length: value.length }, (_, i) => String(i)) : Object.keys(descriptors);
  return keys.map(key => {
    checkKey(key);
    const desc = descriptors[key];
    if (!Object.hasOwn(desc, 'value') || !desc.enumerable) fail('不支持 getter、setter 或非枚举字段');
    return [array ? '项' : key, desc.value];
  });
}

export function formatSimpleSheet(value, options = {}) {
  const budget = limits(options), groups = [], ancestors = new WeakSet();
  let nodes = 0, childId = 0, chars = 0;
  function account(text) {
    chars += text.length + 1;
    if (chars > budget.maxChars + 1) fail('超过文本长度限制');
  }
  function group(data, name, depth, primitive = false) {
    if (depth > budget.maxDepth) fail('超过嵌套深度限制');
    if (groups.length >= budget.maxGroups) fail('超过子表数量限制');
    const lines = [`【${name}】`]; account(lines[0]); groups.push(lines);
    if (!primitive) {
      if (ancestors.has(data)) fail('不支持循环对象引用');
      ancestors.add(data);
    }
    if (Array.isArray(data) && data.length > budget.maxNodes - nodes) fail('超过字段数量限制');
    const rows = primitive ? [['值', data]] : entries(data);
    for (const [index, [key, item]] of rows.entries()) {
      nodes += 1;
      if (nodes > budget.maxNodes) fail('超过字段数量限制');
      let cell;
      if (item !== null && typeof item === 'object') {
        const kind = Array.isArray(item) ? '列表' : '对象';
        // Empty typed containers need no child table, but still validate their
        // JS shape so Date, accessors or hidden fields cannot silently vanish.
        if ((Array.isArray(item) ? item.length : Object.keys(item).length) === 0) {
          entries(item); cell = `〈${kind}〉`;
        } else {
          const childName = `子表${++childId}`;
          cell = `〈${kind}〉${childName}`;
          group(item, childName, depth + 1);
        }
      } else {
        if (typeof item === 'string' && item.length > budget.maxChars) fail('超过文本长度限制');
        cell = scalar(item);
      }
      if (cell.length > budget.maxChars || key.length > budget.maxChars) fail('超过文本长度限制');
      const line = `${index + 1} ${escapeText(key, true)}：${cell}`;
      account(line); lines.push(line);
    }
    if (!primitive) ancestors.delete(data);
  }
  const container = value !== null && typeof value === 'object';
  group(value, Array.isArray(value) ? '结果·列表' : container ? '结果' : '结果·值', 1, !container);
  const text = groups.map(lines => lines.join('\n')).join('\n\n');
  if (text.length > budget.maxChars) fail('超过文本长度限制');
  return text;
}

export function parseSimpleSheet(raw, options = {}) {
  const budget = limits(options);
  if (typeof raw !== 'string') fail('模型简表必须是文本');
  if (raw.length > budget.maxChars) fail('超过文本长度限制');
  // Physical transport newlines are LF; data containing CR must use escaped text.
  let text = raw.replace(/\r\n/g, '\n');
  if (text.includes('\r')) fail('裸 CR 必须使用转义文本');
  if (text.startsWith('```')) {
    const match = text.match(/^```(?:text|txt|plaintext)?\n([\s\S]*)\n```\s*$/);
    if (!match) fail('代码围栏不完整或类型不受支持');
    text = match[1];
  }
  const groups = new Map(); let current, previous, nodes = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('  ')) {
      if (!previous || previous.cell !== '〈多行〉') fail('续行必须跟在多行字段后');
      previous.lines.push(line.slice(2)); continue;
    }
    if (line === '') { previous = undefined; continue; }
    if (/^[\x00-\x1f\x7f]/.test(line)) fail('行首含非法控制字符');
    const heading = line.match(/^【(结果(?:·列表|·值)?|子表[1-9]\d*)】$/);
    if (heading) {
      if (groups.has(heading[1])) fail('重复分组');
      if (groups.size >= budget.maxGroups) fail('超过子表数量限制');
      current = { name: heading[1], rows: [] }; groups.set(current.name, current); previous = undefined; continue;
    }
    const row = line.match(/^([1-9]\d*) ([\s\S]*)$/);
    if (!current || !row) fail('需要分组标题或稳定行号字段');
    if (Number(row[1]) !== current.rows.length + 1) fail('行号必须从 1 连续且不可重复');
    if (++nodes > budget.maxNodes) fail('超过字段数量限制');
    const [key, cell] = splitField(row[2]); checkKey(key);
    if (/[\x00-\x1f\x7f]/.test(row[2])) fail('控制字符必须转义');
    previous = { key, cell, lines: [] }; current.rows.push(previous);
  }
  const roots = [...groups.keys()].filter(key => key.startsWith('结果'));
  if (roots.length !== 1 || groups.keys().next().value !== roots[0]) fail('必须先且仅有一个结果根表');
  const visited = new Set();
  function decodeCell(row, depth) {
    const { cell, lines } = row;
    if (cell === '〈多行〉') {
      if (!lines.length) fail('多行字段至少需要一行缩进内容');
      return lines.join('\n');
    }
    if (cell.startsWith('〈文本〉')) return cell.slice(4);
    if (cell.startsWith('〈转义文本〉')) return unescapeText(cell.slice(6));
    if (cell === '〈空值〉') return null;
    if (cell === '〈缺失〉') return undefined;
    if (cell === '〈对象〉') return {};
    if (cell === '〈列表〉') return [];
    if (cell.startsWith('〈数值〉')) {
      const numberText = cell.slice(4);
      if (!NUMBER.test(numberText) || !Number.isFinite(Number(numberText))) fail('非法数值');
      return Number(numberText);
    }
    if (cell.startsWith('〈布尔〉')) {
      if (cell === '〈布尔〉true') return true;
      if (cell === '〈布尔〉false') return false;
      fail('布尔值只能是 true 或 false');
    }
    const ref = cell.match(/^〈(对象|列表)〉(子表[1-9]\d*)$/);
    if (ref) return decodeGroup(ref[2], ref[1] === '列表' ? 'array' : 'object', depth + 1);
    if (cell.startsWith('〈')) fail('未知类型标记；字面文本请加〈文本〉');
    return cell;
  }
  function decodeGroup(name, kind, depth) {
    if (depth > budget.maxDepth) fail('超过嵌套深度限制');
    if (!groups.has(name)) fail(`缺少引用分组 ${name}`);
    if (visited.has(name)) fail('循环或共享子表引用');
    visited.add(name);
    const rows = groups.get(name).rows;
    if (kind === 'value') {
      if (rows.length !== 1 || rows[0].key !== '值') fail('标量根表必须只有一行值');
      return decodeCell(rows[0], depth);
    }
    const result = kind === 'array' ? [] : {};
    for (const row of rows) {
      if (kind === 'array') {
        if (row.key !== '项') fail('列表字段名必须为项');
        result.push(decodeCell(row, depth));
      } else {
        if (Object.hasOwn(result, row.key)) fail(`重复字段 ${row.key}`);
        Object.defineProperty(result, row.key, { value: decodeCell(row, depth), enumerable: true, writable: true, configurable: true });
      }
    }
    return result;
  }
  const root = roots[0];
  const result = decodeGroup(root, root === '结果·列表' ? 'array' : root === '结果·值' ? 'value' : 'object', 1);
  if (visited.size !== groups.size) fail('存在未引用子表');
  return result;
}

export function renderModelMaterial(value, options = {}) { return formatSimpleSheet(value, options); }

export function simpleSheetInstructions() {
  return `使用分组简表填写结果，不输出 JSON、解释或省略号。根对象标题【结果】；每行依次写“1 字段名：值”，行号从1连续。全角冒号后直接写值，空格属于原文。
普通文字原样填写，0、false、null等文字不会转型；空文字保留冒号后空白。数值写〈数值〉0，布尔写〈布尔〉true或〈布尔〉false，空值写〈空值〉，明确缺失值写〈缺失〉；未提供的对象字段直接不列出。
非空对象或列表必须拆成子表：字段值写〈对象〉子表1或〈列表〉子表2，再另起【子表1】或【子表2】填写。对象使用真实字段名；列表每行字段名统一为“项”，行号表示顺序。空对象写〈对象〉，空列表写〈列表〉，不需子表。子表名子表1、子表2…唯一且只引用一次；不得缺表、重复字段或遗留未引用表。根列表标题【结果·列表】；根标量标题【结果·值】，仅一行“1 值：值”。
多行文本值写〈多行〉，下一行起原文每行前加两个空格，空白行也写两个空格；保留原缩进和首尾空行，不需引号。单行文本若以〈开头，先加〈文本〉。需要保留CR、制表符或控制字符时写〈转义文本〉，使用\\n、\\r、\\t、\\\\或\\uXXXX。普通文本中的反斜线原样保留。
字段名中的全角冒号和反斜线分别写\\：和\\\\，字段名内换行、CR、制表符写\\n、\\r、\\t；空字段名可直接留空。禁止__proto__、prototype、constructor字段。数值必须有限，不得用字符串代替要求的对象、列表、布尔或数字。
例：
【结果】
1 标题：示例
2 已完成：〈布尔〉false
3 内容：〈列表〉子表1

【子表1】
1 项：〈对象〉子表2

【子表2】
1 名称：甲
2 数量：〈数值〉0`;
}
