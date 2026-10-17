const extractionSource=body=>JSON.parse(body.messages.find(m=>m.content.startsWith('[SOURCE]\n')).content.split('\n').slice(1,-1).join('\n'));
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileConditionRule} from '../tables/condition-rules.js';

function prepared(mode,run){
 const base=mkdtempSync(join(tmpdir(),'tisya-extraction-'));
 try{
  const out=join(base,'request');
  execFileSync(process.execPath,['tools/foundation-narrative-roundtrip.mjs',mode,out,'test-model'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
  return run(JSON.parse(readFileSync(join(out,'request-context.json'),'utf8')));
 }finally{rmSync(base,{recursive:true,force:true});}
}
const source='true：方案安全已核验 → 变更：可以重新协商 = 是';
test('numeric extraction accepts the Chinese boolean shorthand advertised to the model',()=>prepared('prepare',context=>{
 const vocabulary=context.conditionVocabulary;
 const program=compileConditionRule(source,vocabulary);
 assert.equal(program.effects[0].value,true);
 assert.equal(compileConditionRule(source.replace('= 是','= 否'),vocabulary).effects[0].value,false);
 assert.throws(()=>compileConditionRule(source.replace('= 是','= 大概是'),vocabulary),/布尔值/);
 assert.equal(context.layout,'compact-v2');
 const rank=vocabulary.fields.find(f=>f.name==='伤病等级[右腕旧伤]');
 assert.equal(rank.type,'number');assert.equal(rank.min,1);assert.equal(rank.integer,true);
 assert.equal(context.body.stream,false);
 assert.deepEqual(Object.keys(context.body).sort(),['messages','model','stream']);
 assert.match(extractionSource(context.body),/连续用力时长｜单位：时辰/);
}));
test('removed legacy preparation mode is rejected rather than silently interpreted',()=>{assert.throws(()=>prepared('prepare-registered',()=>{}),/Expected prepare or replay/);});
