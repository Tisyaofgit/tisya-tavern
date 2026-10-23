# 本轮界面接线范围与最小验证

只读审计；未改产品源码。根任务窗口 8 截止 2026-10-22T22:42:30Z。源码起点 `ce63e5a7258f9782cbde7d54cb49837404091dad`。

## 现成链路

唯一入口：`settings-home.js` / `settings-navigation.js` 的“游玩偏好” → `config/panel.js` `initialTab='play'` → 现有“语言与对白”同层子页（`mountSectionNavigation` 管导航）。`languageFields` 已独占默认输出语言与角色双语，不应再往 mode/world 页各放一套。

修改 → `field`/`check` 的 autosave → `change(true,true)` → `preferenceSettings` → `draft.游玩偏好` → `savePreferences` → `createStore.save` → `validateConfig` → `storedConfiguration` → 宿主 `persist()` 真回执。失败维持可见草稿、保留原持久值；已有手动未保存修改时不偷带提交。世界数据和人物绑定留原作用域。

读取 → `configuredWorld` 把全局银行投射到当前 mode；开启面板不写盘、不迁移。`PREFERENCE_FIELDS` 同时决定读投射、保存剥离、导出和校验，新增控制必须一同登记。

实际请求 → `narrative-bridge.js:compileNarrative` 的 modular 模式 → `config/compiler.js:refineCompiled` → `renderProtocol` / workflow 选择与压缩 → `rest.entries`。
* 原生上下文：`registerLivePreset` 提供 `tisya_live_*` 宏，缓存键含完整 `currentConfiguration(ctx)`；新 mode 字段只要进入全局银行即能使缓存失效。`config/host.js:payloadReady` 原生路径只观察并保留宿主 messages。
* 插件控制上下文：`createHost.before`/`payloadReady` 构建实际完整 messages，使用同一宏/编译结果。最终请求测试必须覆盖两种所有者，不能只断言内存配置。

## 已有双语

`config/language.js` 的 `languageView` / `setDefaultLanguage` / `setDialogueLanguage` / `validateDialogueLanguage` / `applyDialogueLanguage` 已完整接线。语言开关不新增人物能力、不重复同语发言或旁白；已知人物/环境语言与指定语言各有分支，未知母语不能凭名字猜。

`applyDialogueLanguage` 目前写 `stepwiseRules.C08`；`deduplicateLanguageDelivery` 确保对应完整合同一次落位。现有测试覆盖 `full/compact/format`、默认语言、指定原语、关闭、旧双语迁移、不写入地打开、原生与控制请求、plain。无需新造第二个双语 UI。

## 两项新控制的最小接法

建议真实存储字段使用可选布尔 `保留用户口癖`、`延续用户叙事口吻`，与 `角色对白` 同属 mode 全局偏好，缺省不改变历史行为。审稿中的 true 是审稿选值，不自动覆盖用户现值或为旧存档补 true。

界面放现有“语言与对白”页，显示“保留我的说话习惯”“沿用我的叙事口吻”。短说明分别为“润色我已给出的对白时，保留称呼、用词和语气。”“跟随我本轮叙述的节奏与措辞，人物对白仍各用自己的声口。”不另开页面，不向用户显示编译/注入/内部步骤。

文件责任建议：
1. `config/user-voice.js` 新模块：两字段常量、严格 optional-boolean 校验、投射当前选择的规则；true/false/absent 区分，不用 `Boolean()` 吞掉字符串、null 或对象。语义以本轮英文主稿为准。
2. `config/core.js`：两字段加入 `PREFERENCE_FIELDS`；`validateConfig` 每个有效 mode 调校验，包含全局银行构造的校验 fixture。
3. `config/panel.js`：`languageFields` 增两控件，用已有 autosave 和全局保存机制。
4. `config/compiler.js`：在用户手改原规则已解析后引入新规则，避免手改文本覆盖新控件，也避免新控件覆盖既有授权。若根代理本轮接新英文预设，则直接投射到 UserPreferences 的 `SpeechHabits` 与 `DictionAndStyle` 唯一槽；不要通过全局字符串替换或重复拼进多个阶段。若暂留旧协议，挂在实际输出消费者并核全部详略模式，不另开 API。
5. `tests/user-voice.test.js` 或合入现有 persistence/configuration 测试，保留英文审稿行为断言；`config/README.md` 更新两项的唯一归属。生成 bundle/preset 由根代理统一构建，避免多个代理改生成产物。

`保留用户口癖` 仅在有权呈现用户言语时生效，不增加玩家言行权限、不把口癖复制给 NPC、不把单次虚构发言固化成长期偏好。`延续用户叙事口吻` 仅把实际本轮叙述作为措辞节奏依据，排除人物对白和场外要求；不得改变既定视角、输出语言、事实或代演权限。

## 实测的漏接风险

以当前未修改模块做只读内存 probe：给 `world.modes.narrative` 添加 `保留用户口癖='invalid'` 与 `延续用户叙事口吻=true`，`validateConfig` 接受了未登记 mode 扩展字段，但 `preferenceSettings` 两个字段都没有投射。现有功能未宣称支持它们，因此不是“已有功能丢失”；证明只加 UI 而不同时加白名单/验证/编译会静默漏存且接受非法值。新字段落 `游玩偏好` 时反而会因未知键拒绝，不能用绕开银行或落世界私有字段的方法修。

现有 `角色对白` 的 null、false、空对象、字符串四个无效值全部被 `validateConfig` 明确拒绝为“角色对白语言配置损坏”；没有观察到非法值回默认。指定语言空值的保存失败、重试及读回已有回归，不需重写。

## 接线后必须观察的最小结果

* UI 各标签只有一个有效控件；打开不写盘，on/off 自动保存且新卡/新聊天/群组与独立进程重开一致；schema 3 世界条目不保存第二份。
* false 真保存；undefined 沿旧行为；null/0/1/空串/'false'/数组/对象被明确拒绝，保存修订和旧盘值不变。
* 保存失败保留 UI 草稿，明示错误；重试成功；另一设置页未保存编辑不会被自动带走；过期页拒绝覆盖。
* 两控制独立变化、四种布尔组合、three guide details、structured/plain、native/tisya 所有者；最终展开 messages 中各规则一次，关项无残留，用户原输入一次，不改原始消息。
* 新控制 true 不改变 A01/A02/A04/B01/C08、双语控制、原 input-rendering 选择、表单业务或额外调用次数。
* 开关改变后同一个已注册 live macro 返回新文本，避免缓存旧值；关闭后不回写用户配置。

可复用已有测试：`tests/configuration.test.js` 的 language 四组和 `tests/preference-persistence.test.js` 的自动保存/失败/跨卡/独立进程/过期页；本次只补与两字段不同的契约和整条请求证据。运行 Node/happy-dom 是模拟宿主，不报告 Android 或真实模型通过。
