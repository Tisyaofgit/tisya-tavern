import {templateBookName,ensureTemplateBook} from './template-book.mjs';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const roleName=entry=>String(entry.comment??entry.name??'');
export function storyAvatar(config){
 const story=config.story??{},legacy=Object.hasOwn(story.play?.choices??{},'N01')?story.play.choices.N01:config.playDefaults?.choices?.N01;
 const managed=Object.hasOwn(story,'userMode')||!!story.userBinding;
 const mode=story.userMode??(story.userBinding?'bound':legacy==='N01-B'?'bound':legacy==='N01-C'?'ensemble':'unbound');
 return {mode,managed,choice:managed?(mode==='bound'?'N01-B':mode==='generic'?'N01-A':'N01-C'):legacy,
  binding:mode==='bound'?story.userBinding??null:null};
}
export const avatarReference=binding=>binding?binding.book+'#'+binding.uid:'';
export function createStoryIdentity({config,getContext,getHelper=()=>globalThis.TavernHelper,assertIdle=()=>{}}){
 const scope=()=>{const c=getContext();return JSON.stringify([c.chatId,c.characterId,c.groupId]);};
 const helper=()=>{const h=getHelper();check(h,'世界书接口尚未就绪');return h;};
 let preparation=null,templatePreparation=null,editing=false;
 async function ensureBook(book=config.read().story.userBinding?.book??config.read().coreBook??'基点书'){
  if(preparation)return preparation;
  const work=async()=>{
   assertIdle();check(typeof book==='string'&&book.trim()===book&&book,'基点书名称不能为空');
   const captured=scope(),h=helper(),guard=()=>check(captured===scope(),'聊天已切换；基点书已保存的部分保留，请重新打开身份页');
   const names=await h.getWorldbookNames();guard();
   if(!names.includes(book)){check(await h.createWorldbook(book,[])===true,'基点书创建未确认');guard();check((await h.getWorldbookNames()).includes(book),'基点书创建后回读失败');}
   guard();return book;
  };
  preparation=work();try{return await preparation;}finally{preparation=null;}
 }
 async function list(book=config.read().story.userBinding?.book??config.read().coreBook??'基点书'){
  const h=helper(),all=await h.getWorldbookNames(),books=all;
  const entries=all.includes(book)?Object.values((await getContext().loadWorldInfo(book))?.entries??{}).filter(e=>/^【角色】.+/u.test(roleName(e))).map(e=>({uid:e.uid,name:roleName(e),content:e.content})):[];
  return {book,books,exists:all.includes(book),entries};
 }
 async function bind({book,uid,mode='bound'},expected=config.read().revision){
  assertIdle();const captured=scope(),value=config.read();check(value.revision===expected,'身份配置已变化，请重新读取');check(getContext().chatId,'请先打开要绑定的聊天');
  if(mode==='bound'){
   const rows=await list(book);check(rows.exists,'请选择已建立的基点书');const entry=rows.entries.find(e=>String(e.uid)===String(uid));check(entry,'基点书的角色条目已不存在');
   value.coreBook=book;value.story.userBinding={book,uid:entry.uid};value.story.userName=entry.name.slice('【角色】'.length);value.story.userMode='bound';
  }else{check(['unbound','generic','ensemble'].includes(mode),'角色绑定模式无效');value.story.userBinding=null;value.story.userName='';value.story.userMode=mode;}
  check(captured===scope(),'聊天已切换，绑定尚未保存');return config.save(value);
 }
 async function create({book=config.read().coreBook??'基点书',name,content},expected=config.read().revision){
  assertIdle();check(getContext().chatId,'请先打开要绑定的聊天');check(typeof book==='string'&&book.trim()===book&&book,'基点书名称不能为空');check(typeof name==='string'&&name.trim()===name&&name&&!/[\r\n]/.test(name),'角色名称须为单行非空文字');check(typeof content==='string'&&content.trim(),'请填写角色条目原文');
  const captured=scope(),h=helper(),title=name.startsWith('【角色】')?name:'【角色】'+name;
  check(config.read().revision===expected,'身份配置已变化，请重新读取');
  const guard=()=>check(scope()===captured,'聊天已切换；已保存的角色条目保留，尚未绑定到新聊天');
  const wanted={name:title,content,enabled:false,strategy:{type:'selective',keys:[],keys_secondary:{logic:'and_any',keys:[]},scan_depth:'same_as_global'},position:{type:'after_character_definition',role:'system',depth:0,order:100},probability:100,recursion:{prevent_incoming:true,prevent_outgoing:true,delay_until:null},effect:{sticky:null,cooldown:null,delay:null}};
  const names=await h.getWorldbookNames();guard();
  if(!names.includes(book)){check(await h.createWorldbook(book,[wanted])===true,'基点书保存未确认');}
  else {const entries=await h.getWorldbook(book);guard();const same=entries.filter(e=>e.name===title);check(same.length<=1,'基点书中有多个同名角色，请先核对');if(same.length)check(same[0].content===content,'已有同名角色且内容不同，请选择已有条目或使用另一名称');else await h.updateWorldbookWith(book,entries=>{guard();check(!entries.some(e=>e.name===title),'保存期间出现同名角色');return [...entries,wanted];},{render:'immediate'});}
  guard();
  const rows=await list(book),entry=rows.entries.find(e=>e.name===title&&e.content===content);check(entry,'角色条目保存后回读不同');
  try{await bind({book,uid:entry.uid},expected);}catch(e){throw Error('角色已保存至 '+book+' / '+title+'；聊天绑定未完成：'+e.message);}
  return entry;
 }
 async function edit({book,uid,name,content,before},expected=config.read().revision){
  check(!editing,'角色档案正在保存，请稍候');assertIdle();
  check(typeof book==='string'&&book.trim()===book&&book,'基点书名称不能为空');
  check(uid!==undefined&&uid!==null&&String(uid).trim(),'角色条目标识缺失');
  check(typeof name==='string'&&name.trim()===name&&name&&!/[\r\n]/.test(name),'角色名称须为单行非空文字');
  check(typeof content==='string'&&content.trim(),'请填写角色条目原文');
  check(before&&typeof before.name==='string'&&typeof before.content==='string','缺少原档案快照，请重新读取');
  const captured=scope(),h=helper(),title=name.startsWith('【角色】')?name:'【角色】'+name;
  check(title.slice('【角色】'.length).trim(),'角色名称不能为空');
  check(typeof h.getWorldbook==='function'&&typeof h.updateWorldbookWith==='function','宿主尚未提供档案更新接口');
  const guard=()=>{check(captured===scope(),'聊天已切换，请重新打开角色档案');check(config.read().revision===expected,'身份配置已变化，请重新读取');};
  const selected=entries=>{check(Array.isArray(entries),'角色书读取格式无效');const rows=entries.filter(e=>String(e.uid)===String(uid));check(rows.length===1,'角色条目不存在或标识重复，请重新读取');return rows[0];};
  const verify=entries=>{const row=selected(entries);check(/^【角色】.+/u.test(roleName(row)),'所选条目不是角色档案');check(roleName(row)===before.name&&row.content===before.content,'角色档案已被其他页面修改，请重新读取后核对');check(!entries.some(e=>String(e.uid)!==String(uid)&&roleName(e)===title),'已有同名角色，请使用不同名称');return row;};
  editing=true;let written=false;
  try{
   guard();const entries=await h.getWorldbook(book);guard();const original=verify(entries);
   if(roleName(original)!==title||original.content!==content){
    let invoked=false;
    await h.updateWorldbookWith(book,rows=>{guard();verify(rows);invoked=true;return rows.map(e=>String(e.uid)===String(uid)?{...e,name:title,...(Object.hasOwn(e,'comment')?{comment:title}:{}),content}:e);},{render:'immediate'});
    check(invoked,'宿主没有执行角色档案更新，请重新读取核对');
   }
   const actual=selected(await h.getWorldbook(book));
   check(roleName(actual)===title&&actual.content===content,'角色档案写入后回读不同，尚未确认保存');written=true;
   guard();const value=config.read();
   if(value.story.userBinding?.book===book&&String(value.story.userBinding.uid)===String(uid)&&value.story.userName!==title.slice('【角色】'.length)){
    value.story.userName=title.slice('【角色】'.length);await config.save(value);
   }
   return {uid:actual.uid,name:title,content};
  }catch(error){if(written)throw Error('角色档案已保存至 '+book+' / '+title+'；当前聊天身份同步未完成：'+error.message);throw error;}
  finally{editing=false;}
 }
 async function ensureTemplates(){
  if(templatePreparation)return templatePreparation;
  templatePreparation=(async()=>{assertIdle();const captured=scope(),value=config.read(),name=templateBookName(value),guard=()=>check(captured===scope(),'聊天已切换，已准备的模板书保留');
   const receipt=await ensureTemplateBook({name,getHelper,guard});guard();
   if(value.templateBook!==name){check(config.read().revision===value.revision,'配置已变化，模板书已保存，请重新读取');value.templateBook=name;await config.save(value);}
   return receipt;
  })();try{return await templatePreparation;}finally{templatePreparation=null;}
 }
 async function resources(){const value=config.read(),all=await helper().getWorldbookNames();check(Array.isArray(all),'世界书列表无效');return {books:all,templateBook:templateBookName(value),referenceBooks:[...(value.story.referenceBooks??[])],phoneWorld:value.story.phoneWorld??null,excluded:[templateBookName(value),value.coreBook??'基点书',value.story.userBinding?.book].filter(Boolean)};}
 async function worldDefinitions(book){
  if(!book)return [];const captured=scope();check(book!==templateBookName(config.read()),'模板骨架不能直接作为当前手机世界');
  const data=await getContext().loadWorldInfo(book);check(captured===scope(),'聊天已切换，未选择旧世界');check(data?.entries&&typeof data.entries==='object','手机世界资料书不存在或损坏：'+book);
  return Object.values(data.entries).filter(e=>/^【手机世界】.+/u.test(roleName(e))).map(e=>({uid:e.uid,name:roleName(e),content:e.content}));
 }
 async function saveResources({referenceBooks=[],phoneWorld=null},expected=config.read().revision){
  assertIdle();const captured=scope(),value=config.read();check(value.revision===expected,'身份配置已变化，请重新读取');check(getContext().chatId,'请先打开聊天');
  check(Array.isArray(referenceBooks)&&referenceBooks.every(n=>typeof n==='string'&&n.trim()===n&&n)&&new Set(referenceBooks).size===referenceBooks.length,'资料书选择无效或重复');
  const all=await helper().getWorldbookNames();check(captured===scope(),'聊天已切换，资料书选择未保存');
  const excluded=new Set([templateBookName(value),value.coreBook??'基点书',value.story.userBinding?.book].filter(Boolean));
  check(referenceBooks.every(n=>all.includes(n)&&!excluded.has(n)),'所选资料书缺失，或包含模板书／基点角色书');
  if(phoneWorld!==null){check(phoneWorld&&typeof phoneWorld.book==='string'&&phoneWorld.uid!==null&&phoneWorld.uid!==undefined,'手机世界引用不完整');check(all.includes(phoneWorld.book),'手机世界资料书不存在');const rows=await worldDefinitions(phoneWorld.book);check(rows.some(e=>String(e.uid)===String(phoneWorld.uid)),'手机世界定义已不存在，请重新选择');}
  check(captured===scope()&&config.read().revision===expected,'聊天或配置已变化，资料书选择未保存');
  value.story.referenceBooks=[...referenceBooks];value.story.phoneWorld=phoneWorld?{book:phoneWorld.book,uid:phoneWorld.uid}:null;return config.save(value);
 }
 async function phoneProfile(){
  const captured=scope(),value=config.read(),character=storyAvatar(value).binding,world=value.story.phoneWorld;if(!character||!world)return null;
  check(world.book!==templateBookName(value),'模板骨架不能直接作为当前手机世界');
  check(typeof getContext().loadWorldInfo==='function','世界书读取接口尚未就绪');
  const read=async(ref,prefix)=>{const data=await getContext().loadWorldInfo(ref.book);check(data?.entries&&typeof data.entries==='object','初始化资料书不存在或损坏：'+ref.book);const rows=Object.values(data.entries).filter(e=>String(e.uid)===String(ref.uid));check(rows.length===1&&roleName(rows[0]).startsWith(prefix),'初始化资料条目已不存在或类型改变：'+ref.book);check(typeof rows[0].content==='string','初始化资料正文无效');return rows[0].content;};
  const [worldText,characterText]=await Promise.all([read(world,'【手机世界】'),read(character,'【角色】')]);
  check(captured===scope()&&config.read().revision===value.revision,'聊天或初始化选择已变化，请重新打开手机');
  return {worldText,characterText,binding:{world:{book:world.book,uid:world.uid},character:{book:character.book,uid:character.uid}}};
 }
 return {list,bind,create,edit,ensureBook,ensureTemplates,resources,worldDefinitions,saveResources,phoneProfile};
}
