import {parseStateEvents,validateStateEvents} from './state-event-rules.js';
import {compileStateFormulas,registerStateFormulas,evaluateStateFormula} from './state-formulas.js';
// One shared catalog in origin metadata; current values stay in the existing ledger.
import {emptyStateRegistry,levelStatePreset,stateKind,registerStateDefinitions,validateStateRegistry,projectStateVocabulary,proposeStateGrid,proposeStateValues,stateGridTemplate,stateGridColumns} from './state-registry.js';
import {conditionBindings,evaluateConditionRule} from './condition-rules.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const copy=structuredClone;
export function validateStateCatalog(catalog,namespace){
 check(catalog?.format==='tisya.state-catalog/2'&&Number.isSafeInteger(catalog.revision)&&catalog.revision>=1,'状态定义目录无效');
 validateStateRegistry(catalog.registry);check(catalog.registry.namespace===namespace,'状态定义属于另一原点');
 check(Array.isArray(catalog.items)&&catalog.items.every(i=>catalog.registry.definitions.some(f=>f.kind===i.kind)),'状态条目无定义');
 projectStateVocabulary(catalog.registry,catalog.items);compileStateFormulas(catalog);validateStateEvents(catalog);return true;
}
export function registerStateCatalog(previous,namespace,{preset=false,definitions='',items='',formulas='',growth='',events=''}={}){
 if(previous)validateStateCatalog(previous,namespace);
 check(typeof preset==='boolean'&&typeof definitions==='string'&&typeof items==='string'&&items.length<=16000,'状态登记文本无效');
 let next=previous?copy(previous):{format:'tisya.state-catalog/2',revision:1,registry:preset?levelStatePreset(namespace):emptyStateRegistry(namespace),items:[]};
 // Existing catalogs are never replaced with defaults by choosing the preset again.
 if(preset&&previous){const expected=levelStatePreset(namespace);check(expected.definitions.every(d=>previous.registry.definitions.some(f=>JSON.stringify({...f,aliases:[]})===JSON.stringify(d))),'已有目录不同于预置定义；请显式登记缺少的字段');}
 const incomingEvents=parseStateEvents(events);
 if(incomingEvents.length){next.registry=registerStateDefinitions(next.registry,'事件／已触发：布尔');items=[items,...incomingEvents.map(e=>'事件：'+e.name)].filter(Boolean).join('\n');}
 next.registry=registerStateDefinitions(next.registry,definitions);
 for(const line of items.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
  const m=line.match(/^([^：:]+)[：:]\s*(.+)$/);check(m,'条目须写 类别：名称');const kind=stateKind(m[1].trim()),name=m[2].trim();
  if(!next.items.some(i=>i.kind===kind&&i.name===name))next.items.push({id:'state-item:'+crypto.randomUUID(),kind,name});
 }
 next=registerStateFormulas(next,{formulas,growth});
 const existingEvents=parseStateEvents(next.events??'');for(const e of incomingEvents){const old=existingEvents.find(x=>x.name===e.name);check(!old||JSON.stringify(old)===JSON.stringify(e),'已有事件规则不可改写：'+e.name);if(!old){existingEvents.push(e);next.events=[next.events,e.source].filter(Boolean).join('\n');}}
 if(previous&&JSON.stringify({...next,revision:previous.revision})!==JSON.stringify(previous))next.revision++;
 validateStateCatalog(next,namespace);return next;
}
export function selectStateForm(view,catalog,ownerId,itemIds){
 const owner=view.rows.find(r=>r.id===ownerId);check(owner?.table==='objects','请选择当前档案中的对象');
 check(Array.isArray(itemIds)&&itemIds.length<=64&&new Set(itemIds).size===itemIds.length,'状态简表条目选择无效或超过64项');
 const instances=itemIds.map(id=>{const item=catalog.items.find(i=>i.id===id);check(item,'状态条目未登记');return copy(item);});
 const vocabulary=projectStateVocabulary(catalog.registry,instances,{writeDefinitionIds:catalog.registry.definitions.map(d=>d.id)}),scope={ownerId};
 const program={format:'tisya.condition-rule/1',fields:vocabulary.fields,branches:[],effects:[]};
 const bindings=conditionBindings(program,scope),current=new Map();
 for(const b of bindings){
  const matches=view.rows.filter(r=>r.table==='state'&&r.values.对象===ownerId&&r.values.字段===b.field);check(matches.length<=1,'状态账本有重复行，未选择其中一个覆盖');
  const row=matches[0];if(row)check(Object.hasOwn(row.values,'值')&&!Object.hasOwn(row.values,'值引用')&&!Object.hasOwn(row.values,'原生引用'),'引用或原生变量状态不能由简表覆写');current.set(b.field,row??null);
 }
 evaluateConditionRule(program,view.rows,scope); // type/revision validation, no effects
 return {owner,instances,vocabulary,scope,bindings,current};
}
export function readStateGrid(view,catalog,ownerId,itemIds){
 const selected=selectStateForm(view,catalog,ownerId,itemIds),header=stateGridTemplate(catalog.registry,[]);
 const display=v=>v===true?'是':v===false?'否':v==='?'?'？':String(v);
 const rows=selected.instances.map(item=>{
  const columns=stateGridColumns(catalog.registry,item.kind);check(columns,'此条目须使用全部登记字段：'+item.name);
  return [item.name,...columns.map(def=>{if(!def)return '/';const f=selected.vocabulary.fields.find(f=>f.name===def.name+'['+item.name+']');check(f,'简表字段未登记：'+def.name);const b=selected.bindings.find(b=>b.key===f.key),row=selected.current.get(b.field);if(!row||row.values.有效性!=='有效')return '？';const value=display(row.values.值);check(!/[\r\n]/.test(value),'已有多行效果不能压成单行，请使用原字段编辑');return value;})].join('｜');
 });
 return [header,...rows].join('\n');
}
export function stateChangesProposal(view,catalog,ownerId,itemIds,parsed,raw){
 const selected=selectStateForm(view,catalog,ownerId,itemIds),changes=[],diff=[];
 for(const change of parsed.changes){
  const prior=selected.current.get(change.values.字段),f=selected.vocabulary.fields.find(f=>f.key===change.key);check(f,'状态提案字段越界');
  if(prior?.values.有效性==='有效'&&Object.is(prior.values.值,change.values.值))continue;
  let access=copy(prior?.access??{readers:['读者'],knowers:[]});
  if(parsed.dependencies?.length){
   const intersection=k=>parsed.dependencies.reduce((a,r)=>a.filter(x=>r.access[k].includes(x)),parsed.dependencies[0].access[k]);
   if(prior)check(['readers','knowers'].every(k=>access[k].every(x=>intersection(k).includes(x))),'公式结果的知情范围不能超过输入状态');
   else access={readers:intersection('readers'),knowers:intersection('knowers')};
  }
  changes.push({id:prior?.id??'new:state-'+changes.length,table:'state',expected:prior?.rev??0,values:prior?{值:change.values.值,有效性:'有效'}:{名称:f.name,...change.values},access,evidence:raw});
  diff.push({name:f.name,before:prior?.values.有效性==='有效'?copy(prior.values.值):'?',after:copy(change.values.值)});
 }
 return {proposal:{changes},diff,raw,dependencies:copy(parsed.dependencies??[])};
}
export function stateGridProposal(view,catalog,{ownerId,itemIds,text}){
 const selected=selectStateForm(view,catalog,ownerId,itemIds),parsed=proposeStateGrid(text,catalog.registry,selected.instances,{ownerId});
 return stateChangesProposal(view,catalog,ownerId,itemIds,parsed,text);
}
export function stateValuesProposal(view,catalog,{ownerId,itemIds,text}){
 const selected=selectStateForm(view,catalog,ownerId,itemIds),parsed=proposeStateValues(text,selected.vocabulary,{ownerId});
 return stateChangesProposal(view,catalog,ownerId,itemIds,parsed,text);
}
export function readStateValues(view,catalog,ownerId,itemIds){
 const selected=selectStateForm(view,catalog,ownerId,itemIds);
 return selected.vocabulary.fields.map(f=>{const b=selected.bindings.find(b=>b.key===f.key),row=selected.current.get(b.field);const v=row?.values.有效性==='有效'?row.values.值:'?';check(typeof v!=='string'||!/[\r\n]/.test(v),'多行状态请使用原字段编辑');return f.name+'：'+(v==='?'?'？':v===true?'是':v===false?'否':String(v)+(typeof v==='number'&&f.unit?' '+f.unit:''));}).join('\n');
}
function collectGrowth(catalog,rows,ownerId){
 const results=compileStateFormulas(catalog).actions.filter(a=>a.automatic).map(a=>evaluateStateFormula(catalog,a.name,rows,ownerId)),ready=results.filter(r=>r.status==='ready');
 const changes=ready.flatMap(r=>r.changes);check(new Set(changes.map(c=>c.key)).size===changes.length,'多条成长规则修改同一字段，请消除冲突');
 return {changes,dependencies:results.flatMap(r=>r.dependencies),source:ready.map(r=>r.source).join('\n'),growth:results.map(r=>({name:r.action,status:r.status}))};
}
export function stateFormulaProposal(view,catalog,{ownerId,name}){
 const itemIds=catalog.items.map(i=>i.id),result=evaluateStateFormula(catalog,name,view.rows,ownerId);
 check(result.status==='ready','运算条件'+(result.status==='unknown'?'未知':'未满足'));
 const first=stateChangesProposal(view,catalog,ownerId,itemIds,result,result.source);
 if(compileStateFormulas(catalog).actions.find(a=>a.name===name).automatic)return {...first,action:name};
 // A manual operation may earn growth. Evaluate registered growth once on the
 // proposed post-operation state, then commit the combined final values once.
 const rows=copy(view.rows);for(const [i,op]of first.proposal.changes.entries()){
  const row=rows.find(r=>r.id===op.id);if(row){Object.assign(row.values,op.values);row.rev++;}
  else rows.push({id:'formula-preview:'+i,rev:1,table:'state',values:copy(op.values),access:copy(op.access)});
 }
 const after=collectGrowth(catalog,rows,ownerId),changes=new Map(result.changes.map(x=>[x.key,x]));for(const c of after.changes)changes.set(c.key,c);
 const parsed={changes:[...changes.values()],dependencies:[...result.dependencies,...after.dependencies]},raw=[result.source,after.source].filter(Boolean).join('\n');
 return {...stateChangesProposal(view,catalog,ownerId,itemIds,parsed,raw),action:name,growth:after.growth};
}
export function stateGrowthProposal(view,catalog,{ownerId}){
 const result=collectGrowth(catalog,view.rows,ownerId);
 return {...stateChangesProposal(view,catalog,ownerId,catalog.items.map(i=>i.id),result,result.source),growth:result.growth};
}
