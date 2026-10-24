import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {defaultRegistry} from '../tables/schema.js';
import {mountConfiguration} from '../config/panel.js';
import {mountTablePanel} from '../tables/panel.js';

const copy=value=>structuredClone(value);
const find=(root,label)=>root.querySelector('[aria-label="'+label+'"]');
const button=(root,label)=>{const node=[...root.querySelectorAll('button')].find(x=>x.textContent===label);assert(node,'Missing button '+label);return node;};
async function click(root,label){await button(root,label).onclick();}
async function page(panel,id){const picker=find(panel.root,'表单功能');picker.value=id;await picker.onchange();}
function input(window,node,value){assert(node);if(node.type==='checkbox')node.checked=value;else node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));}

function fixture(){
 const window=new Window(),document=window.document;let data=emptyConfig(),revision=1;data.worlds.chat=defaultWorld();
 const store={read:()=>({data:copy(data),world:copy(data.worlds.chat),key:'chat',label:'测试会话',revision}),save:async(next,expected,key)=>{assert.equal(key,'chat');if(expected!==revision)throw Error('配置已被其他页面修改，草稿保留');data=copy(next);revision++;return store.read();}};
 const registry=defaultRegistry(),rows=[
  {id:'person-a',table:'objects',rev:1,values:{名称:'记录甲',类型:'character',别名:['旧称甲'],描述:'现有人物记录',属性:{}},access:{readers:[],knowers:[]}},
  {id:'person-b',table:'objects',rev:1,values:{名称:'记录乙',类型:'character',别名:[],描述:'另一人物记录',属性:{}},access:{readers:[],knowers:[]}}
 ];
 const history=[{floor:1,role:'assistant',preview:'开场'},{floor:2,role:'user',preview:'用户初始设定'},{floor:3,role:'user',preview:'连续用户消息'},{floor:4,role:'assistant',preview:'回复',latest:true},{floor:5,role:'user',preview:'本轮输入'}];
 const state={busy:false,jobs:[],styleAudit:null},calls={edits:[],analyse:[],bindings:[]};let failBinding=false;
 const inspect=()=>({registry:copy(registry),rows:copy(rows),archived:0,sourceCount:2,anchors:[],preferenceDrafts:[],settings:copy(data.worlds.chat.tables??{}),origin:{revision:0,bases:[],timelineAnchors:[]},session:{pins:[],commits:[]}});
 const service={readAtlasSnapshot:async()=>({data:{live:true,world:'测试世界',branch:'当前存档',registry:copy(registry),rows:copy(rows),originRows:[],savedRows:[],trace:[],cores:[],saves:[],revision:1},verify:async()=>{}}),listConditionRules:async()=>({revision:0,rules:[],objects:[],fields:[]}),stateCatalog:async()=>({catalog:null,originRevision:0}),readFoundationDrafts:async()=>[],assistant:{catalog:()=>({tasks:[]})},state:()=>copy(state),inspect:async()=>inspect(),review:async()=>({...inspect(),persona:{id:'u',name:'原用户',description:'原设定'},personaBinding:null,history:copy(history),messageCount:5,storageReady:true}),ensureInitialized:async()=>{},checkStyle:()=>[],clear(){state.busy=false;},edit:async value=>{calls.edits.push(copy(value));},previewUserBinding:async id=>({format:'user-preview',objectId:id,name:'记录甲',description:'原档案设定'}),saveUserBinding:async value=>{calls.bindings.push(copy(value));if(failBinding)throw Error('原生人设回读失败，尚未确认保存');},analysePreferences:async range=>{calls.analyse.push(copy(range));return {processed:3,pending:0};}};
 const host={archives:async()=>[],books:async()=>[],connections:()=>[],presets:()=>[],preview:()=>null};
 return {window,document,store,service,host,state,calls,registry,rows,failBinding(value){failBinding=value;},close:()=>window.happyDOM.abort()};
}

test('standalone table application preserves all original pages and adds checked user binding',async()=>{
 const {mountTableApp}=await import('../tables/app.js');const f=fixture(),app=mountTableApp(f.document,f.document.body,{service:f.service,store:f.store});await app.ready;
 const root=app.root.shadowRoot,picker=find(root,'表单功能');assert([...picker.options].some(o=>o.value==='foundation'));assert([...picker.options].some(o=>o.value==='states'));assert.equal(app.kind,'tables');assert.equal(app.keepAlive,true);
 const ids=[...picker.options].map(x=>x.value);for(const id of ['settings','forms','history','identity','genesis','preferences','style','progression','parallel','core','timeline','preview','assistant'])assert(ids.includes(id));
 assert.equal(root.querySelectorAll('nav button').length,0);assert(find(root,'辅助任务进度'));assert.deepEqual([...find(root,'接续依据').options].map(x=>x.value),['hybrid','tables']);
 for(const id of ids){picker.value=id;await picker.onchange();assert.equal(picker.value,id==='forms'?'atlas':id);assert.equal(root.querySelector('[role=alert]'),null,'page '+id+' should render');}
 app.dispose();await f.close();
});

test('settings and identity drafts survive page switching and parking, failed binding keeps edits',async()=>{
 const f=fixture(),panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store});await panel.ready;
 input(f.window,find(panel.root,'启用表单推进'),true);await page(panel,'identity');await click(panel.root,'预览写回原生用户身份');
 input(f.window,find(panel.root,'原生用户名称'),'用户修订名');await page(panel,'settings');assert.equal(find(panel.root,'启用表单推进').checked,true);await page(panel,'identity');assert.equal(find(panel.root,'原生用户名称').value,'用户修订名');
 assert.equal(panel.requestLeave().allowed,false);assert.match(panel.requestLeave().reason,/草稿/);assert.equal(panel.requestLeave({preserve:true}).allowed,true);
 f.failBinding(true);await click(panel.root,'保存并绑定为 user');assert.match(panel.root.querySelector('[role=alert]').textContent,/回读失败/);assert.equal(find(panel.root,'原生用户名称').value,'用户修订名');assert.equal(panel.requestLeave().dirty,true);assert.equal(f.calls.bindings[0].name,'用户修订名');
 await click(panel.root,'放弃绑定草稿');assert.equal(panel.requestLeave().allowed,false,'settings draft remains parked');await page(panel,'settings');await click(panel.root,'放弃当前未保存修改');assert.equal(panel.requestLeave().allowed,true);
 panel.dispose();await f.close();
});

test('table search preserves record identity and unsaved row editing has an explicit discard',async()=>{
 const f=fixture(),panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store});await panel.ready;await page(panel,'forms');
 input(f.window,find(panel.root,'搜索档案'),'旧称甲');await panel.settled();assert.equal(panel.root.querySelector('[data-record="person-a"]').hidden,false);assert.equal(panel.root.querySelector('[data-record="person-b"]').hidden,true);
 await click(panel.root,'编辑');await click(panel.root,'进入内容编辑');input(f.window,find(panel.root,'名称 · 值'),'草稿名称');await page(panel,'identity');await page(panel,'forms');await click(panel.root,'编辑');assert.equal(find(panel.root,'名称 · 值').value,'草稿名称');
 await click(panel.root,'放弃这次修改');assert.equal(find(panel.root,'名称 · 值'),null);assert.equal(f.calls.edits.length,0);assert.equal(panel.requestLeave().allowed,true);
 panel.dispose();await f.close();
});

test('historical preference range uses actual floor numbers even with consecutive user messages',async()=>{
 const f=fixture(),panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store});await panel.ready;await page(panel,'preferences');
 assert.equal(find(panel.root,'偏好分析结束楼层').value,'5');await click(panel.root,'开始／继续分析用户偏好');assert.deepEqual(f.calls.analyse,[{from:1,to:5,limit:10}]);assert.match(panel.root.textContent,/已分析 3 条用户输入/);
 f.service.analysePreferences=undefined;await click(panel.root,'开始／继续分析用户偏好');assert.match(panel.root.querySelector('[role=alert]').textContent,/尚未接入/);assert.equal(f.calls.analyse.length,1);
 panel.dispose();await f.close();
});

test('latest style check shows real hits and explicitly distinguishes a missing receipt',async()=>{
 const f=fixture(),panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store});await panel.ready;await page(panel,'style');assert.match(panel.root.textContent,/尚无本轮正文检查回执/);
 await page(panel,'settings');f.state.styleAudit={enabled:true,at:'2026-10-13T00:00:00Z',hits:[{name:'测试禁词',text:'测试词',offset:4}]};await page(panel,'style');assert.match(panel.root.textContent,/发现 1 处命中/);assert.match(panel.root.textContent,/测试词/);
 assert.equal(panel.root.querySelector('table').querySelector('td').dataset.label,'规则');assert.equal(panel.root.querySelector('table').className,'tisya-wide-table');panel.dispose();await f.close();
});

test('production configuration retains seven categories and guards dirty drafts before opening tables',async()=>{
 const f=fixture();let closed=0,opened=0;const config=mountConfiguration(f.document,f.document.body,{store:f.store,host:f.host,onTables:()=>{opened++;},getSettings:()=>({联系人分组:{}}),initialTab:'data',onClose:()=>{closed++;}});await config.ready;const root=config.root.shadowRoot;
 assert.equal(find(root,'配置分类').options.length,7);assert.equal(find(root,'表单功能'),null);assert.match(root.textContent,/按已发送的用户／AI 消息逐条计数/);
 const count=find(root,'历史聊天条数（当前输入始终保留）');count.value='1';count.dispatchEvent(new f.window.Event('change'));
 const categories=find(root,'配置分类');categories.value='tables';await categories.onchange();assert.equal(find(root,'表单功能'),null);assert.equal(count.value,'1');assert.equal(opened,0);assert.equal(config.requestLeave().allowed,false);
 await click(root,'返回设置');assert.equal(closed,0);await click(root,'保存配置');assert.equal(f.store.read().world.context.history,1);assert.equal(config.requestLeave().allowed,true);
 categories.value='tables';await categories.onchange();assert.equal(opened,1);assert.equal(find(root,'表单功能'),null);config.dispose();await f.close();
});

test('busy table view can be parked, but destruction is guarded and late completion cannot notify',async()=>{
 const f=fixture();let resolve,saved=0;const original=f.service.readAtlasSnapshot;f.service.readAtlasSnapshot=()=>new Promise(r=>resolve=r);
 const panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store,onSaved:()=>saved++});await panel.ready;const navigating=page(panel,'forms');assert.equal(panel.requestLeave().allowed,false);assert.match(panel.requestLeave().reason,/任务/);assert.equal(panel.requestLeave({preserve:true}).allowed,true);
 panel.dispose();resolve(await original());await navigating;assert.equal(f.document.querySelector('.tisya-tables'),null);assert.equal(saved,0);await f.close();
});

test('resuming a clean configuration refreshes its revision while an edited draft survives conflicts',async()=>{
 const f=fixture(),config=mountConfiguration(f.document,f.document.body,{store:f.store,host:f.host,getSettings:()=>({联系人分组:{}}),initialTab:'data'});await config.ready;const root=config.root.shadowRoot;
 let snap=f.store.read();snap.data.worlds.chat.context.history=8;await f.store.save(snap.data,snap.revision,snap.key);await config.resume();assert.equal(find(root,'历史聊天条数（当前输入始终保留）').value,'8');
 const count=find(root,'历史聊天条数（当前输入始终保留）');count.value='2';count.dispatchEvent(new f.window.Event('change'));snap=f.store.read();snap.data.worlds.chat.context.history=9;await f.store.save(snap.data,snap.revision,snap.key);await config.resume();assert.equal(count.value,'2');
 await click(root,'保存配置');assert.match(root.querySelector('[role=alert]').textContent,/其他页面修改/);assert.equal(count.value,'2');assert.equal(f.store.read().world.context.history,9);await click(root,'放弃修改');await config.settled();assert.equal(find(root,'历史聊天条数（当前输入始终保留）').value,'9');
 config.dispose();await f.close();
});

test('bundle UI keeps explicit selection, edited draft and mapping across page changes',async()=>{
 const f=fixture(),calls=[];const members=f.rows.map((row,i)=>({sourceObject:row.id,name:row.values.名称,traits:[{id:'trait-'+i,name:'性格核心',value:row.values.描述,evidence:row.values.描述}],growth:[]}));
 f.service.previewCoreBundle=async ids=>{calls.push(['preview',ids]);return {objects:f.rows.filter(x=>ids.includes(x.id)),related:[],links:[],growth:[]};};
 f.service.coreBundleDraft=async(ids,options)=>{calls.push(['extract',ids,options]);return {format:'tisya.core-bundle-draft/1',bundle:{name:'双人组',members,links:[]},notes:[]};};
 f.service.saveCoreBundle=async value=>calls.push(['save-core',copy(value)]);
 const core={id:'bundle-one',version:1,format:'tisya.core-bundle/1',name:'双人组'};f.service.listCores=async()=>[core];
 const expectedMapping={members:members.map((m,i)=>({member:m.sourceObject,object:'new:m'+i,items:m.traits.map(item=>({item:item.id,path:['描述'],expression:m.name+'的世界表达'}))})),links:[]};
 f.service.adaptCoreBundle=async(book,id,goal)=>{calls.push(['adapt',book,id,goal]);return {format:'tisya.genesis-draft/2',coreBinding:{book,id,version:1,fingerprint:'retained'},corePreview:{members,links:[]},mappingErrors:[],proposal:{blueprint:{name:'双人世界化',goal:'当前世界',decisions:[],unresolved:[]},checklist:[],artifacts:{registry:copy(f.registry),base:{changes:members.map((m,i)=>({id:'new:m'+i,table:'objects',expected:0,values:{名称:'新'+m.name,类型:'character',描述:m.name+'的世界表达'},access:{readers:['读者'],knowers:[]},evidence:'创建新原点'}))},initial:{changes:[]}},workflow:{id:'flow',name:'适配',version:1,steps:[]},coreMapping:copy(expectedMapping)}};};
 f.service.saveGenesis=async value=>calls.push(['save-genesis',copy(value)]);
 const panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store});await panel.ready;await page(panel,'core');
 input(f.window,find(panel.root,'带入 · 记录甲'),true);input(f.window,find(panel.root,'带入 · 记录乙'),true);input(f.window,find(panel.root,'补充设定与提取要求'),'保留耐心，但两人的表达各不相同。');await click(panel.root,'查看所选对象与关联');await click(panel.root,'生成整组基点草稿');
 input(f.window,find(panel.root,'核心内容'),'用户改过的核心');await page(panel,'style');await page(panel,'core');assert.equal(find(panel.root,'核心内容').value,'用户改过的核心');await click(panel.root,'确认保存整组基点');
 assert.deepEqual(calls[0],['preview',['person-a','person-b']]);assert.equal(calls[1][2].instructions,'保留耐心，但两人的表达各不相同。');assert.equal(calls[2][1].bundle.members[0].traits[0].value,'用户改过的核心');assert.equal(calls[2][1].bundle.members[0].traits[0].id,'trait-0');
 input(f.window,find(panel.root,'核心所在原点书'),'已保存原点');await click(panel.root,'读取此书可用核心');await click(panel.root,'适配 · 双人组');assert.match(panel.root.textContent,/基点意义与世界表达对照/);await page(panel,'style');await page(panel,'core');await click(panel.root,'确认应用创世蓝图');
 const saved=calls.find(x=>x[0]==='save-genesis')[1];assert.deepEqual(saved.proposal.coreMapping,expectedMapping);assert.equal(saved.coreBinding.id,'bundle-one');assert.equal(saved.coreBinding.fingerprint,'retained');panel.dispose();await f.close();
});

test('cached clean atlas refreshes its snapshot after another configuration page saves',async()=>{
 const f=fixture(),read=f.service.readAtlasSnapshot;f.service.readAtlasSnapshot=async()=>{const snapshot=await read(),revision=f.store.read().revision;return {...snapshot,verify:async()=>{if(f.store.read().revision!==revision)throw Error('档案快照配置已变化');}};};
 const panel=mountTablePanel(f.document,f.document.body,{store:f.store,service:f.service,initialPage:'atlas'}),config=mountConfiguration(f.document,f.document.body,{store:f.store,host:f.host,getSettings:()=>({}),initialTab:'data'});
 try{await panel.ready;await config.ready;const root=config.root.shadowRoot,count=find(root,'历史聊天条数（当前输入始终保留）');count.value='7';count.dispatchEvent(new f.window.Event('change'));await click(root,'保存配置');await panel.resume();await click(panel.root,'编辑');assert(!panel.root.querySelector('[role=alert]'),panel.root.querySelector('[role=alert]')?.textContent);assert(find(panel.root,'编辑哪一类'));assert.equal(f.store.read().world.context.history,7);}finally{panel.dispose();config.dispose();await f.close();}
});
