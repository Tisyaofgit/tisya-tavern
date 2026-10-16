import {parseStateEvents} from './state-event-rules.js';
import {selectStateForm,stateChangesProposal,stateFormulaProposal} from './state-form.js';
import {proposeStateValues} from './state-registry.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const copy=structuredClone;
export function stateEventInput(view,catalog,{eventId,ownerId,name}){
 check(typeof eventId==='string'&&typeof ownerId==='string'&&typeof name==='string','事件结算参数无效');
 const event=view.rows.find(r=>r.id===eventId&&r.table==='events'),owner=view.rows.find(r=>r.id===ownerId&&r.table==='objects'),rule=parseStateEvents(catalog.events??'').find(r=>r.name===name);
 check(event&&owner&&rule,'事件、结算对象或规则不存在');check(event.values.名称===name,'事件名称与登记规则不符');
 check(event.values.参与者?.includes(ownerId),'结算对象必须在事件的明确参与者中；不按提及推断');
 return {event:copy(event),owner:copy(owner),rule,identity:JSON.stringify([eventId,ownerId]),payload:{event:copy(event),ownerId,rule}};
}
const subset=(a,b)=>['readers','knowers'].every(k=>a[k].every(x=>b[k].includes(x)));
function proposedRows(rows,proposal,prefix){const result=copy(rows);for(const [i,op]of proposal.changes.entries()){const old=result.find(r=>r.id===op.id);if(old){Object.assign(old.values,copy(op.values));old.rev++;}else result.push({id:prefix+i,rev:1,table:'state',values:copy(op.values),access:copy(op.access)});}return result;}
export function stateEventProposal(view,catalog,input){
 const spec=stateEventInput(view,catalog,input),itemIds=catalog.items.map(i=>i.id),selected=selectStateForm(view,catalog,input.ownerId,itemIds),flagText='已触发事件“'+spec.rule.name+'”：是';
 const parsed=proposeStateValues(flagText,selected.vocabulary,{ownerId:input.ownerId});parsed.dependencies=[spec.event];
 const flag=stateChangesProposal(view,catalog,input.ownerId,itemIds,parsed,flagText),marked=proposedRows(view.rows,flag.proposal,'event-flag:');
 const result=stateFormulaProposal({...view,rows:marked},catalog,{ownerId:input.ownerId,name:spec.rule.action});
 check(result.proposal.changes.every(op=>subset(op.access,spec.event.access)),'事件结果的知情范围不能超过事件本身');
 const rows=proposedRows(marked,result.proposal,'event-result:'),touched=new Set([...flag.diff,...result.diff].map(d=>d.name));
 const changes=selected.vocabulary.fields.filter(f=>touched.has(f.name)).map(f=>{const b=selected.bindings.find(b=>b.key===f.key);return {key:f.key,values:copy(rows.find(r=>r.table==='state'&&r.values.对象===input.ownerId&&r.values.字段===b.field).values)};});
 const raw=[spec.rule.source,flagText,result.raw].join('\n');
 const planned=stateChangesProposal(view,catalog,input.ownerId,itemIds,{changes,dependencies:[spec.event,...rows.filter(r=>r.table==='state'&&r.values.对象===input.ownerId&&touched.has(r.values.名称))]},raw);
 const accesses=[spec.event.access,...(result.dependencies??[]).map(r=>r.access),...planned.proposal.changes.map(op=>op.access)];const access=Object.fromEntries(['readers','knowers'].map(k=>[k,accesses.reduce((a,b)=>a.filter(x=>b[k].includes(x)),accesses[0][k])]));
 return {...planned,spec,growth:result.growth??[],access};
}
// Committed outcomes are historical receipts, not another current-value store.
// Only active branch, readable, latest-source outcomes enter narrative input.
export function stateEventNarrative(view,source){
 for(const c of view.commits.filter(c=>c.stateEvent?.deliveryAfter===source)){const event=view.rows.find(r=>r.id===c.stateEvent.eventId);check(event&&JSON.stringify(event)===JSON.stringify(c.stateEvent.eventSnapshot),'已结算事件已被修改，请核对原回执后再继续叙事');}
 return view.commits.filter(c=>c.stateEvent?.deliveryAfter===source&&c.stateEvent?.access?.readers.includes('读者')).map(c=>({
  eventId:c.stateEvent.eventId,ownerId:c.stateEvent.ownerId,event:c.stateEvent.name,action:c.stateEvent.action,
  instruction:c.stateEvent.narrative,changes:copy(c.stateEvent.diff),growth:copy(c.stateEvent.growth),access:copy(c.stateEvent.access),
  note:'已经保存的事件结算结果。变化是本次结算前后值，不是当前值副本；不得重复执行奖励或代价，不把叙事提示当作新的已发生动作，也不扩大人物知情。'
 }));
}
