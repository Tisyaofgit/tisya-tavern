import {builtinExtensionDefinitions,builtinPresentationDefinitions} from '../extension-preferences.mjs';

export const BUILTIN_PACKAGE='tisya.builtin-books';
export const BUILTIN_BOOK_NAMES=Object.freeze({templates:'缇斯亚模板书',extensions:'缇斯亚扩展资料书',beauty:'缇斯亚美化书'});
export const MATRIX_CREATION_CONTRACT='仅输出 JSON：{name:string,summary?:string,unresolved?:string[],matrix:{changes:[{tableId,recordId,values}],binding?:{entityId,dossierId,worldId?}}}。读取本次实际 schema，使用已登记的规范表、字段、类型、单位与稳定引用；同义名解析回规范字段，不新建同义表。新增只用任务分配的稳定 recordId，已有记录只提交明确改变的字段。缺少必需定义时列入 unresolved，不猜值。不得输出 phone.state、手机专属当前时钟、独立钱包余额库或旧 base/initial 账本。模板是填写规则，不是当前事实；作者原文是来源，当前状态以统一表单数据库为准。';
export const WORLD_FORM_TEMPLATE=Object.freeze({format:'tisya.form-authoring-template/1',id:'world.definition',kind:'world',targets:[
 {tableId:'T_STATIC_WORLDS',fields:['world_id','name','core_proposition','calendar_id','era_name','base_year','current_baseline_ref']},
 {tableId:'M_CALENDAR_RULES',fields:[],instruction:'使用实际 schema 中的完整历法规则；未定义的历法不换成设备公历。'},
 {tableId:'X_WORLD_CLOCKS',fields:[],instruction:'当前可执行世界时钟唯一归此表；场景时间和手机日期均读取它。'},
 {tableId:'T_STATIC_PLACES',fields:[],instruction:'已有地点复用稳定记录，坐标、权限与已知范围按实际 schema。'},
 {tableId:'T_STATIC_ITEMS_SKILLS',fields:[],instruction:'物品、货币及其单位先建或引用规范定义；商城报价不等于人物持有。'}
]});
export const CHARACTER_FORM_TEMPLATE=Object.freeze({format:'tisya.form-authoring-template/1',id:'character.dossier',kind:'character',targets:[
 {tableId:'T_SYS_ENTITIES',fields:['entity_id','name','kind','origin_record_ref','runtime_state_ref']},
 {tableId:'T_CHAR_DOSSIER',fields:['char_id','name','public_identity','social_identity_duty','overall_physique','scene_personality_desc','manifest']},
 {tableId:'T_DYN_CURRENCY_BALANCES',fields:['owner_ref','currency_ref','balance','debt','native_ref'],instruction:'只采用明确有据的初值；未知不填零，不把授信或贷款同时算作现金。'},
 {tableId:'T_DYN_HOLDINGS_INVENTORY',fields:[],instruction:'关联已登记物品、所有者、保管者和数量，不因商品存在就授予持有。'},
 {tableId:'T_SYS_SOURCE_FRAGMENTS',fields:[],instruction:'保存作者原文、实际来源及摘要；定义变更与会话状态变更分开审查。'}
]});
export const FORM_TEMPLATE_GUIDE=`世界、角色和生活手机共用最新版表单 schema、实例与提交日志。先读取实际注册表，核对含义、类型、单位、时间层、权限和唯一所有者，再匹配已有规范字段和已登记别名；只有独立生命周期或重复明细才增加必要关联子模板。新定义须先获 schema 接纳，未登记字段不直接填入。
作者原文保留为版本化来源；模板更新不覆盖已采用定义或当前状态，资料页和手机打开不重新初始化。0、false、允许的空串和空数组保持原义。当前时钟只通过统一世界时钟推进；余额、订单、分期、持有物、帖子和媒体元数据均由同一数据库保存，文件二进制通过媒体资产引用。
新建世界/人物走填写草稿、差异核对、统一提交与回读。已有角色编辑只修改选择的规范字段，不重放初始化，不清空未改字段。私人信息、原生变量绑定及旧分支来源不得因合并扩大权限。
旧 <手机世界> / <手机初态> 以及随旧版附带的 phone-world.json / phone-character.json 只作为只读迁移来源；保存原文、UID、摘要和单位映射后生成导入草稿。不能继续据此创建独立手机状态。旧值与当前表单不同必须显示冲突，未确认不选择其中一个。
`+MATRIX_CREATION_CONTRACT;

export function bundledFormTemplateEntries(){return [
 {id:'template.world.form',name:'【模板】世界统一表单',purpose:'template',content:JSON.stringify(WORLD_FORM_TEMPLATE,null,2)+'\n\n'+MATRIX_CREATION_CONTRACT},
 {id:'template.character.form',name:'【模板】角色统一表单',purpose:'template',content:JSON.stringify(CHARACTER_FORM_TEMPLATE,null,2)+'\n\n'+MATRIX_CREATION_CONTRACT},
 {id:'template.linked.modules',name:'【模板】生活模块关联子模板',purpose:'template',content:'手机应用、网络账号、联系人、订单及逐期明细、社交内容、媒体授权、日程均从本次 schema 选择对应表。世界/人物/货币/物品/当前时钟已有定义直接引用；不同业务只登记有实际缺口的关联子模板。每条记录明确所属实体、世界/会话/分支、来源和可见范围。不把同义字段或页面分区重复成表。\n\n'+MATRIX_CREATION_CONTRACT},
 {id:'template.guide',name:'【说明】统一表单模板使用说明',purpose:'template',content:FORM_TEMPLATE_GUIDE}
];}
const definitionEntry=(definition,prefix)=>({id:definition.id,name:prefix+definition.name,purpose:'definition',content:JSON.stringify(definition,null,2)});
export function builtinBookDefinitions(){return [
 {id:'templates',name:BUILTIN_BOOK_NAMES.templates,entries:bundledFormTemplateEntries()},
 {id:'extensions',name:BUILTIN_BOOK_NAMES.extensions,entries:[{id:'reference.guide',name:'【说明】扩展资料书',purpose:'guide',content:'这本书保存可更新的扩展资料与生成定义。安装不等于在所有聊天启用；当前世界的选用、主题、数量和来源均保存在同一表单数据库。下列 JSON 定义由插件读取，不能作为已发生剧情或当前状态注入。自定义普通资料条目仍沿宿主启用状态与触发条件。'},...builtinExtensionDefinitions().map(d=>definitionEntry(d,'【扩展】'))]},
 {id:'beauty',name:BUILTIN_BOOK_NAMES.beauty,entries:[{id:'presentation.guide',name:'【说明】美化书',purpose:'guide',content:'这本书登记标记对应的受限布局与样式令牌。世界/会话选用保存在统一表单数据库；未选择不会自动取第一项。模型仅看到当前可用标记及含义，显示编译器读取实际定义；原始定义不整本注入剧情，不执行书中任意脚本。'},...builtinPresentationDefinitions().map(d=>definitionEntry(d,'【美化】'))]}
];}
export const BUILTIN_BOOKS=builtinBookDefinitions();
