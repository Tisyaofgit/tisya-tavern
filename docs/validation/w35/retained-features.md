# W35 retained variable bridge and atlas audit

Audit scope: W34 production source, read-only code tracing and existing isolated regressions. No original user card or Android runtime was inspected, and no real model or user storage was used.

## Native variables

- `v3/configuration.mjs:resolveRuntimeConfiguration` still uses the saved `nativeMvu` auto/off choice and detects the original MVU runtime or card declaration. The old bridge flag is not a separate authority.
- `v3/host.mjs:initialize` requires the actual `getMvuData`, `parseMessage`, and `replaceMvuData` APIs when enabled. It reads original `stat_data` and refuses missing original initialization; it does not create a substitute variable runtime or reset original values.
- `v3/configuration.mjs:readVerifiedNativeRules` supplies original enabled MVU rule content with source hashes to A. `v3/host.mjs:verifyNativeRules` rejects changed rules before later work. `tables/native-bridge.js` derives concrete differences, delegates validation and settlement to original MVU, and checks the actual writeback.
- Normal native worldbook activation remains `v3/conditions.mjs:beforeWriter` → actual `getWorldInfoPrompt`. This is separate from definition extraction.
- `v3/initialization-sources.mjs` skips disabled entries and executable `<%` / `@@preprocessing` content for **fixed-definition extraction only**. It does not change book enable flags, card scripts, the native-variable setting, or original snapshots. The displayed notice therefore does not mean MVU has been disabled.
- This does **not** prove that the user's KPOP card scripts are running, that its EJS templates can expand in that Android installation, or that every script API is supported. Native MVU and EJS template execution are distinct capabilities. No specific missing capability is repaired by changing a warning string.

## Atlas

- `v3/workbench.mjs` imports and mounts the production `mountAtlasView`. Actual entry: 工作台 → 世界档案 → 图鉴; the archive page defaults to this mode. 本轮整理 also links directly to 图鉴.
- `v3/journey.mjs:read` projects the same retained archive and selected origin/core definitions. There is no second editable atlas database.
- `v3/atlas-view.mjs` retains the styled card directory, full-text/tag search, grouped dossier fields, nested details, relationships/reference navigation, current/origin/core layers, current-record editing, focus controls, memory timeline and exact-source actions.
- Initialization drafting itself is the form view. The styled atlas displays confirmed records after saving, with initialization definitions and current opening records remaining distinct layers. Only source records authorized for the reader appear.

## Verification

Command (exit 0):

```sh
node --experimental-vm-modules --test --test-concurrency=2 --test-reporter=tap tests/v3/host-tests/installer.test.mjs tests/v3/host-tests/native-rules.test.mjs tests/v3/ui-tests/atlas-view.test.mjs tests/v3/ui-tests/w26-services.test.mjs tests/v3/ui-tests/journey-consumers.test.mjs tests/v3/review-tests/journey.test.mjs tests/v3/review-tests/journey-application.integration.mjs
```

Result: 56 passed; zero failures, skips, or cancellations. Raw output: `retained-features.tap`. This includes the extracted native interceptor and saveReply path, actual MVU fixture parser, real application journey projection, and clicked happy-dom atlas/timeline consumers. It is neither Android validation nor external model validation.

## Separate observation

The supplied screen reports 107 eligible linked-book items but 214 total items, and 3 disabled linked-book items versus 6 total. The source provider currently retains both embedded and linked entries. The numbers are consistent with duplicated embedded and linked material, but the screenshot alone does not establish identical bytes or safe deduplication. Do not silently remove either source without source-identity/content verification.

## Follow-up wording change

The source summary now separates `embeddedEntries` and `linkedEntries`, leaving the existing total and all source content intact. Its dynamic-template note explicitly limits the exclusion to fixed-definition extraction and says that this operation does not turn off original variable functionality. It does not claim original scripts have run successfully on the device.

The existing source-provider suite passed 8/8 (`source-summary.tap`). A same-input comparison against the original W34 module confirms exact equality of `basis`, `definitionBasis`, `sourceCard`, `sourceCardRaw`, and `sourceBooks`; repeated embedded/linked entries remain separate. Hash receipts are in `source-summary-compatibility.json`. No model calls or user storage writes occurred.
