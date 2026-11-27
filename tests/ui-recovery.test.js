import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {defaultRegistry} from '../tables/schema.js';
import {mountConfiguration} from './legacy-fixtures/config-panel.js';
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
 const inspect=()=>({registry:copy(registry),rows:copy(rows),archived:0,sourceCount:2,anchors:[],preferenceDrafts:[],drafts:[],memory:{},settings:copy(data.worlds.chat.tables??{}),origin:{revision:0,bases:[],timelineAnchors:[]},session:{pins:[],commits:[]}});
 const service={readAtlasSnapshot:async()=>({data:{live:true,world:'测试世界',branch:'当前存档',registry:copy(registry),rows:copy(rows),originRows:[],savedRows:[],trace:[],cores:[],saves:[],revision:1},verify:async()=>{}}),listConditionRules:async()=>({revision:0,rules:[],objects:[],fields:[]}),stateCatalog:async()=>({catalog:null,originRevision:0}),readFoundationDrafts:async()=>[],assistant:{catalog:()=>({tasks:[]})},state:()=>copy(state),inspect:async()=>inspect(),review:async()=>({...inspect(),persona:{id:'u',name:'原用户',description:'原设定'},personaBinding:null,history:copy(history),messageCount:5,storageReady:true}),ensureInitialized:async()=>{},checkStyle:()=>[],clear(){state.busy=false;},edit:async value=>{calls.edits.push(copy(value));},previewUserBinding:async id=>({format:'user-preview',objectId:id,name:'记录甲',description:'原档案设定'}),saveUserBinding:async value=>{calls.bindings.push(copy(value));if(failBinding)throw Error('原生人设回读失败，尚未确认保存');},analysePreferences:async range=>{calls.analyse.push(copy(range));return {processed:3,pending:0};}};
 service.matrixFoundation={inspect:service.review,discard(){}};
 const host={archives:async()=>[],books:async()=>[],connections:()=>[],presets:()=>[],preview:()=>null};
 return {window,document,store,service,host,state,calls,registry,rows,failBinding(value){failBinding=value;},close:()=>window.happyDOM.abort()};
}

test('standalone table application exposes only current Matrix pages and preserves utility behavior',async()=>{
 const {mountTableApp}=await import('../tables/app.js');const f=fixture(),app=mountTableApp(f.document,f.document.body,{service:f.service,store:f.store});await app.ready;
 const root=app.root.shadowRoot,picker=find(root,'表单功能');assert([...picker.options].some(o=>o.value==='foundation'));assert([...picker.options].some(o=>o.value==='history'));assert.equal(app.kind,'tables');assert.equal(app.keepAlive,true);
 const ids=[...picker.options].map(x=>x.value);assert.deepEqual(ids,['atlas','foundation','conditions','history','genesis','style','preview','assistant']);
 for(const retired of ['settings','forms','identity','preferences','progression','parallel','core','timeline'])assert(!ids.includes(retired));
 assert.equal(root.querySelectorAll('nav button').length,0);assert(find(root,'辅助任务进度'));assert(find(root,'任务阶段（不是模型完成百分比）'));
 for(const id of ids.filter(id=>id!=='genesis')){picker.value=id;await picker.onchange();assert.equal(picker.value,id);assert.equal(root.querySelector('[role=alert]'),null,'page '+id+' should render: '+(root.querySelector('[role=alert]')?.textContent??''));}
 app.dispose();await f.close();
});

test('atlas opens as a full independent view and returns to the previous form page',async()=>{
 const {mountTableApp}=await import('../tables/app.js'),f=fixture(),app=mountTableApp(f.document,f.document.body,{service:f.service,store:f.store,initialPage:'atlas'});try{
  await app.ready;const root=app.root.shadowRoot,host=[...root.querySelectorAll('div')].find(node=>node.shadowRoot),atlas=host?.shadowRoot.querySelector('#app');
  assert.equal(root.querySelector('header').hidden,true);assert.equal(root.querySelector('.note').hidden,true);assert.equal(find(root,'表单功能').closest('nav').hidden,true);assert.equal(app.root.dataset.view,'atlas');
  assert(atlas);assert(!atlas.textContent.includes('刷新最新版'));assert(!atlas.textContent.includes('填写当前表单'));assert(!atlas.textContent.includes('表单推进'));
  [...atlas.querySelectorAll('button')].find(node=>node.textContent==='返回表单').click();await new Promise(resolve=>setTimeout(resolve,0));await app.settled();
  assert.equal(app.root.dataset.view,'form');assert.equal(root.querySelector('header').hidden,false);assert.equal(find(root,'表单功能').closest('nav').hidden,false);assert.equal(find(root,'表单功能').value,'history');
 }finally{app.dispose();await f.close();}
});

test('current style drafts survive page switching, parking and explicit discard',async()=>{
 const f=fixture(),panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store});await panel.ready;
 await page(panel,'style');input(f.window,find(panel.root,'启用禁词与防套话约束'),false);await page(panel,'preview');await page(panel,'style');assert.equal(find(panel.root,'启用禁词与防套话约束').checked,false);
 assert.equal(panel.requestLeave().allowed,false);assert.match(panel.requestLeave().reason,/草稿/);assert.equal(panel.requestLeave({preserve:true}).allowed,true);
 await click(panel.root,'放弃当前未保存修改');assert.equal(find(panel.root,'启用禁词与防套话约束').checked,true);assert.equal(panel.requestLeave().allowed,true);
 panel.dispose();await f.close();
});

test('latest style check shows real hits and explicitly distinguishes a missing receipt',async()=>{
 const f=fixture(),panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store});await panel.ready;await page(panel,'style');assert.match(panel.root.textContent,/尚无本轮正文检查回执/);
 await page(panel,'preview');f.state.styleAudit={enabled:true,at:'2026-10-13T00:00:00Z',hits:[{name:'测试禁词',text:'测试词',offset:4}]};await page(panel,'style');assert.match(panel.root.textContent,/发现 1 处命中/);assert.match(panel.root.textContent,/测试词/);
 assert.equal(panel.root.querySelector('table').querySelector('td').dataset.label,'规则');assert.equal(panel.root.querySelector('table').className,'tisya-wide-table');panel.dispose();await f.close();
});

test('production configuration retains seven categories and guards dirty drafts before opening tables',async()=>{
 const f=fixture();let closed=0;const config=mountConfiguration(f.document,f.document.body,{store:f.store,host:f.host,tableService:f.service,getSettings:()=>({联系人分组:{}}),initialTab:'data',onClose:()=>{closed++;}});await config.ready;const root=config.root.shadowRoot;
 assert.equal(find(root,'配置分类').options.length,7);assert.equal(find(root,'表单功能'),null);assert.match(root.textContent,/按已发送的用户／AI 消息逐条计数/);
 const count=find(root,'历史聊天条数（当前输入始终保留）');count.value='1';count.dispatchEvent(new f.window.Event('change'));
 const categories=find(root,'配置分类');categories.value='tables';await categories.onchange();assert.equal(find(root,'表单功能'),null);assert.equal(count.value,'1');assert.equal(config.requestLeave().allowed,false);
 await click(root,'返回设置');assert.equal(closed,0);await click(root,'保存配置');assert.equal(f.store.read().world.context.history,1);assert.equal(config.requestLeave().allowed,true);
 categories.value='tables';await categories.onchange();assert(find(root,'表单功能'));config.dispose();await f.close();
});

test('busy table view can be parked, but destruction is guarded and late completion cannot notify',async()=>{
 const f=fixture();let resolve,saved=0;const original=f.service.matrixFoundation.inspect;f.service.matrixFoundation.inspect=()=>new Promise(r=>resolve=r);
 const panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store,onSaved:()=>saved++});const navigating=panel.ready;assert.equal(panel.requestLeave().allowed,false);assert.match(panel.requestLeave().reason,/任务/);assert.equal(panel.requestLeave({preserve:true}).allowed,true);
 panel.dispose();resolve(await original());await navigating;assert.equal(f.document.querySelector('.tisya-tables'),null);assert.equal(saved,0);await f.close();
});

test('resuming a clean configuration refreshes its revision while an edited draft survives conflicts',async()=>{
 const f=fixture(),config=mountConfiguration(f.document,f.document.body,{store:f.store,host:f.host,getSettings:()=>({联系人分组:{}}),initialTab:'data'});await config.ready;const root=config.root.shadowRoot;
 let snap=f.store.read();snap.data.worlds.chat.context.history=8;await f.store.save(snap.data,snap.revision,snap.key);await config.resume();assert.equal(find(root,'历史聊天条数（当前输入始终保留）').value,'8');
 const count=find(root,'历史聊天条数（当前输入始终保留）');count.value='2';count.dispatchEvent(new f.window.Event('change'));snap=f.store.read();snap.data.worlds.chat.context.history=9;await f.store.save(snap.data,snap.revision,snap.key);await config.resume();assert.equal(count.value,'2');
 await click(root,'保存配置');assert.match(root.querySelector('[role=alert]').textContent,/其他页面修改/);assert.equal(count.value,'2');assert.equal(f.store.read().world.context.history,9);await click(root,'放弃修改');await config.settled();assert.equal(find(root,'历史聊天条数（当前输入始终保留）').value,'9');
 config.dispose();await f.close();
});

test('formal atlas panel loads authorized bound media and keeps archive readable when media refresh fails',async()=>{
 const f=fixture();let requested=0,managed=0;
 f.service.mediaAtlas={request:async()=>{requested++;},view:()=>({targets:[{entity:'person-a',table:'',group:'人物',label:'记录甲',archive_entry_ref:'origin-a'}],rows:[{id:'avatar',entity_ref:'person-a',archive_entry_ref:'origin-a',url:'blob:avatar',purpose:'头像',display_variant:'',binding_scope_label:'全局',applicable:true}]})};
 const panel=mountTablePanel(f.document,f.document.body,{service:f.service,store:f.store,initialPage:'atlas',onMediaManage:()=>managed++});await panel.ready;
 const host=[...panel.root.querySelectorAll('div')].find(node=>node.shadowRoot),app=host.shadowRoot.querySelector('#app');assert(requested>0);assert.equal(app.querySelector('.archive-card-image').alt,'记录甲的头像');
 const flush=()=>new Promise(resolve=>setTimeout(resolve,0));app.querySelector('[aria-label="打开记录甲"]').click();await flush();[...app.querySelectorAll('button')].find(node=>node.textContent==='影像').click();await flush();assert.equal(app.querySelectorAll('.atlas-gallery-image').length,1);
 [...app.querySelectorAll('button')].find(node=>node.textContent==='管理影像绑定').click();await flush();assert.equal(managed,1);panel.dispose();
 const offline=fixture();offline.service.mediaAtlas={request:async()=>{throw Error('媒体库暂不可用');},view:()=>({targets:[],rows:[]})};const fallback=mountTablePanel(offline.document,offline.document.body,{service:offline.service,store:offline.store,initialPage:'atlas'});await fallback.ready;
 const fallbackApp=[...fallback.root.querySelectorAll('div')].find(node=>node.shadowRoot).shadowRoot.querySelector('#app');assert.equal(fallbackApp.querySelectorAll('.archive-card').length,2);assert.match(fallback.root.textContent,/影像绑定暂未刷新/);assert.equal(fallback.root.querySelector('[role=alert]'),null);
 fallback.dispose();await f.close();await offline.close();
});
