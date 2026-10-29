# W78 格式兼容、语义英文化与响应配置

用户授权：放宽可判定的格式变体；中文角色主动性提示语义英文化；极速模式独立选开；默认质量参数最高推理、长回复、温度1.2、交错思维活动工具链；完整OpenAI请求体/响应格式下三轮猫互动后才交付。对象未建档及未实现接入口单列能力缺口，不计作格式错误。

## 解析边界

展示摘要接受：Markdown表格边界、列表标记、全角管道（该行没有半角管道时）、已列语义标签别名、保留原名的附加展示说明、设计行缺省的附加说明、任务缺省触发说明、心声说明内额外管道和过长心声。附加展示说明只进展示任务，不授予状态、证据或权限语义。全空心声占位不绘成“~”气泡。

行动建议接受语义明确的类别别名；未知非空展示类别保留原类别元数据并归“其他”；缺省影响说明保留空值；额外影响文字保留合并。行动正文缺失仍失败。生成仍要求原骨架与列数，不把兼容列表写成模型菜单。

机器共用行增加命名列：字段名=值，独立核对字段名，拒绝重复名、未知名及混合位置/命名列。新版骨架用命名列，旧位置行继续读；字段全集与顺序不删。证据只归一明确列举的P段号（大小写、逗号/空白及外方括号），不猜测错位列，不展开范围、不生成证据，段号存在性继续由实际正文校验。ID、权限、版本、类型、原值和唯一提交名单契约保留。

## 角色主动性翻译覆盖

| 原语义 | 英文所有者 |
|---|---|
| 自主表达感受、判断、偏好；话题/提议/拒绝/小动作；不只复述/附和/返问 | Character-led interaction |
| 按自身目标、已有事务和机会发起接触、要求、拒绝、坚持、代价选择 | Proactive scene progression |
| 无需玩家逐项授权NPC；玩家重大选择、代写与内心权限独立 | NPC agency; independent player authorship permissions |
| NPC决定不等于玩家同意，不自动完成共同活动或改变关系 | proposal versus consent, enactment and relational change |
| 所选停点和授权片段仍有效 | decision boundary and explicit scene scope |
| 实际知情、性格、能力、资源、因果 | knowledge, disposition, competence, resources and causal circumstances |
| 不虚构过去或泄密造转折 | retained explicit prohibition |
| 意愿分歧、计划落空、平静相处；不强塞冲突事故惊喜 | divergent intentions, failed plans, quiet companionship |
| 本轮已执行行为及合理后果可成事实；未执行计划候选未知仍未定 | enactment versus unsettled plans/candidates/outcomes |

中文协议键、中文枚举、实际禁词/正则和用户资料保留原文。其余默认连续中文指令已核，未全局翻译用户编辑或世界设定。

## 响应配置

发行默认 temperature=1.2, reasoning_effort=max, verbosity=high, show_thoughts=true, tool_reasoning_mode=active_chain, function_calling=true, openai_max_tokens=32768。按TT原生字段映射；未覆盖既有连接或其他预设。扩展自动刷新保留用户当前采样/API设置，新导入/选择预设采用上述发行默认。

极速块默认关闭，新增一个独立system条目，原62条目角色/顺序/开关元数据保留。插件偏好开关在既有顶部注入同一极速块；原生预设开启独立条目时不重复注入。关闭不删除身份/流程/骨架。极速只注入用户已实测的速度文字及一次规划/一次结构核查，不声称更改厂商模型内部思考或实测延迟。

## 验证类型

1379自动化测试通过。模型测试是用户授权子代理按完整role-labelled OpenAI请求体模拟，不是HTTP调用厂商API或Android实机。请求由实际createHost.before/payloadReady装配，当前注入完整、11块与状态匹配。响应经readTaskResponse和同版one-pass解析器检查；另在隔离视图运行归档提案准备，能力缺口与格式失败分列。原始响应不可修改，三轮不改变源版提示词，所有实际失败保留。
