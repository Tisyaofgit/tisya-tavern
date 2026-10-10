import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {HEART_DIRECTIONS,HEART_ROWS} from '../preset-hearts.js';
import {outputEnabled,registerPresetProtocol,DELIVERY_WARNING} from '../preset.js';
import {inspectMessage} from '../reader.js';
import {parseDisplayEnvelope,strictJSON} from '../reader-core.js';
const source=fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.9.json',import.meta.url),'utf8');
const preset=JSON.parse(source),clone=()=>structuredClone(preset);
test('native paired preset is complete, traceable and has no unexpanded Tavo code',()=>{
 const provenance=JSON.parse(fs.readFileSync(new URL('../presets/provenance.json',import.meta.url),'utf8'));
 assert.equal(createHash('sha256').update(source).digest('hex'),provenance.sha256);assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../preset-hearts.js',import.meta.url))).digest('hex'),provenance.heart_macros_sha256);
 assert.doesNotMatch(source,/<%|getvar\(|print\(c\./);
 const ids=preset.prompts.map(p=>p.identifier),order=preset.prompt_order[0].order;
 assert.equal(ids.length,new Set(ids).size);assert.deepEqual(new Set(order.map(p=>p.identifier)),new Set(ids));
 for(const id of ['worldInfoBefore','personaDescription','charDescription','charPersonality','scenario','worldInfoAfter','dialogueExamples','chatHistory']){
  const entry=preset.prompts.find(p=>p.identifier===id);assert.equal(entry.marker,true);assert.equal(entry.content,'');assert.equal(order.find(p=>p.identifier===id).enabled,true);
 }
 assert.equal(preset.prompts[0].role,'system');assert.deepEqual(order.slice(-3).map(p=>p.identifier),['tisya_think_commit','tisya_delivery_warning','tisya_prepare_trigger']);
 const inner=preset.prompts.find(p=>p.identifier==='tisya_inner_chain').content;
 const tags=[...inner.matchAll(/^<(task|title|body|next|status|extra|vars|archive|memory|actions)(?:\s[^>]*|\/)?>/gm)].map(m=>m[1]);
 assert.deepEqual(tags,['task','title','body','next','status','extra','vars','archive','memory','actions']);
 assert.match(inner,/\{\{tisya_output_kind\}\}/);
 assert.deepEqual(provenance.output.directions,['输入评价','回应用户评价','剧情吐槽']);assert.doesNotMatch(inner,/Heart comments are disabled/);for(const direction of provenance.output.directions)assert.ok(HEART_ROWS.includes('心声：有内容|'+direction+'|'));assert.match(inner,/\{\{tisya_heart_directions\}\}/);assert.match(inner,/\{\{tisya_heart_rows\}\}/);
});
test('native output switch follows both entry and order state without rewriting the preset',()=>{
 const p=clone(),before=JSON.stringify(p),get=()=>({prompts:p.prompts,order:p.prompt_order[0].order}),macros=new Map(),errors=[];
 const release=registerPresetProtocol({registerMacro:(n,f)=>macros.set(n,f),unregisterMacro:n=>macros.delete(n)},get,e=>errors.push(e));
 const render=()=>p.prompts.map(e=>e.content.replace(/\{\{(tisya_output_kind|tisya_delivery_warning|tisya_heart_directions|tisya_heart_rows|tisya_heart_moods)\}\}/g,(_,id)=>macros.get(id)())).join('\n');
 assert.match(render(),/"kind":"structured"/);assert.ok(render().includes(DELIVERY_WARNING));assert.ok(render().includes(HEART_DIRECTIONS));assert.ok(render().includes(HEART_ROWS));assert.equal(JSON.stringify(p),before);
 p.prompt_order[0].order.find(e=>e.identifier==='tisya_output').enabled=false;
 assert.match(render(),/"kind":"plain"/);assert.ok(!render().includes(DELIVERY_WARNING));assert.ok(!render().includes(HEART_DIRECTIONS));assert.ok(!render().includes(HEART_ROWS));
 p.prompt_order[0].order.find(e=>e.identifier==='tisya_output').enabled=true;p.prompts.find(e=>e.identifier==='tisya_output').enabled=false;
 assert.equal(macros.get('tisya_output_kind')(),'plain');
 p.prompts=p.prompts.filter(e=>e.identifier!=='tisya_output');assert.equal(macros.get('tisya_delivery_warning')(),'');
 assert.deepEqual(errors,[]);release();assert.equal(macros.size,0);
});
test('malformed native switches report explicit errors; unrelated presets are not changed',()=>{
 const p=clone(),s={prompts:p.prompts,order:p.prompt_order[0].order};s.order.find(e=>e.identifier==='tisya_output').enabled='false';
 assert.throws(()=>outputEnabled(s),/SWITCH_INVALID/);s.order.push({...s.order.find(e=>e.identifier==='tisya_output')});assert.throws(()=>outputEnabled(s),/DUPLICATE_OUTPUT/);
 assert.throws(()=>outputEnabled({prompts:[]}),/SOURCE_UNAVAILABLE/);assert.equal(outputEnabled({prompts:[],order:[]}),false);
});
test('shipped complete reply sample reaches all implemented public consumers',()=>{
 const raw=fs.readFileSync(new URL('../examples/reply-demo.txt',import.meta.url),'utf8'),data=inspectMessage(raw),envelope=parseDisplayEnvelope(raw);
 assert.equal(data.structured,true);assert.equal(data.body.paragraphs.value.length,6);assert.equal(data.actions.value.length,4);assert.equal(data.journey.value.memories.length,1);assert.equal(data.details.value.audit.length,7);assert.equal(data.details.value.taskHeart.items.length,2);assert.equal(data.details.value.nextHeart.items.length,1);
 assert.equal(strictJSON(envelope.blocks.title).text,'雾港来信');assert.match(data.journey.value.memories[0].quote.text,/潮水漫过石阶/);
 assert.ok(!JSON.stringify(data).includes('审计：'));assert.ok(!JSON.stringify(data).includes('心声：'));assert.match(data.body.value,/〔信笺/);
});
