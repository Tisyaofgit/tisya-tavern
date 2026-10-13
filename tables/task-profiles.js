// Every auxiliary operation has its own authorization, intake destinations and
// execution procedure. Source text never selects an operation or expands it.
export const TASK_PROFILES=Object.freeze({
 ruleReview:{
  authorize:'校对完整原卡 AI 须知与绑定规则，指出有原文依据的冲突、缺口或不可能条件，提出缇斯亚版优化选择。只生成问题与方案；玩家选择前不生效，不修改原始资料、历史或运行脚本。',
  route:['STATE.ruleSources→完整逐字原文、来源 ID、连续原文行号与定义/示例分类；先核适用阶段、对象与条件，不能把不同作用域误判为冲突。','相互冲突、缺单位、无可执行分支、约束不相容→issues；原文定位→sources；可执行的局部改法与取舍→options。','运行脚本与原生约束未知→说明待验证；不能用 AI 文本改法冒称已修好宿主行为。'],
  steps:['逐项读完所有规则，核定作用域、触发条件、数值单位、上限与优先关系；区分有证据的缺陷和审美偏好。','每个问题按对应 sources.lines 索引填写 sourceId 与闭区间 fromLine/toLine；应用直接取原句展示，无须复述 quote/before。说明具体失败情形，不以历史执行漂移自动判原卡错误。','有可行改法时给一至三个不同优化方向，列明每处原文行范围与完整替换文本、影响和取舍；替换范围内无关内容必须保留，不替玩家选择。','逐条对照原文行号索引，核对来源 ID、范围存在、连续唯一定位以及完整替换后的作用域；同一行的关联缺陷合并问题。按 tisya.rule-review-proposal/2 返回严格 JSON，原卡原文和历史不改写。']},
 templateInit:{
  authorize:'整理完整原卡 AI 须知、绑定定义、用户人设和原始历史，提出模板初始化草稿。只由程序核验并保存；不执行卡内脚本，不改原卡，不把历史进度写成开局。',
  route:['CARD/BOOKS 的已启用 AI 须知定义→base.objects/facts；inactiveEntries、enabled=false、示例和备选开场→保留的源资料与适用性索引，不作生效规则或已发生事件；脚本与显示实现由宿主处理，不进入本请求。','SOURCE.sourceUser→程序独占的原生用户对象；使用给定 objectId，不重建或改写其原文。','HISTORY 全部原文→按楼层的历史索引、矛盾索引与后续 historyImport；用于识别当前进度及所需模板，不能拿旧状态重置当前值。','定义明示的开局状态→initial；已发生的历史状态→后续历史补录；已有 STATE.rows→ID/字段复用与版本核对。'],
  steps:['逐项阅读原卡、绑定资料和历史索引，区分定义、示例、输出格式、开局与既成历史；列出来源冲突。','对照现有模板与对象，复用稳定 ID 和类型；为独立机制、条件、公式、阈值及例外保留各自字段。','只从有效定义填写 base 与开局 initial；保留硬约束强度，原生用户交给程序逐字导入；历史交由历史预设。','检查同名对象、引用、字段类型、原生写入归属和初始化不得倒灌当前进度；提交完整草稿与未决项。']},
 tableArchive:{
  authorize:'依据本次已确认回复和此前连续用户输入提出归档变更；不续写剧情，不确认偏好，不写原生变量。',
  route:['SOURCE.archiveSource 的正文→本次事件和可证实结果；HISTORY 中对应完整回复→保留原文及辅助块出处，不增加证据权限。','SOURCE.userSource→明确设定、已授权心理及行动意图；意图与要求不当作完成结果。','可复用身份与规则→objects/facts；同一发生过程→events；当前值与事务→各自业务表；独立人物理解→cognition。','STATE→版本、去重与接续；ARCHIVE.latestTemporary→未提交候选；PREFERENCES→已确认且范围适用的创作限制。'],
  steps:['按 source key/floor 核定本次边界，完整读取连续用户输入和回复；从正文识别实际结果。','把每个事实分配到唯一表及对象；历史事件存一次，关系、体验和认知引用它。','需要修改薄档或存在同名碰撞时先请求 needsRows；按现有修订填写增量，objectsSeparate 时不写对象与事实。','检查证据、版本、时序、权限与引用；不能解决的冲突保留 pending，未执行计划不落成事实。']},
 objectArchive:{
  authorize:'为当前归档来源提出对象和事实档案；与对应归档共享一次提交，不提前写入会话，不推进故事。',
  route:['SOURCE 的已证实新身份、规则、地点、物品和发现条件→objects/facts。','当前地点、伤势、占有、关系、事务和成长→对应归档任务；不误记为永久底档。','STATE 的身份索引→同名核对；薄档需补读后才能更新；新 ID 供下一归档任务原样引用。'],
  steps:['区分新对象与旧对象新事实，核对别名和身份，不以同名强行合并。','补读所有待修改的薄档，复用类型；有实际新结构才派生类型或加可选字段。','填写 objects/facts 草稿与准确来源；临时状况交会话业务表，不把一次相遇写成永久日程。','检查所有 new:ID、引用及访问权限；返回未提交提案，让对应历史归档统一核验提交。']},
 historyImport:{
  authorize:'从完整原始历史补录事实，保留原文、楼层、时间和相互矛盾的出处；不替记录编造过渡，不将未定位旧状态覆盖当前进度。',
  route:['HISTORY→完整原文；SOURCE.text 或 SOURCE.archiveSource.text→程序提供的可引用正文视图；两者是同一来源的不同视图。','用户的明确背景设定→定义；AI 正文的已发生结果→events 及当时业务状态；转述→注明主体与确信程度的 cognition。','旧 task/memory/status/变量命令→带原位置的辅助资料；不能作为独立事件证据，也不执行。','既有 STATE→当前版本；可核实的较晚事实更新当前值；时间未知或同层矛盾→历史/待核对，保留旧来源。'],
  steps:['按原顺序阅读每条记录，分开角色、楼层、故事时间和辅助块；保留正文中的早期定义与后续矛盾。','为每个已发生事件匹配对象与业务表，保留独特约定、经历和回忆触发词；不靠旧汇总补写。','按可证实时序填写增量，旧状态不能压过较晚当前值；未定位手写历史只补历史事实。','核对完整来源覆盖、证据连续原句、字段类型、权限、关联和去重；未决冲突留下具体来源，不宣称归档完成。']},
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
 assetAdapt:{
  authorize:'提取当前选择对象的跨世界可迁移核心，保留来源；仅包含用户明确选择的成长，不擅自适配目标世界。',
  route:['SOURCE.sourceCard→当前选择的对象档案；基础性格、价值、习惯和外观→core.traits。','明确选取的成长来源→core.growth；世界职业、机制、人际绑定和旧世界完成记录→不迁移的来源背景。'],
  steps:['核定选中的对象与是否携带成长，保留每条原始来源。','分开稳定核心与特定世界绑定，未知传记不补写。','逐项填写 core.traits 和获准 core.growth，证据原句取自来源。','检查无未选择成长、无旧关系自动继承、无目标世界虚构适配；提交核心草稿。']},
 tableGenesis:{
  authorize:'依用户创世目标设计可修改的完整蓝图、模板、底档与初始状态；保存前由用户确认，不替用户执行未授权外部操作。',
  route:['SOURCE.goal→设计需求；GENESIS→已有蓝图与待续工作；STATE.registry/rows→可复用资源。','结构与机制→schemas/templates；可复用世界底档→base；明确新开局→initial；后续生成规则→workflow。','API、宿主或外部创建→有真实回执的后续操作，不以蓝图文本宣称创建成功。'],
  steps:['梳理目标、现有蓝图、约束、资源和未完成项；接续而不重建已确认内容。','设计相容的表、字段、类型、引用与公式，安排每项填录的唯一负责流程。','填写完整 blueprint/checklist/artifacts/workflow；保持底档与当前会话分离。','检查依赖环、引用、可实现性和所有需求落点；保留待确认项目，只交设计草稿。']},
 tableAssistant:{
  authorize:'根据用户当前要求分析真实配置并提出批量修改草稿；仅由用户点击应用执行，不在回答时写入。',
  route:['SOURCE.question/conversation→当前需求；STATE.configuration/editablePaths/choices→可改路径与真实选项。','STATE.history/storage 和 TOOLS→实测状态；缺失能力与新资源需求→genesisGoal；已知楼层补录→backfill。','配置更改→changes；诊断说明→answer；无真实写回回执→不声称完成。'],
  steps:['核对用户要求与当前配置，区分已有选项、依赖和缺失功能。','只选 editablePaths 中的准确路径，提出需求及必要依赖的完整批量更改。','把新配置设计交 genesisGoal，把可验证历史范围交 backfill；未知状态保持未知。','校验值类型、范围与依赖，友好简短说明草稿；等用户应用，不重置无关配置。']}
});

export function taskProfile(task){const profile=TASK_PROFILES[task];if(!profile)throw Error('辅助预设未登记：'+task);return profile;}
