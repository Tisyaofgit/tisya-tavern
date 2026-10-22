import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
import {formUI} from '../tables/form-ui.js';
import {mountTablePanel} from '../tables/panel.js';
import {defaultRegistry,validateRow,registryIndex} from '../tables/schema.js';
import {emptyConfig,defaultWorld,registry,resolveRoute} from '../config/core.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {parseJSONResponse} from '../tables/ledger.js';
import {BUILTIN_STYLE_RULES,styleRules,scanStyle} from '../tables/style-rules.js';
const source=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url)));
const find=(root,label)=>[...root.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===label);
const click=(root,text)=>{const b=[...root.querySelectorAll('button')].find(n=>n.textContent===text);if(b){b.click();return;}const select=root.querySelector('[aria-label="表单功能"]'),option=[...select.options].find(o=>o.textContent===text);assert(option,text);select.value=option.value;select.onchange();};
const set=(window,node,value)=>{assert(node);node.value=value;node.dispatchEvent(new window.Event('input'));};
test('settings and every textarea use the browser read-only type descriptor safely',async()=>{
 const window=new Window();Object.defineProperty(window.HTMLTextAreaElement.prototype,'type',{configurable:true,get(){return 'textarea';}});
 const document=window.document,d=emptyConfig(),w=defaultWorld();d.worlds.test=w;let stored;
 const store={read:()=>({data:d,world:w,key:'test',revision:'v1'}),save:async data=>{stored=data;}},service={state:()=>({jobs:[]}),checkStyle:()=>[]};const panel=mountTablePanel(document,document.body,{service,store});await panel.ready;assert.equal(document.querySelector('[role=alert]'),null);
 click(panel.root,'禁词与文风');await new Promise(r=>setTimeout(r,0));assert.equal(document.querySelector('[role=alert]'),null);assert(document.querySelectorAll('textarea').length>=15);click(panel.root,'保存规则');await new Promise(r=>setTimeout(r,0));assert.equal(stored.worlds.test.tables.styleRules.length,15);panel.dispose();window.happyDOM.abort();
});
test('typed editor retains zero false and null while supporting reference/list and nested value editing',()=>{
 const window=new Window(),document=window.document,ui=formUI(document),registry=defaultRegistry(),parent=document.body;
 const rows=[{id:'gate',values:{名称:'北门'}}];const table=registry.tables.find(t=>t.id==='state'),before={名称:'门状态',对象:'gate',字段:'旗标',值:false};const read=ui.row(parent,table,before,{registry,rows,access:{readers:['读者'],knowers:['甲']}});assert.deepEqual(read().values,{});set(window,find(parent,'值 · 数据类型'),'number');set(window,find(parent,'值 · 内容 · 值'),'0');assert.equal(read().values.值,0);set(window,find(parent,'值 · 填写状态'),'null');assert.equal(read().values.值,null);assert.equal(read().access.knowers[0],'甲');assert.equal(find(parent,'对象 · 值').selectedOptions[0].textContent,'北门');
 const list=document.createElement('section');parent.append(list);const readList=ui.value(list,'标签',{type:'texts'},['初值']);click(list,'添加条目');const inputs=[...list.querySelectorAll('input')];set(window,inputs.at(-1),'后续');assert.deepEqual(readList(),['初值','后续']);window.happyDOM.abort();
});
test('visual registry creates a table and fields without JSON editing; same names are rejected',()=>{
 const window=new Window(),document=window.document,ui=formUI(document),registry=defaultRegistry(),read=ui.registryEditor(document.body,registry);click(document.body,'新建表格');const last=document.body.querySelector('[data-editor-page="新表"]');set(window,find(last,'稳定 ID'),'weather');set(window,find(last,'名称'),'气象');click(last,'新增字段');const field=document.body.querySelector('[data-editor-page="新字段"]');set(window,find(field,'字段名称'),'温度');set(window,find(field,'字段类型'),'number');const result=read();registryIndex(result);assert.equal(result.tables.at(-1).fields.温度.type,'number');assert.equal(result.tables.at(-1).owner,'archive');set(window,find(last,'名称'),'常量档案');assert.throws(()=>registryIndex(read()),/同义名称/);window.happyDOM.abort();
});
test('every auxiliary request keeps identity and unique slots without narrative wrappers or mood dependencies',()=>{
 const cfg={data:emptyConfig(),world:defaultWorld()},moods=[];let identity;
 for(const task of ['tableArchive','plotAdvance','preferenceAnalysis','tableGenesis','objectArchive','historyImport']){
  const built=pairedPreset({task,source,configuration:cfg,context:{},moods});identity??=built.entries.tisya_identity_attestation;assert.equal(built.entries.tisya_identity_attestation,identity);assert.match(built.entries.tisya_inner_chain,/完整.*简表/);assert.doesNotMatch(built.entries.tisya_inner_chain,/首尾心声|mood|\[P\.1\]|<reply>|<body>/);
  const input={archiveSource:{text:'ARCHIVE_SOURCE'},userInput:'USER_INPUT',registry:{tables:[],types:[]},currentRows:[],toolInstructions:'TOOL_DEFINITION',toolCalls:[{id:'c1',args:'TOOL_ARGUMENT'}],toolResults:[{id:'c1',content:'TOOL_RECEIPT'}]},messages=taskMessages({preset:built,task,input}),text=messages.map(m=>m.content).join('\n');for(const value of ['TOOL_DEFINITION','TOOL_ARGUMENT','TOOL_RECEIPT'])assert.equal(text.split(value).length-1,1);assert.equal(text.split(task==='preferenceAnalysis'?'USER_INPUT':'ARCHIVE_SOURCE').length-1,1);assert.doesNotMatch(text,/<reply>|<body>|<extra>|<tisya_result>|心声：|首尾各/);assert(!text.includes('{{tisya_live_'));
 }
 assert.equal(cfg.world.mode,'narrative');assert(source.prompts.find(p=>p.identifier==='tisya_current_input').enabled===false);
});
test('machine output is parsed only from registered extra component and XML decoded once',()=>{
 const json={changes:[],templates:[],note:'a<b & c'};assert.deepEqual(parseJSONResponse(JSON.stringify(json)),json);const encoded=JSON.stringify(json).replaceAll('&','&amp;').replaceAll('<','&lt;');assert.deepEqual(parseJSONResponse('<reply><body>报告</body><extra><tisya_result>'+encoded+'</tisya_result></extra><vars/></reply>'),json);assert.throws(()=>parseJSONResponse('<reply><vars>'+encoded+'</vars></reply>'),/extra/);assert.throws(()=>parseJSONResponse('<reply><extra><tisya_result>{}</tisya_result><tisya_result>{}</tisya_result></extra></reply>'),/唯一/);
});
test('legacy routes resolve to one canonical task while keeping explicitly configured connections',()=>{
 const d=emptyConfig(),w=defaultWorld();d.routes.tasks.memory={connection:'profile:old',model:'OLD'};assert.equal(resolveRoute(d,w,'tableArchive').connection,'profile:old');assert.equal(resolveRoute(d,w,'memory').preset,'tisya:tableArchive');assert.equal(registry.tasks.get('genesis').aliasOf,'tableGenesis');
});
test('built-in style rules are editable and report actual matches rather than rewriting text',()=>{
 const text='嘴角勾起一抹笑。他的心湖泛起涟漪。';const rules=styleRules({});assert.equal(rules.length,15);assert.equal(rules.find(r=>r.id==='builtin.phrase.8').pattern,'生理性');assert.equal(rules.find(r=>r.id==='builtin.phrase.9').pattern,'极其');const hits=scanStyle(text,rules);assert(hits.some(h=>h.text==='嘴角勾起一抹'));assert(hits.some(h=>h.name==='水体意象解释情绪'));assert.equal(scanStyle(text,rules.map(r=>({...r,enabled:false}))).length,0);assert.throws(()=>styleRules({styleRules:[{id:'bad',name:'坏规则',kind:'regex',pattern:'[',flags:'u',enabled:true}]}),/正则无效/);assert.equal(BUILTIN_STYLE_RULES[0].enabled,true);
});
