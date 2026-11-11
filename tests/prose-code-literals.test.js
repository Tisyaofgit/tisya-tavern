import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {formatProse} from '../prose.js';

// These assertions observe what reaches the host Markdown formatter. The
// typography prepass must preserve code bytes and leave Markdown ownership there.
function setup(){
 const window=new Window(),document=window.document;
 const prepared=source=>{let value,calls=0;formatProse(document,source,text=>{value=text;calls++;return '<p>host output</p>';});assert.equal(calls,1);return value;};
 return {window,document,prepared};
}

test('four-space, tab and mixed indentation preserve literal HTML and unclosed marks exactly',async()=>{
 const {window,prepared}=setup();try{
  for(const prefix of ['    ','\t','  \t','        ']){
   const source=prefix+'<b title="〔信笺〕">代码 &amp; 标记〔内心〕\r\n'+prefix+'第二行\t保持原样\r\n';
   assert.equal(prepared(source),source,prefix);
  }
 }finally{await window.happyDOM.abort();}
});

test('indented chunks survive blank lines and end at the next unindented paragraph',async()=>{
 const {window,prepared}=setup();try{
  const code='    〔信笺〕未闭合示例\n\n\t<div>〔内心〕另一个示例</div>\n',source='前一个段落。\n\n'+code+'〔信笺〕这是真正正文〔/信笺〕',value=prepared(source);
  assert.ok(value.includes(code));assert.match(value,/data-tisya-mark="信笺"/);assert.equal((value.match(/data-tisya-mark=/g)??[]).length,1);assert.match(value,/这是真正正文/);
 }finally{await window.happyDOM.abort();}
});

test('indentation cannot turn a paragraph continuation into a code block',async()=>{
 const {window,document,prepared}=setup();try{
  for(const prefix of ['    ','\t','  \t']){
   const source='段落首行。\n'+prefix+'〔信笺〕续行仍应美化〔/信笺〕',value=prepared(source);
   assert.match(value,/data-tisya-mark="信笺"/);assert.doesNotMatch(value,/〔信笺〕/);
   assert.throws(()=>formatProse(document,'段落首行。\n'+prefix+'〔信笺〕确实未闭合',x=>x),/TISYA_MARK_UNCLOSED/);
  }
 }finally{await window.happyDOM.abort();}
});

test('fences allow up to three leading spaces while a four-space fence line is indented code',async()=>{
 const {window,prepared}=setup();try{
  for(const prefix of ['',' ','   ']){
   const source=prefix+'```text\n〔信笺〕围栏中的未闭合标记\n'+prefix+'```\n';assert.equal(prepared(source),source);
  }
  const source='    ```html\n〔信笺〕未缩进的下一行是正文〔/信笺〕',value=prepared(source);
  assert.ok(value.startsWith('    ```html\n'));assert.match(value,/data-tisya-mark="信笺"/);
 }finally{await window.happyDOM.abort();}
});

test('headings and thematic breaks can be followed immediately by indented code',async()=>{
 const {window,prepared}=setup();try{
  for(const previous of ['# 标题\n','标题\n---\n','***\n']){
   const source=previous+'    〔信笺〕代码示例\n';assert.equal(prepared(source),source);
  }
 }finally{await window.happyDOM.abort();}
});

test('list indentation belongs to the item before it can count toward code indentation',async()=>{
 const {window,prepared}=setup();try{
  for(const source of ['  - 列表首段。\n\n    〔信笺〕列表续段〔/信笺〕','1.  列表首段。\n\n    〔信笺〕列表续段〔/信笺〕'])assert.match(prepared(source),/data-tisya-mark="信笺"/);
  const source='- 列表首段。\n\n      〔信笺〕列表代码示例\n';assert.equal(prepared(source),source);
 }finally{await window.happyDOM.abort();}
});
