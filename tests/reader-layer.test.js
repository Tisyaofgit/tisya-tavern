import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {fixture} from './fixtures/journey-r4.cjs';import {inspectMessage} from '../reader.js';import {mountMessageVisual} from '../message-ui.js';import {notebookEntry,mountNotebook} from '../notebook.js';import {projectJourney} from '../reader-core.js';
const names=['门面','主唱','队长','队员乙','队员丙'];
const source=fixture({body:'1\n五人留在休息室核对返程安排。',status:names.map(n=>`叙事状态：${n}|E|所在|舞台|休息室`).join('\n'),memory:[
 '未完：待处理|FUTURE_PENDING|[门面]|通知|安排|A','倒计时：轮|1|[门面]|车站|FUTURE_TIMER|A',
 `事件：[${names.join(',')}]|E|五人在休息室交谈。`,'原文：段落1',
 '认知：门面|自我|确认|E|自己还想听歌|本人已有的感受','认知：队长|对外|推测|E|有人尚未准备好出发|刚才的停顿',
 '心理：门面|E|想留下多听一会|本轮已交付心理','心理：主唱|E|对依赖感到温暖|本轮已交付心理','心理：队长|E|有些着急|本轮已交付心理','伏笔：推进|[门面]|FUTURE_FORESHADOW|尚未发生的安排'
].join('\n')});
test('reader review retains five E characters, five states, own cognition and optional non-verbatim thoughts without changing story ACLs',()=>{
 const before=source,off=inspectMessage(source,{playerName:'门面'}).journey.value,on=inspectMessage(source,{playerName:'门面',showPsychology:true}).journey.value;
 assert.equal(off.memories.length,1);assert.equal(off.changes.length,5);assert.equal(off.characters.length,4);assert.equal(off.player.cognition.length,1);assert.equal(off.player.psychology.length,0);assert.equal(on.player.psychology.length,1);assert.equal(on.characters.reduce((n,c)=>n+c.psychology.length,0),2);
 assert.equal(projectJourney(source).memories.length,0);assert.equal(source,before);assert.doesNotMatch(JSON.stringify(on),/FUTURE_|"权限"|"knowers"/);assert.equal(inspectMessage(source,{playerName:'門面'}).journey.value.characters.length,5);
 const ctx={chat:[{mes:source}],name1:'门面',getCurrentChatId:()=> 'test'};assert.doesNotMatch(notebookEntry(ctx,0,'memory').text,/想留下多听一会/);assert.match(notebookEntry(ctx,0,'memory',{显示角色心理:true}).text,/想留下多听一会/);
});
test('more restores the psychology switch, saves it, survives remount, and exposes save failure without losing records',async()=>{
 const w=new Window(),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};const box=d.createElement('div');d.body.append(box);let display={显示角色心理:false},fail=false,calls=0;const options={source,formatBody:s=>s,getMotion:()=>false,getPlayerName:()=> '门面',getDisplay:()=>display,saveDisplayPreference:async(k,v,expected)=>{calls++;assert.equal(display[k],expected);if(fail)throw Error('保存失败测试');display={...display,[k]:v};}};
 let ui=mountMessageVisual(d,box,options),r=ui.host.shadowRoot;r.querySelector('[data-jr-tab=characters]').click();assert.match(r.textContent,/队长/);r.querySelector('[data-jr-tab=more]').click();r.querySelector('[role=switch]').click();await w.happyDOM.whenAsyncComplete();assert.equal(display.显示角色心理,true);r.querySelector('[data-jr-tab=player]').click();assert.match(r.textContent,/想留下多听一会/);ui.dispose();ui=mountMessageVisual(d,box,options);r=ui.host.shadowRoot;r.querySelector('[data-jr-tab=more]').click();assert.equal(r.querySelector('[role=switch]').getAttribute('aria-checked'),'true');fail=true;r.querySelector('[role=switch]').click();await w.happyDOM.whenAsyncComplete();assert.equal(display.显示角色心理,true);assert.match(r.textContent,/保存失败测试/);assert.equal(calls,2);ui.dispose();await w.happyDOM.abort();
});
