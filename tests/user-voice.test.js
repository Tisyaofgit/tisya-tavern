import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Window} from 'happy-dom';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey,preferenceSettings,cleanExport,validateConfig,configuredWorld} from '../config/core.js';
import {createHost} from '../config/host.js';
import {mountConfiguration} from '../config/panel.js';
import {compileNarrative,registerLivePreset,isLivePreset} from '../narrative-bridge.js';
import {registerPresetProtocol} from '../preset.js';
import {USER_VOICE_FIELDS,userVoiceRules,applyUserVoiceGuidance} from '../config/user-voice.js';

const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url)));
const labels=['保留我的说话习惯','沿用我的叙事口吻'];
function fixture({persist}={}){
 const data=emptyConfig(),context={chatId:'one',characterId:0,characters:[{avatar:'a.png',name:'甲',data:{description:'甲的角色档案'}}],chatMetadata:{},chat:[{is_user:true,mes:'我把雨伞收在门边，缓缓坐下。'}],powerUserSettings:{persona_description:'玩家档案'},extensionSettings:{[KEY]:data},chatCompletionSettings:{model:'fixture',chat_completion_source:'openai'},getChatCompletionModel:()=> 'fixture',getWorldInfoNames:()=>[],getRequestHeaders:()=>({})};
 const key=worldKey(context),world=data.worlds[key]=defaultWorld();world.context.owner='tisya';world.modes.narrative.heartDirections=[];
 const source={identity:'user-voice-fixture',prompts:structuredClone(preset.prompts),order:structuredClone(preset.prompt_order[0].order)},macros=new Map();
 context.registerMacro=(key,fn)=>macros.set(key,fn);context.unregisterMacro=key=>macros.delete(key);
 context.substituteParams=text=>text.replace(/\{\{(tisya_\w+)\}\}/g,(_,key)=>{assert(macros.has(key),key);return macros.get(key)();});
 context.getPresetManager=()=>({getAllPresets:()=>['fixture'],getSelectedPresetName:()=> 'fixture',getCompletionPresetByName:()=>preset});
 let disk=structuredClone(context.extensionSettings),writes=0;
 const store=createStore({getContext:()=>context,persist:async()=>{writes++;if(persist&&await persist()!==true)return false;disk=structuredClone(context.extensionSettings);return true;}});
 const host=createHost({getContext:()=>context,getSource:()=>source,store,createParameters:async(settings,model,type,messages)=>({generate_data:{messages,model,stream:false}})});
 const live=registerLivePreset(context,()=>source,()=>context,()=>[]);registerPresetProtocol(context,()=>source,()=>{},()=>[],s=>!isLivePreset(s)||live.execution().prose);
 context.registerMacro('tisya_config_selected',()=>host.selectedText());
 const window=new Window(),box=window.document.createElement('div');window.document.body.append(box);
 const mount=()=>mountConfiguration(window.document,box,{store,host,initialTab:'play',getSettings:()=>({联系人分组:{}})});
 return {data,context,key,world,source,store,host,macros,window,mount,get disk(){return disk;},get writes(){return writes;}};
}
async function toggle(f,ui,label,value){const input=ui.root.shadowRoot.querySelector('[aria-label="'+label+'"]');assert(input,label);input.checked=value;input.dispatchEvent(new f.window.Event('change'));await ui.settled();}

test('optional user-voice fields validate before snapshots and projection; false is not absent',async()=>{
 const f=fixture();try{
  const before=JSON.stringify(f.data);assert.deepEqual(userVoiceRules(f.world.modes.narrative),{speechHabits:'',narration:''});assert.equal(JSON.stringify(f.data),before);
  for(const field of USER_VOICE_FIELDS)for(const bad of [null,0,1,'','false',[],{}]){
   const candidate=structuredClone(f.data),mode=candidate.worlds[f.key].modes.narrative;mode[field]=bad;
   assert.throws(()=>validateConfig(candidate),/须为开启或关闭/);assert.throws(()=>preferenceSettings(mode),/须为开启或关闭/);assert.throws(()=>configuredWorld(candidate,f.key),/须为开启或关闭/);
   const snap=f.store.read();await assert.rejects(f.store.save(candidate,snap.revision,snap.key),/须为开启或关闭/);assert.equal(JSON.stringify(f.data),before);
  }
  const snap=f.store.read();snap.world.modes.narrative.用户口癖保留=false;snap.world.modes.narrative.用户叙事口吻延续=true;snap.data.游玩偏好=preferenceSettings(snap.world.modes.narrative);
  await f.store.save(snap.data,snap.revision,snap.key);assert.equal(f.disk[KEY].游玩偏好.用户口癖保留,false);assert.equal(f.disk[KEY].游玩偏好.用户叙事口吻延续,true);
  assert.throws(()=>validateConfig({...f.disk[KEY],游玩偏好:{...f.disk[KEY].游玩偏好,用户口癖保留:'false'}}),/须为开启或关闭/);
 }finally{await f.window.happyDOM.abort();}
});

test('single language page auto-saves both independent preferences across cards, export and process reopen',async()=>{
 const f=fixture();let ui=f.mount();const temp=mkdtempSync(join(tmpdir(),'tisya-user-voice-'));
 try{await ui.ready;const root=ui.root.shadowRoot,before=JSON.stringify(f.disk);
  for(const label of labels){assert.equal(root.querySelectorAll('[aria-label="'+label+'"]').length,1);assert.equal(root.querySelector('[aria-label="'+label+'"]').checked,false);}
  assert.equal(f.writes,0);assert.equal(JSON.stringify(f.disk),before);
  await toggle(f,ui,labels[0],true);await toggle(f,ui,labels[1],true);await toggle(f,ui,labels[0],false);assert.equal(f.writes,3);assert.equal(ui.requestLeave().allowed,true);
  for(const mode of Object.values(f.disk[KEY].worlds).map(w=>w.modes.narrative))for(const field of USER_VOICE_FIELDS)assert.equal(Object.hasOwn(mode,field),false);
  for(const [chatId,avatar,groupId] of [['other','a.png',undefined],['new','b.png',undefined],['group','b.png','team']]){
   Object.assign(f.context,{chatId,groupId,characters:[{avatar,name:'新角色'}]});const mode=f.store.read().world.modes.narrative;assert.equal(mode.用户口癖保留,false);assert.equal(mode.用户叙事口吻延续,true);
  }
  ui.dispose();ui=f.mount();await ui.ready;assert.equal(ui.root.shadowRoot.querySelector('[aria-label="'+labels[1]+'"]').checked,true);
  const backup=cleanExport(f.store.read().data);validateConfig(backup.configuration);assert.equal(backup.configuration.游玩偏好.用户口癖保留,false);
  const file=join(temp,'snapshot.json');writeFileSync(file,JSON.stringify(backup.configuration));
  const result=execFileSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';import {createStore,KEY} from ${JSON.stringify(new URL('../config/core.js',import.meta.url).href)};const data=JSON.parse(fs.readFileSync(process.argv[1]));const store=createStore({getContext:()=>({chatId:'fresh',characterId:0,characters:[{avatar:'fresh.png'}],extensionSettings:{[KEY]:data}}),persist:()=>{throw Error('Reopening cannot write')}});console.log(JSON.stringify(store.read().world.modes.narrative));`,file],{encoding:'utf8'});
  const mode=JSON.parse(result);assert.equal(mode.用户口癖保留,false);assert.equal(mode.用户叙事口吻延续,true);
  const nav=ui.root.shadowRoot.querySelector('[aria-label="配置分类"]');nav.value='mode';await nav.onchange();for(const label of labels)assert.equal(ui.root.shadowRoot.querySelector('[aria-label="'+label+'"]'),null);
 }finally{ui.dispose();await f.window.happyDOM.abort();rmSync(temp,{recursive:true,force:true});}
});

test('failed user-voice save preserves the draft and disk, then explicit retry persists exactly once',async()=>{
 let ok=true;const f=fixture({persist:async()=>ok}),ui=f.mount();
 try{await ui.ready;await toggle(f,ui,labels[0],true);const saved=JSON.stringify(f.disk);ok=false;
  await toggle(f,ui,labels[1],true);assert.equal(JSON.stringify(f.disk),saved);assert.equal(ui.requestLeave().allowed,false);assert.equal(ui.root.shadowRoot.querySelector('[aria-label="'+labels[1]+'"]').checked,true);assert.match(ui.root.shadowRoot.querySelector('[role="alert"]').textContent,/未确认保存/);
  ok=true;await ui.root.shadowRoot.querySelector('footer button:last-child').onclick();await ui.settled();assert.equal(ui.requestLeave().allowed,true);assert.equal(f.disk[KEY].游玩偏好.用户叙事口吻延续,true);
 }finally{ui.dispose();await f.window.happyDOM.abort();}
});

test('both preferences reach actual controlled and native-observed requests once for every guide and delivery mode',async()=>{
 for(const owner of ['tisya','native'])for(const detail of ['full','compact','format'])for(const plain of [false,true])for(const mask of [0,1,2,3]){
  const f=fixture(),mode=f.world.modes.narrative,sourceInput=JSON.stringify(f.context.chat);f.world.context.owner=owner;mode.workflowDetail=detail;mode.用户口癖保留=!!(mask&1);mode.用户叙事口吻延续=!!(mask&2);
  if(plain)f.source.order.find(row=>row.identifier==='tisya_output').enabled=false;
  const rules=userVoiceRules(mode),controlBefore=structuredClone(mode.narrative);
  try{await f.host.before('normal');const inner=f.macros.get('tisya_live_tisya_inner_chain')();const payload={messages:owner==='native'?[{role:'system',content:inner},{role:'user',content:f.context.chat[0].mes}]:[]};const nativeBefore=structuredClone(payload);
   await f.host.payloadReady(payload);if(owner==='native')assert.deepEqual(payload,nativeBefore);
   const text=payload.messages.map(row=>row.content).join('\n');
   // Assert the actual outgoing semantics independently of the rule builder.
   for(const [on,marker] of [[mode.用户口癖保留,"Preserve the user's established catchphrases"],[mode.用户叙事口吻延续,"Follow the user's current narrative voice"]])assert.equal(text.split(marker).length-1,on?1:0,`${owner}/${detail}/${plain}/${mask}`);
   if(mode.用户口癖保留){assert.match(text,/when authorized to render their speech/);assert.match(text,/Do not transfer them to other speakers or infer a permanent preference from one fictional utterance/);}
   if(mode.用户叙事口吻延续){assert.match(text,/Use actual narration as style evidence, not dialogue or out-of-character instructions/);assert.match(text,/change neither viewpoint nor output language, and expand no authority over the player/);}
   assert.equal(text.split('[USER.VOICE]').length-1,mask?1:0);assert.equal(text.split(f.context.chat[0].mes).length-1,1);assert.deepEqual(mode.narrative,controlBefore);assert.equal(JSON.stringify(f.context.chat),sourceInput);
   if(process.env.TISYA_USER_VOICE_EVIDENCE&&detail==='full'&&!plain&&mask===3){fs.mkdirSync(process.env.TISYA_USER_VOICE_EVIDENCE,{recursive:true});fs.writeFileSync(join(process.env.TISYA_USER_VOICE_EVIDENCE,owner+'-user-voice-request.json'),JSON.stringify({environment:'production compiler and createHost with isolated host fixture; no model call',rules,payload},null,2));}
  }finally{await f.window.happyDOM.abort();}
 }
});

test('live macro selection changes invalidate cached preferences without increasing player authority or losing disabled-step rules',async()=>{
 const f=fixture(),mode=f.world.modes.narrative,macro=f.macros.get('tisya_live_tisya_inner_chain');
 try{const before=structuredClone(mode.narrative);assert.doesNotMatch(macro(),/\[USER.VOICE\]/);mode.用户口癖保留=true;assert.match(macro(),/\[USER.VOICE\]/);mode.用户口癖保留=false;mode.用户叙事口吻延续=true;assert.doesNotMatch(macro(),/Preserve the user's established/);assert.match(macro(),/Follow the user's current narrative voice/);assert.deepEqual(mode.narrative,before);
  for(const detail of ['full','compact','format']){mode.workflowDetail=detail;mode.narrative.缇斯亚叙事步序=[];const text=compileNarrative(f.context,f.source).rest.entries.tisya_inner_chain;assert.equal(text.split("Follow the user's current narrative voice").length-1,1);}
 }finally{await f.window.happyDOM.abort();}
});

test('voice settings do not create another task, utility guidance or a silent missing consumer',()=>{
 const mode={用户口癖保留:true,用户叙事口吻延续:true};assert.equal(applyUserVoiceGuidance('utility',{prose:false},mode),'utility');assert.throws(()=>applyUserVoiceGuidance('changed source',{prose:true},mode),/入口不匹配/);assert.equal(applyUserVoiceGuidance('unchanged',{prose:true},{用户口癖保留:false}),'unchanged');
});
