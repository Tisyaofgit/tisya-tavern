// Uses the panel's shared controls and the foundation service's one queue.
export async function mountHistoryBatch({api,parent,el,field,button,table,range,showDraft,onSaved,notice}){
 let count=10,current=null;const progress=el('div'),review=el('div');progress.setAttribute('aria-live','polite');
 parent.append(el('p','自动读取当前聊天的全部已确认正文，或使用上方楼层范围。每批按 AI 正文条数分组，用户消息保留为上下文；已入档及暂存内容自动跳过。生成期间只保存候选，核对整批后才入档。'));
 field(parent,'每批 AI 正文条数',count,{type:'number',track:false,change:v=>count=v});
 const labels={pending:'待生成',running:'生成中',ready:'待核对',covered:'已覆盖',failed:'失败',paused:'已暂停',committed:'已入档'};
 function display(p){current=p;progress.replaceChildren();progress.append(el('p',p.label+' · '+(labels[p.status]??p.status)+' · '+p.batches.filter(b=>['ready','covered'].includes(b.status)).length+'/'+p.batches.length+' 批 · 跳过 '+p.skipped+' 条'));
  table(progress,['批次','原楼层范围','正文条数','状态'],p.batches.map(b=>[b.index+1,b.from+'—'+b.to,b.uids.length,(labels[b.status]??b.status)+(b.error?'：'+b.error:'')]));
  if(p.status!=='running')for(const b of p.batches)if(b.draftId)button(progress,'查看／修订第 '+(b.index+1)+' 批',async()=>showDraft(await api.read(b.draftId)));
 }
 async function start(mode,all){review.replaceChildren();const selected=range();current=await api.batch.create({...selected,...(all?{from:1,to:undefined}:{}),batchSize:count,mode});display(current);try{display(await api.batch.run(current.id,{onProgress:display}));}catch(error){if(error.batch)display(error.batch);throw error;}}
 button(parent,'全部历史 · 分批生成',()=>start('extract',true));button(parent,'所选范围 · 分批生成',()=>start('extract',false));button(parent,'全部历史 · 一键分批总结',()=>start('summary',true));
 const pause=el('button','暂停（保留当前批结果）');pause.type='button';pause.onclick=()=>{if(current){api.batch.pause(current.id);notice.textContent='本批返回并保存后暂停；再次打开可继续。';}};parent.append(pause);
 button(parent,'继续／重试未完成批',async()=>{if(!current)throw Error('请先选取已保存批次');review.replaceChildren();try{display(await api.batch.run(current.id,{onProgress:display}));}catch(error){if(error.batch)display(error.batch);throw error;}});
 button(parent,'核对整批候选',async()=>{
  if(!current)throw Error('请先生成或打开批次');const preview=await api.batch.preview(current.id);review.replaceChildren();review.append(el('h4','整批差异 · '+preview.batches+' 批 · '+preview.diff.length+' 个字段'));
  table(review,['批次','表与记录','字段','原值','填写值'],preview.diff.map(d=>[d.batch,(d.tableLabel??d.tableId)+'／'+(d.recordName??d.recordId),d.label,d.before===undefined?'未提供':(d.beforeDisplay??d.before),d.afterDisplay??d.after]));
  const checked=field(review,'已逐批核对原文、说话人和事实归属',false,{type:'checkbox',track:false});
  button(review,'确认整批入档',async()=>{display(await api.batch.commit(preview.token,{reviewed:checked.checked}));review.replaceChildren();onSaved();notice.textContent='整批已入档；当前数值与时钟未重放。';});
 });
 parent.append(progress,review);const saved=el('details');saved.append(el('summary','恢复已保存的历史批次'));parent.append(saved);
 for(const p of await api.batch.list())button(saved,p.label+' · '+p.range.from+'—'+p.range.to+' · '+(labels[p.status]??p.status),async()=>{review.replaceChildren();display(await api.batch.read(p.id));});
}
