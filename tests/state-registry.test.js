import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStateRegistry,levelStatePreset,registerStateDefinitions as register,projectStateVocabulary as project,proposeStateValues as propose,stateFillInstructions,stateGridTemplate,proposeStateGrid} from '../tables/state-registry.js';
import {compileConditionRule as compile,evaluateConditionRule as evaluate,conditionBindings} from '../tables/condition-rules.js';
const registry=levelStatePreset('世界甲'),instances=[{kind:'skill',id:'skill-repair',name:'修船'},{kind:'skill',id:'skill-swim',name:'游泳'},{kind:'injury',id:'wrist-1',name:'右腕旧伤'},{kind:'injury',id:'leg-1',name:'左腿新伤'}];
const writable=registry.definitions.map(f=>f.id),vocabulary=project(registry,instances,{writeDefinitionIds:writable}),scope={ownerId:'方鹿-id'};
const rows=p=>p.changes.map((c,i)=>({table:'state',id:'state-'+i,rev:1,values:c.values}));
test('preset is shared schema without values; unknown remains distinct from untrained, unable and uninjured',()=>{
 assert(registry.definitions.every(d=>!Object.hasOwn(d,'value')&&!Object.hasOwn(d,'default')));
 const p=propose('训练经历[游泳]：未受训\n技能水平[游泳]：\n伤病等级[右腕旧伤]：',vocabulary,scope);assert.equal(p.changes.length,1);assert.equal(p.writes,0);
 const rule=compile('true：技能水平[游泳] = 1 → 变更：右腕旧伤 = false',vocabulary);assert.equal(evaluate(rule,rows(p),scope).status,'unknown');
 const noInjury=propose('右腕旧伤：false',vocabulary,scope);assert.equal(noInjury.changes[0].values.值,false);
 assert.throws(()=>propose('伤病等级[右腕旧伤]：无',vocabulary,scope),/数值/);
});
test('ordered ranks compare by declared order, including exact thresholds; nominal enums stay unordered',()=>{
 const p=compile('true：技能水平[修船] ≥ 3，伤病等级[右腕旧伤] < 3 → 变更：技能水平[游泳] = 2',vocabulary);
 for(const [level,injury,match]of [[2,1,false],[3,2,true],[4,3,false],[4,1,true]]){
  const values=rows(propose(`技能水平[修船]：${level}\n伤病等级[右腕旧伤]：${injury}`,vocabulary,scope));assert.equal(evaluate(p,values,scope).matched,match);
 }
 assert.throws(()=>compile('true：训练经历[修船] > 未受训 → 变更：右腕旧伤 = true',vocabulary),/大小/);
 assert.equal(compile('true：右腕旧伤 → 变动：技能水平[修船] + 1',vocabulary).effects[0].value,1);
});
test('same definition is isolated by owner and stable object; changing display label preserves storage identity',()=>{
 const values=rows(propose('技能水平[修船]：3\n右腕旧伤：true',vocabulary,scope));
 const p=compile('true：右腕旧伤，技能水平[修船] = 3 → 变更：技能水平[游泳] = 2',vocabulary);
 assert.equal(evaluate(p,values,scope).status,'ready');assert.equal(evaluate(p,values,{ownerId:'阿禾-id'}).status,'unknown');
 const q=compile('true：左腿新伤 → 变更：技能水平[游泳] = 2',vocabulary);assert.equal(evaluate(q,values,scope).status,'unknown');
 const renamed=project(registry,[{...instances[0],name:'修补船板'}],{writeDefinitionIds:writable});assert.equal(propose('技能水平[修补船板]：3',renamed,scope).changes[0].values.字段,values[0].values.字段);
 const other=levelStatePreset('世界乙');const v=project(other,instances,{writeDefinitionIds:other.definitions.map(x=>x.id)});const otherRule=compile('true：右腕旧伤 → 变更：技能水平[游泳] = 2',v);assert.equal(evaluate(otherRule,values,scope).status,'unknown');
});
test('explicit aliases and existence shorthand resolve to one definition/address and cannot double write',()=>{
 const r=register(registry,'别名／技能／熟练程度：技能水平'),v=project(r,instances,{writeDefinitionIds:writable});
 assert.deepEqual(propose('熟练程度[修船]：3',v,scope).changes,propose('技能水平[修船]：3',v,scope).changes);
 assert.deepEqual(propose('右腕旧伤：true',v,scope).changes,propose('伤病存在[右腕旧伤]：true',v,scope).changes);
 assert.throws(()=>propose('右腕旧伤：true\n伤病存在[右腕旧伤]：false',v,scope),/重复/);
 assert.throws(()=>propose('本领水平[修船]：3',v,scope),/未登记/);
 const p=compile('true：右腕旧伤 → 变更：技能水平[修船] = 3',v);assert.equal(conditionBindings(p,scope)[0].object,'方鹿-id');
});
test('registration is idempotent and atomic; type/order/unit/alias conflicts preserve input',()=>{
 const original=structuredClone(registry);assert.deepEqual(register(registry,'技能／技能水平：等级 = 未掌握，入门，熟练，精通'),registry);
 for(const bad of ['技能／技能水平：枚举 = 1，入门，熟练，精通','技能／技能水平：有序枚举 = 4，熟练，入门，未掌握','技能／技能水平：数值 = 级','别名／技能／训练经历：技能水平','伤病／另一存在：存在','伤病／新字段：布尔\n技能／技能水平：布尔'])assert.throws(()=>register(registry,bad));
 assert.deepEqual(registry,original);
 assert.throws(()=>project(registry,[{kind:'injury',name:'右腕旧伤',id:'1'},{kind:'injury',name:'右腕旧伤',id:'2'}]),/重复/);
});
test('all value validation precedes proposal return; bad enum, wrong unit, unwritable and invalid source values reject',()=>{
 const r=register(emptyStateRegistry('独立测试'),'人物／等待：数值 = 轮\n人物／就绪：布尔'),items=[{kind:'character',id:'主体',name:'方鹿'}];
 const v=project(r,items,{writeDefinitionIds:r.definitions.map(d=>d.id)});assert.equal(propose('等待[方鹿]：0\n就绪[方鹿]：false',v,scope).changes.length,2);
 assert.throws(()=>propose('等待[方鹿]：2 时辰',v,scope),/单位/);
 assert.throws(()=>propose('右腕旧伤：true\n技能水平[修船]：宗师',vocabulary,scope),/数值/);
 assert.throws(()=>propose('右腕旧伤：true',project(registry,instances),scope),/不可写/);
 const p=compile('true：技能水平[修船] ≥ 3 → 变更：右腕旧伤 = true',vocabulary),valid=rows(propose('技能水平[修船]：3',vocabulary,scope));valid[0].values.值='宗师';assert.throws(()=>evaluate(p,valid,scope),/类型/);
});
test('fill hints and rule vocabulary derive from exactly the same allowed values',()=>{
 const text=stateFillInstructions(vocabulary);assert(text.includes('1=未掌握，2=入门，3=熟练，4=精通'));assert(text.includes('未受训不推断技能水平'));assert(text.includes('伤病存在不推断等级'));
});
test('compact symbols distinguish explicit unknown, absent and false without fake lowest ranks',()=>{
 const p=compile('true：技能水平[修船] < 2 → 变更：是否开启[修船] = 是',vocabulary);
 for(const [value,status]of [['？','unknown'],['?','unknown'],['/','unmatched'],['1','ready']])assert.equal(evaluate(p,rows(propose('技能水平[修船]：'+value,vocabulary,scope)),scope).status,status);
 const q=compile('false：是否开启[修船] → 变更：右腕旧伤 = true',vocabulary);
 assert.equal(evaluate(q,rows(propose('是否开启[修船]：否',vocabulary,scope)),scope).status,'ready');
 assert.equal(evaluate(q,rows(propose('是否开启[修船]：？',vocabulary,scope)),scope).status,'unknown');
 assert.equal(evaluate(q,rows(propose('是否开启[修船]：/',vocabulary,scope)),scope).status,'unmatched');
 assert.throws(()=>compile('true：技能水平[修船] = ？ → 变更：右腕旧伤 = true',vocabulary),/未知/);
 assert.throws(()=>compile('true：技能水平[修船] < / → 变更：右腕旧伤 = true',vocabulary),/仅支持/);
 const absent=compile('true：技能水平[修船] = / → 变更：右腕旧伤 = false',vocabulary);assert.equal(evaluate(absent,rows(propose('技能水平[修船]：/',vocabulary,scope)),scope).status,'ready');
});
test('four-column grid accepts short values and preserves extra effects as inert text',()=>{
 const effect='true：连续用力 > 0.5 → 变更：发痛 = true｜未执行';
 const text='项目｜是否开启｜等级｜额外效果\n修船｜是｜3｜/\n右腕旧伤｜？｜？｜'+effect;
 const proposal=proposeStateGrid(text,registry,instances,scope);assert.equal(proposal.changes.length,6);assert.equal(proposal.writes,0);assert.equal(proposal.changes.at(-1).values.值,effect);
 assert(!proposal.changes.some(c=>c.values.字段.includes('发痛')));
 assert(stateGridTemplate(registry,instances).includes('右腕旧伤｜？｜？｜？'));
 assert.throws(()=>proposeStateGrid(text+'\n右腕旧伤｜否｜/｜/',registry,instances,scope),/重复/);
 assert.throws(()=>proposeStateGrid('项目｜是否开启｜等级｜额外效果\n修船｜是｜宗师｜/',registry,instances,scope),/数值/);
 assert.throws(()=>compile('true：额外效果[修船] = / → 变更：右腕旧伤 = true',vocabulary),/可读/);
});
test('unknown/absent numeric bases never concatenate or coerce into a delta',()=>{
 const r=register(emptyStateRegistry('n'),'人物／数值：数值 = 点\n人物／触发：布尔'),v=project(r,[{id:'a',kind:'character',name:'甲'}],{writeDefinitionIds:r.definitions.map(f=>f.id)}),p=compile('true：触发[甲] → 变动：数值[甲] + 1',v);
 for(const value of ['?','/'])assert.equal(evaluate(p,rows(propose('数值[甲]：'+value+'\n触发[甲]：是',v,scope)),scope).status,'blocked-missing-value');
});

test('arbitrary categories and partial columns use the same grid without inventing missing fields',()=>{
 const r=register(emptyStateRegistry('世界丙'),'境界／阶位：等级 = 凝气，筑基，金丹\n装置／是否开启：布尔'),items=[{kind:'境界',id:'realm',name:'修行'},{kind:'装置',id:'lamp',name:'灯'}];
 assert.equal(stateGridTemplate(r,items),'项目｜是否开启｜等级｜额外效果\n修行｜/｜？｜/\n灯｜？｜/｜/');
 const p=proposeStateGrid('项目｜是否开启｜等级｜额外效果\n修行｜/｜2｜/\n灯｜是｜/｜/',r,items,scope);assert.equal(p.changes.length,2);assert.deepEqual(p.changes.map(c=>c.values.值),[2,true]);
 assert.throws(()=>proposeStateGrid('项目｜是否开启｜等级｜额外效果\n修行｜是｜2｜/',r,items,scope),/没有登记/);
 const multi=register(r,'境界／心境：等级 = 5');assert.throws(()=>stateGridTemplate(multi,[items[0]]),/全部登记字段/);
});
