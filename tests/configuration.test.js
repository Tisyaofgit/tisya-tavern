import {textTaskPreset} from '../task-envelope.js';
import {createUserEditHistory} from '../user-revision.js';
import {contractorMessages} from '../communication.js';
import {EMOTIONS} from '../emotion-catalog.js';
const MOODS=EMOTIONS.map(r=>r.name);
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Window} from 'happy-dom';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey,compileSelected,effectiveResources,resolveRoute,register} from '../config/core.js';
import {createHost,buildMessages,sealPayload,blockPayload,validateBodyOverrides} from '../config/host.js';import {compileNarrative,registerLivePreset,isLivePreset} from '../narrative-bridge.js';import {registerPresetProtocol} from '../preset.js';import {mountConfiguration} from '../config/panel.js';import {preferNativeBeauty,createNativeBodyFormatter} from '../native-beauty.js';import {mountMessageAppearance} from '../message-ui.js';
const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url)));
function fixture(options={}){const d=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a',name:'甲',description:'角色甲',data:{description:'角色甲',personality:'甲性格'}}],chatMetadata:{},chat:[{is_user:true,mes:'继续'}],powerUserSettings:{persona_description:'默认主控'},extensionSettings:{[KEY]:d,connectionManager:{profiles:[{id:'b',name:'B',api:'custom',model:'B-model','api-url':'https://example.invalid/v1','secret-id':'credential-reference',preset:'WRONG_PRESET'}]}},chatCompletionSettings:{model:'N-model',chat_completion_source:'openai',temperature:.7,prompts:[]},CONNECT_API_MAP:{custom:{selected:'openai',source:'custom'}},getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({}),stopGeneration(){},getWorldInfoNames:()=>['book'],loadWorldInfo:async()=>({entries:{1:{uid:1,comment:'机关',content:'{"name":"茶社","type":"组织","description":"掌管茶园"}'},2:{uid:2,comment:'文风',content:'BOOK_STYLE_ONLY'}}})};const k=worldKey(c);d.worlds[k]=defaultWorld();d.worlds[k].context.owner='tisya';const source={identity:'r13',prompts:structuredClone(preset.prompts),order:structuredClone(preset.prompt_order[0].order)},macros=new Map();c.registerMacro=(n,f)=>macros.set(n,f);c.unregisterMacro=n=>macros.delete(n);c.substituteParams=s=>s.replace(/\{\{(tisya_\w+)\}\}/g,(_,n)=>{if(!macros.has(n))throw Error('Unknown macro '+n);return macros.get(n)();});const manager={getAllPresets:()=>['r13'],getSelectedPresetName:()=> 'r13',getCompletionPresetByName:()=>preset};c.getPresetManager=()=>manager;const store=createStore({getContext:()=>c,persist:async()=>true});const host=createHost({...options,getContext:()=>c,getSource:()=>source,getMoods:()=>MOODS,store,createParameters:async(s,model,type,messages)=>({generate_data:{messages,model,chat_completion_source:s.chat_completion_source,custom_url:s.custom_url,secret_id:s.secret_id,stream:false}})});const live=registerLivePreset(c,()=>source,()=>c,()=>MOODS);registerPresetProtocol(c,()=>source,()=>{},()=>MOODS,s=>!isLivePreset(s)||live.execution().prose);c.registerMacro('tisya_config_selected',()=>host.selectedText());return {d,c,k,w:d.worlds[k],source,host,store,macros};}
test('resource save is not selection; world off wins; explicit false/zero survive; disabled resource body never compiles',()=>{const f=fixture();f.d.resources=[{id:'a',kind:'style',name:'A',content:'SELECTED_STYLE'},{id:'b',kind:'extension',name:'B',content:'DISABLED_SENTINEL'},{id:'c',kind:'workflow',name:'C',content:'NEWLY_SAVED'}];f.w.style='a';f.w.modes.narrative.selected=['b'];f.w.overrides.b='off';assert.equal(compileSelected(f.d,f.w).text,'SELECTED_STYLE');f.d.resources[0].requires=['b'];assert.throws(()=>compileSelected(f.d,f.w),/缺少/);});
test('API/preset/model inherit independently and explicit no additional preset is distinct from inheritance',()=>{const f=fixture();f.d.routes.global={connection:'profile:b',preset:'r13',model:'global'};f.w.modes.narrative.routes.summary={preset:null};f.d.routes.tasks.summary={model:'summary'};const r=resolveRoute(f.d,f.w,'summary');assert.equal(r.connection,'profile:b');assert.equal(r.preset,null);assert.equal(r.model,'summary');assert.deepEqual(r.sources,{connection:'通用',preset:'模式',model:'任务'});});
test('save conflict, failed persistence and world switch preserve authoritative configuration',async()=>{const f=fixture(),s=f.store.read();const draft=structuredClone(s.data);draft.worlds[f.k].theme.nativeRegex=false;await f.store.save(draft,s.revision,s.key);assert.equal(f.store.read().world.theme.nativeRegex,false);await assert.rejects(f.store.save(s.data,s.revision,s.key),/其他页面/);const bad=createStore({getContext:()=>f.c,persist:async()=>false}),b=bad.read();await assert.rejects(bad.save(b.data,b.revision,b.key),/未确认/);assert.equal(bad.read().revision,b.revision);f.c.chatId='other';await assert.rejects(f.store.save(draft,f.store.read().revision,s.key),/切换/);});
test('any recognizable archive kind can become user, with stable IDs and missing-ref failure',async()=>{const f=fixture();f.w.context.books=['book'];const rows=await f.host.archives(f.w),org=rows.find(r=>r.type==='组织');assert.ok(org);f.w.controller=org.id;const result=await f.host.resolveMaterials(f.d,f.w);assert.match(result.text,/user／主控：茶社/);assert.doesNotMatch(result.text,/BOOK_STYLE_ONLY/);f.w.controller='missing';await assert.rejects(f.host.resolveMaterials(f.d,f.w),/主控档案已失效/);});
test('actual settings-ready payload excludes all native worldbook bypasses, option catalogue, off style and tool definitions',async()=>{const f=fixture();f.d.resources=[{id:'a',kind:'style',name:'A',content:'ONLY_SELECTED_STYLE'},{id:'b',kind:'style',name:'B',content:'NOT_SELECTED_CANARY'}];f.w.style='a';f.d.routes.tasks.main={connection:'profile:b'};await f.host.before('normal');const payload={messages:[{role:'system',content:'NATIVE_WORLD_BEFORE_RECURSIVE_DEPTH_CANARY'}],tools:[{name:'UNSELECTED_TOOL_CANARY'}],stream:true};await f.host.payloadReady(payload);const bytes=JSON.stringify(payload);assert.match(bytes,/ONLY_SELECTED_STYLE/);assert.doesNotMatch(bytes,/NOT_SELECTED_CANARY|NATIVE_WORLD_BEFORE|UNSELECTED_TOOL|自然小说|正文可依实际内容使用短标记/);assert.equal(payload.model,'B-model');assert.equal(payload.stream,true);assert.equal(f.c.chatCompletionSettings.model,'N-model');assert.equal((bytes.match(/ONLY_SELECTED_STYLE/g)??[]).length,1);assert.equal(f.host.preview().messages.length,payload.messages.length);assert.doesNotMatch(JSON.stringify(f.host.preview()),/credential-reference|example.invalid/);});
test('late third-party injection and swallowed event errors cannot serialize an unverified request',async()=>{const p={messages:[{role:'user',content:'OK'}]};sealPayload(p);assert.ok(JSON.stringify(p));p.messages.push({role:'system',content:'LATE_UNSELECTED'});assert.throws(()=>JSON.stringify(p),/其他扩展/);const f=fixture();f.w.controller='missing';await assert.rejects(f.host.before('normal'));const request={messages:[{role:'system',content:'DO_NOT_SEND'}]};await assert.rejects(f.host.payloadReady(request));assert.throws(()=>JSON.stringify(request));});
test('worldbook resource version drift and exact duplicate sources are detected before send',async()=>{const f=fixture();f.d.resources=[{id:'a',kind:'style',name:'A',content:'BOOK_STYLE_ONLY',source:{book:'book',uid:2}}];f.w.style='a';f.w.context.entries=[{book:'book',uid:2}];const p=await f.host.resolveMaterials(f.d,f.w);assert.equal((p.text.match(/BOOK_STYLE_ONLY/g)??[]).length,1);f.d.resources[0].content='OLD';await assert.rejects(f.host.resolveMaterials(f.d,f.w),/已更新/);});
test('selected workflow compiles only enabled enhancement text while preserving fixed output block names',()=>{const f=fixture();f.w.modes.narrative.narrative.缇斯亚叙事防神化=false;const c=compileNarrative(f.c,f.source,MOODS),text=c.rest.entries.tisya_inner_chain;assert.doesNotMatch(text,/不无因崇拜/);for(const tag of ['task','title','body','next','status','extra','vars','archive','memory','actions'])assert.ok(text.includes('<'+tag)||text.includes('blk.'+tag),tag);assert.match(text,/@DEFINE @OUT/);assert.doesNotMatch(text,/自然小说/);});

test('three workflow detail levels change actual compiled requests and preserve selected constraints',async()=>{
 const f=fixture(),m=f.w.modes.narrative,results={};
 m.narrative.缇斯亚叙事基调='诙谐';m.narrative.缇斯亚叙事玩家代写='补充轻微言行';
 // The legacy default remains compact without writing a new setting.
 delete m.workflowDetail;assert.equal(compileNarrative(f.c,f.source,MOODS).workflowDetail,'compact');assert.equal(m.workflowDetail,undefined);
 for(const detail of ['full','compact','format']){
  m.workflowDetail=detail;await f.host.before('normal');const payload={messages:[]};await f.host.payloadReady(payload);
  const inner=f.macros.get('tisya_live_tisya_inner_chain')();results[detail]=inner;
  assert.ok(JSON.stringify(payload.messages).includes(JSON.stringify(inner).slice(1,-1)));
  const request=JSON.stringify(payload.messages);
  assert.match(request,/one compact grade A\/B\/C\/D\/E or ~/);
  assert.match(inner,/标题最多8字/);assert.match(inner,/意象、梗或典故化用/);assert.match(inner,/上下两块心声的内容、观点与笑点不得重复/);
  assert.match(request,/~ means public only in a permission cell/);
  assert.match(request,/never invent a scope or treat unresolved as public/);
  assert.doesNotMatch(request,/PERM_SHAPE|never bare null\/~/);
  assert.doesNotMatch(inner,/权限：vars\||valid variable operations replace/);
  assert.match(inner,/采用诙谐基调/);assert.match(inner,/围绕玩家已经确定的意图/);assert.match(inner,/重大选择保留给玩家/);
  assert.match(inner,/"min":2000,"max":5000/);assert.doesNotMatch(inner,/MVU is disabled/);assert.match(inner,/自有状态执行器停用不禁用其他来源/);assert.match(inner,/!private reasoning/);assert.match(inner,/@FREEZE the entire assembled output text as @DRAFT/);
  for(const name of ['task','title','body','next','status','extra','vars','archive','memory','actions'])assert.ok(inner.includes('<'+name),detail+' '+name);
  assert.doesNotMatch(inner,/自然小说|缇斯亚叙事基调|T\.1|<think>/);
 }
 assert.match(results.full,/\[P\.1\]/);assert.match(results.full,/\[B\.6\]/);assert.match(results.full,/\[CALL para_n\]/);assert.match(results.full,/@REQUIRE DONE\(C\.3\)/);assert.match(results.full,/资料与知情←E\.1\/B\.1\/C\.1/);
 assert.match(results.compact,/\[WORKFLOW\]/);assert.doesNotMatch(results.compact,/\[P\.1\]|\[CALL para_n\]|E\.1\/B\.1/);
 assert.doesNotMatch(results.format,/\[WORKFLOW\]|\[D\.1\]|\[CALL para_n\]/);assert.match(results.format,/unperformed or unsupported checks→待确认/);
 assert.ok(results.full.length>results.compact.length);assert.ok(results.compact.length>results.format.length);
});

test('full detail keeps source stages while disabled simulation questions and features stay absent',()=>{
 const f=fixture(),m=f.w.modes.narrative;m.workflowDetail='full';const steps=[...m.narrative.缇斯亚叙事步序];
 for(const omitted of steps){
  m.narrative.缇斯亚叙事步序=steps.filter(s=>s!==omitted);const text=compileNarrative(f.c,f.source,MOODS).rest.entries.tisya_inner_chain;
  assert.match(text,/\[CALL para_n\]/);assert.match(text,/\[D\.2\]/);assert.match(text,/\[D\.4\]/);
  if(omitted==='人物反应')assert.doesNotMatch(text,/\[B\]|B\.[1-6]|Scrutinize remaining capacities/);
  if(omitted==='行动与剧情')assert.doesNotMatch(text,/Within the allowed time window|On one timeline|@ASK IF\(false/);
  if(omitted==='视角认知')assert.doesNotMatch(text,/Whose narrative viewpoints apply/);
  if(omitted==='正文组织')assert.doesNotMatch(text,/How should the narrative resume|perform targeted cliché review/);
 }
 m.narrative.缇斯亚叙事步序=steps;m.narrative.缇斯亚叙事防神化=false;const entries=compileNarrative(f.c,f.source,MOODS).rest.entries;
 assert.doesNotMatch(entries.tisya_inner_chain,/Scrutinize player-regard|deification/);assert.doesNotMatch(entries.tisya_registry,/deify player/);
});

test('all detail levels honor disabled actions and plain output without running unused output branches',()=>{
 for(const detail of ['full','compact','format']){
  const f=fixture(),m=f.w.modes.narrative;m.workflowDetail=detail;m.actions=false;
  const text=compileNarrative(f.c,f.source,MOODS).rest.entries.tisya_inner_chain;
  assert.match(text,/<actions\/>/);assert.doesNotMatch(text,/行动：\{交流|materially different optional goals/);
  f.source.order.find(e=>e.identifier==='tisya_output').enabled=false;
  const plain=compileNarrative(f.c,f.source,MOODS).rest.entries.tisya_inner_chain;
  assert.match(plain,/"kind":"plain"/);assert.doesNotMatch(plain,/<reply>|<actions|\[CALL blk.memory\]|\[CALL blk.next\]/);
 }
});

test('workflow detail saves through production UI, reopens, stays world-scoped and rejects invalid stored values',async()=>{
 const f=fixture(),win=new Window(),doc=win.document,box=doc.createElement('div');doc.body.append(box);
 const options={store:f.store,host:f.host,getSettings:()=>({联系人分组:{}})};
 let ui=mountConfiguration(doc,box,options);await ui.ready;let root=ui.root.shadowRoot;
 const select=root.querySelector('[aria-label="思维链详细程度"]');assert.equal(select.value,'"compact"');assert.equal(select.options.length,3);
 select.value='"format"';select.dispatchEvent(new win.Event('change'));root.querySelector('footer button:last-child').click();await new Promise(r=>setTimeout(r,10));
 assert.equal(f.store.read().world.modes.narrative.workflowDetail,'format');ui.dispose();
 ui=mountConfiguration(doc,box,options);await ui.ready;root=ui.root.shadowRoot;assert.equal(root.querySelector('[aria-label="思维链详细程度"]').value,'"format"');ui.dispose();
 f.c.chatId='other';assert.equal(f.store.read().world.modes.narrative.workflowDetail,'compact');f.c.chatId='one';
 for(const value of [null,false,0,'unknown']){const s=f.store.read();s.data.worlds[f.k].modes.narrative.workflowDetail=value;await assert.rejects(f.store.save(s.data,s.revision,s.key),/详细程度无效/);}
 assert.equal(f.store.read().world.modes.narrative.workflowDetail,'format');await win.happyDOM.abort();
});
test('dropdown production UI saves, reopens, and registers extra theme fields without injecting them',async()=>{const f=fixture(),win=new Window(),doc=win.document,container=doc.createElement('div');doc.body.append(container);const ui=mountConfiguration(doc,container,{store:f.store,host:f.host,getSettings:()=>({联系人分组:{}}),onClose(){},onNative(){}});await ui.ready;const root=ui.root.shadowRoot;const picker=root.querySelector('[aria-label="配置分类"]');assert.equal(picker.options.length,7);assert.equal(root.querySelectorAll('[role=tab]').length,0);picker.value='world';picker.dispatchEvent(new win.Event('change'));await new Promise(r=>setTimeout(r,10));assert.match(root.textContent,/本世界 user/);picker.value='theme';picker.dispatchEvent(new win.Event('change'));await new Promise(r=>setTimeout(r,10));const check=root.querySelector('input[type=checkbox]');check.checked=false;check.dispatchEvent(new win.Event('change'));root.querySelector('footer button:last-child').click();await new Promise(r=>setTimeout(r,10));assert.equal(f.store.read().world.theme.nativeRegex,false);assert.match(root.textContent,/配置已保存/);ui.dispose();await win.happyDOM.abort();});
test('native card beauty keeps original DOM nodes and handlers including late helper iframe mounting',async()=>{const win=new Window(),doc=win.document;doc.body.innerHTML='<div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text"><div class="card-beauty"><button>开场白按钮</button></div></div></div></div></div>';const node=doc.querySelector('.mes'),native=doc.querySelector('.mes_text'),button=doc.querySelector('button'),message={mes:'【系统启动】',is_user:false,name:'卡'};let clicks=0;button.onclick=()=>clicks++;const view=mountMessageAppearance(doc,{getMessage:()=>message,preferNative:(m,n,c)=>preferNativeBeauty({message:m,native:n,structured:c.structured,scripts:[{markdownOnly:true,placement:[2]}]}),formatBody:s=>s});view.sync(node);assert.equal(doc.querySelector('.tisya-message-visual'),null);assert.equal(doc.querySelector('button'),button);assert.equal(native.classList.contains('tisya-source-concealed'),false);button.click();assert.equal(clicks,1);native.append(doc.createElement('iframe'));view.sync(node);assert.equal(native.querySelectorAll('iframe').length,1);view.dispose();assert.equal(doc.querySelector('button'),button);await win.happyDOM.abort();});

test('zero history preserves current input, swipe excludes discarded answer, continuation keeps its tail',()=>{const f=fixture();f.w.context.history=0;f.c.chat=[{is_user:true,mes:'OLD_USER'},{mes:'OLD_REPLY'},{is_user:true,mes:'CURRENT_USER'}];const source={prompts:[{identifier:'chatHistory',marker:true}],order:[{identifier:'chatHistory',enabled:true}]},args={source,context:f.c,world:f.w,substitute:s=>s};assert.deepEqual(buildMessages(args),[{role:'user',content:'CURRENT_USER'}]);f.c.chat.push({mes:'DISCARDED_SWIPE'});assert.deepEqual(buildMessages({...args,type:'swipe'}),[{role:'user',content:'CURRENT_USER'}]);assert.match(JSON.stringify(buildMessages({...args,type:'continue'})),/DISCARDED_SWIPE/);});
test('task route edits survive production UI save; false and zero resource parameters remain actual values',async()=>{const f=fixture(),win=new Window(),doc=win.document,box=doc.createElement('div');doc.body.append(box);const page=mountConfiguration(doc,box,{store:f.store,host:f.host,getSettings:()=>({联系人分组:{}}),initialTab:'api'});await page.ready;const root=page.root.shadowRoot,api=root.querySelector('[aria-label="任务 · 总结 API"]'),pr=root.querySelector('[aria-label="模式 · 总结 预设"]');api.value=JSON.stringify('profile:b');api.dispatchEvent(new win.Event('change'));pr.value='null';pr.dispatchEvent(new win.Event('change'));root.querySelector('footer button:last-child').click();await new Promise(r=>setTimeout(r,10));const read=f.store.read(),route=resolveRoute(read.data,read.world,'summary');assert.equal(route.connection,'profile:b');assert.equal(route.preset,null);page.dispose();await win.happyDOM.abort();f.d.resources=[{id:'params',kind:'style',name:'参数',content:'count=${n},flag=${flag}',fields:[{key:'n',type:'number'},{key:'flag',type:'boolean'}]}];f.w.style='params';f.w.parameters.params={n:0,flag:false};assert.equal(compileSelected(f.d,f.w).text,'count=0,flag=false');});
test('auxiliary custom task envelopes preserve edits and disabled rows, while incomplete presets reject without sending',async()=>{
 const f=fixture(),custom=textTaskPreset({task:'summary'});custom.prompts.splice(6,0,{identifier:'custom',role:'system',content:'AUX_PRESET_ON',enabled:true},{identifier:'off',role:'system',content:'AUX_PRESET_OFF',enabled:false});custom.prompt_order[0].order.splice(6,0,{identifier:'custom',enabled:true},{identifier:'off',enabled:false});
 f.c.getPresetManager=()=>({getAllPresets:()=>['aux'],getCompletionPresetByName:()=>custom});f.d.routes.tasks.summary={connection:'profile:b',preset:'aux'};f.d.resources=[{id:'a',kind:'requirement',name:'A',content:'AUX_RESOURCE',tasks:['summary']},{id:'b',kind:'style',name:'B',content:'MAIN_ONLY',tasks:['main']}];f.w.modes.narrative.selected=['a','b'];
 const old=globalThis.fetch;let sent,calls=0;globalThis.fetch=async(_,o)=>{calls++;sent=JSON.parse(o.body);return {ok:true,json:async()=>({ok:true})};};try{
 const before=JSON.stringify(custom);await f.host.request('summary','summarize');assert.match(JSON.stringify(sent.messages),/AUX_PRESET_ON.*AUX_RESOURCE/);assert.doesNotMatch(JSON.stringify(sent.messages),/AUX_PRESET_OFF|MAIN_ONLY|<reply>/);assert.equal(sent.model,'B-model');assert.equal(JSON.stringify(custom),before);
 custom.prompt_order[0].order.find(p=>p.identifier==='tisya_task_start').enabled=false;const edited=JSON.stringify(custom);await assert.rejects(f.host.request('summary','summarize'),/任务预设不完整或冲突/);assert.equal(calls,1);assert.equal(JSON.stringify(custom),edited);
 f.d.routes.tasks.tableGenesis={preset:'native'};await assert.rejects(f.host.request('tableGenesis','{}'),/不能使用故事预设/);assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});

test('native public-body formatter does not re-run unchanged display regex and obeys the off switch',()=>{let enabled=true,calls=0,seen;const format=createNativeBodyFormatter({enabled:()=>enabled,scripts:()=>[{markdownOnly:true,placement:[2]}],regex:s=>{calls++;seen=s;return s.replace('【系统启动】','<div style="color:red">开场白</div>');},format:s=>s});const message={name:'卡'},node={getAttribute:()=>0};assert.match(format('【系统启动】',message,node),/开场白/);format('【系统启动】',message,node);assert.equal(calls,1);assert.equal(seen,'【系统启动】');enabled=false;assert.equal(format('【系统启动】',message,node),null);});

test('native additional body parameters cannot replace the compiled messages or tool catalogue',()=>{validateBodyOverrides({custom_include_body:'{"temperature":0.5}'});assert.throws(()=>validateBodyOverrides({custom_include_body:'{"messages":[{"content":"BYPASS"}]}'}),/不能覆盖/);assert.throws(()=>validateBodyOverrides({custom_exclude_body:'["messages"]'}),/不能覆盖/);const p={messages:[],custom_include_body:''};sealPayload(p);p.custom_include_body='{"messages":[]}';assert.throws(()=>JSON.stringify(p),/其他扩展/);});

test('selected media retains native image parts but strips merged unselected text',()=>{const f=fixture();f.c.chat=[{is_user:true,mes:'看图',extra:{media:[{url:'image'}]}}];f.w.context.history=0;const source={prompts:[{identifier:'chatHistory',marker:true}],order:[{identifier:'chatHistory',enabled:true}]};const out=buildMessages({source,context:f.c,world:f.w,substitute:s=>s,nativeMessages:[{role:'user',content:[{type:'text',text:'看图 NATIVE_INJECTION_CANARY'},{type:'image_url',image_url:{url:'data:image/png;base64,AA'}}]}]});assert.equal(out[0].content[0].text,'看图');assert.equal(out[0].content[1].type,'image_url');assert.doesNotMatch(JSON.stringify(out),/CANARY/);assert.throws(()=>buildMessages({source,context:f.c,world:f.w,substitute:s=>s}),/未提供/);});

test('selecting a task preset cannot replace the native API or model on later requests',async()=>{const f=fixture(),handlers=new Map();f.c.eventTypes={OAI_PRESET_CHANGED_BEFORE:'before',OAI_PRESET_CHANGED_AFTER:'after'};f.c.eventSource={on:(e,fn)=>handlers.set(e,fn),removeListener:e=>handlers.delete(e)};let selected='r13';f.c.getPresetManager=()=>({getAllPresets:()=>['r13','changed'],getSelectedPresetName:()=>selected,getCompletionPresetByName:()=>preset,findPreset:n=>n,selectPreset(n){const change={presetName:n,preset:{chat_completion_source:'wrong',model:'WRONG_MODEL'},settingsToUpdate:{chat_completion_source:['','',false,true],model:['','',false,true]}};handlers.get('before')?.(change);Object.assign(f.c.chatCompletionSettings,change.preset);selected=n;handlers.get('after')?.();}});f.d.routes.tasks.main={preset:'changed'};await f.host.before('normal');let p={messages:[],stream:false};await f.host.payloadReady(p);assert.equal(p.model,'N-model');assert.equal(f.c.chatCompletionSettings.chat_completion_source,'openai');await f.host.before('normal');p={messages:[],stream:false};await f.host.payloadReady(p);assert.equal(p.model,'N-model');assert.equal(handlers.size,0);});

test('each heart position emits all selected directions in the actual request, for every detail and selection',async()=>{
 const directions=['输入评价','回应用户评价','剧情吐槽'];
 for(const detail of ['full','compact','format'])for(let mask=0;mask<8;mask++){
  const f=fixture(),m=f.w.modes.narrative;m.workflowDetail=detail;m.heartDirections=directions.filter((_,i)=>mask&(1<<i));
  await f.host.before('normal');const payload={messages:[]};await f.host.payloadReady(payload);
  const text=f.macros.get('tisya_live_tisya_inner_chain')();
  assert.ok(JSON.stringify(payload.messages).includes(JSON.stringify(text).slice(1,-1)));
  for(const part of ['task','next']){
   const block=text.match(new RegExp('<'+part+' format="pipes"[^>]*>([\\s\\S]*?)</'+part+'>'))[1];
   const rows=[...block.matchAll(/^心声：有内容\|([^|]+)\|/gm)].map(m=>m[1]);
   assert.deepEqual(rows,m.heartDirections,detail+' '+part+' mask '+mask);
   if(mask){assert.match(block,part==='task'?/开篇短评/:/收篇短评/);assert.doesNotMatch(block,/该方向短评/);}
   if(!mask)assert.match(block,/心声：关闭/);
  }
  if(mask){assert.match(text,new RegExp('首尾各按所选方向写'+m.heartDirections.length+'条心声'));assert.match(text,/观点不得与开篇重复/);}
  assert.doesNotMatch(text,/assigned position only|task receives|no public basis→omit item/);
  assert.match(text,/无原生状态行→省略全部status注记/);assert.match(text,/<vars\/>→省略全部vars注记/);
  assert.match(text,/七项审计各给一句实际核验结论/);assert.doesNotMatch(text,/WORKFLOW\/WORKFLOW/);
  assert.match(text,/memory 是本轮已发生事实的记录/);assert.match(text,/读者可见不等于所有人物知情/);
  assert.match(text,/A–E是故事信息等级/);assert.doesNotMatch(text,/@REPLY_CHECK/);
 }
});

test('compact workflow states authorization once and keeps its selected constraints',()=>{
 const f=fixture();f.w.modes.narrative.workflowDetail='compact';
 const c=compileNarrative(f.c,f.source,MOODS),text=c.rest.entries.tisya_inner_chain;
 for(const id of ['A01','A02','A03','A04','A05','B01','B02','B03','B04','B05','B06']){
  const rule=c.stepwiseRules[id];if(rule)assert.equal(text.split(rule).length-1,1,id);
 }
 assert.match(text,/按 @AUTH 核对主镜头/);
});


test('native database mode defaults on, preserves external payloads and allows late injection',async()=>{
 const f=fixture();delete f.w.context.owner;f.w.context.memory=true;
 f.d.routes.tasks.main={connection:'profile:missing',preset:'missing'};
 const source=JSON.stringify(f.c.chat),settings=JSON.stringify(f.c.extensionSettings);
 await f.host.before('normal');assert.equal(f.host.selectedText(),'');
 const payload={messages:[{role:'system',content:'DATABASE_MEMORY_BEFORE'},{role:'user',content:'原生当前输入'}],tools:[{type:'function',function:{name:'database_lookup'}}],model:'native-db-model',custom_include_body:'native setting',stream:true};
 const before=structuredClone(payload),messages=payload.messages;
 await f.host.payloadReady(payload);
 assert.deepEqual(payload,before);assert.equal(payload.messages,messages);assert.equal(Object.hasOwn(payload,'toJSON'),false);
 payload.messages.push({role:'system',content:'DATABASE_MEMORY_AFTER'});assert.match(JSON.stringify(payload),/DATABASE_MEMORY_AFTER/);
 assert.equal(f.host.preview().contextOwner,'native');assert.equal(f.host.preview().observedOnly,true);
 assert.equal(JSON.stringify(f.c.chat),source);assert.equal(JSON.stringify(f.c.extensionSettings),settings);
 f.host.clear();await f.host.payloadReady(payload);assert.equal(Object.hasOwn(payload,'toJSON'),false);
 for(const type of ['swipe','continue','quiet','impersonate']){await f.host.before(type);assert.equal(f.host.selectedText(),'');await f.host.payloadReady(payload);assert.match(JSON.stringify(payload),/DATABASE_MEMORY_BEFORE/);}
 assert.equal(defaultWorld().context.owner,'native');
});

test('context owner keeps independent history controls visible and preserves saved selections',async()=>{
 const f=fixture();delete f.w.context.owner;f.w.context.memory=true;f.w.context.history=17;
 const win=new Window(),doc=win.document,box=doc.createElement('div');doc.body.append(box);
 const mount=()=>mountConfiguration(doc,box,{store:f.store,host:f.host,getSettings:()=>({联系人分组:{}}),initialTab:'data'});
 let ui=mount();await ui.ready;let root=ui.root.shadowRoot,select=root.querySelector('[aria-label="上下文来源"]');
 assert.equal(select.value,'"native"');assert.match(root.textContent,/允许数据库扩展注入/);
 assert.equal(root.querySelector('[aria-label="历史聊天条数（当前输入始终保留）"]').closest('fieldset').hidden,false);
 assert.equal(root.querySelector('[aria-label="原卡 MVU"]').closest('fieldset').hidden,false);
 assert.equal(root.querySelector('[aria-label="注入窗口以前的记忆"]'),null);
 select.value='"tisya"';select.dispatchEvent(new win.Event('change'));root.querySelector('footer button:last-child').click();await new Promise(r=>setTimeout(r,10));
 assert.equal(f.store.read().world.context.owner,'tisya');assert.equal(f.store.read().world.context.memory,true);assert.equal(f.store.read().world.context.history,17);
 ui.dispose();ui=mount();await ui.ready;root=ui.root.shadowRoot;select=root.querySelector('[aria-label="上下文来源"]');assert.equal(select.value,'"tisya"');
 assert.equal(root.querySelector('[aria-label="历史聊天条数（当前输入始终保留）"]').closest('fieldset').hidden,false);
 select.value='"native"';select.dispatchEvent(new win.Event('change'));root.querySelector('footer button:last-child').click();await new Promise(r=>setTimeout(r,10));assert.equal(f.store.read().world.context.owner,'native');ui.dispose();
 f.c.chatId='other';assert.equal(f.store.read().world.context.owner,'native');f.c.chatId='one';assert.equal(f.store.read().world.context.history,17);
 for(const value of [null,false,'unknown']){const s=f.store.read();s.world.context.owner=value;await assert.rejects(f.store.save(s.data,s.revision,s.key),/记忆与上下文选项无效/);}
 await win.happyDOM.abort();
});

test('paired auxiliary API retains identity and direct JSON while isolating source slots and unselected books',async()=>{
 const f=fixture();f.d.routes.tasks.main={connection:'profile:b',model:'B-AUX',preset:'r13'};const prior=globalThis.fetch;let sent;
 globalThis.fetch=async(url,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"changes":[],"templates":[]}'}}]})};};
 try{await f.host.request('tableArchive',JSON.stringify({archiveSource:{text:'ONLY_TABLE_INPUT'},registry:{tables:[],types:[]},currentRows:[]}));assert.equal(sent.model,'B-AUX');assert.equal(sent.custom_url,'https://example.invalid/v1');const text=sent.messages.map(m=>m.content).join('\n');assert.match(text,/MODE.ANALYZE/);assert.match(text,/TISYA.DATA.SOURCE/);assert.equal((text.match(/ONLY_TABLE_INPUT/g)??[]).length,1);assert.match(text,/Return one strict JSON object/);assert.doesNotMatch(text,/<tisya_result>|首尾各按所选方向|心声：/);assert.doesNotMatch(text,/BOOK_STYLE_ONLY|角色甲|\{mood或null\}/);assert.doesNotMatch(text,/<reply>|<body>|<extra>|<vars/);assert.equal(f.c.chatCompletionSettings.model,'N-model');}finally{globalThis.fetch=prior;}
});

test('managed table activation is included exactly once and native mode keeps native lore untouched',async()=>{
 const f=fixture();await f.host.before('normal');f.host.attachTableContext({world:f.k,text:'TABLE_CONTROL'});f.host.attachTableActivation({world:f.k,text:'ACTIVATED_TABLE_ARCHIVE'});f.host.attachTableActivation({world:f.k,text:'ACTIVATED_TABLE_ARCHIVE'});const p={messages:[{role:'system',content:'UNSELECTED_NATIVE_LORE'}]};await f.host.payloadReady(p);const text=JSON.stringify(p.messages);assert.equal((text.match(/ACTIVATED_TABLE_ARCHIVE/g)??[]).length,1);assert.equal((text.match(/TABLE_CONTROL/g)??[]).length,1);assert(!text.includes('UNSELECTED_NATIVE_LORE'));
 const native=fixture();native.w.context.owner='native';await native.host.before('normal');native.host.attachTableContext({world:native.k,text:'DO_NOT_DUPLICATE'});native.host.attachTableActivation({world:native.k,text:'DO_NOT_DUPLICATE'});const payload={messages:[{role:'system',content:'HOST_ALREADY_INSERTED_TABLE'}]};await native.host.payloadReady(payload);assert.equal(payload.messages.length,1);assert.equal(payload.messages[0].content,'HOST_ALREADY_INSERTED_TABLE');
});

test('managed material slots survive an older disabled empty slot without duplicating source content',async()=>{
 const f=fixture();f.source.order.find(p=>p.identifier==='tisya_material_current_state').enabled=false;await f.host.before('normal');f.host.attachTableContext({world:f.k,instructions:'FORM_INSTRUCTIONS',slots:{state:{rows:[{name:'UNIQUE_CURRENT_ROW'}]},preferences:{explicit:['UNIQUE_HARD_RULE']},plan:{goal:'UNIQUE_PROPOSAL'}}});const payload={messages:[]};await f.host.payloadReady(payload);const text=payload.messages.map(m=>m.content).join('\n');for(const marker of ['UNIQUE_CURRENT_ROW','UNIQUE_HARD_RULE','UNIQUE_PROPOSAL','FORM_INSTRUCTIONS'])assert.equal(text.split(marker).length-1,1);assert(text.indexOf('UNIQUE_CURRENT_ROW')<text.indexOf('[/MATERIALS]'));
});

test('manual auxiliary modes also omit narrative wrappers while main narration keeps them',async()=>{
 const f=fixture();const live=registerLivePreset(f.c,()=>f.source,()=>f.c,()=>{if(f.w.mode!=='narrative')throw Error('辅助模式不应读取表情目录');return MOODS;});registerPresetProtocol(f.c,()=>f.source,()=>{},()=>MOODS,s=>!isLivePreset(s)||live.execution().prose);
 for(const mode of ['archive','plot','preferences','genesis','objects','history']){
  f.w.modes[mode]=structuredClone(f.w.modes.narrative);f.w.mode=mode;await f.host.before('normal');const p={messages:[]};await f.host.payloadReady(p);const text=p.messages.map(m=>m.content).join('\n');assert.match(text,/Return one strict JSON object/,mode);assert.doesNotMatch(text,/<reply>|<body>|<tisya_result>|心声：有内容/,mode);f.host.clear();
 }
 f.w.mode='narrative';await f.host.before('normal');const p={messages:[]};await f.host.payloadReady(p);assert.match(JSON.stringify(p.messages),/<reply>/);
});

test('configuration assistant uses paired JSON route and saved per-task instructions reach only that task',async()=>{
 const f=fixture();f.w.tables={taskInstructions:{tableAssistant:'ASSISTANT_ONLY_SUPPLEMENT',historyImport:'HISTORY_ONLY_SUPPLEMENT'}};const prior=globalThis.fetch;let sent;globalThis.fetch=async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"answer":"可以","changes":[],"backfill":null,"genesisGoal":""}'}}]})};};
 try{await f.host.request('tableAssistant',JSON.stringify({question:'UPDATE_CONFIGURATION_ONCE',configuration:{world:{context:{history:15}}},editablePaths:['/world/context/history'],choices:{},registry:{tables:[],types:[]},currentRows:[],storage:{ready:false},history:[],diagnostics:{jobs:[]}}));let text=JSON.stringify(sent.messages);assert.match(text,/UPDATE_CONFIGURATION_ONCE/);assert.match(text,/ASSISTANT_ONLY_SUPPLEMENT/);assert.doesNotMatch(text,/HISTORY_ONLY_SUPPLEMENT|<reply>|心声：|<vars/);assert.match(text,/editablePaths/);
 await f.host.request('historyImport',JSON.stringify({historyText:'抵达门口',registry:{tables:[],types:[]},currentRows:[]}));text=JSON.stringify(sent.messages);assert.match(text,/HISTORY_ONLY_SUPPLEMENT/);assert.doesNotMatch(text,/ASSISTANT_ONLY_SUPPLEMENT/);
 }finally{globalThis.fetch=prior;}
});

test('RP01 selected initiative reaches the assembled request once across all workflow and output modes',async()=>{
 for(const detail of ['full','compact','format'])for(const level of ['自主互动','主动推进'])for(const structured of [true,false]){
  const f=fixture(),m=f.w.modes.narrative;m.workflowDetail=detail;m.角色主动性=level;
  f.source.order.find(e=>e.identifier==='tisya_output').enabled=structured;
  const saved=JSON.stringify(f.d);await f.host.before('normal');const p={messages:[]};await f.host.payloadReady(p);
  const text=p.messages.map(r=>r.content).join('\n'),c=compileNarrative(f.c,f.source,MOODS);
  assert.equal(text.split('角色主动性·'+level+'：').length-1,1,detail+' '+level+' '+structured);
  assert.doesNotMatch(text,new RegExp('角色主动性·'+(level==='主动推进'?'自主互动':'主动推进')));
  assert.doesNotMatch(text,/allow supported initiative from the character’s own goals|人物保有独立目标、意愿与已有事务/);
  assert.match(text,/不等于玩家已同意/);assert.match(text,/不虚构既往经历/);assert.match(text,/不为主动性强塞冲突/);
  for(const id of ['A01','A02','A04','A05','B06'])assert.ok(text.includes(c.stepwiseRules[id]),detail+' preserves '+id);
  if(level==='主动推进')assert.match(text,/不等待玩家设计大纲或逐项授权 NPC 行动/);
  if(!structured)assert.doesNotMatch(c.rest.entries.tisya_inner_chain,/<reply>/);
  assert.equal(JSON.stringify(f.d),saved,'compilation does not write settings');
 }
});

test('RP01 missing value and disabled dependencies preserve existing compiled protocol',()=>{
 const modifiers=[()=>{},m=>{m.narrative.缇斯亚叙事角色自主=false;},m=>{m.narrative.缇斯亚叙事步序=m.narrative.缇斯亚叙事步序.filter(v=>v!=='人物反应');},m=>{m.narrative.缇斯亚叙事步序=m.narrative.缇斯亚叙事步序.filter(v=>v!=='行动与剧情');},(m,f)=>{f.source.order.find(e=>e.identifier==='tisya_inner_chain').enabled=false;}];
 for(const detail of ['full','compact','format'])for(const [i,change]of modifiers.entries()){
  const f=fixture(),m=f.w.modes.narrative;m.workflowDetail=detail;change(m,f);
  const old=compileNarrative(f.c,f.source,MOODS).rest.entries;
  if(i){m.角色主动性='主动推进';assert.deepEqual(compileNarrative(f.c,f.source,MOODS).rest.entries,old);}
  else{m.角色主动性='主动推进';assert.notDeepEqual(compileNarrative(f.c,f.source,MOODS).rest.entries,old);delete m.角色主动性;assert.deepEqual(compileNarrative(f.c,f.source,MOODS).rest.entries,old);assert.equal(Object.hasOwn(m,'角色主动性'),false);}
 }
});

test('RP01 initiative does not expand outlines, discussion, summaries or auxiliary task requests',async()=>{
 for(const detail of ['full','compact','format'])for(const mode of ['大纲扩写','场外讨论','总结整理']){
  const f=fixture(),m=f.w.modes.narrative;m.workflowDetail=detail;m.narrative.缇斯亚叙事创作模式=mode;
  const old=compileNarrative(f.c,f.source,MOODS).rest.entries;m.角色主动性='主动推进';assert.deepEqual(compileNarrative(f.c,f.source,MOODS).rest.entries,old);
 }
 const f=fixture();f.w.modes.narrative.角色主动性='主动推进';const prior=globalThis.fetch;let sent;
 globalThis.fetch=async(_,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'{"changes":[],"templates":[]}'}}]})};};
 try{await f.host.request('tableArchive',JSON.stringify({archiveSource:{text:'ONLY_TABLE_SOURCE'},registry:{tables:[],types:[]},currentRows:[]}));assert.doesNotMatch(JSON.stringify(sent.messages),/角色主动性·|不等待玩家设计大纲/);}finally{globalThis.fetch=prior;}
});

test('RP01 native preset expansion uses the same initiative without replacing host messages or tools',async()=>{
 const f=fixture();f.w.context.owner='native';f.w.modes.narrative.角色主动性='主动推进';
 await f.host.before('normal');const messages=f.source.order.filter(o=>o.enabled).flatMap(o=>{const p=f.source.prompts.find(p=>p.identifier===o.identifier);return p?.content?[{role:p.role??'system',content:f.c.substituteParams(p.content)}]:[];});
 messages.push({role:'user',content:'我抬眼看了看他。'});const payload={messages,tools:[{type:'function',function:{name:'native_tool'}}],stream:true},before=structuredClone(payload);
 await f.host.payloadReady(payload);assert.deepEqual(payload,before);assert.equal(JSON.stringify(payload.messages).split('角色主动性·主动推进：').length-1,1);
});

test('RP01 UI saves and reopens world-scoped initiative, exposes dependency status and restores legacy without migration',async()=>{
 const f=fixture(),win=new Window(),doc=win.document,box=doc.createElement('div');doc.body.append(box);
 const options={store:f.store,host:f.host,getSettings:()=>({联系人分组:{}}),initialTab:'play'};
 let ui=mountConfiguration(doc,box,options);await ui.ready;let root=ui.root.shadowRoot;
 const choose=value=>{const input=root.querySelector('[aria-label="char 主动性"]');input.value=JSON.stringify(value);input.dispatchEvent(new win.Event('change'));};
 const save=async()=>{root.querySelector('footer button:last-child').click();await new Promise(r=>setTimeout(r,10));};
 assert.equal(root.querySelector('[aria-label="char 主动性"]').value,'""');assert.equal(Object.hasOwn(f.store.read().world.modes.narrative,'角色主动性'),false);
 choose('主动推进');const autonomous=root.querySelector('[aria-label="角色自主"]');autonomous.checked=false;autonomous.dispatchEvent(new win.Event('change'));
 assert.match(root.querySelector('[data-character-initiative-status]').textContent,/角色自主未开启/);await save();
 assert.equal(f.store.read().world.modes.narrative.角色主动性,'主动推进');assert.equal(f.store.read().world.modes.narrative.narrative.缇斯亚叙事角色自主,false);
 ui.dispose();ui=mountConfiguration(doc,box,options);await ui.ready;root=ui.root.shadowRoot;
 assert.equal(root.querySelector('[aria-label="char 主动性"]').value,'"主动推进"');assert.match(root.textContent,/角色自主未开启/);
 const on=root.querySelector('[aria-label="角色自主"]');on.checked=true;on.dispatchEvent(new win.Event('change'));assert.match(root.querySelector('[data-character-initiative-status]').textContent,/已选择主动推进/);
 await save();const category=root.querySelector('[aria-label="配置分类"]');category.value='mode';await category.onchange();const step=root.querySelector('[aria-label="行动与剧情"]');step.checked=false;step.dispatchEvent(new win.Event('change'));await save();category.value='play';await category.onchange();assert.match(root.querySelector('[data-character-initiative-status]').textContent,/行动与剧情未开启/);
 f.c.chatId='other';assert.equal(f.store.read().world.modes.narrative.角色主动性,undefined);f.c.chatId='one';
 choose('');await save();assert.equal(Object.hasOwn(f.store.read().world.modes.narrative,'角色主动性'),false);assert.equal(f.store.read().world.modes.narrative.narrative.缇斯亚叙事步序.includes('行动与剧情'),false);
 ui.dispose();await win.happyDOM.abort();
});

test('RP01 config backup round-trips explicit levels and invalid stored values fail without replacing settings',async()=>{
 const {cleanExport,validateConfig}=await import('../config/core.js');const f=fixture();
 for(const level of ['自主互动','主动推进']){const s=f.store.read();s.world.modes.narrative.角色主动性=level;await f.store.save(s.data,s.revision,s.key);const restored=validateConfig(JSON.parse(JSON.stringify(cleanExport(f.store.read().data))).configuration);assert.equal(restored.worlds[f.k].modes.narrative.角色主动性,level);}
 const saved=f.store.read().revision;
 for(const value of ['',null,false,0,[],{},'随机剧情']){const s=f.store.read();s.world.modes.narrative.角色主动性=value;await assert.rejects(f.store.save(s.data,s.revision,s.key),/角色主动性选项无效/);assert.equal(f.store.read().revision,saved);}
});

test('OOC uses isolated identity and literal feedback with native API, without narrative instructions or tools',async()=>{const f=fixture(),saved=globalThis.fetch;let sent;globalThis.fetch=async(_,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'场外答复'},finish_reason:'stop'}]})};};try{const result=await f.host.request('communication',{format:'tisya.communication-input/1',text:'继续多写一点',history:[],reference:{text:'旧稿'}});assert.equal(result,'场外答复');assert.equal(sent.model,'N-model');assert.equal(sent.stream,false);const joined=JSON.stringify(sent.messages);assert.match(joined,/场外交流/);assert.doesNotMatch(joined,/WORLDINFO|<reply>/);for(const marker of ['[TASK.START]','[INNER.LOGIN]','[MODE.ANALYZE]','[COMMIT.READY]','[PREPARE_STEP]'])assert(joined.includes(marker));assert.equal(JSON.parse(sent.messages.find(m=>m.content.startsWith('[SOURCE]')).content.split('\n').slice(1,-1).join('\n')).text,'继续多写一点');assert.equal(sent.messages.at(-1).role,'system');const before=sent;await assert.rejects(f.host.request('communication',{format:'bad',text:'不得发送'}),/场外交流输入无效/);assert.equal(sent,before);}finally{globalThis.fetch=saved;}});
test('revision directives reach both native and controlled payload without mutating original source',async()=>{for(const owner of ['native','tisya']){const f=fixture();f.w.context.owner=owner;const request={source:'旧稿',direction:'多些互动',details:'主动提出条件',mode:'whole',selected:[],paragraphs:[{id:1,raw:'旧稿'}]};f.host.setRevision(request);await f.host.before('swipe');const p={messages:[{role:'user',content:'RP'}]};await f.host.payloadReady(p);const last=JSON.parse(p.messages.at(-1).content);assert.equal(last.kind,'revision-material');assert.equal(last.details,'主动提出条件');assert.equal(request.source,'旧稿');f.host.setRevision(null);f.host.clear();await f.host.before('normal');const clean={messages:[{role:'user',content:'下一轮'}]};await f.host.payloadReady(clean);assert.doesNotMatch(JSON.stringify(clean.messages),/revision-material/);}});

test('both context owners await saved turn directions and block a failed binding',async()=>{
 for(const owner of ['native','tisya']){
  let release,started;const entering=new Promise(resolve=>started=resolve);
  const f=fixture({getContractorMessages:()=>{started();return new Promise(resolve=>release=resolve);}});f.w.context.owner=owner;
  await f.host.before('normal');const p={messages:[{role:'user',content:'角色行动'}]};let done=false;
  const pending=f.host.payloadReady(p).then(()=>done=true);await entering;assert.equal(done,false);
  release(contractorMessages('只写现场回应'));await pending;
  const note=p.messages.find(m=>m.role==='user'&&m.content.includes('tisya.turn-direction/1'));
  assert.equal(JSON.parse(note.content).text,'只写现场回应');assert.match(p.messages.find(m=>m.role==='system'&&m.content.includes('本轮输入分两块')).content,/不是角色台词/);
  const bad=fixture({getContractorMessages:async()=>{throw Error('消息要求未保存');}});bad.w.context.owner=owner;await bad.host.before('normal');const failed={messages:[{role:'user',content:'角色行动'}]};await assert.rejects(bad.host.payloadReady(failed),/未保存/);assert.throws(()=>JSON.stringify(failed));
 }
});
test('display page exposes canonical loading settings and protects unsaved loading drafts',async()=>{
 const {createChatLoadingController}=await import('../chat-loading.js'),f=fixture(),win=new Window(),doc=win.document,container=doc.createElement('div'),native={chat_truncation:100};doc.body.append(container);
 const ui=mountConfiguration(doc,container,{store:f.store,host:f.host,getSettings:()=>({}),initialTab:'theme',chatLoading:createChatLoadingController({powerUser:native,persist:async()=>true,clearCache:async()=>{}}),onClose(){},onNative(){}});await ui.ready;const root=ui.root.shadowRoot,click=text=>[...root.querySelectorAll('button')].find(n=>n.textContent===text).click(),settle=()=>new Promise(r=>setTimeout(r,10));
 click('聊天首批条数与缓存');await settle();click('设为 10 条');const select=root.querySelector('[aria-label="配置分类"]');select.value='mode';select.onchange();await settle();assert.equal(root.querySelector('[aria-label="首批消息条数"]').value,'10');assert.equal(ui.requestLeave().allowed,false);assert.match(root.textContent,/保存或放弃当前/);click('保存配置');await settle();assert.equal(native.chat_truncation,10);assert.equal(ui.requestLeave().allowed,true);ui.dispose();await win.happyDOM.abort();
});
test('parent settled and leave reason include a pending cache subpage operation',async()=>{
 const {createChatLoadingController}=await import('../chat-loading.js'),f=fixture(),win=new Window(),doc=win.document,container=doc.createElement('div');doc.body.append(container);let finish;
 const ui=mountConfiguration(doc,container,{store:f.store,host:f.host,getSettings:()=>({}),initialTab:'theme',chatLoading:createChatLoadingController({powerUser:{chat_truncation:10},persist:async()=>true,clearCache:()=>new Promise(r=>finish=r)}),onClose(){},onNative(){}});await ui.ready;const root=ui.root.shadowRoot,click=text=>[...root.querySelectorAll('button')].find(n=>n.textContent===text).click();click('聊天首批条数与缓存');await ui.settled();click('清理显示缓存');let settled=false;const promise=ui.settled().then(()=>settled=true);await new Promise(r=>setTimeout(r,5));assert.equal(settled,false);assert.equal(ui.requestLeave().allowed,false);assert.match(ui.requestLeave().reason,/处理/);finish();await promise;assert.equal(ui.requestLeave().allowed,true);ui.dispose();await win.happyDOM.abort();
});


test('edited user comparison reaches full native and controlled requests then clears for ordinary send',async()=>{
 for(const owner of ['native','tisya']){const f=fixture();f.w.context.owner=owner;f.c.chat[0].mes='我留下等他解释。';await f.host.before('swipe');const baseline={messages:[{role:'user',content:f.c.chat[0].mes}]};await f.host.payloadReady(baseline);f.host.clear();f.host.setUserRevision({messageId:0,previous:'我离开。',current:f.c.chat[0].mes});await f.host.before('swipe');const payload={messages:[{role:'user',content:f.c.chat[0].mes}]};await f.host.payloadReady(payload);
 const material=JSON.parse(payload.messages.at(-1).content);assert.deepEqual(material,{kind:'user-rewrite-material',previous:'我离开。',current:f.c.chat[0].mes});assert.equal(JSON.stringify(payload.messages).split('user-rewrite-material').length-1,2);assert.deepEqual(f.host.preview().messages,payload.messages);assert.deepEqual(payload.messages.slice(0,-2),baseline.messages);
 if(process.env.TISYA_REQUEST_EVIDENCE){fs.mkdirSync(process.env.TISYA_REQUEST_EVIDENCE,{recursive:true});fs.writeFileSync(process.env.TISYA_REQUEST_EVIDENCE+'/'+owner+'-request.json',JSON.stringify({environment:'production createHost, isolated host fixture; no model call',baseline,reroll:payload},null,2));}
 f.host.clear();await f.host.before('normal');const clean={messages:[{role:'user',content:f.c.chat[0].mes}]};await f.host.payloadReady(clean);assert.doesNotMatch(JSON.stringify(clean.messages),/user-rewrite-material|我离开/);
 }
});
test('late user edit invalidates comparison before request serialization',async()=>{
 const f=fixture();f.w.context.owner='native';f.host.setUserRevision({messageId:0,previous:'OLD',current:f.c.chat[0].mes});await f.host.before('swipe');f.c.chat[0].mes='LATE';const payload={messages:[]};await assert.rejects(f.host.payloadReady(payload),/改写依据已变化/);assert.throws(()=>JSON.stringify(payload));f.host.clear();
});

test('native swipe and regenerate also use the edited user pair, with no leakage into ordinary send after missing end event',async()=>{
 for(const type of ['swipe','regenerate']){const f=fixture();f.w.context.owner='native';const user=f.c.chat[0],h=createUserEditHistory();h.begin(user);user.mes='本次方向';h.commit(user);f.c.chat.push({mes:'旧角色回复'});await f.host.before(type);const p={messages:[{role:'user',content:user.mes}]};await f.host.payloadReady(p);assert.equal(JSON.parse(p.messages.at(-1).content).previous,'继续');await f.host.before('normal');const clean={messages:[]};await f.host.payloadReady(clean);assert.doesNotMatch(JSON.stringify(clean),/user-rewrite-material/);}
});

test('play language controls save exact default and independent dialogue settings without duplicate advanced owners',async()=>{
 const f=fixture(),win=new Window(),box=win.document.createElement('div');win.document.body.append(box);let ui=mountConfiguration(win.document,box,{store:f.store,host:f.host,initialTab:'play'});await ui.ready;let root=ui.root.shadowRoot;
 const set=(label,value,checked=false)=>{const input=root.querySelector('[aria-label="'+label+'"]');checked?input.checked=value:input.value=value;input.dispatchEvent(new win.Event('change'));};
 assert.equal(root.querySelector('.tisya-config-categories').open,false);assert.equal(root.querySelector('[aria-label="角色对白双语对照"]').checked,false);assert.equal(f.w.modes.narrative.角色对白,undefined);
 set('默认语言','"other"');assert.equal(root.querySelector('[aria-label="填写默认语言"]').closest('label').hidden,false);set('填写默认语言','日本語');set('角色对白双语对照',true,true);set('对白原语','"指定语言"');set('填写对白语言','Italiano');root.querySelector('footer button:last-child').click();await new Promise(r=>setTimeout(r,20));
 let mode=f.store.read().world.modes.narrative;assert.equal(mode.narrative.缇斯亚叙事语言,'指定单语');assert.deepEqual(mode.narrative.缇斯亚叙事语言配置,['日本語']);assert.deepEqual(mode.角色对白,{启用:true,来源:'指定语言',语言:'Italiano'});ui.dispose();
 ui=mountConfiguration(win.document,box,{store:f.store,host:f.host,initialTab:'play'});await ui.ready;root=ui.root.shadowRoot;assert.equal(root.querySelector('[aria-label="填写默认语言"]').value,'日本語');assert.equal(root.querySelector('[aria-label="填写对白语言"]').value,'Italiano');
 set('角色对白双语对照',false,true);root.querySelector('footer button:last-child').click();await new Promise(r=>setTimeout(r,20));mode=f.store.read().world.modes.narrative;assert.equal(mode.角色对白.启用,false);assert.deepEqual(mode.narrative.缇斯亚叙事语言配置,['日本語']);
 const select=root.querySelector('[aria-label="配置分类"]');select.value='world';select.dispatchEvent(new win.Event('change'));await ui.ready;await new Promise(r=>setTimeout(r,10));assert.equal(root.querySelector('[aria-label="语言"]'),null);assert.equal(root.querySelector('[aria-label="默认语言"]'),null);ui.dispose();await win.happyDOM.abort();
});

test('custom language and optional dialogue reach complete actual requests for all workflow detail levels',async()=>{
 for(const detail of ['full','compact','format'])for(const source of ['角色与环境','指定语言']){
  const f=fixture(),m=f.w.modes.narrative;m.workflowDetail=detail;m.narrative.缇斯亚叙事语言='指定单语';m.narrative.缇斯亚叙事语言配置=['日本語'];m.角色对白={启用:true,来源:source,语言:'Italiano'};
  await f.host.before('normal');const payload={messages:[]};await f.host.payloadReady(payload);const text=JSON.stringify(payload.messages),inner=f.macros.get('tisya_live_tisya_inner_chain')();
  assert.match(text,/默认语言/);assert.match(text,/日本語/);assert.match(text,/角色对白双语对照/);assert.match(text,/旁白不做双语复制/);assert.match(text,/译文服务读者/);assert.match(text,/情话、称呼、祷词与咒语/);assert.equal(inner.split('角色对白双语对照：').length-1,1,detail);
  assert.doesNotMatch(text,/\{语言\}|\{语言一\}|\{语言二\}/);if(source==='指定语言')assert.match(text,/Italiano/);else{assert.match(text,/不凭姓名、外貌或族裔猜测母语/);assert.doesNotMatch(text,/Italiano/);}
  m.角色对白.启用=false;await f.host.before('normal');const off={messages:[]};await f.host.payloadReady(off);assert.doesNotMatch(JSON.stringify(off),/角色对白双语对照：|Italiano/);assert.match(JSON.stringify(off),/不自动增加逐句双语/);
 }
});

test('language changes validate missing names and do not mutate legacy bilingual configuration just by opening',async()=>{
 const f=fixture(),m=f.w.modes.narrative;m.narrative.缇斯亚叙事语言='双语对白';m.narrative.缇斯亚叙事语言配置=['Latin','繁体中文'];const before=JSON.stringify(f.d),win=new Window(),box=win.document.createElement('div');win.document.body.append(box);const ui=mountConfiguration(win.document,box,{store:f.store,host:f.host,initialTab:'play'});await ui.ready;assert.equal(JSON.stringify(f.d),before);assert.match(ui.root.shadowRoot.textContent,/已保留旧版双语设置/);ui.dispose();await win.happyDOM.abort();
 const snapshot=f.store.read(),draft=structuredClone(snapshot.data);draft.worlds[f.k].modes.narrative.角色对白={启用:true,来源:'指定语言',语言:''};await assert.rejects(f.store.save(draft,snapshot.revision,snapshot.key),/填写角色对白/);assert.equal(JSON.stringify(f.d),before);
 draft.worlds[f.k].modes.narrative.角色对白.启用=false;draft.worlds[f.k].modes.narrative.narrative.缇斯亚叙事语言='指定单语';draft.worlds[f.k].modes.narrative.narrative.缇斯亚叙事语言配置=[''];await assert.rejects(f.store.save(draft,snapshot.revision,snapshot.key),/填写默认语言/);
});

test('bilingual language survives native request observation and plain prose without replacing native history',async()=>{
 for(const plain of [false,true]){const f=fixture(),m=f.w.modes.narrative;f.w.context.owner='native';m.narrative.缇斯亚叙事语言='繁体中文';m.角色对白={启用:true,来源:'角色与环境',语言:''};if(plain)f.source.order.find(e=>e.identifier==='tisya_output').enabled=false;
 await f.host.before('normal');const inner=f.macros.get('tisya_live_tisya_inner_chain')(),payload={messages:[{role:'system',content:inner},{role:'user',content:'原生历史和本轮输入'}],model:'native-model',stream:true};const before=structuredClone(payload);await f.host.payloadReady(payload);assert.deepEqual(payload,before);assert.match(inner,/繁体中文/);assert.match(inner,/角色对白双语对照/);assert.equal(inner.split('角色对白双语对照：').length-1,1);if(plain)assert.match(inner,/ordinary public prose only/);
 if(process.env.TISYA_LANGUAGE_EVIDENCE)fs.writeFileSync(process.env.TISYA_LANGUAGE_EVIDENCE+(plain?'/native-plain-request.json':'/native-structured-request.json'),JSON.stringify(payload,null,2));
 }
});

test('one configuration footer saves or discards cached theme drafts across pages and retains failed saves',async()=>{
 const f=fixture(),win=new Window(),doc=win.document,box=doc.createElement('div');doc.body.append(box);let settings={},fail=false,writes=0;
 const ui=mountConfiguration(doc,box,{store:f.store,host:f.host,getSettings:()=>settings,saveAppearance:async(id,value)=>{if(fail)throw Error('host save failed');writes++;settings={...settings,显示区块:{...settings.显示区块,[id]:value}};},initialTab:'theme'});await ui.ready;const root=ui.root.shadowRoot,theme=()=>root.querySelector('.tisya-theme-workbench')?.shadowRoot;
 assert.equal(theme().querySelectorAll('footer button').length,1); // download cancellation only, no duplicate save/discard
 const choose=async(name)=>{[...theme().querySelectorAll('.theme-card')].find(n=>n.textContent.includes(name)).click();await ui.settled();};
 const page=async(name)=>{const n=root.querySelector('[aria-label="配置分类"]');n.value=name;n.onchange();await ui.settled();};
 await choose('明潮');assert.equal(settings.显示区块,undefined);await page('mode');assert.equal(ui.requestLeave().allowed,false);await page('theme');assert.equal(theme().querySelector('.theme-card[aria-pressed=true]').textContent.includes('明潮'),true);
 root.querySelector('footer button:last-child').click();await ui.settled();assert.equal(settings.显示区块.extensions.底图色调,'明潮');assert.equal(writes,1);assert.equal(ui.requestLeave().allowed,true);
 await choose('墨绿 · 动态');fail=true;root.querySelector('footer button:last-child').click();await ui.settled();assert.equal(settings.显示区块.extensions.底图色调,'明潮');assert.equal(ui.requestLeave().allowed,false);assert.match(root.textContent,/保存未完成/);
 fail=false;root.querySelector('footer button:last-child').click();await ui.settled();assert.equal(settings.显示区块.extensions.底图色调,'墨绿水域');assert.equal(ui.requestLeave().allowed,true);
 await choose('明潮');await page('mode');root.querySelector('footer button:nth-of-type(1)').click();await ui.settled();await page('theme');assert.equal(theme().querySelector('.theme-card[aria-pressed=true]').textContent.includes('墨绿 · 动态'),true);assert.equal(ui.requestLeave().allowed,true);
 ui.dispose();await win.happyDOM.abort();
});
