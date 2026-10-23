import {calendarTime} from './ledger.js';
import {check,copy,isObjectType} from './schema.js';

export const TIMELINE_FORMAT='tisya.timeline/1';
const unique=values=>[...new Set(values.filter(value=>typeof value==='string'&&value))];
const values=value=>Array.isArray(value)?value:typeof value==='string'?[value]:[];
const eventFields=['锚点事件','事件','关联事件','前置事件','后续事件'];
const ownerFields=['主体','对象','参与者','负责人','所有者','保管者','相关对象'];

// A literal period such as childhood is useful, but is not a calendar date.
// Recording a fact now never supplies a missing occurrence date for that fact.
export function storyTime(value){
 if(typeof value!=='string'||!value.trim())return {kind:'unknown',value:null,instant:null};
 const literal=value.trim(),instant=calendarTime(literal);
 if(instant!==null)return {kind:'absolute',value:literal,instant,start:instant,end:instant};
 const range=literal.match(/^(.+?)\s*(?:—+|–|~|～|至|到)\s*(.+)$/);
 if(range){
  const start=calendarTime(range[1]),date=range[1].match(/^(\d{4}-\d{1,2}-\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日)/)?.[1],zone=range[1].match(/(Z|[+-]\d{2}:\d{2})$/)?.[1]??'';
  const tail=range[2].trim(),end=calendarTime(date&&/^\d{1,2}:\d{2}(?::\d{2})?$/.test(tail)?date+' '+tail+zone:tail);
  // A shorter end clock inherits only the date explicitly present in this
  // literal. Reversed intervals never imply an unmentioned next day.
  if(start!==null&&end!==null&&start<=end)return {kind:'absolute',value:literal,instant:null,start,end};
 }
 return {kind:/未知|不详|待核|待定|矛盾|冲突/.test(literal)||/^\d{4}-\d{1,2}-\d{1,2}(?:[ T]|$)/.test(literal)?'unknown':'relative',value:literal,instant:null};
}
function prehistories(v){return [['前史',v.前史],['属性.前史',v.属性?.前史]].filter(([,p])=>p&&typeof p==='object');}
function occurrence(row){
 const v=row.values??{},fields=row.table==='events'?['时间','时间范围']:row.table==='activities'?['开始时间','推进至']:['生效时间'];
 if(row.table==='activities'&&typeof v.开始时间==='string'&&v.开始时间.trim()&&typeof v.推进至==='string'&&v.推进至.trim())return [{field:'开始时间／推进至',...storyTime(v.开始时间+'—'+v.推进至)}];
 const points=fields.filter(k=>typeof v[k]==='string'&&v[k].trim()).map(field=>({field,...storyTime(v[field])}));
 for(const [path,p]of prehistories(v))if(typeof p.时期==='string')points.push({field:path+'.时期',...storyTime(p.时期)});
 if(!points.length)points.push({field:null,...storyTime(null)});
 return points;
}
function refs(row,events){return unique(eventFields.flatMap(key=>values(row.values?.[key]))).filter(id=>events.has(id)).map(id=>'event:'+id);}
function actorIds(row,actors){
 const v=row.values??{},ids=ownerFields.flatMap(key=>values(v[key]));
 if(row.table==='objects')ids.push(row.id);
 for(const [,p]of prehistories(v))ids.push(...values(p.主体),...values(p.参与者));
 return unique(ids).filter(id=>actors.has(id));
}
function bounds(points){
 if(!points.length||points.some(p=>p.kind!=='absolute'))return null;
 const intervals=unique(points.map(p=>p.start+':'+p.end));
 // Distinct fields can disagree. The caller must not choose one silently.
 return intervals.length===1?{start:points[0].start,end:points[0].end}:null;
}
function ordered(entries){
 const absolute=[],relative=[],unknown=[];
 for(const entry of entries){
  const points=entry.occurrence,span=bounds(points);
  if(span)absolute.push({id:entry.id,...span});
  else if(points.some(p=>p.kind==='relative')||entry.before.length||entry.after.length||entry.eventAnchors.length)relative.push(entry.id);
  else unknown.push(entry.id);
 }
 absolute.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
 const groups=[];for(const node of absolute){const prior=groups.at(-1);if(prior&&node.start<=prior.end){prior.end=Math.max(prior.end,node.end);prior.anchors.push(node.id);}else groups.push({start:node.start,end:node.end,anchors:[node.id]});}
 // Only disjoint groups are chronologically ordered. Inside an overlapping
 // group stable display order is not a causal or temporal precedence claim.
 return {absolute:absolute.map(x=>x.id),groups,relative,unknown};
}

// Rebuildable metadata over the caller's already branch-filtered view. No
// history, biography or current snapshot is copied into a second editable store.
export function buildTimeline(view,{sessionId=null,chain=[]}={}){
 const rows=view.rows??[],byId=new Map(rows.map(row=>[row.id,row])),events=new Set(rows.filter(r=>r.table==='events').map(r=>r.id));
 const actors=new Set(rows.filter(r=>r.table==='objects'&&isObjectType(view.registry,r,'character')).map(r=>r.id));
 const sources=new Map(chain.map((s,index)=>[s.key,{key:s.key,floor:s.floor??index+1,role:s.role??null}]));
 const commits=view.commits??[];
 const sourceFor=(source,inherited=null)=>{const s=sources.get(source);return {key:source??null,floor:inherited?.sourceFloor??s?.floor??null,role:inherited?.sourceRole??s?.role??null};};
 const projectedAnchors=new Map((view.anchors??[]).map(a=>[a.id,a]));
 const traces=[...(view.inheritedTrace??[]).map(a=>({...a,inherited:true})),...commits.flatMap(c=>(c.anchors??[]).map(a=>({...a,...projectedAnchors.get(a.id),commit:c.id,kind:c.kind,inherited:false})))];
 const latest=new Map();for(const anchor of traces)latest.set(anchor.row,anchor);
 const removedEvents=[...latest.values()].filter(a=>a.table==='events'&&a.after===null&&!byId.has(a.row));for(const a of removedEvents)events.add(a.row);
 const entries=[];
 for(const row of rows){
  if(['preferences','native_cells'].includes(row.table)||row.referenceOnly)continue;
  const v=row.values??{},anchor=latest.get(row.id),id=(row.table==='events'?'event:':'record:')+row.id;
  entries.push({id,row:row.id,revision:row.rev,table:row.table,title:v.名称??'',actors:actorIds(row,actors),occurrence:occurrence(row),
   eventAnchors:refs(row,events),before:values(v.后续事件).filter(id=>events.has(id)).map(id=>'event:'+id),after:values(v.前置事件).filter(id=>events.has(id)).map(id=>'event:'+id),
   recorded:{source:sourceFor(row.source??anchor?.source,anchor?.inherited?anchor:null),at:row.updatedAt??anchor?.recordedAt??null,storyTime:storyTime(anchor?.worldTime),changeAnchor:anchor?.id??null},
   status:row.table==='activities'||row.table==='tasks'||row.table==='timers'?v.状态??null:null});
 }
 for(const anchor of removedEvents){const historical={id:anchor.row,table:'events',values:anchor.before??{}};entries.push({id:'event:'+anchor.row,row:anchor.row,revision:null,table:'events',title:historical.values.名称??'',actors:actorIds(historical,actors),occurrence:occurrence(historical),eventAnchors:refs(historical,events),before:values(historical.values.后续事件).filter(id=>events.has(id)).map(id=>'event:'+id),after:values(historical.values.前置事件).filter(id=>events.has(id)).map(id=>'event:'+id),recorded:{source:sourceFor(anchor.source,anchor.inherited?anchor:null),at:anchor.recordedAt??null,storyTime:storyTime(anchor.worldTime),changeAnchor:anchor.id,sourceSession:anchor.path?.[0]??sessionId},operation:'delete'});}
 // Historical transitions are retained even when the row has since changed or
 // been removed; inherited paths retain their original source session/floor.
 for(const anchor of traces){
  if(!['state','relations','cognition','experiences','growth','activities','holdings','facts','objects'].includes(anchor.table))continue;
  const historical={id:anchor.row,table:anchor.table,values:anchor.after??anchor.before??{}},related=refs(historical,events);
  entries.push({id:'change:'+anchor.id,row:anchor.row,revision:null,table:anchor.table,title:historical.values.名称??byId.get(anchor.row)?.values.名称??'',actors:actorIds(historical,actors),occurrence:occurrence(historical),eventAnchors:unique(related),before:[],after:[],
   recorded:{source:sourceFor(anchor.source,anchor.inherited?anchor:null),at:anchor.recordedAt??null,storyTime:storyTime(anchor.worldTime),changeAnchor:anchor.id,sourceSession:anchor.path?.[0]??sessionId},
   operation:anchor.operation??(anchor.after===null?'delete':anchor.before===null?'create':'update')});
 }
 const nodeIds=new Set(entries.map(e=>e.id));check(nodeIds.size===entries.length,'时间锚索引重复');
 const lifelines=[...actors].map(id=>{const nodes=entries.filter(e=>e.actors.includes(id));return {object:id,name:byId.get(id).values.名称,anchors:nodes.map(e=>e.id),order:ordered(nodes)};});
 const rowsMeta=Object.fromEntries(rows.map(row=>{const nodes=entries.filter(e=>e.row===row.id),current=nodes.find(e=>!e.id.startsWith('change:'));return [row.id,{branch:sessionId,row:row.id,revision:row.rev,actors:unique(nodes.flatMap(e=>e.actors)),anchors:unique(nodes.flatMap(e=>[e.id,...e.eventAnchors])),occurrence:copy(current?.occurrence??[{field:null,...storyTime(null)}])}];}));
 return {format:TIMELINE_FORMAT,basis:{session:sessionId,revision:view.revision??null,commit:view.last??null},current:storyTime(rows.find(r=>r.table==='scene')?.values.当前时间),entries,order:ordered(entries),lifelines,rows:rowsMeta};
}

// Queries are metadata filters before semantic indexing. Unknown/relative dates
// remain eligible by default so lack of a date never becomes false absence.
export function filterTimelineRows(rows,timeline,filter={}){
 check(timeline?.format===TIMELINE_FORMAT,'时间锚索引格式无效');
 const allowed=new Set(['branch','actors','anchors','from','to','includeUnknown']);check(Object.keys(filter).every(k=>allowed.has(k)),'时间锚筛选字段无效');
 if(filter.branch!==undefined)check(typeof filter.branch==='string','时间线分支筛选无效');
 for(const key of ['actors','anchors'])if(filter[key]!==undefined)check(Array.isArray(filter[key])&&filter[key].every(v=>typeof v==='string'),'时间锚筛选列表无效：'+key);
 if(filter.includeUnknown!==undefined)check(typeof filter.includeUnknown==='boolean','未知时间筛选须为布尔值');
 const from=filter.from===undefined?null:calendarTime(filter.from),to=filter.to===undefined?null:calendarTime(filter.to);
 check((filter.from===undefined||from!==null)&&(filter.to===undefined||to!==null),'时间范围需要可比较的明确日期');check(from===null||to===null||from<=to,'时间范围起点晚于终点');
 return rows.filter(row=>{
  const meta=timeline.rows[row.id];if(!meta||meta.revision!==row.rev)return false;
  if(filter.branch!==undefined&&meta.branch!==filter.branch)return false;
  if(filter.actors?.length&&!filter.actors.some(id=>meta.actors.includes(id)))return false;
  if(filter.anchors?.length&&!filter.anchors.some(id=>meta.anchors.includes(id)))return false;
  if(from===null&&to===null)return true;
  const span=bounds(meta.occurrence);if(!span)return filter.includeUnknown!==false;
  return (from===null||span.end>=from)&&(to===null||span.start<=to);
 });
}

// Author-facing references; the canonical record carries its full contents.
export function timelineLines(timeline,objectId=null){
 const life=objectId===null?null:timeline.lifelines.find(l=>l.object===objectId);check(objectId===null||life,'角色生命线不存在');
 const selected=life?new Set(life.anchors):null,order=life?.order??timeline.order,byId=new Map(timeline.entries.map(e=>[e.id,e])),lines=[life?life.name+' · 生命线':'世界时间线'];
 const describe=id=>{const e=byId.get(id);if(!e||selected&&!selected.has(id))return;const time=e.occurrence.map(p=>p.value).filter(Boolean).join(' / ')||'时间未知',events=e.eventAnchors.map(ref=>byId.get(ref)?.title).filter(Boolean);lines.push(time+'｜'+(e.title||e.table)+(e.operation?' · '+({create:'建立',update:'变更',delete:'移除'})[e.operation]:''));if(events.length)lines.push('关联事件：'+events.join('；'));if(e.recorded.source.floor!==null)lines.push('记载于第 '+e.recorded.source.floor+' 楼'+(e.recorded.storyTime.value?'，当时世界时间：'+e.recorded.storyTime.value:''));};
 for(const group of order.groups){if(group.anchors.length>1)lines.push('〔时间重叠〕');group.anchors.forEach(describe);}
 if(order.relative.length){lines.push('〔相对时期与关联锚〕');order.relative.forEach(describe);}
 if(order.unknown.length){lines.push('〔时间未定〕');order.unknown.forEach(describe);}
 return lines.join('\n');
}
