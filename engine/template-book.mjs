import worldTemplate from '../templates/phone-world.json' with {type:'json'};
import characterTemplate from '../templates/phone-character.json' with {type:'json'};

export const DEFAULT_TEMPLATE_BOOK='缇斯亚模板书';
const clone=value=>structuredClone(value),check=(ok,message)=>{if(!ok)throw Error(message);};
const entryName=e=>String(e.comment??e.name??'');
export const TEMPLATE_GUIDE=`这本书是全局创作模板库，仅供生成新世界、新角色或首次初始化草稿使用，不是当前故事的事实，也不是普通回合提示词。
条目默认关闭原生自动注入；保持关闭即可，创作入口会按用途读取。编辑已有模板会保留，重新准备仅补齐缺少的内置条目。
世界模板决定手机应用、画风、故事时间、货币规则和公共地点／商品。填好后另存为资料书中的【手机世界】名称条目，并在用户身份页最下方选择。
角色模板的 <手机初态> 可附在基点书的【角色】档案原文末尾。它只描述这个角色首次接入时已经成立的个人状态，不替换人物性格、经历等完整档案。
null 表示尚未提供；0、false、空列表有独立含义。编号和姓名须有实际定义后才能初始化。故事时间未提供时保持未知；若填写起点，须包含时区，不要使用现实设备时钟补齐。金额为整数分，货币小数位固定为 2；不填演示余额、联系人或歌曲。
账号项使用 {编号,名称,用户名,人物编号,本人}；钱包账户使用 {编号,名称,余额}。相册和音乐只登记真实来源与已授权信息，缺音源不能宣称可播放。其余列表按同版解析器合同填写；没有资料时保留空列表。
世界结算归属与原生 MVU、表单账本不能重复写余额。选择原生变量或表单时，仅配置外观／资料，不建立第二份可写资金账本。
资料书启用只作用于当前聊天，仍遵循宿主原有条目条件。修改角色、资料书或手机世界选择不重置已存在的手机存档；更换初始化来源须另经当前手机的显式初始化流程。
生成结果先保留为可编辑候选；占位骨架不作为运行初值，未发生事件不写入历史。`;
export const PHONE_FIELDS_GUIDE="# 手机初始化字段格式\n\n以下是类型签名与填写约束，不是可直接粘贴的实例 JSON，也不提供任何人物、余额、债务或媒体事实。两份骨架是唯一的待填事实模板；没有依据的数组保持 []，未知且允许缺失的值保持 null。每一条实际世界/角色来源只允许一个完整对应标签，标签内必须为标准 JSON，不加注释、尾逗号或额外字段。\n\n## 通用类型与单位\n\n编号＝非空稳定字符串，同一列表不重复；引用必须写被引用项的编号，不用显示名字替代，不用复制来源的内容。书籍定位采用书名与条目 UID；修改同一条档案保留 UID。世界编号与角色编号/姓名填好后才可初始化，模板中的 null 不是运行实例。\n文字＝字符串；金额＝非负整数，单位为当前货币的最小单位（小数位固定 2，100 个最小单位＝1 个货币单位）；余额/商品单价/库存允许 null 表示未知，不能把未知当零。正本金须大于 0。时间＝包含 Z 或显式 ±HH:MM 时区的 ISO 字符串；故事分钟＝相对世界“时间.起点”的非负整数分钟，不是设备时间戳。年利率基点为整数，100 基点＝1%，10000 基点＝100%；最大 1000000 基点。圆角单位为 CSS 像素，整数 0–40；颜色使用 #RGB、#RGBA、#RRGGBB 或 #RRGGBBAA。\n\n## 世界完整签名\n\n{格式:\"缇斯亚手机世界/1\",世界编号:编号|null,名称:文字|null,应用:[应用名],应用名称:{应用ID:显示名称},画风:{背景:颜色|null,面板:颜色|null,文字:颜色|null,强调:颜色|null,圆角:整数|null},时间:{起点:时间|null},结算归属:\"手机账本\"|\"原生变量\"|\"表单\"|null,货币:货币定义|null,金融:{贷款:贷款规则|null,理财:[理财产品],商城配送费:金额|null,外卖配送费:金额|null},商品:[商品],地点:[地点],交通:交通定义|null}\n应用名接受 微博、钱包、商城、外卖、相册、音乐、地图、日历，或对应 weibo、wallet、shop、food、album、music、map、calendar。应用名称的键只用这 8 个英文 ID，值为实际界面名称；空对象不改名。应用清单决定可用应用。\n货币定义＝{名称:文字,符号:文字,小数位:2}。\n交通定义＝{步行速度:正数|null,骑行速度:正数|null,公共交通速度:正数|null}；单位为地图单位/故事分钟，未提供速度的方式不可出发。\n贷款规则＝{年利率基点:整数|null,期数:[1–120 的整数],每期天数:1–366 的整数|null,每年计息期数:1–366 的整数|null,最低本金:正金额|null,最高本金:正金额|null}。新贷款采用等额本金；首期最高，之后随剩余本金减少。每期利率由年利率和“每年计息期数”计算，不能把“每期天数”默认为一个月或暗补 12 期。规则不完整不开放借款，最高本金不得低于最低本金。确认前需展示真实报价与逐期明细。\n理财产品＝{编号:编号,名称:文字,年利率基点:整数,说明:文字}。这是世界提供的产品，不是角色已持仓。\n商品＝{编号:编号,名称:文字,说明:文字,单价:金额|null,库存:非负整数|null,类别:\"实物\"|\"食品\",店铺编号:编号|null,地点编号:地点编号|null,封面:插画标记或空字符串,标签:[文字]}。类别区分商城与外卖，库存为件数；地点引用世界的地点列表。空/null 不是免费或无限库存的假定。\n地点＝{编号:编号,名称:文字,说明:文字,横坐标:有限数|null,纵坐标:有限数|null,类型:文字,已知:布尔值}。坐标与交通共用地图单位；已知只按角色已有依据填写，目录列出不意味着角色知道。当前位置必须引用这里的地点。\n\n## 角色完整签名\n\n{格式:\"缇斯亚手机角色/1\",角色编号:编号|null,姓名:文字|null,账号:[账号],当前账号:本人账号编号|null,钱包:{账户:[钱包账户],默认付款账户:钱包账户编号|null,默认收支账户:钱包账户编号|null,信用卡:信用卡|null,贷款:[已有贷款],理财:[已有理财]},联系人:[联系人],微博:[微博],相册:[相片],音乐:[歌曲],歌单:[歌单],日程:[日程],当前位置:地点编号|null}\n债务可作为已有贷款数组的旧别名，但与“钱包.贷款”只能写一处；新骨架统一使用钱包.贷款。账户、联系人、微博、相册、音乐和日程可以全部为空，不补演示人物或资产。\n账号＝{编号:编号,名称:文字,用户名:文字,人物编号:编号|null,本人:布尔值,简介:文字,颜色:颜色|null,标签:文字,关注:[账号编号]}。“本人”必须明确 true/false；本人账号的人物编号应为当前角色编号，null 时明确归当前角色。当前账号必须是本人账号，null 时从已登记的本人账号选择；无本人账号则保持 null。关注编号引用已登记账号。\n联系人＝{编号:编号,名称:文字,人物编号:编号|null,账号编号:账号编号|null}。人物编号是稳定人物引用；网络账号未知可留 null，不强造账号。联系人不自动授予微博或私人相册的知情权限。\n钱包账户＝{编号:编号,名称:文字,余额:金额|null}。默认付款账户及默认收支账户须指向钱包账户；多账户但未明确默认时，交易由用户实际选择。不把授信额度或贷款本金重复计为余额。\n\n## 信用卡、贷款与理财持仓\n\n信用卡＝{编号:编号,名称:文字,额度:金额,账单日:1–28 的整数,到期日:1–28 的整数,溢缴款:金额,消费:[信用消费]}。没有信用卡就填 null。总未还债务由逐笔消费汇总，不能超过额度；未填写消费表示没有已知未结消费，不生成虚构账单。\n信用消费＝{编号:编号,订单编号:编号|null,金额:金额,原始债务:金额,剩余债务:金额,已还:金额,已退:金额,预付款:金额,账单分钟:故事分钟,到期分钟:故事分钟}。没有可引用手机订单的历史消费，订单编号留 null。必须满足 原始债务+预付款=金额，剩余债务=max(0,原始债务−已还−已退)，已还不大于原始债务，已退不大于金额。溢缴款不是新收入；退款先冲减原债务，剩余进入卡内溢缴款。\n已有贷款＝{编号:编号,本金:正金额,期数:正整数,年利率基点:整数,总利息:金额,总应还:金额,已还:金额,剩余本金:金额,分期:[贷款分期],收支账户:钱包账户编号|null}。已有贷款必须有实际逐期明细，不能只填一个总债务并让系统猜分期。\n贷款分期＝{期号:正整数,本金:金额,利息:金额,已还:金额,到期分钟:故事分钟}。每期应还=本金+利息；已还不大于该期应还。总应还等于各期应还之和，贷款已还等于各期已还之和；还款先覆盖当期利息，再减少本金。剩余本金须与逐期剩余本金一致。总本金、总利息和期数按实际合同核对，不虚构逾期罚息或自动扣款。\n已有理财＝{编号:编号,产品编号:理财产品编号,本金:正金额,已结算收益:金额,申购分钟:故事分钟,结算分钟:故事分钟}。产品编号必须出现在世界金融.理财中；持仓不是银行可用余额，收益仅记录有依据的已结算部分。\n金融结算归属只选一个。手机账本可按已配置条件支付/借款/理财；原生变量或表单归属不另建可写资金账本。未配置时间、货币、账户或规则时，相应功能明确不可用，不以默认值补齐。\n\n## 微博、相册与音乐\n\n微博＝{编号:编号,作者:账号编号,正文:文字,可见范围:\"公开\"|\"关注者\"|\"私密\",相片:[相片编号],公开授权:[相片编号],转发来源:微博编号|null,歌曲:歌曲编号|null,原始点赞数:非负整数|null,时间:时间|null}。作者、媒体、转发与歌曲都引用同一初态已登记条目；转发不能指向自己。公开授权只表示该条微博可以分享其列出的私人原件，不把相册原件改为公开，也不代表其他帖子获授权。私密相片只能由实际拥有者或其本人账号分享；公开/关注者帖子使用私人照片必须有对应授权。未知点赞数、未知原发布时间保持 null。\n相片＝{编号:编号,名称:文字,归属:当前角色编号或账号编号|null,可见范围:\"私密\"|\"公开\",来源:\"文件\"|\"插画\",插画:插画标记,媒体类型:MIME 字符串}。归属 null 明确归当前角色，即使没有网络账号也可持有相册。相册原件不接受“关注者”，分享范围在微博里处理。可见范围默认私密。来源为文件时，真实文件须在手机中导入并持久保存；条目编号/名称本身不会生成图片，初始化资料书不携带文件二进制。\n歌曲＝{编号:编号,歌名:文字,作者:文字,专辑:文字,封面:插画标记或空字符串,音源:媒体文件编号|null,时长:非负有限数|null}。时长单位为秒；音源是已导入并保存的真实音频媒体编号，不是歌曲编号、网页地址或假定可用的网络链接。音源为 null 或文件不可读取时仅有曲目信息，必须选择实际音频才可播放，不宣称已经播放。\n歌单＝{编号:编号,名称:文字,歌曲:[歌曲编号]}，引用已登记曲目，不重复复制音源。相册/微博共用相片编号，音乐/微博共用歌曲编号；私有文件不能因被引用就绕过归属或公开授权。\n\n## 日程与世界变更\n\n日程＝{编号:编号,标题:文字,时间:时间,地点:地点编号|null,参与者:联系人编号或账号编号|null,状态:\"个人\"|\"待确认\"|\"已确认\"|\"已取消\"}。标题至多 100 字符；有日程具体时刻时世界必须已有时间起点；分钟轴由同一世界起点计算。参与者存在不等于对方已答应，只有已有明确依据才能填已确认；待确认保留邀请状态。地点和参与者使用已有编号，不由显示名称猜测。\n选择与保存资料书、角色档案不会重新套用初值。正式手机初始化是独立显式操作。更换世界编号应另开新聊天；同一世界、同一来源的应用列表、应用名称与画风变更可刷新显示而不重置个人状态。已存档的货币、结算归属、时间起点或金融机制变更需要迁移；当前实现拒绝直接覆盖，保留原档。世界/角色条目移动或 UID 改变也属于来源变化，应先核对归属，不能凭同名接管旧手机。\n";
export function bundledTemplateEntries(){return [
 {name:'【模板】手机世界初始化骨架',content:'仅用于新世界设计；按依据填写，完成后另存【手机世界】条目。\n<手机世界>\n'+JSON.stringify(worldTemplate,null,2)+'\n</手机世界>'},
 {name:'【模板】角色手机初态骨架',content:'仅用于新角色／首次初始化设计；附在【角色】档案原文中。\n<手机初态>\n'+JSON.stringify(characterTemplate,null,2)+'\n</手机初态>'},
 {name:'【说明】模板书使用说明',content:TEMPLATE_GUIDE},
 {name:'【说明】手机初始化字段格式',content:PHONE_FIELDS_GUIDE}
];}
export function bundledNativeTemplateBook(){return {name:DEFAULT_TEMPLATE_BOOK,entries:Object.fromEntries(bundledTemplateEntries().map((row,uid)=>[uid,{uid,key:[],keysecondary:[],comment:row.name,content:row.content,constant:false,selective:true,selectiveLogic:0,order:100,position:1,disable:true,excludeRecursion:true,preventRecursion:true,probability:100,useProbability:true,depth:0,role:0}]))};}
export function templateBookName(config={}){const name=config.templateBook??DEFAULT_TEMPLATE_BOOK;check(typeof name==='string'&&name.trim()===name&&name,'模板书名称无效');return name;}
export function stripPhoneInitialization(text,tag='手机初态'){
 check(['手机初态','手机世界'].includes(tag),'未知手机资料标签');const value=String(text??'');
 const mention=new RegExp('<\\/?'+tag+'(?:\\s|>|$)','g'),mentions=[...value.matchAll(mention)];if(!mentions.length)return value;
 const open='<'+tag+'>',close='</'+tag+'>',start=value.indexOf(open),end=value.indexOf(close);
 check(start>=0&&end>start&&value.split(open).length===2&&value.split(close).length===2&&mentions.length===2,'资料中的 '+tag+' 格式错误：须有唯一完整闭合区块');
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
export async function readCreationTemplates(getContext,{task='tableGenesis',getHelper=()=>globalThis.TavernHelper}={}){
 check(['tableGenesis','templateInit','newCharacter'].includes(task),'模板书只用于新内容创作');const context=getContext(),config=context.extensionSettings?.tisya_matrix_configuration??{},name=templateBookName(config);
 let rows,source,installed=Object.hasOwn(config,'templateBook');const h=getHelper();
 if(!installed){
  const list=typeof h?.getWorldbookNames==='function'?()=>h.getWorldbookNames():typeof context.getWorldInfoNames==='function'?()=>context.getWorldInfoNames():null;
  if(list){const names=await list();check(Array.isArray(names)&&names.every(n=>typeof n==='string'),'模板书列表读取格式无效');installed=names.includes(name);}
  else if(typeof h?.getWorldbook==='function'){rows=await h.getWorldbook(name);installed=rows!==undefined&&rows!==null;}
  else if(typeof context.loadWorldInfo==='function'){const data=await context.loadWorldInfo(name);installed=data!==undefined&&data!==null;if(installed){check(data.entries&&typeof data.entries==='object'&&!Array.isArray(data.entries),'默认模板书损坏：'+name);rows=Object.values(data.entries);}}
 }
 if(!installed){rows=bundledTemplateEntries();source='bundled-not-yet-installed';}
 else{
  if(rows===undefined){if(typeof h?.getWorldbook==='function')rows=await h.getWorldbook(name);else{check(typeof context.loadWorldInfo==='function','无法读取已配置的模板书');const data=await context.loadWorldInfo(name);check(data&&data.entries&&typeof data.entries==='object'&&!Array.isArray(data.entries),'已配置模板书不存在或损坏：'+name);rows=Object.values(data.entries);}}
  check(Array.isArray(rows),'模板书读取格式无效');source='worldbook';
 }
 check(rows.every(e=>e&&typeof e.content==='string'),'模板书包含无效条目');
 return {book:name,source,task,entries:rows.map(e=>({...(e.uid!==undefined?{uid:e.uid}:{}),name:entryName(e),content:e.content}))};
}
export function creationTemplateText(value){return '[NEW_CONTENT_TEMPLATES]\n用途：仅生成新的设计候选；不是当前事实，不得回填或重置已有状态。\n来源：'+value.book+' / '+value.source+'\n'+value.entries.map(e=>e.name+'\n'+e.content).join('\n\n')+'\n[/NEW_CONTENT_TEMPLATES]';}
