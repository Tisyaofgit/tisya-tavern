# 开场白原生运行时检查

此候选扩展现有“显示检查”，用于区分代码外壳、助手渲染资格及宿主运行候选。它不将新增诊断标作开场白挂载修复，也不将 Node/DOM 检查标作 Android 验收。

## 已知事实与待证问题

candidate 19 的用户现场检查显示：原生消息和祖先均可见，没有投影、隐藏样式、TH iframe、宿主占位或 ghost；有一个代码开关。当前源码节点可见不等于已有脚本运行页面。代码开关本身仅切换源代码显示。

在固定宿主和助手的隔离生命周期探针中，助手未创建候选与宿主撤回运行名额都能留下代码开关。实际 Tisya 原生保留分支在已测的参与者顺序和异步缓存时序下保留同一源码节点及容器，未复现破坏 claim。页面源码生成、Vue DOM patcher 和 guest 脚本未在真实宿主中完成验收，现场根因继续保留未知。

## 本候选行为

- 原有 DOM、隐藏原因及工具栏检查保留。
- 从当前上下文只读提取已知助手设置字段；缺失、类型错误、访问器或读取失败保留未知，不套默认。
- 用固定助手算法模拟本条消息的深度资格，明确区别原始存储值和助手内存中的有效设置。
- 可选读取宿主内部运行快照，只输出本条消息的候选状态及必要汇总；元素归属未确认时不以同编号候选推断当前消息。
- 导入失败、能力缺失和超时明确显示不可读；这条兼容读取不是稳定的公开 ABI。
- 读取期间复制按钮禁用，关闭面板、换消息或换候选后的迟返回不会覆盖新视图。

诊断不调用刷新聊天、设置运行需求、注册候选或强制挂载；不执行 guest 脚本，不读取正文、iframe 文档、URL、用户变量或任意异常正文。

## 固定源码依据

- TauriTavern：`Darkatse/TauriTavern@85dc99089e3fcc9d3a0aafc085564bd642895261`，`src/tauri/main/services/chat-surface/runtime.js`、`chat-surface-controller.js`、`runtime-admission.js`。
- 酒馆助手：`N0VI028/JS-Slash-Runner@91a706cfcc884baae3c9da47e5d672901a5d65a6`，`src/tauritavern_chat_surface.ts`、`src/panel/render/Iframe.vue` 及代码折叠实现。

这些是实现依据，不是自动检测出的设备版本。实际设备版本、有效设置、真实 guest 启动、发送及世界书交互仍需现场验证。

## 进入检查

在出问题的消息上打开“更多 → 消息操作 → 显示检查”，待读取完成后使用“复制检查”。记录附加 `runtimeInspection`，原有 `tisya.native-render-diagnostic/1` 字段保持兼容。


## candidate 21：正则进入显示链之前的只读检查

占位型开场白可能只有标记而没有直接的 HTML 代码块。若宿主控制器属于当前消息、运行候选为空，单靠助手 enabled/depth 还不能判断前面的显示规则是否进入链路。candidate 21 为现有记录附加 `regexInspection`，诊断不修改显示行为。

- 分别读取当前原始 `chatId` 是否存在、Tisya `nativeRegex` 开关、宿主 regex 扩展禁用状态；只输出布尔值，不输出 ID。
- 分别统计宿主 `getRegexScripts({allowedOnly:false})` 和 `allowedOnly:true` 的规则总数与 disabled/Markdown/当前消息 placement 的元数据资格。该 getter 的许可筛选不负责判断 regex 扩展禁用状态。
- 记录 Tisya 已有 pipeline 的 enabled、当前规则计数与 prepared entry 数量；读取时间不表示 pipeline 最近刷新时间。
- 不执行规则、不测试消息匹配、不编译、不刷新 pipeline。元数据资格不证明深度、宏替换、匹配、前端生成或脚本启动成功。
- 缺失、访问器、字段类型错误、读取失败、超时和扫描预算不足显式保留 unknown；不返回卡名、规则名、find/replace、聊天正文、URL、变量或异常正文。
- 各读取并非原子快照。异步返回继续使用原消息与面板身份校验；关闭面板、切换候选或切换消息后丢弃旧结果。

固定宿主正则依据为 `Darkatse/TauriTavern@85dc99089e3fcc9d3a0aafc085564bd642895261` 的 `src/scripts/extensions/regex/engine.js` 与预设字段读取链。兼容依据不表示自动识别了用户设备上的实际源码版本。

中性占位输入与实际模块/固定宿主函数探针可重现多种相同外观：规则缺失、未允许、禁用或显示位置不符等。现场原因为未知，候选 21 是定位更新；真实宿主与 Android 的前端显示仍需用户检查，不用 Node/DOM 通过代替。
