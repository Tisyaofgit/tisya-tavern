import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimePreset,assembleRuntimePreset} from '../../../v3/preset-template.mjs';
import {compileFullNarrative} from '../../../v3/preset.mjs';
const build=(card={},currentUser='继续。')=>compileFullNarrative({snapshot:{rows:[],scope:{},creativeBrief:{}},currentUser,history:[{kind:'summary',text:'历史概要'}],card,includeEmpty:true});
test('import roundtrip retains visible enabled material slots even when empty; later data enters once',()=>{
 const p=JSON.parse(JSON.stringify(createRuntimePreset('writer')));assert.equal(p.name,'Tisya');
 for(const id of ['tisya_material_character_card','tisya_material_user_identity','tisya_material_lorebook','worldInfoBefore','worldInfoAfter','dialogueExamples','chatHistory']){
  assert.match(p.prompts.find(x=>x.identifier===id).content,/tisya_v3:/);assert.equal(p.prompt_order[0].order.find(x=>x.identifier===id).enabled,true);
 }
 const run=card=>assembleRuntimePreset('writer',p,build(card)).map(x=>x.content).join('\n');
 assert(!run().includes('CharacterCard'));const text=run({nativeCharacter:{name:'人物资料甲'},nativePersona:{name:'身份乙',zero:0,no:false},nativeWorldInfo:{before:['世界书前'],after:['世界书后']},dialogueExamples:[{role:'assistant',content:'示例对白'}]});
 for(const needle of ['人物资料甲','身份乙','世界书前','世界书后','示例对白','历史概要'])assert.equal(text.split(needle).length-1,1,needle);
 assert.match(text,/"zero": 0/);assert.match(text,/"no": false/);
});
test('selected text, role, order and both enabled switches own the actual request',()=>{
 const p=createRuntimePreset('writer'),order=p.prompt_order[0].order,main=p.prompts.find(x=>x.identifier==='main');main.content='用户自定义正文';main.role='assistant';order.push(order.splice(order.findIndex(x=>x.identifier==='main'),1)[0]);
 p.prompts.find(x=>x.identifier==='tisya_material_character_card').enabled=false;order.find(x=>x.identifier==='worldInfoBefore').enabled=false;
 const out=assembleRuntimePreset('writer',p,build({nativeCharacter:{name:'禁止卡资料'},nativeWorldInfo:{before:['禁止世界书']}}));assert.deepEqual(out.at(-1),{identifier:'main',role:'assistant',content:'用户自定义正文'});assert(!JSON.stringify(out).includes('禁止'));
 assert.equal(main.content,'用户自定义正文');
});
test('native positions and message roles survive template expansion without flattening',()=>{
 const out=assembleRuntimePreset('writer',createRuntimePreset('writer'),build({nativeWorldInfo:{depth:[{depth:0,role:'assistant',entries:['当前后']},{depth:1,role:'user',entries:['当前前']}]},dialogueExamples:[{role:'assistant',content:'示例'}]},'当前正文'));
 const at=x=>out.findIndex(m=>m.content===x);assert(at('当前前')<at('当前正文'));assert(at('当前正文')<at('当前后'));assert.equal(out[at('当前前')].role,'user');assert.equal(out[at('当前后')].role,'assistant');
});
test('literal template syntax in user data is never interpreted; malformed template and duplicate/current-off reject',()=>{
 const p=createRuntimePreset('writer');const out=assembleRuntimePreset('writer',p,build({},'我写 {{tisya_v3:unknown}} 和 {{tisya_v3:'));assert.equal(out.find(x=>x.identifier==='chatHistory／当前user').content,'我写 {{tisya_v3:unknown}} 和 {{tisya_v3:');
 const main=p.prompts.find(x=>x.identifier==='main');main.content='{{tisya_v3:broken';assert.throws(()=>assembleRuntimePreset('writer',p,build()),/未闭合/);main.content='{{tisya_v3:chatHistory／当前user}}';assert.throws(()=>assembleRuntimePreset('writer',p,build()),/重复/);main.content='custom';p.prompt_order[0].order.find(x=>x.identifier==='chatHistory／当前user').enabled=false;assert.throws(()=>assembleRuntimePreset('writer',p,build()),/未启用/);
});
