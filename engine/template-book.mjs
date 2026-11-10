import {templateProfile,selectTemplateEntries} from './form-template-routing.mjs';
import {bundledNativeBuiltinBook} from './builtin-books.mjs';
import {BUILTIN_PACKAGE,BUILTIN_BOOK_NAMES,bundledFormTemplateEntries,FORM_TEMPLATE_GUIDE,MATRIX_CREATION_CONTRACT} from './builtin-book-data.mjs';

export const DEFAULT_TEMPLATE_BOOK='缇斯亚模板书';
const clone=value=>structuredClone(value),check=(ok,message)=>{if(!ok)throw Error(message);};
const entryName=e=>String(e.comment??e.name??'');
export const TEMPLATE_GUIDE=FORM_TEMPLATE_GUIDE;
export function bundledTemplateEntries(){return bundledFormTemplateEntries().map(({id,name,content,tasks,tables})=>({id,name,content,...(tasks?{tasks}:{}),...(tables?{tables}:{})}));}
export function bundledNativeTemplateBook(){return bundledNativeBuiltinBook('templates');}
export function templateBookName(config={}){const name=config.templateBook??DEFAULT_TEMPLATE_BOOK;check(typeof name==='string'&&name.trim()===name&&name,'模板书名称无效');return name;}
const builtinMeta=entry=>entry?.extensions?.tisyaBuiltin;
const managedNames=config=>[templateBookName(config),BUILTIN_BOOK_NAMES.beauty,...Object.entries(config.builtinBooks??{}).filter(([id])=>id==='templates'||id==='beauty').map(([,v])=>v.name).filter(Boolean)];
export function excludeTemplateBookEntries(payload,config={}){
 const excluded=new Set(managedNames(config));
 for(const key of ['globalLore','characterLore','chatLore','personaLore'])if(Array.isArray(payload?.[key]))payload[key].splice(0,payload[key].length,...payload[key].filter(e=>{
  const meta=builtinMeta(e);return !excluded.has(e?.world)&&!(meta?.package===BUILTIN_PACKAGE&&(meta.retired||meta.bookId==='templates'||meta.bookId==='beauty'||meta.purpose==='definition'||meta.purpose==='guide'));
 }));return payload;
}
export function validateStoryLibraries(config){
 const template=templateBookName(config),story=config.story??{},refs=story.referenceBooks??[];
 check(Array.isArray(refs)&&refs.every(n=>typeof n==='string'&&n.trim()===n&&n)&&new Set(refs).size===refs.length,'资料书选择无效或重复');
 const core=config.coreBook??'基点书';check(template!==core&&template!==story.userBinding?.book,'模板书不能兼作基点角色书');
 check(refs.every(n=>![...managedNames(config),core,story.userBinding?.book].includes(n)),'资料书不能包含模板书或基点角色书');
 const world=story.phoneWorld;if(world!==undefined&&world!==null)check(world.database===true&&typeof world.worldId==='string'&&world.worldId.trim()===world.worldId&&world.worldId,'请选择当前世界表单记录');
 return true;
}
export async function readStoryReferenceBooks(getContext,settings){
 validateStoryLibraries(settings);const names=settings.story?.referenceBooks??[];if(!names.length)return [];
 const context=getContext();check(typeof context.loadWorldInfo==='function','宿主缺少资料书读取接口');
 return Promise.all(names.map(async name=>{const data=await context.loadWorldInfo(name);check(data?.entries&&typeof data.entries==='object'&&!Array.isArray(data.entries),'所选资料书不存在或损坏：'+name);const entries=Object.values(data.entries),ids=new Set();for(const entry of entries){check(entry&&Number.isSafeInteger(entry.uid)&&entry.uid>=0&&!ids.has(entry.uid)&&typeof entry.content==='string','资料书条目标识或正文无效：'+name);ids.add(entry.uid);}return {name,entries:clone(entries)};}));
}
export function applyStoryReferenceBooks(payload,sources,settings={}){
 excludeTemplateBookEntries(payload,settings);if(!sources.length)return payload;
 check(Array.isArray(payload?.chatLore),'宿主资料书扫描数据缺少 chatLore');
 const books=new Map(sources.map(source=>[source.name,new Map(source.entries.map(entry=>[String(entry.uid),entry]))])),seen=new Set();
 for(const kind of ['globalLore','characterLore','chatLore','personaLore'])if(Array.isArray(payload[kind])){
  const rows=[];for(const existing of payload[kind]){const entries=books.get(existing?.world);if(!entries){rows.push(existing);continue;}const key=existing.world+'\0'+String(existing.uid),fresh=entries.get(String(existing.uid));if(!fresh||seen.has(key))continue;rows.push({...clone(fresh),world:existing.world,...(existing.tisyaConsoleOrder?{order:existing.order,tisyaConsoleOrder:clone(existing.tisyaConsoleOrder)}:{})});seen.add(key);}payload[kind].splice(0,payload[kind].length,...rows);
 }
 for(const {name,entries}of sources)for(const entry of entries){const key=name+'\0'+entry.uid;if(!seen.has(key)){payload.chatLore.push({...clone(entry),world:name});seen.add(key);}}
 return excludeTemplateBookEntries(payload,settings);
}
export async function scanStoryReferenceBooks(payload,{getContext,settings,guard=()=>{}}){
 const sources=await readStoryReferenceBooks(getContext,settings);guard();applyStoryReferenceBooks(payload,sources,settings);return sources;
}
const disabledEntry=row=>({...clone(row),enabled:false,strategy:{type:'selective',keys:[],keys_secondary:{logic:'and_any',keys:[]},scan_depth:'same_as_global'},position:{type:'after_character_definition',role:'system',depth:0,order:100},probability:100,recursion:{prevent_incoming:true,prevent_outgoing:true,delay_until:null},effect:{sticky:null,cooldown:null,delay:null}});
export async function ensureTemplateBook({name=DEFAULT_TEMPLATE_BOOK,getHelper=()=>globalThis.TavernHelper,guard=()=>{}}={}){
 templateBookName({templateBook:name});const h=getHelper();check(h&&['getWorldbookNames','getWorldbook','createWorldbook','updateWorldbookWith'].every(k=>typeof h[k]==='function'),'模板书需要可用的世界书接口');
 const wanted=bundledTemplateEntries(),names=await h.getWorldbookNames();guard();let created=false,added=[];
 if(!names.includes(name)){check(await h.createWorldbook(name,wanted.map(disabledEntry))===true,'模板书创建未确认，请重新读取核对');created=true;added=wanted.map(e=>e.name);}
 else{
  const current=await h.getWorldbook(name);guard();check(Array.isArray(current),'模板书读取格式无效');
  for(const row of wanted)check(current.filter(e=>entryName(e)===row.name).length<=1,'模板书有重复内置条目，请保留原书并核对：'+row.name);
  added=wanted.filter(row=>!current.some(e=>entryName(e)===row.name)).map(e=>e.name);
  if(added.length)await h.updateWorldbookWith(name,entries=>{guard();for(const row of wanted)check(entries.filter(e=>entryName(e)===row.name).length<=1,'模板书条目重复，请重新读取');return [...entries,...wanted.filter(row=>!entries.some(e=>entryName(e)===row.name)).map(disabledEntry)];},{render:'immediate'});
 }
 guard();const after=await h.getWorldbook(name);guard();check(Array.isArray(after)&&wanted.every(row=>after.filter(e=>entryName(e)===row.name).length===1),'模板书保存后条目回读未确认');
 for(const row of wanted.filter(e=>added.includes(e.name))){const saved=after.find(e=>entryName(e)===row.name);check(saved.content===row.content&&saved.enabled===false,'新增模板保存后内容或禁用状态不符：'+row.name);}
 return {book:name,created,added,entries:after.map(e=>({uid:e.uid,name:entryName(e),content:e.content}))};
}
export async function readCreationTemplates(getContext,{task='tableGenesis',kind,goal='',sourceText='',getHelper=()=>globalThis.TavernHelper}={}){
 check(['tableGenesis','templateInit','newCharacter','historyImport','tableArchive','objectArchive','tableAssistant','ruleReview','nativeFill','preferenceAnalysis','assetAdapt'].includes(task),'未知表单模板任务');const context=getContext(),config=context.extensionSettings?.tisya_matrix_configuration??{},name=context.extensionSettings?.tisya_builtin_books?.books?.templates?.name??templateBookName(config);
 let rows,source,installed=Object.hasOwn(config,'templateBook');const h=getHelper();
 if(!installed){
  const list=typeof h?.getWorldbookNames==='function'?()=>h.getWorldbookNames():typeof context.getWorldInfoNames==='function'?()=>context.getWorldInfoNames():null;
  if(list){const names=await list();check(Array.isArray(names)&&names.every(n=>typeof n==='string'),'模板书列表读取格式无效');installed=names.includes(name);}
  else if(typeof h?.getWorldbook==='function'){rows=await h.getWorldbook(name);installed=rows!==undefined&&rows!==null;}
  else if(typeof context.loadWorldInfo==='function'){const data=await context.loadWorldInfo(name);installed=data!==undefined&&data!==null;if(installed){check(data.entries&&typeof data.entries==='object'&&!Array.isArray(data.entries),'默认模板书损坏：'+name);rows=Object.values(data.entries);}}
 }
 if(!installed){rows=bundledTemplateEntries();source='bundled-not-yet-installed';}
 else{
  if(typeof context.loadWorldInfo==='function'){const data=await context.loadWorldInfo(name);check(data?.entries&&typeof data.entries==='object'&&!Array.isArray(data.entries),'模板书读取格式无效：不存在或损坏 '+name);rows=Object.values(data.entries);}
  else if(rows===undefined){check(typeof h?.getWorldbook==='function','无法读取已配置的模板书');rows=await h.getWorldbook(name);}
  check(Array.isArray(rows),'模板书读取格式无效');source='worldbook';
 }
 check(rows.every(e=>e&&typeof e.content==='string'),'模板书包含无效条目');
 rows=rows.filter(e=>!builtinMeta(e)?.retired);check(rows.length>0,'模板书没有可用条目');
 const profile=templateProfile({task,kind,goal,source:sourceText});const definitions=bundledFormTemplateEntries();rows=selectTemplateEntries(rows,definitions,profile);check(rows.length>0,'当前任务没有对应模板，请检查模板书用途标记');
 const selected=rows.map(e=>definitions.find(d=>d.id===(builtinMeta(e)?.entryId??e.id)||d.name===entryName(e))).filter(Boolean),tableIds=profile.tags.includes('phone')?[...new Set(selected.flatMap(d=>d.tables??[]).concat(['T_STATIC_WORLDS','T_CHAR_DOSSIER','T_SYS_ENTITIES','M_CALENDAR_RULES','X_WORLD_CLOCKS','T_STATIC_ITEMS_SKILLS','T_DYN_CURRENCY_BALANCES','T_DYN_HOLDINGS_INVENTORY']))]:null;
 return {book:name,source,task,profile,tableIds,entries:rows.map(e=>({...(e.uid!==undefined?{uid:e.uid}:{}),name:entryName(e),content:e.content}))};
}
export function creationTemplateText(value){return '[NEW_CONTENT_TEMPLATES]\n用途：按当前任务填写统一简表；模板不是当前事实，不得据此重置已有状态。\n'+MATRIX_CREATION_CONTRACT+'\n来源：'+value.book+' / '+value.source+'\n'+value.entries.map(e=>e.name+'\n'+e.content).join('\n\n')+'\n[/NEW_CONTENT_TEMPLATES]';}
