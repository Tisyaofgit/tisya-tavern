# 实际请求次数与默认单请求合并审计

审计时间：2026-10-22。源码：`settings-ui-work`，HEAD `cbbd4f1fa5618ec777a65c911ae8f910fd2b7d02`。本报告只读审计产品源码；未发出外网模型请求，未更改产品开关或实现。行号以本次读取为准，其他 UI 工作可能移动行号。

**最新用户纠正：默认目标为两阶段、通常两次请求，先设计与预设 TXT 审阅，不继续实现新的调用模式。** 下文当前次数审计仍有效；原单主请求方案仅作已撤回的研究记录，不是当前目标。审计后短暂新增的 round 协议模块、测试、展示接线均已精确撤回，产品源码没有保留本审计代理的修改。

## 结论

当前还不是“默认一个主聊天请求同时完成所有工作”。启用表单后的健康稳态通常是 **1 次上一条已确认回复归档 + 1 次主聊天 = 2 次**。表单未开启时是主聊天 1 次，但这不能作为“全功能已单请求”的实现结果。默认只开启自动归档；世界场外推演、剧情预案、自动偏好分析、独立对象建档都默认关闭。不能把全部附加功能或异常补读的最坏次数当作普通每轮次数。

目前已实现的是 **记忆归档与原生变量提案合为同一次 `tableArchive`**，不再为同一正常楼层独立调用 `nativeFill`。复用主连接仍会发独立 HTTP 请求；改 connection/model 继承规则不能减少请求次数。

## 当前默认次数表

以下统计健康路径的模型生成请求，默认抗截断 transport=off、关键词检索、无工具循环、无格式修复、无旧楼层积压；不把世界书读写、MVU 本地回调、校验、UI 刷新算作模型请求。

| 操作/情形 | 主聊天 | 附加生成 | 合计 | 说明 |
|---|---:|---:|---:|---|
| 出厂状态，表单未开启 | 1 | 0 | 1 | `enabled=false`，不是表单全流程 |
| 表单已开启，尚无待确认归档来源 | 1 | 0 | 1 | 第一轮或所有确认楼层已经入档 |
| 表单已开启，用户继续，刚确认上一条 AI 回复 | 1 | 1 | 2 | 默认 `archive=true`，每个新确认 AI 来源一请求 |
| 同上，开启 nativeBridge | 1 | 1 | 2 | 同一归档包含业务与变量提案；本地 MVU 结算不另调模型 |
| 普通尾楼重骰，无积压，无额外功能 | 1 | 0 | 1 | 当前尾楼仍未确认，不归档当前候选 |
| 新卡完整初始化（新校对 + 模板） | 0 | 2 | 2 | 两个不同阶段，中间存在用户规则选择 |
| 原卡校对已有有效缓存，生成初始化模板 | 0 | 1 | 1 | 多次 reviewCardRules 调用命中指纹缓存 |
| 规则选择、保存初始化草稿、建立空存储 | 0 | 0 | 0 | 本地验证/存储操作 |
| 手动“重新校对并重选” | 0 | 1 | 1 | `force:true` |
| 通用空表/复用模板初始化 | 0 | 0 | 0 | 没有 templateInit 模型调用 |

默认证据：`tables/schema.js:133` `TABLE_SETTINGS`：`enabled:false, archive:true, plot:false, preferences:false, offstage:false, nativeBridge:false, objectsSeparate:false, retrieval:'keywords'`。`config/core.js:49–58` `resolveRoute` 默认 `connection:'native',transport:'off'`。`tables/prompts.js:68` 辅助任务 `inheritMain:true`。`config/host.js:119–168` 每次 request 独立构建消息并 fetch `/api/backends/chat-completions/generate`。

## 额外功能的真实触发条件

| 功能 | 出厂默认 | 一次健康触发增加 | 真实触发/时序 |
|---|---|---:|---|
| tableArchive | 随表单开启，archive=true | 每个新确认 AI 来源 +1 | 用户后续输入确认之前 AI 楼层，且该来源未完成归档 |
| objectsSeparate | 关 | 每个待归档楼层 +1 | 先 objectArchive 提案，再 tableArchive；同一最终提交，不是后台免费整理 |
| nativeBridge | 关 | 正常 +0 | 在同一次 tableArchive 中带 native_cells，程序执行一次 MVU 并读取实际值 |
| offstage | 关 | 每个可结算的新时间窗口 +1 | archive 后，时间已前进、有玩家控制对象、非重复 progression key；并非每次发送都触发 |
| plot | 关 | 每次 prepare +1 | assemble 中 phase:'plan'；包括符合 prepare 的重骰，且没有计划缓存 |
| preferences | 关 | 每个尚未分析的最新 user 来源 +1 | assemble 中在 plot 前调用；同一 source 已有候选（包括 empty）则跳过 |
| ruleReview | 非每轮开关 | 缓存未命中/force +1 | 手动校对或角色卡初始化前；每轮只读取已选规则版本，无模型复核 |
| review() / scan() / inspect() | 只读 | +0 | 读本地存档、投影状态；不要因函数叫 review 就算成 API |
| 独立归档草案审核 | 手动路径 | 不固定 | openArchiveProposal 可用受控工具多轮；不是默认自动归档路径 |
| 手动历史偏好分析 | 手动路径 | 每个未分析 user 来源 +1 | 批量默认 limit=10，不是一次处理十楼 |

`recordRevisionFeedback` 服务方法在 `remember && direction.trim()` 时会额外分析一次，但当前 `index.js:141` 的重骰回调接的是 `communication.recordFeedback`；后者只保存反馈（`communication.js:80`）。所以不能把服务中存在的反馈分析算作普通重骰的实际自动调用。

## 当前执行链与重复检查

1. `index.js:763` GENERATION_AFTER_COMMANDS：ensureInitialized → syncNative → communication.beginNative → configHost.before。ensureInitialized 建立书/存档，无 LLM；syncNative 在 nativeBridge 开启且存在确认楼层时执行统一归档。
2. `index.js:126` tisyaHistoryInput → `tables/service.js:439–441` prepare：load(type) → archiveLoaded → progressLoaded → assemble。assemble 顺序是 preferenceAnalysis → 检索组装 → plotAdvance phase:plan。
3. `index.js:763` GENERATION_ENDED：成功生成后又调用 archive。正常情况下此前确认的来源已入档，最新 AI 回复还没有后续 user 确认，因此这次是零请求。不能看到调用了三次 archive/sync 就直接乘三。
4. 重骰结束 `revision.js:99` 也可能 archive，仍受来源确认和已入档去重。`tables/ledger.js:4–15` swipe 读取时排除尾部 AI，来源 key 包含 parent、正文、candidate；`project` 仅投影当前来源链，避免其他候选事实混入。
5. 非 native 的归档若失败/部分 pending，会写未完成提交并暂停后续楼层；主聊天可能继续，GENERATION_ENDED 的再次 archive 会再次尝试未完成来源。这是失败路径额外请求，不是健康稳态次数。native 统一归档失败则当前 prepare/发送可能被阻止。

源码：`tables/service.js:128–161` archiveLoaded；`179–260` archiveNativeLoaded/finishArchiveNative；`279–286` progressLoaded；`389–416` 偏好与计划；`439–441` prepare；`464–477` review/scan/archive。

## 异常、补读和批量：必须单列的增量

- `archiveProposal`（service:107–117）遇 needsRows 或修改未读全记录时会补读后再调用模型，最多 8 次补读（首请求之外）；重复要求已提供记录会拒绝，不能偷偷猜。
- 非 native 独立对象提案校验失败可再发一次 objectArchive 修复；历史/统一归档提案校验失败可再发一次修复；修复也经过 archiveProposal 补读循环。普通路径不触发这些请求。
- 未 native 的提交可保存有效独立项并保留 pending；native 统一归档不接受 unresolved pending 后继续变量结算。
- 旧历史有 N 个待归档已确认 AI 来源时，通常增加 N 次；开启对象拆分则再增加 N 次。它是顺序逐楼处理，不是单个批量模型请求。UI “保存模板并开始补录”默认首批 limit=10，故可能在初始化两次之后继续最多十楼的归档请求（未含修复）。
- 初始化 `autoInitialize` 和 `cardTemplate` 都会调用 reviewCardRules，但 service:68 的 fingerprint 缓存避免重复模型调用。模板对象重名时 `repairInitializationNames`（service:532–540）另加一次 templateInit 重命名修复。
- 受控工具循环只在 tableAssistant 支持 function calling，或显式 archiveToolSession 时进入 host:125–163。通常自动归档没有 archiveToolSession。
- 外部自定义执行器、主动启用的向量 API、主动开启 transport 验证/续传、原卡其他脚本自身请求不在上述默认表内；需要各自计数。当前默认不能据此推断存在额外请求。

## 最新采用的两阶段设计建议（待文档审阅，未实现）

阶段 A：生成前一次联合维护。按已确认来源处理上一轮归档、静态图鉴增量、当前快照与已过去时间窗口的世界推演。静态图鉴保留常态资料，快照保留实时值，历史只记已发生事件。档案本地检索、引用闭包与读库由程序完成，零模型 API；若允许模型调用工具后继续询问，物理请求会超过一次，须明确列为用户可选的深度调取，不能算作默认两次。

A 完成后先做本地校验、原 MVU 结算和实际值回执、幂等写入；成功后才进入 B。阶段 B：主回复一次，将已确认用户偏好和当轮要求用于个性化正文；同次只返回可审查的结构化偏好候选和简短当轮写作控制，不展示私有思维链，未确认候选不自动升级为全局要求。当前新正文仍未确认，不能在 B 结束时入历史或正式快照；下次 user 继续才进入下一轮 A。

两阶段是逻辑流程，不应强制无任务时烧一次 API：没有新确认来源、没有可推进时间窗口时 A 可只做本地读取，此时总共一次主请求。swipe 不确认旧尾楼，分支仍绑定来源链。格式失败应可见，不暗发第三次修复请求；独立任务、历史批量、初始化规则校对与模板之间的用户选择、模型工具续调等另外清楚计数。已有源码健康稳态恰好也是归档一加正文一，但世界推演、剧情预案、偏好分析各自启用后仍分别增加请求，不能把当前两次误称全部功能已融合。

## 已撤回的单主请求研究方案（不是当前目标；未保留实现）

不要把 archive/plot/preferences/offstage 全关来得到“1 次”。应增加明确的执行策略 `合并到主回复（默认） / 独立任务（用户主动启用）`，保留各功能的语义开关与手动修复能力；endpoint/model 选择属于独立路由设置，不等于执行策略。

主请求一次返回有顺序的事务封套，正文继续沿用现有 reply/body/extra/vars 格式，机器结果单独带版本化结果块。建议最小职责为：

1. `confirmedArchive`：只处理本轮开始时已经确认的上一条/待补来源，带 source key、parent、candidate、原文、基线 registry/session revision 与 expected row rev。把原先 objectsSeparate 默认工作的逻辑并入同一批对象/事实/历史/快照变更，native 仍引用同一提案通道。
2. `worldAdvance`：在 confirmedArchive 的临时投影上计算已经过去的时间窗口，保持现有玩家/场内对象排除、依据版本与知识边界。只结算过去窗口；对当前正文未来的计划仍是计划。
3. `preferenceDrafts` 与 `plan`：同一次请求产出偏好候选和本轮写作方案。偏好候选仍待用户确认，不能在该回复里擅自升级成已确认要求；既有已确认偏好照常注入。
4. `body` 与 `pendingCurrent`：正文基于上述临时投影；本轮新发生结果/变量变更只是绑定当前候选的待确认结果，不能因模型生成成功就变成当前存档事实。若这一部分作为下轮归档缓存使用，仍须以后续 user 确认为提交条件。

程序无需另问模型，应按固定顺序对各阶段校验并构建临时 view，复用 prepareCommit/validateWorldProposal/偏好候选验证/原生 journal。分阶段提交仍保留 kind、source、depends、evidence，不能把所有来源塞进一个 source 的大 changes 数组。别把方案与本轮候选当作既定上一轮的证据。

### 无法省略的适配边界

- **来源确认**：普通下一轮 user 才确认前一 AI。swipe 不确认旧候选；分支使用分支自己的基线，不能复制全局“最后处理楼层”标记。pendingCurrent 必须键控到准确 source/candidate/parent 和 chat/world，不可只存 floor。
- **提交失败**：先保存带幂等 id 的整份已验证事务意图，再提交分阶段结果。重试从意图恢复，不默认再请求模型；历史已写但下一阶段失败要能够明确恢复，不能再次随机演算。
- **原生实际值**：原 MVU 的回调可能产生模型不知道的派生值或拒绝操作。一次响应若同时先提出上一轮 MVU 改动、又按预期值写本轮正文，会存在“正文依据并非实际快照”的风险。必须复用现有 nativeIntents/parsedNative 记录与实际回执；拒绝或会影响正文的偏差时，整轮保留待处理，禁止自动声称一请求全成功。
- **稳态更省的兼容路径**：每次主回复同时保存本候选的 pendingCurrent；下一轮确认时先在本地验证并结算该缓存（含原 MVU 实际回执），成功后发唯一主请求。这样主正文能看到真实已结算前值，避免事后猜快照。对旧消息/用户改写导致缓存缺失的来源，可以在新主请求中补提 confirmedArchive；有原生回调依赖而不能安全合并时应显式提示修复/重算，不能暗发第二请求。旧历史一次性补录也应单列，不包装成每轮额外默认。
- **上下文补读**：当前需要 needsRows 才能修改薄引用。单请求模式需在发送前确定性补齐相关行及引用闭包；不能丢掉授权检查以保证一次，也不能缺资料时自动无限续调。数据不足应留下具体待处理项，用户可手动独立补读/修复。
- **流式显示**：正文可以流式预览，但事务完成前标为候选；校验/提交成功状态必须单独显示。不能流式时就写入永久 snapshot 或让原脚本读到半截机器块。
- **规则校对与初始化**：新卡的“校对 → 用户选择 → 模板”有真实的人类决策边界，通常保留两个请求才忠实于用户选择。可做一次“规则候选 + 条件模板草稿”的预生成，但选择不同优化方案后未必还能直接保存原模板；不要宣传初始化必定一请求。

## 建议验收口径

必须用实际 `fetch`/主请求出站计数验证，而不只统计 task 数或 connection 引用。最少覆盖：普通稳态 1 次；重骰每候选 1 次且无事实提前提交；两条候选切换；branch；已确认前楼缓存恢复；缺旧缓存；MVU 回调拒绝/派生值；世界书提交失败后恢复不二次随机结算；偏好未确认不生效；选择独立任务后清楚显示新增请求。直到这些完成，只能称“请求合并方案已审计”，不能称“默认单请求已经可用”。
