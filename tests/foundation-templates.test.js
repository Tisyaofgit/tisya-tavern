import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {defaultRegistry,copy,registryIndex} from '../tables/schema.js';
import {foundationCatalog,foundationTemplatePlan,foundationSessionTemplates} from '../tables/foundation-templates.js';
import {formUI} from '../tables/form-ui.js';

test('foundation templates extend compatible optional definitions without modifying any old field or caller data',()=>{
 const original=defaultRegistry(),before=copy(original);let registry=original;
 for(const kind of Object.keys(foundationCatalog().originViews)){
  const plan=foundationTemplatePlan(kind,{registry});assert.equal(plan.writes,0);registry=plan.registry;registryIndex(registry);
 }
 for(const family of ['tables','types'])for(const old of before[family]){
  const now=registry[family].find(x=>x.id===old.id);
  for(const [key,definition]of Object.entries(old.fields))assert.deepEqual(now.fields[key],definition);
 }
 assert.deepEqual(original,before);
 for(const kind of Object.keys(foundationCatalog().originViews))assert.deepEqual(foundationTemplatePlan(kind,{registry}).registry,registry);
});
test('conflicting installed fields are rejected without silently changing type or inventing a fallback',()=>{
 const registry=defaultRegistry();registry.types.find(t=>t.id==='character').fields.形貌={type:'text'};const before=copy(registry);
 assert.throws(()=>foundationTemplatePlan('character',{registry}),/模板字段类型或约束冲突/);assert.deepEqual(registry,before);
 assert.throws(()=>foundationTemplatePlan('unknown'),/未登记/);
});
test('character core and mask plus nine groups use shared identity and separate permission-bearing facts; nonhumans do not gain person groups',()=>{
 const person=foundationTemplatePlan('character');assert.equal(person.groups.length,11);
 assert.deepEqual(person.groups.filter(g=>['history','relationships','secrets'].includes(g.id)).map(g=>g.table),['facts','facts','facts']);
 assert(person.fieldIndex.some(f=>f.table==='objects'&&f.path.join('.')==='名称'));
 assert(!person.fieldIndex.some(f=>f.path.at(-1)==='姓名'));
 for(const kind of ['item','place','organization','rule']){
  const plan=foundationTemplatePlan(kind);assert(!plan.fieldIndex.some(f=>f.path.includes('性情')));
  assert.deepEqual(plan.registry.types.find(t=>t.id==='character'),defaultRegistry().types.find(t=>t.id==='character'));
 }
 const sessions=foundationSessionTemplates();assert.equal(sessions.length,12);assert(sessions.every(s=>s.writes===0&&Object.keys(s.values).length===0));
});
test('unfilled template remains a draft without defaults or legacy migration fields',()=>{const plan=foundationTemplatePlan('character');assert.deepEqual(plan.draft.values,{});assert.equal(plan.draft.confirmed,false);assert(plan.draft.groups.every(g=>g.status==='未讨论'));assert.equal(plan.legacyReview,undefined);assert.equal(foundationCatalog().legacy,undefined);const catalog=foundationCatalog();catalog.originViews.character.length=0;assert.equal(foundationTemplatePlan('character').groups.length,11);});
test('existing form renderer consumes a compiled group while an untouched optional group stays absent',()=>{
 const w=new Window(),plan=foundationTemplatePlan('character'),ui=formUI(w.document),def=plan.groups.find(g=>g.id==='appearance').fields[0].definition;
 const read=ui.value(w.document.body,'形貌',def,undefined,{registry:plan.registry});assert.equal(read(),undefined);
 assert(w.document.body.textContent.includes('辨识特征'));assert(w.document.body.textContent.includes('惯常装束'));w.happyDOM.abort();
});
