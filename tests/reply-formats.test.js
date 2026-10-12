import test from 'node:test';
import assert from 'node:assert/strict';
import * as yaml from 'yaml';
import {Window} from 'happy-dom';
import {configureReplyFormats,readReplyBlock} from '../reply-formats.js';
import {inspectMessage,readerErrorText} from '../reader.js';
import {parseDisplayEnvelope} from '../reader-core.js';
import {mountMessageVisual} from '../message-ui.js';
import {executeAction} from '../actions.js';
import {legacyFixture} from './fixtures/legacy-yaml-reply.cjs';
import {richFixture} from './fixtures/journey-r4.cjs';

configureReplyFormats({yaml});
const read=(text,format='yaml')=>readReplyBlock({blocks:{task:text},attrs:{task:{format}}},'task');

test('submitted nine-block YAML/JSON shape restores hearts, audit, title and actions without exposing private fields',()=>{
 const source=legacyFixture(),before=source,data=inspectMessage(source);
 assert.equal(data.body.value.trim(),'门外响起了敲门声。\n队友递来行程表，两人约定二十分钟后下楼。');
 assert.equal(data.details.value.taskHeart.items.length,2);assert.equal(data.details.value.nextHeart.items.length,2);
 assert.equal(data.details.value.audit.length,7);assert.equal(data.details.value.taskHeart.items[0].mood,null);
 assert.deepEqual(data.actions.value.map(x=>x.text),['询问集合时间','查看行程表','确认准备事项','整理衣物后下楼']);
 const title=readReplyBlock(parseDisplayEnvelope(source),'title');assert.equal(title.text,'门口的通知');assert.equal(title.time,'2001-10-12 08:30');
 assert.equal(data.journey.error,'TISYA_JOURNEY_MEMORY_UNSUPPORTED');
 assert.doesNotMatch(JSON.stringify(data),/PRIVATE_|mvu-json-patch|operations|倒计时/);assert.equal(source,before);
});

test('YAML scalars preserve null, false, zero, literal text, multiline strings, containers and own keys',()=>{
 const result=read('zero: 0\noff: false\nempty: []\nmap: {}\nnone: null\nliteral: "null"\ndate: 2001-10-12\ntext: |-\n  first: colon\n  第二行\n__proto__: 安全文字');
 assert.equal(result.zero,0);assert.equal(result.off,false);assert.equal(result.none,null);assert.equal(result.literal,'null');
 assert.equal(result.date,'2001-10-12');assert.equal(result.text,'first: colon\n第二行');assert.deepEqual(result.empty,[]);
 assert.equal(Object.getPrototypeOf(result),null);assert.equal(result.__proto__,'安全文字');assert.equal({}.polluted,undefined);
 assert.equal(Object.keys(result.map).length,0);
});

test('YAML rejects duplicate keys, aliases, custom tags, directives, extra documents, nonfinite values and deep nesting',()=>{
 for(const text of ['name: 一\nname: 二','name: &x [one]\nother: *x','name: !!str value','name: !unknown value','%YAML 1.1\n---\nname: yes','name: one\n---\nname: two','name: .nan','name: .inf','? [one, two]\n: value','name: '+ '['.repeat(66)+'0'+']'.repeat(66)]){
  assert.throws(()=>read(text),{code:/^TISYA_READER_TASK_YAML_/},text);
 }
 assert.throws(()=>read('- one\n- two'),{code:'TISYA_READER_TASK_OBJECT'});
 assert.throws(()=>read('null'),{code:'TISYA_READER_TASK_OBJECT'});
});

test('declared formats control parsing and errors identify the block without echoing its private input',()=>{
 assert.throws(()=>read('name: PRIVATE_INVALID','json'),{code:'TISYA_READER_TASK_JSON_SYNTAX'});
 assert.throws(()=>read('{"name":"one","name":"two"}','json'),{code:'TISYA_READER_TASK_JSON_SYNTAX'});
 assert.throws(()=>read('name: one','toml'),{code:'TISYA_READER_TASK_FORMAT'});
 const bad=legacyFixture().replace('heart:\n  status: 有内容','heart:\n  status: [PRIVATE_INVALID');
 const data=inspectMessage(bad);assert.equal(data.details.error,'TISYA_READER_TASK_YAML_SYNTAX');
 assert.equal(data.actions.value.length,4);assert.ok(data.body.value);assert.doesNotMatch(JSON.stringify(data),/PRIVATE_INVALID/);
 assert.match(readerErrorText(data.details.error),/本轮任务区块/);
});

test('missing host YAML does not fall back to JSON or alter modern pipe replies',()=>{
 configureReplyFormats({});
 try{
  const legacy=inspectMessage(legacyFixture());assert.equal(legacy.details.error,'TISYA_READER_TASK_YAML_UNAVAILABLE');assert.equal(legacy.actions.error,'TISYA_READER_NEXT_YAML_UNAVAILABLE');
  assert.ok(legacy.body.value);assert.equal(inspectMessage(richFixture()).actions.value.length,4);
  assert.match(readerErrorText(legacy.details.error),/更新并完全重启/);
 }finally{configureReplyFormats({yaml});}
});

test('legacy JSON and current pipes retain existing display values and field ownership',()=>{
 let source=legacyFixture();const envelope=parseDisplayEnvelope(source);
 for(const block of ['task','title','next']){const value=readReplyBlock(envelope,block);source=source.replace(new RegExp(`<${block}([^>]*)>[\\s\\S]*?<\\/${block}>`),(_,attrs)=>`<${block}${attrs.replace('yaml','json')}>${JSON.stringify(value)}</${block}>`);}
 const data=inspectMessage(source);assert.equal(data.details.value.audit.length,7);assert.equal(data.actions.value.length,4);assert.doesNotMatch(JSON.stringify(data),/PRIVATE_/);
 const modern=inspectMessage(richFixture());assert.ok(modern.details.value);assert.ok(modern.journey.value);assert.equal(modern.actions.value.length,4);
});

test('message UI mounts legacy hearts and actions; click writes a draft, remount keeps state and never changes the reply',async()=>{
 const w=new Window(),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};
 d.body.innerHTML='<textarea id="send_textarea"></textarea><div id="fixture"></div>';
 const node=d.querySelector('#fixture'),source=legacyFixture(),options={source,name:'测试',formatBody:s=>s,getMotion:()=>false,onChooseAction:(text,mode)=>executeAction({document:d,text,mode,validate(){},send(){throw Error('unexpected send');}})};
 let ui=mountMessageVisual(d,node,options),root=ui.host.shadowRoot;
 assert.equal(root.querySelector('h1').textContent,'门口的通知');assert.equal(root.querySelectorAll('.heart-host').length,2);assert.equal(root.querySelectorAll('.audit-bead').length,7);assert.equal(root.querySelectorAll('.action').length,4);
 assert.doesNotMatch(root.innerHTML,/PRIVATE_|mvu-json-patch|JSON_SYNTAX/);
 root.querySelector('.action').click();await w.happyDOM.whenAsyncComplete();assert.equal(d.querySelector('textarea').value,'询问集合时间');
 root.querySelector('#next-toggle').click();root.querySelector('#next-content .audit-ledger').open=true;const state=ui.capture();ui.dispose();
 ui=mountMessageVisual(d,node,options);ui.restore(state);root=ui.host.shadowRoot;assert.equal(root.querySelector('#next-content .audit-ledger').open,true);
 assert.equal(source,legacyFixture());ui.dispose();await w.happyDOM.abort();
});

test('table reference and discovery task rows are recognized without breaking public reader',()=>{
 const source=richFixture().replace('</task>','引用：北门、铜钥匙\n新发现：事实|规则|门锁规则|铜钥匙打开北门\n</task>');
 const envelope=parseDisplayEnvelope(source);assert.deepEqual(envelope.wire.tableReferences,['北门','铜钥匙']);assert.equal(envelope.wire.tableDiscoveries[0].name,'门锁规则');const data=inspectMessage(source);assert.ok(data.body.value);assert.ok(data.details.value);assert.equal(data.actions.value.length,4);
});
