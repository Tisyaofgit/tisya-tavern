import assert from 'node:assert/strict';
import test from 'node:test';

import {createTagRegistry,validateExtensionPack,coordinateMatch,characterCoordinates,compileTagProjection,buildWorldTagPack,worldTagChanges} from '../engine/tag-system.mjs';
const registry=createTagRegistry();assert.equal(registry.tags.size,425);assert.equal(registry.axes.size,4);
assert.equal(coordinateMatch({center:{内敛:75,迂回:70},radius:{内敛:30,迂回:35},weights:{内敛:1,迂回:1}},{内敛:80,迂回:65}).matched,true);
assert.equal(coordinateMatch({center:{内敛:75},radius:{内敛:10}},{内敛:20}).matched,false);
assert.equal(coordinateMatch({center:{内敛:75},radius:{内敛:30}},{}).matched,false);
const state={tables:{T_CHAR_DOSSIER:{c1:{values:{persona_coordinates_json:JSON.stringify({内敛:80,迂回:70}),coordinate_growth_json:JSON.stringify({内敛:-5})}}},T_DYN_RELATION_AXES:{},T_STATIC_WORLDS:{w1:{values:{name:'测试世界'}}},T_PREF_SCOPES:{p1:{values:{id:'p1',group:'USER',enabled:true,tag_id:'dynamic.cold_control',owner_type:'user',scope_type:'story',strength:3}}}}};
const full=compileTagProjection({state,tier:'full',worldId:'w1'});assert.match(full.text,/\[TAG.SYSTEM]/);assert.match(full.text,/dynamic.cold_control|观察/);assert.ok(full.resources.length>0);assert.ok(!full.text.includes('[object Object]'));
const brief=compileTagProjection({state,tier:'brief',worldId:'w1'}),coordinate=compileTagProjection({state,tier:'coordinate_only',worldId:'w1'});assert.ok(!brief.text.includes('[/TAG.SYSTEM]\n['));assert.ok(full.text.length>=brief.text.length);assert.match(coordinate.text,/dynamic.cold_control/);
const twice=compileTagProjection({state,globalRows:{gp:{group:'USER',enabled:true,tag_id:'dynamic.cold_control',owner_type:'user',scope_type:'global',strength:2}},tier:'full'});assert.ok(twice.resources.every(r=>r.sources.length>=1));
assert.equal(characterCoordinates(state.tables.T_CHAR_DOSSIER.c1).内敛,75);
const pack=buildWorldTagPack({id:'w1',name:'雾港',genre:'悬疑',description:'潮汐改变道路'});assert.deepEqual(validateExtensionPack(pack),[]);assert.equal(pack.tags[1].status,'candidate');
const changes=worldTagChanges([{tableId:'T_STATIC_WORLDS',recordId:'w1',values:{name:'雾港'}}],{tables:{}});assert.ok(changes[0].values.tag_pack_json);assert.equal(JSON.parse(changes[0].values.tag_pack_json).manifest.name,'雾港配套 Tags');
console.log('tag-system ok',full.text.length,brief.text.length,coordinate.text.length);

test('saved world pack enters real projection and explicit removal survives save',()=>{const world=buildWorldTagPack({id:'w1',name:'雾港',description:'潮汐改变道路'}),s={tables:{T_STATIC_WORLDS:{w1:{values:{name:'雾港',tag_pack_status:'enabled',tag_pack_json:JSON.stringify(world)}}},T_CHAR_DOSSIER:{},T_DYN_RELATION_AXES:{},T_PREF_SCOPES:{}}};const projected=compileTagProjection({state:s,worldId:'w1'});assert.match(projected.text,/潮汐改变道路/);const removed=worldTagChanges([{tableId:'T_STATIC_WORLDS',recordId:'w1',values:{name:'雾港',tag_pack_json:'',tag_pack_user_edits:'user'}}],{tables:{}});assert.equal(removed[0].values.tag_pack_json,'');});
