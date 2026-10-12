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

`modes.narrative.workflowDetail`：`full` / `compact` / `format`，缺省为 `compact`；未知或非字符串值拒绝保存。旧配置不自动重写。该字段纳入既有配置版本检查、世界隔离、备份与 live macro 缓存。完整档由现有 source 渲染并裁去停用可选工作；其他档显式压缩流程，输出协议和实际配置保持同源。

## 通用资料与输出路由

`applySourceOutputRoutes` 在实时预设编译时修改预设自身的 TASK.START、C.2 和 blk.extra/vars/status。任何资料来源中的有效展示组件、变量更新和状态记录分别建立 @OUTPUT.extra/vars/status 引用，再由唯一输出块消费。不使用卡名或 MagVarUpdate 检测作为输出许可，不转换外部变量方言，不改写宿主 messages、世界书条目或已存回复。

外部协议的根路径、字段、类型、约束、操作次序和原生标签保留；来源中的“文末”归入 vars，不允许回复根之外追加。Analysis 与推演留在内部。没有有效协议、写入依据或实际操作时保持 vars 为空。缇斯亚自有执行器停用不覆盖外部卡的变量协议。

阅读层把已知 UpdateVariable/JSONPatch 转为临时 JSON 提案视图；其他 XML／脚本变量协议存为带 opaque 标记的原文，未校验其业务语义、未解释执行。原生脚本是唯一结算者。旧 JSONPatch 尾块兼容只读；原消息不写回，不重放历史更新。

## 手选资料中的原卡变量快照

`modes.narrative.nativeMvu` 缺省 auto，可设 off；此项只控制手选资料模式额外读取原卡快照与更新规则。现有快照读取器支持声明 MagVarUpdate 的卡，通过原生 Mvu.getMvuData 读取有效分支，保留全部启用格式条目及字段规则；其他协议可由所选资料或原生注入提供。快照读取器的覆盖范围不限制通用输出路由。

快照来源、运行时或初值错误会停止依赖它的手选资料请求且零写入。原生模式不调用该读取器，沿用宿主已有注入。此处前提与历史记忆块无关。

## 独立历史范围

`context.history` 在两种模式中均有效。原生模式通过 manifest.generate_interceptor 接收宿主已经正则处理、附加文件、选定 swipe 的 coreChat 副本；按宿主 index 来源保留近期 N 条及当前输入，不修改原始 chat 或消息对象。无 native index 的扩展附加行不计入条数、不删除；工具行随其历史区段保留。quiet/impersonate 辅助请求跳过。该入口在世界书／预设最终装配之前，不重新拼写最终 messages。

手选资料模式继续由 buildMessages 选择历史，历史条数也不依赖记忆功能。原生实际可用量仍受宿主 token 预算影响；生成后的快照附带实际历史选择报告。宿主缺少来源标记时明确停止，不猜测消息归属。此宿主 dry-run 会跳过 generate_interceptor，预览不作为实际发送条数证据；以正式生成后的 historyWindow 报告核对。

旧 context.memory 键保留但不再有消费者。发送链不再调用记忆解析、窗口外补入或旧心声净化；普通开场白、缺记忆块和畸形旧块均不会成为发送前置条件。历史编辑、删除或 swipe 变动仍使已装配的旧手选资料请求失效。

## 上下文来源与接口

`context.owner` 为 native（数据库／原生）或 tisya（手选资料），新配置及缺省旧配置按 native 处理，按聊天保存。原生模式不切换独立主聊天 API／预设，不封存 payload，允许数据库后续注入；历史范围在前述输入入口独立处理。手选资料保留资源选择与独立路由。任务／执行器登记接口和手动辅助调用保留，表单记忆重构仍未接入。
