import {prepareCommit} from '../tables/ledger.js';
import {compilePipeRecords} from './pipes.mjs';
import {reviewCanonicalArchiveChanges} from '../tables/archive-proposal.js';
import {validateWorldProposal,progressionWindow,progressionKey} from '../tables/progression.js';
const check=(ok,message)=>{if(!ok)throw Error('单次填表：'+message);};
const list=(v,name)=>check(Array.isArray(v)&&v.every(x=>typeof x==='string'&&x.trim()),name+'须为非空文本列表');
export async function prepareOnePassBatch(view,reply,state,source){
 if(reply.recordFormat==='pipes'){
  const proposal=compilePipeRecords(view,reply,state,{sourceKey:source.key}),evidence=reply.publicReply.paragraphs.map(p=>p.raw).join('\n\n');
  reviewCanonicalArchiveChanges(view,proposal.changes,source);
  const base=prepareCommit(view,proposal,{source:source.key,kind:'archive',evidence,allowedTables:['events','facts','clues','timers','cognition','experiences','objects','scene','state','relations','holdings','tasks','activities','growth'],allowSchemaExtensions:false,inferSchemaFields:false});
  base.commit.onePass={basis:state.basis,coverage:proposal.coverage,wire:'pipes/1',worldPending:[]};
  return {commits:[base.commit],changes:base.commit.changes.length,pending:proposal.pending};
 }
 const {vars,memory,status,archive}=reply.records;
 check(archive.basis===state.basis,'存档基线已变化');
 for(const [name,p] of Object.entries({vars,memory})){check(Array.isArray(p.changes)&&p.changes.length<=200,name+'缺少 changes');list(p.pending,name+'.pending');check(Object.keys(p).every(k=>['changes','pending'].includes(k)),name+'含未登记字段');}
 list(archive.pending,'archive.pending');list(status.pending,'status.pending');
 check(Array.isArray(status.events)&&Array.isArray(status.focus),'世界推演缺少 events/focus');
 check(status.focus.length===state.focus.length&&new Set(status.focus.map(x=>x.id)).size===state.focus.length&&status.focus.every(x=>state.focus.includes(x.id)&&typeof x.state==='string'&&x.state.trim()&&typeof x.possibility==='string'&&x.possibility.trim()),'关注对象须逐个保留动态或明确缺项');
 check(memory.changes.every(x=>['events','cognition'].includes(x.table)),'memory只能归档事件与独立认知');
 check(vars.changes.every(x=>!['events','cognition','preferences','native_cells'].includes(x.table)),'vars不得重复记忆或接管偏好／原生变量');
 const changes=[...vars.changes,...memory.changes],changed=new Set(changes.map(x=>x.table)),coverage=archive.coverage;
 check(Array.isArray(coverage)&&coverage.length===view.registry.tables.length&&new Set(coverage.map(x=>x.table)).size===coverage.length,'须逐表给出覆盖结果');
 for(const table of view.registry.tables){const c=coverage.find(x=>x.table===table.id);check(c&&['updated','unchanged','pending'].includes(c.status)&&typeof c.reason==='string'&&c.reason.trim(),'缺少表 '+table.id+' 的覆盖依据');check((c.status==='updated')===changed.has(table.id),'表 '+table.id+' 的覆盖声明与实际更新不符');}
 const paragraphs=reply.publicReply.paragraphs.map(p=>p.raw),evidence=paragraphs.join('\n\n');
 for(const op of memory.changes)if(op.values?.原文段落)check(op.values.原文段落.every(x=>paragraphs.includes(x)),'归档原文必须是本条完整正文段落');
 const pending=[...vars.pending,...memory.pending,...archive.pending,...coverage.filter(x=>x.status==='pending').map(x=>x.table+'：'+x.reason)];
 const options={source:source.key,kind:'archive',evidence,allowedTables:view.registry.tables.filter(t=>t.id!=='preferences'&&t.id!=='native_cells').map(t=>t.id),allowSchemaExtensions:false,inferSchemaFields:false};
 reviewCanonicalArchiveChanges(view,changes,source);
 const base=prepareCommit(view,{changes,pending},options);base.commit.onePass={basis:state.basis,coverage,focus:status.focus,worldPending:status.pending};
 const commits=[base.commit];
 const worldView={...view,rows:base.rows,registry:base.registry,last:base.commit.id,baseTime:view.baseTime??view.rows.find(r=>r.table==='scene')?.values.当前时间};
 const window=state.worldSettings?progressionWindow(worldView,state.worldSettings):state.window;
 if(window.ready){
  check(status.from===window.from&&status.to===window.to,'场外时窗不符');
  if(status.events.length||!status.pending.length){
   const world=validateWorldProposal(worldView,status,window),used=new Set(changes.map(x=>x.id));
   check(world.proposal.changes.every(x=>!used.has(x.id)),'正文与场外推进不能同时写同一条状态');
   const nextView={...view,rows:base.rows,registry:base.registry,last:base.commit.id};
   const prepared=prepareCommit(nextView,world.proposal,{...options,kind:'simulation',evidence:world.evidence,worldTime:window.to});
   prepared.commit.progression={...world.receipt,key:await progressionKey(window)};commits.push(prepared.commit);
  }
 }else check(status.from===null&&status.to===null&&!status.events.length,'缺少有效时窗，不得结算场外事件');
 return {commits,changes:commits.reduce((n,c)=>n+c.changes.length,0),pending:[...pending,...status.pending]};
}
