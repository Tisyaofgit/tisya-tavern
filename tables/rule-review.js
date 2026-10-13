import {check,copy} from './schema.js';
import {digest} from './books.js';
import {cardAIMaterials,bookAIMaterials} from './card-source.js';

export async function ruleSources(card,books=[]){
 const ai=cardAIMaterials(card),bound=bookAIMaterials(books),sources=[];
 for(const [name,value]of Object.entries(ai.fields)){
  if(typeof value==='string'&&value)sources.push({id:'card.field.'+name,label:name,kind:['first_mes','alternate_greetings','mes_example'].includes(name)?'example':'definition',text:value});
  else if(Array.isArray(value))value.forEach((text,i)=>{if(typeof text==='string')sources.push({id:'card.field.'+name+'.'+i,label:name+' '+i,kind:'example',text});});
 }
 for(const e of ai.entries)sources.push({id:'card'+e.path,label:e.name||String(e.id),kind:'definition',text:e.content});
 bound.forEach((e,i)=>{if(!e.runtimeSource)sources.push({id:'book.'+i,label:e.book+' / '+e.entry,kind:'definition',text:e.content});});
 return {fingerprint:await digest(JSON.stringify({ai,bound})),sources,runtimeSources:[...ai.runtimeSources,...bound.filter(e=>e.runtimeSource)]};
}
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(value)&&value!=='prototype'&&!Object.hasOwn(Object.prototype,value);
const text=(value,label)=>check(typeof value==='string'&&value.trim(),label+'不能为空');
function keys(value,allowed,label){check(value&&typeof value==='object'&&!Array.isArray(value),label+'格式无效');check(Object.keys(value).every(k=>allowed.includes(k)),label+'包含未登记字段');}
export function validateRuleReview(proposal,source){
 keys(proposal,['issues'],'规则校对');check(Array.isArray(proposal.issues)&&proposal.issues.length<=200,'规则问题列表无效');
 const ids=new Set(),bySource=new Map(source.sources.map(s=>[s.id,s]));
 for(const issue of proposal.issues){
  keys(issue,['id','title','problem','sources','options'],'规则问题');check(safeId(issue.id),'问题 ID 格式无效');check(!ids.has(issue.id),'规则问题 ID 重复');ids.add(issue.id);text(issue.title,'问题标题');text(issue.problem,'问题说明');
  check(Array.isArray(issue.sources)&&issue.sources.length>0,'规则问题缺少原文');
  for(const anchor of issue.sources){keys(anchor,['sourceId','quote'],'原文定位');const s=bySource.get(anchor.sourceId);text(anchor.quote,'原文引用');check(s&&s.text.includes(anchor.quote),'规则问题引用不在原文中');}
  check(Array.isArray(issue.options)&&issue.options.length<=6,'优化方案列表无效');const optionIds=new Set();
  for(const option of issue.options){
   keys(option,['id','label','rationale','tradeoffs','changes'],'优化方案');for(const k of ['id','label','rationale','tradeoffs'])text(option[k],k);check(safeId(option.id),'优化方案 ID 格式无效');check(!optionIds.has(option.id),'优化方案 ID 重复');optionIds.add(option.id);check(Array.isArray(option.changes)&&option.changes.length>0,'优化方案缺少具体改动');
   for(const change of option.changes){keys(change,['sourceId','before','after'],'规则改动');text(change.before,'修改前');text(change.after,'修改后');const s=bySource.get(change.sourceId);check(s?.kind==='definition'&&s.text.includes(change.before),'优化改动必须定位到原始定义');check(s.text.indexOf(change.before)===s.text.lastIndexOf(change.before),'优化原文定位不唯一，请扩大引用范围');check(change.before!==change.after,'优化前后内容相同');check(issue.sources.some(a=>a.sourceId===change.sourceId&&a.quote.includes(change.before)),'优化越过本问题引用范围');}
   validateOverlap(option.changes,bySource);
  }
 }
 return {format:'tisya.rule-review/1',fingerprint:source.fingerprint,sources:copy(source.sources),runtimeSources:copy(source.runtimeSources),issues:copy(proposal.issues),decisions:{},at:new Date().toISOString()};
}
function validateOverlap(changes,bySource){
 const spans=[];
 for(const c of changes){const s=bySource.get(c.sourceId);check(s&&s.text.includes(c.before),'优化来源已改变');const start=s.text.indexOf(c.before),end=start+c.before.length;check(!spans.some(p=>p.id===c.sourceId&&start<p.end&&end>p.start),'所选优化方案修改同一段原文，请选择不重叠的方案');spans.push({id:c.sourceId,start,end});}
}
export function rulePolicy(review,source,{requireResolved=true}={}){
 if(!review)return null;
 check(review.fingerprint===source.fingerprint,'原卡或绑定规则已改变，请重新校对规则；旧选择未套用');
 const unresolved=review.issues.filter(i=>!review.decisions[i.id]);check(!requireResolved||!unresolved.length,'原卡有 '+unresolved.length+' 项规则问题待选择，请先保留静默或选择优化方案');
 const decisions=review.issues.filter(i=>review.decisions[i.id]).map(i=>{const d=review.decisions[i.id];if(d.action==='keep')return {issueId:i.id,action:'keep',original:i.sources};const option=i.options.find(o=>o.id===d.optionId);check(d.action==='optimize'&&option,'已选规则方案不存在');return {issueId:i.id,action:'optimize',label:option.label,changes:option.changes};});
 validateOverlap(decisions.flatMap(d=>d.changes??[]),new Map(source.sources.map(s=>[s.id,s])));
 return {format:'tisya.rule-policy/1',sourceFingerprint:source.fingerprint,scope:'当前会话；仅玩家确认的原卡规则差异；历史事实和原始资料不改写',decisions:copy(decisions),unresolved:unresolved.map(i=>({id:i.id,title:i.title,sources:i.sources}))};
}
export function chooseRule(review,source,{issueId,action,optionId}){
 check(['keep','optimize','reopen'].includes(action),'规则处理方式无效');const next=copy(review),issue=next.issues.find(i=>i.id===issueId);check(issue,'规则问题不存在');
 if(action==='reopen')delete next.decisions[issueId];else{check(action==='keep'||issue.options.some(o=>o.id===optionId),'优化方案不存在');next.decisions[issueId]={action,...(action==='optimize'?{optionId}:{}),at:new Date().toISOString()};}
 rulePolicy(next,source,{requireResolved:false});return next;
}
export function policyEvidence(policy){return policy?.decisions.some(d=>d.action==='optimize')?'\n\n玩家已确认的缇斯亚规则版本：\n'+policy.decisions.filter(d=>d.action==='optimize').flatMap(d=>d.changes.map(c=>'来源：'+c.sourceId+'\n原文：\n'+c.before+'\n玩家选择的生效规则：\n'+c.after)).join('\n\n'):'';}
