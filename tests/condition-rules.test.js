import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileConditionRule as compile,evaluateConditionRule as evaluate,conditionBindings,registerConditionNames,compileEventMarks} from '../tables/condition-rules.js';
import {visibleExtractionFields,extractionLabel} from '../tables/foundation/extraction-layout.js';
import {sheetCatalog} from '../tables/foundation/catalog.js';
import {valueValid} from '../tables/schema.js';
import {prepareExtraction,acceptExtraction} from '../tables/foundation/extraction.js';
const fields=[
 {name:'持有钥匙',key:'hasKey',type:'boolean',scope:'owner'},
 {name:'前置事件已发生',key:'eventDone',type:'boolean',scope:'context'},
 {name:'好感',key:'affinity',type:'number',scope:'owner'},
 {name:'体力',key:'energy',type:'number',scope:'owner',write:true},
 {name:'门已打开',key:'doorOpen',type:'boolean',scope:'context',write:true},
 {name:'阶段',key:'phase',type:'enum',values:['准备','完成'],scope:'context',write:true},
 {name:'连续用力时长',key:'duration',type:'number',scope:'owner',unit:'时辰'},
 {name:'本人主动说明',key:'consent',type:'boolean',scope:'record-context'},
 {name:'本条隐情可揭示',key:'mayReveal',type:'boolean',scope:'record-context',write:true}
],vocab={version:1,fields},scope={ownerId:'person-a',recordId:'secret-a',contextId:'scene-a'};
function rows(program,values,s=scope){return conditionBindings(program,s).filter(b=>Object.hasOwn(values,b.key)).map((b,i)=>({table:'state',id:'s'+i,rev:1,values:{对象:b.object,字段:b.field,有效性:'有效',值:values[b.key]}}));}
const rule='true：持有钥匙，前置事件已发生，好感 ≥ 60 → 变动：体力 - 10，变更：门已打开 = true';
test('minimal boolean/numeric conditions produce actual add/set values without mutating source or ledger',()=>{
 const p=compile(rule,vocab),r=rows(p,{hasKey:true,eventDone:true,affinity:60,energy:40}),before=structuredClone(r),plan=evaluate(p,r,scope);
 assert.equal(plan.status,'ready');assert.deepEqual(plan.changes.map(c=>[c.key,c.values.值]),[['energy',30],['doorOpen',true]]);assert.deepEqual(r,before);assert.equal(plan.writes,0);assert.deepEqual(evaluate(p,r,scope),plan);
});
test('standalone multiline and inline text compile to identical conditions/results',()=>{
 const a=compile(rule,vocab),b=compile('true: 持有钥匙,前置事件已发生,好感 >= 60\n变动: 体力 -10\n变更: 门已打开 = true',vocab);assert.deepEqual(a.branches,b.branches);assert.deepEqual(a.effects,b.effects);
});
test('all comparisons, fullwidth aliases and exact threshold work, no truthy coercion',()=>{
 for(const [op,n,result]of [['>',60,false],['<',60,false],['=',60,true],['>=',60,true],['<=',60,true],['!=',60,false],['＞',61,true],['＜',59,true],['＝',60,true],['≥',60,true],['≤',60,true]]){const p=compile(`true：好感 ${op} 60 → 变更：门已打开 = true`,vocab);assert.equal(evaluate(p,rows(p,{affinity:n}),scope).matched,result);}
 const p=compile('true：持有钥匙 = false → 变更：门已打开 = false',vocab);assert.equal(evaluate(p,rows(p,{hasKey:false}),scope).matched,true);assert.equal(evaluate(p,[],scope).matched,null);assert.throws(()=>evaluate(p,rows(p,{hasKey:'false'}),scope),/类型/);
});
test('AND/OR use three-valued logic and execute result once even with two true alternatives',()=>{
 const p=compile('true：持有钥匙，前置事件已发生 或 好感 ≥ 60 → 变更：门已打开 = true',vocab);
 assert.equal(evaluate(p,rows(p,{hasKey:false,affinity:0}),scope).matched,false);
 assert.equal(evaluate(p,rows(p,{hasKey:true,affinity:0}),scope).matched,null);
 assert.equal(evaluate(p,rows(p,{affinity:60}),scope).matched,true);
 assert.equal(evaluate(p,rows(p,{hasKey:true,eventDone:true,affinity:60}),scope).changes.length,1);
});
test('units are explicit and not converted using assumed world calendars',()=>{
 const p=compile('true：连续用力时长 > 0.5 时辰 → 变更：门已打开 = true',vocab);assert.equal(evaluate(p,rows(p,{duration:.5}),scope).matched,false);assert.equal(evaluate(p,rows(p,{duration:.51}),scope).matched,true);
 for(const n of ['30 分钟','0.5','半个时辰','NaN 时辰','Infinity 时辰'])assert.throws(()=>compile(`true：连续用力时长 > ${n} → 变更：门已打开 = true`,vocab));
});
test('zero is a number, missing increment base blocks whole batch; overflow is rejected',()=>{
 const p=compile(rule,vocab);let plan=evaluate(p,rows(p,{hasKey:true,eventDone:true,affinity:60,energy:0}),scope);assert.equal(plan.changes[0].values.值,-10);
 plan=evaluate(p,rows(p,{hasKey:true,eventDone:true,affinity:60}),scope);assert.equal(plan.status,'blocked-missing-value');assert.deepEqual(plan.changes,[]);
 const big='9'.repeat(308);const q=compile(`true：持有钥匙 → 变动：体力 + ${big}`,vocab);assert.throws(()=>evaluate(q,rows(q,{hasKey:true,energy:1.7e308}),scope),/超出/);
});
test('expired/pending states do not satisfy conditions; duplicate active states and missing versions reject',()=>{
 const p=compile('true：持有钥匙 → 变更：门已打开 = true',vocab),r=rows(p,{hasKey:true});
 for(const validity of ['失效','待确认'])assert.equal(evaluate(p,[{...r[0],values:{...r[0].values,有效性:validity}}],scope).matched,null);
 assert.throws(()=>evaluate(p,[...r,...r],scope),/多个/);assert.throws(()=>evaluate(p,[{...r[0],rev:undefined}],scope),/版本/);
});
test('secret permission is scoped to both current record and context; does not reveal or create cognition',()=>{
 const p=compile('true：本人主动说明 → 变更：本条隐情可揭示 = true',vocab),r=rows(p,{consent:true}),plan=evaluate(p,r,scope);
 assert.equal(plan.status,'ready');assert.equal(plan.changes[0].values.字段,JSON.stringify(['secret-a','mayReveal']));assert(!plan.changes.some(c=>c.table==='cognition'));
 assert.equal(evaluate(p,r,{...scope,recordId:'secret-b'}).matched,null);assert.equal(evaluate(p,r,{...scope,contextId:'scene-b'}).matched,null);assert.throws(()=>evaluate(p,r,{...scope,contextId:''}),/作用域/);
});
test('registered types, allowed writes and explicit prerequisite guards are checked at compile time',()=>{
 const bad=['true：不存在 → 变更：门已打开 = true','true：持有钥匙 → 变动：门已打开 + 1','true：持有钥匙 → 变更：持有钥匙 = false','true：持有钥匙 → 变更：阶段 = 未登记','true：阶段 > 准备 → 变更：门已打开 = true','true：持有钥匙 → 变更：门已打开 = true，门已打开 = false','true：持有钥匙， → 变更：门已打开 = true','true：持有钥匙 → console.log(1)','只要持有钥匙就开门'];
 for(const s of bad)assert.throws(()=>compile(s,vocab));
 assert.throws(()=>compile(rule,vocab,{writeKeys:['doorOpen']}),/此格/);
 assert.throws(()=>compile('true：本人主动说明 或 持有钥匙 → 变更：本条隐情可揭示 = true',vocab,{requiredTrue:['consent']}),/必要/);
});
const catalog=sheetCatalog(),fv=JSON.parse(await readFile(new URL('./fixtures/foundation-sheet/fanglu-conditions-r6.json',import.meta.url),'utf8'));
function main(values={}){const t=catalog.templates.find(t=>t.id==='origin.character'),fields=visibleExtractionFields(t.fields.map((f,i)=>({...f,row:i+1})),t.id,'compact-v2');return [...new Set(t.fields.map(f=>f.group))].map(g=>'【人物／'+g+'】\n'+fields.filter(f=>f.group===g).map(f=>f.row+' '+extractionLabel(f,t.id,'compact-v2')+'：'+(values[f.key]??(f.key==='名称'?'方鹿':''))).join('\n')).join('\n');}
const context=()=>prepareExtraction(catalog,valueValid,{source:'仅是合成测试，不是外部模型返回。',ownerName:'方鹿',references:[],model:'test',conditionVocabulary:fv});
test('R6 compiles conditions atomically while retaining raw source text and unchanged snapshot types',()=>{
 const c=context(),before=structuredClone(c),raw=main({'性情·协商条件':'true：方案安全已核验 → 变更：可以重新协商 = true','本领·代价限制':'听木辨裂不能读心；true：连续用力时长 > 0.5 时辰 → 变更：右腕旧伤发痛 = true，必须停手休息 = true'}),r=acceptExtraction(catalog,valueValid,c,raw);
 assert.equal(r.conditions.length,2);assert.equal(r.validation.conditions,'compiled');assert.equal(r.validation.semantic,'pending-review');assert.deepEqual(c,before);assert.equal(r.snapshot.records[0].values.属性.性情.协商条件,'true：方案安全已核验 → 变更：可以重新协商 = true');
 assert.throws(()=>acceptExtraction(catalog,valueValid,c,raw.replace('可以重新协商 = true','本条隐情可揭示 = true')),/此格/);assert.deepEqual(c,before);
 assert.throws(()=>acceptExtraction(catalog,valueValid,c,main({'性情·协商条件':'有证据就谈'})),/条件须写/);
});
test('unbound condition prose remains inert until a world vocabulary is explicitly supplied',()=>{
 const c=prepareExtraction(catalog,valueValid,{source:'未绑定的叙事条件',ownerName:'方鹿',references:[],model:'test'});const r=acceptExtraction(catalog,valueValid,c,main({'性情·协商条件':'有证据就谈'}));assert.equal(r.conditions,undefined);assert.equal(r.snapshot.records[0].values.属性.性情.协商条件,'有证据就谈');
});
test('false prefix lists and mixed true/false shorthand retain unknown rather than treating it as false',()=>{
 const p=compile('true：持有钥匙，false：前置事件已发生 → 变更：门已打开 = true',vocab);
 assert.equal(evaluate(p,rows(p,{hasKey:true,eventDone:false}),scope).matched,true);assert.equal(evaluate(p,rows(p,{hasKey:true}),scope).matched,null);
 const q=compile('false：持有钥匙，前置事件已发生 → 变更：门已打开 = false',vocab);assert.equal(evaluate(q,rows(q,{hasKey:false,eventDone:false}),scope).matched,true);
});
test('flat names register flags, typed numbers, exclusive enums and named event markers without initializing values',()=>{
 const v=registerConditionNames({states:'持有钥匙，受伤',numbers:'体力，等待时间（轮）',events:'开门，救援',enums:['天气 = 晴/雨/雪']},{namespace:'test-world'});
 assert.equal(v.fields.length,7);assert(v.fields.every(f=>!Object.hasOwn(f,'value')));
 const p=compile('true：持有钥匙，已触发事件“救援”，等待时间 ≥ 3 轮，天气 = 雨 → 变更：已触发事件“开门” = true',v);
 assert.equal(evaluate(p,[],scope).matched,null);
 assert.deepEqual(compileEventMarks('已触发事件“救援”',v),[{key:JSON.stringify(['test-world','事件','救援']),value:true,eventName:'救援'}]);
 assert.throws(()=>compileEventMarks('已触发事件“未登记”',v),/未登记/);assert.throws(()=>compileEventMarks('受伤',v),/未登记/);
 assert.throws(()=>registerConditionNames({states:'受伤，受伤'},{namespace:'test'}),/重复/);
 assert.throws(()=>compile('true：天气 = 风 → 变更：受伤 = true',v),/枚举/);
});
