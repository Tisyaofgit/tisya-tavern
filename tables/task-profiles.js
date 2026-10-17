// Every auxiliary operation has its own authorization, intake destinations and
// execution procedure. Source text never selects an operation or expands it.
export const TASK_PROFILES=Object.freeze({
 ruleReview:{
  authorize:'校对完整原卡 AI 须知与绑定规则，指出有原文依据的冲突、缺口或不可能条件，提出缇斯亚版优化选择。只生成问题与方案；玩家选择前不生效，不修改原始资料、历史或运行脚本。',
  route:['STATE.ruleSources→完整逐字原文、来源 ID、连续原文行号与定义/示例分类；先核适用阶段、对象与条件，不能把不同作用域误判为冲突。','相互冲突、缺单位、无可执行分支、约束不相容→issues；原文定位→sources；可执行的局部改法与取舍→options。','运行脚本与原生约束未知→保留待验证；仅缺宿主展开文本不能据此新增原卡缺陷，必须另有已提供定义的具体冲突或缺口，不能用 AI 文本改法冒称已修好宿主行为。'],
  steps:['逐项读完所有规则，核定作用域、触发条件、数值单位、上限与优先关系；区分有证据的缺陷和审美偏好。','每个问题按对应 sources.lines 索引填写 sourceId 与闭区间 fromLine/toLine；应用直接取原句展示，无须复述 quote/before。说明具体失败情形，不以历史执行漂移自动判原卡错误。','有可行改法时给一至三个不同优化方向，列明最小必要完整行范围、完整替换文本、影响和取舍；证据可宽引，修改分开定位，不为上下文囊括未改行；选定行内的无关内容保留，不替玩家选择。','逐条核对来源 ID、原文行号与唯一定位，并两两比较不同问题的全部选项：任意组合均不得重叠或互相冲突。先缩窄无关范围，仍共享修改行或依赖同一选择的缺陷合并为一个问题及互斥完整方案。将每个选项的替换文本与保留的适用条款合读，核查主体、身份、阶段和场景；局部例外不得泛化为全体许可，也不得弱化未改的绝对约束。同一主体同时满足两条作用域时仍须只有相容要求；必要的扩大修改应完整定位并说明取舍。行范围不重叠不代表语义相容。按 tisya.rule-review-proposal/2 返回严格 JSON，原卡原文和历史不改写。']},
 plotAdvance:{
  authorize:'仅按所选 phase 执行世界结算或剧情设计。world 在获准时段内提出有依据的场外变化；plan 只提条件候选，保留玩家选择。',
  route:['STATE.phase=world→STATE.window/rows/dueChecks 的有据场外事务；phase=plan→用户目标、当前进度及已有蓝图。','人物知识、资源、地点与时间→各主体行动限制；到期→检查触发条件，不等于自动成功。','已确认事实→basis ID/revision；未来节拍→plan 候选；未提交回复→暂存资料，不能冒充结算凭据。'],
  steps:['核定 phase、可用时间窗、受影响主体、玩家权限与明确停点。','world 依已知原因、接触、资源、成本和阻力推演获准场外事务；plan 设计可选节拍及进入条件。','将已授权结算提案与未来计划分开，保留未完成事务，不重复结算同一来源。','核对 basis IDs/revisions、实际时间和人物知情；缺必要依据的分支保持未决，不强制推进。']},
 preferenceAnalysis:{
  authorize:'只分析本次用户原话中的持续创作偏好，生成待用户确认的候选；不自行生效，不推断现实敏感身份。',
  route:['SOURCE.userInput→逐字证据；局部行动、当轮指令和角色台词→局部上下文，不存长期偏好。','明确持续要求→preferences 候选；STATE.preferenceContext→persona/card/world/chat 的准确作用域。','已确认偏好→去重与冲突核对；重新生成本身→无原因信息；助手曾写过的内容→不证明用户喜好。'],
  steps:['识别用户原话中的持续时间和适用对象，排除已结束的局部指令。','将明确要求与可疑推断分开，保留原句及具体作用域；不扩大限时要求。','仅对有持续适用依据的内容填写 preferences；字段表达玩家确认后应存在的状态，新要求持续采用的偏好提案设启用=true，候选尚未确认由应用单独拦住，不能把待确认误写成永久停用。推断不能成为必须。','核验原句、范围 ID、持续性、确认后的启用意图和冲突；名称/内容/范围不混入临时待确认状态，返回候选，绝不自报已经应用。']},
 nativeFill:{
  authorize:'只为已登记的原生变量映射提出本回复支持的新值；由原生解析器和回调核验后写入，禁止其他表和第二写入者。',
  route:['SOURCE 的当轮正文与用户输入→实际结果依据；STATE.nativeRules→原卡规则与操作限制。','STATE.rows/nativeState→精确原生分支、类型和现值；已有成本→不得再次扣除。','可证实变化→对应 native_cells；未知结果或缺必要规则→pending；公式派生值→原生回调。'],
  steps:['核定当前回复、原生分支映射、规则版本及已反映的变化。','按既有类型和写权限计算可证实增量，保留未修改成员以及 _/$ 只读字段。','只填写现有 native_cells 的完整新分支值和必要 writePaths；不造根路径、不输出原生命令。','检查重复成本、数组/成员变化原子性和证据；交由原生解析与回调，不宣称已写入。']},
 tableAssistant:{
  authorize:'根据用户当前要求分析真实配置并提出批量修改草稿；仅由用户点击应用执行，不在回答时写入。',
  route:['SOURCE.question/conversation→当前需求；STATE.configuration/editablePaths/choices→可改路径与真实选项。','STATE.history/storage 和 TOOLS→实测状态；缺失能力与新资源需求→genesisGoal；已知楼层补录→backfill。','配置更改→changes；诊断说明→answer；无真实写回回执→不声称完成。'],
  steps:['核对用户要求与当前配置，区分已有选项、依赖和缺失功能。','只选 editablePaths 中的准确路径，提出需求及必要依赖的完整批量更改。','把新配置设计交 genesisGoal，把可验证历史范围交 backfill；未知状态保持未知。','校验值类型、范围与依赖，友好简短说明草稿；等用户应用，不重置无关配置。']}
});

export function taskProfile(task){const profile=TASK_PROFILES[task];if(!profile)throw Error('结构化辅助预设未登记：'+task);return profile;}
