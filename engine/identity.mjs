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
 let preparation=null;
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
  }else{
   check(['unbound','generic','ensemble'].includes(mode),'角色绑定模式无效');
   if(book!==undefined&&book!==null&&book!==''){
    check(typeof book==='string'&&book.trim()===book,'资料来源名称无效');const names=await helper().getWorldbookNames();check(Array.isArray(names)&&names.includes(book),'请选择已建立的资料来源书');value.coreBook=book;
   }
   value.story.userBinding=null;value.story.userName='';value.story.userMode=mode;
  }
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
 return {list,bind,create,ensureBook};
}
