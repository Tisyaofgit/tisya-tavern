import {copy,object,typeFields,validateRow} from './schema.js';
const MISSING=Symbol('missing'),DENIED=new Set(['__proto__','prototype','constructor']);
const requireQuery=(ok,code,message)=>{if(!ok){const e=Error(message);e.code=code;throw e;}};
export function projectArchiveAccess({view,context,authorizeRow,authorizeField,authorizeMetadata=null,sourceOrder=null}){
 requireQuery(typeof authorizeRow==='function'&&typeof authorizeField==='function','AUTHORIZATION_REQUIRED','图鉴必须绑定明确读取授权');
 const raw=copy(view),bound=copy(context),rows=[],definitions=new Map(),metadata=new Map();
 const authorized=(fn,...args)=>{const result=fn(...args);requireQuery(typeof result==='boolean','AUTHORIZATION_REQUIRED','读取授权必须返回明确布尔值');return result;};
 const approved=raw.rows.filter(row=>authorized(authorizeRow,copy(row),copy(bound))),visibleIds=new Set(approved.map(r=>r.id));
 requireQuery(visibleIds.size===approved.length,'INVALID_VIEW','档案视图包含重复身份');
 function projectValue(row,value,def,path){
  if(def.formula||!authorized(authorizeField,copy(row),copy(path),copy(bound)))return null;
  let effective=copy(def),projected=value;
  if(def.type==='ref'&&value!==MISSING&&value!==null&&!visibleIds.has(value))return null;
  if(def.type==='refs'&&Array.isArray(value))projected=value.filter(id=>visibleIds.has(id));
  if(def.type==='object'||def.type==='map'){
   const children=def.fields??(def.type==='map'?Object.fromEntries(Object.keys(object(value)?value:{}).map(k=>[k,def.items])):Object.fromEntries(Object.keys(object(value)?value:{}).map(k=>[k,{type:'json'}]))),fields={},values={};
   for(const [key,child]of Object.entries(children)){if(DENIED.has(key))continue;const item=projectValue(row,object(value)&&Object.hasOwn(value,key)?value[key]:MISSING,child,[...path,key]);if(item){fields[key]=item.def;if(item.value!==MISSING)values[key]=item.value;}}
   effective={...effective,fields};if(object(value))projected=values;
  }else if(def.type==='array'){
   // Array field authorization uses schema paths, without numeric indices.
   const items=Array.isArray(value)?value:[],projectedItems=items.map(v=>projectValue(row,v,def.items,path)).filter(Boolean),sample=projectValue(row,MISSING,def.items,path);
   effective={...effective,items:sample?.def??def.items};if(Array.isArray(value))projected=projectedItems.map(v=>v.value);
  }
  return {def:effective,value:projected};
 }
 for(const row of approved){
  requireQuery(row.referenceOnly!==true,'INVALID_VIEW','查询需要完整档案，不能以薄引用判断字段缺失');validateRow(raw.registry,row);requireQuery(Number.isSafeInteger(row.rev)&&row.rev>0,'INVALID_VIEW','档案修订无效');
  const table=raw.registry.tables.find(t=>t.id===row.table);requireQuery(table,'INVALID_VIEW','档案表结构不完整');const fields={},values={};
  for(const [name,originalDef]of Object.entries(table.fields)){
   const def=row.table==='objects'&&name==='属性'?{...originalDef,fields:typeFields(raw.registry,row.values.类型)}:originalDef;
   const field=projectValue(row,Object.hasOwn(row.values,name)?row.values[name]:MISSING,def,[name]);if(field){fields[name]=field.def;if(field.value!==MISSING)values[name]=field.value;}
  }
  if(authorizeMetadata&&authorized(authorizeMetadata,copy(row),copy(bound))){
   const details={access:copy(row.access),lockedFields:copy(row.lockedFields??[])};
   if(sourceOrder!==null){
    const position=key=>key!=null&&Object.hasOwn(sourceOrder,key)&&Number.isSafeInteger(sourceOrder[key])&&sourceOrder[key]>=0?sourceOrder[key]:null;
    const rowIndex=position(row.source),reviewIndex=position(bound.source);
    details.sourcePosition={rowFloor:rowIndex===null?null:rowIndex+1,reviewFloor:reviewIndex===null?null:reviewIndex+1,relation:rowIndex===null||reviewIndex===null?'unknown':rowIndex<reviewIndex?'earlier':rowIndex>reviewIndex?'later':'same'};
   }
   metadata.set(row.id,details);
  }
  definitions.set(row.id,{type:'object',fields});rows.push({id:row.id,rev:row.rev,table:row.table,source:row.source??null,values});
 }
 return {rows,definitions,metadata};
}
