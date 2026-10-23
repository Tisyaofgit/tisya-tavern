# English assembly independent audit

Review timestamp: 2026-10-22T22:09:20.635547+00:00

Scope: read-only review of `wiring-worktrees/prompt-assembly` while its owner was actively implementing fixes. This reviewer did not edit that worktree. Small neutral Node reproductions were used; no broad test suite, model request, Android run, or live host send was performed. Reader reference is seven-block commit `39beeea037ea9687e012cbb853900a157cfcb2bf`.

## Findings and current status

| Priority | Finding | Evidence / current status |
| --- | --- | --- |
| P1, reproduced then fixed | Manual/Tisya assembly could drop nonempty selected style or requirements after the user replaced/removes a macro while leaving the entry enabled. The initial guard checked `slots` only, not `materialLanes` or `materials`. | Initial neutral result: `accepted:true`, `stylePresent:false`, `requirementPresent:false`. The owner added exact lane consumption tracking. A later repeat was blocked with `所选资料没有发送入口（文风、用户要求）`. |
| P1, reproduced then fixed | A native host macro being evaluated did not prove its text reached the final payload. Calling `tableSlotText('state')`, then providing a payload without that text, was originally accepted. | Initial result: `accepted:true`, `containsState:false`. The owner added final payload uniqueness/presence checking. Repeat blocked with `资料“当前表单”未唯一进入最终请求`. This distinguishes preparation/preview expansion from delivery. |
| P1, reproduced then fixed | Removing `chatHistory` from the enabled order silently removed the actual current user request as well as history. | Initial neutral manual payload contained only edited system sections and no `CURRENT_INPUT_CANARY`. Repeat now blocks with `当前输入没有发送入口；请恢复聊天记录槽，历史条数可以设为 0。` |
| P2, manual path repaired; native path initially still open | Hybrid + direct injection put the latest assistant prose into `archive.latestTemporary` while ordinary `chatHistory` also selected that same assistant message. This is a real same-source repetition, inherited from the earlier chain, rather than a dossier grouping defect. | The owner added a trusted `withoutTemporary` archive layout. `coveredTemporaryLayouts` selects it only when the source key, exact archival prose, and actual selected history message agree. Neutral check: exact source -> `{archive:'withoutTemporary'}`, wrong source -> `{}`. At this review point, that call was in the manual rebuild path; the native-owner macro path still required equivalent preparation before archive macro expansion. The owner and root were notified. |
| P2, design boundary | The review TXT's scoped/scenario preference layout is more structured than current stored preference records. | `preferences()` creates seven static configuration categories. Real table preferences are still injected by `storyPreferences()` using the existing `<用户偏好>` record representation. `preferenceMatches()` filters exact world/card/user/session identities; the existing record schema does not provide the new seven categories or a separately evaluated scenario predicate. Data is preserved and can be classified by TASK.START, but this should not be described as a completed structural migration of scenario preferences. |

## Dossier / history / environment cross-check

The current direct `state.rows` construction explicitly excludes `events` and `preferences` by table ID. `stateProjection` does not receive `plot` or `latestTemporary`. Consequently:

- The dossier renderer's global `History` capability does not cause current `state` to repeat the separately assembled archive events.
- The `plan` slot is the only producer of the plot proposal in this call; the state dossier is not given that plot.
- Scene rows enter the dossier's `Environment` section. The independently declared selected-material environment lane is currently empty; it does not duplicate those scene rows.
- `storyContext` carries rule decisions, native snapshot values and settled event/condition consequences. Those are distinct authority sources from the selected dossier rows. No keyword-based deletion was introduced or recommended.
- The actual duplicate found was the same latest assistant message in archive temporary prose and chronological chat history. A source-aware alternate projection is appropriate; deleting any `History`/`Environment` headings would risk data loss.

## Configuration, source edits, and control ownership

- Selected per-option custom rule wording is read through `narrativeRuleRows`. Exact user edits are used verbatim; an explicit empty custom rule does not fall back to its default English wording. User-authored strings need not be automatically translated.
- The host assembles the actual enabled prompt entries and their order. Literal edits to a prompt entry survive; live factory text is not a replacement for the user's entire source preset.
- During review the owner made English edition recognition independent of the optional `tisya_config_selected` macro. A neutral check removing that macro still reported `englishEdition:true`; this avoids silently falling back to the old compiler because an editable material macro was removed.
- Fixed output language and bilingual dialogue use the actual validated language settings. Bilingual display does not grant a character competence or knowledge. User speech-habit retention and current narrative-voice continuation have separate optional fields and separate category consumers.
- Summary, actions, hearts and workflow detail are consumed by the registry/guide compiler. `actions=false` yields `<actions/>`; `summary=false` leaves an empty public creative-summary cell, which the seven-block parser accepts; absent heart directions do not require fabricated commentary.
- Explicitly disabled material targets remain distinguishable from nonempty data whose consumer is accidentally missing. Native and manual final-consumer checks must preserve that difference.
- Plain output is a different contract. The owner was removing remaining structured-only guide language during this audit; do not use a successful seven-block parser test as evidence for the plain branch.
- The English main-writer branch for native variables is explicitly rejected before generation when a native declaration exists without the table bridge. The seven-block reader itself remains read-only and does not grant or execute a writer. This is an explicit unsupported branch, not a silently empty update result.

## Seven-block reader alignment

The English registry and the merged reader agree on `task,title,body,next,extra,vars,actions`, eight reference classes, seven audit categories/verdicts, three pending-task classes, action categories, pipe escaping, numbered paragraphs and the ten registered moods. Disabled actions and omitted heart directions have tested read paths. Old state/history blocks are not invented.

`task` references, private character diagnostics, unlock source names and internal pending data are parsed but not added to the public DOM. The updated main wording now requires a blocking question to appear in public body prose, with minimal safe information; a pending row is not its only notification. Public next tasks, audit conclusions, delivered results and actual safe extra components have concrete consumers. Retaining internal reference rows does not represent a tool execution or save receipt.

Safe extra continues through existing component isolation. The old ten-block ACL still filters its own private extra; the new seven-block edition does not synthesize empty memory to obtain display permission. Source authorization and semantic disclosure correctness cannot be proven by the parser.

## Small reproduction results

1. Before fixes: manual selected lanes missing -> accepted; current request missing -> accepted; native state macro discarded -> accepted.
2. After owner fixes: all three cases explicitly blocked, with the messages quoted above.
3. Exact temporary source/current-history match -> trusted alternate archive layout selected; wrong source -> no alteration.
4. Removing the optional selected-material macro -> English edition retained.

This is an independent implementation audit of the observed snapshot, not a final integration approval. The source was changing during the review; the root integration still needs to run its declared targeted/full checks after merging the owner's final commit.
