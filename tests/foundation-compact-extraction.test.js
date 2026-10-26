const extractionSource=body=>JSON.parse(body.messages.find(m=>m.content.startsWith('[SOURCE]\n')).content.split('\n').slice(1,-1).join('\n'));
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {sheetCatalog} from '../tables/foundation/catalog.js';import {valueValid} from '../tables/schema.js';
import {prepareExtraction,acceptExtraction} from '../tables/foundation/extraction.js';
import {visibleExtractionFields,extractionLabel} from '../tables/foundation/extraction-layout.js';
import {compileConditionRule,evaluateConditionRule,conditionBindings} from '../tables/condition-rules.js';
const c=sheetCatalog(),v=JSON.parse(await readFile(new URL('./fixtures/foundation-sheet/fanglu-conditions-r7.json',import.meta.url),'utf8'));
const open=tid=>c.templates.find(t=>t.id===tid).fields.map((f,i)=>({...f,row:i+1})).filter(f=>f.key!=='对象'&&f.label!=='主体');
const view=tid=>visibleExtractionFields(open(tid),tid,'compact-v2');
const lines=(tid,values={})=>view(tid).map(f=>f.row+' '+extractionLabel(f,tid,'compact-v2')+'：'+(values[f.key]??''));
function main(values={}){const tid='origin.character',fs=view(tid);return [...new Set(fs.map(f=>f.group))].map(g=>'【人物／'+g+'】\n'+lines(tid,{名称:'方鹿',...values}).filter(line=>fs.some(f=>f.group===g&&line.startsWith(f.row+' '))).join('\n')).join('\n');}
const context=()=>prepareExtraction(c,valueValid,{source:'方鹿拜沈砚为师，后来得到旧铜铃。',ownerName:'方鹿',references:[{name:'沈砚〔船匠〕',kind:'character'},{name:'旧铜铃',kind:'item'}],model:'test',layout:'compact-v2',conditionVocabulary:v});
const child=(label,kind,values)=>'【'+label+'／1】\n'+lines('origin.character.'+kind,{名称:label,...values}).join('\n');
test('compact projection reduces requested cells without renumbering or changing canonical catalog',()=>{
 assert.deepEqual(['origin.character','origin.character.history','origin.character.relationships','origin.character.secrets'].map(t=>view(t).length),[40,8,6,6]);
 const ctx=context();assert.equal(ctx.layout,'compact-v2');assert(!extractionSource(ctx.body).includes('11 原文（'));assert(!extractionSource(ctx.body).includes('10 成立条件（'));assert(extractionSource(ctx.body).includes('25 日常习惯（'));assert(extractionSource(ctx.body).includes('数值格的裸数值沿用'));
 assert.equal(c.templates.find(t=>t.id==='origin.character').fields.length,45);
});
test('canonical sparse fields retain actual values, omitted duplicates remain absent and source is kept once',()=>{
 const ctx=context(),before=structuredClone(ctx),raw=main({'日常习惯':'ignored wrong key','生活·习惯':'清晨开工；收工清点工具','本领·做事方式':'轻敲木料，再听回声'})+'\n'+child('前史','history',{命题:'得到旧铜铃。','前史·涉及对象':'旧铜铃'})+'\n'+child('关系','relationships',{'关系底稿·对象':'沈砚〔船匠〕','关系底稿·性质':'师徒','关系底稿·形成经过':'拜师'});
 const r=acceptExtraction(c,valueValid,ctx,raw),root=r.snapshot.records[0];assert.deepEqual(ctx,before);assert.equal(r.validation.semantic,'pending-review');assert.deepEqual(root.values.属性.生活.习惯,['清晨开工','收工清点工具']);assert.equal(root.values.属性.生活.作息,undefined);assert.equal(root.values.属性.本领.叙事表现,undefined);
 const h=r.snapshot.records.find(x=>x.id===r.children[0].id),rel=r.snapshot.records.find(x=>x.id===r.children[1].id);assert.equal(h.values.命题,'得到旧铜铃。');assert.equal(h.values.前史.原文,undefined);assert.equal(h.values.前史.后果,undefined);assert.equal(rel.values.命题,undefined);assert.equal(rel.values.关系底稿.成立条件,undefined);
 assert.equal(r.provenance.sources.length,1);assert.equal(r.provenance.sources[0].text,ctx.source);assert.equal(r.provenance.records.length,3);assert(r.provenance.records.every(x=>x.scope.includes('requires semantic review')));
});
test('compact omissions, injected legacy rows, duplicate rows and label drift reject atomically',()=>{
 const ctx=context(),before=structuredClone(ctx),good=main();
 for(const bad of [good.replace('25 日常习惯：\n',''),good.replace('25 日常习惯：','25 习惯：'),good.replace('18 短处：','17 长处：坦诚\n18 短处：'),good.replace('25 日常习惯：','25 日常习惯：\n25 日常习惯：')]){assert.throws(()=>acceptExtraction(c,valueValid,ctx,bad));assert.deepEqual(ctx,before);}
 assert.equal(acceptExtraction(c,valueValid,ctx,good).counts.history,0);
});
test('relationships require object/nature instead of a second summary; dynamic child counts stay unconstrained',()=>{
 const ctx=context(),good=main()+'\n'+child('关系','relationships',{'关系底稿·对象':'沈砚〔船匠〕','关系底稿·性质':'师徒'});
 assert.equal(acceptExtraction(c,valueValid,ctx,good).counts.relationships,1);
 assert.throws(()=>acceptExtraction(c,valueValid,ctx,good.replace('6 性质：师徒','6 性质：')),/非空性质/);
 assert.throws(()=>acceptExtraction(c,valueValid,ctx,good.replace('5 关系对象：沈砚〔船匠〕','5 关系对象：')),/非空关系对象/);
});
test('bare numbers inherit only explicitly registered units; wrong explicit units still reject',()=>{
 const source='true：连续用力时长 > 0.5 → 变更：右腕旧伤发痛 = true，必须停手休息 = true',p=compileConditionRule(source,v),scope={ownerId:'a',recordId:'a',contextId:'test'};
 assert.equal(p.branches[0][0].value,.5);assert.equal(p.fields.find(f=>f.name==='连续用力时长').unit,'时辰');
 const b=conditionBindings(p,scope).find(b=>b.name==='连续用力时长'),row={id:'s',rev:1,table:'state',values:{对象:b.object,字段:b.field,有效性:'有效',值:.5}};
 assert.equal(evaluateConditionRule(p,[row],scope).matched,false);row.values.值=.51;assert.equal(evaluateConditionRule(p,[row],scope).changes.length,2);
 assert.throws(()=>compileConditionRule(source.replace('0.5','30 分钟'),v),/单位/);
 const strict=structuredClone(v);delete strict.fields.find(f=>f.name==='连续用力时长').allowBareNumber;assert.throws(()=>compileConditionRule(source,strict),/单位/);
 const r=acceptExtraction(c,valueValid,context(),main({'本领·代价限制':source}));assert.equal(r.conditions.length,1);assert.equal(r.conditions[0].program.source,source);
});

test('character soul is optional, separately typed, first in compact request, and never auto-promoted to base assets or runtime',()=>{
 const ctx=context(),before=structuredClone(ctx),prompt=extractionSource(ctx.body);
 assert(prompt.indexOf('【人物／核心】')<prompt.indexOf('【人物／身份】'));
 const r=acceptExtraction(c,valueValid,ctx,main({'人物核心·性格核心标签':'坦诚；执拗','人物核心·欲望双螺旋':'希望守住自主选择','人物核心·核心矛盾':'想与人合作，却不愿让出判断；迟疑使合作更难'}));
 assert.deepEqual(r.snapshot.records[0].values.属性.人物核心,{性格核心标签:['坦诚','执拗'],欲望双螺旋:['希望守住自主选择'],核心矛盾:'想与人合作，却不愿让出判断；迟疑使合作更难'});
 assert.equal(r.conditions.length,0);assert.equal(r.validation.semantic,'pending-review');assert.deepEqual(ctx,before);
 assert.equal(acceptExtraction(c,valueValid,ctx,main()).snapshot.records[0].values.属性?.人物核心,undefined);
 assert.throws(()=>acceptExtraction(c,valueValid,ctx,main().replace('41 欲望双螺旋：\n','')),/缺行/);
});

test('mask purpose and visible cracks remain descriptive, absent when unknown, without granting knowledge or firing events',()=>{
 const ctx=context(),raw=main({'面具层·面具呈现':'社交时亲昵随和','面具层·面具作用':'保持可接近的形象，与平静语调有温差','面具层·面具裂隙':'真心高兴时短暂安静'}),r=acceptExtraction(c,valueValid,ctx,raw),actor=r.snapshot.records[0];
 assert.equal(actor.values.属性.面具层.面具裂隙,'真心高兴时短暂安静');assert.equal(actor.values.知情者,undefined);assert.equal(r.conditions.length,0);
 assert.equal(acceptExtraction(c,valueValid,ctx,main()).snapshot.records[0].values.属性?.面具层,undefined);
 assert(extractionSource(ctx.body).includes('平静、礼貌、教学或一次情绪不自动构成面具'));
});

test('history keeps subjective then-understanding distinct from factual events and ongoing effect without granting knowledge',()=>{
 const ctx=context(),r=acceptExtraction(c,valueValid,ctx,main()+'\n'+child('前史','history',{命题:'老师要求重做。','前史·当时理解':'当时以为老师不信任自己','前史·当下影响':'此后反复检查木料'})),h=r.snapshot.records.find(x=>x.id===r.children[0].id);
 assert.equal(h.values.前史.当时理解,'当时以为老师不信任自己');assert.equal(h.values.命题,'老师要求重做。');assert.equal(h.values.前史.当下影响,'此后反复检查木料');assert.equal(h.values.知情者,undefined);assert.equal(r.validation.semantic,'pending-review');assert.equal(r.conditions.length,0);
 assert(extractionSource(ctx.body).includes('13 当时理解'));assert(extractionSource(ctx.body).includes('10 延续影响'));
});
