import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountNotebook,notebookEntry} from '../notebook.js';
import {readerErrorCode,readerErrorText} from '../reader.js';
import {fixture,richFixture,PUBLIC,SECRET} from './fixtures/journey-r4.cjs';

function setup(chat,mode='notes'){
    const w=new Window({url:'http://localhost'}),d=w.document,root=d.createElement('main');d.body.append(root);
    const ctx={chat,getCurrentChatId:()=> 'current'},read=[],located=[],errors=[];
    const view=mountNotebook(d,root,{getContext:()=>ctx,mode,onRead:(...args)=>read.push(args),onLocate:token=>located.push(token),onError:error=>errors.push(error.message)});
    return {w,d,root,ctx,view,read,located,errors,done:()=>w.happyDOM.whenAsyncComplete(),stop:async()=>{view.dispose();await w.happyDOM.abort();}};
}
const messages=n=>Array.from({length:n},(_,i)=>({mes:`第${i+1}条正文`,name:'月潮',swipe_id:0}));
test('public memory projection excludes secret rows, task, truth tags, conditions and psychology',()=>{
    const source=richFixture(),ctx={chat:[{mes:source}],getCurrentChatId:()=> 'a'};
    const entry=notebookEntry(ctx,0,'memory');assert.match(entry.text,/白鹭渡口/);assert.match(entry.text,/false/);assert.match(entry.text,/true/);assert.equal(entry.text.includes('SECRET_SENTINEL'),false);assert.equal(entry.text.includes('<task'),false);assert.equal(ctx.chat[0].mes,source);
    const hidden=fixture({memory:`事件：幕后人物|${JSON.stringify(SECRET)}|SECRET_ONLY\n场景：SECRET_TITLE|[null,null]|~|~`});
    ctx.chat[0].mes=hidden;assert.equal(notebookEntry(ctx,0,'memory'),null);
});
test('reader diagnostics allow only a bounded standalone code, never raw error details',()=>{
    assert.equal(readerErrorCode(Error('TISHA_OUTPUT_BODY')),'TISHA_OUTPUT_BODY');
    for(const error of [{message:'SECRET_PAYLOAD'}, {code:'<script>SECRET</script>'},{message:'TISHA_OUTPUT_BODY SECRET_PAYLOAD'}]){
        const code=readerErrorCode(error);assert.equal(code,'TISYA_READER_INVALID');assert.equal(readerErrorText(code).includes('SECRET'),false);
    }
    assert.match(readerErrorText('TISYA_JOURNEY_MEMORY_UNSUPPORTED'),/权限/);
});
test('memory search preserves explicit null, zero, false and deletion as historical changes',()=>{
    const p=JSON.stringify(PUBLIC),source=fixture({memory:`事件：玩家|${p}|门的记录\n变动：门|开启|false|0|${p}\n变动：门|备注|~|null|${p}\n变动：门|锁|0|~|${p}\n变因：开门`});
    const entry=notebookEntry({chat:[{mes:source}],getCurrentChatId:()=> 'a'},0,'memory');
    assert.equal(entry.error,null);for(const word of ['false','0','null','已移除'])assert.ok(entry.text.includes(word),word);
});
test('search only indexes public projected fields and can find text beyond a short preview',async()=>{
    const f=setup([{mes:richFixture()},{mes:fixture({body:'1\n'+'雨'.repeat(400)+'灯塔'})}],'notes');await f.done();
    const search=f.root.querySelector('input');search.value='灯塔';search.dispatchEvent(new f.w.Event('input'));assert.equal(f.root.querySelectorAll('article').length,1);assert.match(f.root.textContent,/第 2 条/);
    search.value='SECRET_SENTINEL';search.dispatchEvent(new f.w.Event('input'));assert.equal(f.root.querySelectorAll('article').length,0);assert.equal(f.root.textContent.includes('SECRET_SENTINEL'),false);
    await f.stop();
    const memory=setup([{mes:richFixture()}],'memory');await memory.done();assert.equal(memory.root.querySelectorAll('article').length,1);assert.equal(memory.root.textContent.includes('SECRET_SENTINEL'),false);await memory.stop();
});
test('plain messages appear in notes, not as invented memory; hidden memory creates no empty result',async()=>{
    const hidden=fixture({memory:`事件：幕后人物|${JSON.stringify(SECRET)}|SECRET_ONLY`});
    const f=setup([{mes:'普通正文'},{mes:hidden}],'memory');await f.done();assert.equal(f.root.querySelectorAll('article').length,0);assert.match(f.root.textContent,/没有可显示/);assert.equal(f.root.textContent.includes('SECRET_ONLY'),false);await f.stop();
});
test('recent-first pagination skips unloaded and system messages and keeps original message ids',async()=>{
    const chat=messages(26);delete chat[5];chat[6].is_system=true;
    const f=setup(chat);await f.done();assert.equal(f.root.querySelectorAll('article').length,20);assert.match(f.root.querySelector('h3').textContent,/第 26 条/);
    f.root.querySelector('.tisya-notebook-pager').children[1].click();assert.equal(f.root.querySelectorAll('article').length,4);assert.match(f.root.querySelector('h3').textContent,/第 4 条/);
    f.root.querySelector('article button').click();assert.equal(f.read[0][0].id,3);assert.equal(f.read[0][1],'body');
    f.root.querySelector('article .tisya-notebook-actions').children[1].click();assert.equal(f.located[0].message,chat[3]);assert.deepEqual(f.errors,[]);await f.stop();
});
for(const change of ['text','swipe','replace','append','delete','chat','speaker'])test('a '+change+' change invalidates old rows and retained buttons before they act',async()=>{
    const f=setup(messages(3));await f.done();const old=f.root.querySelector('article button');
    if(change==='text')f.ctx.chat[2].mes='改写内容';if(change==='swipe')f.ctx.chat[2].swipe_id=1;if(change==='replace')f.ctx.chat[2]={...f.ctx.chat[2]};if(change==='append')f.ctx.chat.push({mes:'新增'});if(change==='delete')f.ctx.chat.splice(0,1);if(change==='chat')f.ctx.getCurrentChatId=()=> 'other';if(change==='speaker')f.ctx.chat[2].name='新的角色';
    old.click();assert.equal(f.read.length,0);assert.equal(f.root.querySelectorAll('article').length,0);assert.match(f.root.textContent,/已变化/);assert.equal(f.root.querySelector('input').disabled,true);await f.stop();
});
test('editing during a batch discards the incomplete index; explicit refresh reads the new source',async()=>{
    const f=setup(messages(60));f.w.setTimeout(()=>{f.ctx.chat[59].mes='更新后的公开正文';},0);await f.done();assert.equal(f.root.querySelectorAll('article').length,0);assert.match(f.root.textContent,/已变化/);
    f.root.querySelector('.tisya-notebook-pager').lastElementChild.click();await f.done();assert.match(f.root.querySelector('article').textContent,/更新后的公开正文/);await f.stop();
});
test('dispose cancels pending work and retained controls, with no writes to messages',async()=>{
    const chat=messages(40),before=JSON.stringify(chat),f=setup(chat);f.view.dispose();await f.done();assert.equal(f.root.childElementCount,0);assert.equal(JSON.stringify(chat),before);await f.stop();
    const ready=setup(messages(2),'memory');await ready.done();ready.view.dispose();assert.deepEqual(ready.read,[]);await ready.stop();
});
test('malformed private structure shows a safe diagnostic without making raw content searchable',async()=>{
    const f=setup([{mes:'<reply><task>SECRET_PAYLOAD</task></reply>'}]);await f.done();assert.match(f.root.textContent,/消息结构/);assert.equal(f.root.textContent.includes('SECRET_PAYLOAD'),false);assert.equal(f.root.querySelectorAll('article').length,1);await f.stop();
});
