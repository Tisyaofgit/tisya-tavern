import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountMessageReader} from '../reader.js';
import {runDisplay} from '../reader-core.js';
import {presentationReferenceParameter} from '../extension-presentation.mjs';
import {fixture} from './fixtures/journey-r4.cjs';

const entry=(findRegex,replaceString)=>({name:'正文与扩展',enabled:true,placements:['char'],timing:'display',minDepth:null,maxDepth:null,findRegex,replaceString,trimStrings:[],substitution:'none'});
const projection=(source,rules)=>runDisplay({source,groups:[{id:'card',entries:rules}]});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const escapeCode=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function environment(){
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,root=d.createElement('div');d.body.append(root);
 return {w,d,root,tab:name=>root.querySelector('[data-reader-tab="'+name+'"]').click(),body:()=>root.querySelector('.tisya-reader-body')};
}

test('reader shares one full-message display projection between body and extra without repeating host regex',async()=>{
 const f=environment();let reader;
 try{
  const source=fixture({body:'1\n正文标记',extra:'<panel>扩展标记</panel>',taskExtra:'待定：PRIVATE_MACHINE_CANARY'}),message=Object.freeze({mes:source});let calls=0,prepared=0,raw=0,display;
  reader=mountMessageReader(f.d,f.root,{source,message,getNativeDisplay:()=>{calls++;return display=projection(source,[entry('/标记/g','<strong class="authored-mark">完成</strong>')]);},formatBody(){raw++;throw Error('prepared text must not run raw formatting again');},formatPreparedBody:text=>{prepared++;return text;}});
  assert.equal(calls,1);assert.equal(display.rules[0].matches,2);assert.equal(f.body().querySelector('.authored-mark').textContent,'完成');assert.match(f.body().textContent,/正文完成/);
  f.tab('extra');assert.match(f.root.querySelector('iframe').srcdoc,/扩展<strong class="authored-mark">完成<\/strong>/);
  f.tab('body');f.tab('extra');f.tab('body');assert.equal(calls,1);assert.equal(raw,0);assert.ok(prepared>=3);assert.equal(message.mes,source);assert.doesNotMatch(f.root.innerHTML,/PRIVATE_MACHINE_CANARY/);
 }finally{reader?.dispose();await f.w.happyDOM.abort();}
});

test('regex-generated prose marks honor reader appearance while authored HTML and code remain literal',async()=>{
 const f=environment();let reader;
 try{
  const mark='〔信笺：旧信〕字迹〔/信笺〕',source=fixture({body:'1\n替换标记\n\n2\n<pre><code>'+mark+'</code></pre>\n\n3\n<section class="card" data-label="'+mark+'">'+mark+'</section>'});let enabled=true,calls=0;
  reader=mountMessageReader(f.d,f.root,{source,getNativeDisplay:()=>{calls++;return projection(source,[entry('替换标记',mark)]);},formatBody:text=>text,formatPreparedBody:text=>text,getAppearance:()=>({标记信笺:enabled})});
  assert.equal(f.body().querySelectorAll('[data-tisya-mark="信笺"]').length,1);assert.equal(f.body().querySelector('[data-tisya-mark="信笺"] header').textContent,'旧信');
  assert.equal(f.body().querySelector('code').textContent,mark);assert.equal(f.body().querySelector('.card').textContent,mark);assert.equal(f.body().querySelector('.card').getAttribute('data-label'),mark);
  assert.match(f.root.querySelector('style').textContent,/data-tisya-mark/);enabled=false;f.tab('journey');f.tab('body');assert.equal(f.body().querySelectorAll('[data-tisya-mark]').length,0);assert.match(f.body().textContent,/〔信笺：旧信〕/);assert.equal(calls,1);
 }finally{reader?.dispose();await f.w.happyDOM.abort();}
});

test('reader preserves Markdown fenced and inline examples before host formatting instead of decorating literal marks',async()=>{
 const f=environment();let reader;
 try{
  const example='〔信笺:代码示例〕故意保留未闭合标记',fenced='```text\n'+example+'\n```',inline='`〔内心〕内联示例`',html='<!doctype html><html><head><style>.literal-card{color:red}</style></head><body><section class="literal-card">〔信笺〕HTML 示例〔/信笺〕</section></body></html>',htmlFence='```html\n'+html+'\n```',source=fixture({body:'1\n正文占位\n\n2\n'+fenced+'\n\n3\n'+inline+'\n\n4\n<![CDATA['+htmlFence+']]>'}),seen=[],errors=[];
  reader=mountMessageReader(f.d,f.root,{source,getNativeDisplay:()=>projection(source,[entry('正文占位','〔信笺:真正正文〕已美化〔/信笺〕')]),formatBody:text=>text,formatPreparedBody:text=>{seen.push(text);return text.replace(fenced,'<pre><code>'+escapeCode(example)+'</code></pre>').replace(inline,'<code>'+escapeCode(inline.slice(1,-1))+'</code>').replace(htmlFence,'<pre><code>'+escapeCode(html)+'</code></pre>');},onError:error=>errors.push(error)});
  assert.deepEqual(errors,[]);assert.equal(f.body().querySelectorAll('[data-tisya-mark]').length,1);assert.equal(f.body().querySelector('[data-tisya-mark] header').textContent,'真正正文');
  assert.ok(seen.some(text=>text.includes(fenced)&&text.includes(inline)&&text.includes(htmlFence)));assert.deepEqual([...f.body().querySelectorAll('code')].map(node=>node.textContent),[example,inline.slice(1,-1),html]);assert.equal(f.body().querySelector('iframe'),null);assert.equal(f.body().querySelector('.literal-card'),null);
 }finally{reader?.dispose();await f.w.happyDOM.abort();}
});

test('reader isolates regex-authored static documents and preserves their state while leaving script cards in the original message',async()=>{
 const f=environment();let reader;
 try{
  const ref={tableId:'T_DYN_TRANSFERS',recordId:'tr-card',snapshotId:'@message'},mark='〔消息:'+presentationReferenceParameter({kind:'transfer',reference:ref})+'〕卡片旁的记录〔/消息〕',staticDocument='<!doctype html><html><head><style>.static-card{color:#bcaf6c}</style></head><body><details class="static-card"><summary>状态卡</summary><p>独立样式正文</p></details></body></html>',scriptDocument='<!doctype html><html><body><button onclick="window.__readerDuplicate=(window.__readerDuplicate||0)+1">原卡交互</button><script>window.__readerDuplicate=1;</script></body></html>',source=fixture({body:'1\n前文\n\n2\n静态卡占位\n\n3\n交互卡占位\n\n4\n'+mark+'\n\n5\n后文'}),message=Object.freeze({mes:source}),errors=[];let calls=0,release;
  reader=mountMessageReader(f.d,f.root,{source,message,getNativeDisplay:()=>{calls++;return projection(source,[entry('静态卡占位','```html\n'+staticDocument+'\n```'),entry('交互卡占位','```html\n'+scriptDocument+'\n```')]);},formatBody(){throw Error('raw formatter must not run');},formatPreparedBody:text=>text,getPresentation:()=>new Promise(resolve=>release=resolve),onError:error=>errors.push(error)});
  const firstFrame=f.body().querySelector('iframe');assert.ok(firstFrame);assert.equal(f.body().querySelectorAll('iframe').length,1);assert.match(firstFrame.srcdoc,/\.static-card\{color:#bcaf6c\}/);assert.equal(f.body().querySelector('script'),null);assert.equal(f.w.__readerDuplicate,undefined);assert.match(f.body().textContent,/交互卡片.*原消息/);assert.match(f.body().textContent,/前文/);assert.match(f.body().textContent,/后文/);
  // happy-dom's srcdoc document omits the browser's iterable images collection.
  Object.defineProperty(firstFrame.contentDocument,'images',{value:[]});firstFrame.dispatchEvent(new f.w.Event('load'));
  firstFrame.contentDocument.querySelector('details').open=true;f.tab('body');assert.equal(f.body().querySelector('iframe'),firstFrame);assert.equal(firstFrame.contentDocument.querySelector('details').open,true);
  await flush();release({contextKey:'ctx',messageSnapshotId:'original-snapshot',projections:[{reference:{...ref,snapshotId:'original-snapshot'},contextKey:'ctx',kind:'transfer',allowed:true,value:{amount:789,currencyLabel:'银两',status:'已存'}}]});await flush();assert.match(f.body().textContent,/789 银两/);assert.equal(f.body().querySelector('iframe'),firstFrame);assert.equal(firstFrame.contentDocument.querySelector('details').open,true);
  f.tab('journey');f.tab('body');const restored=f.body().querySelector('iframe');
  Object.defineProperty(restored.contentDocument,'images',{value:[]});restored.dispatchEvent(new f.w.Event('load'));assert.equal(restored.contentDocument.querySelector('details').open,true);assert.equal(calls,1);assert.equal(message.mes,source);assert.deepEqual(errors,[]);
 }finally{reader?.dispose();await f.w.happyDOM.abort();}
});

test('record projections coexist with regex output and async arrival does not rerun display or replace another tab',async()=>{
 const f=environment();let reader;
 try{
  const ref={tableId:'T_DYN_TRANSFERS',recordId:'tr-1',snapshotId:'@message'},mark='〔消息:'+presentationReferenceParameter({kind:'transfer',reference:ref})+'〕转账记录〔/消息〕',source=fixture({body:'1\n旧正文\n\n2\n'+mark}),message=Object.freeze({mes:source});let calls=0,release;
  reader=mountMessageReader(f.d,f.root,{source,message,getNativeDisplay:()=>{calls++;return projection(source,[entry('旧正文','〔信笺：经过美化〕新正文〔/信笺〕')]);},formatBody:text=>text,formatPreparedBody:text=>text,getPresentation:()=>new Promise(resolve=>release=resolve)});
  assert.match(f.body().textContent,/新正文/);assert.match(f.body().textContent,/正在读取/);f.tab('journey');const previous=f.root.querySelector('.tisya-reader-panel').innerHTML;
  await flush();release({contextKey:'ctx',messageSnapshotId:'actual-source',projections:[{reference:{...ref,snapshotId:'actual-source'},contextKey:'ctx',kind:'transfer',allowed:true,value:{amount:123,currencyLabel:'银两',status:'已存'}}]});await flush();
  assert.equal(f.root.querySelector('.tisya-reader-panel').innerHTML,previous);f.tab('body');assert.match(f.body().textContent,/新正文/);assert.match(f.body().textContent,/123 银两/);assert.doesNotMatch(f.body().textContent,/旧正文/);assert.equal(calls,1);assert.equal(message.mes,source);
 }finally{reader?.dispose();await f.w.happyDOM.abort();}
});

test('a record reference introduced by regex uses the original message snapshot without another display pass',async()=>{
 const f=environment();let reader;
 try{
  const ref={tableId:'T_DYN_TRANSFERS',recordId:'tr-created',snapshotId:'@message'},mark='〔消息:'+presentationReferenceParameter({kind:'transfer',reference:ref})+'〕替换后的记录〔/消息〕',source=fixture({body:'1\n记录占位'}),message=Object.freeze({mes:source});let calls=0,lookups=0;
  assert.doesNotMatch(source,/@record\{/);
  reader=mountMessageReader(f.d,f.root,{source,message,getNativeDisplay:()=>{calls++;return projection(source,[entry('记录占位',mark)]);},formatBody:text=>text,formatPreparedBody:text=>text,getPresentation:selected=>{lookups++;assert.equal(selected,message);return {contextKey:'ctx',messageSnapshotId:'original-snapshot',projections:[{reference:{...ref,snapshotId:'original-snapshot'},contextKey:'ctx',kind:'transfer',allowed:true,value:{amount:456,currencyLabel:'银两',status:'已存'}}]};}});
  assert.match(f.body().textContent,/正在读取/);await flush();assert.match(f.body().textContent,/456 银两/);assert.doesNotMatch(f.body().textContent,/记录占位/);
  f.tab('journey');f.tab('body');assert.equal(calls,1);assert.equal(lookups,1);assert.equal(message.mes,source);
 }finally{reader?.dispose();await f.w.happyDOM.abort();}
});

test('a failed display pass stays visible and is not retried by reader tab changes',async()=>{
 const f=environment();let reader;
 try{
  const source=fixture({body:'1\n仍可阅读的正文',taskExtra:'待定：PRIVATE_MACHINE_CANARY'}),errors=[];let calls=0;
  reader=mountMessageReader(f.d,f.root,{source,getNativeDisplay:()=>{calls++;throw Object.assign(Error('TISYA_DISPLAY_CAPTURE_RANGE'),{code:'TISYA_DISPLAY_CAPTURE_RANGE'});},formatBody:text=>text,onError:error=>errors.push(error)});
  assert.equal(calls,1);assert.equal(errors.length,1);assert.match(f.root.querySelector('[role="status"]').textContent,/正文正则/);assert.match(f.body().textContent,/仍可阅读的正文/);
  f.tab('extra');f.tab('body');assert.equal(calls,1);assert.equal(errors.length,1);assert.doesNotMatch(f.root.innerHTML,/PRIVATE_MACHINE_CANARY/);
 }finally{reader?.dispose();await f.w.happyDOM.abort();}
});

test('reader without a display provider retains ordinary paragraph anchors and the original safe formatter',async()=>{
 const f=environment();let reader;
 try{
  const source=fixture({body:'1\n“原始正文。”\n\n2\n〔内心〕仍是原文。〔/内心〕'});let raw=0,prepared=0;
  reader=mountMessageReader(f.d,f.root,{source,formatBody:text=>{raw++;return text;},formatPreparedBody:text=>{prepared++;return text;}});
  assert.equal(raw,2);assert.equal(prepared,0);assert.equal(f.body().querySelectorAll('.tisya-reader-paragraph').length,2);assert.ok(f.body().querySelector('[data-tisya-mark="内心"]'));
 }finally{reader?.dispose();await f.w.happyDOM.abort();}
});
