import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {moodOptions,heartRule,requireMoodNames} from '../heart-contract.js';
import {compileNarrative} from '../narrative-bridge.js';
import {inspectMessage} from '../reader.js';

test('heart prompt gives exact names as ordinary lines rather than a JSON array',()=>{
 const names=['好奇','开心'],text=heartRule(2,names);
 assert.equal(moodOptions(names),'- 好奇\n- 开心');
 assert.match(text,/原样选择一个/);assert.doesNotMatch(text,/\[|\]|"/);
 assert.deepEqual(names,['好奇','开心']);
 for(const invalid of [[],['null'],['好奇','好奇'],['好奇\n开心'],['甲|乙'],[' 好奇']])assert.throws(()=>requireMoodNames(invalid),/表情目录/);
});

test('live native preset emits the non-JSON mood list and actual heart pipe rows stay readable',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.12.json',import.meta.url))),source={prompts:p.prompts,order:p.prompt_order[0].order};
 const context={chatId:'heart',chatMetadata:{},extensionSettings:{}};
 const inner=compileNarrative(context,source,['好奇','开心']).rest.entries.tisya_inner_chain;
 assert.match(inner,/@DEFINE @OUT:=\n【结果】\n1 kind：structured/);assert.doesNotMatch(inner,/@DEFINE @OUT:=\{"kind":"structured"/);
 assert.match(inner,/mood 从以下表情名中原样选择一个/);
 assert.match(inner,/- 好奇\n- 开心/);assert.doesNotMatch(inner,/mood must be one of|\["好奇"/);
 const sample=fs.readFileSync(new URL('../examples/reply-demo.txt',import.meta.url),'utf8'),read=inspectMessage(sample);
 assert.equal(read.details.error,undefined);
 assert.equal(read.details.value.taskHeart.items[0].mood,'好奇');
 const historical=inspectMessage(sample.replace('|好奇|','|null|'));
 assert.equal(historical.details.error,undefined);assert.equal(historical.details.value.taskHeart.items[0].mood,null);
});
