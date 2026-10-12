import {EMOTIONS} from '../emotion-catalog.js';
const MOODS=EMOTIONS.map(r=>r.name);
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {MEMORY_EXAMPLE,MEMORY_DELIVERY,MEMORY_RULES} from '../config/memory-output.js';
import {readJourney} from '../reply-records.js';
import {fixture} from './fixtures/journey-r4.cjs';
import {parseDisplayEnvelope,projectJourney,validateMemoryProjection,validateMemoryLocators} from '../reader-core.js';
import {compileNarrative,registerLivePreset} from '../narrative-bridge.js';
import {registerPresetProtocol} from '../preset.js';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore} from '../config/core.js';
import {createHost} from '../config/host.js';

test('the prescribed string-cell syntax preserves literal separators and newlines',()=>{
 assert.match(MEMORY_RULES,/整格写成严格 JSON 字符串/);
 for(const value of ['甲|乙','第一行\n第二行','引号"与反斜杠\\','原字面 ~']){
  const raw=fixture({memory:'事件：玩家|A|'+JSON.stringify(value)});
  assert.equal(JSON.parse(parseDisplayEnvelope(raw).blocks.memory).事件[0].梗概,value);
 }
 assert.throws(()=>parseDisplayEnvelope(fixture({memory:'事件：玩家|A|甲\\|乙'})),{code:'TISYA_PIPES_COLUMNS'});
});

test('the prescribed memory example passes strict parsing and displays its event and reader-authorized cognition',()=>{
 const source=fixture({body:'1\n两人站在台前向观众谢幕。\n\n2\n队员甲感觉自己仍有些紧张。\n\n3\n两人随后返回后台。',memory:MEMORY_EXAMPLE});
 const e=parseDisplayEnvelope(source),m=JSON.parse(e.blocks.memory);validateMemoryProjection(m,{body:e.blocks.body});validateMemoryLocators(m,e.blocks);
 const view=readJourney(source);assert.equal(view.memories.length,1);assert.equal(view.memories[0].quote.text,'两人站在台前向观众谢幕。\n\n两人随后返回后台。');
 assert.equal(view.characters.find(c=>c.name==='队员甲').cognition.length,1);
});

test('imported alpha20 preset emits the new minimal memory skeleton and final reminder in actual request messages',async()=>{
 const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.20.json',import.meta.url))),source={prompts:preset.prompts,order:preset.prompt_order[0].order};
 const config=emptyConfig(),context={chatId:'memory-preset',characterId:0,characters:[{avatar:'demo',name:'示例',data:{}}],chat:[],chatMetadata:{},extensionSettings:{[KEY]:config},powerUserSettings:{},chatCompletionSettings:{chat_completion_source:'openai',model:'fixture'},getChatCompletionModel:()=> 'fixture',getPresetManager:()=>({getAllPresets:()=>['r20'],getSelectedPresetName:()=> 'r20',getCompletionPresetByName:()=>preset})};
 const w=defaultWorld();w.context.owner='tisya';config.worlds[worldKey(context)]=w;w.modes.narrative.heartDirections=['输入评价','回应用户评价','剧情吐槽'];
 const macros=new Map();context.registerMacro=(n,f)=>macros.set(n,f);context.unregisterMacro=n=>macros.delete(n);context.substituteParams=s=>s.replace(/\{\{(tisya_\w+)\}\}/g,(_,name)=>{assert.ok(macros.has(name),name);return macros.get(name)();});
 const live=registerLivePreset(context,()=>source,()=>context,()=>MOODS),dispose=registerPresetProtocol(context,()=>source,()=>{},()=>MOODS),store=createStore({getContext:()=>context,persist:async()=>true}),host=createHost({getContext:()=>context,getSource:()=>source,store,createParameters:async(s,m,t,messages)=>({generate_data:{messages,model:m}})});context.registerMacro('tisya_config_selected',()=>host.selectedText());
 for(const detail of ['full','compact','format']){
  w.modes.narrative.workflowDetail=detail;await host.before('normal');const payload={messages:[]};await host.payloadReady(payload);const text=payload.messages.map(m=>m.content).join('\n');
  if(process.env.TISYA_REQUEST_EVIDENCE){fs.mkdirSync(process.env.TISYA_REQUEST_EVIDENCE,{recursive:true});fs.writeFileSync(process.env.TISYA_REQUEST_EVIDENCE+'/request-'+detail+'.json',JSON.stringify({evidence:'Production preset + production host; neutral fixture context, no provider API call',payload},null,2));}
  assert.ok(text.includes(MEMORY_DELIVERY));assert.doesNotMatch(text,/\{\{tisya_memory_delivery\}\}/);
  const block=text.match(/<memory format="pipes">([\s\S]*?)<\/memory>/)[1].trim().split('\n');
  assert.equal(block.length,2);assert.match(block[0],/^事件：/);assert.match(block[1],/^原文：/);assert.doesNotMatch(block.join('\n'),/倒计时：|权限：|关联：/);
  assert.match(text,/读者可见不等于所有人物知情/);assert.match(text,/固定列数/);
 }
 const slot=source.order.find(x=>x.identifier==='tisya_output');slot.enabled=false;
 assert.equal(macros.get('tisya_memory_delivery')(),'');assert.doesNotMatch(compileNarrative(context,source,[]).rest.entries.tisya_inner_chain,/@MEMORY_WRITE|<memory/);
 live.dispose();dispose();
});
