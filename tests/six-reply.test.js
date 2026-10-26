import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseV3Reply,parseV3Envelope,runV3Display} from '../six/reply.mjs';
import {inspectMessage,readerErrorText} from '../reader.js';
import {readReplyDetails} from '../reply-details.js';
import {readWorldExtra} from '../world-extra.js';
import {revisionBody,revisionParagraphs} from '../revision.js';
import {compileNarrative,registerLivePreset} from '../narrative-bridge.js';
import {sixEntries,fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
import {buildMessages} from '../config/host.js';
import {fullReply} from './fixtures/six-reply.js';
const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-Six-Blocks-1.json',import.meta.url)));
const source={prompts:preset.prompts,order:preset.prompt_order[1].order};
const blocks=['before','title','body','after','extra','actions'];
test('six-block structure stays fixed; row whitespace is harmless and source remains exact',()=>{
 const source=fullReply.replace('用户偏好|','  用户偏好 |').replace('本轮变化|','\t本轮变化 |');
 const e=parseV3Reply(source);assert.deepEqual(e.order,blocks);assert.equal(e.before[0].kind,'用户偏好');assert.equal(e.source,source);
 assert.equal(readReplyDetails(source).rounds.error,false);assert.match(revisionBody(source),/宋遥/);assert.equal(revisionParagraphs(source).length,2);
 assert.ok(readWorldExtra(source).length);assert.match(runV3Display({source}).body,/铜铃/);
});
test('bad auxiliary row identifies phase/line without hiding successful prose or accepting bad data',()=>{
 const bad=fullReply.replace('用户偏好|把承诺落在一个能回应的邀请上','用户偏好|多了一列|坏');
 assert.throws(()=>parseV3Reply(bad),{code:'TISYA_V3_REPLY_BEFORE_LINE_2_COLUMNS'});
 const inspected=inspectMessage(bad);assert.match(inspected.body.value,/铜铃/);assert.equal(inspected.details.error,'TISYA_V3_REPLY_BEFORE_LINE_2_COLUMNS');assert.ok(inspected.body.count.value>0);
 assert.match(readerErrorText(inspected.details.error),/开头摘要第 2 行字段列数/);assert.match(runV3Display({source:bad}).body,/铜铃/);
 assert.throws(()=>parseV3Reply(fullReply.replace('用户偏好|','Preference|')),{code:'TISYA_V3_REPLY_BEFORE_LINE_2_LABEL'});
});
test('missing, duplicate or reordered blocks remain actual format errors; no decoder fallback',()=>{
 for(const bad of [fullReply.replace('<extra>','<wrong>'),fullReply.replace(/<title>[\s\S]*?<\/title>/,''),fullReply.replace('</reply>','<extra/></reply>')])assert.throws(()=>parseV3Reply(bad));
 assert.equal(inspectMessage(fullReply.replace('</reply>','')).body.error,'TISYA_V3_REPLY_INCOMPLETE');
});
test('latest preset keeps six blocks across switches and has no fictitious archive execution',()=>{
 for(const summary of [true,false])for(const actions of [true,false]){
  const config=fullDefaultConfiguration();Object.assign(config.world.modes.narrative,{summary,actions});
  const compiled=sixEntries(config,DEFAULT_MOODS),s=compiled.tisya_registry;
  assert.match(s,/<think phase="before">/);assert.match(s,/<think phase="after">/);assert.match(s,/<extra>/);assert.match(s,actions?/<actions min=/:/<actions\/>/);
  assert.doesNotMatch(compiled.tisya_inner_chain,/host retains this complete numbered body|preflight result has already been applied|independent preflight archives/);
  assert.doesNotMatch(s,/<(?:status|vars|memory|archive)\b/);
 }
 const output=sixEntries(fullDefaultConfiguration(),DEFAULT_MOODS,{structured:false});assert.doesNotMatch(output.tisya_registry,/<reply>/);
});
test('locked authoritative skeleton and compiler agree on all tag boundaries',()=>{
 const lock=fs.readFileSync(new URL('../six/format-lock.txt',import.meta.url),'utf8');
 const tags=s=>s.match(/<\/?(?:reply|think|title|body|extra|actions)\b[^>]*>/g).map(t=>t.replace(/\d+/g,'N'));
 const actual=sixEntries(fullDefaultConfiguration(),DEFAULT_MOODS).tisya_registry;const skeleton=actual.slice(actual.indexOf('<reply>'),actual.indexOf('</reply>')+8);
 assert.deepEqual(tags(skeleton),tags(lock));
 assert.deepEqual(parseV3Envelope(fullReply).order,blocks);
});
test('every row in the shipped template can be decoded without a template/parser mismatch',()=>{
 const registry=sixEntries(fullDefaultConfiguration(),DEFAULT_MOODS).tisya_registry;
 let sample=registry.slice(registry.indexOf('<reply>'),registry.indexOf('</reply>')+8)
  .replace(/\[One mood per cell: [^\n]+\]\n?/,'')
  .replace(/\{文风\/世界观[^}]+\}/,'文风')
  .replace(/\{交流\/调查[^}]+\}/g,'交流')
  .replace(/<body([^>]*)>[\s\S]*?<\/body>/,'<body$1>1 铜铃落在布上。\n\n2 宋遥抬起头。</body>')
  .replace(/\{[^}]+\}/g,'有依据的公开结果');
 const action=/交流\|有依据的公开结果\|有依据的公开结果/.exec(sample)[0];
 sample=sample.replace(action,Array(4).fill(action).join('\n'));
 const e=parseV3Reply(sample);assert.equal(e.before.length,13);assert.equal(e.after.length,15);assert.equal(e.actions.length,4);
});
test('native single-generation bridge expands new entries and keeps original host data route',()=>{
 const config=fullDefaultConfiguration();
 const result=compileNarrative({},source,DEFAULT_MOODS,config);
 assert.match(result.rest.entries.six_tisya_inner_chain,/Followed dynamics/);
 assert.match(result.rest.entries.six_tisya_registry,/<think phase="before">/);
 assert.equal(result.taskMode,false);
 assert.doesNotMatch(fs.readFileSync(new URL('../six/preset.mjs',import.meta.url),'utf8'),/import .*host-runtime|import .*host-service/);
});
