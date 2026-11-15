# main 发布核验

用户在收到实现结果后明确要求“推到main？”，授权当前候选及其已有基础修复发布到 `Tisyaofgit/tisya-tavern` 的 `main`。仓库 public，已连接账号与所有者均为 Tisyaofgit，权限包含 push；没有使用仓库可写权限代替本次发布授权。

发布前 main 为 `59aafd3ce554853c5385d02ed8c0962d41ab2bbb`。远端 RP 候选 `da3808a2295f16d523a9a1d81528a3ba0dbe7628` 相对 main ahead 3、behind 0，merge-base 就是 main。其文件树 `e1a02766b2414d73c60c6e88411be81e70da8b26` 与本地基线 `526ea72db6ee9c8c5c31c51b0de1a6edacb8e6f1` 的 1871 个文件逐路径、mode、blob SHA 核同，远端递归树未截断。

本地实现提交 `d70e18cd424b23767faac9ca282f8637aee74fd9` 包含偏好页和区块修复。受测清单 1176 项在发布准备时逐大小与 SHA256 再核，无变化；仅追加 README 和本次发布说明。复用原 2633/2633、最终 CSS 的 19/19 与构建／云浏览器证据，本轮未重复运行模型或 Android。

采用远端 RP 候选为父提交构建同字节发布候选，完整比对生成树后，以 `expected_sha=59aafd3ce554853c5385d02ed8c0962d41ab2bbb`、`force=false` 推进 main。若分支发生并发改变，先读回再处理，不覆盖。实际最终提交与读回核验以唯一项目蓝图和发布回执为准。

发布内容：偏好页稳定交互与紧凑布局、去除新增用户偏好入口、译注和心声定稿显示；保留此前候选的 RP、描写选项及手机修复。用户消息、真实存档和本机配置未包含在新增上传内容中。第三方附件与独立图鉴工作区未修改。

工作区 `/workspace/scratch/3503fb872663/tisya-preferences`，发布时钟 `/workspace/scratch/3503fb872663/control/main-publish-clock.json`：02:44:28 UTC 至 03:44:28 UTC，本轮为用户明确发起的发布阶段。
