# 世界时钟隔离补充候选

这是基于固定旧断点 5ea613fcd1b1959cc29f53f85f84f0ec6f352945 的隔离修补与可复现诊断，不是当前统一表单最新版，也不是安装发布。

本窗口检索期间，设置主线已更新到 b56937003765626ec45a5aacad9eb74c173889a6；统一表单候选已更新到 33ab08cecef94a7d7d40272e97f756fcb9c5ae77。后者已经按 world_ref 筛选时钟，不能用本旧基线覆盖它。本补充稿只保留其真实实现和测试供后续逐项合入；先审查新源码中的时钟存储绑定、跨表引用和所属世界验证，保留新余额引用、规范历法及历史刷新实现。

## 实际验证

- Node v22.16.0；phone-clock-scope.test.js 28/28 单元测试通过。
- 实际 phone-database.mjs 模块隔离模拟：原始旧断点 0/8，通过补丁后 8/8。原失败是为新增隔离要求执行的真实原模块，不是虚构旧输出。
- 模拟使用真实 common.mjs 与 phone-clock.mjs；WorldClock、手机归档边界和扩展 schema 明确用测试替身，不是完整手机集成。
- 三个修改/新增 JavaScript 文件语法检查通过。
- 全库构建、真实宿主、供应商模型、Android及浏览器像素均未执行。不能与历史1495、1763或其他窗口19项相加。
- 本稿没有重建 runtime.js；没有修改用户真实数据。原始日志沿所属工作区保存，按校验清单定位。

## 复现

```sh
node --test tests/phone-clock-scope.test.js
node --experimental-vm-modules docs/validation/phone-clock-recovery-20261110/simulate-phone-clock.mjs
git show 5ea613fcd1b1959cc29f53f85f84f0ec6f352945:engine/phone-database.mjs > /tmp/tisya-phone-clock-original.mjs
node --experimental-vm-modules docs/validation/phone-clock-recovery-20261110/simulate-phone-clock.mjs /tmp/tisya-phone-clock-original.mjs
```

最后一条预期8项失败，保留其原始stdout/stderr。先与当前唯一候选核对后再集成；不要将本分支整合覆盖main或统一表单候选。
