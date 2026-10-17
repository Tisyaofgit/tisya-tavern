import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry,copy} from '../tables/schema.js';
import {prepareSimpleAdaptation,splitSimpleAdaptation,applySimpleAdaptation} from '../tables/simple-core-adaptation.js';
import {validateCoreMapping} from '../tables/core-assets.js';

const bundle={format:'tisya.core-bundle/1',id:'internal-bundle',version:2,name:'灯与守灯人',members:[{sourceObject:'private-person',name:'守灯人',kind:'character',traits:[{id:'private-trait',name:'职责',value:'为来客指路',evidence:'守灯人愿意为来客指路。'}],growth:[]},{sourceObject:'private-item',name:'旧灯',kind:'item',traits:[{id:'private-item-trait',name:'用途',value:'普通照明用具',evidence:'旧灯只用于照明。'}],growth:[]}],links:[{id:'private-link',sourceRow:'private-row',members:['private-person','private-item'],name:'照管意义',value:'照管照明用具的责任',evidence:'守灯人照管旧灯。'}]};
function proposal(){return {artifacts:{registry:defaultRegistry(),base:{changes:[{id:'new:one',table:'objects',expected:0,values:{名称:'山道引路人',类型:'character',描述:'每天为山道来客点亮路灯。'},access:{readers:['读者'],knowers:[]}},{id:'new:two',table:'objects',expected:0,values:{名称:'油灯',类型:'item',描述:'一盏普通油灯，只能照明。引路人照管它，开局持有另定。'},access:{readers:['读者'],knowers:[]}}]},initial:{changes:[]}}};}
const mapping=`【成员对应：1】
1 档案：人物／山道引路人
【核心表现：1：1】
1 原句：每天为山道来客点亮路灯。
【成员对应：2】
1 档案：物品／油灯
【核心表现：2：1】
1 原句：一盏普通油灯，只能照明。
【关联表现：1：1】
1 档案：物品／油灯
2 原句：引路人照管它，开局持有另定。`;
test('adaptation exposes business meaning while source IDs and field paths stay host owned',()=>{
 const before=copy(bundle),plan=prepareSimpleAdaptation(bundle,{book:'原点甲'}),model=plan.material+'\n'+plan.instructions;
 for(const text of ['private-person','private-item','private-trait','private-link','sourceObject','coreMapping','new:','path:'])assert(!model.includes(text));
 assert(model.includes('为来客指路'));assert(model.includes('照管照明用具的责任'));assert.deepEqual(bundle,before);
});
test('natural target and exact expression reconstruct complete private mapping and validate',()=>{
 const plan=prepareSimpleAdaptation(bundle,{book:'原点甲'}),split=splitSimpleAdaptation('【设计】\n1 名称：山道\n'+mapping+'\n【完成】\n1 状态：完成'),p=proposal();
 assert(!split.text.includes('成员对应'));assert(split.text.endsWith('1 状态：完成'));
 applySimpleAdaptation(p,plan,split.entries);const checked=validateCoreMapping(p,bundle,'原点甲');
 assert.equal(checked.members[0].member,'private-person');assert.deepEqual(checked.members[0].items[0].path,['描述']);assert.equal(checked.links[0].targets[0].object,'new:two');
});
test('missing item remains invalid and cannot be saved as full preservation',()=>{
 const plan=prepareSimpleAdaptation(bundle,{book:'原点甲'}),p=proposal(),split=splitSimpleAdaptation(mapping.replace('【核心表现：1：1】\n1 原句：每天为山道来客点亮路灯。\n',''));
 applySimpleAdaptation(p,plan,split.entries);assert.throws(()=>validateCoreMapping(p,bundle,'原点甲'),/遗漏/);
});
test('a label, foreign field or invented expression cannot stand in for the actual core meaning',()=>{
 for(const expression of ['山道引路人','不在档案中的说法','一盏普通油灯，只能照明。']){
  const plan=prepareSimpleAdaptation(bundle,{book:'原点甲'}),p=proposal(),split=splitSimpleAdaptation(mapping.replace('1 原句：每天为山道来客点亮路灯。','1 原句：'+expression));
  assert.throws(()=>applySimpleAdaptation(p,plan,split.entries),/未写入对应档案/);
 }
});
test('duplicate headings, source identifiers as targets, shared member target and invalid numbered fields reject',()=>{
 assert.throws(()=>splitSimpleAdaptation(mapping+'\n【成员对应：1】\n1 档案：人物／山道引路人'),/重复/);
 for(const raw of [mapping.replace('人物／山道引路人','new:one'),mapping.replace('物品／油灯','人物／山道引路人'),mapping.replace('1 档案：人物','2 档案：人物')])assert.throws(()=>applySimpleAdaptation(proposal(),prepareSimpleAdaptation(bundle,{book:'原点甲'}),splitSimpleAdaptation(raw).entries));
});
test('single source gets the existing unsuffixed reference and all meanings still require expressions',()=>{
 const core={id:'old-single',version:1,sourceObject:'source',name:'向导',kind:'character',traits:[{name:'职责',value:'指路',evidence:'指路'}],growth:[]},plan=prepareSimpleAdaptation(core,{book:'原点甲',single:true}),p=proposal();p.artifacts.base.changes.pop();
 applySimpleAdaptation(p,plan,splitSimpleAdaptation(mapping.split('【成员对应：2】')[0]).entries);
 assert.equal(p.artifacts.base.changes[0].values.核心引用,'原点甲 / old-single@1');
 validateCoreMapping(p,plan.bundle,'原点甲',{singleReference:'原点甲 / old-single@1'});
});
test('CRLF and literal escapes in mapping expressions decode exactly once',()=>{
 const core={id:'single',version:1,name:'字据',kind:'item',traits:[{name:'字迹',value:'保留原文',evidence:'保留原文'}],growth:[]},plan=prepareSimpleAdaptation(core,{book:'原点甲',single:true}),p=proposal(),expression='  第一行\r\n"第二行"\\n  ';
 p.artifacts.base.changes=[p.artifacts.base.changes[1]];p.artifacts.base.changes[0].values.描述=expression;
 const raw='【成员对应：1】\n1 档案：物品／油灯\n【核心表现：1：1】\n1 原句：'+JSON.stringify(expression);
 applySimpleAdaptation(p,plan,splitSimpleAdaptation(raw).entries);assert.equal(p.coreMapping.members[0].items[0].expression,expression);
 validateCoreMapping(p,plan.bundle,'原点甲',{singleReference:'原点甲 / single@1'});
});
