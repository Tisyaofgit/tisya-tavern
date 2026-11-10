// The host's chat_truncation is the single source of truth. This module never
// writes chat arrays, message bodies, candidates or a second history snapshot.
import {mountUnsavedPrompt} from './settings-unsaved.js';
export function messageLimit(value){
 if(!Number.isSafeInteger(value)||value<0)throw Error('首批消息条数无效；请填非负整数，0 表示全部。');
 return value;
}
export function createChatLoadingController({powerUser,persist,assertIdle=()=>{},isBounded=()=>false,clearCache,onApplied=()=>{}}){
 let busy=false;
 const inspect=()=>({count:messageLimit(powerUser.chat_truncation),bounded:isBounded()===true});
 return {inspect,async save(count,expected){
  if(busy)throw Error('聊天加载设置正在处理');assertIdle();messageLimit(count);
  if(inspect().count!==expected)throw Error('首批条数已在其他位置修改，请放弃草稿后重试。');
  busy=true;powerUser.chat_truncation=count;
  try{if(await persist()!==true)throw Error('宿主尚未确认保存');if(powerUser.chat_truncation!==count)throw Error('保存期间首批条数已变化');onApplied(count);return inspect();}
  catch(e){if(powerUser.chat_truncation===count)powerUser.chat_truncation=expected;throw Error('条数保存未完成：'+e.message);}
  finally{busy=false;}
 },async clear(){if(busy)throw Error('聊天加载设置正在处理');busy=true;try{await clearCache();}finally{busy=false;}}};
}
export function mountChatLoadingSettings(document,container,{controller,externalActions=false,onStateChange=()=>{}}){
 let alive=true,busy=false,base=controller.inspect(),job=Promise.resolve(),leavePrompt;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const root=el('section'),title=el('h3','聊天加载与缓存'),label=el('label','进入会话先显示底部多少条'),input=el('input'),status=el('p'),apply=el('button','保存'),ten=el('button','设为 10 条'),discard=el('button','取消修改'),clear=el('button','清理显示缓存'),footer=el('footer'),style=el('style');
 root.className='tisya-chat-loading-settings';footer.dataset.settingsActions='';
 style.textContent='.tisya-chat-loading-settings{min-width:0}.tisya-chat-loading-settings>footer{display:flex;flex-wrap:wrap;gap:10px;position:sticky;bottom:0;z-index:3;padding:12px 12px max(12px,env(safe-area-inset-bottom));margin-top:20px;border:1px solid #a99a5d44;border-radius:16px;background:#08271ef5;box-shadow:0 -6px 20px #0005;backdrop-filter:blur(12px)}.tisya-chat-loading-settings>footer p{flex-basis:100%;margin:0;overflow-wrap:anywhere}.tisya-chat-loading-settings>footer p:empty{display:none}.tisya-chat-loading-settings>footer button{flex:1;min-width:0;min-height:44px}.tisya-chat-loading-settings>footer button:last-child{background:#5c5134}';
 input.type='number';input.min='0';input.step='1';input.value=String(base.count);input.setAttribute('aria-label','首批消息条数');label.append(input);status.setAttribute('role','status');
 for(const b of [apply,ten,discard,clear])b.type='button';
 const dirty=()=>input.value!==String(base.count);
 const mode=el('p',base.bounded?'当前已开启宿主虚拟滚动：可见范围由宿主管理；这里的条数供关闭虚拟滚动后使用。':'只限制进入会话时的显示数量；更早记录用聊天顶部的加载入口查看。');
 root.append(style,title,label,el('small','建议先试 10 条。0 表示全部；用户和角色消息都计入条数。'),ten,mode,el('p','保存后下次进入会话生效，不截断聊天记录或模型上下文。'),clear,el('small','只清理可重建的显示缓存。原聊天、回复候选、记忆与显示偏好保留；再次查看时重新生成缓存。'));footer.append(status);if(!externalActions)footer.append(discard,apply);root.append(footer);container.append(root);input.oninput=()=>onStateChange();
 const sync=()=>{if(!alive)return;const blocked=busy||!!leavePrompt?.state().open;for(const n of [input,ten,clear])n.disabled=blocked;apply.disabled=discard.disabled=blocked||!dirty();onStateChange();};
 leavePrompt=mountUnsavedPrompt(document,root,{onStateChange:sync});
 input.oninput=sync;
 const run=fn=>{if(busy||!alive)return;busy=true;sync();job=(async()=>{try{await fn();return true;}catch(e){if(alive){status.textContent=e.message;status.setAttribute('role','alert');}return false;}finally{busy=false;sync();}})();return job;};
 ten.onclick=()=>{input.value='10';status.textContent='已选 10 条，点击底部保存后应用。';sync();};
 discard.onclick=()=>{base=controller.inspect();input.value=String(base.count);status.textContent='已载入当前保存值。';sync();};
 apply.onclick=()=>run(async()=>{if(input.value.trim()==='')throw Error('请填写首批消息条数。');const next=await controller.save(Number(input.value),base.count);if(alive){base=next;input.value=String(base.count);status.setAttribute('role','status');status.textContent='已保存，下次进入会话生效。';}});
 clear.onclick=()=>run(async()=>{await controller.clear();if(alive){status.setAttribute('role','status');status.textContent='显示缓存已清理，原聊天与偏好保留。';}});
 const saveDraft=async()=>{if(busy||!alive)return false;if(!dirty())return true;await apply.onclick();if(dirty())throw Error(status.textContent);return true;};
 const discardDraft=()=>{if(busy||!alive)return false;discard.onclick();return true;};
 const confirmLeave=async()=>{if(!alive||leavePrompt.state().open)return false;if(busy){status.textContent='正在处理缓存或保存条数，请稍候。';return false;}return !dirty()||leavePrompt.request({save:saveDraft,discard:discardDraft});};
 sync();
 return {root,state:()=>({busy,dirty:dirty(),canSave:true}),saveDraft,discardDraft,confirmLeave,ready:Promise.resolve(),settled:()=>job,requestLeave:()=>({allowed:!busy&&!dirty()&&!leavePrompt.state().open,reason:busy?'正在处理缓存或保存条数':dirty()?'首批条数尚未保存':leavePrompt.state().open?'正在确认未保存修改':''}),dispose(){alive=false;leavePrompt.dispose();for(const n of [apply,ten,discard,clear])n.onclick=null;root.remove();}};
}
