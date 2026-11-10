import {PREFERENCE_GROUPS,effectivePreferences} from './preferences.mjs';
import {storyAvatar} from './identity.mjs';
import {selectControl} from './form-controls.mjs';
export function mountStoryResources(document,root,options){return mountMatrixIdentity(document,root,{...options,resourcesOnly:true});}
export function mountMatrixIdentity(document,root,{identity,config,roles,onClose,onNative,resourcesOnly=false}){
 let state=identity?.read(),value=config.read(),selected=state?.active,dirty=false,busy=false,navigating=false,alive=true,openedScope=roles.scope?.();
 const edits=new Set(),mark=kind=>{edits.add(kind);dirty=true;},only=(...kinds)=>{if(openedScope!==undefined&&openedScope!==roles.scope?.())throw Error('聊天已切换，请重新打开身份页');if([...edits].some(k=>!kinds.includes(k)))throw Error('请先保存另一部分的修改');},clean=()=>{edits.clear();dirty=false;};
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const status=el('p');status.setAttribute('role','status');status.className='tisya-identity-status';
 const run=async fn=>{if(busy)return;busy=true;root.inert=true;root.setAttribute('aria-busy','true');try{await fn();}catch(e){status.textContent=e.message;}finally{busy=false;root.inert=false;root.setAttribute('aria-busy','false');}};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.className='menu_button';b.onclick=()=>run(fn);return b;};
 const field=(label,node)=>{const box=el('label',label);box.style.cssText='display:grid;gap:6px;margin:12px 0';node.style.maxWidth='100%';node.style.minWidth='0';if(node.type==='checkbox'){box.className='tisya-check-row';box.style.cssText='';}box.append(node.tagName==='SELECT'?selectControl(document,node):node);return box;};
 const input=(initial,multi=false,kind='profile')=>{const n=el(multi?'textarea':'input');n.className='text_pole';n.value=initial??'';n.style.cssText='width:100%;box-sizing:border-box';if(multi)n.rows=7;n.oninput=()=>mark(kind);return n;};
 const option=(s,label,id)=>{const o=el('option',label);o.value=id;s.append(o);};
 const leave=fn=>{if(dirty)throw Error('请先保存或放弃修改');navigating=true;try{return fn();}finally{navigating=false;}};
 async function drawDatabaseIdentity(){
  const section=el('section');section.dataset.storyAvatar='';section.dataset.databaseIdentity='';section.append(el('h3','故事人物 · 当前表单'));root.append(section);
  section.append(el('p','人物档案、世界时间与小手机共用当前聊天的统一表单。作者书原文作为来源保留，编辑只提交明确修改的字段。'));
  let listing;try{listing=await roles.list();}catch(error){section.append(el('p','当前表单暂不可读：'+error.message));listing={entries:[],schema:[]};}if(!alive)return;
  const avatar=storyAvatar(value),mode=el('select'),picker=el('select'),edit=el('section');mode.dataset.avatarMode='';picker.dataset.roleEntry='';edit.dataset.roleEdit='';
  for(const [id,label]of [['unbound','不绑定角色'],['generic','通用'],['bound','绑定当前人物'],['ensemble','无主控纯群像 / 场外导演模式']])option(mode,label,id);mode.value=avatar.mode;
  option(picker,'选择表单人物','');for(const row of listing.entries)option(picker,row.name,row.dossierId);picker.value=avatar.binding?.database?avatar.binding.dossierId:'';
  if(avatar.binding&&!avatar.binding.database){const migration=el('div');section.append(el('p','当前还保留旧书籍角色来源。迁移先核对原 UID 与摘要；作者原文和手机初态块保存在提交来源，当前人物表只采用名称与叙述。手机业务值另经迁移核对。'),button('预览迁移旧角色档案',async()=>{only('create','role');const draft=await roles.previewSourceMigration(avatar.binding);mark('create');showDraft(migration,draft);}),migration);}
  let previous=picker.value;
  const showDraft=(container,draft)=>{const panel=el('section');panel.dataset.identityDraft='';panel.append(el('h4','提交前核对'),el('p','下列变化尚未保存；其余字段和手机状态不改动。'));if(draft.bindOnCommit)panel.append(el('p','确认后建立人物并绑定当前聊天；作者来源保留。'));if(draft.importSource)panel.append(el('p','原来源：'+draft.importSource.book+' / UID '+draft.importSource.uid+' / SHA-256 '+draft.importSource.digest));for(const change of draft.diff){const row=el('p');row.textContent=change.label+'：'+(change.before===undefined?'未提供':JSON.stringify(change.before))+' → '+JSON.stringify(change.after);panel.append(row);}panel.append(button('确认提交档案变更',async()=>{only('dossier','role','create');await roles.commitEdit(draft);value=config.read();clean();status.textContent='角色档案已写入当前表单并回读确认。';await draw();}));container.replaceChildren(panel);};
  const renderEditor=()=>{
   edit.replaceChildren();const row=listing.entries.find(r=>r.dossierId===picker.value);edit.hidden=!row;if(!row)return;edit.append(el('h3','编辑角色档案'));
   const controls=[],extras=el('details');extras.append(el('summary','更多档案字段'));
   for(const def of listing.schema.filter(f=>!f.read_only&&!f.alias_of&&!f.formula&&!['row_uuid','char_id'].includes(f.key))){
    const original=row.values[def.key],type=String(def.type??'TEXT').toUpperCase();let node,parse;
    if(type==='ENUM'&&Array.isArray(def.enum)){node=el('select');option(node,'未提供','');for(const choice of def.enum)option(node,String(choice),String(choice));node.value=original??'';node.onchange=()=>mark('dossier');parse=()=>node.value===''?undefined:node.value;}
    else if(type==='BOOLEAN'){node=el('select');option(node,'未提供','');option(node,'是','true');option(node,'否','false');node.value=original===undefined?'':String(original);node.onchange=()=>mark('dossier');parse=()=>node.value===''?undefined:node.value==='true';}
    else if(type==='NUMBER'||type==='INTEGER'){node=input(original===undefined?'':String(original),false,'dossier');node.type='number';parse=()=>{if(node.value==='')return undefined;const n=Number(node.value);if(!Number.isFinite(n))throw Error((def.label??def.key)+' 须为有效数值');return n;};}
    else if(['JSON','OBJECT','ARRAY','COORD','LIST','MAP','STRUCT'].includes(type)||original!==undefined&&typeof original==='object'){node=input(original===undefined?'':JSON.stringify(original,null,2),true,'dossier');parse=()=>{if(node.value==='')return undefined;try{return JSON.parse(node.value);}catch{throw Error((def.label??def.key)+' 须为有效 JSON');}};}
    else{node=input(original??'',true,'dossier');node.rows=def.key==='manifest'?9:2;parse=()=>node.value;}
    node.dataset.roleField=def.key;if(def.key==='name')node.dataset.roleEditName='';if(def.key==='manifest')node.dataset.roleEditContent='';const stateLabel={unknown:'未知',unset:'未提供',cleared:'已清除',none:'明确无',not_applicable:'不适用'}[row.states[def.key]??'unset'];(['name','manifest','public_identity','scene_personality_desc'].includes(def.key)?edit:extras).append(field((def.label??def.key)+(stateLabel?'（'+stateLabel+'）':''),node));for(const event of ['input','change'])node.addEventListener(event,()=>preview.replaceChildren());controls.push({key:def.key,original,node,parse,initial:node.value});
   }
   const preview=el('div');edit.append(extras,button('预览档案变更',async()=>{only('dossier','role');const values={};for(const item of controls){if(item.node.value===item.initial)continue;const next=item.parse();if(next!==undefined&&JSON.stringify(next)!==JSON.stringify(item.original))values[item.key]=next;}const draft=await roles.previewEdit({dossierId:row.dossierId,values,before:row});showDraft(preview,draft);}),preview);
  };
  mode.onchange=()=>mark('role');picker.onchange=()=>run(async()=>{if(edits.has('dossier')){picker.value=previous;picker.tisyaRefresh?.();throw Error('请先提交或放弃当前档案修改');}previous=picker.value;mark('role');renderEditor();});
  section.append(field('主控模式',mode),field('当前人物',picker),button('保存当前聊天绑定',async()=>{only('role');value=await roles.bind({mode:mode.value,dossierId:picker.value},value.revision);clean();status.textContent='当前聊天的人物选择已保存。';await draw();}),edit);renderEditor();
  const create=el('details'),manualName=input('',false,'create'),manualText=input('',true,'create'),manualDraft=el('div');create.dataset.roleCreate='';manualName.dataset.roleName='';manualText.dataset.roleContent='';create.append(el('summary','手动新建人物'),field('人物名称',manualName),field('作者提供的设定',manualText),button('预览新人物',async()=>{only('create','role');showDraft(manualDraft,await roles.previewCreate({name:manualName.value,content:manualText.value}));}),manualDraft);section.append(create);for(const node of [manualName,manualText])node.addEventListener('input',()=>manualDraft.replaceChildren());
  const generated=el('section'),goal=input('',true,'generation'),kind=el('select'),generationPreview=el('div');generated.dataset.databaseCreation='';goal.dataset.creationGoal='';option(kind,'新人物','character');option(kind,'新世界','world');kind.onchange=()=>mark('generation');generated.append(el('h3','从模板创作新内容'),field('创作类型',kind),field('要求与已有依据',goal),el('p','读取实际模板书与当前 schema，生成的草稿先核对再提交。待补事项未清除时不能保存。'),button('生成表单草稿',async()=>{
   only('generation');const draft=await roles.createDraft({goal:goal.value,kind:kind.value,mode:'extend'});mark('generation');generationPreview.replaceChildren();const editor=input(JSON.stringify(draft.proposal,null,2),true,'generation');editor.rows=16;editor.dataset.creationDraft='';generationPreview.append(field('候选内容（可修改 JSON）',editor));
   for(const c of draft.proposal.matrix.changes){const table=draft.schema?.[c.tableId];generationPreview.append(el('p',(table?.label??c.tableId)+' · '+c.recordId+'：'+Object.keys(c.values).map(k=>table?.fields?.find(f=>f.key===k)?.label??k).join('、')));}
   generationPreview.append(button('确认保存创作草稿',async()=>{only('generation');let proposal;try{proposal=JSON.parse(editor.value);}catch{throw Error('候选 JSON 尚不完整，请修正后保存');}const result=await roles.saveCreation({...draft,proposal});if(!result?.state)throw Error('创作保存未返回当前表单，尚未确认');value=config.read();clean();status.textContent='创作结果已保存到统一表单。可在上方选择新人物，或在下方选择新世界。';await draw();}));
  }),generationPreview);section.append(generated);
  const resources=el('section');resources.dataset.referenceBooks='';root.append(resources);let available;try{available=await roles.resources();}catch(error){resources.append(el('p','资料选择暂不可读：'+error.message));return;}if(!alive)return;
  resources.append(el('h3','可选资料书启用'),el('p','只作用于当前聊天；普通资料条目仍遵守原生启用状态、关键词与触发条件。定义条目由对应编译器读取，不整本注入故事。'));
  const checkboxes=[],names=available.books.filter(n=>!available.excluded.includes(n));for(const name of new Set([...names,...available.referenceBooks])){const node=el('input');node.type='checkbox';node.value=name;node.checked=available.referenceBooks.includes(name);node.dataset.referenceBook=name;node.onchange=()=>mark('resources');checkboxes.push(node);resources.append(field(name+(names.includes(name)?'':'（已缺失或不可选，请取消）'),node));}
  const world=el('select');world.dataset.phoneWorldEntry='';option(world,'暂不选择世界','');for(const row of available.worlds)option(world,row.name,row.worldId);world.value=available.phoneWorld?.database?available.phoneWorld.worldId:'';world.onchange=()=>mark('resources');resources.append(el('h3','小手机对应世界'),field('统一表单世界',world),el('p','应用、画风和时间读取所选世界的关联表；选择只保存定位，不套用旧初态或清空当前数据。'),button('保存资料书与手机世界选择',async()=>{only('resources');value=await roles.saveResources({referenceBooks:checkboxes.filter(n=>n.checked).map(n=>n.value),phoneWorld:world.value?{database:true,worldId:world.value}:null},value.revision);clean();status.textContent='当前聊天的资料书与世界选择已保存。';await draw();}));
  const books=el('section');books.dataset.templateBook='';books.append(el('h3','内置模板、扩展资料与美化书'),el('p','启动时自动检查；只更新插件管理的原文。用户改文与版本改文相遇时保留当前内容，以下明确列出待处理项。模板仅在新内容创作读取。'));
  const report=available.builtinStatus??roles.builtinStatus?.();if(report){books.append(el('p',report.status==='ready'?'内置书已核对。':'内置书尚有待处理项。'));for(const error of report.errors??[])books.append(el('p',(error.bookId??'目录')+'：'+error.message));for(const conflict of report.conflicts??[]){const box=el('details');box.append(el('summary',conflict.book+' / '+(conflict.entryId??'整本书')+' · '+conflict.type));for(const row of conflict.fields??[])box.append(el('pre','字段：'+row.field+'\n原版：'+row.base+'\n当前：'+row.current+'\n新版：'+row.upstream));if(conflict.entryId)for(const [choice,label]of [['keep','保留当前内容'],['upstream','采用插件新版']])box.append(button(label,async()=>{if(dirty)throw Error('请先保存或放弃当前修改');await roles.resolveBuiltinConflict({...conflict,choice});await draw();}));else box.append(el('p','整本书已缺失；请在世界书中恢复后重新检查。'));books.append(box);}}
  books.append(button('检查内置书更新',async()=>{if(dirty)throw Error('请先保存或放弃当前修改');const receipt=await roles.ensureTemplates();status.textContent=receipt.status==='ready'?'内置书检查完成。':'已完成可安全更新的项目；冲突或失败仍保留，请核对下方。';await draw();}));resources.append(books);
 }
 async function draw(){
  if(!alive)return;root.replaceChildren();root.classList.add('tisya-matrix-identity');root.style.cssText='max-width:900px;margin:auto;padding:16px;overflow-wrap:anywhere';root.append(el('h2',resourcesOnly?'故事档案与资料书':'用户身份'),status);
  const nav=el('div');if(!resourcesOnly)nav.append(button('返回',()=>leave(onClose)),button('原生身份管理',()=>leave(onNative)));nav.append(button('重新读取',async()=>{if(dirty)throw Error('请先保存或放弃修改');state=identity?.read();value=config.read();selected=state?.active;openedScope=roles.scope?.();await draw();}),button('放弃修改',async()=>{clean();state=identity?.read();value=config.read();selected=state?.active;openedScope=roles.scope?.();await draw();}));root.append(nav);
  if(!resourcesOnly){
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
  }
  if(roles.database){await drawDatabaseIdentity();return;}
  const section=el('section');section.dataset.storyAvatar='';section.append(el('h3','user · 主控化身绑定'));root.append(section);
  const avatar=storyAvatar(value);let listing;try{listing=await roles.list();}catch(e){section.append(el('p','基点书读取失败：'+e.message),button('重试准备基点书',async()=>{await roles.ensureBook();await draw();}));return;}if(!alive)return;
  const mode=el('select');mode.className='text_pole';mode.dataset.avatarMode='';
  option(mode,'不绑定角色','unbound');option(mode,'通用','generic');option(mode,PREFERENCE_GROUPS.find(g=>g.id==='N01').options.find(o=>o.id==='N01-B').label,'bound');option(mode,'无主控纯群像 / 场外导演模式','ensemble');mode.value=avatar.mode;
  const book=el('select');book.className='text_pole';book.dataset.roleBook='';for(const n of new Set([listing.book,...listing.books]))option(book,n+(listing.books.includes(n)?'':'（尚未建立）'),n);book.value=listing.book;
  const entries=el('select');entries.className='text_pole';entries.dataset.roleEntry='';const preview=el('p');preview.dataset.rolePreview='';let rows=listing.entries,editBefore=null,editorKey='',previousBook=book.value,previousEntry='';
  const editBox=el('section'),editName=input('',false,'dossier'),editContent=input('',true,'dossier');editBox.dataset.roleEdit='';editName.dataset.roleEditName='';editContent.dataset.roleEditContent='';editContent.rows=12;
  editBox.append(el('h3','编辑角色档案'),field('角色名称',editName),field('完整档案原文',editContent),el('p','保存会更新同一个角色条目；不重置当前手机状态和已经发生的故事。'),button('保存角色档案',async()=>{
   only('dossier','role');if(!editBefore)throw Error('请先选择角色档案');if(typeof roles.edit!=='function')throw Error('档案编辑接口尚未就绪');
   const saved=await roles.edit({book:book.value,uid:editBefore.uid,name:editName.value,content:editContent.value,before:editBefore},value.revision);value=config.read();rows=rows.map(r=>String(r.uid)===String(saved.uid)?saved:r);editBefore={...saved};editName.value=saved.name.replace(/^【角色】/u,'');editContent.value=saved.content;const selectedOption=[...entries.options].find(o=>o.value===String(saved.uid));if(selectedOption)selectedOption.textContent=saved.name;edits.delete('dossier');dirty=edits.size>0;status.textContent='角色档案已保存；原条目标识保持，手机现有状态未重置。';show();
  }));
  const show=()=>{book.disabled=false;entries.disabled=mode.value!=='bound';const selected=rows.find(e=>String(e.uid)===entries.value);preview.textContent=mode.value==='bound'?(selected?selected.name:rows.length?'请选择已有角色，或在下方创建新角色。':'还没有角色条目，在下方填写名称与设定即可创建并绑定。'):mode.options[mode.selectedIndex].textContent;const key=selected?book.value+'#'+selected.uid:'';editBox.hidden=!selected;if(key!==editorKey){editorKey=key;editBefore=selected?{...selected}:null;editName.value=selected?.name?.replace(/^【角色】/u,'')??'';editContent.value=selected?.content??'';}previousBook=book.value;previousEntry=entries.value;book.tisyaRefresh?.();entries.tisyaRefresh?.();};
  const fill=data=>{rows=data;entries.replaceChildren();option(entries,'选择【角色】条目','');for(const e of rows)option(entries,e.name,String(e.uid));entries.value=book.value===avatar.binding?.book?String(avatar.binding.uid):'';show();};fill(rows);
  mode.onchange=()=>{mark('role');show();};book.onchange=()=>run(async()=>{if(edits.has('dossier')){book.value=previousBook;book.tisyaRefresh?.();throw Error('请先保存或放弃当前档案编辑');}try{const next=await roles.list(book.value);fill(next.entries);mark('role');}catch(error){book.value=previousBook;book.tisyaRefresh?.();throw error;}});entries.onchange=()=>run(async()=>{if(edits.has('dossier')){entries.value=previousEntry;entries.tisyaRefresh?.();throw Error('请先保存或放弃当前档案编辑');}mark('role');show();});
  section.append(field('主控模式',mode),field('基点书 · 资料来源',book),el('p','基点书不自动启用为世界书；插件只读取选中的角色条目，注入当前聊天的故事身份槽位。'),field('角色档案',entries),preview,button('保存当前聊天绑定',async()=>{only('role');value=await roles.bind({mode:mode.value,book:book.value,uid:entries.value},value.revision);clean();status.textContent='当前聊天的主控模式与角色档案已保存。';await draw();}));
  section.append(editBox);
  const create=el('section'),roleName=input('',false,'create'),content=input('',true,'create');roleName.dataset.roleName='';content.dataset.roleContent='';create.dataset.roleCreate='';create.append(el('h3','创建角色并保存到基点书'),field('角色名称',roleName),field('角色条目原文',content),button('创建并绑定当前聊天',async()=>{only('role','create');const row=await roles.create({book:book.value,name:roleName.value,content:content.value},value.revision);value=config.read();clean();status.textContent=row.name+' 已保存到基点书并绑定当前聊天。';await draw();}));section.append(create);
  if(typeof roles.resources==='function'){
   const resources=el('section');resources.dataset.referenceBooks='';resources.append(el('h3','可选资料书启用'));root.append(resources);
   let listing;try{listing=await roles.resources();}catch(e){resources.append(el('p','资料书列表读取失败：'+e.message));return;}if(!alive)return;
   resources.append(el('p','补充当前聊天的世界设定、扩展小剧场等资料。已选条目仍按原有启用状态、关键词和触发条件参与本轮。'));
   const checkboxes=[],available=listing.books.filter(n=>!listing.excluded.includes(n));
   for(const name of new Set([...available,...listing.referenceBooks])){const box=el('input');box.type='checkbox';box.value=name;box.checked=listing.referenceBooks.includes(name);box.dataset.referenceBook=name;box.onchange=()=>mark('resources');checkboxes.push(box);resources.append(field(name+(available.includes(name)?'':'（已缺失或不能作为资料书，请取消后保存）'),box));}
   if(!available.length)resources.append(el('p','目前没有可选资料书，可以先在世界书页面创建或导入。'));
   const worldBook=el('select'),worldEntry=el('select');worldBook.dataset.phoneWorldBook='';worldEntry.dataset.phoneWorldEntry='';option(worldBook,'暂不选择手机世界','');for(const name of new Set([...listing.books.filter(n=>n!==listing.templateBook),listing.phoneWorld?.book].filter(Boolean)))option(worldBook,name,name);worldBook.value=listing.phoneWorld?.book??'';let worldRows=[];
   const loadWorlds=async selected=>{worldRows=[];worldEntry.replaceChildren();option(worldEntry,'暂不选择定义','');let failed;try{if(worldBook.value)worldRows=await roles.worldDefinitions(worldBook.value);}catch(e){failed=e;}if(!alive)return;for(const row of worldRows)option(worldEntry,row.name,String(row.uid));if(selected&&!worldRows.some(r=>String(r.uid)===String(selected.uid)))option(worldEntry,'原定义已缺失或读取失败，请重新选择',String(selected.uid));worldEntry.value=selected?String(selected.uid):'';worldEntry.tisyaRefresh?.();if(failed)throw failed;};
   let previousWorldBook=worldBook.value;worldBook.onchange=()=>run(async()=>{const options=[...worldEntry.options].map(o=>o.cloneNode(true)),selected=worldEntry.value;try{await loadWorlds(null);previousWorldBook=worldBook.value;mark('resources');}catch(error){worldBook.value=previousWorldBook;worldEntry.replaceChildren(...options);worldEntry.value=selected;worldBook.tisyaRefresh?.();worldEntry.tisyaRefresh?.();throw error;}});worldEntry.onchange=()=>mark('resources');
   resources.append(el('h3','小手机对应世界与画风'),field('手机世界资料书',worldBook),field('【手机世界】定义',worldEntry),el('p','世界定义决定应用与画风；角色档案里的手机初态提供个人资料。保存选择不会重新套用初值或清空已有手机。'));
   try{await loadWorlds(listing.phoneWorld);}catch(e){resources.append(el('p','手机世界读取失败：'+e.message));}
   resources.append(button('保存资料书与手机世界选择',async()=>{only('resources');const selected=worldRows.find(r=>String(r.uid)===worldEntry.value),phoneWorld=worldBook.value&&worldEntry.value?{book:worldBook.value,uid:selected?.uid??worldEntry.value}:null;value=await roles.saveResources({referenceBooks:checkboxes.filter(c=>c.checked).map(c=>c.value),phoneWorld},value.revision);clean();status.textContent='当前聊天的资料书与手机世界选择已保存；已有手机状态保持。';await draw();}));
   const templates=el('div');templates.dataset.templateBook='';templates.append(el('h3','全局模板书'),el('p',listing.templateBook+' · 仅新内容创作读取。内置世界与角色骨架可编辑，补齐操作保留已有内容。'));if(typeof roles.ensureTemplates==='function')templates.append(button('检查并补齐内置模板',async()=>{if(dirty)throw Error('请先保存或放弃当前修改');const receipt=await roles.ensureTemplates();value=config.read();status.textContent='模板书已核对；新增 '+receipt.added.length+' 项，已有模板保留。';await draw();}));resources.append(templates);
  }
 }
 const ready=run(async()=>{try{await roles.ensureBook();}catch(e){status.textContent='基点书自动准备失败：'+e.message;}try{if(typeof roles.ensureTemplates==='function')await roles.ensureTemplates();}catch(e){status.textContent='模板书准备未完成：'+e.message;}value=config.read();await draw();});return {ready,dispose(){alive=false;root.replaceChildren();},requestLeave:()=>dirty||busy&&!navigating?{allowed:false,reason:busy?'身份操作正在进行':'请先保存或放弃修改'}:{allowed:true}};
}
