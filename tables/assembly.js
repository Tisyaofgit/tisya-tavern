import {anchorContext,projectReferenceClosure} from './anchor-context.js';
import {conditionMatches,tableCondition,phraseMatch} from './conditions.js';
import {copy,derive,typeFields,isObjectType} from './schema.js';

// Projection never edits storage. Conditions use the same confirmed row and the
// two permitted text sources at every depth, including inherited type fields.
function projectValue(value,def,context,path,omitted,{identity=false}={}){
 if(!def.required&&!identity&&!conditionMatches(def.include??{op:'selected'},context)){omitted.push(path);return undefined;}
 if(value===null)return value;
 if(def.type==='object'&&def.fields){
  return Object.fromEntries(Object.entries(value).flatMap(([name,child])=>{
   const field=def.fields[name];if(!field)return [[name,child]];
   const projected=projectValue(child,field,context,path+'.'+name,omitted,{identity:name===def.idKey});
   return projected===undefined?[]:[[name,projected]];
  }));
 }
 if(def.type==='array')return value.flatMap((child,index)=>{
  const field=def.idKey?{...def.items,idKey:def.idKey}:def.items;
  const projected=projectValue(child,field,context,path+'['+index+']',omitted);return projected===undefined?[]:[projected];
 });
 if(def.type==='map')return Object.fromEntries(Object.entries(value).flatMap(([name,child])=>{
  const projected=projectValue(child,def.items,context,path+'.'+name,omitted);return projected===undefined?[]:[[name,projected]];
 }));
 return value;
}

export function assembleTableRows(view,{previousText='',userText='',tags=[],strict=false,retrieved=[],actorIds=[]}={}){
 const recall=anchorContext(view,{previousText,query:userText,tags,actorIds}),actors=new Set(recall.actors),recalled=new Set(recall.records.map(r=>r.id)),retrievedIds=new Set(retrieved),contexts=new Map(),roots=[];
 for(const row of view.rows){
  const v=row.values,definition=view.registry.tables.find(t=>t.id===row.table);
  const named=[v.名称,...(v.别名??[])].some(name=>phraseMatch(previousText,name)||phraseMatch(userText,name));
  const context={row,previousText,userText,strict,selected:retrievedIds.has(row.id),retrieved:retrievedIds.has(row.id),context:actors.has(row.id)||[v.主体,v.对象,...(v.相关对象??[])].some(id=>actors.has(id)),cue:named||(v.触发线索??[]).some(cue=>phraseMatch(previousText,cue)||phraseMatch(userText,cue)),tagged:[v.名称,...(v.别名??[])].some(name=>name&&tags.some(tag=>String(tag).includes(name)))};
  context.rule=row.table==='objects'&&isObjectType(view.registry,row,'rule');context.focused=context.context||context.cue||context.tagged||recalled.has(row.id)||context.retrieved;contexts.set(row.id,context);
  if(conditionMatches(definition?.assemble??tableCondition(row.table),context))roots.push(row.id);
 }
 // References carry their own permissions; selecting a child never changes parent ACL.
 const derived=derive(view.rows,view.registry),omitted=[],trace=[],omittedFields=new Map();
 const candidates=derived.map(row=>{
  const context={...contexts.get(row.id),selected:true},definition=view.registry.tables.find(t=>t.id===row.table),result=copy(row),fields=[];
  for(const [name,value]of Object.entries(result.values)){
   let field=definition.fields[name];
   if(row.table==='objects'&&name==='属性')field={...field,fields:typeFields(view.registry,row.values.类型)};
   const projected=projectValue(value,field,context,name,fields);
   if(projected===undefined)delete result.values[name];else result.values[name]=projected;
  }
  omittedFields.set(row.id,fields);return result;
 });
 // A conditionally omitted link must not pull an unrelated private dossier into
 // the payload. Follow only links that survive the field projection.
 const resolution=projectReferenceClosure(candidates,view.registry,roots),complete=resolution.rows,rootIds=new Set(roots),bySelected=new Map(complete.map(r=>[r.id,r]));
 for(const row of complete){const fields=omittedFields.get(row.id);if(fields.length)omitted.push({id:row.id,fields});trace.push({id:row.id,reason:rootIds.has(row.id)?'condition':resolution.full.has(row.id)?'reference':'reference-label',focused:contexts.get(row.id).focused});}
 const visibleRecall={actors:recall.actors.filter(id=>bySelected.has(id)),records:recall.records.filter(r=>bySelected.has(r.id)).map(({id,via})=>({id,via}))};
 return {rows:complete,candidates:candidates.map(row=>bySelected.get(row.id)??row),complete,recall:visibleRecall,trace,omitted};
}
