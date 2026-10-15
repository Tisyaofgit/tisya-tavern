import {check,copy,validateRow,validateReferences,references} from './schema.js';
import {project,calendarTime} from './ledger.js';
import {uuid} from './books.js';
export function snapshotAnchor(loaded,{name,cut=null,nodes=null}){
 check(typeof name==='string'&&name.trim(),'请给时间锚命名');
 const commits=loaded.view.commits,at=cut==='start'?-1:cut===null?commits.length-1:commits.findIndex(c=>c.id===cut);check(at>=-1&&(cut===null||cut==='start'||at>=0),'时间锚起点不存在');
 const session={...loaded.session.data,commits:commits.slice(0,at+1)},view=project(loaded.origin.data,session,loaded.chain.map(s=>s.key));
 const later=commits.slice(at+1).flatMap(c=>c.changes.filter(x=>x.after?.table==='events').map(x=>x.after));
 const story=nodes??later.map(r=>({id:uuid('node'),time:r.values.时间??'',name:r.values.名称,summary:r.values.经过??'',actors:r.values.参与者??[],condition:'原存档当时条件仍成立；玩家改变条件时允许分歧',kind:'主线'}));
 // Future actors remain reusable assets, but gain no future history or character knowledge.
 view.registry=copy(loaded.view.registry);const seedRows=copy(view.rows.filter(r=>!['preferences','native_cells'].includes(r.table))),have=new Set(seedRows.map(r=>r.id)),queue=story.flatMap(n=>n.actors);
 for(let i=0;i<queue.length;i++){const id=queue[i];if(have.has(id))continue;const candidates=loaded.origin.data.bases.filter(r=>r.id===id);const base=candidates.sort((a,b)=>a.rev-b.rev)[0];check(base,'未来蓝本所需原点对象缺失：'+id);const row=copy(base);row.source=null;row.access.knowers=[];seedRows.push(row);have.add(id);queue.push(...references(row,view.registry));}
 validateNodes(story,seedRows);
 return {id:uuid('timeline'),version:1,name:name.trim(),createdAt:new Date().toISOString(),sourceSession:loaded.session.data.id,sourceCommit:commits[at]?.id??null,worldTime:view.rows.find(r=>r.table==='scene')?.values.当前时间??null,registry:copy(view.registry),rows:seedRows,archivedSources:[...view.archived],nodes:copy(story)};
}
export function validateNodes(nodes,rows){check(Array.isArray(nodes)&&nodes.length<=1000,'蓝本节点格式或数量无效');const ids=new Set();for(const n of nodes){check(n&&typeof n.id==='string'&&n.id&&!ids.has(n.id)&&typeof n.name==='string'&&n.name.trim()&&typeof n.summary==='string'&&typeof n.condition==='string'&&['主线','支线','个人','日常'].includes(n.kind),'蓝本节点需有唯一ID、名称、内容、条件与类别');ids.add(n.id);check(Array.isArray(n.actors)&&n.actors.every(id=>rows.some(r=>r.id===id&&r.table==='objects')),'蓝本参与者不存在于起点；先选择可复用对象加入起点');}return nodes;}
export function branchSeed(anchor){check(anchor?.version===1&&Array.isArray(anchor.rows),'时间锚版本无效');for(const row of anchor.rows)validateRow(anchor.registry,row);validateReferences(anchor.rows,anchor.registry);validateNodes(anchor.nodes,anchor.rows);return {anchor:{id:anchor.id,name:anchor.name,version:anchor.version,worldTime:anchor.worldTime},rows:copy(anchor.rows).map(r=>({...r,source:null})),nodes:copy(anchor.nodes),archivedSources:copy(anchor.archivedSources??[])};}

export function forkCommits(commits,eligible){
 const known=commit=>{const source=commit.source??commit.contextSource;return typeof source==='string'?eligible.has(source):Object.hasOwn(commit,'contextSource')&&source===null;};
 const last=commits.findLastIndex(known);
 // Legacy null-source records have no recoverable floor. Retain only those in
 // the confirmed prefix, never a later tail merely because its source is null.
 return commits.filter((commit,index)=>known(commit)||(commit.source===null&&!Object.hasOwn(commit,'contextSource')&&index<=last));
}
