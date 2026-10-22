# 世界书放弃草稿与删除恢复

“放弃并载入”后仍无法删除的根因：条目编辑的 `draft/dirty` 与角色绑定的 `linkDraft/linkValue` 是两套页面草稿。原载入只替换条目数据，绑定草稿仍让宿主判定 `bindingDirty=true`。此外，原确认动作会在宿主读取成功前清空条目草稿并生成干净基线，读取失败可能丢掉未保存编辑。

现在先请求宿主最新数据。读取成功后，显式放弃才同时清除本页条目、批量预览、历史撤销、编辑器、选择和未保存绑定草稿，再建立最新数据基线、重新读取角色绑定。读取失败保留草稿，界面明确说明可导出或修复后重试。展开正文编辑器的输入也立即同步到草稿。

删除仍走原宿主管理、影响预览和确认流程：其他世界书的未保存草稿也会阻止删除；预览后新产生的草稿会再次拦截。没有 force 删除路径，没有修改真实用户世界书。

已经提交、但宿主未确认保存的全局设置属于 `hasUnconfirmedSettings()`，不能用放弃本地草稿伪装成已撤销。此时管理操作明确拒绝；重新载入沿用 store 的确认重试，失败保留待确认状态及可恢复草稿，成功才显示载入完成。

验证：`node tools/build-worldbook.mjs --check` 通过。以下 22 项测试全部通过：

- `tests/worldbook-discard-lifecycle.test.js`：真实构建控制台与真实 console/store/management 桥接，隔离 Alpha/Beta fixture；绑定草稿→放弃并载入→删除、其他书草稿阻断、展开编辑保留、读取失败恢复、待确认设置不可伪清。
- `tests/worldbook-store.test.js`：原字段及未知元数据保留、范围与陈旧数据保护、部分失败恢复等。
- `tests/worldbook-generation.test.js`：生成期间世界书读写与角色管理边界。
- `tests/worldbook-condition-ui.test.js`：真实控制台条件登记与宿主读取失败反馈。

Happy DOM 回归覆盖真实点击处理与 host 消息生命周期；尚未替代手机真机验证。旧 generation fixture 的 native 导出缺项警告仍存在，该套测试通过。
