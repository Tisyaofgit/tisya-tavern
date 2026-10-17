import {createCapabilityRegistry} from '../services/capabilities.js';
import {check,copy} from './schema.js';
import {digest} from './books.js';
import {prepareCommit} from './ledger.js';
import {createPreviewStore,createBoundArchiveContext} from './preview-store.js';
import {parseStateEvents} from './state-event-rules.js';
import {stateEventInput,stateEventProposal,stateEventNarrative} from './state-events.js';
import {compileStateFormulas} from './state-formulas.js';
import {validateStateCatalog,registerStateCatalog,readStateGrid,stateGridProposal,readStateValues,stateValuesProposal,stateFormulaProposal,stateGrowthProposal} from './state-form.js';

export const stateOperations=createCapabilityRegistry([
 {id:'grid',entry:'previewStateForm',plan:stateGridProposal},
 {id:'values',entry:'previewNumericState',plan:stateValuesProposal},
 {id:'formula',entry:'previewStateFormula',plan:stateFormulaProposal,validate(input,catalog){
  check(!parseStateEvents(catalog.events??'').some(event=>event.action===input.name),'此公式由事件结算调用，请选择已确认事件');
 }},
 {id:'growth',entry:'previewStateGrowth',plan:stateGrowthProposal}
],{label:'状态操作'});

export function createStateService({run,capture,load,books,status,onCommitted=()=>{}}){
 const boundContext=createBoundArchiveContext({capture,load});
 const previews=createPreviewStore({prefix:'state-form',missing:'状态简表不存在或聊天已改变，请重新预览',stale:'状态定义或档案已改变，旧简表未覆盖新值',full:'待保存状态简表过多，请先保存或取消'});
 // Compact state forms share this service's serialization, source projection and book writer.
 async function stateFormContext(){const {c,loaded}=await boundContext(),catalog=loaded.origin.data.状态目录;if(catalog)validateStateCatalog(catalog,loaded.origin.data.id);return {c,loaded,catalog};}
 async function stateCatalog(){const {loaded,catalog}=await stateFormContext();return {catalog:copy(catalog??null),originRevision:loaded.origin.data.revision};}
 async function saveStateCatalog(registration,expectedOriginRevision){const input=copy(registration);return run(async()=>{
  const {c,loaded,catalog}=await stateFormContext();check(loaded.origin.data.revision===expectedOriginRevision,'状态定义已改变，请重新载入');
  const nextCatalog=registerStateCatalog(catalog,loaded.origin.data.id,input);if(catalog&&JSON.stringify(catalog)===JSON.stringify(nextCatalog))return {catalog:copy(catalog),originRevision:loaded.origin.data.revision,unchanged:true};
  const next=copy(loaded.origin.data);next.revision++;next.状态目录=nextCatalog;const saved=await books.write(loaded.origin,next,c.guard);c.guard();
  status('状态定义','已保存',nextCatalog.items.length+' 个条目；没有初始化人物状态');return {catalog:copy(saved.data.状态目录),originRevision:saved.data.revision,unchanged:false};
 });}
 async function readStateForm(ownerId,itemIds){const selected=copy(itemIds);const {loaded,catalog}=await stateFormContext();check(catalog,'尚未登记状态定义');return {text:readStateGrid(loaded.view,catalog,ownerId,selected),ownerId,itemIds:selected,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};}
 async function readNumericState(ownerId){const {loaded,catalog}=await stateFormContext();check(catalog,'尚未登记状态定义');return {text:readStateValues(loaded.view,catalog,ownerId,catalog.items.map(i=>i.id)),ownerId,actions:compileStateFormulas(catalog).actions.filter(a=>!parseStateEvents(catalog.events??'').some(e=>e.action===a.name)).map(a=>({name:a.name,automatic:a.automatic}))};}
 async function stageStatePreview(input,kind){const captured=copy(input);return run(async()=>{
  const {c,loaded,catalog}=await stateFormContext();check(catalog,'尚未登记状态定义');
  const operation=stateOperations.get(kind);operation.validate?.(captured,catalog);
  const itemIds=captured.itemIds??catalog.items.map(i=>i.id),args={...captured,itemIds};
  const planned=operation.plan(loaded.view,catalog,args);
  const options={source:loaded.chain.at(-1)?.key??null,kind:'manual',evidence:planned.raw,allowedTables:['state'],allowSchemaExtensions:false,inferSchemaFields:false};
  prepareCommit(loaded.view,planned.proposal,options);c.guard();
  const draft={ownerId:captured.ownerId,itemIds:copy(itemIds),catalogRevision:catalog.revision,...planned,options};
  const id=previews.create(c,loaded,draft);
  return {id,ownerId:draft.ownerId,diff:copy(planned.diff),changes:planned.diff.length,written:false,...(planned.growth?{growth:copy(planned.growth)}:{})};
 });}
 async function stateEventReceipt(loaded,catalog,entry){
  const inherited=(loaded.session.data.branchSeed?.stateEventReceipts??[]).some(c=>c.id===entry.id);
  check(inherited||loaded.view.commits.some(c=>c.id===entry.id),'事件回执不在当前分支，不能重新结算旧事件');
  const record=entry.stateEvent,spec=stateEventInput(loaded.view,catalog,record);
  check(inherited?JSON.stringify(spec.event)===JSON.stringify(record.eventSnapshot)&&JSON.stringify(spec.rule)===JSON.stringify(record.rule):await digest(spec.payload)===record.inputHash,'已结算事件或规则发生变化，未再次扣费或发放奖励');
  return {id:entry.stateForm.id,ownerId:record.ownerId,eventId:record.eventId,name:record.name,recorded:true,diff:copy(record.diff),changes:record.diff.length,growth:copy(record.growth),written:false};
 }
 async function previewStateEvent(input){const captured=copy(input);return run(async()=>{
  const {c,loaded,catalog}=await stateFormContext();check(catalog,'尚未登记状态定义');
  const spec=stateEventInput(loaded.view,catalog,captured),prior=[...(loaded.session.data.branchSeed?.stateEventReceipts??[]),...loaded.session.data.commits].filter(x=>x.stateEvent?.identity===spec.identity);
  check(prior.length<=1,'同一事件存在重复结算回执');if(prior.length)return stateEventReceipt(loaded,catalog,prior[0]);
  const planned=stateEventProposal(loaded.view,catalog,captured),options={source:loaded.chain.at(-1)?.key??null,kind:'manual',evidence:planned.raw,allowedTables:['state'],allowSchemaExtensions:false,inferSchemaFields:false};
  prepareCommit(loaded.view,planned.proposal,options);c.guard();
  const event={identity:spec.identity,eventId:captured.eventId,ownerId:captured.ownerId,name:captured.name,action:spec.rule.action,narrative:spec.rule.narrative,inputHash:await digest(spec.payload),eventRevision:spec.event.rev,rule:copy(spec.rule),eventSnapshot:spec.event,deliveryAfter:loaded.chain.findLast(x=>x.role==='assistant')?.key??null,diff:copy(planned.diff),growth:copy(planned.growth),access:copy(planned.access)};
  const id=previews.create(c,loaded,{ownerId:captured.ownerId,itemIds:catalog.items.map(i=>i.id),catalogRevision:catalog.revision,...planned,options,event},{tokenPrefix:'state-event'});
  return {id,ownerId:captured.ownerId,eventId:captured.eventId,name:captured.name,diff:copy(planned.diff),changes:planned.diff.length,growth:copy(planned.growth),recorded:false,written:false};
 });}
 async function readStateEventResults(){const {loaded}=await stateFormContext();return stateEventNarrative(loaded.view,loaded.chain.findLast(x=>x.role==='assistant')?.key??null);}
 const previewsByEntry=Object.fromEntries(stateOperations.definitions.map(operation=>[operation.entry,input=>stageStatePreview(input,operation.id)]));
 async function saveStateForm(id){return run(async()=>{
  const {c,loaded,catalog}=await stateFormContext(),recorded=[...(loaded.session.data.branchSeed?.stateEventReceipts??[]),...loaded.view.commits].find(x=>x.stateForm?.id===id);
  if(recorded){if(recorded.stateEvent)await stateEventReceipt(loaded,catalog,recorded);previews.discard(id);return {id,recorded:true,changes:recorded.stateEvent?.diff.length??recorded.changes.length,sessionRevision:loaded.session.data.revision};}
  const draft=previews.read(id,c,loaded);
  check(catalog,'状态定义或档案已改变，旧简表未覆盖新值');
  if(!draft.proposal.changes.length&&!draft.event){previews.discard(id);return {id,recorded:false,unchanged:true,changes:0,sessionRevision:loaded.session.data.revision};}
  if(draft.event)check(!loaded.session.data.commits.some(x=>x.stateEvent?.identity===draft.event.identity),'事件已结算，请重新载入回执');
  const prepared=prepareCommit(loaded.view,draft.proposal,draft.options);check(JSON.stringify(prepared.registry)===JSON.stringify(loaded.view.registry),'状态简表不能改变档案模板');
  prepared.commit.stateForm={id,ownerId:draft.ownerId,itemIds:copy(draft.itemIds),catalogRevision:draft.catalogRevision};
  if(draft.event)prepared.commit.stateEvent=copy(draft.event);
  const next=copy(loaded.session.data);next.revision++;next.commits.push(prepared.commit);
  // Only one session book is written. Shared definitions were registered separately.
  const saved=await books.write(loaded.session,next,c.guard);c.guard();
  previews.discard(id);onCommitted();
  status('状态简表','已保存',prepared.commit.changes.length+' 项');return {id,recorded:true,changes:prepared.commit.changes.length,sessionRevision:saved.data.revision};
 });}
 function discardStateForm(id){return previews.discard(id);}
 return {stateCatalog,saveStateCatalog,readStateForm,readNumericState,...previewsByEntry,previewStateEvent,readStateEventResults,saveStateForm,discardStateForm};
}
