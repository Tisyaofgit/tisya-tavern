import {check,copy,object,registryIndex} from './schema.js';
import {projectArchiveAccess} from './archive-access.js';
export const ATLAS_LAYOUT={version:1,groups:[
 {id:'people',name:'人物',types:['character'],accent:'jade'},
 {id:'places',name:'山川与城邑',types:['place'],accent:'blue'},
 {id:'factions',name:'势力与群体',types:['organization'],accent:'purple'},
 {id:'items',name:'器物与资源',types:['item'],accent:'amber'},
 {id:'rules',name:'法则与技艺',types:['rule'],accent:'red'}
]};
export function validateAtlasLayout(layout,registry){
 check(object(layout)&&layout.version===1&&Array.isArray(layout.groups)&&layout.groups.length<=32,'图鉴分类格式无效');registryIndex(registry);const ids=new Set(),types=new Set();
 for(const g of layout.groups){check(object(g)&&/^[a-z][a-z0-9-]{0,39}$/.test(g.id)&&g.id!=='other'&&!ids.has(g.id)&&typeof g.name==='string'&&g.name.trim()&&g.name.length<=40&&Array.isArray(g.types)&&g.types.length>0,'图鉴分类名称或ID无效');ids.add(g.id);check(['jade','blue','purple','amber','red','slate'].includes(g.accent),'分类色无效');for(const t of g.types){check(registry.types.some(x=>x.id===t)&&!types.has(t),'图鉴类型缺失或重复归类：'+t);types.add(t);}}
 return copy(layout);
}
function groupFor(type,layout,registry){const seen=new Set();while(type&&!seen.has(type)){seen.add(type);const group=layout.groups.find(g=>g.types.includes(type));if(group)return group;type=registry.types.find(t=>t.id===type)?.parent;}return {id:'other',name:'其他档案',accent:'slate'};}
function refs(value,def,out=[],path=[]){if(value==null||!def)return out;if(def.type==='ref')out.push({id:value,path});else if(def.type==='refs')value.forEach((id,i)=>out.push({id,path:[...path,i]}));else if(def.type==='array')value.forEach((item,i)=>refs(item,def.items,out,[...path,i]));else if(def.fields&&object(value))for(const [key,child]of Object.entries(value))refs(child,def.fields[key],out,[...path,key]);return out;}
// This is a disposable projection, never another editable database. Filtering
// happens before search, category counts, links, snippets and serialized output.
export function createAtlas({view,context,layout=ATLAS_LAYOUT,authorizeRow,authorizeField,guard=()=>{}}){
 const config=validateAtlasLayout(layout,view.registry),{rows,definitions}=projectArchiveAccess({view,context,authorizeRow,authorizeField}),byId=new Map(rows.map(r=>[r.id,r]));
 const referencePaths=new Map(rows.map(r=>[r.id,refs(r.values,definitions.get(r.id)).filter(ref=>byId.has(ref.id))]));
 const links=new Map(rows.map(r=>[r.id,[...new Set(referencePaths.get(r.id).map(ref=>ref.id))]]));
 const target=id=>{const r=byId.get(id);return {id:r.id,table:r.table,revision:r.rev,name:r.values.名称??'未命名',kind:view.registry.tables.find(t=>t.id===r.table)?.name??'档案'};};
 const cards=rows.filter(r=>r.table==='objects').map(r=>{const g=groupFor(r.values.类型,config,view.registry),type=view.registry.types.find(t=>t.id===r.values.类型);return {id:r.id,revision:r.rev,name:r.values.名称??'未命名',type:r.values.类型??null,typeName:type?.name??'档案',category:g.id,accent:g.accent,tags:copy(r.values.标签??[]),summary:r.values.描述??'',aliases:copy(r.values.别名??[])};});
 const readGuard=()=>{const result=guard();check(!result||typeof result.then!=='function','同步图鉴需在宿主异步版本核验后读取');};
 const term=s=>String(s).normalize('NFKC').toLocaleLowerCase();
 return {
  scope:copy(context),
  list({query='',category=null,type=null,offset=0,limit=30}={}){readGuard();check(typeof query==='string'&&query.length<=300&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'图鉴查询参数无效');const words=term(query).split(/\s+/u).filter(Boolean);const matched=cards.filter(c=>(!type||c.type===type)&&words.every(w=>term(JSON.stringify(byId.get(c.id).values)).includes(w)));const selected=matched.filter(c=>!category||c.category===category);const groups=[...config.groups,{id:'other',name:'其他档案',accent:'slate'}].map(g=>({id:g.id,name:g.name,accent:g.accent,count:matched.filter(c=>c.category===g.id).length})).filter(g=>g.count>0);return {scope:copy(context),items:copy(selected.slice(offset,offset+limit)),total:selected.length,groups,hasMore:offset+limit<selected.length};},
  detail(id){
   readGuard();const row=byId.get(id);check(row,'档案不存在或不可读取');
   const related=rows.filter(r=>r.id!==id&&(links.get(r.id).includes(id)||links.get(id).includes(r.id)));
   // Edges come exclusively from authorized typed references. Co-participation
   // is labelled through its record; it does not invent a personal relationship.
   const neighbors=new Map();
   const connect=(other,via)=>{if(other===id||byId.get(other)?.table!=='objects')return;const item=neighbors.get(other)??{...target(other),via:[]};if(!item.via.some(x=>x.id===via.id))item.via.push(via);neighbors.set(other,item);};
   for(const other of related){if(other.table==='objects')connect(other.id,{id:other.id,label:'直接关联'});else for(const ref of links.get(other.id))connect(ref,{id:other.id,label:other.values.名称??'关联记录'});}
   return {scope:copy(context),record:copy(row),kind:target(id).kind,sections:copy(Object.entries(row.values).filter(([k])=>!['名称','类型','别名','标签'].includes(k)).map(([name,value])=>({name,value}))),related:copy(related.map(r=>({...target(r.id),values:r.values}))),links:copy(links.get(id)),references:copy(referencePaths.get(id).map(ref=>({path:ref.path,target:target(ref.id)}))),neighbors:copy([...neighbors.values()])};
  }
 };
}
