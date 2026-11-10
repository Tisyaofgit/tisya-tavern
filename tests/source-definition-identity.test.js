import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {createBookGateway} from '../tables/books.js';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {digest} from '../engine/common.mjs';
import {Window} from 'happy-dom';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';
import {createIdentityService} from '../user-identity-service.js';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8')),copy=x=>structuredClone(x);
function fixture(){
 const saved=new Map([['角色来源',[{uid:3,name:'【角色】阿青',content:'阿青是河口旅人。\n<手机初态>{"余额":999}</手机初态>',enabled:true}]]]);const ctx={chatId:'chat-a',characterId:0,groupId:null};
 const helper={getWorldbookNames:async()=>[...saved.keys()],getWorldbook:async name=>copy(saved.get(name)),createWorldbook:async(name,entries)=>{saved.set(name,copy(entries));return true;},updateWorldbookWith:async(name,fn)=>saved.set(name,copy(fn(copy(saved.get(name)))))};
 const books=createBookGateway(()=>helper,()=>ctx);let conf={revision:0,story:{userBinding:null},coreBook:'角色来源'},snapshot={state:new Runtime(initializeState(catalog)).data,revision:0,contextKey:'scope-a'},writes=0;const commits=[],operations=new Map();
 const config={read:()=>copy(conf),save:async value=>{conf={...copy(value),revision:conf.revision+1};return copy(conf);}};
 const database={read:async()=>copy(snapshot),commit:async input=>{const hash=digest({changes:input.changes,source:input.source});if(operations.has(input.operationId)){assert.equal(operations.get(input.operationId),hash);return copy(snapshot);}assert.equal(input.expectedRevision,snapshot.revision);assert.equal(input.contextKey,snapshot.contextKey);const e=new Runtime(snapshot.state),result=e.transaction(input.operationId,input,()=>{for(const c of input.changes){if(!e.rows(c.tableId)[c.recordId])e.newRecord(c.tableId,{},c.recordId);for(const [k,v]of Object.entries(c.values))e.set([c.tableId,c.recordId,k,[]],v,c.states?.[k]??'known');if(c.metadata)e.record(c.tableId,c.recordId).metadata={...e.record(c.tableId,c.recordId).metadata,...copy(c.metadata)};}return {source:copy(input.source)};});assert.notEqual(result.status,'FAILED');snapshot={...snapshot,state:e.data,revision:snapshot.revision+1};operations.set(input.operationId,hash);commits.push(copy(input));writes++;return copy(snapshot);}};
 const roles=createStoryIdentity({config,getContext:()=>ctx,getHelper:()=>helper,sourceBooks:books,database});
 return {saved,ctx,books,config,database,roles,commits,get writes(){return writes;},get snapshot(){return snapshot;},set snapshot(value){snapshot=value;}};
}
function person(){return {name:'阿青',kind:'character',binding:{entityId:'person-entity',dossierId:'person-dossier'},changes:[{tableId:'T_CHAR_DOSSIER',recordId:'person-dossier',values:{name:'阿青',public_identity:'河口旅人'}},{tableId:'T_SYS_ENTITIES',recordId:'person-entity',values:{kind:'character',origin_record_ref:'person-origin'}},{tableId:'M_FIELD_REFERENCES',recordId:'person-origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'person-entity',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'person-dossier',reference_kind:'record',resolution_status:'resolved'}}]};}
async function archive(f,extra=[]){const source=await f.books.readSource({book:'角色来源',uid:3}),data=person(),plan=await f.books.prepareDefinitionArchive({...data,changes:[...data.changes,...extra],source,operationId:'archive-person',destination:{book:source.book,uid:source.uid},schema:f.snapshot.state.schema});await f.books.commitDefinitionArchive(plan);return f.roles.readSource(source);}
async function mount(f){
 Object.assign(f.ctx,{characters:[{avatar:'world.png'}],chatMetadata:{},extensionSettings:{},name1:'原身份',powerUserSettings:{personas:{native:'原身份'},persona_descriptions:{native:{description:'原心愿'}},persona_description:'原心愿'}});
 const w=new Window(),root=w.document.createElement('main');w.document.body.append(root);const routes=[],identity=createIdentityService({getContext:()=>f.ctx,getAvatar:()=> 'native',applyActive:()=>{},persistSettings:async()=>true,persistChat:async()=>true});
 const ui=mountMatrixIdentity(w.document,root,{identity,config:f.config,roles:f.roles,onCreate:input=>routes.push(copy(input))});await ui.ready;
 const pick=async(selector,value)=>{const node=root.querySelector(selector);assert(node,selector);node.value=String(value);await node.onchange();await ui.settled();};const click=async label=>{const node=[...root.querySelectorAll('button')].find(b=>b.textContent===label);assert(node,label);node.click();await ui.settled();};
 return {w,root,ui,routes,pick,click,async close(){ui.dispose();await w.happyDOM.close();}};
}
test('narrative migration returns an extraction handoff and never fills manifest with a whole description',async()=>{
 const f=fixture(),source=await f.roles.readSource({book:'角色来源',uid:3}),handoff=await f.roles.previewSourceMigration(source);assert.equal(handoff.requiresExtraction,true);assert.equal(handoff.changes,undefined);assert.equal(handoff.source.content,source.content);assert.equal(f.writes,0);
 await assert.rejects(f.roles.previewCreate({name:'阿青',content:'整段人物描述'}),/提炼/);await assert.rejects(f.roles.previewSourceImport(source),/提炼并归档/);await assert.rejects(f.roles.commitEdit(handoff),/草稿已改变/);assert.equal(f.writes,0);
});
test('canonical source import is previewed, uses source IDs and keeps evolved chat values on reuse',async()=>{
 const f=fixture(),source=await archive(f),choices=await f.roles.sourceChoices('角色来源');assert.equal(choices.entries[0].definition.kind,'character');const draft=await f.roles.previewSourceImport(source);assert.equal(draft.kind,'source-import');assert.equal(f.writes,0);assert.equal(draft.changes.length,3);assert(draft.changes.every(c=>c.metadata.sourceDefinition.definitionId===source.definition.id));
 await f.roles.commitEdit(draft);assert.equal(f.writes,1);assert.equal(f.config.read().story.userBinding.dossierId,'person-dossier');assert.equal(f.snapshot.state.tables.T_CHAR_DOSSIER['person-dossier'].values.manifest,undefined);
 f.snapshot.state.tables.T_CHAR_DOSSIER['person-dossier'].values.public_identity='本聊天里已成为渡口守卫';const second=await f.roles.previewSourceImport(source);assert.equal(second.changes.length,0);await f.roles.commitEdit(second);assert.equal(f.snapshot.state.tables.T_CHAR_DOSSIER['person-dossier'].values.public_identity,'本聊天里已成为渡口守卫');assert.equal((await f.roles.readSource(source)).definition.matrix.changes[0].values.public_identity,'河口旅人');
});
test('source changes and unrelated ID collisions cannot overwrite chat state',async()=>{
 const f=fixture(),source=await archive(f),draft=await f.roles.previewSourceImport(source);f.saved.get(source.book)[0].custom='changed outside';await assert.rejects(f.roles.commitEdit(draft),/来源已变化/);assert.equal(f.writes,0);
 const fresh=await f.roles.readSource(source),e=new Runtime(f.snapshot.state);e.newRecord('T_CHAR_DOSSIER',{name:'别人的人物'},'person-dossier');f.snapshot={...f.snapshot,state:e.data};await assert.rejects(f.roles.previewSourceImport(fresh),/另一份内容占用/);assert.equal(f.writes,0);
});
test('database success and binding failure is recoverable without duplicate character creation',async()=>{
 const f=fixture(),source=await archive(f),draft=await f.roles.previewSourceImport(source),save=f.config.save;f.config.save=async()=>{throw Error('设置回应丢失');};await assert.rejects(f.roles.commitEdit(draft),error=>error.databaseReceipt?.confirmed===true);assert.equal(f.writes,1);f.config.save=save;await f.roles.commitEdit(draft);assert.equal(f.writes,1);assert.equal(f.config.read().story.userBinding.entityId,'person-entity');
});
test('legacy manifest correction requires the original migration receipt, exact unchanged data and explicit preview',async()=>{
 const f=fixture(),source=await f.roles.readSource({book:'角色来源',uid:3}),e=new Runtime(f.snapshot.state),p=person();for(const c of p.changes)e.newRecord(c.tableId,c.values,c.recordId);const raw='阿青是河口旅人。\n';e.set('T_CHAR_DOSSIER#person-dossier.manifest',raw);e.data.runtime.receipts['old-import']={result:{source:{kind:'legacy-character-import',book:source.book,uid:source.uid,rawEntry:source.entry}}};f.snapshot={...f.snapshot,state:e.data};
 const draft=await f.roles.previewSourceRepair({dossierId:'person-dossier',source,values:{public_identity:'河口旅人'}});assert.equal(f.writes,0);assert(draft.diff.some(d=>d.field==='manifest'&&d.before===raw&&d.after===null));await f.roles.commitEdit(draft);assert.equal(f.snapshot.state.tables.T_CHAR_DOSSIER['person-dossier'].states.manifest,'unset');assert.equal(f.commits[0].source.previousValues.manifest,raw);assert.equal(f.commits[0].source.rawEntry.content,source.content);
 f.snapshot.state.tables.T_CHAR_DOSSIER['person-dossier'].values.manifest='用户后来明确填写的本领表现';f.snapshot.state.tables.T_CHAR_DOSSIER['person-dossier'].states.manifest='known';await assert.rejects(f.roles.previewSourceRepair({dossierId:'person-dossier',source,values:{public_identity:'河口旅人'}}),/不能证明/);
});
test('real identity source UI hands arbitrary-book prose to the assistant with exact UID and digest',async()=>{
 const f=fixture();f.saved.set('另一个世界的基点书',[{uid:77,name:'【角色】散文人物',content:'纯描述：住在山下，遇人先听再答。',enabled:false}]);const view=await mount(f);try{
  await view.pick('[data-role-book]','另一个世界的基点书');await view.pick('[data-source-entry]',77);await view.click('交给缇斯亚助手提炼');const actual=await f.books.readSource({book:'另一个世界的基点书',uid:77});assert.equal(view.routes.length,1);assert.equal(view.routes[0].source.uid,77);assert.equal(view.routes[0].source.digest,actual.digest);assert.equal(view.routes[0].source.content,actual.content);assert.deepEqual(view.routes[0].destination,{book:'另一个世界的基点书',uid:77});assert.equal(f.writes,0);assert.equal(f.ctx.powerUserSettings.persona_description,'原心愿');
 }finally{await view.close();}
});
test('real identity source preview requires confirmation and repeated adoption preserves the current balance',async()=>{
 const f=fixture(),source=await archive(f,[{tableId:'T_DYN_CURRENCY_BALANCES',recordId:'wallet-a',values:{owner_ref:'person-entity',balance:100}}]),view=await mount(f);try{
  await view.pick('[data-role-book]',source.book);await view.pick('[data-source-entry]',source.uid);await view.click('预览使用此人物');assert.equal(f.writes,0);assert.equal(await view.ui.saveDraft(),false);assert.equal(f.writes,0);let confirm=view.root.querySelector('[data-database-confirm]');assert(confirm);confirm.checked=true;confirm.dispatchEvent(new view.w.Event('change'));assert.equal(await view.ui.saveDraft(),true,view.root.textContent);assert.equal(f.writes,1);assert.equal(f.snapshot.state.tables.T_DYN_CURRENCY_BALANCES['wallet-a'].values.balance,100);
  f.snapshot.state.tables.T_DYN_CURRENCY_BALANCES['wallet-a'].values.balance=777;f.snapshot={...f.snapshot,revision:f.snapshot.revision+1};await view.pick('[data-source-entry]',source.uid);await view.click('预览使用此人物');confirm=view.root.querySelector('[data-database-confirm]');assert(confirm);confirm.checked=true;confirm.dispatchEvent(new view.w.Event('change'));assert.equal(await view.ui.saveDraft(),true,view.root.textContent);assert.equal(Object.keys(f.snapshot.state.tables.T_CHAR_DOSSIER).length,1);assert.equal(f.snapshot.state.tables.T_DYN_CURRENCY_BALANCES['wallet-a'].values.balance,777);assert.equal((await f.roles.readSource(source)).definition.matrix.changes.find(c=>c.recordId==='wallet-a').values.balance,100);assert.equal(f.ctx.powerUserSettings.persona_description,'原心愿');
 }finally{await view.close();}
});
