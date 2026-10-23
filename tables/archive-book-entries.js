import {check} from './schema.js';
const ARCHIVE_VIEW_FORMAT='tisya.archive-view/1',ARCHIVE_PREFIX='【图鉴／';
const names={static:'静态',data:'数据',snapshot:'动态快照',memory:'记忆'};
export function archiveBookEntries(data){
 const a=data.archiveView;if(!a)return [];
 check(a.format===ARCHIVE_VIEW_FORMAT&&a.basis.session===data.id&&a.basis.sessionRevision===data.revision,'分层快照与存档版本不符');
 const entries=Object.entries(names).map(([key,name])=>({name:ARCHIVE_PREFIX+name+'】存档最新版',value:{format:ARCHIVE_VIEW_FORMAT,kind:key,basis:a.basis,rows:a.layers[key]}}));
 entries.push({name:'【原点】初始档案',value:{format:ARCHIVE_VIEW_FORMAT,kind:'origin',basis:a.basis,rows:a.originRows}}, {name:'【基点】核心版本',value:{format:ARCHIVE_VIEW_FORMAT,kind:'core',basis:a.basis,assets:a.cores}}, {name:'【存档】时间锚与变更路径',value:{format:ARCHIVE_VIEW_FORMAT,kind:'trace',basis:a.basis,trace:a.trace,...(a.timeline?{timeline:a.timeline}:{})}});
 return entries.map(e=>({name:e.name,content:JSON.stringify(e.value)}));
}
