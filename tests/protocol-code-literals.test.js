import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {xmlTokens} from '../reader-core.js';
import {inspectMessage,readerErrorCode,readerErrorText,startReaderCache,prepareReaderMessage} from '../reader.js';
import {envelope,parseReply} from '../engine/reply.mjs';
import {configureTags,DEFAULT_TAGS,tagRevision,normalizeEnvelope,validateTags} from '../engine/tags.mjs';
import {opaqueBlockEnd} from '../native-mvu-wire.js';
import {runReplyDisplay} from '../reply-protocol.js';
import {readPublicReplyEnvelope,replyFormatRevision} from '../reply-formats.js';
import {mountMessageVisual} from '../message-ui.js';
import {createMessageCache,messageCacheOwner} from '../message-cache.js';

// Same tag/attribute, CDATA and 52-paragraph shape as the reported failure.
// All narrative and machine values are independent neutral test content.
const native='<UpdateVariable><Analysis>Scene changed.</Analysis><JSONPatch>[{"op":"replace","path":"/地点","value":"档案室"}]</JSONPatch></UpdateVariable>';
const sample=({task='叙事|严守`<Pref_Narrative> @POV.PERSON`与规则\n文风|参考`<Pref_Style>`、`<Pref_LexicalGate>`及`<Pref_Style> @TISYA_THERMAL_WORDING`',extra='<StatusPlaceHolderImpl/>'}={})=>`<reply id="tisya-onepass-1">
<task format="pipes">${task}
</task>
<anchor phase="before">构想|整理档案\n输入评价|@rendering{emotion.开心}|已观察\n与用户互动|@rendering{emotion.促狭}|继续核对\n剧情吐槽|@rendering{emotion.憋笑}|纸张很多</anchor>
<title format="pipes">档案核对|午后至黄昏|档案室|中性测试</title>
<body min="2000" max="5000" unit="字">${Array.from({length:52},(_,i)=>`${i+1} 第${i+1}段：旅人将记录逐项与地图核对。`).join('\n')}</body>
<anchor phase="after">立住了|记录已核对\n变局|移至档案室\n已交付|保留五十二段正文\n输入评价|@rendering{emotion.开心}|已完成\n与用户互动|@rendering{emotion.促狭}|可以查看\n剧情吐槽|@rendering{emotion.憋笑}|仍有纸张</anchor>
<extra>${extra}<cells format="delta">@TIME: tick(+2h) | P42\n@EVENTS+: e18[黄昏]：中性记录 | P1..P52\n@PACTS+: p03 | 旅人、同伴 | 核对地图 | 稍后重试 | 生效 | P5..P36</cells><vars format="xml"><![CDATA[${native}]]></vars></extra>
<archive format="form">【地点底档／1】\n1 地点名称：档案室 | P45\n【当前场景与时钟／1】\n1 场景名称：档案核对 | P45</archive>
<actions min="4" max="6">观察|查看地图|观察\n试探|询问记录|询问\n交锋|核对纸张|确认\n拉扯|稍作休息|等待</actions>
</reply>`;

test('reported text-slot code literals preserve all 52 paragraphs, actions, source bytes and opaque machine payload',()=>{
 const source=sample(),snapshot=source,parsed=parseReply(source,'neutral-source'),view=inspectMessage(source),publicReply=readPublicReplyEnvelope(source),display=runReplyDisplay({source});
 assert.equal(view.body.error,undefined);assert.equal(view.body.paragraphs.value.length,52);assert.equal(view.actions.value.length,4);assert.equal(view.details.value.taskHeart.items.length,3);assert.equal(view.details.value.nextHeart.items.length,3);
 assert.equal(publicReply.v3.paragraphs.length,52);assert.match(display.body,/第52段/);assert.doesNotMatch(display.body,/@TIME|UpdateVariable|Pref_Narrative/);
 assert.equal(parsed.reply_raw,source);assert.equal(parsed.fragments.length,52);assert.equal(parsed.native_vars,`<![CDATA[${native}]]>`);assert.equal(parsed.cells_format,'delta');assert.match(parsed.cells_raw,/@TIME/);assert.equal(source,snapshot);
 const tokens=[...xmlTokens(source,{literalAmpersands:true,rawVarsJSON:true})];assert(tokens.some(t=>t.literalCode==='inline'));for(const token of tokens)if(token.literalCode)assert.equal(token.raw,source.slice(token.start,token.end));
});

test('literal boundaries support matching inline runs and closed CRLF fences without swallowing real structural mistakes',()=>{
 for(const task of ['叙事|``<Pref_Narrative> ` 字面量``','叙事|`</task><vars/>`','叙事|引用\n```xml\n<Pref_Narrative>\n```','叙事|引用\r\n~~~xml\r\n<Pref_Narrative>\r\n~~~~','叙事|引用\n```\n```\n~~~xml\n<Pref_Style>\n~~~'])assert.equal(inspectMessage(sample({task})).body.error,undefined,task);
 for(const task of ['叙事|裸标签<Pref_Narrative>','叙事|未闭代码`<Pref_Narrative>','叙事|转义反引号\\`<Pref_Narrative>`','叙事|未闭围栏\n```xml\n<Pref_Narrative>'])assert.throws(()=>envelope(sample({task})),task);
});

test('custom text-slot names use the same literal boundaries, including a quoted closing alias',()=>{
 const tags={reply:'answer',task:'plan',anchor:'check',title:'heading',body:'story',extra:'attachments',cells:'updates',vars:'variables',archive:'records',actions:'choices'};configureTags(tags);
 try{
  let source=sample();for(const [canonical,alias]of Object.entries(tags))source=source.replace(new RegExp('<(/?)'+canonical+'(?=[\\s/>])','g'),'<$1'+alias);
  source=source.replace('叙事|严守','叙事|引用`</plan>`，严守');
  const parsed=parseReply(source,'renamed'),view=inspectMessage(source);assert.equal(view.body.error,undefined);assert.equal(view.body.paragraphs.value.length,52);assert.match(parsed.anchors.before,/整理档案/);assert.match(envelope(source).blocks.task,/`<\/plan>`/);assert.equal(parsed.reply_raw,source);
 }finally{configureTags(DEFAULT_TAGS);}
});

test('alias boundary scans preserve raw script/style text beside code without giving root aliases or machines raw-text ownership',()=>{
 const tags=validateTags({...DEFAULT_TAGS,reply:'scene.wrap',body:'story.part'});
 const inner='1 原文 `<Pref_Narrative>` <section><ScRiPt>const sample = `</STORY.PART><vars/>`; const other = "</storyXpart>";</sCrIpT><style data-note="`attribute`">body::before{content:"</STORY.PART> `literal`";}</style></section> <body>嵌套数据</body>';
 const raw='<SCENE.WRAP><STORY.PART>'+inner+'</STORY.PART><cells/></SCENE.WRAP>';
 assert.equal(normalizeEnvelope(raw,tags),'<reply><body>'+inner+'</body><cells/></reply>');
 for(const name of ['script','style'])assert.equal(opaqueBlockEnd('<'+name+'>1 <unclosed></'+name+'>',0,xmlTokens,'body'),null,'a root alias is a protocol slot, not native raw text');
 const machineTags={cells:'updates',vars:'variables',extra:'attachments',archive:'records'};
 for(const [owner,alias]of Object.entries(machineTags)){
  const payload='<script>const sample = `</wrong>`;</script>';
  assert.equal(opaqueBlockEnd('<'+alias+'>'+payload+'</'+alias+'>',0,xmlTokens,owner,machineTags),null,owner);
  assert.equal(opaqueBlockEnd('<story>1 <'+alias+'>'+payload+'</'+alias+'></story>',0,xmlTokens,'body',machineTags),null,'nested '+owner);
  for(const rawName of ['script','style'])assert.equal(opaqueBlockEnd('<story>1 <'+rawName+'>const sample = `</wrong>`;</'+rawName+'></story>',0,xmlTokens,'body',{...machineTags,[owner]:rawName}),null,'current '+owner+' alias '+rawName);
 }
 assert.throws(()=>envelope('<reply><body>1 原文 <script>"</wrong>"</script></body></reply>'),'normalization never opts the full validator into raw HTML');
});

test('machine blocks, native script text and HTML attributes do not acquire Markdown ownership',()=>{
 const clean=sample({task:'叙事|中性记录'});
 for(const [slot,body]of [['vars','`<cells/>`'],['cells','`<vars/>`'],['archive','`<unclosed>`']]){
  const source=clean.replace(new RegExp('<'+slot+'[^>]*>[\\s\\S]*?<\\/'+slot+'>'),'<'+slot+'>'+body+'</'+slot+'>');assert.throws(()=>envelope(source),slot);
 }
 const markup='<reply><extra><panel title="`quoted`"><script>const x = `value`;</script><pre>`literal`</pre></panel></extra></reply>';
 assert.equal([...xmlTokens(markup)].filter(token=>token.literalCode).length,0);
 const source=sample({extra:'<panel title="`quoted`"><script><![CDATA[const tag = `<Example>`;]]></script><p>Native panel</p></panel><StatusPlaceHolderImpl/>'}),display=runReplyDisplay({source});
 assert.match(display.extra,/const tag = `<Example>`/);assert.match(display.extra,/title="`quoted`"/);assert.equal(envelope(source).blocks.vars,`<![CDATA[${native}]]>`);
});

test('message UI renders the reported neutral structure and malformed envelopes retain a specific diagnostic',()=>{
 const win=new Window(),doc=win.document;win.IntersectionObserver=class{observe(){}disconnect(){}};const host=doc.createElement('div');doc.body.append(host);const ui=mountMessageVisual(doc,host,{source:sample(),name:'中性测试',formatBody:s=>s,getMotion:()=>false});
 try{const root=ui.host.shadowRoot;assert.equal(root.querySelectorAll('.reading-paragraph').length,52);assert.equal(root.querySelectorAll('.action').length,4);assert.doesNotMatch(root.textContent,/TISYA_READER_INVALID|正文尚未完整就绪/);}
 finally{ui.dispose();win.happyDOM.abort();}
 assert.equal(readerErrorCode({code:'REPLY_BLOCK'}),'TISYA_MATRIX_REPLY_BLOCK');assert.match(readerErrorText('REPLY_BLOCK'),/区块未正确闭合/);assert.equal(readerErrorCode({message:'PRIVATE_UNKNOWN_ERROR'}),'TISYA_READER_INVALID');
});

test('old cached parse failures are recomputed without erasing fold state or altering source messages',async()=>{
 const win=new Window();Object.defineProperty(win,'indexedDB',{value:new IDBFactory()});Object.defineProperty(win,'crypto',{value:webcrypto});const message={mes:sample(),name:'中性测试',send_date:'literal-code-regression'},original=JSON.stringify(message),identity={scope:'literal-code-scope',owner:messageCacheOwner(message),source:message.mes},state={folds:{task:true},journey:{tab:'people'}},old=createMessageCache(win,{version:'reader-six-w54.1'});
 const variant='matrix-v3-bounded-start-display:'+tagRevision()+':'+replyFormatRevision()+':'+JSON.stringify({showPsychology:false,playerName:null});
 await old.prepare({...identity,variant},()=>({structured:true,body:{error:'REPLY_BLOCK'},details:{error:'REPLY_BLOCK'},journey:{error:'REPLY_BLOCK'},actions:{error:'REPLY_BLOCK'}}));await old.saveView(identity,state);await old.flush();await old.dispose();
 const current=startReaderCache(win);try{const result=await prepareReaderMessage(identity);assert.equal(result.inspection.body.error,undefined);assert.equal(result.inspection.body.paragraphs.value.length,52);assert.deepEqual(result.viewState,state);assert.equal(JSON.stringify(message),original);}finally{await current.dispose();await win.happyDOM.abort();}
});
