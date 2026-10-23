# Tisya 英文预设与实际链路审计

审计基线：`settings-ui-work`，HEAD `ce63e5a7258f9782cbde7d54cb49837404091dad`。时间：2026-10-22 UTC。

本报告区分文档、运行时缺陷和未接设计；不把已知未接线功能算成回归，也不承诺生成每回合零错。没有调用外部模型、读取用户真实聊天或写入用户存档。复现只用仓库中性示例与内存夹具。

## 1. 本阶段结论

英文主稿不能只替换提示词后直接启用：基线 parser 仍只接受旧九／十块，新增资料类别也会拒绝；必须同步接入独立七块 schema 与消费端。另发现一个与新设计无关的真实静默丢字段问题：资料结束边界被禁用时，未找到对应槽位的偏好与剧情材料会消失，而请求仍被接受。

已存在的可靠边界应保留：未知辅助输入归入 additionalInput；预算超限明确停止；工具历史无法投射时明确停止；归档部分失败保留 pending 和原稿；主聊天表单资料缺失时停止；原消息不为展示修复而重写。

## 2. 文档层：已落实与仍需准确标注

主稿已经有：独立文风／世界观／环境／玩法／额外世界书／对象／历史／工具／前端协议槽；对象 Basics/ToNarrate；资料分类路由；输出锁、格式通过与唯一发送触发；七块正文契约；状态、记忆、archive 输出块移除。分支稿明确标注世界书逐条替换和 A/B 合并调用为未接设计。

主稿允许“没有实际对象的心声方向省略”，旧 decoder 却要求显式心声行；新 schema 应直接支持主稿的合法缺省，不能偷偷重加必填项。

主稿资料类别是 `文风/世界观/环境/玩法/世界书/人物/历史/工具`，不能沿用只支持文风／人物的旧对象形状。主稿中的“实际使用资源名称”是引用，不是执行或归档回执。

“资料单次落位”是装配目标，不等于目前所有实际输入都已完成去重。尤其原生状态读回、事件结算差值与条件回执仍需分别处理，不能按相同字面删掉含不同时间或权限的信息。

## 3. 已复现的运行问题

### P0：七块不被旧 parser 接收

入口：`reader-core.js` → `reader-compat.js` → `vendor/foundation/xml-envelope.cjs:readEnvelope`。

中性复现：仓库 `examples/reply-demo.txt` 十块可读取，wire.version=5，行动数=4。只删除 status/archive/memory 得到七块后，parse、行动、心声核验、回合、extra 全部失败 `TISHA_OUTPUT_BLOCK_ORDER`；独立正文提取仍可见。证据：`pipeline-baseline-repro.json`。

`vendor/foundation/pipes-wire.cjs:decode('task')` 对世界观／环境／玩法／世界书／历史／工具六类资料均报 `TISYA_PIPES_REF`。

最低修复边界：按实际块序列识别新七块并使用独立 schema；旧九／十块继续按旧规则读；七块不伪造 status/memory/archive。固定列数、枚举、转义、必填段落、审计七类、行动范围均按新契约验证。历史原文不迁移、不重写。

### P1：禁用资料边界后静默丢槽

入口：`config/host.js:createHost.before` → `attachTableContext` → `payloadReady` → `buildMessages`。

实测最小夹具：配套可识别来源，启用 state 槽，禁用 `tisya_material_boundary_close`，附带 state/preferences/plan。payloadReady 成功，但只有 state 保留，preferences 和 plan 不在 messages，未产生错误。证据：`pipeline-slot-drop-repro.json`。

原因：`buildMessages` 只有匹配目标或遇到启用结束边界时才输出槽；循环结束没有非空未消费槽校验。边界可由原生列表关闭，不能假定永远存在。新装配应保证唯一 fallback 或显式拒绝未消费非空槽。不要默默把它们追加在 delivery trigger 后面。

### P2：归档请求仍有一份完整原回复与一份正文副本

入口：`tables/service.js:archiveLoaded`。

同一输入含 `sourceHistory[].text=source.text` 与 `archiveSource.text=archivalText(source.text)`，`taskSlots` 分别送 HISTORY 和 SOURCE。旧格式控制字段随第一份进入辅助请求，正文重复。它不是数据丢失，但仍增加费用并违背全流程去重目标。若删第一份，必须先确认它没有独立来源定位用途；原始证据继续保留在存储层。

## 4. Reader 的 memory 依赖与七块最小消费范围

| 消费处 | 基线依赖 | 新七块所需行为 |
| --- | --- | --- |
| pipes-wire.projectEnvelope | 无条件解码 status/memory | 独立七块 decoder，不填伪记录 |
| task-handoff-wire | next.audit→task.audit，actions→next.actions | 可保留旧内部展示形状，但单独验证新字段 |
| reply-formats.publicEnvelope | 仅保留 wire.version | 保留实际格式判别；不要把不存在的记录解释为损坏 |
| reply-formats.readReplyMemory | 直接 memory.trim() | 七块明确无 inline memory |
| reply-records.readJourney | 强制 memory/5 | 七块呈现真实已交付／待办或明确表单维护状态，不报格式损坏 |
| reply-details | 读 memory 异常会 pendingError | 故意缺省不得变假错误；候选／待定等实际字段有确定消费 |
| display-regex.partition | 对任何 wire JSON.parse(memory) | 按新旧格式分路 |
| reader-projection.apply | 读 memory 与 status 并屏蔽 extra | 新格式独立处理，旧消息权限保持 |

`extraAllowed(undefined)` 的旧实现返回 true。不能通过补空 memory 冒充权限已验证。根代理已确定新七块延续现有公开前端组件的呈现约定，不额外增加凭证门槛；实现应明确这是新契约的展示边界，并保留旧九／十块 memory ACL 的原有行为。组件为前端输出，不代表其原生变量已成功写入。

基础源码由 provenance hashes 保护。应使用 `reader-compat.js`、独立新 schema 或 `tools/reader-transforms.mjs` 的明确适配，随后生成 reader-core；不要手改 bundle 或任意改 vendor 后跳过 hash。

## 5. 当前未接设计，不冒称完成

- A 合并记忆归档／对象建档／世界推演／必要查询，以及 B 正文附带本次偏好判断，尚未共用输出与执行回执。现 `prepare` 顺次 archiveLoaded、progressLoaded、assemble，偏好分析／plot 仍可能独立请求。共享 API 配置不等于减少请求次数。
- 世界书原条目按实际 book/entry、覆盖范围、触发条件逐条替代尚未实现。`configureTableContinuity` 当前会整体排除 card/persona/books/entries 和 source 资源，不能把这当成已经完成逐条替换及唯一事实覆盖。
- 场合偏好分类的新用户偏好层与两个新增全局控制需要实际配置／编译接线；旧确认偏好匹配仍按实际 ID 范围执行，不是随卡名匹配。
- 无世界书的普通角色卡不需要虚构世界书。默认世界允许空 books/entries；受控有工具历史时明确报不支持。未建立表单时不能声称它已提供档案；应使用实际原卡材料槽或明确初始化缺口。
- 世界书实际激活后的对象聚合仍未完成，见下节。前端公开组件、原生状态读回、条件回执不会因新提示词存在而自动获得执行接线。

## 6. 对象档案纯投射：本轮获准实施

专属分支：`candidate/review-dossier-projection-20261023`；目录：`wiring-worktrees/dossier-projection`。

实现接口：

```js
projectStoryDossiers({ rows, selectedRows = rows, registry, userId, focusObjects, due, plot, latestTemporary })
// -> { text, placements, unassigned, external }
storyMaterial({ ...options, layout: 'dossier' }) // -> text
```

它只消费本轮已经筛选的 selectedRows，不重做检索、权限、条件，不回查 rows 中的原始完整档案，不修改存储。相同显示名保持两个对象；相同 ID 的两个候选版本明确拒绝，不选择最后一条。没有跨调用缓存。

| 行类型 | 实际归属字段 | 投射 |
| --- | --- | --- |
| objects | row.id | 对象唯一 Basics |
| state | 对象 | 同对象 ToNarrate |
| relations/cognition/activities/experiences/growth | 主体 | 同对象 ToNarrate |
| holdings | 物品 | 物品 ToNarrate，不从所有者数组选人 |
| facts | 对象，仅实际唯一 | 同对象 Basics |
| clues/tasks | 对象／负责人，仅实际唯一 | 同对象 ToNarrate |
| events | 无归属合并 | 独立 History |
| scene | 全局 | Environment |
| timers/多归属/未知表 | 不猜 | 独立材料保留一次，并返回未合并原因 |

每条被附着记录仍有自己的 readers、knowers、有效性、生效时间和来源依据；不继承主体 ACL，也不把状态值覆盖进基础字段。薄引用主体不被扩成完整档案，相关动态行继续独立保留。未知权限明确为未知。新布局分别保留 0、false、空文本、空列表、空对象、null 与未知；旧布局表达不改。

`placements` / `unassigned` 是宿主诊断，不进入模型材料，不在产品展示内部 join 原因。preferences/native_cells 明确登记为已由其它槽维护，避免伪造重复所有者。

当前未合并项的理由：

- 原生值按 actual native path 另有读回权威。不能按显示字段同名合并；遗漏的条件字段更不能从全局快照回补。
- stateEventNarrative 有实际 ownerId，可后续按权限和事件时点关联；其 before→after 是本次结算差异，不等于当前快照重复。
- conditionNarrative 只有 ruleId/text/access，无明确 object owner；不从自然语言猜归属。
- worldbookEntries 每行单独生成，再由 activated 选中。提前按候选全集聚合会把未激活内容带入；必须在实际激活集合后合并，当前保持原行为。

英文装配代理负责调用接线：推荐在 service 已有 registry/userId/focus 的投射点准备可信 alternative，通过 slots 的 WeakMap 保存并让新 edition 选择。不要在 host 拆分旧中文 prose 或从未筛选 raw view 重建档案。

测试与证据：`tests/story-dossiers.test.js` 新增八项；连同 story-material 和 service integration 共 17 项通过。初始缺少新接口的原始失败与通过日志存于 `tests/evidence/dossier-projection-{baseline,validation}.txt`。覆盖同名不同 ID、跨 owner、只读、薄引用／未选主体、独立 ACL、时点、未知表、多 owner、空值种类、独立历史与分支隔离、物品归属、未知权限。本地提交：`e5c16cfc7430ebe6cc5a74a72676e024b9bda74e`，未 push；只包含投射实现、测试与日志，接线由英文装配分支负责。

## 7. 集成验收最低矩阵

1. 新普通卡、无世界书、无表单值：不虚构槽值，不退回十块输出。
2. 原九／十块示例仍读取原数据与旧权限；七块示例全部 UI 分区可读。
3. 七块八种资料类别、心声全部省略、摘要关闭、行动关闭／范围、转义文本均按新 schema 通过；多块、混排和未知列明确失败。
4. 当前消息一次；动态偏好／条件匹配一次；原卡或未覆盖世界书事实保留；非空未消费槽可见失败。
5. 两个新控制从保存、重载、切卡到实际 payload 可观测地变化，未默认迁移用户已有值。
6. 新 dossier 只合并选定 ID，旧分支／未选内容／不可知字段不重新出现。
7. 不能把本轮的七块读取与新档案表达验收说成 A/B 合并调用、逐条世界书替换、或完整跨通路语义去重已经完成。

## 8. 对七块实现分支的独立复核

已只读检查 `wiring-worktrees/seven-block` 的 `reply-form-wire.js`、适配器、reader/details/formats/records 与 UI 变更，以及新测试。独立七块 shape/enum/范围校验、实际布局判别、无心声分支与旧读法隔离符合最低边界。没有为七块合成旧 memory/status/archive；表单回合页明确指向图鉴和历史，没有伪造保存记录。原生 vars 仍只是兼容读取，不能当成变量写入回执。

一项需同步的文档语义：task.pending 的“所需澄清”可能含后台身份或秘密来源，因此根代理明确要求不直接全部公开。必须在主稿区分内部待定与需要用户回答的公开问题：后者仅经正文或 next 的公开待办传达最小必要信息，不将后台来源搬到 DOM。候选偏好的独立确认消费者仍未接，应保持原稿可查，不假装已经持久化。
