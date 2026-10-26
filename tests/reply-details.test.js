import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Window} from 'happy-dom';import {inspectMessage,mountMessageReader} from '../reader.js';import {readReplyDetails,mountHeartBlock,mountAuditBlock} from '../reply-details.js';import {executeAction,mountActionChoice} from '../actions.js';
const source=fs.readFileSync(new URL('../examples/reply-demo.txt',import.meta.url),'utf8');
test('public heart and audit projection uses canonical pipe ownership and never exposes unrelated task or machine blocks',async()=>{
 const text=source.replace('等候旅人的下一步选择','PRIVATE_TASK_CANARY'),data=inspectMessage(text),w=new Window(),d=w.document,host=d.createElement('div');d.body.append(host);
 assert.equal(data.details.value.taskHeart.items.length,2);assert.equal(data.details.value.nextHeart.items.length,1);assert.equal(data.details.value.audit.length,7);assert.ok(!JSON.stringify(data.details).includes('PRIVATE_TASK_CANARY'));
 const heart=mountHeartBlock(d,host,data.details.value.taskHeart),bubble=heart.querySelector('button');assert.match(bubble.textContent,/信封递过来了/);bubble.click();assert.match(bubble.textContent,/相遇有了重量/);bubble.click();assert.match(bubble.textContent,/信封递过来了/);
 mountAuditBlock(d,host,data.details.value.audit);assert.equal(host.querySelectorAll('.audit-bead').length,7);assert.equal(host.querySelector('.audit-ledger').open,false);assert.equal(host.querySelector('.audit-bead').open,false);
 const empty=mountHeartBlock(d,host,{status:'关闭',items:[]});assert.equal(empty,null);assert.equal(host.querySelectorAll('.heart-host').length,1);await w.happyDOM.abort();
});
test('broken heart state has a local error while body and source remain intact; display text is not executable markup',async()=>{
 const text=source.replace('心声：有内容|输入评价|好奇|信封递过来了。先读信，还是先问来历？','心声：关闭|输入评价|null|PRIVATE_CANARY');const data=inspectMessage(text);assert.ok(data.details.error);assert.match(data.body.value,/潮水/);assert.ok(!JSON.stringify(data.details).includes('PRIVATE_CANARY'));
 const w=new Window(),host=w.document.createElement('div');w.document.body.append(host);mountHeartBlock(w.document,host,{status:'有内容',items:[{type:'输入评价',mood:null,text:'<img src=x onerror=alert(1)>'}]});assert.equal(host.querySelector('img'),null);assert.match(host.textContent,/<img/);await w.happyDOM.abort();
});
test('reader hides paragraph labels while keeping canonical source references and shows heart/audit tab',async()=>{
 const w=new Window(),d=w.document,root=d.createElement('div');d.body.append(root);const reader=mountMessageReader(d,root,{source,formatBody:t=>t,onChooseAction(){}});assert.equal(root.querySelectorAll('.tisya-paragraph-number[hidden]').length,6);assert.match(inspectMessage(source).journey.value.memories[0].quote.text,/潮水/);root.querySelector('[data-reader-tab="checks"]').click();assert.equal(root.querySelectorAll('.heart-host').length,2);assert.equal(root.querySelectorAll('.audit-bead').length,7);reader.dispose();await w.happyDOM.abort();
});
test('draft changed during input notification prevents direct send and preserves user text',async()=>{
 const w=new Window(),d=w.document;d.body.innerHTML='<textarea id="send_textarea"></textarea>';const input=d.querySelector('textarea');let calls=0;input.addEventListener('input',()=>input.value='刚编辑');await assert.rejects(executeAction({document:d,text:'观察灯塔',mode:'send',validate(){},send(){calls++;}}),/草稿已变化/);assert.equal(calls,0);assert.equal(input.value,'刚编辑');await w.happyDOM.abort();
});
test('a held action cannot be submitted twice and a disposed menu cannot apply anything',async()=>{
 const w=new Window(),d=w.document,host=d.createElement('div');d.body.append(host);let release,calls=0;const pending=new Promise(r=>release=r),ui=mountActionChoice(d,host,{rows:[{text:'观察灯塔'}],onChoose:()=>{calls++;return pending;}}),b=host.querySelector('.action');b.click();b.click();assert.equal(calls,1);release();await w.happyDOM.whenAsyncComplete();const menu=host.querySelector('[data-mode="send"]');ui.dispose();b.click();menu.click();assert.equal(calls,1);await w.happyDOM.abort();
});
