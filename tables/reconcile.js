import {copy,check,object,sameDefinition,normalized,registryIndex,addTypes,typeFields,upgradeRegistry} from './schema.js';
// Resolve spelling aliases first. Extend only typed, optional fields; values never rename identity.
function inferred(value){
 if(value===null)return {type:'json'};
 if(Array.isArray(value)){check(value.length,'空数组的新字段须提供 items 定义');const defs=value.map(inferred);check(defs.every(d=>sameDefinition(d,defs[0])),'异构数组须提供明确模板');return {type:'array',items:defs[0]};}
 if(object(value))return {type:'object',fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,inferred(v)]))};
 const type={string:'text',number:'number',boolean:'boolean'}[typeof value];check(type,'未知值不能创建字段');return {type};
}
function align(values,fields,additions,path,{allowSchemaExtensions=true,allowAdditionalProperties=false}={}){
 const out={};for(const [key,value]of Object.entries(values)){
  const name=Object.keys(fields).find(k=>[k,...(fields[k].aliases??[])].some(n=>normalized(n)===normalized(key)))??key;
  check(!Object.hasOwn(out,name),'同一字段重复提交不同名称：'+path+name);
  if(!fields[name]){check(!['__proto__','constructor','prototype'].includes(name),'非法字段名');if(allowAdditionalProperties){out[key]=copy(value);continue;}check(allowSchemaExtensions,'未登记字段：'+path+name);fields[name]={...inferred(value),description:'归档依据发现的新字段'};additions.push(path+name);}
  const d=fields[name];out[name]=d.type==='object'&&d.fields&&object(value)?align(value,d.fields,additions,path+name+'.',{allowSchemaExtensions,allowAdditionalProperties:!allowSchemaExtensions&&d.additionalProperties===true}):copy(value);
 }return out;
}
// Add nested optional definitions without narrowing legacy open objects or changing value types.
export function fieldMerge(a,b,path){
 if(sameDefinition(a,b))return copy(a);
 const shape=d=>{const {fields,items,description,aliases,additionalProperties,capture,include,follow,...rest}=d;return rest;};
 check(sameDefinition(shape(a),shape(b)),'模板字段类型或约束冲突：'+path);
 for(const key of ['capture','include','follow'])check(b[key]===undefined||a[key]===undefined||sameDefinition(a[key],b[key]),'自动归档不能改写已有字段条件：'+path+'.'+key);
 const out={...a,...(a.follow===undefined&&b.follow!==undefined?{follow:b.follow}:{}),...(a.capture===undefined&&b.capture!==undefined?{capture:b.capture}:{}),...(a.include===undefined&&b.include!==undefined?{include:b.include}:{}),aliases:[...new Set([...(a.aliases??[]),...(b.aliases??[])])]};
 if(a.fields||b.fields){check(a.type==='object','仅对象可以扩展子字段：'+path);const fields=copy(a.fields??{});for(const [k,d]of Object.entries(b.fields??{})){if(fields[k])fields[k]=fieldMerge(fields[k],d,path+'.'+k);else {check(!d.required,'自动新增子字段须为可选：'+path+'.'+k);fields[k]=copy(d);}}out.fields=fields;if(!a.fields||!b.fields||a.additionalProperties||b.additionalProperties)out.additionalProperties=true;}
 if(a.items||b.items){check(a.items&&b.items,'集合缺少 items：'+path);out.items=fieldMerge(a.items,b.items,path+'[]');}
 return out;
}
export function reconcileProposal(previous,raw,{allowSchemaExtensions=true,inferSchemaFields=allowSchemaExtensions}={}){
 const proposal=copy(raw);check(allowSchemaExtensions||!(proposal.templates?.length),'本任务不能扩展模板');check(allowSchemaExtensions||!(proposal.schemaChanges?.length),'本任务不能扩展模板');const registry=addTypes(previous,proposal.templates??[]),extensions=registry.types.filter(t=>!previous.types.some(old=>old.id===t.id)).map(t=>t.id);
 for(const change of proposal.schemaChanges??[]){
  check(object(change)&&['table','type'].includes(change.kind),'模板扩展缺少 kind');const list=registry[change.kind==='table'?'tables':'types'];
  if(change.definition){const def=copy(change.definition);check(!list.some(x=>x.id===def.id),'新增模板 ID 已存在');if(change.kind==='table')check(def.owner==='archive','新业务表只能由归档填写');else check(def.parent&&registry.types.some(t=>t.id===def.parent),'新类型须引用父模板');list.push(def);extensions.push(def.id);}
  else {const item=list.find(x=>x.id===change.id);check(item&&object(change.fields),'扩展目标不存在');for(const [key,def]of Object.entries(change.fields)){check(!def.required,'自动新增字段须为可选');if(item.fields[key]){const merged=fieldMerge(item.fields[key],def,item.id+'.'+key);if(!sameDefinition(merged,item.fields[key]))extensions.push(item.id+'.'+key);item.fields[key]=merged;}else {item.fields[key]=copy(def);extensions.push(item.id+'.'+key);}}}
 }
 let index=registryIndex(registry);
 for(const op of proposal.changes??[]){const table=index.tables.get(normalized(op.table));check(table,'未知表须提供 schemaChanges 定义：'+op.table);op.table=table.id;check(object(op.values),'修改缺少 values');
  // Attributes belong to the registered object subtype, not to every object.
  const attrs=op.table==='objects'?op.values.属性:undefined;const values={...op.values};if(attrs!==undefined)delete values.属性;
  op.values=align(values,table.fields,extensions,table.id+'.',{allowSchemaExtensions:allowSchemaExtensions&&inferSchemaFields});
  if(attrs!==undefined){const old=raw.currentRows?.find(r=>r.id===op.id),submittedType=Object.hasOwn(op.values,'类型'),typeId=op.values.类型??old?.values.类型;const type=index.types.get(normalized(typeId??''));check(type,'对象属性必须指定已登记类型');if(submittedType||!old)op.values.类型=type.id;const inherited=typeFields(registry,type.id);const before=new Set(Object.keys(inherited));op.values.属性=align(attrs,inherited,extensions,type.id+'.',{allowSchemaExtensions:allowSchemaExtensions&&inferSchemaFields});for(const [k,d]of Object.entries(inherited))if(!before.has(k)||Object.hasOwn(type.fields,k))type.fields[k]=d;}
 }
 for(const kind of ['tables','types'])for(const item of registry[kind]){const old=previous[kind].find(x=>x.id===item.id);if(old&&!sameDefinition({...item,version:old.version},old))item.version=old.version+1;}
 registryIndex(registry);return {registry,proposal,extensions};
}
export function mergeRegistries(current,incoming){
 const merged=upgradeRegistry(current);incoming=upgradeRegistry(incoming);

 for(const kind of ['tables','types'])for(const item of incoming[kind]){const old=merged[kind].find(x=>x.id===item.id);if(!old){merged[kind].push(copy(item));continue;}check(old.name===item.name&&old.parent===item.parent&&old.owner===item.owner,'共享模板身份冲突：'+item.id);old.aliases=[...new Set([...old.aliases,...item.aliases])];for(const [k,d]of Object.entries(item.fields))old.fields[k]=old.fields[k]?fieldMerge(old.fields[k],d,item.id+'.'+k):copy(d);old.version=Math.max(old.version,item.version);}
 registryIndex(merged);return merged;
}
