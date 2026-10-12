import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {inspectMessage,mountMessageReader} from '../reader.js';
import {fixture,richFixture,PUBLIC,SECRET} from './fixtures/journey-r4.cjs';

function ui(source){
    const w=new Window(),d=w.document,root=d.createElement('div');d.body.append(root);const choices=[];
    const reader=mountMessageReader(d,root,{source,formatBody:text=>{const div=d.createElement('div');div.textContent=text;return div.innerHTML;},onChooseAction:text=>choices.push(text)});
    return {root,choices,tab:name=>root.querySelector(`[data-reader-tab="${name}"]`).click(),dispose(){reader.dispose();w.happyDOM.abort();}};
}
test('ordinary messages read unchanged; structured replies expose body and action text without internal payload',()=>{
    const plain=inspectMessage('普通正文 **加粗**');assert.equal(plain.structured,false);assert.equal(plain.body.value,'普通正文 **加粗**');assert.equal(plain.journey.value,null);
    const source=richFixture(),view=inspectMessage(source);assert.equal(view.structured,true);assert.equal(view.body.paragraphs.value.length,3);
    assert.deepEqual(view.actions.value.map(a=>a.text),['察看门锁','询问守卫','查看灯火','退到街边']);
    assert.equal(JSON.stringify(view).includes('SECRET_SENTINEL_未完'),false);assert.equal(source,richFixture());
});
test('closed body still reads if later blocks are incomplete; broken structured payload never falls back to raw source',()=>{
    const full=fixture(),partial=full.slice(0,full.indexOf('<memory'));
    const view=inspectMessage(partial);assert.match(view.body.value,/门开了/);assert.ok(view.journey.error);assert.ok(view.actions.error);
    for(const source of ['<reply>SECRET_PAYLOAD','<think>SECRET_PAYLOAD','<output><reply>SECRET_PAYLOAD','<reply><task>SECRET_PAYLOAD</task></reply>']){
        const data=inspectMessage(source);assert.ok(data.body.error);assert.equal(JSON.stringify(data).includes('SECRET_PAYLOAD'),false);
        const f=ui(source);for(const tab of ['body','journey','actions']){f.tab(tab);assert.equal(f.root.innerHTML.includes('SECRET_PAYLOAD'),false);}f.dispose();
    }
});
test('reader DOM never contains hidden payload, hidden counts, raw ACLs or executable action markup',()=>{
    const f=ui(richFixture());for(const tab of ['body','journey','actions']){
        f.tab(tab);assert.equal(f.root.innerHTML.includes('SECRET_SENTINEL_未完'),false);assert.equal(f.root.innerHTML.includes('未完事项'),false);assert.equal(f.root.innerHTML.includes('知情'),false);assert.equal(f.root.querySelector('script'),null);
    }
    assert.match(f.root.textContent,/发送前可以继续修改/);f.root.querySelector('.tisya-reader-actions button').click();assert.deepEqual(f.choices,['察看门锁']);f.dispose();
    const malicious=ui(fixture().replace('察看门锁','&lt;img src=x onerror=alert(1)&gt;'));malicious.tab('actions');assert.equal(malicious.root.querySelector('img'),null);assert.match(malicious.root.textContent,/<img/);malicious.dispose();
});
test('turn records preserve null, false, zero and deletion; all-secret records leave no cards or counts',()=>{
    const p=JSON.stringify(PUBLIC),s=JSON.stringify(SECRET);
    const f=ui(fixture({memory:`事件：玩家|${p}|门的记录\n变动：门|开启|false|0|${p}\n变动：门|备注|~|null|${p}\n变动：门|锁|0|~|${p}\n变因：开门`}));f.tab('journey');
    assert.match(f.root.textContent,/此前：false此后：0/);assert.match(f.root.textContent,/此后：null/);assert.match(f.root.textContent,/已移除/);f.dispose();
    const hidden=ui(fixture({memory:`事件：隐秘角色|${s}|隐秘事件`}));hidden.tab('journey');assert.ok(hidden.root.querySelectorAll('.tisya-reader-card').length>0);assert.equal(hidden.root.textContent.includes('隐秘事件'),true);hidden.dispose();
});
test('disposing the reader disconnects action effects even when an old button reference survives',()=>{
    const f=ui(fixture());f.tab('actions');const old=f.root.querySelector('.tisya-reader-actions button');f.dispose();old.click();assert.deepEqual(f.choices,[]);assert.equal(f.root.childNodes.length,0);
});

test('empty optional unlock placeholders do not block other blocks or alter native variable payload',async()=>{
 const {parseDisplayEnvelope}=await import('../reader-core.js');
 const update='<UpdateVariable>\n<Analysis>Three minutes passed.</Analysis>\n<JSONPatch>[{"op":"replace","path":"/世界状态/当前时间","value":"2001-10-12 11:08"},{"op":"delta","path":"/玩家角色/身体/疲劳值","value":2}]</JSONPatch>\n</UpdateVariable>';
 for(const row of ['解锁：~|~|~','解锁：[]|[]|[]','解锁：~']){
  const original=fixture({taskExtra:row+'\n待定：~',status:'叙事状态：玩家|E|所在|门内|门外',memory:'关联：[玩家,守卫]|E\n权限：status|[/世界状态/当前时间]|A\n权限：vars|/世界状态/当前时间|A\n权限：vars|/玩家角色/身体/疲劳值|C\n事件：[玩家,守卫]|E|两人到了门口\n原文：段落1、2\n标签：[门口,出发]'}).replace('<vars/>','<vars>'+update+'</vars>');
  const source=original,result=inspectMessage(source),envelope=parseDisplayEnvelope(source);assert.equal(result.body.error,undefined);assert.equal(result.journey.error,undefined);assert.equal(result.actions.error,undefined);assert.equal(result.details.error,undefined);assert.equal(result.journey.value.memories.length,1);assert.deepEqual(JSON.parse(envelope.blocks.vars).operations.map(x=>x.op),['replace','delta']);assert.equal(source,original);assert(source.includes(update));
 }
 assert.equal(inspectMessage(fixture({taskExtra:'解锁：实际秘密|~|~'})).actions.error,'TISYA_PIPES_TEXT');
});
