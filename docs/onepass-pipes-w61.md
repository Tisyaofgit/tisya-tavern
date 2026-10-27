# One-pass 4: approved creative guide and fixed-column memory

## Branch-managed Tisya preset

`presets/Tisya.json` is generated from the same complete source as the compatibility import. Its content digest identifies a shipped revision. On APP_READY the native PresetManager saves or updates the single name `Tisya`; after acknowledgement its native list is registered without selecting an unrelated preset. If Tisya is already selected, native preset events refresh its prompts while protecting live API/model/sampling settings. A saved current revision is not overwritten on each restart, so same-release edits remain; a new shipped revision replaces this explicitly managed preset. Other named presets, native extension bindings and chat data remain intact. The first migration from an old named preset needs one selection of Tisya (including any explicit main-task preset route), with no repeated downloads.

Native saving and refresh failures stay visible; the Tisya send entry cannot silently use a failed upgrade. Reopening can reload a successfully saved revision whose active refresh failed. API signatures and the jQuery-wrapped select were checked against TauriTavern `a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375`, `src/scripts/preset-manager.js` and `src/scripts/openai.js`. Fixture coverage includes creation, same-name replacement, active refresh, unrelated selection, live API/sampling, extensions, same-revision edits, concurrency, busy/missing API, save rejection, timeout and reopening. This is not an installed-host or Android run.

A malformed public summary row used to disable every creative and review panel. The one-pass reader now keeps valid rows and shows each rejected row, its original text and diagnostic separately. It never fills in missing columns. Strict archival parsing still rejects an invalid reply. Reader projection revision `onepass-w61.1` refreshes cached errors without deleting view state or original messages.

The import remains 62 entries with the same identifiers, roles, order, switches, markers and separators. Only content changes. The approved seven-stage guide and literary questions replace their corresponding content; UserPreferences is byte-identical to the existing configured six-block compiler. Both public think blocks, optional comments, selected stages, summary/actions switches, length controls and moods remain configurable. The download contains expanded text, not unresolved macros. Final native-request tests inspect the actual serialized fetch payload.

## Eleven blocks

`task → think(before) → title → body → think(after) → status → extra → vars → archive → memory → actions`

New machine blocks use `format="pipes"`. Earlier JSON replies remain readable and retain their existing validation and world-settlement path. New pipes deliberately archives current-reply facts only; it does not perform a new offstage simulation.

- `memory`: events, discoveries, clues and timers. Discoveries may contain the existing full history, relationship background, secret and world-definition subrecords.
- `status`: descriptive text changes on existing registered records, cognition and complete habit/experience fields.
- `vars`: existing registered numeric/boolean fields, with matching old value and owner. Native-owned values and user preferences are not written here.
- `archive`: exact snapshot basis, exact submitted primary IDs, and unresolved gaps. This is a proposal; only the host's successful write is a receipt.

Common rows carry time, objects, evidence and permissions. They apply within their block until replaced. Cells use `|`, records may use `&`, lists use `、`. Escape cell delimiters first, then XML-escape `&` and `<` once. Trailing absent cells may be omitted; middle positions remain. `~` preserves an unspecified value, `=` inherits a matching common value, `!` clears an optional field, `[]` is an empty list, `null` requires a nullable field, and `0`/`false` retain their types. Explicit nested clears validate registered paths and existing manual locks.

Existing numeric aliases are supplied by `ONEPASS_STATE.aliases`. New IDs such as `+E1` resolve once within the atomic commit and can be referenced by other rows. New internal record names use that ID, avoiding a repeated model-written name. Unknown objects are not created from names. Evidence references are `P1`, `P2`, etc.; the host retains complete paragraphs from this reply. Unsupported source references or missing bindings belong in pending, not invented records.

## Neutral minimal memory example

Assume alias `1` already identifies the actor and the snapshot basis is `example-basis`:

```xml
<status format="pipes"/>
<vars format="pipes"/>
<archive format="pipes">
归档：example-basis|+E1
</archive>
<memory format="pipes">
共用：清晨|[]|1|P1|读者|[]
事件：+E1|~|=|用擦布垫住铃口|铜铃停下
</memory>
```

These are excerpts from the existing eleven-block reply, not a replacement envelope. A real reply must use its current basis and valid paragraph evidence. Facts need a proposition; events need an actual process; clues need observed content; timers need a time basis and due/trigger condition. Empty named rows are rejected.

## Persistence and compatibility

The existing `prepareOnePass`/`acceptOnePass` service and worldbook gateway remain the single writer. One batch is validated against the captured history, storage revision and snapshot basis before a single save. Duplicate callbacks reuse the receipt. Switching candidate or changing history changes which commit projects; stale input cannot write. Next-turn snapshots include the saved records. No extra model call is introduced.

Only approved optional facts and experience fields are added to the shared schema; previous fields and values are preserved. Existing custom definitions are not overwritten. Foundation template reconciliation preserves absent aliases rather than adding empty metadata.

Validation: 1262/1262 full repository tests and 21/21 final focused checks passed. Focused parser/UI and exact request-payload tests, full repository checks, and an existing native-gateway adapter test that saves, reopens, retries and assembles the next snapshot. These automated tests are not a new live model, Android, or installed Tauri-host test. The reported screenshot's exact line text was not supplied; its specific missing column remains unknown.
