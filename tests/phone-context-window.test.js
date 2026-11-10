import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhoneState,queuePhoneAction,preparePhoneTurn,acceptPhoneTurn,exportPhone} from '../phone-core.mjs';
import {getDoc} from '../social-suite-core.mjs';
const at='2026-11-09T11:00:00Z',chat='context-window-chat';
const accounts={me:{name:'我'},a:{name:'网友',platform:'douban',personId:'person-a'},b:{name:'另一账号',platform:'douban',personId:'person-b'},d:{name:'联系人',platform:'dm',personId:'person-d',bio:'私聊资料正文不应塞入目录'}};
const stream=(id,items,extra={})=>({id,kind:'forum',title:id,visibility:'public',at,meta:{coreThread:{platform:'douban',baseTime:at}},items,...extra});
const queued=(s,action,n)=>queuePhoneAction(s,action,{actionId:'action-'+n,at});
const input=prepared=>JSON.parse(prepared.messages[1].content);

test('千楼仅投影末40条与动作/引用原楼，目录足以续楼且未选私聊正文不进入；旧请求重放逐字一致',()=>{
 const seed={accounts,documents:[
  stream('high',Array.from({length:1000},(_,i)=>({by:'a',text:i===499?'OMITTED_OLD_CANARY':`第${i+1}楼`,...(i===9?{quote:2}:i===999?{quote:10}:{})}))),
  stream('other',[{by:'b',text:'另一公开楼'}],{author:'b'}),
  {id:'private',kind:'dm',title:'本人私聊',visibility:'private',audience:['me'],author:'d',at,items:[{by:'d',text:'UNSELECTED_PRIVATE_BODY_CANARY'}]},
  {id:'hidden',kind:'dm',title:'HIDDEN_THREAD_CANARY',visibility:'private',audience:['other'],author:'d',at,items:[{by:'d',text:'HIDDEN_BODY_CANARY'}]}
 ]};
 let state=createPhoneState(seed,chat);state=queued(state,{kind:'message',threadId:'high',text:'回应早先第10楼',replyTo:10},1);state=queued(state,{kind:'reaction',threadId:'high',target:{floor:5},value:'like'},2);
 const before=exportPhone(state),prepared=preparePhoneTurn(state,{requestId:'r-high',anchorUid:'user',at}),data=input(prepared),high=data.threads.find(d=>d.id==='high');
 assert.equal(exportPhone(state),before);assert.equal(getDoc(state.suite,'high').items.length,1001);assert.equal(high.items.length,43);
 assert.deepEqual(high.items.slice(0,3).map(m=>m.floor),[2,5,10]);assert.deepEqual(high.items.slice(-40).map(m=>m.floor),Array.from({length:40},(_,i)=>962+i));
 assert.equal(high.meta.coreThread.nextFloor,1002);assert.equal(high.meta.coreThread.receipts,undefined);assert.equal(high.meta.coreThread.gaps,undefined);assert.equal(high.contextWindow.omittedItems,958);
 const other=data.index.find(d=>d.id==='other');assert.equal(other.nextFloor,2);assert.equal(other.author,'b');assert.equal(other.accounts.b.personId,'person-b');assert.deepEqual(other.accountIds,['b']);
 const priv=data.privateIndex.find(d=>d.id==='private');assert.equal(priv.nextFloor,2);assert.equal(priv.accounts.d.personId,'person-d');assert.equal(priv.accounts.d.bio,undefined);
 const encoded=JSON.stringify(data);assert.equal(encoded.includes('UNSELECTED_PRIVATE_BODY_CANARY'),false);assert.equal(encoded.includes('HIDDEN_THREAD_CANARY'),false);assert.equal(encoded.includes('HIDDEN_BODY_CANARY'),false);assert.equal(encoded.includes('OMITTED_OLD_CANARY'),false);
 const raw='<reply><body>正文</body><extra><phone>'+JSON.stringify({requestId:'r-high',acks:['action-1','action-2'],blocks:[{type:'forum',thread:'high',items:[{by:'a',text:'接受后的新楼'}]}],markers:[]})+'</phone></extra></reply>';
 state=acceptPhoneTurn(prepared.state,{sourceId:'assistant:1',uid:'assistant',candidate:'candidate',requestId:'r-high',raw,at}).state;
 state=queued(state,{kind:'message',threadId:'other',text:'之后的新行动'},3);
 assert.deepEqual(preparePhoneTurn(state,{replayRequestId:'r-high',at}).messages,prepared.messages);
});

test('非流评论补齐parentId链；极长引用闭包明确拒绝且原存档与待发不变',()=>{
 const comments=Array.from({length:200},(_,i)=>({id:'c'+(i+1),kind:'comment',by:'a',text:`评论${i+1}`,...(i===2?{parentId:'c1'}:{})}));
 let state=createPhoneState({accounts,documents:[{id:'post',kind:'weibo',title:'评论区',visibility:'public',author:'a',at,text:'帖子',items:comments}]},chat);
 state=queued(state,{kind:'message',threadId:'post',text:'回复旧评论',replyTo:'c3'},1);
 const view=input(preparePhoneTurn(state,{requestId:'r-comments',anchorUid:'user',at})).threads[0];
 assert.equal(view.items.length,42);assert.deepEqual(view.items.slice(0,2).map(i=>i.id),['c1','c3']);assert.equal(view.items.at(-1).parentId,'c3');
 const chain=createPhoneState({accounts,documents:[stream('chain',Array.from({length:200},(_,i)=>({by:'a',text:`链${i+1}`,...(i?{quote:i}:{})}))) ]},chat);
 const pending=queued(chain,{kind:'message',threadId:'chain',text:'需要处理的用户消息'},1),before=exportPhone(pending);
 assert.throws(()=>preparePhoneTurn(pending,{requestId:'too-long',anchorUid:'user',at}),e=>e.code==='PHONE_CONTEXT_LIMIT'&&e.details?.maxItems===160);
 assert.equal(exportPhone(pending),before);assert.equal(pending.actions[0].status,'queued');assert.equal(Object.keys(pending.requests).length,0);
});
