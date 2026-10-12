import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './fixtures/journey-r4.cjs';
import {EMOTIONS} from '../emotion-catalog.js';
import {registerLivePreset,compileNarrative} from '../narrative-bridge.js';
import {registerPresetProtocol} from '../preset.js';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore} from '../config/core.js';
import {createHost,buildMessages} from '../config/host.js';
import {buildHistoryMemory,withoutHistoricalHearts} from '../config/history-context.js';
import * as yaml from 'yaml';
import {configureReplyFormats,readReplyBlock} from '../reply-formats.js';
import {parseDisplayEnvelope} from '../reader-core.js';
import {legacyFixture} from './fixtures/legacy-yaml-reply.cjs';

const moods=EMOTIONS.map(r=>r.name);
function setup({createParameters,prepareMessage}={}){
 const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.20.json',import.meta.url))),source={prompts:preset.prompts,order:preset.prompt_order[0].order};
 const data=emptyConfig(),c={chatId:'memory-test',characterId:0,characters:[{avatar:'lighthouse',name:'守灯人',data:{description:'这是一个虚构的旧灯塔故事。所有人物均为成年人。玩家角色阿岚是负责维修灯塔的旅人，守灯人话少、务实但关心伙伴。'}}],chatMetadata:{},chat:[],extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'isolated-fixture'},getChatCompletionModel:()=> 'isolated-fixture',getPresetManager:()=>({getAllPresets:()=>['r20'],getSelectedPresetName:()=> 'r20',getCompletionPresetByName:()=>preset})};
 const w=data.worlds[worldKey(c)]=defaultWorld();w.modes.narrative.heartDirections=['输入评价','回应用户评价','剧情吐槽'];
 const macros=new Map();c.registerMacro=(n,f)=>macros.set(n,f);c.unregisterMacro=n=>macros.delete(n);c.substituteParams=s=>s.replace(/\{\{(tisya_\w+)\}\}/g,(_,n)=>macros.get(n)());
 registerLivePreset(c,()=>source,()=>c,()=>moods);registerPresetProtocol(c,()=>source,()=>{},()=>moods);
 const store=createStore({getContext:()=>c,persist:async()=>true}),host=createHost({getContext:()=>c,getSource:()=>source,store,prepareMessage,createParameters:createParameters??(async(s,model,type,messages)=>({generate_data:{messages,model}}))});c.registerMacro('tisya_config_selected',()=>host.selectedText());
 return {c,w,source,host};
}
function saved(n){return fixture({memory:'事件：[阿岚,守灯人]|E|已发生的记录 '+n+'：'+(n===1?'守灯人将北门铜钥匙交给阿岚，约定只在三短两长的敲门声后开门。':'两人在灯塔内继续核对维修记录。')}).replaceAll('心声：关闭','心声：有内容|输入评价|null|你又把嘴硬安排得明明白白。\n心声：有内容|回应用户评价|开心|谁让你偏爱这点别扭。\n心声：有内容|剧情吐槽|null|手先投降，嘴还在加班。');}

test('70 messages: all earlier memory blocks precede recent history in the actual request, once each',async()=>{
 const f=setup();f.c.chat=Array.from({length:70},(_,i)=>({is_user:i%2===0,mes:i%2===0?'输入 '+i:saved(i)}));f.c.chat.push({is_user:true,mes:'现在谁拿着北门铜钥匙，敲门约定是什么？'});
 const original=JSON.stringify(f.c.chat);await f.host.before('normal');const payload={messages:[]};await f.host.payloadReady(payload);
 const memory=payload.messages.find(m=>m.content.includes('<历史记忆>')),text=JSON.stringify(payload.messages);
 assert.ok(memory);const records=JSON.parse(memory.content.match(/<历史记忆>\n([\s\S]*?)\n<\/历史记忆>/)[1]);
 assert.deepEqual(records.map(r=>r.message),[2,4,6,8,10,12,14,16,18,20]);assert.match(records[0].memory,/\|E\|/);assert.match(records[0].memory,/北门铜钥匙/);
 assert.ok(payload.messages.indexOf(memory)<payload.messages.findIndex(m=>m.content==='输入 20'));assert.equal(payload.messages.at(-1).content.includes('现在谁'),false); // final delivery prompt may follow history
 for(let i=1;i<70;i+=2)assert.equal(text.split('已发生的记录 '+i+'：').length-1,1,'source '+i);
 assert.equal(f.host.preview().memory.injectedSources.length,10);assert.equal(f.host.preview().memory.recentMessages,51);assert.equal(f.host.preview().memory.strippedHeartMessages.length,25);assert.equal(JSON.stringify(f.c.chat),original);
 if(process.env.TISYA_REQUEST_EVIDENCE){fs.mkdirSync(process.env.TISYA_REQUEST_EVIDENCE,{recursive:true});fs.writeFileSync(process.env.TISYA_REQUEST_EVIDENCE+'/70-message-request.json',JSON.stringify({evidence:'Production request assembly; neutral 70-message fixture; no provider call',snapshot:f.host.preview()},null,2));}
});

test('window boundaries, opt-out, disabled history slot, and messages without memory are explicit',()=>{
 const f=setup();f.c.chat=[{mes:saved(1)},{mes:'旧无格式开场'},{is_user:true,mes:'现在'}];f.w.context.history=0;
 let memory=buildHistoryMemory(f.c,f.w);assert.equal(memory.report.injectedSources.length,1);assert.deepEqual(memory.report.withoutMemory,[1]);
 f.w.context.memory=false;assert.equal(buildHistoryMemory(f.c,f.w).text,'');
 f.w.context.memory=true;f.w.context.history=10;assert.equal(buildHistoryMemory(f.c,f.w).text,'');
 f.w.context.history=0;assert.deepEqual(buildMessages({source:{prompts:[],order:[]},context:f.c,world:f.w,substitute:s=>s}),[]);
 const source={prompts:[{identifier:'chatHistory',marker:true}],order:[{identifier:'chatHistory',enabled:true},{identifier:'chatHistory',enabled:true}]};
 assert.throws(()=>buildMessages({source,context:f.c,world:f.w,substitute:s=>s}),/历史槽重复/);
});

test('edits, deletions, swipes and branch changes cannot recall discarded memory',()=>{
 const f=setup();f.w.context.history=0;f.c.chat=[{mes:saved(1),swipes:[saved(99)],swipe_id:0},{is_user:true,mes:'现在'},{mes:saved(3)}];
 let recall=buildHistoryMemory(f.c,f.w,'swipe').text;assert.match(recall,/已发生的记录 1/);assert.doesNotMatch(recall,/已发生的记录 (3|99)/);
 f.c.chat[0].mes=saved(5);f.c.chat[0].swipe_id=1;recall=buildHistoryMemory(f.c,f.w,'swipe').text;assert.match(recall,/已发生的记录 5/);assert.doesNotMatch(recall,/已发生的记录 1/);
 f.c.chat.splice(0,1);assert.equal(buildHistoryMemory(f.c,f.w,'swipe').text,'');f.c.chatId='other';f.c.chat=[{is_user:true,mes:'另一个分支'}];assert.equal(buildHistoryMemory(f.c,f.w).text,'');
});

test('literal nested tags are not sources; incomplete old memory and mid-request changes stop the send',async()=>{
 const f=setup();f.w.context.history=0;f.c.chat=[{mes:saved(1).replace('</memory>','')},{is_user:true,mes:'现在'}];await f.host.before('normal');const p={messages:[]};await assert.rejects(f.host.payloadReady(p),/记忆边界无效/);assert.throws(()=>JSON.stringify(p));
 const g=setup({prepareMessage:async m=>{g.c.chat[0].mes='被编辑';return m.mes;}});g.c.chat=[{mes:saved(1)},{is_user:true,mes:'现在'}];await g.host.before('normal');await assert.rejects(g.host.payloadReady({messages:[]}),/聊天记录已变化/);
});

test('historical hearts are removed only from the sending copy; continuation tail stays intact',()=>{
 const raw=saved(1),clean=withoutHistoricalHearts(raw);assert.doesNotMatch(clean,/^心声：/m);assert.match(raw,/^心声：/m);assert.match(clean,/已发生的记录 1/);
 const f=setup();f.c.chat=[{mes:raw}];const source={prompts:[{identifier:'chatHistory',marker:true}],order:[{identifier:'chatHistory',enabled:true}]};
 const out=buildMessages({source,context:f.c,world:f.w,substitute:s=>s,type:'continue'});assert.equal(out[0].content,raw);
});

test('legacy YAML and JSON hearts are omitted without losing other fields, literals or source text',()=>{
 configureReplyFormats({yaml});
 const raw=legacyFixture(),clean=withoutHistoricalHearts(raw),before=parseDisplayEnvelope(raw),after=parseDisplayEnvelope(clean);
 for(const name of ['task','next']){const expected=readReplyBlock(before,name);delete expected.heart;assert.deepEqual(readReplyBlock(after,name),expected);}
 assert.match(raw,/heart:/);assert.doesNotMatch(clean,/heart:/);assert.equal(before.blocks.body,after.blocks.body);
 const json=raw.replace(/<task format="yaml"[^>]*>[\s\S]*?<\/task>/,'<task format="json">'+JSON.stringify({other:'a &amp; b',heart:{text:'OLD_HEART'}})+'</task>');
 const result=withoutHistoricalHearts(json);assert.doesNotMatch(result,/OLD_HEART/);assert.match(result,/a &amp; b/);
});

test('every live heart has a required real mood; empty catalogs fail and non-heart null remains valid',()=>{
 const f=setup();for(const detail of ['full','compact','format']){
  f.w.modes.narrative.workflowDetail=detail;const text=compileNarrative(f.c,f.source,moods).rest.entries.tisya_inner_chain;
  assert.match(text,/每条mood必选一个表情/);assert.doesNotMatch(text,/{mood或null}/);assert.ok(text.includes(JSON.stringify(moods)));assert.match(text,/null/);
  if(detail!=='format')assert.match(text,/\[CALL blk\.next\]\n@INPUT [^\n]*@BLOCK\.body\+@BLOCK\.task\.heart/);
 }
 assert.throws(()=>compileNarrative(f.c,f.source,[]),/表情目录为空/);
});

test('memory is counted by the actual budget and late edits invalidate assembled requests',async()=>{
 const f=setup();f.w.context.history=0;f.w.context.maxInputTokens=1;f.c.chat=[{mes:saved(1)},{is_user:true,mes:'现在'}];let counted='';f.c.getTokenCountAsync=async text=>{counted=text;return 2;};await f.host.before('normal');await assert.rejects(f.host.payloadReady({messages:[]}),/超出输入预算/);assert.match(counted,/<历史记忆>/);
 const g=setup({createParameters:async(s,model,type,messages)=>{g.c.chat[0].mes='已改';return {generate_data:{messages}};}});g.c.chat=[{mes:saved(1)},{is_user:true,mes:'现在'}];await g.host.before('normal');const payload={messages:[]};await assert.rejects(g.host.payloadReady(payload),/聊天记录已变化/);assert.throws(()=>JSON.stringify(payload));
});

test('isolated sandbox exports the complete production request with neutral source material',async()=>{
 if(!process.env.TISYA_SANDBOX_INPUT)return;
 const f=setup();f.w.context.history=2;f.c.chat=[{mes:saved(1)},{is_user:true,mes:'阿岚沿楼梯回到值班室。'},{mes:fixture({body:'1\n阿岚和守灯人回到旧灯塔的值班室，维修告一段落。\n\n2\n桌边晾着湿斗篷，灯芯仍然忽明忽暗。\n\n3\n守灯人把工具箱放下，问阿岚要不要先坐着等雨停。',memory:'事件：[阿岚,守灯人]|A|两人回到值班室，工具箱已经放下，雨尚未停。'})},{is_user:true,mes:'我让阿岚嘴硬说一点也不冷，可是伸手烤火又被烟呛得打喷嚏。让守灯人拆穿他并照顾他，嘴上嫌麻烦，实际把热茶推过来。外面响起三短两长的敲门声，只到阿岚摸到自己保管的钥匙，开不开门留给我。qwq缇斯亚你别笑太大声。'}];
 await f.host.before('normal');const payload={messages:[]};await f.host.payloadReady(payload);fs.writeFileSync(process.env.TISYA_SANDBOX_INPUT,JSON.stringify({messages:payload.messages},null,2));
});
