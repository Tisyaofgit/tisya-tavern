import {prepareCommit,calendarTime} from '../../../tables/ledger.js';
import {copy,object,check,isObjectType} from '../../../tables/schema.js';

export const WORLD_TABLES = ['activities','state','relations','growth','tasks','timers','clues','cognition','holdings','facts'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function keys(value,allowed,required=allowed){check(object(value),'Expected an object');check(Object.keys(value).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(value,k)),'Unknown or missing world field');}
function ids(value,label){check(Array.isArray(value)&&value.every(v=>typeof v==='string'&&v)&&new Set(value).size===value.length,label+' must be unique IDs');}
function access(value,rows){keys(value,['readers','knowers']);ids(value.readers,'readers');ids(value.knowers,'knowers');check(value.knowers.every(id=>rows.get(id)?.table==='objects'),'Unknown knower');}
function hasNative(value){return object(value)?Object.entries(value).some(([k,v])=>k==='原生引用'&&!!v||hasNative(v)):Array.isArray(value)&&value.some(hasNative);}
function knowledgeBoundary(value,event,rows){for(const knower of value.knowers)for(const basis of event.basis){const row=rows.get(basis.id);if(row.access.knowers.length||row.values.隐情)check(row.access.knowers.includes(knower),'World record widens a restricted premise; split public results and private motives');}}
function affected(op,before,event,rows){
 const v={...before?.values,...op.values};
 let owners;
 switch(op.table){
  case 'state':owners=[v.对象];break;
  case 'relations':case 'growth':case 'activities':case 'cognition':owners=[v.主体];break;
  case 'holdings':owners=[...(v.所有者??[]),...(v.保管者??[])];check(rows.get(v.物品)?.table==='objects','Holdings needs an existing item');break;
  case 'facts':owners=v.对象??[];check(owners.length&&owners.every(id=>rows.get(id)?.table==='objects'),'Discoveries need existing objects');check(!v.世界设定&&!v.前史&&!v.关系底稿,'World settlement cannot rewrite adopted definitions');break;
  case 'tasks':owners=v.负责人??[];break;
  case 'timers':owners=(v.任务??[]).flatMap(id=>rows.get(id)?.values.负责人??[]);break;
  case 'clues':owners=v.对象??[];break;
 }
 if(['facts','clues'].includes(op.table))check(owners.length&&owners.every(id=>rows.get(id)?.table==='objects'),'World discovery must describe existing objects');
 else if(op.table==='holdings')check(owners.length&&owners.some(id=>event.actors.includes(id)),'World consequence lacks an acting owner');
 else check(owners?.length&&owners.every(id=>event.actors.includes(id)),'World consequence must belong to event actors');
 if(op.table==='activities'&&v.推进至)check(calendarTime(v.推进至)!==null&&calendarTime(v.推进至)<=calendarTime(event.at),'Activity progress exceeds event time');
 return v;
}

/** Validate the V2 elapsed-world proposal; all actual writes still use ledger.prepareCommit. */
export function prepareWorld(view,proposal,window,{playerObjects=[],onstageObjects=[],activeSourceKeys=null,existingNewIds=new Set()}={}){
 if(!window?.ready){check(proposal===null,'An unavailable world window must be null');return null;}
 keys(proposal,['from','to','events','pending']);
 check(proposal.from===window.from&&proposal.to===window.to,'World window changed');
 const start=calendarTime(window.from),end=calendarTime(window.to);check(start!==null&&end!==null&&end>start,'Invalid story time window');
 check(Array.isArray(proposal.pending)&&proposal.pending.length===0,'World dependencies remain pending');
 check(Array.isArray(proposal.events)&&proposal.events.length<=20,'World event budget exceeded');
 const rows=new Map(view.rows.map(r=>[r.id,r])),excluded=new Set([...playerObjects,...onstageObjects]),allowed=new Set(window.actors??[]);
 if(window.sceneAnchor)keys(window.sceneAnchor,['id','rev','time']);
 const scene=window.sceneAnchor?rows.get(window.sceneAnchor.id):window.scene?rows.get(window.scene):view.rows.find(r=>r.table==='scene');
 check(scene?.table==='scene'&&scene.values.当前时间===window.to,'World window is not bound to the post-archive scene time');
 if(window.sceneAnchor)check(scene.rev===window.sceneAnchor.rev&&scene.values.当前时间===window.sceneAnchor.time,'Frozen scene anchor changed');
 check(typeof window.source==='string'&&window.source&&(!activeSourceKeys||activeSourceKeys.includes(window.source)),'World window source is not retained');
 for(const id of scene.values.参与者??[])excluded.add(id);
 check([...allowed].every(id=>rows.get(id)?.table==='objects'&&(isObjectType(view.registry,rows.get(id),'character')||isObjectType(view.registry,rows.get(id),'organization'))&&!excluded.has(id)),'World actors include a player, onstage object or non-actor type');
 const touched=new Set(),newIds=new Set(existingNewIds),changes=[],events=[],basisRows=[];
 let prior=start;
 for(const event of proposal.events){
  keys(event,['id','name','at','summary','actors','basis','access','changes'],['id','at','summary','actors','basis','access','changes']);
  check(typeof event.id==='string'&&event.id.startsWith('new:')&&!newIds.has(event.id),'Duplicate world event ID');newIds.add(event.id);
  const at=calendarTime(event.at);check(at!==null&&at>start&&at<=end&&at>=prior,'World events must be ordered inside elapsed time');prior=at;
  check(typeof event.summary==='string'&&event.summary.trim()&&(event.name===undefined||typeof event.name==='string'&&event.name.trim()),'Empty world event');
  ids(event.actors,'actors');check(event.actors.length&&event.actors.every(id=>allowed.has(id)),'Unauthorized offstage actor');access(event.access,rows);
  check(Array.isArray(event.basis)&&event.basis.length,'World event needs versioned basis');
  const seenBasis=new Set();
  for(const basis of event.basis){
   keys(basis,['id','rev','usedBy']);const row=rows.get(basis.id);check(row&&row.table!=='preferences'&&row.rev===basis.rev&&!seenBasis.has(basis.id),'Stale, non-world or duplicate world basis');seenBasis.add(basis.id);ids(basis.usedBy,'basis.usedBy');
   check(basis.usedBy.every(id=>event.actors.includes(id)),'Basis user is not an event actor');
   for(const actor of basis.usedBy)check(row.access.knowers.includes(actor),'Actor does not know this basis');
   basisRows.push(copy(row));
  }
  // Complete-event knowledge cannot be wider than every private premise used for it.
  knowledgeBoundary(event.access,event,rows);
  const provenance={kind:'world-simulation',at:event.at,basis:copy(event.basis),summary:event.summary};
  const evidence=JSON.stringify(provenance);
  changes.push({id:event.id,table:'events',expected:0,values:{名称:event.name??event.summary.slice(0,40),时间:event.at,经过:event.summary,参与者:copy(event.actors),关联事件:event.basis.filter(b=>rows.get(b.id).table==='events').map(b=>b.id),标签:['场外演算']},access:copy(event.access),evidence});
  check(Array.isArray(event.changes)&&event.changes.length<=30,'World consequence budget exceeded');
  for(const input of event.changes){
   keys(input,['id','table','expected','values','access','unset'],['id','table','expected','values','access']);
   const op=copy(input),before=rows.get(op.id);check(WORLD_TABLES.includes(op.table)&&object(op.values),'Invalid world consequence table');
   check(!touched.has(op.id),'A world window has one final write per row');touched.add(op.id);
   if(op.id.startsWith('new:')){check(!newIds.has(op.id),'Duplicate new consequence ID');newIds.add(op.id);}else check(before,'Unknown consequence row');
   check((before?.rev??0)===op.expected,'World consequence revision changed');
   access(op.access,rows);knowledgeBoundary(op.access,event,rows);check(!hasNative(before?.values)&&!hasNative(op.values),'World simulation cannot write native-owned values');
   affected(op,before,event,rows);
   if(['activities','relations','growth','state','tasks'].includes(op.table))op.values.锚点事件=[...new Set([...(before?.values.锚点事件??[]),...(op.values.锚点事件??[]),event.id])];
   op.evidence=evidence;changes.push(op);
  }
  events.push({id:event.id,at:event.at,actors:copy(event.actors),basis:copy(event.basis),access:copy(event.access),provenance});
 }
 check(changes.length<=200,'World transaction exceeds 200 rows');
 const evidence=changes.map(c=>c.evidence).join('\n')||'Verified unchanged elapsed world window';
 const options={source:window.source??null,kind:'simulation',evidence,worldTime:window.to,allowedTables:['events',...WORLD_TABLES],allowSchemaExtensions:false,inferSchemaFields:false};
 const prepared=prepareCommit(view,{templates:[],schemaChanges:[],changes,pending:[]},options);
 const allocated=new Map(changes.map((op,i)=>[op.id,prepared.commit.changes[i].id]));for(const event of events)event.id=allocated.get(event.id)??event.id;
 return {prepared,proposal:{templates:[],schemaChanges:[],changes,pending:[]},options,basisRows,receipt:{from:window.from,to:window.to,source:window.source??null,producer:'world-simulation',events}};
}

export function assertWorldBasisUnchanged(world,current){
 if(!world)return;
 const rows=new Map(current.rows.map(r=>[r.id,r]));
 const semantic=row=>row&&({id:row.id,rev:row.rev,table:row.table,source:row.source,values:row.values,access:row.access,lockedFields:row.lockedFields??[]});
 for(const expected of world.basisRows)check(same(semantic(rows.get(expected.id)),semantic(expected)),'World basis changed after native readback; a new request is required');
}
