# 既有极简填表与当前自动任务协议核对

本轮只读证据审计；不把新增设计冒充旧约定。源码以 settings-ui-work 当前工作树为准。

## 结论

用户说的极简填表有真实实现：人物提炼使用 compact-v2 的“分组＋稳定行号＋字段名＋值”，而且已接通手动提炼、保存原答、预览、审核入档。自动 tableArchive / plotAdvance / preferenceAnalysis / templateInit 等仍让模型返回严格 JSON，尚未改成这套简表。输入资料压缩 PIPES/1 与辅助模型输出简表不是同一层。不能因为存在 PIPES 编解码器就宣称自动填表已经极简化。

preview/foundation-sheet/README.md 的末尾“未合入生产”是旧说明；当前 tables/foundation-service.js 和 tables/panel.js 已证明手动审核入档接通，应以实际调用链为准。

## 一、人物极简填写：已实现且手动入档贯通

真源：tables/foundation/extraction.js、extraction-layout.js、engine.js；生产接入 tables/foundation-intake.js / foundation-service.js。

准确的现有空子表（按当前目录自动生成，不重编号）：

```text
【前史／1】
1 名称：
2 经过：
5 时期：
6 地点：
7 参与者：
10 延续影响：
12 涉及对象：
13 当时理解：

【关系／1】
1 名称：
5 关系对象：
6 性质：
7 形成经过：
8 相处方式：
9 主体边界：

【隐情／1】
1 名称：
2 真相：
4 关联对象：
5 可观察线索：
6 揭示条件：
7 影响范围：
```

人物主表用【人物／核心】【人物／身份】等实际目录分组。compact-v2 主表选40格；原45格目录未重编号。前史8格、关系6格、隐情6格。子表数量按内容确定，不强制固定条数。空表只是准确格式示例，不是已有事实。

- 每行 `行号 字段名：值`；中文/英文冒号可省，行号和字段名保持。未知值空着，但必须保留本次要求的行。缺行/重复行/错字段明确失败。
- 普通文字原样，不要求JSON引号、Markdown竖线或HTML转义；不把 `\|` 当通用转义。物理换行是一条新字段行，当前实现没有通用多行文本续行协议。
- 仅 texts / refs 列用中文或英文分号分项，`无` 或 `[]` 是明确空列表。普通 text 中的分号不拆；单项字面分号用表格手工编辑，模型简表暂无通用保留该歧义方案。
- text 的 `""` 是显式空串；空白是未填写。数字0正常保留；布尔是/否/true/false正常保留。null不会被全局当未知：只有 json/nullable 等符合字段类型的结构输入才可表示null；text的裸null仍是文字。原有 array/map/object/json 单格仍走 JSON.parse，是现存未完全简化的边界，不能说任意嵌套已自然简表化。
- ref/refs只解析本次批准对象的显示名称到稳定ID，同名消歧；未知对象拒绝，不能猜ID或隐含建档。
- 填写文本不让模型写 access 大对象。foundationInputProposal 程序映射：隐情 readers=[]，其他 readers=['读者']，全部 knowers=[]；父人物绑定和关联不等于知情。用户预览审核后才提交，不能据解析成功宣称语义已正确。
- 当前生产流程是导出请求→用户外部填写/粘回→保存原答→预览→审核入档；没有接成自动 tableArchive 提取所有业务表。

## 二、状态极简：已实现的独立登记简表

真源 tables/state-registry.js / state-form.js / service.js。

```text
项目｜是否开启｜等级｜额外效果
本次已登记项目名｜？｜？｜？
```

准确表头为全角 `｜`。前三处分隔符决定四列，之后的分隔符属于效果文字。只接受已登记且唯一项目名，能投影到单等级轴才有此表。是/否=布尔；？或?=未知；/=明确没有；空白=本次未填、不修改。缺少登记列只能空白或/。数字等级沿实际注册含义；未受训不推断技能水平。单字段形式是 `是否开启[项目名]：是` 等实际词表；不是通用归档/创世格式。原生引用/变量状态不能由此镜像覆写。

## 三、输入 PIPES/1：已实现输入压缩，不是变更输出

真源 tables/pipes.js；tables/slots.js 的 materialSlots/slotText，config/host.js 的 auxiliary装配真实使用。

下例由 rowsToPipes 实际生成：

```text
[PIPES.ROWS/1]
权限：a0|{"readers":["读者"],"knowers":[]}
列：state|名称|值|启用|未知|空文本|备注
档：0|r1|1|null|a0|~|state|示例|0|false|null|""|"甲|乙\n丙"
[/PIPES.ROWS/1]
```

- 权限行两格：ACL编号|原access对象；列行：表ID|字段名…；档前7格：原序|ID|修订|来源|权限编号|其他元数据|表ID，后面按列取值。末尾未提供列省略。
- ~在这里仅表示字段缺失；null、false、0、空串、[]、{}分开保留；字面“~”“null”“0”等字符串必须JSON引号。含竖线/换行/引号/保留字符等用JSON字符串。JSON unicode转义隔离标签及模板起始字符。
- 完整记录必须有readers/knowers数组。仅referenceOnly身份薄引用允许权限格~，含义是没有提供权限，绝不是公开，也不是已读全文。身份薄引用只携名称/类型/别名。父子与关联不传播ACL。
- schema块为 [PIPES.SCHEMA/1]；行标识录入、表模、类型、字段。字段五格：名称|类型|其他约束|录入模板|注入条件。表模/类型元数据和嵌套约束仍是JSON格。
- taskSlots 把 currentRows 映射rows，把registry映射schema后压缩；其他来源/控制元数据仍可能JSON。这是已实现的输入混合表达，不等于全面自然简表目标。

## 四、reply行协议：已实现，但职责不同

- 活跃结构化回复的 memory format="pipes" 用中文行标识+固定ASCII |列。例如 `事件：队员甲、队员乙|A|两人完成公开谢幕。`，`原文：段落1、3`，`心理：队员甲|C|仍有些紧张|本轮已授权描写`。
- 含竖线/换行的文本格用严格JSON字符串，然后按XML文本转义&和<；裸反斜杠不能转义竖线。每行固定列数。memory的~在权限格表示公开，在其他允许字段表示缺省，**不可套到PIPES.ROWS的ACL规则**。
- A公开/B现场实际接触/C个人私有/D定向秘密/E作者后台；读者展示与角色知情分开。明确作用域权限仍支持[level,read_auth,emit_auth,knowers]；[]是已知无对象，null是未确定，不能视为公开。
- 主叙事启用辅助表单归档时，config/memory-output.js.applyTableArchiveMemory 会把事件摘要写入关掉，memory仅保留必要的原生status/vars/extra权限注记，无注记 `<memory/>`。因此自动表单不消费此memory作为新的归档事实真源。
- archive 当前输出模板是 `<archive/>`，不是已经存在的通用表单变更行协议。
- vars 的当前活跃路线保留原卡JSONPatch/XML脚本方言，唯一放vars；无操作 `<vars/>`，原生脚本唯一结算。它不是通用极简业务表。
- reader-core还带旧 format="rows"分组兼容编解码：vars的 `- replace` +路径|值、memory分组等。当前发行提示词主要用pipes及原生vars；不能把旧兼容reader说成自动tableArchive输出已采用。

## 五、当前自动辅助任务严格JSON链及目标缺口

真实链：service.invoke→request(task, JSON.stringify(input))→host把input拆资料槽→auxiliaryEntries/taskWorkflow提示严格JSON→HTTP返回文本→service.parseJSONResponse→各任务业务校验→commit/journal。HTTP外壳和内存对象不是模型必须输出JSON的理由。

真实archive现有对象契约包括 templates/schemaChanges/changes/pending；changes每项 id/table/expected/values/access/evidence。这套对象仍是校验和存储内部接口，未来简表应由程序解析映射到它；不能只把整对象包进“1 结果：{...}”叫简化。

目标两阶段、全辅助任务简表尚未落地。本次授权应逐任务明确字段目录、固定/可变子表、来源/修订/ACL由程序绑定规则、缺省/清空/删除语义以及嵌套值拆分。特别是新模板、任意对象数组、原卡变量结构和工具参数，需要正式覆盖；没有现存统一“极简归档+世界+偏好”模板可直接引用为旧定稿。

技能data-contract D04/N05要求0/false/空容器保留、ACL与父项顺序压缩无损；narrative-memory要求状态/历史/原文分工；prompt-assembly要求模型格式变更须同步模板、解析与消费。这些约束已存在，但没有定义可替代上述各套语法的统一新行格式。
