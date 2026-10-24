import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileFullNarrative,compileFullPreflight,fullDefaultConfiguration} from '../../../v3/preset.mjs';
const access={readers:['reader'],knowers:[]};
const rows=[{id:'a',table:'objects',values:{名称:'阿绫',类型:'character'},access},{id:'b',table:'objects',values:{名称:'赵掌柜',类型:'character'},access},{id:'sa',table:'state',values:{对象:'a',字段:'当前事务',值:'检查纸样'},access},{id:'cb',table:'cognition',values:{主体:'b',认识:'PRIVATE_KNOWLEDGE'},access:{readers:[],knowers:['b']}}];
const shared={focusObjects:['a','b','missing'],onstageObjects:['a'],worldWindow:{ready:true,from:'start',to:'end',actors:['b']}};
const config=()=>fullDefaultConfiguration();
const compile=(extra={})=>compileFullNarrative({snapshot:{rows,scope:{},creativeBrief:{},...shared,...extra},currentUser:'继续修理。',configurationSnapshot:config()});
const contents=ms=>ms.map(m=>m.content).join('\n');
const parse=(ms,name)=>JSON.parse(contents(ms).match(new RegExp('<'+name+'>\\n([\\s\\S]*?)\\n</'+name+'>'))[1]);
test('every selected stable object has a real dossier index or an explicit gap, with distinct presence',()=>{
 const messages=compile(),agenda=parse(messages,'FocusAgenda');assert.deepEqual(agenda.map(x=>x.id),['a','b','missing']);assert.deepEqual(agenda.map(x=>x.presence),['onstage','offstage','unknown']);assert.equal(agenda[0].dossier.rowId,'a');assert.ok(agenda[0].relatedRows.some(x=>x.id==='sa'));assert.ok(agenda[1].relatedRows.some(x=>x.id==='cb'));assert.equal(agenda[2].dossier,null);assert.ok(agenda[2].gaps.includes('object dossier unavailable'));
 assert.equal(contents(messages).split('PRIVATE_KNOWLEDGE').length,2);assert.ok(contents(messages).includes('one before-phase 设计 row for every FocusAgenda object'));assert.ok(contents(messages).includes('The writer creates no additional world settlement'));
});
test('missing elapsed window preserves unknown offstage location and summary switch does not omit selected-object rows',()=>{
 const agenda=parse(compile({worldWindow:null}),'FocusAgenda');assert.equal(agenda[1].presence,'unknown');const c=config();c.world.modes.narrative.summary=false;const s=contents(compileFullNarrative({snapshot:{rows,scope:{},creativeBrief:{},...shared},currentUser:'继续',configurationSnapshot:c}));assert.ok(s.includes('设计|{followed character}'));assert.ok(!s.includes('用户偏好|{'));
});
test('post-archive scene roster supersedes stale earlier onstage IDs without advancing absent time',()=>{
 const currentRows=[...rows,{id:'scene',table:'scene',values:{名称:'Current',参与者:['b']},access}];const agenda=parse(compile({rows:currentRows,worldWindow:null}),'FocusAgenda');assert.equal(agenda[0].presence,'offstage');assert.equal(agenda[1].presence,'onstage');assert.equal(agenda[2].presence,'unknown');
});
test('A carries identical focus identities and requires one grounded per-object brief even with plot design disabled',()=>{
 const registry=JSON.parse(fs.readFileSync(new URL('../../../v3/runtime-source/config/registry.json',import.meta.url)));const messages=compileFullPreflight({input:{requestKey:'focus',view:{registry,rows},archiveSources:[],plotEnabled:false,...shared},configurationSnapshot:config()});const state=parse(messages,'TISYA.DATA.STATE');assert.deepEqual(state.FocusAgenda.map(x=>x.id),shared.focusObjects);assert.equal(state.plotEnabled,false);assert.ok(contents(messages).includes('one individually identified creativeBrief.constraints entry for every object'));assert.ok(contents(messages).includes('If plot design is disabled, report grounded current dynamics and gaps only'));
});
