# Seven-block narrative reader

The seven-block narrative edition is identified as `wire.version = 6` after a complete envelope parse. Its exact source order is `task,title,body,next,extra,vars,actions`. Nine-block legacy JSON/YAML and ten-block pipe replies retain their original parsing and permissions. Foundation vendor files and their provenance hashes are unchanged; `tools/reader-transforms.mjs` and `reader-compat.js` apply the explicit read adapters, and `tools/build-reader.mjs` generates `reader-core.js`.

The reader does not add `status`, `archive`, or `memory` blocks. A seven-block reply's journey view has `recordSource: forms`; the UI directs the user to the atlas and history instead of reporting a missing memory protocol or claiming that no records exist. This is a location hint, not a save receipt and not a new read of background table rows.

## Consumer map

| Source field | Parsed representation | Consumer / boundary |
| --- | --- | --- |
| `task.任务` goal / summary / stopping point | `task.tasks[].input / plan / stop` | Only the public `plan` enters the existing task ledger. Input and stopping metadata remain internal. |
| `task.资料` | `task.refs.style/world/environment/gameplay/worldbook/cast/history/tools` | The eight declared classes are parsed distinctly. References are internal diagnostics, not proof of a tool call and not automatically displayed. |
| `task.解锁` | `task.unlocks` | Retained as source notes. Not an ACL grant, a writer command, or public display metadata. |
| `task.待定`, `task.人物` | `task.pending`, `task.characters` | Retained internally; binding gaps, private identity or evidence do not become public dossier cards. A blocking clarification the user must answer belongs in public body prose as the minimum safe question; a public pending row can supplement it but cannot be its only notice. |
| `task.心声`, `next.心声` | Each block's `heart` | Existing separate heart carousels; direction/mood enums and duplicate directions are checked. Omitted optional directions produce no invented text. Explicit `沉默` / `关闭` also remain valid. |
| `title.场景` | title text, time, place(s), world | Existing scene heading and dateline. Escaped literal `、` within names remains distinct from the place-list separator. |
| `body` | Original numbered prose | Existing numbered-paragraph reader, visible prose and counting functions. Actual length is not inferred from bounds or an audit assertion. |
| `next.审计` | Compatibility view `task.audit` | Existing seven-row audit ledger. Exactly the declared seven categories and verdicts are accepted. |
| `next.待办` | `next.tasks` | Version 6 only: existing public pending ledger, retaining task kind, conditions and text. Legacy next-planning fields remain private. |
| `next.已交付` | `next.delivered` | Existing delivery ledger. Displaying model text does not certify persistence. |
| `next.候选` | `next.candidates` | Retained internally, not publicly rendered or applied. |
| `extra` | Original emitted components | Existing display rules, component partitioning and isolated card runtime. No background dossier/state object is copied in. Unsupported component capabilities retain the existing visible diagnostic. |
| `vars` | Empty or existing native read-only representation | No operations are applied by the reader. Native syntax uses the existing adapter, including opaque external protocols. The narrative assembly owns writer selection; the first English assembly rejects the unsupported native-main writer before sending. |
| `actions.行动` | Compatibility view `next.actions` | Existing action selector/draft behavior. Seven-block action categories and configured count bounds are checked. Explicit `<actions/>` is disabled suggestions, with an empty display list. |

The handoff into existing UI objects moves audits and actions only in the ephemeral parsed view. It never rewrites the stored reply. Public renderers select their existing public fields; retaining internal reference/diagnostic data does not authorize disclosure. Correct source authorization is still an upstream responsibility: a parser cannot prove whether otherwise valid generated public text reveals an unprovided secret.

## Failure and compatibility evidence

- The complete neutral fixture `tests/fixtures/reply-seven.js` reproduces `TISHA_OUTPUT_BLOCK_ORDER` against the untouched Foundation parser. The same payload passes the new reader through title/body, three opening and three closing heart directions, eight reference classes, seven audits, three pending types, safe nonempty extra, empty vars and four actions.
- Missing, duplicated, reordered and mixed-edition blocks fail. Unknown rows, reference kinds, character/heart/audit/task/action enums, malformed columns and escapes, missing audit categories, invalid bounds and nonconsecutive paragraph numbers fail explicitly. No fallback fabricates record blocks.
- Nonempty safe seven-block extra displays normally. A ten-block extra with a denying permission row stays hidden, while legacy extra without a denying row stays visible as before.
- Private task references, disclosure notes, candidates and unrelated backend state are absent from the public reader model and DOM. Unsupported scripted card content remains isolated and reports its missing runtime capability.
- Legacy native update parsing, empty native permission compatibility, nine-block JSON/YAML reading, permission locators and public record filtering pass their existing regression tests. Native variables are retained read-only; this is not a test of live native state settlement.
- `node tools/build-reader.mjs --check` verifies the generated reader against all 15 unchanged vendor modules.

Targeted run: `node --test tests/reply-seven.test.js tests/reply-pipes-text.test.js tests/reply-formats.test.js tests/display-extra.test.js tests/permission-compat.test.js tests/native-mvu.test.js tests/reader.test.js tests/journey-reader.test.js tests/reader-layer.test.js tests/round-panels.test.js tests/reply-details.test.js`.

These are deterministic parser and DOM regressions with neutral authored payloads. They do not establish model compliance, Android behavior, live API behavior, or host persistence.

During the added component-isolation test, an initial assertion incorrectly expected an iframe even for a component requiring unsupported parent access. The existing runtime correctly rejected that component with `TISYA_EXTRA_RUNTIME_REQUIRED` and no iframe. The corrected regression verifies both this explicit failure and a supported local button in an `allow-scripts` iframe without `allow-same-origin`. Product code was not relaxed to satisfy the mistaken expectation.
