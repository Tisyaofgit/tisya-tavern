import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Window} from 'happy-dom';
import {mountMessageVisual} from '../message-ui.js';import {readReplyDetails} from '../reply-details.js';
const sample=fs.readFileSync(new URL('../examples/reply-demo.txt',import.meta.url),'utf8');
const publicRule='["A",["叙事组织","记录整理","玩家"],["读者","玩家"],["玩家"]]';
const secretRule='["E",["叙事组织","记录整理"],[],[]]';
function setup(){const w=new Window(),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};const node=d.createElement('div');d.body.append(node);return {w,d,node};}
const props=source=>({source,name:'测试',formatBody:s=>s,onChooseAction(){},getMotion:()=>false});
test('original task/next folds, owned animals and ledger clicks stay independent; view state survives remount',async()=>{
 const {w,d,node}=setup(),ui=mountMessageVisual(d,node,props(sample)),r=ui.host.shadowRoot;
 assert.equal(r.querySelector('.task-region>.fold-head>#task-toggle').textContent,'本轮任务');assert.equal(r.querySelector('.next-heading>#next-toggle').textContent,'下轮待办');
 assert.equal(r.querySelector('#task-heart>.creature').getAttribute('aria-label'),'戳一下水母');assert.equal(r.querySelector('.next-heading>#next-heart>.creature').getAttribute('aria-label'),'戳一下蝌蚪');assert.equal(r.querySelector('.visual-creatures'),null);
 assert.equal(r.querySelectorAll('#next-content .audit-bead').length,7);assert.equal(r.querySelector('.reply-checks'),null);
 r.querySelector('#task-toggle').click();r.querySelector('#task-content details').open=true;r.querySelector('#task-heart .heart-bubble').click();r.querySelector('#next-toggle').click();r.querySelector('#next-content .audit-ledger').open=true;
 assert.equal(r.querySelector('#task-content').hidden,false);assert.equal(r.querySelector('#next-content').hidden,false);assert.match(r.querySelector('#task-heart .heart-bubble').textContent,/相遇有了重量/);
 const state=ui.capture(),old=r.querySelector('#next-toggle');ui.dispose();old.click();const fresh=mountMessageVisual(d,node,props(sample));fresh.restore(state);const rr=fresh.host.shadowRoot;
 assert.equal(rr.querySelector('#task-toggle').getAttribute('aria-expanded'),'true');assert.equal(rr.querySelector('#task-content details').open,true);assert.equal(rr.querySelector('#next-content .audit-ledger').open,true);assert.equal(rr.querySelector('#task-heart .heart-bubble').dataset.index,'1');fresh.dispose();await w.happyDOM.abort();
});
test('task summary and pending records keep public field ownership, including folded DOM and counters',async()=>{
 const source=sample.replace(/^未完：[^\n]*\n/gm,'').replace(/^待办：[^\n]*\n/gm,'').replace('任务：阅读来信|','任务：PRIVATE_INPUT|').replace('等候旅人的下一步选择','PRIVATE_STOP').replace('<next format="pipes" audit_count="7">','<next format="pipes" audit_count="7">\n待办：推演|PRIVATE_TRIGGER|PRIVATE_NEXT\n待办：选择|打开信封|阅读来信\n候选：PRIVATE_CANDIDATE').replace('<memory format="pipes">','<memory format="pipes">\n未完：待处理|阅读来信|玩家|打开信封|信封已递到面前|'+publicRule+'\n未完：待处理|PRIVATE_PENDING|玩家|PRIVATE_FUTURE|PRIVATE_CAUSE|'+secretRule);
 const data=readReplyDetails(source);assert.equal(data.rounds.pendingError,false);assert.equal(data.rounds.tasks.length,1);assert.equal(data.rounds.pending.length,0);assert.ok(!JSON.stringify(data).includes('PRIVATE_'));
 const {w,d,node}=setup(),ui=mountMessageVisual(d,node,props(source)),r=ui.host.shadowRoot;
 assert.match(r.querySelector('#task-content').textContent,/旅人抵达旧灯塔/);assert.doesNotMatch(r.querySelector('#next-content .todo-ledger').textContent,/阅读来信/);assert.ok(!r.innerHTML.includes('PRIVATE_'));assert.equal(r.querySelectorAll('.todo-ledger .ledger-entry').length,0);assert.match(r.querySelector('.task-line').textContent,/0待办/);assert.equal(ui.data.body.value.includes('PRIVATE_'),false);ui.dispose();await w.happyDOM.abort();
});
test('closed hearts do not become orphan decorations and an empty world scroll starts folded',async()=>{
 const source=sample.replace(/心声：有内容[^\n]*(?:\n心声：有内容[^\n]*)*/g,'心声：关闭').replace(/<extra>[\s\S]*?<\/extra>/,'<extra/>');
 const {w,d,node}=setup(),ui=mountMessageVisual(d,node,props(source)),r=ui.host.shadowRoot;
 assert.equal(r.querySelectorAll('.heart-host,.visual-creature,.visual-creatures').length,0);assert.equal(r.querySelector('#world-extension-toggle').getAttribute('aria-expanded'),'false');assert.equal(r.querySelector('.world-extension').hidden,true);assert.equal(r.querySelector('#next-toggle').textContent,'下轮待办');r.querySelector('#world-extension-toggle').click();assert.equal(r.querySelector('#world-extension-toggle').getAttribute('aria-expanded'),'true');assert.match(r.querySelector('.world-extension').textContent,/没有可展示/);ui.dispose();await w.happyDOM.abort();
});
