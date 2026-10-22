import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry} from '../tables/schema.js';
import {storyRecord,storyMaterial,storyPreferences,storyContext} from '../tables/story-material.js';
import {worldbookEntries} from '../tables/worldbook-context.js';
const registry=defaultRegistry(),access={readers:['读者'],knowers:['p']};
const row=(id,table,values)=>({id,table,rev:7,source:'private-source-key',values,access});
test('natural material separates identity, focus, scene, history and pending without storage metadata',()=>{
 const rows=[row('u','objects',{名称:'用户角色',类型:'character',属性:{外貌:'黑发',性格:'谨慎'}}),row('p','objects',{名称:'关注人物',类型:'character'}),row('q','objects',{名称:'在场人物',类型:'character'}),row('s','scene',{名称:'城门',参与者:['u','q']}),row('e','events',{名称:'昨日抵达',参与者:['p'],经过:'在雨中抵达'}),row('t','tasks',{名称:'待办',负责人:['u']})];
 const raw=structuredClone(rows),text=storyMaterial({rows,registry,userId:'u',focusObjects:['p'],latestTemporary:{text:'未经归档的最新原文'}});
 for(const label of ['user','关注人物','在场其他人物','当前叙事待办','历史事件','当前快照','最新接续原文'])assert(text.includes('<'+label+'>'));
 assert.match(text,/参与者：用户角色、在场人物/);assert.match(text,/已知情人物：关注人物/);
 assert(!text.includes('private-source-key'));assert(!text.includes('"values"'));assert(!text.includes('rev'));assert.deepEqual(rows,raw);
});
test('projection never expands identity-only references or silently grants knowledge',()=>{
 const r={...row('x','objects',{名称:'仅知名字',类型:'character'}),referenceOnly:true,access:{readers:[],knowers:[]}};
 const text=storyRecord(r,{rows:[r],registry});assert.match(text,/这里只提供身份称呼/);assert.match(text,/不向读者展示/);assert.match(text,/没有已确认知情人物/);
});
test('only confirmed enabled preferences appear and current explicit instruction remains separate',()=>{
 const rows=[{...row('a','preferences',{名称:'已确认',内容:'长句'}),preferenceConfirmed:true},{...row('b','preferences',{名称:'未确认',内容:'短句'}),preferenceConfirmed:false},{...row('c','preferences',{名称:'已停用',启用:false}),preferenceConfirmed:true}];
 const text=storyPreferences({explicit:'本次简洁',rows});assert.match(text,/已确认/);assert(!text.includes('未确认\n'));assert(!text.includes('已停用'));assert.match(text,/本次简洁/);
});
test('current snapshot values and settled event knowledge survive natural rendering',()=>{
 const rows=[row('p','objects',{名称:'林舟',类型:'character'}),row('v','state',{名称:'体力',原生引用:'/hero/hp'})];
 const text=storyContext({nativeState:{available:true,values:[{path:'/hero/hp',value:0}]},conditionResults:[{text:'门已打开'}],eventResults:[{event:'训练完成',instruction:'写出疲倦',changes:[{name:'体力',before:1,after:0}],growth:[],access}]},rows);
 assert.match(text,/体力：0/);assert.match(text,/体力：1 → 0/);assert.match(text,/门已打开/);assert.match(text,/已知情人物：林舟/);assert(!text.includes('/hero/hp'));
});
test('native worldbook projection uses natural fields while retaining activation metadata',()=>{
 const r=row('p','objects',{名称:'林舟',类型:'character',属性:{外貌:'黑发'}}),entry=worldbookEntries({rows:[r],registry,scope:'s',forcedIds:['p']})[0];
 assert.match(entry.content,/外貌：黑发/);assert(!entry.content.includes('"values"'));assert.equal(entry.constant,true);assert.equal(entry.tisyaTable.id,'p');assert.deepEqual(entry.key,['林舟']);
});
