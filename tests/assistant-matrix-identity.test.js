import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {createTableService} from '../tables/service.js';
import {createIdentityService} from '../user-identity-service.js';
import {mountAssistantApp} from '../assistant-app.js';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
let serial=0;
async function fixture(task='idea'){
 const ctx={chatId:'assistant-matrix-'+(++serial),characterId:0,characters:[{avatar:'world.png'}],chat:[],name1:'原身份',extensionSettings:{},chatMetadata:{},saveChat:async()=>true,powerUserSettings:{personas:{old:'原身份'},persona_descriptions:{old:{description:'保留原文'}},persona_description:'保留原文'}};
 const disk=new Map(),storage={get:async id=>structuredClone(disk.get(id)),set:async(id,value)=>disk.set(id,structuredClone(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,structuredClone(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});await host.ensureDatabase();
 let databaseWrites=0,slotWrites=0,settingsWrites=0,failAvatar=false,failPersist=false,active='old';const avatars=[];
 const database={read:()=>host.readDatabase(),commit:async patch=>{databaseWrites++;return host.commitDatabase(patch);}};
 const proposal={name:'设计人物',summary:'测试',unresolved:[],matrix:{binding:{entityId:'entity',dossierId:'dossier'},changes:[{tableId:'T_CHAR_DOSSIER',recordId:'dossier',values:{name:'新人物',manifest:'完整设定'}},{tableId:'T_SYS_ENTITIES',recordId:'entity',values:{kind:'character',origin_record_ref:'origin'}},{tableId:'M_FIELD_REFERENCES',recordId:'origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'entity',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'dossier',reference_kind:'record',resolution_status:'resolved'}}]}};
 let capturedSource=null;const creator=createMatrixCreator({database,getContext:()=>ctx,request:async(_task,text)=>{capturedSource=JSON.parse(text).source;return JSON.stringify(task==='genesis'?{name:'新世界',unresolved:[],matrix:{changes:[{tableId:'T_STATIC_WORLDS',recordId:'new-world',values:{name:'新世界'}},{tableId:'T_STATIC_CONSTANTS',recordId:'constant',values:{value:2000}}]}}:proposal);}});
 const tables=createTableService({creator,getContext:()=>ctx,store:{read:()=>({key:ctx.chatId,world:{}})}});let coreSource={name:'稳定基点',book:'基点',id:'fixed',version:1,traits:{性格:'固定来源原文'}};tables.identityCores=async()=>[structuredClone(coreSource)];tables.inspect=async()=>{throw Error('不应进入旧表单初始化');};
 const options={matrixDatabase:database,getContext:()=>ctx,getAvatar:()=>active,applyActive:id=>active=id,persistSettings:async()=>{settingsWrites++;if(failPersist&&ctx.powerUserSettings.tisya_identity_creation_pending?.stage==='settings')throw Error('槽位保存中断');return true;},persistChat:async()=>true,slotHost:{ensureAvatar:async id=>{avatars.push(id);if(failAvatar)throw Error('头像上传中断');return id;},initialize:async(id,profile)=>{slotWrites++;ctx.powerUserSettings.personas[id]=profile.name;ctx.powerUserSettings.persona_descriptions[id]={description:profile.description};}}};
 const identity=createIdentityService(options),w=new Window(),root=w.document.createElement('div'),panel=w.document.createElement('section');w.document.body.append(root,panel);
 const roles=createStoryIdentity({config:host.config,getContext:()=>ctx,database,creator,getHelper:()=>null});let view=null;const routes=[];
 const mount=input=>{view?.dispose();view=mountMatrixIdentity(w.document,panel,{identity,config:host.config,roles,initialCreation:input?{kind:input.creationKind,goal:input.goal,useCore:input.useCore,createPersona:input.createPersona}:null,listCreationCores:()=>tables.identityCores()});return view.ready;};
 const app=mountAssistantApp(w.document,root,{service:tables,identity,store:{},onClose(){},onIdentity:async input=>{routes.push(structuredClone(input));await mount(input);}});await app.navigate(task);
 const q=s=>panel.querySelector(s),button=label=>[...panel.querySelectorAll('button')].find(node=>node.textContent===label);
 const press=async action=>{if(action==='save')await view.saveDraft();else{button(action==='generate'?'生成表单草稿':action).click();await view.settled();}await app.settled();};
 const generate=async()=>{q('[data-creation-goal]').value='设计一位人物';q('[data-creation-goal]').dispatchEvent(new w.Event('input'));await press('generate');assert(q('[data-creation-draft]'),panel.textContent);};
 const review=()=>{q('[data-creation-confirm]').checked=true;q('[data-creation-confirm]').dispatchEvent(new w.Event('change'));};
 return {ctx,database,host,identity,options,app,w,q,press,generate,review,avatars,panel,routes,button,get view(){return view;},source:()=>capturedSource,changeCore:()=>{coreSource.traits.性格='外部改动';},reopen:()=>mount(null),counts:()=>({databaseWrites,slotWrites,settingsWrites}),failAvatar:v=>failAvatar=v,failPersist:v=>failPersist=v,active:()=>active,async close(){view?.dispose();app.dispose();await w.happyDOM.abort();}};
}
for(const task of ['idea','core'])test('assistant '+task+' reviews Matrix fields and creates one independent native slot after actual Matrix commit',async()=>{
 const f=await fixture(task);try{await f.generate();assert.equal(f.counts().databaseWrites,0);assert(f.q('[data-creation-row][data-creation-key=name]'));assert.match(f.panel.textContent,/完整设定/);const name=f.q('[data-creation-row][data-creation-key=name]');name.value='核对后人物';name.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.review();await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert.equal(f.active(),'old');const id=Object.keys(f.ctx.powerUserSettings.personas).find(x=>x!=='old'),descriptor=f.ctx.powerUserSettings.persona_descriptions[id];assert.equal(f.ctx.powerUserSettings.personas[id],'核对后人物');assert.match(descriptor.description,/完整设定/);assert.equal(descriptor.tisyaOrigin,undefined);assert.equal(descriptor.tisyaMatrixOrigin.entityId,'entity');assert.match(descriptor.tisyaMatrixOrigin.operationId,/^creation:/);assert.equal(f.identity.hasCreationPending(),false);assert.equal((await f.database.read()).state.tables.T_CHAR_DOSSIER.dossier.values.name,'核对后人物');assert.equal(f.button('保存').disabled,true);}finally{await f.close();}
});
test('failed Matrix slot upload retries retained receipt without repeating database commit',async()=>{const f=await fixture();try{await f.generate();f.review();f.failAvatar(true);await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,0);assert(f.identity.hasCreationPending());const id=f.identity.read().creationPending.id;f.failAvatar(false);await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert(f.avatars.every(value=>value===id));assert.equal(f.identity.hasCreationPending(),false);}finally{await f.close();}});
test('Matrix slot persisted intent resumes after service recreation without another database or slot write',async()=>{const f=await fixture('core');try{await f.generate();f.review();f.failPersist(true);await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);const intent=structuredClone(f.identity.read().creationPending);assert.equal(intent.reference.database,true);assert.match(intent.reference.operationId,/^creation:/);f.failPersist(false);const cold=createIdentityService(f.options);await cold.resumeCreation();assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert.equal(cold.hasCreationPending(),false);await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert.equal(f.button('保存').disabled,true);assert.equal(f.active(),'old');}finally{await f.close();}});


test('world creation leaves the old table setup unmounted and never creates a native identity slot',async()=>{
 const f=await fixture('genesis');try{
  assert.deepEqual(f.routes,[{creationKind:'world',goal:'',useCore:false,createPersona:false}]);
  assert.equal(f.app.root.shadowRoot.querySelector('.tisya-tables'),null);
  await f.generate();f.review();await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,0);assert.equal((await f.database.read()).state.tables.T_STATIC_WORLDS['new-world'].values.name,'新世界');
 }finally{await f.close();}
});

test('core creation passes the fixed source and rejects source drift before any database or persona write',async()=>{
 const f=await fixture('core');try{
  await f.generate();assert.equal(f.source().traits.性格,'固定来源原文');f.review();f.changeCore();await f.press('save');
  assert.equal(f.counts().databaseWrites,0);assert.equal(f.counts().slotWrites,0);assert.match(f.panel.textContent,/基点版本已改变/);
 }finally{await f.close();}
});

test('reopening the unified identity page resumes an interrupted slot without an old page or database write',async()=>{
 const f=await fixture();try{
  await f.generate();f.review();f.failAvatar(true);await f.press('save');assert.equal(f.counts().databaseWrites,1);const pending=f.identity.read().creationPending.id;
  f.failAvatar(false);await f.reopen();assert(f.q('[data-identity-creation-pending]'));await f.press('save');
  assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert(f.avatars.every(id=>id===pending));assert.equal(f.identity.hasCreationPending(),false);assert.equal(f.button('保存').disabled,true);
 }finally{await f.close();}
});

test('creation history and exported draft retain invalid typed input until it is corrected and reviewed',async()=>{
 const f=await fixture('genesis');try{
  await f.generate();let year=f.q('[data-creation-key=value]');year.value='尚待确定，不应丢失';year.dispatchEvent(new f.w.Event('input'));await f.press('generate');
  assert(f.q('[data-creation-history]'));await f.press('恢复创作草稿 1');year=f.q('[data-creation-key=value]');assert.equal(year.value,'尚待确定，不应丢失');assert.equal(year.checkValidity(),false);assert.equal(f.q('[data-creation-confirm]').checked,false);
  const exported=f.view.exportDraft();assert.equal(exported.format,'tisya.unified-identity-recovery/1');assert.equal(exported.creation.fieldTexts['1:value'],'尚待确定，不应丢失');assert.equal(exported.creation.fieldErrors['1:value'],true);assert(exported.creationHistory.length>=1);assert.equal(f.counts().databaseWrites,0);
  f.review();await f.press('save');assert.equal(f.counts().databaseWrites,0);assert.match(f.panel.textContent,/数据格式/);year.value='2026';year.dispatchEvent(new f.w.Event('input'));f.review();await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal((await f.database.read()).state.tables.T_STATIC_CONSTANTS.constant.values.value,2026);assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});
