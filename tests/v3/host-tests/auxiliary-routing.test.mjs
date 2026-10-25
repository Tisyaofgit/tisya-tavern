import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createHost} from '../../../config/host.js';
import {createStore,emptyConfig,defaultWorld,worldKey,KEY} from '../../../config/core.js';
import {mountConfiguration} from '../../../config/panel.js';
import {createRuntimePreset,assembleRuntimePreset,defaultPresetMessages} from '../../../v3/preset-template.mjs';
import {createNativeRequests} from '../../../v3/host-network.mjs';
import {createTextTransport} from '../../../config/text-transport.js';

async function fixture(options={}){
 const data=emptyConfig(),bank={Tisya:createRuntimePreset('writer'),'My auxiliary':createRuntimePreset('preflight')};
 bank['My auxiliary'].prompts.find(p=>p.identifier==='main').content='USER_EDITED_AUXILIARY';bank['My auxiliary'].temperature=.23;
 const ctx={chatId:'routing',characterId:0,characters:[{avatar:'test.png',name:'test'}],chatMetadata:{},chat:[],extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'native-model',chat_completion_source:'openai'},getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({})};
 const key=worldKey(ctx);data.worlds[key]=defaultWorld();const manager={getAllPresets:()=>Object.keys(bank),getCompletionPresetByName:n=>bank[n],getSelectedPresetName:()=> 'Unrelated host preset',savePreset:async()=>{},selectPreset:async()=>{},findPreset:n=>n};ctx.getPresetManager=()=>manager;
 const store=createStore({getContext:()=>ctx,persist:async()=>true});const host=createHost({...options,getContext:()=>ctx,store,getSource:()=>bank.Tisya});await host.ensureRuntimePresets();return {ctx,key,data,bank,store,host};
}
test('selected full auxiliary owns edited rules and parameters, independent of main and other auxiliary tasks',async()=>{
 const f=await fixture();f.data.routes.tasks.tableArchive={preset:'My auxiliary',model:'aux-model'};const preset=f.host.runtimePresetFor('preflight');assert.equal(preset.prompts.find(p=>p.identifier==='main').content,'USER_EDITED_AUXILIARY');const route=f.host.resolveConnectionFor('tableArchive');assert.equal(route.model,'aux-model');assert.equal(route.settings.temp_openai,.23);assert.notEqual(f.host.runtimePresetFor('writer').prompts.find(p=>p.identifier==='main').content,'USER_EDITED_AUXILIARY');assert.notEqual(f.host.runtimePresetFor('preferences').prompts.find(p=>p.identifier==='main').content,'USER_EDITED_AUXILIARY');assert.equal(f.host.taskPreset('tableArchive').name,preset.name);assert.deepEqual(f.host.auxiliaryPresets(),['My auxiliary']);
 f.bank['My auxiliary'].prompts.find(p=>p.identifier==='main').content='SECOND_EDIT';assert.equal(f.host.runtimePresetFor('preflight').prompts.find(p=>p.identifier==='main').content,'SECOND_EDIT');
});
test('missing selected auxiliary and missing output protocol fail before a model is called',async()=>{
 const f=await fixture();f.data.routes.tasks.tableArchive={preset:'missing'};assert.throws(()=>f.host.runtimePresetFor('preflight'),/不存在/);f.data.routes.tasks.tableArchive.preset='My auxiliary';f.bank['My auxiliary'].prompt_order[0].order.find(x=>x.identifier==='tisya_think_commit').enabled=false;assert.throws(()=>f.host.resolveConnectionFor('tableArchive'),/任务协议/);
});
test('full auxiliary export preserves required registry, wire protocol, dynamic preferences and archive reads',()=>{
 const p=createRuntimePreset('preflight'),messages=defaultPresetMessages('preflight');messages.find(m=>m.identifier==='tisya_material_rule_material').content='LIVE_PREFERENCES';const out=assembleRuntimePreset('preflight',p,messages),text=out.map(m=>m.content).join('\n');assert.match(text,/LIVE_PREFERENCES/);for(const key of ['list_archive','describe_fields','search_archive','read_archive','archiveRequests','preferenceCandidates','requestKey','【结果】'])assert(text.includes(key),key);assert(!text.includes('{{tisya_v3:'));
});
test('production V3 settings save and reopen independent auxiliary preset, model, transport and switch',async t=>{
 const f=await fixture(),win=new Window(),box=win.document.createElement('div');win.document.body.append(box);let ui; t.after(async()=>{ui?.dispose();await win.happyDOM.abort();});const options={store:f.store,host:f.host,runtimeV3:true,initialTab:'api',getSettings:()=>({})};ui=mountConfiguration(win.document,box,options);await ui.ready;let root=ui.root.shadowRoot;
 const select=[...root.querySelectorAll('select')].find(n=>n.getAttribute('aria-label')==='任务 · 表单 · 记忆归档 预设');assert(select,'auxiliary preset is selectable');select.value=JSON.stringify('My auxiliary');select.dispatchEvent(new win.Event('change'));
 const model=root.querySelector('[aria-label="任务 · 表单 · 记忆归档 模型"]');model.value='chosen-aux-model';model.dispatchEvent(new win.Event('change'));
 const transport=root.querySelector('[aria-label="任务 · 表单 · 记忆归档 抗截断传输"]');transport.value=JSON.stringify('off');transport.dispatchEvent(new win.Event('change'));
 const toggle=root.querySelector('[aria-label="自动辅助 API（默认关闭）"]');assert.equal(toggle.checked,false);toggle.checked=true;toggle.dispatchEvent(new win.Event('change'));
 [...root.querySelectorAll('button')].find(n=>n.textContent==='保存配置').click();await ui.settled();assert.equal(f.store.read().data.routes.tasks.tableArchive.preset,'My auxiliary');ui.dispose();ui=mountConfiguration(win.document,box,options);await ui.ready;root=ui.root.shadowRoot;assert.equal(root.querySelector('[aria-label="任务 · 表单 · 记忆归档 模型"]').value,'chosen-aux-model');assert.equal(root.querySelector('[aria-label="自动辅助 API（默认关闭）"]').checked,true);
});
test('writer SAFETY is labelled as writer, while malformed data and tool finishes are distinct failures',async()=>{
 for(const [body,code]of [[{choices:[{delta:{},finish_reason:'SAFETY'}]},'TISYA_RESPONSE_FILTERED'],[{choices:[{delta:{tool_calls:[{}]},finish_reason:'tool_calls'}]},'TISYA_RESPONSE_FINISH'],['broken-json','TISYA_RESPONSE_PROTOCOL']]){
  const request=createNativeRequests({getContext:()=>({getRequestHeaders:()=>({})}),resolveConnection:async()=>({settings:{},model:'model'}),guard:()=>{},signal:()=>null,native:{openai:{createGenerationParameters:async(s,m,t,messages)=>({generate_data:{messages}})},fetch:async()=>new Response('data: '+(typeof body==='string'?body:JSON.stringify(body))+'\n\n',{headers:{'content-type':'text/event-stream'}})}});
  await assert.rejects(request('writer',[{role:'user',content:'hello'}],'failure'),e=>e.code===code&&e.message.includes('正文 API')&&!e.message.includes('辅助 API'));
 }
});
test('native request preparation sees final stage and cannot silently rewrite content before it',async()=>{
 let prepared=0,sends=0;const request=createNativeRequests({getContext:()=>({getRequestHeaders:()=>({})}),resolveConnection:async()=>({settings:{},model:'model'}),guard:()=>{},signal:()=>null,prepareRequest:async()=>{prepared++;},native:{openai:{createGenerationParameters:async()=>({generate_data:{messages:[{role:'user',content:'rewritten'}]}})},fetch:async()=>{sends++;}}});await assert.rejects(request('preflight',[{role:'user',content:'original'}],'rewrite'),{code:'V3_REQUEST_REWRITE'});assert.equal(prepared,0);assert.equal(sends,0);
});
test('V3 transport switch reaches one actual fetch, restores tool text, and records stage with tools',async()=>{
 for(const wrapper of ['off','direct','outer','bypass']){const enabled=wrapper!=='off';
  const sent=[],evt=x=>'data: '+JSON.stringify(x)+'\n\n',answer='完整正文🙂';const target={location:{origin:'http://tauri.localhost'},__TAURITAVERN__:{},fetch:async(_,init)=>{const p=JSON.parse(init.body);sent.push(p);const tool=p.tools?.at(-1)?.function?.name;const delta=tool?{tool_calls:[{index:0,id:'delivery',type:'function',function:{name:tool,arguments:JSON.stringify({content:answer})}}]}:{content:answer};return new Response(evt({choices:[{index:0,delta,finish_reason:null}]})+evt({choices:[{index:0,delta:{},finish_reason:tool?'tool_calls':'stop'}]})+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}};
  const transport=createTextTransport({target});transport.install();if(wrapper==='outer'){const inner=target.fetch;target.fetch=async(...args)=>inner(...args);}if(wrapper==='bypass')target.fetch=async()=>new Response(evt({choices:[{index:0,delta:{content:answer},finish_reason:'stop'}]})+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});try{const f=await fixture({transport});f.data.routes.tasks.tableArchive={transport:enabled?'universal':'off'};const request=createNativeRequests({getContext:()=>f.ctx,resolveConnection:()=>f.host.resolveConnectionFor('tableArchive'),prepareRequest:(...a)=>f.host.prepareRuntimeRequest(...a),guard:()=>{},signal:()=>null,native:{openai:{createGenerationParameters:async(s,m,type,messages,options)=>{assert.equal(options.allowToolCalls,false);return {generate_data:{messages,model:m,chat_completion_source:'openai'}};}},fetch:(...a)=>target.fetch(...a)}});if(wrapper==='bypass'){await assert.rejects(request('preflight',[{role:'user',content:'neutral'}],'transport'),{code:'TISYA_TRANSPORT_NOT_OBSERVED'});assert.equal(sent.length,0);continue;}assert.equal(await request('preflight',[{role:'user',content:'neutral'}],'transport'),answer);assert.equal(sent.length,1);assert.equal(!!sent[0].tools?.length,enabled);assert.equal(f.host.preview().task,'preflight');assert.equal(f.host.preview().transport.mode,enabled?'universal':'off');if(enabled)assert.equal(transport.status().state,'complete');}finally{transport.dispose();}
 }
});
test('actual A receives query parameter schemas and B receives results from the bound archive query',async t=>{
 const {createInstallerHarness,sheet,wrap,newBody,xml}=await import('./installer-harness.mjs');const {parseSimpleSheet,formatSimpleSheet}=await import('../../../tables/simple-sheet.js');let sawReceipt=false;
 const f=await createInstallerHarness({mvu:false,provider:({stage,messages})=>{if(stage==='a'){const state=xml(messages,'TISYA.DATA.STATE');assert.equal(state.queryCatalog.length,4);const read=state.queryCatalog.find(x=>x.method==='read_archive');assert.deepEqual(read.parameters.required,['id']);assert.equal(read.parameters.properties.source.type,'boolean');assert.equal(read.parameters.additionalProperties,false);const value=parseSimpleSheet(sheet(messages));value.archiveRequests=[{method:'list_archive',arguments:{path:'/',depth:1,limit:2},purpose:'Inspect the authorized archive catalogue'}];return formatSimpleSheet(value);}const text=messages.map(m=>m.content).join('\n');assert.match(text,/list_archive/);assert.match(text,/Inspect the authorized archive catalogue/);sawReceipt=true;return wrap(newBody);}});t.after(()=>f.api.dispose());await f.intercept('normal');assert.deepEqual(f.errors,[]);assert.equal(sawReceipt,true);assert.equal(f.requests.length,2);
});
