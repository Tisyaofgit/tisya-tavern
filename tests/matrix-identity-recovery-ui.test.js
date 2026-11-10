import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const copy=structuredClone;
let serial=0;
async function fixture({reply}={}){
 const original='阿青是河口旅人，习惯先听人说话。',books=new Map([['角色来源',[{uid:3,name:'【角色】阿青',content:original,enabled:false}]]]),disk=new Map();
 const ctx={chatId:'recovery-ui-'+(++serial),characterId:0,characters:[{avatar:'world.png'}],chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true};
 let failArchiveAck=false,archiveWrites=0;
 const helper={getWorldbookNames:async()=>[...books.keys()],getWorldbook:async name=>{if(failArchiveAck&&archiveWrites)throw Error('世界书回读中断');return copy(books.get(name));},createWorldbook:async(name,rows)=>{books.set(name,copy(rows));return true;},updateWorldbookWith:async(name,fn)=>{books.set(name,copy(fn(copy(books.get(name)))));archiveWrites++;if(failArchiveAck)throw Error('世界书确认中断');}};
 const storage={get:async id=>copy(disk.get(id)),set:async(id,value)=>disk.set(id,copy(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,copy(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});await host.ensureDatabase();
 const sourceBooks=createBookGateway(()=>helper,()=>ctx),commits=[];let failCreation=false,failRepair=false,failIntent=false;
 const database={read:()=>host.readDatabase(),commit:async input=>{if(failCreation&&input.source?.kind==='creation')throw Error('当前聊天保存中断');if(failRepair&&input.source?.kind==='identity-form')throw Error('表单保存中断');if(failIntent&&input.source?.kind==='creation-intent')throw Error('创作意图保存中断');const result=await host.commitDatabase(input);if(!result.receipt.replayed)commits.push(copy(input));return result;}};
 const raw=reply??'<reply><task/><anchor phase="before"/><title>阿青</title><body>1 阿青是河口旅人。</body><anchor phase="after"/><extra/><cells>【人物原点档案／1】\n1 显示名称：阿青\n20 公开身份：河口旅人</cells><vars/><archive/><actions/></reply>';
 const rolesFactory=()=>createStoryIdentity({config:host.config,getContext:()=>ctx,getHelper:()=>helper,database,sourceBooks,creator:createMatrixCreator({database,getContext:()=>ctx,sourceBooks,request:async(_task,text)=>typeof reply==='function'?reply(JSON.parse(text)):raw})});
 let roles=rolesFactory(),view;const window=new Window(),root=window.document.createElement('main');window.document.body.append(root);
 const routes=[],mount=async initialCreation=>{view?.dispose();roles=rolesFactory();view=mountMatrixIdentity(window.document,root,{config:host.config,roles,resourcesOnly:true,creationOnly:!!initialCreation,initialCreation,onCreate:input=>routes.push(copy(input))});assert.equal(await view.ready,true,root.textContent);};
 const click=async label=>{const button=[...root.querySelectorAll('button')].find(node=>node.textContent===label);assert(button,label);button.click();await view.settled();};
 const pick=async(selector,value)=>{const node=root.querySelector(selector);assert(node,selector);node.value=String(value);await node.onchange();await view.settled();};
 const field=(key,value)=>{const node=root.querySelector('[data-role-field="'+key+'"]');assert(node,key);node.value=value;node.dispatchEvent(new window.Event('input'));};
 const confirm=selector=>{const node=root.querySelector(selector);assert(node,selector);node.checked=true;node.dispatchEvent(new window.Event('change'));};
 return {original,books,ctx,host,database,sourceBooks,commits,root,window,routes,mount,click,pick,field,confirm,get roles(){return roles;},get view(){return view;},failCreation:value=>{failCreation=value;},failRepair:value=>{failRepair=value;},failIntent:value=>{failIntent=value;},failArchive:value=>{failArchiveAck=value;},archiveWrites:()=>archiveWrites,async close(){view?.dispose();await window.happyDOM.abort();}};
}

async function seedLegacy(f){
 const source=await f.roles.readSource({book:'角色来源',uid:3}),snapshot=await f.database.read();
 await f.database.commit({operationId:'old-import',expectedRevision:snapshot.revision,contextKey:snapshot.contextKey,source:{kind:'legacy-character-import',book:source.book,uid:source.uid,entryDigest:source.digest,rawEntry:source.entry,phoneInitializationPreserved:true},changes:[
  {tableId:'T_CHAR_DOSSIER',recordId:'old-dossier',values:{name:'阿青',manifest:f.original}},
  {tableId:'T_SYS_ENTITIES',recordId:'old-dossier',values:{kind:'character',origin_record_ref:'old-origin'}},
  {tableId:'M_FIELD_REFERENCES',recordId:'old-origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'old-dossier',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'old-dossier',reference_kind:'record',resolution_status:'resolved'}}
 ]});
 await f.roles.bind({dossierId:'old-dossier'});
}

test('existing typed records require a reviewed diff and retry without rewriting untouched author text',async()=>{
 const f=await fixture();try{
  await seedLegacy(f);await f.mount();await f.pick('[data-role-book]','角色来源');await f.pick('[data-source-entry]',3);
  assert.equal(f.root.querySelector('[data-source-repair]'),null);assert(![...f.root.querySelectorAll('button')].some(node=>node.textContent==='按原文整理旧档案'));assert.equal(f.commits.length,1);
  f.field('public_identity','河口旅人');await f.click('预览档案变更');assert(f.root.querySelector('[data-identity-draft]'));assert.equal(await f.view.saveDraft(),false);assert.equal(f.commits.length,1);
  f.confirm('[data-database-confirm]');f.failRepair(true);assert.equal(await f.view.saveDraft(),false);const operation=f.view.exportDraft().recordDraft.id;assert.match(f.root.textContent,/表单保存中断/);
  f.failRepair(false);assert.equal(await f.view.saveDraft(),true,f.root.textContent);const saved=await f.database.read(),row=saved.state.tables.T_CHAR_DOSSIER['old-dossier'];
  assert.equal(row.values.public_identity,'河口旅人');assert.equal(row.values.manifest,f.original);assert.equal(Object.keys(saved.state.tables.T_CHAR_DOSSIER).length,1);assert.equal(Object.keys(saved.state.tables.T_SYS_ENTITIES).length,1);
  assert.equal(f.commits.at(-1).operationId,operation);assert.deepEqual(f.commits.at(-1).changes[0].values,{public_identity:'河口旅人'});assert.equal(f.books.get('角色来源')[0].content,f.original);assert.equal(f.host.config.read().story.userBinding.entityId,'old-dossier');assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});

test('partial creation cannot be discarded and a cold identity view resumes its durable draft once',async()=>{
 const f=await fixture();try{
  const source=await f.roles.readSource({book:'角色来源',uid:3});
  await f.mount({kind:'character',goal:'整理阿青',source,destination:{book:'角色来源',uid:3}});await f.click('生成表单草稿');
  const name=f.root.querySelector('[data-creation-key="name"]');name.value='青衣';name.dispatchEvent(new f.window.Event('input'));f.confirm('[data-creation-confirm]');f.failCreation(true);
  assert.equal(await f.view.saveDraft(),false);const recovery=f.view.exportDraft().creationSavedDraft;assert(recovery?.archiveReceipt?.confirmed);assert.equal(f.commits.filter(c=>c.source?.kind==='creation').length,0);
  assert.equal(await f.view.discardDraft(),false);assert.equal(f.view.exportDraft().creationSavedDraft.operationId,recovery.operationId);assert.equal(f.view.requestLeave().allowed,false);
  await f.mount();assert(f.root.querySelector('[data-creation-recovery]'));assert.equal(f.view.exportDraft().creationSavedDraft.operationId,recovery.operationId);assert.equal(await f.view.discardDraft(),false);
  f.failCreation(false);assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.commits.filter(c=>c.source?.kind==='creation').length,1);assert.equal(Object.keys((await f.database.read()).state.tables.T_CHAR_DOSSIER).length,1);assert.equal(f.view.state().dirty,false);
  const entries=f.books.get('角色来源');assert.equal(entries.length,1);assert.equal(entries[0].uid,3);assert.equal(entries[0].name,'【角色】青衣');assert.equal(JSON.parse(entries[0].content).source.content,f.original);
  await f.mount();assert.equal(f.view.exportDraft().creationSavedDraft,null);assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});

test('a same-name prose entry never grants overwrite authority to a newly accepted character definition',async()=>{
 const f=await fixture();try{
  const before=copy(f.books.get('角色来源'));
  await f.mount({kind:'character',goal:'整理阿青',destination:{book:'角色来源'}});await f.click('生成表单草稿');f.confirm('[data-creation-confirm]');
  const operation=f.view.exportDraft().creation.draft.operationId;assert.equal(await f.view.saveDraft(),true,f.root.textContent);
  const saved=await f.database.read(),rows=f.books.get('角色来源'),definitions=rows.filter(readMatrixDefinition);assert.equal(rows.length,2);assert.deepEqual(rows[0],before[0]);assert.equal(definitions.length,1);assert.notEqual(definitions[0].uid,before[0].uid);assert.equal(readMatrixDefinition(definitions[0]).name,'阿青');
  assert.equal(Object.values(saved.state.tables.T_CHAR_DOSSIER)[0].values.name,'阿青');assert.deepEqual(f.commits.map(c=>c.source?.kind),['creation-intent','creation']);assert.equal(f.commits[1].operationId,operation);assert.equal(f.archiveWrites(),1);assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});

test('an exact-source preflight rejection keeps the draft editable and can be cancelled without a false pending save',async()=>{
 const f=await fixture();try{
  const source=await f.roles.readSource({book:'角色来源',uid:3});
  await f.mount({kind:'character',goal:'整理阿青',source,destination:{book:'角色来源',uid:3}});await f.click('生成表单草稿');f.confirm('[data-creation-confirm]');
  f.books.get('角色来源')[0].content+='\n外部新增原文';const current=copy(f.books.get('角色来源'));
  assert.equal(await f.view.saveDraft(),false);assert.match(f.root.textContent,/来源.*变化|已变化/);assert.equal(f.view.exportDraft().creationSavedDraft,null);assert(f.root.querySelector('[data-creation-fields]'));assert.equal(await f.view.discardDraft(),true,f.root.textContent);assert.equal(f.view.state().dirty,false);assert.equal(f.view.exportDraft().creation.draft,null);
  await f.mount();assert.equal(f.root.querySelector('[data-creation-recovery]'),null);assert.equal(f.view.exportDraft().creationSavedDraft,null);assert.equal(f.view.requestLeave().allowed,true);assert.equal(f.view.state().dirty,false);
  assert.equal(f.commits.length,0);assert.equal(f.archiveWrites(),0);assert.deepEqual(f.books.get('角色来源'),current);assert.equal(Object.keys((await f.database.read()).state.tables.T_CHAR_DOSSIER).length,0);
 }finally{await f.close();}
});

test('only the bound world name changes its archive title while supporting character names stay independent',async()=>{
 const reply='<reply><task/><anchor phase="before"/><title>河口</title><body>1 河口的新世界。</body><anchor phase="after"/><extra/><cells>【世界与历法身份／1】\n1 世界名称：河口\n【人物原点档案／1】\n1 显示名称：阿青\n20 公开身份：河口旅人</cells><vars/><archive/><actions/></reply>';
 const f=await fixture({reply});try{
  await f.mount({kind:'world',goal:'设计河口',destination:{book:'新世界书',newBook:true}});await f.click('生成表单草稿');
  const changeName=(tableId,value)=>{const proposal=JSON.parse(f.view.exportDraft().creation.text),index=proposal.matrix.changes.findIndex(row=>row.tableId===tableId),node=f.root.querySelector('[data-creation-row="'+index+'"][data-creation-key="name"]');assert(node);node.value=value;node.dispatchEvent(new f.window.Event('input'));};
  changeName('T_CHAR_DOSSIER','旁支人物');assert.equal(JSON.parse(f.view.exportDraft().creation.text).name,'河口');
  changeName('T_STATIC_WORLDS','大河口');changeName('T_CHAR_DOSSIER','旅人甲');assert.equal(JSON.parse(f.view.exportDraft().creation.text).name,'大河口');
  f.confirm('[data-creation-confirm]');assert.equal(await f.view.saveDraft(),true,f.root.textContent);
  const entries=f.books.get('新世界书');assert.deepEqual(entries.map(row=>row.name).sort(),['【初始化】大河口','【资料】大河口','【角色】旅人甲'].sort());const definitions=entries.map(readMatrixDefinition).filter(Boolean);assert.equal(definitions.length,2);assert.deepEqual(definitions.map(row=>row.matrix.changes[0].tableId).sort(),['T_CHAR_DOSSIER','T_STATIC_WORLDS'].sort());assert(entries.every(row=>row.enabled===false));
  const saved=await f.database.read();assert.equal(Object.values(saved.state.tables.T_STATIC_WORLDS)[0].values.name,'大河口');assert.equal(Object.values(saved.state.tables.T_CHAR_DOSSIER)[0].values.name,'旅人甲');assert.equal(f.books.get('角色来源')[0].content,f.original);
 }finally{await f.close();}
});

for(const failure of ['intent','archive'])test('an interrupted '+failure+' keeps its creation plan locked and resumes the same archive',async()=>{
 const f=await fixture();try{
  const source=await f.roles.readSource({book:'角色来源',uid:3});
  await f.mount({kind:'character',goal:'整理阿青',source,destination:{book:'角色来源',uid:3}});await f.click('生成表单草稿');f.confirm('[data-creation-confirm]');
  if(failure==='intent')f.failIntent(true);else f.failArchive(true);
  assert.equal(await f.view.saveDraft(),false);const retained=f.view.exportDraft().creationSavedDraft;assert(retained.archivePlan);assert.equal(retained.archiveReceipt.status,failure==='intent'?'not-written':'unknown');assert.equal(retained.archiveReceipt.confirmed,false);
  assert.equal(f.commits.filter(c=>c.source?.kind==='creation').length,0);assert.equal(await f.view.discardDraft(),false);assert.equal(f.root.querySelector('[data-creation-fields]'),null);assert.equal(f.view.requestLeave().allowed,false);
  f.failIntent(false);f.failArchive(false);
  if(failure==='archive'){await f.mount();assert.equal(f.view.exportDraft().creationSavedDraft.operationId,retained.operationId);assert.equal(f.view.exportDraft().creationSavedDraft.archiveReceipt.confirmed,true);}
  assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.archiveWrites(),1);assert.deepEqual(f.commits.map(c=>c.source?.kind),['creation-intent','creation']);assert.equal(f.commits[1].operationId,retained.operationId);assert.equal(Object.keys((await f.database.read()).state.tables.T_CHAR_DOSSIER).length,1);assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});

const extractedReply=input=>{
 const heading=input.references.split('\n').find(line=>line.startsWith('人物原点档案／已有：阿青〔'));assert(heading);
 return '<reply><task/><anchor phase="before"/><title>阿青</title><body>1 原文提炼。</body><anchor phase="after"/><extra/><cells>【'+heading+'】\n1 显示名称：阿青\n20 公开身份：河口旅人</cells><vars/><archive/><actions/></reply>';
};

test('source extraction keeps existing receipt-backed records unchanged and rejects old revision authority',async()=>{
 const f=await fixture({reply:extractedReply});try{
  await seedLegacy(f);await f.mount();await f.pick('[data-role-book]','角色来源');await f.pick('[data-source-entry]',3);await f.click('交给缇斯亚助手提炼');
  assert.equal(f.routes.length,1);const route=f.routes[0],before=await f.database.read(),book=copy(f.books.get('角色来源'));
  assert.equal(route.mode,'extend');assert.equal(route.source.revisionTarget,undefined);assert.equal(route.source.content,f.original);
  await assert.rejects(f.roles.createDraft({...route,source:{...route.source,revisionTarget:{entityId:'old-dossier',dossierId:'old-dossier'}}}),/旧迁移目标已退役/);
  assert.equal(f.roles.previewSourceRepair,undefined);assert.deepEqual(await f.database.read(),before);assert.deepEqual(f.books.get('角色来源'),book);assert.equal(f.archiveWrites(),0);
 }finally{await f.close();}
});
