import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Window} from 'happy-dom';
import {definitions,originalMap} from './fixtures/worldbook-native-definitions.js';

// Use the actual console, management and store modules with a host that stays
// generating throughout. No model service or user storage is involved.
test('worldbook console opens and completes host reads, writes and export while generation continues',async()=>{
 const w=new Window({url:'https://host.test/'}),database={Alpha:{entries:{0:{uid:0,content:'已发送的内容',comment:'原条目',key:[],constant:true,disable:false,order:100,position:0}}}};
 let idleCalls=0,settingsSaves=0,channel;
 const sent=JSON.stringify({messages:[{role:'system',content:database.Alpha.entries[0].content}]});
 const settings={world_info_budget:25,world_info_min_activations:0,world_info_max_recursion_steps:0};
 const context={characterId:0,chatId:'chat',characters:[{avatar:'a.png',data:{extensions:{world:'Alpha'}}}],extensionSettings:{},chatMetadata:{},eventTypes:{},eventSource:{on(){},removeListener(){}},getRequestHeaders:()=>({})};
 const native={newWorldInfoEntryDefinition:definitions,originalWIDataKeyMap:originalMap,world_info:{charLore:[]},world_names:['Alpha'],selected_world_info:['Alpha'],getWorldInfoSettings:()=>({...settings,world_info:{}}),flushWorldInfoSaves:async()=>{},flushPendingWorldInfoSettings(){},updateWorldInfoList:async()=>{},updateWorldInfoSettings(s,a){Object.assign(settings,s);native.selected_world_info.splice(0,native.selected_world_info.length,...a);},async saveWorldInfo(name,data){database[name]=structuredClone(data);},setWIOriginalDataValue(){},deleteWIOriginalDataValue(){}};
 w.structuredClone=structuredClone;
 w.fetch=async(_path,{body})=>({ok:true,json:async()=>structuredClone(database[JSON.parse(body).name]),text:async()=>JSON.stringify(database[JSON.parse(body).name])});
 w.MessageChannel=class{constructor(){channel=this;this.port1={messages:[],postMessage(m){this.messages.push(m);},start(){},close(){}};this.port2={};}};
 w.fixture={native,power_user:{},getCharaFilename:()=> 'a',getTokenCountAsync:async s=>s.length,download:async text=>{w.exported=JSON.parse(text);},getOneCharacter:async()=>{},select_selected_character(){},saveMetadata:async()=>true};
 const hostModule=Object.keys(w.fixture).filter(k=>k!=='native').map(k=>`export const ${k}=window.fixture.${k};`).join('\n');
 const nativeModule=Object.keys(native).map(k=>`export const ${k}=window.fixture.native.${k};`).join('\n');
 const bundle=await build({stdin:{contents:"import {createWorldbookConsole} from './worldbook-console.js';window.makeConsole=createWorldbookConsole;",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'iife',define:{'import.meta.url':JSON.stringify('https://host.test/extension/worldbook-console.js')},plugins:[{name:'host-fixture',setup(b){b.onResolve({filter:/^\/(scripts\/|script\.js)/},a=>({path:a.path,namespace:'host'}));b.onLoad({filter:/.*/,namespace:'host'},a=>({contents:a.path==='/scripts/world-info.js'?nativeModule:hostModule}));}}]});
 try{
  w.eval(bundle.outputFiles[0].text);
  const app=w.makeConsole({document:w.document,getContext:()=>context,assertIdle:()=>{idleCalls++;throw Error('生成中');},persistSettings:async()=>{settingsSaves++;return true;},openNative(){},characterLinks:{list:()=>[],read:async()=>({}),save:async()=>({})}});
  app.open();const frame=w.document.getElementById('tisya-worldbook-console');assert(frame);frame.dispatchEvent(new w.Event('load'));assert(channel);
  const call=async(method,payload)=>{const id=channel.port1.messages.length+1;await channel.port1.onmessage({data:{id,method,payload}});const reply=channel.port1.messages.findLast(m=>m.id===id);assert(reply);assert.equal(reply.error,undefined);return reply.result;};
  const draft=await call('load');draft.entries[0].content='保存给下轮';draft.globalSettings.world_info_budget=30;
  assert.equal((await call('save',draft)).ok,true);assert.equal(database.Alpha.entries[0].content,'保存给下轮');assert.equal(settings.world_info_budget,30);assert.equal(settingsSaves,1);
  await call('export',{id:draft.books[0].id});assert.equal(w.exported.entries[0].content,'保存给下轮');
  await call('display','hidden');app.open();assert.equal(w.document.getElementById('tisya-worldbook-console'),frame);assert.equal(idleCalls,0);assert.equal(JSON.parse(sent).messages[0].content,'已发送的内容');app.dispose();
 }finally{await w.happyDOM.abort();w.close();}
});

test('worldbook binding save is independent of generation while character management stays locked',async()=>{
 const w=new Window({url:'https://host.test/'}),card={avatar:'a.png',name:'甲',data:{extensions:{world:'Alpha'}}};
 const context={characterId:0,chatId:'chat',characters:[structuredClone(card)],extensionSettings:{},getRequestHeaders:()=>({})};
 const lore={charLore:[]};let idleCalls=0;
 w.structuredClone=structuredClone;
 w.fetch=async(path,{body})=>{const p=JSON.parse(body);if(path==='/api/characters/merge-attributes')card.data.extensions.world=p.data.extensions.world;return {ok:true,json:async()=>structuredClone(card),text:async()=>''};};
 w.bindingFixture={lore,context,getOneCharacter:async()=>{context.characters[0]=structuredClone(card);}};
 const stub=`export const power_user={},accountStorage={},tags=[],tag_map={},world_info=window.bindingFixture.lore,world_names=['Alpha','Beta'];export const getCharaFilename=(_,{manualAvatarKey}={})=>manualAvatarKey?.replace(/\\.png$/,'')??'a';export const getOneCharacter=window.bindingFixture.getOneCharacter;export const select_selected_character=()=>{},flushWorldInfoSaves=async()=>{},updateWorldInfoList=async()=>{},getTokenCountAsync=async()=>0,download=async()=>{},enqueueImportedCharacterAgentAssetScan=async()=>{},clearCharacterSkillImportReminders=()=>{};`;
 const bundle=await build({stdin:{contents:"import {createCharacterGroupHost} from './character-group-host.js';window.makeCharacterHost=createCharacterGroupHost;",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'iife',logLevel:'silent',define:{'import.meta.url':JSON.stringify('https://host.test/extension/character-group-host.js')},plugins:[{name:'host-fixture',setup(b){b.onResolve({filter:/^\/(scripts\/|script\.js)/},a=>({path:a.path,namespace:'host'}));b.onLoad({filter:/.*/,namespace:'host'},()=>({contents:stub}));}}]});
 try{
  w.eval(bundle.outputFiles[0].text);
  const host=w.makeCharacterHost({document:w.document,getContext:()=>context,assertIdle(){idleCalls++;throw Error('生成中');},persistSettings:async()=>true});
  assert.throws(()=>host.open(),/生成中/);
  const before=await host.bindings.read('a.png'),payload={...before,primary:'Beta',extra:['Alpha']};
  await assert.rejects(host.dispatch('bindingsSave',payload),/生成中/);
  const saved=await host.bindings.save(payload);assert.equal(saved.primary,'Beta');assert.deepEqual([...saved.extra],['Alpha']);assert.equal(card.data.extensions.world,'Beta');assert.equal(host.isBusy(),false);assert.equal(idleCalls,2);
  await assert.rejects(host.bindings.save(payload),/变化/);assert.equal(card.data.extensions.world,'Beta');assert.equal(host.isBusy(),false);
  assert.throws(()=>host.open(),/生成中/);host.dispose();
 }finally{await w.happyDOM.abort();w.close();}
});
