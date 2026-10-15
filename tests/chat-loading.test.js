import test from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
import {createChatLoadingController,mountChatLoadingSettings,messageLimit} from '../chat-loading.js';
test('count uses canonical host setting, preserves zero and saves without touching history',async()=>{
 const native={chat_truncation:100,unrelated:true},chat=[{mes:'original',swipes:['A','B']}],before=JSON.stringify(chat);let writes=0;
 const c=createChatLoadingController({powerUser:native,persist:async()=>{writes++;return true;}});
 assert.equal(c.inspect().count,100);assert.equal(writes,0);await c.save(10,100);assert.equal(native.chat_truncation,10);await c.save(0,10);assert.equal(c.inspect().count,0);assert.equal(native.unrelated,true);assert.equal(JSON.stringify(chat),before);
 for(const n of [-1,1.5,NaN,'10',Infinity])assert.throws(()=>messageLimit(n));
});
test('failed or conflicting count writes never claim success or overwrite newer settings',async()=>{
 const native={chat_truncation:20};const c=createChatLoadingController({powerUser:native,persist:async()=>false});await assert.rejects(c.save(10,20),/未确认保存/);assert.equal(native.chat_truncation,20);native.chat_truncation=50;await assert.rejects(c.save(10,20),/其他位置/);assert.equal(native.chat_truncation,50);
 let finish;const d=createChatLoadingController({powerUser:native,persist:()=>new Promise(r=>finish=r)});const pending=d.save(10,50);native.chat_truncation=5;finish(true);await assert.rejects(pending,/期间/);assert.equal(native.chat_truncation,5);
});
test('settings draft, busy leave guard, reload and bounded-mode explanation',async()=>{
 const w=new Window(),d=w.document,native={chat_truncation:100};let finish;
 const c=createChatLoadingController({powerUser:native,persist:()=>new Promise(r=>finish=r),isBounded:()=>true,clearCache:async()=>{}}),v=mountChatLoadingSettings(d,d.body,{controller:c}),button=text=>[...v.root.querySelectorAll('button')].find(n=>n.textContent===text);
 assert.match(v.root.textContent,/虚拟滚动/);button('设为 10 条').click();assert.equal(native.chat_truncation,100);assert.equal(v.requestLeave().allowed,false);button('保存条数').click();assert.equal(v.requestLeave().allowed,false);assert.equal(button('清理显示缓存').disabled,true);finish(true);await v.settled();assert.equal(v.requestLeave().allowed,true);assert.equal(native.chat_truncation,10);v.dispose();
 const again=mountChatLoadingSettings(d,d.body,{controller:c});assert.equal(again.root.querySelector('input').value,'10');again.dispose();await w.happyDOM.abort();
});
test('clear errors remain visible and late completion after disposal cannot revive a panel',async()=>{
 const w=new Window(),d=w.document,c=createChatLoadingController({powerUser:{chat_truncation:10},persist:async()=>true,clearCache:async()=>{throw Error('写入锁未释放');}}),v=mountChatLoadingSettings(d,d.body,{controller:c});[...v.root.querySelectorAll('button')].find(n=>n.textContent==='清理显示缓存').click();await v.settled();assert.match(v.root.querySelector('[role=alert]').textContent,/写入锁/);assert.doesNotMatch(v.root.querySelector('[role=alert]').textContent,/已清理/);v.dispose();
 let finish;const delayed=mountChatLoadingSettings(d,d.body,{controller:createChatLoadingController({powerUser:{chat_truncation:10},persist:async()=>true,clearCache:()=>new Promise(r=>finish=r)})});[...delayed.root.querySelectorAll('button')].find(n=>n.textContent==='清理显示缓存').click();delayed.dispose();finish();await delayed.settled();assert.equal(d.body.children.length,0);await w.happyDOM.abort();
});
