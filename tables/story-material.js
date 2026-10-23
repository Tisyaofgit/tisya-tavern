import {archiveLayer} from './archive-book.js';
import {typeFields,isObjectType} from './schema.js';

// A read-only rendering of already selected/condition-projected records. It
// never expands references, changes permissions or reads an omitted record.
export function storyValue(value,{definition=null,names=new Map(),depth=0}={}){
 if(value===undefined||value===null||typeof value==='string'&&!value.trim())return '';
 if(definition?.type==='ref')return names.get(value)??'未提供的关联对象';
 if(definition?.type==='refs')return value.map(v=>names.get(v)??'未提供的关联对象').join('、');
 if(typeof value==='boolean')return value?'是':'否';
 if(typeof value!=='object')return String(value);
 if(depth>64)throw Error('资料层字段超过可展开深度');
 if(Array.isArray(value))return value.map(v=>storyValue(v,{definition:definition?.items,names,depth:depth+1})).filter(Boolean).join('；');
 const parts=Object.entries(value).filter(([key])=>key!=='原生引用').flatMap(([key,v])=>{const content=storyValue(v,{definition:definition?.fields?.[key]??definition?.items,names,depth:depth+1});return content?[`${key}：${content}`]:[];});
 return parts.join('\n');
}
function storyNames(rows,references=new Map()){
 const names=new Map(rows.map(r=>[r.id,references.get(r.id)??r.values?.名称??'未命名对象'])),duplicates=new Map();
 for(const row of rows.filter(r=>r.table==='objects')){const name=names.get(row.id);if(!duplicates.has(name))duplicates.set(name,[]);duplicates.get(name).push(row.id);}
 for(const [name,ids]of duplicates)if(ids.length>1)ids.sort().forEach((id,index)=>names.set(id,name+'〔对象'+(index+1)+'〕'));
 return names;
}
export function storyRecord(row,{rows=[row],registry={tables:[],types:[]},references=new Map(),omitFields=[],accessContext=null,resolvedNames=null}={}){
 const names=resolvedNames??storyNames(rows,references);
 const table=registry.tables.find(t=>t.id===row.table),fields=table?.fields??{};
 const title=(row.table==='objects'?names.get(row.id):row.values?.名称)??table?.name??'资料',parts=[(references.has(row.id)?references.get(row.id)+' ':'')+title];
 for(const [key,value]of Object.entries(row.values??{})){
  if(['名称','原生引用','标签','核心引用',...omitFields].includes(key))continue;
  if(key==='类型'){if(!['character','organization','place','item','rule'].includes(value))parts.push('类型：'+(registry.types?.find(t=>t.id===value)?.name??value));continue;}
  const definition=row.table==='objects'&&key==='属性'?{type:'object',fields:typeFields(registry,row.values.类型)}:fields[key];
  const content=key==='原文段落'&&Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.trim()).join('\n\n'):storyValue(value,{definition,names});if(!content)continue;
  if(key==='属性'&&value&&typeof value==='object'&&!Array.isArray(value))parts.push(content);
  else parts.push(key+'：'+content);
 }
 if(parts.length===1&&row.table!=='objects')return '';
 if(row.referenceOnly)parts.push('这里只提供身份称呼，未提供其他资料。');
 // Keep story knowledge restrictions readable without leaking storage IDs.
 if(row.access&&(!accessContext||JSON.stringify(row.access)!==JSON.stringify(accessContext))){
  const labels=values=>values.map(v=>names.get(v)??(['读者','reader','public','公开'].includes(v)?'读者': '未在场的指定对象')).join('、');
  parts.push('读者可见范围：'+(labels(row.access.readers??[])||'不向读者展示'));
  parts.push('已知情人物：'+(labels(row.access.knowers??[])||'没有已确认知情人物'));
 }
 return parts.join('\n');
}
const block=(label,items)=>{items=items.filter(Boolean);return items.length?`<${label}>\n${items.join('\n\n')}\n</${label}>`:'';};
// Request-scoped labels: the same final selection gives the same numbers.
const closedClue=row=>row.table==='clues'&&['已回收','已完成','已解决','已取消','取消','完成','回收','解决','已关闭','关闭'].includes(row.values?.阶段);
export function storyReferences(rows=[],referenceTables=['events','clues']){
 const refs=new Map();
 for(const [table,prefix]of [['events','E'],['clues','F']])rows.filter(r=>referenceTables.includes(table)&&r.table===table&&!r.referenceOnly&&!closedClue(r)&&storyRecord(r,{rows})).sort((a,b)=>a.id.localeCompare(b.id)).forEach((r,i)=>refs.set(r.id,prefix+String(i+1).padStart(2,'0')));
 return refs;
}
function eventClues(row,rows,refs){return row.table==='events'?rows.filter(r=>r.table==='clues'&&!r.referenceOnly&&r.values?.事件?.includes(row.id)&&refs.has(r.id)).map(r=>refs.get(r.id)):[];}

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
 const groups={user:[],FollowedCharacters:[],NarrativeAgenda:[],OtherPresentCharacters:[],StaticAtlas:[],CurrentSnapshot:[],History:[]};
 const present=new Set(rows.filter(r=>r.table==='scene').flatMap(r=>r.values.参与者??[])),focus=new Set(focusObjects),dueIds=new Set(due.filter(x=>x.due===true).map(x=>x.id));
 for(const row of selectedRows){
  if(row.table==='preferences'||row.table==='native_cells'||closedClue(row))continue;
  const character=row.table==='objects'&&isObjectType(registry,row,'character');
  const group=row.id===userId||row.nativePersona?'user':character&&focus.has(row.id)?'FollowedCharacters':character&&present.has(row.id)?'OtherPresentCharacters':['tasks','timers'].includes(row.table)||dueIds.has(row.id)?'NarrativeAgenda':archiveLayer(row.table,registry)==='memory'?'History':archiveLayer(row.table,registry)==='static'?'StaticAtlas':'CurrentSnapshot';
  groups[group].push(storyRecord(row,{rows,registry}));
 }
 const plan=storyPlan(plot);if(plan)groups.NarrativeAgenda.push(plan);
 const content=Object.entries(groups).map(([name,items])=>block(name,items)).filter(Boolean);
 if(latestTemporary?.text)content.push(block('RecentProse',['以下内容尚未确认归档，仅用于接续当前候选。\n'+latestTemporary.text]));
 return content.length?'<Materials>\n'+content.join('\n\n')+'\n</Materials>':'';
}

// These fields declare ownership, not merely a link or a shared name. An owner
// must be an already selected, complete object; no source row is fetched here.
const dossierOwners={state:'对象',relations:'主体',cognition:'主体',activities:'主体',experiences:'主体',growth:'主体',holdings:'物品',facts:'对象',tasks:'负责人'};
const dossierStatic=new Set(['facts']);
const dossierError=reason=>{throw Object.assign(Error('TISYA_DOSSIER_'+reason),{code:'TISYA_DOSSIER_'+reason});};
export function projectStoryDossiers({rows=[],selectedRows=rows,registry={tables:[],types:[]},userId=null,focusObjects=[],due=[],plot=null,latestTemporary=null,referenceTables=['events','clues']}={}){
 // The input is one caller-owned branch/point projection. Repeated identities
 // are ambiguous revisions, not permission to pick whichever appears last.
 const selected=new Map();
 for(const row of selectedRows){if(!row||typeof row.id!=='string'||!row.id)dossierError('ROW_ID');if(selected.has(row.id))dossierError('DUPLICATE_ROW');selected.set(row.id,row);}
 const objects=new Map(selectedRows.filter(row=>row.table==='objects').map(row=>[row.id,{row,basic:[],dynamic:[]}]));
 const placements=[],unassigned=[],external=[],global={WorldProgression:[],Environment:[],OtherMaterial:[],History:[],Foreshadow:[]},refs=storyReferences(selectedRows,referenceTables);
 const dynamics=new Map(),names=storyNames(selectedRows,refs);
 const dueIds=new Set(due.filter(item=>item.due===true).map(item=>item.id));
 const render=(row,omitFields=[],accessContext=null)=>{
  let text=storyRecord(row,{rows:selectedRows,registry,references:refs,omitFields,accessContext,resolvedNames:names});if(!text)return '';
  const clues=eventClues(row,selectedRows,refs);if(clues.length)text+='\n伏笔：'+clues.join('、');
  return row.access?text:text+'\n读者可见范围：未知，不据此授权展示\n已知情人物：未知，不据此授予知情';
 };
 for(const row of selectedRows){
  if(row.table==='objects'){placements.push({id:row.id,ownerId:row.id,layer:'Basics'});continue;}
  if(['preferences','native_cells'].includes(row.table)){external.push({id:row.id,destination:row.table==='preferences'?'preferences':'native-state'});continue;}
  if(closedClue(row)){external.push({id:row.id,destination:'resolved-clue'});continue;}
  if(!render(row)){external.push({id:row.id,destination:'empty'});continue;}
  if(row.table==='events'||row.table==='clues'){const layer=row.table==='events'?'History':'Foreshadow';global[layer].push(render(row));placements.push({id:row.id,ownerId:null,layer});continue;}
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
   const content=render(row,[ownerField],owner.row.access);
   if(!content){external.push({id:row.id,destination:'empty'});continue;}
   owner[layer==='Basics'?'basic':'dynamic'].push(content);placements.push({id:row.id,ownerId,layer});
   if(layer==='ToNarrate'&&!['完成','取消'].includes(row.values?.状态)){if(!dynamics.has(ownerId))dynamics.set(ownerId,[]);dynamics.get(ownerId).push(row.values.名称);}
  }else{
   const layer=row.table==='scene'?'Environment':['tasks','timers'].includes(row.table)||dueIds.has(row.id)?'WorldProgression':'OtherMaterial';
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
 const followed=[...dynamics].filter(([id])=>focus.has(id)).map(([id,titles])=>names.get(id)+'：见档案〈ToNarrate〉'+titles.map(name=>'「'+name+'」').join('、'));
 const progressionWithoutDossiers=block('WorldProgression',global.WorldProgression);
 if(followed.length)global.WorldProgression.push('关注对象当前动态\n'+followed.join('\n'));
 const dossiers=Object.entries(groups).map(([name,items])=>block(name,items)).filter(Boolean);
 const recent=latestTemporary?.text?block('RecentProse',['以下内容尚未确认归档，仅用于接续当前候选。\n'+latestTemporary.text]):'';
 const sections={state:[block('ObjectDossiers',dossiers),block('Environment',global.Environment),block('OtherMaterial',global.OtherMaterial)].filter(Boolean).join('\n\n'),history:block('History',global.History),progression:block('WorldProgression',global.WorldProgression),foreshadow:block('Foreshadow',global.Foreshadow),plan:block('NarrativeAgenda',[storyPlan(plot)]),recent};
 return {text:Object.values(sections).filter(Boolean).join('\n\n'),sections,progressionWithoutDossiers,references:refs,placements,unassigned,external};
}
export function storyPreferences({explicit='',style='',rows=[]}={}){
 const lines=value=>(Array.isArray(value)?value:[value]).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
 const parts=[...lines(explicit),...lines(style)];
 for(const row of rows.filter(row=>row.preferenceConfirmed===true&&row.values?.启用!==false)){
  const value=row.values,content=lines(value.内容).join('\n');if(!content)continue;
  const strength=/^(?:不|勿|别|禁止|避免)/u.test(content)?'':({必须:'必须遵循：',禁止:'禁止：',喜爱:'优先采用：',偏好:'倾向采用：',厌恶:'避免：'}[value.强度]??'');
  const scope=lines(value.范围).join('；'),exceptions=lines(value.例外);
  parts.push((scope?scope+'：':'')+strength+content+(exceptions.length?'\n例外：'+exceptions.join('；'):''));
 }
 return block('UserPreferences',[...new Set(parts)]);
}
export function storyContext({rulePolicy=null,nativeState=null,eventResults=[],conditionResults=[]}={},rows=[]){
 const parts=[];
 const changes=(rulePolicy?.decisions??[]).filter(d=>d.action==='optimize').flatMap(d=>d.changes??[]);
 if(changes.length)parts.push(block('ActiveRules',changes.map(c=>c.after)));
 if(nativeState){
  if(nativeState.available){
   const labels=new Map();const walk=(value,label)=>{if(!value||typeof value!=='object')return;if(typeof value.原生引用==='string')labels.set(value.原生引用,label);for(const [key,v]of Object.entries(value))walk(v,key);};
   for(const row of rows)walk(row.values,row.values.名称??'状态');
   parts.push(block('ConfirmedState',(nativeState.values??[]).flatMap(v=>{
    const content=storyValue(v.value);if(!content)return [];
    return [(labels.get(v.path)??v.path.split(/[/.]/).filter(Boolean).at(-1)??'状态')+'：'+content];
   })));
  }else parts.push('<StateGap>当前尚无对应时刻的可靠状态，不据此虚构数值或结算结果。</StateGap>');
  if(nativeState.missing?.length)parts.push('部分状态尚未提供，保持未知。');
 }
 const names=new Map(rows.map(r=>[r.id,r.values?.名称??'未命名对象']));
 const knowledge=r=>r.access&&'已知情人物：'+((r.access.knowers??[]).map(id=>names.get(id)??'指定对象').join('、')||'没有已确认知情人物');
 const results=[...eventResults.map(r=>[r.event&&'事件：'+r.event,r.ownerId&&'对应人物：'+(names.get(r.ownerId)??'指定对象'),r.instruction,...(r.changes??[]).map(d=>(d.name??'状态')+'：'+(storyValue(d.before)||(d.before===undefined?'未记录':'空'))+' → '+(storyValue(d.after)||(d.after===undefined?'未记录':'空'))),...(r.growth??[]).map(g=>'成长变化：'+storyValue(g)),knowledge(r)].filter(Boolean).join('\n')),...conditionResults.map(r=>[r.text??r.narrative??r.summary,knowledge(r)].filter(Boolean).join('\n'))].filter(x=>typeof x==='string'&&x.trim());
 if(results.length)parts.push(block('ConfirmedChanges',['以下结果已经结算，仅叙述已有变化，不重复执行或扩大知情。',...results]));
 return parts.filter(Boolean).join('\n\n');
}
export function storyBlueprint(value){
 if(!value)return '';
 return block('Worldview',[value.name&&'世界：'+value.name,value.goal&&'设计目标：'+value.goal,value.decisions?.length&&'已选设定：\n'+storyValue(value.decisions),value.unresolved?.length&&'尚未确定：\n'+storyValue(value.unresolved)].filter(Boolean));
}
