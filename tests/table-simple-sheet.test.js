import test from 'node:test';
import assert from 'node:assert/strict';
import {TABLE_MODES} from '../tables/modes.js';
import {tableTaskExamples} from '../tables/task-sheet.js';
import {parseSimpleSheet,formatSimpleSheet} from '../tables/simple-sheet.js';
import {parseTableTaskResponse} from '../tables/service.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {defaultRegistry} from '../tables/schema.js';
import {prepareCommit} from '../tables/ledger.js';

test('all eleven table presets use their actual sheet contract without a conflicting JSON delivery instruction',()=>{
 const configuration={data:emptyConfig(),world:defaultWorld()};
 const options=[{}, {archiveProposal:true}, {nativeBridge:{enabled:true,writer:'native-mvu',nativeOwned:false,archiveAlready:false}}, {nativeBridge:{enabled:true,writer:'native-mvu',nativeOwned:true,archiveAlready:true}}];
 for(const task of Object.keys(TABLE_MODES))for(const option of task==='tableArchive'?options:[{}]){
  const preset=pairedPreset({task,configuration,...option}),text=taskMessages({preset,task,input:{userInput:'原话保持 {"quoted":false}',registry:{tables:[],types:[]},currentRows:[],repair:{nameConflicts:[],editableIds:[]}}}).map(m=>m.content).join('\n');
  assert.match(text,/简表/,task);assert.doesNotMatch(text,/Return one strict JSON|return JSON only|Return JSON only|返回严格 JSON|只返回严格 JSON|最终只返回严格 JSON|任务 JSON 对象|selected JSON artifact|final JSON/i,task);
  assert.match(text,/原话保持 \{"quoted":false\}/,'User quotation must not be rewritten as a protocol migration');
  if(task==='ruleReview')assert.match(text,/【校对】/);else assert.match(text,/【结果】/);
 }
});

test('every task variant example round-trips through the production response parser and never accepts a JSON-string fallback',()=>{
 for(const task of Object.keys(TABLE_MODES).filter(task=>task!=='ruleReview'))for(const option of task==='tableArchive'?[{},{archiveProposal:true}]:[{}])for(const {variant,value} of tableTaskExamples(task,option)){
  const text=formatSimpleSheet(value);assert.deepEqual(parseTableTaskResponse(task,text),value,task+' '+variant);
  assert.deepEqual(parseTableTaskResponse(task,{choices:[{message:{content:text}}]}),value);
  assert.throws(()=>parseTableTaskResponse(task,JSON.stringify(value)),/简表/);
 }
 assert.deepEqual(parseTableTaskResponse('ruleReview','【校对】\n1 问题数量：0'),{format:'tisya.rule-review-proposal/2',issues:[]});
});

test('proposal wire preserves absent fields, zero false empty text null and private ACL without adding defaults',()=>{
 const value={changes:[{id:'new:r',table:'custom',expected:0,values:{zero:0,off:false,empty:'',none:null,list:[],map:{},textNull:'null',multiline:'  首行\n末行  '},access:{readers:[],knowers:['person-a']},evidence:'原句'}],pending:[]};
 const parsed=parseTableTaskResponse('tableArchive',formatSimpleSheet(value));assert.deepEqual(parsed,value);assert(!Object.hasOwn(parsed.changes[0].values,'missing'));
 assert.throws(()=>parseTableTaskResponse('tableArchive','【结果】\n1 changes：〈列表〉不存在'),/简表/);
 assert.throws(()=>parseTableTaskResponse('tableArchive',formatSimpleSheet([])),/根须为对象/);
 assert.deepEqual(parseSimpleSheet(formatSimpleSheet({n:-0})),{n:-0});
});

test('preference examples preserve global boolean and singleton chat list, with original scope type validation unchanged',()=>{
 const samples=tableTaskExamples('preferenceAnalysis'),view={registry:defaultRegistry(),rows:[],last:null},options={source:null,kind:'preferences',evidence:'逐字连续来源原句',allowedTables:['preferences']};
 assert.equal(samples[0].value.changes[0].values.作用域.全局,true);
 const chat=parseTableTaskResponse('preferenceAnalysis',formatSimpleSheet(samples[1].value));assert.deepEqual(chat.changes[0].values.作用域.会话,['STATE.preferenceContext.chatId 的原值']);
 for(const sample of samples){const candidate=parseTableTaskResponse('preferenceAnalysis',formatSimpleSheet(sample.value));assert.equal(candidate.changes[0].values.性质,'明确要求');assert.equal(candidate.changes[0].values.证据,candidate.changes[0].evidence);assert.doesNotThrow(()=>prepareCommit(view,candidate,options));}
 const bad=structuredClone(chat);bad.changes[0].values.作用域.会话=bad.changes[0].values.作用域.会话[0];assert.throws(()=>prepareCommit(view,bad,options),/作用域.会话.*texts/);
 const preset=pairedPreset({task:'preferenceAnalysis',configuration:{data:emptyConfig(),world:defaultWorld()}}),text=Object.values(preset.entries).join('\n');assert.match(text,/texts\/refs\/array 均填列表/);assert.match(text,/用户角色、角色卡、世界、会话均为文本列表/);assert.match(text,/不因示例或缺省扩大为全局/);
});
