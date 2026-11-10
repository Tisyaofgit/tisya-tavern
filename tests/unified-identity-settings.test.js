import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {digest} from '../engine/common.mjs';
import {createConfiguration} from '../engine/config.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';
import {createIdentityService} from '../user-identity-service.js';
import {mountExtensionPreferences} from '../extension-preferences-ui.mjs';
import {builtinExtensionDefinitions,builtinPresentationDefinitions,EXTENSION_PREFERENCE_TABLE} from '../extension-preferences.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const button=(root,label)=>[...root.querySelectorAll('button')].find(node=>node.textContent===label);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

async function setup({companion=false}={}){
 const window=new Window(),root=window.document.createElement('main');window.document.body.append(root);
 const ctx={extensionSettings:{},chatMetadata:{},chatId:'a',characterId:0,characters:[{avatar:'world.png',data:{name:'原世界',description:'现有来源定义'}}],name1:'甲',powerUserSettings:{personas:{a:'甲'},persona_descriptions:{a:{description:'原心愿'}},persona_description:'原心愿'},getWorldInfoNames:async()=>['资料']};
 let configWrites=0,profileWrites=0,failBinding=false,failDatabase=false,requests=0,revision=1;
 const config=createConfiguration({getContext:()=>ctx,persist:async()=>{configWrites++;return true;}}),saveConfig=config.save;
 config.save=async value=>{if(failBinding&&value.story.userBinding?.dossierId!=='person')throw Error('绑定存储故障');return saveConfig(value);};
 const rt=new Runtime(initializeState(catalog));
 rt.newRecord('T_CHAR_DOSSIER',{name:'原人物',manifest:'原始档案'},'person');rt.newRecord('T_SYS_ENTITIES',{kind:'character',origin_record_ref:'origin'},'person');
 rt.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'person',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'person',reference_kind:'record'},'origin');
 rt.newRecord('T_STATIC_WORLDS',{name:'本世界'},'world');
 let data=rt.data;const writes=[],attempts=[],operations=new Map();
 const database={read:async()=>({state:structuredClone(data),revision,contextKey:ctx.chatId}),commit:async patch=>{
  attempts.push(patch.operationId);if(failDatabase)throw Error('表单存储故障');const fingerprint=digest(patch.changes);
  if(operations.has(patch.operationId)){assert.equal(operations.get(patch.operationId),fingerprint);return {state:structuredClone(data),revision,contextKey:ctx.chatId,receipt:{replayed:true}};}
  assert.equal(patch.contextKey,ctx.chatId,'context conflict');assert.equal(patch.expectedRevision,revision,'revision conflict');
  const next=new Runtime(data);for(const change of patch.changes){if(!next.rows(change.tableId)[change.recordId])next.newRecord(change.tableId,{},change.recordId);for(const [key,value]of Object.entries(change.values))next.set([change.tableId,change.recordId,key,[]],value);}
  data=next.data;revision++;writes.push(structuredClone(patch));operations.set(patch.operationId,fingerprint);return {state:structuredClone(data),revision,contextKey:ctx.chatId,receipt:{replayed:false}};
 }};
 const builtins={bookNames:()=>({templates:'缇斯亚模板书',beauty:'缇斯亚美化书'}),status:()=>({status:'ready'}),update:async()=>({status:'ready'})};
 const creator=createMatrixCreator({database,getContext:()=>ctx,request:async()=>{requests++;return {name:'新世界',unresolved:[],matrix:{changes:[{tableId:'T_STATIC_WORLDS',recordId:'new-world',values:{name:'新世界'}}]}};}});
 const roles=createStoryIdentity({config,getContext:()=>ctx,database,builtins,creator,getHelper:()=>null});await roles.bind({dossierId:'person'});await roles.saveResources({phoneWorld:{database:true,worldId:'world'}});configWrites=0;
 const identity=createIdentityService({getContext:()=>ctx,getAvatar:()=> 'a',applyActive:(id,name)=>{ctx.name1=name;ctx.powerUserSettings.persona_description=ctx.powerUserSettings.persona_descriptions[id].description;},persistSettings:async()=>{profileWrites++;return true;},persistChat:async()=>true});
 const creationRoutes=[];const ui=mountMatrixIdentity(window.document,root,{identity,config,roles,onCreate:input=>creationRoutes.push(structuredClone(input))});await ui.ready;
 let preferences=null;
 if(companion){const node=window.document.createElement('section'),books={definitions:async kind=>(kind==='extensions'?builtinExtensionDefinitions():builtinPresentationDefinitions()).map((definition,i)=>({definition,source:{book:kind,uid:String(i),digest:'a'.repeat(64)}}))};
  preferences=mountExtensionPreferences(window.document,node,{database,books,getScope:()=>{const value=config.read();return {ownerId:value.story.userBinding?.entityId,worldId:value.story.phoneWorld?.worldId,outputConfigId:null};},externalActions:true,onStateChange:()=>ui.refreshState()});ui.setCompanion(preferences);await preferences.ready;
 }
 const input=(selector,value,event='input')=>{const node=root.querySelector(selector);assert(node,selector);if(node.type==='checkbox')node.checked=value;else node.value=value;node.dispatchEvent(new window.Event(event));return node;};
 return {creationRoutes,window,root,ctx,config,roles,database,ui,preferences,writes,attempts,input,get data(){return data;},get profileWrites(){return profileWrites;},get configWrites(){return configWrites;},get requests(){return requests;},failBinding(value){failBinding=value;},failDatabase(value){failDatabase=value;},async click(label){button(root,label).click();await ui.settled();await preferences?.settled?.();await tick();},async close(){ui.dispose();preferences?.dispose();await window.happyDOM.abort();}};
}

test('one footer saves native wishes, reviewed dossier and several presentation regions without duplicate stores',async()=>{
 const f=await setup({companion:true});try{
  assert.equal(f.root.querySelectorAll('footer').length,1);
  f.input('[data-identity-wish]','新心愿');f.input('[data-role-edit-name]','人物新名字');await f.click('预览档案变更');f.input('[data-database-confirm]',true,'change');
  f.input('[data-extension-count]','0');f.input('[data-extension-view]','news','change');await f.preferences.settled();f.input('[data-extension-limit]','3');
  assert.equal(f.writes.length,0);assert.equal(await f.ui.saveDraft(),true,f.root.querySelector('.tisya-identity-status').textContent);
  assert.equal(f.ctx.powerUserSettings.persona_descriptions.a.description,'新心愿');assert.equal(f.data.tables.T_CHAR_DOSSIER.person.values.name,'人物新名字');
  assert.equal(f.writes.length,2);assert.equal(f.writes[1].changes.length,2);const values=Object.values(f.data.tables[EXTENSION_PREFERENCE_TABLE]).map(row=>row.values);assert.equal(values.find(row=>row.view_id==='forum').generate_count,0);assert.equal(values.find(row=>row.view_id==='news').display_limit,3);assert.equal(f.ui.state().dirty,false);
  assert(f.root.querySelector('.tisya-identity-content').contains(f.preferences.root));
 }finally{await f.close();}
});

test('a missing dossier review blocks every component before the native profile is changed',async()=>{
 const f=await setup({companion:true});try{f.input('[data-identity-wish]','保留草稿');f.input('[data-role-edit-name]','待确认');f.input('[data-extension-count]','1');assert.equal(await f.ui.saveDraft(),false);assert.equal(f.profileWrites,0);assert.equal(f.writes.length,0);assert.equal(f.root.querySelector('[data-identity-wish]').value,'保留草稿');assert.equal(f.ui.state().dirty,true);}finally{await f.close();}
});

test('the identity page routes character creation to the single assistant without a manual writer',async()=>{
 const f=await setup();try{
  assert.equal(f.root.querySelector('[data-role-create]'),null);assert.equal(f.root.querySelector('[data-database-creation]'),null);
  await f.click('前往缇斯亚助手创建人物');assert.equal(f.creationRoutes.length,1);assert.equal(f.creationRoutes[0].kind,'character');assert.equal(f.creationRoutes[0].createPersona,undefined);assert.equal(f.writes.length,0);assert.equal(f.requests,0);assert.equal(f.config.read().story.userBinding.dossierId,'person');
 }finally{await f.close();}
});

test('world creation is a source-book task handed to the same assistant and leaves the active identity unchanged',async()=>{
 const f=await setup();try{
  await f.click('前往缇斯亚助手创建世界');assert.deepEqual(f.creationRoutes,[{kind:'world',destination:{book:'',newBook:true}}]);assert.equal(f.requests,0);assert.equal(f.writes.length,0);assert.equal(f.profileWrites,0);assert.equal(f.config.read().story.userBinding.dossierId,'person');assert.equal(f.ctx.powerUserSettings.persona_description,'原心愿');
 }finally{await f.close();}
});

test('identity settings expose typed existing fields but no second JSON creation editor',async()=>{
 const f=await setup();try{
  assert(f.root.querySelector('[data-role-edit-name]'));assert.equal(f.root.querySelector('[data-creation-draft]'),null);assert.equal(f.root.querySelector('[data-creation-goal]'),null);assert.doesNotMatch(f.root.textContent,/候选内容（可修改 JSON）/);
  f.input('[data-role-edit-name]','待核对的新名字');assert.equal(await f.ui.saveDraft(),false);assert.equal(f.writes.length,0);assert.equal(f.root.querySelector('[data-role-edit-name]').value,'待核对的新名字');
 }finally{await f.close();}
});

test('one leave prompt cancels identity and presentation edits together without persistence',async()=>{
 const f=await setup({companion:true});try{
  f.input('[data-identity-wish]','待丢弃');f.input('[data-extension-count]','9');const leave=f.ui.confirmLeave();await tick();assert.equal(f.root.querySelectorAll('[role="dialog"]').length,1);button(f.root,'放弃修改').click();assert.equal(await leave,true);assert.equal(f.ui.state().dirty,false);assert.equal(f.writes.length,0);assert.equal(f.profileWrites,0);assert.equal(f.root.querySelector('[data-identity-wish]').value,'原心愿');
 }finally{await f.close();}
});

test('shared save reports confirmed presentation persistence when its final reread fails and never repeats it',async()=>{
 const f=await setup({companion:true});try{
  const originalRead=f.database.read,originalCommit=f.database.commit;let failRead=false;
  f.database.read=async()=>{if(failRead){failRead=false;throw Error('呈现保存后的读取中断');}return originalRead();};
  f.database.commit=async patch=>{const result=await originalCommit(patch);if(patch.source.kind==='extension-preferences')failRead=true;return result;};
  f.input('[data-identity-wish]','已确认心愿');f.input('[data-extension-count]','4');assert.equal(await f.ui.saveDraft(),false);assert.equal(f.writes.length,1);assert.equal(f.profileWrites,1);assert.equal(f.ui.state().dirty,false);assert.equal(f.preferences.state().receipt.confirmed,true);assert.equal(f.preferences.state().reviewRequired,true);assert(f.ui.state().receipts.includes('小剧场与手机呈现'));assert.match(f.root.querySelector('.tisya-identity-status').textContent,/已保存.*小剧场与手机呈现.*已保存，但重新读取失败/);
  assert.equal(await f.ui.saveDraft(),true);assert.equal(f.writes.length,1);button(f.root,'读取当前人物与世界配置').click();await f.preferences.settled();assert.equal(f.preferences.state().reviewRequired,false);assert.equal(f.root.querySelector('[data-extension-count]').value,'4');assert.equal(f.writes.length,1);
 }finally{await f.close();}
});

test('confirmed dossier plus failed name sync can resume shared presentation save at the receipt revision',async()=>{
 const f=await setup({companion:true});try{
  f.input('[data-role-edit-name]','待同步名字');await f.click('预览档案变更');f.input('[data-database-confirm]',true,'change');f.input('[data-extension-count]','2');
  const originalSave=f.config.save;f.config.save=async()=>{throw Error('名字同步暂不可用');};assert.equal(await f.ui.saveDraft(),false);assert.equal(f.writes.length,1);assert.equal(f.data.tables.T_CHAR_DOSSIER.person.values.name,'待同步名字');assert.equal(f.preferences.state().dirty,true);assert.equal(f.ui.state().dirty,true);
  f.config.save=originalSave;assert.equal(await f.ui.saveDraft(),true,f.root.querySelector('.tisya-identity-status').textContent);assert.equal(f.writes.length,2);assert.equal(f.writes[1].changes[0].tableId,EXTENSION_PREFERENCE_TABLE);assert.equal(f.attempts[0],f.attempts[1]);assert.equal(f.config.read().story.userName,'待同步名字');assert.equal(f.ui.state().dirty,false);
 }finally{await f.close();}
});
