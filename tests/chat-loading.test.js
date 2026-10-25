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

test('workspace entries group by stable account/card/chat ownership and clear only an explicit selection',async()=>{
 const w=new Window(),d=w.document,first={account:'a',cardId:'card-1',cardName:'<img src=x onerror=bad()>',chatId:'chat-1',chatName:'存档一'},second={...first,account:'b',chatName:'另一账号'},other={...first,chatId:'chat-2',chatName:'存档二'};
 let rows=[{key:'a-card',kind:'card',owner:{account:'a',cardId:'card-1',cardName:first.cardName},bytes:1024,updatedAt:1,status:'saved'},...[[first,'m-1'],[first,'m-2'],[second,'m-3'],[other,'m-4']].map(([owner,key])=>({key,kind:'message',owner,bytes:512,updatedAt:1,status:'saved'}))],calls=[];
 const workspace={list:async()=>structuredClone(rows),remove:async key=>{calls.push(['remove',key]);rows=rows.filter(row=>row.key!==key);},clear:async filter=>{calls.push(['clear',filter]);rows=rows.filter(row=>!Object.entries(filter).every(([key,value])=>row.owner[key]===value));}};
 const controller=createChatLoadingController({powerUser:{chat_truncation:10},persist:async()=>true,clearCache:async()=>{}}),v=mountChatLoadingSettings(d,d.body,{controller,workspace});await v.ready;
 assert.equal(v.root.querySelectorAll('[data-workspace-card]').length,2,'same display/card names under different accounts stay separate');assert.equal(v.root.querySelectorAll('img').length,0,'names are text, never markup');assert.match(v.root.textContent,/不是运行内存实测/);assert.equal(v.root.querySelectorAll('[data-workspace-chat] li').length,0,'message rows are not mounted before expansion');
 const firstCard=v.root.querySelector('[data-workspace-card]'),saves=[...firstCard.querySelectorAll('[data-workspace-chat]')],chat=saves.find(n=>n.querySelector('summary').textContent.startsWith('存档一'));chat.open=true;chat.dispatchEvent(new w.Event('toggle'));assert.equal(chat.querySelectorAll('li').length,2);chat.querySelector('li button').click();await v.settled();assert.deepEqual(calls.shift(),['remove','m-1']);assert(rows.some(row=>row.key==='m-3'));
 const currentChat=[...v.root.querySelectorAll('[data-workspace-chat]')].find(n=>n.querySelector('summary').textContent.startsWith('存档一'));[...currentChat.querySelectorAll('button')].find(n=>n.textContent==='清理此存档缓存').click();await v.settled();assert.deepEqual(calls.shift(),['clear',{account:'a',cardId:'card-1',chatId:'chat-1'}]);assert(rows.some(row=>row.key==='a-card'));assert(rows.some(row=>row.key==='m-4'));assert(rows.some(row=>row.key==='m-3'));
 v.root.querySelector('[data-workspace-card] button').click();await v.settled();assert.deepEqual(calls.shift(),['clear',{account:'a',cardId:'card-1'}]);assert.deepEqual(rows.map(row=>row.key),['m-3']);v.dispose();await w.happyDOM.abort();
});

test('workspace lock failures remain visible and do not clear another scope',async()=>{
 const w=new Window(),d=w.document,rows=[{key:'pending',kind:'worldbook',owner:{account:'a',cardId:'c',cardName:'卡',chatId:'s',chatName:'存档'},bytes:12,updatedAt:'2026-10-25T15:00:00Z',status:'pending',error:'尚有待同步变更'}];let clears=0;
 const v=mountChatLoadingSettings(d,d.body,{controller:createChatLoadingController({powerUser:{chat_truncation:10},persist:async()=>true,clearCache:async()=>{}}),workspace:{list:async()=>rows,clear:async()=>{clears++;throw Error('工作区仍有待同步变更');},remove:async()=>{throw Error('不可清理');}}});await v.ready;const group=v.root.querySelector('details');group.open=true;group.dispatchEvent(new w.Event('toggle'));assert.match(group.textContent,/待保存/);assert.match(group.textContent,/尚有待同步变更/);
 v.root.querySelector('[data-workspace-card] button').click();await v.settled();assert.equal(clears,1);assert.match(v.root.querySelector('[role=alert]').textContent,/待同步变更/);assert.doesNotMatch(v.root.querySelector('[role=alert]').textContent,/已清理/);assert.equal(v.root.querySelectorAll('[data-workspace-card]').length,1);v.dispose();await w.happyDOM.abort();
});

test('workspace load is guarded while pending and disposal cannot mount its late results',async()=>{
 const w=new Window(),d=w.document;let finish;
 const v=mountChatLoadingSettings(d,d.body,{controller:createChatLoadingController({powerUser:{chat_truncation:10},persist:async()=>true,clearCache:async()=>{}}),workspace:{list:()=>new Promise(resolve=>finish=resolve)}});
 assert.equal(v.requestLeave().allowed,false);assert(v.root.querySelector('[data-workspace-action=refresh]').disabled);v.dispose();finish([{key:'late',owner:{cardId:'c'},kind:'message',bytes:10}]);await v.ready;assert.equal(d.body.children.length,0);assert.equal(v.root.querySelectorAll('[data-workspace-card]').length,0);await w.happyDOM.abort();
});

test('workspace rows without stable card identity never offer an unscoped clear',async()=>{
 const w=new Window(),d=w.document;let calls=0;
 const v=mountChatLoadingSettings(d,d.body,{controller:createChatLoadingController({powerUser:{chat_truncation:10},persist:async()=>true,clearCache:async()=>{}}),workspace:{list:async()=>[{key:'specific',kind:'message',owner:{chatId:'c',chatName:'未绑定卡存档'},bytes:4}],clear:async()=>{calls++;},remove:async()=>{}}});await v.ready;
 const buttons=[...v.root.querySelectorAll('[data-workspace-card] button')];assert.equal(buttons.length,2);assert(buttons.every(n=>n.disabled));buttons.forEach(n=>n.click());assert.equal(calls,0);v.dispose();await w.happyDOM.abort();
});

test('workspace storage state and record labels remain readable and escaped',async()=>{
 const w=new Window(),d=w.document;
 const v=mountChatLoadingSettings(d,d.body,{controller:createChatLoadingController({powerUser:{chat_truncation:10},persist:async()=>true,clearCache:async()=>{}}),workspace:{list:async()=>[{key:'record',kind:'message',label:'<b>第 3 条消息</b>',owner:{cardId:'c',cardName:'卡'},bytes:4,state:'saved'}],clear:async()=>{},remove:async()=>{}}});await v.ready;const group=v.root.querySelector('details');group.open=true;group.dispatchEvent(new w.Event('toggle'));assert.match(group.textContent,/已保存/);assert.doesNotMatch(group.textContent,/状态未知/);assert.equal(group.querySelector('strong').textContent,'<b>第 3 条消息</b>');assert.equal(group.querySelectorAll('b').length,0);v.dispose();await w.happyDOM.abort();
});
