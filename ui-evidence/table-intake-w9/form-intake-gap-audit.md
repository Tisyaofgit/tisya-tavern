# 表单极简填表接入：第 9 窗口缺口审计

审计基线：`settings-ui-work` / `e598a0a08d8f3acb3ab690bdab7db3fb21f6b2ba`，等价已发布远端 `f9aa59aaac2214ea5db99a340c6ffa626c60772c`。审计日期：2026-10-23 UTC。

结论：极简填表的公共编码、辅助预设、实际请求和领域提交主链已接，不能将本轮描述为“从 JSON 重做表单”。当前真实缺口分成两类：少数已有简表字段在消费边界漏接，以及尚未实施的联合调用、七类场合偏好、世界书逐条替代等设计迁移。第一实施切片选为 `plotAdvance phase=plan` 完整接收、验证和投射，保持既有存档与任务授权。

## 本轮已证实的问题（按严重度）

### P1-A：合法值成功保存后变形，尚未修复

`tables/simple-sheet.js` 明确支持自有 `undefined`、数组内显式缺失以及 `-0`；`parseTableTaskResponse` → `prepareCommit` 保留这些值。然而默认模板的 `scene.标志` 开放对象接受：

```text
{ declared: undefined, items: [undefined], negzero: -0 }
```

实际通过 `createBookGateway.write` 成功保存后回读为：

```text
{ items: [null], negzero: 0 }
```

证据链：`tables/schema.js` 的开放 object / json 校验没有递归检查持久可表达性；`tables/books.js:24–26` 使用 `JSON.stringify`，且保存验证对照的是已序列化结果，故成功并不证明原值无损。此处是持久化边界，绝非共享简表解析器丢字段。

完整代码、格式约定证据、内存宿主复现及 43 项定向验证见同目录 `simple-sheet-parser-review.md`。未写真实宿主世界书。

建议后续独立切片：提交前递归检查既有存储格式能否无损表示候选值，不能表示则带字段路径显式拒绝；不得将缺失偷转 null，不应本轮擅自更换存储编码、schema 或已有存档语义。根代理明确要求本轮只报告此项。

### P1-B：plan 简表的 due / clues 成功返回后不进入正文（本轮修复切片）

明确契约：

- `tables/progression-prompt.js` 的 PLAN 输出要求 `goal, beats, pendingChoices, due, clues, constraints`，后四者均为文本列表。
- `tables/task-sheet.js` 的 plan 正式范例包含 `due` 和 `clues`。
- 基线 `tables/service.js:429` 仅检查 goal/beats/pendingChoices/constraints；due/clues 缺失、错型也接受。
- 基线 `tables/story-material.js` 的 legacy 和 dossier 两个投射均只渲染 goal/beats/pendingChoices/constraints，没有 due/clues。
- trusted `narrativeSlot` 仅将自然语言投射发给正文，因此 slots 内保留 typed 值并不等于最终模型收到它。

生产路径复现：沿用 `tests/tables.test.js` 的真实 service/book 网关 fixture，经过 `formatSimpleSheet` → `parseTableTaskResponse` → `service.prepare()`，返回 `due:['AUDIT_DUE_ONLY']`、`clues:['AUDIT_CLUE_ONLY']`。结果 `slots.plan` 内二者存在，最终 `result.text` 对两者均为 false，而 goal/choice 存在。再将 due 改成对象、clues 改成 42，prepare 仍成功。原始复现脚本：`reproduce-plan-gap.mjs`。

本轮最小修改位于隔离工作树 `wiring-worktrees/plan-sheet-w9`，分支 `candidate/plan-sheet-w9-20261023`：

1. `validatePlanProposal` 验证所有已登记计划字段；due/clues 必须存在且为文本列表，不接受 0/false/null、字符串冒充列表或错误项。
2. 复用同一计划投射函数，旧布局和 dossier 都接收 due/clues；节拍的 basis 来源依据也进入其对应节拍，区别于模型私有推理。goal、proposal、basis、condition、pendingChoices、due、clues、constraints 均有消费路径。
3. 英文主预设的 plan 槽提供真正的 dossier 投射，落到 `NarrativeAgenda`；到期事项与线索仍明确为未发生候选，不授予人物知情或写入历史。
4. 生产 prepare 到 `config/host.js:buildMessages` 的真实接线回归；失败时清除旧计划、展示错误。测试关闭了 archive/offstage，证明计划本身不写事实，不能据此声称整次 prepare 提供事务回滚：默认调用在计划之前仍可能已经完成合法归档/场外提交。

不合并 archive/world/plan；不把 plan 输出当事实；不新增存档层；不改变归档审核工具完成契约。根代理负责整合后统一重建生成运行包。

## 已接入链条

| 环节 | 实际状态与证据 |
| --- | --- |
| 编解码 | `tables/simple-sheet.js` 保留嵌套类型、显式空值、0/false、多行文本；重复字段/编号、缺失/孤立子表、尾随非结构文本均显式报错。 |
| 输出解析 | `tables/service.js:49–53` 的文本输出仅用专用校对表或 `parseSimpleSheet`；无旧 JSON 文本降级。内部受信执行器仍可返回已类型化对象。 |
| 请求输入 | service 使用 `renderModelMaterial(typedInput)`，同时隔离传递 typedInput；`config/host.js` 的自定义执行器标记 `tisya.simple-sheet/1`。 |
| 辅助预设 | `tables/modes.js`、`task-profiles.js`、`paired-preset.js` 与 `task-sheet.js` 为 11 类任务生成各自授权、输入路由、简表交付；不是把叙事输出骨架强塞给归档。 |
| 材料路由 | `tables/slots.js` 发送来源/卡/书/历史/状态/偏好/工具等独立槽；未识别输入字段由 additionalInput 保留。当前同源历史压缩仍保留来源和证据边界。 |
| 提交校验 | `prepareCommit` 检查字段、版本、引用、证据和知情；原生变量继续依原 MVU 回读结果，正文不二次写变量。 |
| 状态与归档 | 当前状态、事务、关系等表保有各自业务所有者；对象 dossier 按稳定 owner ID 组合 Basics / ToNarrate；事件归档独立，不靠生成新 memory/status 块。 |
| 确认偏好 | 候选先存在 preferenceDrafts；确认后的启用项才进入资料；persona/card/world/chat 精确身份匹配已存在。 |
| 网络完成验证 | 正常 host → `readTaskResponse` 拒绝 length/MAX_TOKENS 等截断；新执行器不能绕过此层直接把原始未完成 envelope 交给 parser。 |

内部的 `JSON.stringify`、schema 中 `type:'json'`、供应商工具调用封套不等于让模型输出复杂 JSON。当前模型可见任务交付格式已经是简表；P1-A 则说明内部存储仍需单独检查类型边界。

## 已知设计尚未完整迁移

### 动态偏好仍是旧分类，七类场合触发未闭合

`tables/schema.js` preferences.类别 仍为 `用词 / NSFW题材 / SFW角色表现 / 剧情走向 / 文风 / 特定情节`；`tables/prompts.js` preferenceAnalysis 仍生成这些类别。`tables/preferences.js` 的匹配仅使用身份作用域。通用条件引擎已存在，但没有七类动态偏好与场合条件的完整登记、分析、确认、持久化、投射契约。

`config/english-preset.js` 已将固定配置分入七类 UserPreferences；这不能证明学习偏好已完成迁移。当前 `storyPreferences` 仍把确认行按自然资料形式呈现，并非按用户指定七类＋场合拓展统一组装。后续应复用条件引擎且做明确迁移，不能只改展示标题，也不能从人物行为推测用户现实敏感偏好。

### 默认联合维护调用尚未实现

当前 `prepare` 是 `archiveLoaded → progressLoaded → assemble`；archive 逐来源处理，`objectsSeparate` 可额外调用对象建档；场外 world 和未来 plan 是各自调用；preferenceAnalysis 在 assemble 内另外执行。共享主 API 配置不等于共享一次请求。

准确默认值来自 `TABLE_SETTINGS`：功能总开关 false，archive true，plot/preferences/offstage/objectsSeparate/nativeBridge 都 false。因此不能说新安装必然每轮多次 API；但把这些功能开启后，也不能声称已经实现用户要求的“两次请求各自兼做两类任务”。业务归档与授权原生值在已有 native bridge 路径中已经可共用 changes 批次，这与归档＋世界推演＋检索联合请求不是同一件事。

### 世界书、快照等剩余所有权

上轮 `runtime-wiring-status.txt` 明确保留且当前相关契约未改：激活世界书没有逐条迁移替换为对象 dossier；无法分类的来源保留在 LoreExtra；原生回执、事件/条件结果仍有独立所有者；总历史裁剪尚未全面实现。不要以当前 row 单次投射声称全语义去重，也不要在本切片关闭原条目或迁移原书。

## 验证及交付边界

- 已运行共享 codec 与生产 task parser 定向测试 19/19，通过；另 foundation/stream-response 24/24，通过。由并行只读审计执行。
- 原始 P1-B 复现与 P1-A 内存保存复现均确认；没有使用付费接口、活模型、Android APK 或用户实际会话。
- 初次完整相邻定向集合 196/196 通过；根审计指出 basis 仍需消费后已补接，最终又复核计划接线 3/3 与渲染/英文主预设 26/26，通过，结果互有重叠不可相加。未运行整仓全套，未重建生成 runtime。
- 实施提交：`9c4f0a1`，分支 `candidate/plan-sheet-w9-20261023`；仅 4 个源码/测试文件，父工作树未改。`git diff --check` 通过。
- 本切片仅闭合已登记 plan 字段；对未知额外字段维持原行为，不新增扩展消费或扩大任务授权，`changes` 继续明确禁止。
- 无 `tables/protocol.js` 或 `tables/output*.js` 并不构成缺口；实际契约在上述模块，不能按不存在的预期文件名判断功能未做。

## 中性全链示例（证据，不是新增功能）

根代理追加要求后，使用自造“林青送信到北城门”样本，执行 `neutral-intake-e2e.mjs`。链路为模拟模型返回真实简表文本 → 生产 `parseTableTaskResponse` → `prepareCommit` → 真实 `createBookGateway` 写入内存宿主 → 重新创建 service 并读取 → `projectStoryDossiers`。

结果通过：7 条记录；两个对象落 Basics，体力 0/是否进城 false/送信任务落相应人物 ToNarrate，场景落 Environment，已发生抵达事件落 History。0 与 false 经保存回读仍各自保持原类型。随后另一次 preferenceAnalysis 简表生成持续会话偏好候选，保存后重新读取仍是 pending，active preference 行为 0，prepare 不将候选注入正文。

证据文件：

- `neutral-intake-e2e.mjs`：可复跑脚本，使用本隔离工作树的生产模块。
- `neutral-intake-e2e-source.txt`：中性合成来源。
- `neutral-intake-e2e-model-sheets.txt`：历史补录及偏好分析的模拟模型原始简表。
- `neutral-intake-e2e-dossier.txt`：回读后的实际 dossier。
- `neutral-intake-e2e-result.json`：断言与所有权落点结果（开发证据内部格式，不是模型交付格式）。

没有真实模型、真实宿主、Android 或用户私有语料；不能据此宣称活接口/用户角色卡端到端已验收。
