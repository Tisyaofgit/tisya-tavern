# UI 入口验收记录

核验范围：真实生产 index.js 导航与实际模块，在 Happy DOM、内存宿主、固定模型回复隔离环境中运行。未触碰用户真实酒馆数据，未调用真实模型。

## 已核结果

- 首轮生产入口/身份续存专项于 2026-11-10 09:49:37.885957→09:50:06.571098 UTC 执行，27 项、23 通过、4 失败。原始日志 `dom-route.log` 与源文件校验保留。
- 三项 shell 失败仍断言已退役的内联创建字段，经 root 分配后只修改 `tests/shell.test.js`，改为等价的实际入口验收。最终定向运行于 09:58:27.343766→09:58:33.931691 UTC 完成，3/3 通过、0 跳过。见 `shell-route-replacement-5.log`。
- 无聊天首次进入：真实用户身份页可读、只有一组页面底部动作；创建入口转到独立世界起步页；无模型、来源书、聊天引擎或原生身份写入。
- 已有聊天首次进入：设置→身份→指定基点书/原文 UID→真实助手与 Matrix 创建表单→固定简表回复→人工修改字段→确认保存；同 UID 来源归档保留原文、关闭自动注入、Matrix 只建立一个人物、未提供字段未被全文填充，默认不创建原生用户身份。之后从身份页手动选主控、保存、重开回读一致，重复保存不重写。
- 混合修改取消：暂存原生身份切换、姓名、心愿、选项、主控模式、实际档案字段；前往助手时出现一个未保存拦截，继续编辑保留输入；取消后原生设置/元数据/Matrix/来源书无写入，重开仍为原状态。
- 测试夹具仅额外捕获实际 mount 返回对象供等待与释放；保留实际创建/归档/身份实现。修正夹具的原生模板读取回退与助手定时器清理。所有中间失败日志保留。

最终 shell 文件 SHA-256：`9ef7db6a9d221597eeb7df5846832063e7b859f1ee1bf507c49e97615a8eda11`。修改前完整文件和差异分别为 `shell.test.before.js`、`shell-route-replacement.diff`。全套运行、构建与最终发布由 root 负责，本记录不代替其结果。

## 续存缺陷

原始 recovery 测试没有把已有同名原文的 UID 和 source 传给创建，实际停在同名预检保护，尚未到模拟聊天写入失败。creation_acceptance 已修正具体夹具并处理真实 UI 将纯预检草稿错误锁定的问题。只读交叉运行于 10:02:52.583332→10:03:08.143855 UTC 完成：consumer-wire 与 recovery-UI 共 12/12 通过，0 跳过，被测 5 文件前后 SHA 一致。新来源/旧档的 extend/revise 路由修订仍由 creation_acceptance 继续，不在这 12 项结论内。

## 浏览器、像素和宿主边界

- 环境实际存在 `/usr/bin/chromium`，不是缺少可执行文件。09:48:32.014288 UTC 实际独立 data URL 启动返回 -6，首个致命错误为 `socket() failed: Operation not permitted (1)`；原始 stderr 在 `chromium-probe.stderr.log`。未同路提权、未关闭安全限制。
- 按 cloud-desktop 采用受支持的共享 Chrome 路径，只尝试 `http://127.0.0.1:37787/tests/browser-matrix-identity.html`，实际返回 `net::ERR_CONNECTION_REFUSED`。没有更换 URL 或网络绕过；已完成 CUA 收束并终止隔离 HTTP 服务。具体记录见 `shared-browser-probe.json`。
- 实际浏览器像素、窄屏滚动、真实酒馆宿主和 Android 均未通过本次验收；DOM 通过不能替代这些层次。
