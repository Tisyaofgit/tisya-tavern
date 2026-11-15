// Pure history backfill plan/review reducer. Persistence is an injected owner;
// no historical action, cost, award or clock operation is executed here.
import {clone,digest} from './common.mjs';
import {selectedMessages,sourceVersion,historyBody} from './history-layers.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
export const backfillAddress=item=>[item.channel,item.table,item.key].join('|');
export const backfillReceiptKey=(scope,message,item)=>digest({scope,source:message.id,version:sourceVersion(message),address:backfillAddress(item)});
function fieldsFor(catalog,world,table){return [...(catalog.find(t=>t.id===table)?.fields??[]),...(world.custom??[]).filter(f=>f.table===table)];}
export function backfillSelection(catalog,world,policy){
 const items=[];
 for(const [table,channels]of Object.entries(policy??{}))for(const channel of ['cells','archive'])for(const key of channels[channel]??[]){
  const t=catalog.find(t=>t.id===table),field=fieldsFor(catalog,world,table).find(f=>f.key===key);
  check(t&&!t.program&&field&&!field.readonly,'补录不能填写系统字段或未登记字段：'+table+'.'+key);
  items.push({table,key,channel,label:world.labels?.[table+'|'+key]??field.label,type:field.type});
 }
 check(items.length>0,'先勾选要补录的cells／归档表或字段。');
 check(new Set(items.map(backfillAddress)).size===items.length,'补录字段重复。');return items;
}
export function prepareBackfill({messages,scope,catalog,world,policy,from=1,to=Number.MAX_SAFE_INTEGER,receipts=[]}){
 check(Number.isSafeInteger(from)&&from>=1&&Number.isSafeInteger(to)&&to>=from,'补录楼层范围无效。');
 const selection=backfillSelection(catalog,world,policy),rows=selectedMessages(messages,scope),sources=rows.filter(m=>m.role==='assistant'&&m.floor>=from&&m.floor<=to),done=new Set(receipts.map(r=>r.coverageKey??r.key)),floors=[];
 check(sources.length,'所选范围没有char回复。');
 for(const source of sources){
  const prior=receipts.filter(r=>r.scope===scope&&r.messageId===source.id);
  check(prior.every(r=>r.version===sourceVersion(source)),'第'+source.floor+'层已补录来源发生变化，请先核对旧记录。');
  const selected=selection.filter(item=>!done.has(backfillReceiptKey(scope,source,item)));
  let body='',error='';try{body=historyBody(source.text);}catch(e){error=e.message;}
  floors.push({id:source.id,floor:source.floor,source:clone(source),version:sourceVersion(source),body,selection:selected,values:[],reviewed:false,status:!selected.length?'skipped':error?'blocked':'pending',error});
 }
 return {format:'tisya.history-backfill/1',id:digest({scope,from,to,selection,sources:sources.map(sourceVersion)}),scope,range:{from,to},policy:clone(policy),selection,sourceSignature:digest(rows),floors};
}
export function fillBackfillFloor(batch,id,values){
 const next=clone(batch),floor=next.floors.find(f=>f.id===id);check(floor&&floor.status==='pending','该楼层不可重复生成或来源待修。');
 check(Array.isArray(values),'补录候选缺少逐字段结果。');
 const selected=new Set(floor.selection.map(backfillAddress));
 check(new Set(values.map(backfillAddress)).size===selected.size&&new Set(values.map(v=>backfillAddress(v)+'|'+(v.recordId??'*'))).size===values.length&&values.every(v=>selected.has(backfillAddress(v))),'补录结果必须覆盖且仅覆盖所选字段。');
 floor.values=clone(values);floor.status='ready';floor.reviewed=false;return next;
}
export function confirmBackfillFloor({batch,id,messages,receipts=[],catalog,world,validateValue}){
 const floor=batch.floors.find(f=>f.id===id);check(floor&&floor.status==='ready'&&floor.reviewed===true,'请先核对本层所有候选，再确认补录。');
 const rows=selectedMessages(messages,batch.scope);check(digest(rows)===batch.sourceSignature,'历史消息或候选在核对后已变化，未保存旧草稿。');
 const current=rows.find(m=>m.id===id);check(current&&sourceVersion(current)===floor.version,'补录来源已经改变。');
 check(sourceVersion(floor.source)===sourceVersion(current)&&floor.floor===current.floor&&floor.body===historyBody(current.text),'候选中的来源副本已变化，请从原始消息重新生成。');
 const allowed=new Set(backfillSelection(catalog,world,batch.policy).map(backfillAddress));
 check(floor.selection.every(item=>allowed.has(backfillAddress(item))),'所选字段或权限已经变化，请重新核对。');
 const keys=new Set(receipts.map(r=>r.key)),covered=new Set(receipts.map(r=>r.coverageKey??r.key)),selected=new Set(floor.selection.map(backfillAddress));
 check(new Set(floor.values.map(backfillAddress)).size===selected.size&&new Set(floor.values.map(v=>backfillAddress(v)+'|'+(v.recordId??'*'))).size===floor.values.length,'补录候选存在缺项或重复项。');
 const additions=floor.values.map(item=>{
  check(selected.has(backfillAddress(item)),'补录不能写入未勾选字段。');
  const field=fieldsFor(catalog,world,item.table).find(f=>f.key===item.key);check(field&&!field.readonly,'字段已删除或变为只读，请重新核对。');
  check(['known','unknown','none','not_involved'].includes(item.state),'请明确填写状态。');
  check(typeof item.response==='string'&&item.response.trim(),'每个补录字段都需要明确回应。');
  if(item.state==='known'){check(item.recordId&&item.recordName,'已知事实须指定所属记录。');check(typeof item.evidence==='string'&&item.evidence&&floor.body.includes(item.evidence),'已知事实需要能定位到本层正文的原文依据。');}
  const parsed=item.state==='known'?validateValue({state:'known',value:item.value},field):{state:item.state,value:null};
  const coverageKey=backfillReceiptKey(batch.scope,current,item),key=digest({coverageKey,recordId:item.recordId??'*'});check(!covered.has(coverageKey)&&!keys.has(key),'该字段已确认补录，未重复写入。');keys.add(key);
  return {...clone(item),...parsed,fieldKey:item.key,key,coverageKey,scope:batch.scope,messageId:id,version:floor.version,floor:floor.floor,status:'confirmed',source:{messageId:id,version:floor.version},historical:true};
 });
 const next=clone(batch);next.floors.find(f=>f.id===id).status='confirmed';
 return {batch:next,receipts:[...clone(receipts),...additions],added:additions.length,currentStateWrites:0};
}
