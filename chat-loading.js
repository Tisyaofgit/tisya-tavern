// The host's chat_truncation is the single source of truth. This module never
// writes chat arrays, message bodies, candidates or a second history snapshot.
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
export function mountChatLoadingSettings(document,container,{controller,workspace=null,externalActions=false,onStateChange=()=>{}}){
 let alive=true,busy=false,base=controller.inspect(),job=Promise.resolve();
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const root=el('section'),title=el('h3','聊天加载与缓存'),label=el('label','进入会话先显示底部多少条'),input=el('input'),status=el('p'),apply=el('button','保存条数'),ten=el('button','设为 10 条'),discard=el('button','放弃草稿'),clear=el('button','清理显示缓存');
 input.type='number';input.min='0';input.step='1';input.value=String(base.count);input.setAttribute('aria-label','首批消息条数');label.append(input);status.setAttribute('role','status');
 for(const b of [apply,ten,discard,clear])b.type='button';
 const dirty=()=>input.value!==String(base.count);
 const mode=el('p',base.bounded?'当前已开启宿主虚拟滚动：可见范围由宿主管理；这里的条数供关闭虚拟滚动后使用。':'只限制进入会话时的显示数量；更早记录用聊天顶部的加载入口查看。');
 root.append(title,label,el('small','建议先试 10 条。0 表示全部；用户和角色消息都计入条数。'),ten,apply,discard,mode,el('p','保存后下次进入会话生效，不截断聊天记录或模型上下文。'),clear,el('small','只清理可重建的显示缓存。原聊天、回复候选、记忆与显示偏好保留；再次查看时重新生成缓存。'),status);container.append(root);if(externalActions){apply.remove();discard.remove();}input.oninput=()=>onStateChange();
 const controls=()=>[input,apply,ten,discard,clear,...root.querySelectorAll('[data-workspace-action]')];
 const setBusy=value=>{for(const n of controls())n.disabled=value||n.dataset.workspaceUnavailable==='true';};
 const run=fn=>{if(busy||!alive)return;busy=true;onStateChange();setBusy(true);job=(async()=>{try{await fn();}catch(e){if(alive){status.textContent=e.message;status.setAttribute('role','alert');}}finally{busy=false;if(alive){setBusy(false);onStateChange();}}})();return job;};
 ten.onclick=()=>{input.value='10';status.textContent='已选 10 条，点击底部保存后应用。';onStateChange();};
 discard.onclick=()=>{base=controller.inspect();input.value=String(base.count);status.textContent='已载入当前保存值。';onStateChange();};
 apply.onclick=()=>run(async()=>{if(input.value.trim()==='')throw Error('请填写首批消息条数。');const next=await controller.save(Number(input.value),base.count);if(alive){base=next;input.value=String(base.count);status.setAttribute('role','status');status.textContent='已保存，下次进入会话生效。';}});
 clear.onclick=()=>run(async()=>{await controller.clear();if(alive){status.setAttribute('role','status');status.textContent='显示缓存已清理，原聊天与偏好保留。';}});
 let ready=Promise.resolve();
 if(workspace){
  const section=el('section'),heading=el('h3','已保存的工作区'),summary=el('p'),list=el('div'),refresh=el('button','刷新工作区列表');refresh.type='button';refresh.dataset.workspaceAction='refresh';section.dataset.workspaceCache='';
  section.append(heading,el('p','消息、卡配置和世界书按所属卡与存档保存。这里显示本地缓存数据的字节估算，不是运行内存实测。'),el('p','不自动限额或淘汰。清理仅删除缓存，原聊天、回复候选和世界书保留；再次使用时重新读取。'),refresh,summary,list);root.insertBefore(section,status);
  const names={message:'消息',messages:'消息',chat:'聊天',card:'卡配置',configuration:'卡配置','card-configuration':'卡配置',worldbook:'世界书'};
  const states={saved:'已保存',ready:'已保存',pending:'待保存',dirty:'待保存',error:'保存失败',failed:'保存失败',loading:'读取中',unverified:'待核验'};
  const size=bytes=>Number.isFinite(bytes)&&bytes>=0?bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KiB':(bytes/1048576).toFixed(1)+' MiB':'大小未知';
  const total=rows=>rows.reduce((sum,row)=>sum+(Number.isFinite(row.bytes)&&row.bytes>=0?row.bytes:0),0);
  const time=value=>{const date=new Date(value);return value!==undefined&&value!==null&&!Number.isNaN(date.getTime())?date.toLocaleString('zh-CN',{hour12:false}):'时间未知';};
  const action=(label,fn,available=true)=>{const button=el('button',label);button.type='button';button.dataset.workspaceAction='clear';if(!available)button.dataset.workspaceUnavailable='true';button.disabled=busy||!available;button.onclick=()=>run(fn);return button;};
  async function reload(){
   const rows=await workspace.list();if(!alive)return;
   if(!Array.isArray(rows))throw Error('工作区列表格式无效，请重新读取。');
   const cards=new Map();
   for(const row of rows){const owner=row.owner??{},id=JSON.stringify([owner.account??null,owner.cardId??null]);let card=cards.get(id);if(!card){card={owner,rows:[]};cards.set(id,card);}card.rows.push(row);}
   const content=document.createDocumentFragment();
   for(const {owner,rows:cardRows} of cards.values()){
    const card=el('section'),title=el('h4',owner.cardName||owner.cardId||'未命名卡'),groups=new Map();card.dataset.workspaceCard='';
    const cardFilter={...(owner.account!==undefined?{account:owner.account}:{}),cardId:owner.cardId};
    card.append(title,el('p',`${cardRows.length} 项 · ${size(total(cardRows))}${owner.account?' · 账号 '+owner.account:''}`),action('清理此卡缓存',async()=>{await workspace.clear(cardFilter);await reload();if(alive){status.setAttribute('role','status');status.textContent='此卡的缓存已清理，原聊天与世界书保留。';}},typeof owner.cardId==='string'&&owner.cardId.length>0));
    for(const row of cardRows){const id=row.owner?.chatId??null;let group=groups.get(id);if(!group){group={owner:row.owner??owner,rows:[]};groups.set(id,group);}group.rows.push(row);}
    for(const [chatId,group]of groups){
     const save=el('details');save.dataset.workspaceChat='';save.append(el('summary',`${chatId===null?'卡级配置与资料':group.owner.chatName||chatId} · ${group.rows.length} 项 · ${size(total(group.rows))}`));
     if(chatId!==null)save.append(action('清理此存档缓存',async()=>{await workspace.clear({...cardFilter,chatId});await reload();if(alive){status.setAttribute('role','status');status.textContent='此存档的缓存已清理，原聊天与世界书保留。';}},typeof owner.cardId==='string'&&owner.cardId.length>0&&typeof chatId==='string'&&chatId.length>0));
     const items=el('ul');let rendered=false;
     save.ontoggle=()=>{if(!alive||!save.open||rendered)return;rendered=true;
      for(const row of group.rows){const item=el('li'),kind=names[row.kind]??row.kind??'工作区',recordState=row.status??row.state,state=states[recordState]??recordState??'状态未知',name=row.label??row.name;if(name)item.append(el('strong',name));item.append(el('p',`${kind} · ${size(row.bytes)} · ${state}`),el('small','更新于 '+time(row.updatedAt)));if(row.error)item.append(el('p',typeof row.error==='string'?row.error:row.error.message??'缓存保存未完成'));item.append(action('清理这项缓存',async()=>{await workspace.remove(row.key);await reload();if(alive){status.setAttribute('role','status');status.textContent='所选缓存已清理，原聊天与世界书保留。';}},typeof row.key==='string'&&row.key.length>0));items.append(item);}
     };
     save.append(items);card.append(save);
    }
    content.append(card);
   }
   list.replaceChildren(content);summary.textContent=rows.length?`${cards.size} 张卡 · ${rows.length} 项缓存 · ${size(total(rows))}`:'尚无已保存的工作区缓存。';
  }
  refresh.onclick=()=>run(async()=>{await reload();if(alive){status.setAttribute('role','status');status.textContent='工作区列表已刷新。';}});
  ready=run(reload);
 }
 return {root,state:()=>({busy,dirty:dirty()}),saveDraft:async()=>{await apply.onclick();if(dirty())throw Error(status.textContent);},discardDraft:()=>{if(busy)throw Error('正在处理，请稍后重试');discard.onclick();},ready,settled:()=>job,requestLeave:()=>({allowed:!busy&&!dirty(),reason:busy?'正在处理缓存或保存条数':dirty()?'首批条数尚未保存':''}),dispose(){alive=false;for(const n of root.querySelectorAll('button'))n.onclick=null;root.remove();}};
}
