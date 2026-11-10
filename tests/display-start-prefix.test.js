import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {displayStartReplySource} from '../display-start-prefix.js';
import {inspectMessage} from '../reader.js';
import {readPublicReplyEnvelope,readReplyMemory} from '../reply-formats.js';
import {createNativeDisplayPipeline} from '../native-display.js';
import {mountMessageAppearance} from '../message-ui.js';
import {nativePanelContentProcessor} from '../native-panel-source.js';
import {preferNativeBeauty} from '../native-beauty.js';
import {parseReply} from '../engine/reply.mjs';
import {isMatrixReply} from '../engine/tags.mjs';
import {isOnePassReply,onePassEnvelope} from '../onepass/reply.mjs';
import {fixture} from './fixtures/journey-r4.cjs';
import {fullReply} from './fixtures/six-reply.js';
import {onePassReply} from './fixtures/onepass-reply.js';
import {DISPLAY_DEFAULTS} from '../display-settings.js';
const prefix='<start></start>';
const matrix=(value=2)=>'<reply id="tisya-onepass-1"><task>PRIVATE_TASK</task><anchor phase="before"/><title>中性场景|夜间|室内|回归</title><body>1 这是唯一公开正文。</body><anchor phase="after"/><extra><combat_driver>无</combat_driver><StatusPlaceHolderImpl/></extra><cells format="delta"># PRIVATE_CELLS</cells><vars><UpdateVariable><Analysis>PRIVATE_ANALYSIS</Analysis><JSONPatch>'+JSON.stringify([{op:'replace',path:'/count',value}])+'</JSONPatch></UpdateVariable></vars><archive format="pipes">private|PRIVATE_ARCHIVE</archive><actions>观察|查看门窗。|等待。</actions></reply>';
const html=id=>'<!doctype html><html><body><button>'+id+'</button><script>window.neutralBoots=(window.neutralBoots||0)+1;</script></body></html>';
const rules=[{scriptName:'opening',findRegex:'/<start>([\\s\\S]*?)<\\/start>/gsi',replaceString:'```html\n'+html('creator')+'\n```',placement:[1,2],markdownOnly:true},{scriptName:'status',findRegex:'<StatusPlaceHolderImpl/>',replaceString:'```html\n'+html('status')+'\n```',placement:[1,2],markdownOnly:true,maxDepth:3}];
const provider={get:s=>{const m=/^\/(.*)\/([a-z]*)$/.exec(s);return m?new RegExp(m[1],m[2]):new RegExp(s);}};
const pipeline=()=>createNativeDisplayPipeline({enabled:()=>true,scripts:()=>rules,regexProvider:provider,depth:()=>0});
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));

test('empty start plus one complete reply is a read-only display adaptation; machine parsers remain strict',()=>{
 const clean=matrix(),source=prefix+clean,message={mes:source};assert.equal(displayStartReplySource(source),clean);assert.equal(message.mes,source);
 assert.deepEqual(inspectMessage(source),inspectMessage(clean));assert.deepEqual(readPublicReplyEnvelope(source),readPublicReplyEnvelope(clean));assert.equal(readReplyMemory(source),null);
 assert.equal(isMatrixReply(source),false);assert.equal(isOnePassReply(source),false);assert.throws(()=>parseReply(source,'entry'),{code:'REPLY_ROOT'});assert.equal(parseReply(clean,'entry').native_vars,'<UpdateVariable><Analysis>PRIVATE_ANALYSIS</Analysis><JSONPatch>[{"op":"replace","path":"/count","value":2}]</JSONPatch></UpdateVariable>');
});

test('display rules do not convert the outside opening into body or expose machine blocks',()=>{
 const source=prefix+matrix(),p=pipeline(),data=inspectMessage(source),display=p.project(source);
 assert.equal(data.structured,true);assert.equal(data.body.error,undefined);assert.doesNotMatch(data.body.value,/PRIVATE_|<start>|<reply|<vars|JSONPatch/);
 assert.equal(display.rules[0].matches,0);assert.equal(display.rules[1].matches,1);assert.doesNotMatch(display.body,/creator|status|PRIVATE_|<start>|JSONPatch/);
 const status=display.extraPanels.find(row=>row.ruleName==='status');assert(status);assert.equal(display.extraPanels.some(row=>row.ruleName==='opening'),false);assert.doesNotMatch(display.extra,/PRIVATE_|JSONPatch/);assert.equal(source,prefix+matrix());
});

test('unique complete reply validation rejects unknown tails, multiple roots and incomplete structure without discarding them',()=>{
 const clean=matrix();for(const source of [prefix+clean+'UNKNOWN_TAIL',prefix+clean+clean,prefix+clean.slice(0,-8),prefix+clean+'<!-- outside -->',prefix+clean+'<StatusPlaceHolderImpl/>',prefix+clean+'<narrative_close>outside</narrative_close>',prefix+clean.replace('<body>','<body><reply>')]){
  assert.throws(()=>displayStartReplySource(source),{code:'TISYA_DISPLAY_START_BOUNDARY'});const data=inspectMessage(source);assert.equal(data.structured,true);assert.equal(data.body.error,'TISYA_DISPLAY_START_BOUNDARY');assert.equal(data.body.value,undefined);assert.throws(()=>pipeline().project(source),{code:'TISYA_DISPLAY_START_BOUNDARY'});assert.throws(()=>readPublicReplyEnvelope(source),{code:'TISYA_DISPLAY_START_BOUNDARY'});
 }
 const literal=matrix('</reply><reply>');assert.equal(displayStartReplySource(prefix+literal),literal,'JSONPatch string literals are data, never extra roots');assert.equal(displayStartReplySource('\n<start> \n</start> \n'+clean+' \n'),clean+' \n');
});

test('ordinary openings and arbitrary outside material are not searched or silently trimmed',()=>{
 const clean=matrix();for(const source of [prefix,'<start>character input</start>','INTRO '+prefix+clean,'<start>not empty</start>'+clean,'<start data-kind="open"></start>'+clean,'<start/>'+clean,'<!-- unknown -->'+prefix+clean,prefix+'<output>'+clean+'</output>'])assert.equal(displayStartReplySource(source),source);
 assert.equal(inspectMessage(prefix).structured,false);
});

test('the same bounded adapter preserves established legacy, V3 and OnePass reading routes without relaxing their machine input',()=>{
 for(const clean of [fixture(),fullReply,onePassReply()]){const source=prefix+clean;assert.deepEqual(inspectMessage(source),inspectMessage(clean));assert.deepEqual(readPublicReplyEnvelope(source),readPublicReplyEnvelope(clean));assert.equal(displayStartReplySource(source),clean);assert.equal(isOnePassReply(source),false);}
 assert.throws(()=>onePassEnvelope(prefix+onePassReply()),{code:'TISYA_ONEPASS_ROOT'});
});

test('prefixed history keeps only its exact status frame visible while the outside creator and private source remain concealed',async()=>{
 const w=new Window({url:'http://localhost/',settings:{enableJavaScriptEvaluation:true,disableIframePageLoading:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),d=w.document;w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 d.head.innerHTML='<style>body.tisya-active .tisya-source-concealed{display:none!important}</style>';d.body.className='tisya-active';d.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><p class="private">PRIVATE_NATIVE</p></div></div></div></div>';
 const native=d.querySelector('.mes_text'),node=d.querySelector('.mes'),frames=[];
 for(const id of ['creator','status']){const root=d.createElement('div'),pre=d.createElement('pre'),code=d.createElement('code'),frame=d.createElement('iframe');root.className='TH-render';code.textContent=html(id);pre.append(code);frame.id='TH-message--0--'+id;frame.srcdoc=html(id);root.append(pre,frame);native.append(root);assert(frame.contentWindow?.document);frames.push({id,root,frame,realm:frame.contentWindow});}
 const source=prefix+matrix(),message={mes:source,name:'中性卡'},p=pipeline(),errors=[];
 const ui=mountMessageAppearance(d,{getMessage:()=>message,getNativeDisplay:(...args)=>p.project(...args),preferNative:(message,native,inspection)=>preferNativeBeauty({message,native,structured:inspection.structured,...p.state()}),formatBody:s=>'<p>'+s+'</p>',formatPreparedBody:s=>'<p>'+s+'</p>',getMotion:()=>false,getDisplay:()=>({...DISPLAY_DEFAULTS,世界扩展默认状态:'展开'}),onError:e=>errors.push(e.message)});
 try{ui.sync(node);await pause();const visual=node.querySelector('.tisya-message-visual');assert(visual);assert.match(visual.shadowRoot.querySelector('.story').textContent,/这是唯一公开正文/);assert.doesNotMatch(visual.shadowRoot.textContent,/PRIVATE_|JSONPatch|creator|window.neutralBoots/);assert(frames[0].root.classList.contains('tisya-native-pruned'));assert(!frames[1].root.classList.contains('tisya-native-pruned'));assert(native.querySelector('.private').classList.contains('tisya-native-pruned'));assert.equal(w.getComputedStyle(frames[0].root).display,'none');assert.notEqual(w.getComputedStyle(native).display,'none');for(const row of frames){assert.equal(row.frame.parentElement,row.root);assert.equal(row.frame.contentWindow,row.realm);assert.equal(row.realm.neutralBoots,1);}assert.equal(native.querySelectorAll('iframe').length,2);assert.equal(message.mes,source);assert.deepEqual(errors,[]);
 }finally{ui.dispose();await w.happyDOM.abort();}
});

test('native source preparation uses the same bounded reply projection while a standalone start remains untouched',async()=>{
 const w=new Window(),p=pipeline();let calls=0;const processor=nativePanelContentProcessor({document:w.document,project:source=>{calls++;return p.project(source);}}),source=prefix+matrix(),message={mes:source};const result=await processor.prepare({message,mesid:0},async()=>'<p>host text</p>');const root=w.document.createElement('div');root.innerHTML=result;assert.equal(root.querySelectorAll('pre code').length,1);assert.equal(root.querySelector('code').textContent.trim(),html('status'));assert.doesNotMatch(root.textContent,/creator|PRIVATE_|JSONPatch/);assert.equal(message.mes,source);assert.equal(await processor.prepare({message:{mes:prefix},mesid:0},async()=>'opening'),'opening');assert.equal(calls,1);await w.happyDOM.abort();
});
