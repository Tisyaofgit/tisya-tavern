import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline} from '../engine/config.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';
import {createNativeSourceLayers} from '../engine/native-source-layers.mjs';
import {createNativePresetLayers} from '../engine/native-preset-layers.mjs';
import {loadNativeHost} from './fixtures/native-layers/load-host-fragments.mjs';

const clone=structuredClone;
const eventNames=['GENERATION_AFTER_COMMANDS','WORLDINFO_ENTRIES_LOADED','WORLD_INFO_ACTIVATED','GENERATE_AFTER_COMBINE_PROMPTS','CHAT_COMPLETION_SETTINGS_READY','GENERATION_ENDED','GENERATION_STOPPED'];
function setup(t,{legacy=false,substitute=value=>String(value??'').replaceAll('{{char}}','守夜人'),customPrompt=null}={}){
 const native=loadNativeHost({substitute}),settings={tags:clone(DEFAULT_TAGS),prompts:{},story:{userName:'阿青',play:{choices:{N02:'N02-C'}}}};
 const projection=createNativePresetLayers({settings,slots:{}}),context={eventTypes:Object.fromEntries(eventNames.map(name=>[name,name])),extensionPrompts:{}};
 const adapter=createNativeSourceLayers({PromptManager:native.PromptManager,Message:native.Message,ChatCompletion:native.ChatCompletion,getContext:()=>context,getScope:()=>'chat:fixed:window12',getAuthorsNotePolicy:()=>({enabled:true}),preparePreset:projection.preparePreset,finalizeMessages:projection.finalizeMessages});
 t.after(()=>adapter.dispose());adapter.begin();adapter.entriesLoaded({globalLore:[],characterLore:[],chatLore:[],personaLore:[]});adapter.afterCombine();
 function manager(){
  const value=new native.PromptManager();value.serviceSettings={prompts:clone(baseline.prompts),prompt_order:clone(baseline.prompt_order[1].order)};
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
    messages.add(await native.Message.createAsync('assistant','他将旧伞放在门边。','chatHistory-2',owner.tokenHandler));
    messages.add(await native.Message.createAsync('user','继续谈话。','chatHistory-1',owner.tokenHandler));continue;
   }
   if(prompt.content)messages.add(await native.Message.fromPromptAsync(prompt,owner.tokenHandler));
  }
  completion.add(messages,0);const result=completion.getChat();assert.deepEqual(owner.serviceSettings,original);return {result,completion};
 }
 return {native,projection,adapter,manager,assemble};
}

for(const legacy of [false,true])test('real native preparation applies selected configuration before budget and finalizes current/headless managers '+(legacy?'legacy':'new'),async t=>{
 const s=setup(t,{legacy}),first=s.manager();const one=await s.assemble(first);
 const second=s.manager();second.serviceSettings.prompts.find(row=>row.identifier==='tisya_pref_narrative').content=second.serviceSettings.prompts.find(row=>row.identifier==='tisya_pref_narrative').content.replace(/^@POV\.PERSON[^\r\n]*/m,'@POV.PERSON := Third-person narration from stored preset.');
 const two=await s.assemble(second);
 for(const output of [one,two]){
  const system=output.result.filter(row=>row.role==='system').map(row=>row.content).join('\n');
  assert.match(system,/@POV\.PERSON := 全文使用第二人称/);assert.doesNotMatch(system,/Third-person narration from stored preset/);
  assert(system.indexOf('@POV.PERSON := 全文使用第二人称')<system.indexOf('[Dream Rules]\n@BOUNDARY '));
  assert.equal(system.split('[LAYER.AUTHORITY]').length-1,1);assert.match(system,/<DreamMaterial[^>]*>\n守夜人资料。\n叙事人称：第三人称\n<\/DreamMaterial>/);
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
