import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSimpleGenesis,parseSimpleGenesis} from '../tables/simple-genesis.js';
import {defaultRegistry} from '../tables/schema.js';
import {prepareCommit} from '../tables/ledger.js';
import {validateGeneratedTask} from '../config/contracts.js';

const done=(pending='无',read='无')=>'【完成】\n1 状态：完成\n2 待处理：'+pending+'\n3 补读记录：'+read;
const design=(name='北门开局')=>'【设计】\n1 名称：'+name;
const decision=(value,name='开局设定')=>'【设计说明：'+name+'】\n1 内容：'+(value.includes('\n')?JSON.stringify(value):value);
const setup=(extra={})=>prepareSimpleGenesis({goal:'设计一位守门人、北门与一只铜铃，并明确开局。',registry:defaultRegistry(),currentRows:[],...extra});
function group(plan,table,type,name,fields={},evidence='创建北门。'){
 const schema=plan.compactPlan.schema.find(item=>item.table===table&&item.type===(type??'—'));assert(schema);
 const values={来源依据:evidence,读者:'无',知情者:'无',...fields};
 return '【'+schema.form+'：'+name+'】\n'+Object.entries(values).map(([key,value])=>{const field=schema.fields.find(f=>f.label===key);assert(field,key);return field.row+' '+field.label+'：'+String(value);}).join('\n');
}
function parse(plan,...groups){return parseSimpleGenesis([design(),...groups,done()].join('\n'),plan);}
const row=(id,name,extra={})=>({id,table:'objects',rev:2,values:{名称:name,类型:'character',描述:'旧定义',...extra},access:{readers:[],knowers:[]},source:null});

test('genesis exposes business forms and preserves complete supplied registry privately',()=>{
 const registry=defaultRegistry();registry.tables.find(t=>t.id==='facts').fields.自定义正文={type:'text',hostMarker:'runtime-capture-secret'};
 const input={goal:'设计北门',registry,currentRows:[row('secret-host-id','甲')],stateSystem:{contract:'host-state-system-contract',catalog:{id:'private-catalog-id'}}};const before=structuredClone(input),p=prepareSimpleGenesis(input),wire=JSON.stringify(p.messages);
 for(const hidden of ['secret-host-id','runtime-capture-secret','host-state-system-contract','private-catalog-id','artifacts','expected','dependsOn'])assert(!wire.includes(hidden),hidden);
 assert(wire.includes('【人物：完整名称】'));assert(wire.includes('【场景与全局进度：完整名称】'));assert(!wire.includes('【事件：完整名称】'));
 assert.deepEqual(input,before);assert.deepEqual(p.compactPlan.registry.tables.find(t=>t.id==='facts').fields.自定义正文,input.registry.tables.find(t=>t.id==='facts').fields.自定义正文);
});

test('host constructs valid blueprint and immutable workflow from natural objects and design statements',()=>{
 const p=setup(),evidence='创建北门。';const result=parse(p,decision(evidence),group(p,'objects','place','北门',{},evidence));
 validateGeneratedTask('genesis',result);validateGeneratedTask('workflow',result.workflow);
 assert.equal(result.artifacts.base.changes.length,1);assert.equal(result.artifacts.initial.changes.length,0);assert.equal(result.artifacts.base.changes[0].values.类型,'place');assert.match(result.artifacts.base.changes[0].id,/^new:/);assert.deepEqual(result.blueprint.decisions,[evidence]);assert.deepEqual(result.blueprint.unresolved,[]);assert.equal(result.workflow.id,'tisya-confirmed-genesis');assert.deepEqual(result.workflow.steps,[]);
 assert(!result.artifacts.stateSystem);assert(!result.artifacts.native);
});

test('genesis preserves initial scene state relations holding and cognition with program resolved references',()=>{
 const p=setup(),e='甲与乙是同伴，甲拿着一只铜铃。清晨在北门，门未开，甲知道铜铃属于乙。';
 const result=parse(p,decision(e),group(p,'objects','character','甲',{},e),group(p,'objects','character','乙',{},e),group(p,'objects','place','北门',{},e),group(p,'objects','item','铜铃',{},e),group(p,'scene',null,'开局',{地点:'北门',当前时间:'清晨',参与者:'人物／甲；人物／乙'},e),group(p,'state',null,'门开闭',{对象:'地点／北门',字段:'开门',值:'false'},e),group(p,'relations',null,'甲乙同伴',{主体:'人物／甲',对象:'人物／乙',证据:'甲与乙是同伴'},e),group(p,'holdings',null,'铜铃归属',{物品:'物品／铜铃',所有者:'人物／乙',保管者:'人物／甲',数量:'1'},e),group(p,'cognition',null,'甲知铜铃归属',{主体:'人物／甲',事实:'物品／铜铃',认识:'铜铃属于乙',授权依据:'甲知道铜铃属于乙',知情者:'人物／甲'},e));
 assert.equal(result.artifacts.base.changes.length,4);assert.equal(result.artifacts.initial.changes.length,5);
 const initial=result.artifacts.initial.changes;assert.equal(initial.find(op=>op.table==='state').values.值,false);assert.deepEqual(initial.find(op=>op.table==='cognition').access.knowers,[result.artifacts.base.changes[0].id]);
 const registry=result.artifacts.registry,prepared=prepareCommit({registry,rows:[],last:null},{changes:[...result.artifacts.base.changes,...initial]},{source:null,kind:'genesis',evidence:e,allowedTables:registry.tables.filter(t=>t.owner==='archive').map(t=>t.id)});assert.equal(prepared.rows.length,9);
});

test('unknown cells remain absent and zero stays numeric instead of becoming a default',()=>{
 const p=setup(),e='甲的备用铜铃数量为零。';const result=parse(p,decision(e),group(p,'objects','character','甲',{},e),group(p,'objects','item','铜铃',{},e),group(p,'holdings',null,'备用铜铃',{物品:'物品／铜铃',保管者:'人物／甲',数量:'0'},e));
 assert.equal(result.artifacts.initial.changes[0].values.数量,0);assert.deepEqual(result.artifacts.base.changes[0].values,{名称:'甲',类型:'character'});assert(!Object.hasOwn(result.artifacts.initial.changes[0].values,'所有者'));
});

test('explicit unresolved or missing field requests persist as pending in both application layers',()=>{
 const p=setup({pendingRequirements:['需登记新的成长规则']}),r=parseSimpleGenesis(design()+'\n'+done('两位守卫同名，身份尚未确认'),p);
 assert.deepEqual(r.blueprint.unresolved,['两位守卫同名，身份尚未确认','需登记新的成长规则']);assert.deepEqual(r.artifacts.base.pending,r.blueprint.unresolved);assert.deepEqual(r.artifacts.initial.pending,r.blueprint.unresolved);assert.equal(r.artifacts.base.changes.length,0);
});

test('source evidence must be one continuous material or one independently preserved design statement',()=>{
 const p=setup({sourceCard:'甲守北门。乙携铜铃。'});
 assert.throws(()=>parse(p,group(p,'objects','character','甲',{},'甲守北门。…乙携铜铃。')),/连续原句/);
 const separate=setup();assert.throws(()=>parse(separate,decision('甲守北门。','甲'),decision('乙携铜铃。','乙'),group(separate,'objects','character','甲',{},JSON.stringify('甲守北门。\n\n乙携铜铃。'))),/连续原句/);
 const original='甲称这只船为"晨"。\n 船身是灰色。';const valid=parse(p,decision(original),group(p,'objects','character','甲',{},JSON.stringify(original)));assert.equal(valid.artifacts.base.changes[0].evidence,original);assert.deepEqual(valid.blueprint.decisions,[original]);
});

test('names aliases and native user definitions are never silently merged or overwritten',()=>{
 const native='原生姓名不是可编辑字段。\n原文含"双引号"和 {{user}}。',existing=row('user-bound','旅人',{描述:native,别名:['甲']}),p=setup({currentRows:[existing],sourceUser:{objectId:existing.id,name:'旅人',description:native,access:existing.access},sourceCard:native});
 assert.throws(()=>parse(p,group(p,'objects','character','旅人',{描述:'改写'},native.split('\n')[0])),/逐字维护/);
 assert.throws(()=>parse(p,group(p,'objects','character','甲',{},native.split('\n')[0])),/别名冲突/);
 const r=parse(p,group(p,'objects','character','旅人',{'属性·身份':'旅人'},native.split('\n')[0]));assert(!Object.hasOwn(r.artifacts.base.changes[0].values,'描述'));assert.equal(p.input.currentRows[0].values.描述,native);
});

test('origin only creation hides initial forms and rejects an injected initial phase or existing update',()=>{
 const p=setup({creationOnly:true,sourceCard:'甲守北门。',currentRows:[row('a','甲')]}),wire=p.messages.at(-1).content;
 assert(!wire.includes('【对象当前状态：完整名称】'));assert(!wire.includes('【场景与全局进度：完整名称】'));
 assert.throws(()=>parse(p,group(p,'state',null,'状态',{对象:'人物／甲',字段:'职责',值:'守门'},'甲守北门。')),/开局状态/);
 assert.throws(()=>parse(p,group(p,'objects','character','甲',{描述:'甲守北门。'},'甲守北门。')),/不能改写已有对象/);
});

test('definitions workflow native configuration and later historical events cannot enter through invented groups',()=>{
 const p=setup();for(const heading of ['结构扩展','运行步骤','原生配置','字段定义'])assert.throws(()=>parse(p,'【'+heading+'】\n1 内容：私造结构'),/不设计字段|标题须为|类别未提供/);
 assert.throws(()=>parseSimpleGenesis('{"blueprint":{},"artifacts":{}}',p),/分组标题/);
 const event=p.compactPlan.schema.find(t=>t.table==='events');if(event)assert.throws(()=>parse(p,'【'+event.form+'：后来战斗】\n1 来源依据：不存在'),/不能填写/);
});

test('display goal hides internal host adaptation instructions and task data stays literal',()=>{
 const p=setup({goal:'INTERNAL_HOST_ONLY artifacts.base new: reserved IDs',displayGoal:'设计北门守卫',sourceCard:'原句 {{user}} <%= unsafe() %>',currentRows:[]}),wire=JSON.stringify(p.messages);
 assert(wire.includes('设计北门守卫'));assert(wire.includes('{{user}}'));assert(wire.includes('<%= unsafe() %>'));assert(!wire.includes('INTERNAL_HOST_ONLY'));assert.equal(parseSimpleGenesis(design()+'\n'+done(),p).blueprint.goal,'设计北门守卫');
});

test('unbound native user cannot be replaced by a newly invented same-name origin object',()=>{
 const p=setup({sourceUser:{name:'旅人',description:'旅人来自河湾。'},sourceCard:'旅人来自河湾。'});assert.throws(()=>parse(p,group(p,'objects','character','旅人',{},'旅人来自河湾。')),/不能新建同名替代/);
 const virtual=setup({sourceUser:{objectId:'new:persona',name:'旅人',description:'旅人来自河湾。',access:{readers:[],knowers:[]}}});assert.throws(()=>parse(virtual,group(virtual,'objects','character','旅人',{'属性·身份':'旅人'},'旅人来自河湾。')),/尚未绑定已有档案/);
});

test('host scope and pending requirements require explicit valid types',()=>{
 for(const extra of [{creationOnly:'true'},{displayGoal:''},{pendingRequirements:'新增计算规则'},{pendingRequirements:[null]}])assert.throws(()=>setup(extra),/范围标记|要求不能为空|文字列表/);
});

test('card and native user are distinct evidence sources even when their joined text appears internally',()=>{
 const card='甲来自山城。',user='乙来自海港。',p=setup({sourceCard:card,sourceUser:{name:'乙',description:user}}),joined=card+'\n\n'+user;assert(p.evidenceSources.includes(card));assert(p.evidenceSources.includes(user));assert(!p.evidenceSources.includes(joined));
 assert.throws(()=>parse(p,group(p,'objects','character','甲',{},JSON.stringify(joined))),/连续原句/);assert.equal(parse(p,group(p,'objects','character','甲',{},card)).artifacts.base.changes[0].evidence,card);
});
test('raw card fields and active book entries retain separate boundaries and inactive examples are not evidence',()=>{
 const description='甲是一名守卫。',personality='甲十分谨慎。',book='北门用木材建造。',p=setup({sourceCard:description+'\n\n'+personality,sourceCardRaw:{fields:{description,personality,mes_example:'示例中甲已离城。'},entries:[{content:book}],inactiveEntries:[{content:'停用旧设定。'}]},sourceBooks:[{enabled:false,content:'关闭书的旧设定。'}]});
 assert.throws(()=>parse(p,group(p,'objects','character','甲',{},JSON.stringify(description+'\n\n'+personality))),/连续原句/);assert.throws(()=>parse(p,group(p,'objects','character','甲',{},'示例中甲已离城。')),/连续原句/);assert.throws(()=>parse(p,group(p,'objects','character','甲',{},'关闭书的旧设定。')),/连续原句/);assert.equal(parse(p,group(p,'objects','place','北门',{},book)).artifacts.base.changes[0].evidence,book);
});
