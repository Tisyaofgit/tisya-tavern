import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NARRATIVE as N} from '../settings-core.js';
import {ENGLISH_RULES,CATEGORY_ROWS} from '../config/english-rules.js';
import {setNarrativeRule} from '../config/rule-text.js';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
import {onePassEntries} from '../onepass/preset.mjs';
import {registerLivePreset,compileNarrative} from '../narrative-bridge.js';
import {KEY,createStore,preferenceSettings,emptyConfig,defaultWorld,worldKey} from '../config/core.js';
import {selectedHeartDirections,HEART_DIRECTIONS} from '../heart-contract.js';
import {initiativeRule} from '../config/initiative.js';
const fresh=()=>fullDefaultConfiguration();
const mode=c=>c.world.modes.narrative;
const group=(text,tag)=>text.match(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>'))?.[1]??'';
const source=()=>{const p=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-One-Pass-1.json',import.meta.url)));return {prompts:p.prompts,order:p.prompt_order.find(x=>x.character_id===100001).order};};
const skeleton=s=>(s.match(/<\/?(?:reply|task|think|title|body|status|extra|vars|archive|memory|actions)\b[^>]*>/g)??[]).map(s=>s.replace(/\d+/g,'N'));
const baseline=onePassEntries(fresh(),DEFAULT_MOODS);

test('each selectable narrative wording reaches its owning preference category or output owner',()=>{
 let count=0;
 for(const [id,choices]of Object.entries(ENGLISH_RULES))for(const [choice,expected]of Object.entries(choices)){
  if(choice==='指定 NPC')continue;
  const c=fresh(),m=mode(c),row=N.rows.find(r=>r.id===id),original=m.narrative[row.variable];
  m.narrative[row.variable]=choice;
  const out=onePassEntries(c,DEFAULT_MOODS),owner=group(id==='C02'?out.tisya_material_style:out.tisya_material_rule_material,Object.entries(CATEGORY_ROWS).find(([,ids])=>ids.includes(id))[0]);
  if(choice!==original)assert.ok(owner.includes(expected),id+' '+choice+' missing from owner');
  assert.deepEqual(skeleton(out.tisya_registry),skeleton(baseline.tisya_registry),id+' must retain eleven-block skeleton');count++;
 }
 assert.ok(count>60);
});

test('every editable selected rule is consumed once, not replaced by the built-in wording',()=>{
 for(const id of Object.keys(ENGLISH_RULES)){
  const c=fresh(),m=mode(c),row=N.rows.find(r=>r.id===id),choice=m.narrative[row.variable],text='本项独有指令_'+id+'：根据已知情境展开。';
  setNarrativeRule(m,id,choice,text);const out=onePassEntries(c,DEFAULT_MOODS),all=Object.values(out).join('\n');assert.equal(all.split(text).length-1,1,id);assert.deepEqual(skeleton(out.tisya_registry),skeleton(baseline.tisya_registry));
 }
});

test('initiative belongs once in CharacterPortrayal and respects every prerequisite',()=>{
 for(const level of ['自主互动','主动推进']){
  const c=fresh(),m=mode(c);m.角色主动性=level;const out=onePassEntries(c,DEFAULT_MOODS);assert.ok(group(out.tisya_material_rule_material,'CharacterPortrayal').includes(initiativeRule(level)));assert.equal(Object.values(out).join('\n').split(initiativeRule(level)).length-1,1);
  for(const disable of [m=>m.narrative.缇斯亚叙事角色自主=false,m=>m.narrative.缇斯亚叙事创作模式='大纲扩写',m=>m.narrative.缇斯亚叙事步序=m.narrative.缇斯亚叙事步序.filter(s=>s!=='人物反应'),m=>m.narrative.缇斯亚叙事步序=m.narrative.缇斯亚叙事步序.filter(s=>s!=='行动与剧情')]){const changed=structuredClone(c);disable(mode(changed));assert.doesNotMatch(Object.values(onePassEntries(changed,DEFAULT_MOODS)).join('\n'),/角色主动性·/);}
 }
});

test('unsaved heart selection has one display/compile/mood default; explicit empty remains disabled',()=>{
 const ctx={chatId:'test',characterId:0,characters:[{avatar:'test.png'}],chatMetadata:{variables:{}},extensionSettings:{}},macros=new Map();let reads=0;
 const live=registerLivePreset({registerMacro:(k,v)=>macros.set(k,v),unregisterMacro(){}},source,()=>ctx,()=>{reads++;return DEFAULT_MOODS;});
 const before=JSON.stringify(ctx);assert.deepEqual(selectedHeartDirections({}),HEART_DIRECTIONS);let registry=macros.get('tisya_live_onepass_tisya_registry')();for(const d of HEART_DIRECTIONS)assert.equal(registry.split('\n').filter(l=>l.startsWith(d+'|')).length,2);assert.ok(reads>0);assert.equal(JSON.stringify(ctx),before);
 const c=fresh();mode(c).heartDirections=[];assert.deepEqual(selectedHeartDirections(mode(c)),[]);registry=onePassEntries(c,[]).tisya_registry;for(const d of HEART_DIRECTIONS)assert.ok(!registry.includes(d+'|'));live.dispose();
});

test('global save, reopen and another card compile the same user preference categories',async()=>{
 const ctx={chatId:'first',characterId:0,characters:[{avatar:'a.png'},{avatar:'b.png'}],chatMetadata:{variables:{}},extensionSettings:{}};let writes=0;
 const store=createStore({getContext:()=>ctx,persist:async()=>{writes++;return true;}}),snap=store.read(),m=snap.world.modes.narrative;
 Object.assign(m,{角色主动性:'主动推进',heartDirections:['剧情吐槽'],用户口癖保留:true,用户叙事口吻延续:true});m.narrative.缇斯亚叙事玩家代写='仅润色已给言行';m.narrative.缇斯亚叙事人称='第二';snap.data.游玩偏好=preferenceSettings(m);
 await store.save(snap.data,snap.revision,snap.key);assert.equal(writes,1);assert.ok(ctx.extensionSettings[KEY]);
 const first=compileNarrative(ctx,source(),DEFAULT_MOODS).rest.entries;ctx.characterId=1;ctx.chatId='other';const second=compileNarrative(ctx,source(),DEFAULT_MOODS).rest.entries;assert.equal(first.tisya_material_rule_material,second.tisya_material_rule_material);assert.equal(first.tisya_registry,second.tisya_registry);assert.match(second.tisya_material_rule_material,/角色主动性·主动推进/);assert.match(group(second.tisya_material_rule_material,'SpeechHabits'),/catchphrases/);assert.match(group(second.tisya_material_rule_material,'DictionAndStyle'),/current narrative voice/);
});

test('feature switches, description focus, world constraints and voice reach only their owner',()=>{
 const checks=[
  ['缇斯亚叙事防八股','ProhibitedWordsAndPatterns','Literals:'],
  ['缇斯亚叙事防名词堆砌','DictionAndStyle','Use concrete processes and consequences;'],
  ['缇斯亚叙事文风鲜活','DictionAndStyle','Make objects, sounds, action traces'],
  ['缇斯亚叙事角色鲜活','CharacterPortrayal','Differentiate new characters'],
  ['缇斯亚叙事防绝望','PlotPreferences','Develop growth, recovery and redemption'],
 ];
 for(const [key,tag,phrase]of checks){const c=fresh(),m=mode(c);assert.ok(group(onePassEntries(c,DEFAULT_MOODS).tisya_material_rule_material,tag).includes(phrase));m.narrative[key]=false;const out=onePassEntries(c,DEFAULT_MOODS);assert.ok(!group(out.tisya_material_rule_material,tag).includes(phrase));assert.deepEqual(skeleton(out.tisya_registry),skeleton(baseline.tisya_registry));}
 const c=fresh(),m=mode(c);m.narrative.缇斯亚叙事描写重心=['对白','人物关系'];c.world.switches={difficulty:'严格',centrality:'低',boundary:'不采用无依据的神秘救援。'};m.用户口癖保留=true;m.用户叙事口吻延续=true;
 const p=onePassEntries(c,DEFAULT_MOODS).tisya_material_rule_material;assert.match(group(p,'DictionAndStyle'),/Description focus: 对白、人物关系/);assert.match(group(p,'ProhibitedWordsAndPatterns'),/不采用无依据/);assert.match(group(p,'PlotPreferences'),/carry established resistance/);assert.match(group(p,'PlotPreferences'),/follow independent affairs/);
 for(const key of ['用户口癖保留','用户叙事口吻延续']){m[key]=false;const off=onePassEntries(c,DEFAULT_MOODS).tisya_material_rule_material;assert.ok(!off.includes(key==='用户口癖保留'?'catchphrases':'current narrative voice'));m[key]=true;}
});

test('all creative stage switches survive replacement without removing mandatory source/player boundaries',()=>{
 const c=fresh(),m=mode(c),steps=[...m.narrative.缇斯亚叙事步序];
 for(const stage of steps){m.narrative.缇斯亚叙事步序=steps.filter(s=>s!==stage);const out=onePassEntries(c,DEFAULT_MOODS);assert.ok(!out.tisya_inner_chain.includes(stage+' —'));assert.match(out.tisya_material_rule_material,/Reserve major choices/);assert.match(out.tisya_material_rule_material,/unrevealed secrets/);assert.deepEqual(skeleton(out.tisya_registry),skeleton(baseline.tisya_registry));}
});

test('language, lengths, action ranges and summary are compiled independently',()=>{
 const c=fresh(),m=mode(c);m.narrative.缇斯亚叙事语言='指定单语';m.narrative.缇斯亚叙事语言配置=['English'];m.角色对白={启用:true,来源:'指定语言',语言:'日本語'};m.narrative.缇斯亚叙事篇幅区间={下限:800,上限:1300,单位:'词'};m.narrative.缇斯亚叙事行动选项={下限:2,上限:3};
 let out=onePassEntries(c,DEFAULT_MOODS);assert.match(group(out.tisya_material_rule_material,'GlobalWritingRequirements'),/Output language: "English"/);assert.match(out.tisya_material_rule_material,/Use "日本語"/);assert.match(out.tisya_material_rule_material,/world explicitly establishes multiple languages/);assert.match(out.tisya_material_rule_material,/speaker’s established identity and language competence/);assert.match(out.tisya_material_rule_material,/A configured language selects an eligible language, not permission to bypass/);assert.match(out.tisya_registry,/<body min="800" max="1300" unit="词">/);assert.match(out.tisya_registry,/<actions min="2" max="3">/);
 m.summary=false;out=onePassEntries(c,DEFAULT_MOODS);assert.ok(!out.tisya_registry.includes('用户偏好|'));assert.match(out.tisya_registry,/<body min="800" max="1300" unit="词">/);for(const d of HEART_DIRECTIONS)assert.equal(out.tisya_registry.split('\n').filter(l=>l.startsWith(d+'|')).length,2);
 m.actions=false;out=onePassEntries(c,DEFAULT_MOODS);assert.match(out.tisya_registry,/<actions\/>/);m.角色对白.启用=false;assert.doesNotMatch(onePassEntries(c,DEFAULT_MOODS).tisya_material_rule_material,/Bilingual dialogue:/);
});

test('full, compact and format workflow selections change executed detail and keep preference owners',()=>{
 const c=fresh(),m=mode(c),results={};m.角色主动性='主动推进';m.narrative.缇斯亚叙事玩家代写='不代写';
 for(const detail of ['full','compact','format']){m.workflowDetail=detail;results[detail]=onePassEntries(c,DEFAULT_MOODS);assert.match(results[detail].tisya_material_rule_material,/角色主动性·主动推进/);assert.deepEqual(skeleton(results[detail].tisya_registry),skeleton(baseline.tisya_registry));}
 assert.ok(results.full.tisya_inner_chain.length>results.compact.tisya_inner_chain.length+1000);assert.ok(results.compact.tisya_inner_chain.length>results.format.tisya_inner_chain.length+500);assert.match(results.compact.tisya_inner_chain,/Give each character only knowledge acquired/);assert.match(results.format.tisya_inner_chain,/keep reasoning private/);
});

test('discussion and summary selections retain current eleven blocks without forcing scene creation',()=>{
 for(const authoring of ['场外讨论','总结整理']){
  const c=fresh(),m=mode(c);m.narrative.缇斯亚叙事创作模式=authoring;m.角色主动性='主动推进';const out=onePassEntries(c,DEFAULT_MOODS);assert.deepEqual(skeleton(out.tisya_registry),skeleton(baseline.tisya_registry));assert.match(out.tisya_material_rule_material,/\[AUTHORING.MODE\]/);assert.match(out.tisya_material_rule_material,/Do not continue the fictional scene/);assert.match(out.tisya_inner_chain,/Apply AUTHORING.MODE/);assert.match(out.tisya_registry,/<body min="0"/);assert.match(out.tisya_registry,/keep any machine blocks empty/);assert.doesNotMatch(out.tisya_material_rule_material,/角色主动性·/);assert.doesNotMatch(out.tisya_inner_chain,/人物反应 —/);
 }
});

test('real configuration checkboxes save empty hearts, reopen consistently and skip the mood catalogue',async()=>{
 const {Window}=await import('happy-dom'),{mountConfiguration}=await import('../config/panel.js'),win=new Window(),doc=win.document,box=doc.createElement('div');doc.body.append(box);
 const ctx={chatId:'ui',characterId:0,characters:[{avatar:'ui.png'}],chatMetadata:{variables:{}},extensionSettings:{}};const store=createStore({getContext:()=>ctx,persist:async()=>true}),mount=()=>mountConfiguration(doc,box,{store,host:{},getSettings:()=>({联系人分组:{}}),initialTab:'mode'});
 let ui=mount();await ui.ready;for(const name of HEART_DIRECTIONS){const input=ui.root.shadowRoot.querySelector('[aria-label="心声 · '+name+'"]');assert.ok(input.checked);input.checked=false;input.dispatchEvent(new win.Event('change'));await ui.settled();}
 assert.deepEqual(store.read().world.modes.narrative.heartDirections,[]);ui.dispose();ui=mount();await ui.ready;for(const name of HEART_DIRECTIONS)assert.equal(ui.root.shadowRoot.querySelector('[aria-label="心声 · '+name+'"]').checked,false);
 const macros=new Map(),live=registerLivePreset({registerMacro:(k,v)=>macros.set(k,v),unregisterMacro(){}},source,()=>ctx,()=>{throw Error('disabled hearts must not load moods');});const output=macros.get('tisya_live_onepass_tisya_registry')();for(const name of HEART_DIRECTIONS)assert.equal(output.split('\n').filter(l=>l.startsWith(name+'|')).length,0);
 live.dispose();ui.dispose();await win.happyDOM.abort();
});

test('missing workflow detail uses the same compact read default as the configuration UI',()=>{
 const c=fresh(),m=mode(c);delete m.workflowDetail;const before=JSON.stringify(c),out=onePassEntries(c,DEFAULT_MOODS);assert.match(out.tisya_material_rule_material,/Keep planning concise/);assert.match(out.tisya_inner_chain,/Give each character only knowledge acquired/);assert.equal(JSON.stringify(c),before);
});

test('live macro expansion supports every authoring choice and loads moods only for selected comments',()=>{
 for(const choice of ['互动叙事','大纲扩写','场外讨论','总结整理'])for(const enabled of [true,false]){
  const ctx={chatId:'mode',characterId:0,characters:[{avatar:'mode.png'}],chatMetadata:{variables:{}},extensionSettings:{}},data=emptyConfig(),w=defaultWorld();data.worlds[worldKey(ctx)]=w;ctx.extensionSettings[KEY]=data;w.modes.narrative.narrative.缇斯亚叙事创作模式=choice;w.modes.narrative.heartDirections=enabled?['剧情吐槽']:[];const macros=new Map();let calls=0;const live=registerLivePreset({registerMacro:(k,v)=>macros.set(k,v),unregisterMacro(){}},source,()=>ctx,()=>{calls++;if(!enabled)throw Error('unexpected mood read');return DEFAULT_MOODS;});const result=macros.get('tisya_live_onepass_tisya_registry')();assert.match(result,/ONEPASS.CONTRACT/);assert.equal(result.split('\n').filter(l=>l.startsWith('剧情吐槽|')).length,enabled?2:0);assert.equal(calls>0,enabled);live.dispose();
 }
});

test('plain output live macros do not require moods or emit a dormant public-digest instruction',()=>{
 const ctx={chatId:'plain',characterId:0,characters:[{avatar:'plain.png'}],chatMetadata:{variables:{}},extensionSettings:{}},s=source();s.order.find(p=>p.identifier==='tisya_output').enabled=false;const macros=new Map(),live=registerLivePreset({registerMacro:(k,v)=>macros.set(k,v),unregisterMacro(){}},()=>s,()=>ctx,()=>{throw Error('plain output must not read moods');});assert.doesNotMatch(macros.get('tisya_live_onepass_tisya_registry')(),/ONEPASS.CONTRACT/);assert.doesNotMatch(macros.get('tisya_live_onepass_tisya_material_rule_material')(),/Public creative digest:/);live.dispose();
});
