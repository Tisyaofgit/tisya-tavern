import {CAPTURE_RULES} from './conditions.js';
const own=(o,k)=>Object.hasOwn(o,k),missing=Symbol('missing');
const safeJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\{/g,'\\u007b');
// JSON strings remain typed; literal ~, null, false and numeric-looking text are quoted.
export function pipeCell(value){
 if(value===undefined||value===missing)return '~';
 if(typeof value!=='string')return JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/\{\{/g,'\\u007b\\u007b');
 if(!value||value.trim()!==value||/[|\r\n"\\\[\]{}<>]/u.test(value)||value==='~'||/^(?:null|true|false|[-+]?\d)/u.test(value))return safeJSON(value);
 return value;
}
function split(line){const cells=[];let start=0,quote=false,escape=false,depth=0;for(let i=0;i<line.length;i++){const c=line[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;}else if(c==='"')quote=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}')depth--;else if(c==='|'&&depth===0){cells.push(line.slice(start,i));start=i+1;}if(depth<0)throw Error('PIPES括号不匹配');}if(quote||depth||escape)throw Error('PIPES单元格不完整');cells.push(line.slice(start));return cells;}
function cell(text){if(text==='~')return missing;if(text.startsWith('"')||text.startsWith('{')||text.startsWith('[')||text==='null'||text==='true'||text==='false'||/^-?\d/.test(text))return JSON.parse(text);return text;}
const line=(label,cells)=>label+'：'+cells.map(pipeCell).join('|');
function records(text,kind){const lines=text.trim().split(/\r?\n/);if(lines.shift()!=='[PIPES.'+kind+'/1]'||lines.pop()!=='[/PIPES.'+kind+'/1]')throw Error('PIPES协议边界无效');return lines.filter(Boolean).map(s=>{const i=s.indexOf('：');if(i<1)throw Error('PIPES记录缺少标签');return {label:s.slice(0,i),cells:split(s.slice(i+1)).map(cell)};});}
export const PIPES_GUIDE='PIPES/1：标签：单元格|单元格；普通文字裸写，含分隔符/换行/保留值用JSON字符串，集合用JSON。~仅代表字段缺失，null/false/0/空串与空集合各自保留。列按表声明；档前7格为原序/ID/修订/来源/权限编号/其他元数据/表ID，随后依列取值，省略的末尾格均缺失。权限编号只引用明确权限记录，不授予人物知识。referenceOnly仅供名称解析，其余档案未展开，不能据此编造内容。字段格为名称/类型/其他约束/录入模板/注入条件；selected表示所属记录已选中；~表示未提供，程序再按模板默认处理。ref/refs的follow=record展开关联记录，identity仅带名称与类型，不递归拉入整张关系网。';
export function rowsToPipes(rows){
 const out=['[PIPES.ROWS/1]'],tables=new Map(),permissions=new Map();
 for(const row of rows){if(!tables.has(row.table))tables.set(row.table,[]);const keys=tables.get(row.table);for(const key of Object.keys(row.values))if(!keys.includes(key))keys.push(key);const policy=JSON.stringify(row.access);if(!permissions.has(policy))permissions.set(policy,'a'+permissions.size);}
 for(const [value,id]of permissions)out.push(line('权限',[id,JSON.parse(value)]));
 for(const [table,keys]of tables)out.push(line('列',[table,...keys]));
 rows.forEach((row,index)=>{
  const {id,table,rev,source,access,values,...extra}=row,tail=tables.get(table).map(key=>own(values,key)?values[key]:missing);while(tail.at(-1)===missing)tail.pop();
  out.push(line('档',[index,id,rev,source,permissions.get(JSON.stringify(access)),Object.keys(extra).length?extra:missing,table,...tail]));
 });out.push('[/PIPES.ROWS/1]');return out.join('\n');
}
export function rowsFromPipes(text){
 const tables=new Map(),permissions=new Map(),rows=[];
 for(const {label,cells:c}of records(text,'ROWS')){
  if(label==='权限'){if(c.length!==2||permissions.has(c[0]))throw Error('PIPES权限记录冲突');permissions.set(c[0],c[1]);}
  else if(label==='列'){if(tables.has(c[0])||new Set(c.slice(1)).size!==c.length-1)throw Error('PIPES列定义冲突');tables.set(c[0],c.slice(1));}
  else if(label==='档'){
   const [index,id,rev,source,acl,extra,table,...values]=c,keys=tables.get(table);if(!keys||!permissions.has(acl)||values.length>keys.length||!Number.isInteger(index)||rows[index])throw Error('PIPES档案结构无效');
   const row={...(extra===missing?{}:extra),id,table,values:{},access:structuredClone(permissions.get(acl))};if(rev!==missing)row.rev=rev;if(source!==missing)row.source=source;values.forEach((v,i)=>{if(v!==missing)Object.defineProperty(row.values,keys[i],{value:v,enumerable:true,writable:true,configurable:true});});rows[index]=row;
  }else throw Error('PIPES未知记录 '+label);
 }if(rows.some(x=>!x)||Object.keys(rows).length!==rows.length)throw Error('PIPES档案序号有缺口');return rows;
}
export function registryToPipes(registry){
 const out=['[PIPES.SCHEMA/1]'],used=new Set();
 function usedRules(fields){for(const def of Object.values(fields)){if(def.capture)used.add(def.capture);if(def.fields)usedRules(def.fields);if(def.items)usedRules({item:def.items});}}
 for(const kind of ['tables','types'])for(const item of registry[kind])usedRules(item.fields);
 for(const id of used)out.push(line('录入',[id,CAPTURE_RULES[id]]));
 for(const kind of ['tables','types'])for(const item of registry[kind]){
  const {fields,...meta}=item;out.push(line(kind==='tables'?'表模':'类型',[meta]));
  for(const [key,def]of Object.entries(fields)){const {type,capture,include,...rest}=def;out.push(line('字段',[key,type,Object.keys(rest).length?rest:missing,capture,JSON.stringify(include)==='{"op":"selected"}'?'selected':include]));}
 }
 out.push('[/PIPES.SCHEMA/1]');return out.join('\n');
}
export function registryFromPipes(text){
 const registry={tables:[],types:[]};let current;
 for(const {label,cells:c}of records(text,'SCHEMA')){
  if(label==='录入')continue;
  if(label==='表模'||label==='类型'){current={...c[0],fields:{}};registry[label==='表模'?'tables':'types'].push(current);}
  else if(label==='字段'){
   if(!current||c.length!==5||own(current.fields,c[0]))throw Error('PIPES字段定义无效');const [key,type,rest,capture,include]=c;
   current.fields[key]={type,...(rest===missing?{}:rest),...(capture===missing?{}:{capture}),...(include===missing?{}:{include:include==='selected'?{op:'selected'}:include})};
  }else throw Error('PIPES未知模板记录 '+label);
 }return registry;
}
export function compactMaterial(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return typeof value==='string'?value:JSON.stringify(value);
 const {rows,registry,...meta}=value;const tabular=Array.isArray(rows)&&rows.length&&rows.every(r=>r&&typeof r.table==='string'&&r.values&&r.access);if(!tabular&&!registry)return JSON.stringify(value);if(Array.isArray(rows)&&rows.length&&!tabular)meta.rows=rows;
 const blocks=[];if(Object.keys(meta).length)blocks.push(JSON.stringify(meta));if(registry)blocks.push(registryToPipes(registry));if(tabular)blocks.push(rowsToPipes(rows));return blocks.join('\n');
}
