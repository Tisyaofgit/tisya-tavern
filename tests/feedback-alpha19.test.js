import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {fixture} from './fixtures/journey-r4.cjs';
import {parseDisplayEnvelope} from '../reader-core.js';
import {inspectMessage,mountMessageReader} from '../reader.js';
import {mountMessageVisual} from '../message-ui.js';

const directions=['输入评价','回应用户评价','剧情吐槽'];
const hearts=directions.map((d,i)=>`心声：有内容|${d}|null|重复评论${i+1}。`).join('\n');
const source=()=>fixture({
 body:Array.from({length:42},(_,i)=>`${i+1}\n现场人员核对第${i+1}项安排。`).join('\n\n'),taskExtra:hearts,nextExtra:hearts,
 memory:'关联：[队员甲,队员乙]|E\n权限：status|[/世界状态/当前时间]|A\n事件：[队员甲,队员乙]|E|PRIVATE_EVENT\n原文：段落4、5、6、10、11、13、14、22、26、28、31、36、37、39\n认知：队员甲|自我|确认|E|PRIVATE_COGNITION|亲历',
}).replaceAll('心声：关闭\n','');

test('feedback decodes a complete E record, distinguishes filtering, and reports three source duplicates without changing six selected hearts',async()=>{
 const raw=source(),memory=JSON.parse(parseDisplayEnvelope(raw).blocks.memory),view=inspectMessage(raw);
 assert.equal(memory.事件.length,1);assert.equal(view.journey.error,undefined);assert.equal(view.journey.value.memories.length,1);
 assert.match(view.details.value.heartDiagnostic,/3 条/);assert.equal(view.details.value.taskHeart.items.length,3);assert.equal(view.details.value.nextHeart.items.length,3);
 const win=new Window(),doc=win.document;win.IntersectionObserver=class{observe(){}disconnect(){}};const box=doc.createElement('div');doc.body.append(box);
 const ui=mountMessageVisual(doc,box,{source:raw,formatBody:s=>s,getMotion:()=>false}),root=ui.host.shadowRoot;
 assert.match(root.querySelector('.journey-reader').textContent,/PRIVATE_EVENT/);
 root.querySelector('[data-jr-tab=more]').click();assert.match(root.querySelector('.heart-diagnostic').textContent,/原回复有 3 条/);
 for(const h of root.querySelectorAll('.heart-host'))assert.equal(h.querySelectorAll('.heart-dots i').length,3);
 ui.dispose();const reader=mountMessageReader(doc,box,{source:raw,formatBody:s=>s,initialTab:'journey'});assert.match(box.textContent,/PRIVATE_EVENT/);reader.dispose();await win.happyDOM.abort();
});

test('public event and reader-authorized private cognition remain visible without granting an unrelated private child',()=>{
 const p='[C,[叙事组织,记录整理,队员甲],[读者],[队员甲]]';
 const raw=fixture({memory:`事件：[队员甲,队员乙]|A|公开演出结束\n认知：队员甲|自我|确认|${p}|获准叙述的个人认识|亲历\n心理：队员乙|E|PRIVATE_UNRELEASED|后台资料`});
 const view=inspectMessage(raw);assert.equal(view.journey.error,undefined);assert.equal(view.journey.value.memories.length,1);
 assert.equal(view.journey.value.characters.find(c=>c.name==='队员甲').cognition[0].content,'获准叙述的个人认识');
 assert.doesNotMatch(JSON.stringify(view),/PRIVATE_UNRELEASED/);
});

test('independent closing comments clear the diagnostic; punctuation alone does not',()=>{
 const raw=source();
 const edited=raw.replace(/(<next[\s\S]*?<\/next>)/,s=>s.replaceAll('重复评论','新的结果评论'));
 assert.equal(inspectMessage(edited).details.value.heartDiagnostic,undefined);
 const punctuation=raw.replace(/(<next[\s\S]*?<\/next>)/,s=>s.replaceAll('。','！'));
 assert.match(inspectMessage(punctuation).details.value.heartDiagnostic,/3 条/);
});
