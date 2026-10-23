# 正文故事资料与机读字段边界：窄只读审计

审计对象：`table-intake-w9/integration`，2026-10-23 窗口 9。只读；无源码修改。用户最新要求是：正文 AI 只接收叙事所需资料，插件可直接处理的公式原理、条件程序、字段类型、内部 ID 不应混入正文资料。

## 确证：plan basis 不能当作自然语言原样投射

`tables/task-sheet.js` 的 phase=plan 正式范例允许 `basis:['实际来源编号或用户依据原句']`；`validatePlanProposal` 只验证它是文本列表。因此 basis 是混合引用字段，不是保证可读的叙事依据，也不是“无画风基点/原点条目”的专用术语。

本轮最小复现使用合法 basis `['row:INTERNAL-RECORD-ID']`：真实 validator 接受，经 `storyMaterial` → trusted `narrativeSlot` → English `buildMessages` 后，最终正文请求出现：

```text
<NarrativeAgenda>
本轮叙事目标：询问守门人
可采用的进展：等待回答
成立条件：对方愿意回答
依据：row:INTERNAL-RECORD-ID
</NarrativeAgenda>
```

完整实测输出在 `narrative-machine-boundary-repro.json`。这是上一切片为“全字段消费”增加原样投射所带来的新问题。根代理已明确决定撤回 basis 直出，保留结构校验及 typed slot 内部数据，测试改为内部 basis 不进入正文。

建议后续若需要可读依据：由插件按精确已知 ID 与本轮已选、获准记录解析引用，再投射必要的名称/已知事实；直接原文证据必须有明确来源类型。无法分类的引用留内部，不正则猜 ID，不以全文删串修补。机读字段得到插件校验就是消费，不要求给正文模型再看一遍。

## 确证：动态偏好已匹配后仍泄露作用域 IDs

`storyPreferences` 对确认行调用通用 `storyRecord`，后者遍历整个 values。作用域的 persona/card/world/chat 是文本列表，不是 schema ref，因此不会转换为人物名称。并行审计经 trusted slot → English `buildMessages` 已复现最终消息含 `persona:SECRET`、`avatar-internal.png`、`world:SECRET`、`chat:SECRET`，以及置信度、启用字段。

service 在调用渲染之前已做 preferenceMatches，故正文不需要再执行这些身份匹配。建议偏好使用声明式专用可读字段投射：内容、强度、例外及确有表达作用的类别/标签/倾向；作用域 IDs、启用、置信度、修订元数据留插件。场合适用条件需由已有条件引擎决定是否选中，不能把机读条件程序扔给正文重新判定。本轮根代理决定只报告，下一切片修复。

## 条件性风险：原生开放容器被通用递归渲染

`storyContext` 对 nativeState.values 中的已选原生值调用 `storyValue`。若该映射值是包括 formula/condition/path 的开放对象，渲染器会遍历这些内部成员；并行审计已复现 `op:add`、`args` 和内部路径文本进入最终故事资料。

此项不能表述为“所有公式都泄露”：前提是技术树本身已被放进所选的原生值或其他开放值容器。建议按明确叙事字段绑定/结构定义投射已结算值，保持文本内容原样；不要递归按单词 formula/path 等删键，因为故事中同名普通字段可能合法。

## 已有正确边界与保留内容

- 正常 registry 字段定义没有被 `storyRecord` 直接遍历。实测 schema 带 `formula:{op:'add',args:[2,3]}`、`type:'number'`、capture/include 时，经过 derive 后正文只得到 `总价：5`，不含这些定义。见同一复现 JSON。
- 注册为 ref/refs 的对象关联由给定名字表解析；未知引用输出可读缺口，access.knowers 输出已知情人物而非内部 ID。
- 已确认时间、地点、伤势/数值结果、人物知情边界、未发生节拍的成立条件、待办期限、用户可选行动属于叙事必要事实或限制，应保留。
- storyContext 对条件结果选择 text/narrative/summary，而不是把 condition plan 的 bindings、basis、ruleSource 整树发送；不应将这些已成功筛选的结果与开放容器风险混为一谈。
- 原生引用路径已有显式排除，但不等于所有任意深层技术对象均已被分类。

本轮未做全量字段迁移、世界书改写、正则清洗或新增渲染授权。没有活模型或真实宿主验收声明。根代理决定的安全小改仅为撤回新加 basis 原样投射；已有偏好与原生开放容器边界另列后续。

补充下一切片检查项：`tables/state-form.js:86` 的 growth 摘要提供 `{name:r.action,status:r.status}`，status 可为 ready/unknown/unmatched；当前 `storyContext` 会将它通用渲染为“成长变化”，放在“已确认变化”块内。应声明式区分真实已结算成长结果、待定和未匹配，避免把执行枚举泄露或把无匹配称为已变化。本轮只记录，没有修改。
