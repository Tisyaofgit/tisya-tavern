import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';
import {digest} from '../engine/common.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8')),copy=structuredClone;
async function fixture(){
 const books=new Map([['定义书',[{uid:3,name:'【角色】河口旅人',content:'人物原文',enabled:true}]]]),ctx={chatId:'closure-target',characterId:null,groupId:null},commits=[];let conf={revision:0,story:{userBinding:null},coreBook:'定义书'},snapshot={state:new Runtime(initializeState(catalog)).data,revision:0,contextKey:'closure-target'};
 const helper={getWorldbookNames:async()=>[...books.keys()],getWorldbook:async name=>copy(books.get(name)),createWorldbook:async(name,entries)=>{books.set(name,copy(entries));return true;},updateWorldbookWith:async(name,fn)=>books.set(name,copy(fn(copy(books.get(name)))))};
 const gateway=createBookGateway(()=>helper,()=>ctx),config={read:()=>copy(conf),save:async value=>{conf={...copy(value),revision:conf.revision+1};return copy(conf);}},database={read:async()=>copy(snapshot),commit:async input=>{assert.equal(input.expectedRevision,snapshot.revision);const runtime=new Runtime(snapshot.state),request={...input,schema:[]};const result=runtime.transaction(input.operationId,request,()=>{for(const change of input.changes){if(!runtime.rows(change.tableId)[change.recordId])runtime.newRecord(change.tableId,{},change.recordId);for(const [key,value]of Object.entries(change.values))runtime.set([change.tableId,change.recordId,key,[]],value,change.states?.[key]??'known');if(change.metadata)runtime.record(change.tableId,change.recordId).metadata=copy(change.metadata);}return {source:copy(input.source)};});assert.notEqual(result.status,'FAILED');snapshot={...snapshot,state:runtime.data,revision:snapshot.revision+1};commits.push(copy(input));return copy(snapshot);}};
 const roles=createStoryIdentity({config,getContext:()=>ctx,getHelper:()=>helper,sourceBooks:gateway,database});
 const person=(prefix,name)=>[{tableId:'T_CHAR_DOSSIER',recordId:prefix+'-dossier',values:{name,...(prefix==='main'?{species_archetype_ref:'species'}:{})}},{tableId:'T_SYS_ENTITIES',recordId:prefix+'-entity',values:{kind:'character',origin_record_ref:prefix+'-origin'}},{tableId:'M_FIELD_REFERENCES',recordId:prefix+'-origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:prefix+'-entity',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:prefix+'-dossier',reference_kind:'record',resolution_status:'resolved'}}];
 const parts=[person('main','河口旅人'),[{tableId:'T_TYPE_ARCHETYPES',recordId:'species',values:{name:'普通人'}}],[{tableId:'T_STATIC_ITEMS_SKILLS',recordId:'skill',values:{name:'渡水'}}],[{tableId:'T_CHAR_SKILLS',recordId:'owned-skill',values:{char_ref:'main-dossier',asset_ref:'skill'}}],[{tableId:'T_STATIC_ITEMS_SKILLS',recordId:'currency',values:{name:'铜币'}}],[{tableId:'T_DYN_CURRENCY_BALANCES',recordId:'wallet',values:{owner_ref:'main-entity',currency_ref:'currency',balance:80}}],person('other','另一人物'),[{tableId:'T_DYN_CURRENCY_BALANCES',recordId:'other-wallet',values:{owner_ref:'other-entity',currency_ref:'currency',balance:999}}]];
 const source=await gateway.readSource({book:'定义书',uid:3}),groups=parts.map((changes,index)=>({key:changes[0].tableId+'#'+changes[0].recordId,tableId:changes[0].tableId,recordId:changes[0].recordId,heading:'独立定义 '+index,raw:'作者内容 '+index,records:changes.map(change=>({tableId:change.tableId,recordId:change.recordId}))}));
 const plan=await gateway.prepareDefinitionArchive({operationId:'archive-groups',kind:'character',mode:'extend',name:'河口旅人',binding:{entityId:'main-entity',dossierId:'main-dossier',originRefId:'main-origin'},changes:parts.flat(),groups,destination:{book:'定义书',uid:3},source,schema:snapshot.state.schema});await gateway.commitDefinitionArchive(plan);
 return {books,gateway,config,database,roles,commits,get snapshot(){return snapshot;},source:()=>roles.readSource({book:'定义书',uid:3})};
}

test('a grouped character imports exact same-book dependencies and owned records while leaving another person out',async()=>{
 const f=await fixture(),source=await f.source(),preview=await f.roles.previewSourceImport(source),ids=preview.changes.map(change=>change.recordId);assert.equal(source.definition.matrix.changes.length,3);assert.equal(preview.importSources.length,6);assert.deepEqual(new Set(ids),new Set(['main-dossier','main-entity','main-origin','species','owned-skill','skill','wallet','currency']));assert.equal(ids.includes('other-dossier'),false);assert.equal(ids.includes('other-wallet'),false);assert.equal(f.commits.length,0);
 await f.roles.commitEdit(preview);assert.equal(f.commits.length,1);assert.equal(f.snapshot.state.tables.T_DYN_CURRENCY_BALANCES.wallet.values.balance,80);const dependency=preview.changes.find(change=>change.recordId==='species');assert.notEqual(dependency.metadata.sourceDefinition.uid,source.uid);
 f.snapshot.state.tables.T_DYN_CURRENCY_BALANCES.wallet.values.balance=135;const again=await f.roles.previewSourceImport(source);assert.equal(again.changes.length,0);await f.roles.commitEdit(again);assert.equal(f.snapshot.state.tables.T_DYN_CURRENCY_BALANCES.wallet.values.balance,135);
});

test('a dependency modified after preview blocks the entire import before any database or binding write',async()=>{
 const f=await fixture(),source=await f.source(),preview=await f.roles.previewSourceImport(source),before=copy(f.snapshot),settings=f.config.read();const species=f.books.get('定义书').find(row=>readMatrixDefinition(row)?.matrix.changes.some(change=>change.recordId==='species'));species.name+='外部修改';await assert.rejects(f.roles.commitEdit(preview),/来源已变化/);assert.deepEqual(f.snapshot,before);assert.deepEqual(f.config.read(),settings);assert.equal(f.commits.length,0);
});

for(const mode of ['missing','duplicate'])test('a '+mode+' dependency definition is rejected with no partial import',async()=>{
 const f=await fixture(),source=await f.source(),entries=f.books.get('定义书'),index=entries.findIndex(row=>readMatrixDefinition(row)?.matrix.changes.some(change=>change.recordId==='species'));
 if(mode==='missing')entries.splice(index,1);else entries.push({...copy(entries[index]),uid:Math.max(...entries.map(row=>Number(row.uid)))+1});const before=copy(f.snapshot);await assert.rejects(f.roles.previewSourceImport(source),mode==='missing'?/缺少关联定义/:/多个定义/);assert.deepEqual(f.snapshot,before);assert.equal(f.commits.length,0);
});

test('a new duplicate owner inserted after preview is caught even when the original dependency bytes stay unchanged',async()=>{
 const f=await fixture(),source=await f.source(),preview=await f.roles.previewSourceImport(source),entries=f.books.get('定义书'),species=entries.find(row=>readMatrixDefinition(row)?.matrix.changes.some(change=>change.recordId==='species'));entries.push({...copy(species),uid:Math.max(...entries.map(row=>Number(row.uid)))+1});await assert.rejects(f.roles.commitEdit(preview),/多个定义/);assert.equal(f.commits.length,0);
});
