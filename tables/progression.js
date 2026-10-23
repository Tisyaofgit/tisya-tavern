import {check,copy,object,references,isObjectType} from './schema.js';
import {calendarTime,prepareCommit} from './ledger.js';
import {digest} from './books.js';
export function validatePlanProposal(plan){
 check(object(plan)&&typeof plan.goal==='string'&&Array.isArray(plan.beats),'剧情推进产物字段不完整');
 check(!Object.hasOwn(plan,'changes'),'剧情推进不得产生事实写入');
 for(const name of ['pendingChoices','due','clues','constraints'])check(Array.isArray(plan[name])&&plan[name].every(value=>typeof value==='string'),'剧情设计 '+name+' 须为文本列表');
 for(const beat of plan.beats)check(object(beat)&&typeof beat.proposal==='string'&&Array.isArray(beat.basis)&&beat.basis.every(value=>typeof value==='string')&&typeof beat.condition==='string','剧情节拍须有提案、依据和触发条件');
 return plan;
}
export function progressionWindow(view,settings={}){
 if(!(settings.playerObjects?.length))return {ready:false,reason:'请在世界推进中标记玩家控制对象，再启用场外行动'};
 const scene=view.rows.find(r=>r.table==='scene'),to=scene?.values.当前时间;
 const completed=view.commits.findLast(c=>c.progression)?.progression;
 const times=view.anchors.filter(a=>a.table==='scene').map(a=>a.after?.当前时间).filter(t=>calendarTime(t)!==null);
 const from=completed?.to??view.baseTime??times[0]??to;
 const start=calendarTime(from),end=calendarTime(to);
 if(start===null||end===null)return {ready:false,reason:'剧情时间尚未明确，场外演算等待时间依据'};
 if(end<=start)return {ready:false,reason:end<start?'剧情时间倒退，请从对应时间锚另开分支':'剧情时间没有前进'};
 const excluded=new Set([...(settings.playerObjects??[]),...(scene?.values.参与者??[])]);
 const actors=view.rows.filter(r=>r.table==='objects'&&(isObjectType(view.registry,r,'character')||isObjectType(view.registry,r,'organization'))&&!excluded.has(r.id)).map(r=>r.id);
 return {ready:true,from,to,elapsedMinutes:(end-start)/60000,actors,focus:(settings.focusObjects??[]).filter(id=>actors.includes(id)),focusText:settings.focusText??'',source:scene.source,scene:scene.id};
}
// Model adjudication is tagged as generated world history, never a quotation from a chat floor.
// Only settled elapsed time is eligible; plans for the next turn use the other phase.
export function validateWorldProposal(view,p,window){
 check(object(p)&&Array.isArray(p.events)&&p.events.length<=20&&Array.isArray(p.pending??[]),'场外产物须提供 events 和 pending');
 check(p.from===window.from&&p.to===window.to,'场外演算窗口不匹配');
 check(!p.pending?.length,'场外演算仍有待定条件，本窗口未结算：'+JSON.stringify(p.pending));
 const byId=new Map(view.rows.map(r=>[r.id,r])),allowed=new Set(window.actors),ids=new Set(),changes=[],receipts=[];
 let prior=calendarTime(window.from);
 for(const event of p.events){
  check(typeof event.id==='string'&&event.id.startsWith('new:')&&!ids.has(event.id),'场外事件 ID 无效或重复');ids.add(event.id);
  const at=calendarTime(event.at);check(at!==null&&at>calendarTime(window.from)&&at<=calendarTime(window.to)&&at>=prior,'场外事件必须按顺序发生于已确认时段内');prior=at;
  check(typeof event.summary==='string'&&event.summary.trim()&&Array.isArray(event.actors)&&event.actors.length&&new Set(event.actors).size===event.actors.length&&event.actors.every(id=>allowed.has(id)),'场外事件不能控制玩家或当前场内人物');
  check(Array.isArray(event.basis)&&event.basis.length&&event.basis.every(b=>byId.get(b.id)?.rev===b.rev),'场外事件缺少有效依据版本');
  for(const id of event.actors)for(const basis of event.basis){const r=byId.get(basis.id);if(['events','cognition','experiences','relations','growth'].includes(r.table))check(r.access.knowers.includes(id),'人物未实际获知此依据：'+id);}
  const evidence='场外演算：'+event.summary+'\n依据：'+event.basis.map(b=>b.id+'@'+b.rev).join('、');
  changes.push({id:event.id,table:'events',expected:0,values:{名称:event.name||event.summary.slice(0,40),时间:event.at,经过:event.summary,参与者:event.actors,关联事件:event.basis.filter(b=>byId.get(b.id).table==='events').map(b=>b.id),标签:['场外演算']},access:{readers:[],knowers:event.actors},evidence});
  check(Array.isArray(event.changes)&&event.changes.length<=30,'场外事件修改列表无效');
  for(const input of event.changes){const op=copy(input),before=byId.get(op.id),v={...before?.values,...op.values};check(['activities','state','relations','growth','tasks','timers','clues'].includes(op.table),'场外演算不能修改此表：'+op.table);check(!ids.has(op.id),'同一窗口只对每条当前状态提交最终值');ids.add(op.id);
   const subjects=op.table==='state'?[v.对象]:['relations','growth','activities'].includes(op.table)?[v.主体]:v.负责人??event.actors;
   check(subjects.length&&subjects.every(id=>event.actors.includes(id)),'场外修改必须属于本事件行动者');
   check(!v.原生引用,'场外演算不能写原生变量，交给原卡变量流程');
   check(!['relations','growth'].includes(op.table)||!JSON.stringify(op.values).includes('原生引用'),'场外演算不能改原生刻度引用');
   if(op.table==='activities')check(!v.推进至||calendarTime(v.推进至)!==null&&calendarTime(v.推进至)<=at,'事务进度超过当前事件时间');
   if(['relations','growth','activities'].includes(op.table)){op.values.锚点事件=[...new Set([...(before?.values.锚点事件??[]),event.id])];}
   op.access={readers:[],knowers:event.actors};op.evidence=evidence;changes.push(op);
  }
  receipts.push({id:event.id,at:event.at,basis:copy(event.basis),actors:copy(event.actors),evidence});
 }
 const evidence=receipts.map(r=>r.evidence).join('\n\n')||'已核对该时段，无新增场外事件';
 const proposal={changes,pending:[]};prepareCommit(view,proposal,{source:window.source??null,kind:'simulation',evidence,worldTime:window.to,allowedTables:['events','activities','state','relations','growth','tasks','timers','clues']});
 return {proposal,evidence,receipt:{from:window.from,to:window.to,source:window.source??null,producer:'world-simulation',events:receipts}};
}
export async function progressionKey(window){return digest([window.source,window.from,window.to]);}
export function planContext(loaded,settings){return {focusObjects:settings.focusObjects,focusText:settings.focusText,playerObjects:settings.playerObjects,timelineAnchor:loaded.session.data.branchSeed?{anchor:loaded.session.data.branchSeed.anchor,nodes:loaded.session.data.branchSeed.nodes,note:'预设事件蓝本，当前分支尚未发生的节点不是历史；条件改变允许分歧'}:null};}
