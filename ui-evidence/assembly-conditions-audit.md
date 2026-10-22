# 装配层、条件与来源替代交叉审计

审计时间：2026-10-22 16:13 UTC。对象：`settings-ui-work` 当前隔离候选工作区；该工作区存在其他代理并发修改，本报告按下列函数的实际读取快照记录。只读产品源码，未改变手机、模型调用、世界书或会话。

## 结论

现有账本、条件引擎、原生扫描门禁、分层存档可以复用，但“对应原世界书条目被存档表达替代、原条件不变、同源只进一次、归档后只带结构资料与最新原文”尚未形成完整的统一装配契约。不能将关闭整套原卡/原书材料称为条目级替代，也不能将一次门禁计算去重称为最终上下文去重。

| 目标 | 当前实际能力 | 待补边界 |
| --- | --- | --- |
| 原书条目对应替代 | 初始化保留书名、条目名、正文；生成可投射 Tisya 表行到临时原生条目 | 普通原条目的稳定 uid、触发完整参数、来源版本、原条目→多条结构记录覆盖映射未贯通；无逐条替代选择器 |
| 同条件、同来源只注入一次 | 外部门禁按 book+uid 合并一次判定；同机会抽签回执持久化；同一临时 Tisya uid 不重复 append | 原文和归档表达之间没有 canonical source 身份；跨四个原生来源的最终同源材料去重不由当前门禁保证 |
| 原触发保留 | 未接外部条件的原生条目仍走原生扫描；外部门禁保留位置、预算、角色过滤等宿主限制 | 外部门禁通过后 constant=true，取代普通关键词启动；表行投射自己重建关键词，不是继承原书条件 |
| 静态/快照/历史分层 | 现有 archiveLayer + ledger replay + 变更锚点可区分 | 分层标签未成为统一的注入触发/权威规则；不能依标签自动推断常驻、当前有效或人物已知 |
| 仅结构资料+最新原文 | strict 模式不额外注入 latestTemporary；旧来源按确认顺序归档 | chatHistory 仍按 context.history 保留 N 条，不按 archivedSources 做替代；默认 history=50，因此不是自动“最新一条” |
| owner 与 ACL | 明确对象/字段绑定；读者与人物知情两组 ACL；动作写入参与者与依赖范围约束 | 装配模型可收到带 ACL 的记录，并非统一按某角色硬过滤；须明确叙事模型可见、读者可见、人物知情三个语义 |

## 原生注入源与替代缺口

1. `index.js` 的 `WORLDINFO_ENTRIES_LOADED` 顺序为 `nativeConfiguration.entriesLoaded(p)` → `tableService.worldbook.entriesLoaded(p)` → `worldbookConditions.entriesLoaded(p)`。因此门禁能看到预设附加和表单临时条目。四原生来源为 globalLore、characterLore、chatLore、personaLore。
2. `tables/worldbook-context.js::worldbookEntries` 给表行生成新的 `world='Tisya tables / '+scope`、顺序 uid、姓名/别名/标签/引用名关键词；强制检索、到期、scene/preferences 等成为常驻。`entriesLoaded` 仅向 chatLore 追加副本，按新 world+uid 防重复追加；它没有移除或替换任何原条目。`selectedText` 只返回本轮实际激活的 Tisya 条目，未扫描就拒绝猜测结果。
3. `tables/books.js::materials` 普通原条目只输出 `{book,entry,content,enabled?}`；仅特别识别的 archivePrefixRole 分支附带 sourcePath。它没有为全部原条目保存 uid 与完整关键词、selective、triggers、sticky/cooldown、group、位置、概率等激活契约。`service.js::draftTemplate` 的 sourceBooks 使用此结果；只有书名与标题不足以区分同名条目及后续修订。
4. `tables/books.js::write` 保存的自动分层展示条目全部 `enabled:false`。`archive-book-entries.js` 生成静态、数据、动态快照、记忆、原点、基点、时间锚条目。这是可丢弃展示投影；实际注入使用 ledger replay 后的生成投影，而非直接开启这些存档 JSON 条目。
5. `tables/continuity.js::configureTableContinuity` 在 tables 接续模式把 card/persona 关闭、books/entries 清空、controller/focus 清空，仅作用于配置投影。`config/host.js::payloadReady/buildMessages` 重建受控预设材料，原生激活不会整体转发；strict 时也不转发 g.tableActivation。此方案属于整源通道选择，无法证明对应原条目条件被保留。原书本身仍可留在磁盘，不能据此称之为条目级替代。

## 三套条件不能混称同一个条件引擎

### A. 表/字段投射条件

`tables/conditions.js` 支持 always/selected/strict/context/cue/tagged/retrieved/focused/rule，以及 any/all/not、eq/oneOf/has、仅 previous/user/either 的文本短语条件。`assembly.js` 先选根记录，再投射字段，再跟随剩余引用；被条件省略的链接不会再拉入关联资料。引用 follow=identity 只保留名称、类型、别名。

默认 tableCondition 中 facts/scene/tasks/timers/clues/preferences/holdings 为 always；state 排除“失效”（“待确认”仍可能入材料，但正文提示不能当确证）；events 依明确 cue/tag/retrieval，而不是只因人物关联就全量回放。`archiveLayer` 不决定这些条件。必填和身份字段也不会因可选字段 include 条件消失。

### B. 登记状态上的确定性条件

`tables/condition-rules.js` 是无 eval 的编译器。支持 true/false 前缀、逗号 AND、“或”分支、数值/有序枚举比较、set/add 效果；类型限 boolean/number/enum/text。词表有 owner/record/context/record-context/owner-record/bound 作用域。

运行时 `condition-runtime.js::compileBoundRule` 实际把字段绑定到当前分支对象 ID 与世界状态目录稳定字段键，不能仅凭重名找到另一个人的值。读取 `state` 中对象+字段且有效性=有效的唯一当前行；缺失与 ? 为 unknown，重复有效行报错；0、false、明确没有 / 不会被当作缺失。原生引用/值引用不允许冒充该引擎的独立状态值。

gate 只判定，不改状态；action 必须显式效果。规则保存版本与原文，sourceRef 可以锚定档案 recordId+field+index；原文变化会使原绑定失效。这是**档案条件文本来源**，不是原世界书来源替代映射。

概率、cooldown、limit、start/end 以确认回合和持久化回执运行；已发生一次机会不能靠页面重载再抽，同一机会的旧成功也不能让当前 false/unknown 成功。门禁机会由当前 chain keys+trigger 得出，并在 rule+book/uid lane 内记账。因此两个不同 uid 即使正文/规则相同，仍是两个 lane，不能据此宣称语义同源去重。

### C. 原生世界书外部门禁

`worldbook-conditions.js` 只处理 `extensions.tisyaWorldbook.condition.mode==='external'` 条目。启用项按原生 book(world)+uid 合并引用；相同地址出现冲突规则则拒绝。未知、私有、过期、缺回执、超时、切会话都不放行；最终 scanDone/assertReady 再检查规则与上下文版本，阻止 sticky/强制激活绕过门禁。

通过项会被复制成 `constant:true, vectorized:false, useProbability:false`。因此外部条件是此模式的启动条件，**不是“保留关键词规则，再额外 AND 状态条件”的现成实现**。位置、order、depth 等保留，原生预算、角色过滤和 cooldown 等其他宿主限制仍可能拒绝它。需要新装配设计明确选择“沿用原生触发”还是“外部条件替代触发”，不能静默混合。

## owner、写权限和知情

- schema table.owner 与 allowedTables 决定哪类维护任务能写哪张表；不是访问者身份。
- condition 绑定 objectId 决定当前值属于哪个对象；action 写对象必须是确认事件参与者。preview 保存 origin/session 版本与会话；提交前重新校验。
- row.access.readers 与 knowers 分别表示读者范围和人物知情。`conditionReadAccess` 要求所有实际依赖状态及 sourceRef 对读者可见，否则 public gate 不放行。action 输出 ACL 不得超过输入依赖交集和来源事件；公式派生也按依赖权限限制。
- `assembly.js` 与 `service.js::assemble` 当前没有把所有读者不可见行统一从叙事模型输入里删除；资料携带 access 并用提示约束人物知情。引用 closure 保留每行 ACL，不能把父项选中当成子项授权。应明确这是叙事输入权限标注，不等价于硬隔离模型不可读秘密。
- 因此“原条目替代”必须保存来源权限与目标记录 ACL，且不能因为同源去重而把不同受众投影合成更宽 ACL。

## 静态常态、当前快照、历史事件与原文

`archive-book.js::archiveLayer` 默认：objects/facts=static；scene/state/native_cells=snapshot；events/cognition/experiences=memory；其余=data，允许 registry 声明合法 layer。这里 static 是档案类别，不能据此断言所有 facts 永远无时效或所有常态都应常驻注入。

`ledger.js::project` 按当前分支 sourceKeys 重放 commit，只保留每 ID 当前行，另保留 anchors/commits/archived 集合。退出当前分支的来源及其 contextSource 不再生效；旧楼层不能覆盖较新状态，历史输入需可核实时间。历史事件与当前状态已具备不同落点，变更前后和原文 evidence 可追溯。

`service.js::archiveLoaded` 默认只处理已有后续 user 输入确认的 AI 来源，跳过已归档 source；该 AI 前连续用户输入保序作为 userSource。latest 本身不是自动永不归档：用户下一次输入可以确认并使之归档。初始化把定义和后续历史分开，不能用开局初值覆盖会话现值。

`service.js::assemble` 非 strict 会附 latestTemporary；strict 不附。可是 `config/history-context.js::selectedHistory/historyWindow` 仍按数量而非归档状态选原文，`config/host.js::buildMessages` 只对 strict AI 消息调用 archivalText 清包装，不按已归档身份剔除正文。当前 defaultWorld history=50。所以“只留最新正文”必须另加 source-aware history selection，不能只是设 history=1（连续多条 user、continue、swipe/重生成、多媒体、工具回合要独立处理）。应在发送投影中替换，不删除用户原始聊天。

## 建议最小实现顺序（尚未实现）

1. 先定义统一来源清单：稳定 bookRef+uid+来源版本/hash、所属 source channel、完整激活契约、disabled、条目正文覆盖范围、目标 record IDs、确认状态。一条拆多行/多条归一对象必须保留来源列表；禁止按标题或内容相似度直接判成同源。
2. 定义替代关系与权威：静态定义、当前快照、历史事件各自独立；只有已确认并验证完整覆盖的范围允许替代。原书修订、映射过期或转换未完成，不应静默消失或同时整段双注入，需明确退回原源/阻止发送策略。
3. 将替代/去重置于四源收集之后、原生递归扫描之前，基于一次规范来源身份只选择一种表达；确保没替代的原条目仍沿原条件激活。若走直接组装，也必须复用同一选择结果，不能另开不经过触发的静态材料通道。
4. 使用现有 gate 处理明确登记的状态条件；不要把外部门禁 constant=true 误当原触发保留。原生概率与外部概率最多结算一次，继承机会身份要以 canonical source 而非新投射 uid 为准。
5. 从 `view.archived` 与当前分支 chain 产生历史发送清单：已完整归档旧 AI 文本转结构引用；未归档或失败的旧原文不可悄悄丢弃；保留最新正文与当前输入序列；continue/swipe/重生成单独明确来源。
6. 显示本轮材料审计：来源、激活理由、采用原文/结构、被谁替代、省略原因、权限范围、原文尾部。该记录用于查错，不能反过来成为事实来源。

## 验证与必须覆盖的验收

实际执行：`node --test tests/condition-runtime-service.test.js tests/worldbook-conditions.test.js tests/worldbook-native-condition-scan.test.js`。

首次执行时，原生条件 gate 与 verbatim 宿主扫描测试 14 通过；condition-runtime-service 18 项在 fixture 创建前被 `mainRoundEnabled is not defined` 阻断，已通知主代理。对应代理补齐并发候选实现后，原命令完整复跑 **32/32 通过，0 失败、0 跳过**，耗时 23.90 秒。最终日志 `settings-ui-audit/assembly-conditions-tests.tap`。该测试验证现有条件链，不证明本报告列出的新条目替代方案已实现；未修产品文件，未进行手机测试。

新替代逻辑的最小验收应包括：

- 同 book+uid 从四源重复出现只装一次；同标题不同 uid 保留独立；同 uid 不同版本拒绝过期映射。
- 原条件未满足时原文和结构都不装；已满足时恰好一个表达；未映射邻居条目保留；保留原插入位置与预算行为。
- AND/NOT、原生 recursion/sticky/cooldown、外部门禁未知/私有/失败、同机会概率不重抽；结构不应自己新增关键词造成自激活。
- 部分转换、一个来源拆多个记录、多来源合一个对象、源修订、归档失败/待确认均不造成静默丢资料或全文重复。
- 0/false/null 与失效/待确认区分；同名不同对象不串值；旧楼层事件不覆盖当前快照；原点常态不能回灌重置当前状态。
- 最新原文恰好一次，连续 user 保序、未归档资料仍可用、continue/swipe 分支正确、工具组与媒体来源完整；存储的原聊天保持不变。
- 通过任一入口都遵循相同 source/条件/ACL 选择结果，最终 payload 可追溯到同一装配清单。
