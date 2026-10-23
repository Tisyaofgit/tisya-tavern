import {archiveLayer} from './archive-book.js';
import {typeFields,isObjectType} from './schema.js';

// A read-only rendering of already selected/condition-projected records. It
// never expands references, changes permissions or reads an omitted record.
export function storyValue(value,{definition=null,names=new Map(),depth=0,preserveEmptyTypes=false}={}){
 if(value===undefined)return '未知';
 if(value===null)return preserveEmptyTypes?'明确空值':'未设定';
 if(value==='')return preserveEmptyTypes?'空文本':'';
 if(definition?.type==='ref')return names.get(value)??'未提供的关联对象';
 if(definition?.type==='refs')return value.map(v=>names.get(v)??'未提供的关联对象').join('、')||(preserveEmptyTypes?'空列表':'无');
 if(typeof value==='boolean')return value?'是':'否';
 if(typeof value!=='object')return String(value);
 if(depth>64)throw Error('资料层字段超过可展开深度');
 if(Array.isArray(value))return value.length?value.map((v,i)=>`${i+1}. ${storyValue(v,{definition:definition?.items,names,depth:depth+1,preserveEmptyTypes})}`).join('\n'):(preserveEmptyTypes?'空列表':'无');
 const parts=Object.entries(value).filter(([key])=>key!=='原生引用').map(([key,v])=>`${key}：${storyValue(v,{definition:definition?.fields?.[key]??definition?.items,names,depth:depth+1,preserveEmptyTypes})}`);
 return parts.length?parts.join('\n'):(preserveEmptyTypes?'空对象':'无');
}
export function storyRecord(row,{rows=[row],registry={tables:[],types:[]},preserveEmptyTypes=false}={}){
 const names=new Map(rows.map(r=>[r.id,r.values?.名称??'未命名对象']));
 const table=registry.tables.find(t=>t.id===row.table),fields=table?.fields??{};
 const parts=[row.values?.名称??table?.name??'资料'];
 for(const [key,value]of Object.entries(row.values??{})){
  if(key==='名称'||key==='原生引用')continue;
  if(key==='类型'){parts.push('类型：'+(registry.types?.find(t=>t.id===value)?.name??value));continue;}
  const definition=row.table==='objects'&&key==='属性'?{type:'object',fields:typeFields(registry,row.values.类型)}:fields[key];
  const content=storyValue(value,{definition,names,preserveEmptyTypes});
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
function storyPlan(plot){
 if(!plot)return '';
 const parts=[];if(plot.goal)parts.push('本轮叙事目标：'+plot.goal);
 for(const beat of plot.beats??[])parts.push('可采用的进展：'+beat.proposal+'\n成立条件：'+beat.condition);
 for(const [field,label]of [['pendingChoices','留给用户的选择'],['due','待检查的到期事项'],['clues','可延展线索'],['constraints','限制']])for(const value of plot[field]??[])parts.push(label+'：'+value);
 return parts.length?'以下为尚未发生的候选，不作为历史事实。到期与线索不代表已经触发或人物已经知情。\n'+parts.join('\n'):'';
}
export function storyMaterial({rows=[],selectedRows=rows,registry={tables:[],types:[]},userId=null,focusObjects=[],due=[],plot=null,latestTemporary=null,layout='legacy'}={}){
 if(layout==='dossier')return projectStoryDossiers({selectedRows,registry,userId,focusObjects,due,plot,latestTemporary}).text;
 if(layout!=='legacy')throw Error('未知资料投射布局：'+layout);
 const groups={user:[],关注人物:[],当前叙事待办:[],在场其他人物:[],静态图鉴:[],当前快照:[],历史事件:[]};
 const present=new Set(rows.filter(r=>r.table==='scene').flatMap(r=>r.values.参与者??[])),focus=new Set(focusObjects),dueIds=new Set(due.filter(x=>x.due===true).map(x=>x.id));
 for(const row of selectedRows){
  if(row.table==='preferences'||row.table==='native_cells')continue;
  const character=row.table==='objects'&&isObjectType(registry,row,'character');
  const group=row.id===userId||row.nativePersona?'user':character&&focus.has(row.id)?'关注人物':character&&present.has(row.id)?'在场其他人物':['tasks','timers'].includes(row.table)||dueIds.has(row.id)?'当前叙事待办':archiveLayer(row.table,registry)==='memory'?'历史事件':archiveLayer(row.table,registry)==='static'?'静态图鉴':'当前快照';
  groups[group].push(storyRecord(row,{rows,registry}));
 }
 const plan=storyPlan(plot);if(plan)groups.当前叙事待办.push(plan);
 const content=Object.entries(groups).map(([name,items])=>block(name,items)).filter(Boolean);
 if(latestTemporary?.text)content.push(block('最新接续原文',['以下内容尚未确认归档，仅用于接续当前候选。\n'+latestTemporary.text]));
 return content.length?'<资料层开始>\n'+content.join('\n\n')+'\n<资料层结束>':'';
}

// These fields declare ownership, not merely a link or a shared name. An owner
// must be an already selected, complete object; no source row is fetched here.
const dossierOwners={state:'对象',relations:'主体',cognition:'主体',activities:'主体',experiences:'主体',growth:'主体',holdings:'物品',facts:'对象',clues:'对象',tasks:'负责人'};
const dossierStatic=new Set(['facts']);
const dossierError=reason=>{throw Object.assign(Error('TISYA_DOSSIER_'+reason),{code:'TISYA_DOSSIER_'+reason});};
export function projectStoryDossiers({rows=[],selectedRows=rows,registry={tables:[],types:[]},userId=null,focusObjects=[],due=[],plot=null,latestTemporary=null}={}){
 // The input is one caller-owned branch/point projection. Repeated identities
 // are ambiguous revisions, not permission to pick whichever appears last.
 const selected=new Map();
 for(const row of selectedRows){if(!row||typeof row.id!=='string'||!row.id)dossierError('ROW_ID');if(selected.has(row.id))dossierError('DUPLICATE_ROW');selected.set(row.id,row);}
 const objects=new Map(selectedRows.filter(row=>row.table==='objects').map(row=>[row.id,{row,basic:[],dynamic:[]}]));
 const placements=[],unassigned=[],external=[],global={NarrativeAgenda:[],Environment:[],OtherMaterial:[],History:[]};
 const dueIds=new Set(due.filter(item=>item.due===true).map(item=>item.id));
 const render=row=>{
  const text=storyRecord(row,{rows:selectedRows,registry,preserveEmptyTypes:true});
  return row.access?text:text+'\n读者可见范围：未知，不据此授权展示\n已知情人物：未知，不据此授予知情';
 };
 for(const row of selectedRows){
  if(row.table==='objects'){placements.push({id:row.id,ownerId:row.id,layer:'Basics'});continue;}
  if(['preferences','native_cells'].includes(row.table)){external.push({id:row.id,destination:row.table==='preferences'?'preferences':'native-state'});continue;}
  if(row.table==='events'){global.History.push(render(row));placements.push({id:row.id,ownerId:null,layer:'History'});continue;}
  const ownerField=dossierOwners[row.table],value=ownerField?row.values?.[ownerField]:undefined;
  let ownerId=null,reason;
  if(!ownerField)reason='unregistered-owner';
  else if(Array.isArray(value)){if(value.length===1&&typeof value[0]==='string'&&value[0])ownerId=value[0];else reason=value.length>1?'multiple-owners':'missing-owner';}
  else if(typeof value==='string'&&value)ownerId=value;
  else reason='missing-owner';
  const owner=ownerId?objects.get(ownerId):null;
  if(ownerId&&!owner)reason='owner-not-selected';
  else if(owner?.row.referenceOnly)reason='owner-identity-only';
  if(owner&&!reason){
   const layer=dossierStatic.has(row.table)?'Basics':'ToNarrate';
   owner[layer==='Basics'?'basic':'dynamic'].push(render(row));placements.push({id:row.id,ownerId,layer});
  }else{
   const layer=row.table==='scene'?'Environment':['tasks','timers'].includes(row.table)||dueIds.has(row.id)?'NarrativeAgenda':'OtherMaterial';
   global[layer].push(render(row));placements.push({id:row.id,ownerId:null,layer});unassigned.push({id:row.id,table:row.table,reason});
  }
 }
 const groups={user:[],FollowedCharacters:[],OtherPresentCharacters:[],RelatedObjects:[]};
 const focus=new Set(focusObjects),present=new Set(selectedRows.filter(row=>row.table==='scene').flatMap(row=>row.values.参与者??[]));
 for(const {row,basic,dynamic}of objects.values()){
  const character=isObjectType(registry,row,'character');
  const group=row.id===userId||row.nativePersona?'user':character&&focus.has(row.id)?'FollowedCharacters':character&&present.has(row.id)?'OtherPresentCharacters':'RelatedObjects';
  groups[group].push('<Object>\n'+block('Basics',[render(row),...basic])+(dynamic.length?'\n'+block('ToNarrate',dynamic):'')+'\n</Object>');
 }
 const plan=storyPlan(plot);if(plan)global.NarrativeAgenda.push(plan);
 const dossiers=Object.entries(groups).map(([name,items])=>block(name,items)).filter(Boolean);
 const content=[...(dossiers.length?[block('ObjectDossiers',dossiers)]:[]),...Object.entries(global).map(([name,items])=>block(name,items)).filter(Boolean)];
 if(latestTemporary?.text)content.push(block('RecentProse',['以下内容尚未确认归档，仅用于接续当前候选。\n'+latestTemporary.text]));
 return {text:content.join('\n\n'),placements,unassigned,external};
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
