// One condition contract over the existing world registry and current ledger.
// Rules contain addresses, never copied current values. Receipts are historical.
import {projectStateVocabulary} from './state-registry.js';
import {compileConditionRule,evaluateConditionRule,conditionBindings} from './condition-rules.js';
import {stateChangesProposal} from './state-form.js';
const check=(ok,m)=>{if(!ok)throw Error(m);},copy=structuredClone;
export const CONDITION_PROVIDER='tisya.conditions/1';
export function compileBoundRule(input,catalog,view){
 check(input?.id===undefined||typeof input.id==='string'&&input.id.length>0&&input.id.length<=200,'条件身份无效');
 check(input?.revision===undefined||Number.isSafeInteger(input.revision)&&input.revision>=1,'规则版本无效');
 check(input&&typeof input.name==='string'&&input.name.trim()&&input.name.length<=100,'条件规则须有名称');
 check(['gate','action'].includes(input.mode),'条件类型须为gate或action');
 check(Array.isArray(input.bindings)&&input.bindings.length>0&&input.bindings.length<=64,'条件须明确绑定1—64个字段');
 const world=projectStateVocabulary(catalog.registry,catalog.items,{writeDefinitionIds:catalog.registry.definitions.map(d=>d.id)}),addresses=new Set();
 const bindings=input.bindings.map(b=>{
  const f=world.fields.find(f=>f.key===b.fieldKey);check(f,'绑定字段不在世界注册表');
  check(view.rows.some(r=>r.id===b.objectId&&r.table==='objects'),'绑定对象不在当前分支');
  check(typeof b.name==='string'&&b.name.trim(),'条件名称为空');
  const fieldPath=JSON.stringify([f.recordKey,f.storageKey]),address=JSON.stringify([b.objectId,fieldPath]);check(!addresses.has(address),'同一状态只能绑定一个规范名称');addresses.add(address);
  return {name:b.name.trim(),fieldKey:f.key,objectId:b.objectId,write:b.write===true};
 });
 let source=input.source;
 if(input.sourceRef){const {recordId,field,index}=input.sourceRef,r=view.rows.find(r=>r.id===recordId);check(r&&typeof field==='string'&&Object.hasOwn(r.values,field),'档案条件来源不存在');const v=r.values[field];source=Array.isArray(v)?v[index??0]:v;check(typeof source==='string'&&(!input.source||input.source===source),'档案条件与指定原文不一致');}
 const fields=bindings.map(b=>{const f=world.fields.find(f=>f.key===b.fieldKey);const {registryRevision,...definition}=f;return {...definition,name:b.name,aliases:[],key:b.name,scope:'bound',objectId:b.objectId,fieldPath:JSON.stringify([f.recordKey,f.storageKey]),write:input.mode==='action'&&b.write&&!f.aliases.some(a=>a.startsWith('已触发事件“'))};});
 const program=compileConditionRule(input.mode==='gate'?source.split(/→|=>/)[0].trim():source,{version:1,fields},{predicate:true});
 check(input.mode==='action'?program.effects.length>0:program.effects.length===0,'门禁只写条件；动作规则须有变动或变更');
 const policy={chance:input.policy?.chance??100,cooldown:input.policy?.cooldown??0,limit:input.policy?.limit??null,start:input.policy?.start??0,end:input.policy?.end??null};
 check(Number.isFinite(policy.chance)&&policy.chance>=0&&policy.chance<=100,'概率须为0—100');
 for(const k of ['cooldown','start'])check(Number.isSafeInteger(policy[k])&&policy[k]>=0,'回合参数须为非负整数');
 for(const k of ['limit','end'])check(policy[k]===null||Number.isSafeInteger(policy[k])&&policy[k]>=0,'次数/期限须为非负整数');
 check(policy.end===null||policy.end>=policy.start,'结束回合早于开始');
 check(input.narrative===undefined||typeof input.narrative==='string'&&input.narrative.length<=4000,'触发后文本过长');
 return {format:CONDITION_PROVIDER,id:input.id??'condition:'+crypto.randomUUID(),revision:input.revision??1,name:input.name.trim(),mode:input.mode,source,sourceRef:copy(input.sourceRef??null),bindings,policy,narrative:input.narrative??'',program};
}
export function validateBoundRule(rule,catalog,view){
 const current=compileBoundRule(rule,catalog,view);check(JSON.stringify(current)===JSON.stringify(rule),'条件来源或世界定义已改变，请重新登记规则');return current;
}
export function conditionReceipts(loaded){return [...(loaded.session.data.branchSeed?.conditionReceipts??[]),...loaded.view.commits.flatMap(c=>c.conditionReceipt?[c.conditionReceipt]:[])];}
export function planCondition(rule,rows,{opportunity,turn,receipts=[],draw=null}={}){
 check(typeof opportunity==='string'&&opportunity&&Number.isSafeInteger(turn)&&turn>=0,'缺少稳定机会身份或回合');
 const result=evaluateConditionRule(rule.program,rows,{}),base={ruleId:rule.id,revision:rule.revision,opportunity,turn,status:result.status,matched:false,chance:rule.policy.chance,draw:null,changes:[],basis:result.basis};
 // A historical success never makes a currently false/unknown gate true.
 if(result.status!=='ready')return base;
 const history=receipts.filter(r=>r.ruleId===rule.id),prior=history.filter(r=>r.opportunity===opportunity);check(prior.length<=1,'条件机会回执重复');
 if(prior.length){check(prior[0].revision===rule.revision,'规则已变化，旧机会不能重抽');return {...copy(prior[0]),repeated:true,changes:[],basis:result.basis};}
 const p=rule.policy,success=history.filter(r=>r.matched),last=success.at(-1);
 if(turn<p.start||p.end!==null&&turn>p.end)return {...base,status:'outside-window'};
 if(p.limit!==null&&success.length>=p.limit)return {...base,status:'limit'};
 if(last&&turn-last.turn<p.cooldown)return {...base,status:'cooldown'};
 if(draw===null)return {...base,status:'eligible',chance:p.chance,changes:result.changes};
 check(Number.isFinite(draw)&&draw>=0&&draw<1,'随机值无效');const matched=draw*100<p.chance;
 return {...base,status:matched?'matched':'miss',matched,draw,changes:matched?result.changes:[]};
}
export function conditionActionProposal(rule,plan,view,catalog){
 check(rule.mode==='action'&&plan.status==='matched'&&!plan.repeated,'动作未通过或已经结算');
 const groups=new Map(),dependencies=plan.basis.filter(x=>x.id).map(x=>view.rows.find(r=>r.id===x.id));
 if(rule.sourceRef){const source=view.rows.find(r=>r.id===rule.sourceRef.recordId);check(source,'条件来源缺失');dependencies.push(source);}
 for(const change of plan.changes){const bind=rule.bindings.find(b=>b.name===change.key);check(bind?.write,'条件结果超出写入绑定');const group=groups.get(bind.objectId)??[];group.push({...change,key:bind.fieldKey});groups.set(bind.objectId,group);}
 const plans=[...groups].map(([ownerId,changes])=>stateChangesProposal(view,catalog,ownerId,catalog.items.map(i=>i.id),{changes,dependencies},rule.source));
 // Existing commit machinery remaps new IDs; make them unique across owners.
 const changes=plans.flatMap(p=>p.proposal.changes);let serial=0;for(const c of changes)if(c.id.startsWith('new:'))c.id='new:condition-'+serial++;
 const accesses=dependencies.map(r=>r.access);const access=Object.fromEntries(['readers','knowers'].map(k=>accesses.length? [k,accesses.reduce((a,b)=>a.filter(x=>b[k].includes(x)),accesses[0][k])]:[k,[]]));
 return {proposal:{changes},diff:plans.flatMap(p=>p.diff),access};
}
export function conditionReadAccess(rule,view){
 const addresses=conditionBindings(rule.program,{}),rows=addresses.map(b=>view.rows.find(r=>r.table==='state'&&r.values.对象===b.object&&r.values.字段===b.field&&r.values.有效性==='有效')).filter(Boolean);
 if(rule.sourceRef){const r=view.rows.find(r=>r.id===rule.sourceRef.recordId);if(r)rows.push(r);}
 return rows.every(r=>r.access?.readers?.includes('读者'));
}
