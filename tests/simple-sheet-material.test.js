import test from 'node:test';
import assert from 'node:assert/strict';
import { personaDefinition, personaDraft, personaStamp } from '../tables/persona.js';
import { defaultRegistry } from '../tables/schema.js';
import { parseSimpleSheet } from '../tables/simple-sheet.js';

test('persona model definition is lossless sheet material while local stamps stay canonical JSON', () => {
  const source = { id: 'user', name: '甲', description: '  缩进\n原样 {"card":true}\n', descriptor: {} };
  const text = personaDefinition(source);
  assert.deepEqual(parseSimpleSheet(text.slice('NATIVE.USER.DEFINITION\n'.length)), { id: source.id, name: source.name, description: source.description });
  assert.equal(personaStamp(source), JSON.stringify(source));
  assert.equal(personaDefinition(null), '');
});

test('new persona draft renders complex traits as child tables while preserving the original description', () => {
  const row = { id: 'a', table: 'objects', rev: 1, values: { 名称: '甲', 类型: 'character', 描述: '原人设', 属性: { 习惯: '早起', 条件: { 开启: false, 数量: 0, 行为: ['a', 'b'] } } } };
  const draft = personaDraft(row, defaultRegistry(), { id: 'persona' });
  assert.match(draft.description, /^原人设\n习惯：早起\n条件：\n【结果】/);
  assert.deepEqual(parseSimpleSheet(draft.description.split('条件：\n')[1]), row.values.属性.条件);
});
