import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry} from '../tables/schema.js';
import {storyMaterial,projectStoryDossiers,storyPreferences,storyContext,storyBlueprint} from '../tables/story-material.js';

const registry=defaultRegistry();
const publicAccess={readers:['读者'],knowers:[]};
const row=(id,table,values,access=publicAccess)=>({id,table,rev:1,source:'current-branch-source',values,access});
const person=(id,name,description)=>row(id,'objects',{名称:name,类型:'character',描述:description});
const occurrences=(text,part)=>text.split(part).length-1;

test('generated material wrappers are English while source text and custom field names remain exact',()=>{
 const original='手写<自定义段>保留原句</自定义段>',rows=[person('a','林栀',original),row('s','state',{名称:'手写状态名',对象:'a',字段:'体力',值:0})];
 const projections=[storyMaterial({rows,registry,userId:'a'}),projectStoryDossiers({rows,registry,userId:'a'}).text];
 for(const text of projections){assert.ok(text.includes(original));assert.ok(text.includes('林栀'));assert.ok(text.includes('手写状态名'));assert.doesNotMatch(text.replace(original,''),/<\/?[^>\n]*\p{Script=Han}[^>\n]*>/u);}
 const context=storyContext({rulePolicy:{decisions:[{action:'optimize',changes:[{after:'现行规则'}]}]},nativeState:{available:true,values:[{path:'/体力',value:0}]},eventResults:[{instruction:'完成照料'}]});
 for(const tag of ['ActiveRules','ConfirmedState','ConfirmedChanges'])assert.ok(context.includes('<'+tag+'>'));
 assert.match(storyContext({nativeState:{available:false}}),/<StateGap>/);
 assert.match(storyPreferences({explicit:'用户写作偏好'}),/<UserPreferences>/);
 assert.match(storyBlueprint({name:'世界原名',goal:'目标原文'}),/<Worldview>/);
});

test('dossier joins each selected record by stable owner ID once without name matching or mutation',()=>{
 const rows=[person('a','同名人物','A_STABLE'),person('b','同名人物','B_STABLE'),row('sa','state',{名称:'A_DYNAMIC',对象:'a',字段:'体力',值:0}),row('sb','state',{名称:'B_DYNAMIC',对象:'b',字段:'体力',值:8})];
 const before=structuredClone(rows),result=projectStoryDossiers({rows,registry,userId:'a',focusObjects:['a','b']});
 for(const value of ['A_STABLE','B_STABLE'])assert.equal(occurrences(result.text,value),1);for(const value of ['A_DYNAMIC','B_DYNAMIC'])assert.equal(occurrences(result.text,'\n'+value+'\n'),1);
 const user=result.text.match(/<user>([\s\S]*?)<\/user>/)[1];assert.match(user,/A_STABLE/);assert.match(user,/A_DYNAMIC/);assert.doesNotMatch(user,/B_STABLE|B_DYNAMIC/);
 assert.equal(occurrences(result.text,'<Basics>'),2);assert.equal(occurrences(result.text,'<ToNarrate>'),2);
 assert.deepEqual(result.placements.find(p=>p.id==='sa'),{id:'sa',ownerId:'a',layer:'ToNarrate'});
 assert.deepEqual(rows,before);assert.doesNotMatch(result.text,/current-branch-source/);
 assert.equal(storyMaterial({rows,registry,layout:'dossier',userId:'a',focusObjects:['a','b']}),result.text);
});

test('selected rows alone determine membership and values; a thin or omitted owner is never expanded',()=>{
 const owner=person('a','已选人物','HIDDEN_RAW_VALUE'),thin={...owner,referenceOnly:true,values:{名称:'已选人物',类型:'character'}},dynamic=row('s','state',{名称:'RETAIN_DYNAMIC',对象:'a',字段:'伤势',值:'仍未痊愈'});
 const result=projectStoryDossiers({rows:[owner,person('other','不应露名','OTHER_SECRET'),dynamic],selectedRows:[thin,dynamic],registry});
 assert.doesNotMatch(result.text,/HIDDEN_RAW_VALUE|OTHER_SECRET|不应露名/);assert.match(result.text,/RETAIN_DYNAMIC/);
 assert.equal(result.unassigned.find(p=>p.id==='s').reason,'owner-identity-only');assert.equal(occurrences(result.text,'<ToNarrate>'),0);
 const absent=projectStoryDossiers({rows:[owner,dynamic],selectedRows:[dynamic],registry});
 assert.equal(absent.unassigned[0].reason,'owner-not-selected');assert.match(absent.text,/RETAIN_DYNAMIC/);assert.doesNotMatch(absent.text,/HIDDEN_RAW_VALUE|已选人物/);
});

test('each child retains its own access, evidence and effective time instead of inheriting owner authority',()=>{
 const owner=person('a','守门人','PUBLIC_BASE'),secret=row('secret','state',{名称:'PRIVATE_STATE',对象:'a',字段:'去向',值:'塔后',有效性:'待确认',生效时间:'昨夜',变动原因:'仅听闻'},{readers:[],knowers:['a']});
 const relation=row('relation','relations',{名称:'RELATION',主体:'a',对象:'b',证据:'亲口约定'},publicAccess);
 const result=projectStoryDossiers({rows:[owner,person('b','旅人','SECOND_BASE'),secret,relation],registry});
 const child=result.text.slice(result.text.indexOf('PRIVATE_STATE'),result.text.indexOf('RELATION'));
 for(const text of ['不向读者展示','已知情人物：守门人','有效性：待确认','生效时间：昨夜','变动原因：仅听闻'])assert(child.includes(text));
 assert.equal(result.placements.find(p=>p.id==='relation').ownerId,'a');assert.equal(occurrences(result.text,'RELATION'),1);
});

test('multi-owner, absent owner and custom records remain once with explicit projection diagnostics',()=>{
 const rows=[person('a','甲','BASE_A'),person('b','乙','BASE_B'),row('joint','tasks',{名称:'JOINT_TASK',负责人:['a','b'],状态:'进行'}),row('single','tasks',{名称:'SINGLE_TASK',负责人:['a'],状态:'接受'}),row('mystery','extension_table',{名称:'CUSTOM_UNIQUE',未知字段:'KEEP_CUSTOM'}),row('timer','timers',{名称:'TIMER_UNIQUE',任务:['single'],状态:'等待'})];
 const result=projectStoryDossiers({rows,registry});
 for(const text of ['JOINT_TASK','SINGLE_TASK','CUSTOM_UNIQUE','TIMER_UNIQUE'])assert.equal(occurrences(result.text,'\n'+text+'\n'),1);
 assert.equal(occurrences(result.text,'KEEP_CUSTOM'),1);
 assert.equal(result.placements.find(p=>p.id==='single').ownerId,'a');
 assert.equal(result.unassigned.find(p=>p.id==='joint').reason,'multiple-owners');
 assert.equal(result.unassigned.find(p=>p.id==='mystery').reason,'unregistered-owner');
 assert.equal(result.unassigned.find(p=>p.id==='timer').reason,'unregistered-owner');
 assert.doesNotMatch(result.text,/multiple-owners|unregistered-owner/);
});

test('empty form values remain stored while zero, false and stated uncertainty survive injection',()=>{
 const rows=[person('a','甲','BASE'),row('s','state',{名称:'TYPED_VALUES',对象:'a',字段:'复合信息',值:{零:0,关闭:false,空字:'',空列:[],空对象:{},空值:null,未填:undefined,未知:'去向未知，等待核实'}}),row('empty','facts',{名称:'EMPTY_ENTRY',命题:'',证据:[]})];
 const before=structuredClone(rows),result=projectStoryDossiers({rows,registry});
 for(const v of ['零：0','关闭：否','未知：去向未知，等待核实'])assert(result.text.includes(v),v);
 assert.doesNotMatch(result.text,/空字：|空列：|空对象：|空值：|未填：|EMPTY_ENTRY/);
 assert.deepEqual(rows,before);assert.equal(result.external.find(x=>x.id==='empty').destination,'empty');
});

test('history stays separate, one object cannot be joined across versions, and calls retain no branch cache',()=>{
 const owner=person('a','甲','BRANCH_A'),event=row('e','events',{名称:'PAST_EVENT',参与者:['a'],经过:'昨日交谈'});
 const first=projectStoryDossiers({rows:[owner,event],registry});assert.match(first.text,/<History>[\s\S]*PAST_EVENT/);assert.equal(first.placements.find(p=>p.id==='e').layer,'History');
 const second=projectStoryDossiers({rows:[person('a','甲','BRANCH_B')],registry});assert.match(second.text,/BRANCH_B/);assert.doesNotMatch(second.text,/BRANCH_A|PAST_EVENT/);
 assert.throws(()=>projectStoryDossiers({rows:[owner,{...owner,rev:2}],registry}),{code:'TISYA_DOSSIER_DUPLICATE_ROW'});
});

test('holdings belong to the explicitly identified item, never an arbitrarily chosen holder',()=>{
 const rows=[person('a','甲','PERSON_A'),person('b','乙','PERSON_B'),row('item','objects',{名称:'铜钥匙',类型:'item',描述:'ITEM_BASE'}),row('holding','holdings',{名称:'HOLDING_FACT',物品:'item',所有者:['a','b'],数量:0})];
 const result=projectStoryDossiers({rows,registry});assert.equal(result.placements.find(p=>p.id==='holding').ownerId,'item');
 assert.match(result.text,/<Basics>\n铜钥匙[\s\S]*?<ToNarrate>\nHOLDING_FACT/);
 assert.equal(occurrences(result.text,'HOLDING_FACT'),1);
});

test('unavailable access is explicitly unknown and auxiliary records keep their separate destination',()=>{
 const unknown={...person('a','甲','UNKNOWN_ACCESS'),access:undefined};
 const result=projectStoryDossiers({rows:[unknown,row('p','preferences',{名称:'PREFERENCE_OTHER_SLOT'}),row('n','native_cells',{名称:'NATIVE_OTHER_SLOT',路径:'/x',值:0})],registry});
 assert.match(result.text,/读者可见范围：未知，不据此授权展示/);assert.match(result.text,/已知情人物：未知，不据此授予知情/);
 assert.doesNotMatch(result.text,/PREFERENCE_OTHER_SLOT|NATIVE_OTHER_SLOT|\/x/);
 assert.deepEqual(result.external,[{id:'p',destination:'preferences'},{id:'n',destination:'native-state'}]);
});

test('foreshadows have one full home and event references share final-selection numbering',()=>{
 const rows=[person('a','甲','BASE'),row('e2','events',{名称:'后事',经过:'LATER_EVENT'}),row('e1','events',{名称:'旧约',经过:'PAST_EVENT',原文段落:['第一原段\n含换行','第二原段']}),row('c','clues',{名称:'未解之约',对象:['a'],事件:['e1','e2'],已出现内容:'UNIQUE_CLUE_DETAIL',阶段:'未回收'})];
 const result=projectStoryDossiers({rows,registry});
 assert.equal(occurrences(result.text,'UNIQUE_CLUE_DETAIL'),1);assert.match(result.sections.foreshadow,/F01 未解之约/);assert.match(result.sections.foreshadow,/事件：E01、E02/);
 assert.equal(occurrences(result.sections.history,'伏笔：F01'),2);assert.match(result.sections.history,/第一原段\n含换行\n\n第二原段/);
 assert.equal(result.sections.state.includes('UNIQUE_CLUE_DETAIL'),false);assert.deepEqual([...projectStoryDossiers({rows:[...rows].reverse(),registry}).references],[...result.references]);
 const selected=projectStoryDossiers({rows,selectedRows:rows.filter(r=>r.id!=='c'),registry});assert.doesNotMatch(selected.text,/F01|UNIQUE_CLUE_DETAIL/);
});

test('focused current dynamics point to one owned detail and preserve private access',()=>{
 const rows=[person('a','甲','BASE_A'),person('b','乙','BASE_B'),row('aa','activities',{名称:'观察岗哨',主体:'a',行动:'ONLY_FOCUS_DETAIL',状态:'进行'},{readers:[],knowers:['a']}),row('bb','activities',{名称:'整理文件',主体:'b',行动:'OTHER_DETAIL',状态:'进行'}),row('done','activities',{名称:'已完成事务',主体:'a',行动:'DONE_DETAIL',状态:'完成'})];
 const result=projectStoryDossiers({rows,registry,focusObjects:['a']});
 assert.match(result.sections.progression,/关注对象当前动态\n甲：见档案〈ToNarrate〉「观察岗哨」/);assert.doesNotMatch(result.sections.progression,/整理文件|已完成事务|ONLY_FOCUS_DETAIL/);assert.equal(occurrences(result.text,'ONLY_FOCUS_DETAIL'),1);
 assert.match(result.sections.state,/观察岗哨[\s\S]*读者可见范围：不向读者展示[\s\S]*已知情人物：甲/);
 assert.doesNotMatch(result.sections.state,/主体：甲/);
});

test('a focused object with only a current state still has a dynamics reference',()=>{
 const rows=[person('a','甲','BASE'),row('s','state',{名称:'伤势',对象:'a',字段:'伤口',值:'伤口仍未愈合',有效性:'待确认'})];
 const result=projectStoryDossiers({rows,registry,focusObjects:['a']});assert.match(result.sections.progression,/甲：见档案〈ToNarrate〉「伤势」/);assert.equal(occurrences(result.text,'伤口仍未愈合'),1);assert.match(result.sections.state,/有效性：待确认/);
});

test('explicitly resolved clues leave the active pool while their stored history remains intact',()=>{
 const rows=[row('e','events',{名称:'约定兑现',经过:'RESOLUTION_HISTORY'}),row('c','clues',{名称:'已回收线索',已出现内容:'RESOLVED_CLUE',事件:['e'],阶段:'已回收'}),row('u','clues',{名称:'待核线索',已出现内容:'UNCERTAIN_CLUE',阶段:'待核实'})],before=structuredClone(rows);
 const result=projectStoryDossiers({rows,registry});assert.doesNotMatch(result.text,/RESOLVED_CLUE/);assert.match(result.text,/RESOLUTION_HISTORY|UNCERTAIN_CLUE/);assert.doesNotMatch(result.sections.history,/伏笔：/);assert.deepEqual(rows,before);
});

test('disabled target layouts retain meaningful names and remove dangling numeric references',()=>{
 const rows=[person('a','甲','BASE'),row('e','events',{名称:'门前旧约',经过:'EVENT'}),row('c','clues',{名称:'谜题',已出现内容:'CLUE',事件:['e']}),row('s','activities',{名称:'赴约',主体:'a',行动:'ACTION',锚点事件:['e'],状态:'进行'})];
 const all=projectStoryDossiers({rows,registry,focusObjects:['a']}),withoutHistory=projectStoryDossiers({rows,registry,focusObjects:['a'],referenceTables:['clues']}),withoutClue=projectStoryDossiers({rows,registry,referenceTables:['events']});
 assert.match(all.sections.state,/锚点事件：E01/);assert.match(withoutHistory.sections.state,/锚点事件：门前旧约/);assert.match(withoutHistory.sections.foreshadow,/事件：门前旧约/);assert.doesNotMatch(withoutClue.sections.history,/伏笔：F/);assert.equal(all.progressionWithoutDossiers,'');
});

test('same-named followed objects keep distinguishable dossier references without merging identities',()=>{
 const rows=[person('a','同名','BASE_A'),person('b','同名','BASE_B'),row('sa','state',{名称:'伤势',对象:'a',字段:'伤口',值:'左臂'}),row('sb','state',{名称:'伤势',对象:'b',字段:'伤口',值:'右臂'})];
 const result=projectStoryDossiers({rows,registry,focusObjects:['a','b']});for(const label of ['同名〔对象1〕','同名〔对象2〕']){assert(result.sections.state.includes(label));assert(result.sections.progression.includes(label+'：见档案'));}
 assert.equal(occurrences(result.text,'值：左臂'),1);assert.equal(occurrences(result.text,'值：右臂'),1);
});
