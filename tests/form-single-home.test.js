import test from 'node:test';import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {initializeState} from '../engine/materials.mjs';import {Runtime} from '../engine/runtime.mjs';
import {compactCreationSchema,matrixRecordVisible} from '../engine/prompt-boundary.mjs';
import {characterCodexView,sharedPhoneThreads,PERSONA_PATHS} from '../engine/codex-character-view.mjs';
import {assertObjectUniqueness} from '../engine/object-identity.mjs';
import {renderBlocks} from '../engine/material-render.mjs';
import {ensureFormSchemas} from '../engine/form-semantics.mjs';
const runtime=()=>new Runtime(initializeState(catalog));
test('writable form merges only explicit aliases and supplies distinct field boundaries',()=>{const s=compactCreationSchema(runtime().data);const fields=s.T_STATIC_PLACES.fields;assert(!fields.some(f=>f.key==='legacy_f0343'));assert(fields.some(f=>f.key==='macro_region'));assert.match(fields.find(f=>f.key==='visual_atmosphere').fill_hint,/颜色|色彩/);assert.match(fields.find(f=>f.key==='legacy_f0344').fill_hint,/布局/);assert(s.T_CHAR_HABITS&&s.T_CHAR_ANCHORS&&s.T_CHAR_MEASURES);assert.equal(s.T_CHAR_DOSSIER.fields.find(f=>f.key==='age_raw').row,13);});
test('codex axes remain independent, unknown remains null, projections never write',()=>{const e=runtime();e.newRecord('T_CHAR_DOSSIER',{name:'甲'},'a');for(const [i,path]of ['persona.axes.外放','persona.axes.内敛','persona.desires.求安.light','persona.desires.求安.shadow'].entries()){e.newRecord('T_TYPE_ATTRIBUTES',{axis_key:path,axis_label:path,minimum:0,maximum:100},'axis'+i);e.newRecord('T_CHAR_MEASURES',{char_ref:'a',axis_ref:'axis'+i,value:80+i},'v'+i);}const before=JSON.stringify(e.data),v=characterCodexView(e.data,'a');assert.equal(PERSONA_PATHS.length,32);assert.equal(v.persona.dynamics.values['axes.内敛'],81);assert.equal(v.persona.dynamics.values['desires.求安.shadow'],83);assert.equal(v.persona.dynamics.values['emotions.喜'],null);assert.equal(v.resources.魔力,undefined);assert.equal(JSON.stringify(e.data),before);e.set(['T_CHAR_MEASURES','v0','value',[]],45);assert.equal(characterCodexView(e.data,'a').persona.dynamics.values['axes.外放'],45);const old=structuredClone(e.data);e.newRecord('T_CHAR_MEASURES',{char_ref:'a',axis_ref:'axis0',value:9},'duplicate');assert.throws(()=>assertObjectUniqueness(old,e.data,[{tableId:'T_CHAR_MEASURES',recordId:'duplicate'}]),/对象身份已存在/);assert.throws(()=>characterCodexView(e.data,'a'),/重复/);});
test('shared conversation is unique while reciprocal notes and drafts stay private',()=>{const e=runtime();for(const p of ['a','b','c']){e.newRecord('T_CHAR_DOSSIER',{name:p},p);e.newRecord('X_SOCIAL_ACCOUNTS',{personId:p,id:p+'@',owned:true},p+'account');}e.newRecord('X_NETWORK_DOCUMENTS',{participant_accounts:['aaccount','baccount'],visibility:'private'},'thread');e.newRecord('X_NETWORK_ITEMS',{thread_ref:'thread',by:'aaccount',text:'同一条消息'},'msg');e.newRecord('X_SOCIAL_CONTACTS',{owner_ref:'a',accountId:'baccount',note:'甲的备注',draft:'未发'},'contactA');e.newRecord('X_SOCIAL_CONTACTS',{owner_ref:'b',accountId:'aaccount',note:'乙的备注'},'contactB');const a=sharedPhoneThreads(e.data,'a'),b=sharedPhoneThreads(e.data,'b');assert.equal(a[0].items[0].row_uuid,b[0].items[0].row_uuid);assert.equal(sharedPhoneThreads(e.data,'c').length,0);e.data.tables.X_NETWORK_ITEMS.msg.states.text='unknown';assert.equal(sharedPhoneThreads(e.data,'a')[0].items[0].text,undefined);e.data.tables.X_NETWORK_ITEMS.msg.states.text='known';assert.equal(Object.keys(e.data.tables.X_NETWORK_ITEMS).length,1);assert(matrixRecordVisible(e.data,'X_SOCIAL_CONTACTS','contactA',{subject_ref:'a'}));assert(!matrixRecordVisible(e.data,'X_SOCIAL_CONTACTS','contactA',{subject_ref:'b'}));assert(!matrixRecordVisible(e.data,'X_NETWORK_ITEMS','msg',{subject_ref:'c'}));});
test('legacy duplicate place fields merge without losing distinct prose and metric names resolve',()=>{const e=runtime();e.newRecord('T_STATIC_PLACES',{name:'场所',macro_region:'城内',legacy_f0343:'河西街区',visual_atmosphere:'蓝灰轮廓',legacy_f0344:'两座桥'},'place');e.newRecord('T_TYPE_ATTRIBUTES',{axis_label:'五能·眠',axis_key:'persona.instincts.眠'},'sleep');e.newRecord('T_CHAR_MEASURES',{axis_ref:'sleep',value:70},'v');const before=JSON.stringify(e.data);const out=renderBlocks(e,{x:[{table_id:'T_STATIC_PLACES',record_id:'place',values:e.rows('T_STATIC_PLACES').place.values},{table_id:'T_CHAR_MEASURES',record_id:'v',values:e.rows('T_CHAR_MEASURES').v.values}]},{},[],{narrative:true}).x.join('\n');assert.match(out,/城内；河西街区/);assert.match(out,/布局设施与用途：两座桥/);assert.match(out,/五能·眠：70/);assert.equal(JSON.stringify(e.data),before);});
test('existing saves receive additive schemas once, without rewriting records',async()=>{const e=runtime();delete e.data.schema.T_CHAR_HABITS;delete e.data.schema.T_CHAR_MEASURES;let calls=0;const db={read:async()=>({state:e.data,revision:1,contextKey:'test'}),commit:async p=>{calls++;assert.deepEqual(p.changes,[]);for(const s of p.schema)e.data.schema[s.id]=s;return db.read();}};await ensureFormSchemas(db);await ensureFormSchemas(db);assert.equal(calls,1);});

test('semantic and phone schema completion land in a single commit',async()=>{
 const e=runtime();delete e.data.schema.T_CHAR_HABITS;delete e.data.schema.X_PHONE_WORLD_CONFIG;let calls=0,schemas=[];
 const db={read:async()=>({state:e.data,revision:1,contextKey:'test'}),commit:async p=>{calls++;schemas.push(...p.schema.map(s=>s.id));for(const s of p.schema)e.data.schema[s.id]=s;return db.read();}};
 await ensureFormSchemas(db,{phone:true});assert.equal(calls,1);assert(schemas.includes('T_CHAR_HABITS')&&schemas.includes('X_PHONE_WORLD_CONFIG'));
 await ensureFormSchemas(db,{phone:true});assert.equal(calls,1);
});

test('chat transcripts keep same-title threads distinct and sort dated lines including legacy children', () => {
 const e = runtime();
 const doc = 'X_NETWORK_DOCUMENTS', item = 'X_NETWORK_ITEMS';
 const rows = [];
 function add(table, id, values) {
  e.newRecord(table, values, id);
  rows.push({table_id:table, record_id:id, values});
 }
 add(doc, 'first', {kind:'dm', title:'同名', id:'legacy'});
 add(doc, 'second', {kind:'group', title:'同名'});
 add(item, 'late', {thread_ref:'legacy', text:'跨日以后', at:'2001-10-12 00:01'});
 add(item, 'other', {thread_ref:'second', text:'另外一段'});
 add(item, 'early', {parent_ref:'first', collection_field:'items', text:'跨日以前', at:'2001-10-11 23:58'});
 add(doc, 'forum', {kind:'forum',title:'帖子'});
 add(item, 'reply', {thread_ref:'forum',text:'论坛回复'});
 const blocks = renderBlocks(e, {slot:rows.reverse()}, {}, [], {narrative:true}).slot;
 const first = blocks.find(block=>block.startsWith('私聊：同名'));
 assert.match(first,/2001-10-11\n23:58 跨日以前\n2001-10-12\n00:01 跨日以后/u);
 assert.doesNotMatch(first,/另外一段|所属会话|网络消息与条目/u);
 assert.match(blocks.find(block=>block.startsWith('群聊：同名')),/另外一段/u);
 assert.equal(blocks.length,4);
 assert.equal(blocks.filter(block=>block.includes('论坛回复')).length,1);
});
