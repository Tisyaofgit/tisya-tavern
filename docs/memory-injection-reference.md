# 前文记忆注入的参考与范围

用户指定参考：<https://github.com/AlbusKen/shujuku>。阅读快照：`63aacfb4b989e88b76681abf0b3df821cf0dfebb`。

检查的主要模块：

- `summary-vector-index-runtime.ts`：区分固定近期行与较早的候选行；召回结果按行去重，最终恢复原始顺序，错误不伪装为成功。
- `summary-vector-hybrid-retrieval.ts`：BM25 与稠密候选融合；缓存按索引和修订隔离。
- `summary-vector-index-content-pack.ts`：内容、来源指纹、模型与维度分开记录。
- `injection-engine-order.ts`、`injection-engine-entries.ts`：存档与实际注入位置分工。

本版按用户明确的简单默认规则实现：全部窗口外记忆块 → 按来源顺序 → 近期聊天之前。采用来源隔离、去重、时序和失败可见的原则；未复制第三方代码，也未将向量检索、表格数据库或世界书同步宣称为已实现功能。

原生聊天是唯一来源，记忆是逐次生成的请求视图。未建立独立可编辑副本；更换聊天、编辑、删除、切换候选后直接依据有效消息重建。
