import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {readMatrixDetails} from '../engine/display.mjs';
import {mountHeartBlock} from '../reply-details.js';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {createMessageCache,messageCacheOwner} from '../message-cache.js';
import {startReaderCache,prepareReaderMessage} from '../reader.js';
import {tagRevision} from '../engine/tags.mjs';
import {replyFormatRevision} from '../reply-formats.js';

test('both anchors retain all three long comments, literal text, order and per-item expressions',async()=>{
 const labels=['输入评价','与用户互动','剧情吐槽'],moods=['开心','促狭','憋笑'];
 const rows=labels.map((label,i)=>({label,mood:'@rendering{emotion.'+moods[i]+'}',text:label+'：'+('这段中性评论需要完整显示。'.repeat(i===1?90:12))+'第'+i+'条结束。'}));
 const anchors=rows.map(r=>[r.label,r.mood,r.text].join('|')).join('\n');
 const source='<reply><task/><anchor phase="before">'+anchors+'</anchor><title>灯下|夜|门口|测试</title><body>1 门灯亮着。</body><anchor phase="after">'+anchors+'</anchor><extra/><cells/><vars/><archive/><actions/></reply>';
 const original=source,details=readMatrixDetails(source);assert.equal(source,original);
 for(const group of [details.taskHeart,details.nextHeart]){
  assert.equal(group.items.length,3);assert.deepEqual(group.items.map(r=>r.text),rows.map(r=>r.text));assert.deepEqual(group.items.map(r=>r.mood),rows.map(r=>r.mood));
  const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const host=mountHeartBlock(w.document,root,group),bubble=host.querySelector('button');
  for(let i=0;i<3;i++){assert.equal(bubble.querySelector('span').textContent,rows[i].text);assert.equal(host.dataset.mood,rows[i].mood);assert.equal(host.querySelectorAll('.heart-dots i').length,3);bubble.click();}
  host.restoreHeart(1);assert.equal(bubble.querySelector('span').textContent,rows[1].text);const selected=host.captureHeart();host.disposeHeart();host.remove();const reopened=mountHeartBlock(w.document,root,group);reopened.restoreHeart(selected);assert.equal(reopened.querySelector('button span').textContent,rows[1].text);reopened.disposeHeart();await w.happyDOM.abort();
 }
});

test('an old saved projection with one remaining comment is reparsed while source and reading state survive',async()=>{
 const text='这是一条超过旧限制的中性评论。'.repeat(12),rows='输入评价|@rendering{emotion.开心}|'+text+'\n与用户互动|@rendering{emotion.促狭}|'+text+'\n剧情吐槽|@rendering{emotion.憋笑}|最后一条短评论。';
 const source='<reply><task/><anchor phase="before">'+rows+'</anchor><title>门灯|夜|院门|测试</title><body>1 门灯亮着。</body><anchor phase="after">'+rows+'</anchor><extra/><cells/><vars/><archive/><actions/></reply>',message={mes:source,name:'角色',send_date:'fixed'},w={indexedDB:new IDBFactory(),crypto:webcrypto},identity={scope:'old-heart-cache',owner:messageCacheOwner(message),source},view={folds:{task:true}};
 const old=createMessageCache(w,{version:'reader-six-w54.1'});await old.reconcile(identity.scope,[message]);
 await old.prepare({...identity,variant:'matrix-v1:'+tagRevision()+':'+replyFormatRevision()+':'+JSON.stringify({showPsychology:false,playerName:null})},()=>({structured:true,body:{value:'门灯亮着。'},details:{value:{nextHeart:{status:'有内容',items:[{type:'剧情吐槽',mood:null,text:'最后一条短评论。'}]}}}}));
 await old.saveView(identity,view);await old.flush();await old.dispose();
 const current=startReaderCache(w),packet=await prepareReaderMessage(identity);assert.equal(packet.inspection.details.value.taskHeart.items.length,3);assert.equal(packet.inspection.details.value.nextHeart.items.length,3);assert.deepEqual(packet.viewState,view);assert.equal(message.mes,source);await current.dispose();
});
