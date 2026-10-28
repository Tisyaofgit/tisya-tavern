const copy=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const check=(v,m)=>{if(!v)throw Error(m)};
export function createPersonaSlots({getContext,getAvatar,resolveOrigin,host,persist,assertIdle,onChanged=()=>{}}){
 let busy=false;const power=()=>getContext().powerUserSettings;
 const scope=()=>{const c=getContext();return JSON.stringify([c.chatId??null,c.characters?.[c.characterId]?.avatar??null,c.groupId??null]);};
 const comparable=p=>({name:p.name,description:p.description,reference:p.reference});
 async function finish(intent){
  const guard=()=>{check(scope()===intent.scope,'会话已改变；新人物槽保留待核对，请回原会话继续');check(getAvatar()===intent.active,'活动身份已改变；未覆盖当前身份');};guard();
  const current=await resolveOrigin(intent.reference);guard();check(same(comparable(current),comparable(intent.profile)),'人物原点已变化，未使用旧资料创建槽位');
  check(await host.ensureAvatar(intent.id)===intent.id,'新人物头像创建未确认；请继续核对同一槽位');guard();intent.stage='avatar';
  const p=power();p.personas??={};p.persona_descriptions??={};
  if(Object.hasOwn(p.personas,intent.id))check(p.personas[intent.id]===intent.profile.name&&p.persona_descriptions[intent.id]?.description===intent.profile.description&&(p.persona_descriptions[intent.id]?.tisyaOrigin===undefined||same(p.persona_descriptions[intent.id]?.tisyaOrigin,intent.reference)),'新槽位身份发生冲突，未覆盖');
  else{await host.initialize(intent.id,intent.profile);guard();check(p.personas[intent.id]===intent.profile.name&&p.persona_descriptions[intent.id]?.description===intent.profile.description,'原生人物槽回读不同');}
  p.persona_descriptions[intent.id].tisyaOrigin=copy(intent.reference);
  intent.stage='settings';check(await persist()===true,'人物槽已建立，设置持久保存未确认；请继续创建同一槽位');guard();
  check(same(p.persona_descriptions[intent.id]?.tisyaOrigin,intent.reference),'人物槽的档案引用回读不同');
  delete p.tisya_identity_creation_pending;
  try{check(await persist()===true,'人物槽已保存，恢复标记清理未确认');}catch(e){p.tisya_identity_creation_pending=intent;throw e;}
  guard();onChanged();return {id:intent.id,name:intent.profile.name,reference:copy(intent.reference),created:true};
 }
 async function createFromOrigin(input){
  const reference={book:input?.book,originId:input?.originId,id:input?.id,rev:input?.rev};
  check(!busy,'人物槽创建尚未完成');assertIdle();check(!power()?.tisya_identity_pending,'请先完成正在处理的身份绑定');check(host&&typeof resolveOrigin==='function','自动创建人物槽接口尚未接入');busy=true;
  try{let intent=power().tisya_identity_creation_pending;
   if(intent)check(same(intent.reference,reference),'已有另一份人物槽待核对，请先继续创建');
   else{const before=scope(),active=getAvatar(),profile=await resolveOrigin(reference);check(scope()===before&&getAvatar()===active,'读取人物期间会话或身份已改变');
    intent={format:'tisya.persona-create/1',id:'tisya-'+crypto.randomUUID()+'.png',reference:copy(profile.reference),profile:copy(profile),scope:before,active,stage:'prepared'};power().tisya_identity_creation_pending=intent;
    check(await persist()===true,'创建意图未确认保存，尚未上传新头像');
   }
   return await finish(intent);
  }catch(e){const pending=power()?.tisya_identity_creation_pending;if(pending)pending.error=e.message;throw e;}finally{busy=false;}
 }
 return {createFromOrigin,resume(){const intent=power()?.tisya_identity_creation_pending;check(intent,'没有待恢复的人物槽');return createFromOrigin(copy(intent.reference));},isBusy:()=>busy,hasPending:()=>!!power()?.tisya_identity_creation_pending};
}

// Uses the same avatar upload and initPersona path as the host's dummy persona.
export function createNativePersonaSlotHost({native,getContext,defaultAvatar,fetch:request=globalThis.fetch}){
 return {
  async ensureAvatar(id){
   check(typeof native.getUserAvatars==='function'&&typeof native.initPersona==='function','宿主缺少原生人物创建接口');
   const list=await native.getUserAvatars(false);check(Array.isArray(list),'原生头像列表读取失败');if(list.includes(id))return id;
   const url=defaultAvatar();check(typeof url==='string'&&url,'宿主默认用户头像未就绪');const image=await request(url);check(image.ok,'默认用户头像读取失败');
   const form=new FormData();form.append('avatar',new File([await image.blob()],'avatar.png',{type:'image/png'}));form.append('overwrite_name',id);
   const response=await request('/api/avatars/upload',{method:'POST',headers:getContext().getRequestHeaders({omitContentType:true}),body:form,cache:'no-store'});check(response.ok,'新人物头像上传失败，结果待核对');const result=await response.json();check(result.path===id,'新人物头像返回身份不同');
   check((await native.getUserAvatars(false)).includes(id),'新人物头像尚未确认写入');return id;
  },
  async initialize(id,profile){await native.initPersona(id,profile.name,profile.description,'',{silent:true});}
 };
}
