// These receipts describe one invocation. The ledger remains the only source
// of archive completion; no counters or error flags are persisted separately.
export function archivePending(view,sourceKey){
 if(!view)return [];
 const latest=new Map();
 for(const commit of view.commits){
  if(!['archive','history'].includes(commit.kind)||view.archived.has(commit.source))continue;
  if(sourceKey!==undefined&&commit.source!==sourceKey)continue;
  latest.set(commit.source,commit);
 }
 // Each accepted retry replaces this source's open list. Earlier receipts
 // remain in the journal, but must not revive items resolved by a later retry.
 return structuredClone([...latest.values()].flatMap(commit=>commit.pending??[]));
}

export function planArchiveRun(loaded,{includeLatest=false,range=null}={}){
 const ai=loaded.chain.filter(s=>s.role==='assistant'&&(!range||s.floor>=range.from&&s.floor<=range.to));
 const confirmed=s=>includeLatest||loaded.chain.some(u=>u.role==='user'&&u.index>s.index);
 const pending=ai.filter(s=>confirmed(s)&&!loaded.view.archived.has(s.key));
 return {pending,selected:pending.slice(0,range?.limit??Infinity),waiting:ai.filter(s=>!confirmed(s)&&!loaded.view.archived.has(s.key))};
}

export function archiveRunReceipt(loaded,plan,attempted){
 const identity=s=>({key:s.key,floor:s.floor});
 const completed=attempted.filter(s=>loaded.view.archived.has(s.key));
 const blocked=attempted.filter(s=>!loaded.view.archived.has(s.key)).map(source=>{
  return {...identity(source),pending:archivePending(loaded.view,source.key)};
 });
 const remaining=plan.pending.filter(s=>!loaded.view.archived.has(s.key)).map(identity);
 return {status:blocked.length?'blocked':remaining.length?'partial':'complete',requested:plan.pending.length,processed:attempted.length,completed:completed.length,remaining,blocked,waiting:plan.waiting.map(identity)};
}

export function archiveRunMessage(run){
 if(!run)return '归档结果缺少本批回执，请重新查看楼层清单。';
 if(run.status==='disabled')return '自动记忆归档已关闭，本次未处理楼层。';
 const parts=['本批完成 '+run.completed+' / '+run.processed+' 条已处理回复'];
 if(run.blocked.length)parts.push('第 '+run.blocked.map(s=>s.floor).join('、')+' 层仍待处理，后续归档已停止');
 if(run.remaining.length)parts.push('所选范围还剩 '+run.remaining.length+' 条');
 if(run.waiting.length)parts.push(run.waiting.length+' 条最新回复尚未确认保留');
 if(!run.remaining.length&&!run.waiting.length)parts.push('所选范围已归档');
 return parts.join('；')+'。';
}

export function assertArchiveRunComplete(run,cause){
 if(!run||run.status==='disabled'||!run.remaining.length)return;
 const first=run.blocked[0]??run.remaining[0];
 const error=new Error('第 '+first.floor+' 层记忆归档尚未完成；已保存的正确记录保留，请在缇斯亚助手的会话历史中核对后继续。',{cause});
 error.code='ARCHIVE_INCOMPLETE';error.source={key:first.key,floor:first.floor};throw error;
}
