import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {readStreamingReply,mountStreamingMessage,streamingMessageSource} from '../streaming-message.js';
import {configureTags,DEFAULT_TAGS} from '../engine/tags.mjs';
import {mountMessageAppearance} from '../message-ui.js';
import {appearanceValues} from '../appearance-settings.js';
const format=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const prefix='<reply><task>PRIVATE <body>not prose</body></task><anchor phase="before">PRIVATE HEART</anchor><title>夜门|夜间</title><body>';
const tail='</body><vars>PRIVATE STATE</vars><actions>待结束后才启用</actions></reply>';

test('streaming projection reads only top-level prose and supports configured tags and aliases',()=>{
 assert.equal(readStreamingReply(prefix).body,'');
 assert.equal(readStreamingReply(prefix+'1 光落在门上。<bo').body,'1 光落在门上。');
 assert.equal(readStreamingReply('<reply><task><body>PRIVATE').body,null);
 configureTags({...DEFAULT_TAGS,reply:'scene.',body:'story-'},[{...DEFAULT_TAGS,reply:'old.',body:'old-body'}]);
 assert.equal(readStreamingReply('<scene.><task/><story->1 新正文').body,'1 新正文');
 assert.equal(readStreamingReply('<old.><old-body>1 旧标签').body,'1 旧标签');
 configureTags();
});

test('streaming prose grows before closing its block, retains completed nodes and hides machine blocks',async()=>{
 const w=new Window(),d=w.document,errors=[];
 const view=mountStreamingMessage(d,{formatBody:format,getAppearance:k=>appearanceValues({},k),styleText:'',onError:e=>errors.push(e)});d.body.append(view.host);
 view.update(prefix+'1 第一段。\n\n2 正在');
 const root=view.host.shadowRoot,first=root.querySelector('.reading-paragraph'),second=root.querySelectorAll('.reading-paragraph')[1];
 assert.equal(root.querySelectorAll('.reading-paragraph').length,2);assert.match(root.querySelector('.story').textContent,/正在/);assert.doesNotMatch(root.textContent,/PRIVATE/);
 view.update(prefix+'1 第一段。\n\n2 正在生长。\n\n3 第三段。'+tail);
 assert.equal(root.querySelector('.reading-paragraph'),first);assert.equal(root.querySelectorAll('.reading-paragraph')[1],second);assert.equal(root.querySelectorAll('.reading-paragraph').length,3);assert.doesNotMatch(root.textContent,/PRIVATE STATE|待结束/);
 assert.equal(root.querySelectorAll('button,script,iframe').length,0);assert.equal(errors.length,0);view.dispose();await w.happyDOM.abort();
});

test('appearance mutation refresh stays incremental and interrupted prose survives until edit or teardown',async()=>{
 const w=new Window({settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}}),d=w.document;
 d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"></div></div></div></div>';
 const node=d.querySelector('.mes'),native=node.querySelector('.mes_text'),msg={mes:prefix+'1 已收到',name:'角色'};let pending=true;
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,getPending:()=>pending,formatBody:format,getMotion:()=>false,onChooseAction(){}});
 ui.sync(node);const host=node.querySelector('.tisya-message-stream');assert.ok(host);assert.match(host.shadowRoot.querySelector('.story').textContent,/已收到/);
 msg.mes+='第一段。\n\n2 下一段';native.textContent=msg.mes;await new Promise(r=>w.setTimeout(r,20));
 assert.equal(node.querySelector('.tisya-message-stream'),host);assert.equal(host.shadowRoot.querySelectorAll('.reading-paragraph').length,2);
 pending=false;ui.sync(node);assert.equal(node.querySelector('.tisya-message-stream'),host);assert.match(host.shadowRoot.querySelector('[role=status]').textContent,/尚未通过完整校验/);
 node.classList.add('editing');ui.sync(node);assert.equal(node.querySelector('.tisya-message-stream'),null);assert.equal(native.classList.contains('tisya-source-concealed'),false);
 ui.dispose();await w.happyDOM.abort();
});

test('native uncommitted processor text renders without changing chat, and cannot cross message or document ownership',async()=>{
 const w=new Window(),d=w.document;d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"></div></div></div></div>';
 const node=d.querySelector('.mes'),msg={mes:'',name:'角色'},p={messageId:0,messageDom:[node],result:prefix+'1 原生临时正文',isStopped:false,isFinished:false},ctx={chat:[msg],streamingProcessor:p};
 const ui=mountMessageAppearance(d,{getMessage:()=>msg,getPending:()=>!p.isStopped,getStreamingSource:(n,m)=>streamingMessageSource(ctx,n,m),formatBody:format,getMotion:()=>false,onChooseAction(){}});
 ui.sync(node);const host=node.querySelector('.tisya-message-stream');assert.match(host.shadowRoot.querySelector('.story').textContent,/原生临时正文/);assert.equal(msg.mes,'');
 p.messageDom=node;assert.equal(streamingMessageSource(ctx,node,msg),p.result);
 p.result+='。\n\n2 接着增长';ui.sync(node);assert.equal(node.querySelector('.tisya-message-stream'),host);assert.equal(host.shadowRoot.querySelectorAll('.reading-paragraph').length,2);assert.equal(msg.mes,'');
 p.isStopped=true;ui.sync(node);assert.match(host.shadowRoot.querySelector('.story').textContent,/接着增长/);assert.match(host.shadowRoot.querySelector('[role=status]').textContent,/尚未通过完整校验/);
 p.isStopped=false;p.messageDom=[d.createElement('div')];assert.equal(streamingMessageSource(ctx,node,msg),'');p.messageDom=[node];ctx.chat=[{mes:''}];assert.equal(streamingMessageSource(ctx,node,msg),'');ui.dispose();await w.happyDOM.abort();
});
