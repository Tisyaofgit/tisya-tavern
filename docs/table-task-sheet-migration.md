# TABLE 任务简表接线

本轮将全部 11 个 TABLE 任务的模型文本交付改为简表。`ruleReview` 保留专用中文规则校对表，其他 10 个任务使用 `tables/simple-sheet.js` 的递归类型简表。模型文本没有 JSON 回退；内部执行器可以返回类型化候选，仍须经过各任务原有语义校验。HTTP 传输外壳、保存档案、旧历史和原生变量协议不因本次变更而改格式。

## 真实链路

`service.invoke` 先生成完整类型化输入，向请求层传 `renderModelMaterial(input)` 及独立拷贝的 `typedInput`。宿主按原槽路由原对象、把资料渲染一次；不会把简表再次当 JSON 解析或塞成一个字符串值。返回模型文本经 `parseTableTaskResponse` 分派到专用或通用解析器，随后沿用原来的证据、来源、ACL、引用、版本、候选确认、原 MVU 和提交校验。坏格式可见报错，不增加自动格式修复请求。

`tables/task-sheet.js` 提供实际模式装配使用的 `tableTaskExamples` 和 `tableTaskSheetContract`。完整 TXT 导出与运行代码使用相同实现。`prompts.js`、`modes.js`、`task-profiles.js` 以及世界推进、状态系统、原生配置的附加规则中，原先要求输出 JSON 的条款已改为字段与类型说明。

| 任务 | 新模型输出及条件分支 |
| --- | --- |
| ruleReview | 专用问题／引用／方案／改动简表；问题为零明确填写数量 0 |
| templateInit | 模板、base、initial、notes；名称冲突修复改为 renames／notes |
| tableArchive | changes／templates／schemaChanges／pending；补读为 needsRows；草案工具审核完成为 changes 空列表、archiveRequestId、notes |
| objectArchive | 对象／事实变更，保留与历史归档共用的临时引用 |
| historyImport | 历史变更与原来源证据 |
| preferenceAnalysis | 偏好候选变更，持续范围和用户确认规则不变 |
| nativeFill | 已有映射完整值、writePaths、pending；任意嵌套值逐层展开 |
| plotAdvance | world 的 from／to／events／pending；plan 的 goal／beats／条件列表 |
| assetAdapt | 单对象 core；所选资产组 bundle；成长和关联仍逐项核原来源 |
| tableGenesis | blueprint／checklist／artifacts／workflow；条件需要时追加 coreMapping、stateSystem、native 配置 |
| tableAssistant | answer／changes／backfill／genesisGoal；配置仍等待用户应用 |

缺失、0、false、空文本、null、空对象和空列表保持独立类型。对象和列表展开为子表，不能靠一个 JSON 字符串格隐藏递归值。原资料文本中的引号、反斜线、换行和字面 JSON 保持原义；后者属于引用内容，并非协议回退。

单对象和资产组基点的证据校验同步改为匹配各自原始文本叶值，解决自然资料引用换行、引号、反斜线后与 JSON 转义文本不相符的问题。不接受属性键、行 ID／修订／ACL 等元数据，也不跨字段或跨对象拼接证据；提交前校验继续执行。

## 正文资料展示与边界

正文资料使用 `storyMaterial`、`storyPreferences`、`storyContext`、`storyBlueprint`，通过 `narrativeSlot` 私有品牌送出自然字段。内部类型化槽仍保留作审计。直接注入只读取已选资料的原生引用；世界书模式按实际激活条目提供对应值，不把未激活值放入全局资料。事件和条件结果保留知识范围。实时正文附加规则与导出器共享 `narrativeInstructions`。

此次完成的是格式、资料投射和现有任务接线；没有因此宣称“两阶段统一调度”已实施，也没有更改已确认楼层边界或新增模型请求。实际模型生成质量仍需另行验证，自动测试不能证明以后绝无格式错误。

相关验证：`tests/table-simple-sheet.test.js` 全任务实际模式与条件样例、`tests/tables.test.js` 真实请求输入／输出／保存及坏表零写入、`tests/core-evidence.test.js` 原始连续证据、原规则校对与原生变量回归。最终全量计数由主代理统一记录。
