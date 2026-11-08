import {PREFERENCE_GROUPS,effectivePreferences} from './preferences.mjs';
import {storyAvatar} from './identity.mjs';
export function mountMatrixIdentity(document,root,{identity,config,roles,onClose,onNative}){
 let state=identity.read(),value=config.read(),selected=state.active,dirty=false,busy=false,alive=true;
 const edits=new Set(),mark=kind=>{edits.add(kind);dirty=true;},only=(...kinds)=>{if([...edits].some(k=>!kinds.includes(k)))throw Error('请先保存另一部分的修改');},clean=()=>{edits.clear();dirty=false;};
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const status=el('p');status.setAttribute('role','status');
 const run=async fn=>{if(busy)return;busy=true;try{await fn();}catch(e){status.textContent=e.message;}finally{busy=false;}};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.className='menu_button';b.onclick=()=>run(fn);return b;};
 const field=(label,node)=>{const box=el('label',label);box.style.cssText='display:grid;gap:6px;margin:12px 0';node.style.maxWidth='100%';node.style.minWidth='0';box.append(node);return box;};
 const input=(initial,multi=false,kind='profile')=>{const n=el(multi?'textarea':'input');n.className='text_pole';n.value=initial??'';n.style.cssText='width:100%;box-sizing:border-box';if(multi)n.rows=7;n.oninput=()=>mark(kind);return n;};
 const option=(s,label,id)=>{const o=el('option',label);o.value=id;s.append(o);};
 const leave=fn=>{if(dirty)throw Error('请先保存或放弃修改');fn();};
 async function draw(){
  if(!alive)return;root.replaceChildren();root.style.cssText='max-width:900px;margin:auto;padding:16px;overflow-wrap:anywhere';root.append(el('h2','用户身份'),status);
  const nav=el('div');nav.append(button('返回',()=>leave(onClose)),button('原生身份管理',()=>leave(onNative)),button('放弃修改',async()=>{clean();state=identity.read();value=config.read();selected=state.active;await draw();}));root.append(nav);
  const profile=state.personas.find(p=>p.id===selected),picker=el('select');picker.className='text_pole';
  for(const p of state.personas)option(picker,p.name,p.id);picker.value=selected;picker.disabled=!state.personas.length;
  picker.onchange=()=>run(async()=>{if(dirty){picker.value=selected;throw Error('请先保存或放弃修改');}selected=picker.value;await draw();});
  root.append(field('当前用户身份',picker));
  const name=profile?input(profile.name):null;if(name){name.dataset.identityName='';root.append(field('名称',name));}
  if(profile&&selected!==state.active)root.append(button('使用此用户身份',async()=>{if(dirty)throw Error('请先保存或放弃修改');await identity.select({id:selected,revision:state.revision,chat:!!state.scope.chatId,character:false,global:false});state=identity.read();value=config.read();await draw();}));
  const wishSection=el('section');wishSection.dataset.contractorWish='';wishSection.append(el('h3','@u · 心愿'));
  const description=input(profile?.descriptor.description??state.description??'',true);description.dataset.identityWish='';wishSection.append(field('@u 心愿槽（原身份描述）',description));
  const group=PREFERENCE_GROUPS.find(g=>g.id==='W'),selection=effectivePreferences(value).choices.W,controls=[];let next=selection;
  const module0=el('fieldset');module0.style.minWidth='0';module0.dataset.wishModule='0';module0.append(el('legend','模块 0-B · 契约者私密心愿槽 [CONTRACTOR.WISH]'));
  module0.append(el('p','W00 · 选开“绝对不拒绝模式”'));
  const optional=el('fieldset');optional.style.minWidth='0';optional.dataset.builtinWishes='';optional.append(el('legend','内置可选心愿'));
  for(const choice of group.options){
   const c=el('input');c.type='checkbox';c.value=choice.id;c.checked=selection?.includes(choice.id)??false;c.dataset.wishOption=choice.id;
   c.onchange=()=>{next=controls.filter(c=>c.checked).map(c=>c.value);mark('profile');};controls.push(c);
   const box=choice.id==='W00'?module0:optional;box.append(field(choice.label,c));const details=el('details');details.append(el('summary','原文'),el('pre',choice.effect));details.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';box.append(details);
  }
  wishSection.append(module0,optional,button('保存身份与心愿',async()=>{
   only('profile');
   if(profile)await identity.saveProfile({id:selected,revision:state.revision,name:name.value,description:description.value});
   else await identity.saveWish({revision:state.revision,description:description.value});
   state=identity.read();
   if(next!==selection){value.story.play??={};value.story.play.choices??={};value.story.play.choices.W=next;value=await config.save(value);}
   clean();status.textContent='身份描述与所选心愿已保存。';await draw();
  }));root.append(wishSection);
  if(value.story.wish){const old=el('details');old.append(el('summary','此前单独填写的心愿（保留原文）'),el('pre',value.story.wish));root.append(old);}
  const section=el('section');section.dataset.storyAvatar='';section.append(el('h3','user · 主控化身绑定'));root.append(section);
  const avatar=storyAvatar(value),listing=await roles.list();if(!alive)return;
  const mode=el('select');mode.className='text_pole';mode.dataset.avatarMode='';
  option(mode,'不绑定角色','unbound');option(mode,'通用','generic');option(mode,PREFERENCE_GROUPS.find(g=>g.id==='N01').options.find(o=>o.id==='N01-B').label,'bound');option(mode,'无主控纯群像 / 场外导演模式','ensemble');mode.value=avatar.mode;
  const book=el('select');book.className='text_pole';book.dataset.roleBook='';for(const n of new Set([listing.book,...listing.books]))option(book,n+(listing.books.includes(n)?'（全局）':'（尚未建立或绑定）'),n);book.value=listing.book;
  const entries=el('select');entries.className='text_pole';entries.dataset.roleEntry='';const preview=el('p');preview.dataset.rolePreview='';let rows=listing.entries;
  const show=()=>{book.disabled=entries.disabled=mode.value!=='bound';const selected=rows.find(e=>String(e.uid)===entries.value);preview.textContent=mode.value==='bound'?(selected?selected.name:'请选择全局基点书中的【角色】条目。'):mode.options[mode.selectedIndex].textContent;};
  const fill=data=>{rows=data;entries.replaceChildren();option(entries,'选择【角色】条目','');for(const e of rows)option(entries,e.name,String(e.uid));entries.value=book.value===avatar.binding?.book?String(avatar.binding.uid):'';show();};fill(rows);
  mode.onchange=()=>{mark('role');show();};book.onchange=()=>run(async()=>{mark('role');fill((await roles.list(book.value)).entries);});entries.onchange=()=>{mark('role');show();};
  section.append(field('主控模式',mode),field('全局基点书',book),field('角色档案',entries),preview,button('保存当前聊天绑定',async()=>{only('role');value=await roles.bind({mode:mode.value,book:book.value,uid:entries.value},value.revision);clean();status.textContent='当前聊天的主控模式与角色档案已保存。';await draw();}));
  const create=el('details'),roleName=input('',false,'create'),content=input('',true,'create');roleName.dataset.roleName='';content.dataset.roleContent='';create.append(el('summary','创建角色并保存到基点书'),field('角色名称',roleName),field('角色条目原文',content),button('创建并绑定当前聊天',async()=>{only('role','create');const row=await roles.create({book:book.value,name:roleName.value,content:content.value},value.revision);value=config.read();clean();status.textContent=row.name+' 已保存到全局基点书并绑定当前聊天。';await draw();}));section.append(create);
 }
 const ready=run(draw);return {ready,dispose(){alive=false;root.replaceChildren();},requestLeave:()=>dirty||busy?{allowed:false,reason:busy?'身份操作正在进行':'请先保存或放弃修改'}:{allowed:true}};
}
