import {PHONE_FORM_TEMPLATES} from './form-template-routing.mjs';
import {builtinExtensionDefinitions,builtinPresentationDefinitions} from '../extension-preferences.mjs';

export const BUILTIN_PACKAGE='tisya.builtin-books';
export const BUILTIN_BOOK_NAMES=Object.freeze({templates:'缇斯亚模板书',extensions:'缇斯亚扩展资料书',beauty:'缇斯亚美化书'});
export const MATRIX_CREATION_CONTRACT="保留完整 `<reply id=\"tisya-onepass-1\">` 框架；`<body>` 说明方案，`<cells>` 按本次实际注册简表填写“【表名／序号】”与“序号{值}”。模型仅填写可读内容和关联名称；程序维护表、字段、稳定记录编号、主体关联、来源与提交回执，禁止输出嵌套存储 JSON。已有记录仅提交用户明确改变的字段；派生值、历史与程序回执禁止由模型填写。当缺少必需定义时，在 `<extra>` 写明“待补：具体问题”，禁止猜值。世界、角色与生活手机共用同一规范字段，禁止另建独立时钟或第二套钱包账本。模板仅作填写规则而非当前事实；作者原文作为版本化来源保留。";
export const WORLD_FORM_TEMPLATE=Object.freeze({format:'tisya.form-authoring-template/1',id:'world.definition',kind:'world',targets:[
 {tableId:'T_STATIC_WORLDS',fields:['name','core_proposition','era_name'],projections:['world_id','calendar_id','base_year'],instruction:"填写世界名称、核心命题与纪年；记录编号由程序生成，历法与基准年填写已注册关联子表。" },
 {tableId:'M_CALENDAR_RULES',fields:[],instruction:"使用实际 schema 中的完整历法规则；当世界未定义历法时保持未定义，禁止替换为现实设备公历。"},
 {tableId:'X_WORLD_CLOCKS',fields:[],instruction:"当前可执行世界时钟唯一归属 `X_WORLD_CLOCKS` 表；场景时间和手机日期均从该表读取。"},
 {tableId:'T_STATIC_PLACES',fields:[],instruction:"已有地点复用稳定记录，坐标、权限与已知范围按实际 schema 填写。"},
 {tableId:'T_STATIC_ITEMS_SKILLS',fields:[],instruction:"物品、货币及其单位先建立或引用规范定义；商户报价仅代表商品可售，禁止将其等同于人物已持有。"}
]});
export const CHARACTER_FORM_TEMPLATE=Object.freeze({format:'tisya.form-authoring-template/1',id:'character.dossier',kind:'character',targets:[
 {tableId:'T_SYS_ENTITIES',fields:['kind','origin_record_ref','runtime_state_ref'],projections:['entity_id','name'],instruction:"人物名称和完整设定写入人物原点档案（`T_CHAR_DOSSIER`）；由程序建立主体（`T_SYS_ENTITIES`）及原点关联，禁止模型重复建立人物注册行。" },
 {tableId:'T_CHAR_DOSSIER',fields:['name','public_identity','social_identity_duty','overall_physique','scene_personality_desc','manifest'],instruction:"按当前完整字段逐项填写身份、外貌、性格、欲望、矛盾、面具、生活、表达、能力和边界；本领外显仅写能力施展时的可见表现。前史、关系与隐情分别使用对应关联子表。"},
 {tableId:'T_DYN_CURRENCY_BALANCES',fields:['owner_ref','currency_ref','balance','debt','native_ref'],instruction:"货币余额仅采用有明确依据的初值；未知余额留空，禁止填 0，禁止将授信额度或贷款同时计入可用现金。"},
 {tableId:'T_DYN_HOLDINGS_INVENTORY',fields:[],instruction:"持有物关联已登记物品、所有者、保管者和数量，禁止因商品存在于目录而直接赋予人物持有。"},
]});
export const FORM_TEMPLATE_GUIDE="世界、角色和生活手机共用最新版表单 schema、实例与提交日志。先读取实际注册表，核对含义、类型、单位、时间层、权限和唯一所有者，再匹配已有规范字段和已登记别名；仅当存在独立生命周期或重复明细时才启用关联子模板。新增字段定义须先经 schema 接纳，禁止直接填入未登记字段。\n作者原文保留为版本化来源；模板更新不覆盖已采用定义或当前状态，打开资料页或手机界面不触发重新初始化。`0`、`false`、允许的空串和空数组保持各自原义。当前时钟仅通过统一世界时钟推进；余额、订单、分期、持有物、帖子和媒体元数据均由同一数据库保存，文件二进制通过媒体资产（`T_SYS_MEDIA_ASSETS`）引用。\n新建世界或人物执行「填写草稿 → 差异核对 → 统一提交 → 回读」流程。编辑已有角色时仅修改所选规范字段，禁止重放初始化或清空未改字段。私人信息、原生变量绑定及旧分支来源禁止因合并而扩大访问权限。\n"+MATRIX_CREATION_CONTRACT;

export function bundledFormTemplateEntries(){return [
 {id:'template.world.form',name:'【模板】世界统一表单',purpose:'template',content:WORLD_FORM_TEMPLATE.targets.map(t=>t.instruction).filter(Boolean).join('\n')+'\n\n'+MATRIX_CREATION_CONTRACT},
 {id:'template.character.form',name:'【模板】角色统一表单',purpose:'template',content:CHARACTER_FORM_TEMPLATE.targets.map(t=>t.instruction).filter(Boolean).join('\n')+'\n\n'+MATRIX_CREATION_CONTRACT},
 {id:'template.linked.modules',name:'【模板】生活模块关联子模板',purpose:'template',content:"手机应用、网络账号、联系人、订单及逐期明细、社交内容、媒体授权、日程均从本次 schema 选择对应表。世界、人物、货币、物品与当前时钟已有定义时直接按名称引用；不同业务仅登记存在实际缺口的关联子模板。每条记录写明所属实体、世界/会话/分支、来源和可见范围，禁止将同义字段或界面分区重复建表。\n\n"+MATRIX_CREATION_CONTRACT},
 {id:'template.guide',name:'【说明】统一表单模板使用说明',purpose:'template',content:FORM_TEMPLATE_GUIDE},
 ...PHONE_FORM_TEMPLATES
];}
const definitionEntry=(definition,prefix)=>({id:definition.id,name:prefix+definition.name,purpose:'definition',content:JSON.stringify(definition,null,2)});
export function builtinBookDefinitions(){return [
 {id:'templates',name:BUILTIN_BOOK_NAMES.templates,entries:bundledFormTemplateEntries()},
 {id:'extensions',name:BUILTIN_BOOK_NAMES.extensions,entries:[{id:'reference.guide',name:'【说明】扩展资料书',purpose:'guide',content:'这本书保存可更新的扩展资料与生成定义。安装不等于在所有聊天启用；当前世界的选用、主题、数量和来源均保存在同一表单数据库。下列 JSON 定义由插件读取，不能作为已发生剧情或当前状态注入。自定义普通资料条目仍沿宿主启用状态与触发条件。'},...builtinExtensionDefinitions().map(d=>definitionEntry(d,'【扩展】'))]},
 {id:'beauty',name:BUILTIN_BOOK_NAMES.beauty,entries:[{id:'presentation.guide',name:'【说明】美化书',purpose:'guide',content:'这本书登记标记对应的受限布局与样式令牌。世界/会话选用保存在统一表单数据库；未选择不会自动取第一项。模型仅看到当前可用标记及含义，显示编译器读取实际定义；原始定义不整本注入剧情，不执行书中任意脚本。现行 25+2 内容通道及旧 〔名称:参数〕…〔/名称〕 标记继续保留；新增 record 消息子类型属于本轮新协议，不声称复原 Vic 的旧原语法。T_DYN_MESSAGE_CONTENT.media_ref 引用 T_SYS_MEDIA_ASSETS，transfer_ref 引用 X_FIN_TRANSACTIONS；正文中的显示卡不再次扣账。完整允许字段和消息标记见 extension-host.mjs 的 PRESENTATION_PROMPT_CONTRACT。'},...builtinPresentationDefinitions().map(d=>definitionEntry(d,'【美化】'))]}
];}
export const BUILTIN_BOOKS=builtinBookDefinitions();
