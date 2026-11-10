# candidate.14 正则交互修复验证

本记录对应产品源码提交 `588850700ff48540947d904b99ff1dccd2a15011`。记录文件随后补入；该文档提交不改变产品源码或构建产物。

## 修复范围

- 结构化正文中的完整 HTML 正则页面继续由宿主原生页面承载，正文片段保持原顺序。
- 原生正文卡已有运行来源而扩展状态卡缺失时，按规范化全文识别来源，只补缺失项，并保持公开显示顺序。
- 原生页面完成加载、消息刷新和折叠后保留已有节点与交互状态；显示处理不写消息或变量。
- 前置空 `<start></start>` 的特定畸形输出获得只读显示适配；严格引擎协议的接纳边界没有放宽。
- 实际提示装配要求整条输出只有一个 `<reply>…</reply>`，前后无额外内容；显示占位符归 `extra`，原生变量更新归 `vars`。

## 已完成验证

2026-11-10 17:02:41—17:05:19 UTC，固定源码执行 `npm test`：17 项生成产物检查及 2057 项 Node 测试全部通过；失败、取消、跳过和 todo 均为 0。运行期间 1586 个源码文件未变化，共 118887096 字节。日志 SHA256：`da4ae31475b197686400d9434316984f721d58a645834d8d79c286a703814613`。

新增原生来源回归修复前 4 项中 3 项失败；修复后，与正文和前缀回归合并共 24 项通过。相关回归可运行：

```sh
node --test tests/native-panel-source-completion.test.js tests/native-panel-source.test.js tests/native-body.test.js tests/display-start-prefix.test.js
node --test tests/reply-envelope-prompt.test.js tests/builtin-preset.test.js
```

独立中性 MVU 联调使用官方 `initResponse`、`onMessageReceived`、`handleVariablesInMessage`、`updateVariables` 与宿主 `EventEmitter`、当前缇斯亚入口。覆盖原生监听前置/后置、空 start 前缀有无、状态占位符有无共 8 种组合，均仅写变量一次并在生成结束后保留数值、false 和合法空串。该证据为隔离内存存储与 DOM；原始报告和失败日志沿项目工作区稳定身份保存。

构建产物 `runtime.js`：4711009 字节，SHA256 `e1f44c887f2fbc1d3b699bf7acd37124abe944797ae8f979254e047061d4e8e5`。固定远端全树与本地文件的路径、大小、权限、Git blob 一致；新空目录恢复校验通过。

## 仍待现场验证

用户报告的 Android 原卡变量录入失败根因尚未确定。原卡私人脚本、首楼初始化、真实宿主图形生命周期、真实供应商模型和 Android 触控没有通过证据。Chromium 最小页面启动遇到 `socket() Operation not permitted`，原始错误保留。

未知可执行源、已挂载原生页面、重复文档身份或矛盾来源顺序维持原生所有权并显示等待，不据自动化通过宣称所有第三方卡均兼容。更新后需分别观察状态值是否实际写入、普通点击是否保持页面、刷新和折叠是否保留交互。
