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
function setup({macro=false,owner='native',route='native',transport=null,moods=()=>DEFAULT_MOODS,formState=state}={}){
 const p=macro?oldMacros():structuredClone(preset),source={identity:'One-Pass-1',prompts:p.prompts,order:p.prompt_order[0].order},data=emptyConfig();
 const c={extensionSettings:{[KEY]:data},chatMetadata:{},chatId:'one',characterId:0,characters:[{avatar:'one.png',name:'测试',description:'普通角色'}],chat:[{is_user:true,mes:'查看桌上的工具。'}],chatCompletionSettings:{model:'fixture'},powerUserSettings:{},substituteParams:s=>s,getChatCompletionModel:s=>s.model,stopGeneration(){},getPresetManager:()=>({getAllPresets:()=>['One-Pass-1'],getSelectedPresetName:()=> 'One-Pass-1'})};
 const key=worldKey(c);data.worlds[key]=defaultWorld();data.worlds[key].context.owner=owner;data.routes.tasks.main={preset:route};
 const store=createStore({getContext:()=>c,persist:async()=>true}),host=createHost({getContext:()=>c,getSource:()=>source,store,getMoods:moods,transport,createParameters:async(s,model,type,messages)=>({generate_data:{model,messages}})});
 const messages=()=>[...enabledOnePassEntries(source).filter(p=>p.content).map(p=>({role:p.role,content:p.content})),{role:'system',content:formState},{role:'user',content:'查看桌上的工具。'}];
 return {c,data,key,source,host,world:data.worlds[key],async ready(){await host.before('normal');host.attachTableContext({world:key,onepass:true,text:formState,instructions:formState,slots:{}});return {model:'fixture',messages:messages()};}};
}
test('W70 layered forms reach native and controlled final send payloads once, with a guard against losing their reading contract',async()=>{
 const {FORM_CONTEXT_GUIDE}=await import('../onepass/context.mjs');
 const forms=['WORLD_FORM_CANARY','GLOBAL_FORM_CANARY','OBJECT_FORM_CANARY','HISTORY_FORM_CANARY'];
 const formState=state.replace('"rows":[]','"rows":'+JSON.stringify(forms.map((name,i)=>({id:'row'+i,rev:1,values:{名称:name}}))));
 for(const owner of ['native','tisya'])for(const history of [0,1]){
  const f=setup({owner,formState:FORM_CONTEXT_GUIDE+'\n'+formState});f.world.context.history=history;f.c.chat.unshift({is_user:false,mes:'旧故事文本'});const payload=await f.ready();await f.host.payloadReady(payload);
  const text=payload.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');assert.equal(text.split(FORM_CONTEXT_GUIDE).length-1,1);assert.equal(text.split('<ONEPASS_STATE>').length-1,1);assert.equal(f.host.preview().injection.state,'matched');
  for(const name of forms)assert.equal(text.split(name).length-1,1,owner+' history='+history+' '+name);
 }
 const f=setup({formState:FORM_CONTEXT_GUIDE+'\n'+state}),payload=await f.ready();for(const m of payload.messages)if(typeof m.content==='string')m.content=m.content.replace(FORM_CONTEXT_GUIDE,'');
 await assert.rejects(f.host.payloadReady(payload),/分层表单资料说明/);
});
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

test('all preference categories reach the actual native and controlled requests without changing skeleton or preset',async()=>{
 for(const owner of ['native','tisya']){
  const f=setup({owner}),m=f.world.modes.narrative,before=JSON.stringify(f.source);
  Object.assign(m,{角色主动性:'主动推进',用户口癖保留:true,用户叙事口吻延续:true,heartDirections:['输入评价','剧情吐槽'],workflowDetail:'compact',角色对白:{启用:true,来源:'指定语言',语言:'English'}});
  Object.assign(m.narrative,{缇斯亚叙事玩家代写:'不代写',缇斯亚叙事人称:'第二',缇斯亚叙事基调:'诙谐',缇斯亚叙事描写重心:['对白'],缇斯亚叙事篇幅区间:{下限:1000,上限:1600,单位:'字'}});
  const payload=await f.ready();await f.host.payloadReady(payload);const text=payload.messages.filter(x=>x.role==='system').map(x=>typeof x.content==='string'?x.content:'').join('\n'),pref=/<UserPreferences>([\s\S]*?)<\/UserPreferences>/.exec(text)?.[1];assert.ok(pref,owner);
  for(const phrase of ['Narrative person: second person.','Description focus: 对白.','Use "English"','catchphrases','current narrative voice','角色主动性·主动推进'])assert.ok(pref.includes(phrase),owner+' '+phrase);
  assert.match(text,/<StyleResources>[\s\S]*Tone: humorous\.[\s\S]*<\/StyleResources>/);assert.equal(pref.includes('Tone: humorous.'),false);assert.equal(text.split('角色主动性·主动推进').length-1,1);assert.match(pref,/<CharacterPortrayal>[\s\S]*角色主动性·主动推进[\s\S]*<\/CharacterPortrayal>/);
  assert.match(text,/<body min="1000" max="1600" unit="字">/);assert.equal(text.split('\n').filter(l=>l.startsWith('输入评价|')).length,2);assert.equal(text.split('\n').filter(l=>l.startsWith('剧情吐槽|')).length,2);assert.equal(text.split('\n').filter(l=>l.startsWith('回应用户评价|')).length,0);assert.equal(f.host.preview().injection.blocks,11);assert.equal(JSON.stringify(f.source),before);
 }
});

test('discussion and summary configuration reach both send paths with the existing eleven-block contract',async()=>{
 for(const owner of ['native','tisya'])for(const choice of ['场外讨论','总结整理']){
  const f=setup({owner});f.world.modes.narrative.narrative.缇斯亚叙事创作模式=choice;const payload=await f.ready();await f.host.payloadReady(payload);const text=JSON.stringify(payload.messages);assert.match(text,/AUTHORING.MODE/);assert.match(text,/Do not continue the fictional scene/);assert.match(text,/keep any machine blocks empty/);assert.equal(f.host.preview().injection.blocks,11);
 }
});

test('explicit style and requirement resources reach native and controlled materials exactly once',async()=>{
 for(const owner of ['native','tisya']){
  const f=setup({owner});f.data.resources=[{id:'style',kind:'style',name:'样例文风',content:'STYLE_RESOURCE_SELECTED_CANARY'},{id:'requirement',kind:'requirement',name:'样例要求',content:'REQUIREMENT_SELECTED_CANARY'},{id:'off',kind:'extension',name:'未启用',content:'UNSELECTED_RESOURCE_CANARY'}];f.world.style='style';f.world.modes.narrative.selected=['requirement','off'];f.world.overrides.off='off';f.world.switches.boundary='BOUNDARY_OWNER_CANARY';const before=JSON.stringify(f.source),payload=await f.ready();await f.host.payloadReady(payload);const text=JSON.stringify(payload.messages);
  for(const canary of ['STYLE_RESOURCE_SELECTED_CANARY','REQUIREMENT_SELECTED_CANARY','BOUNDARY_OWNER_CANARY'])assert.equal(text.split(canary).length-1,1,owner+' '+canary);assert.doesNotMatch(text,/UNSELECTED_RESOURCE_CANARY/);assert.equal(JSON.stringify(f.source),before);
 }
});

test('native resource validation rejects changed source and a missing material insertion boundary',async()=>{
 const f=setup();f.data.resources=[{id:'book-style',kind:'style',name:'引用文风',content:'saved',source:{book:'book',uid:1}}];f.world.style='book-style';f.c.loadWorldInfo=async()=>({entries:{1:{uid:1,content:'changed'}}});await assert.rejects(f.host.before('normal'),/已选资源来源/);
 const g=setup();g.data.resources=[{id:'r',kind:'requirement',name:'要求',content:'RESOURCE_NEEDS_BOUNDARY'}];g.world.modes.narrative.selected=['r'];g.source.order.find(x=>x.identifier==='tisya_material_boundary_close').enabled=false;const payload=await g.ready();await assert.rejects(g.host.payloadReady(payload),/资料结束入口/);assert.throws(()=>JSON.stringify(payload));
});

test('selected player and focus identities reach either context owner without rewriting archive objects',async()=>{
 for(const owner of ['native','tisya']){
  const f=setup({owner});f.c.characters.push({avatar:'player.png',name:'样例主控',description:'SELECTED_PLAYER_IDENTITY_ONLY'});f.world.controller='card:player.png';f.world.focus=['card:one.png'];const saved=JSON.stringify(f.data),payload=await f.ready();await f.host.payloadReady(payload);const text=JSON.stringify(payload.messages);assert.equal(text.split('本世界 user／主控：样例主控').length-1,1,owner);assert.equal(text.split('SELECTED_PLAYER_IDENTITY_ONLY').length-1,1,owner);assert.match(text,/关注对象：测试/);assert.equal(JSON.stringify(f.data),saved);
 }
 const f=setup();f.world.controller='card:missing';await assert.rejects(f.host.before('normal'),/主控档案已失效/);
});

test('disabled hearts or structured output never access the mood catalogue on either send path',async()=>{
 for(const owner of ['native','tisya'])for(const disable of ['hearts','structured']){
  const f=setup({owner,moods:()=>{throw Error('unselected mood catalogue was read');}});if(disable==='hearts')f.world.modes.narrative.heartDirections=[];else f.source.order.find(p=>p.identifier==='tisya_output').enabled=false;const payload=await f.ready();await f.host.payloadReady(payload);const text=JSON.stringify(payload.messages);if(disable==='structured')assert.doesNotMatch(text,/ONEPASS.CONTRACT/);else assert.match(text,/ONEPASS.CONTRACT/);
 }
});

test('main versus supplementary styles remain distinguishable on both send paths',async()=>{
 for(const owner of ['native','tisya'])for(const main of [true,false]){
  const f=setup({owner});f.data.resources=[{id:'a',kind:'style',name:'主调示例',content:'MAIN_STYLE_UNIQUE_CANARY'},{id:'b',kind:'style',name:'补充示例',content:'SUPPLEMENT_STYLE_UNIQUE_CANARY'}];f.world.style=main?'a':null;f.world.styles=main?['b']:['a','b'];const payload=await f.ready();await f.host.payloadReady(payload);const text=payload.messages.map(m=>typeof m.content==='string'?m.content:'').join('\n');
  for(const canary of ['MAIN_STYLE_UNIQUE_CANARY','SUPPLEMENT_STYLE_UNIQUE_CANARY'])assert.equal(text.split(canary).length-1,1);assert.match(text,/Style supplement: "补充示例"/);if(main)assert.match(text,/Main style: "主调示例"/);else{assert.match(text,/Main: 基础文风/);assert.match(text,/Style supplement: "主调示例"/);}
 }
});

test('identical selected resource bodies remain single-source and retain main-style priority',async()=>{
 for(const owner of ['native','tisya']){const f=setup({owner});f.data.resources=[{id:'supplement',kind:'style',name:'相同补充',content:'SAME_RESOURCE_BODY_CANARY'},{id:'main',kind:'style',name:'相同主调',content:'SAME_RESOURCE_BODY_CANARY'}];f.world.style='main';f.world.styles=['supplement'];f.world.modes.narrative.selected=['supplement'];const payload=await f.ready();await f.host.payloadReady(payload);const text=payload.messages.map(m=>typeof m.content==='string'?m.content:'').join('\n');assert.equal(text.split('SAME_RESOURCE_BODY_CANARY').length-1,1,owner);assert.match(text,/Main style: "相同主调"/);}
});
