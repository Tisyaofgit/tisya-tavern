import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline,compilePrompts,applyCompiledMessages,createConfiguration} from '../engine/config.mjs';
import {PREFERENCE_GROUPS} from '../engine/preferences.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';

const clone=structuredClone;
const choices={S01:'S01-A',P00:'P00',P02:'P02-B',TECH:['TECH-10']};
const effect=id=>PREFERENCE_GROUPS.flatMap(row=>row.options).find(row=>row.id===id).effect;
const prompt=(preset,id)=>preset.prompts.find(row=>row.identifier===id).content;
const config=()=>({tags:clone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:clone(choices)}}});
const custom={
 tisya_pref_style:'<Pref_Style>\n@GRAMMAR.DENSITY := USER_STYLE_KEEP：旧纸面的色泽可以慢慢写。\n@CUSTOM.STYLE := 保留作者自写的语气。\n</Pref_Style>',
 tisya_pref_plot:'<Pref_Plot>\n@CLIMAX.INK_BASE := USER_LENGTH_KEEP：依用户指定的场景篇幅展开。\n@PLOT.PACE := USER_PACE_KEEP：这一刻安静停留。\n@CUSTOM.PLOT := 人物关系保持既有状态。\n</Pref_Plot>',
 tisya_kb_techniques:'<TechniqueCorpus>\n@TECH.PROGRESSION := USER_TECH_KEEP：一束光可以照满一段。\n@CUSTOM.TECH := 保留自定义技法。\n</TechniqueCorpus>',
};

test('selected slow-prose choices reach the outgoing merged request once and preserve history and source',()=>{
 const source=clone(baseline);
 for(const [id,content]of Object.entries(custom))source.prompts.find(row=>row.identifier===id).content=content;
 const savedSource=clone(source),selected=config(),savedConfig=clone(selected),compiled=compilePrompts(source,selected,{});
 const enabled=new Set(source.prompt_order.find(row=>row.character_id===100001).order.filter(row=>row.enabled).map(row=>row.identifier));
 const messages=[];
 for(const row of source.prompts){
  if(row.marker||row.enabled===false||!enabled.has(row.identifier)||!row.content?.trim())continue;
  if(messages.at(-1)?.role===row.role)messages.at(-1).content+='\n\n'+row.content;
  else messages.push({role:row.role,content:row.content});
 }
 const history=[{role:'assistant',content:custom.tisya_pref_style},{role:'user',content:'我让管理员继续整理那叠旧纸。'},{role:'tool',content:JSON.stringify({note:custom.tisya_kb_techniques})}];
 messages.push(...clone(history));const savedMessages=clone(messages),out=applyCompiledMessages(messages,source,compiled);
 const current=out.slice(0,-history.length).map(row=>row.content).join('\n');
 for(const id of ['S01-A','P00','P02-B','TECH-10'])assert.equal(current.split(effect(id)).length-1,1,id+' must reach the actual request once');
 for(const key of ['STYLE','PLOT','TECH'])assert.match(current,new RegExp('@CUSTOM\\.'+key));
 assert.doesNotMatch(current,/USER_STYLE_KEEP|USER_LENGTH_KEEP|USER_PACE_KEEP|USER_TECH_KEEP/,'explicit choices intentionally replace their own keyed directives');
 assert.deepEqual(out.slice(-history.length),history,'identical quoted old instructions in history remain literal');
 assert.deepEqual(source,savedSource);assert.deepEqual(selected,savedConfig);assert.deepEqual(messages,savedMessages);
 for(const id of ['tisya_registry','tisya_creative_guide','tisya_pref_narrative'])assert.equal(prompt(compiled,id),prompt(compilePrompts(source,{...config(),story:{userName:'阿青'}},{}),id));
});

test('catalogue defaults do not overwrite custom prose without a selection; explicit null blocks inherited choices',()=>{
 for(const inherited of [false,true]){
  const c={tags:clone(DEFAULT_TAGS),prompts:clone(custom),story:{userName:'阿青',play:{choices:{}}}};
  if(inherited){c.playDefaults={choices:clone(choices)};c.story.play.choices={S01:null,P00:null,P02:null,TECH:null};}
  const before=clone(c),compiled=compilePrompts(baseline,c,{});
  for(const [id,content]of Object.entries(custom))assert.equal(prompt(compiled,id),content);
  assert.deepEqual(c,before);
 }
});

test('global prose choices and authored prompt text survive save and cold reopen; a story can opt out independently',async()=>{
 const context={chatId:'one',characterId:0,extensionSettings:{}},disk={};
 const store=createConfiguration({getContext:()=>context,persist:async()=>{disk.settings=clone(context.extensionSettings);return true;}});
 const first=store.read();first.playDefaults={choices:clone(choices)};first.prompts=clone(custom);
 first.story.play={choices:{P00:null,P02:null}};await store.save(first);
 const secondContext={...context,extensionSettings:clone(disk.settings)};
 const reopened=createConfiguration({getContext:()=>secondContext,persist:()=>{throw Error('read and compile must not write');}});
 const saved=clone(secondContext.extensionSettings),current=reopened.read(),compiled=compilePrompts(baseline,current,{});
 assert.deepEqual(current.playDefaults.choices,choices);assert.deepEqual(current.prompts,custom);
 assert.equal(prompt(compiled,'tisya_pref_plot'),custom.tisya_pref_plot);
 assert.ok(prompt(compiled,'tisya_pref_style').includes(effect('S01-A')));
 secondContext.chatId='two';const other=compilePrompts(baseline,reopened.read(),{});
 assert.ok(prompt(other,'tisya_pref_plot').includes(effect('P02-B')));
 assert.deepEqual(secondContext.extensionSettings,saved);
});
