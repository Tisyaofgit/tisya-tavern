import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSimpleSheet, parseSimpleSheet, renderModelMaterial, simpleSheetInstructions, SimpleSheetError } from '../tables/simple-sheet.js';

function roundtrip(value, options) {
  const text = formatSimpleSheet(value, options);
  assert.deepStrictEqual(parseSimpleSheet(text, options), value);
  return text;
}
function rejects(text, pattern = /简表格式错误/) { assert.throws(() => parseSimpleSheet(text), pattern); }

test('nested ACL, condition trees and arbitrary arrays use child tables, never JSON containers in cells', () => {
  const value = { format: 'proposal/2', acl: { public: false, allow: ['甲', '乙'] },
    condition: { op: 'all', args: [{ field: 'hp', op: 'gte', value: 0 }, { op: 'not', arg: { equals: null } }] },
    expected: { previous: 0, missing: undefined }, patches: [{ path: ['x', 0], value: [{ mixed: [false, null, {}, []] }] }] };
  const text = roundtrip(value);
  assert.match(text, /〈对象〉子表/); assert.match(text, /〈列表〉子表/);
  assert.doesNotMatch(text, /\{"|\[\{/);
});

test('all primitive types, empty values and absent/undefined distinction survive', () => {
  for (const value of [null, undefined, false, true, 0, -0, 1.5, -1e100, '', '0', 'false', 'null', '[]', '{}', [], {}]) roundtrip(value);
  const value = parseSimpleSheet(formatSimpleSheet({ set: undefined, empty: '' }));
  assert.equal(Object.hasOwn(value, 'set'), true); assert.equal(Object.hasOwn(value, 'absent'), false);
});

test('empty typed containers are compact cells and prior explicit empty child tables remain readable', () => {
  const text = roundtrip({ a: {}, b: [], nil: null });
  assert.equal(text, '【结果】\n1 a：〈对象〉\n2 b：〈列表〉\n3 nil：〈空值〉');
  assert.deepEqual(parseSimpleSheet('【结果】\n1 a：〈对象〉子表1\n2 b：〈列表〉子表2\n\n【子表1】\n\n【子表2】'), { a: {}, b: [] });
});

test('text preserves leading/trailing spaces, LF blank lines, indentation, CR, tabs and controls', () => {
  const samples = [' a ', '\n', '\n\n', '  a\n\n b \n', 'x\r\ny\r', '\tcode\n\t line', '\u0000\u001f\u007f', '\\n', '〈多行〉', '〈文本〉', '【结果】\n1 name：fake', '```\n```'];
  for (const text of samples) roundtrip({ text });
  const parsed = parseSimpleSheet('【结果】\n1 text：〈多行〉\n  \n    code \n  \n');
  assert.equal(parsed.text, '\n  code \n');
});

test('arbitrary safe keys including empty, spaces, colons, slashes and control characters roundtrip', () => {
  roundtrip({ '': '', ' a ': 'x', '：': 'v', '\\：': 'v', 'x\ny\r\tz': true, '【子表1】': 0, 'a:b': 1, '🙃': 2 });
});

test('explicit escaped text decodes only documented escapes and plain backslashes stay literal', () => {
  assert.equal(parseSimpleSheet('【结果·值】\n1 值：〈转义文本〉a\\n\\r\\t\\u0000\\\\'), 'a\n\r\t\u0000\\');
  assert.equal(parseSimpleSheet('【结果·值】\n1 值：a\\n'), 'a\\n');
  rejects('【结果】\n1 a：〈转义文本〉\\q');
  rejects('【结果】\n1 a：〈转义文本〉\\u12');
  rejects('【结果】\n1 a：〈转义文本〉last\\');
});

test('text JSON, wrappers, malformed cells and row structures fail without fallback', () => {
  for (const text of ['{"x":1}', '[]', '说明\n【结果】', '【结果】\n1 a:1', '【结果】\n2 a：x', '【结果】\n1 a：x\n1 b：y',
    '【结果】\n1 a：〈布尔〉False', '【结果】\n1 a：〈数值〉NaN', '【结果】\n1 a：〈数值〉01', '【结果】\n1 a：〈数值〉1e999',
    '【结果】\n1 a：〈unknown〉', '【结果】\n1 a：〈多行〉', '【结果】\n  orphan', '【结果·值】', '【结果·列表】\n1 foo：x']) rejects(text);
});

test('duplicate, missing, orphaned, shared and cyclic groups fail atomically', () => {
  for (const text of ['【结果】\n1 a：x\n2 a：y', '【结果】\n【结果】', '【结果】\n1 a：〈对象〉子表1',
    '【结果】\n【子表1】', '【结果】\n1 a：〈对象〉子表1\n2 b：〈对象〉子表1\n【子表1】',
    '【结果】\n1 a：〈对象〉子表1\n【子表1】\n1 b：〈对象〉子表1', '【子表1】\n【结果】', '【结果】\n【结果·列表】']) rejects(text);
});

test('prototype keys are forbidden at all levels without touching prototypes', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    rejects(`【结果】\n1 ${key}：x`, /原型/);
    const value = Object.create(null); value[key] = 'x';
    assert.throws(() => formatSimpleSheet(value), /原型/);
  }
  rejects('【结果】\n1 \\u005f_proto__：x', /原型/);
  assert.equal({}.polluted, undefined);
});

test('unsupported JS values, sparse arrays, accessors and object graphs fail visibly', () => {
  const cyclic = {}; cyclic.self = cyclic;
  const sparse = new Array(2);
  const accessor = {}; Object.defineProperty(accessor, 'x', { enumerable: true, get() { throw new Error('must not invoke'); } });
  const nonEnumerable = {}; Object.defineProperty(nonEnumerable, 'x', { value: 1 });
  const extraArray = []; extraArray.named = 1;
  for (const value of [NaN, Infinity, 1n, Symbol('x'), () => {}, new Date(), new Map(), new Set(), cyclic, sparse, accessor, nonEnumerable, extraArray, { [Symbol('x')]: 1 }]) {
    assert.throws(() => formatSimpleSheet(value), SimpleSheetError);
  }
});

test('shared domain data expands by value into distinct child tables; only ancestor cycles fail', () => {
  const acl = { scope: 'private', subjects: ['甲'] };
  const value = { ops: [{ access: acl }, { access: acl }] };
  const text = roundtrip(value);
  const parsed = parseSimpleSheet(text);
  assert.notEqual(parsed.ops[0].access, parsed.ops[1].access);
  assert.deepEqual(parsed.ops[0].access, acl);
  assert.throws(() => formatSimpleSheet(value, { maxNodes: 5 }), /字段数量/);
});

test('depth, nodes, groups and text budgets are enforced for parser and formatter', () => {
  const value = { a: { b: { c: 1 } } };
  const text = formatSimpleSheet(value);
  for (const options of [{ maxDepth: 2 }, { maxNodes: 2 }, { maxGroups: 2 }, { maxChars: 10 }]) {
    assert.throws(() => formatSimpleSheet(value, options), SimpleSheetError);
    assert.throws(() => parseSimpleSheet(text, options), SimpleSheetError);
  }
  for (const option of [{ maxDepth: 0 }, { maxNodes: NaN }, { maxChars: '10' }]) assert.throws(() => parseSimpleSheet('【结果】', option), SimpleSheetError);
  assert.throws(() => formatSimpleSheet(new Array(100000000), { maxNodes: 10 }), /字段数量/);
});

test('plain fences and CRLF transport are supported without altering escaped data', () => {
  const text = formatSimpleSheet({ x: 'a\r\nb' });
  assert.deepEqual(parseSimpleSheet('```text\n' + text + '\n```'), { x: 'a\r\nb' });
  assert.deepEqual(parseSimpleSheet(text.replaceAll('\n', '\r\n')), { x: 'a\r\nb' });
  rejects('```json\n{}\n```');
  rejects('【结果】\r1 a：x');
});

test('material uses the same grammar and instructions contain runnable nested example', () => {
  const value = { a: [0, false] };
  assert.equal(renderModelMaterial(value), formatSimpleSheet(value));
  const instructions = simpleSheetInstructions();
  assert.deepEqual(parseSimpleSheet(instructions.slice(instructions.indexOf('例：\n') + 3)), { 标题: '示例', 已完成: false, 内容: [{ 名称: '甲', 数量: 0 }] });
});

test('bounded deterministic mixed tree corpus roundtrips without JSON serialization', () => {
  let seed = 173; const next = n => { seed = (seed * 16807) % 2147483647; return seed % n; };
  const scalars = ['', false, true, null, undefined, 0, -0, 1.2, '\n \n', '〈数值〉0', 'a\rb', '\\', '：'];
  function value(depth) {
    if (!depth || next(3) === 0) return scalars[next(scalars.length)];
    const count = next(5);
    if (next(2)) return Array.from({ length: count }, () => value(depth - 1));
    return Object.fromEntries(Array.from({ length: count }, (_, i) => [`${i}：\n\\`, value(depth - 1)]));
  }
  for (let i = 0; i < 200; i += 1) roundtrip(value(4));
});
