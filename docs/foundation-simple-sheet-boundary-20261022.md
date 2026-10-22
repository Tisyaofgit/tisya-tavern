# 基础表复杂格与生成契约的简表边界

本轮仅迁移模型输入/输出，内部存档、API 封套和原校验器保留。

| 路径 | 结果 |
| --- | --- |
| foundation engine 默认文本请求 | array/map/object/json 字段改为共享 simple-sheet 简表，字段行后用两空格续行嵌入；内部子表保留 |
| foundation engine Markdown 请求 | 同一 codec；完整简表在一个 B 格以 `<br>` 分行，沿用原转义规则 |
| foundation extraction/layout | 动态检测复杂字段并提供规范，内层子表标题不误作人物分组；保留字段行/未知空格/子表数量检查 |
| 嵌套关联 | 仅按 schema 中 ref/refs 定义解析授权名称，不扫描普通文本；转换为已有 ID 后继续原引用验证 |
| config/contracts.js | 内部对象 validator 保留；MODE_CONTRACT 移除模型必须 JSON 的旧文案；工作流缺失依赖/循环拒绝不变 |
| 实际创世 | service.validateBlueprint 继续调用 genesis/workflow 验证器；模型任务通用解析由 service 与 host 的所有者接线 |
| workflow/markup 生成 | 目前仅公开契约，没有独立执行驱动；不能声称新增完整生成器 |
| panel 与表单参考导出 | 用户提示、导出文件开头改为实际任务简表；历史文档和冻结 vendor 来源不改 |

复杂格明确保留 0、false、null、空文本、空对象、空数组、嵌套数组、精确多行文本和字面符号。原简单标量拼写仍可读取；不再用 JSON.parse 接受复杂模型格。失败不写任何选中记录，ticket 保留以便修正重试；人工已填字段、范围版本保护和原 schema 校验未放宽。

新增 `tests/foundation-complex-sheet.test.js` 六项；与现有 simple-sheet、sheet、extraction、compact-extraction、numeric-extraction 六个测试文件合计 **51/51 通过**。三个 extractionSource 测试读取器改用共享 codec，原来源完整性、语义保留与拒绝截断等断言保留。

未执行真实模型请求、全量 npm test 或 bundle 构建。独立预览 dist HTML、runtime 及导出参考文件须由最终构建步骤统一刷新；本轮未手改生成物。现行人物目录本身没有复杂字段，复杂提炼分组适配由合成字段回归验证；实际复杂格来自会话状态、场景标志、关系维度/印象及活动资源。

`config/workflow.js` 的 `@DEFINE @OUT` 是内部输出计划数据，不要求模型打印 JSON，保持原语义。冻结 settings-core/vendor 的历史 world-generation JSON 字样不是本轮运行任务提示的直接修改入口；生产辅助模式由任务 mode compiler 替换，最终注入文本仍由整合验证确认。主文 memory/heart 和外部原生 MVU 更新协议由相应所有者单独审计。
