import {copy,check} from './schema.js';
import {project} from './ledger.js';
const names={static:'静态',data:'数据',snapshot:'动态快照',memory:'记忆'};
export const ARCHIVE_PREFIX='【图鉴／';
export const ARCHIVE_VIEW_FORMAT='tisya.archive-view/1';
export function archiveLayer(table,registry){
 const declared=registry.tables.find(t=>t.id===table)?.archiveLayer;
 check(declared===undefined||Object.hasOwn(names,declared),'档案层注册无效：'+table);
 return declared??(['objects','facts'].includes(table)?'static':['events','cognition','experiences'].includes(table)?'memory':['scene','state','native_cells'].includes(table)?'snapshot':'data');
}
const escape=s=>String(s).replaceAll('~','~0').replaceAll('/','~1');
export function changedPaths(before,after,path=''){
 if(JSON.stringify(before)===JSON.stringify(after))return [];
 const map=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 if(map(before)&&map(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(k=>changedPaths(before[k],after[k],path+'/'+escape(k)));
 return [{path:path||'/',before:copy(before??null),after:copy(after??null),beforePresent:before!==undefined,afterPresent:after!==undefined}];
}
export function archiveTrace(view,sessionId,chain){
 const sources=new Map(chain.map(s=>[s.key,s]));
 return [...copy(view.inheritedTrace??[]),...view.commits.flatMap(commit=>commit.anchors.map(anchor=>{
  const source=sources.get(anchor.source),events=commit.changes.filter(c=>c.after?.table==='events').map(c=>({id:c.id,name:c.after.values.名称}));
  return {...copy(anchor),commit:commit.id,kind:commit.kind,path:[sessionId,commit.id,anchor.id],sourceFloor:source?.floor??null,sourceRole:source?.role??null,operation:anchor.operation??(anchor.after===null?'delete':anchor.before===null?'create':'update'),fields:changedPaths(anchor.before,anchor.after),events};
 }))];
}
// This materialization is disposable, never read as the editable ledger.
// Native narrative injection uses the same replay plus its own audience filter.
export function assembleArchiveBook(origin,session,chain){
 const sourceKeys=chain.map(s=>s.key),view=project(origin.data,session,sourceKeys),layers=Object.fromEntries(Object.keys(names).map(k=>[k,[]]));
 for(const row of view.rows)layers[archiveLayer(row.table,view.registry)].push(copy(row));
 const initial=new Map([...origin.data.bases].sort((a,b)=>a.rev-b.rev).map(row=>[row.id,row]));
 return {format:ARCHIVE_VIEW_FORMAT,basis:{origin:origin.data.id,originRevision:origin.data.revision,session:session.id,sessionRevision:session.revision,sourceKeys,commit:view.last},registry:copy(view.registry),layers,originRows:copy([...initial.values()]),cores:copy(origin.data.coreAssets??[]),trace:archiveTrace(view,session.id,chain)};
}
