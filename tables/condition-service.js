import {check,copy} from './schema.js';
import {Runtime} from '../engine/runtime.mjs';
import {normalizeTables,evaluateConditionGroup,MechanicalError} from '../engine/mechanical_runtime.mjs';
import {digest as matrixDigest} from '../engine/common.mjs';
import {captureMessages,chatKey,NS} from '../engine/controller.mjs';
import {digest} from './books.js';
import {prepareCommit} from './ledger.js';
import {projectStateVocabulary} from './state-registry.js';
import {CONDITION_PROVIDER,compileBoundRule,validateBoundRule,planCondition,planConditionResult,conditionActionProposal,conditionReceipts,conditionReadAccess} from './condition-runtime.js';
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
export function createConditionService({run,capture,load,books,database=null,getContext=null,onCommitted=()=>{},draw=random}){
 if(database)return databaseConditions({database,getContext,draw});
 const previews=new Map();
 async function current(){const c=capture();check(c.settings.originBook&&c.settings.sessionBook,'请先建立当前会话的表单存档');const loaded=await load(c);return {c,loaded,catalog:loaded.origin.data.状态目录};}
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
  const plan=planCondition(rule,loaded.view.rows,{opportunity,turn:turn(loaded),receipts:conditionReceipts(loaded)}),token='condition-preview:'+crypto.randomUUID();
  check(previews.size<100,'待确认条件超过100项');previews.set(token,{ruleId,eventId,originStamp:loaded.origin.stamp,sessionStamp:loaded.session.stamp,world:c.key,chat:c.chat});
  return {token,status:plan.status,chance:plan.chance??null,changes:copy(plan.changes),written:false};
 });}
 async function commitConditionAction(token){return run(async()=>{
  const {c,loaded,catalog}=await current(),recorded=conditionReceipts(loaded).find(r=>r.token===token);if(recorded){const e=actionInput(loaded,recorded.event.id);check(JSON.stringify({...e,source:null})===JSON.stringify({...recorded.event,source:null}),'已结算事件被改写');return {recorded:true,receipt:copy(recorded)};}
  // Receipts on a withdrawn branch never silently cause a new settlement.
  check(!loaded.session.data.commits.some(x=>x.conditionReceipt?.token===token),'回执已退出当前分支');
  const p=previews.get(token);check(p&&p.world===c.key&&p.chat===c.chat,'条件预览失效');check(p.originStamp===loaded.origin.stamp&&p.sessionStamp===loaded.session.stamp,'条件或状态已改变，请重新预览');
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
  const next=copy(loaded.session.data);next.revision++;next.commits.push(commit);await books.write(loaded.session,next,c.guard);previews.delete(token);onCommitted();return {recorded:true,receipt:copy(receipt),changes:commit.changes.length};
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
 return {describeConditionRules,listConditionRules,saveConditionRule,previewConditionAction,commitConditionAction,discardConditionPreview:id=>previews.delete(id),evaluateConditionEntries};
}
export function conditionNarrative(loaded,source){return loaded.view.commits.flatMap(c=>c.conditionReceipt?[c.conditionReceipt]:[]).filter(r=>{const e=loaded.view.rows.find(e=>e.table==='events'&&e.id===r.event?.id);return e&&JSON.stringify({...e,source:null})===JSON.stringify({...r.event,source:null});}).filter(r=>r.matched&&r.narrative&&r.deliveryAfter===source&&r.access?.readers.includes('读者')).map(r=>({ruleId:r.ruleId,text:r.narrative,note:'条件结果已经结算，只叙述已确认变化，不重复执行或扩大知情。'}));}

// Source routes own gate definitions; the ordinary form commit owns receipts.
// This adapter never initializes or writes an origin/session book.
function databaseConditions({database,getContext,draw}){
 check(typeof database.read==='function'&&typeof database.commitGate==='function','条件服务缺少统一表单读取或受控机会提交接口');
 check(typeof getContext==='function','条件服务缺少当前聊天来源');
 let queue=Promise.resolve();
 const serial=fn=>{const work=queue.then(fn);queue=work.catch(()=>{});return work;};
 const chatStamp=()=>{const context=getContext();check((context.chat??[]).every(m=>m.extra?.[NS]?.uid),'聊天消息尚未登记，先完成本轮表单准备');return matrixDigest(captureMessages(context));};
 const rowValues=(state,table,id)=>state.tables?.[table]?.[id]?.values;
 const metadata=(state,table,id)=>Object.values(state.tables?.X_RECORD_META??{}).find(r=>r.values.table_id===table&&r.values.record_id===id)?.values??{};
 const scopeAllowed=(state,table,id)=>{
  const m=metadata(state,table,id),scope=state.runtime?.scope??{};
  return !['废弃','归档'].includes(m.record_status)&&[['world_ref','scope_world_id'],['session_ref','scope_session_id'],['branch_ref','scope_branch_id']].every(([s,k])=>!m[k]||m[k]==='GLOBAL'||!scope[s]||scope[s]===m[k]);
 };
 const policyOf=row=>{
  const policy={chance:row.condition_chance??100,cooldown:row.condition_cooldown_turns??0,limit:row.condition_limit??null,start:row.condition_start_turn??0,end:row.condition_end_turn??null};
  check(Number.isFinite(policy.chance)&&policy.chance>=0&&policy.chance<=100,'概率须为0—100');
  for(const key of ['cooldown','start'])check(Number.isSafeInteger(policy[key])&&policy[key]>=0,'回合参数须为非负整数');
  for(const key of ['limit','end'])check(policy[key]===null||Number.isSafeInteger(policy[key])&&policy[key]>=0,'次数/期限须为非负整数');
  check(policy.end===null||policy.end>=policy.start,'结束回合早于开始');return policy;
 };
 async function current(){
  const key=chatKey(getContext()),stamp=chatStamp(),db=await database.read();
  check(db?.state&&db.contextKey===key&&key===chatKey(getContext())&&stamp===chatStamp(),'条件表单来源未准备或聊天已变化');
  return {db,key,stamp};
 }
 function definition(db,id){
  const state=db.state,route=rowValues(state,'T_SYS_SOURCE_ROUTES',id);
  check(route?.activation_condition,'条件规则尚未登记到当前规范表单；旧规则需先按稳定格位迁移');
  check(scopeAllowed(state,'T_SYS_SOURCE_ROUTES',id),'条件来源不属于当前生效作用域');
  const groups=[],refs=[];
  for(const field of ['activation_condition','expiry_condition']){
   const ref=route[field];if(ref==null||ref==='')continue;
   check(typeof ref==='string','条件须引用唯一的标准条件组');
   const first=rowValues(state,'M_CONDITIONS',ref);check(first,'条件节点引用已不存在');
   check(first.owner_table==='T_SYS_SOURCE_ROUTES'&&first.owner_row_uuid===id&&first.owner_field===field,'条件组归属与来源路由不一致');
   const nodes=Object.values(state.tables?.M_CONDITIONS??{}).map(r=>r.values).filter(n=>n.owner_table===first.owner_table&&n.owner_row_uuid===id&&n.owner_field===field&&n.group_key===first.group_key);
   check(nodes.length>0&&nodes.length<=128,'条件组为空或超出128项');
   for(const node of nodes)for(const key of ['lhs_ref',...(node.rhs_kind==='reference'?['rhs_ref']:[])])if(node[key]){
    check(typeof node[key]==='string','条件格位须为标准引用ID');
    const reference=rowValues(state,'M_FIELD_REFERENCES',node[key]);check(reference,'条件格位引用不存在');refs.push(reference);
   }
   groups.push({field,first,nodes});
  }
  const record=state.tables.T_SYS_SOURCE_ROUTES[id];for(const key of ['activation_condition','expiry_condition','condition_chance','condition_cooldown_turns','condition_limit','condition_start_turn','condition_end_turn'])if(route[key]!=null||record.states?.[key]==='unknown')check(['known','derived'].includes(record.states?.[key]),'条件定义字段尚未确认：'+key);
  const policy=policyOf(route),acl=Object.values(state.tables?.M_ACCESS_RULES??{}).map(r=>r.values).filter(a=>a.owner_table==='T_SYS_SOURCE_ROUTES'&&a.owner_row_uuid===id||refs.some(ref=>a.owner_table===ref.target_table&&a.owner_row_uuid===ref.target_row_uuid));
  const fieldDefinitions=refs.map(ref=>({table:ref.target_table,field:state.schema?.[ref.target_table]?.fields.find(f=>f.key===ref.target_field)??null}));
  const revision=parseInt(matrixDigest({route,groups,refs,acl,fieldDefinitions}).slice(0,12),16)+1;
  return {id,name:route.source_name||id,revision,mode:'gate',policy,route,groups,refs,acl};
 }
 function publicSource(state,table,id,field=''){
  const row=state.tables?.[table]?.[id],schema=state.schema?.[table],m=metadata(state,table,id);
  if(!row||!scopeAllowed(state,table,id)||table==='T_CHAR_SECRETS'||['D','E','Access D','Access E'].includes(row.values.lock_level)||schema?.fields.find(f=>f.key===field)?.lock_level)return false;
  const rules=Object.values(state.tables?.M_ACCESS_RULES??{}).map(r=>r.values).filter(r=>r.owner_table===table&&r.owner_row_uuid===id&&(!r.owner_field||r.owner_field===field||r.row_uuid===m.default_disclosure)&&['read','disclose'].includes(r.permission));
  if(m.default_disclosure&&!rules.some(r=>r.row_uuid===m.default_disclosure))throw Error('条件依赖的读取权限引用不完整');
  if(!rules.length)return true;
  // Public gate outcomes must not expose an author/character-only fact.
  const publicRules=rules.filter(r=>r.audience_kind==='public');
  if(publicRules.some(r=>r.decision==='conditional'))throw Error('条件依赖的动态披露权限尚未完成绑定，未放行');
  return publicRules.some(r=>r.decision==='allow'&&r.value_state==='known')&&!publicRules.some(r=>r.decision==='deny'||r.value_state!=='known');
 }
 function evaluate(db,rule,prepared={}){
  if(!publicSource(db.state,'T_SYS_SOURCE_ROUTES',rule.id,'activation_condition')||rule.refs.some(ref=>!publicSource(db.state,ref.target_table,ref.target_row_uuid,ref.target_field??'')))return {status:'private',changes:[],basis:[]};
  const e=prepared.engine??=new Runtime(db.state);
  // Resolve only this rule's formula-backed inputs through their existing owner.
  for(const ref of rule.refs)if(ref.reference_kind==='cell'&&ref.resolution_status==='resolved'){
   const r=e.rows(ref.target_table)[ref.target_row_uuid];
   if(r&&Object.hasOwn(r.formulas??{},ref.target_field))try{e.get([ref.target_table,ref.target_row_uuid,ref.target_field,[]]);prepared.tables=null;}catch(error){if(error.code==='VALUE_UNAVAILABLE')return {status:'unknown',changes:[],basis:[]};throw error;}
  }
  const tables=prepared.tables??=normalizeTables(e.mechanicalPayload());
  for(const ref of rule.refs){const r=tables[ref.target_table]?.find(r=>r.row_uuid===ref.target_row_uuid);if(r?.__value_states?.[ref.target_field]==='derived')r.__value_states[ref.target_field]='known';}
  const evaluateGroup=group=>{
   try{return evaluateConditionGroup(tables,group.first,group.first.group_key).passed;}
   catch(error){if(error instanceof MechanicalError&&['VALUE_STATE','MISSING_FIELD','MISSING_INPUT'].includes(error.code))return null;throw error;}
  };
  const active=evaluateGroup(rule.groups.find(g=>g.field==='activation_condition')),expiry=rule.groups.find(g=>g.field==='expiry_condition'),expired=expiry?evaluateGroup(expiry):false;
  const status=active===false||expired===true?'unmatched':active===null||expired===null?'unknown':'ready';
  return {status,changes:[],basis:rule.refs.map(r=>({table:r.target_table,id:r.target_row_uuid,field:r.target_field}))};
 }
 const receipts=state=>Object.values(state.runtime?.receipts??{}).flatMap(r=>r.result?.source?.kind==='worldbook-condition'?r.result.source.receipts??[]:[]);
 async function describeConditionRules(){
  const {db}=await current(),out=[],prepared={};
  for(const [id,row]of Object.entries(db.state.tables?.T_SYS_SOURCE_ROUTES??{}))if(row.values.activation_condition){
   try{const rule=definition(db,id);evaluate(db,rule,prepared);out.push({id,name:rule.name,revision:rule.revision,provider:CONDITION_PROVIDER,valid:true});}
   catch(error){out.push({id,name:row.values.source_name||id,provider:CONDITION_PROVIDER,valid:false,diagnostic:error.message});}
  }
  return out;
 }
 async function evaluateConditionEntries({requestId,entryRefs,trigger='normal',dryRun=true,signal}={}){return serial(async()=>{
  check(typeof requestId==='string'&&requestId&&Array.isArray(entryRefs)&&entryRefs.length<=512,'世界书条件请求无效');
  const {db,key,stamp}=await current(),guard=()=>{signal?.throwIfAborted();check(key===chatKey(getContext())&&stamp===chatStamp(),'世界书条件来源已变化');};guard();
  const opportunity='prompt:'+matrixDigest([stamp,trigger]),turn=(db.state.runtime?.turn_order??[]).length,history=receipts(db.state),seen=new Set(),prepared={};
  // Validate the entire batch before consuming chance or writing a receipt.
  const plans=entryRefs.map(ref=>{
   const address=JSON.stringify([ref.bookRef,String(ref.uid)]),lane=JSON.stringify([ref.ruleRef,ref.bookRef,String(ref.uid)]);check(!seen.has(address),'同一世界书条目重复');seen.add(address);
   const rule=definition(db,ref.ruleRef);check(ref.provider===CONDITION_PROVIDER&&ref.ruleVersion===rule.revision,'世界书条件规则提供者或版本不符');
   const chance=ref.chance??rule.policy.chance;check(Number.isFinite(chance)&&chance>=0&&chance<=100,'世界书概率无效');
   const prior=history.filter(r=>r.lane===lane),old=prior.find(r=>r.opportunity===opportunity);if(old)check(old.chance===chance,'同一机会的概率配置已改变，未重新抽签');
   const evaluation=evaluate(db,rule,prepared),withChance={...rule,policy:{...rule.policy,chance}},options={opportunity,turn,receipts:prior};
   return {ref,lane,rule:withChance,evaluation,options,plan:planConditionResult(withChance,evaluation,options)};
  });
  const recorded=[];
  for(const row of plans)if(row.plan.status==='eligible'&&!dryRun){row.plan=planConditionResult(row.rule,row.evaluation,{...row.options,draw:draw()});const receipt={...row.plan,lane:row.lane};delete receipt.changes;delete receipt.basis;recorded.push(receipt);}
  guard();let final=db;
  if(recorded.length){
   const source={kind:'worldbook-condition',opportunity,turn,receipts:recorded};
   final=await database.commitGate({operationId:'worldbook-condition:'+matrixDigest([opportunity,recorded.map(r=>r.lane)]),expectedRevision:db.revision,contextKey:key,changes:[],source});
   check(final?.contextKey===key&&final.receipt?.result?.source?.kind==='worldbook-condition','条件机会写入尚未获得完整回执');guard();
  }
  const stateHash=matrixDigest(final.state),revision=final.revision;
  return {requestId,contextRevision:matrixDigest([key,revision,stateHash,stamp]),results:plans.map(({ref,plan})=>({bookRef:ref.bookRef,uid:ref.uid,ruleRef:ref.ruleRef,ruleVersion:ref.ruleVersion,state:plan.matched?'matched':plan.status==='unknown'?'unknown':'not_matched',reasonCode:plan.status})),
   async assertCurrent(){guard();const now=await database.read();guard();check(now?.contextKey===key&&now.revision===revision&&matrixDigest(now.state)===stateHash,'条件扫描后规范表单已变化，已停止发送');}};
 });}
 return {describeConditionRules,evaluateConditionEntries};
}
