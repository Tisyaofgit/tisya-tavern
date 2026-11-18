import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stableId} from '../engine/common.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {worldFramework,createWorldFrameworkService} from '../engine/world-framework.mjs';
import {createMatrixHost} from '../engine/host.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
function state(){const e=new Runtime(initializeState(catalog,{world_ref:'world'}));
 e.newRecord('T_STATIC_WORLDS',{name:'临海',world_id:'world',calendar_id:'cal'},'world');
 e.newRecord('M_CALENDAR_RULES',{calendar_id:'cal',world_ref:'world',mode:'FIXED',year_numbering:'astronomical',months_per_year:10,days_per_month:30,hours_per_day:24,minutes_per_hour:60,narrative:'潮汐历按港口公约通用。',value_state:'known'},'cal');
 e.newRecord('M_UNITS',{scope_world_id:'world',unit_key:'coin-unit',label:'青钱',dimension:'currency',narrative:'临海通用铸币'},'coin-unit');
 e.newRecord('T_STATIC_ITEMS_SKILLS',{name:'青钱',category:'货币'},'coin');e.newRecord('T_STATIC_PLACES',{name:'临海城'},'city');
 e.newRecord('T_DYN_CURRENCY_BALANCES',{currency_ref:'coin',balance:7},'wallet');return e;
}
test('global framework groups canonical definitions once and consumers retain references',()=>{
 const e=state(),before=structuredClone(e.data),view=worldFramework(e.data);assert.equal(view.worldId,'world');assert(view.groups.some(g=>g.name==='历法'&&g.records.some(r=>r.record_id==='cal')));
 assert(!view.groups.some(g=>g.records.some(r=>r.record_id==='wallet')));
 const slots=materials(e),text=Object.values(slots).join('\n');assert.equal((text.match(/潮汐历按港口公约通用。/g)??[]).length,1);assert.equal((text.match(/临海通用铸币/g)??[]).length,1);
 assert.match(slots.tisya_material_current_state,/青钱/);assert(!text.includes('coin-unit'));assert(!text.includes('calendar_id='));assert.equal(e.data.tables.T_DYN_CURRENCY_BALANCES.wallet.values.currency_ref,'coin');assert.deepEqual(e.data.tables,before.tables);
});
test('multiple worlds do not infer ownership for unscoped legacy places and currencies',()=>{
 const e=state();e.newRecord('T_STATIC_WORLDS',{name:'异界',world_id:'other'},'other');e.newRecord('M_CALENDAR_RULES',{calendar_id:'foreign',world_ref:'other',mode:'FIXED',year_numbering:'astronomical',narrative:'别的世界'},'foreign');
 delete e.data.tables.X_RECORD_META[stableId('T_STATIC_PLACES#city')].values.scope_world_id;delete e.data.tables.X_RECORD_META[stableId('T_STATIC_ITEMS_SKILLS#coin')].values.scope_world_id;let view=worldFramework(e.data);assert(!view.groups.flatMap(g=>g.records).some(r=>['foreign','city','coin'].includes(r.record_id)));
 e.set(['X_RECORD_META',stableId('T_STATIC_PLACES#city'),'scope_world_id',[]],'world');view=worldFramework(e.data);assert(view.groups.flatMap(g=>g.records).some(r=>r.record_id==='city'));
 assert.equal(worldFramework(e.data,{}).worldId,null);
});
test('framework edits use actual Matrix transactions, preserve consumers and reject stale or cross-world changes',async()=>{
 const disk=new Map(),ctx={chatId:'framework-test',characterId:1,chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage:{get:async id=>structuredClone(disk.get(id)),set:async(id,value)=>disk.set(id,structuredClone(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,structuredClone(value));return true;}},persistSettings:async()=>true,persistMetadata:async()=>true});
 await host.import({state:state().data});const api=createWorldFrameworkService({read:host.readDatabase,commit:host.commitDatabase});const db=await api.readWorldFramework();
 const updated=await api.saveWorldFrameworkRecord({table:'M_CALENDAR_RULES',id:'cal',worldId:'world',values:{days_per_month:31},revision:db.revision,contextKey:db.contextKey});assert.equal(updated.state.tables.M_CALENDAR_RULES.cal.values.days_per_month,31);assert.equal(updated.state.tables.T_STATIC_WORLDS.world.values.calendar_id,'cal');
 await assert.rejects(api.saveWorldFrameworkRecord({table:'M_CALENDAR_RULES',id:'cal',worldId:'world',values:{days_per_month:32},revision:db.revision,contextKey:db.contextKey}),/变化/);
 const current=await api.readWorldFramework();await assert.rejects(api.saveWorldFrameworkRecord({table:'M_CALENDAR_RULES',id:'cal',worldId:'world',values:{calendar_id:'replacement'},revision:current.revision,contextKey:current.contextKey}),/不能/);
 const added=await api.saveWorldFrameworkRecord({table:'T_STATIC_PLACES',worldId:'world',values:{name:'南港',parent_place_ref:'city'},revision:current.revision,contextKey:current.contextKey});assert.equal(added.state.tables.T_STATIC_PLACES[added.recordId].values.parent_place_ref,'city');
 assert.equal(added.state.tables.X_RECORD_META[stableId('T_STATIC_PLACES#'+added.recordId)].values.scope_world_id,'world');
 const latest=await api.readWorldFramework(),newWorld=await api.saveWorldFrameworkRecord({table:'T_STATIC_WORLDS',worldId:'world',values:{name:'另一个世界'},revision:latest.revision,contextKey:latest.contextKey});
 const other=await api.readWorldFramework(newWorld.recordId);assert.equal(other.worldId,newWorld.recordId);assert.equal(other.worlds.length,2);assert(!other.groups.flatMap(g=>g.records).some(r=>r.record_id==='city'));
 assert.equal((await api.readWorldFramework('world')).worldId,'world');
 assert.equal(Object.values(other.state.tables.X_RECORD_META).filter(r=>r.values.table_id==='T_STATIC_WORLDS'&&r.values.record_id===newWorld.recordId).length,1);

});

test('unit seeds preview and commit their endpoints and formula in one world transaction',async()=>{
 const {compileUnitRatios,convertUnit,normalizeTables}=await import('../engine/mechanical_runtime.mjs');
 const {unitSeedOptions,planUnitSeedImport}=await import('../tables/foundation/unit-seeds.js');
 const e=state();
 e.newRecord('M_UNITS',{scope_world_id:'GLOBAL',unit_key:'existing-meter',label:'米',dimension:'length'},'existing-meter');
 e.newRecord('M_UNITS',{scope_world_id:'GLOBAL',unit_key:'existing-centimeter',label:'厘米',dimension:'length'},'existing-centimeter');
 e.newRecord('M_UNIT_RATIOS',{scope_world_id:'GLOBAL',conversion_mode:'LINEAR_FACTOR',from_unit:'existing-meter',to_unit:'existing-centimeter',numerator:98,value_state:'known'},'existing-ratio');
 e.newRecord('T_STATIC_WORLDS',{name:'别处',world_id:'other-world'},'other-world');
 e.newRecord('M_UNITS',{scope_world_id:'other-world',label:'厘米',dimension:'length'},'other-centimeter');
 assert.equal(unitSeedOptions.unitCount,512);
 assert.equal(unitSeedOptions.unitChoices.length,504);
 assert.equal(unitSeedOptions.ratioChoices.length,37);
 const all=planUnitSeedImport(e.data,worldFramework(e.data),{
  unitIds:unitSeedOptions.unitChoices.map(([id])=>id),ratioIds:unitSeedOptions.ratioChoices.map(([id])=>id)});
 assert.equal(all.changes.filter(row=>row.tableId==='M_UNIT_RATIOS').length,37);
 assert.equal(all.items.filter(item=>item.kind==='单位').length,504);
 const disk=new Map(),ctx={chatId:'unit-seed-chat',characterId:1,chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true};
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,value)=>disk.set(id,structuredClone(value)),commit:async(id,revision,value)=>{
  if((disk.get(id)?.local_revision??0)!==revision)return false;
  disk.set(id,structuredClone(value));return true;
 }};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});
 await host.import({state:e.data});
 const api=createWorldFrameworkService({read:host.readDatabase,commit:host.commitDatabase});
 const before=await host.readDatabase();
 const request={worldId:'world',contextKey:before.contextKey,revision:before.revision,ratioIds:['ratio.length.m_to_cm']};
 const preview=await api.importWorldUnitSeeds(request);
 assert.equal(preview.applied,false);assert.deepEqual(await host.readDatabase(),before);
 assert.deepEqual(preview.items.map(item=>item.status),['已有定义','已有定义','新增']);
 const applied=await api.importWorldUnitSeeds({...request,confirm:true});
 assert.equal(applied.applied,true);
 const saved=await host.readDatabase();
 const rows=compileUnitRatios(normalizeTables(new Runtime(saved.state).mechanicalPayload())),ratio=rows.find(row=>row.scope_world_id==='world');
 assert.equal(rows.find(row=>row.scope_world_id==='GLOBAL').numerator,98);
 assert.equal(ratio.from_unit,'existing-meter');assert.notEqual(ratio.to_unit,'other-centimeter');
 assert.equal(ratio.scope_world_id,'world');assert.equal(convertUnit(2,ratio.from_unit,ratio.to_unit,'length',rows,{scope_world_id:'world'}),200);
 await assert.rejects(api.importWorldUnitSeeds({...request,confirm:true}),/已变化/);
 const repeated=await api.importWorldUnitSeeds({...request,revision:saved.revision,confirm:true});
 assert.equal(repeated.applied,false);assert.deepEqual(await host.readDatabase(),saved);
 assert(repeated.items.some(item=>item.status==='保留已有换算'));
});
