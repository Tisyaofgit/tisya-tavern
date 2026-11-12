import test from 'node:test';
import assert from 'node:assert/strict';
import stock from '../presets/Tisya-Matrix.json' with {type:'json'};
import {baseline,compilePrompts} from '../engine/config.mjs';
import {PREFERENCE_GROUPS} from '../engine/preferences.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';

const prompt=(source,id)=>source.prompts.find(row=>row.identifier===id).content;
const option=id=>PREFERENCE_GROUPS.flatMap(group=>group.options).find(row=>row.id===id);
const config=()=>({tags:structuredClone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:{},parameters:{}}}});

test('returned prose retains slow observation, limited viewpoint and agency without imposed sentence or length quotas',()=>{
 const compiled=compilePrompts(baseline,config(),{});
 const narrative=prompt(compiled,'tisya_pref_narrative'),style=prompt(compiled,'tisya_pref_style'),plot=prompt(compiled,'tisya_pref_plot');
 assert.doesNotMatch(style+plot,/14[–-]24|6[–-]12|65%|95%|三拍咬合|全部外化|一两句短促/);
 assert.match(style,/停顿和暂时无话/);assert.match(style,/获准的内心/);
 assert.match(narrative,/限知内心/);assert.match(narrative,/未经授权的重大/);
 assert.match(narrative,/真实授权边界.*短场景.*优先于篇幅下限/);
 assert.match(narrative,/可以自然发问/);assert.match(plot,/不按固定比例填充/);
 assert.doesNotMatch(prompt(compiled,'main'),/一两句/);
 assert.match(option('P02-B').effect,/共处静默/);
});

test('configured min/max survive preference compilation and exact options reach their intended slots',()=>{
 const c=config();c.story.play={choices:{CP:'CP-01',S01:'S01-A',S06:'S06-A','S08-Disc':'S08-Disc-A',N06:'N06-A',P00:'P00',P02:'P02-B'},parameters:{min_length:120,max_length:340}};
 const compiled=compilePrompts(baseline,c,{});
 assert.match(prompt(compiled,'tisya_registry'),/<body min="120" max="340" unit="字">/);
 for(const [id,slot]of [['CP-01','main'],['S01-A','tisya_pref_style'],['S06-A','tisya_material_style_card'],['S08-Disc-A','tisya_pref_style'],['P00','tisya_pref_plot'],['P02-B','tisya_pref_plot']])assert.equal(prompt(compiled,slot).split(option(id).effect).length-1,1);
 assert.doesNotMatch(prompt(compiled,'tisya_registry'),/写满篇幅区间|严禁以问句/);
});

test('new appearance choices are opt-in non-erotic descriptions and all predecessor default booleans remain',()=>{
 assert.equal(PREFERENCE_GROUPS.length,43);
 assert.equal(PREFERENCE_GROUPS.reduce((n,group)=>n+group.options.length,0),190);
 assert.equal(PREFERENCE_GROUPS.flatMap(group=>group.options).filter(row=>row.default===true).length,53);
 for(const id of ['S04-Sc9','S04-Sc10']){
  assert.equal(option(id).default,false);assert.match(option(id).effect,/非情色/);
  assert.doesNotMatch(option(id).effect,/校园初恋|单手可圈握|高大对手|耳根通红、呼吸乱拍/);
 }
});

test('form structure receives limited rule authority while record content stays in dream material',()=>{
 const task=prompt(stock,'tisya_task_start');
 assert.match(task,/@FORM_CONTRACT/);
 assert.match(task,/表名、字段、行号与分组结构/);
 assert.match(task,/记录值、正文摘录与人物看法仍属 dream 资料/);
 assert.doesNotMatch(task,/每行写|新增记录写【/,'TASK does not duplicate the form tutorial');
 const registry=prompt(stock,'tisya_registry');
 assert.match(registry,/<cells format="form">/);assert.match(registry,/<archive format="form">/);
 assert.equal(stock.prompts.find(row=>row.identifier==='tisya_material_cell_prompts').tisya_layer,'dream');
});

test('stock has no fixed body/title count while explicit one-sided and two-sided limits remain configurable',()=>{
 const plain=compilePrompts(structuredClone(baseline),config(),{}),text=prompt(plain,'tisya_registry');
 assert.match(text,/<body>/);assert.doesNotMatch(text,/<body[^>]*\b(?:min|max)=|不超过8字|65%|95%/);
 const low=config();low.story.play={parameters:{min_length:6000}};
 assert.match(prompt(compilePrompts(structuredClone(baseline),low,{}),'tisya_registry'),/<body min="6000" unit="字">/);
 const high=config();high.story.play={parameters:{max_length:80}};
 assert.match(prompt(compilePrompts(structuredClone(baseline),high,{}),'tisya_registry'),/<body max="80" unit="字">/);
});
