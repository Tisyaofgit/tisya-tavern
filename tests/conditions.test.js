import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPTURE_RULES,applyConditionTemplates,captureRule,conditionMatches,phraseMatch,tableCondition,validateCondition} from '../tables/conditions.js';

const context=(values={},extra={})=>({row:{id:'r',table:'experiences',values,access:{readers:[],knowers:['a']}},previousText:'',userText:'',selected:true,...extra});

test('bounded declarative conditions combine previous prose, current input, current values and explicit selections',()=>{
 const rule={op:'all',args:[{op:'any',args:[{op:'context'},{op:'text',source:'either',terms:['折角书签']}]},{op:'not',arg:{op:'eq',field:'有效性',value:'已改变'}},{op:'oneOf',field:'类别',value:['习惯','回忆']},{op:'has',field:'内容'}]};
 assert.equal(validateCondition(rule),rule);
 assert(conditionMatches(rule,context({有效性:'有效',类别:'回忆',内容:''},{previousText:'他把折角书签放回桌上。'})));
 assert(conditionMatches(rule,context({有效性:'有效',类别:'习惯',内容:'已确认'},{context:true})));
 assert(!conditionMatches(rule,context({有效性:'已改变',类别:'回忆',内容:'旧含义'},{userText:'折角书签'})));
 assert(!conditionMatches(rule,context({有效性:'有效',类别:'回忆'},{context:true})));
 for(const name of ['selected','strict','context','cue','tagged','retrieved','focused','rule']){assert(conditionMatches({op:name},context({}, {[name]:true})));assert(!conditionMatches({op:name},context({}, {[name]:'true'})));}
 assert(conditionMatches({op:'always'},context()));
});

test('text source boundaries do not turn future user wording into confirmed row values or execute script text',()=>{
 const c=context({标志:false,数:0,空:null},{previousText:'庭院的门仍旧锁着。',userText:'请让铜杯变成钥匙。',historyText:'折角书签'}),before=structuredClone(c);
 assert(!conditionMatches({op:'text',source:'previous',terms:['铜杯']},c));
 assert(conditionMatches({op:'text',source:'user',terms:['铜杯']},c));
 assert(!conditionMatches({op:'text',source:'either',terms:['折角书签']},c));
 for(const [field,value]of Object.entries(c.row.values))assert(conditionMatches({op:'eq',field,value},c));
 const code='globalThis.__tisyaConditionExecuted = true';
 assert.throws(()=>validateCondition({op:'script',code}),/未登记操作/);
 assert.throws(()=>validateCondition({op:'always',script:code}),/未登记参数/);
 assert(!conditionMatches({op:'has',field:code},c));assert.equal(globalThis.__tisyaConditionExecuted,undefined);assert.deepEqual(c,before);
});

test('registered keywords match full aliases, dialogue, motifs and shared signals without arbitrary fragment recall',()=>{
 for(const [text,label]of [['Ａｄａ turns back.','Ada'],['他说：“北门见。”','北门见'],['把折角书签夹回原处。','折角书签'],['I tap three knocks.','three knocks'],['АДА сказала: «ЗВЕЗДА»','звезда'],['请查看那份共同经历。','共同经历']])assert(phraseMatch(text,label));
 for(const [text,label]of [['Canada is distant.','Ada'],['restart the engine','star'],['我把铜杯洗净','倒转铜杯'],['звездами','звезда'],['我在门前。','门']])assert(!phraseMatch(text,label));
 const c=context({名称:'门前约定',别名:['三下轻敲'],触发线索:['北门见']},{userText:'我又敲了三下轻敲。'});
 c.cue=[c.row.values.名称,...c.row.values.别名,...c.row.values.触发线索].some(term=>phraseMatch(c.userText,term));
 assert(conditionMatches({op:'cue'},c));
});

test('conditions reject executable, malformed and excessively nested input',()=>{
 for(const node of [null,[],{}, {op:'eval',code:'1+1'},{op:'text',source:'history',terms:['旧事']},{op:'text',source:'user',terms:['x']},{op:'eq',field:'constructor',value:'x'},{op:'eq',field:'有效性'},{op:'oneOf',field:'类型',value:[]},{op:'all',args:[]},{op:'any',args:Array.from({length:21},()=>({op:'always'}))}])assert.throws(()=>validateCondition(node));
 let deep={op:'always'};for(let i=0;i<10;i++)deep={op:'not',arg:deep};assert.throws(()=>validateCondition(deep),/嵌套过深/);
});

test('recursive field templates retain declared policies, identity links and capture meaning without altering stored ACL',()=>{
 const manual={op:'text',source:'either',terms:['铜杯']},registry={tables:[{id:'experiences',fields:{名称:{type:'text'},内容:{type:'text',include:manual},锚点事件:{type:'refs'},详情:{type:'object',fields:{台词:{type:'text'},意象:{type:'texts'}}},条目:{type:'array',items:{type:'object',fields:{原文段落:{type:'texts'}}}},刻度:{type:'map',items:{type:'number',formula:{op:'count',args:[[]]}}}}},{id:'objects',fields:{名称:{type:'text'},关联:{type:'refs'}}}],types:[{id:'character',fields:{私藏:{type:'ref'},属性组:{type:'object',fields:{描述:{type:'text'}}}}}]};
 const c=context({内容:'单方联想',默契层次:'单方联想',有效性:'已改变'},{context:true}),before=structuredClone(c);
 applyConditionTemplates(registry);const fields=registry.tables[0].fields;
 assert.deepEqual(fields.内容.include,manual);assert.equal(fields.内容.capture,'meaning');assert.equal(fields.详情.fields.台词.capture,'dialogue');assert.equal(fields.详情.fields.意象.capture,'motif');assert.equal(fields.条目.items.fields.原文段落.capture,'dialogue');assert.equal(fields.刻度.items.capture,'derived');
 assert.equal(fields.锚点事件.follow,'record');assert.equal(registry.tables[1].fields.关联.follow,'identity');assert.equal(registry.types[0].fields.私藏.follow,'identity');
 assert(conditionMatches(registry.tables[0].assemble,c));assert.deepEqual(c,before);assert.deepEqual(c.row.access,{readers:[],knowers:['a']});
 const once=structuredClone(registry);applyConditionTemplates(registry);assert.deepEqual(registry,once);
 for(const name of ['dialogue','motif','meaning','knowledge','reference'])assert.equal(typeof CAPTURE_RULES[name],'string');
 assert.equal(captureRule('native_cells','值',{type:'json'}),'native');
});

test('default table conditions preserve current state and keep native values out of narrative selection',()=>{
 assert(conditionMatches(tableCondition('facts'),context()));
 assert(conditionMatches(tableCondition('state'),context({有效性:'有效'})));
 assert(!conditionMatches(tableCondition('state'),context({有效性:'失效'})));
 assert(!conditionMatches(tableCondition('native_cells'),context({}, {selected:true,strict:true,context:true})));
 assert(conditionMatches(tableCondition('objects'),context({}, {rule:true})));
 assert(!conditionMatches(tableCondition('events'),context()));
});
