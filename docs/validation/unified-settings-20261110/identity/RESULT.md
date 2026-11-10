# 身份、档案、资料和呈现的统一保存合并

状态：实现完成，专项回归 82 / 82 通过。保存与发布由主协作代理统一处理。

## 合并结果

- 保留新版主分支的单页草稿、底部“取消修改 / 保存”、一次离页确认、原生用户身份与心愿保存顺序。
- 接入候选的统一数据库人物编辑、人工创建、旧角色来源迁移、实际 Matrix creator 草稿、资料书与世界选择。
- 数据库编辑与创建先产生预览，明确勾选后才由统一保存调用实际 commit。创作预检使用真实 creator.validate，保存时再次执行相同预检及版本保护。
- 身份和呈现先全部预检；呈现的多个区域草稿使用一次数据库事务保存。草稿取消不写真实数据。
- 已确认保存片段立即记录回执；失败片段继续保留。数据库已写、聊天绑定失败后使用同一操作编号续存，不建立第二个人物。
- 同页数据库档案写入可用确认回执推进呈现草稿的版本基线；重复回执须精确匹配，外部更新或重叠修改仍拒绝。
- legacy 世界书档案写入已确认而聊天名称同步失败时，使用精确条目回执更新原稿基线，重试只补名称同步，不重写档案。
- 呈现事务已确认、随后读取失败时，保留提交回执并清除已提交草稿，明确提示“已保存，但重新读取失败”；不恢复旧草稿、不重复提交。身份页同时呈现部分成功回执。
- 呈现区由 identityPanel 放进身份内容滚动区，整页页脚只有一份；页面打开不隐式安装模板书，显式检查更新按钮仍保留。

## 提供给 index 的接口

`identityPanel` 提供 `root / ready / state / validateDraft / saveDraft / discardDraft / confirmLeave / requestLeave / settled / dispose`，以及 `setCompanion(panel)`、`refreshState()`。

`preferencePanel` 以 `externalActions: true` 挂载，`onStateChange` 调用 `identityPanel.refreshState()`。其 `root` 由身份页移动至内容区；其 `state()` 额外提供 `receipt`、`reviewRequired`。父级应统一代理身份页保存、取消和离页接口，并负责两面板 dispose。

## 验证

最终命令：

```sh
node --test tests/matrix-identity-save.test.js tests/matrix-identity.test.js tests/database-identity.test.js tests/extension-preferences-ui.test.js tests/template-book-identity.test.js tests/matrix-creation.test.js tests/matrix-creation-wire.test.js tests/unified-identity-settings.test.js
```

最终原始日志为 `final-specialist-v2.log`：82 项通过，0 项失败、跳过、取消。

新增组合测试使用真实 Runtime、config、identity、Matrix creator 和 UI；数据库提交夹具执行实际 Runtime 记录操作并检查 CAS、聊天上下文和操作编号去重。模型请求由确定性夹具返回创作提案，没有调用外部模型。测试覆盖混合保存、缺失确认时零写、人工创建局部失败重试、实际 creator 预检、多个呈现区域、一次离页取消、呈现提交后的读取失败，以及档案局部成功后的组合续存。

保留 `first.log`、`second.log`、`unified-first.log` 等原始失败记录，不覆盖原始证据。部分早期失败属于候选旧按钮断言、夹具缺失原生身份 applyActive、旧取消按钮文案；修正后分别复跑。

## 边界

这是本地服务组合与 DOM 回归。真实宿主、外部模型和 Android 设备未在本专项实测。项目全套、构建、路由最终复核及持久保存由主协作代理继续执行。

呈现配置保持原人物 / 世界 / 输出配置归属；同一保存中改变该归属后不会把原归属的呈现草稿静默写入新归属，归属变化会显式拒绝并保留尚未提交片段。
