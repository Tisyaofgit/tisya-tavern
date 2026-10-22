const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scopeKey=s=>JSON.stringify(s.scope);
const retainedSetup=new Map();
export function evaluateIdentityOnboarding(state,{newChat=false}={}){
 const s=state.scope??{};if(!s.chatId||(!s.characterAvatar&&s.groupId==null))return {kind:'unavailable',needed:false,candidates:[]};
 if(state.pending||state.creation)return {kind:'pending',needed:true,candidates:[]};
 const target=s.groupId!=null?{type:'group',id:s.groupId}:{type:'character',id:s.characterAvatar};
 const candidates=state.personas.filter(p=>p.descriptor?.connections?.some(x=>x.type===target.type&&String(x.id)===String(target.id)));
 const locked=state.personas.find(p=>p.id===state.locked);
 if(state.locked&&!locked)return {kind:'repair',needed:true,candidates};
 // Native auto-lock may copy the global default into a fresh chat. That is not
 // evidence that the user chose a player for this card.
 if(newChat&&!candidates.length)return {kind:'new-card',needed:true,candidates};
 if(locked&&!newChat)return {kind:'ready',needed:false,candidates,selected:locked.id};
 if(!candidates.length&&!locked)return {kind:'new-card',needed:true,candidates};
 return {kind:newChat?'new-chat':'choose',needed:true,candidates,selected:locked?.id??(candidates.length===1?candidates[0].id:null)};
}

// One surface, explicit commits. No write occurs when evaluating or rendering.
export function mountIdentityOnboarding(container,{service,newChat=false,mode='welcome',onDone=()=>{},onManage=()=>{},onClose=()=>{}}){
 let state=service.read(),model=evaluateIdentityOnboarding(state,{newChat}),view=mode,busy=false,alive=true,message='',selected=model.selected??'',draft={name:'',description:''};const key=scopeKey(state),saved=retainedSetup.get(key);if(saved){view=saved.view;selected=saved.selected;draft={...saved.draft};}
 const retain=()=>{if(draft.name||draft.description)retainedSetup.set(key,{view,selected,draft:{...draft}});else retainedSetup.delete(key);};
 const current=()=>{if(scopeKey(service.read())!==key)throw Error('角色卡或聊天已改变，请在当前会话重新打开玩家角色');};
 const q=s=>container.querySelector(s);
 function render(){if(!alive)return;const unavailable=!state.canCreate||state.scope.groupId!=null;
  container.innerHTML=`<style>.tisya-player-setup{max-width:640px;margin:auto;padding:12px;color:inherit}.tisya-player-setup *{box-sizing:border-box;min-width:0}.tisya-player-setup header,.tisya-player-setup footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tisya-player-setup h2{font-size:1.25em;flex:1;margin:10px 0}.tisya-player-setup button{font:inherit;padding:9px 12px;border:1px solid #a9986855;border-radius:8px;background:#16372b;color:inherit;min-height:40px}.tisya-player-setup button.primary{background:#c9b680;color:#13261d}.tisya-player-setup input,.tisya-player-setup textarea,.tisya-player-setup select{width:100%;font:inherit;padding:10px;background:#0b241c;color:inherit;border:1px solid #a9986855;border-radius:8px}.tisya-player-setup label{display:block;margin:10px 0}.tisya-player-setup textarea{min-height:180px;resize:vertical}.tisya-player-setup [role=status],.tisya-player-setup pre{white-space:pre-wrap;overflow-wrap:anywhere}.tisya-player-setup pre{font:inherit;background:#17352c66;padding:12px;max-height:45vh;overflow:auto}.tisya-player-setup small{opacity:.75}.tisya-player-setup footer{margin-top:16px}</style><section class="tisya-player-setup"><header><button data-action="back">${view==='welcome'?'关闭':'‹ 返回'}</button><h2>玩家角色</h2></header><small>仅当前${state.scope.groupId!=null?'群聊':'角色卡'}与聊天 · 不更改全局默认</small><p role="status">${esc(message|| (busy?'正在保存，请稍候…':''))}</p>${model.kind==='pending'?pendingContent():view==='create'?`<p>创建此卡专属的新身份。已有身份的名字和设定保持原样。</p><label>玩家名字<input data-name value="${esc(draft.name)}" autocomplete="off"></label><label>完整设定<textarea data-description>${esc(draft.description)}</textarea></label><footer><button data-action="create" class="primary" ${unavailable?'disabled':''}>创建并绑定此卡</button></footer>${unavailable?`<p>${esc(state.creationUnavailableReason||'群聊暂不支持创建专属身份，请选择已有身份')}</p>`:''}`:view==='choose'?`<label>选择玩家角色<select data-persona><option value="">请选择</option>${state.personas.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}${model.candidates.some(c=>c.id===p.id)?' · 此卡已关联':''}</option>`).join('')}</select></label>${selected?`<pre>${esc(state.personas.find(p=>p.id===selected)?.descriptor?.description??'')}</pre>`:''}<footer><button data-action="bind" class="primary" ${selected?'':'disabled'}>使用并绑定此卡</button></footer>`:welcomeContent(unavailable)}<footer><button data-action="manage">完整身份管理</button></footer></section>`;
  if(busy)for(const node of container.querySelectorAll('button,input,textarea,select'))node.disabled=true;
 }
 function pendingContent(){const pending=state.creation??state.pending;return `<p>上次${state.creation?'创建':'绑定'}尚待核对，请先完成它。</p><p>${esc(pending.error??'已保留完成阶段，不会自动重复创建')}</p><button data-action="resume" class="primary">继续核对</button>`;}
 function welcomeContent(unavailable){const p=state.personas.find(p=>p.id===model.selected);return `<p>${model.kind==='new-card'?'先为这张角色卡准备你要扮演的人物。':model.kind==='repair'?'此聊天原先绑定的身份已不存在，请重新选择。':model.kind==='new-chat'?'新的聊天开始了，要沿用这位玩家角色吗？':'查看或更换此卡的玩家角色。'}</p>${p?`<h3>${esc(p.name)}</h3><pre>${esc(p.descriptor?.description??'')}</pre>`:''}<footer>${p?'<button data-action="keep" class="primary">沿用此角色</button>':''}<button data-action="choose">${p?'更换角色':'选择已有角色'}</button><button data-action="new" ${unavailable?'disabled':''}>创建此卡专属角色</button></footer>${unavailable?`<p>${esc(state.creationUnavailableReason||'此处只能选择已有身份')}</p>`:''}`;}
 async function commit(fn){if(busy)return;try{current();busy=true;message='';render();await fn();draft={name:'',description:''};retainedSetup.delete(key);if(!alive)return;current();state=service.read();model=evaluateIdentityOnboarding(state);message='玩家角色已绑定当前卡与聊天';busy=false;onDone(state);}catch(e){message=e.message;state=service.read();model=evaluateIdentityOnboarding(state,{newChat});}finally{busy=false;render();}}
 container.oninput=e=>{if(e.target.matches('[data-name]'))draft.name=e.target.value;if(e.target.matches('[data-description]'))draft.description=e.target.value;};
 container.onchange=e=>{if(e.target.matches('[data-persona]')){selected=e.target.value;render()}};
 container.onclick=e=>{const action=e.target.closest('button')?.dataset.action;if(!action||busy)return;
  if(action==='back'){if(view==='welcome')onClose();else {view='welcome';render()}return}if(action==='manage'){onManage();return}if(action==='choose'||action==='new'){view=action==='new'?'create':'choose';render();return}
  if(action==='create')void commit(()=>service.create({...draft,revision:state.revision}));
  if(action==='resume')void commit(()=>state.creation?service.resumeCreation({revision:state.revision}):service.resume());
  if(action==='bind'||action==='keep')void commit(()=>service.select({id:action==='keep'?model.selected:selected,revision:state.revision,chat:true,character:true,global:false}));
 };
 render();return {root:container,requestLeave:()=>({allowed:!busy,reason:'玩家角色正在保存，请稍候'}),canLeave:()=>!busy,hasDraft:()=>!!(draft.name||draft.description),get busy(){return busy},dispose(){retain();alive=false;container.onclick=null;container.oninput=null;container.onchange=null;}};
}
