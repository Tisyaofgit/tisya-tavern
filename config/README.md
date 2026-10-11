# 配置与接口 · schema 2

## 生产边界

`core.js` 负责配置、资源登记、三态覆盖、参数和继承；`compiler.js` 负责选中规则到既有协议的编译；`host.js` 独占宿主读写／连接／预设／请求边界；`panel.js` 是五页配置表单；`contracts.js` 是未来生成器的输入输出契约；`native-beauty.js` 适配原生正则显示。原协议及显示／公开权限消费者继续复用。

配置权威位置是 `extensionSettings["缇斯亚配置"]`。世界键由角色卡稳定 avatar 或群组 id 与 chatId 组成；导入备份先成为草稿。旧 alpha.12 变量只用于尚无新配置世界的初次承接。配置读取、预览和宏不写存档。

## 公共入口

`window.Tisya.version`：运行版本。

`register(kind, definition)`：返回注销函数；同编号重复登记失败。登记不自动选择，也不执行资源正文。

| kind | 约定 |
| --- | --- |
| modes | `id/name/version/compile`；可选 `fields/tasks/driver/capabilities`。compile 接收 `{compiledBase, configuration, source}`，返回使用固定输出协议的编译结果。未提供 compile 的模式不可切换。 |
| tasks | `id/name/capability/instructions`；聊天任务可用普通请求，其他能力必须有执行器。 |
| resources | `id/name/kind/content`，可选 `description/version/tasks/source/fields/defaults/requires/conflicts`。kind 为 style/extension/mark/workflow/requirement/theme。 |
| archives | `id/name/scan({context,world})`；返回稳定 id、name、type、identity、description、source。只返回实际已授权身份字段。 |
| executors | 与 task 相同 id，`run({input,route,signal,task,world,selected})`；selected 是已选材料，不是资源目录。执行器负责该专用能力及实际执行回执。 |
| themes | 预留渲染器登记；本版只动态显示相应资源 fields，不执行资源中的任意代码。 |

`configuration.read()` 返回配置、当前世界、世界键与修订；`configuration.save(draft, expectedRevision, worldKey)` 使用乐观版本校验和宿主确认式保存。

`request(taskId, input, {signal})`：使用第四页解析后的路由调用后台聊天 API，或已注册专用执行器；主聊天仍使用原生发送。聊天请求返回宿主原始响应。产物不会自动写入资源库或勾选。

`context()`：最近一次本应用发往宿主后端的装配快照，不含凭据或完整连接对象。配置页面提供最多十次记录选择。

`contracts.generation`、`contracts.mode`、`contracts.archive` 和 `contracts.validateGeneratedTask(kind, result)`：工作流／美化标记／创世任务流预留。工作流验证稳定步骤编号、缺失引用和循环依赖；实际执行、预算和领域验收属于未来驱动。

## 通用资源

```json
{
  "id": "my-style",
  "version": 1,
  "name": "自定义文风",
  "kind": "style",
  "content": "使用${language}，动作细节保持具体。",
  "tasks": ["main"],
  "fields": [{"key":"language","label":"语言","type":"text","required":true}],
  "defaults": {"language":"简体中文"}
}
```

输入框可直接保存文本资源。JSON 导入可声明 text/number/boolean/select 表单；select 需 options。正文 `${key}` 只替换对应已选资源的实际参数；未填写引用会停止，不把表单全部发送。0 和 false 保留。适用任务默认仅 main。theme 永远不能进入模型材料。

世界书来源保存 `{book, uid}` 和内容快照，发送前核验来源未变化。检索候选仅显示在配置界面；选择书籍并不将整书发送。被勾选的原始条目若本身包含多套备选规则，需要用户先拆成独立资源，程序不会假装能安全猜分。

主控引用不更改宿主 persona 卡片或用户账户；本轮材料明确绑定世界中的主控，外部契约者仍按原身份协议保持。关注对象只是关注选择，不会赋予其全部档案访问权限。

## 路由与宿主限制

API、模型、预设逐字段解析 task → mode → global；参数逐字段合并。native 表示原生当前值，缺少字段表示继承，preset=null 表示无附加预设。主聊天的必需协议单独保留。连接保存 profile/target 引用；地址、密钥、代理归原生编辑器所有。不能在路由参数中导入密钥／请求头／地址。

主请求从宿主 GENERATION_AFTER_COMMANDS 冻结配置，到 CHAT_COMPLETION_SETTINGS_READY 重建已选消息，并调用原生 createGenerationParameters。保留宿主已经选择的流式形态，使接收解析匹配。主控、材料、世界或配置失效时停止；事件总线吞异常的情况另由请求序列化校验阻止发送。

外部主预设只有在没有选中项要求时沿用原生请求，不承诺完整裁剪。第三方 quiet/impersonate 不由本模块劫持。主预设深度条目暂未适配时明确报错；世界书旁路及工具目录不会因注册就被复制进去。API 附加请求体不得覆盖 messages/system/prompt/tools 等控制字段。

Agent、数据库、检索、语音、绘图、嵌入、重排执行器需另外注册，不以普通聊天替代不具备的能力。生成候选与保存／启用是不同动作。
