import {digest} from './common.mjs';

// Explain the first failed anchor without exposing story text or changing it.
export function phoneOriginStatus(edit,messages){
 if(!Array.isArray(messages))return {reason:'history-unavailable',problem:'当前聊天历史尚未完整读取。'};
 for(const [index,anchor] of (edit.anchor_chain??[]).entries()){
  const message=messages[index];
  if(!message)return {reason:'message-missing',mismatchIndex:index,problem:'初始化记录依赖的第 '+(index+1)+' 楼目前不在聊天历史中。'};
  if(message.uid!==anchor.uid)return {reason:'identity-changed',mismatchIndex:index,problem:'从第 '+(index+1)+' 楼起，消息身份或排列与初始化记录不一致。'};
  if(digest({role:message.role,text:message.text??'',uid:message.uid})!==anchor.signature)return {reason:'content-changed',mismatchIndex:index,problem:'第 '+(index+1)+' 楼的正文或候选与初始化时不同，需要核对该楼。'};
 }
 return {reason:'anchors-match',problem:'已记录的楼层锚点一致，仍需核对手机初始化记录的归属。'};
}
