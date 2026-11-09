import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneApp,phoneSeed,phoneSnapshotBody,createPhoneLocalStorage,renderPhoneFrozen} from '../phone-app.mjs';
import {renderPhoneShell} from '../phone-shell.mjs';

function dom(){
  const listeners={};
  const root={innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];},contains(){return true;},addEventListener(k,f){listeners[k]=f;},removeEventListener(k){delete listeners[k];}};
  const doc={activeElement:null,addEventListener(){},removeEventListener(){},getElementById(){return null;}};
  const win={setInterval,clearInterval,setTimeout};win.parent=win;
  const click=data=>listeners.click({target:{closest(){return {dataset:data,closest(){return null;}};}}});
  return {root,doc,win,listeners,click};
}
async function fixture(){
  let serial=0,saved=null,app;
  const service=createPhoneService({seed:phoneSeed,contextKey:'phone-ui-test',storage:{async load(){return saved;},async save(value){saved=structuredClone(value);return {revision:value.revision};}},idFactory:()=>`ui-${++serial}`,onChange:()=>app?.refresh()});
  await service.init();const d=dom();app=await createPhoneApp({...d,service});return {...d,app,service};
}

test('all 28 documents and 17 kinds render; only one active composer',async()=>{
  const f=await fixture();const kinds=new Set();
  for(const record of Object.values(f.service.getState().suite.documents)){
    f.app.open(record.id);kinds.add(record.kind);assert.ok(!f.root.innerHTML.includes('这个页面暂时无法显示'),record.id);assert.ok(!f.root.innerHTML.includes('class="comm-compose"'),record.id);assert.ok((f.root.innerHTML.match(/data-phone-send/g)||[]).length<=1,record.id);
  }
  assert.equal(Object.keys(f.service.getState().suite.documents).length,28);assert.equal(kinds.size,17);f.app.dispose();
});

test('send and quote use actual core floor references; message remains queued',async()=>{
  const f=await fixture();f.app.open('forum-encore');f.click({replyFloor:'8'});await f.app.settled();await f.app.send('界面新增值');
  const record=f.service.getState().suite.documents['forum-encore'],last=record.items.at(-1);assert.equal(last.floor,9);assert.equal(last.text,'界面新增值');assert.equal(last.quote,8);assert.equal(f.service.getState().actions.at(-1).status,'queued');f.app.dispose();
});

test('like, down, cancel are mutually exclusive; source known floor totals change once',async()=>{
  const f=await fixture();await f.app.react('forum-encore',{floor:5},'like');let d=f.service.getState().suite.documents['forum-encore'];assert.equal(d.items.find(x=>x.floor===5).counts.like,18);await f.app.react('forum-encore',{floor:5},'down');d=f.service.getState().suite.documents['forum-encore'];assert.equal(d.meta.readerState.me.reactions['floor:5'],'down');assert.equal(d.items.find(x=>x.floor===5).counts.like,17);assert.equal(d.items.find(x=>x.floor===5).counts.down,2);await f.app.react('forum-encore',{floor:5},'down');d=f.service.getState().suite.documents['forum-encore'];assert.equal(d.meta.readerState.me.reactions['floor:5'],null);assert.equal(d.items.find(x=>x.floor===5).counts.down,1);f.app.dispose();
});

test('private search is explicit; follow-up search queues an action',async()=>{
  const f=await fixture();assert.equal((await f.app.search('刚开始，给你发完整机位。','public')).length,0);assert.equal((await f.app.search('刚开始，给你发完整机位。','mine')).length,1);await f.app.search('机位','public',{queue:true});assert.equal(f.service.getState().actions.at(-1).kind,'search');assert.equal(f.service.getState().actions.at(-1).status,'queued');f.app.dispose();
});

test('prepare locks sending but keeps an editable draft; copy reuses pending request',async()=>{
  const f=await fixture();f.app.open('forum-encore');await f.app.send('发送前');const first=await f.app.prepare();await f.service.setDraft('forum-encore','收发中仍保留的草稿');f.app.refresh();await f.app.settled();await new Promise(r=>setTimeout(r,0));assert.ok(f.root.innerHTML.includes('本轮正在收发，草稿会保留'));assert.ok(f.root.innerHTML.includes('收发中仍保留的草稿'));await assert.rejects(()=>f.app.send('不能插入改变楼号'),e=>e.code==='PHONE_TURN_BUSY');const again=await f.app.prepare();assert.equal(again.requestId,first.requestId);f.app.dispose();
});

test('receive appends model values, acknowledges actions and freezes the original floor',async()=>{
  const f=await fixture();f.app.open('forum-encore');await f.app.send('我的消息');const turn=await f.app.prepare(),req=f.service.getState().requests[turn.requestId];
  const payload={requestId:turn.requestId,acks:req.actionIds,blocks:[{type:'forum',thread:'forum-encore',items:[{by:'forum_night',text:'接纳的角色回复'}]}],markers:[{id:'m1',thread:'forum-encore',floor:10}]};
  await f.app.receive(`<reply><body>正文 [[手机:m1]]</body><extra><phone>${JSON.stringify(payload)}</phone></extra></reply>`,turn.requestId);assert.equal(f.service.getState().notifications.length,1);assert.equal(f.service.getState().actions[0].status,'received');const frozen=f.service.snapshot(`preview-reply:${turn.requestId}`);await f.app.send('后来又加了一条');const picked=phoneSnapshotBody(frozen,'m1');assert.ok(picked.bodyHtml.includes('接纳的角色回复'));assert.ok(!picked.bodyHtml.includes('后来又加了一条'));f.app.dispose();
});

test('frozen renderer reads host snapshot only, and missing snapshots never read current state',async()=>{
  const f=await fixture();f.app.open('forum-encore');await f.app.send('msg');const turn=await f.app.prepare(),req=f.service.getState().requests[turn.requestId];await f.app.receive(JSON.stringify({requestId:turn.requestId,acks:req.actionIds,blocks:[],markers:[{id:'m1',thread:'forum-encore',floor:9}]}),turn.requestId);
  const target=dom(),sourceId=`preview-reply:${turn.requestId}`;let calls=0;
  await renderPhoneFrozen({root:target.root,sourceId,markerId:'m1',host:{async snapshot(id){calls++;return f.service.snapshot(id)},service(){throw Error('must not read current service')}}});assert.equal(calls,1);assert.ok(target.root.innerHTML.includes('inert'));assert.ok(target.root.innerHTML.includes('data-phone-open="forum-encore"'));const pending=await renderPhoneFrozen({root:target.root,sourceId:'missing',markerId:'m1',host:{snapshot:async()=>null,service(){throw Error('must not read')}}});assert.equal(pending.inspect().status,'pending');assert.ok(target.root.innerHTML.includes('本轮手机内容尚在接收'));pending.dispose();f.app.dispose();
});

test('rapid draft inputs persist the newest value and survive re-render',async()=>{
  const f=await fixture();f.app.open('group-watch');for(const value of ['新','新的','新的草稿'])f.listeners.input({target:{matches:s=>s==='[data-phone-send] [name="text"]',value}});await f.app.settled();f.app.refresh();await new Promise(r=>setTimeout(r,0));assert.equal(f.service.getState().drafts['group-watch'],'新的草稿');assert.ok(f.root.innerHTML.includes('新的草稿'));f.app.navigate('home');f.app.open('group-watch');assert.ok(f.root.innerHTML.includes('新的草稿'));f.app.dispose();
});

test('video self comments render with the me identity; readonly live has no send form',async()=>{
  const f=await fixture();f.app.open('video-encore');await f.app.send('视频评论作者兼容');assert.ok(f.root.innerHTML.includes('视频评论作者兼容'));assert.ok(!f.root.innerHTML.includes('这个页面暂时无法显示'));f.app.open('live-encore');assert.ok(!f.root.innerHTML.includes('data-phone-send'));f.app.dispose();
});

test('local storage rejects cross-window writes and preserves malformed bytes',async()=>{
  let raw=null,writes=0;const storage=createPhoneLocalStorage({getItem(){return raw},setItem(k,v){writes++;raw=v}},'test');assert.equal(await storage.load(),null);await storage.save({revision:0},{expectedRevision:null});await storage.save({revision:1},{expectedRevision:0});raw='{"revision":2}';await assert.rejects(()=>storage.save({revision:2},{expectedRevision:1}),e=>e.code==='PHONE_STORAGE_CHANGED');assert.equal(writes,2);let malformed='{';await assert.rejects(()=>createPhoneLocalStorage({getItem(){return malformed},setItem(){throw Error('must not write')}}).load(),e=>e.code==='PHONE_STORAGE_CORRUPT');assert.equal(malformed,'{');
});

test('shell escapes text and unknown inherited names; no independent API input',()=>{
  for(const kind of ['__proto__','constructor','toString','unknown'])assert.ok(renderPhoneShell({screen:'apps',apps:[{kind,id:'a',title:'<img onerror=x>'}]}).includes('&lt;img onerror=x&gt;'));const html=renderPhoneShell({screen:'settings',busy:true,preview:true});assert.ok(!html.includes('name="key"'));assert.ok(!html.includes('name="endpoint"'));assert.ok(html.includes('data-phone-fail-preview'));
});


test('empty host has all 17 app entries without fictional documents',()=>{const html=renderPhoneShell({screen:'home',apps:[]});assert.equal((html.match(/data-phone-empty-kind=/g)||[]).length,17);assert.equal((html.match(/data-phone-open=/g)||[]).length,0);const library=renderPhoneShell({screen:'apps',apps:[]});assert.equal((library.match(/暂无内容/g)||[]).length,17);});

test('frozen receipt waits for same source, refuses other chat, and late callbacks stay disposed',async()=>{
  const f=await fixture();f.app.open('forum-encore');await f.app.send('原消息');const turn=await f.app.prepare(),req=f.service.getState().requests[turn.requestId];await f.app.receive(JSON.stringify({requestId:turn.requestId,acks:req.actionIds,blocks:[],markers:[{id:'m1',thread:'forum-encore',floor:9}]}),turn.requestId);const frame=f.service.snapshot(`preview-reply:${turn.requestId}`);
  let result=null,current='phone-ui-test',resolveLate;const seen=[],events={};const target=dom();target.win.addEventListener=(name,fn)=>events[name]=fn;target.win.removeEventListener=name=>delete events[name];
  const host={contextKey:()=>current,async snapshot(source){seen.push(source);return typeof result==='function'?result():result;}};const frozen=await renderPhoneFrozen({root:target.root,host,sourceId:'fixed-source',markerId:'m1',expectedContextKey:'phone-ui-test',win:target.win});assert.equal(frozen.inspect().status,'pending');assert.equal(typeof events['tisya:phone-change'],'function');result=frame;events['tisya:phone-change']();await new Promise(r=>setTimeout(r,0));assert.equal(frozen.inspect().status,'ready');assert.deepEqual(seen,['fixed-source','fixed-source']);current='other-chat';await frozen.refresh();assert.equal(frozen.inspect().status,'failed');assert.ok(target.root.innerHTML.includes('已经离开'));assert.equal(seen.length,2);current='phone-ui-test';result=()=>new Promise(r=>resolveLate=r);const underway=frozen.refresh();await new Promise(r=>setTimeout(r,0));frozen.dispose();const before=target.root.innerHTML;resolveLate(frame);await underway;assert.equal(target.root.innerHTML,before);assert.equal(frozen.inspect().status,'closed');assert.equal(events['tisya:phone-change'],undefined);f.app.dispose();
});


test('whole-page marker includes frozen page body and recent original messages',async()=>{const f=await fixture();f.app.open('forum-encore');const turn=await f.app.prepare();await f.app.receive(JSON.stringify({requestId:turn.requestId,acks:[],blocks:[],markers:[{id:'whole',thread:'forum-encore'}]}),turn.requestId);const frozen=f.service.snapshot(`preview-reply:${turn.requestId}`);await f.app.send('未来追加不应进入定格');const body=phoneSnapshotBody(frozen,'whole').bodyHtml;assert.ok(body.includes('有人存到最后那段吗'));assert.ok(body.includes('等楼主回来'));assert.ok(body.includes('另有 1 条'));assert.ok(!body.includes('未来追加不应进入定格'));assert.ok(!body.includes('当时仅收录了页面标题'));f.app.dispose();});
