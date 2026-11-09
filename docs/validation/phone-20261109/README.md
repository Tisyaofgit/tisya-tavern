# 虚拟手机接续原始证据

本目录保存被中断窗口及刚接续时的实际检查输出；不宣称它们是后续恢复逻辑修订的最终验收。每份原件的来源、路径、字节数和 SHA256 在 `catalog.json`。内容相同的原件仅存一份，原路径作为精确别名保留。

`prior-window/candidate-full-tests-final.txt` 是上一轮全套 1565 项通过记录，但原日志没有绑定完整源码清单。`phone-final-focused-first-failure.tap` 仍是 65/66 的失败原件；文件名含 final 不表示通过。宿主专项的多轮原始失败和最后通过分别保留。

`resume-verification` 记录恢复逻辑修订前、实际当前文件上的专项补验：phone 92/92、shell 78/78、打包 DOM 3/3，以及两项确定性构建检查。其源码清单只代表当时读取的修订。后续源码变更须另存同点结果。

`prior-window/local-candidate-tree-check.json` 的 tree 字段错误地重复了 commit；原件保留作为更正依据。实际基底 commit 为 `72522564bfe75a80298396d4636c48c6f34f7d57`，对应 tree 为 `4996dce81ff2723f5b450363b96826237d68bb72`。

DOM 通过不代表浏览器布局、真实宿主、模型 API 或 Android 已验证。两份浏览器启动/下载原始失败保留；它们不证明所有浏览器渠道都不可用。

本批没有保存 Library 全库清单、真实聊天状态、账号资料或凭据。宿主 bookmarks 源码是公开的固定来源，仅用于核实原生分支 metadata 契约。

## 同点清单与恢复工具

`verify_phone_snapshot.py` 使用 `git ls-files` 的已跟踪与未忽略新增集合；排除 `.git`、`node_modules`、`__pycache__` 和 `.pyc`。删除的跟踪文件另行记录；每个实际文件保存字节数、SHA256、Git blob SHA1 和可执行位。双遍清单发现并发变化就失败。符号链接、越界路径、缺文件、字节变化或已有恢复目标均拒绝。

写入者完成修订、构建和所需测试后，再使用 `manifest --repo <源码根> --output <源码根外的清单路径> --phase frozen`。本工具不会替使用者冻结后台写入者。清单放在源根外可以避免自校验循环；如必须随源码保存，显式用 `--exclude` 记下仅清单自身路径，再用固定 Git tree 锚定清单文件。

`restore --manifest <清单> --source <同点源码根> --destination <不存在的目标> --report <报告路径>` 会按清单复制并逐文件验证；`archive --manifest <清单> --repo <仓库> --commit <固定提交> --destination <不存在的目标> --report <报告路径>` 则从固定 Git archive 恢复并核同。`verify --manifest <清单> --source <恢复根> --report <报告路径>` 可独立复核。

`snapshot-tool-self-check.json` 的8项通过只验证此工具的独立合成夹具，包括二进制/中文/执行权限、实际 Git blob SHA、按清单和固定提交恢复、错误路径与变化字节拒绝。它不表示当前仍在修改的产品源码已封存或恢复通过。

## 本轮修复后的最终验证

`final-validation/final-validation-summary.json` 是12:16:18 UTC确认的最终结果：完整 `npm test` **1575/1575**，phone＋shell专项 **180/180**，打包DOM **3/3**，两项确定性构建与 `git diff --check` 均通过。1131项原有产品/测试/资源文件在验证前后大小、SHA256和模式完全一致。`final-validation-progress.json` 只是当时的中间进度原件，最终状态以上述summary为准。

`repair/phone-review-first-failure.txt` 的实际记录是phone-host **28项中27过1败**，暴露分支恢复对象导出形态问题；修后focused58/58、regression178/178、final180/180分别保留。最初两个业务故障的前置纯内存复现曾在工具控制台执行，未单独留下脚本/输出文件；本目录不冒称保存了该两条最初控制台原件。当前修复与新增回归的实际源码随候选Git保存。

追加本证据目录仅增加文档与原始日志；产品源码相对最终验证清单的逐文件核同见 `product-after-evidence-check.json`。完整最终候选清单在源码根 `PHONE-RESTORE.json`；它排除自身，最终由同一Git提交/树锚定自身字节。
