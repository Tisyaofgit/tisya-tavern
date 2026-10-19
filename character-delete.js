// Delete by stable avatar. The native delete function closes every current chat,
// even when deleting an unrelated card, so only use it for the active card.
export async function deleteCharacterScoped(id,{deleteChats=false,getContext,host,request,cleanup=async()=>{},refreshWorldbooks=async()=>{}}){
 const c=getContext(),index=c.characters.findIndex(x=>x.avatar===id),character=c.characters[index];
 if(!character)throw Error('角色已不存在，请刷新列表');
 if(!c.groupId&&c.characters[c.characterId]?.avatar===id)return host.deleteCharacter(id,{deleteChats});
 const chats=deleteChats?await request('/api/characters/chats',{avatar_url:id}):[];
 if(deleteChats&&(!chats||typeof chats!=='object'||chats.error))throw Error('无法读取待删除的聊天列表');
 // Capture the current view after the read; opening the target meanwhile must
// go through native active-chat deletion instead of deleting underneath it.
 const now=getContext();
 if(!now.groupId&&now.characters[now.characterId]?.avatar===id)return host.deleteCharacter(id,{deleteChats});
 await request('/api/characters/delete',{avatar_url:id,delete_chats:deleteChats},{text:true});
 try{
  const rows=await request('/api/characters/all',{});
  if(!Array.isArray(rows)||rows.some(x=>!x||typeof x.avatar!=='string')||rows.some(x=>x.avatar===id))throw Error('角色列表回读未确认');
  const live=getContext(),active=live.characters[live.characterId];
  // Keep the loaded active card object, messages, metadata and temporary chat.
  // Reindex before rendering; never select a character or clear the chat here.
  const activeIndex=active?rows.findIndex(x=>x.avatar===active.avatar):-1;
  if(active&&active.avatar!==id&&activeIndex<0)throw Error('当前角色不在回读列表中，请刷新核对');
  if(activeIndex>=0)rows[activeIndex]=active;
  live.characters.splice(0,live.characters.length,...rows);
  host.setCharacterId(activeIndex>=0?activeIndex:undefined);
  await cleanup(id);
  if(deleteChats)for(const row of Object.values(chats))if(typeof row?.file_name==='string'&&live.eventTypes.CHAT_DELETED)await live.eventSource.emit(live.eventTypes.CHAT_DELETED,row.file_name.replace(/\.jsonl$/,''));
  if(live.eventTypes.CHARACTER_DELETED)await live.eventSource.emit(live.eventTypes.CHARACTER_DELETED,{id:index,character});
  await host.printCharacters(true);
  await refreshWorldbooks();
 }catch(e){throw Error('角色删除请求已提交；后续刷新未完成，请刷新核对：'+e.message);}
 return true;
}
