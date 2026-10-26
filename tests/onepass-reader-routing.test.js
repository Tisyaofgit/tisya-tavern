import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {onePassReply} from './fixtures/onepass-reply.js';
import {inspectMessage,startReaderCache,prepareReaderMessage,reconcileReaderCache} from '../reader.js';
import {isOnePassReply,onePassStoryText} from '../onepass/source.mjs';
import {parseOnePassReply} from '../onepass/reply.mjs';
import {runReplyDisplay} from '../reply-protocol.js';
import {readPublicReplyEnvelope,replyFormatRevision} from '../reply-formats.js';
import {readReplyDetails} from '../reply-details.js';
import {createMessageCache,messageCacheOwner} from '../message-cache.js';
import {inspectV3Message} from '../six/reply.mjs';
import {mountMessageVisual} from '../message-ui.js';

// Same public/machine shape as the report, with neutral prose only.
const sample=()=>onePassReply({basis:'ONEPASS_DEFAULT',coverage:[],world:{from:null,to:null,events:[],focus:[],pending:[]}})
 .replace('<title>','<title format="pipes">')
 .replace(/<body[^>]*>[\s\S]*?<\/body>/,'<body min="2000" max="5000" unit="字">\n'+Array.from({length:20},(_,i)=>`${i+1} 第${i+1}段中性测试，记录人物整理器物的行动。`).join('\n')+'\n</body>');

test('reported eleven-block shape preserves twenty inline-numbered paragraphs, both summaries and four actions',()=>{
 const source=sample(),before=source;const parsed=parseOnePassReply(source),view=inspectMessage(source);
 assert.equal(parsed.publicReply.paragraphs.length,20);assert.equal(view.details.value.protocol,4);assert.equal(view.actions.value.length,4);assert.equal(parsed.records.archive.basis,'ONEPASS_DEFAULT');assert.deepEqual(parsed.records.memory.changes,[]);assert.equal(source,before);
});

test('valid XML attribute spacing and leading comments select the one-pass reader on every public path',()=>{
 for(const root of ['<reply id = "tisya-onepass-1">',"<reply\n id\t=\t'tisya-onepass-1'>",'<!-- transport note -->\n<reply id="tisya-onepass-1">']){
  const source=sample().replace('<reply id="tisya-onepass-1">',root),original=source;
  assert.equal(isOnePassReply(source),true,root);assert.equal(inspectMessage(source).body.paragraphs.value.length,20);assert.equal(readReplyDetails(source).protocol,4);assert.equal(readPublicReplyEnvelope(source).v3.paragraphs.length,20);assert.match(runReplyDisplay({source}).body,/第20段/);assert.equal(onePassStoryText(source+'\n<StatusPlaceHolderImpl/>'),original);assert.equal(source,original);
 }
 for(const source of ['<reply id="foreign">','<reply note="tisya-onepass-1">','<reply id="tisya-onepass-1-other">','not XML\n'+sample()])assert.equal(isOnePassReply(source),false);
 const bad=sample().replace(/<task[\s\S]*?<\/task>/,'');assert.throws(()=>parseOnePassReply(bad),{code:'TISYA_ONEPASS_ORDER'});assert.ok(inspectMessage(bad).body.error);
});

test('old persisted V3 order errors are recomputed without deleting reading state or changing original messages',async()=>{
 const w=new Window(),d=w.document;Object.defineProperty(w,'indexedDB',{value:new IDBFactory()});Object.defineProperty(w,'crypto',{value:webcrypto});w.IntersectionObserver=class{observe(){}disconnect(){}};
 const message={name:'中性测试',send_date:'routing-regression',mes:sample()},snapshot=JSON.stringify(message),identity={scope:'routing-chat',owner:messageCacheOwner(message),source:message.mes};
 const old=createMessageCache(w,{version:'reader-six-w54.1'}),state={folds:{task:true},journey:{tab:'people'}};
 await old.prepare({...identity,variant:replyFormatRevision()+':'+JSON.stringify({showPsychology:false,playerName:null})},()=>inspectV3Message(message.mes));await old.saveView(identity,state);await old.flush();await old.dispose();
 const cache=startReaderCache(w);try{
  await reconcileReaderCache(identity.scope,[message]);const result=await prepareReaderMessage(identity);assert.equal(result.inspection.body.error,undefined);assert.equal(result.inspection.body.paragraphs.value.length,20);assert.equal(result.inspection.details.value.protocol,4);assert.deepEqual(result.viewState,state);assert.equal(JSON.stringify(message),snapshot);
  const host=d.createElement('div');d.body.append(host);const visual=mountMessageVisual(d,host,{source:message.mes,inspection:result.inspection,name:message.name,formatBody:s=>s,getMotion:()=>false});const root=visual.host.shadowRoot;
  assert.equal(root.querySelectorAll('.reading-paragraph').length,20);assert.match(root.querySelector('.preference-ledger').textContent,/明确要求/);assert(root.querySelector('.draft-ledger'));assert(root.querySelector('.simulation-ledger'));assert(root.querySelector('.audit-ledger'));assert.doesNotMatch(root.textContent,/TISYA_V3_REPLY_ORDER/);visual.dispose();
 }finally{await cache.dispose();await w.happyDOM.abort();}
});
