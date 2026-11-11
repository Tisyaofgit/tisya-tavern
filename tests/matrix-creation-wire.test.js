import test from 'node:test';
import assert from 'node:assert/strict';
import {taskSlots,preprocessTask} from '../tables/slots.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {defaultWorld} from '../config/core.js';
import original from '../presets/Tisya-Matrix.json' with {type:'json'};

test('creation retains the full master reply and delivers native sources to their actual material slots',()=>{
 const input={databaseContract:'tisya.matrix-creation/1',replyContract:'tisya.creation-sheets/1',kind:'character',mode:'extend',goal:'创建角色',source:{uid:81},forms:'【人物原点档案／序号】\n1 显示名称',references:'人物原点档案／已有：阿青〔1〕',template:'仅新内容用的骨架',nativeSources:{card:{definition:'完整原卡{{literal}}'},books:[{name:'原书',content:'已选资料',enabled:false}],contractor:{name:'契约者',description:'屏幕外愿望'},bindings:['原书'],policy:'来源边界'}};
 const slots=taskSlots('tableGenesis',input);assert.equal(slots.source.databaseContract,input.databaseContract);assert.equal(slots.state.forms,input.forms);assert.deepEqual(slots.card,input.nativeSources.card);assert.deepEqual(slots.books,input.nativeSources.books);assert.deepEqual(slots.source.contractor,input.nativeSources.contractor);
 const text=preprocessTask('tableGenesis',input);for(const value of ['完整原卡','已选资料','屏幕外愿望','来源边界','仅新内容用的骨架'])assert.ok(text.includes(value),value);
 const preset=pairedPreset({task:'tableGenesis',configuration:{world:defaultWorld()}}),wire=taskMessages({preset,task:'tableGenesis',input,substitute:s=>s.replaceAll('{{literal}}','WRONG')}).map(x=>x.content).join('\n');
 for(const tag of ['<reply id="tisya-onepass-1">','<task','<anchor phase="before">','<title','<body','<anchor phase="after">','<extra>','<cells','<vars/>','<archive/>','<actions','</reply>'])assert.ok(wire.includes(tag),tag);
 assert.match(wire,/完整原卡\{\{literal\}\}/);assert.doesNotMatch(wire,/Return JSON only|Return one strict JSON|matrix\.changes|\{\{tisya_/);for(const id of ['main','tisya_identity_attestation','tisya_flow_gate','tisya_think_commit','tisya_prepare_trigger'])assert.equal(preset.entries[id],original.prompts.find(p=>p.identifier===id).content);
});
test('configuration, source initialization and history use the same registered reply with task-specific form profiles',()=>{
 for(const task of ['tableAssistant','templateInit','historyImport']){const input={formContract:'tisya.simple-form/1',forms:'【所选表／1】\n1 内容',sourceHistory:['实际原文']},preset=pairedPreset({task,configuration:{world:defaultWorld()},formContract:input.formContract}),wire=taskMessages({preset,task,input}).map(x=>x.content).join('\n');assert.match(wire,/<reply id="tisya-onepass-1">/);assert.match(wire,/实际原文/);assert.match(wire,/STATE.forms/);assert.doesNotMatch(wire,/Return JSON only|严格 JSON|matrix\.changes/);}
});
test('task-specific form replies retain unique cells and vars inside the shared extra container',()=>{
 for(const task of ['tableGenesis','tableAssistant','templateInit','historyImport']){
  const input={formContract:'tisya.simple-form/1',forms:'【所选表／1】\n1 内容'},preset=pairedPreset({task,configuration:{world:defaultWorld()},formContract:input.formContract});
  const registry=taskMessages({preset,task,input}).find(m=>m.content.startsWith('[REGISTRY]')).content;
  const frame=registry.match(/\n<reply id="tisya-onepass-1">[\s\S]*?\n<\/reply>/)?.[0];assert.ok(frame,task);
  const extras=[...frame.matchAll(/<extra>([\s\S]*?)<\/extra>/g)];assert.equal(extras.length,1,task);
  assert.equal([...extras[0][1].matchAll(/<cells format="form">/g)].length,1,task);
  assert.equal([...extras[0][1].matchAll(/<vars\/>/g)].length,1,task);
  assert.ok(extras[0][1].indexOf('</cells>')<extras[0][1].indexOf('<vars/>'),task);
  assert.doesNotMatch(frame.replace(extras[0][0],''),/<(?:cells|vars)\b/,task);
 }
});
