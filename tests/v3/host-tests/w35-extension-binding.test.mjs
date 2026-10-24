import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,sheet,xml,wrap,newBody} from './installer-harness.mjs';
import {installV3Host} from '../../../v3/host.mjs';
import {fullDefaultConfiguration} from '../../../v3/preset.mjs';
import {tableRegistry,projectRetained,parseSimpleSheet,formatSimpleSheet} from '../../../v3/host-runtime.mjs';
import {prepareCommit} from '../../../tables/ledger.js';

const copy=structuredClone,access={readers:['读者'],knowers:[]};
const actor={id:'actor',table:'objects',rev:1,source:null,values:{名称:'阿绫',类型:'character',描述:'原始底档'},lockedFields:['类型'],access};
async function currentProgress(h){
 const session=await h.api.getSession(),state=await session.storage.read(),view=projectRetained(state,session.getScope().activeSourceKeys);
 const prepared=prepareCommit(view,{changes:[{id:'actor',table:'objects',expected:1,values:{描述:'后来已经确认的进度'},access,evidence:'后来已经确认的进度'}]},{source:null,kind:'manual',evidence:'后来已经确认的进度',allowedTables:['objects'],allowSchemaExtensions:false,inferSchemaFields:false});
 const next={...copy(state),revision:state.revision+1,commits:[...state.commits,prepared.commit]};await session.storage.compareAndWrite(state.revision,next);return next;
}
async function selectExtension(h,type='text',operation='extension'){
 const origin=(await h.books.list('origin'))[0],registry=copy(tableRegistry);registry.types.find(t=>t.id==='character').fields.职责={type};
 const definition=await h.books.saveDefinition({bookId:origin.id,expectedBookRevision:origin.revision,name:operation,rows:[],registry,operationId:operation+'-definition'}),active=await h.books.binding();
 return h.books.select({origin:{bookId:origin.id,definitionId:definition.definitionId,revision:definition.revision},expectedBindingRevision:active.binding.revision,operationId:operation+'-select'});
}
async function coldHost(h){h.api.dispose();return installV3Host({target:h.target,getContext:()=>h.ctx,bookManager:h.books,readConfiguration:()=>h.config,getConfigurationSnapshot:fullDefaultConfiguration,resolveConnection:async()=>({settings:{},model:'fixture'}),selectedMaterials:async()=>({lanes:{},ids:[]}),onError:e=>h.errors.push(e),native:h.native});}

test('actual definition selection extends an existing ledger once and cold-reopens without resetting progress',async()=>{
 const h=await createInstallerHarness({mvu:false,initialRows:[actor]});let api=h.api;
 try{
  const before=await currentProgress(h);await selectExtension(h);h.api.configurationChanged();
  const bound=await h.api.getSession(),after=await bound.storage.read(),view=projectRetained(after,bound.getScope().activeSourceKeys);
  assert.equal(view.registry.types.find(t=>t.id==='character').fields.职责.type,'text');assert.equal(view.rows[0].values.描述,'后来已经确认的进度');
  assert.deepEqual(after.baseView,before.baseView);assert.deepEqual(after.commits,before.commits);assert.equal(after.revision,before.revision+1);
  h.api.configurationChanged();const repeated=await (await h.api.getSession()).storage.read();assert.deepEqual(repeated,after,'reinitializing an already merged definition must not write another ledger revision');
  api=await coldHost(h);const reopened=await api.getSession(),cold=await reopened.storage.read();assert.deepEqual(cold,after);assert.deepEqual(projectRetained(cold,reopened.getScope().activeSourceKeys).rows,view.rows);
 }finally{api.dispose();}
});

test('ordinary A uses a rebound extension after cold host reopen and rejects another undeclared field',async()=>{
 let extra=false,sawRegistered=false;
 const h=await createInstallerHarness({mvu:false,initialRows:[actor],provider:({stage,messages})=>{
  if(stage==='b')return wrap(newBody);
  const state=xml(messages,'TISYA.DATA.STATE'),result=parseSimpleSheet(sheet(messages));sawRegistered=state.registry.types.find(t=>t.id==='character').fields.职责?.type==='text';
  const row=state.rows.find(r=>r.id==='actor'),batch=result.archiveProposal[0];
  if(batch)batch.proposal.changes.push({id:row.id,table:'objects',expected:row.rev,values:{属性:{职责:'把工具箱递给林澈',...(extra?{未声明字段:'不应登记'}:{})}},access,evidence:[1]});
  return formatSimpleSheet(result);
 }});let api=h.api;
 try{
  await currentProgress(h);await selectExtension(h);h.api.configurationChanged();await h.api.getSession();api=await coldHost(h);
  await api.generateInterceptor(copy(h.ctx.chat),10000,()=>{},'normal');assert.equal(h.errors.length,0,h.errors[0]?.stack);assert(sawRegistered);assert.equal(h.requests.length,2);
  let session=await api.getSession(),state=await session.storage.read(),view=projectRetained(state,session.getScope().activeSourceKeys);assert.equal(view.rows.find(r=>r.id==='actor').values.属性.职责,'把工具箱递给林澈');assert.equal(view.rows.find(r=>r.id==='actor').values.描述,'后来已经确认的进度');assert.deepEqual(view.rows.find(r=>r.id==='actor').lockedFields,['类型','描述']);
  const commits=copy(state.commits);extra=true;h.ctx.chat.push({is_user:true,mes:'继续。'});await assert.rejects(api.generateInterceptor(copy(h.ctx.chat),10000,()=>{},'normal'),/未登记字段/);assert.equal(h.requests.length,3,'invalid A must not call B');assert.match(h.errors.at(-1)?.message??'',/未登记字段/);
  session=await api.getSession();state=await session.storage.read();assert.deepEqual(state.commits,commits);assert.equal(projectRetained(state,session.getScope().activeSourceKeys).registry.types.find(t=>t.id==='character').fields.未声明字段,undefined);
 }finally{api.dispose();}
});

test('conflicting definition is rejected before binding pointer or current ledger changes',async()=>{
 const h=await createInstallerHarness({mvu:false,initialRows:[actor]});
 try{await currentProgress(h);await selectExtension(h);h.api.configurationChanged();const session=await h.api.getSession(),before=await session.storage.read(),binding=await h.books.binding();await assert.rejects(selectExtension(h,'number','conflict'),/冲突/);assert.deepEqual(await h.books.binding(),binding);assert.deepEqual(await session.storage.read(),before);}finally{h.api.dispose();}
});
