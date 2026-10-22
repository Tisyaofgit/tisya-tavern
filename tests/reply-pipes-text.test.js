import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './fixtures/journey-r4.cjs';
import {escapePipeText,decodeEscapedPipeBlock,normalizeEscapedPipes} from '../reply-pipes-text.js';
import {formatSimpleSheet} from '../tables/simple-sheet.js';
import {parseDisplayEnvelope,validateMemoryLocators,validateMemoryProjection,xmlTokens} from '../reader-core.js';
import {readJourney} from '../reply-records.js';
const fresh=options=>fixture(options).replaceAll('format="pipes"','format="pipes" text="escaped"');
const cells=value=>formatSimpleSheet(value).replace('【结果】','【单元格】');
const memory=source=>JSON.parse(parseDisplayEnvelope(source).blocks.memory);

test('new text version round-trips escaped pipe, newline, slash, literal tokens and quotes without JSON strings',()=>{
 for(const value of ['甲|乙','第一行\n第二行','引号"与反斜杠\\','[]','~','〈文本〉原文','甲、乙','&<tag>']){
  const encoded='〈文本〉'+escapePipeText(value).replaceAll('&','&amp;').replaceAll('<','&lt;');
  const source=fresh({memory:'事件：甲|A|'+encoded});
  assert.equal(memory(source).事件[0].梗概,value);
  assert.equal(readJourney(source).memories.length,1);
 }
 const names=fresh({memory:'事件：甲\\、乙、丙|A|见面'});
 assert.deepEqual(memory(names).事件[0].参与者,['甲、乙','丙']);
});

test('legacy backslashes and quoted JSON cells retain their original interpretation',()=>{
 assert.equal(memory(fixture({memory:String.raw`事件：甲|A|字面\n不换行`})).事件[0].梗概,String.raw`字面\n不换行`);
 assert.equal(memory(fixture({memory:'事件：甲|A|'+JSON.stringify('甲|乙\n丙')})).事件[0].梗概,'甲|乙\n丙');
 assert.throws(()=>parseDisplayEnvelope(fixture({memory:String.raw`事件：甲|A|甲\|乙`})),{code:'TISYA_PIPES_COLUMNS'});
});

test('flat scene endpoints and typed scalar values retain null, removal, false and numeric zero',()=>{
 const source=fresh({status:'叙事状态：甲|A|计数|〈数值〉0|〈布尔〉false\n叙事状态：甲|A|旧物|有|~',memory:'事件：甲|A|停下\n场景：~|入夜|~|门口|~\n变动：甲|文字数字|0|false|A\n变动：甲|未知值|~|〈空值〉|A'}),e=parseDisplayEnvelope(source),m=JSON.parse(e.blocks.memory),s=JSON.parse(e.blocks.status);
 assert.deepEqual(m.事件[0].时间,{起:'入夜',止:null});assert.equal(s.叙事状态.甲.计数.旧值,0);assert.equal(s.叙事状态.甲.计数.新值,false);assert.equal(s.叙事状态.甲.旧物.删除,true);
 assert.equal(m.事件[0].设定变动[0].旧值,'0');assert.equal(m.事件[0].设定变动[0].新值,'false');assert.equal(m.事件[0].设定变动[1].新值,null);
});

test('complex sheets pass through existing state, scoped ACL and locator validators',()=>{
 const permission=['C',['叙事组织','记录整理'],[],['甲']],nested={清单:['物品',{数量:0,启用:false}],空:null};
 const source=fresh({status:'原生状态：角色|甲|背包|〈格〉1\n'+cells({'1':nested}),extra:'<面板><内容>现状</内容></面板>',memory:'权限：status|角色、甲、背包|〈格〉1\n权限：extra|面板、内容|A\n事件：甲|C|整理背包\n'+cells({'1':permission})});
 const e=parseDisplayEnvelope(source),m=JSON.parse(e.blocks.memory);assert.deepEqual(JSON.parse(e.blocks.status).角色.甲.背包,nested);assert.deepEqual(m.权限[0].权限,permission);validateMemoryProjection(m,{body:e.blocks.body});validateMemoryLocators(m,e.blocks);
 assert.throws(()=>{const e=parseDisplayEnvelope(source.replace('角色、甲、背包','角色、甲、不存在'));validateMemoryLocators(JSON.parse(e.blocks.memory),e.blocks);},/ACL_UNRESOLVED/);
 assert.throws(()=>parseDisplayEnvelope(fresh({memory:'事件：甲|〈格〉1|见面\n'+cells({'1':['A',true,[],[]]})})),/PERMISSION/);
});

test('invalid/missing/duplicate/orphan cell references fail rather than guessing types or grants',()=>{
 for(const body of ['事件：甲|A|〈格〉1','事件：甲|A|甲\n'+cells({'1':'unused'}),'事件：〈格〉1|A|〈格〉1\n'+cells({'1':['甲']}),'事件：〈格〉1|A|摘要\n'+cells({'1':false}),'事件：甲|A|错误\\q','事件：甲|[A,[],[],[]]|摘要'])assert.throws(()=>decodeEscapedPipeBlock('memory',body));
 assert.throws(()=>decodeEscapedPipeBlock('status','叙事状态：甲|A|值|~|〈格〉1\n'+cells({'1':undefined})),/MISSING_VALUE/);
});

test('conversion is read-only and idempotent while native vars/extra remain exact',()=>{
 const source=fresh({memory:'事件：甲|A|见面',extra:'<面板><内容>原文\\n</内容></面板>'}),before=source,converted=normalizeEscapedPipes(source,xmlTokens);
 assert.equal(source,before);assert.equal(normalizeEscapedPipes(converted,xmlTokens),converted);assert.match(converted,/<extra><面板><内容>原文\\n<\/内容><\/面板><\/extra>/);assert.match(converted,/<vars\/>/);
 assert.throws(()=>parseDisplayEnvelope(source.replace('事件：甲|A|见面','事件：甲|A|<nested/>')),/NESTED_BLOCK/);
});
