import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {defaultRegistry,copy,registryIndex} from '../tables/schema.js';
import {foundationCatalog,foundationTemplatePlan,foundationSessionTemplates} from '../tables/foundation-templates.js';
import {prepareCommit,project} from '../tables/ledger.js';
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
test('real ledger accepts candidate origin definitions, clears inherited knowledge, and keeps later state outside the frozen origin',()=>{
 const plan=foundationTemplatePlan('character'),access={readers:['读者'],knowers:[]};
 const op=(id,table,values)=>({id,table,expected:0,values,access:copy(access),evidence:'测试设定'});
 const base=prepareCommit({registry:plan.registry,rows:[],last:null},{changes:[
  op('new:a','objects',{名称:'甲',类型:'character',属性:{性情:{价值取舍:'珍惜自主选择'},形貌:{辨识特征:['右手旧疤']}}}),
  op('new:f','facts',{名称:'甲的隐情',命题:'甲藏有一封旧信',对象:['new:a'],隐情:{关联对象:['new:a'],揭示条件:'甲自行决定告知'}})
 ]},{source:null,kind:'genesis',evidence:'测试设定',allowedTables:['objects','facts'],inferSchemaFields:false});
 const actor=base.rows.find(r=>r.table==='objects'),secret=base.rows.find(r=>r.table==='facts');
 secret.access.knowers=[actor.id];const origin={registry:plan.registry,bases:copy(base.rows)},originBefore=copy(origin);
 const session={registry:plan.registry,pins:base.rows.map(r=>r.id+'@'+r.rev),commits:[],revision:0};
 const initial=project(origin,session,[]);assert(initial.rows.every(r=>r.access.knowers.length===0));assert(!initial.rows.some(r=>r.table==='cognition'||r.table==='holdings'||r.table==='relations'));
 const opened=prepareCommit(initial,{changes:[op('new:state','state',{名称:'甲当前伤势',对象:actor.id,字段:'伤势',值:'右手擦伤',有效性:'有效'})]},
  {source:'turn-1',evidence:'测试设定',allowedTables:['state'],inferSchemaFields:false});
 session.commits.push(opened.commit);const current=project(origin,session,['turn-1']);assert(current.rows.some(r=>r.table==='state'));assert.deepEqual(origin,originBefore);
 assert.equal(project(origin,session,[]).rows.some(r=>r.table==='state'),false);
});

// The selected base meanings must each land in a real target field, including text-list entries.
import {validateBundle,validateCoreMapping,bundleReference} from '../tables/core-assets.js';
test('both desires and mask meaning survive explicit base adaptation; missing meanings reject without runtime initialization',()=>{
 const plan=foundationTemplatePlan('character'),attrs={人物核心:{性格核心标签:['清醒'],欲望双螺旋:['保持自由','不遗忘'],核心矛盾:'自由与选择背负的记忆共同约束选择'},面具层:{面具呈现:'亲昵随和',面具作用:'保持可接近的形象',面具裂隙:'真实笑意短暂而安静'}},row={id:'old:person',table:'objects',values:{名称:'测试人物',类型:'character',属性:attrs}},source={objects:[{row,kind:'character',growth:[]}],links:[],instructions:''};
 const paths=[['人物核心','欲望双螺旋','0'],['人物核心','欲望双螺旋','1'],['人物核心','核心矛盾'],['面具层','面具作用']],expressions=['保持自由','不遗忘','自由与选择背负的记忆共同约束选择','保持可接近的形象'];
 const bundle=validateBundle({id:'bundle',version:1,name:'测试核心',members:[{sourceObject:row.id,kind:'character',name:'测试人物',traits:expressions.map((x,i)=>({id:'t'+i,name:'意义'+i,value:x,evidence:x})),growth:[]}],links:[]},source),member=bundle.members[0];
 const op={id:'new:person',table:'objects',values:{名称:'目标世界人物',类型:'character',核心引用:bundleReference('book',bundle,member),属性:structuredClone(attrs)},access:{readers:[],knowers:[]}},proposal={artifacts:{registry:plan.registry,base:{changes:[op]},initial:{changes:[]}},coreMapping:{members:[{member:row.id,object:op.id,items:paths.map((p,i)=>({item:'t'+i,path:['属性',...p],expression:expressions[i]}))}],links:[]}};
 assert.equal(validateCoreMapping(proposal,bundle,'book').members[0].items.length,4);const before=structuredClone(proposal);proposal.coreMapping.members[0].items.pop();assert.throws(()=>validateCoreMapping(proposal,bundle,'book'),/遗漏/);assert.deepEqual(proposal.artifacts,before.artifacts);assert.equal(proposal.artifacts.initial.changes.length,0);
});
