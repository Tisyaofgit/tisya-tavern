import {digest,sha256} from './common.mjs';

// Read-only coverage shared by automatic settlement, history intake and UI.
// Saving a source is not proof that its semantic records reached the tables.
export function memoryImports(state){
 return Object.values(state?.runtime?.receipts??{}).map(r=>r.result?.source)
  .filter(s=>s?.kind==='matrix-foundation'&&s.source?.kind==='history'&&s.source?.sourceKind==='chat');
}
export function memoryMessageRows(chat){
 return (chat??[]).map((m,index)=>({floor:index+1,uid:m.extra?.tisya_engine?.uid??'floor:'+index,role:m.is_system?'system':m.is_user?'user':m.extra?.tisya_engine?.pending_sha256?'assistant_pending':'assistant',text:String(m.mes??''),candidate:m.swipe_id??0}));
}
export function archiveSupplemented(state,source,imports=memoryImports(state)){
 const hash=source?.host_message_sha256??source?.reply_sha256;
 return !!hash&&imports.some(imported=>(imported.source.messages??[]).some(m=>m.uid===source.entry_id&&sha256(m.text)===hash));
}
export function memoryCoverage(state,rows){
 const imports=memoryImports(state),imported=imports.flatMap(s=>s.source.messages??[]);
 const sources=new Map(Object.entries(state?.runtime?.sources??{}).map(([key,source])=>[source.entry_id,{key,source}]));
 const batches=new Map((state?.runtime?.archive_queue??[]).map(b=>[b.source_key,b]));
 return rows.map(row=>{
  const base={archived:false,changed:false,sourceSaved:false,canImport:false,pending:[]};
  if(row.role!=='assistant')return {...base,archiveStatus:row.role==='assistant_pending'?'candidate':'context'};
  const prior=imported.filter(m=>m.uid===row.uid),hash=digest(row),matched=prior.some(m=>m.hash===hash);
  if(matched)return {...base,archived:true,sourceSaved:true,archiveStatus:'imported'};
  if(prior.length)return {...base,changed:true,archiveStatus:'changed',pending:[{reason:'已补录的来源或候选发生变化，请核对原记录。'}]};
  const record=sources.get(row.uid),source=record?.source,sourceHash=source?.host_message_sha256??source?.reply_sha256;
  if(source&&sourceHash!==sha256(row.text))return {...base,changed:true,archiveStatus:'changed',pending:[{reason:'归档依据与当前回复不一致，请同步当前回合。'}]};
  const batch=record&&batches.get(record.key);
  if(batch){
   const pending=[...(batch.error?[{reason:batch.error.message,code:batch.error.code}]:[]),...(batch.plan?.pending??[]).map(p=>({reason:p.target+'：'+p.missing}))];
   return {...base,sourceSaved:true,archiveStatus:batch.status,archived:batch.status==='formal',canImport:batch.status==='blocked',pending};
  }
  const rejected=state?.runtime?.host_rejected?.[row.uid];
  return {...base,sourceSaved:!!source||!!rejected,canImport:true,archiveStatus:rejected?'rejected':'unarchived',pending:rejected?[{reason:rejected.error?.message??'回复未通过解析'}]:[]};
 });
}
export const MEMORY_STATUS_LABELS=Object.freeze({formal:'已正式归档',imported:'已补录入档',staged:'近期暂存',blocked:'归档待修',rejected:'回复待修',unarchived:'待提炼',changed:'来源已变，需核对',candidate:'未采纳候选',context:'上下文'});
