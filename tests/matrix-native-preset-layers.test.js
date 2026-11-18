import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline} from '../engine/config.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';
import {createNativeSourceLayers} from '../engine/native-source-layers.mjs';
import {createNativePresetLayers} from '../engine/native-preset-layers.mjs';
import {loadNativeHost} from './fixtures/native-layers/load-host-fragments.mjs';

const clone=structuredClone;
const eventNames=['GENERATION_AFTER_COMMANDS','WORLDINFO_ENTRIES_LOADED','WORLD_INFO_ACTIVATED','GENERATE_AFTER_COMBINE_PROMPTS','CHAT_COMPLETION_SETTINGS_READY','GENERATION_ENDED','GENERATION_STOPPED'];
function setup(t,{legacy=false,substitute=value=>String(value??'').replaceAll('{{char}}','守夜人'),customPrompt=null,extensions={},historyTransform=null,beforeCombine=null,cardOverrides=false,getCardPrompts=null}={}){
 const native=loadNativeHost({substitute}),settings={tags:clone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:{N02:'N02-C','S08-MindVoice':'S08-MindVoice-C',N11:'N11-A','S09-Blocks':['S09-Dialogue','S09-Thought']}}}};
 const projection=createNativePresetLayers({settings,slots:{}}),context={eventTypes:Object.fromEntries(eventNames.map(name=>[name,name])),extensionPrompts:extensions};
 const adapter=createNativeSourceLayers({relocateSources:true,getCardPrompts,PromptManager:native.PromptManager,Message:native.Message,ChatCompletion:native.ChatCompletion,getContext:()=>context,getScope:()=>'chat:fixed:window12',getAuthorsNotePolicy:()=>({enabled:true}),preparePreset:projection.preparePreset,finalizeMessages:projection.finalizeMessages});
 t.after(()=>adapter.dispose());adapter.begin();adapter.entriesLoaded({globalLore:[],characterLore:[],chatLore:[],personaLore:[]});if(beforeCombine)beforeCombine(adapter,context);adapter.afterCombine();
 function manager(){
  const value=new native.PromptManager();value.serviceSettings={prompts:clone(baseline.prompts),prompt_order:clone(baseline.prompt_order[1].order)};
  if(cardOverrides){value.serviceSettings.prompt_order.find(p=>p.identifier==='jailbreak').enabled=true;Object.assign(value.serviceSettings.prompts.find(p=>p.identifier==='jailbreak'),{enabled:true,content:'历史后预设原文'});}
  if(legacy){
   value.serviceSettings.prompts=value.serviceSettings.prompts.filter(row=>row.identifier!=='tisya_layer_authority');
   const order=value.serviceSettings.prompt_order.filter(row=>row.identifier!=='tisya_layer_authority'),at=order.findIndex(row=>row.identifier==='tisya_material_boundary_open'),[opening]=order.splice(at,1);order.splice(order.findIndex(row=>row.identifier==='tisya_pref_narrative'),0,opening);value.serviceSettings.prompt_order=order;
  }
  if(customPrompt){value.serviceSettings.prompts.push(clone(customPrompt));value.serviceSettings.prompt_order.splice(2,0,{identifier:customPrompt.identifier,enabled:true});}
  return value;
 }
 async function assemble(owner){
  const original=clone(owner.serviceSettings),prompts=owner.getPromptCollection('normal'),messages=new native.MessageCollection('all'),completion=new native.ChatCompletion();completion.setTokenBudget(1000000,0);
  const card=owner.preparePrompt({identifier:'charDescription',role:'system',content:'守夜人资料。\n叙事人称：第三人称'});
  for(const item of owner.serviceSettings.prompt_order){if(!item.enabled)continue;const prompt=prompts.get(item.identifier);if(!prompt)continue;
   if(item.identifier==='charDescription'){messages.add(await native.Message.fromPromptAsync(card,owner.tokenHandler));continue;}
   if(item.identifier==='chatHistory'){
    let history=[{role:'assistant',content:'他将旧伞放在门边。'},{role:'user',content:'继续谈话。'}];
    if(historyTransform)history=await historyTransform({native,owner,history,context});
    for(const [i,row]of history.entries())messages.add(await native.Message.createAsync(row.role,row.content,row.identifier??'chatHistory-'+i,owner.tokenHandler));continue;
   }
   if(cardOverrides&&['main','jailbreak'].includes(item.identifier)){messages.add(await native.Message.fromPromptAsync(owner.preparePrompt({identifier:item.identifier,role:prompt.role,content:item.identifier==='main'?'卡片系统要求':'卡片历史后要求'},prompt.content),owner.tokenHandler));continue;}
   if(prompt.content)messages.add(await native.Message.fromPromptAsync(prompt,owner.tokenHandler));
  }
  completion.add(messages,0);const result=completion.getChat();assert.deepEqual(owner.serviceSettings,original);return {result,completion};
 }
 return {native,projection,adapter,manager,assemble,context};
}

for(const legacy of [false,true])test('real native preparation applies selected configuration before budget and finalizes current/headless managers '+(legacy?'legacy':'new'),async t=>{
 const s=setup(t,{legacy}),first=s.manager();const one=await s.assemble(first);
 const second=s.manager();second.serviceSettings.prompts.find(row=>row.identifier==='tisya_pref_narrative').content=second.serviceSettings.prompts.find(row=>row.identifier==='tisya_pref_narrative').content.replace(/^@POV\.PERSON[^\r\n]*/m,'@POV.PERSON := Third-person narration from stored preset.');
 const two=await s.assemble(second);
 for(const output of [one,two]){
  const system=output.result.filter(row=>row.role==='system').map(row=>row.content).join('\n');
  assert.match(system,/@POV\.PERSON := 全文使用第二人称/);assert.doesNotMatch(system,/Third-person narration from stored preset/);
  assert.equal(system.indexOf('@POV.PERSON := 全文使用第二人称')<system.indexOf('[Dream Rules]\n@BOUNDARY '),!legacy);
  assert.match(system,/正文（`<body>`）与交付结构一律执行系统层/);
  assert.deepEqual(s.projection.lastFinalization().moved,[]);
  assert.equal(system.split('[LAYER.AUTHORITY]').length-1,1);assert.doesNotMatch(system,/守夜人资料。/);
  assert(output.result.some(row=>row.role==='assistant'&&/<DreamMaterial[^>]*>\n守夜人资料。\n叙事人称：第三人称\n<\/DreamMaterial>/.test(row.content)));
  assert(output.result.some(row=>row.role==='assistant'&&row.content==='他将旧伞放在门边。'));
 }
 const narrativeCounts=s.native.tokenCalls.filter(row=>row.content?.startsWith('<tisya>\n<Pref_Narrative>\n'));
 assert.equal(narrativeCounts.length,2);assert(narrativeCounts.every(row=>row.content.startsWith('<tisya>\n')&&row.content.includes('@POV.PERSON := 全文使用第二人称')));
 assert.equal(s.projection.lastFinalization().managers,2);assert.equal(s.projection.lastFinalization().compiledBeforeNativeBudget,true);assert.equal(s.adapter.assertReady().finalizations,2);
});

test('configuration macro has one native expansion across preparation and final getChat',async t=>{
 let calls=0;const s=setup(t,{customPrompt:{identifier:'custom-once',role:'system',content:'只展开一次 {{tick}}',enabled:true},substitute:text=>String(text??'').replaceAll('{{char}}','守夜人').replace(/\{\{tick\}\}/g,()=>String(++calls))});
 const {result}=await s.assemble(s.manager());assert.equal(calls,1);assert(result.some(row=>row.content==='<tisya>\n只展开一次 1\n</tisya>'));
});

test('native trigger filtering never turns an excluded configuration on',async t=>{
 const s=setup(t,{customPrompt:{identifier:'custom-quiet-only',role:'system',content:'禁止在normal轮插入',enabled:true,fixtureTrigger:false}});
 const {result}=await s.assemble(s.manager());assert(!result.some(row=>row.content?.includes('禁止在normal轮插入')));
});


test('native depth and attached sources move into Dream Rules in native order; exact history and multimodal data stay',async t=>{
 const extensions={DEPTH_PROMPT:{value:'深度卡文本',position:1,depth:1,role:0},customDepthWI_1_1:{value:'深度书文本',position:1,depth:1,role:1}};
 const quoted='<DreamMaterial source="角色卡场景">\n附加场景\n</DreamMaterial>';
 const s=setup(t,{extensions,historyTransform:async({native,owner,history,context})=>{
  history[0].content+='\n'+quoted;
  const scenario=owner.preparePrompt({identifier:'scenario',role:'system',content:'附加场景',attach_role:'user',attach_index:1,attach_side:'end'});
  native.applyAttachedPromptsToMessages([scenario],history);
  return native.populationInjectionPrompts([],history,context.extensionPrompts,native.runtime);
 }});
 const {result,completion}=await s.assemble(s.manager()),joined=result.map(m=>m.content).join('\n');
 const begin=joined.indexOf('[Dream Rules]\n@BOUNDARY'),end=joined.indexOf('[/Dream Rules]');
 for(const text of ['守夜人资料。','深度卡文本','深度书文本','附加场景'])assert(joined.indexOf(text)>begin&&joined.indexOf(text)<end,text);
 assert(result.some(m=>m.role==='assistant'&&m.content==='他将旧伞放在门边。\n'+quoted));
 assert(result.some(m=>m.role==='user'&&m.content.trim()==='继续谈话。'));
 const original=completion.getMessages().flatten().map(m=>m.content).join('\n');
 const ordered=['深度卡文本','深度书文本','附加场景'].sort((a,b)=>original.indexOf(a)-original.indexOf(b));
 assert.deepEqual(ordered,[...ordered].sort((a,b)=>joined.indexOf(a)-joined.indexOf(b)));
 assert.doesNotMatch(JSON.stringify(result),/TISYA_SOURCE_(?:START|END)/);
 assert(s.native.tokenCalls.every(m=>!String(m.content).includes('TISYA_SOURCE_START')));
 assert.equal(s.projection.lastFinalization().nativeSources.moved,4);
 assert.match(joined,/@PSYCHOLOGY.VOICE := 当前对手戏人物开口或以动作回应时/);
 assert.match(joined,/@LANG.GATE/);assert.match(joined,/@BODY.NAMED_DIALOGUE := [^\n]+必须写为 `【角色姓名#当下情绪】“完整对白”`/);assert.match(joined,/@BODY.NAMED_THOUGHT/);assert(joined.indexOf('@BODY.NAMED_DIALOGUE')<begin);assert(joined.indexOf('@PSYCHOLOGY.VOICE')<begin);
 assert.deepEqual(completion.getChat(),result,'repeat projection never mutates the host collection');
 s.adapter.end();assert.equal(extensions.DEPTH_PROMPT.value,'深度卡文本');
});

test('card macro inside configuration keeps surrounding upper rule and only relocates its source',async t=>{
 const s=setup(t,{customPrompt:{identifier:'custom-card',role:'system',content:'上文 {{description}} 下文',enabled:true},substitute:value=>String(value??'').replaceAll('{{description}}','原生描述')});
 const {result}=await s.assemble(s.manager()),text=result.map(m=>m.content).join('\n');
 assert.match(text,/<tisya>\n上文  下文\n<\/tisya>/);
 assert(text.indexOf('原生描述')>text.indexOf('[Dream Rules]\n@BOUNDARY'));
});

test('native author note worldbook, outlet, examples and effective card overrides all enter the same material region',async t=>{
 const extensions={'2_floating_prompt':{value:'作者原文',position:1,depth:1,role:0},customWIOutlet_gate:{value:'出口书内容',position:4,depth:0,role:0}};
 const s=setup(t,{extensions,cardOverrides:true,beforeCombine(adapter){adapter.activated([{position:2},{position:3}]);extensions['2_floating_prompt'].value='前注书内容\n作者原文\n后注书内容';},historyTransform:async({native,owner,history,context})=>{
  const note=owner.preparePrompt({identifier:'authorsNote',role:'system',content:context.extensionPrompts['2_floating_prompt'].value});
  const outlet=owner.preparePrompt({identifier:'outlet-test',role:'system',content:context.extensionPrompts.customWIOutlet_gate.value});
  return [...history,{role:note.role,content:note.content},{role:outlet.role,content:outlet.content},{role:'system',content:'人物示例对白',identifier:'dialogueExamples 0-0'}];
 }});
 const {result}=await s.assemble(s.manager()),all=result.map(m=>m.content).join('\n'),open=all.indexOf('[Dream Rules]\n@BOUNDARY'),close=all.indexOf('[/Dream Rules]');
 for(const text of ['前注书内容','后注书内容','出口书内容','人物示例对白','卡片系统要求','卡片历史后要求'])assert(all.indexOf(text)>open&&all.indexOf(text)<close,text);
 assert(result.some(m=>m.content==='作者原文'));assert.doesNotMatch(all,/TISYA_SOURCE_(?:START|END)/);
});

test('source macro inside a JSON-framed upper rule remains movable without corrupting that rule',async t=>{
 const s=setup(t,{customPrompt:{identifier:'quoted-layer-card',role:'system',content:'上文 <tisya> 是引用 {{description}} 下文',enabled:true},substitute:value=>String(value??'').replaceAll('{{description}}','引用内的卡片描述')});
 const {result}=await s.assemble(s.manager()),text=result.map(m=>m.content).join('\n');
 assert(text.indexOf('引用内的卡片描述')>text.indexOf('[Dream Rules]\n@BOUNDARY'));
 const upper=result.find(m=>m.content.startsWith('<tisya encoding="json">')&&m.content.includes('上文'));
 assert.equal(JSON.parse(upper.content.split('\n')[1]),'上文 <tisya> 是引用  下文');
});

test('the source-only contract includes the card main and PHI even with preset override forbidden or disabled',async t=>{
 const getCardPrompts=()=>({system:'卡原文 {{original}}',jailbreak:'卡历史后 {{char}}'});
 const substitute=(text,options)=>String(text??'').replaceAll('{{original}}',options?.original??'').replaceAll('{{char}}','守夜人');
 const s=setup(t,{getCardPrompts,substitute});
 const {result}=await s.assemble(s.manager());
 const row=result.find(message=>message.content.startsWith('<NativeDreamSources>'));
 assert.equal(row.role,'assistant');
 assert.match(row.content,/<DreamMaterial source="角色卡系统资料">\n卡原文 \n<\/DreamMaterial>/);
 assert.match(row.content,/<DreamMaterial source="角色卡历史后资料">\n卡历史后 守夜人/);
 assert.doesNotMatch(row.content,/\{\{original\}\}/);
 assert(result.filter(message=>message.role==='system').every(message=>!message.content.includes('卡原文')));
});
