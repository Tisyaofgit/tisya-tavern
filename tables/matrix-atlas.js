import {clone,fail} from '../engine/common.mjs';
import {matrixRecordVisible,matrixFieldVisible,modelFieldAllowed} from '../engine/prompt-boundary.mjs';
import {eventCodes} from '../engine/record-identity.mjs';
import {readFieldHistory} from '../engine/field-history.mjs';

const groups=[['people','人物','jade'],['places','山川与城邑','blue'],['factions','势力与群体','purple'],['items','器物与技艺','amber'],['memory','事件与记忆','blue'],['phone','手机档案','jade'],['other','其他档案','slate']].map(([id,name,accent])=>({id,name,accent}));
const rootTypes={T_CHAR_DOSSIER:'people',T_STATIC_PLACES:'places',T_STATIC_ORGANIZATIONS:'factions',T_STATIC_ITEMS_SKILLS:'items'};
const entityTypes={character:'people',place:'places',organization:'factions',item:'items',skill:'items'};
const shown=(record,key)=>['known','derived'].includes(record.states?.[key])?record.values?.[key]:undefined;
const atlasInternalFields=new Set(['owner_table','owner_form','owner_row_uuid','owner_field','sequence','item_type','value_state']);

// Disposable view of the canonical Matrix database. Never writes a second
// archive, guesses references from prose, or promotes staged memory to facts.
export function createMatrixAtlas(snapshot,{scope={...snapshot.state.runtime?.scope,audience:'author'}}={}){
 const {state}=snapshot,meta=new Map(Object.values(state.tables.X_RECORD_META??{}).map(r=>[r.values.table_id+'#'+r.values.record_id,r.values])),records=new Map();
 for(const [tid,rows]of Object.entries(state.tables))for(const [rid,record]of Object.entries(rows)){
  if(!matrixRecordVisible(state,tid,rid,scope,meta))continue;
  const schema=state.schema[tid],id=tid+'#'+rid,labels=new Map(),values={},paths=[],keys={},definitions={};
  for(const f of schema.fields){
   if(!matrixFieldVisible(f,record,scope,tid,state,rid)||!modelFieldAllowed(f,schema,'main')||atlasInternalFields.has(f.key)||!Object.hasOwn(record.values,f.key))continue;
   const label=f.label||f.key,n=(labels.get(label)??0)+1;labels.set(label,n);const name=n===1?label:label+'〔'+n+'〕';
   const status=record.states?.[f.key];if(!['known','derived','unknown','cleared','none','not_applicable'].includes(status))continue;
   let value=['known','derived'].includes(status)?clone(record.values[f.key]):({unknown:'?',cleared:'!',none:'∅',not_applicable:'—'})[status];
   const table=f.ref?.startsWith('@')?shown(record,f.ref.slice(1)):f.ref;
   if(table&&['known','derived'].includes(status)){
    const targets=Array.isArray(value)?value:[value],visible=targets.filter(v=>typeof v==='string'&&matrixRecordVisible(state,table,v,scope,meta));
    if(!visible.length)continue;
    value=Array.isArray(value)?visible:visible[0];visible.forEach((v,i)=>paths.push({path:Array.isArray(value)?[name,i]:[name],id:table+'#'+v}));
   }
   values[name]=value;keys[f.key]=value;
   const definition=f.source_description??f.description??f.fill_hint??f.legacy_source_description??f.legacy_description;if(definition)definitions[name]=definition;
  }
  const category=rootTypes[tid]??(tid==='T_SYS_ENTITIES'?entityTypes[keys.kind]??'other':schema.sheet==='历史与记忆'||['T_DYN_COGNITION','T_STATIC_FACTS','T_CHAR_ANCHORS'].includes(tid)?'memory':schema.phone_internal?'phone':'other');
  const semantic=keys.name??keys.title??keys.instance_name??keys.label??keys.short_code??keys.text_value??keys.original_text??keys.narrative??keys.proposition??keys.summary_text;
  const name=semantic??(typeof keys.value==='number'?String(keys.value):undefined)??(schema.label??tid)+' · 明细';
  const description=keys.description??keys.instance_description??keys.spine_digest??keys.summary_text??keys.proposition??keys.narrative??(tid==='M_LIST_VALUES'?'列表项说明':'');
  const source=record.metadata?.archive_source;
  if(source&&scope.audience==='author')values['正文来源']={回复:source.entry_id,修订:source.revision,段落:clone(source.paragraphs??[])};
  const object=Object.hasOwn(rootTypes,tid)||tid==='T_SYS_ENTITIES';
  records.set(id,{id,sourceTable:tid,recordId:rid,table:object?'objects':tid==='T_DYN_EVENTS'?'events':tid,rev:meta.get(id)?.record_revision??snapshot.revision,values:{...values,名称:String(name),描述:String(description)},definitions,paths,keys,category,kind:schema.label??tid,card:!['T_DYN_EVENT_LINKS','T_DYN_EVENT_PARTICIPANTS'].includes(tid)&&schema.partition!=='M'&&(!schema.record_kind?.startsWith('registration_')||tid==='T_SYS_ENTITIES')});
 }
 // A typed list atom is a readable value, not a destination exposing its
 // storage coordinates. Atoms pointing at a real object resolve straight to
 // that object; text-only atoms open their sanitized explanation record.
 for(const row of records.values())row.paths=row.paths.filter(p=>records.has(p.id)).map(p=>{
  const child=records.get(p.id);if(child?.sourceTable!=='M_LIST_VALUES')return p;
  const value=state.tables.M_LIST_VALUES?.[child.recordId]?.values,target=value?.target_table&&value?.target_row_uuid?value.target_table+'#'+value.target_row_uuid:null;
  return target&&records.has(target)?{...p,id:target}:p;
 });
 const codes=eventCodes(state),displayCode=id=>{const raw=String(codes.get(records.get(id).recordId)??'');return /^e/i.test(raw)?raw.toLocaleLowerCase():'e'+raw;};
 const target=id=>{const row=records.get(id);return {id,table:row.table,revision:row.rev,name:row.values.名称,kind:row.kind,...(row.table==='events'?{code:displayCode(id)}:{})};};
 const links=id=>records.get(id).paths.map(p=>p.id),related=id=>[...records.values()].filter(r=>r.id!==id&&(links(id).includes(r.id)||links(r.id).includes(id)));
 const cards=[...records.values()].filter(r=>r.card),searchText=new Map(cards.map(r=>[r.id,(JSON.stringify(r.values)+' '+r.kind+' '+groups.find(g=>g.id===r.category).name+(r.table==='events'?' '+displayCode(r.id):'')).normalize('NFKC').toLocaleLowerCase()]));
 const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
 const worldTime=ref=>{const row=typeof ref==='string'?records.get('M_WORLD_TIME#'+ref):null;if(!row)return null;const value=row.keys;return {year:number(value.year),season:number(value.season),month:number(value.month),day:number(value.day),hour:number(value.hour),minute:number(value.minute),tick:number(value.tick),precision:value.precision??'',original:value.original_text??'',calendar:typeof value.calendar_ref==='string'?value.calendar_ref:''};};
 const anchor=ref=>{const row=typeof ref==='string'?records.get('T_SYS_TIME_ANCHORS#'+ref):null;if(!row)return null;const raw=state.tables.T_SYS_TIME_ANCHORS?.[row.recordId]?.values??{};return {name:row.values.名称,time:worldTime(row.keys.story_time),sequence:number(raw.source_sequence)};};
 const timeLabel=time=>{if(!time)return '';if(time.original)return String(time.original);const parts=[];if(time.year!==null)parts.push(time.year+' 年');if(time.season!==null)parts.push('第 '+time.season+' 季');if(time.month!==null)parts.push(time.month+' 月');if(time.day!==null)parts.push(time.day+' 日');if(time.hour!==null)parts.push(time.hour+' 时');if(time.minute!==null)parts.push(time.minute+' 分');if(time.tick!==null)parts.push(time.tick+' 刻');return parts.join(' · ');};
 const absolute=time=>time?.year!==null&&time?.year!==undefined?[time.year,time.season??0,time.month??0,time.day??0,time.hour??0,time.minute??0,time.tick??0]:null;
 const compareTuple=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
 const eventTime=row=>{
  const direct=worldTime(row.keys.story_time),relative=anchor(row.keys.relative_anchor),fixed=anchor(row.keys.time_anchor_ref),range=typeof row.keys.time_span==='string'?records.get('M_TIME_RANGES#'+row.keys.time_span):null;
  const start=range?anchor(range.keys.start_anchor_ref):null,end=range?anchor(range.keys.end_anchor_ref):null,time=direct??fixed?.time??relative?.time??start?.time??null;
  const rangeLabel=range?.keys.narrative||[timeLabel(start?.time)||start?.name,timeLabel(end?.time)||end?.name].filter(Boolean).join(' — ');
  const label=row.keys.time_original_text||timeLabel(time)||rangeLabel||timeLabel(fixed?.time)||fixed?.name||timeLabel(relative?.time)||relative?.name||'时间未明';
  return {label:String(label),precision:String(row.keys.time_precision??time?.precision??(label==='时间未明'?'unknown':'relative')),calendar:time?.calendar??'',sort:absolute(time),sequence:fixed?.sequence??relative?.sequence??start?.sequence??null};
 };
 const participantsByEvent=new Map(),objectsByEvent=new Map(),relationsByEvent=new Map(),chronology=[];
 const append=(map,key,value)=>{const list=map.get(key)??[];list.push(value);map.set(key,list);};
 for(const row of records.values()){
  if(row.sourceTable==='T_DYN_EVENT_PARTICIPANTS'){
   const event='T_DYN_EVENTS#'+row.keys.event_ref,entity='T_SYS_ENTITIES#'+row.keys.entity_ref;if(!records.has(event)||!records.has(entity))continue;
   append(participantsByEvent,event,{...target(entity),role:String(row.keys.role??''),participationId:row.id});append(objectsByEvent,entity,event);
  }
  if(row.sourceTable==='T_DYN_EVENT_LINKS'){
   const source='T_DYN_EVENTS#'+row.keys.event_ref,targetId='T_DYN_EVENTS#'+row.keys.target_event_ref,kind=String(row.keys.edge_kind??'关联'),evidence=String(row.keys.connection_evidence??''),order=number(row.keys.node_order);
   if(records.has(source)&&records.has(targetId)){
    append(relationsByEvent,source,{id:row.id,kind,direction:'outgoing',target:target(targetId),evidence,order});append(relationsByEvent,targetId,{id:row.id,kind,direction:'incoming',target:target(source),evidence,order});
    if(['前置','时间先后','明确因果','段内节点'].includes(kind))chronology.push([source,targetId]);if(kind==='后续')chronology.push([targetId,source]);
   }
   const dynamic=row.keys.target_record_ref,targetTable=row.keys.target_table;if(typeof dynamic==='string'&&typeof targetTable==='string'){
    const object=targetTable+'#'+dynamic;if(records.get(object)?.table==='objects'&&records.has(source))append(objectsByEvent,object,source);
   }
  }
 }
 for(const row of records.values())if(row.table==='events')for(const path of row.paths){if(records.get(path.id)?.table==='objects')append(objectsByEvent,path.id,row.id);}
 const ordered=(items,edges)=>{
  const byId=new Map(items.map(item=>[item.id,item])),base=(a,b)=>{
   if(a.time.sort&&b.time.sort&&a.time.calendar===b.time.calendar){const compared=compareTuple(a.time.sort,b.time.sort);if(compared)return compared;}
   if(!!a.time.sort!==!!b.time.sort)return a.time.sort?-1:1;
   if(a.time.sequence!==null&&b.time.sequence!==null&&a.time.sequence!==b.time.sequence)return a.time.sequence-b.time.sequence;
   return a.code.localeCompare(b.code,undefined,{numeric:true})||a.id.localeCompare(b.id);
  },indegree=new Map(items.map(item=>[item.id,0])),outgoing=new Map();
  for(const [from,to]of edges){const a=byId.get(from),b=byId.get(to);if(!a||!b||from===to)continue;if(a.time.sort&&b.time.sort&&a.time.calendar===b.time.calendar&&compareTuple(a.time.sort,b.time.sort)>0)continue;if(outgoing.get(from)?.includes(to))continue;append(outgoing,from,to);indegree.set(to,indegree.get(to)+1);}
  const available=items.filter(item=>!indegree.get(item.id)).sort(base),result=[];while(available.length){const item=available.shift();result.push(item);for(const id of outgoing.get(item.id)??[]){indegree.set(id,indegree.get(id)-1);if(!indegree.get(id)){available.push(byId.get(id));available.sort(base);}}}
  if(result.length!==items.length)return items.sort(base);return result;
 };
 return {
  scope:clone(scope),
  list({query='',category=null,offset=0,limit=100}={}){
   if(typeof query!=='string'||query.length>300||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('ATLAS_QUERY','图鉴查询参数无效');
   const words=query.normalize('NFKC').toLocaleLowerCase().split(/\s+/u).filter(Boolean),matched=cards.filter(r=>words.every(w=>searchText.get(r.id).includes(w))),selected=matched.filter(r=>!category||r.category===category);
   return {scope:clone(scope),items:selected.slice(offset,offset+limit).map(r=>({...target(r.id),type:r.sourceTable,typeName:r.kind,category:r.category,categoryName:groups.find(g=>g.id===r.category).name,accent:groups.find(g=>g.id===r.category).accent,tags:[],summary:r.values.描述,...(r.table==='events'?{time:eventTime(r).label}:{})})),total:selected.length,hasMore:offset+limit<selected.length,groups:groups.map(g=>({...g,count:matched.filter(r=>r.category===g.id).length}))};
  },
  timeline({subject=null}={}){
   if(subject!==null&&typeof subject!=='string')fail('ATLAS_TIMELINE','时间线查询参数无效');
   if(subject&&!records.has(subject))fail('ATLAS_RECORD','档案不存在或不可读取');
   const allowed=subject?new Set(objectsByEvent.get(subject)??[]):null;
   const items=[...records.values()].filter(row=>row.table==='events'&&(!allowed||allowed.has(row.id))).map(row=>{
    const time=eventTime(row),domain=String(row.keys.timeline_domain??'主线'),calendarName=time.calendar&&records.has('M_CALENDAR_RULES#'+time.calendar)?records.get('M_CALENDAR_RULES#'+time.calendar).values.名称:'';
    return {...target(row.id),code:displayCode(row.id),summary:row.values.描述,time:{label:time.label,precision:time.precision,sort:time.sort?clone(time.sort):null,sequence:time.sequence,calendar:time.calendar},domain,domainLabel:domain+(calendarName?' · '+calendarName:''),participants:clone(participantsByEvent.get(row.id)??[]),relations:clone(relationsByEvent.get(row.id)??[])};
   });
   const domains=new Map();for(const item of items){const key=item.domain+'\n'+item.time.calendar;if(!domains.has(key))domains.set(key,{id:key,label:item.domainLabel,items:[]});domains.get(key).items.push(item);}
   const grouped=[...domains.values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN')).map(group=>({...group,items:ordered(group.items,chronology)}));
   return clone({scope,subject,total:items.length,groups:grouped,items:grouped.flatMap(group=>group.items)});
  },
  detail(id){
   const row=records.get(id);if(!row)fail('ATLAS_RECORD','档案不存在或不可读取');
   const adjacent=related(id),expanded=new Map(adjacent.map(r=>[r.id,r]));
   for(const r of adjacent)if(r.sourceTable==='T_DYN_EVENT_PARTICIPANTS')for(const event of related(r.id))if(event.table==='events')expanded.set(event.id,event);
   const neighbors=new Map();for(const via of adjacent)for(const r of [via,...related(via.id)])if(r.id!==id&&r.table==='objects'){const old=neighbors.get(r.id)??{...target(r.id),via:[]};old.via.push({id:via.id,label:via.values.名称});neighbors.set(r.id,old);}
   const stored=state.tables[row.sourceTable]?.[row.recordId],history=readFieldHistory(state,{tableId:row.sourceTable,recordId:row.recordId}).filter(item=>{
    const spec=state.schema[row.sourceTable]?.fields.find(f=>f.key===item.field),log=state.tables.T_SYS_CHANGE_LOG?.[item.id];
    return spec&&stored&&log&&matrixFieldVisible(spec,stored,scope,row.sourceTable,state,row.recordId);
   }).map(item=>({...item,label:state.schema[row.sourceTable].fields.find(f=>f.key===item.field)?.label??item.field,storyTimeLabel:timeLabel(worldTime(item.storyTime))||'时间未明',event:item.eventRef&&records.has('T_DYN_EVENTS#'+item.eventRef)?target('T_DYN_EVENTS#'+item.eventRef):null}));
   return {scope:clone(scope),record:clone({id:row.id,table:row.table,rev:row.rev,values:row.values}),kind:row.kind,definitions:clone(row.definitions),sections:Object.entries(row.values).filter(([name])=>!['名称','描述','事件标题'].includes(name)).map(([name,value])=>({name,value:clone(value)})),related:[...expanded.values()].map(r=>({...target(r.id),values:{...clone(r.values),经过:r.values.描述}})),links:clone(links(id)),references:row.paths.map(p=>({path:clone(p.path),target:target(p.id)})),neighbors:clone([...neighbors.values()]),history:clone(history)};
  }
 };
}

export async function readMatrixAtlasSnapshot(database){
 const snapshot=await database.read();if(!snapshot)fail('ENGINE_NOT_BOUND','请先接入当前会话表单');
 const stamp=JSON.stringify(snapshot.state),atlas=createMatrixAtlas(snapshot),scope=snapshot.state.runtime?.scope??{};
 return {data:{live:true,matrix:true,world:scope.world_ref??'当前世界',branch:scope.branch_ref??'当前线路',revision:snapshot.revision,matrixAtlas:atlas,layers:[['session','当前存档']],navigation:['atlas','timeline'],trace:[]},async verify(){
  const current=await database.read();if(!current||current.contextKey!==snapshot.contextKey||current.revision!==snapshot.revision||JSON.stringify(current.state)!==stamp)fail('ATLAS_STALE','当前会话或档案已变化，请刷新图鉴');
 }};
}
