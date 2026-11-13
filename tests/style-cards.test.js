import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Window} from 'happy-dom';
import {STYLE_CARDS,styleProjection,viewSelection} from '../config/style-cards.js';
import {KEY,emptyConfig,defaultWorld,compileSelected,validateConfig,cleanExport,resources,createStore,worldKey} from '../config/core.js';
import {createHost} from '../config/host.js';
import {registerLivePreset} from '../narrative-bridge.js';
import {registerPresetProtocol} from '../preset.js';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';import {onePassEntries} from '../onepass/preset.mjs';
import {mountActionChoice} from '../actions.js';
test('three cards resolve independently, expand viewpoint fields, survive backup, and leave unselected lenses absent',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;
 assert.equal(compileSelected(d,w).text,'');assert.equal(w.styleCards,undefined);
 w.styleCards={tone:'builtin.card.tone.tender',view:'builtin.card.view.female',sentence:'builtin.card.sentence.subtext'};
 w.parameters[w.styleCards.view]={direction:'char 凝视 user',focus:'声音与手部'};
 validateConfig(d);const text=compileSelected(d,w,'main',{labels:true}).text;
 assert.match(text,/基调卡/);assert.match(text,/视角卡/);assert.match(text,/句式卡/);assert.match(text,/char→user/);assert.match(styleProjection(w),/声音与手部/);assert.ok(!text.includes('${'));assert.ok(!text.includes('男凝·视觉欲望'));
 const restored=JSON.parse(JSON.stringify(cleanExport(d))).configuration;validateConfig(restored);assert.deepEqual(restored.worlds.a.styleCards,w.styleCards);
 w.styleCards.view='builtin.card.tone.tender';assert.throws(()=>validateConfig(d),/类型不符/);
});
test('selected lenses reach the current style owner while the eleven-block skeleton and paired comments remain',()=>{
 const c=fullDefaultConfiguration();c.world.styleCards={view:'builtin.card.view.user'};c.resources=[STYLE_CARDS.find(r=>r.id===c.world.styleCards.view)];
 const out=onePassEntries(c,DEFAULT_MOODS);assert.match(out.tisya_material_style,/user凝视/);assert.match(out.tisya_registry,/<think phase="after">/);assert.match(out.tisya_registry,/回应用户评价/);assert.match(out.tisya_registry,/<memory/);
});
test('action pressure cancels on scrolling and teardown without executing a choice',async()=>{
 const w=new Window(),d=w.document,host=d.createElement('div');d.body.append(host);let calls=0;const ui=mountActionChoice(d,host,{rows:[{text:'读信'}],onChoose:()=>calls++}),b=host.querySelector('.action');
 const pointer=(target,type,x)=>target.dispatchEvent(new w.PointerEvent(type,{bubbles:true,isPrimary:true,button:0,pointerId:1,clientX:x,clientY:0}));
 pointer(b,'pointerdown',0);assert.equal(b.dataset.tuiPress,'true');pointer(d,'pointermove',20);assert.equal(b.hasAttribute('data-tui-press'),false);assert.equal(calls,0);
 pointer(b,'pointerdown',0);pointer(d,'pointercancel',0);assert.equal(b.hasAttribute('data-tui-press'),false);ui.dispose();pointer(b,'pointerdown',0);assert.equal(b.hasAttribute('data-tui-press'),false);assert.equal(calls,0);await w.happyDOM.abort();
});
test('configuration saves and reopens a viewpoint card with its gaze relation and attention fields',async()=>{
 const {mountConfiguration}=await import('./legacy-fixtures/config-panel.js'),{createStore}=await import('../config/core.js');const win=new Window(),doc=win.document,box=doc.createElement('div');doc.body.append(box);
 const ctx={chatId:'lens-ui',characterId:0,characters:[{avatar:'lens.png'}],chatMetadata:{variables:{}},extensionSettings:{}},store=createStore({getContext:()=>ctx,persist:async()=>true});
 const mount=()=>mountConfiguration(doc,box,{store,host:{archives:async()=>[]},getSettings:()=>({联系人分组:{}}),initialTab:'world'});let ui=mount();await ui.ready;
 const choose=(label,value)=>{const input=ui.root.shadowRoot.querySelector('[aria-label="'+label+'"]');assert.ok(input,label);input.value=JSON.stringify(value);input.dispatchEvent(new win.Event('change'));};
 choose('视角卡','builtin.card.view.female');await win.happyDOM.whenAsyncComplete();choose('谁凝视谁','builtin.card.view.user');await win.happyDOM.whenAsyncComplete();choose('user体位倾向','主受');
 const focus=ui.root.shadowRoot.querySelector('[aria-label="凝视关注"]');focus.value='声音';focus.dispatchEvent(new win.Event('change'));
 [...ui.root.shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='保存配置').click();await ui.settled();assert.equal(store.read().world.styleGaze.focus,'声音');ui.dispose();ui=mount();await ui.ready;
 assert.equal(JSON.parse(ui.root.shadowRoot.querySelector('[aria-label="视角卡"]').value),'builtin.card.view.female');assert.equal(JSON.parse(ui.root.shadowRoot.querySelector('[aria-label="谁凝视谁"]').value),'builtin.card.view.user');assert.equal(ui.root.shadowRoot.querySelector('[aria-label="凝视关注"]').value,'声音');ui.dispose();await win.happyDOM.abort();
});

test('legacy direction references stay effective and explicit empty gaze removes that selection without mutating old values',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;w.styleCards={view:'builtin.card.view.char'};const before=JSON.stringify(w);validateConfig(d);assert.match(compileSelected(d,w).text,/char 的私心、审美偏爱/);assert.equal(viewSelection(w).gaze,'builtin.card.view.char');assert.equal(JSON.stringify(w),before);w.styleCards.gaze=null;assert.equal(compileSelected(d,w).text,'');
});
test('desire lens and gaze direction combine independently while roles and target aesthetics reach the style owner once',()=>{
 for(const lens of ['female','male'])for(const gaze of ['user','char','audience']){const c=fullDefaultConfiguration();c.world.styleCards={view:'builtin.card.view.'+lens,gaze:'builtin.card.view.'+gaze};c.world.styleGaze={userRole:'主攻',focus:'声音'};c.world.styleAesthetics={user:['高冷化'],others:['富态','慕强']};const out=onePassEntries(c,DEFAULT_MOODS);assert.match(out.tisya_material_style,/user主攻/);assert.match(out.tisya_material_style,/其他角色审美：富态/);assert.match(out.tisya_material_style,/user审美：高冷化/);assert.match(out.tisya_material_style,/凝视关注：声音/);assert.match(out.tisya_material_style,new RegExp(lens==='female'?'女凝':'男凝'));assert.match(out.tisya_material_style,new RegExp(gaze==='user'?'user凝视':gaze==='char'?'char凝视':'观众凝视'));assert.doesNotMatch(out.tisya_material_rule_material,/user主攻/);}
});
test('aesthetic and role configuration validates exact values and preserves the legacy non-erotic label',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;w.styleAesthetics={user:['幼态（非情色造型）'],others:['可爱化']};w.styleGaze={userRole:'主受'};validateConfig(d);assert.match(styleProjection(w),/幼态（非情色造型）.*非情色场景/);w.styleGaze.userRole='猜测';assert.throws(()=>validateConfig(d),/凝视倾向/);w.styleGaze.userRole='可攻可受';w.styleAesthetics.user=['未知'];assert.throws(()=>validateConfig(d),/审美选项/);
});
test('built-in writing cards use direct positive instructions without repeated boundary paragraphs',()=>{
 assert.equal(STYLE_CARDS.length,10);assert.equal(new Set(STYLE_CARDS.map(card=>card.id)).size,10);
 for(const card of STYLE_CARDS){assert.doesNotMatch(card.content,/不把|不从|不替|不让|不要|不借|不强制|禁止/);assert.equal(card.version,5);}
});

test('legacy select-style mode accepts actual three-card resources and still rejects an empty selection',()=>{
 const c=fullDefaultConfiguration();c.world.modes.narrative.narrative.缇斯亚叙事文风='选文风卡';assert.throws(()=>onePassEntries(c,DEFAULT_MOODS),/actual style/);c.world.styleCards={view:'builtin.card.view.male',gaze:'builtin.card.view.char'};assert.match(onePassEntries(c,DEFAULT_MOODS).tisya_material_style,/男凝/);
});

// Frozen copies of the shipped v2 rows, independent of the runtime match table.
const V2_CARDS=JSON.parse(fs.readFileSync(new URL('./fixtures/style-cards-v2.json',import.meta.url),'utf8'));
test('all ten exact saved stock bodies upgrade only at the resource view and retain user metadata, selection order and backups',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;
 d.resources=V2_CARDS.map((row,index)=>({...structuredClone(row),name:'自定名称 '+index,enabled:false,custom:{ordinal:index,flag:false,count:0}}));
 w.modes.narrative.selected=d.resources.map(row=>row.id).reverse();w.parameters[d.resources[0].id]={flag:false,count:0};
 const before=structuredClone(d),compiled=compileSelected(d,w,'main',{labels:true});
 assert.deepEqual(compiled.ids,w.modes.narrative.selected);
 for(const old of d.resources){
  const current=STYLE_CARDS.find(row=>row.id===old.id),effective=resources(d).find(row=>row.id===old.id);
  assert.deepEqual(effective,{...old,content:current.content,version:5});
  assert.equal(compiled.text.split(current.content).length-1,1);assert.ok(!compiled.text.includes(old.content));assert.ok(compiled.text.includes(old.name));
 }
 assert.deepEqual(d,before);assert.deepEqual(cleanExport(d).configuration.resources,before.resources);
});

test('custom bodies, external source copies and unknown versions remain authoritative; saved task filters and disabled selections still work',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;const old=structuredClone(V2_CARDS[0]);
 for(const changes of [{content:old.content+'\n我自己的结尾。'},{content:''},{source:{book:'my-style-book',uid:1}},{version:4},{version:undefined}]){
  const row={...old,...changes};d.resources=[row];w.styles=[row.id];const before=structuredClone(d);
  assert.deepEqual(resources(d).find(item=>item.id===row.id),row);assert.equal(compileSelected(d,w).text,row.content.trim());assert.deepEqual(d,before);
 }
 d.resources=[{...old,tasks:['summary'],enabled:false,defaults:{flag:false,count:0}}];w.styles=[];w.modes.narrative.selected=[old.id];
 assert.equal(compileSelected(d,w).text,'');assert.equal(compileSelected(d,w,'summary').text,STYLE_CARDS[0].content);
 assert.deepEqual(resources(d).find(row=>row.id===old.id).tasks,['summary']);
 w.overrides[old.id]='off';assert.equal(compileSelected(d,w,'summary').text,'');
});

function styleHostFixture(){
 const d=emptyConfig(),context={chatId:'style-stock',characterId:0,characters:[{avatar:'style.png',name:'守夜人',data:{description:'守夜人整理桌上的旧信。'}}],chatMetadata:{},chat:[{is_user:true,mes:'我把旧信放在桌上。'}],powerUserSettings:{persona_description:'访客'},extensionSettings:{[KEY]:d},chatCompletionSettings:{model:'fixture-model',chat_completion_source:'openai'},getChatCompletionModel:s=>s.model,getWorldInfoNames:()=>[],stopGeneration(){}};
 const key=worldKey(context);d.worlds[key]=defaultWorld();const world=d.worlds[key];world.context.owner='tisya';
 const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-One-Pass-1.json',import.meta.url),'utf8'));
 const source={identity:'onepass-fixture',prompts:structuredClone(preset.prompts),order:structuredClone(preset.prompt_order.find(row=>row.character_id===100001).order)};
 context.getPresetManager=()=>({getAllPresets:()=>['onepass-fixture'],getSelectedPresetName:()=> 'onepass-fixture',getCompletionPresetByName:()=>preset});
 const macros=new Map();context.registerMacro=(name,fn)=>macros.set(name,fn);context.unregisterMacro=name=>macros.delete(name);context.substituteParams=text=>text.replace(/\{\{(tisya_\w+)\}\}/g,(_,name)=>{assert.ok(macros.has(name),'known macro '+name);return macros.get(name)();});
 const store=createStore({getContext:()=>context,persist:async()=>true}),host=createHost({getContext:()=>context,getSource:()=>source,getMoods:()=>DEFAULT_MOODS,store,createParameters:async(settings,model,type,messages)=>({generate_data:{messages,model,stream:false}})});
 const live=registerLivePreset(context,()=>source,()=>context,()=>DEFAULT_MOODS);registerPresetProtocol(context,()=>source,()=>{},()=>DEFAULT_MOODS,()=>live.execution().prose);context.registerMacro('tisya_config_selected',()=>host.selectedText());
 return {d,world,context,key,host,live};
}
test('actual host before and payloadReady carry selected revised stock and custom cards once while leaving unselected cards and saved data untouched',async()=>{
 const f=styleHostFixture(),ids=['builtin.card.tone.tender','builtin.card.view.female','builtin.card.sentence.fluid','builtin.card.view.char'];
 f.d.resources=structuredClone(V2_CARDS);const custom=f.d.resources.find(row=>row.id===ids[1]);custom.name='我的视角';custom.content='我的视角：旧信上的折痕与灯影。';
 f.world.styleCards={tone:ids[0],view:ids[1],sentence:ids[2],gaze:ids[3]};f.world.modes.narrative.selected=[ids[0]];
 const before=structuredClone(f.d),history=structuredClone(f.context.chat);
 await f.host.before('normal');const state='<ONEPASS_STATE>{"fixture":"style-stock","rows":[]}</ONEPASS_STATE>';f.host.attachTableContext({world:f.key,onepass:true,text:state,instructions:state,slots:{}});const payload={messages:[],stream:true};await f.host.payloadReady(payload);
 const text=payload.messages.map(row=>row.content).join('\n');
 for(const id of ids){const body=id===custom.id?custom.content:STYLE_CARDS.find(row=>row.id===id).content;assert.equal(text.split(body).length-1,1,id);}
 for(const row of STYLE_CARDS.filter(row=>!ids.includes(row.id)))assert.ok(!text.includes(row.content),row.id+' remains unselected');
 for(const row of V2_CARDS)assert.ok(!text.includes(row.content),row.id+' old stock absent');
 assert.match(text,/我的视角/);assert.match(text,/<think phase="before">/);assert.match(text,/<think phase="after">/);assert.match(text,/<body min="2000" max="5000" unit="字">/);
 assert.deepEqual(f.d,before);assert.deepEqual(f.context.chat,history);assert.deepEqual(f.host.preview().messages,payload.messages);f.live.dispose();
});
