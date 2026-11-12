# candidate.31：小手机推进与正式归档消费

记录时间：2026-11-13（Asia/Tokyo / +09:00 会话环境；用户项目时钟另按既有断点管理）

## 已实现

- `tables/progression-prompt.js`
  - WORLD 与 PLAN 明确消费 `memory_archive`（近期正式归档）和 `memory_summary`（较早正式归档）。
  - 当前 STATE 行是现时真源；近期正式归档仅在同一事实有较新证据时覆盖较老摘要。
  - 归档不会扩大人物知情，仍受 access/knowers 约束。
  - PLAN 在有稳定 archive/source ID 时保留该 ID 作为 basis，不重新发明一份摘要。

- `phone-core.mjs` / `PHONE-PROMPT.txt`
  - 小手机生成按“当前状态 > 近期正式归档 > 较早正式归档”恢复连续性。
  - 只取与当前页面、账号和人物相关且实际可知的归档内容。
  - 作者/读者可见不等于角色知情；手机页面也不会反向公开秘密。

- `tables/prompts.js`
  - 归档提示词明确：客观事件只落一次；人物观察、听闻、推测、误信、心理与后来修正按主体/knowers分开保存。
  - 当前即时状态仍由状态/cells业务表维护；archive 保存导致状态的事件、事实与人物记忆。
  - 正式入表后由 `memory_archive` / `memory_summary` 投影供后续推进消费，不依赖本轮模型影子总结。

- 新增 `tests/archive-products-consumption.test.js`，覆盖上述提示词契约。

## 验证边界

本窗口已做：
- Git 提交树差异核对：仅相关 5 个功能/测试文件，加版本与文档文件。
- 发布后源码回读：两份 archive 投影、当前状态优先级和知情边界文字均存在。
- `package.json` 与 `manifest.json` 已统一为 `0.2.0-alpha.31.31.19-onepass.16-candidate.31`。
- main 与 work 分支均已推进到本批提交。

本窗口未做：
- 未在本地完整源码树运行 `npm test`；当前容器没有上一轮完整工作副本且无法直接联网 clone。
- 未做真实模型调用、真实宿主、Android 实测。

因此 candidate.31 是已发布实现，但本轮不能声称“2550/2550 全量回归已重新通过”。下一轮取得可执行完整源码后，应先运行新增定向测试，再跑完整门禁。
