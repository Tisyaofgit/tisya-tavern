import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {fixture,PUBLIC,SECRET} from './fixtures/journey-r4.cjs';
import {recordErrorFixture} from './fixtures/reply-record-error.cjs';
import {inspectMessage} from '../reader.js';
import {readPublicReplyEnvelope,readReplyBlock} from '../reply-formats.js';
import {parseDisplayEnvelope} from '../reader-core.js';
import {mountMessageVisual} from '../message-ui.js';
import {executeAction} from '../actions.js';

const P=JSON.stringify(PUBLIC),S=JSON.stringify(SECRET);
function publicControls(source){
 const data=inspectMessage(source);
 assert.equal(data.body.error,undefined);
 assert.equal(data.details.error,undefined);
 assert.equal(data.details.value.audit.length,7);
 assert.equal(data.actions.value.length,4);
 assert.equal(readReplyBlock(readPublicReplyEnvelope(source),'title').text,'入夜');
 assert.doesNotMatch(JSON.stringify(data),/PRIVATE_/);
 return data;
}

test('malformed memory permissions stay rejected without suppressing public controls or changing source',()=>{
 for(const permission of ['null','后台','[A]','{read_auth:[读者]}']){
  const source=recordErrorFixture().replace('事件：玩家|null|','事件：玩家|'+permission+'|'),before=source;
  assert.throws(()=>parseDisplayEnvelope(source),{code:'TISYA_PERMISSION_SHAPE'});
  const data=publicControls(source);
  assert.equal(data.journey.error,'TISYA_PERMISSION_SHAPE');
  assert.equal(data.details.value.rounds.pendingError,true);
  assert.equal(data.details.value.taskHeart.items.length,1);
  assert.equal(data.details.value.nextHeart.items.length,1);
  const view=readPublicReplyEnvelope(source);
  for(const name of ['memory','status','vars','extra','archive'])assert.equal(Object.hasOwn(view.blocks,name),false);
  assert.deepEqual(view.wire,{version:5});
  assert.equal(source,before);
 }
});

test('an invalid status policy does not invalidate independently authorized memory pending records',()=>{
 const source=fixture({status:'叙事状态：玩家|null|计划|~|PRIVATE_STATUS',nextExtra:'待办：剧情待处理任务|门口|查看通知',memory:[
  `未完：待处理|查看通知|玩家|门口|通知已送达|${P}`,
  `未完：待处理|PRIVATE_PENDING|玩家|门口|PRIVATE_CAUSE|${S}`,
  `事件：玩家|${P}|通知已送达`
 ].join('\n')});
 const data=publicControls(source);
 assert.equal(data.journey.error,'TISYA_PERMISSION_SHAPE');
 assert.equal(data.details.value.rounds.pendingError,false);
 assert.deepEqual(data.details.value.rounds.pending.map(row=>row.label),[]);
});

test('unknown complete permissions remain hidden and invalid paragraph references remain rejected',()=>{
 const unknown=publicControls(fixture({memory:'事件：玩家|[null,null,null,null]|来源未明的记录'}));
 assert.equal(unknown.journey.error,undefined);
 assert.equal(unknown.journey.value.memories.length,1);
 const badQuote=publicControls(fixture({memory:`事件：玩家|${P}|PRIVATE_BAD_QUOTE\n原文：段落9`}));
 assert.ok(badQuote.journey.error);
 assert.equal(badQuote.details.value.rounds.pendingError,true);
 const valid=publicControls(fixture({memory:`事件：玩家|${P}|门已打开\n原文：段落1`}));
 assert.equal(valid.journey.error,undefined);
 assert.equal(valid.journey.value.memories.length,1);
 assert.equal(valid.details.value.rounds.pendingError,false);
});

test('record isolation keeps complete XML boundaries, ordering, entity and nested-tag checks',()=>{
 const source=recordErrorFixture();
 const damaged=[
  source.replace('</memory>',''),
  source.replace('</status>','</status><status/>'),
  source.replace('<status format="pipes">','<status format="pipes"><injected/>'),
  source.replace('PRIVATE_MEMORY_CANARY','&invalid;'),
  source.replace('PRIVATE_MEMORY_CANARY','<!--填写-->'),
  source.replace('</reply>','</reply><reply/>'),
  source.replace('<vars/>','<status/>')
 ];
 for(const value of damaged){
  assert.throws(()=>readPublicReplyEnvelope(value));
  const data=inspectMessage(value);
  assert.ok(data.details.error);assert.ok(data.actions.error);
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE_/);
 }
 const wrapped='<think>PRIVATE_WRAPPER</think><output>'+source+'</output>';
 publicControls(wrapped);
});

test('mobile message UI keeps hearts, audit and draft actions while localizing the record error',async()=>{
 const win=new Window(),doc=win.document;
 win.IntersectionObserver=class{observe(){}disconnect(){}};
 const node=doc.createElement('div'),input=doc.createElement('textarea');input.id='send_textarea';input.value='已有草稿';doc.body.append(input,node);
 const source=recordErrorFixture(),calls=[];
 const options={source,name:'测试',formatBody:s=>s,getMotion:()=>false,onChooseAction:(text,mode)=>executeAction({document:doc,text,mode,validate(){calls.push('validate');},send(){throw Error('must not send');}})};
 let ui=mountMessageVisual(doc,node,options),root=ui.host.shadowRoot;
 assert.equal(root.querySelectorAll('.heart-host').length,2);
 assert.equal(root.querySelectorAll('.audit-bead').length,7);
 assert.equal(root.querySelectorAll('.action').length,4);
 assert.match(root.querySelector('.journey-reader').textContent,/TISYA_PERMISSION_SHAPE/);
 assert.doesNotMatch(root.querySelector('.action-region').textContent,/任务、心声与核验暂不可用|建议暂未接通/);
 assert.doesNotMatch(root.innerHTML,/PRIVATE_/);
 root.querySelector('.action').click();await Promise.resolve();await Promise.resolve();
 assert.equal(input.value,'已有草稿\n察看门锁');assert.equal(calls.length,2);
 root.querySelector('#next-toggle').click();const state=ui.capture();ui.dispose();
 ui=mountMessageVisual(doc,node,options);ui.restore(state);root=ui.host.shadowRoot;
 assert.equal(root.querySelector('#next-toggle').getAttribute('aria-expanded'),'true');
 assert.equal(root.querySelectorAll('.action').length,4);assert.doesNotMatch(root.innerHTML,/PRIVATE_/);
 ui.dispose();await win.happyDOM.abort();
});
