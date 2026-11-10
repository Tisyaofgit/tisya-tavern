import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {createBookGateway} from '../tables/books.js';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const copy=structuredClone;
let serial=0;
async function fixture(){
 const original='阿青是河口旅人，习惯先听人说话。',books=new Map([['角色来源',[{uid:3,name:'【角色】阿青',content:original,enabled:false}]]]),disk=new Map();
 const ctx={chatId:'recovery-ui-'+(++serial),characterId:0,characters:[{avatar:'world.png'}],chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true};
 const helper={getWorldbookNames:async()=>[...books.keys()],getWorldbook:async name=>copy(books.get(name)),createWorldbook:async(name,rows)=>{books.set(name,copy(rows));return true;},updateWorldbookWith:async(name,fn)=>{books.set(name,copy(fn(copy(books.get(name)))));}};
 const storage={get:async id=>copy(disk.get(id)),set:async(id,value)=>disk.set(id,copy(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,copy(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});await host.ensureDatabase();
 const sourceBooks=createBookGateway(()=>helper,()=>ctx),commits=[];let failCreation=false,failRepair=false;
 const database={read:()=>host.readDatabase(),commit:async input=>{if(failCreation&&input.source?.kind==='creation')throw Error('当前聊天保存中断');if(failRepair&&input.source?.kind==='legacy-character-repair')throw Error('旧档保存中断');const result=await host.commitDatabase(input);if(!result.receipt.replayed)commits.push(copy(input));return result;}};
 const raw='<reply><task/><anchor phase="before"/><title>阿青</title><body>1 阿青是河口旅人。</body><anchor phase="after"/><extra/><cells>【人物原点档案／1】\n1 显示名称：阿青\n20 公开身份：河口旅人</cells><vars/><archive/><actions/></reply>';
 const rolesFactory=()=>createStoryIdentity({config:host.config,getContext:()=>ctx,getHelper:()=>helper,database,sourceBooks,creator:createMatrixCreator({database,getContext:()=>ctx,sourceBooks,request:async()=>raw})});
 let roles=rolesFactory(),view;const window=new Window(),root=window.document.createElement('main');window.document.body.append(root);
 const mount=async initialCreation=>{view?.dispose();roles=rolesFactory();view=mountMatrixIdentity(window.document,root,{config:host.config,roles,resourcesOnly:true,creationOnly:!!initialCreation,initialCreation});assert.equal(await view.ready,true,root.textContent);};
 const click=async label=>{const button=[...root.querySelectorAll('button')].find(node=>node.textContent===label);assert(button,label);button.click();await view.settled();};
 const pick=async(selector,value)=>{const node=root.querySelector(selector);assert(node,selector);node.value=String(value);await node.onchange();await view.settled();};
 const field=(key,value)=>{const node=root.querySelector('[data-role-field="'+key+'"]');assert(node,key);node.value=value;node.dispatchEvent(new window.Event('input'));};
 const confirm=selector=>{const node=root.querySelector(selector);assert(node,selector);node.checked=true;node.dispatchEvent(new window.Event('change'));};
 return {original,books,ctx,host,database,sourceBooks,commits,root,window,mount,click,pick,field,confirm,get roles(){return roles;},get view(){return view;},failCreation:value=>{failCreation=value;},failRepair:value=>{failRepair=value;},async close(){view?.dispose();await window.happyDOM.abort();}};
}

async function seedLegacy(f){
 const source=await f.roles.readSource({book:'角色来源',uid:3}),snapshot=await f.database.read();
 await f.database.commit({operationId:'old-import',expectedRevision:snapshot.revision,contextKey:snapshot.contextKey,source:{kind:'legacy-character-import',book:source.book,uid:source.uid,rawEntry:source.entry},changes:[
  {tableId:'T_CHAR_DOSSIER',recordId:'old-dossier',values:{name:'阿青',manifest:f.original}},
  {tableId:'T_SYS_ENTITIES',recordId:'old-entity',values:{kind:'character',origin_record_ref:'old-origin'}},
  {tableId:'M_FIELD_REFERENCES',recordId:'old-origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'old-entity',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'old-dossier',reference_kind:'record',resolution_status:'resolved'}}
 ]});
 await f.roles.bind({dossierId:'old-dossier'});
}

test('old source repair uses the existing typed identity form, reviewed diff and same entity transaction',async()=>{
 const f=await fixture();try{
  await seedLegacy(f);await f.mount();await f.pick('[data-role-book]','角色来源');await f.pick('[data-source-entry]',3);await f.click('按原文整理旧档案');
  assert(f.root.querySelector('[data-source-repair]'));assert.equal(f.commits.length,1);assert.equal(await f.view.saveDraft(),false);
  f.field('public_identity','河口旅人');await f.click('预览档案变更');assert(f.root.querySelector('[data-identity-draft]'));assert.equal(await f.view.saveDraft(),false);assert.equal(f.commits.length,1);
  f.confirm('[data-database-confirm]');f.failRepair(true);assert.equal(await f.view.saveDraft(),false);const operation=f.view.exportDraft().recordDraft.id;assert.match(f.root.textContent,/旧档保存中断/);assert.equal(f.view.exportDraft().sourceRepair.source.content,f.original);
  f.failRepair(false);assert.equal(await f.view.saveDraft(),true,f.root.textContent);const saved=await f.database.read(),row=saved.state.tables.T_CHAR_DOSSIER['old-dossier'];
  assert.equal(row.values.public_identity,'河口旅人');assert.equal(row.states.manifest,'unset');assert.equal(Object.keys(saved.state.tables.T_CHAR_DOSSIER).length,1);assert.equal(Object.keys(saved.state.tables.T_SYS_ENTITIES).length,1);
  assert.equal(f.commits.at(-1).operationId,operation);assert.equal(f.commits.at(-1).source.rawEntry.content,f.original);assert.equal(f.commits.at(-1).source.previousValues.manifest,f.original);assert.equal(f.books.get('角色来源')[0].content,f.original);assert.equal(f.host.config.read().story.userBinding.entityId,'old-entity');assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});

test('partial creation cannot be discarded and a cold identity view resumes its durable draft once',async()=>{
 const f=await fixture();try{
  await f.mount({kind:'character',goal:'整理阿青',destination:{book:'角色来源'}});await f.click('生成表单草稿');f.confirm('[data-creation-confirm]');f.failCreation(true);
  assert.equal(await f.view.saveDraft(),false);const recovery=f.view.exportDraft().creationSavedDraft;assert(recovery?.archiveReceipt?.confirmed);assert.equal(f.commits.filter(c=>c.source?.kind==='creation').length,0);
  assert.equal(await f.view.discardDraft(),false);assert.equal(f.view.exportDraft().creationSavedDraft.operationId,recovery.operationId);assert.equal(f.view.requestLeave().allowed,false);
  await f.mount();assert(f.root.querySelector('[data-creation-recovery]'));assert.equal(f.view.exportDraft().creationSavedDraft.operationId,recovery.operationId);assert.equal(await f.view.discardDraft(),false);
  f.failCreation(false);assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.commits.filter(c=>c.source?.kind==='creation').length,1);assert.equal(Object.keys((await f.database.read()).state.tables.T_CHAR_DOSSIER).length,1);assert.equal(f.view.state().dirty,false);
  await f.mount();assert.equal(f.view.exportDraft().creationSavedDraft,null);assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});
