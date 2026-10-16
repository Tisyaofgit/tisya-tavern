import test from 'node:test';
import assert from 'node:assert/strict';
import {registerStateCatalog,stateValuesProposal,readStateValues,stateGrowthProposal} from '../tables/state-form.js';
import {compileStateFormulas,evaluateStateFormula} from '../tables/state-formulas.js';
import {projectStateVocabulary,proposeStateValues,levelStatePreset} from '../tables/state-registry.js';
import {compileConditionRule,evaluateConditionRule} from '../tables/condition-rules.js';
const defs='人物／经验：数值 = 点 [0,10000] 整数\n人物／体力：数值 = 点 [0,100] 整数\n技能／技能水平：等级 = 生疏，熟练，精通';
const growth='修船晋级：true：经验[基础] >= 技能水平[修船] * 100 点 / 1 级，技能水平[修船] < 3 级 → 变动：经验[基础] = -技能水平[修船] * 100 点 / 1 级；变动：技能水平[修船] = 1 级';
const base=()=>registerStateCatalog(null,'world-a',{definitions:defs,items:'人物：基础\n技能：修船',formulas:'消耗：变动：体力[基础] = -5 点\n恢复：变更：体力[基础] = min(100 点, 体力[基础] + 20 点)',growth});
function rows(c,text,ownerId='a'){const v=projectStateVocabulary(c.registry,c.items,{writeDefinitionIds:c.registry.definitions.map(f=>f.id)});return proposeStateValues(text,v,{ownerId}).changes.map((x,i)=>({id:ownerId+i,rev:1,table:'state',values:x.values,access:{readers:['读者'],knowers:[]}}));}
test('generic numeric ranks share world labels, remain integers and support custom categories',()=>{
 const a=base(),b=registerStateCatalog(null,'world-b',{definitions:'境界／层级：等级 = 筑基，金丹，元婴\n病症／程度：等级 = 5',items:'境界：修行\n病症：烧伤'});
 assert.equal(a.registry.definitions.find(f=>f.levelNames).type,'number');assert.equal(b.registry.definitions[0].min,1);assert.equal(b.registry.definitions[1].max,5);assert.deepEqual(b.registry.definitions[1].levelNames,['1','2','3','4','5']);assert(levelStatePreset('x').definitions.some(f=>f.levelNames));
 for(const value of ['0','4','1.5','熟练'])assert.throws(()=>rows(a,'技能水平[修船]：'+value),/范围|数值/);
 assert.equal(rows(a,'技能水平[修船]：2')[0].values.值,2);assert.equal(rows(a,'技能水平[修船]：/')[0].values.值,'/');
});
test('world-specific numeric formula and generic growth consume cost and rank together from one snapshot',()=>{
 const c=base(),r=rows(c,'经验[基础]：200\n技能水平[修船]：2\n体力[基础]：90');const before=structuredClone(r),plan=evaluateStateFormula(c,'修船晋级',r,'a');assert.equal(plan.status,'ready');assert.deepEqual(plan.changes.map(c=>c.values.值),[0,3]);assert.deepEqual(r,before);
 assert.equal(evaluateStateFormula(c,'消耗',r,'a').changes[0].values.值,85);assert.equal(evaluateStateFormula(c,'恢复',r,'a').changes[0].values.值,100);
 const b=registerStateCatalog(null,'world-b',{definitions:'人物／灵息：数值 = 缕 [0,12]\n修行／境界：等级 = 凡，入道，化境',items:'人物：本体\n修行：道途',formulas:'调息：变更：灵息[本体] = min(12 缕, 灵息[本体] + 0.5 缕)'});
 assert.equal(evaluateStateFormula(b,'调息',rows(b,'灵息[本体]：4.5\n境界[道途]：1'),'a').changes[0].values.值,5);
});
test('growth handles below/exact threshold, max rank, unknown, absent and owner isolation without guessing',()=>{
 const c=base();assert.equal(evaluateStateFormula(c,'修船晋级',rows(c,'经验[基础]：199\n技能水平[修船]：2'),'a').status,'unmatched');
 assert.equal(evaluateStateFormula(c,'修船晋级',rows(c,'经验[基础]：10000\n技能水平[修船]：3'),'a').status,'unmatched');
 for(const v of ['？','/'])assert.equal(evaluateStateFormula(c,'修船晋级',rows(c,'经验[基础]：'+v+'\n技能水平[修船]：2'),'a').status,'unknown');
 const r=rows(c,'经验[基础]：200\n技能水平[修船]：2');assert.equal(evaluateStateFormula(c,'修船晋级',r,'b').status,'unknown');assert.equal(evaluateStateFormula(c,'修船晋级',r,'a').status,'ready');
});
test('units, code, division zero, nonfinite results and bounds fail without modifying inputs',()=>{
 const c=base(),before=structuredClone(c);for(const expr of ['globalThis.alert(1)','体力[基础] + 1 级','体力[基础] + 1','体力[基础].constructor'])assert.throws(()=>registerStateCatalog(c,'world-a',{formulas:'坏：变更：体力[基础] = '+expr}));assert.deepEqual(c,before);
 const d=registerStateCatalog(c,'world-a',{formulas:'除零：变更：体力[基础] = 1 点 / 0\n越界：变更：体力[基础] = 101 点\n小数：变更：体力[基础] = 0.5 点'});
 for(const name of ['除零','越界','小数'])assert.throws(()=>evaluateStateFormula(d,name,[],'a'),/零|范围|整数/);
 assert.throws(()=>evaluateStateFormula(c,'消耗',rows(c,'体力[基础]：？'),'a'),/未知/);assert.throws(()=>evaluateStateFormula(c,'消耗',rows(c,'体力[基础]：3'),'a'),/范围/);
});
test('rank labels and registered formulas immutable; unsupported ordering is rejected',()=>{
 const c=base();assert.equal(registerStateCatalog(c,'world-a',{definitions:defs,growth}).revision,c.revision);
 assert.throws(()=>registerStateCatalog(c,'world-a',{definitions:'技能／技能水平：等级 = 生疏，精通，熟练'}),/冲突/);
 assert.throws(()=>registerStateCatalog(c,'world-a',{formulas:'消耗：变动：体力[基础] = -4 点'}),/不可改写/);
 assert.throws(()=>registerStateCatalog(c,'world-a',{growth:'错误：true：经验[基础] >= 100 点 → 变动：经验[基础] = -5 点'}),/至少更新/);
});
test('bounded numeric delta validates the final value, not the negative operand',()=>{
 const c=base(),v=projectStateVocabulary(c.registry,c.items,{writeDefinitionIds:c.registry.definitions.map(f=>f.id)}),p=compileConditionRule('true：体力[基础] >= 5 点 → 变动：体力[基础] - 5 点',v);
 assert.equal(evaluateConditionRule(p,rows(c,'体力[基础]：5'),{ownerId:'a'}).changes[0].values.值,0);
});
test('generic growth can unlock a registered boolean while advancing a rank, with no skill-specific code',()=>{
 const c=registerStateCatalog(null,'unrelated-world',{definitions:'职务／级别：等级 = 见习，正式\n职务／可任职：布尔\n人物／功绩：数值 = 枚 [0,10] 整数',items:'职务：守门\n人物：自身',growth:'任职：true：功绩[自身] >= 3 枚，级别[守门] = 1 级 → 变更：级别[守门] = 2 级；变更：可任职[守门] = true'});
 assert.equal(c.format,'tisya.state-catalog/2');assert.equal(c.registry.format,'tisya.state-registry/2');assert.deepEqual(evaluateStateFormula(c,'任职',rows(c,'功绩[自身]：3\n级别[守门]：1'),'a').changes.map(x=>x.values.值),[2,true]);
});
test('explicit absence conditions remain distinct from unknown numeric or boolean state',()=>{
 const c=registerStateCatalog(null,'none-test',{definitions:'人物／余额：数值 = 枚\n职务／级别：等级 = 2\n职务／资格：布尔',items:'人物：自身\n职务：席位',growth:'补位：true：余额[自身] = /，资格[席位] = /，级别[席位] = 1 级 → 变更：级别[席位] = 2 级'});
 assert.equal(evaluateStateFormula(c,'补位',rows(c,'余额[自身]：/\n资格[席位]：/\n级别[席位]：1'),'a').status,'ready');
 assert.equal(evaluateStateFormula(c,'补位',rows(c,'余额[自身]：？\n资格[席位]：/\n级别[席位]：1'),'a').status,'unknown');
 assert.equal(evaluateStateFormula(c,'补位',rows(c,'余额[自身]：0\n资格[席位]：/\n级别[席位]：1'),'a').status,'unmatched');
});
