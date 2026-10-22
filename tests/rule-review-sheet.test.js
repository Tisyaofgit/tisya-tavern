import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRuleReviewSheet,ruleReviewSheetInstructions,formatRuleReviewSheet} from '../tables/rule-review-sheet.js';
import {validateRuleReview} from '../tables/rule-review.js';

const source={fingerprint:'current-card',runtimeSources:[],sources:[{id:'book.0',kind:'definition',text:'旧规则第一行\n旧规则第二行\n未涉及的内容'}]};
const text=`【校对】
1 问题数量：1
【问题／1】
1 问题标题：规则冲突
2 问题说明：前后口径不一致
3 原文引用数：1
4 优化方案数：1
【问题／1／原文／1】
1 来源：book.0
2 起始行：1
3 结束行：2
【问题／1／方案／1】
1 方案名称：保留前项
2 修改理由：减少冲突
3 代价与取舍：后项改为例外
4 改动数量：1
【问题／1／方案／1／改动／1】
1 来源：book.0
2 起始行：1
3 结束行：2
4 修改后：新规则第一行
  新规则第二行`;
test('simple grouped rules review converts into existing validator contract without model JSON',()=>{
 const proposal=parseRuleReviewSheet(text),review=validateRuleReview(proposal,source);
 assert.equal(proposal.format,'tisya.rule-review-proposal/2');assert.equal(review.issues[0].id,'issue-1');assert.equal(review.issues[0].options[0].id,'option-1');
 assert.equal(review.issues[0].options[0].changes[0].before,'旧规则第一行\n旧规则第二行');assert.equal(review.issues[0].options[0].changes[0].after,'新规则第一行\n新规则第二行');assert.equal(review.decisions['issue-1'],undefined);
});
test('colon is optional and zero issues is an explicit empty list',()=>{
 assert.deepEqual(parseRuleReviewSheet('【校对】\n1 问题数量 0'),{format:'tisya.rule-review-proposal/2',issues:[]});
 assert.equal(parseRuleReviewSheet(text.replaceAll('：',' ')).issues.length,1);
 assert.deepEqual(parseRuleReviewSheet('```text\n【校对】\n1 问题数量：0\n```').issues,[]);
});
test('continuations preserve literal heading/row text, punctuation and indented content',()=>{
 const raw=text.replace('新规则第一行\n  新规则第二行','0 false null []；甲、乙 | \\ 引号"\n  【问题／99】\n  1 来源：这是原文\n    原有两个空格\n  ');
 assert.equal(parseRuleReviewSheet(raw).issues[0].options[0].changes[0].after,'0 false null []；甲、乙 | \\ 引号"\n【问题／99】\n1 来源：这是原文\n  原有两个空格\n');
});
test('block-style text roundtrip preserves leading/trailing whitespace and empty lines exactly',()=>{
 const proposal=parseRuleReviewSheet(text);proposal.issues[0].options[0].changes[0].after='\n  前导空格\t\n\n尾部空格  \n';
 const raw=formatRuleReviewSheet(proposal),parsed=parseRuleReviewSheet(raw);assert.deepEqual(parsed,proposal);assert.equal(parsed.issues[0].options[0].changes[0].after,proposal.issues[0].options[0].changes[0].after);
 const inline=text.replace('4 修改后：新规则第一行\n  新规则第二行','4 修改后：   缩进保留  ');assert.equal(parseRuleReviewSheet(inline).issues[0].options[0].changes[0].after,'  缩进保留  ');
});
test('zero alternatives remains empty, not a made-up optimization',()=>{
 const raw=text.slice(0,text.indexOf('【问题／1／方案／1】')).replace('4 优化方案数：1','4 优化方案数：0');
 const review=validateRuleReview(parseRuleReviewSheet(raw),source);assert.deepEqual(review.issues[0].options,[]);
});
test('missing fields, duplicates, unknown labels and mismatched counts are visible failures',()=>{
 for(const raw of [text.replace('2 问题说明：前后口径不一致\n',''),text+'\n【校对】\n1 问题数量：0',text.replace('2 问题说明','2 问题原因'),text.replace('1 问题数量：1','1 问题数量：0'),text.replace('4 改动数量：1','4 改动数量：2'),text.replace('2 起始行：1','2 起始行：1\n2 起始行：1')])assert.throws(()=>parseRuleReviewSheet(raw));
});
test('negative, nonnumeric, oversized and zero-required counts cannot trigger partial results',()=>{
 for(const value of ['-1','false','null','[]','201','1.2','01',''])assert.throws(()=>parseRuleReviewSheet('【校对】\n1 问题数量：'+value));
 assert.throws(()=>parseRuleReviewSheet(text.replace('3 原文引用数：1','3 原文引用数：0')));
 assert.throws(()=>parseRuleReviewSheet(text.replace('4 优化方案数：1','4 优化方案数：7')));
});
test('original validator still rejects invalid sources, outside scope and overlapping changes',()=>{
 assert.throws(()=>validateRuleReview(parseRuleReviewSheet(text.replaceAll('book.0','missing')),source));
 assert.throws(()=>validateRuleReview(parseRuleReviewSheet(text.replace('3 结束行：2','3 结束行：1')),source));
 const repeated=text.replace('4 改动数量：1','4 改动数量：2')+'\n'+text.slice(text.indexOf('【问题／1／方案／1／改动／1】')).replace('改动／1','改动／2');
 assert.throws(()=>validateRuleReview(parseRuleReviewSheet(repeated),source),/同一段原文/);
});
test('JSON object wrapping and prose cannot masquerade as simple sheet data',()=>{
 assert.throws(()=>parseRuleReviewSheet(JSON.stringify({issues:[]})));
 assert.throws(()=>parseRuleReviewSheet('结论：没有问题\n【校对】\n1 问题数量：0'));
 assert.throws(()=>parseRuleReviewSheet('【校对】\n1 问题数量：{"issues":[]}'));
});
test('the model format gives actual syntax without historical design commentary',()=>{
 const instructions=ruleReviewSheetInstructions();assert.doesNotMatch(instructions,/新增扩展|现有极简表/);assert.match(instructions,/不输出 JSON/);assert.match(instructions,/两个半角空格/);assert.doesNotMatch(instructions,/只返回严格 JSON/);
});
