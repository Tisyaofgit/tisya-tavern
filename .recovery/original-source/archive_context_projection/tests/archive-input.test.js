import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry} from '../tables/schema.js';
import {ARCHIVE_EXPANSION_LIMIT,archiveProposalNeedsRows,prepareArchiveInput,validateArchiveNeedsRows} from '../tables/archive-input.js';

const row=(id,table,values,extra={})=>({id,table,rev:7,values,access:{readers:['读者'],knowers:[]},source:'source-1',...extra});
const objectRow=(id,name,type='character',extra={})=>row(id,'objects',{名称:name,类型:type,别名:[name+'别称'],描述:'完整描述：'+name,属性:{}},extra);
const view=(rows,registry=defaultRegistry())=>({registry,rows});
const get=(input,id)=>input.currentRows.find(row=>row.id===id);

test('a greeting retains every exact identity without loading hundreds of unrelated always/rule dossiers',()=>{
 const registry=defaultRegistry();registry.tables.find(t=>t.id==='objects').assemble={op:'always'};
 const rules=Array.from({length:520},(_,i)=>objectRow('rule-'+i,'遥远规则'+i,'rule'));
 for(const rule of rules)rule.values.属性={效果:'合成规则条文。'.repeat(180)};
 const cold=Array.from({length:14},(_,i)=>objectRow('cold-'+i,'远方人物'+i)),scene=row('scene','scene',{名称:'当前场景',地点:'庭院',参与者:['actor']}),actor=objectRow('actor','阿遥'),native=objectRow('native','来访者','character',{nativePersona:true}),state=row('state','state',{名称:'手中物',对象:'actor',字段:'站位',值:'门前'}),original=view([...rules,...cold,actor,native,scene,state],registry);
 const input=prepareArchiveInput(original,{sourceText:'早上好。'});
 assert.equal(input.currentRows.length,original.rows.length);
 assert.equal(input.currentRows.length,538);assert.equal(input.omittedIds.length,534);
 for(const originalRow of original.rows){const projected=get(input,originalRow.id);assert.equal(projected.id,originalRow.id);assert.equal(projected.rev,originalRow.rev);assert.equal(projected.values.名称,originalRow.values.名称);assert.deepEqual(projected.values.别名,originalRow.values.别名);}
 assert.deepEqual(get(input,'rule-0'),{id:'rule-0',table:'objects',rev:7,values:{名称:'遥远规则0',类型:'rule',别名:['遥远规则0别称']},referenceOnly:true});
 for(const id of ['actor','native','scene','state'])assert.deepEqual(get(input,id),original.rows.find(r=>r.id===id));
 assert(JSON.stringify(input).length<JSON.stringify(original).length*0.3);
});

test('source names, user aliases and exact IDs select full content, without word-fragment false positives',()=>{
 const rows=[objectRow('ada-id','Ada'),objectRow('lin-id','林谨'),objectRow('rule-id','折角规则','rule'),objectRow('other','star')];rows[1].values.别名=['Ｌｉｎ'];
 const input=prepareArchiveInput(view(rows),{sourceText:'Ada 说了早安；请核查 rule-id。',userText:'lin 回来了。restart the engine, Canada is distant.'});
 for(const id of ['ada-id','lin-id','rule-id'])assert.equal(get(input,id).referenceOnly,undefined);
 assert.equal(get(input,'other').referenceOnly,true);
 assert.equal(get(prepareArchiveInput(view(rows),{sourceText:'Canada is distant.'}),'ada-id').referenceOnly,true);
});

test('scene, state and related subjects expand their direct objects, including custom nested refs',()=>{
 const registry=defaultRegistry();registry.tables.find(t=>t.id==='facts').fields.细节={type:'object',fields:{关联物:{type:'refs'}}};
 const objects=[objectRow('actor','阿遥'),objectRow('place','北庭','place'),objectRow('item','铜杯','item'),objectRow('friend','林谨'),objectRow('custom','旧书','item'),objectRow('unrelated','远客')];
 const records=[row('scene','scene',{名称:'当前',地点:'北庭',参与者:['actor']}),row('state','state',{名称:'持杯',对象:'actor',字段:'物品',值引用:'item'}),row('relation','relations',{名称:'故交',主体:'actor',对象:'friend'}),row('fact','facts',{名称:'查看书册',细节:{关联物:['custom']}})];
 const input=prepareArchiveInput(view([...objects,...records],registry));
 for(const id of ['actor','place','item','friend','custom',...records.map(r=>r.id)])assert.equal(get(input,id).referenceOnly,undefined);
 assert.equal(get(input,'unrelated').referenceOnly,true);
});

test('focus/bound player IDs and native persona stay full without recursive object link expansion',()=>{
 const actor=objectRow('actor','阿遥'),player=objectRow('player','访客'),native=objectRow('native','原生用户','character',{nativePersona:true}),rule=objectRow('rule','庭院规则','rule'),deep=objectRow('deep','远方制度','rule');
 actor.values.关联=['rule'];rule.values.关联=['deep'];
 const original=view([actor,player,native,rule,deep]),input=prepareArchiveInput(original,{actorIds:['actor','player','missing']});
 for(const id of ['actor','player','native'])assert.equal(get(input,id).referenceOnly,undefined);
 for(const id of ['rule','deep'])assert.equal(get(input,id).referenceOnly,true);
 const named=prepareArchiveInput(original,{sourceText:'庭院规则'});assert.equal(get(named,'rule').referenceOnly,undefined);assert.equal(get(named,'deep').referenceOnly,true);
});

test('facts, states and scenes that reference rules do not reload the rule library, including inherited rule types',()=>{
 const registry=defaultRegistry();registry.types.push({id:'law',name:'成文制度',aliases:[],version:1,parent:'rule',fields:{条目:{type:'text'}}});
 const rule=objectRow('rule','庭院规则','rule'),subtype=objectRow('law','远方制度','law'),actor=objectRow('actor','阿遥'),records=[row('fact','facts',{名称:'规则索引',对象:['rule','law','actor']}),row('scene','scene',{名称:'当前',地点:'庭院规则',参与者:['rule']}),row('state','state',{名称:'制度状态',对象:'law',字段:'存在',值:true})],original=view([rule,subtype,actor,...records],registry);
 const input=prepareArchiveInput(original,{sourceText:'早上好。'});assert.equal(get(input,'rule').referenceOnly,true);assert.equal(get(input,'law').referenceOnly,true);assert.equal(get(input,'actor').referenceOnly,undefined);
 assert.equal(get(prepareArchiveInput(original,{userText:'远方制度'}),'law').referenceOnly,undefined);
 assert.equal(get(prepareArchiveInput(original,{expandedIds:['rule']}),'rule').referenceOnly,undefined);
});

test('projection preserves each record ACL and cannot gain knowledge from parents, children or hidden refs',()=>{
 const actor=objectRow('actor','阿遥','character',{access:{readers:['读者'],knowers:['actor']}}),parent=objectRow('parent','父档','item',{access:{readers:[],knowers:['secret-owner']}}),child=row('child','cognition',{名称:'个人理解',主体:'actor',事实:['parent','outside-view'],认识:'只知道局部'},{access:{readers:['读者'],knowers:['actor']}});
 parent.values.关联=['outside-view'];
 const original=view([actor,parent,child]),before=structuredClone(original),input=prepareArchiveInput(original);
 assert.deepEqual(get(input,'parent').access,{readers:[],knowers:['secret-owner']});
 assert.deepEqual(get(input,'child').access,{readers:['读者'],knowers:['actor']});
 assert.equal(get(input,'outside-view'),undefined);assert.deepEqual(original,before);
 const privateThin=prepareArchiveInput(view([parent]));assert.equal(get(privateThin,'parent').referenceOnly,true);assert.equal(get(privateThin,'parent').access,undefined);assert(!JSON.stringify(privateThin).includes('secret-owner'));
});

test('all non-object records are retained exactly, including false, zero, empty values and metadata',()=>{
 const records=[row('state','state',{名称:'计数',对象:'unloaded',字段:'数',值:0}),row('cell','native_cells',{名称:'原生',路径:'/progress',值:false,启用:false}),row('event','events',{名称:'空记录',经过:'',参与者:[]},{sourceFloor:12,lockedFields:['经过']})],original=view(records),input=prepareArchiveInput(original);
 assert.deepEqual(input.currentRows,records);assert.deepEqual(input.omittedIds,[]);assert.deepEqual(input.fullIds,records.map(r=>r.id));
});

test('explicit reread supplies full records from the original view and never mutates that view',()=>{
 const original=view([objectRow('rule','庭院规则','rule'),objectRow('other','远方规则','rule')]),before=structuredClone(original),first=prepareArchiveInput(original);
 const expandedIds=validateArchiveNeedsRows(original,['rule','rule']);assert.deepEqual(expandedIds,['rule']);
 const second=prepareArchiveInput(original,{expandedIds});assert.deepEqual(get(second,'rule'),original.rows[0]);assert.equal(get(second,'other').referenceOnly,true);assert.equal(get(first,'rule').referenceOnly,true);
 second.registry.tables[0].name='changed';get(second,'rule').values.描述='changed';get(first,'other').values.别名.push('changed');assert.deepEqual(original,before);
});

test('needsRows rejects malformed, unknown and identity-only IDs, without alias-based authorization',()=>{
 const restricted=objectRow('restricted','仅身份','rule',{referenceOnly:true}),original=view([objectRow('allowed','完整档案','rule'),restricted]);
 for(const ids of [null,{},'allowed',[null],[1],[''],[' allowed'],['missing'],['完整档案'],['restricted']])assert.throws(()=>validateArchiveNeedsRows(original,ids));
 for(const expandedIds of [['missing'],['restricted'],null])assert.throws(()=>prepareArchiveInput(original,{expandedIds}));
 const input=prepareArchiveInput(original,{sourceText:'仅身份',actorIds:['restricted']});assert.equal(get(input,'restricted').referenceOnly,true);assert.equal(get(input,'restricted').values.描述,undefined);
 assert.throws(()=>validateArchiveNeedsRows(view(input.currentRows),['allowed']),/完整可读取视图/);
});

test('needsRows enforces a cumulative 200-row expansion budget across calls',()=>{
 const original=view(Array.from({length:201},(_,i)=>objectRow('rule-'+i,'规则'+i,'rule'))),ids=original.rows.map(r=>r.id);
 assert.equal(ARCHIVE_EXPANSION_LIMIT,200);assert.equal(validateArchiveNeedsRows(original,ids.slice(0,200)).length,200);
 assert.throws(()=>validateArchiveNeedsRows(original,ids),/200/);
 const expandedIds=validateArchiveNeedsRows(original,ids.slice(0,199));assert.equal(validateArchiveNeedsRows(original,[ids[198],ids[199]],{expandedIds}).length,200);
 assert.throws(()=>validateArchiveNeedsRows(original,ids.slice(199),{expandedIds}),/累计补读/);
});

test('existing identity-only proposal targets require reread even through table aliases and ACL-only changes',()=>{
 const original=view([objectRow('rule','庭院规则','rule'),objectRow('actor','阿遥')]),input=prepareArchiveInput(original,{actorIds:['actor']});
 const proposal={changes:[{id:'rule',table:'常量档案',values:{别名:['新别称']}},{id:'rule',table:'incorrect-table',values:{},access:{readers:['读者'],knowers:['actor']}},{id:'actor',table:'objects',values:{}}]},before=structuredClone(proposal);
 assert.deepEqual(archiveProposalNeedsRows(input,proposal),['rule']);assert.deepEqual(proposal,before);
 const expanded=prepareArchiveInput(original,{actorIds:['actor'],expandedIds:validateArchiveNeedsRows(original,['rule'])});assert.deepEqual(archiveProposalNeedsRows(expanded,proposal),[]);
});

test('new object identity collisions trigger reread after table and field alias normalization without rewriting IDs',()=>{
 const registry=defaultRegistry(),table=registry.tables.find(t=>t.id==='objects');table.aliases.push('底档');table.fields.名称.aliases=['显示名'];table.fields.别名.aliases=['称呼'];
 const a=objectRow('a','Ａda'),b=objectRow('b','阿遥');a.values.别名=['共同称呼'];b.values.别名=['共同称呼'];
 const input=prepareArchiveInput(view([a,b],registry)),proposal={changes:[{id:'new:ada',table:'底档',values:{显示名:'ada'}},{id:'new:shared',table:'常量档案',values:{名称:'新人物',称呼:['共同称呼']}}]},before=structuredClone(proposal);
 assert.deepEqual(archiveProposalNeedsRows(input,proposal),['a','b']);assert.deepEqual(proposal,before);
});

test('referencing a thin object from a new event/state does not force an unrelated dossier reread',()=>{
 const input=prepareArchiveInput(view([objectRow('rule','庭院规则','rule')]));
 assert.deepEqual(archiveProposalNeedsRows(input,{changes:[{id:'new:event',table:'events',values:{名称:'庭院规则',参与者:['rule']}},{id:'new:state',table:'state',values:{名称:'变动',对象:'rule',字段:'有效',值:true}}]}),[]);
});
