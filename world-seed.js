const copy=x=>structuredClone(x),check=(v,m)=>{if(!v)throw Error(m)};
export function worldSeedGoal(idea){return '从点子创建全新的表单化世界。当前角色卡只是空白游玩载体，不继承任何其他卡、人物或历史。请创建完整的世界设定、当前全局、初始地点、人物档案与有依据的开局状态；人物有自己的愿望和主线可能性，未来计划不写成已经发生的事件。可以边玩边扩充。主角未选定时建立候选人物档案，不覆盖当前原生用户身份。新增设计与用户指定条件分清，已有档案/当前进度通过增量维护。\n用户点子与必须保留的条件：\n'+idea;}
export function createWorldSeedService({getContext,createCarrier,findCarrier,openCarrier,persist,assertIdle=()=>{}}){
 let busy=false;const power=()=>getContext().powerUserSettings;
 const scope=()=>{const c=getContext();return JSON.stringify([c.chatId??null,c.characters?.[c.characterId]?.avatar??null,c.groupId??null]);};
 async function start(input){check(!busy,'新世界正在创建');assertIdle();check(power(),'宿主设置尚未就绪');busy=true;
  try{let intent=power().tisya_world_seed_pending;
   if(!intent){check(typeof input?.idea==='string'&&input.idea.trim(),'请先写一个世界点子');check(typeof input.name==='string'&&!/[\r\n]/.test(input.name),'世界名称须为单行文字');intent={format:'tisya.world-seed/1',id:crypto.randomUUID(),name:input.name.trim()||'小缇的新世界',idea:input.idea,originScope:scope(),stage:'prepared',carrier:null};power().tisya_world_seed_pending=intent;check(await persist()===true,'世界点子未确认保存，尚未创建载体');}
   if(intent.stage==='creating'&&!intent.carrier){const found=await findCarrier(intent.id);check(found,'载体创建结果尚未确认，未重复创建；请在角色列表核对后重新检查');intent.carrier=found;intent.stage='created';check(await persist()===true,'世界载体已找到，回执保存未确认');}
   if(!intent.carrier){check(scope()===intent.originScope,'会话已切换，未在别的故事创建世界');intent.stage='creating';check(await persist()===true,'创建请求标记未确认保存');intent.carrier=await createCarrier(copy(intent));check(typeof intent.carrier==='string'&&intent.carrier,'世界载体创建未确认');intent.stage='created';check(await persist()===true,'世界载体已创建，回执保存未确认；继续时复用同一卡');}
   const c=getContext(),active=c.characters?.[c.characterId]?.avatar;check(scope()===intent.originScope||active===intent.carrier,'会话已切换；新世界已保留，未切换你正在玩的故事');
   await openCarrier(intent.carrier);const next=getContext();check(next.characters?.[next.characterId]?.avatar===intent.carrier&&!next.groupId&&next.chatId,'世界载体已建立，聊天打开尚未确认');
   const receipt={id:intent.id,carrier:intent.carrier,name:intent.name,idea:intent.idea,goal:worldSeedGoal(intent.idea),chatId:next.chatId};
   delete power().tisya_world_seed_pending;try{check(await persist()===true,'新世界已打开，恢复标记清理未确认');}catch(e){power().tisya_world_seed_pending=intent;throw e;}return receipt;
  }catch(e){const p=power()?.tisya_world_seed_pending;if(p)p.error=e.message;throw e;}finally{busy=false;}
 }
 return {start,resume:()=>start(),isBusy:()=>busy,pending:()=>copy(power()?.tisya_world_seed_pending??null)};
}

export function mountWorldSeed(document,container,{service,onReady,onClose}){
 const root=document.createElement('section');root.className='tisya-world-seed';container.append(root);let busy=false,alive=true,pending=Promise.resolve();
 const style=document.createElement('style');style.textContent='.tisya-world-seed{max-width:860px;margin:auto;padding:18px;color:inherit}.tisya-world-seed label{display:block;margin:16px 0}.tisya-world-seed strong{display:block;margin-bottom:8px}.tisya-world-seed input,.tisya-world-seed textarea{width:100%;box-sizing:border-box;font:inherit;padding:12px;border:1px solid #8a9977;border-radius:10px;background:#10281f;color:inherit}.tisya-world-seed button{font:inherit;padding:12px 18px;margin:8px 8px 8px 0;min-height:44px;white-space:normal}';root.append(style);
 const heading=document.createElement('h2');heading.textContent='从点子开世界';root.append(heading);
 const text=document.createElement('p');text.textContent='不用准备角色卡。小缇会另建一个世界，再带着你的点子生成可修改的世界与人物表单。';root.append(text);
 const field=(label,tag)=>{const box=document.createElement('label'),name=document.createElement('strong'),input=document.createElement(tag);name.textContent=label;input.setAttribute('aria-label',label);box.append(name,input);root.append(box);return input;};
 const name=field('世界名称（可选）','input'),idea=field('我的世界点子','textarea');idea.rows=8;
 const saved=service.pending();if(saved){name.value=saved.name;idea.value=saved.idea;name.disabled=idea.disabled=true;}
 const notice=document.createElement('p');notice.setAttribute('role','status');root.append(notice);
 const button=document.createElement('button');button.type='button';button.textContent=saved?'继续创建这个世界':'创建世界并去捏表单';root.append(button);
 button.onclick=()=>{if(busy)return;busy=true;button.disabled=true;name.disabled=idea.disabled=true;notice.textContent='正在准备独立世界…';pending=(async()=>{try{const result=await service.start({name:name.value,idea:idea.value});busy=false;if(alive)await onReady(result);}catch(e){if(alive){notice.textContent=e.message;notice.setAttribute('role','alert');}}finally{busy=false;if(alive){button.disabled=false;const saved=service.pending();name.disabled=idea.disabled=!!saved;button.textContent=saved?'继续创建这个世界':'创建世界并去捏表单';}}})();};
 const close=document.createElement('button');close.type='button';close.textContent='返回';close.onclick=()=>{if(!busy)onClose();};root.append(close);
 return {root,kind:'world-seed',settled:()=>pending,requestLeave:()=>({allowed:!busy,reason:'正在创建新世界，请等保存确认'}),dispose(){alive=false;root.remove();}};
}
