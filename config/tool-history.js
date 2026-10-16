export function hasToolMetadata(message){return !!message&&(message.role==='tool'||message.tool_calls!==undefined&&!(Array.isArray(message.tool_calls)&&message.tool_calls.length===0)||message.extra?.tool_invocations!==undefined&&!(Array.isArray(message.extra.tool_invocations)&&message.extra.tool_invocations.length===0));}

// The native parser owns canonical/legacy formats, ID matching and ignored
// records. Keep its original records and opaque signatures byte-for-byte.
export function historyGroups(chat,projectToolTurns){
 if(!chat.some(hasToolMetadata))return chat.map((message,index)=>({indices:[index],message,tool:false}));
 if(typeof projectToolTurns!=='function')throw Error('宿主工具历史解析接口不可用，未裁剪工具记录。');
 const entries=projectToolTurns(chat,false),seen=new Set();
 if(!Array.isArray(entries))throw Error('宿主工具历史投影无效');
 const groups=entries.map(entry=>{
  if(!['message','tool-turn'].includes(entry?.type))throw Error('宿主工具历史投影类型无效');
  const tool=entry.type==='tool-turn',indices=tool?entry.sourceIndices:[entry.sourceIndex];
  if(!Array.isArray(indices)||!indices.length)throw Error('宿主工具历史来源缺失');
  for(const index of indices){if(!Number.isSafeInteger(index)||index<0||index>=chat.length||seen.has(index))throw Error('宿主工具历史来源重复或越界');seen.add(index);}
  return {indices,message:chat[indices[0]],tool};
 });
 if(seen.size!==chat.length)throw Error('宿主工具历史投影遗漏消息');
 return groups;
}


