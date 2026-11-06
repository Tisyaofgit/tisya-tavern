# 并发实施核验交接

主实施仍为唯一蓝图指定的 legacy-new；本目录 matrix/ 为补充检验候选，未合并或安装。不要把两套状态写入器同时接入。已保留主实施的持续更新，没有改其源码。

当前观察到的待核接点（静态审查，不冒称真实宿主复现）：

1. 主实施 index.js 的新版 finishMainGeneration 调用 revisionController.ended(false) 后直接 matrixHost.event('GENERATION_ENDED')。这与同文件旧路径“先让候选所有者 validateRevision，再 archive”的约定不一致。建议返回 delegated 后延后提交，并让 archive('matrix') 只对已接纳候选执行。
2. 定向重骰仍只 setRevision 到 configHost；新版最终请求跳过 configHost.payloadReady，engine/host.mjs 未调用 revisionMessages。相同路径也跳过 communication.directions 的请求追加。须用真实最终请求分别验证定向改写、用户改写对照、场外要求三条输入链，不能仅验证普通正文。
3. engine/controller.mjs 将 GENERATION_STOPPED 与 GENERATION_ENDED 一样运行 reconcile。应明确停止后已闭合但未接受的回复是否可结算，并用失败/停止边界用例验证，而非依据有闭合XML就采纳。
4. initializeState 的 catalog 有139表；已验证新版 state 的定义为141表，额外 X_FRONTEND_MAPPING / X_CODEX_COMPASSES。先按当前源映射核这两张为动态附加还是必需定义，不凭数字选择“最新版”。
5. 主实施空状态的材料字典只列已有记录使用列，首次无表名/字段字典，模型不能凭空猜 @ROW+ 字段。可复用补充候选 INITIAL_TABLES 的按需字典，但应先确定空卡初始化入口和批准数据来源。
6. 两份材料投射都需进一步对原 material_text.py 核人物档案+滤镜+十维锚点单次附着，以及事件/正式archive按事件短号去重。原代码本身将偏好滤镜按sheet路由到task_material，与render_slots的focus处理不吻合，也应留下修正证据。

补充检验已完成：全回归1386/1386通过；之后追加JS/Python差分17项通过（包括公式、历法、稳定ID、超过700骰点序列、事务回滚与重开）。这些结果只适用于补充候选，不能转写为主实施或Android验收。

用户的完成提醒只保留 Automation_b8e7395d95b881919a282dd2be486a53。旧重复任务已经停用；原启用任务的首次尝试失败，没有完成产出，已更新为UTC14:00起每小时检查。仅在整项完成时发通知，不驱动后台开发。

精确下一步：主实施窗口收束后，先比上述文件散列；若已修改则重新核实际接线。优先核最终请求输入链与候选提交顺序，再择项采用差分测试、随机核和标签解析测试。窗口仍沿UTC12:22:16起，硬截止13:52:16，不因并发审查延长。
