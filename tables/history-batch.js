import {digest,stableId} from '../engine/common.mjs';
import {memoryMessageRows} from '../engine/memory-status.mjs';
import {archivalText} from '../engine/reply.mjs';
import {normalizeEnvelope} from '../engine/tags.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {applyMatrixChanges} from './foundation/engine.js';

const clone=x=>structuredClone(x);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const FORMAT='tisya.history-batch/1';

// Queue metadata and individual model replies use the existing request table.
// A generated batch never writes narrative facts. One reviewed preview is
// committed through the same database boundary as a single intake draft.
export function createHistoryBatch({api,database,getContext,validate,checkSource,refreshForms,onCommitted=()=>{}}){
 const active=new Map(),previews=new Map();
 const identity=()=>JSON.stringify([getContext().chatId,getContext().characterId,getContext().groupId]);
 const plans=s=>Object.values(s?.state?.tables?.T_SYS_CELL_REQUESTS??{}).map(r=>r.metadata?.historyBatch).filter(p=>p?.format===FORMAT);
 const drafts=s=>Object.values(s?.state?.tables?.T_SYS_CELL_REQUESTS??{}).map(r=>r.metadata?.foundationDraft).filter(Boolean);
 const guard=p=>check(p.scope===identity(),'聊天已切换，批次保留在原聊天');
 function verify(p){
  guard(p);const rows=new Map(memoryMessageRows(getContext().chat).map(r=>[r.uid,r]));
  for(const row of p.sources)check(rows.has(row.uid)&&digest(rows.get(row.uid))===digest(row),'第'+row.floor+'层原文或候选已改变，请重新核对；未写入旧批次');
 }
 async function read(id){const s=await database.read(),p=plans(s).find(p=>p.id===id);check(p,'历史批次不存在于当前聊天');guard(p);return clone(p);}
 async function save(p){
  guard(p);const s=await database.read();guard(p);check(s.contextKey===p.contextKey,'批次存档归属已变化');
  const previous=plans(s).find(x=>x.id===p.id);check(!previous||previous.revision===p.revision,'另一页面已更新批次，请重新打开');
  const next={...clone(p),revision:p.revision+1};
  await database.commit({operationId:p.id+':progress:'+next.revision+':'+digest(next),contextKey:p.contextKey,expectedRevision:s.revision,changes:[{tableId:'T_SYS_CELL_REQUESTS',recordId:stableId(p.id),values:{instruction:p.label,parse_status:p.status,validation_status:'候选需核对'},metadata:{historyBatch:next}}],source:{kind:'history-batch-progress',batchId:p.id}});
  guard(p);return next;
 }
 async function create({from=1,to,batchSize=10,includeLatest=false,mode='extract'}={}){
  check(!active.size,'已有历史批次正在运行');check(Number.isSafeInteger(batchSize)&&batchSize>=1&&batchSize<=1000,'每批条数须为1—1000的整数');check(['extract','summary'].includes(mode),'未知历史任务');
  const scope=identity(),view=await api.inspect(),s=await database.read();check(scope===identity(),'聊天已切换');check(s?.state,'请先接入当前聊天表单，再生成历史批次');
  to??=view.history.at(-1)?.floor??1;check(Number.isSafeInteger(from)&&from>=1&&Number.isSafeInteger(to)&&to>=from,'楼层范围无效');
  const rows=memoryMessageRows(getContext().chat),statuses=new Map(view.history.map(r=>[r.uid,r]));
  const selected=rows.filter(r=>r.floor>=from&&r.floor<=to&&r.role==='assistant'&&archivalText(normalizeEnvelope(r.text)).trim()&&(includeLatest||!statuses.get(r.uid)?.latest));
  check(!selected.some(r=>statuses.get(r.uid)?.changed),'已归档来源发生变化，请先核对旧记录');
  const sources=selected.filter(r=>mode==='summary'||statuses.get(r.uid)?.canImport);
  check(sources.length,'所选范围没有待处理的有效AI正文');
  // Pin the corresponding user context too: changing an instruction during
  // a request cannot silently change attribution in a saved candidate.
  const contextIds=new Set(sources.map(r=>r.uid));for(const r of sources){let i=rows.findIndex(x=>x.uid===r.uid)-1;while(i>=0&&rows[i].role==='user')contextIds.add(rows[i--].uid);}
  const allSources=rows.filter(r=>contextIds.has(r.uid)),id='history-batch:'+digest({scope,allSources,batchSize,mode});
  const prior=plans(s).find(p=>p.id===id);if(prior)return clone(prior);
  const batches=[];for(let i=0;i<sources.length;i+=batchSize){const group=sources.slice(i,i+batchSize);batches.push({index:batches.length,from:group[0].floor,to:group.at(-1).floor,uids:group.map(r=>r.uid),status:'pending',draftId:null,error:null});}
  return save({format:FORMAT,id,scope,contextKey:s.contextKey,revision:0,mode,label:mode==='summary'?'历史分批总结':'历史分批补录',range:{from,to},batchSize,includeLatest,sources:allSources,batches,status:'paused',skipped:selected.length-sources.length});
 }
 async function run(id,{onProgress=()=>{},signal}={}){
  check(!active.size,'已有历史批次正在运行');const control={paused:false};active.set(id,control);
  let p;
  try{
   p=await read(id);verify(p);check(p.status!=='committed','此批已入档');p.status='running';p=await save(p);onProgress(clone(p));
   for(let index=0;index<p.batches.length;index++){
    const entry=p.batches[index];
    verify(p);if(control.paused||signal?.aborted)break;
    // Recover a reply saved just before progress persistence was interrupted.
    const s=await database.read(),retained=drafts(s).find(d=>d.args?.batchId===id&&d.args?.batchIndex===entry.index);
    if(retained?.phase==='ready'){entry.draftId=retained.id;entry.status='ready';entry.error=null;continue;}
    if(retained?.phase==='committed'){entry.status='covered';continue;}
    if(entry.status==='ready')entry.status='failed';
    if(entry.status==='covered')continue;
    entry.status='running';entry.error=null;p=await save(p);onProgress(clone(p));
    const target=p.batches[entry.index];
    try{
     const d=await api.generate({kind:'history',sourceKind:'chat',from:target.from,to:target.to,includeLatest:p.includeLatest,messageUids:target.uids,output:p.mode,batchId:id,batchIndex:target.index,label:p.label+' '+target.from+'—'+target.to,goal:p.mode==='summary'?'从本批完整原文生成阶段摘要，保留人物关系变化、已成立的未完事项与每条来源楼层；按原文顺序整理，不续写。':'提炼本批历史事件、原话及事实；同一人物地点复用，不重放当前状态。'});
     verify(p);target.draftId=d.id;target.status=d.already?'covered':'ready';target.error=null;
    }catch(error){target.draftId=error.draft?.id??target.draftId;target.status='failed';target.error=error.message;p.status='paused';p=await save(p);onProgress(clone(p));throw Object.assign(error,{batch:clone(p)});}
    p=await save(p);onProgress(clone(p));
   }
   p.status=p.batches.every(b=>['ready','covered'].includes(b.status))?'ready':'paused';p=await save(p);onProgress(clone(p));return p;
  }finally{active.delete(id);}
 }
 async function compile(id){
  const p=await read(id);verify(p);check(!active.has(id),'请先暂停生成再核对');check(p.status!=='committed','此批已经归档');
  const s=await database.read(),e=new Runtime(clone(s.state)),items=[],changes=[],diff=[];
  for(const b of p.batches){
   if(b.status==='covered')continue;
   const d=drafts(s).find(d=>d.id===b.draftId);check(d?.phase==='ready','第'+b.from+'—'+b.to+'层尚无有效候选，请先完成或修正该批');
   await checkSource(d,s);const local={...s,state:e.data},candidate=clone(d);candidate.forms=refreshForms(candidate,local);
   const parsed=validate(candidate,local,candidate.rawResponse);if(parsed.proposal.matrix.changes.length)applyMatrixChanges(e,parsed.proposal.matrix.changes,{mode:'revise'});
   changes.push(...parsed.proposal.matrix.changes);diff.push(...parsed.diff.map(x=>({...x,batch:b.index+1})));
   items.push({draft:candidate,changes:parsed.proposal.matrix.changes});
  }
  check(items.length,'没有待确认候选');verify(p);
  return {p,s,items,changes,diff,signature:digest({plan:p,revision:s.revision,raw:items.map(x=>x.draft.rawResponse),changes})};
 }
 async function preview(id){const c=await compile(id),token=id+':preview:'+c.signature;previews.set(token,c.signature);return {token,batchId:id,diff:clone(c.diff),batches:c.items.length,changes:c.changes.length};}
 async function commit(token,{reviewed=false}={}){
  check(reviewed,'请先核对整批候选');check(previews.has(token),'请先预览整批');const id=token.slice(0,token.lastIndexOf(':preview:')),c=await compile(id);check(previews.get(token)===c.signature,'预览后来源、草稿或档案已变化，请重新核对');
  const completed={...c.p,status:'committed',revision:c.p.revision+1},sources=[];
  for(const {draft:d,changes}of c.items){sources.push({kind:'matrix-foundation',operationId:d.id,source:clone(d.source),rawResponse:d.rawResponse,responseHash:digest(d.rawResponse),changes:changes.length,semantic:'author-confirmed',execution:'facts-only'});c.changes.push({tableId:'T_SYS_CELL_REQUESTS',recordId:stableId(d.id),values:{parse_status:'committed',validation_status:'已核对入档'},metadata:{foundationDraft:{...d,phase:'committed'}}});}
  c.changes.push({tableId:'T_SYS_CELL_REQUESTS',recordId:stableId(id),values:{parse_status:'committed',validation_status:'已核对入档'},metadata:{historyBatch:completed}});
  verify(c.p);await database.commit({operationId:id+':confirm',contextKey:c.p.contextKey,expectedRevision:c.s.revision,changes:c.changes,source:{kind:'matrix-foundation-batch',batchId:id,items:sources}});guard(c.p);previews.delete(token);onCommitted();return completed;
 }
 return {create,read,run,preview,commit,pause(id){const c=active.get(id);if(c)c.paused=true;},list:async()=>clone(plans(await database.read()))};
}
