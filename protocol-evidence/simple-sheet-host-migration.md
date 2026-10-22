# 模型输入、宿主与工具边界迁移

范围：基于修复候选 bb1467 的共享隔离工作区。未提交、未构建 runtime bundle、未运行全 npm test、未请求真实模型或改手机数据。

## 已接通

- `config/host.js`：request 支持显式 `typedInput`，用于内部路由、工具来源匹配与 taskSlots；模型正文由简表渲染。兼容现有本地 typed object/JSON string 调用后再转模型简表；纯文本任务的 JSON 外观引文保持原字符串。自定义 executor 获得 `input` 简表、`typedInput` 副本与 `inputFormat`，不会再把模型格式和本地数据类型混淆。自定义专用 preset 仍执行完整性检查，资料槽经过同一 renderer。
- `task-envelope.js`：文本辅助任务 `[SOURCE]` 使用 `renderModelMaterial`，原文不执行宏。
- `tables/pipes.js`：运行时 `compactMaterial` 改用展开式简表；历史 PIPES/1 编解码函数保留，用于兼容旧数据/显式交换，已无生产模型材料调用它们。原数组、对象不再 JSON.stringify 隐藏在格内。
- `tables/slots.js`：所有普通辅助槽经简表输出；未登记的新输入键进入 `state.additionalInput` 防止默默丢失。工具请求编号已在工具说明中提供时不重复送一份。删除根据原文中出现 `[PIPES.` 自动注入旧 JSON 格规范的逻辑。
- `narrativeSlot(value,text)`：主装配程序显式创建的正文资料投影使用模块私有 WeakSet 品牌，materialSlots 直接输出自然资料文本；空文本槽省略。引用材料只带同名 `narrativeText` 字段不能冒充该投影。实际 prepare→attachTableContext 路径保留对象身份；用于审计的 structuredClone 不拥有正文渲染授权。
- `tables/model-tool-sheet.js`、`config/tool-loop.js`：原有四查询工具及独立归档草案第五工具，provider JSON 封套保留，模型只填写唯一 `sheet:string` 业务参数。整批预检先解析简表，完整对象交原会话方法/validator，未授权工具或混合旧格式整批不执行。工具结果也以简表返回，工具 ID、签名、轮次、取消和预算语义保持。
- `tables/archive-tools.js`：可选原生 registerFunctionTool 适配器也使用同一 sheet 参数与结果转换；移除描述中的复杂 JSON 业务参数示例。内部 `archiveToolDefinitions` 仍是 typed schema，模型注册时经过 sheetToolDefinition，原查询/草案内部 API 不变。
- `communication.js`、`revision.js`、`user-revision.js`：场外独立任务、本轮场外要求、定向重骰、用户修改前后对照的实际模型输入改简表，配套说明不再宣称下一条 JSON。聊天持久化、身份指纹、版本比较仍用内部 JSON。

## 已验证

| 针对性命令/日志 | 结果 |
| --- | --- |
| pipes、archive-tools、tool-loop；`sheet-host-tools-tests.tap` | 32/32 通过 |
| model-material-boundary、communication、revision、user-revision；`sheet-material-branches-tests.tap` | 42/42 通过 |
| configuration 选中实际辅助、自定义预设、plain、OOC、重骰、typedInput/executor、字面引文路径；`sheet-host-config-tests.tap` | 11/11 通过 |
| tables 中真实 host/service 查询、OpenAI/Gemini 归档工具、六次续轮/三十次工具调用、草案确认界面；`sheet-host-integration-tests.tap` | 9/9 通过 |

以上共 94 项针对性测试。最后新增“引文提到旧 PIPES 不自动加入旧格规范”后 model-material-boundary 单独 4/4 复跑通过。工具输入深层 where/数组、0/false/null/undefined、稳定 ID、来源原文中的宏、换行与标点保真均有断言。语法检查通过，共享工作区 `git diff --check` 通过。

## 交接与限制

- service/prompts/modes 的任务输出简表解析和自然资料内容由 prompt_edit_audit/主代理接线；foundation/extraction/engine 由 settings_entry_audit 处理。本代理不修改这些产品文件。
- tests/tables.test.js 仅迁移第696行之后的工具 host fixture、模型业务响应和本地输入读取；对应真实host工具测试9项已通过。未宣称整个 tables 文件或全部产品回归通过。
- 旧外部自定义 executor 若自行假设 input 必为 JSON，需读取 `typedInput` 或识别 `inputFormat`；宿主无法替插件实现内部逻辑。当前 executor 测试覆盖明确新契约。
- 原生其他插件的任意第三方工具 schema、工具 HTTP 封套、provider 签名镜像、保存配置/账本 JSON 均保留。这些是宿主/外部协议或内部存储，不是本项目控制的复杂模型业务输出。
- 未做 Android、真实 API 格式成功率或最终 bundle 运行验证；当前测试只证明隔离源码路径正确。
