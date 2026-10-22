import {archiveLayer} from './archive-book.js';
import {typeFields,isObjectType} from './schema.js';

// A read-only rendering of already selected/condition-projected records. It
// never expands references, changes permissions or reads an omitted record.
export function storyValue(value,{definition=null,names=new Map(),depth=0}={}){
 if(value===undefined)return '未知';
 if(value===null)return '未设定';
 if(definition?.type==='ref')return names.get(value)??'未提供的关联对象';
 if(definition?.type==='refs')return value.map(v=>names.get(v)??'未提供的关联对象').join('、')||'无';
 if(typeof value==='boolean')return value?'是':'否';
 if(typeof value!=='object')return String(value);
 if(depth>64)throw Error('资料层字段超过可展开深度');
 if(Array.isArray(value))return value.length?value.map((v,i)=>`${i+1}. ${storyValue(v,{definition:definition?.items,names,depth:depth+1})}`).join('\n'):'无';
 const parts=Object.entries(value).filter(([key])=>key!=='原生引用').map(([key,v])=>`${key}：${storyValue(v,{definition:definition?.fields?.[key]??definition?.items,names,depth:depth+1})}`);
 return parts.length?parts.join('\n'):'无';
}
export function storyRecord(row,{rows=[row],registry={tables:[],types:[]}}={}){
 const names=new Map(rows.map(r=>[r.id,r.values?.名称??'未命名对象']));
 const table=registry.tables.find(t=>t.id===row.table),fields=table?.fields??{};
 const parts=[row.values?.名称??table?.name??'资料'];
 for(const [key,value]of Object.entries(row.values??{})){
  if(key==='名称'||key==='原生引用')continue;
  if(key==='类型'){parts.push('类型：'+(registry.types?.find(t=>t.id===value)?.name??value));continue;}
  const definition=row.table==='objects'&&key==='属性'?{type:'object',fields:typeFields(registry,row.values.类型)}:fields[key];
  const content=storyValue(value,{definition,names});
  if(key==='属性'&&value&&typeof value==='object'&&!Array.isArray(value))parts.push(content);
  else parts.push(key+'：'+content);
 }
 if(row.referenceOnly)parts.push('这里只提供身份称呼，未提供其他资料。');
 // Keep story knowledge restrictions readable without leaking storage IDs.
 if(row.access){
  const labels=values=>values.map(v=>names.get(v)??(['读者','reader','public','公开'].includes(v)?'读者': '未在场的指定对象')).join('、');
  parts.push('读者可见范围：'+(labels(row.access.readers??[])||'不向读者展示'));
  parts.push('已知情人物：'+(labels(row.access.knowers??[])||'没有已确认知情人物'));
 }
 return parts.join('\n');
}
const block=(label,items)=>items.length?`<${label}>\n${items.join('\n\n')}\n</${label}>`:'';
export function storyMaterial({rows=[],selectedRows=rows,registry={tables:[],types:[]},userId=null,focusObjects=[],due=[],plot=null,latestTemporary=null}={}){
 const groups={user:[],关注人物:[],当前叙事待办:[],在场其他人物:[],静态图鉴:[],当前快照:[],历史事件:[]};
 const present=new Set(rows.filter(r=>r.table==='scene').flatMap(r=>r.values.参与者??[])),focus=new Set(focusObjects),dueIds=new Set(due.filter(x=>x.due===true).map(x=>x.id));
 for(const row of selectedRows){
  if(row.table==='preferences'||row.table==='native_cells')continue;
  const character=row.table==='objects'&&isObjectType(registry,row,'character');
  const group=row.id===userId||row.nativePersona?'user':character&&focus.has(row.id)?'关注人物':character&&present.has(row.id)?'在场其他人物':['tasks','timers'].includes(row.table)||dueIds.has(row.id)?'当前叙事待办':archiveLayer(row.table,registry)==='memory'?'历史事件':archiveLayer(row.table,registry)==='static'?'静态图鉴':'当前快照';
  groups[group].push(storyRecord(row,{rows,registry}));
 }
 if(plot){const parts=[];if(plot.goal)parts.push('本轮叙事目标：'+plot.goal);for(const beat of plot.beats??[])parts.push('可采用的进展：'+beat.proposal+'\n成立条件：'+beat.condition);for(const v of plot.pendingChoices??[])parts.push('留给用户的选择：'+v);for(const v of plot.constraints??[])parts.push('限制：'+v);if(parts.length)groups.当前叙事待办.push('以下为尚未发生的候选，不作为历史事实。\n'+parts.join('\n'));}
 const content=Object.entries(groups).map(([name,items])=>block(name,items)).filter(Boolean);
 if(latestTemporary?.text)content.push(block('最新接续原文',['以下内容尚未确认归档，仅用于接续当前候选。\n'+latestTemporary.text]));
 return content.length?'<资料层开始>\n'+content.join('\n\n')+'\n<资料层结束>':'';
}
export function storyPreferences({explicit='',style='',rows=[]}={}){
 const confirmed=rows.filter(row=>row.preferenceConfirmed===true&&row.values?.启用!==false);
 const parts=[];if(explicit)parts.push('用户明确要求：\n'+explicit);if(style)parts.push('写作要求：\n'+style);
 for(const row of confirmed)parts.push(storyRecord({...row,access:null},{rows:confirmed}));
 if(!parts.length)return '';
 return '<用户偏好>\n'+parts.join('\n\n')+'\n本次明确要求优先于相冲突的长期偏好；角色台词不是用户偏好。临时判断只用于本次表达，未经确认不升级为长期要求。\n</用户偏好>';
}
export function storyContext({rulePolicy=null,nativeState=null,eventResults=[],conditionResults=[]}={},rows=[]){
 const parts=[];
 const changes=(rulePolicy?.decisions??[]).filter(d=>d.action==='optimize').flatMap(d=>d.changes??[]);
 if(changes.length)parts.push(block('当前规则',changes.map(c=>c.after)));
 if(nativeState){
  if(nativeState.available){
   const labels=new Map();const walk=(value,label)=>{if(!value||typeof value!=='object')return;if(typeof value.原生引用==='string')labels.set(value.原生引用,label);for(const [key,v]of Object.entries(value))walk(v,key);};
   for(const row of rows)walk(row.values,row.values.名称??'状态');
   parts.push(block('当前已确认状态',(nativeState.values??[]).map(v=>(labels.get(v.path)??v.path.split(/[/.]/).filter(Boolean).at(-1)??'状态')+'：'+storyValue(v.value))));
  }else parts.push('<状态缺口>当前尚无对应时刻的可靠状态，不据此虚构数值或结算结果。</状态缺口>');
  if(nativeState.missing?.length)parts.push('部分状态尚未提供，保持未知。');
 }
 const names=new Map(rows.map(r=>[r.id,r.values?.名称??'未命名对象']));
 const knowledge=r=>r.access&&'已知情人物：'+((r.access.knowers??[]).map(id=>names.get(id)??'指定对象').join('、')||'没有已确认知情人物');
 const results=[...eventResults.map(r=>[r.event&&'事件：'+r.event,r.ownerId&&'对应人物：'+(names.get(r.ownerId)??'指定对象'),r.instruction,...(r.changes??[]).map(d=>(d.name??'状态')+'：'+storyValue(d.before)+' → '+storyValue(d.after)),...(r.growth??[]).map(g=>'成长变化：'+storyValue(g)),knowledge(r)].filter(Boolean).join('\n')),...conditionResults.map(r=>[r.text??r.narrative??r.summary,knowledge(r)].filter(Boolean).join('\n'))].filter(x=>typeof x==='string'&&x.trim());
 if(results.length)parts.push(block('已确认变化',['以下结果已经结算，仅叙述已有变化，不重复执行或扩大知情。',...results]));
 return parts.filter(Boolean).join('\n\n');
}
export function storyBlueprint(value){
 if(!value)return '';
 return block('世界设定依据',[value.name&&'世界：'+value.name,value.goal&&'设计目标：'+value.goal,value.decisions?.length&&'已选设定：\n'+storyValue(value.decisions),value.unresolved?.length&&'尚未确定：\n'+storyValue(value.unresolved)].filter(Boolean));
}
