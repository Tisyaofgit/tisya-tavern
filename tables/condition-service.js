import {createPreviewStore,createBoundArchiveContext} from './preview-store.js';
import {check,copy} from './schema.js';
import {digest} from './books.js';
import {prepareCommit} from './ledger.js';
import {projectStateVocabulary} from './state-registry.js';
import {CONDITION_PROVIDER,compileBoundRule,validateBoundRule,planCondition,conditionActionProposal,conditionReceipts,conditionReadAccess} from './condition-runtime.js';
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
export function createConditionService({run,capture,load,books,onCommitted=()=>{},draw=random}){
 const previews=createPreviewStore({prefix:'condition-preview',missing:'条件预览失效',stale:'条件或状态已改变，请重新预览',full:'待确认条件超过100项'});
 const boundContext=createBoundArchiveContext({capture,load});
 async function current(){const context=await boundContext();return {...context,catalog:context.loaded.origin.data.状态目录};}
 const rules=l=>l.session.data.conditionRules??l.session.data.branchSeed?.conditionRules??[];
 const find=(l,id)=>{const r=rules(l).find(r=>r.id===id);check(r,'条件规则未登记在当前会话');return r;};
 const turn=l=>new Set([...(l.session.data.branchSeed?.conditionTurns??[]),...l.chain.filter(s=>s.role==='assistant').map(s=>s.key)]).size;
 function actionInput(l,id){const e=l.view.rows.find(r=>r.id===id&&r.table==='events');check(e,'动作机会必须是当前分支已经确认的事件');return e;}
 function prepared(l,proposal){return prepareCommit(l.view,proposal,{source:l.chain.at(-1)?.key??null,kind:'manual',evidence:proposal.changes.map(c=>c.evidence).join('\n')||'条件机会判定',allowedTables:['state'],allowSchemaExtensions:false,inferSchemaFields:false}).commit;}
 async function listConditionRules(){const {loaded,catalog}=await current();return {revision:loaded.session.data.revision,rules:copy(rules(loaded)),objects:loaded.view.rows.filter(r=>r.table==='objects').map(r=>({id:r.id,name:r.values.名称})),fields:catalog?projectStateVocabulary(catalog.registry,catalog.items).fields:[]};}
 async function saveConditionRule(input,expected){const data=copy(input);return run(async()=>{
  const {c,loaded,catalog}=await current();check(catalog,'请先登记世界状态字段');check(loaded.session.data.revision===expected,'档案已改变，请重新载入条件');
  const old=rules(loaded).find(r=>r.id===data.id);if(old)check(data.revision===old.revision,'规则版本已改变');const rule=compileBoundRule({...data,...(old?{revision:old.revision+1}:{revision:1})},catalog,loaded.view);check(!rules(loaded).some(r=>r.id!==rule.id&&r.name===rule.name),'规则名称重复');
  check(old||rules(loaded).length<256,'条件规则超过256项');const next=copy(loaded.session.data);next.revision++;if(old)next.conditionRuleHistory=[...copy(loaded.session.data.conditionRuleHistory??loaded.session.data.branchSeed?.conditionRuleHistory??[]),copy(old)];next.conditionRules=[...copy(rules(loaded).filter(r=>r.id!==rule.id)),rule];await books.write(loaded.session,next,c.guard);return copy(rule);
 });}
 async function previewConditionAction({ruleId,eventId}){return run(async()=>{
  const {c,loaded,catalog}=await current(),rule=validateBoundRule(find(loaded,ruleId),catalog,loaded.view),event=actionInput(loaded,eventId);check(rule.mode==='action','门禁不执行状态变更');
  const opportunity='event:'+event.id,receipt=conditionReceipts(loaded).find(r=>r.ruleId===rule.id&&r.opportunity===opportunity);
  if(receipt){check(JSON.stringify({...receipt.event,source:null})===JSON.stringify({...event,source:null}),'已结算事件被改写，不能重复结算');return {recorded:true,receipt:copy(receipt)};}
  const plan=planCondition(rule,loaded.view.rows,{opportunity,turn:turn(loaded),receipts:conditionReceipts(loaded)});
  const token=previews.create(c,loaded,{ruleId,eventId});
  return {token,status:plan.status,chance:plan.chance??null,changes:copy(plan.changes),written:false};
 });}
 async function commitConditionAction(token){return run(async()=>{
  const {c,loaded,catalog}=await current(),recorded=conditionReceipts(loaded).find(r=>r.token===token);if(recorded){const e=actionInput(loaded,recorded.event.id);check(JSON.stringify({...e,source:null})===JSON.stringify({...recorded.event,source:null}),'已结算事件被改写');return {recorded:true,receipt:copy(recorded)};}
  // Receipts on a withdrawn branch never silently cause a new settlement.
  check(!loaded.session.data.commits.some(x=>x.conditionReceipt?.token===token),'回执已退出当前分支');
  const p=previews.read(token,c,loaded);
  const rule=validateBoundRule(find(loaded,p.ruleId),catalog,loaded.view),event=actionInput(loaded,p.eventId),opportunity='event:'+event.id;
  check(!conditionReceipts(loaded).some(r=>r.ruleId===rule.id&&r.opportunity===opportunity),'此机会已经结算');
  const options={opportunity,turn:turn(loaded),receipts:conditionReceipts(loaded)},eligible=planCondition(rule,loaded.view.rows,options);check(eligible.status==='eligible','条件不满足、未知或仍在冷却');
  // Validate the complete action BEFORE drawing, including bounds, ownership and ACL.
  const success={...eligible,status:'matched',matched:true},proposal=conditionActionProposal(rule,success,loaded.view,catalog);
  check(rule.bindings.filter(b=>b.write).every(b=>event.values.参与者?.includes(b.objectId)),'动作写入对象必须是事件明确参与者');
  const eventAccess=event.access;check(proposal.proposal.changes.every(ch=>['readers','knowers'].every(k=>ch.access[k].every(x=>eventAccess[k].includes(x)))),'事件结果的知情范围不能超过来源事件');
  const candidate=prepared(loaded,proposal.proposal),plan=planCondition(rule,loaded.view.rows,{...options,draw:draw()}),commit=plan.matched?candidate:prepared(loaded,{changes:[]});
  const access=Object.fromEntries(['readers','knowers'].map(k=>[k,proposal.access[k].filter(x=>eventAccess[k].includes(x))]));
  const receipt={...plan,changes:undefined,basis:undefined,token,event:copy(event),narrative:plan.matched?rule.narrative:'',access,deliveryAfter:loaded.chain.findLast(s=>s.role==='assistant')?.key??null};
  delete receipt.changes;delete receipt.basis;commit.conditionReceipt=receipt;commit.contextSource=loaded.chain.at(-1)?.key??null;
  const next=copy(loaded.session.data);next.revision++;next.commits.push(commit);await books.write(loaded.session,next,c.guard);previews.discard(token);onCommitted();return {recorded:true,receipt:copy(receipt),changes:commit.changes.length};
 });}
 async function evaluateConditionEntries({requestId,entryRefs,trigger='normal',dryRun=true,signal}={}){return run(async()=>{
  check(typeof requestId==='string'&&requestId&&Array.isArray(entryRefs)&&entryRefs.length<=512,'世界书条件请求无效');
  const {c,loaded,catalog}=await current();const guard=()=>{signal?.throwIfAborted();c.guard();};guard();
  const opportunity='prompt:'+await digest([loaded.chain.map(s=>s.key),trigger]);
  const originalStamp=loaded.session.stamp,originStamp=loaded.origin.stamp,receipts=conditionReceipts(loaded),next=copy(loaded.session.data),results=[];let changed=false,last=loaded.view.last;
  const seen=new Set();
  for(const ref of entryRefs){
   const address=JSON.stringify([ref.bookRef,String(ref.uid)]);check(!seen.has(address),'同一世界书条目重复');seen.add(address);
   const rule=validateBoundRule(find(loaded,ref.ruleRef),catalog,loaded.view);check(rule.mode==='gate'&&ref.provider===CONDITION_PROVIDER,'世界书仅可引用已连接的门禁规则');check(ref.ruleVersion===rule.revision,'世界书规则版本不符');
   const chance=ref.chance??rule.policy.chance;check(Number.isFinite(chance)&&chance>=0&&chance<=100,'世界书概率无效');
   const lane=rule.id+'@'+address,history=receipts.filter(r=>r.lane===lane).map(r=>({...r,ruleId:rule.id}));
   let plan=planCondition({...rule,policy:{...rule.policy,chance}},loaded.view.rows,{opportunity,turn:turn(loaded),receipts:history});
   const prior=history.find(r=>r.opportunity===opportunity);if(prior)check(prior.chance===chance,'同一机会的概率配置已改变，未重新抽签');
   // A gate depending on private knowledge must not become a public side channel.
   if(!conditionReadAccess(rule,loaded.view))plan={...plan,status:'private',matched:false};
   if(plan.status==='eligible'&&!dryRun){
    plan=planCondition({...rule,policy:{...rule.policy,chance}},loaded.view.rows,{opportunity,turn:turn(loaded),receipts:history,draw:draw()});
    const receipt={...plan,lane,chance};delete receipt.changes;delete receipt.basis;
    const commit=prepared({...loaded,view:{...loaded.view,last}},{changes:[]});commit.conditionReceipt=receipt;commit.contextSource=loaded.chain.at(-1)?.key??null;next.commits.push(commit);last=commit.id;changed=true;
   }
   results.push({bookRef:ref.bookRef,uid:ref.uid,ruleRef:rule.id,ruleVersion:rule.revision,state:plan.matched?'matched':plan.status==='unknown'?'unknown':'not_matched',reasonCode:plan.status});
  }
  guard();let sessionStamp=originalStamp;
  if(changed){next.revision++;const saved=await books.write(loaded.session,next,guard);sessionStamp=saved.stamp;guard();}
  return {requestId,contextRevision:await digest([originStamp,sessionStamp,c.key,c.chat]),results,
   async assertCurrent(){guard();const [o,s]=await Promise.all([books.read(c.settings.originBook),books.read(c.settings.sessionBook)]);guard();check(o.stamp===originStamp&&s.stamp===sessionStamp,'条件扫描后档案发生变化，已停止发送');}};
 });}
 async function describeConditionRules(){const c=capture();if(!c.settings.originBook||!c.settings.sessionBook)return [];const {loaded,catalog}=await current();return rules(loaded).filter(r=>r.mode==='gate').map(r=>{const item={id:r.id,name:r.name,revision:r.revision,provider:CONDITION_PROVIDER};try{validateBoundRule(r,catalog,loaded.view);return {...item,valid:true};}catch(e){return {...item,valid:false,diagnostic:e.message};}});}
 return {describeConditionRules,listConditionRules,saveConditionRule,previewConditionAction,commitConditionAction,discardConditionPreview:id=>previews.discard(id),evaluateConditionEntries};
}
export function conditionNarrative(loaded,source){return loaded.view.commits.flatMap(c=>c.conditionReceipt?[c.conditionReceipt]:[]).filter(r=>{const e=loaded.view.rows.find(e=>e.table==='events'&&e.id===r.event?.id);return e&&JSON.stringify({...e,source:null})===JSON.stringify({...r.event,source:null});}).filter(r=>r.matched&&r.narrative&&r.deliveryAfter===source&&r.access?.readers.includes('读者')).map(r=>({ruleId:r.ruleId,text:r.narrative,access:copy(r.access),note:'条件结果已经结算，只叙述已确认变化，不重复执行或扩大知情。'}));}
