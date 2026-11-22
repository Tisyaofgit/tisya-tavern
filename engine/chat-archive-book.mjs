import {clone,digest,fail} from './common.mjs';
import {chatKey,NS} from './controller.mjs';
import {syncObjectArchiveBooks} from './object-archive-book.mjs';

const FORMAT='tisya.chat-archive/1',MARKER='tisyaChatArchive';
const check=(ok,code,message)=>{if(!ok)fail(code,message);};
const entry=(content)=>({uid:0,key:[],keysecondary:[],comment:'缇斯亚 · 完整聊天存档',content,constant:false,selective:true,selectiveLogic:0,order:100,position:1,disable:true,excludeRecursion:true,preventRecursion:true,probability:100,useProbability:true,depth:0,role:0,extensions:{[MARKER]:FORMAT}});

// The existing database remains the live owner. This book is its verified,
// non-injecting checkpoint, written through the very same storage boundary.
export function createChatArchiveStorage({storage,books,getContext}){
 const owners=new Map(),jobs=new Map(),reports=new Map();
 function capture(id){
  const c=getContext(),meta=c.chatMetadata?.[NS],key=chatKey(c);
  if(meta?.chat_uid===id&&meta.owner_chat_key===key){const owner={id,key,c,meta};owners.set(id,owner);return owner;}
  return owners.get(id);
 }
 async function bind(owner){
  const {id,key,c,meta}=owner;
  const guard=()=>{const live=getContext();check(chatKey(live)===key&&live.chatMetadata===c.chatMetadata&&live.chatMetadata?.[NS]===meta,'CHAT_CHANGED','创建存档书期间已切换聊天，请在原聊天重试');};
  const title=String(c.chatId).replace(/[\\/:*?"<>|\u0000-\u001f]/gu,'_').slice(0,48),specs=[['archive_book','缇斯亚存档'],['dossier_book','缇斯亚档案'],['history_book','缇斯亚历史']],prior={},refs={};let changed=false;
  // Host forks copy metadata: copied references belong to the parent chat.
  for(const [slot,prefix]of specs){let ref=meta[slot];if(ref?.chat_uid===id)check(ref.version===1&&typeof ref.name==='string'&&ref.name,'ARCHIVE_BINDING_INVALID','存档书绑定损坏，原数据已保留');else{ref={version:1,chat_uid:id,name:prefix+' · '+title+' · '+id};changed=true;}prior[slot]=meta[slot];refs[slot]=ref;meta[slot]=ref;}
  if(!changed)return refs;
  guard();try{await c.saveMetadata();guard();}catch(error){for(const [slot]of specs){if(prior[slot]===undefined)delete meta[slot];else if(meta[slot]===refs[slot])meta[slot]=prior[slot];}throw error;}
  return refs;
 }
 function decode(data,owner){
  const rows=Object.values(data?.entries??{}).filter(e=>e.extensions?.[MARKER]===FORMAT);
  check(rows.length===1,'ARCHIVE_BOOK_INVALID','存档书的完整存档条目缺失或重复，原书已保留');
  const row=rows[0];let value;try{value=JSON.parse(row.content);}catch{fail('ARCHIVE_BOOK_INVALID','存档书内容无法解析，原书已保留');}
  check(value.format===FORMAT&&value.chat_uid===owner.id&&value.owner_chat_key===owner.key,'ARCHIVE_BOOK_OWNER','存档书属于另一聊天，未覆盖');
  check(row.disable===true&&value.bundle?.state?.schema&&value.bundle?.state?.tables&&Number.isSafeInteger(value.revision)&&value.revision===(value.bundle.local_revision??0)&&value.hash===digest(value.bundle),'ARCHIVE_BOOK_INVALID','存档书内容或校验不一致，原书已保留');
  return {row,value};
 }
 function sync(id){
  const owner=capture(id);if(!owner)return Promise.resolve(null);
  const previous=jobs.get(id)??Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
   let revision=null,name=null,dossierName=null,historyName=null;
   try{
    const refs=await bind(owner),ref=refs.archive_book;name=ref.name;dossierName=refs.dossier_book.name;historyName=refs.history_book.name;
    const bundle=await storage.get(id);check(bundle?.state?.schema&&bundle?.state?.tables,'ARCHIVE_STATE_MISSING','本地存档读取失败，未创建空白替代');
    revision=bundle.local_revision??0;
    // A cold reopen is a cache lookup, not a request to rebuild every derived
    // dossier and event. Validate the persisted checkpoint before doing any
    // object-archive work; only an actual revision/content change can continue.
    const names=await books.listBooks();const exists=names.includes(name),data=exists?await books.readBook(name):{entries:{}};
    const current=exists?decode(data,owner):null,hash=digest(bundle),value={format:FORMAT,chat_uid:id,owner_chat_key:owner.key,revision,hash,bundle};
    if(current){
     check(current.value.revision<=revision,'ARCHIVE_BOOK_NEWER','存档书版本较新，未用本机旧数据覆盖');
     if(current.value.revision===revision){check(current.value.hash===hash,'ARCHIVE_BOOK_CONFLICT','同一版本的本地存档与存档书不同，已保留双方');reports.set(id,{status:'saved',name,dossier_name:dossierName,history_name:historyName,revision,reused:true});return clone(reports.get(id));}
    }
    reports.set(id,{status:'saving',name,dossier_name:dossierName,history_name:historyName,revision});
    const objects=await syncObjectArchiveBooks({books,owner,bundle,dossierRef:refs.dossier_book,historyRef:refs.history_book});
    // Recheck the concrete file immediately before replacing it; preserve all
    // user entries and native book metadata outside our single owned entry.
    if(exists)check(digest(await books.readBook(name))===digest(data),'ARCHIVE_BOOK_CONFLICT','保存前存档书被其他页面修改，请重试');
    else check(!(await books.listBooks()).includes(name),'ARCHIVE_BOOK_CONFLICT','创建前出现同名存档书，请重试');
    const next=clone(data),row=current?.row??entry('');next.entries[row.uid]={...row,content:JSON.stringify(value)};
    await books.writeBook(name,next);
    const verified=decode(await books.readBook(name),owner);
    check(verified.value.revision===revision&&verified.value.hash===value.hash,'ARCHIVE_BOOK_UNCONFIRMED','存档书写入后回读不一致，请重试同步');
    reports.set(id,{status:'saved',name,dossier_name:dossierName,history_name:historyName,revision,objects:objects.objects,events:objects.events});return clone(reports.get(id));
   }catch(error){
    reports.set(id,{status:'error',name:name??owner.meta.archive_book?.name??null,dossier_name:dossierName??owner.meta.dossier_book?.name??null,history_name:historyName??owner.meta.history_book?.name??null,revision,error:error.message});
    const wrapped=Error('本地存档已保留，存档书尚未同步：'+error.message,{cause:error});wrapped.code='ARCHIVE_SAVE_FAILED';wrapped.databaseCommitReceipt={contextKey:owner.key,chat_uid:id,revision};throw wrapped;
   }
  }).finally(()=>{if(jobs.get(id)===job)jobs.delete(id);});jobs.set(id,job);return job;
 }
 const wrapped={get:(...args)=>storage.get(...args),async set(id,value){capture(id);await storage.set(id,value);if(!id.includes(':backup:'))await sync(id);},async commit(id,revision,value){capture(id);const saved=await storage.commit(id,revision,value);if(saved)await sync(id);return saved;}};
 return {storage:wrapped,sync:()=>{const id=getContext().chatMetadata?.[NS]?.chat_uid;return id?sync(id):Promise.resolve(null);},status(){const c=getContext(),meta=c.chatMetadata?.[NS];if(!meta||meta.owner_chat_key!==chatKey(c))return null;return clone(reports.get(meta.chat_uid)??{status:'pending',name:meta.archive_book?.chat_uid===meta.chat_uid?meta.archive_book.name:null});}};
}

export function createNativeChatArchiveBooks({native,getContext,fetchImpl=globalThis.fetch}){
 return {
  async listBooks(){await native.flushWorldInfoSaves('tisya_chat_archive_list');await native.updateWorldInfoList();return [...native.world_names];},
  async readBook(name){await native.flushWorldInfoSaves('tisya_chat_archive_read');const response=await fetchImpl('/api/worldinfo/get',{method:'POST',headers:getContext().getRequestHeaders(),body:JSON.stringify({name}),cache:'no-store'});check(response.ok,'ARCHIVE_BOOK_READ','存档书读取失败：'+name+' ('+response.status+')');return response.json();},
  async writeBook(name,data){await native.flushWorldInfoSaves('tisya_chat_archive_save');await native.saveWorldInfo(name,clone(data),true);}
 };
}
