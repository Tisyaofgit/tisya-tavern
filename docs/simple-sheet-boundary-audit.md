# 极简填表模型边界审计与两阶段接线计划

本记录只把已经验证的协议改动计为实现。两阶段调用是后续接线设计，本文不宣称已接通，也不增加占位模块。

## 共享 codec 已实现

`tables/simple-sheet.js` 复用 compact-v2 的分组、稳定行号、字段名和值风格，增加明确的类型标记、复杂子表、字段转义和多行文本。新增语法不是此前 compact-v2 已支持的能力。

- `formatSimpleSheet(value, options?)`：领域数据转模型文本；共享对象按值展开，只拒绝祖先循环。
- `parseSimpleSheet(text, options?)`：文本转领域数据；无 JSON 文本回退，不自行修补。
- `renderModelMaterial(value, options?)`：同一规范的只读材料，不要求调用方重新解析输入；宿主可另带本地 `typedInput`。
- `simpleSheetInstructions()`：供任务提示词使用的完整填表规则。
- 根对象【结果】、根列表【结果·列表】、根标量【结果·值】。复杂值引用唯一子表；空对象／空列表直接写〈对象〉／〈列表〉。旧显式空子表仍可解析。
- 数字、布尔、null、undefined 使用显式标记；空文字、未列出的字段、明确缺失、空容器互不混同。普通文本 `0`、`false`、`null` 不推断类型。
- 多行块保留首尾空行和缩进；CR、制表符、控制字符走显式转义文本。物理传输 CRLF 规范为 LF，原数据 CR 必须显式转义。
- 任意安全字段名可转义，包括空名、冒号、反斜线和控制字符。所有层拒绝 `__proto__`、`prototype`、`constructor`。
- 拒绝重复字段／组／行、行号缺口、缺少引用、共享引用、循环引用、孤儿组、非法标记。拒绝函数、Symbol、BigInt、非有限数、Date／Map／Set、访问器、非枚举字段和稀疏列表；列表缺失项须显式 undefined。
- 默认上限：深度 64、字段 20,000、字符 2,000,000、表组 10,000。领域 ACL、版本、冲突及精确来源校验仍由原消费者负责，codec 不放宽它们。

验证：`tests/simple-sheet.test.js` 15 项，包括 200 个确定性混合树往返样本；模型材料、原生快照另有真实边界测试。不是实际模型正确率或 token 基准。

## 实测字符量

同一 `defaultRegistry()`，紧凑 JSON 无美化、Unicode 码点字符数、UTF-8 字节数：

| 编码 | 字符 | 字节 | 表组 |
| --- | ---: | ---: | ---: |
| 原紧凑 JSON | 23,047 | 24,953 | 不适用 |
| 第一版所有空容器也建表 | 32,775 | 52,025 | 658 |
| 当前空容器直接类型格 | 32,551 | 51,609 | 642 |

本样本简表仍明显更长。目标是减少括号、引号、逗号和嵌套 JSON 的生成负担，不能据此声称省 token、降低延迟或减少模型格式错误。不能为缩字删除 ACL、来源片段、expected revision 或原文。

## 真实边界扫尾

已核查并修正：

- `tables/persona.js` 的 personaDefinition 原先将身份对象 stringify 后拼进模型材料；现使用简表。新建 persona 的复杂属性也展开简表，既有人设原文不重写。
- `config/workflow.js` 的纯正文 `@OUT` 约束原先 stringify；现改简表，`@LANG @OUT.language` 引用同一语言定义，避免重复注入。
- `config/native-mvu.js` 的非桥接原生 `status_current_variables` 只读快照改简表。桥接主文不再额外注入整份原生快照，实际状态由已激活且获准读取的表单资料提供，防止绕过字段条件和权限。完整快照的本地 stateDigest／读取核验、MVU 输出 JSONPatch 和原卡规则原文保持。
- `tables/service.js` 的 core bundle 适配目标字符串发现嵌套 stringify，已交 task owner 并获已改为 renderModelMaterial 的反馈。
- 其他 owner 分别负责 11 TABLE 任务、host/envelope/tool 输入输出、foundation 复杂格、主输出 PIPES。该列表不替代他们的集成测试报告。

明确保留、不能仅凭搜索词判为遗漏：

- `tables/books.js`、archive-book-entries：禁自动注入的内部数据及分层持久投影，内容有精确回读校验。
- HTTP 请求体、工具调用的供应商传输壳、持久化、备份、日志、fingerprint、版本比较及 schema 验证内部 JSON。
- 用户原文、角色卡或世界书原文里现有 JSON／脚本是来源证据，不改写；原文可能作为简表多行内容被原样携带。
- `config/native-mvu.js`、native-mvu-wire／native-bridge 的外部 vars、JSONPatch 及 extra 显示组件协议。输出协议由原卡／原生执行器拥有。
- `tables/vectors.js` 的索引 text 属 embedding 输入和重建缓存，不是要求生成模型输出的结构协议。当前保留；改它会改变索引 hash 并触发重建，可能额外付费，不能借迁移无提示重建。
- `tables/foundation-intake.js` 的 catalog JSON 字符串是本地模板一致性凭证，不是直接模型输出格式。

## 用户选定的两阶段目标（尚未接线）

普通成功回合：A 一次生成前辅助请求；B 一次正文请求。不存在“共用 endpoint 就算一次”的口径。初始化、用户手动校对、显式独立任务、用户主动重试分别计数。

A 请求前只在本地完成来源选择、关键词检索、授权裁剪、模板展开、确定性运算和已有档案工具读取。把待归档的**已确认**历史前缀、世界时钟／待办窗口、静态档案／实时快照／历史记录及可用本地工具资料一起提供。单次 A 回复分任务子表：按源顺序历史归档提案、静态增量、当前快照变化、到期世界推演、需要用户确认的项目。不得把当前尚未生成或未确认的 assistant 写入历史。

A 本地处理按现有规则验证每一子任务与 ACL、expected revision、证据。先 prepare 所有业务变更；原生桥仍交 MVU 本地解析并保留 before／after／actual outcome journal。原生实际结果就绪后才形成 B 材料。不得因“提案已经返回”就声称原生写回成功。需要多存储写入时沿用可恢复 journal；部分写入不发 B，允许本地继续提交，不重跑随机判定或模型。

B 提供已落定 A 回执、当前用户输入、当前世界约束、已确认偏好和本轮授权；一次产出个性化正文及可验证的偏好候选。偏好候选只写用户明示证据、候选字段、范围、来源和简短适用说明，不输出私有思维链。它可影响本轮短控制，但长期偏好仍须既有授权／证据门槛；不把角色对白、模型自写喜好当用户偏好。

B 完成只缓存当前候选的待确认信息。下轮用户接受的历史前缀才成为 A 的归档源。swipe／重骰只替换未确认候选，不增加历史 commit；切换聊天、分支或已确认来源变化必须撤销过期 staging，并保留既有审计。

## 接线门槛与顺序

1. 建立 generation-scoped 请求账本：request ID、stage、任务集合、源前缀 digest、world/chat/branch、origin/session revision、实际模型发送次数。所有真实 fetch/send 使用同一计数口，不能仅计 service.invoke。
2. 从 service 的 archiveLoaded/progressLoaded/assemble 中提取纯 input builder 和纯 proposal validator，保留原入口以兼容旧设置。不能通过关 archive/offstage/preferences 假装合并。
3. A 的单次 envelope 复用既有领域提案；本地检索和工具读取零模型调用。若需要模型挑工具后再次续答，必须由用户显式开启并展示增加的请求，不能仍称严格两次。
4. tools 的单字符串 sheet 参数只简化模型语法，不减少往返次数。向量 embedding、模型重排、抗截断续写也必须单列；默认关键词可保持零额外模型调用。
5. A 在发出前核验 confirmed floor 与分支，返回后和持久提交前再核验。B 前使用提交后的最新版本；B 返回后检查 generation ID、用户输入及候选身份。
6. 格式错误、缺任务、坏引用、ACL 冲突或源漂移明确失败且不自动补模型请求。完整 A 提案未通过前不写业务档案；部分原生写回只走 journal 恢复。
7. 默认“两阶段联合”与显式“独立任务”是唯一设置入口的可见选择；旧保存过的独立选项不能默默跳过。初始化和规则校对可复用 codec，但不计为普通回合 A/B。
8. 必测真实调用数：无待归档源、单已确认源、多积压源、已处理幂等、swipe、重骰、分支、源编辑、角色切换、A 格式错、原生结果与提案不同、提交失败恢复、B 取消、偏好候选证据不足、显式独立工具续答。

完成这些集成和实测后，才可把默认“两次请求”写成已实现事实。当前文档不代表 APK、真实站点或真实大卡已重新验收。
