import {copy,check,object,addTypes,registryIndex,validateRow,validateReferences,normalized} from './schema.js';
import {digest,uuid} from './books.js';
export function selectedMessages(chat,type='normal'){
 const result=chat.filter(m=>!m.is_system&&m.role!=='tool');
 if(type==='swipe'&&!result.at(-1)?.is_user)result.pop();
 return result;
}
export async function sources(chat,type='normal'){
 let parent='';const out=[];
 for(const [index,message] of selectedMessages(chat,type).entries()){
  const text=String(message.mes??'');const identity={role:message.is_user?'user':'assistant',name:message.name??'',text,candidate:message.swipe_id??0};
  const key=await digest([parent,identity]);out.push({key,parent,index,floor:chat.indexOf(message)+1,...identity});parent=key;
 }
 return out;
}
export function memoryBlock(text){return text.match(/<memory(?:\s[^>]*)?>([\s\S]*?)<\/memory>/i)?.[1]?.trim()??'';}
export function taskTags(text){const block=text.match(/<task(?:\s[^>]*)?>([\s\S]*?)<\/task>/i)?.[1]??'';return block.split('\n').map(s=>s.trim()).filter(s=>/^(?:引用|新发现|资料)：/.test(s));}
export function project(origin,session,sourceKeys){
 registryIndex(origin.registry);const allowed=new Set(sourceKeys),rows=new Map(),anchors=[],accepted=[];const bases=new Map(origin.bases.map(b=>[b.id+'@'+b.rev,b]));
 for(const pin of session.pins??[]){const base=bases.get(pin);check(base,'原点档案版本缺失：'+pin);rows.set(base.id,copy(base));}
 const applied=new Set();
 for(const commit of session.commits){
  if(commit.source!==null&&!allowed.has(commit.source))continue;
  if(commit.depends&&!applied.has(commit.depends))continue;
  for(const change of commit.changes){const row=change.origin?bases.get(change.origin):change.after;check(row,'关联原点版本缺失');rows.set(row.id,copy(row));}
  accepted.push(commit);applied.add(commit.id);anchors.push(...commit.anchors);
 }
 const values=[...rows.values()];for(const row of values)validateRow(origin.registry,row);validateReferences(values,origin.registry);
 return {registry:copy(origin.registry),rows:values,anchors,commits:accepted,archived:new Set(accepted.filter(c=>['archive','history'].includes(c.kind)).map(c=>c.source)),last:accepted.at(-1)?.id??null,revision:session.revision};
}
export function parseJSONResponse(response){
 if(object(response)&&(Array.isArray(response.changes)||typeof response.goal==='string'))return response;
 let text=typeof response==='string'?response:response?.choices?.[0]?.message?.content??response?.content?.filter?.(x=>x.type==='text').map(x=>x.text).join('')??response?.candidates?.[0]?.content?.parts?.map(x=>x.text??'').join('');
 check(typeof text==='string'&&text.trim(),'辅助 API 没有返回文本结果');text=text.trim();if(/^```(?:json)?\s/i.test(text))text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 let result;try{result=JSON.parse(text);}catch{throw Error('辅助 API 返回的不是完整 JSON，未写入表单');}check(object(result),'辅助产物必须是对象');return result;
}
export function prepareCommit(view,proposal,{source,kind='archive',evidence,worldTime=null,allowedTables,sourceOrder={},now=new Date().toISOString()}){
 check(object(proposal)&&Array.isArray(proposal.changes)&&proposal.changes.length<=200,'辅助填表产物缺少 changes 或修改过多');
 check(Array.isArray(proposal.templates??[]),'templates 必须是数组');
 const registry=addTypes(view.registry,proposal.templates??[]),index=registryIndex(registry),rows=new Map(view.rows.map(r=>[r.id,copy(r)])),ids=new Map(),seen=new Set();
 for(const op of proposal.changes){check(object(op)&&typeof op.id==='string'&&op.id&&!seen.has(op.id),'修改 ID 缺失或重复');seen.add(op.id);if(op.id.startsWith('new:'))ids.set(op.id,uuid('row'));}
 const changes=[],anchors=[];const batch=uuid('anchor');
 for(const op of proposal.changes){
  const table=index.tables.get(normalized(op.table));check(table&&allowedTables.includes(table.id),'该辅助任务不能修改此表：'+op.table);
  check(object(op.values)&&object(op.access)&&typeof op.evidence==='string'&&op.evidence.trim()&&evidence.includes(op.evidence),'每项更新需有当前来源中真实存在的连续原文证据');
  const id=ids.get(op.id)??op.id,before=rows.get(id);
  check((before?.rev??0)===op.expected,'记录版本冲突：'+op.id);if(before&&['scene','state','relations','cognition','holdings','tasks','timers','clues'].includes(table.id)&&sourceOrder[before.source]!==undefined&&sourceOrder[source]!==undefined)check(sourceOrder[before.source]<=sourceOrder[source],'旧楼层不能覆盖更晚的当前状态；请按楼层从早到晚补录，或将这项改为历史事件');check(!before||before.table===table.id,'记录不能迁移到另一张表');check(before||ids.has(op.id),'新记录必须使用 new: 临时 ID');
  check(kind==='manual'||!Object.keys(op.values).some(k=>before?.lockedFields?.includes(k)),'更新涉及人工锁定字段，请人工确认：'+before?.values.名称);
  const values={...(before?.values??{}),...copy(op.values)};check(op.unset===undefined||Array.isArray(op.unset)&&op.unset.every(k=>table.fields[k]&&!table.fields[k].required),'不能清除必填或未知字段');for(const key of op.unset??[])delete values[key];
  for(const [key,def]of Object.entries(table.fields))if(Object.hasOwn(values,key)){if(def.type==='ref')values[key]=ids.get(values[key])??values[key];else if(def.type==='refs')values[key]=values[key].map(x=>ids.get(x)??x);}
  if(table.id==='objects'){const type=index.types.get(normalized(values.类型));check(type,'类型未登记：'+values.类型);values.类型=type.id;}
  if(table.id==='preferences'){
   check(kind==='preferences'||kind==='manual','偏好只能由偏好任务或人工修改');
   check(values.性质!=='推测偏好'||values.强度!=='必须','推测偏好不能升级为硬性要求');
  }
  if(table.id==='events'&&kind==='archive'&&Object.hasOwn(op.values,'经过')){const summary=memoryBlock(evidence);check(summary&&summary.includes(op.values.经过),'历史经过只能使用本回复记忆块原文；缺少记忆时不另造总结');}
  if(['state','holdings'].includes(table.id)&&values.原生引用)check(!Object.hasOwn(op.values,'值')&&!Object.hasOwn(op.values,'数量'),'原生变量由宿主执行，表单只保存引用');
  const row={id,table:table.id,rev:(before?.rev??0)+1,values,access:copy(op.access),source,lockedFields:kind==='manual'?[...new Set([...(before?.lockedFields??[]),...Object.keys(op.values),...(op.unset??[])])]:before?.lockedFields??[],updatedAt:now};validateRow(registry,row);rows.set(id,row);
  changes.push({id,before:before?copy(before):null,after:row});anchors.push({id:uuid('change'),group:batch,source,worldTime,recordedAt:now,row:id,table:table.id,before:before?.values??null,after:copy(values),evidence:op.evidence});
 }
 validateReferences([...rows.values()],registry);
 // Ambiguous names cannot become an accidental alias-based merge.
 const names=new Map();for(const row of rows.values())if(row.table==='objects')for(const name of [row.values.名称,...(row.values.别名??[])]){const key=normalized(name);if(names.has(key)&&names.get(key)!==row.id)throw Error('对象名称／别名冲突：'+name+'；请在名称中区分身份');names.set(key,row.id);}
 return {registry,commit:{id:uuid('commit'),kind,source,depends:view.last,at:now,changes,anchors},rows:[...rows.values()]};
}
export function retrieval(view,{tags=[],query='',topK=8}={}){
 const byId=new Map(view.rows.map(r=>[r.id,r])),mandatory=new Set();
 for(const row of view.rows){const names=[row.values.名称,...(row.values.别名??[])];if(row.table==='objects'&&names.some(n=>tags.some(tag=>tag.includes(n))))mandatory.add(row.id);if(['scene','state','tasks','timers','clues','preferences'].includes(row.table))mandatory.add(row.id);}
 for(const row of view.rows){const table=view.registry.tables.find(t=>t.id===row.table);const refs=Object.entries(row.values).flatMap(([k,v])=>table.fields[k]?.type==='ref'?[v]:table.fields[k]?.type==='refs'?v:[]);if(refs.some(id=>mandatory.has(id)))mandatory.add(row.id);}
 for(const id of [...mandatory]){const row=byId.get(id),table=view.registry.tables.find(t=>t.id===row.table);for(const [k,d]of Object.entries(table.fields)){const refs=d.type==='ref'?[row.values[k]]:d.type==='refs'?row.values[k]??[]:[];for(const ref of refs)if(byId.has(ref))mandatory.add(ref);}}
 const segments=query.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[];const words=[...new Set(segments.flatMap(w=>/[\p{Script=Han}]/u.test(w)?Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2)):[w]))];
 const scored=view.rows.filter(r=>!mandatory.has(r.id)&&['events','objects','facts'].includes(r.table)).map(row=>{const content=JSON.stringify(row.values).toLocaleLowerCase();return {row,score:words.reduce((s,w)=>s+(content.includes(w)?1:0),0)};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
 return {mandatory:[...mandatory].map(id=>byId.get(id)),optional:scored.slice(0,topK).map(x=>x.row),unresolved:tags.filter(tag=>!view.rows.some(r=>r.table==='objects'&&tag.includes(r.values.名称)))};
}

export function sourceTime(text){
 const title=text.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]??'';
 // Accept only an explicit canonical date/time cell; unknown eras stay unknown.
 const match=title.match(/^\s*场景：[^\n]*?\|\s*"?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)"?\s*\|/m);
 return match?.[1]??null;
}
export function dueChecks(view,chain){
 const scenes=view.rows.filter(r=>r.table==='scene'),times=scenes.map(r=>r.values.当前时间).filter(t=>typeof t==='string'),turns=chain.filter(s=>s.role==='assistant').length;
 return view.rows.filter(r=>r.table==='timers'&&!['完成','取消'].includes(r.values.状态)).map(row=>{
  const value=row.values;let due=null,basis='缺少可比较的时间依据';
  if(value.时间基准==='轮'&&Number.isSafeInteger(value.到期轮次)){due=turns>=value.到期轮次;basis='已保留 AI 楼层数 '+turns;}
  else if(value.到期时间&&times.length===1&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value.到期时间)&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(times[0])){due=times[0]>=value.到期时间;basis='唯一当前场景时间 '+times[0];}
  return {id:row.id,name:value.名称,due,basis,condition:value.触发条件??null,note:'到期只供检查触发条件，不代表事件已发生或任务完成'};
 });
}
