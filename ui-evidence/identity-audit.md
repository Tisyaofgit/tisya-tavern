# 玩家身份与角色卡绑定审计

审计时间：2026-10-22。范围：`settings-ui-work` 现行实现和 `Darkatse/TauriTavern` 的 `v2.4.0` 源码。只读审计；未调用真实创建、上传、绑定或模型 API，未修改产品代码。父任务时钟：`initialization-ui-clock.json`，截止 16:53:21 UTC。

## 结论

现有「使用并绑定」已能限定当前角色卡和当前聊天，不必重写绑定核心。缺的是首次引导和真正创建独立原生 persona 的路径。目前「角色创建」只创建原始档案，随后的写入会覆盖当前活动 persona；不能直接把它当作新卡独立创建。

世界配置的 `w.controller` 是另一路实际注入的身份覆盖，必须退出常规编辑入口。父任务已在处理唯一入口：保留旧值并明确冲突，由用户显式清除，不能自动删除或把角色卡 NPC 当作玩家角色。

## 唯一真源与作用域

| 内容 | 真源 | 写入边界 |
| --- | --- | --- |
| 玩家名称、描述、头像 | 原生 persona 的稳定 avatar ID、`powerUserSettings.personas`、`persona_descriptions` | 编辑某 persona 会影响所有使用该 persona 的卡；不是卡内独立文本 |
| 当前角色卡的关联 | persona descriptor 的 `connections`，`{type:'character', id:card.avatar}` | 只增删当前目标卡关联，不改其他卡 |
| 当前聊天选用的玩家 | `chatMetadata.persona` | 只写当前聊天，历史聊天原锁定保持 |
| 全局默认 persona | `powerUserSettings.default_persona` | 新卡/新聊天引导必须传 `global:false`；只能显式高级操作修改 |
| 图鉴玩家对象关联 | `session.personaBinding` + 固定 origin 引用 | 是关联和证据，不能成为第二套可独立编辑的用户定义 |
| 旧世界主控覆盖 | 每会话配置 `w.controller` | 保留、提示冲突、显式迁移；不继续提供另一身份选择器 |

`config/core.js:worldKey` 包含卡/群和 chat ID，不能以这个配置键替代卡级 persona connections。角色关联必须用稳定 avatar，不用 `characterId` 数组下标或显示名。

## 现行接口与风险位置

### 可复用的绑定服务

`user-identity-service.js:createIdentityService.select` 已具备：

- 提交前 revision/scope 校验、空作用域拒绝、pending 操作拒绝。
- `character:true` 写当前角色卡/群关联；原生未允许多关联时，仅移除其他 persona 对同一目标的关联，保持其他目标。
- `chat:true` 写当前聊天锁；`global:false` 不改全局默认。
- `validateSelection` 先核查原始世界兼容性，`afterSelect` 绑定图鉴玩家对象。
- 持久化意图 `tisya.identity-intent/1`，设置→聊天→档案顺序保存；失败保留并可恢复。
- 切换会话后拒绝续写聊天锁，设置保存和档案保存后再次核对作用域。

`user-identity-page.js` 当前「使用并绑定」默认勾当前聊天/角色卡，全局默认不勾。入口可收敛，底层作用域逻辑应保留。

### 创建名义和实际效果不一致

`tables/service.js:createIdentityDraft/saveIdentityDraft` 创建的是原始图鉴对象及事实。`previewIdentityOrigin/saveIdentityOrigin` 经 `tables/persona.js:personaDraft/createPersonaGateway.write` 写入 `current/before.id`。该 ID 是当前活动 persona，不是新 ID。

因此，新卡从创建向导继续到「写入原生用户身份」会改旧 persona 名称/描述。这个 persona 若被别卡引用，那些卡也会读到更新。须先明确新建原生 persona，再将已生成档案导入新 ID；不能重用活动 persona 后声称已隔离。

`identityService.saveProfile` 也有同样的原生全局实体语义，但作为明确「编辑此身份」本身合理；UI 应显示该身份关联多少张卡，不能称为仅本卡编辑。

### 旧主控覆盖仍实际参与注入

`config/host.js:resolveMaterials` 遇 `w.controller` 会注入「本世界 user／主控」档案。`buildMessages` 在 controller 存在时抑制原生 personaDescription。仅隐藏 dropdown 并不会改变旧会话行为。

安全迁移界面至少显示旧覆盖对象与当前 persona；「沿用绑定身份」显式清除 controller 并保存当前世界配置。若用户希望沿用旧主控档案，必须走兼容校验→创建/选择 persona→绑定→显式清除旧覆盖，任何一步失败都不可谎称迁移完成。原档案与旧值在用户选择前保留。

## TT 2.4 原生独立创建证据

官方仓库固定标签：`https://github.com/Darkatse/TauriTavern/tree/v2.4.0`。

| 文件/函数 | 已证实行为 | 采用限制 |
| --- | --- | --- |
| `src/scripts/personas.js:528 initPersona`，export | 将名称/描述写入指定 avatar ID，默认 descriptor，排队保存，发 PERSONA_CREATED | 不上传头像；传旧 ID 会覆盖旧 persona，不能自己伪造一个未存储 ID |
| 同文件 `createPersona(avatarId)`，export | 对已上传头像弹原生姓名/描述输入后调用 initPersona | 已有头像 ID 前提；不能把当前活动 ID 传进去充新建 |
| 同文件 `createPersonaCallback`，注册 `/persona-create` | 上传真实默认/自定义头像，initPersona，刷新列表，返回 ID | 默认会切换 persona；必须 `select:'false'`，并补持久化确认 |
| `SlashCommandParser.commands` 静态注册表 | `commands['persona-create'].callback` 可接结构化 args | 可免拼接命令字符串；仍需运行时能力检查、固定版本测试，不能执行用户描述里的宏或命令 |
| `personas.js:364 uploadUserAvatar`，私有 | POST `/api/avatars/upload`，FormData avatar + 可选 overwrite_name | 不是可 import helper，且丢弃响应 path，不能直接作为稳定外部创建接口 |
| `src/tauri/main/services/characters/character-form-service.js:218 uploadAvatarFromForm` | FormData 经真实文件物化→`upload_avatar`→返回上传结果 | 已证实真实宿主支持；需原生请求头/桥，不能模拟成功 |
| `src-tauri/crates/tt-adapter-media/src/repositories/file_avatar_repository.rs:202 upload_avatar` | 按传入文件名存 PNG，返回 `{path:filename}`；省略文件名用毫秒时间戳 | 同名会覆盖头像且保留旧 persona 元数据，不具备 create-only 排他语义 |
| `src/scripts/tauri/setting/settings-persistence.js:68 loadPersonaSnapshot` | 从 `get_personas` 读取原生实体，合并未保存本地改动 | 单看内存对象或列表不能代替设置持久化确认；先确认保存再回读 |

### 推荐正式适配路径

1. 能力检查：真实上传路由、`initPersona`、持久化确认和原生读取可用；不可用时明确提示，不能回退覆盖活动 persona。
2. 捕获当前 card/chat/persona/revision，独立创建作业串行；保存创建 intent 和本次 UUID 文件名，避免双击/恢复重复创建。
3. 生成高熵 `.png` 文件名，用当前 persona 清单检查未占用。通过原生 `/api/avatars/upload` 真上传默认头像或用户选定头像，`overwrite_name` 为本次 UUID；只采用已确认响应 path，要求与本次安全文件名一致。UUID 只是上传目标名，不作为未上传的假 persona ID。
4. 上传后尚未初始化前，再检查该 ID 未对应其他已命名 persona。调用导出的 `initPersona(actualPath, name, description, title, options)`；此函数不选择活动 persona。
5. 强制设置保存并确认成功，再用原生读取核对新 ID/名称/描述。只有 debounce 排队不算完成。
6. 在原始作用域仍一致时，将新 ID 交既有 `identityService.select({chat:true,character:true,global:false,revision:最新})`。不再调用修改活动 persona 的旧 creation 导入路径。
7. 创建成功但切卡/绑定失败时保留「已创建、未绑定」结果和固定 ID，恢复时可显式继续；不自动绑定新卡、不自动删除、不重新创建。保存未知时停止依赖。

上传接口没有 create-only 原子能力；随机文件名和本插件串行可以降低碰撞，不能宣称防止宿主其他实例全部并发。这个限制比原生 slash 的毫秒+ASCII 名字更稳，但仍需说明真实持久化边界。

### 现成原生命令作为过渡方案

`SlashCommandParser.commands['persona-create'].callback({name,description,title,select:'false'})` 是真实原生上传/创建路径，避免通过文本 parser 执行用户内容。它生成 `Date.now()+ASCII name` ID；中文名可退化成纯时间戳。它不具备强排他或回执恢复：碰撞时可覆盖，保存只排队；失败发生于部分完成后不能盲目重试。正式自动引导建议使用上面的受控桥接，不把这条简便路径标为完整保证。

## 首次引导与唯一入口方案

统一页面「玩家角色」，主页、世界配置、初始化向导仅跳到这一页。页面默认只读显示当前玩家、所属卡、当前聊天锁、原始档案和旧主控冲突；创建/更换/编辑是明确操作。

建议新增只读 evaluator，输入当前 scope、persona catalog、native card connections、chat lock、pending intent 与真正新聊天信号，输出状态和候选；读取和渲染绝不写配置。

| 场景 | 显示/行为 |
| --- | --- |
| 新卡且无已关联玩家 | 提示「为此卡创建玩家角色」或「选择已有角色」；不能把当前全局活动 persona 自动认作已绑 |
| 已关联卡的新聊天 | 提示「沿用 X / 更换角色」；用户确认后仅锁当前聊天，必要时显式更新本卡选择 |
| 卡有多个关联玩家 | 列候选并请求选择；尊重原生多关联设置，不暗中全局禁用 |
| 已保存旧聊天有有效锁 | 直接恢复，不重复初始化或重绑 |
| 旧聊天无锁 | 显示未绑定状态与入口；不能仅据字段缺失认定新聊天、追补默认 |
| persona 被删除/跨世界来源不兼容 | 明确修复/适配提示，不转成「新建成功」或自动换另一身份 |
| 有 pending 创建/绑定 | 显示上次阶段及继续核对；不要开启第二个创建向导 |
| 切换 card/chat 时弹窗仍开 | 丢弃旧展示授权，保留原作用域草稿，绝不把旧确认提交到新 scope |

`index.js` 已有 CHAT_CHANGED 钩子清理 UI/任务并初始化配置，但没有上述 persona 引导。新引导应在原生 persona 自动选择/聊天元数据加载完成后读一次稳定快照；初始化事件先后顺序需宿主验证，不能凭监听注册顺序猜测。明确新的 CHAT_CREATED/创建回执比「没 persona 字段」可靠；若暂不能取得真实新聊天信号，只显示可操作提醒，不自动写入。

同卡新聊天切换玩家时，应区分「仅本聊天」和「同时作为此卡后续默认关联」。当前 select 的两个独立范围开关可保留在更换确认中，默认行为需符合用户已明确的当前卡绑定要求。任何情况下不要改其他卡或历史聊天锁。

## 最小回归

已有 `tests/user-identity-service.test.js` 覆盖：当前卡/聊天与全局默认隔离、群聊/多关联、scope 丢失、版本冲突、保存失败恢复、切聊天拒绝旧锁、档案绑定恢复、未知 descriptor 字段保留。此次只读审计未重跑或修改测试，测试存在不等于 Android 通过。

新增实现最少覆盖：

1. A 卡玩家 P 已关联，进入 B 卡创建 Q：P 文本、A 卡关联、全局 default、A 历史锁均不变；Q 仅关联 B 与本聊天。
2. 中文名、同名、含引号/竖线/宏文本按纯数据存储；创建不用姓名作为稳定 ID，不执行任何描述命令。
3. 真上传返回异常/不同 path、已占用 ID、初始化失败、设置保存失败分别保留真实阶段；不提示完整成功、不覆盖已有 persona、不自动再创建。
4. 创建中从 B 切 C：新实体可保留未绑定，但 C 卡/聊天无写入；回 B 恢复同一实体。
5. 已有卡新聊天显示沿用/切换一次；旧聊天无新字段不被误判；删除 persona 是修复态；多关联让用户选择。
6. 旧 `w.controller` 继续明确显示，只有显式迁移才清除；native identity 和档案绑定未完成时不隐瞒冲突。
7. 正常文字编辑保存说明共享 persona 影响；按卡独立创建绝不调用旧活动 persona overwrite 路径。
8. APK/Android 真机另验：原生模块导出、FormData 上传、确认保存回读、CHAT_CHANGED 顺序、切卡时中断与恢复。模拟通过不能替代此项。

## 证据边界与保存

本地附件 `upload/TauriTavern-2.4.0-android-arm64-v8a.apk` 存在，约 102 MiB；只读 ZIP 清单未发现独立 `.js` 文件，不代表 APK 没有嵌入 JS。此次以 GitHub 固定 `v2.4.0` 源码核对接口，尚未证明附件运行时导出完全一致。

关键 GitHub blob SHA：

- `src/scripts/personas.js`: `4f757f97e7992bf6d818b8cfc5411749b19843db`
- `src/scripts/slash-commands/SlashCommandParser.js`: `3c78f76b81695c8bb6b203ef933f78defbe2f06d`
- `src/scripts/tauri/setting/settings-persistence.js`: `5df272000574feaf82fb215f58bb4caf2bac3e39`
- `src-tauri/crates/tt-adapter-media/src/repositories/file_avatar_repository.rs`: `4c5342857887b1b0f4807efc04bbfaeee60bc3e5`
- `src/tauri/main/services/characters/character-form-service.js`: `ae610f53066ae1f893a1a8907de4909ed320c2b6`

本报告为父任务中间审计材料，由父任务纳入对应工作区；没有修改技能规范或既有用户存档。

## 16:19 实施补记

父任务后续授权已实现 identity 专属模块，原审计的“尚未实现”描述为实施前快照。新增 `native-persona-gateway.js`、`identity-onboarding.js`；扩展 `user-identity-service.js`、`user-identity-page.js`；补充三份测试和现有浏览器脚本的“先点编辑”步骤。入口 `index.js`、配置页未由本代理修改，由父任务接线。

真实创建按 UUID 头像上传、响应路径核对、初始化前占用检查、initPersona、确认保存、原生回读推进；之后现有 service 才绑定当前卡与聊天。失败保留阶段，不改旧身份或全局默认；上传未知不自动重传。上传回执晚于切卡时，uploaded 可能仅为内存状态，磁盘 marker 仍是 uploading；这项边界已有测试，不能视为跨重启可恢复的回执。

新卡/新聊天引导只读渲染，明确选择后绑定；原生 auto-lock 不冒充新卡确认。身份页面默认只读，编辑才进入控件；原点绑定增加独立新建路线，重新预览新 persona 再关联，保留显式编辑旧身份的功能。

验证：身份专项 38 项 Node/happy-dom 测试通过；没有执行真实 API、Chromium 新验收或 Android 实机。父任务可运行：`node --test tests/native-persona-gateway.test.js tests/identity-onboarding.test.js tests/user-identity-page.test.js tests/user-identity-service.test.js`。

额外 TT2.4 证据：`src/script.js:674` 导出 default_user_avatar；9148 await CHAT_CHANGED，9149 freshChat 时 CHAT_CREATED。`src/scripts/events.js` 值分别 chat_id_changed/chat_created/group_chat_created。`src/lib/eventemitter.js:130` 的 emit 按序 await listeners；`personas.js:2817` 的原生自动身份选择注册在 CHAT_CHANGED。空首条开场不会置 freshChat，所以 CHAT_CREATED 未覆盖该情况，父任务接线应保留边界。

## 16:34 接线完成

父任务追加 index.js 接线授权，已独占接入真实 native gateway、canonical 未绑定引导、CHAT_CREATED/GROUP_CHAT_CREATED 提示、无绑定卡只读通知、提示草稿保留及重复事件抑制。完整管理是用户身份内部页面，设置没有第二个独立目标。宿主接口在 shell fixture 由真实模块配隔离原生上传/存储替身验证，user_avatar 按宿主 live binding 模拟；新身份专项 fixture 配完整 native persona 和 fake IndexedDB，不吞掉缺接口错误。简表校对 fixture 和现行标题断言已对齐真实协议。

接线及身份总计 119 项 Node/happy-dom 测试通过；最后修复完整管理内部返回的 busy 守卫冲突后，其独立创建→绑定→内部返回测试再次通过。未执行真实网络写入、Android或新Chromium验收。index.js 和 tests/shell.test.js 已交回父任务冻结。
