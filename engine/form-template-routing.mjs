// Task routing selects entries from the one installed template book. Templates
// describe authoring; they never supply current facts or execute business actions.
const entry=(id,name,tasks,tables,content)=>({id,name:'【模板】'+name,purpose:'template',tasks,tables,content});
export const PHONE_FORM_TEMPLATES=Object.freeze([
 entry('template.phone.setup','手机全初始化总表',['phone'],['T_STATIC_WORLDS','T_CHAR_DOSSIER','T_SYS_ENTITIES','M_CALENDAR_RULES','X_WORLD_CLOCKS','X_PHONE_WORLD_CONFIG'],`先按来源确定世界、人物和唯一故事时钟，再设计八个生活应用。世界手机设置填写启用应用、显示名称、货币、配送费、画风、交通方式及速度；启用应用可填微博；钱包；商城；外卖；相册；音乐；地图；日历。世界和人物用已有名称或本次表单分组关联。每个初态条目明确所属世界和人物，未知留空，不把未提供的余额、日期、联系人、媒体补成演示数据。
完整初始化按本次应用需要选用下面的资金、社交、交易、媒体、地图和日程子模板。先形成可核对草稿，经同一表单提交后再由手机读取；打开手机不重放初值。已有状态仅修订获准字段。业务编号、集合坐标、运行回执和派生统计由程序维护，模型不填。`),
 entry('template.phone.finance','手机资金与金融初始化',['phone','wallet'],['T_STATIC_ITEMS_SKILLS','T_DYN_CURRENCY_BALANCES','X_FIN_ACCOUNTS','X_FIN_CREDIT_CARDS','X_FIN_CREDIT_CHARGES','X_FIN_LOANS','X_FIN_LOAN_INSTALLMENTS','X_FIN_INVESTMENT_PRODUCTS','X_FIN_INVESTMENTS','X_PHONE_LOAN_RULES'],`货币与冻结账目填写规范货币资产、人物、现金余额和已有负债；金额单位按该表填写。资金账户仅引用余额原点，同一现金不重复记账。手机业务表中金额注明最小单位，货币表余额按货币单位，程序核精度。默认付款和收支账户在世界手机设置中按账户名称关联。
信用卡分别填写额度、账单日、还款日、溢缴款与已有逐笔消费；有已知负债必须能和消费明细核对。贷款规则填年利率基点、可选期数、每期天数、每年计息期数及本金范围；已有贷款另填逐期本金、利息、已还和到期故事分钟。理财产品与人物持仓分开，产品可注明额度范围、期限和提前赎回规则。待领取转账、冻结、账单生成、收益结算和流水只由实际业务动作产生，不凭初始化制造收入或回执。`),
 entry('template.phone.social','手机账号与社交初始化',['phone','weibo'],['X_SOCIAL_ACCOUNTS','X_SOCIAL_CONTACTS','X_SOCIAL_POSTS','X_SOCIAL_COMMENTS','X_NETWORK_ACCOUNTS','X_NETWORK_DOCUMENTS','X_NETWORK_ITEMS'],`网络账号填名称、账号标识、关联人物、是否本人、简介、关注对象；联系人另填人物及账号引用，没有账号不硬造。本人账号与NPC账号必须分开；当前账号只选本人。
帖子填写作者、正文、公开／关注者／私密范围、相片及歌曲引用、转发来源；未知点赞数留空。私人相片分享必须由拥有者逐条授权，不能把原件改公开。热搜、推荐、传播、通知送达和已读以实际证据派生；初始化不能伪造第三方看见、截图或同意。私聊和公开页面权限分别填写，登记账号不代表获得对方私密知识。`),
 entry('template.phone.commerce','商城外卖与赠礼初始化',['phone','shop','food'],['T_STATIC_ITEMS_SKILLS','X_ITEM_SPECS','X_SHOP_OFFERS','X_SHOP_PRODUCT_DETAILS','X_SHOP_ORDERS','X_SHOP_ORDER_ITEMS','T_DYN_HOLDINGS_INVENTORY'],`物品定义、商户报价和人物持有物分表：商品有库存不等于人物拥有。报价引用商品与货币，填写单价、库存、商户；扩展填写店铺、地点、图片标记、标签、规格及附加价、可配送地点、售卖时段、实物或数字交付和售后规则。外卖区分餐食、起送金额、配送费、地址、联系资料、备注和预约。
赠礼区分付款人、收件人及匿名公开范围；钱从实际付款账户扣，签收物品归实际收件人。优惠券、已有订单和持有物仅在来源明确时填写；不以模板虚构付款、签收或退费。报价确认、库存扣减、取消、部分退款、数字权益和配送回执使用同一业务服务，正文卡片只显示结果。`),
 entry('template.phone.media','相册音乐与主题初始化',['phone','album','music','theme'],['X_MEDIA_PHOTOS','X_MEDIA_ALBUMS','X_MEDIA_SONGS','X_MEDIA_PLAYLISTS','X_MEDIA_THEME','X_MEDIA_PLAYBACK','T_SYS_MEDIA_ASSETS'],`相片填写名称、归属、私密或公开、文件或插画来源、媒体格式及相簿关联。相簿是分类集合；编辑副本引用原件，最近删除保留历史引用，不能改写已发截图。文件条目必须关联实际导入的媒体资产；文字、名称和网页链接都不等于已保存的图像或音频。
歌曲填写歌名、作者、专辑、封面、已导入音源引用及有据时长；歌单按歌曲名称关联。导入歌词保留原文，只有实际时间标记用于同步。播放器队列、播放位置和收听历史只记录实际操作，不凭模板宣称播放。主题可选世界、薄雾、夜色、纸页或森林；自定义背景只引用本人已导入图片，覆盖方式和遮罩透明度明确填写，不扩大图片权限。`),
 entry('template.phone.map','地图交通与地点初始化',['phone','map'],['T_STATIC_PLACES','X_PLACE_MAP_POINTS','T_DYN_ENTITY_STATE','X_PHONE_WORLD_CONFIG'],`地点原点填名称及资料；地图扩展填同一地点引用、已知范围、坐标和类型。当前位置引用人物已有状态，未知地点不因出现在目录就变成已知。交通速度与坐标同单位，按故事分钟计算；未提供坐标或速度时明确不能算路线，不虚构真实GPS。查看路线不等于已经出发；出发、到达与物品位置使用统一故事时钟和规范状态。`),
 entry('template.phone.calendar','日历邀请与提醒初始化',['phone','calendar'],['X_CALENDAR_EVENTS','X_WORLD_CLOCKS','X_SOCIAL_CONTACTS','T_STATIC_PLACES'],`日程填写标题、故事时点、时长、地点、参与者、可见范围和个人／待确认／已确认／取消状态。重复规则填写间隔故事分钟及次数或终止时点，提醒填写提前故事分钟；不使用设备墙钟代替世界时间。本人记事不代表他人同意，只有明确来源才填已确认；订单、票据或邀约来源用稳定关联记录。改期、取消、重复事件和提醒保留来源，跨应用同步只更新对应日程，不虚构外部通知已经发送。`),
 entry('template.memory.archive','每轮记忆与历史提炼',['memory'],['T_DYN_EVENTS','T_DYN_EVENT_LINKS','T_DYN_EVENT_PARTICIPANTS','T_DYN_COGNITION','T_STATIC_FACTS','T_CHAR_ANCHORS'],`保留完整reply与archive槽。每轮归档只记录本轮已确认正文的事件、人物知情、关系或状态变化及明确未决事项，逐项给出段落依据。使用本次实际注册简表和既有名称；未知、省略与明确没有分开。原文、规范记忆和下轮检索是不同记录，不把原文已保存等同语义已入表。重复接纳、重骰和切分支由宿主回执处理，模型不重放扣费或发奖。`),
 entry('template.forms.configure','表单配置与规则修订',['configuration'],['M_CONDITIONS','M_FIELD_REFERENCES','M_LIST_VALUES'],`读取本次实际配置、可编辑字段和候选选项；只填写用户这次要求变化的格。保留0、否、明确空集合与未知的区别。已有字段类型、唯一资金归属和时钟不能在普通填表中暗改；缺少定义写待补，不输出嵌套配置JSON或执行代码。`),
]);
const names={微博:'weibo',钱包:'wallet',商城:'shop',外卖:'food',相册:'album',音乐:'music',地图:'map',日历:'calendar'};
export const PHONE_APP_NAMES=Object.freeze(names);
export function templateProfile({task='tableGenesis',kind,goal='',source=''}={}){
 const text=String(goal)+'\n'+(typeof source==='string'?source:'');const tags=new Set();
 if(['tableGenesis','templateInit','newCharacter'].includes(task)){tags.add(kind==='character'||task==='newCharacter'?'character':'world');if(task==='templateInit'||kind==null)tags.add('character');}
 if(['tableArchive','objectArchive','historyImport'].includes(task))tags.add('memory');
 if(['tableAssistant','ruleReview','nativeFill','preferenceAnalysis','assetAdapt'].includes(task))tags.add('configuration');
 if(/手机|生活应用|全初始化|完整初始化/.test(text))tags.add('phone');
 const modules={wallet:/钱包|账户|信用卡|借款|贷款|理财|转账|红包/,weibo:/微博|社交|热搜|账号|帖子/,shop:/商城|购物|商品|订单|赠礼/,food:/外卖|餐食|配送/,album:/相册|相簿|照片|相片/,music:/音乐|歌曲|歌单|音频/,map:/地图|路线|交通|出行/,calendar:/日历|日程|邀约|提醒/,theme:/手机主题|壁纸|手机背景/};
 for(const [key,re]of Object.entries(modules))if(re.test(text))tags.add(key);
 return {task,kind:kind??null,tags:[...tags]};
}
export function selectTemplateEntries(rows,definitions,profile){
 const byId=new Map(definitions.map(d=>[d.id,d])),byName=new Map(definitions.map(d=>[d.name,d]));
 return rows.filter(row=>{const id=row.extensions?.tisyaBuiltin?.entryId??row.id,name=String(row.comment??row.name??''),definition=byId.get(id)??byName.get(name);if(definition?.tasks)return definition.tasks.some(t=>profile.tags.includes(t));if(definition?.id==='template.guide')return true;if(definition?.id==='template.world.form')return profile.tags.includes('world');if(definition?.id==='template.character.form')return profile.tags.includes('character');if(definition?.id==='template.linked.modules')return profile.tags.some(t=>['phone',...Object.values(names)].includes(t));const declared=row.extensions?.tisyaTemplate?.tasks;return Array.isArray(declared)?declared.includes(profile.task):name.startsWith('【通用模板】')||['tableGenesis','templateInit','newCharacter'].includes(profile.task);});
}
