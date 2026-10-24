/** Only an explicit whole-message identity command can mutate native identity.
 * Ambiguous names never pick the first persona; the existing identity service
 * owns archive checkpointing, native activation, binding and durable recovery. */
export function createIdentityCommand(service){
 return async text=>{
  if(typeof text!=='string')return null;
  const match=/^(?:请)?(?:把|将)?(?:当前)?(?:用户身份|用户档案)(?:切换|换)(?:为|成|到)\s*(.+?)[。！!]?$/u.exec(text.trim())??/^(?:请)?(?:切换|更换)(?:当前)?(?:用户身份|用户档案)(?:为|成|到|：|:)\s*(.+?)[。！!]?$/u.exec(text.trim());
  if(!match)return null;
  const name=match[1].replace(/^[「“"']|[」”"']$/g,'').trim();
  if(!name||/[\r\n]/.test(name))throw Error('请单独发送：切换用户身份为姓名；重名时填写身份 ID。');
  if(!service?.read||!service?.select)throw Error('用户身份切换服务尚未就绪');
  const state=service.read(),byId=state.personas.filter(p=>p.id===name),matches=byId.length?byId:state.personas.filter(p=>p.name===name);
  if(!matches.length)throw Error('没有找到用户身份“'+name+'”；请在用户身份页新建或核对名称。');
  if(matches.length!==1)throw Error('用户身份“'+name+'”存在重名，请改用身份 ID：'+matches.map(p=>p.id).join('、'));
  const persona=matches[0];
  const result=await service.select({id:persona.id,revision:state.revision,chat:!!state.scope.chatId,character:false,global:false});
  if(result.active!==persona.id||state.scope.chatId&&result.locked!==persona.id)throw Error('身份切换结果尚未通过核验，请到用户身份页继续核对。');
  return {answer:'已切换当前用户身份为“'+persona.name+'”。'+(state.scope.chatId?'当前聊天和存档关联已核对。':''),personaId:persona.id};
 };
}
