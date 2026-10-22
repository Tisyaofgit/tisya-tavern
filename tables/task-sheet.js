import {formatSimpleSheet,simpleSheetInstructions} from './simple-sheet.js';

// Examples are wire-shape references, never evidence or authorization to write.
const access={readers:['读者'],knowers:[]};
const change=(table,values)=>({id:'new:example',table,expected:0,values,access,evidence:'逐字连续来源原句'});
const emptyFill=()=>({templates:[],schemaChanges:[],changes:[],pending:[]});
const item={name:'核心特点',value:'来源支持的无画风表达',evidence:'逐字连续来源原句'};
export function tableTaskExamples(task,{archiveProposal=false}={}){
 const samples={
  tableArchive:archiveProposal?[{variant:'草案工具已接纳后的完成引用',value:{changes:[],archiveRequestId:'本轮给定编号',notes:[]}}]:[{variant:'有来源的事件归档',value:{...emptyFill(),changes:[change('events',{名称:'事件名称',经过:'来源中已经发生的结果'})]}},{variant:'仅申请补读薄档',value:{needsRows:['实际提供的记录编号']}}],
  objectArchive:[{variant:'对象发现',value:{...emptyFill(),changes:[change('objects',{名称:'来源定义的对象',类型:'已登记类型',描述:'来源支持的定义'})]}}],
  historyImport:[{variant:'历史补录',value:{...emptyFill(),changes:[change('events',{名称:'历史事件',经过:'可引用正文中的已发生结果'})]}}],
  preferenceAnalysis:[{variant:'仅用户明确要求全局持续适用时；候选仍等待用户确认',value:{...emptyFill(),changes:[change('preferences',{名称:'用户持续要求',类别:'文风',性质:'明确要求',内容:'用户原话支持的持续要求',证据:'逐字连续来源原句',强度:'偏好',启用:true,作用域:{全局:true}})]}},{variant:'仅用户明确要求本会话持续适用时；一个会话 ID 仍为列表',value:{...emptyFill(),changes:[change('preferences',{名称:'本会话持续要求',类别:'文风',性质:'明确要求',内容:'用户原话支持的本会话持续要求',证据:'逐字连续来源原句',强度:'偏好',启用:true,作用域:{会话:['STATE.preferenceContext.chatId 的原值']}})]}}],
  nativeFill:[{variant:'现有分支的完整新值；所有子值保持类型',value:{changes:[{id:'现有原生映射编号',table:'native_cells',expected:1,values:{值:{计数:0,开启:false,备注:'',目标:null,物品:[],细节:{}}},writePaths:['/实际分支'],evidence:'逐字连续来源原句'}],pending:[]}}],
  templateInit:[{variant:'普通模板初始化',value:{schemaChanges:[],templates:[],base:{templates:[],changes:[]},initial:{templates:[],changes:[]},notes:[]}},{variant:'仅当 STATE.repair.nameConflicts 给出名称修复任务',value:{renames:[{id:'给定 editableIds 中的编号',name:'有来源身份限定的名称'}],notes:[]}}],
  assetAdapt:[{variant:'单个对象的基点',value:{core:{name:'基点名称',traits:[item],growth:[]},notes:[]}},{variant:'sourceCard.format 为 tisya.core-selection/1 时的整组基点',value:{bundle:{name:'资产组名称',members:[{sourceObject:'所选对象编号',name:'该成员名称',traits:[item],growth:[]}],links:[{sourceRow:'所选关联编号',members:['所选对象编号','另一所选对象编号'],name:'关联意义',value:'原文支持的抽象意义',evidence:'逐字连续来源原句'}]},notes:[]}}],
  plotAdvance:[{variant:'phase=world：仅已确认的过去窗口',value:{from:'2026-01-01 08:00',to:'2026-01-01 09:00',events:[{id:'new:world-event',name:'场外事件',at:'2026-01-01 08:30',summary:'有依据的场外过程',actors:['窗口允许的主体编号'],basis:[{id:'实际依据行编号',rev:1}],changes:[]}],pending:[]}},{variant:'phase=plan：未来条件候选',value:{goal:'本轮设计目标',beats:[{proposal:'可选择的节拍',basis:['实际来源编号或用户依据原句'],condition:'进入条件'}],pendingChoices:[],due:[],clues:[],constraints:[]}}],
  tableAssistant:[{variant:'配置建议及可选补录',value:{answer:'供用户审核的简短说明',changes:[{path:'/给定可编辑路径',value:false,reason:'用户本次要求'}],backfill:null,genesisGoal:''}}],
  tableGenesis:[{variant:'创世根结构；registry 必须复用完整实际定义',value:{blueprint:{name:'蓝图名称',goal:'用户目标',decisions:[],unresolved:[]},checklist:[],artifacts:{registry:{tables:[],types:[]},base:{templates:[],changes:[]},initial:{templates:[],changes:[]}},workflow:{id:'workflow-id',name:'流程名称',version:1,steps:[]}}},{variant:'仅有基点组适配任务时追加 coreMapping',value:{coreMapping:{members:[{member:'来源成员编号',object:'new:target',items:[{item:'来源核心项编号',path:['描述'],expression:'目标字段中逐字存在的表达'}]}],links:[{link:'来源关联编号',targets:[{object:'new:target',path:['属性','实际字段名'],expression:'目标字段中逐字存在的表达'}]}]}}},{variant:'仅目标需要时向普通创世 artifacts 追加 stateSystem 和 native；保留其余必需根字段',value:{artifacts:{stateSystem:{definitions:'人物／经验：数值 = 点 [0,10000] 整数',items:'人物：基础',formulas:'',growth:'',events:'',initial:[{owner:'实际设计的对象编号',values:'经验[基础]：0',evidence:'逐字连续设计依据'}]},native:{presets:[{name:'获准设计的预设名',prompts:[{id:'instruction',name:'规则说明',role:'system',content:'用户授权的新规则文字',enabled:true}]}],worldbooks:[{name:'获准设计的世界书名',scope:'character',target:'',entries:[{name:'定义条目',content:'用户授权的新定义',keys:[],constant:true,enabled:true}]}],regexes:[]}}}}],
 };
 if(!samples[task])throw Error('任务简表示例未登记：'+task);
 return structuredClone(samples[task]);
}
export function tableTaskSheetContract(task,options={}){
 return simpleSheetInstructions()+'\n注册表 type 对照：text/ref/type/enum 均填文字，ref/type 只用已登记或本批获准的准确引用；texts/refs/array 均填列表，即使只有一项也用〈列表〉子表，不能降为文字；object/map 填对象并逐层展开；number 用〈数值〉；boolean 用〈布尔〉。json 表示允许原始数据的实际类型，不是让模型写 JSON 字符串；按该值实际类型选择文字、数值、布尔、空值、对象或列表，递归展开。空列表、空对象、空文本、null、0、false 与缺失各自保留，不互相补值。\n以下只示范本任务数据形状；占位文字不是来源、有效 ID、已核实事实或实际 schema。按本轮条件只输出一个完整结果。逐项遵守任务字段定义与原资料类型；嵌套字段不得放入 JSON 文本格。缺省字段保持缺省，禁止以 null、0、false、空文本互相代替。'+tableTaskExamples(task,options).map(({variant,value})=>'\n示例条件：'+variant+'\n'+formatSimpleSheet(value)).join('\n');
}
