import {EMOTIONS} from '../emotion-catalog.js';
const MOODS=EMOTIONS.map(r=>r.name);
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {nativeMvuDeclaration,prepareNativeMvu} from '../config/native-mvu.js';
import {emptyConfig,defaultWorld,worldKey,KEY,createStore} from '../config/core.js';
import {compileNarrative,registerLivePreset} from '../narrative-bridge.js';
import {registerPresetProtocol} from '../preset.js';
import {createHost} from '../config/host.js';
import {inspectMessage} from '../reader.js';import {parseDisplayEnvelope} from '../reader-core.js';
import {fixture} from './fixtures/journey-r4.cjs';
function setup(){
 const card={avatar:'native.png',name:'变量卡',data:{extensions:{tavern_helper:{scripts:[{type:'script',enabled:true,id:'native-mvu',content:"import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@master/artifact/bundle.js'"}]}},character_book:{entries:[{comment:'变量格式',enabled:true,content:'<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>'},{comment:'[mvu_update]计数规则',enabled:true,content:'只按实际事件修改计数。'},{comment:'[mvu_update]禁用规则',enabled:false,content:'DISABLED_RULE'},{comment:'无关条目',enabled:true,content:'UNRELATED_BOOK'}]}}};
 const c={chatId:'test',characterId:0,characters:[card],extensionSettings:{},chatMetadata:{},chat:[{mes:'开场'},{mes:'继续',is_user:true}],chatCompletionSettings:{},getPresetManager:()=>({getAllPresets:()=>['paired'],getSelectedPresetName:()=> 'paired'}),getChatCompletionModel:()=> 'test',stopGeneration(){}};
 const d=emptyConfig(),w=defaultWorld();w.context.owner='tisya';d.worlds[worldKey(c)]=w;c.extensionSettings[KEY]=d;
 const p=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url))),source={prompts:p.prompts,order:p.prompt_order[0].order};
 let state={计数:0,开启:false,文本:''};const reads=[],runtime={getMvuData(o){reads.push(o);return o.message_id===0?{stat_data:state}:{};},parseMessage(){throw Error('adapter must never execute updates');}};
 return {c,w,d,source,runtime,reads,setState:s=>state=s};
}
test('native card declaration is separate from the Tisya executor flag and respects card/off/script switches',()=>{
 const f=setup();assert.equal(f.w.modes.narrative.narrative.缇斯亚MVU兼容,false);assert.ok(nativeMvuDeclaration(f.c,f.w));
 f.w.modes.narrative.nativeMvu='off';assert.equal(nativeMvuDeclaration(f.c,f.w),null);delete f.w.modes.narrative.nativeMvu;
 f.c.characters[0].data.extensions.tavern_helper.scripts[0].enabled=false;assert.equal(nativeMvuDeclaration(f.c,f.w),null);
});
test('native preparation preserves 0/false/empty values, excludes unrelated/disabled entries, never writes',async()=>{
 const f=setup(),before=JSON.stringify(f.c),result=await prepareNativeMvu(f.c,f.w,'normal',f.runtime);
 assert.match(result.text,/"计数":0,"开启":false,"文本":""/);assert.match(result.text,/只按实际事件/);assert.doesNotMatch(result.text,/DISABLED_RULE|UNRELATED_BOOK/);
 assert.equal(JSON.stringify(f.c),before);assert.deepEqual(f.reads.map(r=>r.message_id),[1,0]);
 await assert.rejects(prepareNativeMvu(f.c,f.w,'normal',{}),/已启用.*尚未就绪/);
 f.setState(null);await assert.rejects(prepareNativeMvu(f.c,f.w,'normal',f.runtime),/损坏/);
});
test('native MVU uses selected branch pre-swipe state and current user snapshot when present',async()=>{
 const f=setup();f.c.chat.push({mes:'discarded'});
 const runtime={parseMessage(){},getMvuData:({message_id})=>({stat_data:{floor:message_id}})};
 assert.equal((await prepareNativeMvu(f.c,f.w,'swipe',runtime)).messageIndex,1);
 assert.equal((await prepareNativeMvu(f.c,f.w,'normal',runtime)).messageIndex,2);
});
test('all compiled detail levels retain native JSONPatch format without disabled MVU wording',()=>{
 const f=setup();for(const detail of ['full','compact','format']){f.w.modes.narrative.workflowDetail=detail;const text=compileNarrative(f.c,f.source,MOODS).rest.entries.tisya_inner_chain;assert.doesNotMatch(text,/MVU is disabled|MVU disabled→/);assert.match(text,/原生更新标签/);assert.match(text,/原生脚本为唯一结算者/);}
});
test('actual host request supplies native state and rules, and rejects state drift before send',async()=>{
 const f=setup(),old=globalThis.Mvu;globalThis.Mvu=f.runtime;
 try{
  const macros=new Map();f.c.registerMacro=(k,v)=>macros.set(k,v);f.c.unregisterMacro=k=>macros.delete(k);f.c.substituteParams=s=>s.replace(/\{\{(tisya_\w+)\}\}/g,(_,k)=>macros.get(k)());
  const store=createStore({getContext:()=>f.c,persist:async()=>true});const host=createHost({getContext:()=>f.c,getSource:()=>f.source,store,createParameters:async(_,model,type,messages)=>({generate_data:{model,messages}})});
  registerLivePreset(f.c,()=>f.source,()=>f.c,()=>MOODS);registerPresetProtocol(f.c,()=>f.source,()=>{},()=>MOODS);f.c.registerMacro('tisya_config_selected',()=>host.selectedText());
  await host.before('normal');const payload={messages:[]};await host.payloadReady(payload);const text=JSON.stringify(payload);
  assert.match(text,/status_current_variables/);assert.match(text,/只按实际事件修改计数/);assert.doesNotMatch(text,/MVU is disabled|UNRELATED_BOOK/);
  await host.before('normal');f.setState({计数:1});const drift={messages:[]};await assert.rejects(host.payloadReady(drift),/MVU 来源或变量已变化/);assert.throws(()=>JSON.stringify(drift));
 }finally{if(old===undefined)delete globalThis.Mvu;else globalThis.Mvu=old;}
});
test('native XML updates remain readable without source mutation or public variable leakage',()=>{
 const ops=[{op:'delta',path:'/计数',value:0},{op:'replace',path:'/开启',value:false},{op:'replace',path:'/文本',value:'literal </JSONPatch> & <not-a-tag>'}];
 const source=fixture({memory:'权限：vars|/计数|E\n权限：vars|/开启|E\n权限：vars|/文本|E\n事件：玩家|A|门开了'}).replace('<vars/>','<vars format="xml"><UpdateVariable><JSONPatch>'+JSON.stringify(ops)+'</JSONPatch></UpdateVariable></vars>');
 const before=source,e=parseDisplayEnvelope(source),view=inspectMessage(source);assert.deepEqual(JSON.parse(e.blocks.vars).operations,ops);assert.equal(view.details.error,undefined);assert.equal(view.journey.error,undefined);assert.equal(view.actions.error,undefined);assert.equal(source,before);assert.doesNotMatch(JSON.stringify(view.journey),/not-a-tag|operations/);
});
test('native appended status marker is a read-only extra attachment; arbitrary trailing text still fails',()=>{
 const original=fixture()+'\n<StatusPlaceHolderImpl/>',e=parseDisplayEnvelope(original);assert.match(e.blocks.extra,/<StatusPlaceHolderImpl\/>/);assert.ok(original.endsWith('</reply>\n<StatusPlaceHolderImpl/>'));
 assert.throws(()=>parseDisplayEnvelope(fixture()+'\nNOPE\n<StatusPlaceHolderImpl/>'));
});

const nativeFormat=`变量输出格式:
 rule:
 - you must output the update analysis and the actual update commands at once in the end of the next reply
 format: |-
  <UpdateVariable>
  <Analysis>private example</Analysis>
  <JSONPatch>[]</JSONPatch>
  </UpdateVariable>
关键变量 value 形态速查:
  /玩家角色/背包物品: {物品名: {数量: 数字}}
  FIELD_SCHEMA_MUST_SURVIVE`;
test('native request leaves original variable material, history and tools byte-for-byte unchanged',async()=>{
 const f=setup();f.w.context.owner='native';f.w.context.card=false;
 f.c.characters[0].data.character_book.entries[0].content=nativeFormat;
 const store=createStore({getContext:()=>f.c,persist:async()=>true}),host=createHost({getContext:()=>f.c,getSource:()=>f.source,store,createParameters(){throw Error('native route must not be rebuilt');}});
 const payload={messages:[{role:'system',content:nativeFormat},{role:'user',content:'current'}],tools:[{type:'function',function:{name:'database'}}],model:'native'};
 const before=structuredClone(payload);await host.before('normal');await host.payloadReady(payload);assert.deepEqual(payload,before);assert.equal(Object.hasOwn(payload,'toJSON'),false);
 payload.messages.push({role:'system',content:'DATABASE_LATE'});assert.doesNotThrow(()=>JSON.stringify(payload));
});
test('preprocessing and all three output consumers are generic without an MVU brand declaration',()=>{
 const f=setup();f.c.characters[0].data.extensions.tavern_helper.scripts=[];
 for(const detail of ['full','compact','format']){f.w.modes.narrative.workflowDetail=detail;
  const entries=compileNarrative(f.c,f.source,MOODS).rest.entries;
  assert.match(entries.tisya_task_start,/@COMPONENT_ROUTE/);assert.match(entries.tisya_task_start,/@VARIABLE_ROUTE/);
  assert.doesNotMatch(entries.tisya_inner_chain,/MVU is disabled|MVU disabled→/);
  assert.match(entries.tisya_inner_chain,/不转换成另一种 MVU 方言/);
  if(detail!=='format')for(const block of ['vars','extra','status'])assert.match(entries.tisya_inner_chain,new RegExp('@IN.output_refs.'+block));
 }
});
test('different external update syntaxes stay opaque, private and available to their native writer',()=>{
 for(const update of ['<UpdateVariable>_.set(\"score\", 4);</UpdateVariable>','<StateChange>{\"score\":4}</StateChange>']){
  const source=fixture().replace('<vars/>','<vars format="xml"><![CDATA['+update+']]></vars>'),before=source;
  const e=parseDisplayEnvelope(source),view=inspectMessage(source),v=JSON.parse(e.blocks.vars);
  assert.equal(v.protocol,'external-native');assert.equal(v.opaque,true);assert.equal(v.source,update);assert.equal(view.journey.error,undefined);assert.equal(source,before);assert.doesNotMatch(JSON.stringify(view.journey),/StateChange|_.set/);
 }
});
test('legacy appended native update is readable once without source writes or private Analysis leakage',()=>{
 const ops=[{op:'replace',path:'/世界状态/当前时间',value:'2001-10-12 11:08'},{op:'replace',path:'/备注',value:'literal </JSONPatch> & <not-tag>'}];
 const block='<UpdateVariable><Analysis>PRIVATE_REASONING_DO_NOT_SHOW</Analysis><JSONPatch>'+JSON.stringify(ops)+'</JSONPatch></UpdateVariable>';
 for(const slot of ['<vars/>','<vars>  </vars>'])for(const status of ['','\n<StatusPlaceHolderImpl/>']){
  const source=fixture().replace('<vars/>',slot)+'\n'+block+status,prior=source;
  const e=parseDisplayEnvelope(source);assert.deepEqual(JSON.parse(e.blocks.vars).operations,ops);assert.doesNotMatch(JSON.stringify(inspectMessage(source)),/PRIVATE_REASONING_DO_NOT_SHOW/);assert.equal(source,prior);
 }
 for(const source of [fixture()+'\n'+block+'\n'+block,fixture()+'\n'+block+'\nARBITRARY_TAIL',fixture().replace('<vars/>','<vars format="xml">'+block+'</vars>')+'\n'+block,fixture()+'\n<UpdateVariable><JSONPatch>[bad]</JSONPatch></UpdateVariable>'])assert.throws(()=>parseDisplayEnvelope(source));
});
test('native RFC add operation is retained without changing its dialect',()=>{const source=fixture().replace('<vars/>','<vars format="xml"><UpdateVariable><JSONPatch>[{"op":"add","path":"/items/-","value":"新增"}]</JSONPatch></UpdateVariable></vars>');assert.deepEqual(JSON.parse(parseDisplayEnvelope(source).blocks.vars).operations,[{op:'add',path:'/items/-',value:'新增'}]);});
