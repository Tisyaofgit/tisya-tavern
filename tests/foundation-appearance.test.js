import test from 'node:test';
import assert from 'node:assert/strict';
import {sheetCatalog} from '../tables/foundation/catalog.js';
import {prepareExtraction,acceptExtraction} from '../tables/foundation/extraction.js';
import {visibleExtractionFields,extractionLabel} from '../tables/foundation/extraction-layout.js';
import {foundationTemplatePlan} from '../tables/foundation-templates.js';
import {valueValid,validateRow} from '../tables/schema.js';
import {createFoundationInput,assertFoundationInput} from '../tables/foundation-intake.js';
const oldPaths=["名称", "别名", "属性.身份细目.物种", "属性.身份细目.生命阶段", "属性.身份细目.出生时期", "属性.身份细目.出身地", "属性.身份细目.语言", "属性.身份细目.社会身份", "属性.形貌.整体", "属性.形貌.辨识特征", "属性.形貌.仪态", "属性.形貌.惯常装束", "属性.形貌.感官印象", "属性.性情.价值取舍", "属性.性情.判断方式", "属性.性情.情绪处理", "属性.性情.长处", "属性.性情.短处", "属性.性情.拒绝边界", "属性.性情.协商条件", "属性.性情.改变条件", "属性.生活.生计", "属性.生活.作息", "属性.生活.兴趣", "属性.生活.习惯", "属性.生活.长期目标", "属性.生活.社会责任", "属性.表达.措辞", "属性.表达.节奏", "属性.表达.幽默", "属性.表达.沉默条件", "属性.表达.关系差异", "属性.表达.禁用套路", "属性.本领.擅长", "属性.本领.不足", "属性.本领.做事方式", "属性.本领.代价限制", "属性.本领.定义引用", "属性.本领.叙事表现", "属性.人物核心.性格核心标签", "属性.人物核心.欲望双螺旋", "属性.人物核心.核心矛盾", "属性.面具层.面具呈现", "属性.面具层.面具作用", "属性.面具层.面具裂隙"];
const catalog=sheetCatalog(),template=catalog.templates.find(t=>t.id==='origin.character');
const context=()=>prepareExtraction(catalog,valueValid,{source:'本次仅填写明确给出的形貌资料。',ownerName:'甲',references:[],model:'test'});
function form(values={}){
 const fields=visibleExtractionFields(template.fields.map((f,i)=>({...f,row:i+1})),'origin.character','compact-v2');
 return [...new Set(fields.map(f=>f.group))].map(group=>'【人物／'+group+'】\n'+fields.filter(f=>f.group===group).map(f=>f.row+' '+extractionLabel(f,'origin.character','compact-v2')+'：'+(values[f.key]??(f.key==='名称'?'甲':''))).join('\n')).join('\n');
}
test('appearance leaves append after all45 stable rows; old definitions and optional values stay readable',()=>{
 assert.deepEqual(template.fields.slice(0,45).map(f=>f.path.join('.')),oldPaths);
 assert.equal(template.fields.length,54);
 assert.deepEqual(template.fields.slice(45).map(f=>f.label),['发色','发长','发质形态','眼形','瞳色','肤色','体型','身高','面部特征']);
 assert(template.fields.slice(45).every(f=>f.group==='形貌细目'&&f.definition.type==='text'&&!f.definition.required));
 assert.equal(template.fields[45].path.join('.'),'属性.形貌细目.头发.发色');
 const plan=foundationTemplatePlan('character'),old={id:'row:old',rev:1,table:'objects',values:{名称:'旧档',类型:'character',属性:{外貌:'旧版完整描述',形貌:{整体:'原有整体内容',辨识特征:['原有特征']}}},access:{readers:['读者'],knowers:[]},source:null},before=structuredClone(old);
 validateRow(plan.registry,old);assert.deepEqual(old,before);assert.equal(old.values.属性.形貌细目,undefined);
 assert.equal(plan.registry.types.find(t=>t.id==='character').fields.外貌.type,'text');
 assert.equal(plan.registry.types.find(t=>t.id==='character').fields.形貌.fields.整体.description,'原点稳定体貌。');
 assert.match(template.fields[8].definition.description,/未由形貌细目/);
});
test('unknown appearance cells stay absent and explicit nested leaves parse without mutating source or context',()=>{
 const ctx=context(),before=structuredClone(ctx),empty=acceptExtraction(catalog,valueValid,ctx,form());
 assert.equal(empty.snapshot.records[0].values.属性?.形貌细目,undefined);
 const fields={'形貌细目·头发·发色':'铜色','形貌细目·头发·发长':'齐肩','形貌细目·头发·发质形态':'波浪','形貌细目·眼部·眼形':'圆眼','形貌细目·眼部·瞳色':'琥珀色','形貌细目·肤色':'麦色','形貌细目·体型':'匀称','形貌细目·身高':'约五尺','形貌细目·面部特征':'高鼻梁'};
 const parsed=acceptExtraction(catalog,valueValid,ctx,form(fields));
 assert.deepEqual(parsed.snapshot.records[0].values.属性.形貌细目,{头发:{发色:'铜色',发长:'齐肩',发质形态:'波浪'},眼部:{眼形:'圆眼',瞳色:'琥珀色'},肤色:'麦色',体型:'匀称',身高:'约五尺',面部特征:'高鼻梁'});
 assert.equal((parsed.conditions??[]).length,0);assert.equal(parsed.validation.semantic,'pending-review');assert.deepEqual(ctx,before);
});
test('catalog identity expires old model tasks explicitly; new sparse templates do not migrate prior records',()=>{
 assert.equal(catalog.version,'FT21-W50-appearance/1');
 const ctx=context(),old=structuredClone(ctx);old.before.catalogVersion='FT21';
 assert.throws(()=>acceptExtraction(catalog,valueValid,old,form()),/兼容的表单草稿/);
 const view={registry:foundationTemplatePlan('character').registry,rows:[]};
 const input=createFoundationInput(view,{source:'明确原文',ownerName:'甲',model:'test'}),prior=JSON.parse(input.catalog);prior.version='FT21';input.catalog=JSON.stringify(prior);
 assert.throws(()=>assertFoundationInput(input,view),/提炼模板已改变/);
});
