import {clone,digest,fail} from './common.mjs';
import {advanceObjectArchive,OBJECT_ARCHIVE_FORMAT} from './object-archive.mjs';

export const OBJECT_ARCHIVE_MARKER='tisyaObjectArchive';
const check=(ok,code,message)=>{if(!ok)fail(code,message);};
const labels={dossier:'档案',history:'历史',events:'历史'};
const managedEntry=(kind,title,content)=>({uid:0,key:[],keysecondary:[],comment:'缇斯亚 · '+(labels[kind]??kind)+' · '+title,content:JSON.stringify(content),constant:false,selective:true,selectiveLogic:0,order:100,position:1,disable:true,excludeRecursion:true,preventRecursion:true,probability:100,useProbability:true,depth:0,role:0,extensions:{[OBJECT_ARCHIVE_MARKER]:OBJECT_ARCHIVE_FORMAT}});

function decodeBook(data,owner,kind){
 const managed=Object.values(data?.entries??{}).filter(e=>e.extensions?.[OBJECT_ARCHIVE_MARKER]===OBJECT_ARCHIVE_FORMAT),out=[];
 for(const row of managed){let value;try{value=JSON.parse(row.content);}catch{fail('OBJECT_ARCHIVE_INVALID','对象存档条目无法解析，原书已保留');}
  check(row.disable===true&&value.format===OBJECT_ARCHIVE_FORMAT&&value.owner?.chat_uid===owner.id&&value.owner?.owner_chat_key===owner.key,'OBJECT_ARCHIVE_OWNER','对象存档属于另一聊天或已损坏，未覆盖');
  check(kind==='dossier'?['dossier','dossier-index'].includes(value.kind):['history','events','history-index'].includes(value.kind),'OBJECT_ARCHIVE_INVALID','档案书与历史书条目混放，未覆盖');
  out.push({row,value});
 }
 const ids=out.map(x=>x.value.kind+':'+x.value.archive_id);check(new Set(ids).size===ids.length,'OBJECT_ARCHIVE_DUPLICATE','对象存档身份重复，未自动合并');
 return out;
}
function indexFor(kind,projected,owner){
 const dossier=kind==='dossier';return {format:OBJECT_ARCHIVE_FORMAT,kind:kind+'-index',archive_id:kind+'-index',owner:{chat_uid:owner.id,owner_chat_key:owner.key},observed_revision:projected.revision,time:clone(projected.time),archive_ids:dossier?projected.dossiers.map(x=>x.archive_id):projected.histories.map(x=>x.archive_id),event_count:dossier?0:projected.events.events.length};
}
function withOwner(value,owner){return {...value,owner:{chat_uid:owner.id,owner_chat_key:owner.key}};}
function nextUid(data){return Object.values(data.entries??{}).reduce((n,row)=>{const uid=Number(row.uid);return Number.isSafeInteger(uid)?Math.max(n,uid+1):n;},1);}
function materialize(data,decoded,desired,kind){
 const next=clone(data),existing=new Map(decoded.map(x=>[x.value.kind+':'+x.value.archive_id,x.row]));let uid=nextUid(next);
 for(const raw of desired){const value=clone(raw),key=value.kind+':'+value.archive_id,old=existing.get(key),title=value.title??(value.kind==='events'?'事件与来源':'索引'),row=old?clone(old):managedEntry(value.kind,title,value);if(!old)row.uid=uid++;
  row.comment='缇斯亚 · '+(labels[value.kind]??'档案')+' · '+title;row.content=JSON.stringify(value);row.disable=true;row.constant=false;row.excludeRecursion=true;row.preventRecursion=true;next.entries[row.uid]=row;
 }
 return next;
}
async function writeOne(books,ref,owner,kind,desired){
 const names=await books.listBooks(),exists=names.includes(ref.name),data=exists?await books.readBook(ref.name):{entries:{}},decoded=decodeBook(data,owner,kind),next=materialize(data,decoded,desired,kind);
 if(digest(next)===digest(data))return;
 if(exists)check(digest(await books.readBook(ref.name))===digest(data),'OBJECT_ARCHIVE_CONFLICT','保存前对象存档被其他页面修改，请重试');
 else check(!(await books.listBooks()).includes(ref.name),'OBJECT_ARCHIVE_CONFLICT','创建前出现同名对象存档，请重试');
 await books.writeBook(ref.name,next);const verified=decodeBook(await books.readBook(ref.name),owner,kind),actual=new Map(verified.map(x=>[x.value.kind+':'+x.value.archive_id,x.value]));
 for(const value of desired){const saved=actual.get(value.kind+':'+value.archive_id);check(saved&&digest(saved)===digest(value),'OBJECT_ARCHIVE_UNCONFIRMED','对象存档写入后回读不一致，请重试同步');}
}

// The two products are idempotent projections. The caller writes the complete
// recovery checkpoint last, so a partial failure never replaces live state.
export async function syncObjectArchiveBooks({books,owner,bundle,dossierRef,historyRef}){
 const names=await books.listBooks(),read=async ref=>names.includes(ref.name)?await books.readBook(ref.name):{entries:{}};
 const [dossierData,historyData]=await Promise.all([read(dossierRef),read(historyRef)]),dossierRows=decodeBook(dossierData,owner,'dossier'),historyRows=decodeBook(historyData,owner,'history');
 const projected=advanceObjectArchive(bundle,{dossiers:dossierRows.filter(x=>x.value.kind==='dossier').map(x=>x.value),histories:historyRows.filter(x=>x.value.kind==='history').map(x=>x.value)});
 for(const row of [...dossierRows,...historyRows])check(row.value.observed_revision<=projected.revision,'OBJECT_ARCHIVE_NEWER','对象存档版本较新，未用本机旧数据覆盖');
 const dossierOwner={...dossierRef},historyOwner={...historyRef},dossiers=[indexFor('dossier',projected,owner),...projected.dossiers.map(x=>withOwner(x,owner))],histories=[indexFor('history',projected,owner),...projected.histories.map(x=>withOwner(x,owner)),withOwner(projected.events,owner)];
 await writeOne(books,dossierOwner,owner,'dossier',dossiers);await writeOne(books,historyOwner,owner,'history',histories);
 return {revision:projected.revision,time:clone(projected.time),objects:projected.dossiers.length,historyObjects:projected.histories.length,events:projected.events.events.length};
}
