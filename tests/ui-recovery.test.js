import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {defaultRegistry} from '../tables/schema.js';
import {mountConfiguration} from '../config/panel.js';
import {mountTablePanel} from '../tables/panel.js';
import {mountTableApp} from '../tables/app.js';

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
 const service={state:()=>copy(state),inspect:async()=>inspect(),review:async()=>({...inspect(),persona:{id:'u',name:'原用户',description:'原设定'},personaBinding:null,history:copy(history),messageCount:5,storageReady:true}),ensureInitialized:async()=>{},checkStyle:()=>[],clear(){state.busy=false;},edit:async value=>{calls.edits.push(copy(value));},previewUserBinding:async id=>({format:'user-preview',objectId:id,name:'记录甲',description:'原档案设定'}),saveUserBinding:async value=>{calls.bindings.push(copy(value));if(failBinding)throw Error('原生人设回读失败，尚未确认保存');},analysePreferences:async range=>{calls.analyse.push(copy(range));return {processed:3,pending:0};}};
 const host={archives:async()=>[],books:async()=>[],connections:()=>[],presets:()=>[],preview:()=>null};
 return {window,document,store,service,host,state,calls,registry,rows,failBinding(value){failBinding=value;},close:()=>window.happyDOM.abort()};
}

test('standalone table application preserves all original pages and adds checked user binding',async()=>{
 const f=fixture(),app=mountTableApp(f.document,f.document.body,{service:f.service,store:f.store});await app.ready;
 const root=app.root.shadowRoot,picker=find(root,'表单功能');assert.equal(picker.options.length,13);assert.equal(app.kind,'tables');assert.equal(app.keepAlive,true);
 const ids=[...picker.options].map(x=>x.value);for(const id of ['settings','forms','history','identity','genesis','preferences','style','progression','parallel','core','timeline','preview','assistant'])assert(ids.includes(id));
 assert.equal(root.querySelectorAll('nav button').length,0);assert(find(root,'辅助任务进度'));
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
 input(f.window,find(panel.root,'搜索当前表格（名称、别名或内容）'),'旧称甲');assert.equal(panel.root.querySelector('[data-record="person-a"]').hidden,false);assert.equal(panel.root.querySelector('[data-record="person-b"]').hidden,true);
 const row=panel.root.querySelector('[data-record="person-a"]');await click(row,'编辑此表单');input(f.window,find(row,'名称 · 值'),'草稿名称');await page(panel,'identity');await page(panel,'forms');assert.equal(find(panel.root,'名称 · 值').value,'草稿名称');
 await click(panel.root,'放弃此记录修改');assert.equal(find(panel.root,'名称 · 值'),null);assert.equal(f.calls.edits.length,0);assert.equal(panel.requestLeave().allowed,true);
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

test('configuration has five categories and opens tables without saving or discarding its draft',async()=>{
 const f=fixture();let opened=0,closed=0;const config=mountConfiguration(f.document,f.document.body,{store:f.store,host:f.host,getSettings:()=>({联系人分组:{}}),initialTab:'data',onTables:()=>{opened++;},onClose:()=>{closed++;}});await config.ready;const root=config.root.shadowRoot;
 assert.equal(find(root,'配置分类').options.length,5);assert.equal(find(root,'表单功能'),null);assert.match(root.textContent,/按已发送的用户／AI 消息逐条计数/);assert.match(root.textContent,/当前用户输入另算/);
 const count=find(root,'历史聊天条数（当前输入始终保留）');count.value='1';count.dispatchEvent(new f.window.Event('change'));await click(root,'打开表单推进');assert.equal(opened,1);assert.equal(find(root,'历史聊天条数（当前输入始终保留）').value,'1');assert.equal(config.requestLeave({preserve:true}).allowed,true);assert.equal(config.requestLeave().allowed,false);
 await click(root,'完成');assert.equal(closed,1);await click(root,'保存配置');assert.equal(f.store.read().world.context.history,1);assert.equal(config.requestLeave().allowed,true);config.dispose();await f.close();
});

test('busy table view can be parked, but destruction is guarded and late completion cannot notify',async()=>{
 const f=fixture();let resolve,saved=0;const original=f.service.inspect;f.service.inspect=()=>new Promise(r=>resolve=r);
 const panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store,onSaved:()=>saved++});await panel.ready;const navigating=page(panel,'forms');assert.equal(panel.requestLeave().allowed,false);assert.match(panel.requestLeave().reason,/任务/);assert.equal(panel.requestLeave({preserve:true}).allowed,true);
 panel.dispose();resolve(await original());await navigating;assert.equal(f.document.querySelector('.tisya-tables'),null);assert.equal(saved,0);await f.close();
});
