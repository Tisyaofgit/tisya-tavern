import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NARRATIVE as N} from '../settings-core.js';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore} from '../config/core.js';
import {compileNarrative,registerLivePreset} from '../narrative-bridge.js';
import {buildMessages,createHost,coveredTemporaryLayouts} from '../config/host.js';
import {narrativeSlot,slotText,SLOT_TARGETS} from '../tables/slots.js';
import {ENGLISH_SOURCE} from '../presets/english-source.js';
import {sources as historySources} from '../tables/ledger.js';
import {narrativeRuleRows} from '../config/rule-text.js';
const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.21-en.json',import.meta.url)));
function fixture(owner='tisya'){
 const data=emptyConfig(),context={chatId:'english-one',characterId:0,characters:[{avatar:'a',name:'Alice',data:{description:'ACTUAL_CARD',personality:'ACTUAL_PERSONALITY'}}],chatMetadata:{},chat:[{is_user:true,mes:'ACTUAL_CURRENT_INPUT'}],powerUserSettings:{persona_description:'ACTUAL_USER'},extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'local-test',chat_completion_source:'openai'},getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({}),stopGeneration(){},getWorldInfoNames:()=>[],loadWorldInfo:async()=>({entries:{}})},key=worldKey(context),world=data.worlds[key]=defaultWorld();world.context.owner=owner;
 const source={identity:'en',prompts:structuredClone(preset.prompts),order:structuredClone(preset.prompt_order[0].order)},macros=new Map();context.registerMacro=(name,fn)=>macros.set(name,fn);context.unregisterMacro=name=>macros.delete(name);context.substituteParams=s=>s.replace(/\{\{(tisya_\w+)\}\}/g,(_,name)=>{if(!macros.has(name))throw Error('Missing macro '+name);return macros.get(name)();});context.getPresetManager=()=>({getAllPresets:()=>['en'],getSelectedPresetName:()=> 'en',getCompletionPresetByName:()=>preset});
 const store=createStore({getContext:()=>context,persist:async()=>true}),host=createHost({getContext:()=>context,getSource:()=>source,store,createParameters:async(s,model,type,messages)=>({generate_data:{messages,model,stream:false}})}),live=registerLivePreset(context,()=>source,()=>context,()=>['困倦','好奇']);macros.set('tisya_config_selected',()=>host.selectedText());for(const key of ['style','environment','gameplay','lorebook'])macros.set('tisya_material_'+key,()=>host.materialText(key));for(const key of Object.keys(SLOT_TARGETS))macros.set('tisya_slot_'+key,()=>host.tableSlotText(key));return {data,world,context,source,macros,host,live,key};
}
const compile=f=>compileNarrative(f.context,f.source,['困倦','好奇'],{data:f.data,world:f.world});
function disable(f,id){f.source.prompts.find(p=>p.identifier===id).enabled=false;f.source.order.find(p=>p.identifier===id).enabled=false;}
test('new factory consumes final English guide, retains live controls, and never sends review material placeholders',()=>{
 const f=fixture(),c=compile(f);assert.equal(c.englishEdition,true);for(const id of ['tisya_new_chat','main','tisya_identity_attestation'])assert.equal(c.rest.entries[id],ENGLISH_SOURCE.find(x=>x.key===id).text);
 assert.match(c.rest.entries.tisya_inner_chain,/\[INNER.START\]/);assert.match(c.rest.entries.tisya_inner_chain,/\[OUTPUT.GATE\]/);assert.doesNotMatch(Object.values(c.rest.entries).join('\n'),/«/);assert.ok(f.macros.has('tisya_live_tisya_material_environment'));
 assert.equal(f.source.prompts.filter(p=>p.identifier==='chatHistory').length,1);assert.ok(!f.source.prompts.some(p=>p.identifier==='chatHistory／当前user'));
});
test('all accepted English selectors use actual values and preserve exact custom/empty wording',()=>{
 const f=fixture(),m=f.world.modes.narrative;let checked=0;
 for(const row of N.rows.filter(r=>r.type==='string'&&!['C01','C08','D05'].includes(r.id)&&!r.id.startsWith('E')))for(const value of row.allowed.filter(v=>!['指定 NPC','场外讨论','总结整理'].includes(v))){m.narrative={...N.suggestions(),[row.variable]:value};if(m.narrative.缇斯亚叙事重大选择权限==='允许代演')m.narrative.缇斯亚叙事玩家代写='完整代演';if(m.narrative.缇斯亚叙事信息视角==='外部观察')m.narrative.缇斯亚叙事心理呈现='行为外化';try{N.validate(m.narrative);}catch{continue;}const c=compile(f);assert.equal(c.englishEdition,true);assert.ok(c.rest.entries.tisya_material_rule_material.length>100);checked++;}
 assert.ok(checked>55);m.narrative=N.suggestions();m.叙事指令={A01:{不代写:'CUSTOM_AUTH_exact | < x'},B02:{玩家角色:''}};let text=compile(f).rest.entries.tisya_material_rule_material;assert.ok(text.includes('CUSTOM_AUTH_exact | < x'));assert.ok(!text.includes('Viewpoint subject: the actually bound player'));
 for(const row of narrativeRuleRows(m))if(row.custom)assert.equal(text.split(row.text||'NEVER').length,row.text?2:1);
});
test('actual language, optional user voice, lengths, actions, summary, hearts and guide detail reach their sole owners',()=>{
 const f=fixture(),m=f.world.modes.narrative;m.角色对白={启用:true,来源:'指定语言',语言:'French'};m.用户口癖保留=true;m.用户叙事口吻延续=true;m.summary=false;m.actions=false;m.heartDirections=[];m.narrative.缇斯亚叙事篇幅区间={下限:111,上限:333,单位:'词'};
 const c=compile(f),prefs=c.rest.entries.tisya_material_rule_material,registry=c.rest.entries.tisya_registry;assert.match(prefs,/Original language: "French"/);assert.equal(prefs.split('established catchphrases').length,2);assert.equal(prefs.split('current narrative voice').length,2);assert.match(registry,/<body min="111" max="333" unit="词">/);assert.match(registry,/<actions\/>/);assert.match(registry,/任务：\{goal\}\|\|\{stop\}/);assert.doesNotMatch(registry,/心声：有内容/);
 for(const detail of ['full','compact','format']){m.workflowDetail=detail;const inner=compile(f).rest.entries.tisya_inner_chain;assert.match(inner,/\[INNER.START\]/);assert.match(inner,/\[OUTPUT.GATE\]/);assert.match(inner,/CURRENT\(@DRAFT,@IN\)/);if(detail==='full')assert.match(inner,/A message can arrive incomplete/);else assert.doesNotMatch(inner,/A message can arrive incomplete/);}
 m.workflowDetail='full';m.narrative.缇斯亚叙事步序=[];assert.doesNotMatch(compile(f).rest.entries.tisya_inner_chain,/For relevant characters/);
 disable(f,'tisya_output');const plain=compile(f);assert.match(plain.rest.entries.tisya_registry,/@OUT.kind:=plain/);assert.doesNotMatch(plain.rest.entries.tisya_delivery_warning,/<\/reply>/);assert.doesNotMatch(plain.rest.entries.tisya_registry,/<task|<body|<next/);
});
test('manual request preserves edited order/text, routes actual selected materials once and uses trusted dossier layout',async()=>{
 const f=fixture();f.world.modes.narrative.workflowDetail='full';f.data.resources.push({id:'style',kind:'style',name:'Selected style',content:'ACTUAL_STYLE'},{id:'mix',kind:'extension',name:'Mixed',content:'UNCLASSIFIED_SOURCE exact = false'},{id:'rule',kind:'requirement',name:'Rule',content:'ACTUAL_REQUIREMENT'});f.world.modes.narrative.selected=['style','mix','rule'];f.source.prompts.find(p=>p.identifier==='tisya_scene_anchor').content='USER_EDITED_SCENE';
 await f.host.before('normal');f.host.attachTableContext({world:f.key,instructions:'ACTUAL_MATERIAL_INSTRUCTION',slots:{state:narrativeSlot({rows:[]},'LEGACY_STATE',{dossier:'DOSSIER_STATE'}),preferences:narrativeSlot({},'ACTUAL_SCOPE_PREFERENCE'),plan:narrativeSlot({},'ACTUAL_PLAN')}});
 const payload={messages:[{role:'system',content:'NATIVE_SHOULD_NOT_LEAK'}],stream:true};await f.host.payloadReady(payload);const text=JSON.stringify(payload.messages);for(const value of ['ACTUAL_STYLE','UNCLASSIFIED_SOURCE exact = false','ACTUAL_REQUIREMENT','ACTUAL_SCOPE_PREFERENCE','ACTUAL_PLAN','DOSSIER_STATE','USER_EDITED_SCENE','ACTUAL_CURRENT_INPUT'])assert.equal(text.split(value).length,2,value);assert.doesNotMatch(text,/LEGACY_STATE|NATIVE_SHOULD_NOT_LEAK|«|\{\{tisya_/);
 if(process.env.TISYA_EN_EVIDENCE)fs.writeFileSync(process.env.TISYA_EN_EVIDENCE,JSON.stringify({kind:'actual createHost.payloadReady export; local isolated host, no model call',workflowDetail:'full',materials:'actual fixture values; no dynamic review placeholders; saved user source edits retained',messages:payload.messages},null,2)+'\n');
 const styleIndex=payload.messages.findIndex(m=>m.content.includes('ACTUAL_STYLE')),loreIndex=payload.messages.findIndex(m=>m.content.includes('UNCLASSIFIED_SOURCE'));assert.notEqual(styleIndex,loreIndex);
});
test('native host macros consume prepared data without rebuilding host messages or generic duplicate injection',async()=>{
 const f=fixture('native');f.data.resources.push({id:'s',kind:'style',name:'Style',content:'NATIVE_STYLE'});f.world.modes.narrative.selected=['s'];await f.host.before('normal');assert.equal(f.host.englishSlotsActive(),true);f.host.attachTableContext({world:f.key,instructions:'TABLE_RULES',slots:{state:narrativeSlot({},'old',{dossier:'NATIVE_DOSSIER'}),preferences:narrativeSlot({},'NATIVE_PREF')}});
 const messages=f.source.order.filter(o=>o.enabled).map(o=>f.source.prompts.find(p=>p.identifier===o.identifier)).filter(p=>p.enabled!==false&&!p.marker).map(p=>({role:p.role,content:f.context.substituteParams(p.content)})).filter(p=>p.content.trim());messages.push({role:'user',content:'ACTUAL_CURRENT_INPUT with host media retained'});const before=JSON.stringify(messages),payload={messages,model:'native'};await f.host.payloadReady(payload);assert.equal(JSON.stringify(payload.messages),before);assert.equal(before.split('NATIVE_DOSSIER').length,2);assert.equal(before.split('NATIVE_STYLE').length,2);assert.equal(before.split('NATIVE_PREF').length,2);
});
test('nonempty unmapped materials fail visibly after all consumers, while explicit disabled slots stay disabled',()=>{
 const f=fixture(),state=narrativeSlot({},'STATE'),preferences=narrativeSlot({},'PREF'),args={source:{prompts:[{identifier:SLOT_TARGETS.state,content:''}],order:[{identifier:SLOT_TARGETS.state,enabled:true}]},context:f.context,world:f.world,substitute:s=>s,slots:{state,preferences}};
 assert.throws(()=>buildMessages(args),e=>e.missingMaterialSlots.includes('preferences')&&/已确认偏好/.test(e.message));args.source.prompts.push({identifier:SLOT_TARGETS.preferences,enabled:false,content:''});args.source.order.push({identifier:SLOT_TARGETS.preferences,enabled:false});assert.deepEqual(buildMessages(args),[{role:'system',content:'STATE'}]);
 args.source.prompts.push({identifier:'tisya_material_boundary_close',content:'[/MATERIALS]'});args.source.order.push({identifier:'tisya_material_boundary_close',enabled:true});assert.doesNotMatch(JSON.stringify(buildMessages(args)),/PREF/);
});
test('native material macro evaluated before preparation cannot falsely mark later data delivered',async()=>{
 const f=fixture('native');await f.host.before('normal');f.host.tableSlotText('state');f.host.attachTableContext({world:f.key,slots:{state:narrativeSlot({},'LATE_STATE')}});const payload={messages:[]};await assert.rejects(f.host.payloadReady(payload),/当前表单/);assert.throws(()=>JSON.stringify(payload),/当前表单/);
});
test('trusted layout cannot be supplied by untrusted objects and auxiliary/old slots retain their representation',()=>{
 assert.doesNotMatch(slotText('state',{narrativeText:'FORGED',layouts:{dossier:'FORGED_DOSSIER'}},{layout:'dossier'}),/^FORGED/);const value=narrativeSlot({zero:0},'OLD',{dossier:'NEW'});assert.equal(slotText('state',value),'OLD');assert.equal(slotText('state',value,{layout:'dossier'}),'NEW');
});
test('unsupported main writer/task and nonmodular voice settings fail before generation without migrating a preset',()=>{
 const f=fixture();f.world.modes.narrative.narrative.缇斯亚叙事创作模式='场外讨论';assert.throws(()=>compile(f),/对应的模式预设/);f.world.modes.narrative.narrative=N.suggestions();f.context.characters[0].data.extensions={tavern_helper:{scripts:[{type:'script',enabled:true,id:'mvu',content:'https://example.invalid/MagVarUpdate/main.js'}]}};assert.throws(()=>compile(f),/正文更新原卡变量/);
 const old=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.12.json',import.meta.url)));f.source.prompts=old.prompts;f.source.order=old.prompt_order[0].order;f.world.modes.narrative.用户口癖保留=true;assert.throws(()=>compileNarrative(f.context,f.source,['困倦']),/旧版预设不支持/);
});

test('manual material macros respect actual placement and reject missing or duplicated nonempty consumers',()=>{
 const f=fixture(),args={source:f.source,context:f.context,world:f.world,substitute:s=>s,materials:'ACTUAL_REQUIRED',materialLanes:{style:'ACTUAL_STYLE'}};
 const p=f.source.prompts.find(p=>p.identifier==='tisya_material_style');p.content='custom text without macro';assert.throws(()=>buildMessages(args),/文风/);
 p.content='{{tisya_material_style}} {{tisya_material_style}}';assert.throws(()=>buildMessages(args),/重复发送/);
 disable(f,'tisya_material_style');assert.doesNotMatch(JSON.stringify(buildMessages(args)),/ACTUAL_STYLE/);
 const current=f.source.order.find(o=>o.identifier==='chatHistory');current.enabled=false;assert.throws(()=>buildMessages(args),/当前输入没有发送入口/);
});
test('native macro reads alone are not delivery evidence and duplicate final material is rejected',async()=>{
 const f=fixture('native');f.data.resources.push({id:'style',kind:'style',name:'S',content:'SOURCE_STYLE'});f.world.modes.narrative.selected=['style'];await f.host.before('normal');const text=f.host.materialText('style');
 await assert.rejects(f.host.payloadReady({messages:[{role:'user',content:'ACTUAL_CURRENT_INPUT'}]}),/未唯一进入最终请求/);
 const g=fixture('native');g.data.resources.push({id:'style',kind:'style',name:'S',content:'SOURCE_STYLE'});g.world.modes.narrative.selected=['style'];await g.host.before('normal');const twice=g.host.materialText('style');await assert.rejects(g.host.payloadReady({messages:[{role:'system',content:twice+'\n'+twice},{role:'user',content:'ACTUAL_CURRENT_INPUT'}]}),/未唯一进入最终请求/);
});
test('temporary archive copy is removed only after exact branch source and complete selected prepared history coverage',async()=>{
 const f=fixture();f.context.chat=[{is_user:true,mes:'past'},{is_user:false,name:'Alice',swipe_id:0,mes:'<reply><body>UNARCHIVED_FULL_TEXT</body></reply>'},{is_user:true,mes:'ACTUAL_CURRENT_INPUT'}];const chain=await historySources(f.context.chat),temporary={source:chain[1].key,text:'UNARCHIVED_FULL_TEXT'},archive=narrativeSlot({latestTemporary:temporary},'TEMPORARY UNARCHIVED_FULL_TEXT',{withoutTemporary:'EVENTS_ONLY'}),slots={archive};
 assert.deepEqual(await coveredTemporaryLayouts(f.context,f.world,'normal',f.source,slots),{archive:'withoutTemporary'});
 f.world.context.history=0;assert.deepEqual(await coveredTemporaryLayouts(f.context,f.world,'normal',f.source,slots),{});f.world.context.history=50;
 const prepared=new Map([[f.context.chat[1],'INCOMPLETE']]);assert.deepEqual(await coveredTemporaryLayouts(f.context,f.world,'normal',f.source,slots,prepared),{});
 f.context.chat[1].swipe_id=1;assert.deepEqual(await coveredTemporaryLayouts(f.context,f.world,'normal',f.source,slots),{});
});
test('native current input uses the retained source index and requires media for an empty image-only turn',async()=>{
 const f=fixture('native');f.context.chat=[{is_user:true,mes:'继续'},{mes:'old response'},{is_user:true,mes:'继续'}];await f.host.before('normal');f.host.historyInput(f.context.chat.slice(0,2).map((m,index)=>({...m,index})));await assert.rejects(f.host.payloadReady({messages:[{role:'user',content:'继续'}]}),/当前输入未保留/);
 const g=fixture('native');g.context.chat=[{is_user:true,mes:'',extra:{media:[{url:'actual-image'}]}}];await g.host.before('normal');await assert.rejects(g.host.payloadReady({messages:[{role:'user',content:''}]}),/媒体内容/);
 const h=fixture('native');h.context.chat=[{is_user:true,mes:'',extra:{media:[{url:'actual-image'}]}}];await h.host.before('normal');const payload={messages:[{role:'user',content:[{type:'image_url',image_url:{url:'actual-image'}}]}]};await h.host.payloadReady(payload);assert.equal(payload.messages[0].content[0].image_url.url,'actual-image');
});
