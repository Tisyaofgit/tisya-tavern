import test from 'node:test';
import assert from 'node:assert/strict';
import stock from '../presets/Tisya-Matrix.json' with {type:'json'};
import fixture from './fixtures/returned-prose-stock.json' with {type:'json'};
import candidate31 from './fixtures/candidate31-prose.json' with {type:'json'};
import {baseline,compilePrompts,compilePromptText,applyCompiledMessages} from '../engine/config.mjs';
import {PROSE_STYLE_REVISIONS,resolveProseStyleText} from '../engine/prose-style-policy.mjs';
import {PREFERENCE_GROUPS} from '../engine/preferences.mjs';
import {digest} from '../engine/common.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';

const clone=structuredClone;
const row=(source,id)=>source.prompts.find(prompt=>prompt.identifier===id);
const config=()=>({tags:clone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:{}}}});
function legacySource(variant='predecessor'){
 const source=clone(baseline);
 for(const [identifier,content]of Object.entries(fixture[variant]))row(source,identifier).content=content;
 return source;
}
const effect=id=>PREFERENCE_GROUPS.flatMap(group=>group.options).find(option=>option.id===id).effect;

test('bounded whole-stock digests migrate the predecessor, returned packet and already supported variants without mutation',()=>{
 assert.equal(PROSE_STYLE_REVISIONS.length,25);
 assert(PROSE_STYLE_REVISIONS.every(revision=>revision.legacyDigests.length<=(revision.identifier==='tisya_registry'?5:4)));
 for(const variant of ['predecessor','returned','earlier']){
  const source=legacySource(variant),before=clone(source),c=config(),saved=clone(c);
  for(const [identifier,old]of Object.entries(fixture[variant])){
   const revision=PROSE_STYLE_REVISIONS.find(revision=>revision.identifier===identifier);
   assert(revision.legacyDigests.includes(digest(old)),variant+': '+identifier);
   const current=row(stock,identifier).content;
   assert.equal(resolveProseStyleText(identifier,old),current);
   assert.equal(resolveProseStyleText(identifier,current),current,'current text is idempotent');
   assert.equal(resolveProseStyleText('unrelated_slot',old),old,'identity is part of the migration boundary');
  }
  assert.deepEqual(compilePrompts(source,c,{}),compilePrompts(baseline,c,{}));
  assert.deepEqual(source,before);assert.deepEqual(c,saved);
 }
});

test('one authored byte change prevents automatic prose migration, including unchanged stock clauses inside custom text',()=>{
 for(const variant of ['predecessor','returned','earlier'])for(const [identifier,original]of Object.entries(fixture[variant])){
  for(const content of [original+'字','\n'+original,'作者附注：保留以下原文。\n'+original]){
   assert.equal(resolveProseStyleText(identifier,content),content,variant+': '+identifier);
  }
 }
 for(const identifier of ['main','tisya_pref_style','tisya_pref_plot','tisya_kb_techniques']){
  const source=legacySource(),prompt=row(source,identifier);prompt.content+='\n作者附注：此处按我的写法。';
  const before=clone(source),c=config(),expected=compilePromptText(prompt.content,c,{});
  assert.equal(row(compilePrompts(source,c,{}),identifier).content,expected);
  assert.deepEqual(source,before);
 }
});

test('explicit saved prose overrides remain authored text even when their bytes equal known stock',()=>{
 for(const variant of ['predecessor','returned','earlier']){
  const c=config(),ids=['main','tisya_pref_style','tisya_pref_plot','tisya_kb_techniques'].filter(id=>fixture[variant][id]);
  for(const identifier of ids)c.prompts[identifier]=fixture[variant][identifier];
  const before=clone(c),compiled=compilePrompts(baseline,c,{});
  for(const identifier of ids)assert.equal(row(compiled,identifier).content,compilePromptText(c.prompts[identifier],c,{}));
  assert.deepEqual(c,before);
 }
});

test('explicit preferences replace the migrated default and custom clauses outside those directives survive',()=>{
 const source=legacySource(),c=config();c.story.play.choices={S01:'S01-A',P00:'P00',P02:'P02-B',TECH:['TECH-10']};
 const before=clone(c),compiled=compilePrompts(source,c,{});
 for(const [id,identifier]of [['S01-A','tisya_pref_style'],['P00','tisya_pref_plot'],['P02-B','tisya_pref_plot'],['TECH-10','tisya_kb_techniques']])assert.equal(row(compiled,identifier).content.split(effect(id)).length-1,1);
 assert.match(row(compiled,'tisya_pref_plot').content,/共处静默/);
 assert.deepEqual(c,before);
});

for(const merge of [false,true])test('known stock reaches native outgoing fragments once and preserves roles, order, history and source; merged='+merge,()=>{
 const source=legacySource(),saved=clone(source),c=config(),compiled=compilePrompts(source,c,{});
 const order=source.prompt_order.find(entry=>entry.character_id===100001).order;
 const enabled=new Set(order.filter(entry=>entry.enabled).map(entry=>entry.identifier)),messages=[];
 for(const entry of order){
  const prompt=row(source,entry.identifier);
  if(!prompt||prompt.marker||prompt.enabled===false||!enabled.has(prompt.identifier)||!prompt.content?.trim())continue;
  if(merge&&messages.at(-1)?.role===prompt.role)messages.at(-1).content+='\n\n'+prompt.content;
  else messages.push({role:prompt.role,content:prompt.content});
 }
 const history=[{role:'assistant',content:fixture.predecessor.tisya_pref_style},{role:'user',content:'旧笔录照原样留下。'},{role:'tool',content:JSON.stringify({quotation:fixture.predecessor.tisya_kb_techniques})}];
 messages.push(...clone(history));const old=clone(messages),result=applyCompiledMessages(messages,source,compiled);
 const active=result.slice(0,-history.length).map(message=>message.content).join('\n');
 for(const identifier of ['tisya_pref_style','tisya_pref_plot','tisya_kb_techniques']){
  assert.equal(active.split(row(compiled,identifier).content).length-1,1);
  assert(!active.includes(fixture.predecessor[identifier]));
 }
 assert.deepEqual(result.slice(-history.length),history);
 assert.deepEqual(result.map(message=>message.role),messages.map(message=>message.role));
 assert.deepEqual(compiled.prompt_order,source.prompt_order);
 assert.deepEqual(compiled.prompts.map(({content,...metadata})=>metadata),source.prompts.map(({content,...metadata})=>metadata));
 assert.deepEqual(compilePrompts(compiled,c,{}),compiled);
 assert.deepEqual(applyCompiledMessages(result,compiled,compilePrompts(compiled,c,{})),result);
 assert.deepEqual(messages,old);assert.deepEqual(source,saved);
});

test('installed candidate31 stock upgrades back to 4a text and body bounds while leaving source bytes unchanged',()=>{
 const source=clone(baseline);for(const [id,text]of Object.entries(candidate31))row(source,id).content=text;
 const before=clone(source),c=config();assert.deepEqual(compilePrompts(source,c,{}),compilePrompts(baseline,c,{}));assert.deepEqual(source,before);
});
