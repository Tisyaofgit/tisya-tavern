import {PREFERENCE_GROUPS,effectivePreferences} from './preferences.mjs';
import {storyAvatar} from './identity.mjs';
import {selectControl} from './form-controls.mjs';
export function mountMatrixIdentity(document,root,{identity,config,roles,onClose,onNative}){
 let state=identity.read(),value=config.read(),selected=state.active,dirty=false,busy=false,navigating=false,alive=true;
 const edits=new Set(),mark=kind=>{edits.add(kind);dirty=true;},only=(...kinds)=>{if([...edits].some(k=>!kinds.includes(k)))throw Error('请先保存另一部分的修改');},clean=()=>{edits.clear();dirty=false;};
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const status=el('p');status.setAttribute('role','status');status.className='tisya-identity-status';
 const run=async fn=>{if(busy)return;busy=true;root.inert=true;root.setAttribute('aria-busy','true');try{await fn();}catch(e){status.textContent=e.message;}finally{busy=false;root.inert=false;root.setAttribute('aria-busy','false');}};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.className='menu_button';b.onclick=()=>run(fn);return b;};
 const field=(label,node)=>{const box=el('label',label);box.style.cssText='display:grid;gap:6px;margin:12px 0';node.style.maxWidth='100%';node.style.minWidth='0';if(node.type==='checkbox'){box.className='tisya-check-row';box.style.cssText='';}box.append(node.tagName==='SELECT'?selectControl(document,node):node);return box;};
 const input=(initial,multi=false,kind='profile')=>{const n=el(multi?'textarea':'input');n.className='text_pole';n.value=initial??'';n.style.cssText='width:100%;box-sizing:border-box';if(multi)n.rows=7;n.oninput=()=>mark(kind);return n;};
 const option=(s,label,id)=>{const o=el('option',label);o.value=id;s.append(o);};
 const leave=fn=>{if(dirty)throw Error('请先保存或放弃修改');navigating=true;try{return fn();}finally{navigating=false;}};
 async function draw(){
  if(!alive)return;root.replaceChildren();root.classList.add('tisya-matrix-identity');root.style.cssText='max-width:900px;margin:auto;padding:16px;overflow-wrap:anywhere';root.append(el('h2','用户身份'),status);
  const nav=el('div');nav.append(button('返回',()=>leave(onClose)),button('原生身份管理',()=>leave(onNative)),button('重新读取',async()=>{if(dirty)throw Error('请先保存或放弃修改');state=identity.read();value=config.read();selected=state.active;await draw();}),button('放弃修改',async()=>{clean();state=identity.read();value=config.read();selected=state.active;await draw();}));root.append(nav);
  const profile=state.personas.find(p=>p.id===selected),picker=el('select');picker.className='text_pole';
  picker.dataset.identityPicker='';for(const p of state.personas)option(picker,p.name+(p.id===state.active?' · 使用中':''),p.id);picker.value=selected;picker.disabled=!state.personas.length;
  picker.onchange=()=>run(async()=>{if(dirty){picker.value=selected;throw Error('请先保存或放弃修改');}const id=picker.value;try{await identity.select({id,revision:state.revision,chat:!!state.scope.chatId,character:false,global:false});state=identity.read();value=config.read();selected=state.active;status.textContent='已切换用户身份并保存当前聊天绑定。';await draw();}catch(e){state=identity.read();selected=state.active;await draw();throw e;}});
  root.append(field('切换用户身份',picker));if(!state.personas.length)root.append(el('p','尚未创建原生用户身份，可通过上方“原生身份管理”创建。'));if(state.pending)root.append(el('p','上次身份切换尚未保存完成：'+(state.pending.error??state.pending.stage)),button('继续完成身份切换',async()=>{if(dirty)throw Error('请先保存或放弃修改');await identity.resume();state=identity.read();value=config.read();selected=state.active;status.textContent='身份切换已保存。';await draw();}));
  const name=profile?input(profile.name):null;if(name){name.dataset.identityName='';root.append(field('名称',name));}
  if(profile&&selected!==state.active)root.append(button('使用此用户身份',async()=>{if(dirty)throw Error('请先保存或放弃修改');await identity.select({id:selected,revision:state.revision,chat:!!state.scope.chatId,character:false,global:false});state=identity.read();value=config.read();await draw();}));
  const wishSection=el('section');wishSection.dataset.contractorWish='';wishSection.append(el('h3','心愿直通'));
  const originalWish=profile?.descriptor.description??state.description??'',legacyWish=value.story.wish??'';
  const description=input(legacyWish&&originalWish!==legacyWish&&!originalWish.endsWith('\n\n'+legacyWish)?[originalWish,legacyWish].filter(Boolean).join('\n\n'):originalWish||legacyWish,true);description.dataset.identityWish='';
  const group=PREFERENCE_GROUPS.find(g=>g.id==='W'),selection=effectivePreferences(value).choices.W,controls=[];let next=selection;
  const module0=el('fieldset');module0.style.minWidth='0';module0.dataset.wishModule='0';module0.append(el('legend','模块 0-B · 契约者私密心愿槽 [CONTRACTOR.WISH]'));
  module0.append(el('p','W00 · 选开“绝对不拒绝模式”'));
  const optional=el('fieldset');optional.style.minWidth='0';optional.dataset.builtinWishes='';optional.append(el('legend','内置可选心愿'));
  for(const choice of group.options){
   const box=choice.id==='W00'?module0:optional;
   if(choice.id==='W07'){
    description.placeholder='把想告诉缇斯亚的心愿写在这里';box.append(field('自定义心愿',description));
   }else{
    const c=el('input');c.type='checkbox';c.value=choice.id;c.checked=selection?.includes(choice.id)??false;c.dataset.wishOption=choice.id;c.setAttribute('aria-label',choice.label);
    c.onchange=()=>{next=controls.filter(c=>c.checked).map(c=>c.value);mark('profile');};controls.push(c);box.append(field(choice.label,c));
   }
   const details=el('details');const original=el('pre',choice.effect);original.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;min-width:0';details.append(el('summary','原文'),original);details.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';box.append(details);
  }
  wishSection.append(module0,optional,button('保存身份与心愿',async()=>{
   only('profile');
   if(profile)await identity.saveProfile({id:selected,revision:state.revision,name:name.value,description:description.value});
   else await identity.saveWish({revision:state.revision,description:description.value});
   state=identity.read();
   next=controls.filter(c=>c.checked).map(c=>c.value);if(description.value.trim())next.push('W07');
   if(JSON.stringify(next)!==JSON.stringify(selection)||legacyWish){value.story.play??={};value.story.play.choices??={};value.story.play.choices.W=next;value.story.wish='';value=await config.save(value);}
   clean();status.textContent='身份描述与所选心愿已保存。';await draw();
  }));root.append(wishSection);
  const section=el('section');section.dataset.storyAvatar='';section.append(el('h3','user · 主控化身绑定'));root.append(section);
  const avatar=storyAvatar(value);let listing;try{listing=await roles.list();}catch(e){section.append(el('p','基点书读取失败：'+e.message),button('重试准备基点书',async()=>{await roles.ensureBook();await draw();}));return;}if(!alive)return;
  const mode=el('select');mode.className='text_pole';mode.dataset.avatarMode='';
  option(mode,'不绑定角色','unbound');option(mode,'通用','generic');option(mode,PREFERENCE_GROUPS.find(g=>g.id==='N01').options.find(o=>o.id==='N01-B').label,'bound');option(mode,'无主控纯群像 / 场外导演模式','ensemble');mode.value=avatar.mode;
  const book=el('select');book.className='text_pole';book.dataset.roleBook='';for(const n of new Set([listing.book,...listing.books]))option(book,n+(listing.books.includes(n)?'':'（尚未建立）'),n);book.value=listing.book;
  const entries=el('select');entries.className='text_pole';entries.dataset.roleEntry='';const preview=el('p');preview.dataset.rolePreview='';let rows=listing.entries;
  const show=()=>{book.disabled=false;entries.disabled=mode.value!=='bound';const selected=rows.find(e=>String(e.uid)===entries.value);preview.textContent=mode.value==='bound'?(selected?selected.name:rows.length?'请选择已有角色，或在下方创建新角色。':'还没有角色条目，在下方填写名称与设定即可创建并绑定。'):mode.options[mode.selectedIndex].textContent;book.tisyaRefresh?.();entries.tisyaRefresh?.();};
  const fill=data=>{rows=data;entries.replaceChildren();option(entries,'选择【角色】条目','');for(const e of rows)option(entries,e.name,String(e.uid));entries.value=book.value===avatar.binding?.book?String(avatar.binding.uid):'';show();};fill(rows);
  mode.onchange=()=>{mark('role');show();};book.onchange=()=>run(async()=>{mark('role');fill((await roles.list(book.value)).entries);});entries.onchange=()=>{mark('role');show();};
  section.append(field('主控模式',mode),field('基点书 · 资料来源',book),el('p','基点书不自动启用为世界书；插件只读取选中的角色条目，注入当前聊天的故事身份槽位。'),field('角色档案',entries),preview,button('保存当前聊天绑定',async()=>{only('role');value=await roles.bind({mode:mode.value,book:book.value,uid:entries.value},value.revision);clean();status.textContent='当前聊天的主控模式与角色档案已保存。';await draw();}));
  const create=el('section'),roleName=input('',false,'create'),content=input('',true,'create');roleName.dataset.roleName='';content.dataset.roleContent='';create.dataset.roleCreate='';create.append(el('h3','创建角色并保存到基点书'),field('角色名称',roleName),field('角色条目原文',content),button('创建并绑定当前聊天',async()=>{only('role','create');const row=await roles.create({book:book.value,name:roleName.value,content:content.value},value.revision);value=config.read();clean();status.textContent=row.name+' 已保存到基点书并绑定当前聊天。';await draw();}));section.append(create);
 }
 const ready=run(async()=>{try{await roles.ensureBook();}catch(e){status.textContent='基点书自动准备失败：'+e.message;}await draw();});return {ready,dispose(){alive=false;root.replaceChildren();},requestLeave:()=>dirty||busy&&!navigating?{allowed:false,reason:busy?'身份操作正在进行':'请先保存或放弃修改'}:{allowed:true}};
}
