# 创建 UI 与消费者补丁交叉审查

审查时间：2026-11-10 10:00—10:03 UTC。只读审查与隔离执行，不修改 engine/identity-ui.mjs、tables/paired-preset.js、tables/slots.js 或其他代理测试。

## 结论

已落补丁范围内未发现新的阻断问题。12 项实际模块回归重跑全部通过，0 跳过，运行期间源文件未变化；另外 5 组显式值经过真实消息装配后保持区分。真实模型、浏览器像素、Android 与实际宿主均不属于这些结论。

## 具体确认范围

| 范围 | 核对结果 | 证据 |
|---|---|---|
| 未写创建预检 | 同名来源碰撞只保留可编辑草稿；没有 archivePlan、recovery 或 archiveReceipt 时不设置 creationSavedDraft；改名后清除确认、需重新确认；取消后冷重开不出现伪待办 | cross-review-focused.log 第 8、9 项 |
| 保存已开始 | 归档计划已形成后，即使意图确认失败或来源回读状态为 unknown，也锁定同一操作；失败保存不能用取消绕过 | 同日志第 11、12 项 |
| 来源已写、聊天未写 | 冷重建服务读取持久草稿、同 operationId 续存；来源同 UID 不重复追加，聊天只写入一份人物 | 同日志第 7 项 |
| 名称同步 | 人物档案绑定行改名同步归档名；世界绑定行改名同步初始化/资料标题；支持人物的姓名不误改世界归档名 | 同日志第 7、8、10 项；identity-ui.mjs 对绑定 tableId/recordId 的条件 |
| 原生预设开关 | prompt 未带 enabled 时由明确开启的 order 接入；prompt.enabled=false 与 order.enabled=false 均保留关闭语义；如果关闭的是有数据的资料槽，实际派发前报错，未静默丢资料 | 同日志第 1、4、5 项 |
| 来源完整性 | 契约者、原卡、绑定书、故事时间、已确认历史政策进入最终模拟网络请求；源数据中的宏未执行，来源对象未变 | 同日志第 1、2、3 项 |
| null/false/0/空串 | contractor、policy、worldTime 经 pairedPreset→taskMessages→slotText→compactMaterial 实际序列化保持原值；只有 undefined/缺省回退 nativeSources；嵌套来源的 null、false 也保留 | consumer-explicit-values-probe.json 5 组 |

## 具体边界

- “意图失败且来源尚未写”的锁定是有意保守处理：not-written 描述的是来源书状态，并不能单凭它证明意图数据库写入绝对没有发生。允许继续读取同一次操作，不允许换内容蒙混重试。
- 本次 null/false 检查针对新增/改动的 contractor、policy、worldTime 以及 source 对象值；未把这个结论扩大成所有历史来源适配器的空值语义。
- 已迁移原文重新提炼的 extend/revise 路由问题是另一项已知工作，creation_acceptance 正在处理，不计入当前通过数。
- 后续源码改变须以 root 的重建与完整门禁为准。

## 运行与校验

运行：2026-11-10 10:02:52.583332→10:03:08.143855 UTC。命令为 node --test --test-reporter=tap --test-concurrency=1 tests/matrix-identity-recovery-ui.test.js tests/matrix-consumer-wire.test.js。

前后 SHA-256 及完整命令见 cross-review-focused-result.json；原始输出 cross-review-focused.log；显式值探针于 10:02:05.009 UTC 执行，见 consumer-explicit-values-probe.json。
