// TT 2.4: real avatar upload -> exported initPersona -> confirmed settings save.
// This adapter never selects a persona or changes a card/chat/default binding.
const KEY='tisya_identity_creation',clone=x=>structuredClone(x),stamp=x=>JSON.stringify(x);
const check=(ok,message)=>{if(!ok)throw Error(message)};
export function createNativePersonaGateway({getContext,getAvatar,fetch:request=globalThis.fetch,defaultAvatar,initPersona,persistSettings,readAvatarIds,uuid=()=>globalThis.crypto.randomUUID()}){
 let busy=false;
 const power=()=>getContext().powerUserSettings;
 const scope=()=>{const c=getContext();return {chatId:c.chatId??null,characterAvatar:c.groupId!=null?null:c.characters?.[c.characterId]?.avatar??null,groupId:c.groupId??null}};
 const available=()=>!!power()&&typeof power().personas==='object'&&typeof power().persona_descriptions==='object'&&typeof request==='function'&&typeof initPersona==='function'&&typeof persistSettings==='function'&&typeof readAvatarIds==='function'&&typeof defaultAvatar==='string'&&!!defaultAvatar;
 const read=()=>clone(power()?.[KEY]??null);
 function guard(intent){check(stamp(scope())===stamp(intent.scope),'创建期间会话已改变；新身份不会绑定到其他角色卡，请回原会话核对');check(getAvatar()===intent.active,'活动身份已另行改变；请回原身份核对创建结果');check((power().default_persona??null)===intent.default,'全局默认身份已另行改变，请先核对');for(const [id,value]of Object.entries(intent.existing)){check(stamp({name:power().personas?.[id],descriptor:power().persona_descriptions?.[id]})===value,'已有身份已被另行修改；创建已暂停，请核对');}}
 async function persist(intent){check(await persistSettings()===true,'新身份保存尚未确认；请继续核对创建结果');guard(intent);}
 async function finish(intent){
  guard(intent);
  check(intent.format==='tisya.identity-creation/1','身份创建记录无法识别，请核对原生身份管理');
  if(intent.stage==='uploading'||intent.stage==='upload-unknown')throw Error('头像上传是否完成尚未确认；请在原生身份管理核对 '+intent.id+'，不会自动重传或覆盖');
  if(intent.stage==='prepared'){
   const source=await request(defaultAvatar);guard(intent);check(source.ok,'默认头像读取失败，未创建身份');const blob=await source.blob();guard(intent);check(blob.size>0,'默认头像为空，未创建身份');
   const currentIds=await readAvatarIds();guard(intent);check(Array.isArray(currentIds)&&!currentIds.includes(intent.id)&&!Object.hasOwn(power().personas??{},intent.id),'上传前新身份文件名已被占用，不能覆盖');
   const form=new FormData();form.append('avatar',blob,'avatar.png');form.append('overwrite_name',intent.id);
   intent.stage='uploading';await persist(intent);guard(intent);
   let response;try{response=await request('/api/avatars/upload',{method:'POST',headers:getContext().getRequestHeaders({omitContentType:true}),cache:'no-cache',body:form});}catch(e){intent.stage='upload-unknown';intent.error=e.message;throw Error('头像上传回执未取得，不能自动重试；请核对原生身份管理');}
   // Keep the actual receipt even if the user switched chat while upload ran.
   check(response.ok,'头像上传失败或未确认；请核对原生身份管理后继续');const data=await response.json();check(typeof data?.path==='string'&&data.path===intent.id,'头像上传返回的身份路径不一致；已停止后续写入');intent.stage='uploaded';guard(intent);await persist(intent);
  }
  if(intent.stage==='uploaded'){
   guard(intent);const target=power().persona_descriptions?.[intent.id];check(!power().personas?.[intent.id]&&!target?.description&&!target?.tisyaOrigin&&!(target?.connections?.length),'新身份文件已出现其他身份资料，不能初始化覆盖；请核对原生身份管理');intent.stage='initializing';await persist(intent);guard(intent);const beforeInit=power().persona_descriptions?.[intent.id];check(!power().personas?.[intent.id]&&!beforeInit?.description&&!beforeInit?.tisyaOrigin&&!(beforeInit?.connections?.length),'新身份文件已出现其他身份资料，不能初始化覆盖');
   await initPersona(intent.id,intent.name,intent.description,intent.title,{silent:true});
   intent.stage='initialized';guard(intent);
  }
  if(intent.stage==='initializing'){
   check(power().personas?.[intent.id]===intent.name&&power().persona_descriptions?.[intent.id]?.description===intent.description,'身份初始化结果未确认；请核对原生身份管理，不会重写现有身份');intent.stage='initialized';
  }
  check(intent.stage==='initialized'||intent.stage==='verified','身份创建阶段无法继续，请核对原生身份管理');
  check(power().personas?.[intent.id]===intent.name&&power().persona_descriptions?.[intent.id]?.description===intent.description,'新身份资料已另行改变，不能覆盖');
  await persist(intent);const ids=await readAvatarIds();guard(intent);check(Array.isArray(ids)&&ids.includes(intent.id),'未能从原生存储读回新身份，不能继续绑定');
  check(power().personas?.[intent.id]===intent.name&&power().persona_descriptions?.[intent.id]?.description===intent.description,'新身份回读资料不一致，不能继续绑定');intent.stage='verified';
  delete power()[KEY];try{await persist(intent)}catch(e){power()[KEY]=intent;throw e}
  return {id:intent.id,scope:clone(intent.scope),created:true};
 }
 async function run(intent){check(!busy,'身份创建正在进行');busy=true;try{return await finish(intent)}catch(e){if(power()[KEY])power()[KEY].error=e.message;throw e}finally{busy=false}}
 return {available,reason:()=>available()?'':'此宿主尚未连接真实头像上传和身份保存接口；可选择已有身份，或到原生管理创建',read,isBusy:()=>busy,
  async create({name,description='',title=''}){check(available(),'此宿主未连接真实身份创建接口');check(!busy&&!power()[KEY],'上次身份创建尚未完成，请先继续核对');check(typeof name==='string'&&name.trim()&&!/[\r\n]/.test(name),'名字须是单行非空文字');check(typeof description==='string'&&typeof title==='string','身份设定须为文字');check(scope().chatId&&scope().characterAvatar,'请先打开一张角色卡的聊天，再创建专属玩家');
   const baseline={scope:scope(),active:getAvatar(),default:power().default_persona??null,existing:Object.fromEntries(Object.keys(power().personas??{}).map(id=>[id,stamp({name:power().personas[id],descriptor:power().persona_descriptions?.[id]})]))};busy=true;
   try{const token=uuid();check(typeof token==='string'&&/^[a-zA-Z0-9-]{16,}$/.test(token),'无法生成独立头像文件名');const id='tisya-player-'+token+'.png';const ids=await readAvatarIds();guard(baseline);check(Array.isArray(ids),'无法核对原生身份清单');check(!ids.includes(id)&&!Object.hasOwn(power().personas??{},id),'新身份文件名已存在，请重新创建');
    const intent={format:'tisya.identity-creation/1',id,name:name.trim(),description,title,...baseline,stage:'prepared'};power()[KEY]=intent;return await finish(intent);
   }catch(e){if(power()[KEY])power()[KEY].error=e.message;throw e}finally{busy=false}
  },async resume(){check(available(),'此宿主未连接真实身份创建接口');const intent=power()[KEY];check(intent,'没有待核对的身份创建');return run(intent);}
 };
}
