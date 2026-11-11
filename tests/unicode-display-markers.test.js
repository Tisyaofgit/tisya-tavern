import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {xmlTokens} from '../reader-core.js';
import {envelope,parseReply} from '../engine/reply.mjs';
import {configureTags,tagRevision} from '../engine/tags.mjs';
import {createNativeDisplayPipeline} from '../native-display.js';
import {bodyDisplayParts} from '../native-body.js';
import {runReplyDisplay} from '../reply-protocol.js';
import {inspectMessage,startReaderCache,prepareReaderMessage} from '../reader.js';
import {createMessageCache,messageCacheOwner} from '../message-cache.js';
import {replyFormatRevision} from '../reply-formats.js';

const state='<日期>初春</日期>\n<时间>午后</时间>\n<天气>晴</天气>\n<地点>档案室</地点>\n<评语>记录完成。</评语>';
const sample=({body='1 旅人核对地图。',extra='',task='',vars=''}={})=>'<reply id="tisya-onepass-1"><task>'+task+'</task><anchor phase="before"/><title>记录|午后|档案室|中性测试</title><body>'+body+'</body><anchor phase="after"/><extra>'+extra+'<cells/><vars>'+vars+'</vars></extra><archive/><actions/></reply>';
const rules=[
 {scriptName:'音乐组件',findRegex:'<bgm>(.*?)<\\/bgm>',replaceString:'```html\n<html><body><p>$1</p><script>window.component=1;</script></body></html>\n```',placement:[2],markdownOnly:true},
 {scriptName:'场景组件',findRegex:'<日期>([\\s\\S]*?)<\\/日期>[\\s\\S]*?<时间>([\\s\\S]*?)<\\/时间>[\\s\\S]*?<天气>([\\s\\S]*?)<\\/天气>[\\s\\S]*?<地点>([\\s\\S]*?)<\\/地点>[\\s\\S]*?<评语>([\\s\\S]*?)<\\/评语>',replaceString:'```html\n<html><body><p>$1|$2|$3|$4|$5</p><script>window.component=2;</script></body></html>\n```',placement:[2],markdownOnly:true},
];
const pipeline=()=>createNativeDisplayPipeline({enabled:()=>true,scripts:()=>rules,regexProvider:{get:text=>new RegExp(text)}});

test('bare Unicode card markers in numbered body reach display rules without changing source or machine slots',async()=>{
 const body=['旅人核对地图。','<bgm>中性曲目</bgm>',...state.split('\n')].map((s,i)=>(i+1)+' '+s).join('\n'),source=sample({body}),parsed=parseReply(source,'unicode-body'),display=pipeline().project(source),view=inspectMessage(source),w=new Window();
 try{assert.equal(view.body.error,undefined);assert.equal(parsed.reply_raw,source);assert.equal(parsed.body_raw,body);assert.equal(parsed.fragments.length,7);assert.equal(parsed.native_vars,'');assert.equal(parsed.cells_raw,'');assert.deepEqual(display.rules.map(r=>r.matches),[1,1]);assert.equal(bodyDisplayParts(w.document,display).filter(p=>p.nativeHosted).length,2);assert.match(display.body,/初春\|午后\|晴\|档案室\|记录完成/);assert.equal(parseReply(source,'again').reply_raw,source);}finally{await w.happyDOM.abort();}
});

test('Unicode extra components preserve top-level ownership, labels and nested marker names',()=>{
 const source=sample({extra:'<状态面板 title="航行记录">'+state+'</状态面板><航程.摘要_2>下一站。</航程.摘要_2>'}),display=runReplyDisplay({source});
 assert.equal(display.body,'旅人核对地图。');assert.equal(display.extraPanels.length,2);assert.deepEqual(display.extraPanels.map(p=>p.tag),['状态面板','航程.摘要_2']);assert.equal(display.extraPanels[0].label,'航行记录');assert.match(display.extraPanels[0].html,/data-tisya-marker="日期"/);assert.match(display.extraPanels[1].html,/data-tisya-marker="航程.摘要_2"/);assert.doesNotMatch(display.extra,/<cells|<vars/);
 const matched=pipeline().project(sample({extra:'<bgm>中性曲目</bgm>'+state}));assert.deepEqual(matched.rules.map(r=>r.matches),[1,1]);assert.equal(matched.extraPanels.length,2);assert.equal(matched.extraPanels[1].label,'组合扩展');assert.doesNotMatch(matched.body,/中性曲目|window\.component/);
});

test('Unicode names are display data only, including beneath grouped or aliased machine slots',()=>{
 const tag='<日期>初春</日期>';
 for(const owner of ['task','anchor','title','actions','cells','vars','archive','memory','status'])assert.throws(()=>[...xmlTokens('<reply><'+owner+'>'+tag+'</'+owner+'></reply>')],/XML_TAG/,owner);
 for(const owner of ['cells','vars','archive','memory','status'])for(const display of ['body','extra'])assert.throws(()=>[...xmlTokens('<reply><'+display+'><'+owner+'>'+tag+'</'+owner+'></'+display+'></reply>')],/XML_TAG/,display+'/'+owner);
 for(const owner of ['updates','variables','records'])assert.throws(()=>[...xmlTokens('<reply><attachments><'+owner+'>'+tag+'</'+owner+'></attachments></reply>',{protocolBlock:'extra',machineTags:{cells:'updates',vars:'variables',archive:'records'}})],/XML_TAG/,owner);
 const json=JSON.stringify({literal:tag}),source=sample({vars:json});assert.equal(envelope(source).blocks.vars,json);assert.equal(parseReply(source,'json').native_vars,json);assert.doesNotMatch(runReplyDisplay({source}).extra,/初春/);
});

test('malformed Unicode tags and unsafe body children retain the existing rejection boundaries',()=>{
 for(const body of ['1 <日期>初春</时间>','1 <日期>初春','1 <3日期>初春</3日期>','1 <日期><时间>午后</日期></时间>'])assert.throws(()=>runReplyDisplay({source:sample({body})}));
 for(const tag of ['script','iframe','object','embed','form','input','button','select','textarea'])assert.throws(()=>runReplyDisplay({source:sample({body:'1 <状态><'+tag+'></'+tag+'></状态>'})}),/BODY_MARKUP/,tag);
 assert.throws(()=>runReplyDisplay({source:sample().replace('<task></task>','<日期>初春</日期>')}));
});

test('Unicode public markers survive custom protocol aliases without expanding the protocol tag whitelist',()=>{
 const names={reply:'answer',body:'story',extra:'attachments',cells:'updates',vars:'variables',archive:'records'};configureTags(names);
 try{let source=sample({body:'1 <日期>初春</日期>',extra:'<场景>'+state+'</场景>'});for(const [canonical,alias]of Object.entries(names))source=source.replace(new RegExp('<(/?)'+canonical+'(?=[\\s/>])','g'),'<$1'+alias);const parsed=parseReply(source,'alias'),display=runReplyDisplay({source});assert.equal(parsed.reply_raw,source);assert.equal(display.body,'<日期>初春</日期>');assert.equal(display.extraPanels[0].tag,'场景');assert.throws(()=>envelope(source.replace('<updates/>','<updates><日期>初春</日期></updates>')),/XML_TAG/);}finally{configureTags();}
});

test('CDATA and inline literal display tags keep their bytes and neither create machine writes nor implicit runtime ownership',()=>{
 for(const value of ['`<日期>初春</日期>`','<![CDATA[<日期>初春</日期>]]>']){const source=sample({body:'1 '+value}),parsed=parseReply(source,'literal'),display=runReplyDisplay({source});assert.equal(parsed.body_raw,'1 '+value);assert.equal(parsed.reply_raw,source);assert.equal(parsed.delta_ops.length,0);assert.equal(display.bodyRuns.some(r=>r.ruleName),false);assert.match(display.body,/日期/);}
});

test('previous Unicode parse errors are refreshed while persisted reader folds remain intact',async()=>{
 const w=new Window();Object.defineProperty(w,'indexedDB',{value:new IDBFactory()});Object.defineProperty(w,'crypto',{value:webcrypto});
 const source=sample({body:'1 <日期>初春</日期>'}),message={mes:source,name:'中性测试',send_date:'unicode-marker-cache'},original=JSON.stringify(message),identity={scope:'unicode-marker-scope',owner:messageCacheOwner(message),source},viewState={folds:{task:true},journey:{tab:'people'}},old=createMessageCache(w,{version:'reader-six-w54.1'}),variant='matrix-v4-text-code-display:'+tagRevision()+':'+replyFormatRevision()+':'+JSON.stringify({showPsychology:false,playerName:null});
 await old.prepare({...identity,variant},()=>({structured:true,body:{error:'TISHA_OUTPUT_XML_TAG'},details:{error:'TISHA_OUTPUT_XML_TAG'},journey:{error:'TISHA_OUTPUT_XML_TAG'},actions:{error:'TISHA_OUTPUT_XML_TAG'}}));await old.saveView(identity,viewState);await old.flush();await old.dispose();
 const current=startReaderCache(w);try{const result=await prepareReaderMessage(identity);assert.equal(result.inspection.body.error,undefined);assert.deepEqual(result.viewState,viewState);assert.equal(JSON.stringify(message),original);}finally{await current.dispose();await w.happyDOM.abort();}
});
