import {reconcileProposal} from './reconcile.js';
import {copy,check,object,addTypes,registryIndex,validateRow,validateReferences,normalized,mapRowReferences,references,upgradeRegistry,typeFields} from './schema.js';
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
export function precedingUserSource(chain,source){
 const at=chain.findIndex(item=>item.key===source.key);if(at<0)return null;const selected=[];for(let i=at-1;i>=0&&chain[i].role==='user';i--)selected.unshift(chain[i]);if(!selected.length)return null;return {role:'user',source:selected.at(-1).key,text:selected.map(item=>item.text).join('\n\n'),sources:selected.map(({key,floor,index,text})=>({key,source:key,floor,index,text,role:'user'})),note:'按原顺序保留本 AI 回复前连续用户输入；仅明确的角色设定或已授权心理可入档，动作尝试和未来要求不是已发生结果'};
}
export function memoryBlock(text){return text.match(/<memory(?:\s[^>]*)?>([\s\S]*?)<\/memory>/i)?.[1]?.trim()??'';}
export function taskTags(text){const block=text.match(/<task(?:\s[^>]*)?>([\s\S]*?)<\/task>/i)?.[1]??'';return block.split('\n').map(s=>s.trim()).filter(s=>/^(?:引用|新发现|资料)：/.test(s));}
export function project(origin,session,sourceKeys){
 const registry=upgradeRegistry(session.schemaPinned?session.registry:origin.registry);registryIndex(registry);const allowed=new Set(sourceKeys),rows=new Map((session.branchSeed?.rows??[]).map(r=>[r.id,copy(r)])),anchors=[],accepted=[];const bases=new Map(origin.bases.map(b=>[b.id+'@'+b.rev,b]));
 for(const pin of session.pins??[]){const base=bases.get(pin);check(base,'原点档案版本缺失：'+pin);const row=copy(base);row.access.knowers=[];rows.set(base.id,row);}
 const applied=new Set();
 for(const commit of session.commits){
  if(commit.source!==null&&!allowed.has(commit.source))continue;
  if(commit.depends&&!applied.has(commit.depends))continue;
  for(const change of commit.changes){const row=change.origin?bases.get(change.origin):change.after;check(row,'关联原点版本缺失');rows.set(row.id,copy(row));}
  if(commit.registry)Object.assign(registry,upgradeRegistry(commit.registry));accepted.push(commit);applied.add(commit.id);const times=[...new Set(commit.changes.flatMap(ch=>ch.after?.table==='scene'?[ch.after.values.当前时间]:ch.after?.table==='events'?[ch.after.values.时间]:[]).filter(t=>typeof t==='string'&&t&&commit.anchors.some(a=>a.evidence?.includes(t))))];anchors.push(...commit.anchors.map(a=>a.worldTime===null&&times.length===1?{...a,worldTime:times[0]}:a));
 }
 const values=[...rows.values()];for(const row of values)validateRow(registry,row);validateReferences(values,registry);
 return {registry,baseTime:session.branchSeed?.anchor?.worldTime??null,rows:values,anchors,commits:accepted,archived:new Set([...(session.branchSeed?.archivedSources??[]).filter(s=>allowed.has(s)),...accepted.filter(c=>['archive','history'].includes(c.kind)&&c.complete!==false).map(c=>c.source)]),last:accepted.at(-1)?.id??null,revision:session.revision};
}
export function parseJSONResponse(response){
 if(object(response)&&(Array.isArray(response.changes)||Array.isArray(response.needsRows)||Array.isArray(response.renames)||Array.isArray(response.events)||typeof response.goal==='string'||response.blueprint&&response.artifacts||response.base&&response.initial))return response;
 let text=typeof response==='string'?response:response?.choices?.[0]?.message?.content??response?.content?.filter?.(x=>x.type==='text').map(x=>x.text).join('')??response?.candidates?.[0]?.content?.parts?.map(x=>x.text??'').join('');
 check(typeof text==='string'&&text.trim(),'辅助 API 没有返回文本结果');text=text.trim();if(text.includes('<reply')){const extra=text.match(/<extra(?:\s[^>]*)?>([\s\S]*?)<\/extra>/i)?.[1]??'';const results=[...extra.matchAll(/<tisya_result(?:\s[^>]*)?>([\s\S]*?)<\/tisya_result>/gi)];check(results.length===1,'配套模式回复须在 extra 中提供唯一的 tisya_result');text=results[0][1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&').trim();}if(/^```(?:json)?\s/i.test(text))text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 let result;try{result=JSON.parse(text);}catch{throw Error('辅助 API 返回的不是完整 JSON，未写入表单');}check(object(result),'辅助产物必须是对象');return result;
}
export function prepareCommit(view,proposal,{source,kind='archive',evidence,worldTime=null,allowedTables,sourceOrder={},now=new Date().toISOString()}){
 const limit=['init','genesis'].includes(kind)?2000:200;
 check(object(proposal)&&Array.isArray(proposal.changes)&&proposal.changes.length<=limit,'辅助填表产物缺少 changes 或修改超过 '+limit+' 项');
 check(Array.isArray(proposal.templates??[]),'templates 必须是数组');
 const reconciled=reconcileProposal(view.registry,{...proposal,currentRows:view.rows});proposal=reconciled.proposal;const registry=reconciled.registry,index=registryIndex(registry),rows=new Map(view.rows.map(r=>[r.id,copy(r)])),ids=new Map(),seen=new Set();
 for(const op of proposal.changes){check(object(op)&&typeof op.id==='string'&&op.id&&!seen.has(op.id),'修改 ID 缺失或重复');seen.add(op.id);if(op.id.startsWith('new:'))ids.set(op.id,uuid('row'));}
 const times=[...new Set(proposal.changes.flatMap(op=>op.table==='scene'?[op.values?.当前时间]:op.table==='events'?[op.values?.时间]:[]).filter(t=>typeof t==='string'&&t&&evidence.includes(t)))];if(worldTime===null&&times.length===1)worldTime=times[0];
 const changes=[],anchors=[];const batch=uuid('anchor');
 for(const op of proposal.changes){
  const table=index.tables.get(normalized(op.table));check(table&&(allowedTables.includes(table.id)||table.owner==='archive'&&!view.registry.tables.some(t=>t.id===table.id)),'该辅助任务不能修改此表：'+op.table);
  check(object(op.values)&&object(op.access)&&typeof op.evidence==='string'&&op.evidence.trim()&&evidence.includes(op.evidence),'每项更新需有当前来源中真实存在的连续原文证据');
  const id=ids.get(op.id)??op.id,before=rows.get(id);
  check((before?.rev??0)===op.expected,'记录版本冲突：'+op.id);if(before&&['scene','state','relations','cognition','holdings','tasks','timers','clues','activities','experiences','growth'].includes(table.id)&&sourceOrder[before.source]!==undefined&&sourceOrder[source]!==undefined)check(sourceOrder[before.source]<=sourceOrder[source],'旧楼层不能覆盖更晚的当前状态；请按楼层从早到晚补录，或将这项改为历史事件');check(!before||before.table===table.id,'记录不能迁移到另一张表');check(before||ids.has(op.id),'新记录必须使用 new: 临时 ID');
  check(kind==='manual'||![...Object.keys(op.values),...(op.unset??[])].some(k=>before?.lockedFields?.includes(k)),'更新涉及人工锁定字段，请人工确认：'+before?.values.名称);
  const values=mergeValues(before?.values??{},op.values,table.fields,kind==='manual');if(table.id==='objects'&&op.values.属性&&kind!=='manual'){const type=index.types.get(normalized(values.类型??''));if(type)values.属性=mergeValues(before?.values.属性??{},op.values.属性,typeFields(registry,type.id),false);}check(op.unset===undefined||Array.isArray(op.unset)&&op.unset.every(k=>table.fields[k]&&!table.fields[k].required),'不能清除必填或未知字段');for(const key of op.unset??[])delete values[key];
  if(kind==='import'&&before&&['scene','state','relations','cognition','holdings','tasks','timers','clues','activities','experiences','growth'].includes(table.id)&&JSON.stringify(values)!==JSON.stringify(before.values)){
   const prior=(view.anchors??[]).findLast(a=>a.row===before.id),current=calendarTime(prior?.worldTime),incoming=calendarTime(worldTime);
   check(current!==null&&incoming!==null&&incoming>=current,'手写历史缺少可核实的较晚时间，不能覆盖已有当前状态；请保留为历史事件或人工核对');
  }
  if(table.id==='objects'){const type=index.types.get(normalized(values.类型));check(type,'类型未登记：'+values.类型);values.类型=type.id;}
  mapRowReferences({table:table.id,values},registry,id=>ids.get(id)??id);
  if(table.id==='preferences'){
   check(kind==='preferences'||kind==='manual','偏好只能由偏好任务或人工修改');
   check(values.性质!=='推测偏好'||values.强度!=='必须','推测偏好不能升级为硬性要求');
  }
  if(['state','holdings'].includes(table.id)&&values.原生引用)check(!Object.hasOwn(op.values,'值')&&!Object.hasOwn(op.values,'数量')&&!Object.hasOwn(op.values,'值引用'),'原生变量由宿主执行，表单只保存引用');
  const row={id,table:table.id,rev:(before?.rev??0)+1,values,access:{readers:op.access.readers.map(x=>ids.get(x)??x),knowers:op.access.knowers.map(x=>ids.get(x)??x)},source,lockedFields:kind==='manual'?[...new Set([...(before?.lockedFields??[]),...Object.keys(op.values),...(op.unset??[])])]:before?.lockedFields??[],updatedAt:now};validateRow(registry,row);rows.set(id,row);
  changes.push({id,before:before?copy(before):null,after:row});anchors.push({id:uuid('change'),group:batch,source,worldTime,recordedAt:now,row:id,table:table.id,before:before?.values??null,after:copy(values),evidence:op.evidence});
 }
 for(const row of rows.values())validateRow(registry,row);validateReferences([...rows.values()],registry);
 const business=new Set();for(const row of rows.values()){let key;if(row.table==='state')key=JSON.stringify([row.table,row.values.对象,row.values.字段]);if(row.table==='scene')key='scene';if(row.table==='native_cells')key=JSON.stringify([row.table,row.values.路径]);if(row.table==='growth')key=JSON.stringify([row.table,row.values.主体,row.values.方面]);if(row.table==='experiences')key=JSON.stringify([row.table,row.values.主体,row.values.相关对象??[],row.values.类别,row.values.情境,row.values.名称]);if(key){check(!business.has(key),'当前状态重复，请更新已有行：'+row.values.名称);business.add(key);}}
 // Ambiguous names cannot become an accidental alias-based merge.
 const names=new Map();for(const row of rows.values())if(row.table==='objects')for(const name of [row.values.名称]){const key=normalized(name);if(names.has(key)&&names.get(key)!==row.id)throw Error('对象显示名称冲突：'+name+'；请在名称中区分身份');names.set(key,row.id);}
 return {registry,extensions:reconciled.extensions,commit:{id:uuid('commit'),kind,source,depends:view.last,at:now,changes,anchors,...(JSON.stringify(registry)!==JSON.stringify(view.registry)?{registry}:{}),complete:!(proposal.pending?.length),pending:proposal.pending??[]},rows:[...rows.values()]};
}
export function retrieval(view,{tags=[],query='',topK=8}={}){
 const byId=new Map(view.rows.map(r=>[r.id,r])),mandatory=new Set();
 for(const row of view.rows){const names=[row.values.名称,...(row.values.别名??[])];if(row.table!=='preferences'&&names.some(n=>tags.some(tag=>tag.includes(n))))mandatory.add(row.id);if(['scene','state','tasks','timers','clues','preferences'].includes(row.table)&&!(row.table==='state'&&row.values.有效性==='失效'))mandatory.add(row.id);}
 for(const row of view.rows)if(row.table!=='events'&&references(row,view.registry).some(id=>mandatory.has(id)))mandatory.add(row.id);
 const queue=[...mandatory];for(let i=0;i<queue.length;i++)for(const ref of references(byId.get(queue[i]),view.registry))if(byId.has(ref)&&!mandatory.has(ref)){mandatory.add(ref);queue.push(ref);}
 const segments=query.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu)??[];const words=[...new Set(segments.flatMap(w=>/[\p{Script=Han}]/u.test(w)?Array.from({length:w.length-1},(_,i)=>w.slice(i,i+2)):[w]))];
 const scored=view.rows.filter(r=>!mandatory.has(r.id)&&r.table!=='preferences').map(row=>{const content=JSON.stringify(row.values).toLocaleLowerCase();return {row,score:words.reduce((s,w)=>s+(content.includes(w)?1:0),0)};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
 return {mandatory:[...mandatory].map(id=>byId.get(id)),optional:scored.slice(0,topK).map(x=>x.row),unresolved:tags.filter(tag=>!view.rows.some(r=>r.table==='objects'&&tag.includes(r.values.名称)))};
}

export function sourceTime(text){
 const title=text.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]??'';
 // Accept only an explicit canonical date/time cell; unknown eras stay unknown.
 const match=title.match(/^\s*场景：[^\n]*?\|\s*"?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)"?\s*\|/m);
 return match?.[1]??null;
}
// Compare explicit Gregorian story dates only; never borrow the host date/timezone.
export function calendarTime(text){
 if(typeof text!=='string')return null;
 const m=text.trim().match(/^(\d{4})(?:-(\d{1,2})-(\d{1,2})|年(\d{1,2})月(\d{1,2})日)[ T]?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/);
 if(!m)return null;const [year,month,day,hour,minute,second]=[m[1],m[2]??m[4],m[3]??m[5],m[6],m[7],m[8]??0].map(Number),millisecond=Number((m[9]??'').padEnd(3,'0'));
 if(month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return null;
 // setUTCFullYear avoids Date.UTC's special interpretation of years 00–99.
 const date=new Date(0);date.setUTCFullYear(year,month-1,day);date.setUTCHours(hour,minute,second,millisecond);
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 let offset=0;if(m[10]&&m[10]!=='Z'){const hours=Number(m[10].slice(1,3)),minutes=Number(m[10].slice(4));if(hours>23||minutes>59)return null;offset=(hours*60+minutes)*(m[10][0]==='-'?-1:1);}
 return date.getTime()-offset*60000;
}
export function dueChecks(view,chain){
 const scenes=view.rows.filter(r=>r.table==='scene'),times=scenes.map(r=>r.values.当前时间).filter(t=>typeof t==='string'),turns=chain.filter(s=>s.role==='assistant').length;
 return view.rows.filter(r=>r.table==='timers'&&!['完成','取消'].includes(r.values.状态)).map(row=>{
  const value=row.values;let due=null,basis='缺少可比较的时间依据';
  if(value.时间基准==='轮'&&Number.isSafeInteger(value.到期轮次)){due=turns>=value.到期轮次;basis='已保留 AI 楼层数 '+turns;}
  else if(times.length===1){const now=calendarTime(times[0]),end=calendarTime(value.到期时间);if(now!==null&&end!==null){due=now>=end;basis='唯一当前场景时间 '+times[0];}}
  return {id:row.id,name:value.名称,due,basis,condition:value.触发条件??null,note:'到期只供检查触发条件，不代表事件已发生或任务完成'};
 });
}

export function archivalText(text){
 text=String(text??'');const body=text.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i);let prose=body?body[1]:text;
 const auxiliary=/<(task|next|status|memory|vars|extra|actions|archive|title|think|thinking|analysis|UpdateVariable|JSONPatch)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi;
 // Nested control blocks can appear inside a body as well; neither path may
 // turn old summaries, task labels or native commands into narrative evidence.
 let prior;do{prior=prose;prose=prose.replace(auxiliary,'');}while(prior!==prose);
 return prose.replace(/<\/?reply(?:\s[^>]*)?>/gi,'').trim();
}
// Handwritten history can contain several complete replies plus user prose
// between them. Preserve all body segments; the single-reply reader above is
// deliberately not applied to the entire concatenation.
export function historyEvidence(text){
 let prose=String(text??''),prior;
 const auxiliary=/<(task|next|status|memory|vars|extra|actions|archive|title|think|thinking|analysis|UpdateVariable|JSONPatch)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi;
 do{prior=prose;prose=prose.replace(auxiliary,'');}while(prior!==prose);
 return prose.replace(/<\/?(?:reply|body)(?:\s[^>]*)?>/gi,'').trim();
}
// A bad independent record must not discard valid records or mark the floor complete.
export function prepareRecoverable(view,proposal,options){
 try{return prepareCommit(view,proposal,options);}catch(first){
  check(Array.isArray(proposal?.changes),'辅助填表产物缺少 changes');
  const groups=proposal.changes.map(op=>[op]);const linked=(a,b)=>a.some(x=>b.some(y=>JSON.stringify(x.values).includes(JSON.stringify(y.id))||JSON.stringify(y.values).includes(JSON.stringify(x.id))));
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;)if(linked(groups[i],groups[j])){groups[i].push(...groups.splice(j,1)[0]);i=-1;break;}else j++;
  const accepted=[],pending=[...(proposal.pending??[])];
  for(const group of groups){try{prepareCommit(view,{...proposal,changes:[...accepted,...group]},options);accepted.push(...group);}catch(e){pending.push({ids:group.map(x=>x.id),reason:e.message,proposals:copy(group)});}}
  let result;try{result=prepareCommit(view,{...proposal,changes:accepted,pending},options);}catch(e){result=prepareCommit(view,{changes:[],pending:[...pending,{reason:e.message,proposal:copy(proposal)}]},options);}
  result.commit.complete=false;result.commit.diagnostic=first.message;return result;
 }
}

function mergeValues(before,patch,fields,replace){const out=copy(before);for(const [k,v]of Object.entries(patch)){const def=fields[k];out[k]=!replace&&object(v)&&object(before[k])&&['object','map'].includes(def?.type)?mergeValues(before[k],v,def.type==='map'?Object.fromEntries(Object.keys(v).map(key=>[key,def.items])):def.fields??{},false):copy(v);}return out;}
