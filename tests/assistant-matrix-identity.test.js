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
import {createBookGateway} from '../tables/books.js';
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
 const savedBooks=new Map([['世界基点',[{uid:7,name:'【角色】旧人物',content:'固定来源原文',enabled:false}]]]);
 const helper={getWorldbookNames:async()=>[...savedBooks.keys()],getWorldbook:async name=>structuredClone(savedBooks.get(name)),createWorldbook:async(name,entries)=>{savedBooks.set(name,structuredClone(entries));return true;},updateWorldbookWith:async(name,fn)=>{savedBooks.set(name,structuredClone(fn(structuredClone(savedBooks.get(name)))));}};
 const sourceBooks=createBookGateway(()=>helper,()=>ctx);
 const characterReply='<reply><task/><anchor phase="before"/><title>新人物</title><body>1 完整设定</body><anchor phase="after"/><extra/><cells>【人物原点档案／1】\n1 显示名称：新人物\n20 公开身份：完整设定</cells><vars/><archive/><actions/></reply>';
 const worldReply='<reply><task/><anchor phase="before"/><title>新世界</title><body>1 新世界。</body><anchor phase="after"/><extra/><cells>【世界与历法身份／1】\n1 世界名称：新世界\n【常量分层速查／1】\n5 常量值：2000</cells><vars/><archive/><actions/></reply>';
 let capturedSource=null;const creator=createMatrixCreator({sourceBooks,database,getContext:()=>ctx,request:async(_task,text)=>{capturedSource=JSON.parse(text).source;return task==='genesis'?worldReply:characterReply;}});
 const tables=createTableService({creator,getContext:()=>ctx,store:{read:()=>({key:ctx.chatId,world:{}})}});tables.inspect=async()=>{throw Error('不应进入旧表单初始化');};
 const options={matrixDatabase:database,getContext:()=>ctx,getAvatar:()=>active,applyActive:id=>active=id,persistSettings:async()=>{settingsWrites++;if(failPersist&&ctx.powerUserSettings.tisya_identity_creation_pending?.stage==='settings')throw Error('槽位保存中断');return true;},persistChat:async()=>true,slotHost:{ensureAvatar:async id=>{avatars.push(id);if(failAvatar)throw Error('头像上传中断');return id;},initialize:async(id,profile)=>{slotWrites++;ctx.powerUserSettings.personas[id]=profile.name;ctx.powerUserSettings.persona_descriptions[id]={description:profile.description};}}};
 const identity=createIdentityService(options),w=new Window(),root=w.document.createElement('div');let panel=w.document.createElement('section');w.document.body.append(root,panel);
 const roles=createStoryIdentity({sourceBooks,config:host.config,getContext:()=>ctx,database,creator,getHelper:()=>null});let view=null;const routes=[];
 const mount=(input,node=panel)=>{view?.dispose();panel=node;view=mountMatrixIdentity(w.document,panel,{identity,config:host.config,roles,creationOnly:!!input,resourcesOnly:!!input,initialCreation:input??null});return view.ready;};
 const app=mountAssistantApp(w.document,root,{service:tables,identity,store:{},onClose(){},onIdentity(){throw Error('创作不应跳转到用户身份');},mountCreation:(_document,node,input)=>{routes.push(structuredClone(input));mount(input,node);return view;}});
 const source=task==='core'?await sourceBooks.readSource({book:'世界基点',uid:7}):null;
 await app.navigate(task,'',{destination:task==='genesis'?{book:'新世界书',newBook:true}:{book:'世界基点',...(source?{uid:7}:{})},source,createPersona:task!=='genesis'});

 const q=s=>panel.querySelector(s),button=label=>[...panel.querySelectorAll('button')].find(node=>node.textContent===label);
 const press=async action=>{if(action==='save')await view.saveDraft();else{button(action==='generate'?'生成表单草稿':action).click();await view.settled();}await app.settled();};
 const generate=async()=>{q('[data-creation-goal]').value='设计一位人物';q('[data-creation-goal]').dispatchEvent(new w.Event('input'));await press('generate');assert(q('[data-creation-draft]'),panel.querySelector('.tisya-identity-status')?.textContent);};
 const review=()=>{q('[data-creation-confirm]').checked=true;q('[data-creation-confirm]').dispatchEvent(new w.Event('change'));};
 return {ctx,database,host,identity,options,app,w,q,press,generate,review,avatars,panel,routes,button,get view(){return view;},source:()=>capturedSource,changeCore:()=>{savedBooks.get('世界基点')[0].content='外部改动';},reopen:()=>mount(null),counts:()=>({databaseWrites,slotWrites,settingsWrites}),failAvatar:v=>failAvatar=v,failPersist:v=>failPersist=v,active:()=>active,async close(){view?.dispose();app.dispose();await w.happyDOM.abort();}};
}
for(const task of ['idea','core'])test('assistant '+task+' reviews Matrix fields and optionally creates one independent native slot after actual Matrix commit',async()=>{
 const f=await fixture(task);try{await f.generate();assert.equal(f.counts().databaseWrites,0);assert(f.q('[data-creation-row][data-creation-key=name]'));assert.match(f.panel.textContent,/完整设定/);const name=f.q('[data-creation-row][data-creation-key=name]');name.value='核对后人物';name.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.review();await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert.equal(f.active(),'old');const id=Object.keys(f.ctx.powerUserSettings.personas).find(x=>x!=='old'),descriptor=f.ctx.powerUserSettings.persona_descriptions[id];assert.equal(f.ctx.powerUserSettings.personas[id],'核对后人物');assert.match(descriptor.description,/完整设定/);assert.equal(descriptor.tisyaOrigin,undefined);assert.equal(descriptor.tisyaMatrixOrigin.entityId,Object.keys((await f.database.read()).state.tables.T_SYS_ENTITIES)[0]);assert.match(descriptor.tisyaMatrixOrigin.operationId,/^creation:/);assert.equal(f.identity.hasCreationPending(),false);assert.equal(Object.values((await f.database.read()).state.tables.T_CHAR_DOSSIER)[0].values.name,'核对后人物');assert.equal(f.button('保存').disabled,true);}finally{await f.close();}
});
test('failed Matrix slot upload retries retained receipt without repeating database commit',async()=>{const f=await fixture();try{await f.generate();f.review();f.failAvatar(true);await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,0);assert(f.identity.hasCreationPending());const id=f.identity.read().creationPending.id;f.failAvatar(false);await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert(f.avatars.every(value=>value===id));assert.equal(f.identity.hasCreationPending(),false);}finally{await f.close();}});
test('Matrix slot persisted intent resumes after service recreation without another database or slot write',async()=>{const f=await fixture('core');try{await f.generate();f.review();f.failPersist(true);await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);const intent=structuredClone(f.identity.read().creationPending);assert.equal(intent.reference.database,true);assert.match(intent.reference.operationId,/^creation:/);f.failPersist(false);const cold=createIdentityService(f.options);await cold.resumeCreation();assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert.equal(cold.hasCreationPending(),false);await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,1);assert.equal(f.button('保存').disabled,true);assert.equal(f.active(),'old');}finally{await f.close();}});


test('world creation leaves the old table setup unmounted and never creates a native identity slot',async()=>{
 const f=await fixture('genesis');try{
  assert.equal(f.routes.length,1);assert.equal(f.routes[0].kind,'world');assert.equal(f.routes[0].createPersona,false);
  assert.equal(f.app.root.shadowRoot.querySelector('.tisya-tables'),null);
  await f.generate();f.review();await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(f.counts().slotWrites,0);assert.equal(Object.values((await f.database.read()).state.tables.T_STATIC_WORLDS)[0].values.name,'新世界');
 }finally{await f.close();}
});

test('core creation passes the fixed source and rejects source drift before any database or persona write',async()=>{
 const f=await fixture('core');try{
  await f.generate();assert.equal(f.source().content,'固定来源原文');f.review();f.changeCore();await f.press('save');
  assert.equal(f.counts().databaseWrites,0);assert.equal(f.counts().slotWrites,0);assert.match(f.panel.textContent,/来源.*变|条目.*变|已变化/);
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
  f.review();await f.press('save');assert.equal(f.counts().databaseWrites,0);assert.match(f.panel.textContent,/数据格式/);year.value='2026';year.dispatchEvent(new f.w.Event('input'));f.review();await f.press('save');assert.equal(f.counts().databaseWrites,1);assert.equal(Object.values((await f.database.read()).state.tables.T_STATIC_CONSTANTS)[0].values.value,2026);assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});
