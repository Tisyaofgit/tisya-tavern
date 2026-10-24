# TauriTavern Linux 测试酒馆恢复包

这是这次真实 Linux 酒馆调试环境的私有快照，包括 TauriTavern 本体、保存的用户状态、实际安装的扩展、原卡与资料，以及文字诊断记录。它用于以后继续复现与调试；验证结论以 `diagnostics/fullflow` 中的记录为准，打包本身不代表 A/B 全流程已全部通过。

## 适用环境与依赖

本次宿主是 **Ubuntu 24.04 x86_64、TauriTavern 2.4.0、WebKitGTK**。确切版本见 `provenance/`：系统版本、已安装 apt 包、动态库、Node/Python、扩展版本和官方来源。

这不是操作系统镜像，也不是 Android 安装包。没有承诺完全离线或在不同系统上无需适配：原卡的 MVU、Zod 与部分前端资源仍引用网络地址；API 模拟需要本地进程，真实外部模型连接需要你自行配置。

在兼容的 Ubuntu 24.04 环境中安装所需系统包：

```sh
sudo apt-get update
sudo apt-get install libwebkit2gtk-4.1-0 libayatana-appindicator3-1 libxdo3 xvfb webkit2gtk-driver xauth xdotool x11-utils x11-apps python3
```

另需 Node.js 22+；此次记录为 v24.22.1。`apt-required.txt` 是主要依赖列表，`apt-installed.tsv` 是本次系统的完整版本证据。安装上述包可能自动安装它们的依赖；本包没有代替这些系统库。

## 解压与检查

将 ZIP 解压到一个新的私有目录，保留目录结构。不要覆盖你日常使用的酒馆目录。外部 `.zip.sha256` 是整个压缩包校验，`.members.sha256` 覆盖压缩包每个成员；内部 `MANIFEST.json` 列出有效载荷的大小与 SHA-256。

```sh
cd 解压后的包目录
python3 tools/verify-package.py
chmod +x start-tavern.sh app/linux-host/usr/bin/tauritavern
./start-tavern.sh --check
```

校验应在第一次启动前运行。启动后聊天和设置正常变化，校验会报告相应文件已改变。不要通过还原快照覆盖新的进展；先复制整个包目录保存分支。

可在新的解压副本上执行一次真实宿主启动检查。它读取页面标题、插件版本及当前卡名称，然后正常关闭，不发送生成请求：

```sh
python3 tools/restore-smoke.py . --output ../restore-smoke.json
```

此检查使用独立端口和显示号，仍需要上述系统依赖与必要的网络资源。结果只证明这次恢复启动，不代替聊天全流程验收。

若包内有 `provenance/local-helper-dependency-routes.json`，这是本次隔离测试对酒馆助手更新检查的限定改动：仅将版本清单和更新日志的两个固定地址改到本机 `127.0.0.1:8096`，读取随包保存的公开原文件。它不代理或转发任何外部请求，不改变 MVU、角色卡、模型端点或插件业务逻辑。原脚本、两个地址差异及散列记录保存在包内诊断中；此环境不能用来验证助手在线更新功能。其他原卡网络资源仍按各自配置运行，不能据此称整包完全离线。

启动器看到该记录时会同时启动、检查并关闭本地资源服务。该服务只接受两个固定路径的 GET，其他路径及带查询参数请求均拒绝，写入方法也拒绝。8096 专用于这两份资源；正常模型 API 默认8095，恢复启动检查默认8097，避免端口冲突。`--check` 只检查依赖，不启动本地资源服务。

## 启动真实宿主并继续自动化调试

```sh
./start-tavern.sh --hours 2
```

一个父进程同时启动本地 API 队列、Xvfb、WebKitWebDriver 和真实 TauriTavern。这是为了让它们在带网络隔离的调试环境里共享本地网络。默认使用带 Xauthority 验证的 TCP X 显示；普通 Linux 可选 `--unix-display`。

启动后的路径写入 `runtime/active-session.json`。每次新建独立的 `runtime/sessions/<时间>/`，不会自动重放旧的命令和 API 回答。当前存档、角色、世界书与扩展从 `runtime/data` 接续。旧诊断放在 `diagnostics/`，只供查阅。

向真实 WebView 发送只读检查命令：

```sh
python3 tools/queue_client.py <<'JSON'
{"body":{"script":"return {title:document.title,hasTavernHelper:typeof window.TavernHelper!=='undefined',hasMvu:typeof window.Mvu!=='undefined};","args":[]}}
JSON
```

宿主的端点信任授权文件 `runtime/data/com.tauritavern.client/security/user-endpoint-grants.json` 已随状态保留。若出现原生 GTK 确认框，它不属于 WebView DOM；队列也支持 `native` 参数传入 `xdotool`、`xwininfo`、`xwd` 的参数列表，沿实际原生窗口操作。内部截图仍不应作为资料包输出。

同一队列可以执行 WebDriver 的其他命令，格式为 `method`、`path`、`body`、可选 `timeout`；默认 `POST /execute/sync`。请先阅读实际页面状态，再执行有写入效果的命令。

如果需要在已有 Linux 桌面上打开窗口：

```sh
./start-tavern.sh --desktop --hours 2
```

桌面模式要求已有 DISPLAY 或 WAYLAND_DISPLAY，不提供 WebDriver 命令执行。它仍会启动本地 API 队列。

## 本地 API 模拟的含义

默认服务仅监听 `127.0.0.1:8095`，OpenAI 兼容地址为 `http://127.0.0.1:8095/v1`，测试模型为 `tisya-agent-assisted`。它不会调用外部模型，也不会自动编造回答。

真实宿主请求被写入当前会话的 `api-queue`；操作者或接续代理必须完整读取对应 `.request.json` / `.messages.txt`，再按服务协议写入同名 `.response.json`。回答需要 `producer`、与 `.delivery.json` 一致的 `requestSha256`，以及 `content` 或受支持的 `sheet`。这样可以保留这次“由代理内部充当 API”的诊断方式，区分真实宿主行为与回答来源。

改变 `--api-port` 后，需要在酒馆原生连接设置中同步调整本地地址；本启动器不会改写你的 API 配置。原卡已有脚本与规则保持其保存状态，酒馆助手负责运行它们。

## 正常关闭与后续备份

```sh
python3 tools/stop-tavern.py
```

等待当前会话的 `closed.json` 出现、TauriTavern 进程结束后再复制或重新打包。原存档不会因为关闭而清空。不要把运行中的 SQLite/WebKit 状态当作一致快照。

## 包含与排除

- `app/linux-host`：实际运行的官方 Linux 应用与随附资源。
- `runtime/data`、`runtime/config`、`runtime/cache`：恢复所需的本地数据，包括角色、世界书、用户身份、聊天、扩展及保存状态。
- `materials`：KPOP、VI、Luc 等本次使用的原始/导入资料；原始角色卡 PNG 是资料，并非调试截图。
- `diagnostics`：私有 API 队列、WebDriver 命令与文字结果、本轮验证记录。旧命令可能含原卡或聊天正文，不要公开上传。
- `tools`：可重定位启动、队列、停止、校验工具；本地 API 所需的简表编码器一并带入。
- `provenance`：来源、版本、排除清单及快照信息。

不包含浏览器诊断截图及其内嵌图片响应、不带系统 socket/PID/锁或独立源码工作副本。已安装缇斯亚目录完整保留，包括随安装存在的验证资料；图片运行素材不会因为目录名类似截图而被排除。打包时逐文件核对实际安装树与包内树；凭据或截图过滤若与该完整性要求冲突，会明确失败，交由操作者处理。临时运行目录与会话凭证每次重新生成。

打包时要求 `secrets.json` 为 `{}`，或必须由操作者先清理后重试；配置中的已填凭据只接受明确测试占位值。没有把运行进程的环境变量写入包。恢复后如要连接真实供应商，请在原生界面自行填写密钥。

此包含私有资料和聊天，仅保存到你自己的资料库。不要将整包或 `diagnostics` 发布到公开代码仓库。
