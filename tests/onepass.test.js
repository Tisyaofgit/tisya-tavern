import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Window} from 'happy-dom';
import {onePassReply} from './fixtures/onepass-reply.js';
import {onePassEntries} from '../onepass/preset.mjs';
import {parseOnePassReply,onePassEnvelope,ONEPASS_ORDER} from '../onepass/reply.mjs';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
import {registerLivePreset} from '../narrative-bridge.js';
import {inspectMessage} from '../reader.js';
import {runReplyDisplay} from '../reply-protocol.js';
import {revisionBody,revisionParagraphs} from '../revision.js';
import {mountMessageVisual} from '../message-ui.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../presets/'+name,import.meta.url)));
const source=p=>({prompts:p.prompts,order:p.prompt_order.find(x=>x.character_id===100001).order});
test('single-pass import retains all 62 legacy entries and dividers, with both new think blocks and complete creative guide',()=>{
 const old=read('Tisya-TauriTavern-0.2.0-alpha.13.json'),p=read('Tisya-One-Pass-1.json'),shape=p=>({...p,prompts:p.prompts.map(({content,...r})=>r)});assert.deepEqual(shape(p),shape(old));
 const e=onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS);for(const part of ['身份复核','资料承接','视角认知','人物反应','行动与剧情','正文组织','成稿总检'])assert.match(e.tisya_inner_chain,new RegExp(part+' —'));
 assert.match(e.tisya_registry,/<task format="pipes">/);assert.match(e.tisya_registry,/<think phase="before">/);assert.match(e.tisya_registry,/<think phase="after">/);for(const k of ['status','vars','archive','memory'])assert.match(e.tisya_registry,new RegExp('<'+k+' format="pipes">'));assert.doesNotMatch(e.tisya_registry,/<next/);
});
test('same live instance switches legacy, six, one-pass and back without stale or empty macro entries',()=>{
 let selected=source(read('Tisya-TauriTavern-0.2.0-alpha.13.json'));const macros={},c={extensionSettings:{},chatMetadata:{variables:{}},chatId:'one',characterId:0,characters:[{avatar:'one.png'}],registerMacro(k,fn){macros[k]=fn},unregisterMacro(){}};
 const runtime=registerLivePreset(c,()=>selected,()=>c,()=>DEFAULT_MOODS);
 const old=macros.tisya_live_tisya_registry();assert(old.length>1000);
 selected=source(read('Tisya-Six-Blocks-1.json'));assert.match(macros.tisya_live_six_tisya_registry(),/<think phase="before">/);
 selected=source(read('Tisya-One-Pass-1.json'));assert.match(macros.tisya_live_onepass_tisya_registry(),/ONEPASS.CONTRACT/);assert.match(macros.tisya_live_onepass_tisya_inner_chain(),/正文组织 —/);
 selected=source(read('Tisya-TauriTavern-0.2.0-alpha.13.json'));assert.equal(macros.tisya_live_tisya_registry(),old);runtime.dispose();
});
test('eleven-block reply retains both thinks, machine blocks, prose offsets and native display',()=>{
 const s=onePassReply(),e=parseOnePassReply(s);assert.deepEqual(Object.keys(e.blocks),ONEPASS_ORDER);assert.equal(e.records.vars.changes.length,0);assert.match(revisionBody(s),/宋遥/);assert.equal(revisionParagraphs(s).length,2);assert.equal(inspectMessage(s).details.value.protocol,4);assert.match(runReplyDisplay({source:s}).body,/铜铃/);assert.doesNotThrow(()=>parseOnePassReply(s+'\n<StatusPlaceHolderImpl/>'));
});
test('complete bare preference rows read like canonical rows without changing the original reply',()=>{
 const canonical=onePassReply(),bare=canonical.replace('偏好：明确要求|','  明确要求|');
 assert.doesNotThrow(()=>parseOnePassReply(bare));
 const result=inspectMessage(bare);assert.deepEqual(result.details.value.preferences,inspectMessage(canonical).details.value.preferences);assert.equal(result.details.value.diagnostics.length,0);assert.equal(result.records?.error,undefined);
 assert(bare.includes('  明确要求|'));assert.doesNotThrow(()=>parseOnePassReply(canonical.replace('偏好：明确要求|','候选|')));
});
test('preference compatibility never guesses an unknown label or missing column',()=>{
 const source=onePassReply();
 for(const row of ['明确要求|本轮|少一列','明确要求|本轮|来源|执行|多一列','错误标签|本轮|来源|执行','偏好：候选|本轮||执行']){
  const bad=source.replace(/偏好：明确要求\|[^\n]+/,row);assert.throws(()=>parseOnePassReply(bad));const result=inspectMessage(bad);assert.equal(result.details.value.preferences.length,0);assert.equal(result.details.value.diagnostics.length,1);assert.equal(result.actions.value.length,4);assert.match(result.body.value,/宋遥/);
 }
});
test('invalid machine JSON leaves visible prose, both summaries and actions readable and does not become a successful archive',()=>{
 const s=onePassReply().replace('<vars format="json">','<vars format="json">BROKEN');assert.throws(()=>parseOnePassReply(s),{code:'TISYA_ONEPASS_JSON_VARS'});const v=inspectMessage(s);assert.match(v.body.value,/宋遥/);assert.equal(v.details.value.protocol,4);assert.equal(v.actions.value.length,4);assert.equal(v.records.error,'TISYA_ONEPASS_JSON_VARS');assert.match(runReplyDisplay({source:s}).body,/铜铃/);
});
test('host-appended status marker retains its native card display region',()=>{const source=onePassReply()+'\n\n<StatusPlaceHolderImpl/>',display=runReplyDisplay({source});assert(display.extraPanels.some(p=>p.tag==='StatusPlaceHolderImpl'&&p.nativeHosted));assert.match(display.body,/宋遥/);});
test('missing and reordered blocks are rejected without manufacturing replacements',()=>{const s=onePassReply();for(const bad of [s.replace(/<task[\s\S]*?<\/task>/,''),s.replace('<status','<next'),s.replace('</reply>','<memory/></reply>')])assert.throws(()=>onePassEnvelope(bad));});
test('top preference, creative-draft and simulation panels render independently and retain folds',async()=>{
 const w=new Window(),d=w.document;w.IntersectionObserver=class{observe(){}disconnect(){}};const target=d.createElement('div');d.body.append(target);const p={source:onePassReply(),name:'测试',formatBody:x=>x,onChooseAction(){},getMotion:()=>false};let ui=mountMessageVisual(d,target,p),r=ui.host.shadowRoot;
 assert.match(r.querySelector('#task-toggle').textContent,/草案与推演/);assert.match(r.querySelector('.preference-ledger').textContent,/明确要求/);assert.match(r.querySelector('.draft-ledger').textContent,/文风用词/);assert.match(r.querySelector('.simulation-ledger').textContent,/宋遥/);assert.match(r.querySelector('.audit-ledger').textContent,/关系位移/);assert.doesNotMatch(r.textContent,/test-basis|"coverage"/);
 r.querySelector('#task-toggle').click();r.querySelector('.simulation-ledger').open=true;const state=ui.capture();ui.dispose();ui=mountMessageVisual(d,target,p);ui.restore(state);r=ui.host.shadowRoot;assert.equal(r.querySelector('#task-content').hidden,false);assert.equal(r.querySelector('.simulation-ledger').open,true);ui.dispose();await w.happyDOM.abort();
});
