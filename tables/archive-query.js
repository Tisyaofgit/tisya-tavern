import {projectArchiveAccess} from './archive-access.js';
import {copy,object,typeFields,valueValid,sameDefinition,validateRow} from './schema.js';

const MISSING=Symbol('missing'),DENIED=new Set(['__proto__','prototype','constructor']);
export class ArchiveQueryError extends Error{constructor(code,message){super(message);this.name='ArchiveQueryError';this.code=code;}}
const requireQuery=(condition,code,message)=>{if(!condition)throw new ArchiveQueryError(code,message);};
const stable=value=>JSON.stringify(value,(_,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const pathKey=path=>JSON.stringify(path);
export function archiveFieldPath(value,{allowSelf=false}={}){
 const path=Array.isArray(value)?copy(value):typeof value==='string'?value.split('.'):null;
 requireQuery(path&&path.length<=12&&(allowSelf||path.length>0)&&path.every(k=>typeof k==='string'&&k.length>0&&k.length<=200&&!DENIED.has(k)),'INVALID_FIELD','字段路径无效或不可查询');return path;
}
const atPath=(value,path)=>{for(const key of path){if(!object(value)||!Object.hasOwn(value,key))return MISSING;value=value[key];}return value;};
function defAt(def,path){for(const key of path){if(!def?.fields||!Object.hasOwn(def.fields,key))return null;def=def.fields[key];}return def;}
const arrayItem=def=>def.type==='array'?def.items:def.type==='texts'?{type:'text'}:def.type==='refs'?{type:'ref'}:null;
const operations=def=>['exists','eq','ne','in',...(['number','duration'].includes(def.type)?['gt','gte','lt','lte']:[]),...(['text','texts','refs','array'].includes(def.type)?['contains']:[]),...(arrayItem(def)?['any','all']:[])];
const exactKeys=(input,allowed)=>requireQuery(object(input)&&Object.keys(input).every(k=>allowed.includes(k)&&!DENIED.has(k)),'INVALID_QUERY','查询参数无效');

function compileWhere(node,roots,depth=0,counter={count:0}){
 requireQuery(depth<=8&&++counter.count<=64&&object(node),'INVALID_QUERY','筛选条件过深、过多或无效');
 if(Object.hasOwn(node,'and')||Object.hasOwn(node,'or')){
  const mode=Object.hasOwn(node,'and')?'and':'or';exactKeys(node,[mode]);requireQuery(Array.isArray(node[mode])&&node[mode].length>0&&node[mode].length<=32,'INVALID_QUERY','组合条件必须是非空列表');
  const children=node[mode].map(n=>compileWhere(n,roots,depth+1,counter));return value=>mode==='and'?children.every(fn=>fn(value)):children.some(fn=>fn(value));
 }
 const path=archiveFieldPath(node.field,{allowSelf:true}),defs=roots.map(d=>defAt(d,path)).filter(Boolean);
 requireQuery(defs.length>0,'INVALID_FIELD','字段路径无效或不可查询');
 if(Object.hasOwn(node,'any')||Object.hasOwn(node,'all')){
  const mode=Object.hasOwn(node,'any')?'any':'all';exactKeys(node,['field',mode]);const items=defs.map(arrayItem);requireQuery(items.every(Boolean),'TYPE_MISMATCH','any/all仅用于已登记的数组字段');
  const predicate=compileWhere(node[mode],items,depth+1,counter);return value=>{const array=atPath(value,path);return Array.isArray(array)&&(mode==='any'?array.some(predicate):array.every(predicate));};
 }
 exactKeys(node,['field','op','value']);requireQuery(!['any','all'].includes(node.op)&&defs.every(d=>operations(d).includes(node.op)),'TYPE_MISMATCH','该字段不支持所选操作符');
 if(node.op==='exists'){requireQuery(typeof node.value==='boolean','TYPE_MISMATCH','exists需要布尔值');return value=>(atPath(value,path)!==MISSING)===node.value;}
 const expected=node.value;
 if(node.op==='in')requireQuery(Array.isArray(expected)&&expected.length<=50&&expected.every(v=>defs.every(d=>valueValid(v,d))),'TYPE_MISMATCH','in的候选值类型无效');
 else if(node.op==='contains')requireQuery(defs.every(d=>valueValid(expected,arrayItem(d)??{type:'text'})),'TYPE_MISMATCH','contains的匹配值类型无效');
 else requireQuery(Object.hasOwn(node,'value')&&defs.every(d=>valueValid(expected,d)),'TYPE_MISMATCH','筛选值与字段类型不符');
 return value=>{const actual=atPath(value,path);if(actual===MISSING)return false;
  switch(node.op){case'eq':return sameDefinition(actual,expected);case'ne':return !sameDefinition(actual,expected);case'in':return expected.some(v=>sameDefinition(actual,v));case'contains':return typeof actual==='string'?actual.includes(expected):Array.isArray(actual)&&actual.some(v=>sameDefinition(v,expected));case'gt':return typeof actual==='number'&&actual>expected;case'gte':return typeof actual==='number'&&actual>=expected;case'lt':return typeof actual==='number'&&actual<expected;case'lte':return typeof actual==='number'&&actual<=expected;default:return false;}
 };
}

// The caller is a trusted host adapter. Model arguments never include policies,
// world/branch/time, or a replacement view. No authorization callback means no API.
export function createArchiveQuerySession({view,context,authorizeRow,authorizeField,authorizeMetadata=null,sourceOrder=null,guard,readSource=null,limits={}}){
 requireQuery(view&&Array.isArray(view.rows)&&object(view.registry)&&Array.isArray(view.registry.tables)&&Array.isArray(view.registry.types)&&object(context)&&typeof context.world==='string'&&typeof context.branch==='string'&&typeof context.task==='string'&&Object.hasOwn(context,'storyPoint')&&typeof guard==='function'&&typeof authorizeRow==='function'&&typeof authorizeField==='function','AUTHORIZATION_REQUIRED','档案查询尚未绑定宿主视图与读取授权');
 const budget={maxCalls:24,maxChars:200000,pageChars:12000,ttlMs:120000,maxExpandDepth:3,...limits};
 requireQuery(Object.values(budget).every(n=>Number.isSafeInteger(n)&&n>0)&&budget.pageChars<=budget.maxChars&&budget.maxExpandDepth<=6,'INVALID_BUDGET','查询预算无效');
 requireQuery(authorizeMetadata===null||typeof authorizeMetadata==='function','AUTHORIZATION_REQUIRED','档案元数据授权无效');
 const bound=copy(context),snapshot=crypto.randomUUID(),started=Date.now(),raw=copy(view),cursors=new Map(),sourceCache=new Map(),auditTrail=[];let calls=0,characters=0,closed=false;
 const {rows,definitions,metadata}=projectArchiveAccess({view:raw,context:bound,authorizeRow,authorizeField,authorizeMetadata,sourceOrder});
 rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);const byId=new Map(rows.map(r=>[r.id,r]));
 const scopeRows=path=>{
  if(path==='/'||path===undefined)return rows;
  const parts=String(path).split('/');requireQuery(parts[0]===''&&parts[1]==='tables'&&[3,5].includes(parts.length),'INVALID_PATH','目录路径无效或不可读取');
  const tableRows=rows.filter(r=>r.table===parts[2]);requireQuery(tableRows.length>0,'INVALID_PATH','目录路径无效或不可读取');
  if(parts.length===3)return tableRows;
  requireQuery(parts[3]==='types'&&parts[2]==='objects','INVALID_PATH','目录路径无效或不可读取');const selected=tableRows.filter(r=>r.values.类型===parts[4]);requireQuery(selected.length>0,'INVALID_PATH','目录路径无效或不可读取');return selected;
 };
 function page(items,query,{cursor,limit=20}={}){
  requireQuery(Number.isInteger(limit)&&limit>=1&&limit<=100,'INVALID_QUERY','每页数量须为1至100');const fingerprint=stable(query);let offset=0;
  if(cursor!==undefined){const prior=cursors.get(cursor);requireQuery(prior&&prior.fingerprint===fingerprint,'INVALID_CURSOR','分页已失效或不属于本次查询');offset=prior.offset;}
  const end=Math.min(offset+limit,items.length),has_more=end<items.length;let next_cursor=null;
  if(has_more){next_cursor=crypto.randomUUID();cursors.set(next_cursor,{fingerprint,offset:end});}
  return {items:copy(items.slice(offset,end)),total:items.length,has_more,next_cursor};
 }
 async function run(fn,method,input){
  const entry={method,input:copy(input),at:new Date().toISOString()};
  try{
  requireQuery(!closed&&Date.now()-started<=budget.ttlMs,'SNAPSHOT_EXPIRED','查询快照已过期，请重新建立查询');
  requireQuery(calls<budget.maxCalls,'BUDGET_EXCEEDED','本轮查询次数已用尽');calls++;await guard(copy(bound));
  const result=await fn();await guard(copy(bound));requireQuery(!closed&&Date.now()-started<=budget.ttlMs,'SNAPSHOT_EXPIRED','查询快照已过期，请重新建立查询');
  const response={status:'ok',snapshot,scope:copy(bound),...result},size=JSON.stringify(response).length;
  requireQuery(characters<budget.maxChars,'BUDGET_EXCEEDED','本轮返回内容总预算已用尽');
  requireQuery(size<=budget.pageChars,'QUERY_TOO_LARGE','本次返回超出单页上限；请用select选择所需叶字段、缩小limit或expandDepth后重查。字段路径可通过describe_fields发现；原文不会截断。');
  requireQuery(characters+size<=budget.maxChars,'BUDGET_EXCEEDED','本轮返回内容总预算不足');characters+=size;entry.status='ok';entry.ids=[...new Set((response.records??response.items??[]).map(r=>r.id).filter(Boolean))];entry.hasMore=response.has_more??false;entry.characters=size;auditTrail.push(entry);return copy(response);
  }catch(error){entry.status='error';entry.code=error.code??'HOST_ERROR';auditTrail.push(entry);throw error;}
 }
 function selectFields(selected,select){
  if(select===undefined)return null;requireQuery(Array.isArray(select)&&select.length>0&&select.length<=32,'INVALID_QUERY','字段选择数量无效');
  return select.map(value=>{const path=archiveFieldPath(value);requireQuery(selected.some(row=>defAt(definitions.get(row.id),path)),'INVALID_FIELD','字段路径无效或不可查询');return path;});
 }
 const valuesFor=(row,paths)=>paths.map(path=>{const def=defAt(definitions.get(row.id),path),value=def?atPath(row.values,path):MISSING;return {path:copy(path),present:value!==MISSING,...(value!==MISSING?{value:copy(value)}:{})};});
 function references(row){const found=[];const walk=(v,d)=>{if(v===null||v===undefined||!d)return;if(d.type==='ref'){if(byId.has(v))found.push(v);}else if(d.type==='refs'){for(const id of v)if(byId.has(id))found.push(id);}else if(d.type==='array'){for(const item of v)walk(item,d.items);}else if(d.fields&&object(v)){for(const [k,value]of Object.entries(v))walk(value,d.fields[k]);}};walk(row.values,definitions.get(row.id));return found;}
 return {
  async assertFresh(){requireQuery(!closed&&Date.now()-started<=budget.ttlMs,'SNAPSHOT_EXPIRED','查询快照已过期，请重新建立查询');await guard(copy(bound));requireQuery(!closed&&Date.now()-started<=budget.ttlMs,'SNAPSHOT_EXPIRED','查询快照已过期，请重新建立查询');},
  list_archive(input={}){input=copy(input);return run(()=>{exactKeys(input,['path','depth','cursor','limit']);requireQuery(input.depth===undefined||input.depth===1,'INVALID_QUERY','目录每次展开一层');const path=input.path??'/',selected=scopeRows(path);let items;
   if(path==='/')items=[...new Set(selected.map(r=>r.table))].sort().map(id=>({id:'table:'+id,name:raw.registry.tables.find(t=>t.id===id).name,path:'/tables/'+id,kind:'directory',expandable:true}));
   else if(path==='/tables/objects')items=[...new Set(selected.map(r=>r.values.类型).filter(x=>typeof x==='string'))].sort().map(id=>({id:'type:'+id,name:raw.registry.types.find(t=>t.id===id)?.name??id,path:path+'/types/'+id,kind:'directory',expandable:true}));
   else items=selected.map(r=>({id:r.id,rev:r.rev,name:r.values.名称??r.id,kind:'record',expandable:false}));
   const {cursor,...query}=input;return page(items,{method:'list_archive',...query},input);
  },'list_archive',input);},
  describe_fields(input={}){input=copy(input);return run(()=>{exactKeys(input,['path','cursor','limit']);const selected=scopeRows(input.path??'/'),fields=new Map();
   const itemFields=def=>def.fields?Object.entries(def.fields).map(([name,d])=>({path:[name],type:d.type,operators:operations(d),...(d.fields?{fields:itemFields(d)}:{}),...(arrayItem(d)?{items:itemFields(arrayItem(d))}:{} )})):[];
   const walk=(def,path,table)=>{if(path.length){const key=stable([table,path,def.type]);fields.set(key,{table,path:copy(path),type:def.type,nullable:def.nullable===true||def.type==='json',operators:operations(def),...(def.description?{description:def.description}:{}),...(arrayItem(def)?{itemFields:itemFields(arrayItem(def))}:{})});}if(def.fields)for(const [k,d]of Object.entries(def.fields))walk(d,[...path,k],table);};
   for(const row of selected)walk(definitions.get(row.id),[],row.table);const items=[...fields.values()].sort((a,b)=>stable(a.path).localeCompare(stable(b.path)));const {cursor,...query}=input;return page(items,{method:'describe_fields',...query},input);
  },'describe_fields',input);},
  search_archive(input={}){input=copy(input);return run(()=>{exactKeys(input,['path','query','ids','where','select','cursor','limit']);const selected=scopeRows(input.path??'/'),paths=selectFields(selected,input.select),predicate=input.where===undefined?()=>true:compileWhere(input.where,selected.map(r=>definitions.get(r.id)));
   requireQuery(input.query===undefined||typeof input.query==='string'&&input.query.length<=300,'INVALID_QUERY','关键词过长或无效');const words=(input.query??'').normalize('NFKC').toLocaleLowerCase().split(/\s+/u).filter(Boolean);
   requireQuery(input.ids===undefined||Array.isArray(input.ids)&&input.ids.length<=100&&input.ids.every(id=>typeof id==='string'&&id.length>0),'INVALID_QUERY','ID筛选须为最多100个稳定ID');
   const found=selected.filter(r=>(input.ids===undefined||input.ids.includes(r.id))&&predicate(r.values)&&words.every(q=>(r.id+' '+JSON.stringify(r.values)).normalize('NFKC').toLocaleLowerCase().includes(q))).map(r=>({id:r.id,rev:r.rev,table:r.table,source:r.source,fields:valuesFor(r,paths??[['名称']])}));
   const {cursor,...query}=input;return page(found,{method:'search_archive',...query},input);
  },'search_archive',input);},
  read_archive(input={}){input=copy(input);return run(async()=>{exactKeys(input,['id','select','source','expandDepth','cursor','limit']);const root=byId.get(input.id);requireQuery(root,'NOT_AVAILABLE','记录不存在或不可读取');requireQuery(input.source===undefined||typeof input.source==='boolean','INVALID_QUERY','原文选项无效');
   const depth=input.expandDepth??0;requireQuery(Number.isInteger(depth)&&depth>=0&&depth<=budget.maxExpandDepth,'INVALID_QUERY','关联展开深度无效');
   const selected=[root],visited=new Set([root.id]);for(let at=0,level=0;level<depth;level++){const end=selected.length;for(;at<end;at++)for(const id of references(selected[at]))if(!visited.has(id)){visited.add(id);selected.push(byId.get(id));}requireQuery(selected.length<=100,'BUDGET_EXCEEDED','关联展开过多，请缩小深度');}
   const paths=selectFields(selected,input.select),segments=[];
   for(const row of selected){const fields=valuesFor(row,paths??Object.keys(definitions.get(row.id).fields).map(k=>[k]));for(const field of fields){const entry={id:row.id,rev:row.rev,table:row.table,source:row.source,...field};
     if(field.present&&typeof field.value==='string'){const text=field.value;let start=0;const boundaries=[...text.matchAll(/\r?\n[ \t]*\r?\n/g)].map(m=>m.index+m[0].length);if(boundaries.at(-1)!==text.length)boundaries.push(text.length);for(const end of boundaries){segments.push({...entry,value:text.slice(start,end),start,end,totalChars:text.length});start=end;}}
     else segments.push(entry);
    }
    if(input.source){requireQuery(typeof readSource==='function','SOURCE_UNAVAILABLE','本任务尚未获得来源原文读取授权');if(!sourceCache.has(row.id))sourceCache.set(row.id,(async()=>{const source=copy(await readSource(row.id,copy(bound)));requireQuery(source&&typeof source.text==='string'&&typeof source.id==='string','SOURCE_UNAVAILABLE','来源原文不可读取');return source;})());const supplied=await sourceCache.get(row.id);requireQuery(supplied&&typeof supplied.text==='string'&&typeof supplied.id==='string','SOURCE_UNAVAILABLE','来源原文不可读取');let start=0;const ends=[...supplied.text.matchAll(/\r?\n[ \t]*\r?\n/g)].map(m=>m.index+m[0].length);if(ends.at(-1)!==supplied.text.length)ends.push(supplied.text.length);for(const end of ends){segments.push({id:row.id,sourceDocument:supplied.id,path:null,value:supplied.text.slice(start,end),start,end,totalChars:supplied.text.length});start=end;}}
   }
   const {cursor,...query}=input;return {...page(segments,{method:'read_archive',...query},input),records:selected.map(r=>({id:r.id,rev:r.rev,...copy(metadata.get(r.id)??{})})),content:'exact-fields-and-whole-paragraphs'};
  },'read_archive',input);},
  diagnostics(){return copy(auditTrail);},
  dispose(){closed=true;cursors.clear();sourceCache.clear();},
  metrics(){return {calls,characters,closed};},
 };
}
