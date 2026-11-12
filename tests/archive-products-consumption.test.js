import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORLD_RULES} from '../tables/progression-prompt.js';
import {archiveInstructions} from '../tables/prompts.js';

test('progression consumes both formal archive projections with current state precedence',()=>{
  assert.match(WORLD_RULES,/memory_archive/);
  assert.match(WORLD_RULES,/memory_summary/);
  assert.match(WORLD_RULES,/current STATE rows are present truth/);
  assert.match(WORLD_RULES,/Read current STATE first, then recent formal archive, then older archive/);
  assert.match(WORLD_RULES,/stable ID in basis/);
});

test('phone compact prompt uses formal archive without widening character knowledge',()=>{
  const fixed=readFileSync(new URL('../PHONE-PROMPT.txt',import.meta.url),'utf8');
  const core=readFileSync(new URL('../phone-core.mjs',import.meta.url),'utf8');
  for(const text of [fixed,core]){
    assert.match(text,/memory_archive/);
    assert.match(text,/memory_summary/);
    assert.match(text,/current_state\/cells/);
    assert.match(text,/当前状态 > 近期正式归档 > 较早正式归档/);
    assert.match(text,/读者或作者能看到归档，不等于角色知道/);
  }
});

test('archive task writes reusable facts and per-character cognition instead of a second current-state copy',()=>{
  const text=archiveInstructions(false);
  assert.match(text,/事件的客观经过只落一次/);
  assert.match(text,/观察、听闻、推测、误信、心理与后来修正/);
  assert.match(text,/当前即时状态仍由状态\/cells业务表持有/);
  assert.match(text,/memory_archive（近期）\/memory_summary（较早）/);
  assert.match(text,/不是依赖本轮模型自己写过的总结/);
});
