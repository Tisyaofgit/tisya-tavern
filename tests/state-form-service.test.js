import {preprocessTask} from '../tables/slots.js';
import {Window} from 'happy-dom';
import {mountTablePanel} from '../tables/panel.js';
import {defaultRegistry} from '../tables/schema.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createTableService} from '../tables/service.js';
import {createBookGateway} from '../tables/books.js';
import {projectStateVocabulary} from '../tables/state-registry.js';
import {compileConditionRule,evaluateConditionRule} from '../tables/condition-rules.js';
const clone=structuredClone,header='项目｜是否开启｜等级｜额外效果';
async function fixture(){
 const data=emptyConfig(),context={chatId:'state-test',characterId:0,characters:[{avatar:'test.png',name:'测试'}],chat:[{is_user:false,mes:'已确认开场'}],extensionSettings:{[KEY]:data}};data.worlds[worldKey(context)]=defaultWorld();data.worlds[worldKey(context)].tables={injection:'direct'};
 const store=createStore({getContext:()=>context,persist:async()=>true}),saved=new Map();let uid=1,writes=0,beforeWrite=null,afterWrite=null,failRead=false,responder=null;
 const binding={primary:'',additional:[]};
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{if(failRead)throw Error('模拟读取失败');assert(saved.has(name));return clone(saved.get(name));},createWorldbook:async(name,entries)=>{saved.set(name,entries.map(e=>({...clone(e),uid:uid++})));return true;},updateWorldbookWith:async(name,fn)=>{await beforeWrite?.(name);const updated=fn(clone(saved.get(name)));saved.set(name,updated);writes++;await afterWrite?.(name);return clone(updated);},getCharWorldbookNames:async()=>clone(binding),rebindCharWorldbooks:async(_,next)=>Object.assign(binding,clone(next))};
 const books=createBookGateway(()=>helper,()=>context),make=()=>createTableService({store,getContext:()=>context,books,request:async(task,text)=>{if(task==='ruleReview')return {issues:[]};if(responder)return responder(task,JSON.parse(text));throw Error('此测试不应调用模型');}});const service=make();await service.initialize();
 await service.edit({changes:['方鹿','阿禾'].map((name,i)=>({id:'new:person-'+i,table:'objects',expected:0,values:{名称:name,类型:'character'},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}))});
 const persons=(await service.inspect()).rows.filter(r=>r.table==='objects'),owner=persons.find(r=>r.values.名称==='方鹿').id,other=persons.find(r=>r.values.名称==='阿禾').id;
 const setup=async()=>{const old=await service.stateCatalog();return service.saveStateCatalog({preset:true,items:'技能：修船\n技能：游泳\n伤病：右腕旧伤'},old.originRevision);};
 return {service,make,setup,respond:f=>responder=f,context,store,books,saved,owner,other,writes:()=>writes,before:f=>beforeWrite=f,after:f=>afterWrite=f,failRead:v=>failRead=v};
}
const ids=c=>c.items.filter(i=>i.name==='修船'||i.name==='右腕旧伤').map(i=>i.id);
const input=(f,c,text)=>({ownerId:f.owner,itemIds:ids(c),text});
test('registry saves no values; actual book gateway persists compact values and restart reads the same ledger',async()=>{
 const f=await fixture(),before=f.writes();assert.equal((await f.service.stateCatalog()).catalog,null);assert.equal(f.writes(),before);
 const registered=await f.setup(),catalog=registered.catalog;assert.equal(f.writes(),before+1);assert.equal((await f.service.inspect()).rows.filter(r=>r.table==='state').length,0);
 const again=await f.service.saveStateCatalog({preset:true,items:'技能：修船'},registered.originRevision);assert.equal(again.unchanged,true);assert.equal(f.writes(),before+1);
 const text=header+'\n修船｜是｜3｜/\n右腕旧伤｜否｜？｜用力过久发痛';
 const draft=await f.service.previewStateForm(input(f,catalog,text));assert.equal(draft.changes,6);assert.equal(f.writes(),before+1);
 const receipt=await f.service.saveStateForm(draft.id);assert.equal(receipt.recorded,true);assert.equal(f.writes(),before+2);
 const restarted=f.make();assert.equal((await restarted.readStateForm(f.owner,ids(catalog))).text,text);await restarted.saveStateForm(draft.id);assert.equal(f.writes(),before+2);
 const rows=(await restarted.inspect()).rows;assert.equal(rows.filter(r=>r.table==='state').length,6);assert(rows.filter(r=>r.table==='state').every(r=>r.values.对象===f.owner));
 const other=(await restarted.readStateForm(f.other,ids(catalog))).text;assert.equal(other,header+'\n修船｜？｜？｜？\n右腕旧伤｜？｜？｜？');
 const vocabulary=projectStateVocabulary(catalog.registry,catalog.items,{writeDefinitionIds:catalog.registry.definitions.map(d=>d.id)}),program=compileConditionRule('true：技能水平[修船] ≥ 3 → 变更：是否开启[修船] = 否',vocabulary);
 assert.equal(evaluateConditionRule(program,rows,{ownerId:f.owner}).status,'ready');assert.equal(evaluateConditionRule(program,rows,{ownerId:f.other}).status,'unknown');
});
test('malformed second row and forged returned diff cannot partially write or change the private draft',async()=>{
 const f=await fixture(),{catalog}=await f.setup(),before=JSON.stringify([...f.saved]);
 await assert.rejects(f.service.previewStateForm(input(f,catalog,header+'\n修船｜是｜3｜/\n右腕旧伤｜否｜不存在的等级｜/')),/数值/);assert.equal(JSON.stringify([...f.saved]),before);
 const draft=await f.service.previewStateForm(input(f,catalog,header+'\n修船｜是｜3｜/'));draft.diff[0].after='恶意改值';draft.ownerId=f.other;
 await f.service.saveStateForm(draft.id);assert.match((await f.service.readStateForm(f.owner,ids(catalog))).text,/修船｜是｜3｜\//);
 await assert.rejects(f.service.saveStateForm('unknown-draft'),/不存在/);
});
test('old previews reject changed state/definitions; empty and unchanged submissions are zero-write',async()=>{
 const f=await fixture(),{catalog}=await f.setup(),payload=input(f,catalog,header+'\n修船｜是｜3｜/'),a=await f.service.previewStateForm(payload),b=await f.service.previewStateForm({...payload,text:header+'\n修船｜否｜2｜？'});
 await f.service.saveStateForm(b.id);let n=f.writes();await assert.rejects(f.service.saveStateForm(a.id),/已改变/);assert.equal(f.writes(),n);
 const partial=await f.service.previewStateForm({...payload,text:header+'\n修船｜｜｜'});assert.equal(partial.changes,0);assert.equal((await f.service.saveStateForm(partial.id)).unchanged,true);assert.equal(f.writes(),n);
 const c=await f.service.previewStateForm(payload),meta=await f.service.stateCatalog();await f.service.saveStateCatalog({items:'技能：新技能'},meta.originRevision);n=f.writes();await assert.rejects(f.service.saveStateForm(c.id),/已改变/);assert.equal(f.writes(),n);
 const current=(await f.service.readStateForm(f.owner,ids(catalog))).text;const noop=await f.service.previewStateForm({...payload,text:current});
 // Explicit ? fills never-initialized injury cells, while existing identical cells are skipped.
 assert.equal(noop.changes,3);
 const n2=await f.service.previewStateForm({...payload,text:header+'\n修船｜否｜2｜？'});assert.equal(n2.changes,0);
 const old=JSON.stringify([...f.saved]);await assert.rejects(f.service.saveStateCatalog({definitions:'技能／技能水平：布尔'},(await f.service.stateCatalog()).originRevision),/冲突/);assert.equal(JSON.stringify([...f.saved]),old);
});
test('prior access is preserved and native/reference ownership is not overwritten',async()=>{
 const f=await fixture(),{catalog}=await f.setup(),payload=input(f,catalog,header+'\n修船｜是｜3｜/'),d=await f.service.previewStateForm(payload);await f.service.saveStateForm(d.id);
 let row=(await f.service.inspect()).rows.find(r=>r.table==='state'&&r.values.名称==='技能水平[修船]');
 await f.service.edit({changes:[{id:row.id,table:'state',expected:row.rev,values:{值:3},access:{readers:[],knowers:[f.owner]},evidence:'用户手动修改表单'}]});
 const next=await f.service.previewStateForm({...payload,text:header+'\n修船｜｜4｜'});await f.service.saveStateForm(next.id);row=(await f.service.inspect()).rows.find(r=>r.id===row.id);assert.deepEqual(row.access,{readers:[],knowers:[f.owner]});
 await f.service.edit({changes:[{id:row.id,table:'state',expected:row.rev,values:{原生引用:'host-owned'},unset:['值'],access:row.access,evidence:'用户手动修改表单'}]});const n=f.writes();await assert.rejects(f.service.previewStateForm(payload),/原生/);assert.equal(f.writes(),n);
});
test('failed writes stay visible; post-write read failure recovers by the recorded receipt without writing twice',async()=>{
 const f=await fixture(),{catalog}=await f.setup(),payload=input(f,catalog,header+'\n修船｜是｜3｜/'),d=await f.service.previewStateForm(payload),n=f.writes();
 f.before(()=>{throw Error('模拟保存前失败');});await assert.rejects(f.service.saveStateForm(d.id),/模拟保存前失败/);assert.equal(f.writes(),n);f.before(null);
 f.after(()=>f.failRead(true));await assert.rejects(f.service.saveStateForm(d.id),/模拟读取失败/);assert.equal(f.writes(),n+1);f.after(null);f.failRead(false);
 const result=await f.make().saveStateForm(d.id);assert.equal(result.recorded,true);assert.equal(f.writes(),n+1);assert.match((await f.make().readStateForm(f.owner,ids(catalog))).text,/修船｜是｜3/);
});
test('chat switches at the write callback reject before publishing; removed source does not replay a saved draft',async()=>{
 const f=await fixture(),{catalog}=await f.setup(),payload=input(f,catalog,header+'\n修船｜是｜3｜/'),d=await f.service.previewStateForm(payload),n=f.writes();
 f.before(()=>{f.context.chatId='other-chat';});await assert.rejects(f.service.saveStateForm(d.id),/聊天|配置|改变/);assert.equal(f.writes(),n);f.context.chatId='state-test';f.before(null);
 await f.service.saveStateForm(d.id);f.context.chat=[];const count=f.writes();await assert.rejects(f.make().saveStateForm(d.id),/不存在|改变/);assert.equal(f.writes(),count);
});
const systemSpec=()=>({definitions:'人物／经验：数值 = 点 [0,1000] 整数\n技能／技能水平：等级 = 生疏，熟练，精通',items:'人物：基础\n技能：修船',formulas:'奖励：变动：经验[基础] + 100 点',growth:'晋级：true：经验[基础] >= 技能水平[修船] * 100 点 / 1 级，技能水平[修船] < 3 级 → 变动：经验[基础] = -技能水平[修船] * 100 点 / 1 级；变动：技能水平[修船] + 1 级',initial:[]});
async function numericFixture(){const f=await fixture();await f.service.saveStateCatalog(systemSpec(),(await f.service.stateCatalog()).originRevision);const p=await f.service.previewNumericState({ownerId:f.owner,text:'经验[基础]：250\n技能水平[修船]：1'});await f.service.saveStateForm(p.id);return f;}
test('registered growth settles cost and rank in one write, persists receipt and stops after one evaluation',async()=>{
 const f=await numericFixture(),n=f.writes(),p=await f.service.previewStateGrowth({ownerId:f.owner});assert.equal(p.changes,2);assert.equal(f.writes(),n);assert.deepEqual(p.growth,[{name:'晋级',status:'ready'}]);await f.service.saveStateForm(p.id);assert.equal(f.writes(),n+1);await f.make().saveStateForm(p.id);assert.equal(f.writes(),n+1);
 assert.match((await f.make().readNumericState(f.owner)).text,/经验\[基础\]：150 点/);assert.match((await f.make().readNumericState(f.owner)).text,/技能水平\[修船\]：2 级/);const next=await f.service.previewStateGrowth({ownerId:f.owner});assert.equal(next.changes,0);assert.equal(next.growth[0].status,'unmatched');const other=await f.service.previewStateGrowth({ownerId:f.other});assert.equal(other.growth[0].status,'unknown');assert.equal(other.changes,0);
 const reward=await f.service.previewStateFormula({ownerId:f.owner,name:'奖励'});await f.service.saveStateForm(reward.id);assert.match((await f.service.readNumericState(f.owner)).text,/经验\[基础\]：50 点/);assert.match((await f.service.readNumericState(f.owner)).text,/技能水平\[修船\]：3 级/);
});
test('growth conflict and information boundary reject the whole batch; stale formula previews cannot overwrite',async()=>{
 const f=await numericFixture(),a=await f.service.previewStateFormula({ownerId:f.owner,name:'奖励'}),b=await f.service.previewStateFormula({ownerId:f.owner,name:'奖励'});await f.service.saveStateForm(a.id);const n=f.writes();await assert.rejects(f.service.saveStateForm(b.id),/已改变/);assert.equal(f.writes(),n);
 const old=await f.service.stateCatalog();await f.service.saveStateCatalog({growth:'另一晋级：true：经验[基础] >= 100 点 → 变动：技能水平[修船] + 1 级'},old.originRevision);const n2=f.writes();await assert.rejects(f.service.previewStateGrowth({ownerId:f.owner}),/多条成长/);assert.equal(f.writes(),n2);
 const g=await numericFixture();let row=(await g.service.inspect()).rows.find(r=>r.table==='state'&&r.values.名称==='经验[基础]');await g.service.edit({changes:[{id:row.id,table:'state',expected:row.rev,values:{值:250},access:{readers:[],knowers:[g.owner]},evidence:'用户手动修改表单'}]});const n3=g.writes();await assert.rejects(g.service.previewStateGrowth({ownerId:g.owner}),/知情范围/);assert.equal(g.writes(),n3);
});
test('genesis request registers world numeric system and explicit initial values with stable new-character binding',async()=>{
 const f=await fixture(),claim='新人物乙开局有250点经验，修船为第1级。',spec={...systemSpec(),initial:[{owner:'new:乙',values:'经验[基础]：250\n技能水平[修船]：1',evidence:claim}]};let actualInput;
 f.respond((task,input)=>{assert.equal(task,'tableGenesis');actualInput=input;return {blueprint:{name:'数字世界',goal:'登记等级',decisions:[claim],unresolved:[]},checklist:['核数值'],artifacts:{registry:input.registry,base:{changes:[{id:'new:乙',table:'objects',expected:0,values:{名称:'乙',类型:'character'},access:{readers:['读者'],knowers:[]},evidence:claim}]},initial:{changes:[]},stateSystem:spec},workflow:{id:'numeric',name:'数值',version:1,steps:[]}};});
 const d=await f.service.genesis('创世数值'),n=f.writes();assert.match(actualInput.stateSystem.contract,/stored ranks 1,2,3,4/);assert.match(preprocessTask('tableGenesis',actualInput),/stored ranks 1,2,3,4/);assert.equal(preprocessTask('tableGenesis',actualInput).split('stored ranks 1,2,3,4').length-1,1);assert.equal((await f.service.stateCatalog()).catalog,null);
 await f.service.saveGenesis(d);assert.equal(f.writes(),n+2);const info=await f.service.inspect(),person=info.rows.find(r=>r.values.名称==='乙');assert(person);assert.match((await f.make().readNumericState(person.id)).text,/技能水平\[修船\]：1 级/);assert.equal((await f.service.previewStateGrowth({ownerId:person.id})).changes,2);
});
test('invalid genesis numeric initial values reject before either book; existing values cannot be reinitialized',async()=>{
 const f=await numericFixture(),claim='指定开局值。';f.respond((task,input)=>({blueprint:{name:'数值',goal:'数值',decisions:[claim],unresolved:[]},checklist:[],artifacts:{registry:input.registry,base:{changes:[]},initial:{changes:[]},stateSystem:{...systemSpec(),initial:[{owner:f.owner,values:'技能水平[修船]：4',evidence:claim}]}},workflow:{id:'num',name:'数值',version:1,steps:[]}}));
 let d=await f.service.genesis('数值'),before=JSON.stringify([...f.saved]);await assert.rejects(f.service.saveGenesis(d),/范围/);assert.equal(JSON.stringify([...f.saved]),before);
 d.proposal.artifacts.stateSystem.initial[0].values='技能水平[修船]：2';await assert.rejects(f.service.saveGenesis(d),/重新初始化/);assert.equal(JSON.stringify([...f.saved]),before);
});
test('actual panel state page edits numeric cells, previews growth, saves and reopens with shared level labels',async()=>{
 const f=await numericFixture(),win=new Window(),doc=win.document,mount=()=>mountTablePanel(doc,doc.body,{service:f.service,store:f.store});let p=mount();await p.ready;
 const navigate=async()=>{const pick=doc.querySelector('[aria-label="表单功能"]');pick.value='states';pick.dispatchEvent(new win.Event('change'));await p.settled();const mode=doc.querySelector('[aria-label="填写形式"]');mode.value='values';[...doc.querySelectorAll('button')].find(b=>b.textContent==='载入所选对象与表格').click();await p.settled();};await navigate();assert(doc.body.textContent.includes('1=生疏；2=熟练；3=精通'));
 const button=label=>{const b=[...doc.querySelectorAll('button')].find(b=>b.textContent===label);assert(b,label);b.click();return p.settled();};
 await button('检查成长条件');assert(doc.body.textContent.includes('已满足'));await button('确认保存状态变化');assert.equal(doc.querySelector('[aria-label="技能水平[修船] · 当前值"]').value,'2 级');
 const cell=doc.querySelector('[aria-label="经验[基础] · 当前值"]');cell.value='300';cell.dispatchEvent(new win.Event('input',{bubbles:true}));await button('预览填写变化');await button('确认保存状态变化');p.dispose();p=mount();await p.ready;await navigate();assert.equal(doc.querySelector('[aria-label="经验[基础] · 当前值"]').value,'300 点');p.dispose();await win.happyDOM.close();
});
test('actual genesis panel retains the generated numeric definition, growth rules and initial values through confirmation',async()=>{
 const f=await fixture(),claim='方鹿初始经验为100点，修船等级为1。';f.respond((task,input)=>({blueprint:{name:'数值世界',goal:'数值体系',decisions:[claim],unresolved:[]},checklist:[],artifacts:{registry:input.registry,base:{changes:[]},initial:{changes:[]},stateSystem:{...systemSpec(),initial:[{owner:f.owner,values:'经验[基础]：100\n技能水平[修船]：1',evidence:claim}]}},workflow:{id:'numeric-ui',name:'数值创世',version:1,steps:[]}}));
 const win=new Window(),doc=win.document,p=mountTablePanel(doc,doc.body,{service:f.service,store:f.store});await p.ready;const pick=doc.querySelector('[aria-label="表单功能"]');pick.value='genesis';pick.dispatchEvent(new win.Event('change'));await p.settled();const goal=doc.querySelector('[aria-label="创世要求"]');goal.value='创世数值体系';goal.dispatchEvent(new win.Event('input',{bubbles:true}));
 const click=async label=>{const b=[...doc.querySelectorAll('button')].find(x=>x.textContent===label);assert(b,label);b.click();await p.settled();assert.equal(doc.querySelector('[role="alert"]'),null,doc.querySelector('[role="alert"]')?.textContent);};await click('生成可编辑创世蓝图');assert.equal(doc.querySelector('[aria-label="登记数值体系"]').checked,true);await click('确认应用创世蓝图');assert.match((await f.service.readNumericState(f.owner)).text,/技能水平\[修船\]：1 级/);assert((await f.service.stateCatalog()).catalog.growth.includes('晋级'));p.dispose();await win.happyDOM.close();
});
test('state panel does not save a preview under a changed character selector',async()=>{
 const f=await numericFixture(),win=new Window(),doc=win.document,p=mountTablePanel(doc,doc.body,{service:f.service,store:f.store});await p.ready;const page=doc.querySelector('[aria-label="表单功能"]');page.value='states';page.dispatchEvent(new win.Event('change'));await p.settled();const click=async label=>{[...doc.querySelectorAll('button')].find(b=>b.textContent===label).click();await p.settled();};await click('检查成长条件');const n=f.writes();doc.querySelector('[aria-label="填写对象"]').value=f.other;await click('确认保存状态变化');assert.match(doc.querySelector('[role="alert"]').textContent,/对象选择已改变/);assert.equal(f.writes(),n);p.dispose();await win.happyDOM.close();
});
test('the same numeric rank engine binds item archives without character-specific runtime code',async()=>{
 const f=await fixture();await f.service.edit({changes:[{id:'new:blade',table:'objects',expected:0,values:{名称:'试验刀',类型:'item'},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}]});const ownerId=(await f.service.inspect()).rows.find(r=>r.values.名称==='试验刀').id;
 await f.service.saveStateCatalog({definitions:'装备／强化：等级 = 凡铁，精炼，淬锋',items:'装备：锻造',formulas:'精炼：变动：强化[锻造] + 1 级'},(await f.service.stateCatalog()).originRevision);
 let p=await f.service.previewNumericState({ownerId,text:'强化[锻造]：1'});await f.service.saveStateForm(p.id);p=await f.service.previewStateFormula({ownerId,name:'精炼'});await f.service.saveStateForm(p.id);assert.equal((await f.make().readNumericState(ownerId)).text,'强化[锻造]：2 级');assert.equal((await f.service.readNumericState(f.owner)).text,'强化[锻造]：？');
});

async function eventFixture({privateEvent=false}={}){
 const f=await numericFixture(),registration={formulas:'事件奖励：true：已触发事件“完成修船” → 变动：经验[基础] + 100 点',events:'完成修船｜事件奖励｜请表现收工后的疲惫与手艺进展。'};
 await f.service.saveStateCatalog(registration,(await f.service.stateCatalog()).originRevision);
 const access=privateEvent?{readers:[],knowers:[f.owner]}:{readers:['读者'],knowers:[]};
 if(privateEvent){const states=(await f.service.inspect()).rows.filter(r=>r.table==='state');await f.service.edit({changes:states.map(r=>({id:r.id,table:'state',expected:r.rev,values:{值:r.values.值},access,evidence:'用户手动修改表单'}))});}
 await f.service.edit({changes:[{id:'new:repair-event',table:'events',expected:0,values:{名称:'完成修船',经过:'方鹿完成了这次修船。',参与者:[f.owner]},access,evidence:'用户手动修改表单'}]});
 const event=(await f.service.inspect()).rows.find(r=>r.table==='events');return {...f,event,args:{ownerId:f.owner,eventId:event.id,name:'完成修船'}};
}
test('event registration is immutable, creates only definitions and flags; conditional formulas settle once with growth',async()=>{
 const f=await eventFixture(),n=f.writes();assert.match((await f.service.readNumericState(f.owner)).text,/已触发\[完成修船\]：？/);
 const p=await f.service.previewStateEvent(f.args);assert.equal(p.changes,2);assert.equal(f.writes(),n);assert.match((await f.service.readNumericState(f.owner)).text,/技能水平\[修船\]：1 级/);
 await f.service.saveStateForm(p.id);assert.equal(f.writes(),n+1);const text=(await f.make().readNumericState(f.owner)).text;assert.match(text,/经验\[基础\]：250 点/);assert.match(text,/技能水平\[修船\]：2 级/);assert.match(text,/已触发\[完成修船\]：是/);
 const replay=await f.make().previewStateEvent(f.args);assert.equal(replay.recorded,true);assert.equal(replay.id,p.id);await f.make().saveStateForm(replay.id);assert.equal(f.writes(),n+1);
 const before=JSON.stringify([...f.saved]);await assert.rejects(f.service.saveStateCatalog({events:'完成修船｜奖励｜另一文本'},(await f.service.stateCatalog()).originRevision),/不可改写/);assert.equal(JSON.stringify([...f.saved]),before);
 await assert.rejects(f.service.saveStateCatalog({events:'不存在事件｜不存在公式｜不可执行'},(await f.service.stateCatalog()).originRevision),/公式不存在/);assert.equal(JSON.stringify([...f.saved]),before);
});
test('event eligibility, mismatched names, changed previews and duplicate competing saves do not write',async()=>{
 const f=await eventFixture(),n=f.writes();await assert.rejects(f.service.previewStateEvent({...f.args,ownerId:f.other}),/明确参与者/);await assert.rejects(f.service.previewStateEvent({...f.args,eventId:'not-an-event'}),/不存在/);await assert.rejects(f.service.previewStateEvent({...f.args,name:'传闻'}),/不存在/);assert.equal(f.writes(),n);
 const otherService=f.make(),a=await f.service.previewStateEvent(f.args),b=await otherService.previewStateEvent(f.args);await f.service.saveStateForm(a.id);await assert.rejects(otherService.saveStateForm(b.id),/不存在|已改变/);assert.equal(f.writes(),n+1);
 const row=(await f.service.inspect()).rows.find(r=>r.id===f.event.id);await f.service.edit({changes:[{id:row.id,table:'events',expected:row.rev,values:{经过:'改写后的发生经过'},access:row.access,evidence:'用户手动修改表单'}]});const after=f.writes();await assert.rejects(f.make().previewStateEvent(f.args),/发生变化/);await assert.rejects(f.service.readStateEventResults(),/已被修改/);assert.equal(f.writes(),after);
});
test('event write failures preserve retry evidence and restart resolves post-write uncertainty without double rewards',async()=>{
 const f=await eventFixture(),p=await f.service.previewStateEvent(f.args),n=f.writes();f.before(()=>{throw Error('事件保存前失败');});await assert.rejects(f.service.saveStateForm(p.id),/事件保存前失败/);assert.equal(f.writes(),n);f.before(null);
 f.after(()=>f.failRead(true));await assert.rejects(f.service.saveStateForm(p.id),/模拟读取失败/);assert.equal(f.writes(),n+1);f.after(null);f.failRead(false);
 const restart=f.make(),again=await restart.previewStateEvent(f.args);assert.equal(again.recorded,true);await restart.saveStateForm(again.id);assert.equal(f.writes(),n+1);assert.match((await restart.readNumericState(f.owner)).text,/技能水平\[修船\]：2 级/);
});
test('private event results remain private and cannot widen public state access',async()=>{
 const f=await eventFixture({privateEvent:true}),p=await f.service.previewStateEvent(f.args);await f.service.saveStateForm(p.id);assert.deepEqual(await f.make().readStateEventResults(),[]);assert((await f.service.inspect()).rows.filter(r=>r.table==='state').every(r=>r.access.readers.length===0));
 const g=await eventFixture();const row=g.event;await g.service.edit({changes:[{id:row.id,table:'events',expected:row.rev,values:{经过:row.values.经过},access:{readers:[],knowers:[g.owner]},evidence:'用户手动修改表单'}]});const n=g.writes();await assert.rejects(g.service.previewStateEvent(g.args),/知情范围/);assert.equal(g.writes(),n);
});
test('committed event outcomes reach actual prepare slots without replay; later replies consume their narrative window',async()=>{
 const f=await eventFixture();let current=f.store.read(),next=clone(current.data);next.worlds[current.key].tables={...current.world.tables,enabled:true,archive:false,plot:false,preferences:false,progression:false};await f.store.save(next,current.revision,current.key);
 const p=await f.service.previewStateEvent(f.args);await f.service.saveStateForm(p.id);const n=f.writes();f.context.chat.push({is_user:true,mes:'继续'});
 const result=await f.make().prepare();assert.equal(result.slots.state.eventResults.length,1);assert.match(result.text,/已经保存的事件结算结果/);assert.match(result.text,/收工后的疲惫/);assert.equal(f.writes(),n);
 await f.make().prepare();assert.equal(f.writes(),n);f.context.chat.push({is_user:false,mes:'新的一轮已叙述。'});assert.deepEqual((await f.make().prepare()).slots.state.eventResults,[]);assert.equal(f.writes(),n);
 f.context.chat=[];assert.deepEqual(await f.make().readStateEventResults(),[]);await assert.rejects(f.make().previewStateEvent(f.args),/不存在/);assert.equal(f.writes(),n);
});
test('actual author panel binds the selected event and target and saves one receipt',async()=>{
 const f=await eventFixture(),win=new Window(),doc=win.document,p=mountTablePanel(doc,doc.body,{service:f.service,store:f.store});await p.ready;const page=doc.querySelector('[aria-label="表单功能"]');page.value='states';page.dispatchEvent(new win.Event('change'));await p.settled();
 const click=async label=>{const b=[...doc.querySelectorAll('button')].find(b=>b.textContent===label);assert(b,label);b.click();await p.settled();assert.equal(doc.querySelector('[role="alert"]'),null,doc.querySelector('[role="alert"]')?.textContent);};const n=f.writes();await click('预览事件结算');assert.equal(f.writes(),n);await click('确认保存状态变化');assert.equal(f.writes(),n+1);assert.equal((await f.make().readStateEventResults()).length,1);await click('预览事件结算');assert.match(doc.body.textContent,/此事件已经结算/);await click('确认保存状态变化');assert.equal(f.writes(),n+1);p.dispose();await win.happyDOM.close();
});
test('event selectors changing after preview cannot commit the previous occurrence',async()=>{
 const f=await eventFixture();await f.service.edit({changes:[{id:'new:other-occurrence',table:'events',expected:0,values:{名称:'完成修船',经过:'第二次修船。',参与者:[f.owner]},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}]});const win=new Window(),doc=win.document,p=mountTablePanel(doc,doc.body,{service:f.service,store:f.store});await p.ready;const page=doc.querySelector('[aria-label="表单功能"]');page.value='states';page.dispatchEvent(new win.Event('change'));await p.settled();const click=async label=>{[...doc.querySelectorAll('button')].find(b=>b.textContent===label).click();await p.settled();};await click('预览事件结算');const n=f.writes(),select=doc.querySelector('[aria-label="结算事件"]');select.value=select.options[1].value;await click('确认保存状态变化');assert.match(doc.querySelector('[role="alert"]').textContent,/内容已改变/);assert.equal(f.writes(),n);p.dispose();await win.happyDOM.close();
});
test('forked snapshot retains settled event identities and never pays again after restart or a second fork',async()=>{
 const f=await eventFixture();const snap=f.store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,enabled:true,archive:false,plot:false,preferences:false};await f.store.save(snap.data,snap.revision,snap.key);
 const p=await f.service.previewStateEvent(f.args);await f.service.saveStateForm(p.id);await f.service.stageFork(1,false);f.context.chatId='event-branch';await f.service.activateFork();let n=f.writes();const replay=await f.make().previewStateEvent(f.args);assert.equal(replay.recorded,true);await f.make().saveStateForm(replay.id);assert.equal(f.writes(),n);assert.match((await f.make().readNumericState(f.owner)).text,/技能水平\[修船\]：2 级/);assert.deepEqual(await f.make().readStateEventResults(),[]);
 await f.service.stageFork(1,false);f.context.chatId='event-branch-2';await f.service.activateFork();n=f.writes();assert.equal((await f.make().previewStateEvent(f.args)).recorded,true);await f.make().saveStateForm(replay.id);assert.equal(f.writes(),n);
});
test('unmet event formula and formula bypass reject without flag, receipt or partial numeric writes',async()=>{
 const f=await numericFixture();await f.service.saveStateCatalog({formulas:'不足奖励：true：经验[基础] >= 900 点 → 变动：经验[基础] + 1 点',events:'困难修船｜不足奖励｜困难后的进展'},(await f.service.stateCatalog()).originRevision);
 await f.service.edit({changes:[{id:'new:hard',table:'events',expected:0,values:{名称:'困难修船',参与者:[f.owner]},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}]});const event=(await f.service.inspect()).rows.find(r=>r.table==='events'),n=f.writes();await assert.rejects(f.service.previewStateEvent({eventId:event.id,ownerId:f.owner,name:'困难修船'}),/未满足/);await assert.rejects(f.service.previewStateFormula({ownerId:f.owner,name:'不足奖励'}),/由事件结算调用/);assert.equal(f.writes(),n);assert.match((await f.service.readNumericState(f.owner)).text,/已触发\[困难修船\]：？/);assert.equal((await f.service.inspect()).session.commits.filter(c=>c.stateEvent).length,0);
 await assert.rejects(f.service.saveStateCatalog({formulas:'伪造标记：变更：已触发事件“困难修船” = true'},(await f.service.stateCatalog()).originRevision),/标记由事件结算/);assert.equal(f.writes(),n);
});
test('an event with no final state changes still saves exactly one durable receipt',async()=>{
 const f=await eventFixture();let d=await f.service.previewNumericState({ownerId:f.owner,text:'经验[基础]：100\n技能水平[修船]：3\n已触发事件“完成修船”：是'});await f.service.saveStateForm(d.id);
 await f.service.saveStateCatalog({formulas:'无变化：变动：经验[基础] + 0 点',events:'重复检查｜无变化｜仅叙述检查，没有成长。'},(await f.service.stateCatalog()).originRevision);d=await f.service.previewNumericState({ownerId:f.owner,text:'已触发事件“重复检查”：是'});await f.service.saveStateForm(d.id);
 await f.service.edit({changes:[{id:'new:inspect',table:'events',expected:0,values:{名称:'重复检查',参与者:[f.owner]},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}]});const event=(await f.service.inspect()).rows.find(r=>r.values.名称==='重复检查'),args={ownerId:f.owner,eventId:event.id,name:'重复检查'},n=f.writes(),p=await f.service.previewStateEvent(args);assert.equal(p.changes,0);await f.service.saveStateForm(p.id);assert.equal(f.writes(),n+1);assert.equal((await f.make().previewStateEvent(args)).recorded,true);await f.make().saveStateForm(p.id);assert.equal(f.writes(),n+1);
});
test('Genesis confirms event registration without marking occurrence or executing narrative text',async()=>{
 const f=await fixture(),spec={...systemSpec(),events:'完成修船｜奖励｜只在确认结算后叙述，不能执行这段文字。'};f.respond((task,input)=>({blueprint:{name:'事件世界',goal:'注册事件',decisions:[],unresolved:[]},checklist:[],artifacts:{registry:input.registry,base:{changes:[]},initial:{changes:[]},stateSystem:spec},workflow:{id:'events',name:'事件',version:1,steps:[]}}));
 const d=await f.service.genesis('登记事件');await f.service.saveGenesis(d);assert.match((await f.service.stateCatalog()).catalog.events,/完成修船/);assert.match((await f.service.readNumericState(f.owner)).text,/已触发\[完成修船\]：？/);assert.deepEqual(await f.service.readStateEventResults(),[]);assert.equal((await f.service.inspect()).rows.filter(r=>r.table==='state').length,0);
});
test('unmatched private growth conditions do not leak through a zero-change event receipt',async()=>{
 const f=await eventFixture();await f.service.saveStateCatalog({definitions:'人物／隐秘经验：数值 = 点 [0,1000]',formulas:'检查不变：变动：经验[基础] + 0 点',growth:'隐秘晋级：true：隐秘经验[基础] >= 900 点 → 变更：技能水平[修船] = 3 级',events:'检查进展｜检查不变｜不能借这条文本泄露隐秘条件'},(await f.service.stateCatalog()).originRevision);
 let p=await f.service.previewNumericState({ownerId:f.owner,text:'经验[基础]：100\n技能水平[修船]：3\n隐秘经验[基础]：1\n已触发事件“检查进展”：是'});await f.service.saveStateForm(p.id);const row=(await f.service.inspect()).rows.find(r=>r.values.名称==='隐秘经验[基础]');await f.service.edit({changes:[{id:row.id,table:'state',expected:row.rev,values:{值:1},access:{readers:[],knowers:[]},evidence:'用户手动修改表单'},{id:'new:privacy-check',table:'events',expected:0,values:{名称:'检查进展',参与者:[f.owner]},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}]});const event=(await f.service.inspect()).rows.find(r=>r.values.名称==='检查进展');p=await f.service.previewStateEvent({ownerId:f.owner,eventId:event.id,name:'检查进展'});assert.equal(p.changes,0);await f.service.saveStateForm(p.id);assert.deepEqual(await f.service.readStateEventResults(),[]);
});

test('actual grid handles a custom rank-only category, locks absent columns and persists numeric state',async()=>{
 const f=await fixture();await f.service.saveStateCatalog({definitions:'境界／阶位：等级 = 凝气，筑基，金丹',items:'境界：修行'},(await f.service.stateCatalog()).originRevision);
 const win=new Window(),doc=win.document,p=mountTablePanel(doc,doc.body,{service:f.service,store:f.store});await p.ready;const pick=doc.querySelector('[aria-label="表单功能"]');pick.value='states';pick.dispatchEvent(new win.Event('change'));await p.settled();
 assert.equal(doc.querySelector('[aria-label="修行 · 是否开启"]').disabled,true);assert.equal(doc.querySelector('[aria-label="修行 · 额外效果"]').disabled,true);
 const rank=doc.querySelector('[aria-label="修行 · 等级"]');assert.equal(rank.value,'？');rank.value='2';rank.dispatchEvent(new win.Event('input'));
 for(const text of ['预览填写变化','确认保存状态变化']){[...doc.querySelectorAll('button')].find(b=>b.textContent===text).click();await p.settled();assert.equal(doc.querySelector('[role="alert"]'),null);}
 assert.match((await f.make().readNumericState(f.owner)).text,/阶位\[修行\]：2 级/);assert.equal((await f.service.inspect()).rows.filter(r=>r.table==='state').length,1);p.dispose();await win.happyDOM.close();
});
