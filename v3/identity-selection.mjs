/** Save the old archive before the native identity service activates a new user. */
export async function selectArchiveIdentity(books,personas,id){
 if(!books)return {status:'unbound'};
 const active=await books.binding();
 if(!active.binding)return {status:'unbound'};
 if(active.binding.player.id===id)return {status:'unchanged'};
 const name=personas?.[id];
 if(typeof name!=='string')throw Error('用户身份已不存在，请重新读取');
 const result=await books.select({
  player:{id,name},preferenceOwner:{kind:'player',id},
  expectedBindingRevision:active.pointer?.bindingRevision??null,
  operationId:crypto.randomUUID()
 });
 if(!['complete','unchanged'].includes(result?.status))throw Error('身份切换尚未完成，请在资料绑定中继续核对');
 const saved=await books.binding();
 if(saved.pointer?.archiveId!==active.pointer?.archiveId||saved.binding?.player.id!==id)throw Error('身份与当前存档的绑定未通过读回核验');
 return result;
}
