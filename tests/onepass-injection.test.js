import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createHost} from '../config/host.js';
import {onePassEntries,isOnePassPreset} from '../onepass/preset.mjs';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
import {enabledOnePassEntries} from '../onepass/injection.mjs';
import {createTextTransport} from '../config/text-transport.js';
import {contextRecord} from '../config/context-export.js';
const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-One-Pass-1.json',import.meta.url)));
const oldMacros=()=>{const p=structuredClone(preset),entries=onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS);for(const row of p.prompts){const id=row.identifier==='tisya_material_style_card'?'tisya_material_style':row.identifier;if(!row.marker&&Object.hasOwn(entries,id)&&!['chatHistory','chatHistory／当前user'].includes(id))row.content='{{tisya_live_onepass_'+id+'}}';if(row.identifier==='tisya_selected_resources')row.content='{{tisya_config_selected}}';}return p;};
const state='<ONEPASS_STATE>\n{"basis":"current-basis","registry":{"tables":[]},"rows":[]}\n</ONEPASS_STATE>';
function setup({macro=false,owner='native',route='native',transport=null}={}){
 const p=macro?oldMacros():structuredClone(preset),source={identity:'One-Pass-1',prompts:p.prompts,order:p.prompt_order[0].order},data=emptyConfig();
 const c={extensionSettings:{[KEY]:data},chatMetadata:{},chatId:'one',characterId:0,characters:[{avatar:'one.png',name:'测试',description:'普通角色'}],chat:[{is_user:true,mes:'查看桌上的工具。'}],chatCompletionSettings:{model:'fixture'},powerUserSettings:{},substituteParams:s=>s,getChatCompletionModel:s=>s.model,stopGeneration(){},getPresetManager:()=>({getAllPresets:()=>['One-Pass-1'],getSelectedPresetName:()=> 'One-Pass-1'})};
 const key=worldKey(c);data.worlds[key]=defaultWorld();data.worlds[key].context.owner=owner;data.routes.tasks.main={preset:route};
 const store=createStore({getContext:()=>c,persist:async()=>true}),host=createHost({getContext:()=>c,getSource:()=>source,store,getMoods:()=>DEFAULT_MOODS,transport,createParameters:async(s,model,type,messages)=>({generate_data:{model,messages}})});
 const messages=()=>[...enabledOnePassEntries(source).filter(p=>p.content).map(p=>({role:p.role,content:p.content})),{role:'system',content:state},{role:'user',content:'查看桌上的工具。'}];
 return {c,data,key,source,host,world:data.worlds[key],async ready(){await host.before('normal');host.attachTableContext({world:key,onepass:true,text:state,instructions:state,slots:{}});return {model:'fixture',messages:messages()};}};
}
test('download contains complete instructions without a core or selected-material macro dependency',()=>{
 const text=JSON.stringify(preset);assert.doesNotMatch(text,/\{\{tisya_/);assert.match(text,/CREATIVE.GUIDE/);assert.match(text,/ONEPASS.CONTRACT/);assert(isOnePassPreset({prompts:preset.prompts}));
 const old=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url)));const metadata=p=>({...p,prompts:p.prompts.map(({content,...row})=>row)});assert.deepEqual(metadata(preset),metadata(old));
});
test('native requests expand the already-imported macro preset even when the host macro substitution is unavailable',async()=>{
 const f=setup({macro:true}),before=JSON.stringify(f.source);const payload=await f.ready();assert.match(JSON.stringify(payload.messages),/tisya_live_onepass_main/);await f.host.payloadReady(payload);
 const text=JSON.stringify(payload.messages);assert.doesNotMatch(text,/\{\{tisya_/);assert.match(text,/\[ID\]/);assert.match(text,/CREATIVE.GUIDE/);assert.match(text,/ONEPASS.CONTRACT/);assert.equal(f.host.preview().injection.state,'matched');assert.equal(JSON.stringify(f.source),before);
});
test('embedded preset follows current writing controls without overwriting the imported file',async()=>{
 for(const owner of ['native','tisya'])for(const route of ['native',null]){
  const f=setup({owner,route}),before=JSON.stringify(f.source);f.world.modes.narrative.narrative.缇斯亚叙事篇幅区间={下限:1200,上限:1800,单位:'字'};const payload=await f.ready();await f.host.payloadReady(payload);assert.match(JSON.stringify(payload.messages),/min=\\"1200\\" max=\\"1800/);assert.equal(f.host.preview().injection.blocks,11);assert.equal(JSON.stringify(f.source),before);
 }
});
test('user edits, custom order, extra materials and multimodal content remain intact',async()=>{
 const f=setup();const style=f.source.prompts.find(p=>p.identifier==='tisya_material_style_card');style.content+='\nUSER_EDITED_STYLE';f.source.order.reverse();const payload=await f.ready();payload.messages.unshift({role:'system',content:'CARD_MATERIAL_UNCHANGED'},{role:'user',content:[{type:'text',text:'图片'},{type:'image_url',image_url:{url:'data:image/png;base64,test'}}]});const first=structuredClone(payload.messages.slice(0,2));await f.host.payloadReady(payload);assert.deepEqual(payload.messages.slice(0,2),first);assert.match(JSON.stringify(payload.messages),/USER_EDITED_STYLE/);
});
test('missing instructions or wrong table snapshot fail before JSON serialization and cannot be replaced by historical examples',async()=>{
 for(const mode of ['registry','guide','state','unknown-macro']){
  const f=setup(),payload=await f.ready();if(mode==='registry')payload.messages=payload.messages.filter(m=>!m.content.includes('[REGISTRY]'));if(mode==='guide')payload.messages=payload.messages.filter(m=>!m.content.includes('[CREATIVE.GUIDE]'));if(mode==='state')payload.messages=payload.messages.map(m=>({...m,content:m.content.replace('current-basis','old-basis')}));if(mode==='unknown-macro')payload.messages.push({role:'system',content:'{{tisya_live_onepass_unavailable}}'});
  payload.messages.unshift({role:'assistant',content:onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS).tisya_registry});await assert.rejects(f.host.payloadReady(payload),/未发送|未展开/);assert.throws(()=>JSON.stringify(payload));
 }
});
test('turning off structured output removes machine contract while preserving ordinary writing instructions',async()=>{
 const f=setup();f.source.order.find(p=>p.identifier==='tisya_output').enabled=false;const payload=await f.ready();await f.host.payloadReady(payload);assert.doesNotMatch(JSON.stringify(payload.messages),/ONEPASS.CONTRACT/);assert.equal(f.host.preview().injection,undefined);
});
test('request inspection observes exact host-fetch bytes with transport off, preserving the original request and response',async()=>{
 const sent=[],target={location:{origin:'http://tauri.localhost'},fetch:async(input,init)=>{sent.push(init.body);return new Response('unchanged');}},transport=createTextTransport({target,isTauri:()=>true});transport.install();
 try{const f=setup({macro:true,transport}),payload=await f.ready();await f.host.payloadReady(payload);assert.equal(f.host.preview().dispatch,undefined);const bytes=JSON.stringify(payload);const response=await target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:bytes});assert.equal(await response.text(),'unchanged');assert.deepEqual(sent,[bytes]);const snapshot=f.host.preview();assert.equal(snapshot.dispatch.stage,'host-fetch');assert.deepEqual(snapshot.messages,JSON.parse(bytes).messages);assert.equal(snapshot.transport.state,'off');assert.match(contextRecord(snapshot).note,/宿主发送入口/);}
 finally{transport.dispose();}
});

test('late host history cleanup is observed by the exact turn state; lost instructions block dispatch',async()=>{
 const sent=[],target={location:{origin:'http://tauri.localhost'},fetch:async(_input,init)=>{sent.push(init.body);return new Response('ok');}},transport=createTextTransport({target,isTauri:()=>true});transport.install();
 try{
  const f=setup({transport}),payload=await f.ready();await f.host.payloadReady(payload);payload.messages.push({role:'assistant',content:'host-cleaned historical message'});const bytes=JSON.stringify(payload);await target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:bytes});assert.deepEqual(f.host.preview().messages,payload.messages);assert.equal(f.host.preview().dispatch.stage,'host-fetch');
  const g=setup({transport}),bad=await g.ready();await g.host.payloadReady(bad);bad.messages=bad.messages.filter(m=>!m.content.includes('[CREATIVE.GUIDE]'));await assert.rejects(()=>target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(bad)}),/创作指导/);assert.deepEqual(sent,[bytes]);
 }finally{transport.dispose();}
});
