# 扩展内容、消息卡与历史呈现

本模块把配置和运行内容都放在最新版表单中。内置书提供模板、参考资料与有限样式定义；书不是第二个运行状态库。正文排版只读取已接纳历史记录，不结算、不发送、不推进时间，不从散文推断交易。

## 唯一数据来源

| 用途 | 表单或定义 |
| --- | --- |
| 主文风、视角、对白、限知等已有字段 | 继续使用 `T_PREF_OUTPUT_CONFIG` |
| 区域开关、样式来源、扩展定义、材料来源、条数、主题与观众类型 | `T_PREF_EXTENSION_PRESENTATION`，关联 `output_config_ref` |
| 文本、转账、语音、图片、新闻的消息内容 | `T_DYN_MESSAGE_CONTENT` |
| 小剧场、论坛、弹幕等已生成区块 | `T_DYN_EXTENSION_BLOCKS` |
| 区块中的单条发言、稳定楼层、引用与删除状态 | `T_DYN_EXTENSION_ITEMS.block_ref` |
| 转账金额与资金状态 | 只引用 `X_FIN_TRANSACTIONS`，`amount` 为整数分，且 `type` 必须是 `transfer` |
| 媒体资产 | 引用既有 `T_SYS_MEDIA_ASSETS`，不复制原件 |

`T_DYN_TRANSFERS` 是物品／持有权流转表。它的 `quantity` 不能当现金转账金额。转账卡的 `transfer_ref` 指向真实资金流水；显示卡片不会再次扣款，也不会宣称收款人已读或已确认。

上述三个运行表的定义集中导出为 `PRESENTATION_SCHEMAS`；偏好定义集中导出为 `EXTENSION_PREFERENCE_SCHEMA`。调用方注册它们，不在 UI 内重复定义字段。通用表单事务仍是唯一写入入口。

## 配置与来源

区域 ID 为 `messages / danmaku / rumor / notice / settlement / theater / forum / news`。旧候选输入 `message` 规范化为 `messages`。

`style_book / style_uid / style_digest` 固定选中的美化条目；`extension_book / extension_uid / extension_digest` 固定小剧场或版式生成定义。三项必须同时存在，内容摘要改变时明确报错，不自动改选第一条、同名条目或最新内容。

世界／观众材料引用分为两种：

```json
{"kind":"book","book":"资料书名","uid":"条目ID","digest":"原正文SHA256"}
```

```json
{"kind":"record","tableId":"实际表ID","recordId":"实际记录ID"}
```

记录来源只读取当前获准的已知字段；选中一个来源不会增加读取权限。书来源作为定义或参考进入编译材料，不冒充已经发生的事件、已经在场的角色或真实在线人数。空列表保持为空，不补演示人群。

`audience_kind` 有四个明确值：

| 值 | 含义 |
| --- | --- |
| `world_fans` | 本世界观众；只依据该世界已公开或明确获准的信息 |
| `higher_dimensional` | 高维观众；仍遵守材料边界，不自动全知 |
| `mixed` | 两类混合；分别标明本体归属，不互通私密知识 |
| `none` | 不生成观众发言 |

未填时保留 `null`。论坛／弹幕未选择观众本体或选择 `none` 时不启用观众发言生成。

`generate_count` 是每轮生成目标，范围 0–50；`display_limit` 是显示上限，范围 0–200。两者分开，0 不会被默认值覆盖，显示限制不删除历史。论坛／弹幕／小剧场的条目数量在呈现时截取。`topic_preferences` 为 `{topic, mode:"prefer"|"avoid", weight:0..1}` 列表；主题偏好不是世界事实。

`compileExtensionPreferences()` 是纯函数。`createExtensionPresentationService().compilePreferences()` 从同一表单读取配置，按当前主体、世界及输出配置筛选，再读取实际安装书的定义。没有来源和开启条件时不虚构已启用生成。读取显示偏好使用 `database.peek()`；`displayOnly` 不读取世界／观众正文，不编译生成提示词。

## 标记与历史绑定

现有 25 种正文标记，以及“引用／媒体”两个标记继续使用原语法：

```text
〔信笺:标题〕正文〔/信笺〕
```

这次新增 `@record` 参数。它是正式新增合同，不冒称恢复了旧 Vic 的同名语法。例如：

```text
〔消息:@record{"kind":"transfer","tableId":"T_DYN_MESSAGE_CONTENT","recordId":"message-42","snapshotId":"@message"}〕转账记录〔/消息〕

〔媒体:@record{"kind":"voice","tableId":"T_DYN_MESSAGE_CONTENT","recordId":"voice-42","snapshotId":"@message"}〕语音〔/媒体〕

〔引用:@record{"kind":"forum","tableId":"T_DYN_EXTENSION_BLOCKS","recordId":"forum-42","snapshotId":"@message"}〕讨论串〔/引用〕
```

`@message` 只能绑定当前这条消息已接纳的历史快照。手机内容优先读取 `phoneSnapshot(sourceId)` 的冻结帧；表单内容读取目标 journal 条目的历史状态，倒放其后补丁。服务核对稳定消息 UID、原文摘要与 sourceId。旧消息没有可验证快照时显示缺项，不创建 UID，不拿当前行补旧值。

也支持明确的 `snapshotId` 或 `revision`，但必须匹配本条消息的真实历史身份。指定其他消息的快照不被解释为当前来源。不同记录可以来自本条消息的手机帧或表单快照，`messageReferences` 为每条记录保存准确绑定。

原有未登记引用仍显示原标签，不变成无作用按钮。普通作者 HTML、代码块及链接不因包含标记而获得记录访问。缺失或无权读取的卡片只显示局部提示，正文其他内容保留。

## 宿主接口

```js
const presentation = createExtensionPresentationService({
  document,
  getContext,
  phone: { source, snapshot }, // 必须只读；不能首次初始化或迁移手机
  database: { peek, read, snapshot },
  books: builtinBooks,
  getScope: () => ({ ownerId, worldId, outputConfigId }),
  readMedia,                  // 仅请求已授权记录引用的实际资源
  releaseMedia,               // 释放对应的本地 object URL 使用权
  authorizeRecord,            // 可选：宿主的更完整权限判定
  onError
});
```

`forMessage(message)` 返回供 `formatProse()` 使用的 `projections / media / configs / contextKey / messageReferences / dispose`。正文和阅读器均已接此异步入口；消息被编辑、切换会话、视图关闭或过期响应到达时会拒绝替换旧视图并释放媒体。

`formatProse(document, body, hostSanitizer, {...appearance, presentation: options})` 才启用记录卡。宿主 HTML 清理仍是必经步骤。有限样式令牌只支持密度、对齐和既有强调方式，不执行书中的任意 CSS、HTML、脚本或正则。

`compilePreferences().prompt` 用于启用的扩展生成。`.contract` 是消息引用的通用协议，可加入正式输出合同。模型新增内容必须先通过已授权的表单事务，例如 `@ROW+`；文字中写一个标记本身不会创建记录。

## 媒体与可见范围

语音有可读取的真实音源时使用原生 `<audio controls preload="none">`，不自动播放。不提供假波形、假进度或凭空生成的时长。只有文稿或原件暂不可取时明确写明“语音文稿／未提供音源／音源暂不可用”。TTS 声线定义不是已经生成的音频。

图片只读取已登记且获准的资产，不自动上传或公开私密相册。消息行和所引用媒体各自校验权限，公开消息不会自动解锁他人的私密图片。新闻保留来源标签、真实登记的链接和已存更正；样式不等于独立事实核查。旧演示资料的演示标签继续保留。

论坛保留实际楼层、引用和删除状态。被删正文不回显；引用目标不在当前显示范围时显示文字说明，不生成无效跳转。弹幕可根据实际播放器的时间筛选；没有播放器时只展示已存记录，不模拟直播进度。

## 本轮验证与仍未实测

本地专项覆盖配置空值与 0、来源摘要、观众本体、主体／世界／输出隔离、原文摘要绑定、真实历史补丁恢复、手机冻结论坛、资金与物品流转区分、媒体权限、原生音频元素、论坛楼层与删除、实际新闻／直播字段、视图异步竞态、object URL 释放、现有正文排版回归。

对应测试位于 `tests/extension-host.test.js`、`tests/extension-host-ui.test.js`、`tests/extension-preferences.test.js`、`tests/extension-preferences-ui.test.js` 与 `tests/presentation-media.test.js`。Node 与 Happy-DOM 验证不等于真实浏览器音频播放、Tauri 宿主、模型调用或 Android 实测；这些仍需各自明确验收。复杂访问规则通过宿主 `authorizeRecord` 接入；默认读取仅接受明确公开、本人归属或明确可读主体，不把未知权限视为允许。
