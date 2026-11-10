import {projectDatabaseIdentity} from './engine/identity.mjs';
import {createPersonaSlots} from './persona-slots.js';
const clone=x=>structuredClone(x),stamp=x=>JSON.stringify(x),check=(v,m)=>{if(!v)throw Error(m)};
export function createIdentityService({getContext,getAvatar,applyActive,persistSettings,persistChat,assertIdle=()=>{},validateSelection=async()=>{},afterSelect=async()=>{},convertCharacter,slotHost,resolveOrigin,matrixDatabase=null,openNative,openPage,onChanged=()=>{}}){
 const listeners=new Set();let busy=false;
 const power=()=>getContext().powerUserSettings??{};
 const scope=()=>{const c=getContext();return {chatId:c.chatId??null,characterAvatar:c.groupId!=null?null:c.characters?.[c.characterId]?.avatar??null,groupId:c.groupId??null}};
 const settingsStamp=()=>stamp({avatar:getAvatar(),description:power().persona_description,personas:power().personas,descriptions:power().persona_descriptions,default:power().default_persona});
 const revision=()=>stamp({scope:scope(),settings:settingsStamp(),lock:getContext().chatMetadata?.persona,pending:power().tisya_identity_pending});
 const read=()=>{const p=power();return {scope:scope(),active:getAvatar(),description:p.persona_description??'',name:getContext().name1??'',revision:revision(),default:p.default_persona??null,locked:getContext().chatMetadata?.persona??null,personas:Object.entries(p.personas??{}).map(([id,name])=>({id,name,descriptor:clone(p.persona_descriptions?.[id]??{})})),pending:clone(p.tisya_identity_pending??null),creationPending:clone(p.tisya_identity_creation_pending??null)}};
 const changed=()=>{onChanged();for(const fn of listeners)fn()};
 const resolveProfile=async reference=>{if(!reference?.database)return resolveOrigin(reference);check(matrixDatabase,'统一表单接口尚未接入');const snapshot=await matrixDatabase.read();check(snapshot.contextKey===reference.contextKey,'人物档案属于另一聊天，请回原聊天继续创建');check(snapshot.state.runtime?.receipts?.[reference.operationId]?.status==='COMMITTED','人物创作回执已不在当前历史，请回原进度继续创建');const profile=projectDatabaseIdentity(snapshot,reference);return {name:profile.name,description:profile.text,reference:clone(reference)};};
 const slots=createPersonaSlots({getContext,getAvatar,resolveOrigin:resolveProfile,host:slotHost,persist:persistSettings,assertIdle,onChanged:changed});
 async function createFromMatrix({draft,receipt}){
  check(!busy,'身份操作尚未完成');check(draft?.format==='tisya.matrix-creation/1'&&draft.kind==='character'&&typeof draft.operationId==='string','人物创作草稿无效');check(receipt?.state&&receipt.contextKey===draft.contextKey&&Number.isInteger(receipt.revision),'人物表单保存回执尚未确认');
  const confirmed=receipt.state.runtime?.receipts?.[draft.operationId];check(confirmed?.status==='COMMITTED'&&confirmed.operation_id===draft.operationId&&confirmed.result?.source?.kind==='creation'&&stamp(confirmed.result.source.binding)===stamp(draft.proposal?.matrix?.binding),'人物创作回执与已核对草稿不匹配');
  const binding={database:true,...draft.proposal?.matrix?.binding};projectDatabaseIdentity(receipt,binding);const reference={database:true,contextKey:receipt.contextKey,entityId:binding.entityId,dossierId:binding.dossierId,operationId:draft.operationId,revision:receipt.revision};
  const completed=Object.entries(power().persona_descriptions??{}).filter(([,value])=>value.tisyaMatrixOrigin?.operationId===reference.operationId&&value.tisyaMatrixOrigin?.contextKey===reference.contextKey);
  check(completed.length<=1,'同一表单创作对应多个人物槽位，请先核对');
  if(completed.length&&!slots.hasPending()){const [id,descriptor]=completed[0];check(Object.hasOwn(power().personas??{},id)&&stamp(descriptor.tisyaMatrixOrigin)===stamp(reference),'已创建人物槽的表单引用已变化，请先核对');return {id,name:power().personas[id],reference:clone(reference),created:true,replayed:true};}
  return slots.createFromOrigin(reference);
 }
 async function finish(intent){const p=power(),guard=()=>check(stamp(scope())===stamp(intent.scope),'会话已改变；绑定保留待核对，请回到原会话继续');guard();check(settingsStamp()===intent.after,'身份设置已被另行修改，不能继续旧绑定');check([intent.lockBefore,intent.id].includes(getContext().chatMetadata?.persona??null),'聊天身份已被另行修改，不能覆盖');
 // Confirm settings before the dependent chat write, also when recovering a
 // failed first save. The durable intent survives process/page restarts.
 check(await persistSettings()===true,'身份设置已在内存更新，持久保存尚未确认；请继续核对');guard();check(settingsStamp()===intent.after,'保存期间身份设置已改变');if(intent.chat!==false){getContext().chatMetadata.persona=intent.id;intent.stage='chat';const result=await persistChat();check(result!==false&&result!==undefined,'身份设置已保存，聊天锁定保存尚未确认；请继续核对');guard();check(getContext().chatMetadata.persona===intent.id,'聊天身份回读不同');check(settingsStamp()===intent.after,'聊天保存期间身份设置已改变');}intent.stage='archive';await afterSelect(intent.id);guard();check(settingsStamp()===intent.after,'档案保存期间身份设置已改变');delete p.tisya_identity_pending;try{check(await persistSettings()===true,'聊天绑定已保存，恢复标记清理尚未确认');}catch(e){p.tisya_identity_pending=intent;throw e}guard();return read();}
 async function resume(){check(!busy,'身份操作尚未完成');assertIdle();const intent=power().tisya_identity_pending;check(intent?.format==='tisya.identity-intent/1','没有待恢复的身份绑定');busy=true;try{const result=await finish(intent);changed();return result}catch(e){intent.error=e.message;changed();throw e}finally{busy=false}}
 async function select(input){check(!busy,'身份操作尚未完成');assertIdle();check(!power().tisya_identity_pending,'上次绑定尚未完成，请先继续核对');check(input.id!==power().tisya_identity_creation_pending?.id,'这个新人物槽尚未确认保存，请先继续创建');const before=read();check(input?.revision===before.revision,'身份或会话已变化，请重新读取');const selected=before.personas.find(p=>p.id===input.id);check(selected,'用户身份已不存在');check(!input.chat||before.scope.chatId,'没有当前聊天可绑定');const target=before.scope.groupId!=null?{type:'group',id:before.scope.groupId}:{type:'character',id:before.scope.characterAvatar};check(!input.character||target.id!=null,'没有角色或群聊可绑定');busy=true;const guard=()=>check(stamp(scope())===stamp(before.scope),'会话已改变，请核对已保存部分');try{
 await validateSelection(input.id);check(revision()===before.revision,'身份或会话已变化，请重新读取');const c=getContext(),p=power();guard();if(input.character){if(!p.persona_allow_multi_connections)for(const [id,d]of Object.entries(p.persona_descriptions))if(id!==input.id&&d.connections)d.connections=d.connections.filter(x=>!(x.type===target.type&&String(x.id)===String(target.id)));const d=p.persona_descriptions[input.id]??={};d.connections=[...(d.connections??[]).filter(x=>!(x.type===target.type&&String(x.id)===String(target.id))),target];}
 if(input.global)p.default_persona=input.id;applyActive(input.id,selected.name);guard();check(getAvatar()===input.id,'活动身份回读不同');const intent={format:'tisya.identity-intent/1',id:input.id,scope:before.scope,lockBefore:before.locked,chat:!!input.chat,stage:'settings',after:settingsStamp()};p.tisya_identity_pending=intent;const result=await finish(intent);changed();return result;
 }catch(e){if(power().tisya_identity_pending)power().tisya_identity_pending.error=e.message;changed();throw e}finally{busy=false}}
 const fieldSnapshot=(owner,key)=>({present:Object.hasOwn(owner,key),value:owner[key]});
 function restoreField(owner,key,before,written){if(owner[key]!==written)return false;if(before.present)owner[key]=before.value;else delete owner[key];return true;}
 function confirmedError(error,kind,id,originalScope){const result=error instanceof Error?error:Error(String(error),{cause:error});result.receipt={kind,id,scope:clone(originalScope),confirmed:true};return result;}
 async function saveProfile(input){
  check(!busy&&!slots.isBusy()&&!power().tisya_identity_pending,'请先完成正在处理的身份绑定或创建');assertIdle();const before=read();
  check(input.revision===before.revision,'身份已变化，请重新读取');check(typeof input.name==='string'&&input.name.trim()&&!/[\r\n]/.test(input.name),'名字须是单行非空文字');check(typeof input.description==='string','设定须为文字');check(before.personas.some(p=>p.id===input.id),'身份已不存在');check(input.id!==power().tisya_identity_creation_pending?.id,'新人物槽尚未确认保存，请先继续创建');
  const p=power(),names=p.personas,oldDescriptions=fieldSnapshot(p,'persona_descriptions'),descriptions=p.persona_descriptions??(p.persona_descriptions={}),oldDescriptor=fieldSnapshot(descriptions,input.id),descriptor=descriptions[input.id]??(descriptions[input.id]={});
  const oldName=fieldSnapshot(names,input.id),oldDescription=fieldSnapshot(descriptor,'description'),oldActiveDescription=fieldSnapshot(p,'persona_description'),oldDisplayName=getContext().name1;
  let confirmed=false,projection=null;busy=true;
  try{
   names[input.id]=input.name;descriptor.description=input.description;
   if(getAvatar()===input.id){try{applyActive(input.id,input.name);}finally{projection={name:getContext().name1,description:p.persona_description};}}
   check(await persistSettings()===true,'身份资料持久保存尚未确认；本页修改仍需重试');confirmed=true;
   check(stamp(scope())===stamp(before.scope),'身份资料已确认保存；保存期间会话改变，请回到原会话核对已保存部分');changed();return read();
  }catch(error){
   if(confirmed)throw confirmedError(error,'profile',input.id,before.scope);
   // Undo only values still owned by this failed attempt. Other writers may have
   // changed individual fields or replaced the native maps during persistence.
   const nameRestored=p.personas===names&&restoreField(names,input.id,oldName,input.name);
   const descriptionRestored=p.persona_descriptions===descriptions&&descriptions[input.id]===descriptor&&restoreField(descriptor,'description',oldDescription,input.description);
   if(oldDescriptor.value!==descriptor&&descriptions[input.id]===descriptor&&!Object.keys(descriptor).length)restoreField(descriptions,input.id,oldDescriptor,descriptor);
   if(oldDescriptions.value!==descriptions&&p.persona_descriptions===descriptions&&!Object.keys(descriptions).length)restoreField(p,'persona_descriptions',oldDescriptions,descriptions);
   if(projection&&power()===p&&getAvatar()===input.id&&Object.hasOwn(p.personas??{},input.id)&&getContext().name1===projection.name&&p.persona_description===projection.description){
    try{
     applyActive(input.id,nameRestored?(oldDisplayName??oldName.value):p.personas[input.id]);
     if(descriptionRestored){if(oldActiveDescription.present)p.persona_description=oldActiveDescription.value;else delete p.persona_description;}
    }catch(rollbackError){throw new AggregateError([error,rollbackError],String(error?.message??error)+'；身份显示恢复未完成：'+String(rollbackError?.message??rollbackError),{cause:error});}
   }
   throw error;
  }finally{busy=false;}
 }
 async function saveWish(input){
  check(!busy&&!slots.isBusy()&&!power().tisya_identity_pending,'请先完成正在处理的身份绑定或创建');assertIdle();const before=read();check(input.revision===before.revision,'身份已变化，请重新读取');check(typeof input.description==='string','心愿须为文字');
  const p=power(),id=getAvatar(),descriptions=p.persona_descriptions,descriptor=descriptions?.[id],old=fieldSnapshot(p,'persona_description'),previous=descriptor?fieldSnapshot(descriptor,'description'):null;let confirmed=false;busy=true;
  try{
   p.persona_description=input.description;if(descriptor)descriptor.description=input.description;
   check(await persistSettings()===true,'心愿持久保存尚未确认；本页修改仍需重试');confirmed=true;
   check(stamp(scope())===stamp(before.scope),'心愿已确认保存；保存期间会话改变，请回到原会话核对已保存部分');changed();return read();
  }catch(error){
   if(confirmed)throw confirmedError(error,'wish',id,before.scope);
   if(power()!==p||getAvatar()===id)restoreField(p,'persona_description',old,input.description);
   if(descriptor&&p.persona_descriptions===descriptions&&descriptions[id]===descriptor)restoreField(descriptor,'description',previous,input.description);
   throw error;
  }finally{busy=false;}
 }
 return {read,saveWish,createFromMatrix,refresh(){changed();return read()},select,resume,saveProfile,async convertCharacter(input){check(!busy&&!slots.isBusy()&&!power().tisya_identity_pending,'请先完成身份绑定或创建');assertIdle();check(typeof convertCharacter==='function','角色转换接口不可用');busy=true;try{const done=await convertCharacter(input.id);if(done===false)return {cancelled:true};check(await persistSettings()===true,'角色已转换，身份保存未确认');changed();return {converted:true};}finally{busy=false}},createFromOrigin:ref=>{check(!busy,'身份操作尚未完成');return slots.createFromOrigin(ref);},resumeCreation:()=>{check(!busy,'身份操作尚未完成');return slots.resume();},isBusy:()=>busy||slots.isBusy(),hasPending:()=>!!power().tisya_identity_pending,hasCreationPending:()=>slots.hasPending(),capabilities:['openNative','select','bind','convertCharacter'],readContext:async()=>({status:'connected',capabilities:['openNative','select','bind','convertCharacter'],personaId:getAvatar(),displayName:getContext().name1,source:read().personas.find(x=>x.id===getAvatar())?.descriptor.tisyaOrigin??null,locked:!!getContext().chatMetadata?.persona,context:scope(),contextRevision:stamp(scope())}),resolve:async id=>read().personas.find(x=>x.id===id)??null,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},openNative:()=>openPage?openPage():openNative(),bind:()=>openPage?.(),dispose(){listeners.clear()}};
}
