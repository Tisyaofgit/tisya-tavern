import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline,compilePrompts,compilePromptText,applyCompiledMessages} from '../engine/config.mjs';
import {PROSE_STYLE_REVISIONS,resolveProseStyleText} from '../engine/prose-style-policy.mjs';
import {PREFERENCE_GROUPS} from '../engine/preferences.mjs';
import {digest} from '../engine/common.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';

const clone=structuredClone;
const row=(source,id)=>source.prompts.find(prompt=>prompt.identifier===id);
const config=()=>({tags:clone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:{}}}});
function legacySource(){
 const source=clone(baseline);
 for(const revision of PROSE_STYLE_REVISIONS){
  const prompt=row(source,revision.identifier);
  assert.equal(prompt.content.split(revision.after).length-1,1);
  prompt.content=prompt.content.replace(revision.after,revision.before);
  assert.equal(digest(prompt.content),revision.legacyDigest,'known legacy whole-prompt digest: '+revision.identifier);
 }
 return source;
}
const effect=id=>PREFERENCE_GROUPS.flatMap(group=>group.options).find(option=>option.id===id).effect;

test('all three known whole stock prompts reconstruct exactly and upgrade to the current baseline without mutation',()=>{
 assert.equal(PROSE_STYLE_REVISIONS.length,3);
 const source=legacySource(),before=clone(source),c=config(),saved=clone(c);
 for(const revision of PROSE_STYLE_REVISIONS){
  const old=row(source,revision.identifier).content,current=row(baseline,revision.identifier).content;
  assert.equal(resolveProseStyleText(revision.identifier,old),current);
  assert.equal(resolveProseStyleText(revision.identifier,current),current,'already upgraded text is unchanged');
  assert.equal(resolveProseStyleText('unrelated_slot',old),old,'identity is part of the migration boundary');
 }
 assert.deepEqual(compilePrompts(source,c,{}),compilePrompts(baseline,c,{}));
 assert.deepEqual(source,before);assert.deepEqual(c,saved);
});

test('a single added character or an edit around a stock clause prevents automatic prose migration',()=>{
 for(const revision of PROSE_STYLE_REVISIONS)for(const transform of [text=>text+'字',text=>'\n'+text,text=>text.replace(revision.before,revision.before+'作者附注：允许原样保留。\n')]){
  const source=legacySource(),prompt=row(source,revision.identifier);prompt.content=transform(prompt.content);
  const before=clone(source),c=config(),expected=compilePromptText(prompt.content,c,{});
  assert.notEqual(digest(prompt.content),revision.legacyDigest);
  assert.equal(resolveProseStyleText(revision.identifier,prompt.content),prompt.content);
  assert.equal(row(compilePrompts(source,c,{}),revision.identifier).content,expected);
  assert.deepEqual(source,before);
 }
});

test('an explicit saved override remains authored text even when its bytes equal known legacy stock',()=>{
 const source=legacySource(),c=config();
 for(const revision of PROSE_STYLE_REVISIONS)c.prompts[revision.identifier]=row(source,revision.identifier).content;
 const before=clone(c),compiled=compilePrompts(baseline,c,{});
 for(const revision of PROSE_STYLE_REVISIONS)assert.equal(row(compiled,revision.identifier).content,compilePromptText(c.prompts[revision.identifier],c,{}));
 assert.deepEqual(c,before);
});

test('explicit preferences replace the migrated default rather than being overwritten by the stock upgrade',()=>{
 const source=legacySource(),c=config();c.story.play.choices={S01:'S01-A',P00:'P00',P02:'P02-B',TECH:['TECH-10']};
 const before=clone(c),compiled=compilePrompts(source,c,{});
 for(const [id,identifier]of [['S01-A','tisya_pref_style'],['P00','tisya_pref_plot'],['P02-B','tisya_pref_plot'],['TECH-10','tisya_kb_techniques']])assert.equal(row(compiled,identifier).content.split(effect(id)).length-1,1);
 for(const revision of PROSE_STYLE_REVISIONS){
  assert.ok(!row(compiled,revision.identifier).content.includes(revision.before));
  assert.ok(!row(compiled,revision.identifier).content.includes(revision.after),'selected preference owns its directive');
 }
 assert.deepEqual(c,before);
});

for(const merge of [false,true])test('legacy prose upgrade reaches native outgoing fragments, preserves roles/order/history and is idempotent; merged='+merge,()=>{
 const source=legacySource(),saved=clone(source),c=config(),compiled=compilePrompts(source,c,{});
 const order=source.prompt_order.find(entry=>entry.character_id===100001).order;
 const enabled=new Set(order.filter(entry=>entry.enabled).map(entry=>entry.identifier)),messages=[];
 for(const entry of order){
  const prompt=row(source,entry.identifier);
  if(!prompt||prompt.marker||prompt.enabled===false||!enabled.has(prompt.identifier)||!prompt.content?.trim())continue;
  if(merge&&messages.at(-1)?.role===prompt.role)messages.at(-1).content+='\n\n'+prompt.content;
  else messages.push({role:prompt.role,content:prompt.content});
 }
 const history=[{role:'assistant',content:row(source,'tisya_pref_style').content},{role:'user',content:'旧笔录照原样留下。'},{role:'tool',content:JSON.stringify({quotation:row(source,'tisya_kb_techniques').content})}];
 messages.push(...clone(history));const old=clone(messages),result=applyCompiledMessages(messages,source,compiled);
 const active=result.slice(0,-history.length).map(message=>message.content).join('\n');
 for(const revision of PROSE_STYLE_REVISIONS){
  assert.equal(active.split(revision.after).length-1,1);
  assert.ok(!active.includes(revision.before));
 }
 assert.deepEqual(result.slice(-history.length),history);
 assert.deepEqual(result.map(message=>message.role),messages.map(message=>message.role));
 assert.deepEqual(compiled.prompt_order,source.prompt_order);
 assert.deepEqual(compiled.prompts.map(({content,...metadata})=>metadata),source.prompts.map(({content,...metadata})=>metadata));
 assert.deepEqual(compilePrompts(compiled,c,{}),compiled,'a second compile is idempotent');
 assert.deepEqual(applyCompiledMessages(result,compiled,compilePrompts(compiled,c,{})),result,'already compiled source produces no duplicate replacement');
 assert.deepEqual(messages,old);assert.deepEqual(source,saved);
});
