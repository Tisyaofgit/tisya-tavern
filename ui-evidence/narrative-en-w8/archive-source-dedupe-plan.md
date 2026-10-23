# 自动归档与同源楼层补录：来源正文去重只读审计

审计时间：2026-10-22T21:58:33.430672+00:00

范围：`settings-ui-work` 当前 `tables/service.js`、`tables/ledger.js`、`tables/slots.js`、`tables/paired-preset.js`、`tables/task-profiles.js`、`tables/modes.js`、`tables/prompts.js`、`config/host.js` 及相关测试。没有修改仓库、用户聊天、存档或已通过的 UI 文件，没有重跑 UI 测试。

## 结论

可以去掉自动归档／按楼层补录同一正文的第二份传输，但不能直接删 `sourceHistory.text` 而保持现有合同不变。当前源码确实有明确的“完整 HISTORY 原文”合同，且完整回复中的辅助段有独立来源信息。安全最小做法是新增一种**可无损还原的同源历史引用视图**：正文只在 SOURCE 存一份；HISTORY 保留来源元数据、原文位置及独有辅助文本，以显式引用指向 SOURCE 正文。原宿主聊天及 source key 的计算完全不变。手写历史和初始化的完整原文路径不改。

这不是两个独立证据源。归档写入校验一直只接受程序生成的正文视图和此前连续用户输入，HISTORY 原全文并不扩大可引用证据。因此传输去重不需要改变归档语义或放宽证据检查。

## 已证实的数据路径

| 环节 | 当前行为 | 去重的影响 |
|---|---|---|
| `tables/ledger.js:sources` | 对完整 `message.mes`、role、name、candidate 及 parent 计算来源 key，保存完整 text | 必须原样保留，不能先清洗再算 key |
| `tables/service.js:archiveLoaded`（约 139–165） | `sourceHistory[0].text=source.text`；`archiveSource.text=archivalText(source.text)` | 同一来源正文被分别放入 HISTORY 和 SOURCE |
| `tables/service.js:archiveNativeLoaded`（约 190–218） | 同样双投，并附 nativeBridge/nativeState/nativeRules | 可复用同一引用投影，但不能动原生结算、nativeOwned、archiveAlready 及日志 |
| `tables/service.js:archiveProposal` | 根据 archiveSource.text 与 userSource.text 选择需要完整读取的档案；补读和修复继续复用同一 input | 去重应在 input 构造处完成一次，不能只在首次调用修正 |
| `tables/slots.js:taskSlots` | sourceHistory → history；archiveSource → source；有 userSource 时 source 包成 `{archiveSource,userSource}` | 没有去重或消费 HISTORY 字符内容的逻辑；可原样传递带版本的引用视图 |
| `tables/paired-preset.js:taskMessages` | 每个来源槽单独序列化一次；源码注释的 once 只保证单槽一次，不跨槽去重 | 当前最终 messages 确实重复正文，必须测最终 messages，不只测 input |
| `config/host.js:request` | 接收 typedInput，配套模式调用 taskMessages；自定义执行器也接收 typedInput | 改 service 构造可同时覆盖配套预设、修复和独立建档；自定义执行器需识别新版视图，不可假称仍有 HISTORY.text |
| `tables/ledger.js:prepareCommit` | `options.evidence.includes(op.evidence)` 检查连续原句 | options.evidence 仍为原 `archivalText + userSource.text`，不让 HISTORY 辅助文本升级证据 |
| `tables/archive-proposal.js` | 独立审核工具以 basis.evidence 做相同连续原句检查 | 现有 previewArchiveChanges 本就只投 archiveSource；不要为此扩大其来源 |

## 不能静默绕过的既有合同

- `tables/modes.js:auxiliaryEntries` 的 `@RAW` 当前写明 `HISTORY preserves the original text`；`@ROUTE` 写明 `HISTORY=complete original records`。
- `tables/task-profiles.js:tableArchive.route[0]` 指定 HISTORY 中对应完整回复保留原文及辅助块出处。
- `tables/task-profiles.js:historyImport.route[0]` 指定 HISTORY 完整原文与 SOURCE 正文是同源不同视图；后续条目明确辅助块保留原位置。
- `tables/prompts.js:historyImport.instructions` 指定完整原始来源包含辅助块，不可将辅助块恢复为证据。
- `tests/tables.test.js` 的 recovery archive / preserved raw auxiliary 两项直接断言 `input.sourceHistory[0].text === raw`。这些应改为“通过引用视图无损重建 raw，正文只传一次”，不能只删除旧断言。
- `tests/task-presets.test.js` 的原始材料、100 层 Unicode 尾哨测试和初始化／手写输入仍是全文合同，不能一起改成只剩元数据。

## 建议的最小修正

### 1. 增加纯投影 helper，限制服务调用范围

建议新文件 `tables/archive-source-view.js`，函数类似 `archiveSourceView(source)`，返回：

- `archiveSource`：保留目前 metadata、text、time，全字段来源不变。
- `sourceHistory`：长度为 1 的历史记录列表，保留 key/parent/index/floor/role/name/candidate；增加明确 `format: tisya.same-source-history/1`。
- 历史原文改为 `parts`。各部分按原始顺序保存 `{text, start, end, evidence:false}` 或 `{sourceKey, sourcePath, start, end}`。正文引用的目标为同一 sourceKey 的 archiveSource.text，sourcePath 不依赖是否包了一层 userSource。
- `sourceHistory` 不是只含 key 的不可读取引用；没有工具回读保证时，所有独有辅助内容必须仍随请求发送。
- 程序应能够将 parts 解引用后逐字符恢复 source.text；这是实现不丢输入的门槛，而非让模型重新拼凑原文。

最小安全首版可只在 `archivalText(source.text)` 非空且是 raw 中**唯一连续精确片段**时压缩：保留精确 prefix / 正文引用 / suffix 三段。普通裸正文或正常 `<reply><body>…</body>…` 可立即省掉一份长正文，同时保留标题、心声、extra、变量命令以及所有未知块。不得用通用 `replace(text, '')` 盲删。

若正文含嵌套辅助块，`archivalText` 可能由多个不连续原片段拼成；若正文在 memory 中完全重复，则匹配也可能不唯一。这两种情况最小首版**显式保留旧完整历史视图**，不要猜边界或丢独有内容。返回可检查的 `projection: raw-fallback` 与原因即可，不需要把技术文案暴露到用户界面。若要求这些情况也去重，必须把 ledger 的正文抽取改成保持原位置的 span 管线，并在投影后验证 `new eligible text === old archivalText(raw)` 与 raw 无损恢复；这比最小修复扩大一档，不能临时用贪婪正则替代。

### 2. 仅替换两个同源 input 构造处

`archiveLoaded` 和 `archiveNativeLoaded` 使用 helper，仍保留同名 `sourceHistory` 与 `archiveSource` 字段。对象独立建档、修复、补读自然继承该 input。不要改 `invoke` 的全任务 inputsource，不要在 serializer 中全局删 text，不要改变 imports、pending、nativeBridge 和源版本核验。

### 3. 同步明确“完整原文”支持两种表示

在 `modes.js` 的共用路由添加短定义：HISTORY 可以是原始完整文本，也可以是宿主提供的同源无损引用视图；后者的正文仅在 SOURCE，HISTORY.parts 保存原位置和非证据辅助材料，源 key 必须一致，缺失目标为输入不完整，不能补造。不要要求模型把所有片段再抄写一遍。

`task-profiles.js` 的 tableArchive/historyImport 路由和 `prompts.js` 的 historyImport 规则同步改成双表示；不更改证据权重、语义、权限或流程。

`slots.js` 可只改 HISTORY 的标签/说明，使其不把引用视图假称为独立全文拷贝；现有序列化已能保留对象/列表，原则上无须新 slot。实际消费者都不应扩展回全文后再发模型，否则重复回来。

### 4. 不变的路径与语义

- `importHistory(text)`／`saveHistory(draft)`：仍保存并发送 sourceHistory.text 原文，historyEvidence 保留多 reply 与间隔用户文本；不能用单条 archivalText 替换。
- `templateInit`：完整历史帮助识别开局用户定义，仍保持全部 sourceMaterials.history；不能按角色或楼层一概压成归档输入。
- 宿主 message.mes、swipes、source hash、parent 链、sourceTime(raw)、sourceOrder、归档 key、原生日志：全部不变。
- title 内明确故事时间仍由当前 sourceTime 处理；辅助块不能以 HISTORY.parts.evidence=false 之外的方式被提升为事件证据。保留未知辅助内容不代表执行其中指令。
- 空正文、损坏闭合、多个 body、不同 candidate、Unicode、CRLF、头尾空白均应保留现有抽取结果，不顺手修复解析器。
- 用户连续输入当前在 userSource.text 和 userSource.sources 中也可能有重复，但属于另一合同，本次不扩 scope。

## 最小验收清单（此审计没有执行新测试）

1. 最终 taskMessages：独特长正文哨兵在 SOURCE/HISTORY 合计出现一次，HISTORY 的独有 title/extra/status/未知块保留且按位置可复原原回复；服务 input 和宿主聊天未改变。
2. 自动 archive 与 range historyImport、native 开/关、objectsSeparate 开/关、repair/readMore 重试都使用同一投影；source key/floor/candidate 不变。
3. `prepareCommit` 仍接受正文原句，拒绝只出现于 memory/status/task/vars 的“完成结果”；拒绝后仍 pending，不能把楼层标为成功。
4. 连续多个 userSource 原文仍按序存在，可创建明确用户定义的人物；不把动作请求升级结果。
5. 原文唯一连续正文成功投影；嵌套辅助／重复匹配／空正文只走显式 fallback，raw 无损；若实现 span 版则覆盖这些边界并证明新旧 evidence 一致。
6. 手写多 reply import 仍逐字保留原文、保留所有正文和间隔用户定义，保存 hash 不变，旧状态仍不能覆盖新来源；初始化 100 层 Unicode 尾哨合同保留。
7. 无新增 API 调用；实际 messages 字符数对正常长正文样本减少约一份正文减去引用开销；不得以“缩短输入”作为丢弃独有辅助材料的理由。

## 实施判断

可以进入小范围实现，建议以保守唯一片段投影为最小候选。若只希望马上删掉 sourceHistory.text 且不更新合同、保留辅助信息及验证原文覆盖，结论是**不能这样改**。现状的双投是有意保留来源的合同实现，不是可以不解释就删除的死字段；需要用明确的无损引用表示取代第二份正文。
