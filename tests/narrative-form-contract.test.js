import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {unattributedDialogue} from '../tables/foundation/narrative-contract.js';
const fresh=()=>new Runtime(initializeState(catalog));
const context=(e,task='main')=>prepareMatrixSheets({state:e.data},{operationId:'contract-test',task,mode:'revise'});
function form(e,id,values,number=1){const t=context(e).catalog.templates.find(t=>t.id===id);return '【'+t.label+'／'+number+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v).join('\n');}
function compile(e,text,task='main'){const p=acceptMatrixSheets(context(e,task),{state:e.data},{blocks:{cells:text}});applyMatrixChanges(e,p.proposal.matrix.changes);return p;}
test('new intake dialogue requires each speaker without guessing authors or changing quoted text',()=>{
 const e=fresh();assert.throws(()=>compile(e,form(e,'T_DYN_EVENTS',{title:'渡口约定',exact_dialogues:'明早见。；我会等你。'}),'historyImport'),/逐句注明说话人/);
 const text='阿青→船夫：「明早见；别忘了带灯。」〔P1〕；船夫：「我会等你。」〔P2〕';compile(e,form(e,'T_DYN_EVENTS',{title:'渡口约定',exact_dialogues:text}));assert.equal(Object.values(e.rows('T_DYN_EVENTS'))[0].values.exact_dialogues,text);
 assert.equal(unattributedDialogue('说话人未明：「天亮了。」〔P3〕'),false);assert.equal(unattributedDialogue('阿青：「天亮了。」；没有姓名的第二句。'),true);
});
test('same scene place shorthand resolves one canonical identity and does not duplicate historical/current fields',()=>{
 const e=fresh();compile(e,form(e,'T_DYN_SCENE_SPACE',{name:'渡口晨景',place_ref:'青石渡'})+'\n'+form(e,'T_DYN_ENTITY_STATE',{name:'阿青站位',entity_id:'阿青',location_ref:'同场景地点'}));
 const place=Object.keys(e.rows('T_STATIC_PLACES'));assert.equal(place.length,1);assert.equal(Object.values(e.rows('T_DYN_ENTITY_STATE'))[0].values.location_ref,place[0]);assert.equal(Object.values(e.rows('T_DYN_SCENE_SPACE'))[0].values.place_ref,place[0]);
 const other=fresh();assert.throws(()=>compile(other,form(other,'T_DYN_ENTITY_STATE',{name:'站位',entity_id:'阿青',location_ref:'同场景地点'})),/本批唯一/);
 assert.throws(()=>compile(other,form(other,'T_DYN_SCENE_SPACE',{name:'东岸',place_ref:'东渡'})+'\n'+form(other,'T_DYN_SCENE_SPACE',{name:'西岸',place_ref:'西渡'},2)+'\n'+form(other,'T_DYN_ENTITY_STATE',{name:'站位',entity_id:'阿青',location_ref:'同场景地点'})),/多个场景/);
});
test('complementary event digest is retained in material projection and an exact repeated digest is omitted',async()=>{
 const {renderBlocks}=await import('../engine/material-render.mjs'),e=fresh();e.newRecord('T_DYN_EVENTS',{title:'交信',spine_digest:'信已交出。',full_process:'船夫将信收进布袋。'},'event');const project=()=>renderBlocks(e,{memory:[{table_id:'T_DYN_EVENTS',record_id:'event',values:e.rows('T_DYN_EVENTS').event.values}]});assert.match(JSON.stringify(project()),/信已交出/);assert.match(JSON.stringify(project()),/船夫将信/);e.set(['T_DYN_EVENTS','event','full_process',[]],'信已交出。船夫将信收进布袋。');assert.equal((JSON.stringify(project()).match(/信已交出/g)??[]).length,1);
});

test('older normal-turn dialogue remains readable and is not rejected during source replay',()=>{const e=fresh();compile(e,form(e,'T_DYN_EVENTS',{title:'旧记录',exact_dialogues:'明早见。'}));assert.equal(Object.values(e.rows('T_DYN_EVENTS'))[0].values.exact_dialogues,'明早见。');});

test('timeline event e01 updates stored 01 without creating another event',()=>{
 const e=fresh();e.newRecord('T_DYN_EVENTS',{short_code:'01',title:'信抵达',spine_digest:'门开了。'},'event-one');
 compile(e,form(e,'T_DYN_EVENTS',{short_code:'e01',spine_digest:'来客进屋。'}));
 assert.deepEqual(Object.keys(e.rows('T_DYN_EVENTS')),['event-one']);
 assert.equal(e.rows('T_DYN_EVENTS')['event-one'].values.short_code,'01');
 assert.equal(e.rows('T_DYN_EVENTS')['event-one'].values.spine_digest,'来客进屋。');
 const collision=fresh();collision.newRecord('T_DYN_EVENTS',{short_code:'01',title:'甲'},'one');collision.newRecord('T_DYN_EVENTS',{short_code:'e01',title:'乙'},'two');
 assert.throws(()=>compile(collision,form(collision,'T_DYN_EVENTS',{short_code:'e01',spine_digest:'无法确定。'})),/不存在或不唯一/);
});
