import {clone,fail} from '../engine/common.mjs';
import {matrixRecordVisible,matrixFieldVisible} from '../engine/prompt-boundary.mjs';

const groups=[['people','人物','jade'],['places','山川与城邑','blue'],['factions','势力与群体','purple'],['items','器物与技艺','amber'],['memory','事件与记忆','blue'],['phone','手机档案','jade'],['other','其他档案','slate']].map(([id,name,accent])=>({id,name,accent}));
const rootTypes={T_CHAR_DOSSIER:'people',T_STATIC_PLACES:'places',T_STATIC_ORGANIZATIONS:'factions',T_STATIC_ITEMS_SKILLS:'items'};
const entityTypes={character:'people',place:'places',organization:'factions',item:'items',skill:'items'};
const shown=(record,key)=>['known','derived'].includes(record.states?.[key])?record.values?.[key]:undefined;

// Disposable view of the canonical Matrix database. Never writes a second
// archive, guesses references from prose, or promotes staged memory to facts.
export function createMatrixAtlas(snapshot,{scope={...snapshot.state.runtime?.scope,audience:'author'}}={}){
 const {state}=snapshot,meta=new Map(Object.values(state.tables.X_RECORD_META??{}).map(r=>[r.values.table_id+'#'+r.values.record_id,r.values])),records=new Map();
 for(const [tid,rows]of Object.entries(state.tables))for(const [rid,record]of Object.entries(rows)){
  if(!matrixRecordVisible(state,tid,rid,scope,meta))continue;
  const schema=state.schema[tid],id=tid+'#'+rid,labels=new Map(),values={},paths=[],keys={};
  for(const f of schema.fields){
   if(!matrixFieldVisible(f,record,scope,tid,state,rid)||!Object.hasOwn(record.values,f.key))continue;
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
  }
  const category=rootTypes[tid]??(tid==='T_SYS_ENTITIES'?entityTypes[keys.kind]??'other':schema.sheet==='历史与记忆'||['T_DYN_COGNITION','T_STATIC_FACTS','T_CHAR_ANCHORS'].includes(tid)?'memory':schema.phone_internal?'phone':'other');
  const name=keys.name||keys.title||keys.instance_name||keys.short_code||schema.label+' · '+rid;
  const description=keys.description||keys.instance_description||keys.spine_digest||keys.summary_text||keys.proposition||'';
  const source=record.metadata?.archive_source;
  if(source&&scope.audience==='author')values['正文来源']={回复:source.entry_id,修订:source.revision,段落:clone(source.paragraphs??[])};
  const object=Object.hasOwn(rootTypes,tid)||tid==='T_SYS_ENTITIES';
  records.set(id,{id,sourceTable:tid,recordId:rid,table:object?'objects':tid==='T_DYN_EVENTS'?'events':tid,rev:meta.get(id)?.record_revision??snapshot.revision,values:{...values,名称:String(name),描述:String(description)},paths,category,kind:schema.label??tid,card:schema.partition!=='M'&&(!schema.record_kind?.startsWith('registration_')||tid==='T_SYS_ENTITIES')});
 }
 for(const row of records.values())row.paths=row.paths.filter(p=>records.has(p.id));
 const target=id=>{const row=records.get(id);return {id,table:row.table,revision:row.rev,name:row.values.名称,kind:row.kind};};
 const links=id=>records.get(id).paths.map(p=>p.id),related=id=>[...records.values()].filter(r=>r.id!==id&&(links(id).includes(r.id)||links(r.id).includes(id)));
 const cards=[...records.values()].filter(r=>r.card),searchText=new Map(cards.map(r=>[r.id,JSON.stringify(r.values).normalize('NFKC').toLocaleLowerCase()]));
 return {
  scope:clone(scope),
  list({query='',category=null,offset=0,limit=100}={}){
   if(typeof query!=='string'||query.length>300||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('ATLAS_QUERY','图鉴查询参数无效');
   const words=query.normalize('NFKC').toLocaleLowerCase().split(/\s+/u).filter(Boolean),matched=cards.filter(r=>words.every(w=>searchText.get(r.id).includes(w))),selected=matched.filter(r=>!category||r.category===category);
   return {scope:clone(scope),items:selected.slice(offset,offset+limit).map(r=>({...target(r.id),type:r.sourceTable,typeName:r.kind,category:r.category,accent:groups.find(g=>g.id===r.category).accent,tags:[],summary:r.values.描述})),total:selected.length,hasMore:offset+limit<selected.length,groups:groups.map(g=>({...g,count:matched.filter(r=>r.category===g.id).length})).filter(g=>g.count)};
  },
  detail(id){
   const row=records.get(id);if(!row)fail('ATLAS_RECORD','档案不存在或不可读取');
   const adjacent=related(id),expanded=new Map(adjacent.map(r=>[r.id,r]));
   for(const r of adjacent)if(r.sourceTable==='T_DYN_EVENT_PARTICIPANTS')for(const event of related(r.id))if(event.table==='events')expanded.set(event.id,event);
   const neighbors=new Map();for(const via of adjacent)for(const r of [via,...related(via.id)])if(r.id!==id&&r.table==='objects'){const old=neighbors.get(r.id)??{...target(r.id),via:[]};old.via.push({id:via.id,label:via.values.名称});neighbors.set(r.id,old);}
   return {scope:clone(scope),record:clone({id:row.id,table:row.table,rev:row.rev,values:row.values}),kind:row.kind,sections:Object.entries(row.values).filter(([name])=>name!=='名称').map(([name,value])=>({name,value:clone(value)})),related:[...expanded.values()].map(r=>({...target(r.id),values:{...clone(r.values),经过:r.values.描述}})),links:clone(links(id)),references:row.paths.map(p=>({path:clone(p.path),target:target(p.id)})),neighbors:clone([...neighbors.values()])};
  }
 };
}

export async function readMatrixAtlasSnapshot(database){
 const snapshot=await database.read();if(!snapshot)fail('ENGINE_NOT_BOUND','请先接入当前会话表单');
 const stamp=JSON.stringify(snapshot.state),atlas=createMatrixAtlas(snapshot),scope=snapshot.state.runtime?.scope??{};
 return {data:{live:true,matrix:true,world:scope.world_ref??'当前世界',branch:scope.branch_ref??'当前线路',revision:snapshot.revision,matrixAtlas:atlas,layers:[['session','当前存档']],navigation:['atlas'],trace:[]},async verify(){
  const current=await database.read();if(!current||current.contextKey!==snapshot.contextKey||current.revision!==snapshot.revision||JSON.stringify(current.state)!==stamp)fail('ATLAS_STALE','当前会话或档案已变化，请刷新图鉴');
 }};
}
