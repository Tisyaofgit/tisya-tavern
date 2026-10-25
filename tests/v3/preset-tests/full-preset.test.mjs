import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {compileFullNarrative,compileFullPreflight,fullDefaultConfiguration,fullSourceEntries,renderPreferences,projectHabit,toImportablePreset,CONFIG_MAP} from '../../../v3/preset.mjs';
import {NARRATIVE as N} from '../../../settings-core.js';
import {emptyConfig,defaultWorld,validateConfig} from '../../../config/core.js';
import {tableSettings} from '../../../tables/schema.js';
import {configurationView} from '../../../tables/assistant.js';
const root=new URL('../../',import.meta.url);
const original=fullSourceEntries(),provenance=JSON.parse(fs.readFileSync(new URL('../../../v3/presets/provenance.json',import.meta.url)));
const registry=JSON.parse(fs.readFileSync(new URL('../../../v3/runtime-source/config/registry.json',import.meta.url)));
const messages=JSON.parse(fs.readFileSync(new URL('../fixtures/request-B.json',import.meta.url)));
const snapshot=JSON.parse(messages[1].content);
const defaults=()=>fullDefaultConfiguration();
const compile=(configuration=defaults(),extra={})=>compileFullNarrative({snapshot,currentUser:'继续钟楼故事。',configurationSnapshot:configuration,...extra});
const text=ms=>ms.map(x=>x.content).join('\n');
const preflight=(configuration=defaults(),extra={})=>compileFullPreflight({input:{requestKey:'full-test',generationType:'normal',view:{registry,rows:[]},archiveSources:[],currentUser:'继续。',preferenceSources:[],worldWindow:null,...extra},configurationSnapshot:configuration});
test('four protected entry contents and roles remain byte exact in both actual compilers',()=>{
 for(const ms of [compile(),preflight()])for(const p of provenance.protected){const got=ms.find(m=>m.identifier===p.key);assert.equal(got.role,p.role);assert.equal(crypto.createHash('sha256').update(got.content).digest('hex'),p.sha256);}
});
test('full creative semantics remain present with actual snapshot and no material placeholders',()=>{
 const s=text(compile());for(const needle of ['Draft —','Character —','Charm —','Mask —','World —','Logic —','Fog —','Calibration —','authenticity → emotional resonance → vividness → character appeal → intriguing direction','双关','◆translation◆','Paragraph progression:','习惯']){
  if(['双关','习惯'].includes(needle))continue;assert.ok(s.includes(needle),needle);
 }
 assert.ok(s.includes('铜铃'));assert.ok(s.includes('scope'));assert.ok(!s.includes('«'));assert.ok(!s.includes('<vars'));assert.ok(s.includes('consecutively numbered paragraphs'));assert.ok(s.includes('<actions min="4" max="6">'));
});
test('full auxiliary semantics retain V3 eight roots and paragraph evidence, without copied paragraph field',()=>{
 const s=text(preflight());for(const k of ['[CHARACTER_MEMORY]','[WORLD]','[POOL]','[READS]','[DRAFT]','values.原文段号:[1,3]','evidence is a list of exact paragraph numbers','requestKey','archiveProposal','worldProposal','scope','preferenceCandidates','archiveRequests','creativeBrief','pending','native-mvu','logical floor'])assert.ok(s.includes(k),k);
 assert.ok(!s.includes('events.原文段落'));assert.ok(!s.includes('〈缺失〉'));assert.ok(!s.includes('«'));
});
test('runtime material is partitioned once and native values retain false/null/zero',()=>{
 const snap=structuredClone(snapshot);snap.nativeValues=[{path:'/zero',value:0},{path:'/false',value:false},{path:'/null',value:null}];snap.rows.push({id:'event-original-probe',table:'events',values:{名称:'Probe',经过:'single-event-only',原文段落:['NO_RAW_BODY'],原文引用:[{entryId:'private-raw-id'}]},access:{readers:['reader'],knowers:[]}});
 const s=text(compile(defaults(),{snapshot:snap}));assert.equal(s.split('single-event-only').length,2);assert.ok(!s.includes('NO_RAW_BODY'));assert.ok(!s.includes('private-raw-id'));for(const value of ['"value": 0','"value": false','"value": null'])assert.ok(s.includes(value));
 assert.throws(()=>compile(defaults(),{history:[{role:'assistant',content:'raw'}]}),/Raw chat history/);
});
test('fog toggle removes only optional fog design; knowledge boundaries persist',()=>{
 const c=defaults();c.world.modes.narrative.narrative.缇斯亚叙事信息迷雾=false;const s=text(compile(c));assert.ok(!s.includes('Fog —'));assert.ok(!s.includes('信息迷雾|'));assert.ok(s.includes('Knowledge must fit world'));assert.ok(s.includes('Mistaken')||s.includes('false belief'));
});
test('six aside placeholders differ; independent direction and summary controls compile',()=>{
 const s=text(compile());for(const d of ['输入评价','回应用户评价','剧情吐槽'])assert.equal(s.split(d+'|{mood}|').length,3);
 const c=defaults();c.world.modes.narrative.heartDirections=['剧情吐槽'];c.world.modes.narrative.summary=false;const out=text(compile(c));assert.ok(!out.includes('输入评价|{mood}|'));assert.ok(!out.includes('用户偏好|{'));assert.equal(out.split('剧情吐槽|{mood}|').length,3);
});
test('selected ranges and language compile into their sole owning rules',()=>{
 const c=defaults(),m=c.world.modes.narrative;m.narrative.缇斯亚叙事篇幅区间={下限:600,上限:900,单位:'字'};m.narrative.缇斯亚叙事行动选项={下限:5,上限:5};m.角色对白={启用:true,来源:'指定语言',语言:'俄语'};
 const s=text(compile(c));assert.ok(s.includes('<body min="600" max="900" unit="字">'));assert.ok(s.includes('<actions min="5" max="5">'));assert.ok(s.includes('Use "俄语"'));assert.ok(s.includes('◆translation◆'));assert.ok(!s.includes('（译：'));
 m.actions=false;m.角色对白.启用=false;const disabled=text(compile(c));assert.ok(disabled.includes('<actions/>'));assert.ok(!disabled.includes('Bilingual dialogue:'));assert.ok(!disabled.includes('Actions —'));
});
test('all existing text-rule choices compile and custom wording replaces its owning rule',()=>{
 for(const row of N.rows.filter(r=>r.allowed&&CONFIG_MAP.find(m=>m.id===r.id)?.anchor&&!['D03','D04'].includes(r.id))){
  for(const choice of row.allowed.filter(c=>!['指定 NPC','场外讨论','总结整理'].includes(c))){const c=defaults();c.world.modes.narrative.narrative[row.variable]=choice;assert.doesNotThrow(()=>compile(c),row.id+'/'+choice);}
 }
 const c=defaults();c.world.modes.narrative.叙事指令={A03:{简短承接:'CUSTOM_INPUT_WORDING'}};const s=text(compile(c));assert.equal(s.split('CUSTOM_INPUT_WORDING').length,2);assert.ok(!s.includes('Briefly connect supplied speech/actions'));
});
test('selected main style and supplement use actual resources once',()=>{
 const c=defaults();c.data.resources=[{id:'s1',name:'Custom main',kind:'style',content:'MAIN_TECHNIQUE'},{id:'s2',name:'Custom support',kind:'style',content:'SUPPORT_TECHNIQUE'}];c.world.style='s1';c.world.styles=['s2'];const s=text(compile(c));assert.equal(s.split('MAIN_TECHNIQUE').length,2);assert.equal(s.split('SUPPORT_TECHNIQUE').length,2);assert.ok(!s.includes('Keep the prose supple'));
});
test('confirmed score projection is grouped, bipolar and has no source/evidence repeats',()=>{
 const out=renderPreferences({groups:[{tag:'克制',dimension:'角色构造',target:'米哈伊尔',encourage:3,avoid:-1,net:2,contributions:[{score:3,instruction:'收住情话',evidence:'SECRET_EVIDENCE'},{score:-1,instruction:'少用夸张姿态'}]}],hardConstraints:[{kind:'禁止',tag:'称呼',instruction:'停用旧称呼'}]});
 for(const value of ['<CharacterConstruction>','<Encourage>','<Avoid>','name="米哈伊尔"','（+3）','（-1）','PROHIBITED: 称呼'])assert.ok(out.includes(value));assert.ok(!out.includes('SECRET_EVIDENCE'));
});
test('advanced reroll keeps instruction source in A and original MVU ownership',()=>{
 const s=text(preflight(defaults(),{generationType:'advanced-reroll',advancedReroll:{instruction:'少些玩笑',target:'floor-2'},preferenceSources:[{key:'feedback:2',text:'少些玩笑'}]}));assert.ok(s.includes('少些玩笑'));assert.ok(s.includes('feedback:2'));assert.ok(s.includes('nativeOwned=true'));assert.ok(s.includes('archiveAlready=true'));
});
test('mode settings interface is read-only and importable JSON preserves roles and order',()=>{
 const config=defaults(),before=JSON.stringify(config);const ms=compileFullNarrative({snapshot,currentUser:'继续',settings:config.world.modes.narrative,nativecontext:{configurationSnapshot:config}});assert.equal(JSON.stringify(config),before);const p=toImportablePreset(ms);assert.equal(p.prompts.length,p.prompt_order[0].order.length);assert.equal(p.prompts[2].role,'assistant');assert.equal(p.prompts[3].role,'user');
});
test('fog is accepted by the real setting validator and default source',()=>{const n=N.suggestions();assert.equal(n.缇斯亚叙事信息迷雾,true);assert.doesNotThrow(()=>N.validate(n));n.缇斯亚叙事信息迷雾=false;assert.doesNotThrow(()=>N.validate(n));n.缇斯亚叙事信息迷雾='no';assert.throws(()=>N.validate(n));});
test('habit anchors use the adopted eleven fields and preserve unknowns and knowledge access',()=>{
 const h=projectHabit({id:'habit',values:{名称:'停顿',主体:'actor',内在动因:'观察回应',行为锚点:{动作:['停一停']},确定性:'暂定'},access:{readers:['读者'],knowers:['actor']}});
 for(const key of ['内在动因','初始成因','锚定对象','触发情景','动作','神态','语言','心理','边界','读者可见','知情人物'])assert.ok(Object.hasOwn(h,key));assert.equal(h.初始成因,'');assert.deepEqual(h.动作,['停一停']);assert.equal(h.确定性,'暂定');assert.deepEqual(h.知情人物,['actor']);assert.equal(h.读者可见,'是');
});
test('optional feature controls affect the actual request while the deification iron law remains',()=>{
 const c=defaults(),n=c.world.modes.narrative.narrative;for(const [,key]of N.protocol.P.features)n[key]=false;const s=text(compile(c));assert.ok(!s.includes('Literals: 生理性'));assert.ok(!s.includes('Initiative: express independent'));assert.ok(!s.includes('Make objects, sounds, action traces'));assert.ok(s.includes('PROHIBITED: deifying the player'));
});
test('selected definitions retain actual revision sources while current facts and conflicts have one owning place',()=>{
 const existing={id:'def-object',table:'objects',rev:1,values:{名称:'Current ledger name'},access:{readers:['reader'],knowers:[]}},fresh={id:'def-new',table:'facts',rev:2,values:{名称:'New defined bridge'},access:{readers:['reader'],knowers:[]}};
 const selectedDefinitionSources=[{kind:'origin',bookId:'origin-book',definitionId:'def-v2',revision:2,rowIds:[existing.id,fresh.id]}];
 const selectedDefinitionRows=[{...existing,values:{名称:'Earlier definition name'}},fresh];
 const definitionConflicts=[{id:'conflict',rowId:existing.id,table:'objects',path:['values','名称'],hasDefinition:true,hasCurrent:true,definitionValue:'Earlier definition name',currentValue:'Current ledger name',sources:selectedDefinitionSources,resolution:'current-ledger',fingerprint:'observed-hash'}];
 const extra={selectedDefinitionSources,selectedDefinitionRows,definitionConflicts},snap={...structuredClone(snapshot),rows:[...snapshot.rows,existing],...extra};
 const b=compile(defaults(),{snapshot:snap}),material=b.find(m=>m.identifier==='tisya_material_task_material').content;
 assert.equal(material.split('Earlier definition name').length,2);assert.equal(material.split('New defined bridge').length,2);assert.ok(material.includes('"definitionId": "def-v2"'));assert.ok(material.includes('"revision": 2'));assert.ok(text(b).includes('Committed ledger rows remain authoritative'));
 const a=text(preflight(defaults(),{...extra,view:{registry,rows:[existing]}}));assert.ok(a.includes('New defined bridge'));assert.ok(a.includes('DefinitionConflicts'));assert.ok(a.includes('current-ledger'));
});
test('new table defaults enable the complete preflight while every explicit false remains false',()=>{
 const world=defaultWorld(),active=tableSettings(world);for(const k of ['enabled','archive','preferences','plot','offstage'])assert.equal(active[k],true,k);assert.equal(active.nativeBridge,false);
 world.tables={enabled:false,archive:false,preferences:false,plot:false,offstage:false,nativeBridge:false};const saved=tableSettings(world);for(const k of Object.keys(world.tables))assert.equal(saved[k],false,k);
});
test('real configuration accepts enabled MVU and defaults workflow detail without rewriting saved choices',()=>{
 const data=emptyConfig(),world=defaultWorld();data.worlds.test=world;world.modes.narrative.narrative.缇斯亚MVU兼容=true;assert.doesNotThrow(()=>validateConfig(data));
 delete world.modes.narrative.workflowDetail;assert.equal(configurationView({data,world,key:'test'}).world.modes.narrative.workflowDetail,'full');assert.ok(!Object.hasOwn(world.modes.narrative,'workflowDetail'));
 world.modes.narrative.workflowDetail='compact';assert.equal(configurationView({data,world,key:'test'}).world.modes.narrative.workflowDetail,'compact');world.modes.narrative.narrative.缇斯亚MVU兼容='yes';assert.throws(()=>validateConfig(data));
});
test('preflight states beat basis list type and supplies a parseable nonempty example',()=>{
 const s=text(preflight());assert.ok(s.includes('basis as a list of text'));
 const example=s.match(/Example: (\{"proposal":"A grounded next move"[^\n]*?\})\./);
 assert.ok(example);assert.deepEqual(JSON.parse(example[1]).basis,['An authorized source']);
});
