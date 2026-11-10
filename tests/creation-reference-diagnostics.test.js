import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {initializeState} from '../engine/materials.mjs';
import {prepareCreationSheets,acceptCreationSheets,validateCreationProposal} from '../engine/creation.mjs';
const prepare=()=>{const s={state:initializeState(catalog),revision:0,contextKey:'diagnostic'};return {s,c:prepareCreationSheets(s,{kind:'world',operationId:'diagnostic-creation'})};};
const section=(c,id,values,n=1)=>{const t=c.catalog.templates.find(t=>t.id===id);return '【'+t.label+'／'+n+'】\n'+Object.entries(values).map(([k,v])=>{const i=t.fields.findIndex(f=>f.key===k);assert(i>=0,k);return (i+1)+' '+t.fields[i].label+'：'+v;}).join('\n');};
const reply=c=>'<reply id="tisya-onepass-1"><task/><anchor phase="before"/><title>诊断|~|~|~</title><body>1 结构引用测试。</body><anchor phase="after"/><extra/><cells format="form">'+c+'</cells><vars/><archive/><actions/></reply>';
test('author form cannot request program-owned world snapshots or settlement receipts',()=>{
 const {c}=prepare();assert(!c.catalog.templates.find(t=>t.id==='T_STATIC_WORLDS').fields.some(f=>f.key==='current_baseline_ref'));assert(!c.catalog.templates.find(t=>t.id==='T_DYN_SCENE_SPACE').fields.some(f=>f.key==='active_rule_receipt_ref'));assert.doesNotMatch(c.form,/初始世界态引用|环境法则回执/);
});
test('forward dossier headings resolve to their canonical actor for relationships',()=>{
 const {s,c}=prepare(),relation=c.catalog.templates.find(t=>t.label==='有向关系与态度');assert(relation);const schema=s.state.schema[relation.id],refs=schema.fields.filter(f=>f.ref==='T_SYS_ENTITIES');assert(refs.length>=2);
 const cells=[section(c,'T_STATIC_WORLDS',{name:'测试世界'}),section(c,relation.id,{name:'合作关系',[refs[0].key]:'人物原点档案／1',[refs[1].key]:'人物原点档案／2'}),section(c,'T_CHAR_DOSSIER',{name:'甲'}),section(c,'T_CHAR_DOSSIER',{name:'乙'},2)].join('\n');const {proposal}=acceptCreationSheets(c,s,reply(cells));validateCreationProposal(proposal,s,{kind:'world'});const row=proposal.matrix.changes.find(r=>r.tableId===relation.id),actors=proposal.matrix.changes.filter(r=>r.tableId==='T_SYS_ENTITIES');assert(actors.some(a=>a.recordId===row.values[refs[0].key]));
});
test('wrong-table reference names report the exact source field and expected table',()=>{
 const {s,c}=prepare();const t=c.catalog.templates.find(t=>t.id==='T_STATIC_ITEMS_SKILLS'),field=s.state.schema[t.id].fields.find(f=>f.key==='value_currency_ref');assert(field);
 const cells=[section(c,'M_UNITS',{label:'元',dimension:'currency'}),section(c,t.id,{name:'笔记本',value_currency_ref:'单位定义／1'})].join('\n');assert.throws(()=>acceptCreationSheets(c,s,reply(cells)),e=>{assert.equal(e.formLocation?.field,'value_currency_ref');assert.match(e.message,/需要/);assert.match(e.message,/实际为 单位定义/);return true;});
});
