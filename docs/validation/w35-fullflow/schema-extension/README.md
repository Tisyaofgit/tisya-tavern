# W35 初始化扩展结构修复

用户明确要求：初始化须允许自定义扩展字段及子表。实机反馈为“未登记字段:object.职责”；本地使用真实初始化服务复现同类 `未登记字段：character.职责`，并保留 `before.tap`，4 项针对性检查均失败。

根因已确认：`archive-service.mjs` 强制 `templates/schemaChanges` 为空，`prepareCommit` 禁止扩展；实际 `templateInit` definition 阶段的多处提示也要求结构始终不变。已有底层 reconcile 支持显式扩展，正常 A 阶段也支持显式结构提案，因此这是初始化链路禁止了现有能力。

修复行为：

- 初始化优先复用既有结构；模型声明的可选字段、派生类型和关联子表成为待审草案。
- 可由值推断的新增字段也只生成待确认定义，冻结为显式 `schemaChanges`。生成/审阅不写当前注册表；只有保存草案才登记。
- 工作台显示完整“待确认结构扩展”清单及类型，字段和子表编辑使用草案注册表。
- 保存当前存档时，定义与行在同一个 ledger commit 内；原点/基点定义版本携带完整 registry，新会话以 binding.initialRegistry 初始化。
- 普通 A 的 `inferSchemaFields:false` 保持不变；未声明字段仍拒绝，已确认扩展可正常填写。
- 原生变量、偏好结构及系统来源引用不可由初始化扩展定义。原有字段类型/约束仍走既有冲突检查；保存前核原始定义未被替换。

验证：`after-first.tap` 新增 4 项通过；`related-first.tap` 共 60 项通过（已包含上述 4 项，不能相加）；`ui-first.tap` 另 1 项真实 application/workbench 按钮→审阅新增字段和子表→逐项编辑→确认保存→冷重开通过。追加发现原点/基点同 ID 扩展类型冲突直到运行才暴露，`conflict-before.tap` 保留缺少拒绝的失败；现 `initialFor` 在创建/选择绑定前即合并注册表并校验行，`conflict-after.tap` 32 项通过，其中仅 1 项为上述新增检查。去重计数 62。

证据边界：确定性模型响应、Happy DOM、实际插件组合服务与提取的原生宿主函数。未执行 Android APK，未调用外部模型；这些检查不能替代用户要求的全流程模型语义及目标设备验收。原始失败日志不删除。

候选产品触点：`v3/design-schema.mjs`、`v3/archive-service.mjs`、`v3/books.mjs`、`v3/host.mjs`、`v3/workbench.mjs` 的初始化草案区；`tables/modes.js`、`tables/prompts.js`、`tables/task-profiles.js`。workbench 的其他 W35 流式与配置修改由对应执行者保留。

首次候选冻结于 2026-10-24 18:43 UTC；随后已通知 root 并仅追加上述绑定冲突保护，冻结完成消息以 root 收到的消息为准。精确源码与逐文件校验由 root 同点保存；此处只记录专项证据，不建立第二蓝图或发布指针。

## 独立复审追加

Luc 审查指出 tableGenesis 提示允许 artifacts.registry 兼容新增，但服务仍要求完全相等。现完整 registry 经逐层保留旧定义、兼容合并后转为相同 schemaChanges/templates 待审差分；删除旧字段、修改类型或偏好结构继续拒绝。genesis-after.tap 保留新增用例原拒绝日志，genesis-fixed.tap 为 15/15。

已有存档选择新定义时，初始 registry 原来只对无 ledger 生效。修复将用户已选择且兼容的定义保存在 ledger.definitionRegistry；回放后叠加结构，使历史 commit.registry 不会覆盖新选择的定义。迁移不改 baseView.rows、commits、requests 或任何当前值，结构实际新增时才 CAS 写一次。books 在绑定选择前检查所选结构与所有旧 registry 快照是否兼容，拒绝后保留原绑定。

同时补足模糊未知值 null/空对象必须声明类型，以及扩展子表业务行必须经 ref/refs 关联对象。子表关联在生成与最终保存时均复核，不能靠人工删字段绕过。

final-registry-overlay.tap 保留初轮 3 个失败：新增 owner 校验尚未接入正文、两个 books 的可插拔简化 ledger 测试没有 baseView.registry/commits。已补接调用，并让兼容扫描仅检查存在的 registry 快照，仍由原 projectLedger 校验宿主状态。final-registry-overlay-fixed.tap 为 51/51（schema 7 + design 9 + books 27 + book-host 6 + UI 2）；与早前用例重叠，不累加为独立总数。真实 select 与冷重开验证由 luc_materials 单独提交。

本次追加仅修改 design-schema、archive-service、books、host 的初始化结构段，以及 runtime-source/runner/preflight-runner 的 projectRetained 最后合并；保留源链作者同文件的 sameJsonValue 保存读回核验，已重建 host-runtime。

最终冻结后新增纯回放断言 retained-overlay.tap：8/8（新增 1 项），覆盖旧 commit.registry、来源撤回、定义只补结构且不把职责当前值填给所有人物、投影不修改 ledger。host-overlay-regression.tap：installer / legacy-source-availability / passive-session 共 36/36，覆盖实际提取宿主保存/拦截函数及分支/重投/源链；与前述用例重叠，仍不累计为独立全流程验收数。node tools/build-v3-host.mjs --check 通过。schema-freeze.sha256 在 18:56 UTC 复核全部一致；root 已获产品冻结与统一构建通知。

### 实际改绑冷重开的独立失败与修复

Luc 的 independent-host-binding-before-fix.tap 为真实 1 通过 / 2 失败：同一 definitionRegistry 重开重复 CAS；既有对象只提交属性更新时，runner 在引用映射前缺少对象类型。不能把此前普通专项通过视作这两条通过。

host 现在在已有持久 overlay 时只按 overlay 自身差异决定写入；所有历史 registry 的兼容验证继续执行。runner 的引用映射临时采用当前行类型，映射后移除临时字段，实际补丁不被扩写；归档和世界推演共用此处理。

修后独立 independent-host-binding-after-fix.tap 3/3：实际 books.select、重载会话、dispose 后全新 installV3Host 均保留结构与当前进度；重复重开不新增 revision；原 rows/commits 原样。类型和描述已人工锁定时，A 仅更新属性仍成功；未知字段拒绝，既无后续 B 调用也无新 commit；不兼容定义选择前拒绝且不移动 pointer。测试由独立 agent 编写/复跑，未修改产品。
