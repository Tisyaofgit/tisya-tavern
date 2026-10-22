# 模型界面简表迁移清单

2026-10-22；候选工作区 `settings-ui-work`；审计与规则校对 codec 实施，调用次数设计仍为生成前联合维护 A、个性化正文 B 两阶段。本次迁移不等于两阶段调度已经实现。

## 已有约定与本次新增的边界

真实既有约定来自 `preview/foundation-sheet/README.md`、`tables/foundation/engine.js` 的 `plainInput/parsePlain/plainValue`、`tables/foundation/extraction.js`：分组标题、稳定行号、字段名、值；冒号可有可无；单表可省分组；普通标点原样保留；仅 texts/refs 用分号分项，未知空格与明确空列表不同；引用只在授权集合内解析。

已有简表不是全系统通用递归 codec。README 明确任意 array/map/object 仍旧结构输入，engine 的复杂值提示也明确要求 JSON。生产已接入的手动人物提炼走 foundation-service → foundation-intake → foundation/extraction → engine；动态分组只覆盖已定义人物、前史、关系、隐情。不能把已有局部通路宣称为全部辅助任务已迁移。

本次优先闭合 `ruleReview`，新增 `tables/rule-review-sheet.js`：模型仍填同样风格的简表，问题、引用、方案、改动分别展开独立子组，不含任何承载数组/对象的 JSON 单格。新增规则明确为：编号嵌套分组、数量格、两空格续行。这三项是本轮新增，不是“之前已经约定”。模型提示只写如何填写，设计出处留本文。

问题 ID、方案 ID 和内部 `tisya.rule-review-proposal/2` 结构由插件生成，随后仍调用 `validateRuleReview`。原始来源与精确行范围、作用域、重复问题、方案冲突、重叠改动等原验证继续负责；不靠简表解析成功宣称语义校对成功。

## 所有模型相关消费者与迁移状态

| 任务/边界 | 生产入口与消费者 | 当前模型载荷 | 完整迁移所需内容 | 本轮状态 |
|---|---|---|---|---|
| 原卡规则校对 ruleReview | service.reviewCardRules → invoke → rule-review.validateRuleReview / resolveLineProposal | issues/sources/options/changes JSON | 问题与三层子组、来源行范围、精确多行 after、方案冲突 | 简表 codec 已实现，同事接线与真实 service 回归 |
| 初始化 templateInit | service.cardTemplate → reconcileProposal / compatibleRegistry / saveCardTemplate | base/initial/templates/schemaChanges/notes，偶有完整 registry | 表与类型定义、递归字段定义、底档和开局来源分离、对象引用 | 未迁移，维持原明确协议 |
| 初始化名称修复 | service.repairInitializationNames | renames[{id,name}] | 只开放需改名对象的稳定行号；引用与固定 user 不变 | 未迁移，不能因 templateInit 主任务改动而漏此子形态 |
| 自动归档 tableArchive | service.archiveLoaded → archiveProposal → prepareCommit/prepareRecoverable | changes/templates/schemaChanges/pending/needsRows | 当前表动态字段、ACL、删除/unset、期望版本、证据、补读请求 | 未迁移 |
| 原生桥统一归档 | service.archiveNativeLoaded → bridgePatch → nativeIntents → finishArchiveNative | 同一归档中的 native_cells 与业务 changes | 任意原生值递归子组、路径所有权、实际回执、幂等恢复 | 未迁移，不把复杂值藏进简表一格 |
| 对象独立建档 objectArchive | service.archiveLoaded / archiveNativeLoaded → proposalView | objects/facts 与可选模板增量 | 与归档同 codec；本任务写表范围限制 | 未迁移 |
| 偏好 preferenceAnalysis | analysePreferenceSource / recordRevisionFeedback / analysePreferences → prepareCommit → preferenceDrafts → reviewPreference | preferences changes；作用域、生命周期等复合值 | 候选行、用户逐字证据、范围子表、真实性质与硬性强度、确认状态 | 未迁移；不能把 user 台词变成长久偏好 |
| 场外世界推演 plotAdvance phase=world | service.progressLoaded → progression.validateWorldProposal | window + events[{basis,actors,changes}] | 过去时间窗、演员与知识依据、事件子表、状态变更、禁止控制玩家 | 未迁移 |
| 本轮计划 plotAdvance phase=plan | service.assemble | goal/beats/basis/condition/pendingChoices/constraints | 目标/节拍子表与列表；严禁夹带 changes | 未迁移 |
| 历史补录 historyImport | archiveLoaded(range) / importHistory → saveHistory → commit | 同归档，或手写材料 proposal | 区分来源序列、未知时间、原文证据和旧状态覆盖禁止 | 未迁移 |
| 创世 tableGenesis | genesisLoaded → validateBlueprint → saveGenesis | blueprint/checklist/artifacts/workflow，含 registry/base/initial/native/stateSystem | 多层制品子表、工作流依赖、可选原生配置、状态目录文本契约 | 未迁移，范围最大 |
| 基点 assetAdapt | coreDraft / coreBundleDraft → core-assets.validateBundle / validateCoreMapping | core 或 bundle，traits/growth/links | 对象集合、成长选择、成员与关系、叙事意义证据 | 未迁移，至少两种返回形态 |
| 配置助手 tableAssistant | service.assistant → assistant.ask / prepare / apply | answer/changes[path,value,reason]/backfill/genesisGoal | 已授权配置叶路径映射、可变类型值展开、确认后写入 | 未迁移 |
| 归档助手工具 | config.host.request → tool-loop → archive-tools / archive-query / archive-proposal | 模型工具参数 JSON；最终 completion JSON | 工具参数是独立模型语法面，不能只改最终回答；查询与提案权限、预算、版本 | 未迁移；函数调用协议须单独计划 |
| 原生变量独立 nativeFill 注册任务 | tables.prompts/modes/task-profiles；正常服务已并入归档 | 原生现值 delta JSON | 不重复创建计算器；保留兼容注册与真实调用路径区分 | 未迁移，不算默认额外调用 |
| 状态目录/值/公式 | state-registry / state-form / state-formulas / state-event-rules | 部分已为有限文字语言，创世 artifacts.stateSystem 可外套 JSON | 复用既有数值/状态/公式 DSL，不另造相冲突表格语法 | 普通手动路径并非 JSON 模型任务；模型创世边界待迁移 |
| 条件与触发 | conditions / condition-rules / condition-runtime / condition-service | op/children 等递归树；部分已有条件文字语言 | and/or/not/比较/列表/引用子组，未知三值、层数与预算限制 | 未迁移；不得把树 stringify 到值格 |
| 手动人物提炼 foundation-extraction | foundation-service → foundation-intake → extraction → engine | 已有极简表，部分复杂格 JSON | 扩展剩余递归格，保持冻结目录/旧任务恢复 | 已有部分实现，不是本轮新迁移成果 |
| 通用文本任务 | task-envelope TEXT_TASKS，config.host textTaskMessages | 普通文本产物，输入 SOURCE 仍 JSON.stringify | 按任务分别决定资料展示，不能把纯文字任务误改成强制表单 | 没有“一律严格 JSON 输出”可删；输入边界待审 |

## 横向链路：改输出提示词仍不够

1. `tables/prompts.js` 各任务返回契约、`tables/modes.js` auxiliaryWire/auxiliaryEntries/taskWorkflow、`tables/task-profiles.js` 的任务阶段说明、`tables/paired-preset.js` 的运行预设生成必须一致。不要仅在提示词尾部追加“别输出 JSON”，留下 REGISTRY 与 COMMIT 的相反要求。
2. `tables/service.js:invoke` 当前集中消费 `ledger.parseJSONResponse`。每个迁移任务需明确分派自己的简表解析器，再交原业务验证器。HTTP/SSE 的 JSON 封套是传输格式，不等于模型还要写 JSON；不能把服务器响应解析一并删掉。程序内部测试对象与网络正文也不能混为一谈。
3. 输入 `tables/slots.js → materialSlots → tables/pipes.js` 已压缩 rows/registry，但 PIPES 的 ACL、meta、数组与递归字段仍使用 JSON 单格。**输出 ruleReview 简表成功不证明输入所有复杂 JSON 已清除。** 未来需来源正文完整保留，结构资料按稳定表/组号展开，实际 ID/版本映射可由宿主票据保存。
4. `config/host.js` 同时支持配套预设、自定义预设、工具模式与自定义 executor。只验证 paired preset 不代表全部路径；自定义不兼容须明确提示，不静默换格式或退回旧模型请求。
5. 文档、导出预设与构建产物应跟随真实完成的任务生成；旧历史 JSON 兼容属于读取，不应混进新生成指令。历史资料与持久世界书内部 JSON 继续保留，不因迁移模型界面而重置存档。

## 后续通用 codec 必须覆盖的语义

- 分组/字段目录由宿主确定稳定映射；模板增量需要明确申报字段组，不允许模型任意字段名直接进入现有类型。
- 不同类型保留 0、false、null、空文本、空数组、空对象、未知未提供与删除操作。文本字面 `null`、`false`、`[]`、分号、冒号、换行及带缩进代码不得被强制转型或分项。
- 数组完整替换/对象子字段增量/显式 unset 语义分别表达；数组对象和 map 嵌套必须真正展开子表。声明数量只用于完整性校验，不自动创造未知记录。
- ACL 的 readers/knowers 不可混合，空 ACL 不等于公开，未提供 ACL 不等于空 ACL。对象父绑定与一般关联不赋予知情，引用要保留明确授权集合。
- 递归条件保持 and/or/not 与逻辑优先级；复杂树不能简化成含混自然语言后宣称逐值等价。状态本地公式仍由已有受限语言解释，不执行任意脚本。
- 每任务解析结果继续走原 evidence/revision/type/reference/ownership/overlap 校验；同批失败不部分悄悄写入。模式错误不得自动调用模型修复以隐藏实际次数。

## 本轮规则校对验证与限制

已实现接口：`parseRuleReviewSheet(raw)`、`ruleReviewSheetInstructions()`、`formatRuleReviewSheet(proposal)`。规则审查不含 ACL 和任意类型值，所以该 codec 不声称已验证全表的 boolean/null/map/ACL 通用迁移。字符串里的 0、false、null、[] 保持字面；数量与行号独立校验。

测试覆盖：无问题、一个问题、无优化方案、多个分组、冒号可选、文本围栏、动态列表完整性、错误数量、重复/缺失字段、未知来源、原范围越界、重叠改动、假 JSON 包壳、续行中的标题和数字样例、首尾空格/tab/空行、多行修改后原文。新增续行规范将换行统一为 LF；来源 before 仍由原始资料按精确行号切片，不修改来源字节。

这只是程序语法与原校验器回归，未做真实模型成功率、延迟、token 或 Android 端到端测试。同事负责调用装配与 reviewCardRules 存档测试，结果以其报告为准。

## 同内容长度测量

证据位于 `rule-sheet-comparison/`，每个样本均保留最小 JSON 与实际简表全文，并验证 `parse(format(proposal))` 与原提案逐值完全一致。字符统计使用 Unicode code point；字节使用 UTF-8；均不是 token。

| 同一提案 | JSON 字符 | 简表字符 | JSON UTF-8 字节 | 简表 UTF-8 字节 | JSON 重复键次数 | 简表重复字段标签次数 |
|---|---:|---:|---:|---:|---:|---:|
| 0 个问题 | 53 | 13 | 53 | 31 | 0 | 0 |
| 1 问题、1 方案 | 402 | 330 | 612 | 768 | 4 | 3 |
| 1 问题、3 方案 | 824 | 724 | 1350 | 1710 | 22 | 19 |

重复次数口径是所有字段键/标签出现次数减去不同键/标签数量。简表取消模型输出的内部 format/id 键，保留所有必要问题内容和精确来源范围。后两例简表字符更少但 UTF-8 字节更多；不能据此声称 token、更快或错误率更低。目标是减少模型处理结构括号、引号、逗号与深层对象结构的负担，真实性能需另行测量。
