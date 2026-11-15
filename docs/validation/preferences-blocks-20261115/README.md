# 偏好页修复与区块设计断点

本候选版本 `0.2.0-alpha.31.31.19-onepass.16-candidate.34-rp.2`，基于本地 `526ea72db6ee9c8c5c31c51b0de1a6edacb8e6f1`（与已公开 RP 候选 `da3808a2295f16d523a9a1d81528a3ba0dbe7628` 同树）。本轮只提交偏好页修复；未推送、未合入 main。

## 已实现

- 去掉新建／复制用户偏好入口，保留已有用户偏好的编辑、启停与原始反馈。
- 选择与多选只更新对应分组，保留其他编辑框、焦点、展开状态、未保存输入与滚动位置。
- 收紧字号与间距；长原文默认两行摘要，编辑器按需展开；改写与自定义收进次级折叠区。
- 保存后保留搜索、作用域、展开与滚动状态；异步加载在清空页面之前完成。
- 修复历史消息数量默认值只有 placeholder、实际输入为空的回归。

## 实际验证

- 最终 `npm test`：18 项构建一致性检查与 2627/2627 Node 测试通过；exit 0，完成于 `2026-11-15T02:03:16.675382+00:00`。见 `full-gate-final.log`、`full-gate-final-exit.json`。
- 定向偏好／历史／描写测试 13/13，见 `target-final.log`。
- 第一次全量测试发现上述历史输入回归，原失败记录 `full-gate.log`、`full-gate-exit.json` 保留；修复后全量重跑成功。
- 官方 `sites-preview` → 云 Chromium，运行生产偏好 UI、配置服务与隔离 IndexedDB 的合成宿主。实际完成单选、多选、原文编辑、保存、重新加载及故事／全局作用域切换。
- 单选／多选保留实际 DOM 节点与滚动位置；保存与冷重载保留文本及选择；360px 和 709px 无横溢；不存在新建用户偏好入口。最终见 `browser-report.json` 与 `preferences-final.jpg`。
- 页面错误区为空；浏览器基础设施有 chrome-extension 元数据传输报错，未将其误记为产品页面报错。
- 未验真实 TauriTavern、外部模型和 Android 真机。云浏览器窄屏不等于 Android 验收。

## 翻译与心声：仅示意图

用户明确要求“区块先给我看示意图不要自己做”。曾提前开始的区块实现已经撤销；`prose.js` 与基线一致，新增的区块模块／测试已删除，最终 runtime 不含该实现。

第一稿普通框体被否定。第二稿“原句引出译注”的方向获认可，心声要求重换。第三稿收细译注连线与印记，心声改成竖签、月影与开放水纹，等待用户评价。尚未定稿，不接产品代码。

第三稿会话生成图片：`/workspace/scratch/3503fb872663/generated_images/exec-838785f3-db03-415d-9880-2fdcc5e6644b.png`。图片由会话生成系统保存；这里仅记录引用，不复制为已批准的产品素材。

## 接续

工作区 `/workspace/scratch/3503fb872663/tisya-preferences`；分支 `work/preferences-blocks-20261115`。预览项目 `/workspace/scratch/3503fb872663/preference-preview`，本次官方服务实际返回 `http://127.0.0.1:4173/`，页面 `/tests/browser-preferences-ui.html`。续接先查询 `sites-preview status`，不要凭旧 URL 推定服务仍在运行。

继续按用户反馈迭代区块示意图；明确选定后才实现。偏好页候选可供检查，推送／发布按相应任务授权处理。本轮没有改预设正文或用户真实存档，也没有后台任务。
