import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {fixture,SECRET} from './fixtures/journey-r4.cjs';
import {compactReplyFixture} from './fixtures/compact-permissions.cjs';
import {parseDisplayEnvelope,projectJourney,validateMemoryProjection,validateMemoryLocators} from '../reader-core.js';
import {inspectMessage} from '../reader.js';
import {readWorldExtra} from '../world-extra.js';
import {expandPermission} from '../reader-compat.js';
import {mountMessageVisual} from '../message-ui.js';

test('A–E, lowercase grades and permission-only ~ decode without fabricating character knowledge',()=>{
 for(const policy of ['A','B','C','D','E','a','b','c','d','e','~']){
  const source=fixture({status:`叙事状态：玩家|${policy}|位置|~|门口\n知情：玩家|K3|亲历`,memory:`关联：[玩家,队友]|${policy}\n事件：[玩家,队友]|${policy}|抵达门口\n认知：队友|对外|听闻|${policy}|灯亮着|守卫告知`}),before=source;
  const parsed=parseDisplayEnvelope(source),memory=JSON.parse(parsed.blocks.memory),view=projectJourney(source);
  assert.deepEqual(memory.事件[0].参与者,['玩家','队友']);
  assert.equal(memory.事件[0].权限[3],null);
  assert.equal(view.memories.length,['A','a','~'].includes(policy)?1:0);
  assert.equal(view.changes.length,['A','a','~'].includes(policy)?1:0);
  assert.equal(source,before);
 }
 assert.deepEqual(expandPermission(SECRET),SECRET);
 const noEmit=fixture({memory:'事件：玩家|[A,[记录整理],[],[玩家]]|PRIVATE_NOT_GRANTED'});
 assert.equal(projectJourney(noEmit).memories.length,0);
});

test('public ~ does not replace missing metadata, deletion, JSON Pointer escaping, or literal business values',()=>{
 const source=fixture({status:'叙事状态：玩家|~|旧事|已结束|~\n叙事状态：玩家|A|记号|~|"~"',memory:'事件：[]|~|已整理\n场景：~|[null,null]|~|~'}),e=parseDisplayEnvelope(source),state=JSON.parse(e.blocks.status).叙事状态.玩家,view=projectJourney(source);
 assert.equal(state.旧事.删除,true);assert.equal(Object.hasOwn(state.记号,'旧值'),false);assert.equal(state.记号.新值,'~');
 assert.deepEqual(view.memories[0].scene,{title:null,time:{start:null,end:null},places:null,world:null});
 for(const value of ['null','后台','[A]','{read_auth:[读者]}'])assert.throws(()=>parseDisplayEnvelope(fixture({memory:`事件：玩家|${value}|未知`})),{code:'TISYA_PERMISSION_SHAPE'});
 for(const list of ['[玩家,玩家]','[玩家,null]','[玩家,{}]'])assert.throws(()=>parseDisplayEnvelope(fixture({memory:`事件：${list}|A|测试`})),/TISYA_PIPES_LIST/);
});

test('compact field overrides and scoped policies keep private nested records out of public projection',()=>{
 const source=fixture({memory:'事件：[玩家,队友]|{默认:A,字段:{/认知/0/4:E}}|抵达门口\n认知：队友|对外|确认|A|PRIVATE_SECRET|当场核对\n心理：队友|E|PRIVATE_PLAN|尚未表露'});
 const view=inspectMessage(source);assert.equal(view.journey.error,undefined);assert.equal(view.journey.value.memories.length,1);assert.doesNotMatch(JSON.stringify(view),/PRIVATE_/);
});

test('supplied legacy one-cell status locator resolves only to its exact vars operation without changing the source',()=>{
 const source=compactReplyFixture(),before=source,e=parseDisplayEnvelope(source),memory=JSON.parse(e.blocks.memory);
 assert.throws(()=>validateMemoryProjection(memory,{body:e.blocks.body}),{code:'TISYA_MEMORY5_ACL_TARGET'});
 const view=inspectMessage(source);
 assert.equal(view.journey.error,undefined);assert.equal(view.details.error,undefined);assert.equal(view.details.value.rounds.pendingError,false);
 assert.equal(view.details.value.audit.length,7);assert.equal(view.details.value.taskHeart.items.length,1);assert.equal(view.details.value.nextHeart.items.length,1);assert.equal(view.actions.value.length,4);
 assert.equal(view.journey.value.diagnostics,undefined);
 assert.equal(view.journey.value.memories.length,0);assert.equal(view.journey.value.changes.length,0);
 assert.equal(readWorldExtra(source).length,2);assert.doesNotMatch(JSON.stringify(view),/PRIVATE_|TISYA_PERMISSION_SHAPE/);assert.equal(source,before);
});

test('locators validate actual operation paths and native card rows, not coincidental text',()=>{
 const check=source=>{const e=parseDisplayEnvelope(source),m=JSON.parse(e.blocks.memory);validateMemoryProjection(m,{body:e.blocks.body});validateMemoryLocators(m,e.blocks);};
 const vars=fixture({memory:'权限：vars|/世界/a~1b|A\n事件：玩家|~|登记完成'}).replace('<vars/>','<vars format="json">{"protocol":"mvu-json-patch","operations":[{"op":"replace","path":"/世界/a~1b","value":0}]}</vars>');
 check(vars);assert.throws(()=>check(vars.replace('权限：vars|/世界/a~1b','权限：vars|/世界/不存在')),{code:'TISYA_MEMORY5_ACL_UNRESOLVED'});
 const base=fixture({extra:'<starchat_app>\n[ChatRoom|观众^期待]\n</starchat_app>',memory:'权限：extra|[starchat_app,ChatRoom]|A\n事件：玩家|A|通知已送达'});check(base);
 check(base.replace('[ChatRoom|观众^期待]','<ChatRoom>期待</ChatRoom>'));
 for(const bad of ['<!-- [ChatRoom|伪字段] -->','<other>[ChatRoom|伪字段]</other>','[ChatRoom|甲]\n[ChatRoom|乙]'])assert.throws(()=>check(base.replace('[ChatRoom|观众^期待]',bad)),{code:'TISYA_MEMORY5_ACL_EXTRA_TARGET'});
 assert.throws(()=>check(base.replace('[ChatRoom|观众^期待]','<script>[ChatRoom|伪字段]</script>')),{code:'TISHA_OUTPUT_DISPLAY_UNSAFE_TAG'});
 assert.throws(()=>check(base.replace('<starchat_app>','<other>').replace('</starchat_app>','</other>')),{code:'TISYA_MEMORY5_ACL_EXTRA_TARGET'});
 assert.deepEqual(readWorldExtra(base.replace(']|A',']|E')),[]);
});

test('an orphan or conflicting native permission never grants access; valid independent records remain readable',()=>{
 for(const rows of ['权限：status|[人物,玩家,不存在]|A','权限：status|[人物,玩家,秘密]|A\n权限：status|[人物,玩家,秘密]|E']){
  const source=fixture({status:'原生状态：人物|玩家|秘密|PRIVATE_NATIVE',memory:rows+'\n事件：玩家|~|公开消息'}),view=inspectMessage(source);
  assert.equal(view.journey.error,undefined);assert.equal(view.journey.value.memories.length,1);assert.equal(view.journey.value.changes.length,0);assert.ok(view.journey.value.diagnostics.length);assert.doesNotMatch(JSON.stringify(view),/PRIVATE_/);
 }
 const source=fixture({status:'原生状态：人物|玩家|分数|0',memory:'权限：status|[人物,玩家,分数]|~\n事件：玩家|A|公开消息'});
 assert.equal(inspectMessage(source).journey.value.changes[0].newValue,0);
});

test('mobile UI presents compact records and a local locator notice with usable public controls',async()=>{
 const win=new Window(),doc=win.document;win.IntersectionObserver=class{observe(){}disconnect(){}};
 const node=doc.createElement('div');doc.body.append(node);const chosen=[];
 const ui=mountMessageVisual(doc,node,{source:compactReplyFixture(),name:'测试',formatBody:s=>s,getMotion:()=>false,onChooseAction:text=>chosen.push(text)}),root=ui.host.shadowRoot;
 assert.equal(root.querySelectorAll('.heart-host').length,2);assert.equal(root.querySelectorAll('.audit-bead').length,7);assert.equal(root.querySelectorAll('.action').length,4);
 assert.doesNotMatch(root.querySelector('.journey-reader').textContent,/权限第 1 条/);assert.doesNotMatch(root.innerHTML,/PRIVATE_|TISYA_PERMISSION_SHAPE|任务、心声与核验暂不可用/);
 assert.equal(root.querySelectorAll('.record-notice').length,0);
 root.querySelector('.action').click();await Promise.resolve();await Promise.resolve();assert.equal(chosen.length,1);
 ui.dispose();await win.happyDOM.abort();
});
