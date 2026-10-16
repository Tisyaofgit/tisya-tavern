import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './fixtures/journey-r4.cjs';
import {EMOTIONS} from '../emotion-catalog.js';
import {registerLivePreset,compileNarrative} from '../narrative-bridge.js';
import {registerPresetProtocol} from '../preset.js';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore} from '../config/core.js';
import {createHost,buildMessages} from '../config/host.js';

const moods=EMOTIONS.map(r=>r.name);
function setup({createParameters,prepareMessage,projectToolTurns}={}){
 const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.20.json',import.meta.url))),source={prompts:preset.prompts,order:preset.prompt_order[0].order};
 const data=emptyConfig(),c={chatId:'memory-test',characterId:0,characters:[{avatar:'lighthouse',name:'守灯人',data:{description:'这是一个虚构的旧灯塔故事。所有人物均为成年人。玩家角色阿岚是负责维修灯塔的旅人，守灯人话少、务实但关心伙伴。'}}],chatMetadata:{},chat:[],extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'isolated-fixture'},getChatCompletionModel:()=> 'isolated-fixture',getPresetManager:()=>({getAllPresets:()=>['r20'],getSelectedPresetName:()=> 'r20',getCompletionPresetByName:()=>preset})};
 const w=data.worlds[worldKey(c)]=defaultWorld();w.context.owner='tisya';w.modes.narrative.heartDirections=['输入评价','回应用户评价','剧情吐槽'];
 const macros=new Map();c.registerMacro=(n,f)=>macros.set(n,f);c.unregisterMacro=n=>macros.delete(n);c.substituteParams=s=>s.replace(/\{\{(tisya_\w+)\}\}/g,(_,n)=>macros.get(n)());
 registerLivePreset(c,()=>source,()=>c,()=>moods);registerPresetProtocol(c,()=>source,()=>{},()=>moods);
 const store=createStore({getContext:()=>c,persist:async()=>true}),host=createHost({getContext:()=>c,getSource:()=>source,store,prepareMessage,projectToolTurns,createParameters:createParameters??(async(s,model,type,messages)=>({generate_data:{messages,model}}))});c.registerMacro('tisya_config_selected',()=>host.selectedText());
 return {c,w,source,host};
}
test('every live heart has a required real mood; empty catalogs fail and non-heart null remains valid',()=>{
 const f=setup();for(const detail of ['full','compact','format']){
  f.w.modes.narrative.workflowDetail=detail;const text=compileNarrative(f.c,f.source,moods).rest.entries.tisya_inner_chain;
  assert.match(text,/每条mood必选一个表情/);assert.doesNotMatch(text,/{mood或null}/);assert.ok(text.includes(JSON.stringify(moods)));assert.match(text,/null/);
  if(detail!=='format')assert.match(text,/\[CALL blk\.next\]\n@INPUT [^\n]*@BLOCK\.body\+@BLOCK\.task\.heart/);
 }
 assert.throws(()=>compileNarrative(f.c,f.source,[]),/表情目录为空/);
});

test('removed memory never parses openings or malformed historical memory',async()=>{
 for(const owner of ['native','tisya'])for(const opening of ['开始吧','<reply><body>开场正文</body></reply>',fixture().replace('</memory>','')]){
  const f=setup();f.w.context.owner=owner;f.w.context.memory=true;f.c.chat=[{mes:opening},{is_user:true,mes:'继续当前场景'}];
  const before=JSON.stringify(f.c.chat);await f.host.before('normal');const payload={messages:[{role:'assistant',content:opening},{role:'user',content:'继续当前场景'}]};await f.host.payloadReady(payload);
  assert.ok(payload.messages.some(m=>m.content===opening));assert.doesNotMatch(JSON.stringify(payload),/<历史记忆>/);assert.equal(JSON.stringify(f.c.chat),before);
 }
});
test('managed 15-message window preserves each raw recent message plus current input',async()=>{
 const f=setup();f.w.context.history=15;f.c.chat=Array.from({length:70},(_,i)=>({is_user:i%2===1,mes:'HISTORY_'+String(i).padStart(3,'0')}));f.c.chat.push({is_user:true,mes:'CURRENT_INPUT'});
 await f.host.before('normal');const payload={messages:[]};await f.host.payloadReady(payload);
 const sent=payload.messages.filter(m=>/^HISTORY_|^CURRENT_INPUT$/.test(m.content));assert.deepEqual(sent.map(m=>m.content),f.c.chat.slice(-16).map(m=>m.mes));
 assert.equal(sent.filter(m=>m.content==='CURRENT_INPUT').length,1);assert.doesNotMatch(JSON.stringify(payload),/HISTORY_054|<历史记忆>/);
});
test('native final request leaves the preselected history and external material unchanged',async()=>{
 const f=setup();f.w.context.owner='native';f.w.context.history=0;f.c.chat=Array.from({length:71},(_,i)=>({is_user:i%2===1,mes:'HISTORY_'+i}));
 const payload={messages:[{role:'system',content:'DATABASE_CONTEXT'},...f.c.chat.map(m=>({role:m.is_user?'user':'assistant',content:m.mes}))],stream:true};
 const before=structuredClone(payload);await f.host.before('normal');await f.host.payloadReady(payload);assert.deepEqual(payload,before);
 payload.messages.push({role:'system',content:'DATABASE_LATE'});assert.doesNotThrow(()=>JSON.stringify(payload));
});
test('selected branch, attachments and context switches retain existing history guards',async()=>{
 const f=setup();f.w.context.history=50;f.c.chat=[{mes:'开场'},{is_user:true,mes:'现在'},{mes:'将重投的回复',swipes:['另一候选']}];
 await f.host.before('swipe');const p={messages:[]};await f.host.payloadReady(p);assert.ok(p.messages.some(m=>m.content==='开场'));assert.ok(!p.messages.some(m=>m.content==='将重投的回复'||m.content==='另一候选'));
 const g=setup({createParameters:async(s,model,type,messages)=>{g.c.chat[0].mes='已改';return {generate_data:{messages}};}});g.c.chat=[{mes:'开场'},{is_user:true,mes:'现在'}];await g.host.before('normal');const changed={messages:[]};await assert.rejects(g.host.payloadReady(changed),/聊天记录已变化/);assert.throws(()=>JSON.stringify(changed));
});

test('native history input limits only the prepared copy before material assembly, independent of memory',async()=>{
 for(const count of [0,15,100]){
  const f=setup();f.w.context.owner='native';f.w.context.history=count;f.w.context.memory=false;
  f.c.chat=Array.from({length:70},(_,i)=>({is_user:i%2===1,mes:'RAW_'+i}));f.c.chat.push({is_user:true,mes:'CURRENT',extra:{media:[{url:'image.png'}]}});
  const prior=structuredClone(f.c.chat),core=structuredClone(f.c.chat).map((m,index)=>({...m,index}));core[core.length-1].mes='CURRENT WITH NATIVE FILE';
  await f.host.before('normal');const report=f.host.historyInput(core,'normal');assert.equal(core.length,Math.min(71,count+1));assert.equal(core.at(-1).mes,'CURRENT WITH NATIVE FILE');assert.deepEqual(core.at(-1).extra,prior.at(-1).extra);assert.deepEqual(f.c.chat,prior);assert.equal(report.configured,count);
  const payload={messages:[{role:'system',content:'ORIGINAL_CARD_FORMAT'},...core.map(m=>({role:m.is_user?'user':'assistant',content:m.mes})),{role:'system',content:'DATABASE_CONTEXT'}]};const original=structuredClone(payload);await f.host.payloadReady(payload);assert.deepEqual(payload,original);assert.deepEqual(f.host.preview().historyWindow,report);
 }
 const f=setup();f.w.context.owner='native';await f.host.before('normal');assert.throws(()=>f.host.historyInput(f.c.chat,'normal'),/发送副本/);
});
test('native history hook preserves selected swipe and continuation and skips helper jobs',async()=>{
 const f=setup();f.w.context.owner='native';f.w.context.history=1;
 for(const type of ['swipe','continue']){await f.host.before(type);const core=[{mes:'old'},{is_user:true,mes:'current'},{mes:'accepted continuation'}].map((m,index)=>({...m,index}));f.host.historyInput(core,type);assert.deepEqual(core.map(x=>x.mes),['accepted continuation']);}
 const core=[{mes:'first'},{mes:'second'},{mes:'third'}];for(const type of ['quiet','impersonate']){await f.host.before(type);assert.equal(f.host.historyInput(core,type),null);assert.equal(core.length,3);}
});

test('history input retains extension-added material that has no native message index',async()=>{
 const f=setup();f.w.context.owner='native';f.w.context.history=0;await f.host.before('normal');
 const db={is_system:true,mes:'DATABASE_INSERTION'},core=[db,{index:0,mes:'old'},{index:1,is_user:true,mes:'current'}];
 f.host.historyInput(core,'normal');assert.deepEqual(core,[db,{index:1,is_user:true,mes:'current'}]);
});

test('host passes the original prepared history to native projection and blocks a projection error',async()=>{
 let observed;const f=setup({projectToolTurns:(chat,strip)=>{observed={chat,strip};return [{type:'tool-turn',sourceIndices:[0,2]},{type:'message',sourceIndex:1,message:chat[1]}];}});
 f.w.context.owner='native';f.w.context.history=0;
 const core=[{index:0,mes:'query',tool_calls:[{id:'a',name:'lookup',parameters:'{}'}]},{index:1,is_user:true,mes:'current'},{index:2,role:'tool',tool_call_id:'a',mes:'result',is_system:true}];
 await f.host.before('normal');const report=f.host.historyInput(core,'normal');assert.equal(observed.chat,core);assert.equal(observed.strip,false);assert.equal(report.toolTurns,1);assert.equal(core.length,3);
 const g=setup({projectToolTurns:()=>{throw Error('native invalid tool history');}});g.w.context.owner='native';await g.host.before('normal');const prior=structuredClone(core);
 assert.throws(()=>g.host.historyInput(core,'normal'),/native invalid/);assert.deepEqual(core,prior);const p={messages:[]};await assert.rejects(g.host.payloadReady(p),/native invalid/);assert.throws(()=>JSON.stringify(p),/native invalid/);
});

test('tool metadata changed outside selected prose still invalidates an in-flight managed request',async()=>{
 const f=setup({createParameters:async(s,model,type,messages)=>{f.c.chat[0].tool_calls[0].parameters='changed';return {generate_data:{messages}};}});
 f.w.context.history=1;f.c.chat=[{mes:'query',tool_calls:[{id:'a',name:'lookup',parameters:'{}'}]},{role:'tool',tool_call_id:'a',mes:'result',is_system:true},{mes:'final prose'},{is_user:true,mes:'current'}];
 await f.host.before('normal');const p={messages:[]};await assert.rejects(f.host.payloadReady(p),/聊天记录已变化/);assert.throws(()=>JSON.stringify(p));
});
