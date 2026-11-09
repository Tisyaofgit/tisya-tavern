import worldTemplate from '../templates/phone-world.json' with {type:'json'};
import characterTemplate from '../templates/phone-character.json' with {type:'json'};

export const DEFAULT_TEMPLATE_BOOK='缇斯亚模板书';
const clone=value=>structuredClone(value),check=(ok,message)=>{if(!ok)throw Error(message);};
const entryName=e=>String(e.comment??e.name??'');
export const TEMPLATE_GUIDE=`这本书是全局创作模板库，仅供生成新世界、新角色或首次初始化草稿使用，不是当前故事的事实，也不是普通回合提示词。
条目默认关闭原生自动注入；保持关闭即可，创作入口会按用途读取。编辑已有模板会保留，重新准备仅补齐缺少的内置条目。
世界模板决定手机应用、画风、故事时间、货币规则和公共地点／商品。填好后另存为资料书中的【手机世界】名称条目，并在用户身份页最下方选择。
角色模板的 <手机初态> 可附在基点书的【角色】档案原文末尾。它只描述这个角色首次接入时已经成立的个人状态，不替换人物性格、经历等完整档案。
null 表示尚未提供；0、false、空列表有独立含义。编号和姓名须有实际定义后才能初始化。时间必须提供含时区的故事起点；不要使用现实设备时钟补齐。金额为整数分，货币小数位固定为 2；不填演示余额、联系人或歌曲。
账号项使用 {编号,名称,用户名,人物编号,本人}；钱包账户使用 {编号,名称,余额}。相册和音乐只登记真实来源与已授权信息，缺音源不能宣称可播放。其余列表按同版解析器合同填写；没有资料时保留空列表。
世界结算归属与原生 MVU、表单账本不能重复写余额。选择原生变量或表单时，仅配置外观／资料，不建立第二份可写资金账本。
资料书启用只作用于当前聊天，仍遵循宿主原有条目条件。修改角色、资料书或手机世界选择不重置已存在的手机存档；更换初始化来源须另经当前手机的显式初始化流程。
生成结果先保留为可编辑候选；占位骨架不作为运行初值，未发生事件不写入历史。`;
export function bundledTemplateEntries(){return [
 {name:'【模板】手机世界初始化骨架',content:'仅用于新世界设计；按依据填写，完成后另存【手机世界】条目。\n<手机世界>\n'+JSON.stringify(worldTemplate,null,2)+'\n</手机世界>'},
 {name:'【模板】角色手机初态骨架',content:'仅用于新角色／首次初始化设计；附在【角色】档案原文中。\n<手机初态>\n'+JSON.stringify(characterTemplate,null,2)+'\n</手机初态>'},
 {name:'【说明】模板书使用说明',content:TEMPLATE_GUIDE}
];}
export function templateBookName(config={}){const name=config.templateBook??DEFAULT_TEMPLATE_BOOK;check(typeof name==='string'&&name.trim()===name&&name,'模板书名称无效');return name;}
export function stripPhoneInitialization(text,tag='手机初态'){
 check(['手机初态','手机世界'].includes(tag),'未知手机资料标签');const value=String(text??'');
 const mention=new RegExp('<\\/?'+tag+'(?:\\s|>|$)','g');if(!mention.test(value))return value;
 const open='<'+tag+'>',close='</'+tag+'>',start=value.indexOf(open),end=value.indexOf(close);
 check(start>=0&&end>start&&value.split(open).length===2&&value.split(close).length===2&&[...value.matchAll(mention)].length===2,'资料中的 '+tag+' 格式错误：须有唯一完整闭合区块');
 return value.slice(0,start)+value.slice(end+close.length);
}
export function excludeTemplateBookEntries(payload,config={}){const name=templateBookName(config);for(const key of ['globalLore','characterLore','chatLore','personaLore'])if(Array.isArray(payload?.[key]))payload[key].splice(0,payload[key].length,...payload[key].filter(e=>e?.world!==name).map(e=>{const content=stripPhoneInitialization(stripPhoneInitialization(e.content,'手机世界'),'手机初态');return content===e.content?e:{...e,content};}));return payload;}
export function validateStoryLibraries(config){
 const template=templateBookName(config),story=config.story??{},refs=story.referenceBooks??[];
 check(Array.isArray(refs)&&refs.every(n=>typeof n==='string'&&n.trim()===n&&n)&&new Set(refs).size===refs.length,'资料书选择无效或重复');
 const core=config.coreBook??'基点书';check(template!==core&&template!==story.userBinding?.book,'模板书不能兼作基点角色书');
 check(refs.every(n=>![template,core,story.userBinding?.book].includes(n)),'资料书不能包含模板书或基点角色书');
 const world=story.phoneWorld;if(world!==undefined&&world!==null){check(world&&typeof world==='object'&&!Array.isArray(world)&&typeof world.book==='string'&&world.book.trim()===world.book&&world.book,'手机世界书引用无效');check((typeof world.uid==='number'&&Number.isSafeInteger(world.uid)&&world.uid>=0)||(typeof world.uid==='string'&&world.uid.trim()===world.uid&&world.uid),'手机世界条目标识无效');check(world.book!==template,'模板骨架不能直接作为当前手机世界');}
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
  const rows=[];for(const existing of payload[kind]){const entries=books.get(existing?.world);if(!entries){rows.push(existing);continue;}const key=existing.world+'\0'+String(existing.uid),fresh=entries.get(String(existing.uid));if(!fresh||seen.has(key))continue;rows.push({...clone(fresh),world:existing.world});seen.add(key);}payload[kind].splice(0,payload[kind].length,...rows);
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
export async function readCreationTemplates(getContext,{task='tableGenesis',getHelper=()=>globalThis.TavernHelper}={}){
 check(['tableGenesis','templateInit','newCharacter'].includes(task),'模板书只用于新内容创作');const context=getContext(),config=context.extensionSettings?.tisya_matrix_configuration??{},name=templateBookName(config);
 let rows,source;
 if(!Object.hasOwn(config,'templateBook')){rows=bundledTemplateEntries();source='bundled-not-yet-installed';}
 else{
  const h=getHelper();if(typeof h?.getWorldbook==='function')rows=await h.getWorldbook(name);
  else{check(typeof context.loadWorldInfo==='function','无法读取已配置的模板书');const data=await context.loadWorldInfo(name);check(data&&data.entries&&typeof data.entries==='object','已配置模板书不存在或损坏：'+name);rows=Object.values(data.entries);}
  check(Array.isArray(rows),'模板书读取格式无效');source='worldbook';
 }
 check(rows.every(e=>e&&typeof e.content==='string'),'模板书包含无效条目');
 return {book:name,source,task,entries:rows.map(e=>({...(e.uid!==undefined?{uid:e.uid}:{}),name:entryName(e),content:e.content}))};
}
export function creationTemplateText(value){return '[NEW_CONTENT_TEMPLATES]\n用途：仅生成新的设计候选；不是当前事实，不得回填或重置已有状态。\n来源：'+value.book+' / '+value.source+'\n'+value.entries.map(e=>e.name+'\n'+e.content).join('\n\n')+'\n[/NEW_CONTENT_TEMPLATES]';}
