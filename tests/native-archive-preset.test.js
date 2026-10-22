import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWorld,emptyConfig} from '../config/core.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {taskSlots} from '../tables/slots.js';
import {prepareNativeMvu} from '../config/native-mvu.js';
import {CAPTURE_RULES} from '../tables/conditions.js';
const configuration={world:defaultWorld(),data:emptyConfig()};
const active={enabled:true,writer:'native-mvu',sourceFloor:3,index:3,snapshotFloor:2,nativeOwned:false,archiveAlready:false};
const preset=(task,nativeBridge,archiveProposal=false)=>pairedPreset({task,configuration,nativeBridge,archiveProposal});
test('native permission requires the actual archive bridge, never another task or configuration alone',()=>{
 for(const bridge of [undefined,{},false,{...active,enabled:false},{...active,writer:'other'}]){
  const p=preset('tableArchive',bridge);assert.doesNotMatch(p.entries.tisya_registry,/\[NATIVE.ARCHIVE\]/);assert.match(p.entries.tisya_registry,/except preferences\/native_cells/);assert.match(p.entries.tisya_task_start,/no native_cells write permission/);
 }
 for(const task of ['tableArchive','historyImport']){const p=preset(task,active);assert.match(p.entries.tisya_registry,/\[NATIVE.ARCHIVE\]/);assert.match(p.entries.tisya_registry,/SAME changes array/);assert.doesNotMatch(p.entries.tisya_registry,/except preferences\/native_cells/);assert.match(p.entries.tisya_inner_chain,/native_cells/);assert.doesNotMatch(p.entries.tisya_user_relation,/不写原生变量/);}
 assert.doesNotMatch(preset('objectArchive',active).entries.tisya_registry,/\[NATIVE.ARCHIVE\]/);
 assert.match(CAPTURE_RULES.native,/实际读回快照/);
});
test('already-owned and already-archived routes narrow the same proposal contract and retain repair coverage',()=>{
 const owned=preset('tableArchive',{...active,nativeOwned:true});assert.match(owned.entries.tisya_registry,/emit NO native_cells/);
 const archived=preset('tableArchive',{...active,archiveAlready:true});assert.match(archived.entries.tisya_registry,/propose ONLY permitted native_cells/);
 const review=preset('tableArchive',active,true);assert.match(review.entries.tisya_registry,/same proposal-tool batch/);assert.match(review.entries.tisya_registry,/changes 必须保持空数组/);assert.match(review.entries.tisya_registry,/Do not drop native proposals/);
});
test('actual task slot serialization retains bridge provenance and literal native values without mutation',()=>{
 const input={nativeBridge:active,nativeState:{readOnly:true,sourceFloor:3,snapshotFloor:2,valuesFrom:'currentRows.native_cells'},nativeRules:['规则原文'],currentRows:[{id:'native-1',table:'native_cells',rev:2,access:{readers:[],knowers:[]},values:{路径:'/资源',值:{zero:0,off:false,empty:[],map:{}}}}],archiveSource:{text:'本回合事实'},repair:{previous:{changes:[{id:'native-1',table:'native_cells',values:{值:{zero:1}}}]}}};
 const before=structuredClone(input),state=taskSlots('tableArchive',input).state;
 assert.deepEqual(state.nativeBridge,active);assert.deepEqual(state.rows,input.currentRows);assert.deepEqual(state.repair,input.repair);
 const messages=taskMessages({preset:preset('tableArchive',active),task:'tableArchive',input});
 const wire=messages.map(m=>m.content).join('\n');for(const part of ['snapshotFloor','native-mvu','规则原文','"zero":0','"off":false','native-1'])assert(wire.includes(part),part);assert.deepEqual(input,before);
});
test('bridge main prompt includes only actual enabled marker and snapshot, never panel HTML or native commands',async()=>{
 const world=defaultWorld();world.tables={nativeBridge:true};
 const card={name:'fixture',data:{extensions:{tavern_helper:{scripts:[{type:'script',enabled:true,content:"import 'https://cdn.invalid/MagVarUpdate/x'"}]}},character_book:{entries:[{enabled:true,content:'<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>\n<StatusPlaceHolderImpl/>\n<div>HTML_IMPLEMENTATION</div>'},{enabled:false,content:'<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable><DisabledPlaceHolder/>'}]}}};
 const context={characters:[card],characterId:0,chat:[{mes:'test'}]},runtime={getMvuData:()=>({stat_data:{n:0,on:false,list:[],map:{}}}),parseMessage(){throw Error('read only');}};
 const result=await prepareNativeMvu(context,world,'normal',runtime);
 assert.equal(result.nativeBridge,true);assert.match(result.text,/vars 必须为 <vars\/>/);assert.match(result.text,/extra 内各输出一次/);assert.match(result.text,/<StatusPlaceHolderImpl\/>/);assert.doesNotMatch(result.text,/HTML_IMPLEMENTATION|DisabledPlaceHolder|<UpdateVariable>/);assert.match(result.text,/"n":0,"on":false,"list":\[\],"map":\{\}/);
 card.data.character_book.entries[0].content='<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>';
 assert.doesNotMatch((await prepareNativeMvu(context,world,'normal',runtime)).text,/StatusPlaceHolderImpl/);
 card.data.character_book.entries.push({id:6,comment:'状态栏',enabled:true,constant:true,content:'每回合输出 <StatusPlaceHolderImpl/>，本条关闭时不得输出。'});
 assert.match((await prepareNativeMvu(context,world,'normal',runtime)).text,/<StatusPlaceHolderImpl\/>/);
 card.data.character_book.entries.at(-1).enabled=false;
 assert.doesNotMatch((await prepareNativeMvu(context,world,'normal',runtime)).text,/StatusPlaceHolderImpl/);
 card.data.character_book.entries.at(-1).enabled=true;card.data.character_book.entries.at(-1).disable=true;
 assert.doesNotMatch((await prepareNativeMvu(context,world,'normal',runtime)).text,/StatusPlaceHolderImpl/);
});

test('createHost request forwards actual bridge metadata through taskPreset to the transport compiler',async()=>{
 const {createHost}=await import('../config/host.js'),{KEY,worldKey,createStore}=await import('../config/core.js');
 const data=emptyConfig(),context={chatId:'prompt-test',characterId:0,characters:[{avatar:'fixture.png',name:'fixture'}],chatMetadata:{},chat:[],extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'capture-only',chat_completion_source:'custom'},getChatCompletionModel:s=>s.model,getPresetManager:()=>({getAllPresets:()=>[]}),substituteParams:s=>s};
 data.worlds[worldKey(context)]=defaultWorld();
 const store=createStore({getContext:()=>context,persist:async()=>true});let captured;
 const host=createHost({store,getContext:()=>context,getSource:()=>({prompts:[]}),createParameters:async(settings,model,type,messages)=>{captured=messages;throw Error('CAPTURE_ONLY_NO_TRANSPORT');}});
 for(const nativeBridge of [undefined,active,{...active,nativeOwned:true},{...active,archiveAlready:true}]){
  captured=null;await assert.rejects(host.request('tableArchive',{nativeBridge,nativeState:{readOnly:true,snapshotFloor:2,sourceFloor:3,valuesFrom:'currentRows.native_cells'},archiveSource:{text:'已确认原文'},registry:{tables:[],types:[]},currentRows:[]}),/CAPTURE_ONLY_NO_TRANSPORT/);
  const compiled=captured.map(m=>m.content).join('\n');
  if(!nativeBridge)assert.doesNotMatch(compiled,/\[NATIVE.ARCHIVE\]/);
  else {assert.match(compiled,/\[NATIVE.ARCHIVE\]/);assert.match(compiled,/"snapshotFloor":2/);if(nativeBridge.nativeOwned)assert.match(compiled,/emit NO native_cells/);if(nativeBridge.archiveAlready)assert.match(compiled,/propose ONLY permitted native_cells/);}
 }
});
