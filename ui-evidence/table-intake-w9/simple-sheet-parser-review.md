# 简表解析及实际落地校验只读审计

审计时间：2026-10-23 04:18–04:25 UTC。工作树：`/workspace/scratch/b5f88d8e1157/settings-ui-work`。未修改源码、未运行全套测试、未调用模型或实际宿主；保存复现仅使用内存 mock host。

## 结论

共享 `tables/simple-sheet.js` codec 本身未发现本次可复现的字段、序号、类型或尾部静默丢失。找到一处**确证的 codec→领域校验→持久化边界缺口**：合法 `〈缺失〉` 进入开放对象后，通过 `prepareCommit`，保存成功却被 JSON 持久化删除或变成 null。另记录 foundation 普通文本格的空白裁剪行为和 service 原始供应商封套入口的接入约束；不能把二者泛化成共享 codec 主链损坏。

仓库内不存在所指的 `tables/output*.js`。本次实际检查替代路径为 `tables/service.js`、`config/contracts.js`、`tables/foundation/engine.js`，并为确认真实尾部与落地行为追到 `config/stream-response.js`、`config/host.js`、`tables/schema.js`、`tables/ledger.js`、`tables/books.js`。

## F1：合法明确缺失值在成功保存后消失或转型（确证）

路径与函数：

- `tables/simple-sheet.js:174–199` / `decodeCell`：`〈缺失〉` 解为 `undefined`，`〈数值〉-0` 保持负零；这是 codec 明确支持的值。
- `tables/service.js:49–53` / `parseTableTaskResponse`：合法简表完整解码。
- `tables/schema.js:98–99` / `valueValid`：无 `fields` 的 object 不递归检查内部值；json 仅排除最外层 undefined。
- `tables/ledger.js:51–94` / `prepareCommit`：开放 `scene.标志` 接受并保留以下值。
- `tables/books.js:24–26` / `createBookGateway().write`：`JSON.stringify(next)` 删除对象内 undefined，把数组 undefined 变为 null，把 -0 变为 0；成功条件比较的是已经转换后的 encoded digest，因此正常返回保存成功。

最小业务输入（由 `formatSimpleSheet` 生成，绝非非法 JS 类型或伪造用户资料）：

```js
const proposal = {
  changes: [{
    id: 'new:scene', table: 'scene', expected: 0,
    values: {
      名称: '测试场景',
      标志: { declared: undefined, items: [undefined], negzero: -0 }
    },
    access: { readers: ['读者'], knowers: [] },
    evidence: '测试依据'
  }]
};
```

相关合法简表子段：

```text
【子表4】
1 declared：〈缺失〉
2 items：〈列表〉子表5
3 negzero：〈数值〉-0

【子表5】
1 项：〈缺失〉
```

实际执行链：`formatSimpleSheet(proposal)` → `parseTableTaskResponse('tableArchive', wire)` → `prepareCommit({registry: defaultRegistry(), rows: [], last: null}, parsed, {source:null, evidence:'测试依据', allowedTables:['scene']})` → 将 prepared.commit 放入真实 gateway 创建的 session 的 commits → `books.write(snapshot,next)`。

| 检查点 | 实际结果 |
| --- | --- |
| prepare 后 own `declared` | true，值为 undefined |
| prepare 后 `items[0]` | undefined |
| prepare 后 `Object.is(negzero,-0)` | true |
| gateway write 返回 | 成功；revision 正常递增 |
| 成功回读的 `标志` | `{"items":[null],"negzero":0}` |
| 回读 own `declared` | false |

预期：若存储契约接受 codec 这些值，应保持 own 缺失与未列字段、null、负零的区别；若存储只接受 JSON 数据，应在业务预检阶段显式拒绝不可持久值，不能成功写入后静默变形。优先解决 undefined 对象字段丢失与数组元素转为 null；负零是同一边界的附带观察，可能需要单独明确领域语义。

本轮边界建议仅限：在入库前增加递归可表达性预检，对不能被既有 JSON 存储无损表示的值显式拒绝，并给出精确路径；补跨保存边界的定向回归。不建议本轮改 schema 或持久化编码，也不要在 codec 中把 `〈缺失〉` 偷改成 null。现有 `tests/simple-sheet.test.js` 与 `tests/table-simple-sheet.test.js` 只证明解析阶段保留 undefined/-0，没有跨保存回读覆盖此例。

现行格式与测试确实允许这些值，不能以“输入本来非法”排除此例：

- `tables/simple-sheet.js:233` 原文：“明确缺失值写〈缺失〉；未提供的对象字段直接不列出。”这已经将显式缺失与未列字段区分。
- `tests/simple-sheet.test.js:23–24` 显式断言 `{set:undefined}` 解码后 `Object.hasOwn(value,'set') === true`，同时未提供的 absent 为 false；第 15 行另覆盖嵌套自有 missing。
- 列表各项使用同一 scalar codec；`tables/simple-sheet.js:58` 把 undefined 编为 `〈缺失〉`，第 76 行还明确拒绝稀疏数组并提示“列表不能有空洞；请显式填缺失”。本次 `[undefined]` 具有真实索引 0，不是稀疏数组，且实际 formatter/parser 都接受。
- `tables/simple-sheet.js:63` 为 -0 单独输出 `-0`；`tests/simple-sheet.test.js:22` 将 -0 纳入 deepStrictEqual 往返，`tests/table-simple-sheet.test.js:37` 另有 `{n:-0}` 专项断言。因此负零区别是现有测试明确保护的 codec 行为。

复现使用真实 `createBookGateway` 与下列内存宿主，未写外部世界书：

```js
const memory = new Map();
const helper = {
  getWorldbookNames: () => [...memory.keys()],
  getWorldbook: async n => structuredClone(memory.get(n)),
  createWorldbook: async (n, es) => {
    memory.set(n, es.map((e, i) => ({ ...structuredClone(e), uid: i + 1 })));
    return true;
  },
  updateWorldbookWith: async (n, fn) => {
    memory.set(n, fn(structuredClone(memory.get(n))));
    return structuredClone(memory.get(n));
  }
};
const books = createBookGateway(() => helper);
const snapshot = await books.create('session', 'audit', 'in-memory-audit');
const next = structuredClone(snapshot.data);
next.revision++;
next.commits.push(prepared.commit);
const saved = await books.write(snapshot, next);
const actual = saved.data.commits[0].changes[0].after.values.标志;
```

## 已明确覆盖的 codec 行为

读取并运行 `tests/simple-sheet.test.js`、`tests/table-simple-sheet.test.js`，19/19 通过。覆盖混合嵌套、空对象/列表、0/false/null/空文本/显式 undefined/缺字段、-0、任意安全键、CR/制表/控制转义、首尾空行、200 棵确定性随机树，以及所有非 ruleReview TABLE task 示例的真实生产 parser 往返。

额外手工最小复现均显式拒绝，没有截取合法前缀返回：

| 输入缺陷 | 实际错误 |
| --- | --- |
| `【结果】\n1 a：x\n多余尾部` | 需要分组标题或稳定行号字段 |
| 普通标量后增加两空格尾行 | 续行必须跟在多行字段后 |
| `1 a：x` 后跟 `2 \\u0061：y` | 重复字段 a |
| 行号 1 后直接 3 | 行号必须从 1 连续且不可重复 |
| 行号重复 1 | 同上 |
| `〈布尔〉yes` | 布尔值只能是 true 或 false |
| 增加未引用子表 | 存在未引用子表 |
| 对象引用缺失子表 | 缺少引用分组 子表1 |

`parseSimpleSheet` 不负责知道业务任务应该有多少个字段；合法的较短对象是否缺任务字段，必须由消费方判定。本次没有把“未提供未知字段”误记为 parser 丢字段。

## 次要观察 A：foundation 普通文本格裁掉值首尾空白

`tables/foundation/engine.js:170–191` / `parsePlain` 对整个行 `trim()`，再对冒号后的值 `trimStart()`。

最小复现：创建 `origin.character`，只 request `名称`，`accept(token, '1 名称：  甲  ')` 成功，`get(id,'名称')` 返回 `'甲'`。若该普通文本格也承诺逐字保留，则预期 `'  甲  '`；当前未显式报错或展示裁剪。

范围限制：这是 foundation 旧普通格行为，共享简表或嵌入复杂格不发生该裁剪；不能归为本次共享 codec 新回归。现有复杂格精确保留测试全部通过。是否纳入第一切片需依据普通格的空白契约决定。

## 次要观察 B：不要绕开 host 的响应完成校验

`tables/service.js:49–53` / `parseTableTaskResponse` 直接接受 `{ choices:[{finish_reason:'length',message:{content:'【结果】\n1 changes：〈列表〉'}}] }`，实际返回 `{changes:[]}`；它自身不检查完成原因。

但正常路径 `config/host.js:191` 总是调用 `readTaskResponse`；`config/stream-response.js:31–36,57–70` 会因 length/MAX_TOKENS 抛 `TISYA_RESPONSE_TRUNCATED`。本次实际运行 `tests/stream-response.test.js` 的长度中断、无完成标记、异常 UTF-8、错误封套、拒绝/过滤等测试均通过。**所以此项不是已证实的默认主链截断漏洞**，而是新联合表单执行器接线时必须保留的边界；不可将原始 envelope 直接交此 parser 并宣称等价。

## 验证账本与限制

- `node --test tests/simple-sheet.test.js tests/table-simple-sheet.test.js`：19/19。
- `node --test tests/foundation-complex-sheet.test.js tests/stream-response.test.js`：24/24。
- 共 43/43 定向测试通过；另执行上述 parser 对抗与真实 gateway 内存复现。
- `git diff --stat` 为空；本代理只写本报告。
- 未运行全套、未构建、未请求外部模型、未声称已检查全部任务领域约束或实际宿主存档。F1 明确复现于默认注册表 `scene.标志`；没有把结论泛化为所有普通字段都会丢值。
