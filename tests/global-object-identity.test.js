import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {fixture} from './turn-review-host.test.js';
import {assertObjectUniqueness,objectIdentity} from '../engine/object-identity.mjs';
const fresh=()=>new Runtime(initializeState(catalog,{audience:'author',world_ref:'identity-world'}));
const context=(e,op='global-identity')=>prepareMatrixSheets({state:e.data},{operationId:op,task:'main',mode:'revise'});
const form=(e,table,values,number=1)=>{const t=context(e).catalog.templates.find(t=>t.id===table);return '【'+t.label+'／'+number+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');};
function compile(e,text,op='global-identity'){const a=acceptMatrixSheets(context(e,op),{state:e.data},{blocks:{cells:text}}),copy=new Runtime(e.data);applyMatrixChanges(copy,a.proposal.matrix.changes);return {a,copy};}
test('identity references normalize spelling and reuse an explicit alias without renaming the canonical record',()=>{
 let e=fresh();e=compile(e,form(e,'T_STATIC_PLACES',{name:'North Gate',aliases:'北门',light:'昏暗'})).copy;
 e=compile(e,form(e,'T_STATIC_PLACES',{name:'北门',light:'明亮'}),'alias').copy;
 assert.equal(Object.keys(e.rows('T_STATIC_PLACES')).length,1);assert.equal(Object.values(e.rows('T_STATIC_PLACES'))[0].values.name,'North Gate');
 e=compile(e,form(e,'T_DYN_SCENE_SPACE',{name:'入城',place_ref:' Ｎｏｒｔｈ   Ｇａｔｅ '}),'width').copy;assert.equal(Object.keys(e.rows('T_STATIC_PLACES')).length,1);
});
test('one current state per subject and one gauge per subject/property survives renamed display labels',()=>{
 let e=fresh();e=compile(e,form(e,'T_DYN_ENTITY_STATE',{entity_id:'甲',posture:'站立'})+'\n'+form(e,'T_DYN_ENTITY_GAUGES',{name:'精神',entity_id:'甲',field_key:'focus',value:'5'})).copy;
 const stateId=Object.keys(e.rows('T_DYN_ENTITY_STATE'))[0],gaugeId=Object.keys(e.rows('T_DYN_ENTITY_GAUGES'))[0];
 e=compile(e,form(e,'T_DYN_ENTITY_STATE',{entity_id:'甲',posture:'坐下'})+'\n'+form(e,'T_DYN_ENTITY_GAUGES',{name:'专注',entity_id:'甲',field_key:'focus',value:'8'}),'next').copy;
 assert.equal(Object.keys(e.rows('T_DYN_ENTITY_STATE')).length,1);assert.equal(e.rows('T_DYN_ENTITY_STATE')[stateId].values.posture,'坐下');assert.equal(Object.keys(e.rows('T_DYN_ENTITY_GAUGES')).length,1);assert.equal(e.rows('T_DYN_ENTITY_GAUGES')[gaugeId].values.value,8);
});
test('same-batch identity reuse rewires forward references to the retained canonical state',()=>{
 const e=fresh(),text=form(e,'T_DYN_ENTITY_STATE',{entity_id:'甲',posture:'站立'})+'\n'+form(e,'T_DYN_ENTITY_STATE',{entity_id:'甲',live_appearance:'微笑'},2);
 const copy=compile(e,text).copy;assert.equal(Object.keys(copy.rows('T_DYN_ENTITY_STATE')).length,1);const v=Object.values(copy.rows('T_DYN_ENTITY_STATE'))[0].values;assert.equal(v.posture,'站立');assert.equal(v.live_appearance,'微笑');
});
test('common database commit rejects a new duplicate atomically and still permits patching the original',async()=>{
 const f=await fixture();let db=await f.host.readDatabase();const commit=(op,changes)=>f.host.commitDatabase({operationId:op,contextKey:db.contextKey,expectedRevision:db.revision,changes,source:{kind:'identity-test'}});
 await commit('identity-one',[{tableId:'T_STATIC_PLACES',recordId:'place-one',values:{name:'北门',light:'昏暗'}}]);db=await f.host.readDatabase();const before=await f.snapshot();
 await assert.rejects(commit('identity-duplicate',[{tableId:'T_STATIC_PLACES',recordId:'place-two',values:{name:' 北门 ',light:'明亮'}}]),e=>e.code==='OBJECT_IDENTITY_EXISTS');assert.deepEqual(await f.snapshot(),before);
 await commit('identity-patch',[{tableId:'T_STATIC_PLACES',recordId:'place-one',values:{light:'明亮'}}]);assert.equal((await f.snapshot()).state.tables.T_STATIC_PLACES['place-one'].values.light,'明亮');
});
test('world scope, different physical instances and existing ambiguity remain explicit',()=>{
 const e=fresh();e.newRecord('T_STATIC_PLACES',{name:'北门'},'one');const before=structuredClone(e.data);e.data.runtime.scope.world_ref='other-world';e.newRecord('T_STATIC_PLACES',{name:'北门'},'other');assert.doesNotThrow(()=>assertObjectUniqueness(before,e.data,[{tableId:'T_STATIC_PLACES',recordId:'other'}]));
 const a=objectIdentity(e.data,'T_SYS_ENTITIES',{kind:'item',instance_name:'左边钥匙'}),b=objectIdentity(e.data,'T_SYS_ENTITIES',{kind:'item',instance_name:'右边钥匙'});assert.notEqual(a,b);
 e.data.runtime.scope.world_ref='identity-world';e.newRecord('T_STATIC_PLACES',{name:'北门'},'old-duplicate');const snapshot=structuredClone(e.data);e.set(['T_STATIC_PLACES','one','light',[]],'日光');assert.doesNotThrow(()=>assertObjectUniqueness(snapshot,e.data,[{tableId:'T_STATIC_PLACES',recordId:'one'}]));assert.throws(()=>compile(e,form(e,'T_DYN_SCENE_SPACE',{name:'城门',place_ref:'北门'})),/重名/);
});

test('same room names under different parent places keep their distinct identities',()=>{
 let e=fresh();e=compile(e,form(e,'T_STATIC_PLACES',{name:'房间',parent_place_ref:'东院',light:'明亮'})).copy;
 e=compile(e,form(e,'T_STATIC_PLACES',{name:'房间',parent_place_ref:'西院',light:'阴暗'}),'west').copy;
 assert.equal(Object.values(e.rows('T_STATIC_PLACES')).filter(r=>r.values.name==='房间').length,2);
 e=compile(e,form(e,'T_STATIC_PLACES',{name:'房间',parent_place_ref:'东院',light:'灯光'}),'east-update').copy;
 assert.equal(Object.values(e.rows('T_STATIC_PLACES')).filter(r=>r.values.name==='房间').length,2);assert.equal(Object.values(e.rows('T_STATIC_PLACES')).filter(r=>r.values.light==='灯光').length,1);
});
test('configuration mutation shares the atomic duplicate barrier',async()=>{
 const f=await fixture();await f.host.mutate(e=>e.newRecord('T_STATIC_PLACES',{name:'唯一地点'},'only'));const before=await f.snapshot();
 await assert.rejects(f.host.mutate(e=>e.newRecord('T_STATIC_PLACES',{name:'唯一地点'},'another')),e=>e.code==='OBJECT_IDENTITY_EXISTS');assert.deepEqual(await f.snapshot(),before);
});
