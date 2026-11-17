import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
const fresh=()=>new Runtime(initializeState(catalog));
const form=(e,id,values)=>{const t=prepareMatrixSheets({state:e.data},{task:'main',operationId:'fields'}).catalog.templates.find(t=>t.id===id);return '【'+t.label+'／1】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');};
function apply(e,text,op='test'){const c=prepareMatrixSheets({state:e.data},{task:'main',mode:'revise',operationId:op}),a=acceptMatrixSheets(c,{state:e.data},{blocks:{cells:text}});applyMatrixChanges(e,a.proposal.matrix.changes);return a;}
const reference=e=>Object.values(e.rows('M_LIST_VALUES')).find(r=>r.values.owner_field==='knowers')?.values;
test('new dossier actor resolves once in an untyped event participant list, including cold stored reuse',()=>{
 const e=fresh();apply(e,form(e,'T_CHAR_DOSSIER',{name:'渡船船工'})+'\n'+form(e,'T_DYN_EVENTS',{knowers:'关联：渡船船工',spine_digest:'船工说明开航条件'}));
 let item=reference(e);assert(item);assert.equal(item.target_table,'T_SYS_ENTITIES');assert(e.rows('T_SYS_ENTITIES')[item.target_row_uuid]);
 const cold=new Runtime(structuredClone(e.data));apply(cold,form(cold,'T_DYN_EVENTS',{knowers:'关联：渡船船工',spine_digest:'再看雾势'}),'next');assert.equal(Object.keys(cold.rows('T_SYS_ENTITIES')).length,1);for(const row of Object.values(cold.rows('M_LIST_VALUES')).filter(r=>r.values.owner_field==='knowers'))assert.equal(row.values.target_table,'T_SYS_ENTITIES');
});
test('explicit dossier list references remain explicit and unrelated same-name records stay ambiguous',()=>{
 const e=fresh();apply(e,form(e,'T_CHAR_DOSSIER',{name:'渡船船工'}));apply(e,form(e,'T_DYN_EVENTS',{knowers:'关联：人物原点档案／渡船船工',spine_digest:'查看登记'}),'explicit');assert.equal(reference(e).target_table,'T_CHAR_DOSSIER');
 e.newRecord('T_STATIC_PLACES',{name:'渡船船工'},'different-place');assert.throws(()=>apply(e,form(e,'T_DYN_EVENTS',{knowers:'关联：渡船船工',spine_digest:'歧义'}),'ambiguous'),/重名或表不匹配/);
});
