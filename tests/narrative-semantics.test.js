import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNarrativeRecord} from '../engine/narrative-templates.mjs';
import {narrativeFieldValue} from '../engine/narrative-values.mjs';
import {renderBlocks} from '../engine/material-render.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
import catalog from '../engine/catalog.json' with {type:'json'};
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';

test('dossier values retain fear, motive and current-fact roles even when source field order changes',()=>{
 const fields=[{key:'fatal_fracture_points',label:'恐惧与碎裂点',text:'被当成随时可以替换的慰藉'},
 {key:'mask_purpose',label:'面具作用',text:'保护私人生活'},
 {key:'scene_personality_desc',label:'场景化性格',text:'陌生场合寡言而礼貌'},
 {key:'value_priorities',label:'价值取舍',text:'承诺先于名声'}];
 for(const input of [fields,[...fields].reverse()]){
  const actual=renderNarrativeRecord('T_CHAR_DOSSIER','人物甲',input);
  for(const f of fields)assert(actual.includes(f.label+'：'+f.text));
  assert.doesNotMatch(actual,/^被当成/m);
 }
});

test('behavior templates preserve trigger, response and motive separately for partial rows',()=>{
 const fields=[{key:'trigger_situation',label:'触发情景',text:'对方靠近工作台'},
 {key:'actions',label:'外显动作',text:'放慢手上的动作'},
 {key:'internal_motive',label:'内在动因',text:'希望对方多留一会儿'}];
 const result=renderNarrativeRecord('T_CHAR_ANCHORS','工作台',fields,{recordLabel:'人物十维行为锚点'});
 assert.match(result,/^记忆锚点：工作台\n/);
 for(const f of fields)assert(result.includes(f.label+'：'+f.text));
 const partial=renderNarrativeRecord('T_CHAR_ANCHORS','停顿',[fields[2]]);
 assert.match(partial,/内在动因：希望对方多留一会儿/);
 assert.doesNotMatch(partial,/遇到。|动因与来历：。/);
});

test('narrative projection uses readable quantities and plain child narratives without changing canonical storage',()=>{
 const e=new Runtime(initializeState(catalog));
 e.newRecord('T_CHAR_DOSSIER',{name:'人物甲',age_raw:'age',silence_conditions:'silence'},'person');
 e.newRecord('M_UNITS',{label:'岁',dimension:'time'},'years');
 e.newRecord('M_QUANTITIES',{owner_table:'T_CHAR_DOSSIER',owner_row_uuid:'person',owner_field:'age_raw',value:23,unit_ref:'years'},'age');
 e.newRecord('M_CONDITIONS',{owner_table:'T_CHAR_DOSSIER',owner_row_uuid:'person',owner_field:'silence_conditions',narrative:'认为再说一句会伤人时'},'silence');
 const before=JSON.stringify(e.data);
 const read=renderBlocks(e,{character:[{table_id:'T_CHAR_DOSSIER',record_id:'person',values:e.rows('T_CHAR_DOSSIER').person.values}]},{},[],{narrative:true}).character.join('\n');
 assert.match(read,/年龄原值：23 岁/);
 assert.match(read,/沉默条件：认为再说一句会伤人时/);
 assert.doesNotMatch(read,/判定依据与叙事例外|单值n/);
 assert.equal(JSON.stringify(e.data),before);
});

test('phone timestamps and scene objects keep their story time and custom object fields',()=>{
 assert.equal(narrativeFieldValue('X_SOCIAL_POSTS','createdAt',1048,{epoch:'2001-10-13T00:00:00+09:00'}),'2001-10-13 17:28');
 assert.equal(narrativeFieldValue('X_SOCIAL_POSTS','createdAt',-1490,{epoch:'2001-10-13T00:00:00+09:00'}),'2001-10-11 23:10');
 assert.equal(narrativeFieldValue('T_DYN_SCENE_SPACE','time_of_day',{hour:17,minute:30}),'17:30');
 assert.equal(narrativeFieldValue('T_DYN_SCENE_SPACE','date_day',{month:10,day:13}),'10月13日');
 assert.match(narrativeFieldValue('T_DYN_SCENE_SPACE','time_of_day',{hour:17,minute:30,bell:'第三声'}),/bell：第三声/);
 assert.equal(narrativeFieldValue('X_MEDIA_PLAYBACK','position',0),'0秒');
});

test('phone platform, number and theme song survive actual form parsing and narrative projection',()=>{
 const e=new Runtime(initializeState(catalog));
 const context=prepareMatrixSheets({state:e.data},{task:'newCharacter',kind:'character',mode:'create',operationId:'semantic-phone'});
 const form=(id,values)=>{const t=context.catalog.templates.find(t=>t.id===id);return '【'+t.label+'／1】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'{'+v+'}').join('\n');};
 const cells=[form('T_CHAR_DOSSIER',{name:'人物甲'}),form('X_SOCIAL_ACCOUNTS',{name:'人物甲的泡泡',platform:'泡泡',handle:'misha.0214',owned:'是',personId:'人物甲'}),form('X_PHONE_WORLD_CONFIG',{owner_ref:'人物甲',phone_number:'010-0000-0214'}),form('X_MEDIA_SONGS',{title:'白夜',artist:'人物甲'}),form('X_MEDIA_THEME',{owner_ref:'人物甲',theme_song_ref:'白夜'})].join('\n');
 const accepted=acceptMatrixSheets(context,{state:e.data},{blocks:{cells}});
 applyMatrixChanges(e,accepted.proposal.matrix.changes);
 const output=Object.values(materials(e,{narrativeReading:true})).join('\n');
 assert.match(output,/所属平台：泡泡/);assert.match(output,/账号标识：misha\.0214/);
 assert.match(output,/本人手机号：010-0000-0214/);assert.match(output,/人物主题曲：白夜/);
});

test('multiline dialogue is kept under its field and a social account label is not silently discarded',()=>{
 const e=new Runtime(initializeState(catalog));
 e.newRecord('X_SOCIAL_ACCOUNTS',{name:'人物甲',label:'官方认证',platform:'微博'},'social');
 e.newRecord('X_NETWORK_DOCUMENTS',{title:'私聊',text:'甲：在吗？\n乙：在。'},'chat');
 const output=renderBlocks(e,{phone:[...['X_SOCIAL_ACCOUNTS','X_NETWORK_DOCUMENTS'].map(t=>({table_id:t,record_id:Object.keys(e.rows(t))[0],values:Object.values(e.rows(t))[0].values}))]},{},[],{narrative:true}).phone.join('\n');
 assert.match(output,/标签：官方认证/);assert.match(output,/正文：甲：在吗？\n  乙：在。/);assert.doesNotMatch(output,/⏎/);
});
