import {isObjectType,references,typeFields} from './schema.js';

// Selection is not interpretation: a recalled record never grants character knowledge.
// Do not guess a semantic match from an arbitrary two-character fragment. Scene
// participants carry their established experience even when the input paraphrases it.
export {phraseMatch} from './conditions.js';
import {phraseMatch} from './conditions.js';

export function anchorContext(view,{query='',previousText='',tags=[],actorIds=[]}={}){
 const actors=new Map(),records=new Map();
 const remember=(id,reason)=>{if(!actors.has(id))actors.set(id,reason);};
 for(const id of actorIds)if(view.rows.some(r=>r.table==='objects'&&r.id===id))remember(id,'当前用户或指定关注');
 for(const row of view.rows)if(row.nativePersona===true)remember(row.id,'当前用户');
 for(const row of view.rows)if(row.table==='scene')for(const id of row.values.参与者??[])remember(id,'当前场景');
 for(const row of view.rows)if(row.table==='objects'&&isObjectType(view.registry,row,'character')){
  if([row.values.名称,...(row.values.别名??[])].some(name=>phraseMatch(query,name)||phraseMatch(previousText,name)||tags.some(tag=>phraseMatch(tag,name))))remember(row.id,'具名人物');
 }
 for(const row of view.rows){
  const v=row.values;
  if(['experiences','relations','cognition','growth'].includes(row.table)){
   const relevant=[v.主体,v.对象,...(v.相关对象??[])].filter(id=>actors.has(id));
   if(relevant.length)records.set(row.id,{id:row.id,via:'人物经历',actors:[...new Set(relevant)]});
  }
  if(['events','experiences'].includes(row.table)){
   const cues=(v.触发线索??[]).filter(cue=>phraseMatch(query,cue)||phraseMatch(previousText,cue));
   if(cues.length)records.set(row.id,{id:row.id,via:'明确线索',cues});
  }
 }
 return {actors:[...actors.keys()],records:[...records.values()]};
}

export function referenceClosure(rows,registry,ids){
 const byId=new Map(rows.map(row=>[row.id,row])),selected=new Set([...ids].filter(id=>byId.has(id))),queue=[...selected];
 for(let i=0;i<queue.length;i++)for(const id of references(byId.get(queue[i]),registry))if(byId.has(id)&&!selected.has(id)){selected.add(id);queue.push(id);}
 return [...selected].map(id=>byId.get(id));
}

function dependencies(row,registry){
 const edges=[],walk=(value,def)=>{
  if(value==null)return;
  if(def.type==='ref'||def.type==='refs'){for(const id of def.type==='ref'?[value]:value)edges.push({id,follow:def.follow??'record'});return;}
  if(def.type==='array')for(const item of value)walk(item,def.items);
  if(def.type==='map')for(const item of Object.values(value))walk(item,def.items);
  if(def.type==='object'&&def.fields)for(const [name,child]of Object.entries(value))if(def.fields[name])walk(child,def.fields[name]);
 };
 const table=registry.tables.find(t=>t.id===row.table);
 for(const [name,value]of Object.entries(row.values)){let def=table.fields[name];if(row.table==='objects'&&name==='属性')def={...def,fields:typeFields(registry,row.values.类型)};walk(value,def);}
 return edges;
}

export function projectReferenceClosure(rows,registry,roots){
 const byId=new Map(rows.map(r=>[r.id,r])),full=new Set(roots),labels=new Set(),queue=[...full];
 for(let i=0;i<queue.length;i++)for(const {id,follow}of dependencies(byId.get(queue[i]),registry)){
  if(!byId.has(id))continue;
  if(follow==='record'&&!full.has(id)){full.add(id);queue.push(id);}else if(follow==='identity')labels.add(id);
 }
 const ids=new Set([...full,...labels]);return {full,rows:rows.filter(r=>ids.has(r.id)).map(r=>full.has(r.id)?r:{...r,referenceOnly:true,values:Object.fromEntries(Object.entries(r.values).filter(([name])=>['名称','类型','别名'].includes(name)))})};
}

