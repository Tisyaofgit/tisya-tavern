import {xmlText} from '../engine/prompt-sections.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {historyBody,projectHistoryLayers} from '../engine/history-layers.mjs';
import {configureTags} from '../engine/tags.mjs';
import {historySendFixture,oldGreeting} from './fixtures/history-send.mjs';

const wrap=body=>'<reply><body>'+body+'</body><cells/><archive/></reply>';
const row=(id,floor,role,text,extra={})=>({id,floor,role,text,scope:'s',revision:1,...extra});
const conversation=raw=>[row('old',1,'assistant',raw),row('u1',2,'user','问候'),row('last',3,'assistant',wrap('1 守夜人打开门。')),row('current',4,'user','继续')];
const legacy=[oldGreeting,'旧开场白\r\n\r\n  保留缩进 &nbsp; & <星光>。','1 第一项\n\n3 第三项','<scene>钟声响起。</scene>','```html\n<reply><extra>只是代码示例</extra></reply>\n```','行内 `<reply>` 不是机器区块。','<div title="<reply>">属性里的例子</div>','<!-- <reply>注释</reply> -->旧原文','<!DOCTYPE html><html><head><title>驿站</title></head><body><p>夜雨。<br>灯亮。</p></body></html>','<script>const example="<reply>";</script><p>旧展示源码</p>'];
for(const [i,raw] of legacy.entries())test('legacy source remains exact and inert in selected history '+i,()=>{
 assert.equal(historyBody(raw),raw);const messages=conversation(raw),before=structuredClone(messages),r=projectHistoryLayers({messages,scope:'s',historyCount:10});
 assert.deepEqual(r.recentBodies,[]);assert.equal(r.layers.recentBody,'');assert(r.audit.some(a=>a.id==='old'&&a.layer==='timeline_source'));assert.deepEqual(messages,before);
});
test('valid structured replies retain body-only projection and paragraph checks',()=>{
 assert.equal(historyBody(wrap('1 第一段。\r\n\r\n2 第二段。')),'第一段。\r\n\r\n第二段。');
 assert.equal(historyBody('    '+wrap('1 合法缩进。')),'合法缩进。');
 for(const raw of ['<reply><body>1 未闭合','<reply><body>1 一段。</body><body>二段</body></reply>',wrap('1 第一段。\n\n3 错号。'),'旧回复 <extra>机器资料</extra>','<body>孤立正文</body>','<reply','<think>未闭合','<!-- 未闭合注释\n'+wrap('1 正文。')])assert.throws(()=>historyBody(raw),undefined,raw);
});
test('current and historical alias markers cannot fall through to raw legacy prose',()=>{
 configureTags({reply:'answer',body:'storyBody',cells:'changes'},[{reply:'oldAnswer',body:'oldBody',archive:'oldArchive'}]);
 try{
  assert.equal(historyBody('<answer><storyBody>1 当前别名。</storyBody><changes/></answer>'),'当前别名。');
  assert.equal(historyBody('<oldAnswer><oldBody>1 旧别名。</oldBody><oldArchive/></oldAnswer>'),'旧别名。');
  for(const raw of ['<answer><storyBody>截断','旧文字 <changes>不能混入</changes>','<oldArchive>孤立机器块</oldArchive>'])assert.throws(()=>historyBody(raw));
 }finally{configureTags();}
});
test('unselected, hidden and out-of-window sources remain excluded',()=>{
 const messages=[row('other',0,'assistant','<reply',{scope:'other'}),...conversation(oldGreeting),row('hidden',0,'assistant','<reply',{hidden:true}),row('swipe',0,'assistant','<reply',{selected:false})];
 for(const count of [0,1])assert.equal(projectHistoryLayers({messages,scope:'s',historyCount:count}).recentBodies.length,0);
 const r=projectHistoryLayers({messages,scope:'s',historyCount:10});assert.deepEqual(r.recentBodies,[]);assert.equal(r.audit.filter(x=>x.layer==='timeline_source').length,1);
});
for(const interceptor of [true,false])test('production payload keeps old HTML in the source store rather than raw history '+interceptor,async()=>{
 const f=await historySendFixture(),before=f.ctx.chat.map(m=>m.mes),state=(await f.host.export()).state;
 const r=await f.send('normal',{interceptor});assert(r.accepted);const full=r.payload.messages.map(m=>m.content).join('\n');
 assert.equal(full.split(xmlText(oldGreeting)).length-1,0);assert.equal(full.split('<recent_situation>\n').length-1,1);assert.equal(full.split('谢谢，请说说今晚的天气。').length-1,1);
 assert.deepEqual(f.ctx.chat.map(m=>m.mes),before);assert.deepEqual((await f.host.export()).state,state);
});
test('malformed older prose remains quarantined in the source store without blocking the chain head',async()=>{
 const f=await historySendFixture();f.ctx.chat[0].mes='<reply><body>1 缺少闭合';
 const result=await f.send();assert.equal(result.accepted,true);assert(!result.payload.messages.some(m=>m.content.includes('缺少闭合')));
 f.ctx.chat[0].mes=oldGreeting;assert.equal((await f.send()).accepted,true);
});
test('legacy HTML edits and chat switches after preparation still invalidate the payload',async()=>{
 for(const change of [f=>{f.ctx.chat[0].mes+='<p>修改了来源。</p>';},f=>{f.ctx.chatId='other-chat';}]){
  const f=await historySendFixture();await assert.rejects(f.send('normal',{afterPrepare:()=>change(f)}),/变化|切换/);assert.equal(f.host.accepted(),false);
 }
});
for(const type of ['swipe','regenerate','continue'])test('selected reroll and continuation paths retain legacy source '+type,async()=>{
 const f=await historySendFixture();f.ctx.chat.pop();const before=f.ctx.chat.map(m=>m.mes),r=await f.send(type);
 assert(r.accepted);assert.equal(r.payload.messages.map(m=>m.content).join('\n').split(xmlText(oldGreeting)).length-1,type==='continue'?0:1);assert.deepEqual(f.ctx.chat.map(m=>m.mes),before);
});
