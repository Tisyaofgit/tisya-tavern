// The host rejects stale chat metadata before committing it. Keep the original
// error/cause for diagnostics; never force a write or change the integrity ID.
export function describeChatMetadataFailure(cause,{group=false,hasIntegrity=false}={}){
 if(cause?.code!=='integrity'&&cause?.message!=='integrity')return cause;
 return Object.assign(new Error('聊天保存冲突（integrity）：当前页面与已保存聊天的校验标识不一致，本次保存未完成。请先保留未发送的草稿，再从聊天列表重新打开这段会话后重试。',{cause}),{
  code:'TISYA_CHAT_SAVE_INTEGRITY',
  tisyaChatSave:{stage:'metadata',hostCode:'integrity',chatType:group?'group':'character',hasIntegrity:hasIntegrity===true},
 });
}
