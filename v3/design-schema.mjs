import {reconcileProposal,fieldMerge} from '../tables/reconcile.js';
import {registryIndex,sameDefinition,typeFields,normalized,references} from '../tables/schema.js';
const copy=structuredClone,object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const reserved=new Set(['native_cells','preferences']);
const protectedFields=new Set(['原文引用','原文段号','原生引用']);
function safeFields(fields){for(const [name,definition]of Object.entries(fields??{})){check(!protectedFields.has(name),'初始化扩展不能定义系统维护字段：'+name);if(definition.fields)safeFields(definition.fields);if(definition.items?.fields)safeFields(definition.items.fields);}}
export function validateDesignDeclarations({templates=[],schemaChanges=[]}={}){
 check(Array.isArray(templates)&&Array.isArray(schemaChanges),'初始化结构定义须为列表');
 check(templates.length+schemaChanges.length<=100,'初始化结构定义过多');
 for(const template of templates)safeFields(template.fields);
 for(const change of schemaChanges){check(object(change)&&['table','type'].includes(change.kind),'初始化结构定义缺少 kind');const id=change.definition?.id??change.id;check(change.kind!=='table'||!reserved.has(id),'初始化不能扩展原生变量或用户偏好结构');safeFields(change.definition?.fields??change.fields);}
}
/** Additive portable registry merge. Old books without a registry retain the host defaults. */
export function mergeDefinitionRegistries(base,...registries){
 const result=copy(base);registryIndex(result);
 for(const registry of registries.filter(Boolean)){registryIndex(registry);for(const kind of ['tables','types'])for(const incoming of registry[kind]){const prior=result[kind].find(item=>item.id===incoming.id);if(!prior){check(kind!=='tables'||incoming.owner==='archive','新增子表只能由档案服务维护');result[kind].push(copy(incoming));continue;}check(prior.name===incoming.name&&prior.owner===incoming.owner&&prior.parent===incoming.parent,'定义结构身份冲突：'+incoming.id);for(const [key,field]of Object.entries(incoming.fields)){if(reserved.has(incoming.id)&&kind==='tables')check(sameDefinition(prior.fields[key],field),'定义不能改变原生或偏好结构');if(!prior.fields[key])check(!field.required,'定义新增字段须为可选：'+incoming.id+'.'+key);prior.fields[key]=prior.fields[key]?fieldMerge(prior.fields[key],field,incoming.id+'.'+key):copy(field);}prior.aliases=[...new Set([...prior.aliases,...incoming.aliases])];prior.version=Math.max(prior.version,incoming.version);}}
 registryIndex(result);return result;
}
/** A full Genesis registry is a declaration source, never a replacement registry. */
export function registryDesignDeclarations(previous,incoming){
 registryIndex(incoming);
 const preserve=(before,after,path)=>{if(object(before)){check(object(after),'设计须保留已有结构：'+path);for(const [key,value]of Object.entries(before))preserve(value,after[key],path+'.'+key);}else check(sameDefinition(before,after),'设计须保留已有结构：'+path);};
 for(const kind of ['tables','types'])for(const item of previous[kind]){const next=incoming[kind].find(row=>row.id===item.id);check(next,'设计须保留已有结构：'+item.id);for(const [key,value]of Object.entries(item)){if(key==='version')check(next.version>=value,'设计不能降低结构版本：'+item.id);else preserve(value,next[key],item.id+'.'+key);}}
 const merged=mergeDefinitionRegistries(previous,incoming),templates=[],schemaChanges=[];
 for(const kind of ['tables','types'])for(const item of merged[kind]){const prior=previous[kind].find(row=>row.id===item.id);if(!prior){if(kind==='types')templates.push(copy(item));else schemaChanges.push({kind:'table',definition:copy(item)});continue;}const fields=Object.fromEntries(Object.entries(item.fields).filter(([key,value])=>!sameDefinition(prior.fields[key],value)));if(Object.keys(fields).length)schemaChanges.push({kind:kind==='types'?'type':'table',id:item.id,fields:copy(fields)});}
 validateDesignDeclarations({templates,schemaChanges});return {templates,schemaChanges};
}
export function validateDesignOwners(prepared){
 const owners=new Set(prepared.rows.filter(row=>row.table==='objects').map(row=>row.id));
 for(const change of prepared.commit.changes){const row=change.after;if(row&&prepared.registry.tables.find(table=>table.id===row.table)?.definitionExtension)check(references(row,prepared.registry).some(id=>owners.has(id)),'扩展子表记录须以 ref/refs 引用所属对象：'+row.values.名称);}
}
function assertClearInferredValues(registry,proposal){
 const clear=(value,path)=>{check(value!==null&&(!object(value)||Object.keys(value).length>0),'未知字段类型不明确，请在 schemaChanges 中声明：'+path);if(Array.isArray(value))for(const item of value)clear(item,path+'[]');else if(object(value))for(const [key,item]of Object.entries(value))clear(item,path+'.'+key);};
 const inspect=(values,fields,path)=>{for(const [key,value]of Object.entries(values??{})){const name=Object.keys(fields).find(name=>[name,...(fields[name].aliases??[])].some(alias=>normalized(alias)===normalized(key))),field=fields[name];if(!field)clear(value,path+'.'+key);else if(field.type==='object'&&field.fields&&object(value))inspect(value,field.fields,path+'.'+name);}};
 const index=registryIndex(registry);for(const op of proposal.changes??[]){const table=index.tables.get(normalized(op.table));if(!table)continue;const values={...op.values};if(table.id==='objects'){delete values.属性;const type=op.values.类型??proposal.currentRows?.find(row=>row.id===op.id)?.values.类型,registered=index.types.get(normalized(type??''));if(registered&&object(op.values.属性))inspect(op.values.属性,typeFields(registry,registered.id),registered.id);}inspect(values,table.fields,table.id);}
}
/** Freeze inferred draft fields as explicit proposals before review; never writes a registry. */
export function designSchemaDraft(registry,proposal,{infer=true}={}){
 validateDesignDeclarations(proposal);proposal=copy(proposal);for(const change of proposal.schemaChanges??[])if(change.kind==='table'&&change.definition&&!registry.tables.some(t=>t.id===change.definition.id))change.definition.definitionExtension=true;
 const explicit=reconcileProposal(registry,{...proposal,changes:[]},{allowSchemaExtensions:true,inferSchemaFields:false}).registry;
 if(infer)assertClearInferredValues(explicit,proposal);
 const prepared=reconcileProposal(registry,proposal,{allowSchemaExtensions:true,inferSchemaFields:infer}),schemaChanges=[],templates=[],schemaReview=[];
 for(const kind of ['tables','types'])for(const item of prepared.registry[kind]){const previous=registry[kind].find(old=>old.id===item.id),declared=explicit[kind].find(old=>old.id===item.id);if(!previous){if(kind==='types')templates.push(copy(item));else schemaChanges.push({kind:'table',definition:copy(item)});schemaReview.push({kind:kind==='types'?'type':'table',path:item.id,name:item.name,inferred:false,definition:copy(item)});continue;}const fields={};for(const [name,definition]of Object.entries(item.fields)){if(sameDefinition(previous.fields[name],definition))continue;fields[name]=copy(definition);schemaReview.push({kind:'field',owner:kind==='types'?'type':'table',path:item.id+'.'+name,name,inferred:!sameDefinition(declared?.fields[name],definition),definition:copy(definition)});}if(Object.keys(fields).length)schemaChanges.push({kind:kind==='types'?'type':'table',id:item.id,fields});}
 validateDesignDeclarations({templates,schemaChanges});
 return {registry:prepared.registry,proposal:{...prepared.proposal,templates,schemaChanges},schemaReview};
}
