# W73 Gemini混合封装漏读修复

用户onepass.14诊断显示HTTP200、103054接收字节、4帧、DONE、STOP，顶层candidates/usageMetadata/choices，delta含candidates/usageMetadata/native。旧解析优先choices而只读delta.content，漏掉Gemini parts。只有字段及诊断，没有原始parts；不能推断全部字节都是可见正文。另DeepSeek处于thinking/未DONE，不能判作同一故障。

reproduction.json使用旧HEAD解析器和修补后的解析器处理同一个构造的宿主形状响应：35032字符、超过100KB，旧版EMPTY/0字符，新版逐字符一致。它是模拟响应，不是真实供应商输出。原生宿主源码src/scripts/openai.js的getStreamingReply另有Gemini candidates分支，说明不能将所有choices外壳一概按普通OpenAI正文处理；用户实际宿主版本未知，未宣称安装设备实测。

共享readTaskResponse/readToolResponse识别嵌套delta.candidates、顶层candidates、非流Gemini正文；只读非thought文本，镜像正文取一次，不同则拒绝猜测。原生及外层任一错误结束标记均优先，不能用内层STOP掩盖外层length；DONE仍不能掩盖截断。未授权工具调用、非文本块与格式错误继续拒绝。空choices元数据帧沿用原语义跳过。旧诊断、失败正文、脱敏复制及下载保留。

回归包含模拟宿主100KB分片、多表示镜像去重、思考剔除、顶层/嵌套/非流、截断/未授权工具/坏格式，以及这种响应进入真实创世UI→校验→预览→确认保存→3条表行回读→下一轮资料注入、旧世界不变。创世内容由测试构造；不等于真实模型会正确生成格式。

first-full.tap保留首次全套1358项中的1个既有抗截断回归失败：新分派误将choices=[]元数据帧当作无支持格式；恢复跳过语义，保留原断言。pre-final.tap为修正后1358全过；其后补外层截断不能被内层STOP覆盖的防护及回归，parser-final.tap专项23通过；最终结果以full.tap和results.json为准。没有跳过失败测试。

没有真实模型调用、安装宿主或Android实测，未触碰用户手机存档。修复确定可复现的封装漏读，不凭模拟承诺任意供应商输出都符合创世schema。预设Tisya.json不变；只更新扩展并完整重启。
