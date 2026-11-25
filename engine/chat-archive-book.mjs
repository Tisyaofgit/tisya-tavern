import {clone,digestAsync,sha256Async,fail} from './common.mjs';
import {chatKey,NS} from './controller.mjs';
import {syncObjectArchiveBooks} from './object-archive-book.mjs';

// v2 checkpoints are content-addressed blocks: the bundle is split into
// deterministic parts (meta / journal / baseline / one per table), each part
// hashed over its JSON text. A checkpoint rewrites only the manifest and the
// blocks whose content actually changed; unchanged blocks keep their rows.
// v1 whole-bundle checkpoints are not migrated: the next sync rebuilds the
// book as v2 while preserving every non-managed entry.
const FORMAT='tisya.chat-archive/1',FORMAT_V2='tisya.chat-archive/2',MARKER='tisyaChatArchive';
const check=(ok,code,message)=>{if(!ok)fail(code,message);};
const entry=(content)=>({uid:0,key:[],keysecondary:[],comment:'缇斯亚 · 完整聊天存档',content,constant:false,selective:true,selectiveLogic:0,order:100,position:1,disable:true,excludeRecursion:true,preventRecursion:true,probability:100,useProbability:true,depth:0,role:0,extensions:{[MARKER]:FORMAT_V2}});
const blockEntry=(slot,hash,content)=>({uid:0,key:[],keysecondary:[],comment:'缇斯亚 · 存档块 · '+slot,content,constant:false,selective:true,selectiveLogic:0,order:100,position:1,disable:true,excludeRecursion:true,preventRecursion:true,probability:100,useProbability:true,depth:0,role:0,extensions:{[MARKER]:FORMAT_V2,block_slot:slot,block_hash:hash}});
const nextUid=data=>Object.values(data.entries??{}).reduce((n,row)=>{const uid=Number(row.uid);return Number.isSafeInteger(uid)?Math.max(n,uid+1):n;},1);

// Splitting preserves key presence and insertion order: reassembly must
// reproduce the bundle's exact JSON bytes for the manifest hash to hold.
function splitBundle(bundle){
 const meta=clone(bundle);
 meta.state={...meta.state,tables:{}};
 const parts=[['meta',meta]];
 if('journal' in meta){
  const journal=meta.journal;
  if('entries' in journal){parts.push(['journal',journal.entries]);meta.journal={...journal,entries:[]};}
  if('baseline_messages' in journal){parts.push(['baseline',journal.baseline_messages]);meta.journal={...meta.journal,baseline_messages:[]};}
 }
 for(const [name,table]of Object.entries(bundle.state?.tables??{}))parts.push(['table:'+name,table]);
 return parts;
}
function assembleBundle(blocks){
 const meta=clone(blocks.get('meta'));
 meta.state={...meta.state,tables:{}};
 for(const [slot,value]of blocks){
  if(slot==='journal')meta.journal={...meta.journal,entries:clone(value)};
  else if(slot==='baseline')meta.journal={...meta.journal,baseline_messages:clone(value)};
  else if(slot.startsWith('table:'))meta.state.tables[slot.slice(6)]=clone(value);
 }
 return meta;
}

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
 async function decode(data,owner,{assemble=false}={}){
  const managed=Object.values(data?.entries??{}).filter(e=>e.extensions?.[MARKER]);
  const manifest=managed.filter(e=>e.extensions[MARKER]===FORMAT_V2&&e.extensions.block_slot===undefined);
  if(!manifest.length){
   // Legacy v1 single-entry checkpoints stay readable for their revision and
   // conflict checks; the next sync rebuilds the book as blocks.
   const rows=managed.filter(e=>e.extensions[MARKER]===FORMAT);
   check(rows.length===1,'ARCHIVE_BOOK_INVALID','存档书的完整存档条目缺失或重复，原书已保留');
   const row=rows[0];let value;try{value=JSON.parse(row.content);}catch{fail('ARCHIVE_BOOK_INVALID','存档书内容无法解析，原书已保留');}
   check(value.format===FORMAT&&value.chat_uid===owner.id&&(value.owner_chat_key===owner.key||owner.meta?.origin_chat_keys?.includes(value.owner_chat_key)),'ARCHIVE_BOOK_OWNER','存档书属于另一聊天，未覆盖');
   check(row.disable===true&&Number.isSafeInteger(value.revision),'ARCHIVE_BOOK_INVALID','存档书内容或校验不一致，原书已保留');
   return {legacy:true,row,value:{revision:value.revision}};
  }
  check(manifest.length===1,'ARCHIVE_BOOK_INVALID','存档书的存档清单条目缺失或重复，原书已保留');
  const row=manifest[0];let value;try{value=JSON.parse(row.content);}catch{fail('ARCHIVE_BOOK_INVALID','存档清单无法解析，原书已保留');}
  // A rename transfers the same chat under a new owner key; checkpoints
  // written under the old key stay valid while the origin chain attests them.
  check(row.disable===true&&value.format===FORMAT_V2&&value.chat_uid===owner.id&&(value.owner_chat_key===owner.key||owner.meta?.origin_chat_keys?.includes(value.owner_chat_key)),'ARCHIVE_BOOK_OWNER','存档书属于另一聊天，未覆盖');
  check(value.hash_algorithm==='json-sha256'&&typeof value.hash==='string'&&Number.isSafeInteger(value.revision)&&value.blocks&&typeof value.blocks==='object'&&!Array.isArray(value.blocks),'ARCHIVE_BOOK_INVALID','存档清单内容或校验不一致，原书已保留');
  const blocks=managed.filter(e=>e.extensions.block_slot!==undefined),bySlot=new Map();
  for(const block of blocks){
   const slot=block.extensions.block_slot,hash=block.extensions.block_hash;
   check(block.disable===true&&typeof slot==='string'&&typeof hash==='string'&&value.blocks[slot]===hash&&!bySlot.has(slot),'ARCHIVE_BOOK_INVALID','存档块缺失、重复或版本不符，原书已保留');
   check(await sha256Async(block.content)===hash,'ARCHIVE_BOOK_INVALID','存档块内容或校验不一致，原书已保留');
   bySlot.set(slot,block);
  }
  check(bySlot.size===Object.keys(value.blocks).length,'ARCHIVE_BOOK_INVALID','存档块缺失、重复或版本不符，原书已保留');
  if(!assemble)return {row,value};
  const parts=new Map();for(const [slot,block]of bySlot){let part;try{part=JSON.parse(block.content);}catch{fail('ARCHIVE_BOOK_INVALID','存档块内容无法解析，原书已保留');}parts.set(slot,part);}
  const bundle=assembleBundle(parts);
  check(bundle?.state?.schema&&bundle.state.tables&&value.revision===(bundle.local_revision??0)&&await sha256Async(JSON.stringify(bundle))===value.hash,'ARCHIVE_BOOK_INVALID','存档书内容或校验不一致，原书已保留');
  return {row,value,bundle};
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
    const names=await books.listBooks(),exists=names.includes(name),data=exists?await books.readBook(name):{entries:{}};
    const parts=splitBundle(bundle),texts=new Map(parts.map(([slot,part])=>[slot,JSON.stringify(part)]));
    const [dataHash,current,hash,...blockHashes]=await Promise.all([digestAsync(data),exists?decode(data,owner):Promise.resolve(null),sha256Async(JSON.stringify(bundle)),...parts.map(([slot])=>sha256Async(texts.get(slot)))]);
    const blocks=Object.fromEntries(parts.map(([slot],i)=>[slot,blockHashes[i]]));
    const value={format:FORMAT_V2,chat_uid:id,owner_chat_key:owner.key,revision,hash_algorithm:'json-sha256',hash,blocks};
    if(current){
     check(current.value.revision<=revision,'ARCHIVE_BOOK_NEWER','存档书版本较新，未用本机旧数据覆盖');
     if(!current.legacy&&current.value.revision===revision){check(current.value.hash===hash,'ARCHIVE_BOOK_CONFLICT','同一版本的本地存档与存档书不同，已保留双方');reports.set(id,{status:'saved',name,dossier_name:dossierName,history_name:historyName,revision,reused:true});return clone(reports.get(id));}
    }
    reports.set(id,{status:'saving',name,dossier_name:dossierName,history_name:historyName,revision});
    const objects=await syncObjectArchiveBooks({books,owner,bundle,dossierRef:refs.dossier_book,historyRef:refs.history_book,bookNames:names});
    // Recheck the concrete file immediately before replacing it; preserve all
    // user entries and native book metadata outside our managed rows.
    if(exists)check(await digestAsync(await books.readBook(name))===dataHash,'ARCHIVE_BOOK_CONFLICT','保存前存档书被其他页面修改，请重试');
    else check(!(await books.listBooks()).includes(name),'ARCHIVE_BOOK_CONFLICT','创建前出现同名存档书，请重试');
    const next=clone(data),wanted=new Set(Object.keys(blocks)),seen=new Set();let uid=nextUid(next);
    for(const [key,row]of Object.entries(next.entries)){
     const marker=row.extensions?.[MARKER],slot=row.extensions?.block_slot;
     if(marker===FORMAT){delete next.entries[key];continue;}
     if(marker!==FORMAT_V2||slot===undefined)continue;
     // Blocks are content-addressed: a row whose slot is still wanted keeps its
     // uid and only swaps content when the hash moved; stale and duplicate rows go.
     if(!wanted.has(slot)||seen.has(slot)){delete next.entries[key];continue;}
     seen.add(slot);
     if(row.extensions.block_hash!==blocks[slot]||row.content!==texts.get(slot))next.entries[key]={...row,content:texts.get(slot),extensions:{...row.extensions,block_hash:blocks[slot]}};
    }
    for(const slot of wanted)if(!seen.has(slot)){const row=blockEntry(slot,blocks[slot],texts.get(slot));row.uid=uid++;next.entries[row.uid]=row;}
    const manifestRow=(current?.row&&next.entries[current.row.uid])??entry('');
    if(!next.entries[manifestRow.uid])manifestRow.uid=uid++;
    manifestRow.content=JSON.stringify(value);next.entries[manifestRow.uid]=manifestRow;
    await books.writeBook(name,next);
    const verified=await decode(await books.readBook(name),owner,{assemble:true});
    check(verified.value.revision===revision&&verified.value.hash===value.hash,'ARCHIVE_BOOK_UNCONFIRMED','存档书写入后回读不一致，请重试同步');
    reports.set(id,{status:'saved',name,dossier_name:dossierName,history_name:historyName,revision,objects:objects.objects,events:objects.events});return clone(reports.get(id));
   }catch(error){
    reports.set(id,{status:'error',name:name??owner.meta.archive_book?.name??null,dossier_name:dossierName??owner.meta.dossier_book?.name??null,history_name:historyName??owner.meta.history_book?.name??null,revision,error:error.message});
    const wrapped=Error('本地存档已保留，存档书尚未同步：'+error.message,{cause:error});wrapped.code='ARCHIVE_SAVE_FAILED';wrapped.databaseCommitReceipt={contextKey:owner.key,chat_uid:id,revision};throw wrapped;
   }
  }).finally(()=>{if(jobs.get(id)===job)jobs.delete(id);});jobs.set(id,job);return job;
 }
 const wrapped={get:(...args)=>storage.get(...args),...(storage.stat?{stat:(...args)=>storage.stat(...args)}:{}),...(storage.workspaceToken?{workspaceToken:(...args)=>storage.workspaceToken(...args)}:{}),async set(id,value){capture(id);await storage.set(id,value);if(!id.includes(':backup:'))await sync(id);},async commit(id,revision,value){capture(id);const saved=await storage.commit(id,revision,value);if(saved)await sync(id);return saved;}};
 return {storage:wrapped,sync:()=>{const id=getContext().chatMetadata?.[NS]?.chat_uid;return id?sync(id):Promise.resolve(null);},status(){const c=getContext(),meta=c.chatMetadata?.[NS];if(!meta||meta.owner_chat_key!==chatKey(c))return null;return clone(reports.get(meta.chat_uid)??{status:'pending',name:meta.archive_book?.chat_uid===meta.chat_uid?meta.archive_book.name:null});}};
}

export function createNativeChatArchiveBooks({native,getContext,fetchImpl=globalThis.fetch}){
 return {
  async listBooks(){await native.flushWorldInfoSaves('tisya_chat_archive_list');await native.updateWorldInfoList();return [...native.world_names];},
  async readBook(name){await native.flushWorldInfoSaves('tisya_chat_archive_read');const response=await fetchImpl('/api/worldinfo/get',{method:'POST',headers:getContext().getRequestHeaders(),body:JSON.stringify({name}),cache:'no-store'});check(response.ok,'ARCHIVE_BOOK_READ','存档书读取失败：'+name+' ('+response.status+')');return response.json();},
  async writeBook(name,data){await native.flushWorldInfoSaves('tisya_chat_archive_save');await native.saveWorldInfo(name,clone(data),true);}
 };
}
