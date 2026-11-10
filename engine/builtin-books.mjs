import {sha256} from './common.mjs';
import {BUILTIN_PACKAGE,builtinBookDefinitions} from './builtin-book-data.mjs';

export const BUILTIN_BOOK_SETTINGS='tisya_builtin_books';
const META='tisyaBuiltin',copy=value=>structuredClone(value),check=(ok,message)=>{if(!ok)throw Error(message);};
const stable=value=>JSON.stringify(value,(_key,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a,b)=>stable(a)===stable(b),hash=value=>sha256(stable(value)),fields=['comment','content'];
const nativeEntry=(row,uid,bookId)=>({uid,key:[],keysecondary:[],comment:row.name,content:row.content,constant:false,selective:true,selectiveLogic:0,order:100,position:1,disable:true,excludeRecursion:true,preventRecursion:true,probability:100,useProbability:true,depth:0,role:0,extensions:{[META]:{package:BUILTIN_PACKAGE,bookId,entryId:row.id,purpose:row.purpose,retired:false,base:{comment:row.name,content:row.content},release:hash(row),checkedRelease:hash(row)}}});
const entryMeta=row=>row?.extensions?.[META];
function validateBook(data,name){check(data&&data.entries&&typeof data.entries==='object'&&!Array.isArray(data.entries),'世界书读取格式无效：'+name);const ids=new Set();for(const row of Object.values(data.entries)){check(row&&Number.isSafeInteger(row.uid)&&row.uid>=0&&!ids.has(row.uid)&&typeof row.content==='string','世界书 UID 或正文无效：'+name);ids.add(row.uid);}return data;}
const owned=(row,bookId)=>entryMeta(row)?.package===BUILTIN_PACKAGE&&entryMeta(row).bookId===bookId;
function idsIn(data,bookId){const map=new Map();for(const row of Object.values(data.entries))if(owned(row,bookId)){const id=entryMeta(row).entryId;check(typeof id==='string'&&id&&!map.has(id),'内置条目标识重复或缺失：'+bookId+'/'+id);map.set(id,row);}return map;}
const freshUid=data=>{const ids=new Set(Object.values(data.entries).map(e=>e.uid));let id=0;while(ids.has(id))id++;return id;};

export function bundledNativeBuiltinBook(bookId,definitions=builtinBookDefinitions()){
 const def=definitions.find(x=>x.id===bookId);check(def,'未知内置书用途：'+bookId);
 return {name:def.name,entries:Object.fromEntries(def.entries.map((row,uid)=>[uid,nativeEntry(row,uid,bookId)])),extensions:{[META]:{package:BUILTIN_PACKAGE,bookId,release:hash(def),checkedRelease:hash(def)}}};
}

export function createBuiltinBookInstaller({getContext,listBooks,readBook,writeBook,persistSettings,assertIdle=()=>{},definitions=builtinBookDefinitions()}={}){
 check([getContext,listBooks,readBook,writeBook,persistSettings].every(x=>typeof x==='function'),'内置书安装接口不完整');
 const catalog=copy(definitions);for(const def of catalog)check(new Set(def.entries.map(e=>e.id)).size===def.entries.length,'内置条目编号重复：'+def.id);const byId=new Map(catalog.map(x=>[x.id,x]));check(byId.size===catalog.length,'内置书编号重复');
 let running=null,resolving=false,latest={status:'unprepared',books:[],conflicts:[],errors:[]};
 const settings=()=>{const value=copy(getContext().extensionSettings?.[BUILTIN_BOOK_SETTINGS]??{format:1,revision:0,books:{}});check(value.format===1&&Number.isSafeInteger(value.revision)&&value.revision>=0&&value.books&&typeof value.books==='object'&&!Array.isArray(value.books),'内置书安装回执版本或结构无效');return value;};
 const bookName=def=>settings().books[def.id]?.name??(def.id==='templates'?getContext().extensionSettings?.tisya_matrix_configuration?.templateBook:null)??def.name;
 async function saveReceipt(bookId,receipt){
  const context=getContext(),prior=context.extensionSettings[BUILTIN_BOOK_SETTINGS],next=settings();check(next.format===1,'内置书安装回执版本无效');next.books[bookId]=copy(receipt);next.revision++;
  context.extensionSettings[BUILTIN_BOOK_SETTINGS]=next;
  try{check(await persistSettings()===true,'内置书已保存，但安装回执尚未获宿主确认');}
  catch(error){if(context.extensionSettings[BUILTIN_BOOK_SETTINGS]===next){if(prior===undefined)delete context.extensionSettings[BUILTIN_BOOK_SETTINGS];else context.extensionSettings[BUILTIN_BOOK_SETTINGS]=prior;}throw error;}
 }
 async function locate(def,names,cache=null,fast=false){
  const preferred=bookName(def),previous=settings().books[def.id];let preferredData=null,found=null;
  const read=async name=>{if(cache?.has(name))return copy(cache.get(name));const data=await readBook(name);cache?.set(name,copy(data));return data;};
  if(fast&&names.includes(preferred)){const data=await read(preferred);if(data?.extensions?.[META]?.package===BUILTIN_PACKAGE&&data.extensions[META].bookId===def.id)return {name:preferred,data:validateBook(data,preferred)};}
  for(const name of names){const data=await read(name),marker=data?.extensions?.[META],claim=marker?.package===BUILTIN_PACKAGE&&marker.bookId===def.id||Object.values(data?.entries??{}).some(e=>owned(e,def.id));
   if(name===preferred)preferredData=validateBook(data,name);
   if(claim){check(!found,'多本书声称同一内置身份：'+def.id);found={name,data:validateBook(data,name)};}
  }
  if(found)return found;
  if(previous)return {name:preferred,data:null};
  const marker=preferredData?.extensions?.[META];check(!marker||marker.package!==BUILTIN_PACKAGE||marker.bookId===def.id,'目标书名已由另一内置用途占用：'+preferred);
  return {name:preferred,data:preferredData};
 }
 function plan(def,name,current,receipt={}){
  const data=copy(current??{entries:{}}),map=idsIn(data,def.id),conflicts=[],seen={...(receipt.entries??{})};
  for(const wanted of def.entries){
   const desired={comment:wanted.name,content:wanted.content},row=map.get(wanted.id);
   if(!row){
    if(seen[wanted.id]?.suppressed)continue;
    if(seen[wanted.id]){conflicts.push({bookId:def.id,book:name,entryId:wanted.id,type:'missing',fields:[],expectedDigest:hash(current)});continue;}
    const collision=Object.values(data.entries).find(e=>String(e.comment??e.name??'')===wanted.name);
    if(collision){conflicts.push({bookId:def.id,book:name,entryId:wanted.id,type:'unowned-name',uid:collision.uid,fields:[],expectedDigest:hash(current)});continue;}
    const uid=freshUid(data);data.entries[uid]=nativeEntry(wanted,uid,def.id);seen[wanted.id]={uid};continue;
   }
   const meta=entryMeta(row);check(meta.base&&fields.every(k=>typeof meta.base[k]==='string'),'内置条目缺少有效更新基线：'+wanted.id);
   const nextBase=copy(meta.base),different=[];
   for(const key of fields){const actual=String(row[key]??(key==='comment'?row.name:'')??''),before=meta.base[key],after=desired[key];
    if(actual===before||actual===after){row[key]=after;nextBase[key]=after;}else if(after!==before)different.push({field:key,base:before,current:actual,upstream:after});
   }
   row.extensions={...row.extensions,[META]:{...meta,retired:false,purpose:wanted.purpose,base:nextBase,checkedRelease:hash(wanted),...(different.length?{}:{release:hash(wanted)})}};seen[wanted.id]={uid:row.uid};
   if(different.length)conflicts.push({bookId:def.id,book:name,entryId:wanted.id,type:'edited',uid:row.uid,fields:different,expectedDigest:null});
  }
  const activeIds=new Set(def.entries.map(e=>e.id));for(const [id,row]of map)if(!activeIds.has(id))row.extensions[META]={...entryMeta(row),retired:true};
  data.extensions={...data.extensions,[META]:{package:BUILTIN_PACKAGE,bookId:def.id,checkedRelease:hash(def),...(conflicts.length?{}:{release:hash(def)})}};
  for(const conflict of conflicts)conflict.expectedDigest=hash(data);
  return {data,conflicts,receipt:{name,checkedRelease:hash(def),...(conflicts.length?{release:receipt.release??null}:{release:hash(def)}),entries:seen}};
 }
 async function installOne(def,names,cache){
  const previous=settings().books[def.id],found=await locate(def,names,cache),{name}=found;
  if(!found.data&&previous){return {id:def.id,name,status:'conflict',written:false,conflicts:[{bookId:def.id,book:name,entryId:null,type:'missing-book',fields:[],expectedDigest:hash(null)}]};}
  const planned=plan(def,name,found.data,previous);let written=false;
  if(!same(found.data,planned.data)){
   assertIdle();const before=found.data?validateBook(await readBook(name),name):null;check(same(before,found.data),'保存前世界书被其他页面修改：'+name);
   if(!found.data)check(!(await listBooks()).includes(name),'创建前出现同名世界书：'+name);
   await writeBook(name,copy(planned.data));written=true;
   const actual=validateBook(await readBook(name),name);check(same(actual,planned.data),'世界书写入后完整回读不同：'+name);
  }
  cache?.set(name,copy(planned.data));
  if(!same(previous,planned.receipt))await saveReceipt(def.id,planned.receipt);
  return {id:def.id,name,status:planned.conflicts.length?'conflict':'ready',written,conflicts:planned.conflicts};
 }
 async function update(){
  if(running)return running;check(!resolving,'内置书冲突选择正在保存');running=(async()=>{assertIdle();const report={status:'ready',books:[],conflicts:[],errors:[]};let names;try{names=await listBooks();check(Array.isArray(names)&&names.every(x=>typeof x==='string'),'世界书目录读取失败');}catch(error){report.status='partial';report.errors.push({bookId:null,message:error.message});latest=report;return copy(report);}
   const cache=new Map();for(const def of catalog)try{const result=await installOne(def,names,cache);report.books.push(result);report.conflicts.push(...result.conflicts);if(!names.includes(result.name)&&result.status==='ready')names.push(result.name);}catch(error){report.errors.push({bookId:def.id,message:error.message});}
   if(report.errors.length||report.conflicts.length)report.status='partial';latest=report;return copy(report);
  })();try{return await running;}finally{running=null;}
 }
 async function definitionsFor(kind){
  const def=byId.get(kind);check(def,'未知内置书用途：'+kind);const names=await listBooks(),found=await locate(def,names,null,true);check(found.data,'内置书尚未安装：'+def.name);const result=[];
  idsIn(found.data,def.id);
  for(const row of Object.values(found.data.entries)){
   const meta=entryMeta(row);if(meta?.retired||meta?.purpose==='guide'||meta?.purpose==='template')continue;
   const marked=owned(row,def.id)&&meta?.purpose==='definition'||(kind==='beauty'?/^【美化】/u:/^【扩展】/u).test(String(row.comment??row.name??''));
   if(!marked&&!String(row.content).trim().startsWith('{'))continue;
   let definition;try{definition=JSON.parse(row.content);}catch(error){if(!marked)continue;throw Error('内置定义 JSON 损坏：'+found.name+' / '+(row.comment??row.uid)+'：'+error.message);}
   const expected=kind==='beauty'?'tisya.presentation-definition/1':'tisya.extension-definition/1';if(!marked&&definition?.format!==expected)continue;check(definition?.format===expected,'内置定义类型不匹配：'+found.name+' / '+row.uid);
   result.push({source:{book:found.name,uid:row.uid,digest:sha256(row.content)},definition:copy(definition)});
  }
  check(new Set(result.map(x=>x.definition.id)).size===result.length,'内置定义编号重复：'+found.name);return result;
 }
 async function resolveConflict({bookId,entryId,choice,expectedDigest}){
  check(!running&&!resolving,'内置书更新或冲突保存正在进行');resolving=true;try{assertIdle();check(['keep','upstream'].includes(choice),'冲突选择无效');const def=byId.get(bookId),wanted=def?.entries.find(e=>e.id===entryId);check(def&&wanted,'请选择实际内置条目');
  const {name,data}=await locate(def,await listBooks());check(data&&hash(data)===expectedDigest,'冲突来源已变化，请重新检查');const next=copy(data),map=idsIn(next,bookId),row=map.get(entryId);
  if(!row){
   if(choice==='keep'){const receipt=settings().books[bookId]??{name,entries:{}};receipt.entries??={};receipt.entries[entryId]={...(receipt.entries[entryId]??{}),suppressed:true};await saveReceipt(bookId,receipt);resolving=false;return await update();}
   check(!Object.values(next.entries).some(e=>String(e.comment??e.name??'')===wanted.name),'存在同名用户条目，请先在世界书中重命名');const uid=freshUid(next);next.entries[uid]=nativeEntry(wanted,uid,bookId);
  }else{if(choice==='upstream'){row.comment=wanted.name;row.content=wanted.content;}row.extensions[META]={...entryMeta(row),base:{comment:wanted.name,content:wanted.content},release:hash(wanted)};}
  check(same(await readBook(name),data),'保存冲突选择前世界书已变化');await writeBook(name,next);check(same(await readBook(name),next),'冲突选择写入后回读未确认');resolving=false;return await update();
  }finally{resolving=false;}
 }
 return {readSourceBook:async name=>copy(validateBook(await readBook(name),name)),update,status:()=>copy(latest),definitions:definitionsFor,resolveConflict,bookNames:()=>Object.fromEntries(catalog.map(def=>[def.id,bookName(def)]))};
}
