import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore,preferenceSettings,validateConfig} from '../config/core.js';
import {narrativeRuleRows,narrativeRuleDefault,setNarrativeRule,resetNarrativeRule,validateNarrativeRules} from '../config/rule-text.js';
import {NARRATIVE as N} from '../settings-core.js';
import {compileNarrative,registerLivePreset} from '../narrative-bridge.js';
const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url)));
function compile(context,src,moods){const raw=context.extensionSettings[KEY],mode=raw.worlds[worldKey(context)]?.modes.narrative;if(mode?.叙事指令!==undefined)raw.叙事指令=structuredClone(mode.叙事指令);return compileNarrative(context,src,moods);}
const source=()=>({identity:'test',prompts:structuredClone(preset.prompts),order:structuredClone(preset.prompt_order[0].order)});
function fixture(){const data=emptyConfig(),context={chatId:'one',characterId:0,characters:[{avatar:'a',name:'甲'}],chatMetadata:{},extensionSettings:{[KEY]:data}},key=worldKey(context);data.worlds[key]=defaultWorld();const mode=data.worlds[key].modes.narrative;mode.heartDirections=[];const store=createStore({getContext:()=>context,persist:async()=>true});return {data,context,key,mode,store};}
const text=c=>Object.values(c.rest.entries).join('\n');
test('selected camera defaults use natural paragraphs in all three delivered workflows',()=>{
 const f=fixture(),n=f.mode.narrative;for(const [id,choice] of [['B02','多人物轮换'],['B04','分段多人物内心'],['B05','独立分段穿插']])n[N.rows.find(row=>row.id===id).variable]=choice;
 // Resolve the registry variable instead of assuming translated display labels.
 for(const id of ['B02','B04','B05']){const row=narrativeRuleRows(f.mode).find(r=>r.id===id);assert.ok(row);}
 for(const detail of ['full','compact','format']){f.mode.workflowDetail=detail;const c=compile(f.context,source(),[]),actual=text(c);assert.match(actual,/用自然叙述交代主体/);assert.doesNotMatch(actual,/段首明确主体|开头明确人物与场景/);assert.match(actual,/玩家内心遵守独立授权/);assert.match(actual,/<reply/);}
});
test('rule edits replace one selected option without duplicate defaults or altering output structure',()=>{
 const f=fixture(),m=f.mode;setNarrativeRule(m,'B04','视角人物内心','手写内心规则：借人物声口承接现场。');setNarrativeRule(m,'B04','行为外化','未选选项标记');
 for(const detail of ['full','compact','format']){m.workflowDetail=detail;const before=compile(f.context,source(),[]),actual=text(before);assert.equal((actual.match(/手写内心规则/g)??[]).length,1);assert.doesNotMatch(actual,/未选选项标记|直接呈现当前视角人物的内心/);assert.match(actual,/<vars/);assert.match(actual,/<actions/);}
 const snapshot=JSON.stringify(m);narrativeRuleRows(m);assert.equal(JSON.stringify(m),snapshot);resetNarrativeRule(m,'B04','视角人物内心');assert.equal(m.叙事指令.B04.行为外化,'未选选项标记');assert.equal(narrativeRuleRows(m).find(r=>r.id==='B04').custom,false);
});
test('all editable selected rules reach their responsible output in full compact and format',()=>{
 for(const detail of ['full','compact','format']){const f=fixture();f.mode.workflowDetail=detail;f.mode.heartDirections=['输入评价'];
  for(const row of narrativeRuleRows(f.mode)){setNarrativeRule(f.mode,row.id,row.choice,'CUSTOM_'+row.id+'。');const actual=text(compile(f.context,source(),['月潮']));assert.ok(actual.includes('CUSTOM_'+row.id),detail+' '+row.id);resetNarrativeRule(f.mode,row.id,row.choice);}
 }
});
test('edits persist once globally, survive switching cards and reset only their own option',async()=>{
 const f=fixture();let snap=f.store.read(),mode=snap.world.modes.narrative;setNarrativeRule(mode,'B04','视角人物内心','全局内心规则');setNarrativeRule(mode,'B05','关闭','仍留当前主线');snap.data.游玩偏好=preferenceSettings(mode);await f.store.save(snap.data,snap.revision,snap.key);
 assert.equal(f.context.extensionSettings[KEY].worlds[f.key].modes.narrative.叙事指令,undefined);
 f.context.characters=[{avatar:'b',name:'乙'}];f.context.chatId='two';snap=f.store.read();assert.equal(snap.world.modes.narrative.叙事指令.B04.视角人物内心,'全局内心规则');resetNarrativeRule(snap.world.modes.narrative,'B04','视角人物内心');await f.store.save(snap.data,snap.revision,snap.key);snap=f.store.read();assert.deepEqual(snap.data.叙事指令,{B05:{关闭:'仍留当前主线'}});
});
test('empty overrides are intentional and malformed or unknown fields fail without executing getters',()=>{
 const f=fixture();setNarrativeRule(f.mode,'B04','视角人物内心','');assert.equal(narrativeRuleRows(f.mode).find(r=>r.id==='B04').text,'');assert.doesNotMatch(text(compile(f.context,source(),[])),/直接呈现当前视角人物的内心/);
 for(const invalid of [null,[],new Date(),{B04:new Map()},{X99:{}},{B04:{bogus:'x'}},{B04:{视角人物内心:3}}])assert.throws(()=>validateNarrativeRules(invalid));let reads=0;const bad={};Object.defineProperty(bad,'B04',{enumerable:true,get(){reads++;return {};}});assert.throws(()=>validateNarrativeRules(bad));assert.equal(reads,0);
 f.mode.叙事指令={C08:{简体中文:'machine language override'}};assert.throws(()=>validateConfig(f.data),/未知/);
});
test('old saved configurations remain read-only compatible and stale/failed saves preserve values',async()=>{
 const f=fixture(),before=JSON.stringify(f.data);validateConfig(f.data);narrativeRuleRows(f.mode);assert.equal(JSON.stringify(f.data),before);
 const failed=createStore({getContext:()=>f.context,persist:async()=>false}),s=failed.read();setNarrativeRule(s.world.modes.narrative,'B04','视角人物内心','未保存');s.data.游玩偏好=preferenceSettings(s.world.modes.narrative);await assert.rejects(failed.save(s.data,s.revision,s.key),/未确认/);assert.equal(JSON.stringify(f.data),before);
});
test('live macro cache notices a saved rule edit and legacy live preset also applies global wording',()=>{
 const f=fixture(),macros=new Map(),src=source();registerLivePreset({registerMacro:(id,fn)=>macros.set(id,fn),unregisterMacro(){}},()=>src,()=>f.context,()=>[]);const name='tisya_live_tisya_inner_chain';assert.doesNotMatch(macros.get(name)(),/缓存变化/);setNarrativeRule(f.mode,'B04','视角人物内心','缓存变化');f.data.叙事指令=structuredClone(f.mode.叙事指令);assert.match(macros.get(name)(),/缓存变化/);
 const old=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.12.json',import.meta.url))),oldSource={identity:'old',prompts:old.prompts,order:old.prompt_order[0].order};f.data.叙事指令=structuredClone(f.mode.叙事指令);const c=compileNarrative(f.context,oldSource,['月潮']);assert.match(text(c),/缓存变化/);
 const oldMacros=new Map();registerLivePreset({registerMacro:(id,fn)=>oldMacros.set(id,fn),unregisterMacro(){}},()=>oldSource,()=>f.context,()=>['月潮']);assert.match(oldMacros.get(name)(),/缓存变化/);f.data.叙事指令.B04.视角人物内心='旧预设缓存已变化';assert.match(oldMacros.get(name)(),/旧预设缓存已变化/);
});
