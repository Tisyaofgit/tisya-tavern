const copy=v=>structuredClone(v);
const PHASES=new Set(['prepare','model-a','validate','archive','native','world','preferences','query','writer','original-a','complete']);
const STATUSES=new Set(['running','saved','awaiting-review','blocked','failed','cancelled','superseded']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const labels={prepare:'准备资料','model-a':'整理本轮资料',validate:'核对更新',archive:'记忆归档',native:'原卡变量',world:'世界推进',preferences:'偏好分析',query:'查阅档案',writer:'创作正文','original-a':'保存正文',complete:'本轮完成'};

/** A projection of real runner receipts. Observers never own the transaction. */
export function createProgressService({readState,getBinding=()=>null,preferencesEnabled=()=>true,clock=()=>Date.now()}={}){
 const listeners=new Set();let value={binding:copy(getBinding()),requestKey:null,phase:'prepare',status:'saved',label:'暂无任务',counts:{saved:0,pending:0},receipts:[],updatedAt:clock()},sequence=0;
 function emit(next){value={...next,sequence:++sequence,updatedAt:clock()};for(const f of listeners)try{f(copy(value));}catch{}return copy(value);}
 function runtime(event){if(!event||!PHASES.has(event.phase)||!STATUSES.has(event.status))throw Error('Invalid progress event');const binding=copy(getBinding());if(event.binding&&!same(binding,event.binding))return false;return emit({...value,binding,requestKey:event.requestKey??value.requestKey,phase:event.phase,status:event.status,label:labels[event.phase],startedAt:value.requestKey===event.requestKey?(value.startedAt??clock()):clock(),...(Number.isSafeInteger(event.characters)&&event.characters>=0?{characters:event.characters}:{}),...(event.error?{error:{code:String(event.error.code??''),message:String(event.error.message??event.error)}}:{error:null})});}
 async function refresh({requestKey}={}){
  if(typeof readState!=='function')return copy(value);const initial=copy(getBinding()),state=await readState(),binding=copy(getBinding());if(initial!==null&&!same(initial,binding))throw Error('Binding changed while reading progress');
  const entries=Object.entries(state.requests??{}),key=requestKey??value.requestKey??entries.at(-1)?.[0],record=state.requests?.[key];
  const active=new Set(binding?.activeSourceKeys??[]),acknowledgedDraft=draft=>(state.preferenceBankReceipts??[]).some(r=>r.draftId===draft.id&&r.owner?.chatId===binding?.chatId&&r.owner?.branchId===binding?.branchId);
  const drafts=preferencesEnabled()?(state.preferenceDrafts??[]).filter(d=>d.status==='pending'&&(acknowledgedDraft(d)||(!Array.isArray(binding?.activeSourceKeys)||!d.contextSource||active.has(d.contextSource)||d.contributions?.some(c=>c.source.startsWith('feedback:'))))):[];
  const pendingAcknowledgements=drafts.reduce((n,d)=>n+(acknowledgedDraft(d)?d.changes.length:0),0),pending=drafts.reduce((n,d)=>n+(!acknowledgedDraft(d)?d.changes.length:0),0);
  if(!record)return emit({binding,requestKey:null,phase:pending||pendingAcknowledgements?'preferences':'prepare',status:pendingAcknowledgements?'blocked':pending?'awaiting-review':'saved',label:pendingAcknowledgements?'偏好已保存，回执待恢复':pending?'偏好待确认':'暂无任务',counts:{saved:0,pending,pendingAcknowledgements},receipts:[]});
  const planIds=new Set([...(record.plan?.archivePlans??[]).map(p=>p.prepared?.commit?.id),record.plan?.world?.prepared?.commit?.id].filter(Boolean));
  const retained=Array.isArray(binding?.activeSourceKeys)?projectRetained(state,binding.activeSourceKeys).commits:state.commits??[];
  const commits=retained.filter(c=>planIds.has(c.id));
  const receipts=commits.map(c=>({id:c.id,kind:c.kind,count:c.changes.length,source:c.source,rows:c.changes.map(x=>x.id)}));
  const saved=commits.reduce((n,c)=>n+c.changes.length,0);
  const phase=record.status==='delivered'?'complete':record.status==='writer-output'?'original-a':record.status==='writer-running'?'writer':record.preferencesDone?'query':record.worldDone?'preferences':record.completedSources?.length?'world':record.status==='planned'?'archive':record.status==='response'?'validate':'model-a';
  const inactive=record.status==='delivered'&&planIds.size>0&&!commits.length,live=same(binding,value.binding)&&value.requestKey===key&&value.status==='running';
  const uncertain=!live&&['awaiting-model','writer-running','writer-output'].includes(record.status)||!live&&Object.entries(state.nativeIntents??{}).some(([id,intent])=>id.startsWith(key+'\0')&&intent.phase==='parsing');
  // A durable validation rejection is a known failure, even though the runner
  // keeps writer-running to forbid another callback with the same request ID.
  const rejectedWriter=record.status==='writer-running'&&record.writerFailure?.stage==='writer'&&record.writerFailure?.phase==='response-validation'&&typeof record.writerFailure.code==='string'&&typeof record.writerFailure.message==='string';
  const status=inactive?'superseded':record.status==='delivered'?(pending?'awaiting-review':pendingAcknowledgements?'blocked':'saved'):rejectedWriter?'failed':same(binding,value.binding)&&value.requestKey===key&&['failed','blocked','cancelled'].includes(value.status)?value.status:uncertain?'blocked':'running';
  const error=rejectedWriter?{code:record.writerFailure.code,message:record.writerFailure.message}:same(binding,value.binding)&&value.requestKey===key&&['failed','blocked','cancelled'].includes(status)?copy(value.error??null):null;
  return emit({...value,binding,requestKey:key,phase,status,error,label:pendingAcknowledgements?'偏好已保存，回执待恢复':record.status==='delivered'&&pending?'偏好待确认':labels[phase],counts:{saved,pending,pendingAcknowledgements,archived:record.completedSources?.length??0,total:record.plan?.archivePlans?.length??0},receipts,deliveryReceipt:copy(record.result?.deliveryReceipt??null)});
 }
 return {runtime,refresh,snapshot:()=>copy(value),subscribe(listener){if(typeof listener!=='function')throw Error('Progress listener must be a function');listeners.add(listener);try{listener(copy(value));}catch{}return()=>listeners.delete(listener);},dispose(){listeners.clear();}};
}
import {projectRetained} from './host-runtime.mjs';
