import {coreSourceContains} from './source-text.js';
import {check,copy,isObjectType,references,registryIndex,normalized} from './schema.js';

const kinds=['character','item','place','rule','organization'];
const text=x=>typeof x==='string'&&x.trim().length>0;
const distinct=xs=>Array.isArray(xs)&&xs.every(text)&&new Set(xs).size===xs.length;
const equalSet=(a,b)=>distinct(a)&&distinct(b)&&a.length===b.length&&a.every(x=>b.includes(x));
export const coreKind=(row,registry)=>kinds.find(kind=>isObjectType(registry,row,kind))??null;

// A preview only: references never silently expand the selected asset set.
export function coreSelection(view,objectIds,{linkIds=[],growthIds=[],instructions=''}={}){
 check(distinct(objectIds)&&objectIds.length>0,'请至少选择一个对象，且不要重复选择');
 check(distinct(linkIds)&&distinct(growthIds)&&typeof instructions==='string','基点选择格式无效');
 const byId=new Map(view.rows.map(row=>[row.id,row])),objects=objectIds.map(id=>{const row=byId.get(id);check(row?.table==='objects','所选对象不存在：'+id);return row;});
 const selected=new Set(objectIds),related=new Set(),links=[];
 for(const row of view.rows){
  const refs=[...new Set(references(row,view.registry))].filter(id=>byId.get(id)?.table==='objects');
  if(row.table==='objects'&&selected.has(row.id))for(const id of refs)if(!selected.has(id))related.add(id);
  if(['holdings','relations','facts'].includes(row.table)&&refs.some(id=>selected.has(id))){
   for(const id of refs)if(!selected.has(id))related.add(id);
   if(refs.length>=2)links.push({row:copy(row),members:refs,complete:refs.every(id=>selected.has(id))});
  }
 }
 const growth=view.rows.filter(row=>['growth','experiences'].includes(row.table)&&selected.has(row.values.主体));
 for(const id of linkIds)check(links.some(x=>x.row.id===id&&x.complete),'关联包含未选对象或已不存在，请补选对象或取消该关联：'+id);
 for(const id of growthIds)check(growth.some(row=>row.id===id),'成长不属于所选对象：'+id);
 return {objects:copy(objects),related:[...related].map(id=>copy(byId.get(id))),links,growth:copy(growth),
  source:{format:'tisya.core-selection/1',objects:objects.map(row=>({row:copy(row),kind:coreKind(row,view.registry),growth:growth.filter(x=>growthIds.includes(x.id)&&x.values.主体===row.id).map(copy)})),links:links.filter(x=>linkIds.includes(x.row.id)).map(x=>({row:copy(x.row),members:x.members})),instructions}};
}

function itemValid(item,basis){check(text(item?.name)&&text(item.value)&&text(item.evidence)&&coreSourceContains(basis,item.evidence),'基点项缺少本对象的连续原文依据');}
export function validateBundle(bundle,source,{assignIds=false}={}){
 check(text(bundle?.name)&&Array.isArray(bundle.members)&&Array.isArray(bundle.links),'整组基点草稿格式无效');
 check(equalSet(bundle.members.map(x=>x.sourceObject),source.objects.map(x=>x.row.id)),'基点成员与已选对象不一致');
 const result=copy(bundle);
 for(const member of result.members){
  const origin=source.objects.find(x=>x.row.id===member.sourceObject),basis=[origin.row.values,source.instructions];
  check(text(member.name)&&Array.isArray(member.traits)&&member.traits.length>0&&Array.isArray(member.growth),'每个基点成员须有核心项及成长列表');
  for(const item of member.traits)itemValid(item,basis);
  for(const item of member.growth){check(origin.growth.length,'未选择携带这个对象的成长');itemValid(item,[origin.growth.map(row=>row.values),source.instructions]);}
  for(const item of [...member.traits,...member.growth])if(assignIds)item.id=crypto.randomUUID();
  check(distinct([...member.traits,...member.growth].map(x=>x.id)),'核心项编号缺失或重复');
 }
 check(equalSet(result.links.map(x=>x.sourceRow),source.links.map(x=>x.row.id)),'基点关联与已选关联不一致');
 for(const link of result.links){const origin=source.links.find(x=>x.row.id===link.sourceRow);check(equalSet(link.members,origin.members),'基点关联不能更换对象');itemValid(link,[origin.row.values,source.instructions]);if(assignIds)link.id=crypto.randomUUID();}
 check(distinct(result.links.map(x=>x.id)),'关联编号缺失或重复');return result;
}

export function bundleReference(book,bundle,member){return book+' / '+bundle.id+'@'+bundle.version+'/'+member.sourceObject;}
function expressionAt(op,entry){
 check(Array.isArray(entry.path)&&entry.path.length>0&&entry.path.every(k=>text(k)&&!['__proto__','constructor','prototype'].includes(k)),'映射须提供明确字段路径');
 check(!['名称','类型','核心引用'].includes(entry.path[0]),'名称、类型或核心引用不能代替实际意义映射');
 let value=op.values;for(const key of entry.path){check(value&&typeof value==='object'&&Object.hasOwn(value,key),'映射字段不存在：'+entry.path.join('.'));value=value[key];}
 check(typeof value==='string'&&text(entry.expression)&&value.includes(entry.expression),'映射表达必须逐字存在于目标档案字段');
}
export function validateCoreMapping(proposal,bundle,book,{singleReference=null}={}){
 check(!singleReference||bundle.members.length===1,'单体映射只允许一个成员');
 const mapping=proposal.coreMapping,base=proposal.artifacts.base.changes;
 check(mapping&&Array.isArray(mapping.members)&&Array.isArray(mapping.links),'缺少逐项基点适配映射');
 check(base.every(op=>op.id.startsWith('new:'))&&proposal.artifacts.initial.changes.length===0,'整组适配只创建新原点；会话持有、知情和关系须另行确认开局');
 check(equalSet(mapping.members.map(x=>x.member),bundle.members.map(x=>x.sourceObject)),'适配映射遗漏或重复基点成员');
 check(distinct(mapping.members.map(x=>x.object)),'一个原点对象不能混作多个基点成员');
 const objects=new Map(base.filter(op=>op.table==='objects').map(op=>[op.id,op]));
 const ids=new Set(base.map(op=>op.id));for(const op of base){check(['objects','facts'].includes(op.table),'整组适配只能创建原点档案');const row={table:op.table,values:copy(op.values)};if(op.table==='objects')row.values.类型=registryIndex(proposal.artifacts.registry).types.get(normalized(row.values.类型))?.id;check(references(row,proposal.artifacts.registry).every(id=>ids.has(id)),'整组原点不得自动关联当前会话或旧世界的既有记录');check(Array.isArray(op.access?.knowers)&&!op.access.knowers.length,'新原点不自动授予当前人物知情');}
 const prefix=singleReference??(book+' / '+bundle.id+'@'+bundle.version+'/');for(const op of objects.values())if(op.values.核心引用?.startsWith(prefix))check(mapping.members.some(x=>x.object===op.id),'陪衬对象不得冒用基点成员引用');
 for(const member of bundle.members){
  const row=mapping.members.find(x=>x.member===member.sourceObject),op=objects.get(row.object),ref=singleReference??bundleReference(book,bundle,member);
  check(op,'适配成员指向的原点对象不存在');
  const type=registryIndex(proposal.artifacts.registry).types.get(normalized(op.values.类型));
  check(!member.kind||isObjectType(proposal.artifacts.registry,{table:'objects',values:{...op.values,类型:type?.id}},member.kind),'适配成员对象类别不符');
  check(op.values.核心引用===ref,'适配成员的基点引用不匹配');
  check([...objects.values()].filter(x=>x.values.核心引用===ref).length===1,'基点成员被重复绑定');
  check(Array.isArray(row.items)&&equalSet(row.items.map(x=>x.item),[...member.traits,...member.growth].map(x=>x.id)),'核心或成长意义的适配映射遗漏或重复');
  for(const item of row.items)expressionAt(op,item);
 }
 check(equalSet(mapping.links.map(x=>x.link),bundle.links.map(x=>x.id)),'关联意义的适配映射遗漏或重复');
 for(const link of bundle.links){const row=mapping.links.find(x=>x.link===link.id);check(Array.isArray(row.targets)&&row.targets.length>0,'关联意义缺少世界表达');const allowed=link.members.map(id=>mapping.members.find(x=>x.member===id).object);for(const target of row.targets){check(allowed.includes(target.object),'关联表达指向非关联成员');expressionAt(objects.get(target.object),target);}}
 return copy(mapping);
}
