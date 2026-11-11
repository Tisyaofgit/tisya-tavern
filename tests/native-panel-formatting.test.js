import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {installNativePanelFormatting} from '../native-panel-formatting.js';
import {fixture} from './fixtures/journey-r4.cjs';

const panel='<!DOCTYPE html>\n<html><body><button>neutral</button><script>window.neutralStarts=(window.neutralStarts||0)+1;</script></body></html>';
const display={extraPanels:[{id:'neutral',ruleName:'neutral-rule',html:'```html\n'+panel+'\n```'}]};
const base='<p>Public story</p><img src="/unchanged.png">';
function setup(){
 const w=new Window({settings:{disableIframePageLoading:true}}),d=w.document,buckets=new Map();
 const formatter={stage:{BEFORE_REGEX:'beforeRegex',AFTER_REGEX:'afterRegex',AFTER_MARKDOWN:'afterMarkdown'},order:{EARLIEST:0,LATEST:100},addHook(fn,{stage,order=50}={}){const rows=buckets.get(stage)??[];rows.push({fn,order});buckets.set(stage,rows);},runStage(stage,text,context){for(const row of [...(buckets.get(stage)??[])].sort((a,b)=>a.order-b.order))text=row.fn(text,Object.freeze({...context,stage}));return text;}};
 const messages=[{mes:fixture(),name:'Neutral',is_user:false,is_system:false},{mes:fixture({id:'second'}),name:'Neutral',is_user:false,is_system:false}];
 let active=true,key='chat-a',projects=0;const errors=[];
 const options={formatter,document:d,getMessage:id=>messages[id],scope:()=>key,enabled:()=>active,project:()=>{projects++;return display;},onError:error=>errors.push(error)};
 const context=(id=0,extra={})=>({messageId:id,ch_name:'Neutral',isSystem:false,isUser:false,isReasoning:false,...extra});
 const before=(text=messages[0].mes,c=context())=>formatter.runStage('beforeRegex',text,c);
 const after=(html=base,c=context())=>formatter.runStage('afterMarkdown',html,c);
 const output=html=>{const root=d.createElement('div');root.innerHTML=html;return root;};
 return {w,d,formatter,buckets,messages,options,context,before,after,output,errors,get projects(){return projects;},disable(){active=false;},enable(){active=true;},switchScope(){key='chat-b';}};
}

test('late-installed public formatter hooks add inert native sources for a complete current reply without modifying data',async()=>{
 const s=setup();try{
  // Initial autoload can precede extension activation; registration remains legal.
  assert.equal(s.after(),base);
  const original=JSON.stringify(s.messages),handle=installNativePanelFormatting(s.options);
  assert.equal(handle.installed,true);assert.equal(s.before(),s.messages[0].mes);
  const root=s.output(s.after());assert.equal(root.querySelectorAll('pre code').length,1);assert.equal(root.querySelector('code').textContent.trim(),panel);
  assert.equal(root.querySelectorAll('script,iframe').length,0);assert.equal(root.querySelector('img').getAttribute('src'),'/unchanged.png');
  assert.equal(s.w.neutralStarts,undefined);assert.equal(JSON.stringify(s.messages),original);assert.equal(s.projects,1);
 }finally{await s.w.happyDOM.abort();}
});
test('fragments, standalone previews, users, systems, reasoning, and partial envelopes never borrow a full reply',async()=>{
 const s=setup();try{
  installNativePanelFormatting(s.options);
  for(const [text,context] of [['body fragment',s.context()],[s.messages[0].mes,s.context(-1)],[s.messages[0].mes,s.context(0,{isUser:true})],[s.messages[0].mes,s.context(0,{isSystem:true})],[s.messages[0].mes,s.context(0,{isReasoning:true})],[s.messages[0].mes,s.context(0,{ch_name:'Other'})]]){s.before(text,context);assert.equal(s.after(base,context),base);}
  s.messages[0].mes='<reply><body>unfinished';s.before();assert.equal(s.after(),base);assert.equal(s.projects,0);
 }finally{await s.w.happyDOM.abort();}
});
test('overlapping same-message formatting refuses ambiguous outer and inner ownership',async()=>{
 const s=setup();try{
  installNativePanelFormatting(s.options);s.before();s.before('projected body');assert.equal(s.after(),base);
  assert.equal(s.after(),base);assert.equal(s.projects,0);
  s.before();s.before();assert.equal(s.after(),base);assert.equal(s.after(),base);assert.equal(s.projects,0);
 }finally{await s.w.happyDOM.abort();}
});
test('batch preparation retains independent tickets for messages formatted after an await',async()=>{
 const s=setup();try{
  installNativePanelFormatting(s.options);s.before(s.messages[0].mes,s.context(0));s.before(s.messages[1].mes,s.context(1));await Promise.resolve();
  assert.equal(s.output(s.after(base,s.context(0))).querySelectorAll('pre code').length,1);
  assert.equal(s.output(s.after(base,s.context(1))).querySelectorAll('pre code').length,1);assert.equal(s.projects,2);
 }finally{await s.w.happyDOM.abort();}
});
test('message replacement, source edits, scope changes, and disabled display invalidate a captured ticket',async()=>{
 for(const change of [s=>s.messages[0]={...s.messages[0]},s=>s.messages[0].mes+='changed',s=>s.messages[0].is_user=true,s=>s.messages[0].is_system=true,s=>s.messages[0].role='tool',s=>s.messages[0].name='Changed',s=>s.messages[0].extra={display_text:'different source'},s=>s.switchScope(),s=>s.disable()]){
  const s=setup();try{installNativePanelFormatting(s.options);s.before();change(s);assert.equal(s.after(),base);assert.equal(s.projects,0);}finally{await s.w.happyDOM.abort();}
 }
 const s=setup();try{installNativePanelFormatting(s.options);s.disable();s.before();s.enable();assert.equal(s.after(),base);}finally{await s.w.happyDOM.abort();}
});
test('existing runtime instances and unknown runtime sources are left byte-identical',async()=>{
 const s=setup();try{
  installNativePanelFormatting(s.options);
  for(const html of ['<div class="TH-render"><iframe src="about:blank"></iframe></div>','<iframe src="about:blank"></iframe>','<pre><code>&lt;html&gt;&lt;script&gt;unknown()&lt;/script&gt;&lt;/html&gt;</code></pre>']){s.before();assert.equal(s.after(html),html);}
 }finally{await s.w.happyDOM.abort();}
});
test('registration is idempotent and each ticket is consumed only once',async()=>{
 const s=setup();try{
  const handle=installNativePanelFormatting(s.options);assert.equal(installNativePanelFormatting(s.options),handle);
  assert.equal(s.buckets.get('beforeRegex').length,1);assert.equal(s.buckets.get('afterMarkdown').length,1);
  s.before();assert.equal(s.output(s.after()).querySelectorAll('pre').length,1);assert.equal(s.after(),base);assert.equal(s.projects,1);
 }finally{await s.w.happyDOM.abort();}
});
test('original projection errors are reported and return unchanged host HTML',async()=>{
 const s=setup(),error=new Error('neutral projection failure');try{
  s.options.project=()=>{throw error;};installNativePanelFormatting(s.options);s.before();assert.equal(s.after(),base);assert.equal(s.errors.length,1);assert.equal(s.errors[0],error);assert.equal(s.after(),base);
 }finally{await s.w.happyDOM.abort();}
});
test('missing public formatter is explicitly unavailable and installs no global replacements',async()=>{
 const s=setup();try{assert.equal(installNativePanelFormatting({...s.options,formatter:null}).installed,false);assert.equal(s.buckets.size,0);}finally{await s.w.happyDOM.abort();}
});

function mount(s,html=base){s.d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"></div></div></div></div>';const node=s.d.querySelector('.mes');node.querySelector('.mes_text').innerHTML=html;return node;}
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
test('initial eager repair refreshes only a missing public source once, using a clone of deeply frozen message data',async()=>{
 const s=setup();try{
  const node=mount(s);s.messages[0].extra={file:{url:'/original.txt'},image:'/original.png'};s.messages[0].swipes=[s.messages[0].mes,'other candidate'];freeze(s.messages[0]);
  const original=JSON.stringify(s.messages[0]),updates=[],requests=[];
  const handle=installNativePanelFormatting({...s.options,isEager:()=>true,updateMessageBlock(id,copy,options){
   updates.push({id,copy,options});assert.notEqual(copy,s.messages[0]);assert.notEqual(copy.extra,s.messages[0].extra);
   copy.extra.files=[copy.extra.file];delete copy.extra.file;copy.swipes.push('display-only mutation');
   s.before(copy.mes,s.context(id));node.querySelector('.mes_text').innerHTML=s.after(base,s.context(id));
   // A synchronous decoration callback must not recursively refresh this floor.
   void handle.repairMissing();
  },requestRender:async id=>{requests.push(id);assert.equal(node.querySelectorAll('pre').length,1);}});
  assert.deepEqual(await handle.repairMissing(),[{messageId:0,status:'render-requested'}]);
  assert.deepEqual(await handle.repairMissing(),[]);assert.equal(updates.length,1);assert.deepEqual(requests,[0]);
  assert.equal(JSON.stringify(s.messages[0]),original);assert.equal(Object.isFrozen(s.messages[0].extra),true);assert.equal(Object.isFrozen(s.messages[0].swipes),true);
  assert.equal(node.querySelectorAll('iframe,script').length,0);assert.equal(handle.state().repairAttempts,1);assert.equal(handle.state().sourcePrepared,1);assert.equal(handle.state().renderRequests,1);
 }finally{await s.w.happyDOM.abort();}
});
test('initial recovery never refreshes existing source/runtime/editor nodes, including frames in shadow DOM',async()=>{
 for(const html of ['<pre>existing source</pre>','<iframe src="about:blank"></iframe>','<div class="TH-render"></div>','<div class="xiaobaix-iframe-wrapper"></div>','<i data-tt-runtime-slot-id="kept"></i>','<i class="tt-runtime-placeholder"></i>','<i class="tt-runtime-ghost"></i>','<textarea>edit</textarea>','<div contenteditable="true">edit</div>','<div aria-busy="true"></div>']){
  const s=setup();try{const node=mount(s,html),before=node.innerHTML;let calls=0;const handle=installNativePanelFormatting({...s.options,isEager:()=>true,updateMessageBlock(){calls++;},requestRender(){calls++;}});assert.deepEqual(await handle.repairMissing(),[]);assert.equal(calls,0);assert.equal(node.innerHTML,before);}finally{await s.w.happyDOM.abort();}
 }
 const s=setup();try{const node=mount(s),host=s.d.createElement('div');node.append(host);host.attachShadow({mode:'open'}).innerHTML='<iframe src="about:blank"></iframe>';let calls=0;const handle=installNativePanelFormatting({...s.options,isEager:()=>true,updateMessageBlock(){calls++;},requestRender(){calls++;}});await handle.repairMissing();assert.equal(calls,0);assert.ok(host.shadowRoot.querySelector('iframe'));}finally{await s.w.happyDOM.abort();}
});
test('disabled, managed, generating, unchanged projection, and switched context prevent eager refresh',async()=>{
 for(const options of [{enabled:()=>false},{isEager:()=>false},{busy:()=>true},{project:()=>({extraPanels:[]})}]){
  const s=setup();try{mount(s);let calls=0;const handle=installNativePanelFormatting({...s.options,isEager:()=>true,...options,updateMessageBlock(){calls++;},requestRender(){calls++;}});await handle.repairMissing();assert.equal(calls,0);assert.equal(handle.state().repairAttempts,0);}finally{await s.w.happyDOM.abort();}
 }
 const s=setup();try{mount(s);let calls=0;const handle=installNativePanelFormatting({...s.options,isEager:()=>true,project:()=>{s.switchScope();return display;},updateMessageBlock(){calls++;},requestRender(){calls++;}});await handle.repairMissing();assert.equal(calls,0);}finally{await s.w.happyDOM.abort();}
});
test('failed or ineffective eager refresh records its first attempt and does not loop or fabricate a render request',async()=>{
 for(const fail of [true,false]){
  const s=setup(),error=new Error('neutral refresh failure');try{mount(s);let updates=0,requests=0;const handle=installNativePanelFormatting({...s.options,isEager:()=>true,updateMessageBlock(){updates++;if(fail)throw error;},requestRender(){requests++;}});
   await handle.repairMissing();await handle.repairMissing();assert.equal(updates,1);assert.equal(requests,0);assert.equal(handle.state().repairAttempts,1);
   assert.equal(handle.state().lastRecovery.status,fail?'failed':'source-not-prepared');if(fail)assert.equal(s.errors[0],error);
  }finally{await s.w.happyDOM.abort();}
 }
});
test('ambiguous message nodes and DOM ownership changes never target an eager refresh',async()=>{
 for(const change of [node=>node.parentElement.append(node.cloneNode(true)),node=>node.setAttribute('mesid','1'),node=>node.querySelector('.mes_text').replaceWith(node.ownerDocument.createElement('div'))]){
  const s=setup();try{const node=mount(s);let calls=0;const handle=installNativePanelFormatting({...s.options,isEager:()=>true,project:()=>{change(node);return display;},updateMessageBlock(){calls++;},requestRender(){calls++;}});await handle.repairMissing();assert.equal(calls,0);assert.equal(handle.state().repairAttempts,0);}finally{await s.w.happyDOM.abort();}
 }
});
test('interleaved same-id batches cannot lend a full reply ticket to a later fragment',async()=>{
 const s=setup();try{
  installNativePanelFormatting(s.options);s.before();s.before('fragment');
  assert.equal(s.after('<p>full result</p>'),'<p>full result</p>');
  assert.equal(s.after('<p>fragment result</p>'),'<p>fragment result</p>');assert.equal(s.projects,0);
  s.before();s.before('fragment');assert.equal(s.after(),base);s.before();assert.equal(s.after(),base);assert.equal(s.after(),base);assert.equal(s.projects,0);
 }finally{await s.w.happyDOM.abort();}
});
