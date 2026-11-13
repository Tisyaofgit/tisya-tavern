import test from 'node:test';
import assert from 'node:assert/strict';
import stock from '../presets/Tisya-Matrix.json' with {type:'json'};
import fixture from './fixtures/returned-prose-stock.json' with {type:'json'};
import expected from './fixtures/returned-4a-text-digests.json' with {type:'json'};
import {baseline,compilePrompts,compilePromptText,applyCompiledMessages} from '../engine/config.mjs';
import {PREFERENCE_GROUPS} from '../engine/preferences.mjs';
import {STYLE_CARDS,currentStyleCard} from '../config/style-cards.js';
import {digest} from '../engine/common.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';
const prompt=(source,id)=>source.prompts.find(row=>row.identifier===id).content;
const config=()=>({tags:structuredClone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:{},parameters:{}}}});

test('4a prose remains verbatim, with only the two documented machine form blocks changed',()=>{
 for(const [id,text]of Object.entries(fixture.returned)){
  let current=prompt(stock,id),original=text;
  if(id==='tisya_registry')for(const tag of ['cells','archive']){const re=new RegExp('<'+tag+' format="form">[\\s\\S]*?</'+tag+'>');current=current.replace(re,'');original=original.replace(re,'');}
  assert.equal(current,original,id);
 }
 for(const row of expected.options){const actual=PREFERENCE_GROUPS.flatMap(g=>g.options).find(o=>o.id===row.id);assert.equal(digest(actual.effect),row.sha256,row.id);}
 for(const row of expected.styleCards)assert.equal(digest(STYLE_CARDS.find(c=>c.id===row.id).content),row.sha256,row.id);
 assert.equal(PREFERENCE_GROUPS.length,43);assert.equal(expected.options.length,190);
 assert.equal(PREFERENCE_GROUPS.flatMap(g=>g.options).filter(o=>o.default).length,53);
});

test('actual final message assembly keeps default and configured body min/max without lower-bound exceptions',()=>{
 for(const parameters of [{},{min_length:120,max_length:340},{min_length:3000},{max_length:8000}]){
  const c=config();c.story.play.parameters=parameters;
  const source=structuredClone(baseline),compiled=compilePrompts(source,c,{}),expand=s=>s.replace(/\{\{tisya_[\w]+\}\}/g,'').replaceAll('{{user}}','宿主人物').replaceAll('{{char}}','原卡人物'),enabled=new Set(source.prompt_order.find(g=>g.character_id===100001).order.filter(r=>r.enabled).map(r=>r.identifier)),input=source.prompts.filter(p=>!p.marker&&p.enabled!==false&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}));
  const sent=applyCompiledMessages(input,source,compiled,expand),text=sent.map(m=>m.content).join('\n');
  assert(text.includes(`<body min="${parameters.min_length??2000}" max="${parameters.max_length??5000}" unit="字">`));
  assert.doesNotMatch(text,/优先于篇幅下限|实际长度由本轮内容与授权范围决定|不按固定比例填充/);
 }
});

test('configured contradictory length bounds fail instead of silently deleting a bound',()=>{
 const c=config();c.story.play.parameters={min_length:6000};assert.throws(()=>compilePrompts(baseline,c,{}),/篇幅范围/);
});

test('explicit user prose stays authored even when equal to shipped candidate31 text',()=>{
 const c=config(),original='[REGISTRY]\n<body min="700" max="900" unit="字">\n我的正文规范\n</body>\n[/REGISTRY]';c.prompts.tisya_registry=original;
 assert(prompt(compilePrompts(baseline,c,{}),'tisya_registry').includes('<body min="700" max="900" unit="字">'));
 assert.equal(c.prompts.tisya_registry,original);
});
