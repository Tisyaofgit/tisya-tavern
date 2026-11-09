import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPhonePayload, findPhoneMarkers, stripPhonePayload } from '../phone-protocol.mjs';

const payload = extra => ({ requestId: 'round-01', acks: [], blocks: [], ...extra });
const phone = value => `<phone>${JSON.stringify(value)}</phone>`;
const envelope = value => `<extra>${phone(value)}</extra>`;
const rejects = (fn, code) => assert.throws(fn, error => error.code === `PHONE_PROTOCOL_${code}`);

test('no transport returns null and leaves the source untouched', () => {
  for (const raw of ['', '普通正文', '<extra><summary>未更新手机</summary></extra>']) {
    assert.equal(extractPhonePayload(raw), null);
    assert.equal(stripPhonePayload(raw), raw);
  }
});

test('one extra supports other children and all supported payload fields', () => {
  const value = payload({ accounts: { reader: { name: '读者' } }, documents: [], markers: [
    { id: '首页_01', thread: 'forum-main' },
    { id: 'floor-9', thread: 'forum-main', floor: 9 },
    { id: '微博', thread: 'weibo-main', itemId: 'p-1' }
  ] });
  const raw = `正文 [[手机:首页_01]]\n<extra><summary>保持原字节</summary>\n${phone(value)}\n<other>内容</other></extra>`;
  assert.deepEqual(extractPhonePayload(raw), value);
  assert.equal(stripPhonePayload(raw), '正文 [[手机:首页_01]]\n<extra><summary>保持原字节</summary>\n\n<other>内容</other></extra>');
});

test('JSON strings containing closing tags, braces, slashes and backticks are data', () => {
  const value = payload({ blocks: [{ text: '字面 </phone> 与 </extra>；{"x":"\\\""}；反引号 `；[[手机:例]]', nested: ['<phone>', '<extra>'] }] });
  const raw = `开始\n${envelope(value)}\n结束和反引号 \``;
  assert.deepEqual(extractPhonePayload(raw), value);
  assert.equal(stripPhonePayload(raw), '开始\n<extra></extra>\n结束和反引号 `');
});

test('fenced examples are ignored while an active payload is extracted', () => {
  const example = envelope(payload({ requestId: 'example' }));
  const actual = payload({ requestId: 'actual' });
  const fenced = `说明\n\`\`\`html\n${example}\n\`\`\`\n`;
  assert.equal(extractPhonePayload(fenced), null);
  assert.deepEqual(extractPhonePayload(fenced + envelope(actual)), actual);
  assert.equal(stripPhonePayload(fenced + envelope(actual)), fenced + '<extra></extra>');
  assert.equal(extractPhonePayload(`~~~txt\n${example}\n~~~`), null);
  assert.equal(extractPhonePayload(`\`\`\`\n${example}`), null);
});

test('invalid JSON and incomplete transport never strip content', () => {
  for (const raw of [
    '<extra><phone>{"requestId":"r",}</phone></extra>',
    '<extra><phone>{"requestId":"r" "blocks":[]}</phone></extra>',
    '<extra><phone>{"requestId":"r}</phone></extra>',
    '<extra><phone>[{"requestId":"r"}]</phone></extra>',
    '<extra><phone>{"requestId":"r","blocks":[}</phone></extra>'
  ]) {
    rejects(() => extractPhonePayload(raw), 'JSON');
    rejects(() => stripPhonePayload(raw), 'JSON');
  }
  rejects(() => extractPhonePayload('<extra><phone>{"requestId":"r"}garbage</phone></extra>'), 'PHONE_CLOSE');
  rejects(() => extractPhonePayload('<extra><phone>{"requestId":"r"}</extra>'), 'PHONE_CLOSE');
});

test('duplicate phone, extra ambiguity and misplaced blocks are rejected', () => {
  const item = phone(payload());
  rejects(() => extractPhonePayload(`<extra>${item}${item}</extra>`), 'DUPLICATE_PHONE');
  rejects(() => extractPhonePayload(`<extra>${item}</extra><extra><summary>x</summary></extra>`), 'EXTRA');
  rejects(() => extractPhonePayload(`<extra><extra>${item}</extra></extra>`), 'EXTRA');
  rejects(() => extractPhonePayload(`<extra>${item}`), 'EXTRA');
  rejects(() => extractPhonePayload(`${item}<extra></extra>`), 'LOCATION');
  rejects(() => extractPhonePayload(`<extra></extra>${item}`), 'LOCATION');
  rejects(() => extractPhonePayload('<extra></phone></extra>'), 'PHONE_CLOSE');
});

test('standalone import is explicit, one object only, and validated identically', () => {
  const value = payload({ markers: [{ id: '卡1', thread: 'thread' }] });
  const raw = JSON.stringify(value);
  assert.equal(extractPhonePayload(raw), null);
  assert.deepEqual(extractPhonePayload(` \n${raw}\n `, { allowStandalone: true }), value);
  assert.equal(stripPhonePayload(raw), raw);
  rejects(() => extractPhonePayload(`${raw}${raw}`, { allowStandalone: true }), 'JSON');
  rejects(() => extractPhonePayload('{bad}', { allowStandalone: true }), 'JSON');
  rejects(() => extractPhonePayload('{}', { allowStandalone: true }), 'REQUEST_ID');
});

test('top-level keys and field shapes are enforced without revalidating the suite', () => {
  rejects(() => extractPhonePayload(envelope(payload({ surprise: 1 }))), 'KEY');
  for (const requestId of ['', '  ', null, 4]) {
    rejects(() => extractPhonePayload(envelope(payload({ requestId }))), 'REQUEST_ID');
  }
  for (const [key, value] of [['blocks', {}], ['documents', {}], ['markers', null], ['accounts', []]]) {
    rejects(() => extractPhonePayload(envelope(payload({ [key]: value }))), 'SHAPE');
  }
  const shallow = payload({ blocks: [{ type: 'checked-by-suite-later', anything: true }] });
  assert.deepEqual(extractPhonePayload(envelope(shallow)), shallow);
});

test('acks are nonempty, exact and unique strings', () => {
  for (const acks of [{}, ['e', 'e'], [''], [' '], [1], [null]]) {
    rejects(() => extractPhonePayload(envelope(payload({ acks }))), 'ACKS');
  }
  assert.deepEqual(extractPhonePayload(envelope(payload({ acks: ['a', 'b'] }))).acks, ['a', 'b']);
});

test('dangerous prototype keys are rejected at every depth including escaped and shadowed keys', () => {
  for (const key of ['__proto__', 'prototype', 'constructor']) {
    const raw = `<extra><phone>{"requestId":"r","blocks":[{"nested":{"${key}":1}}]}</phone></extra>`;
    rejects(() => extractPhonePayload(raw), 'UNSAFE_KEY');
    rejects(() => stripPhonePayload(raw), 'UNSAFE_KEY');
  }
  rejects(() => extractPhonePayload('<extra><phone>{"requestId":"r","blocks":[{"\\u005f_proto__":{}}]}</phone></extra>'), 'UNSAFE_KEY');
  rejects(() => extractPhonePayload('{"requestId":"r","blocks":[{"same":{"prototype":1},"same":{}}]}', { allowStandalone: true }), 'UNSAFE_KEY');
  assert.equal({}.polluted, undefined);
});

test('marker schema enforces unique valid ids and one optional target', () => {
  const bad = [
    [{ id: 'bad.id', thread: 't' }], [{ id: 'é', thread: 't' }],
    [{ id: '', thread: 't' }], [{ id: 'a', thread: '' }],
    [{ id: 'a', thread: 't', floor: 0 }], [{ id: 'a', thread: 't', floor: 1.5 }],
    [{ id: 'a', thread: 't', floor: Number.MAX_SAFE_INTEGER + 1 }],
    [{ id: 'a', thread: 't', itemId: '' }],
    [{ id: 'a', thread: 't', floor: 1, itemId: 'i' }],
    [{ id: 'a', thread: 't', extra: true }],
    [{ id: 'a', thread: 't' }, { id: 'a', thread: 'other' }],
    ['a']
  ];
  for (const markers of bad) rejects(() => extractPhonePayload(envelope(payload({ markers }))), 'MARKERS');
});

test('body markers expose exact offsets and ignore invalid ids', () => {
  const text = '😀前 [[手机:楼_1]] 中 [[手机:abc-2]] 后 [[手机:bad.id]] [[手机:有 空格]]';
  const found = findPhoneMarkers(text);
  assert.deepEqual(found.map(row => row.id), ['楼_1', 'abc-2']);
  for (const row of found) assert.equal(text.slice(row.start, row.end), `[[手机:${row.id}]]`);
  assert.equal(found[0].start, text.indexOf('[[手机:楼_1]]'));
});

test('markers skip fenced and inline code with matching delimiter lengths', () => {
  const text = [
    '外 [[手机:外一]] `[[手机:单]]` 和 ``字 ` [[手机:双]]``',
    '```html', '[[手机:围栏]]', '```',
    '~~~', '[[手机:波浪]]', '~~~',
    '[[手机:外二]]'
  ].join('\n');
  assert.deepEqual(findPhoneMarkers(text).map(row => row.id), ['外一', '外二']);
  assert.deepEqual(findPhoneMarkers('未闭合 ` 仍是正文 [[手机:保留]]').map(row => row.id), ['保留']);
  assert.deepEqual(findPhoneMarkers('``单个 ` 不闭合 [[手机:保留]]').map(row => row.id), ['保留']);
});

test('fence closing must match the opening length, character and line', () => {
  const text = '````html\n```\n[[手机:藏]]\n````\n[[手机:显]]';
  assert.deepEqual(findPhoneMarkers(text).map(row => row.id), ['显']);
  const crlf = '  ~~~txt\r\n[[手机:藏]]\r\n  ~~~\r\n[[手机:显]]';
  assert.deepEqual(findPhoneMarkers(crlf).map(row => row.id), ['显']);
});

test('input and option errors use protocol error codes', () => {
  rejects(() => extractPhonePayload(null), 'INPUT');
  rejects(() => findPhoneMarkers({}), 'INPUT');
  rejects(() => stripPhonePayload([]), 'INPUT');
  rejects(() => extractPhonePayload('', { allowStandalone: 'yes' }), 'OPTIONS');
});
